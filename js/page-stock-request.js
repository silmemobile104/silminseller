// STOCK REQUEST MODULE — แจ้งเบิกสินค้า / จัดการคำขอเบิก / รายการเตรียมส่ง
// โหลดแบบ dynamic เมื่อเปิดหน้า (ดู switchView ใน script.js) — พึ่งพา window.authFetch, window.showToast, window.showConfirm, API_BASE_URL
// สิทธิ์ตรวจที่เซิร์ฟเวอร์ (routes/api.js) — หน้านี้แค่แสดงผลและส่งคำขอ
(function () {
    const $ = (id) => document.getElementById(id);
    const esc = (v) => String(v == null ? '' : v)
        .replace(/&/g, '&amp;').replace(/</g, '&lt;').replace(/>/g, '&gt;').replace(/"/g, '&quot;');
    const fmtDate = (d) => {
        if (!d) return '-';
        const dt = new Date(d);
        return isNaN(dt) ? '-' : dt.toLocaleDateString('th-TH', { day: '2-digit', month: 'short', year: 'numeric' });
    };
    const itemSummary = (items = []) => {
        if (!items.length) return '-';
        const first = items.slice(0, 2).map(i => `${esc(itemLabel(i))} × ${i.quantity}`).join(', ');
        return items.length > 2 ? `${first} และอีก ${items.length - 2} รายการ` : first;
    };

    // ชื่อสินค้า + ความจุที่เลือก (ถ้าไม่ได้กำหนดความจุ แสดงแค่ชื่อ)
    const itemLabel = (i) => i.capacity_name ? `${i.product_name} ${i.capacity_name}` : i.product_name;

    // รายการที่ส่วนกลางมีไม่พอ: แจ้งฝ่ายเทคนิคและสาขาผู้ขอว่ากำลังสั่งเพิ่มกี่เครื่อง
    // ส่วนที่ฝ่ายจัดซื้อสั่งซื้อแล้ว (มีใบสั่งซื้อ) แสดงวันที่คาดว่าจะได้รับ ส่วนที่ยังไม่ได้สั่งแสดงว่ากำลังสั่งอีก
    const shortageLines = (items = []) => items
        .filter(i => (i.shortage_quantity || 0) > 0)
        .map(i => {
            const ordered = Math.min(i.shortage_quantity, i.ordered_quantity || 0);
            const rest = i.shortage_quantity - ordered;
            const lines = [];
            // สั่งซื้อแล้ว = สีเขียว, ยังรอสั่งซื้อ = สีส้ม
            if (ordered > 0) {
                lines.push(`<p class="text-xs text-state-ok mt-1">สั่งซื้อแล้ว ${esc(itemLabel(i))} ${esc(ordered)} เครื่อง${i.ordered_expected_arrival ? ` คาดว่าจะถึงวันที่ ${fmtDate(i.ordered_expected_arrival)}` : ' (ยังไม่ระบุวันที่คาดว่าจะถึง)'}</p>`);
            }
            if (rest > 0) lines.push(`<p class="text-xs text-state-pending mt-1">กำลังรอการสั่งซื้อ ${esc(itemLabel(i))} อีก ${esc(rest)} เครื่อง</p>`);
            return lines.join('');
        })
        .join('');

    // สถานะ → ป้ายจุด + tint 12% (DESIGN.md 11.6) ใช้โทเคนสีของโปรเจกต์
    const STATUS = {
        pending: { label: 'รอตรวจสอบ', tone: 'pending' },
        ordering: { label: 'กำลังสั่งซื้อ', tone: 'pending' },
        sent_to_tech: { label: 'ฝ่ายเทคนิคเตรียมของ', tone: 'pending' },
        shipped: { label: 'เสร็จสิ้น', tone: 'ok' },
        canceled: { label: 'ยกเลิก', tone: 'danger' }
    };
    const TONE = {
        ok: { dot: 'bg-state-ok', bg: 'bg-state-ok/[0.12]', text: 'text-state-ok' },
        pending: { dot: 'bg-state-pending', bg: 'bg-state-pending/[0.12]', text: 'text-state-pending' },
        danger: { dot: 'bg-state-danger', bg: 'bg-state-danger/[0.12]', text: 'text-state-danger' }
    };
    const badge = (status) => {
        const s = STATUS[status] || { label: status, tone: 'pending' };
        const t = TONE[s.tone];
        return `<div class="inline-flex items-center gap-2 px-2.5 py-1 rounded-[0.375rem] ${t.bg}">
                    <div class="w-2 h-2 rounded-full ${t.dot}"></div>
                    <span class="${t.text} font-medium text-xs">${s.label}</span>
                </div>`;
    };

    const api = async (path, opts = {}) => {
        const hasBody = opts.body !== undefined;
        const res = await authFetch(`${API_BASE_URL}${path}`, {
            ...opts,
            headers: hasBody ? { 'Content-Type': 'application/json', ...(opts.headers || {}) } : (opts.headers || {}),
            body: hasBody ? JSON.stringify(opts.body) : undefined
        });
        let json = {};
        try { json = await res.json(); } catch (e) { /* ไม่ใช่ JSON */ }
        if (!res.ok || json.success === false) throw new Error(json.message || 'เกิดข้อผิดพลาดในการเชื่อมต่อ');
        return json;
    };

    const openModal = (id) => {
        const m = $(id);
        if (!m) return;
        m.classList.remove('hidden');
        m.classList.add('flex');
        m.classList.remove('pointer-events-none');
        requestAnimationFrame(() => m.classList.remove('opacity-0'));
    };
    const closeModal = (id) => {
        const m = $(id);
        if (!m) return;
        m.classList.add('opacity-0');
        m.classList.add('pointer-events-none');
        setTimeout(() => { m.classList.add('hidden'); m.classList.remove('flex'); }, 300);
    };
    const bindModalClose = (modalId, closeIds) => {
        closeIds.forEach(id => $(id)?.addEventListener('click', () => closeModal(modalId)));
        $(modalId)?.addEventListener('click', (e) => { if (e.target.id === modalId) closeModal(modalId); });
    };

    const skeleton = (tbodyId, cols, rows = 5) => {
        const tb = $(tbodyId);
        if (!tb) return;
        const bar = (w) => `<div class="h-3.5 ${w} rounded-full bg-skeleton animate-pulse"></div>`;
        tb.innerHTML = Array.from({ length: rows }).map(() =>
            `<tr>${Array.from({ length: cols }).map((_, i) => `<td class="px-6 py-4">${bar(i === 0 ? 'w-24' : 'w-40')}</td>`).join('')}</tr>`
        ).join('');
    };
    const emptyRow = (tbodyId, cols, text) => {
        const tb = $(tbodyId);
        if (tb) tb.innerHTML = `<tr><td colspan="${cols}" class="px-6 py-8 text-center text-ink/50 italic">${text}</td></tr>`;
    };

    // ==================================================================
    // [A] แจ้งเบิกสินค้า
    // ==================================================================
    let srBound = false;
    let srRows = [];

    const srFiltered = () => {
        const status = $('sr-status-filter')?.value || '';
        const q = ($('sr-search-input')?.value || '').trim().toLowerCase();
        return srRows.filter(r => {
            if (status && r.status !== status) return false;
            if (!q) return true;
            return (r.request_no || '').toLowerCase().includes(q) ||
                (r.title || '').toLowerCase().includes(q) ||
                (r.items || []).some(i => (i.product_name || '').toLowerCase().includes(q) || (i.product_code || '').toLowerCase().includes(q));
        });
    };

    const srRender = () => {
        const list = srFiltered();
        $('sr-result-count').textContent = `แสดง ${list.length} จาก ${srRows.length} รายการ`;
        if (!list.length) return emptyRow('sr-table-body', 4, 'ยังไม่มีรายการแจ้งเบิก');
        $('sr-table-body').innerHTML = list.map(r => `
            <tr class="hover:bg-divider transition-colors">
                <td class="px-6 py-4">
                    <span class="font-mono font-semibold text-primary">${esc(r.request_no)}</span>
                    <p class="text-xs text-body-muted mt-1">${fmtDate(r.createdAt)}</p>
                </td>
                <td class="px-6 py-4">
                    <p class="font-medium text-ink">${esc(r.title)}</p>
                    <p class="text-xs text-body-muted">${itemSummary(r.items)}</p>
                    ${shortageLines(r.items)}
                </td>
                <td class="px-6 py-4 text-ink text-sm">${esc(r.created_by?.name || '-')}</td>
                <td class="px-6 py-4">${badge(r.status)}</td>
            </tr>`).join('');
    };

    const srLoad = async () => {
        skeleton('sr-table-body', 4);
        try {
            const json = await api('/stock-requests');
            srRows = json.data || [];
            srRender();
        } catch (err) {
            emptyRow('sr-table-body', 4, esc(err.message));
            showToast(err.message, 'error');
        }
    };

    // รีเฟรชเงียบๆ (ไม่แสดง skeleton) ให้สถานะ "กำลังสั่งซื้อ" ที่ฝ่ายจัดซื้อเพิ่งบันทึกโผล่เองโดยไม่ต้องรีเฟรชหน้า
    let srPollTimer = null;
    const srPollOnce = async () => {
        const body = $('sr-table-body');
        if (!body || !body.offsetParent || document.hidden) return; // หน้านี้ไม่ได้เปิดอยู่ ไม่ต้องยิง
        try {
            const json = await api('/stock-requests');
            srRows = json.data || [];
            srRender();
        } catch (err) { /* รอบหน้าลองใหม่ ไม่ต้องรบกวนผู้ใช้ */ }
    };

    // รายชื่อสินค้าจากระบบ โหลดครั้งเดียวต่อการเปิดหน้า ใช้เป็นตัวเลือกใน dropdown ค้นหาแต่ละแถว
    let srProducts = null;
    let srCapacities = []; // ตัวเลือกความจุจากข้อมูลหลัก (เรียงน้อยไปมาก)
    const loadProductOptions = async () => {
        if (srProducts) return srProducts;
        const json = await api('/stock-requests/product-options');
        srProducts = json.data || [];
        srCapacities = json.capacities || [];
        return srProducts;
    };
    const SR_MAX_OPTIONS = 30;

    // ประเภทที่เลือกในโมดัล: 'device' (เครื่อง) หรือ 'accessory' (อุปกรณ์เสริม)
    const srKind = () => document.querySelector('input[name="sr-kind"]:checked')?.value || 'device';
    // เปลี่ยนประเภท: ล้างแถวที่เลือกสินค้าไว้แล้วแต่ไม่ตรงประเภทใหม่ ให้เลือกใหม่
    // ข้อความเริ่มต้นของช่อง "ชื่อรายการ" = ขอเบิก + ประเภทที่เลือก
    const srAutoTitle = (kind) => kind === 'accessory' ? 'ขอเบิกอุปกรณ์เสริม' : 'ขอเบิกเครื่อง';
    let srLastAutoTitle = '';
    const srOnKindChange = () => {
        const wantAcc = srKind() === 'accessory';
        // เปลี่ยนข้อความตามประเภท เฉพาะเมื่อผู้ใช้ยังไม่ได้แก้เอง (ว่าง หรือยังเป็นข้อความอัตโนมัติเดิม)
        const titleEl = $('sr-title');
        if (titleEl && (!titleEl.value.trim() || titleEl.value === srLastAutoTitle)) {
            srLastAutoTitle = srAutoTitle(srKind());
            titleEl.value = srLastAutoTitle;
        }
        Array.from($('sr-rows').children).forEach(row => {
            const input = row.querySelector('.sr-row-name');
            if (!input.value) return;
            const found = (srProducts || []).find(p => p.name === input.value);
            if (!found || !!found.is_accessory !== wantAcc) {
                input.value = '';
                input.dataset.picked = '';
            }
        });
    };

    // ช่องชื่อสินค้า = ช่องค้นหา + dropdown: พิมพ์กรองได้ เลือกด้วยเมาส์ หรือลูกศรแล้ว Enter, Esc ปิด
    const srBindCombo = (row) => {
        const input = row.querySelector('.sr-row-name');
        const list = row.querySelector('.sr-row-list');
        let active = -1;
        let options = [];

        const hide = () => {
            list.classList.add('hidden');
            input.setAttribute('aria-expanded', 'false');
            active = -1;
        };
        const pick = (opt) => {
            input.value = opt.name;
            input.dataset.picked = '1';
            input.classList.remove('border-state-danger');
            hide();
        };
        const render = () => {
            const q = input.value.trim().toLowerCase();
            const wantAcc = srKind() === 'accessory';
            const all = (srProducts || []).filter(p => !!p.is_accessory === wantAcc);
            options = (q
                ? all.filter(p => p.name.toLowerCase().includes(q) || (p.code || '').toLowerCase().includes(q))
                : all).slice(0, SR_MAX_OPTIONS);
            list.innerHTML = options.length
                ? options.map((p, i) => `
                    <li role="option" data-idx="${i}" aria-selected="${i === active}"
                        class="px-3 py-2 text-sm cursor-pointer flex items-center justify-between gap-3 ${i === active ? 'bg-primary text-on-primary' : 'text-ink hover:bg-field'}">
                        <span class="truncate">${esc(p.name)}</span>
                    </li>`).join('')
                : '<li class="px-3 py-2 text-sm text-body-muted">ไม่พบสินค้าที่ค้นหา</li>';
            list.classList.remove('hidden');
            input.setAttribute('aria-expanded', 'true');
        };

        input.addEventListener('focus', render);
        input.addEventListener('input', () => {
            input.dataset.picked = '';
            active = -1;
            render();
        });
        input.addEventListener('keydown', (e) => {
            const open = !list.classList.contains('hidden');
            if (e.key === 'ArrowDown' || e.key === 'ArrowUp') {
                e.preventDefault();
                if (!open) return render();
                if (!options.length) return;
                active = (active + (e.key === 'ArrowDown' ? 1 : -1) + options.length) % options.length;
                render();
            } else if (e.key === 'Enter') {
                if (open && options[active]) { e.preventDefault(); pick(options[active]); }
            } else if (e.key === 'Escape') {
                hide();
            }
        });
        // mousedown + preventDefault เพื่อไม่ให้ช่องเสียโฟกัสก่อนเลือกได้
        list.addEventListener('mousedown', (e) => {
            const li = e.target.closest('[data-idx]');
            if (!li) return;
            e.preventDefault();
            pick(options[Number(li.dataset.idx)]);
        });
        input.addEventListener('blur', () => setTimeout(hide, 120));
    };

    // เลขลำดับรายการ + สรุปรวมที่ขอบล่าง (จำนวนรายการ / จำนวนชิ้น)
    const srRefreshRows = () => {
        const rows = Array.from($('sr-rows').children);
        let pieces = 0;
        rows.forEach((row, i) => {
            row.querySelector('.sr-row-no').textContent = `รายการที่ ${i + 1}`;
            row.querySelector('.sr-row-del').classList.toggle('invisible', rows.length === 1);
            pieces += Math.max(0, Number(row.querySelector('.sr-row-qty').value) || 0);
        });
        $('sr-summary').innerHTML = `รวม <b class="text-ink">${rows.length}</b> รายการ · <b class="text-ink">${pieces}</b> ชิ้น`;
    };

    const srAddRow = (data = {}) => {
        const wrap = $('sr-rows');
        const row = document.createElement('div');
        row.className = 'sr-row rounded-xl bg-field/60 border border-line p-4 space-y-3';
        row.innerHTML = `
            <div class="flex items-center justify-between">
                <span class="sr-row-no text-xs font-medium text-body-muted"></span>
                <button type="button" aria-label="ลบรายการนี้" title="ลบรายการนี้"
                    class="sr-row-del w-8 h-8 rounded-lg flex items-center justify-center text-state-danger hover:bg-state-danger/10 transition-colors">
                    <i class="fa-solid fa-trash"></i>
                </button>
            </div>
            <div class="relative">
                <i class="fa-solid fa-magnifying-glass absolute left-4 top-1/2 -translate-y-1/2 text-body-muted pointer-events-none" aria-hidden="true"></i>
                <input type="text" role="combobox" aria-autocomplete="list" aria-expanded="false" autocomplete="off"
                    aria-label="ชื่อสินค้า" placeholder="พิมพ์ค้นหาชื่อสินค้า..." value="${esc(data.product_name || '')}"
                    class="sr-row-name w-full pl-11 pr-4 py-3 rounded-xl bg-canvas border border-line text-ink placeholder-body-muted focus:border-primary focus:outline-none text-sm">
                <ul role="listbox" aria-label="ผลการค้นหาสินค้า"
                    class="sr-row-list hidden absolute left-0 right-0 top-full mt-1 max-h-60 overflow-y-auto rounded-xl bg-elevated border border-line shadow-lg z-20 py-1"></ul>
            </div>
            <div class="grid grid-cols-1 sm:grid-cols-2 gap-3">
                <div class="space-y-1">
                    <span class="block text-xs text-body-muted">ความจุ</span>
                    <select aria-label="ความจุ" class="sr-row-cap w-full h-11 px-3 rounded-xl bg-canvas border border-line text-ink focus:border-primary focus:outline-none text-sm">
                        <option value="">ไม่กำหนดความจุ</option>
                        ${srCapacities.map(c => `<option value="${esc(c)}"${c === data.capacity_name ? ' selected' : ''}>${esc(c)}</option>`).join('')}
                    </select>
                </div>
                <div class="space-y-1">
                    <span class="block text-xs text-body-muted">จำนวน</span>
                    <div class="flex items-center gap-1" role="group" aria-label="จำนวน">
                        <button type="button" data-sr-step="-1" aria-label="ลดจำนวน" class="w-11 h-11 rounded-xl bg-canvas border border-line text-ink hover:border-primary transition-colors"><i class="fa-solid fa-minus" aria-hidden="true"></i></button>
                        <input type="number" aria-label="จำนวน" min="1" step="1" inputmode="numeric" value="${esc(data.quantity || 1)}"
                            class="sr-row-qty flex-1 min-w-0 h-11 px-2 rounded-xl bg-canvas border border-line text-ink text-center font-semibold focus:border-primary focus:outline-none text-base">
                        <button type="button" data-sr-step="1" aria-label="เพิ่มจำนวน" class="w-11 h-11 rounded-xl bg-canvas border border-line text-ink hover:border-primary transition-colors"><i class="fa-solid fa-plus" aria-hidden="true"></i></button>
                    </div>
                </div>
            </div>`;
        row.querySelector('.sr-row-del').addEventListener('click', () => {
            if (wrap.children.length > 1) { row.remove(); srRefreshRows(); }
        });
        wrap.appendChild(row);
        srBindCombo(row);
        srRefreshRows();
    };

    // ปุ่ม − / + ของจำนวน และอัปเดตสรุปเมื่อพิมพ์จำนวนเอง
    const srOnRowsInput = (e) => {
        const stepBtn = e.target.closest('[data-sr-step]');
        if (stepBtn) {
            const input = stepBtn.closest('.sr-row').querySelector('.sr-row-qty');
            input.value = Math.max(1, (Number(input.value) || 1) + Number(stepBtn.dataset.srStep));
        }
        srRefreshRows();
    };

    const srCollectItems = () => Array.from($('sr-rows').children).map(row => {
        const name = row.querySelector('.sr-row-name');
        return {
            product_name: name.value.trim(),
            capacity_name: row.querySelector('.sr-row-cap')?.value || '',
            picked: name.dataset.picked === '1',
            quantity: Number(row.querySelector('.sr-row-qty').value)
        };
    });

    const srSubmit = async (e) => {
        e.preventDefault();
        const title = $('sr-title').value.trim();
        const items = srCollectItems();
        if (!title) return showToast('กรุณาระบุชื่อรายการแจ้งเบิก', 'warning');
        if (items.some(i => !i.product_name)) return showToast('กรุณาระบุชื่อสินค้าทุกแถว', 'warning');
        if (items.some(i => !i.picked)) {
            // ต้องเลือกจากรายการเพื่อให้ได้รหัสสินค้า ไม่งั้นฝ่ายเทคนิคตัดสต็อกไม่ได้
            Array.from($('sr-rows').children).forEach((row, idx) => {
                if (!items[idx].picked) row.querySelector('.sr-row-name').classList.add('border-state-danger');
            });
            return showToast('กรุณาเลือกสินค้าจากรายการที่ค้นหาให้ครบทุกแถว', 'warning');
        }
        if (items.some(i => !Number.isInteger(i.quantity) || i.quantity < 1)) return showToast('จำนวนต้องเป็นจำนวนเต็มตั้งแต่ 1', 'warning');

        const btn = $('sr-submit');
        btn.disabled = true;
        try {
            await api('/stock-requests', { method: 'POST', body: { title, items, note: $('sr-note').value.trim() } });
            showToast('ส่งรายการแจ้งเบิกสำเร็จ', 'success');
            closeModal('sr-modal');
            await srLoad();
        } catch (err) {
            showToast(err.message, 'error');
        } finally {
            btn.disabled = false;
        }
    };

    // สาขาของผู้ใช้ที่ล็อกอิน (เก็บไว้ตอนล็อกอินใน silmin_user) ใช้แสดงให้ผู้ใช้รู้ว่าแจ้งเบิกในนามสาขาไหน
    const currentBranchName = () => {
        try {
            const u = JSON.parse(localStorage.getItem('silmin_user') || '{}');
            return (u.branch && u.branch.name) || 'ไม่ระบุสาขา';
        } catch (e) {
            return 'ไม่ระบุสาขา';
        }
    };

    // สำนักงานใหญ่เป็นต้นทางของการจัดส่ง แจ้งเบิกเองไม่ได้ (ตรวจซ้ำที่เซิร์ฟเวอร์ด้วย)
    const HQ_BRANCH = 'สำนักงานใหญ่';
    const isHqBranch = () => currentBranchName().trim() === HQ_BRANCH;

    const srOpenForm = async () => {
        if (isHqBranch()) return showToast('สำนักงานใหญ่ไม่สามารถแจ้งเบิกสินค้าได้ เพราะเป็นต้นทางของการจัดส่ง', 'warning');
        $('sr-modal-branch').textContent = currentBranchName();
        srLastAutoTitle = srAutoTitle('device');
        $('sr-title').value = srLastAutoTitle;
        $('sr-note').value = '';
        $('sr-rows').innerHTML = '';
        const defaultKind = document.querySelector('input[name="sr-kind"][value="device"]');
        if (defaultKind) defaultKind.checked = true;
        try {
            await loadProductOptions();
        } catch (err) {
            showToast(err.message || 'โหลดรายชื่อสินค้าไม่สำเร็จ', 'error');
        }
        srAddRow();
        openModal('sr-modal');
        requestAnimationFrame(() => $('sr-title').focus());
    };

    window.initStockRequest = function () {
        if (!srBound) {
            srBound = true;
            $('btn-sr-open')?.addEventListener('click', srOpenForm);
            if ($('sr-branch-name')) $('sr-branch-name').textContent = currentBranchName();
            if (isHqBranch() && $('btn-sr-open')) {
                // ซ่อนปุ่มและบอกเหตุผลแทนการให้กดแล้วเด้งข้อความ
                $('btn-sr-open').classList.add('hidden');
                $('sr-hq-note')?.classList.remove('hidden');
            }
            $('sr-add-row')?.addEventListener('click', () => srAddRow());
            $('sr-rows')?.addEventListener('click', srOnRowsInput);
            $('sr-rows')?.addEventListener('input', srOnRowsInput);
            document.querySelectorAll('input[name="sr-kind"]').forEach(r => r.addEventListener('change', srOnKindChange));
            $('sr-form')?.addEventListener('submit', srSubmit);
            $('sr-search-input')?.addEventListener('input', srRender);
            $('sr-status-filter')?.addEventListener('change', srRender);
            bindModalClose('sr-modal', ['sr-modal-close', 'sr-cancel']);
        }
        srLoad();
        if (!srPollTimer) srPollTimer = setInterval(srPollOnce, 15000);
    };

    // ==================================================================
    // [B] จัดการคำขอเบิก (ฝ่ายจัดซื้อ)
    // ==================================================================
    // แท็บสถานะ: เปิดหน้าที่ "รอตรวจสอบ" — งานที่ต้องตัดสินใจอยู่บนสุด
    const SRM_TABS = [
        { value: 'pending', label: 'รอตรวจสอบ' },
        { value: 'ordering', label: 'กำลังสั่งซื้อ' },
        { value: 'sent_to_tech', label: 'เทคนิคเตรียมของ' },
        { value: 'shipped', label: 'เสร็จสิ้น' },
        { value: 'canceled', label: 'ยกเลิก' },
        { value: '', label: 'ทั้งหมด' }
    ];
    let srmBound = false;
    let srmRows = [];          // คำขอทุกสถานะของสาขาที่เลือก (กรองสถานะฝั่ง client เพื่อให้ตัวนับถูกต้อง)
    let srmTab = 'pending';
    let srmCurrent = null;

    const srmBranchRows = () => srmRows;

    const srmRenderTabs = () => {
        const all = srmBranchRows();
        const wrap = $('srm-status-tabs');
        wrap.innerHTML = SRM_TABS.map(t => {
            const count = t.value ? all.filter(r => r.status === t.value).length : all.length;
            const active = t.value === srmTab;
            return `<button type="button" role="tab" aria-selected="${active}" data-srm-tab="${t.value}"
                class="px-4 py-2 rounded-xl text-sm transition-colors border ${active
                    ? 'border-primary text-primary bg-field'
                    : 'border-line text-body-muted hover:text-ink hover:border-primary/60'}">
                ${t.label} <span class="ml-1 font-mono ${active ? 'text-primary' : 'text-body-muted'}">${count}</span>
            </button>`;
        }).join('');
    };

    const srmRender = () => {
        srmRenderTabs();
        const q = ($('srm-search-input')?.value || '').trim().toLowerCase();
        const list = srmBranchRows().filter(r => {
            if (srmTab && r.status !== srmTab) return false;
            if (!q) return true;
            return (r.request_no || '').toLowerCase().includes(q) ||
                (r.items || []).some(i => (i.product_name || '').toLowerCase().includes(q));
        });
        $('srm-result-count').textContent = `แสดง ${list.length} จาก ${srmRows.length} รายการ`;
        if (!list.length) {
            return emptyRow('srm-table-body', 5, srmTab === 'pending' ? 'ไม่มีคำขอที่รอตรวจสอบ' : 'ไม่พบคำขอเบิกในสถานะนี้');
        }
        $('srm-table-body').innerHTML = list.map(r => {
            const shortage = (r.items || []).some(i => i.central_stock < i.quantity);
            return `
            <tr data-srm-row="${esc(r._id)}" class="hover:bg-divider transition-colors cursor-pointer">
                <td class="px-6 py-4">
                    <span class="font-mono font-semibold text-primary">${esc(r.request_no)}</span>
                    <p class="text-xs text-body-muted mt-1">${fmtDate(r.createdAt)}</p>
                </td>
                <td class="px-6 py-4">
                    <p class="font-medium text-ink">${esc(r.branch_id?.name || '-')}</p>
                    <p class="text-xs text-body-muted">${esc(r.created_by?.name || '-')}</p>
                </td>
                <td class="px-6 py-4 text-ink text-sm">
                    ${itemSummary(r.items)}
                    ${shortage && r.status === 'pending' ? `<p class="text-xs text-state-pending mt-1">สำนักงานใหญ่มีของไม่พอบางรายการ</p>` : ''}
                    ${shortageLines(r.items)}
                    ${shipInfo(r)}
                </td>
                <td class="px-6 py-4">${badge(r.status)}</td>
                <td class="px-6 py-4 text-right">
                    <button type="button" data-srm-open="${esc(r._id)}"
                        class="px-3 py-1.5 rounded-xl bg-field border border-line text-ink hover:border-primary transition-colors text-sm">
                        จัดการ
                    </button>
                </td>
            </tr>`;
        }).join('');
    };

    // ข้อมูลการจัดส่งจากฝ่ายเทคนิค (เลขพัสดุ + วันที่คาดว่าจะถึง) แสดงเมื่อจัดส่งแล้ว
    const shipInfo = (r) => {
        if (r.status !== 'shipped') return '';
        const tracking = (r.tracking_numbers || []).map(esc).join(', ');
        const imgs = (r.shipment_images || []).map((u, i) =>
            `<a href="${esc(u)}" target="_blank" rel="noopener" class="underline hover:text-ink">รูปที่ ${i + 1}</a>`).join(' · ');
        return `<p class="text-xs text-body-muted mt-1">เลขพัสดุ: ${tracking || '-'}${r.expected_arrival ? ` · คาดว่าจะถึง ${fmtDate(r.expected_arrival)}` : ''}</p>`
            + (imgs ? `<p class="text-xs text-body-muted mt-1">รูปหลักฐาน: ${imgs}</p>` : '');
    };

    const srmLoad = async () => {
        skeleton('srm-table-body', 5);
        try {
            const branch = $('srm-branch-filter')?.value || 'ALL';
            const qs = branch && branch !== 'ALL' ? `?branch_id=${encodeURIComponent(branch)}` : '';
            const json = await api(`/stock-requests/manage${qs}`);
            srmRows = json.data || [];
            srmRender();
        } catch (err) {
            emptyRow('srm-table-body', 5, esc(err.message));
            showToast(err.message, 'error');
        }
    };

    const srmLoadBranches = async () => {
        const sel = $('srm-branch-filter');
        if (!sel || sel.dataset.loaded) return;
        try {
            const json = await api('/branches');
            (json.data || []).forEach(b => {
                const opt = document.createElement('option');
                opt.value = b._id;
                opt.textContent = b.name;
                sel.appendChild(opt);
            });
            sel.dataset.loaded = '1';
        } catch (err) { /* ไม่มีรายชื่อสาขา ใช้ทุกสาขาต่อไปได้ */ }
    };

    // ข้อความบอกว่ากดบันทึกแล้วเกิดอะไรต่อ คำนวณจากสต็อกส่วนกลางของแต่ละรายการ
    const srmApplyHint = () => {
        const items = srmCurrent?.items || [];
        const submit = $('srm-submit');
        const hint = $('srm-next-hint');
        const sendable = items.some(i => (i.central_stock || 0) > 0);
        const lacking = items.some(i => (i.central_stock || 0) < i.quantity);
        if (!sendable) {
            hint.textContent = 'ส่วนกลางยังไม่มีสินค้าตามที่ขอ กดบันทึกเพื่อแจ้งว่ากำลังรอการสั่งซื้อสินค้าทั้งหมด คำขอจะอยู่ในสถานะรอตรวจสอบ';
            submit.textContent = 'บันทึก';
        } else {
            hint.textContent = lacking
                ? 'กดบันทึกเพื่อส่งให้ฝ่ายเทคนิคเตรียมเท่าที่ส่วนกลางมี ส่วนที่ขาดจะแจ้งฝ่ายเทคนิคและสาขาผู้ขอว่ากำลังรอการสั่งซื้อ'
                : 'กดบันทึกเพื่อส่งงานให้ฝ่ายเทคนิคเตรียม คำขอนี้จะไปอยู่ในแท็บ "เทคนิคเตรียมของ" และหน้ารายการเตรียมส่ง';
            submit.textContent = 'บันทึกและส่งงานให้เทคนิค';
        }
    };

    const srmOpen = (id) => {
        const r = srmRows.find(x => x._id === id);
        if (!r) return;
        srmCurrent = r;
        $('srm-modal-title').textContent = `จัดการคำขอ ${r.request_no}`;
        $('srm-meta').textContent = `${r.branch_id?.name || '-'} · ผู้ขอ ${r.created_by?.name || '-'} · ${fmtDate(r.createdAt)} · ${STATUS[r.status]?.label || r.status}`;

        const shipBox = $('srm-ship-info');
        shipBox.innerHTML = shipInfo(r);
        shipBox.classList.toggle('hidden', !shipBox.innerHTML);

        // ข้อมูลรายการ + สต็อกส่วนกลาง เพื่อให้ตัดสินใจได้ในที่เดียว
        $('srm-items').innerHTML = (r.items || []).map(it => {
            const have = it.central_stock || 0;
            const short = have < it.quantity;
            return `
            <div class="px-4 py-3.5 space-y-2">
                <div class="flex items-center justify-between gap-3">
                    <p class="font-medium text-ink truncate">${esc(itemLabel(it))}</p>
                    <p class="text-ink whitespace-nowrap">ขอ <span class="text-lg font-bold">${esc(it.quantity)}</span></p>
                </div>
                <div class="flex flex-wrap items-center gap-2">
                    <span class="px-2.5 py-0.5 rounded-full text-xs font-medium ${short ? 'bg-state-danger/10 text-state-danger' : 'bg-state-ok/10 text-state-ok'}">สำนักงานใหญ่มี ${esc(have)} เครื่อง${short ? ' · ไม่พอ' : ' · พอ'}</span>
                </div>
                ${short ? `<p class="text-xs text-state-danger leading-relaxed">ส่งให้ฝ่ายเทคนิค ${esc(Math.min(it.quantity, have))} เครื่อง และกำลังรอการสั่งซื้ออีก ${esc(it.quantity - have)} เครื่อง เพื่อส่งให้${esc(r.branch_id?.name || 'สาขาผู้ขอ')}</p>` : ''}
            </div>`;
        }).join('') || '<p class="px-4 py-6 text-center text-ink/50 italic">ไม่มีรายการสินค้า</p>';

        // คำขอที่ปิดแล้วให้ดูได้อย่างเดียว
        const locked = ['shipped', 'canceled'].includes(r.status);
        $('srm-submit').disabled = locked;
        $('srm-cancel-request').classList.toggle('hidden', locked || r.status === 'sent_to_tech');
        srmApplyHint();
        openModal('srm-modal');
    };

    const srmSave = async (e) => {
        e.preventDefault();
        if (!srmCurrent) return;
        const btn = $('srm-submit');
        btn.disabled = true;
        try {
            await api(`/stock-requests/${encodeURIComponent(srmCurrent._id)}/manage`, {
                method: 'PUT',
                body: {}
            });
            showToast('บันทึกการจัดการคำขอสำเร็จ', 'success');
            closeModal('srm-modal');
            await srmLoad();
        } catch (err) {
            showToast(err.message, 'error');
        } finally {
            btn.disabled = false;
        }
    };

    const srmCancelRequest = () => {
        if (!srmCurrent) return;
        const r = srmCurrent;
        showConfirm(
            'ยกเลิกคำขอเบิกนี้?',
            `คำขอ ${r.request_no} จะถูกยกเลิก และแก้ไขกลับไม่ได้`,
            async () => {
                try {
                    await api(`/stock-requests/${encodeURIComponent(r._id)}/manage`, { method: 'PUT', body: { status: 'canceled' } });
                    showToast('ยกเลิกคำขอแล้ว', 'success');
                    closeModal('srm-modal');
                    await srmLoad();
                } catch (err) {
                    showToast(err.message, 'error');
                }
            },
            'ยกเลิกคำขอ'
        );
    };

    window.initStockRequestManage = function () {
        if (!srmBound) {
            srmBound = true;
            // ทั้งแถวและปุ่ม "จัดการ" เปิดโมดัลได้
            $('srm-table-body')?.addEventListener('click', (e) => {
                const btn = e.target.closest('[data-srm-open]');
                if (btn) return srmOpen(btn.dataset.srmOpen);
                const row = e.target.closest('[data-srm-row]');
                if (row) srmOpen(row.dataset.srmRow);
            });
            $('srm-status-tabs')?.addEventListener('click', (e) => {
                const tab = e.target.closest('[data-srm-tab]');
                if (!tab) return;
                srmTab = tab.dataset.srmTab;
                srmRender();
            });
            $('srm-search-input')?.addEventListener('input', srmRender);
            $('srm-branch-filter')?.addEventListener('change', srmLoad);
            $('srm-form')?.addEventListener('submit', srmSave);
            $('srm-cancel-request')?.addEventListener('click', srmCancelRequest);
            bindModalClose('srm-modal', ['srm-modal-close', 'srm-cancel']);
        }
        srmLoadBranches();
        srmLoad();
    };

    // ==================================================================
    // [C] รายการเตรียมส่ง (ฝ่ายเทคนิค / คลัง)
    // ==================================================================
    let srtBound = false;
    let srtRows = [];
    let srtCurrent = null;

    const techQty = (it) => (it.send_quantity > 0 ? it.send_quantity : it.quantity);
    const techItems = (r) => (r.items || []).filter(i => i.is_tech);

    const srtRender = () => {
        $('srt-result-count').textContent = `รอเตรียมจัดส่ง ${srtRows.length} รายการ`;
        if (!srtRows.length) return emptyRow('srt-table-body', 5, 'ไม่มีรายการที่ต้องเตรียมส่ง');
        $('srt-table-body').innerHTML = srtRows.map(r => `
            <tr class="hover:bg-divider transition-colors">
                <td class="px-6 py-4">
                    <p class="text-ink font-medium">${fmtDate(r.createdAt)}</p>
                    ${r.expected_arrival ? `<p class="text-xs text-body-muted">นัดส่ง ${fmtDate(r.expected_arrival)}</p>` : ''}
                </td>
                <td class="px-6 py-4">
                    <p class="font-medium text-ink">${esc(r.branch_id?.name || '-')}</p>
                    <p class="text-xs text-body-muted">${esc(r.created_by?.name || '-')}</p>
                </td>
                <td class="px-6 py-4 text-ink text-sm">${itemSummary(techItems(r).map(i => ({ ...i, quantity: i.send_quantity > 0 ? i.send_quantity : i.quantity })))}${shortageLines(r.items)}</td>
                <td class="px-6 py-4">${badge('sent_to_tech')}</td>
                <td class="px-6 py-4 text-right">
                    <button type="button" data-srt-open="${esc(r._id)}"
                        class="px-3 py-1.5 rounded-xl bg-primary text-on-primary font-medium hover:bg-primary-pressed transition-colors text-sm">
                        จัดส่ง
                    </button>
                </td>
            </tr>`).join('');
    };

    const srtLoad = async () => {
        skeleton('srt-table-body', 5);
        try {
            const json = await api('/stock-requests/tech');
            srtRows = json.data || [];
            srtRender();
        } catch (err) {
            emptyRow('srt-table-body', 5, esc(err.message));
            showToast(err.message, 'error');
        }
        srtRenderTabs();
    };

    // ---------- ประวัติการเตรียมส่ง (คำขอที่ฝ่ายเทคนิคจัดส่งแล้ว) ----------
    let srtTab = 'pending';
    let srtHistory = [];
    let srtHistoryLoaded = false;

    const srtRenderTabs = () => {
        const tabs = [
            { value: 'pending', label: 'รอเตรียมส่ง', count: srtRows.length },
            { value: 'history', label: 'ประวัติการเตรียมส่ง', count: srtHistoryLoaded ? srtHistory.length : null }
        ];
        $('srt-tabs').innerHTML = tabs.map(t => {
            const active = t.value === srtTab;
            return `<button type="button" role="tab" aria-selected="${active}" data-srt-tab="${t.value}"
                class="px-4 py-2 rounded-xl text-sm transition-colors border ${active
                    ? 'border-primary text-primary bg-field'
                    : 'border-line text-body-muted hover:text-ink hover:border-primary/60'}">
                ${t.label}${t.count === null ? '' : ` <span class="ml-1 font-mono ${active ? 'text-primary' : 'text-body-muted'}">${t.count}</span>`}
            </button>`;
        }).join('');
        $('srt-pending-panel').classList.toggle('hidden', srtTab !== 'pending');
        $('srt-history-panel').classList.toggle('hidden', srtTab !== 'history');
    };

    const srtRenderHistory = () => {
        const q = ($('srt-history-search')?.value || '').trim().toLowerCase();
        const list = srtHistory.filter(r => {
            if (!q) return true;
            return (r.request_no || '').toLowerCase().includes(q) ||
                (r.branch_id?.name || '').toLowerCase().includes(q) ||
                (r.items || []).some(i => (i.product_name || '').toLowerCase().includes(q));
        });
        $('srt-history-count').textContent = `แสดง ${list.length} จาก ${srtHistory.length} รายการ`;
        if (!list.length) return emptyRow('srt-history-body', 5, q ? 'ไม่พบรายการที่ค้นหา' : 'ยังไม่มีประวัติการเตรียมส่ง');
        $('srt-history-body').innerHTML = list.map(r => {
            const sent = (r.items || []).filter(i => (i.fulfilled_quantity || 0) > 0)
                .map(i => ({ product_name: i.product_name, quantity: i.fulfilled_quantity }));
            const tracking = (r.tracking_numbers || []).map(esc).join(', ');
            const imgs = (r.shipment_images || []).map((u, i) =>
                `<a href="${esc(u)}" target="_blank" rel="noopener" class="underline hover:text-ink">รูปที่ ${i + 1}</a>`).join(' · ');
            return `
            <tr class="hover:bg-divider transition-colors">
                <td class="px-6 py-4">
                    <p class="text-ink font-medium">${fmtDate(r.shipped_at || r.updatedAt)}</p>
                    <p class="font-mono text-xs text-primary mt-1">${esc(r.request_no)}</p>
                </td>
                <td class="px-6 py-4">
                    <p class="font-medium text-ink">${esc(r.branch_id?.name || '-')}</p>
                    <p class="text-xs text-body-muted">${esc(r.created_by?.name || '-')}</p>
                </td>
                <td class="px-6 py-4 text-ink text-sm">${itemSummary(sent)}</td>
                <td class="px-6 py-4 text-sm">
                    <p class="text-ink">เลขพัสดุ: ${tracking || '-'}</p>
                    <p class="text-xs text-body-muted mt-1">ใบโอน: ${esc(r.transfer_id?.transfer_number || '-')}${r.expected_arrival ? ` · คาดว่าจะถึง ${fmtDate(r.expected_arrival)}` : ''}</p>
                    ${imgs ? `<p class="text-xs text-body-muted mt-1">รูปหลักฐาน: ${imgs}</p>` : ''}
                </td>
                <td class="px-6 py-4 text-ink text-sm">${esc(r.shipped_by?.name || '-')}</td>
            </tr>`;
        }).join('');
    };

    const srtLoadHistory = async () => {
        skeleton('srt-history-body', 5);
        try {
            const json = await api('/stock-requests/tech-history');
            srtHistory = json.data || [];
            srtHistoryLoaded = true;
            srtRenderHistory();
        } catch (err) {
            emptyRow('srt-history-body', 5, esc(err.message));
            showToast(err.message, 'error');
        }
        srtRenderTabs();
    };

    const srtAddTracking = (val = '') => {
        const row = document.createElement('div');
        row.className = 'flex gap-2 items-center';
        row.innerHTML = `
            <div class="relative flex-1">
                <i class="fa-solid fa-barcode absolute left-4 top-1/2 -translate-y-1/2 text-body-muted" aria-hidden="true"></i>
                <input type="text" aria-label="เลขพัสดุ" placeholder="สแกนหรือพิมพ์เลขพัสดุ" value="${esc(val)}"
                    class="srt-tracking w-full pl-11 pr-4 py-2.5 rounded-xl bg-field border border-line text-ink focus:border-primary focus:outline-none text-sm">
            </div>
            <button type="button" aria-label="ลบเลขพัสดุ" class="w-9 h-9 rounded-lg flex items-center justify-center text-state-danger hover:bg-state-danger/10 transition-colors">
                <i class="fa-solid fa-trash"></i>
            </button>`;
        row.querySelector('button').addEventListener('click', () => {
            // เหลือช่องเดียวให้ล้างค่าแทนการลบ จะได้มีช่องกรอกเสมอ
            if ($('srt-tracking-list').children.length > 1) row.remove();
            else row.querySelector('input').value = '';
        });
        $('srt-tracking-list').appendChild(row);
    };

    // รูปหลักฐานการจัดส่ง (base64 ที่บีบอัดแล้ว) แนบได้สูงสุด SRT_MAX_IMAGES รูป
    const SRT_MAX_IMAGES = 10;
    let srtImages = [];

    const srtRenderImages = () => {
        $('srt-image-list').innerHTML = srtImages.map((src, i) => `
            <div class="relative w-20 h-20 rounded-xl overflow-hidden border border-line bg-field shrink-0">
                <img src="${src}" alt="รูปหลักฐานที่ ${i + 1}" class="w-full h-full object-cover">
                <button type="button" data-srt-img-remove="${i}" aria-label="ลบรูปที่ ${i + 1}"
                    class="absolute top-1 right-1 w-6 h-6 rounded-full bg-canvas/80 text-state-danger flex items-center justify-center text-xs">
                    <i class="fa-solid fa-xmark"></i>
                </button>
            </div>`).join('');
    };

    const srtAddImages = async (fileList) => {
        const files = Array.from(fileList || []);
        for (const file of files) {
            if (srtImages.length >= SRT_MAX_IMAGES) {
                showToast(`แนบรูปได้ไม่เกิน ${SRT_MAX_IMAGES} รูป`, 'warning');
                break;
            }
            if (!file.type.startsWith('image/')) {
                showToast(`ไฟล์ ${file.name} ไม่ใช่รูปภาพ`, 'warning');
                continue;
            }
            try {
                const raw = await new Promise((resolve, reject) => {
                    const reader = new FileReader();
                    reader.onload = () => resolve(reader.result);
                    reader.onerror = reject;
                    reader.readAsDataURL(file);
                });
                srtImages.push(await compressImage(raw, 1024, 1024, 0.7));
            } catch (err) {
                showToast(`อ่านรูป ${file.name} ไม่สำเร็จ`, 'error');
            }
        }
        srtRenderImages();
    };

    // สรุปจำนวนที่จะส่งที่ขอบล่าง + ป้ายสถานะ "ส่งครบ/ส่งบางส่วน" ของแต่ละรายการ
    const srtUpdateSummary = () => {
        let shipped = 0;
        let requested = 0;
        document.querySelectorAll('#srt-items [data-item-id]').forEach(row => {
            const req = Number(row.dataset.requested);
            const qty = Number(row.querySelector('.srt-qty').value) || 0;
            shipped += qty;
            requested += req;
            const tag = row.querySelector('.srt-state');
            if (qty >= req) { tag.textContent = 'ส่งครบ'; tag.className = 'srt-state ml-2 text-state-ok'; }
            else { tag.textContent = qty === 0 ? 'ไม่ส่งรายการนี้' : 'ส่งบางส่วน'; tag.className = 'srt-state ml-2 text-state-pending'; }
        });
        $('srt-summary').innerHTML = `จะส่ง <b class="text-ink">${shipped}</b> / ${requested} ชิ้น`;
    };
    const srtOnItemsInput = (e) => {
        const stepBtn = e.target.closest('[data-srt-step]');
        if (stepBtn) {
            const row = stepBtn.closest('[data-item-id]');
            const input = row.querySelector('.srt-qty');
            const max = Number(row.dataset.requested);
            input.value = Math.min(max, Math.max(0, (Number(input.value) || 0) + Number(stepBtn.dataset.srtStep)));
        }
        srtUpdateSummary();
    };

    const srtOpen = (id) => {
        const r = srtRows.find(x => x._id === id);
        if (!r) return;
        srtCurrent = r;
        srtImages = [];
        srtRenderImages();
        $('srt-images').value = '';
        $('srt-modal-title').textContent = `จัดส่ง ${r.request_no}`;
        // วันนัดส่งตั้งโดยฝ่ายจัดซื้อ แสดงให้เห็นอย่างเดียว ไม่ให้กรอกซ้ำ
        const chip = (icon, text) => `<span class="inline-flex items-center gap-2 px-3 py-1 rounded-full bg-field border border-line text-ink"><i class="fa-solid ${icon} text-primary" aria-hidden="true"></i>${text}</span>`;
        $('srt-meta').innerHTML = chip('fa-store', `ส่งไปสาขา <b class="font-semibold">${esc(r.branch_id?.name || '-')}</b>`)
            + chip('fa-user', `ผู้ขอ ${esc(r.created_by?.name || '-')}`)
            + (r.expected_arrival ? chip('fa-calendar', `นัดส่ง ${esc(fmtDate(r.expected_arrival))}`) : '');
        $('srt-items').innerHTML = techItems(r).map(it => `
            <div class="rounded-xl bg-field border border-line p-4 space-y-3" data-item-id="${esc(it._id)}" data-requested="${esc(techQty(it))}">
                <div class="flex flex-wrap items-center justify-between gap-3">
                    <div class="min-w-0">
                        <p class="font-medium text-ink">${esc(itemLabel(it))}</p>
                        <p class="text-xs text-body-muted mt-0.5">ขอ ${esc(techQty(it))} ชิ้น <span class="srt-state ml-2"></span></p>
                    </div>
                    <div class="flex items-center gap-1" role="group" aria-label="จำนวนที่ส่งจริง ${esc(it.product_name)}">
                        <button type="button" data-srt-step="-1" aria-label="ลดจำนวน" class="w-10 h-10 rounded-lg bg-canvas border border-line text-ink hover:border-primary transition-colors"><i class="fa-solid fa-minus" aria-hidden="true"></i></button>
                        <input type="number" min="0" max="${esc(techQty(it))}" step="1" inputmode="numeric" value="${esc(techQty(it))}"
                            aria-label="จำนวนที่ส่งจริง ${esc(it.product_name)}"
                            class="srt-qty w-16 h-10 px-2 rounded-lg bg-canvas border border-line text-ink text-center focus:border-primary focus:outline-none text-base font-semibold">
                        <button type="button" data-srt-step="1" aria-label="เพิ่มจำนวน" class="w-10 h-10 rounded-lg bg-canvas border border-line text-ink hover:border-primary transition-colors"><i class="fa-solid fa-plus" aria-hidden="true"></i></button>
                    </div>
                </div>
                ${shortageLines([it])}
            </div>`).join('');
        srtUpdateSummary();

        $('srt-arrival').value = r.expected_arrival ? new Date(r.expected_arrival).toISOString().slice(0, 10) : '';
        $('srt-tracking-list').innerHTML = '';
        srtAddTracking();
        openModal('srt-modal');
    };

    const srtSubmitRequest = async (payload) => {
        const btn = $('srt-submit');
        btn.disabled = true;
        try {
            const json = await api(`/stock-requests/${encodeURIComponent(srtCurrent._id)}/ship`, { method: 'PUT', body: payload });
            const d = json.data || {};
            let msg = `บันทึกการจัดส่งสำเร็จ ใบโอน ${d.transfer_number || ''}`;
            if (d.backorder_request_no) msg += ` · สร้างคำขอค้างส่ง ${d.backorder_request_no}`;
            showToast(msg, 'success');
            closeModal('srt-modal');
            await Promise.all([srtLoad(), srtLoadHistory()]);
        } catch (err) {
            showToast(err.message, 'error');
        } finally {
            btn.disabled = false;
        }
    };

    const srtSubmit = async (e) => {
        e.preventDefault();
        if (!srtCurrent) return;
        const tracking = Array.from(document.querySelectorAll('.srt-tracking')).map(i => i.value.trim()).filter(Boolean);
        if (!tracking.length) return showToast('กรุณาระบุเลขพัสดุอย่างน้อย 1 รายการ', 'warning');

        const rows = Array.from(document.querySelectorAll('#srt-items [data-item-id]'));
        let shipped = 0;
        let requested = 0;
        const items = [];
        for (const row of rows) {
            const qty = Number(row.querySelector('.srt-qty').value);
            const req = Number(row.dataset.requested);
            if (!Number.isInteger(qty) || qty < 0 || qty > req) {
                return showToast(`จำนวนส่งจริงต้องอยู่ระหว่าง 0 ถึง ${req}`, 'warning');
            }
            shipped += qty;
            requested += req;
            items.push({ _id: row.dataset.itemId, fulfilled_quantity: qty });
        }
        if (shipped === 0) return showToast('กรุณาระบุจำนวนที่จัดส่งอย่างน้อย 1 ชิ้น', 'warning');

        const payload = { items, tracking_numbers: tracking, images: srtImages };
        const arrival = $('srt-arrival').value;
        if (arrival) payload.expected_arrival = arrival;
        if (shipped < requested) {
            showConfirm(
                'ส่งไม่ครบ',
                `ส่งได้ ${shipped} จาก ${requested} ชิ้น ระบบจะสร้างคำขอค้างส่งสำหรับส่วนที่เหลือให้อัตโนมัติ ยืนยันการจัดส่งหรือไม่`,
                () => srtSubmitRequest(payload),
                'ยืนยัน'
            );
            return;
        }
        await srtSubmitRequest(payload);
    };

    window.initStockRequestTech = function () {
        if (!srtBound) {
            srtBound = true;
            $('srt-table-body')?.addEventListener('click', (e) => {
                const btn = e.target.closest('[data-srt-open]');
                if (btn) srtOpen(btn.dataset.srtOpen);
            });
            $('srt-refresh')?.addEventListener('click', () => { srtLoad(); srtLoadHistory(); });
            $('srt-tabs')?.addEventListener('click', (e) => {
                const tab = e.target.closest('[data-srt-tab]');
                if (!tab) return;
                srtTab = tab.dataset.srtTab;
                srtRenderTabs();
            });
            $('srt-history-search')?.addEventListener('input', srtRenderHistory);
            $('srt-add-tracking')?.addEventListener('click', () => srtAddTracking());
            $('srt-images')?.addEventListener('change', async (e) => {
                await srtAddImages(e.target.files);
                e.target.value = ''; // เลือกไฟล์เดิมซ้ำได้
            });
            $('srt-image-list')?.addEventListener('click', (e) => {
                const btn = e.target.closest('[data-srt-img-remove]');
                if (!btn) return;
                srtImages.splice(Number(btn.dataset.srtImgRemove), 1);
                srtRenderImages();
            });
            $('srt-form')?.addEventListener('submit', srtSubmit);
            $('srt-items')?.addEventListener('click', srtOnItemsInput);
            $('srt-items')?.addEventListener('input', srtOnItemsInput);
            bindModalClose('srt-modal', ['srt-modal-close', 'srt-cancel']);
        }
        srtRenderTabs();
        srtLoad();
        srtLoadHistory(); // โหลดไว้ล่วงหน้าเพื่อให้ตัวนับบนแท็บถูกต้อง
    };
})();
