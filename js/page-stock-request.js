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
    const toInputDate = (d) => {
        if (!d) return '';
        const dt = new Date(d);
        return isNaN(dt) ? '' : dt.toISOString().slice(0, 10);
    };
    const itemSummary = (items = []) => {
        if (!items.length) return '-';
        const first = items.slice(0, 2).map(i => `${esc(i.product_name)} × ${i.quantity}`).join(', ');
        return items.length > 2 ? `${first} และอีก ${items.length - 2} รายการ` : first;
    };

    // สถานะ → ป้ายจุด + tint 12% (DESIGN.md 11.6) ใช้โทเคนสีของโปรเจกต์
    const STATUS = {
        pending: { label: 'รอตรวจสอบ', tone: 'pending' },
        ordering: { label: 'กำลังสั่งซื้อ', tone: 'pending' },
        sent_to_tech: { label: 'ฝ่ายเทคนิคเตรียมของ', tone: 'pending' },
        shipped: { label: 'จัดส่งแล้ว', tone: 'ok' },
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
        const tb = $('sr-table-body');
        if (!list.length) return emptyRow('sr-table-body', 4, 'ยังไม่มีรายการแจ้งเบิก');
        tb.innerHTML = list.map(r => `
            <tr class="hover:bg-divider transition-colors">
                <td class="px-6 py-4">
                    <span class="font-mono font-semibold text-primary">${esc(r.request_no)}</span>
                    <p class="text-xs text-body-muted mt-1">${fmtDate(r.createdAt)}</p>
                </td>
                <td class="px-6 py-4">
                    <p class="font-medium text-ink">${esc(r.title)}</p>
                    <p class="text-xs text-body-muted">${itemSummary(r.items)}</p>
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
            if (window.showToast) showToast(err.message, 'error');
        }
    };

    const srAddRow = (data = {}) => {
        const wrap = $('sr-rows');
        const row = document.createElement('div');
        row.className = 'grid grid-cols-12 gap-2 items-center';
        row.innerHTML = `
            <input type="text" aria-label="ชื่อสินค้า" placeholder="ชื่อสินค้า" value="${esc(data.product_name || '')}"
                class="sr-row-name col-span-5 px-3 py-2.5 rounded-xl bg-field border border-line text-ink focus:border-primary focus:outline-none text-sm">
            <input type="text" aria-label="รหัสสินค้า" placeholder="รหัส (ถ้ามี)" value="${esc(data.product_code || '')}"
                class="sr-row-code col-span-4 px-3 py-2.5 rounded-xl bg-field border border-line text-ink focus:border-primary focus:outline-none text-sm">
            <input type="number" aria-label="จำนวน" min="1" step="1" inputmode="numeric" value="${esc(data.quantity || 1)}"
                class="sr-row-qty col-span-2 px-3 py-2.5 rounded-xl bg-field border border-line text-ink focus:border-primary focus:outline-none text-sm">
            <button type="button" aria-label="ลบแถว" title="ลบแถว"
                class="sr-row-del col-span-1 text-state-danger hover:text-state-danger-soft transition-colors p-2">
                <i class="fa-solid fa-trash"></i>
            </button>`;
        row.querySelector('.sr-row-del').addEventListener('click', () => {
            if (wrap.children.length > 1) row.remove();
        });
        wrap.appendChild(row);
    };

    const srCollectItems = () => Array.from($('sr-rows').children).map(row => ({
        product_name: row.querySelector('.sr-row-name').value.trim(),
        product_code: row.querySelector('.sr-row-code').value.trim(),
        quantity: Number(row.querySelector('.sr-row-qty').value)
    }));

    const srSubmit = async (e) => {
        e.preventDefault();
        const title = $('sr-title').value.trim();
        const items = srCollectItems();
        if (!title) return showToast('กรุณาระบุชื่อรายการแจ้งเบิก', 'warning');
        if (items.some(i => !i.product_name)) return showToast('กรุณาระบุชื่อสินค้าทุกแถว', 'warning');
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

    const srOpenForm = () => {
        $('sr-title').value = '';
        $('sr-note').value = '';
        $('sr-rows').innerHTML = '';
        srAddRow();
        openModal('sr-modal');
        requestAnimationFrame(() => $('sr-title').focus());
    };

    window.initStockRequest = function () {
        if (!srBound) {
            srBound = true;
            $('btn-sr-open')?.addEventListener('click', srOpenForm);
            $('sr-add-row')?.addEventListener('click', () => srAddRow());
            $('sr-form')?.addEventListener('submit', srSubmit);
            $('sr-search-input')?.addEventListener('input', srRender);
            $('sr-status-filter')?.addEventListener('change', srRender);
            bindModalClose('sr-modal', ['sr-modal-close', 'sr-cancel']);
        }
        srLoad();
    };

    // ==================================================================
    // [B] จัดการคำขอเบิก (ฝ่ายจัดซื้อ)
    // ==================================================================
    let srmBound = false;
    let srmRows = [];
    let srmCurrent = null;

    const srmRender = () => {
        const q = ($('srm-search-input')?.value || '').trim().toLowerCase();
        const list = q ? srmRows.filter(r =>
            (r.request_no || '').toLowerCase().includes(q) ||
            (r.items || []).some(i => (i.product_name || '').toLowerCase().includes(q))) : srmRows;
        $('srm-result-count').textContent = `แสดง ${list.length} จาก ${srmRows.length} รายการ`;
        if (!list.length) return emptyRow('srm-table-body', 5, 'ไม่พบคำขอเบิก');
        $('srm-table-body').innerHTML = list.map(r => `
            <tr class="hover:bg-divider transition-colors">
                <td class="px-6 py-4">
                    <span class="font-mono font-semibold text-primary">${esc(r.request_no)}</span>
                    <p class="text-xs text-body-muted mt-1">${fmtDate(r.createdAt)}</p>
                </td>
                <td class="px-6 py-4">
                    <p class="font-medium text-ink">${esc(r.branch_id?.name || '-')}</p>
                    <p class="text-xs text-body-muted">${esc(r.created_by?.name || '-')}</p>
                </td>
                <td class="px-6 py-4 text-ink text-sm">${itemSummary(r.items)}</td>
                <td class="px-6 py-4">${badge(r.status)}</td>
                <td class="px-6 py-4 text-right">
                    <button type="button" data-srm-open="${esc(r._id)}" title="จัดการคำขอ" aria-label="จัดการคำขอ ${esc(r.request_no)}"
                        class="text-ink hover:text-primary transition-colors p-2">
                        <i class="fa-solid fa-pen-to-square"></i>
                    </button>
                </td>
            </tr>`).join('');
    };

    const srmLoad = async () => {
        skeleton('srm-table-body', 5);
        try {
            const status = $('srm-status-filter')?.value || '';
            const branch = $('srm-branch-filter')?.value || 'ALL';
            const qs = new URLSearchParams();
            if (status) qs.set('status', status);
            if (branch && branch !== 'ALL') qs.set('branch_id', branch);
            const json = await api(`/stock-requests/manage${qs.toString() ? `?${qs}` : ''}`);
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

    // ตัวเลือกสถานะที่ใช้ได้ตามรูปแบบการจัดการที่เลือก
    const srmApplyMethod = () => {
        const method = document.querySelector('input[name="srm-method"]:checked')?.value || '';
        const isStock = method === 'stock';
        const isPurchase = method === 'purchase';
        $('srm-arrival-wrap').classList.toggle('hidden', !isPurchase);
        $('srm-tracking-wrap').classList.toggle('hidden', !isPurchase);
        document.querySelectorAll('#srm-items .srm-tech-wrap').forEach(el => el.classList.toggle('hidden', !isStock));
        const select = $('srm-status');
        Array.from(select.options).forEach(opt => {
            const need = opt.dataset.method;
            opt.hidden = !!need && need !== method;
        });
        const cur = select.options[select.selectedIndex];
        if (cur && cur.hidden) select.value = 'pending';
    };

    const srmAddTracking = (val = '') => {
        const row = document.createElement('div');
        row.className = 'flex gap-2 items-center';
        row.innerHTML = `
            <input type="text" aria-label="เลขพัสดุ" placeholder="ระบุเลขพัสดุ" value="${esc(val)}"
                class="srm-tracking flex-1 px-4 py-2.5 rounded-xl bg-field border border-line text-ink focus:border-primary focus:outline-none text-sm">
            <button type="button" aria-label="ลบเลขพัสดุ" class="text-state-danger hover:text-state-danger-soft p-2">
                <i class="fa-solid fa-trash"></i>
            </button>`;
        row.querySelector('button').addEventListener('click', () => row.remove());
        $('srm-tracking-list').appendChild(row);
    };

    const srmOpen = (id) => {
        const r = srmRows.find(x => x._id === id);
        if (!r) return;
        srmCurrent = r;
        $('srm-modal-title').textContent = `จัดการคำขอ ${r.request_no}`;
        $('srm-items').innerHTML = (r.items || []).map((it, i) => `
            <div class="flex items-center gap-3 px-4 py-3">
                <div class="srm-tech-wrap hidden">
                    <input type="checkbox" id="srm-tech-${i}" data-item-id="${esc(it._id)}" ${it.is_tech ? 'checked' : ''}
                        aria-label="ให้ฝ่ายเทคนิคเตรียม ${esc(it.product_name)}" class="w-5 h-5 accent-primary cursor-pointer">
                </div>
                <div class="flex-1 min-w-0">
                    <p class="font-medium text-ink truncate">${esc(it.product_name)}</p>
                    <p class="text-xs text-body-muted font-mono">${esc(it.product_code || '-')}</p>
                </div>
                <span class="text-ink text-sm">ขอ <span class="font-medium">${esc(it.quantity)}</span></span>
            </div>`).join('') || '<p class="px-4 py-6 text-center text-ink/50 italic">ไม่มีรายการสินค้า</p>';

        document.querySelectorAll('input[name="srm-method"]').forEach(inp => { inp.checked = inp.value === r.fulfillment_method; });
        $('srm-status').value = r.status;
        $('srm-arrival').value = toInputDate(r.expected_arrival);
        $('srm-tracking-list').innerHTML = '';
        (r.tracking_numbers || []).forEach(t => srmAddTracking(t));
        if (!(r.tracking_numbers || []).length) srmAddTracking();
        srmApplyMethod();
        openModal('srm-modal');
    };

    const srmSave = async (e) => {
        e.preventDefault();
        if (!srmCurrent) return;
        const method = document.querySelector('input[name="srm-method"]:checked')?.value || '';
        if (!method) return showToast('กรุณาเลือกรูปแบบการจัดการก่อนบันทึก', 'warning');
        const techIds = Array.from(document.querySelectorAll('#srm-items input[type="checkbox"]:checked')).map(cb => cb.dataset.itemId);
        const tracking = Array.from(document.querySelectorAll('.srm-tracking')).map(i => i.value.trim()).filter(Boolean);
        const btn = $('srm-submit');
        btn.disabled = true;
        try {
            await api(`/stock-requests/${encodeURIComponent(srmCurrent._id)}/manage`, {
                method: 'PUT',
                body: {
                    status: $('srm-status').value,
                    fulfillment_method: method,
                    tracking_numbers: tracking,
                    expected_arrival: method === 'purchase' && $('srm-arrival').value ? $('srm-arrival').value : null,
                    tech_item_ids: method === 'stock' ? techIds : []
                }
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

    window.initStockRequestManage = function () {
        if (!srmBound) {
            srmBound = true;
            $('srm-table-body')?.addEventListener('click', (e) => {
                const btn = e.target.closest('[data-srm-open]');
                if (btn) srmOpen(btn.dataset.srmOpen);
            });
            $('srm-search-input')?.addEventListener('input', srmRender);
            $('srm-branch-filter')?.addEventListener('change', srmLoad);
            $('srm-status-filter')?.addEventListener('change', srmLoad);
            document.querySelectorAll('input[name="srm-method"]').forEach(inp => inp.addEventListener('change', srmApplyMethod));
            $('srm-add-tracking')?.addEventListener('click', () => srmAddTracking());
            $('srm-form')?.addEventListener('submit', srmSave);
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
                <td class="px-6 py-4 text-ink text-sm">${itemSummary(techItems(r))}</td>
                <td class="px-6 py-4">${badge('sent_to_tech')}</td>
                <td class="px-6 py-4 text-right">
                    <button type="button" data-srt-open="${esc(r._id)}" title="จัดส่งสินค้า" aria-label="จัดส่ง ${esc(r.request_no)}"
                        class="text-ink hover:text-primary transition-colors p-2">
                        <i class="fa-solid fa-paper-plane"></i>
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
    };

    const srtAddTracking = (val = '') => {
        const row = document.createElement('div');
        row.className = 'flex gap-2 items-center';
        row.innerHTML = `
            <input type="text" aria-label="เลขพัสดุ" placeholder="สแกนหรือระบุเลขพัสดุ" value="${esc(val)}"
                class="srt-tracking flex-1 px-4 py-2.5 rounded-xl bg-field border border-line text-ink focus:border-primary focus:outline-none text-sm">
            <button type="button" aria-label="ลบเลขพัสดุ" class="text-state-danger hover:text-state-danger-soft p-2">
                <i class="fa-solid fa-trash"></i>
            </button>`;
        row.querySelector('button').addEventListener('click', () => row.remove());
        $('srt-tracking-list').appendChild(row);
    };

    const srtOpen = (id) => {
        const r = srtRows.find(x => x._id === id);
        if (!r) return;
        srtCurrent = r;
        $('srt-modal-title').textContent = `จัดส่ง ${r.request_no}`;
        $('srt-items').innerHTML = techItems(r).map(it => `
            <div class="rounded-xl bg-field border border-line p-4 space-y-3" data-item-id="${esc(it._id)}" data-requested="${esc(it.quantity)}">
                <div class="flex items-center justify-between gap-3">
                    <div class="min-w-0">
                        <p class="font-medium text-ink truncate">${esc(it.product_name)}</p>
                        <p class="text-xs text-body-muted font-mono">${esc(it.product_code || 'ไม่มีรหัส')}</p>
                    </div>
                    <label class="flex items-center gap-2 text-xs text-ink whitespace-nowrap">
                        ส่งจริง
                        <input type="number" min="0" max="${esc(it.quantity)}" step="1" inputmode="numeric" value="${esc(it.quantity)}"
                            aria-label="จำนวนที่ส่งจริง ${esc(it.product_name)}"
                            class="srt-qty w-20 px-3 py-2 rounded-xl bg-canvas border border-line text-ink text-right focus:border-primary focus:outline-none text-sm">
                        <span class="text-body-muted">/ ${esc(it.quantity)}</span>
                    </label>
                </div>
                <div>
                    <label for="srt-imei-${esc(it._id)}" class="text-xs text-body-muted">IMEI (เฉพาะเครื่อง บรรทัดละ 1 เครื่อง)</label>
                    <textarea id="srt-imei-${esc(it._id)}" rows="2" class="srt-imei w-full mt-1 px-3 py-2 rounded-xl bg-canvas border border-line text-ink focus:border-primary focus:outline-none text-sm font-mono"></textarea>
                </div>
            </div>`).join('');

        $('srt-tracking-list').innerHTML = '';
        srtAddTracking();
        $('srt-arrival').value = toInputDate(r.expected_arrival);
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
            await srtLoad();
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
        const items = rows.map(row => {
            const qty = Number(row.querySelector('.srt-qty').value);
            const imeis = row.querySelector('.srt-imei').value.split('\n').map(s => s.trim()).filter(Boolean);
            const req = Number(row.dataset.requested);
            if (!Number.isInteger(qty) || qty < 0 || qty > req) {
                showToast(`จำนวนส่งจริงต้องอยู่ระหว่าง 0 ถึง ${req}`, 'warning');
                throw new Error('invalid');
            }
            shipped += qty;
            requested += req;
            return { _id: row.dataset.itemId, fulfilled_quantity: qty, imeis };
        }).filter(Boolean);
        if (shipped === 0) return showToast('กรุณาระบุจำนวนที่จัดส่งอย่างน้อย 1 ชิ้น', 'warning');

        const payload = {
            items,
            tracking_numbers: tracking,
            expected_arrival: $('srt-arrival').value || null
        };
        if (shipped < requested && window.showConfirm) {
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
            $('srt-refresh')?.addEventListener('click', srtLoad);
            $('srt-add-tracking')?.addEventListener('click', () => srtAddTracking());
            $('srt-form')?.addEventListener('submit', (e) => srtSubmit(e).catch(() => { /* แจ้งเตือนไปแล้ว */ }));
            bindModalClose('srt-modal', ['srt-modal-close', 'srt-cancel']);
        }
        srtLoad();
    };
})();
