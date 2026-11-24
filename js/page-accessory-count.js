// ACCESSORY COUNT MODULE — นับสต็อกอุปกรณ์เสริม (#accessory-count) / ตรวจนับสต็อกอุปกรณ์เสริม (#accessory-count-review)
// โหลดแบบ dynamic เมื่อเปิดหน้า (ดู switchView ใน script.js) — พึ่งพา window.authFetch, window.showToast, window.showConfirm, API_BASE_URL
// สิทธิ์ตรวจที่เซิร์ฟเวอร์ (routes/api.js) — หน้านี้แค่แสดงผลและส่งข้อมูล
// ผลตรวจเป็นการบันทึกอย่างเดียว ไม่ปรับสต็อก และช่อง "หักเงิน" ไม่เชื่อมบัญชี
(function () {
    const $ = (id) => document.getElementById(id);
    const esc = (v) => String(v == null ? '' : v)
        .replace(/&/g, '&amp;').replace(/</g, '&lt;').replace(/>/g, '&gt;').replace(/"/g, '&quot;');
    const fmtDate = (d) => {
        if (!d) return '-';
        const dt = new Date(d);
        return isNaN(dt) ? '-' : dt.toLocaleDateString('th-TH', { day: '2-digit', month: 'short', year: 'numeric' });
    };
    const fmtDateTime = (d) => {
        if (!d) return '-';
        const dt = new Date(d);
        return isNaN(dt) ? '-' : dt.toLocaleString('th-TH', { day: '2-digit', month: 'short', year: 'numeric', hour: '2-digit', minute: '2-digit' });
    };
    // วันนี้ตามเวลาเครื่อง (YYYY-MM-DD) — ค่าเริ่มต้นของตัวเลือกวันที่ในหน้าตรวจนับ
    const todayStr = () => {
        const d = new Date();
        return `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, '0')}-${String(d.getDate()).padStart(2, '0')}`;
    };
    const itemLabel = (i) => i.color_name ? `${i.product_name} (${i.color_name})` : i.product_name;

    // สถานะใบนับ → ป้ายจุด + tint 12% (DESIGN.md 11.6)
    const STATUS = {
        pending: { label: 'กำลังรอตรวจสอบ', tone: 'pending' },
        recheck: { label: 'ตรวจสอบใหม่', tone: 'danger' },
        done: { label: 'เสร็จสิ้น', tone: 'ok' }
    };
    const TONE = {
        ok: { dot: 'bg-state-ok', bg: 'bg-state-ok/[0.12]', text: 'text-state-ok' },
        pending: { dot: 'bg-state-pending', bg: 'bg-state-pending/[0.12]', text: 'text-state-pending' },
        danger: { dot: 'bg-state-danger', bg: 'bg-state-danger/[0.12]', text: 'text-state-danger' }
    };
    const pill = (label, tone) => {
        const t = TONE[tone];
        return `<div class="inline-flex items-center gap-2 px-2.5 py-1 rounded-[0.375rem] ${t.bg}">
                    <div class="w-2 h-2 rounded-full ${t.dot}"></div>
                    <span class="${t.text} font-medium text-xs">${esc(label)}</span>
                </div>`;
    };
    const badge = (status) => {
        const s = STATUS[status] || { label: status, tone: 'pending' };
        return pill(s.label, s.tone);
    };
    // ผลเทียบรายสินค้า: นับได้ − ในระบบ (0 = ครบ, ติดลบ = ขาด, บวก = เกิน)
    const resultOf = (counted, system) => {
        const diff = Number(counted || 0) - Number(system || 0);
        if (diff === 0) return { key: 'ok', label: 'ครบ', tone: 'ok', diff };
        if (diff < 0) return { key: 'short', label: `ขาด ${Math.abs(diff)}`, tone: 'danger', diff };
        return { key: 'over', label: `เกิน ${diff}`, tone: 'pending', diff };
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
        if (!res.ok || json.success === false) {
            const err = new Error(json.message || 'เกิดข้อผิดพลาดในการเชื่อมต่อ');
            err.status = res.status;
            throw err;
        }
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
            `<tr>${Array.from({ length: cols }).map((_, i) => `<td class="px-6 py-4">${bar(i === 0 ? 'w-8' : 'w-32')}</td>`).join('')}</tr>`
        ).join('');
    };
    const emptyRow = (tbodyId, cols, text) => {
        const tb = $(tbodyId);
        if (tb) tb.innerHTML = `<tr><td colspan="${cols}" class="px-6 py-8 text-center text-ink/50 italic">${text}</td></tr>`;
    };
    const currentBranchName = () => {
        try {
            const u = JSON.parse(localStorage.getItem('silmin_user') || '{}');
            return (u.branch && u.branch.name) || 'ไม่ระบุสาขา';
        } catch (e) {
            return 'ไม่ระบุสาขา';
        }
    };
    const inputCls = 'w-full px-3 py-2 rounded-lg bg-field border border-line text-ink focus:border-primary focus:outline-none transition-all text-sm disabled:opacity-40 disabled:cursor-not-allowed';

    // ==================================================================
    // [A] นับสต็อกอุปกรณ์เสริม (สาขา)
    // ==================================================================
    let acBound = false;
    let acRows = [];
    let acEditing = null;   // ใบนับที่กำลังนับใหม่ (สถานะตรวจสอบใหม่) — null = นับใบใหม่
    let acSubmitting = false;

    const acRender = () => {
        const status = $('ac-status-filter')?.value || '';
        const list = acRows.filter(r => !status || r.status === status);
        $('ac-result-count').textContent = `แสดง ${list.length} จาก ${acRows.length} รายการ`;
        if (!list.length) return emptyRow('ac-table-body', 5, 'ยังไม่มีประวัติการนับ');
        $('ac-table-body').innerHTML = list.map((r, idx) => {
            const canManage = r.status === 'recheck';
            return `
            <tr class="hover:bg-divider transition-colors">
                <td class="px-6 py-4 text-body-muted">${idx + 1}</td>
                <td class="px-6 py-4">
                    <p class="text-ink">${fmtDate(r.submitted_at || r.createdAt)}</p>
                    <p class="text-xs font-mono text-body-muted mt-1">${esc(r.count_no)}</p>
                </td>
                <td class="px-6 py-4">
                    <p class="text-ink">${r.items.length} รายการ</p>
                    <p class="text-xs text-body-muted mt-1">ผู้นับ ${esc(r.counted_by_name)}</p>
                </td>
                <td class="px-6 py-4">${badge(r.status)}</td>
                <td class="px-6 py-4 text-right">
                    <button type="button" data-ac-manage="${esc(r._id)}" ${canManage ? '' : 'disabled'}
                        title="${canManage ? 'นับใหม่ตามที่ผู้ตรวจส่งกลับ' : 'กดได้เฉพาะสถานะ ตรวจสอบใหม่'}"
                        class="px-4 py-1.5 rounded-lg text-sm font-medium transition-colors ${canManage ? 'bg-primary text-on-primary hover:bg-primary-pressed' : 'bg-chip text-body-muted opacity-50 cursor-not-allowed'}">
                        <i class="fa-solid fa-pen-to-square mr-1"></i> จัดการ
                    </button>
                </td>
            </tr>`;
        }).join('');
    };

    const acLoad = async () => {
        skeleton('ac-table-body', 5);
        try {
            const json = await api('/accessory-counts');
            acRows = json.data || [];
            acRender();
        } catch (err) {
            emptyRow('ac-table-body', 5, esc(err.message));
            showToast(err.message, 'error');
        }
    };

    // แถวในโมดัลนับ: items = [{ product_id, product_name, color_name, product_code, counted_qty?, note?, review_note? }]
    const acRenderItems = (items) => {
        if (!items.length) {
            $('ac-items').innerHTML = `<tr><td colspan="3" class="px-4 py-8 text-center text-ink/50 italic">สาขานี้ยังไม่มีอุปกรณ์เสริมในสต็อก</td></tr>`;
            return;
        }
        $('ac-items').innerHTML = items.map((it, i) => `
            <tr data-product-id="${esc(it.product_id)}" data-search="${esc(`${it.product_name} ${it.color_name || ''} ${it.product_code || ''}`.toLowerCase())}">
                <td class="px-4 py-3">
                    <label for="ac-qty-${i}" class="text-ink font-medium">${esc(itemLabel(it))}</label>
                    ${it.product_code ? `<p class="text-xs font-mono text-body-muted mt-0.5">${esc(it.product_code)}</p>` : ''}
                    ${it.review_note ? `<p class="text-xs text-state-pending mt-1"><i class="fa-solid fa-circle-info mr-1"></i>ผู้ตรวจ: ${esc(it.review_note)}</p>` : ''}
                </td>
                <td class="px-4 py-3">
                    <input id="ac-qty-${i}" type="number" min="0" step="1" inputmode="numeric" class="ac-qty ${inputCls}"
                        value="${it.counted_qty === undefined || it.counted_qty === null ? '' : esc(it.counted_qty)}" placeholder="0">
                </td>
                <td class="px-4 py-3">
                    <input type="text" maxlength="300" class="ac-note ${inputCls}" aria-label="หมายเหตุของ ${esc(itemLabel(it))}"
                        value="${esc(it.note || '')}" placeholder="ไม่บังคับ">
                </td>
            </tr>`).join('');
    };

    const acUpdateSummary = () => {
        const qtys = Array.from(document.querySelectorAll('#ac-items .ac-qty'));
        const filled = qtys.filter(i => i.value.trim() !== '').length;
        $('ac-summary').textContent = qtys.length ? `กรอกแล้ว ${filled} จาก ${qtys.length} รายการ` : '';
    };

    const acOpen = async (editDoc = null) => {
        acEditing = editDoc;
        $('ac-modal-branch').textContent = currentBranchName();
        $('ac-modal-title-text').textContent = editDoc ? `นับใหม่ ${editDoc.count_no}` : 'นับสต็อกอุปกรณ์เสริม';
        $('ac-recheck-note').classList.toggle('hidden', !editDoc);
        $('ac-item-search').value = '';
        $('ac-submit').textContent = editDoc ? 'ส่งผลการนับใหม่' : 'ส่งผลการนับ';
        if (editDoc) {
            acRenderItems(editDoc.items || []);
            acUpdateSummary();
            openModal('ac-modal');
            return;
        }
        $('ac-items').innerHTML = `<tr><td colspan="3" class="px-4 py-8 text-center text-body-muted"><i class="fa-solid fa-spinner fa-spin mr-2"></i>กำลังโหลดรายการอุปกรณ์เสริมของสาขา...</td></tr>`;
        $('ac-summary').textContent = '';
        openModal('ac-modal');
        try {
            const json = await api('/accessory-counts/products');
            acRenderItems(json.data || []);
            acUpdateSummary();
        } catch (err) {
            $('ac-items').innerHTML = `<tr><td colspan="3" class="px-4 py-8 text-center text-state-danger">${esc(err.message)}</td></tr>`;
        }
    };

    const acSubmit = async (e) => {
        e.preventDefault();
        if (acSubmitting) return;
        const rows = Array.from(document.querySelectorAll('#ac-items tr[data-product-id]'));
        if (!rows.length) return showToast('ไม่มีรายการอุปกรณ์เสริมให้บันทึก', 'warning');
        const items = [];
        for (const row of rows) {
            const qtyEl = row.querySelector('.ac-qty');
            const raw = qtyEl.value.trim();
            const qty = Number(raw);
            if (raw === '' || !Number.isInteger(qty) || qty < 0) {
                // ช่องที่ยังไม่กรอกอาจถูกซ่อนด้วยตัวค้นหา — ล้างการค้นหาก่อนโฟกัส
                $('ac-item-search').value = '';
                acFilterItems();
                qtyEl.focus();
                return showToast('กรุณากรอกจำนวนที่นับได้ให้ครบทุกรายการ (จำนวนเต็มตั้งแต่ 0)', 'warning');
            }
            items.push({ product_id: row.dataset.productId, counted_qty: qty, note: row.querySelector('.ac-note').value.trim() });
        }
        acSubmitting = true;
        const btn = $('ac-submit');
        btn.disabled = true;
        try {
            const json = acEditing
                ? await api(`/accessory-counts/${encodeURIComponent(acEditing._id)}`, { method: 'PUT', body: { items } })
                : await api('/accessory-counts', { method: 'POST', body: { items } });
            showToast(json.message || 'บันทึกสำเร็จ', 'success');
            closeModal('ac-modal');
            await acLoad();
        } catch (err) {
            showToast(err.message, 'error');
            if (err.status === 409) { closeModal('ac-modal'); acLoad(); }
        } finally {
            acSubmitting = false;
            btn.disabled = false;
        }
    };

    const acFilterItems = () => {
        const q = ($('ac-item-search')?.value || '').trim().toLowerCase();
        document.querySelectorAll('#ac-items tr[data-product-id]').forEach(tr => {
            tr.classList.toggle('hidden', !!q && !tr.dataset.search.includes(q));
        });
    };

    window.initAccessoryCount = function () {
        if (!acBound) {
            acBound = true;
            $('btn-ac-open')?.addEventListener('click', () => acOpen(null));
            $('ac-status-filter')?.addEventListener('change', acRender);
            $('ac-table-body')?.addEventListener('click', (e) => {
                const btn = e.target.closest('[data-ac-manage]');
                if (!btn || btn.disabled) return;
                const doc = acRows.find(r => r._id === btn.dataset.acManage);
                if (doc && doc.status === 'recheck') acOpen(doc);
            });
            $('ac-items')?.addEventListener('input', acUpdateSummary);
            $('ac-item-search')?.addEventListener('input', acFilterItems);
            $('ac-form')?.addEventListener('submit', acSubmit);
            bindModalClose('ac-modal', ['ac-modal-close', 'ac-cancel']);
        }
        if ($('ac-branch-name')) $('ac-branch-name').textContent = currentBranchName();
        acLoad();
    };

    // ==================================================================
    // [B] ตรวจนับสต็อกอุปกรณ์เสริม (ผู้ตรวจ — ทุกสาขา)
    // ==================================================================
    let acrBound = false;
    let acrRows = [];
    let acrCurrent = null;
    let acrSubmitting = false;

    const acrFiltered = () => {
        const branch = $('acr-branch-filter')?.value || '';
        return acrRows.filter(r => !branch || String(r.branch_id) === branch);
    };

    // ตัวเลือกสาขาสร้างจากข้อมูลที่โหลดมา (คงค่าที่เลือกไว้ถ้ายังมีอยู่)
    const acrFillBranches = () => {
        const sel = $('acr-branch-filter');
        if (!sel) return;
        const keep = sel.value;
        const map = new Map();
        acrRows.forEach(r => map.set(String(r.branch_id), r.branch_name));
        const opts = [...map.entries()].sort((a, b) => String(a[1]).localeCompare(String(b[1]), 'th'));
        sel.innerHTML = `<option value="">ทุกสาขา</option>` + opts.map(([id, name]) => `<option value="${esc(id)}">${esc(name)}</option>`).join('');
        if (map.has(keep)) sel.value = keep;
    };

    const acrRender = () => {
        const list = acrFiltered();
        $('acr-result-count').textContent = `แสดง ${list.length} จาก ${acrRows.length} รายการ`;
        if (!list.length) return emptyRow('acr-table-body', 6, 'ไม่มีคำขอตรวจสอบในวันที่เลือก');
        $('acr-table-body').innerHTML = list.map((r, idx) => {
            const s = r.summary || {};
            const isPending = r.status === 'pending';
            return `
            <tr class="hover:bg-divider transition-colors">
                <td class="px-6 py-4 text-body-muted">${idx + 1}</td>
                <td class="px-6 py-4">
                    <p class="text-ink">${fmtDateTime(r.submitted_at || r.createdAt)}</p>
                    <p class="text-xs font-mono text-body-muted mt-1">${esc(r.count_no)}</p>
                </td>
                <td class="px-6 py-4">
                    <p class="text-ink font-medium">${esc(r.branch_name)}</p>
                    <p class="text-xs text-body-muted mt-1">ผู้นับ ${esc(r.counted_by_name)}</p>
                </td>
                <td class="px-6 py-4 text-xs">
                    <span class="text-ink">${s.total || 0} รายการ</span>
                    <span class="text-state-ok ml-2">ครบ ${s.ok || 0}</span>
                    <span class="text-state-danger ml-2">ขาด ${s.short || 0}</span>
                    <span class="text-state-pending ml-2">เกิน ${s.over || 0}</span>
                </td>
                <td class="px-6 py-4">${badge(r.status)}</td>
                <td class="px-6 py-4 text-right">
                    <button type="button" data-acr-open="${esc(r._id)}"
                        class="px-4 py-1.5 rounded-lg text-sm font-medium transition-colors ${isPending ? 'bg-primary text-on-primary hover:bg-primary-pressed' : 'bg-chip text-ink hover:bg-skeleton'}">
                        <i class="fa-solid ${isPending ? 'fa-clipboard-check' : 'fa-magnifying-glass'} mr-1"></i> ${isPending ? 'ตรวจสอบ' : 'ดูผล'}
                    </button>
                </td>
            </tr>`;
        }).join('');
    };

    const acrLoad = async () => {
        skeleton('acr-table-body', 6);
        const params = new URLSearchParams();
        const date = $('acr-date')?.value || '';
        const status = $('acr-status-filter')?.value || '';
        if (date) params.set('date', date);
        if (status) params.set('status', status);
        try {
            const json = await api(`/accessory-counts/review${params.toString() ? `?${params}` : ''}`);
            acrRows = json.data || [];
            acrFillBranches();
            acrRender();
        } catch (err) {
            emptyRow('acr-table-body', 6, esc(err.message));
            showToast(err.message, 'error');
        }
    };

    // ช่องหักเงินพิมพ์ได้เฉพาะรายการที่ขาด — รายการอื่นแสดงแต่ปิดไว้ (เซิร์ฟเวอร์ตรวจซ้ำ)
    const acrRenderItems = (doc, editable) => {
        $('acr-items').innerHTML = doc.items.map((it, i) => {
            const r = resultOf(it.counted_qty, it.system_qty);
            const canDeduct = editable && r.key === 'short';
            return `
            <tr data-item-id="${esc(it._id)}">
                <td class="px-3 py-3">
                    <p class="text-ink font-medium">${esc(itemLabel(it))}</p>
                    ${it.product_code ? `<p class="text-xs font-mono text-body-muted mt-0.5">${esc(it.product_code)}</p>` : ''}
                    ${it.note ? `<p class="text-xs text-body-muted mt-1"><i class="fa-solid fa-store mr-1"></i>สาขา: ${esc(it.note)}</p>` : ''}
                </td>
                <td class="px-3 py-3 text-right font-semibold text-ink tabular-nums">${esc(it.counted_qty)}</td>
                <td class="px-3 py-3 text-right text-ink tabular-nums">${esc(it.system_qty)}</td>
                <td class="px-3 py-3">
                    <input type="number" min="0" step="1" inputmode="numeric" class="acr-moved ${inputCls}" ${editable ? '' : 'disabled'}
                        aria-label="ย้ายสินค้า ${esc(itemLabel(it))}" value="${it.moved_qty ? esc(it.moved_qty) : ''}" placeholder="0">
                </td>
                <td class="px-3 py-3">${pill(r.label, r.tone)}</td>
                <td class="px-3 py-3">
                    <input type="text" maxlength="300" class="acr-note ${inputCls}" ${editable ? '' : 'disabled'}
                        aria-label="หมายเหตุ ${esc(itemLabel(it))}" value="${esc(it.review_note || '')}" placeholder="${editable ? 'ไม่บังคับ' : ''}">
                </td>
                <td class="px-3 py-3">
                    <input id="acr-deduct-${i}" type="number" min="0" step="0.01" inputmode="decimal" class="acr-deduct ${inputCls}" ${canDeduct ? '' : 'disabled'}
                        aria-label="หักเงิน ${esc(itemLabel(it))}" title="${r.key === 'short' ? '' : 'กรอกได้เฉพาะรายการที่ขาด'}"
                        value="${it.deduction_amount ? esc(it.deduction_amount) : ''}" placeholder="${r.key === 'short' ? '0.00' : '-'}">
                </td>
            </tr>`;
        }).join('');
    };

    const acrUpdateSummary = () => {
        if (!acrCurrent) return;
        const s = acrCurrent.summary || {};
        const total = Array.from(document.querySelectorAll('#acr-items .acr-deduct'))
            .reduce((sum, el) => sum + (el.disabled ? 0 : (Number(el.value) || 0)), 0);
        const base = `ครบ ${s.ok || 0} · ขาด ${s.short || 0} · เกิน ${s.over || 0}`;
        const savedTotal = (acrCurrent.items || []).reduce((sum, i) => sum + (Number(i.deduction_amount) || 0), 0);
        const shown = acrCurrent.status === 'pending' ? total : savedTotal;
        $('acr-summary').textContent = shown > 0 ? `${base} · หักเงินรวม ${shown.toLocaleString('th-TH', { minimumFractionDigits: 2 })} บาท` : base;
    };

    const acrOpen = (id) => {
        const doc = acrRows.find(r => r._id === id);
        if (!doc) return;
        acrCurrent = doc;
        const editable = doc.status === 'pending';
        $('acr-modal-meta').textContent = `${doc.count_no} · สาขา ${doc.branch_name} · ผู้นับ ${doc.counted_by_name} · ส่งเมื่อ ${fmtDateTime(doc.submitted_at || doc.createdAt)}`;
        const ro = $('acr-readonly-note');
        if (editable) {
            ro.classList.add('hidden');
        } else {
            ro.textContent = doc.status === 'done'
                ? `ใบนี้ตรวจเสร็จสิ้นแล้ว${doc.reviewed_by_name ? ` โดย ${doc.reviewed_by_name}` : ''} เมื่อ ${fmtDateTime(doc.reviewed_at)} (ดูได้อย่างเดียว)`
                : `ส่งกลับให้สาขาตรวจสอบใหม่แล้ว${doc.reviewed_by_name ? ` โดย ${doc.reviewed_by_name}` : ''} — รอสาขาส่งผลนับใหม่ (ดูได้อย่างเดียว)`;
            ro.classList.remove('hidden');
        }
        ['acr-done', 'acr-recheck'].forEach(bid => $(bid).classList.toggle('hidden', !editable));
        $('acr-cancel').textContent = editable ? 'ยกเลิก' : 'ปิด';
        acrRenderItems(doc, editable);
        acrUpdateSummary();
        openModal('acr-modal');
    };

    const acrCollect = () => {
        const items = [];
        for (const row of document.querySelectorAll('#acr-items tr[data-item-id]')) {
            const movedEl = row.querySelector('.acr-moved');
            const deductEl = row.querySelector('.acr-deduct');
            const moved = movedEl.value.trim();
            if (moved !== '' && (!Number.isInteger(Number(moved)) || Number(moved) < 0)) {
                movedEl.focus();
                return { error: 'จำนวนย้ายสินค้าต้องเป็นจำนวนเต็มตั้งแต่ 0 ขึ้นไป' };
            }
            const deduct = deductEl.disabled ? '' : deductEl.value.trim();
            if (deduct !== '' && (!Number.isFinite(Number(deduct)) || Number(deduct) < 0)) {
                deductEl.focus();
                return { error: 'ยอดหักเงินต้องเป็นตัวเลขตั้งแต่ 0 ขึ้นไป' };
            }
            items.push({
                _id: row.dataset.itemId,
                moved_qty: moved === '' ? 0 : Number(moved),
                review_note: row.querySelector('.acr-note').value.trim(),
                deduction_amount: deduct === '' ? 0 : Number(deduct)
            });
        }
        return { items };
    };

    const acrSubmit = (action) => {
        if (!acrCurrent || acrSubmitting) return;
        const collected = acrCollect();
        if (collected.error) return showToast(collected.error, 'warning');
        const doc = acrCurrent;
        const run = async () => {
            acrSubmitting = true;
            ['acr-done', 'acr-recheck'].forEach(bid => { $(bid).disabled = true; });
            try {
                const json = await api(`/accessory-counts/${encodeURIComponent(doc._id)}/review`, { method: 'PUT', body: { action, items: collected.items } });
                showToast(json.message || 'บันทึกสำเร็จ', 'success');
                closeModal('acr-modal');
                await acrLoad();
            } catch (err) {
                showToast(err.message, 'error');
                if (err.status === 409) { closeModal('acr-modal'); acrLoad(); }
            } finally {
                acrSubmitting = false;
                ['acr-done', 'acr-recheck'].forEach(bid => { $(bid).disabled = false; });
            }
        };
        if (action === 'done') {
            showConfirm('ยืนยันเสร็จสิ้น', `ปิดใบนับ ${doc.count_no} ของสาขา ${doc.branch_name} เป็น "เสร็จสิ้น" หลังยืนยันจะแก้ไขไม่ได้อีก`, run, 'เสร็จสิ้น');
        } else {
            showConfirm('ส่งกลับให้ตรวจสอบใหม่', `ส่งใบนับ ${doc.count_no} กลับให้สาขา ${doc.branch_name} นับใหม่ สาขาจะกด "จัดการ" เพื่อนับและส่งใหม่ได้`, run, 'ตรวจสอบใหม่');
        }
    };

    window.initAccessoryCountReview = function () {
        if (!acrBound) {
            acrBound = true;
            if ($('acr-date') && !$('acr-date').value) $('acr-date').value = todayStr();
            $('acr-date')?.addEventListener('change', acrLoad);
            $('acr-all-dates')?.addEventListener('click', () => { $('acr-date').value = ''; acrLoad(); });
            $('acr-status-filter')?.addEventListener('change', acrLoad);
            $('acr-branch-filter')?.addEventListener('change', acrRender);
            $('acr-table-body')?.addEventListener('click', (e) => {
                const btn = e.target.closest('[data-acr-open]');
                if (btn) acrOpen(btn.dataset.acrOpen);
            });
            $('acr-items')?.addEventListener('input', acrUpdateSummary);
            $('acr-done')?.addEventListener('click', () => acrSubmit('done'));
            $('acr-recheck')?.addEventListener('click', () => acrSubmit('recheck'));
            bindModalClose('acr-modal', ['acr-modal-close', 'acr-cancel']);
        }
        acrLoad();
    };
})();
