// STOCK ISSUE MODULE — จ่ายออกสินค้า (ตัดสต็อกระดับ IMEI) + ประวัติการจ่ายออก
// โหลดแบบ dynamic เมื่อเปิดหน้า #stock-issue (ดู switchView case 'stock-issue' ใน script.js)
// พึ่งพา window.authFetch, window.showToast, API_BASE_URL (global จาก script.js)
(function () {
    const TABLE_COLS = 9;

    let _bound = false;
    let _issues = [];          // ประวัติทั้งหมดที่โหลดมา — กรองฝั่ง client
    let _scanned = [];         // [{ imei, product_id, product_name, product_code, color, capacity }]
    let _submitting = false;
    let _lookingUp = false;
    const _expanded = new Set(); // id ใบจ่ายออกที่กางรายการอยู่

    const $ = (id) => document.getElementById(id);
    const esc = (v) => String(v == null ? '' : v)
        .replace(/&/g, '&amp;').replace(/</g, '&lt;').replace(/>/g, '&gt;').replace(/"/g, '&quot;');

    const getUser = () => {
        try { return JSON.parse(localStorage.getItem('silmin_user') || '{}'); } catch (e) { return {}; }
    };
    const canPickBranch = () => !!(getUser().permissions || {}).filter_stock_branch;

    const fmtDateTime = (d) => {
        const dt = new Date(d);
        if (isNaN(dt)) return '-';
        return dt.toLocaleString('th-TH', { day: '2-digit', month: 'short', year: 'numeric', hour: '2-digit', minute: '2-digit' });
    };

    // จุดสีตามสีเครื่อง (DESIGN.md 11.14) + ชื่อสี — ไม่มีสีก็ไม่วาดอะไร
    const colorTag = (name) => {
        if (!name) return '';
        const dot = typeof window.productColorDot === 'function' ? window.productColorDot(name, null) : '';
        return `<span class="inline-flex items-center gap-1.5">${dot}<span>${esc(name)}</span></span>`;
    };

    const baht = (n) => '฿' + Number(n || 0).toLocaleString('th-TH');

    // จัดกลุ่มรายการตาม Supplier พร้อมมูลค่ารวมเฉพาะกลุ่ม — ใช้ทั้งในโมดัลและประวัติ
    // entries = [{ item, idx }] เพื่อให้ปุ่มนำออกในโมดัลอ้างตำแหน่งเดิมใน _scanned ได้
    const groupBySupplier = (items) => {
        const groups = new Map();
        items.forEach((item, idx) => {
            const key = item.supplier_name || '';
            if (!groups.has(key)) groups.set(key, { name: key || 'ไม่ระบุ Supplier', entries: [], total: 0 });
            const g = groups.get(key);
            g.entries.push({ item, idx });
            g.total += Number(item.cost_price || 0);
        });
        return [...groups.values()];
    };

    const MODE_LABEL = { single: 'ทีละชิ้น', multi: 'หลายชิ้น' };

    // ป้ายประเภท: ใช้ชุดสีสถานะเดียวกับ DESIGN.md 11.6 (ทีละชิ้น = ปกติ, หลายชิ้น = ระหว่างดำเนินการ)
    const modeBadge = (mode) => {
        const multi = mode === 'multi';
        const t = multi
            ? { dot: 'bg-orange-500', bg: 'bg-orange-500/[0.12]', text: 'text-orange-400' }
            : { dot: 'bg-[#20D500]', bg: 'bg-[#42A231]/[0.12]', text: 'text-[#20D500]' };
        return `<div class="inline-flex items-center gap-2 px-2.5 py-1 rounded-[0.375rem] ${t.bg}">`
            + `<div class="w-2 h-2 rounded-full ${t.dot}"></div>`
            + `<span class="${t.text} font-medium text-xs">${MODE_LABEL[mode] || '-'}</span></div>`;
    };

    // ==========================================
    // ประวัติการจ่ายออก
    // ==========================================
    const skeletonRows = () => {
        const bar = (w) => `<div class="h-3.5 ${w} rounded-full bg-[#5c5c5c] animate-pulse"></div>`;
        const cells = ['w-32', 'w-28', 'w-20', 'w-16', 'w-8', 'w-40', 'w-24', 'w-8']
            .map(w => `<td class="px-6 py-4">${bar(w)}</td>`).join('');
        return Array.from({ length: 8 }, () => `<tr>${cells}</tr>`).join('');
    };

    const getFilters = () => ({
        q: ($('stock-issue-search-input')?.value || '').trim().toLowerCase(),
        mode: $('stock-issue-filter-mode')?.value || '',
        branch: $('stock-issue-filter-branch')?.value || ''
    });

    const renderChips = (f) => {
        const box = $('stock-issue-active-filters');
        if (!box) return;
        box.innerHTML = '';
        const chips = [];
        if (f.q) chips.push({ key: 'q', label: `ค้นหา: ${f.q}` });
        if (f.mode) chips.push({ key: 'mode', label: `ประเภท: ${MODE_LABEL[f.mode]}` });
        if (f.branch) {
            const name = $('stock-issue-filter-branch')?.selectedOptions[0]?.textContent || f.branch;
            chips.push({ key: 'branch', label: `สาขา: ${name}` });
        }
        chips.forEach(c => {
            const chip = document.createElement('div');
            chip.className = 'px-4 py-2.5 rounded-xl bg-[#4D4D4D]/40 border border-[#3F3F46] text-white text-sm font-medium transition-colors flex items-center gap-2';
            chip.innerHTML = `<span>${esc(c.label)}</span><i class="fa-solid fa-xmark text-[10px] opacity-80 cursor-pointer" role="button" aria-label="ลบตัวกรอง"></i>`;
            chip.addEventListener('click', (e) => {
                if (!e.target.closest('i.fa-xmark')) return;
                if (c.key === 'q') $('stock-issue-search-input').value = '';
                if (c.key === 'mode') $('stock-issue-filter-mode').value = '';
                if (c.key === 'branch') $('stock-issue-filter-branch').value = '';
                renderHistory();
            });
            box.appendChild(chip);
        });
        if (chips.length > 1) {
            const clr = document.createElement('button');
            clr.type = 'button';
            clr.className = 'px-2.5 py-1 bg-red-500/10 hover:bg-red-500/15 text-red-300 rounded-full text-xs font-medium border border-red-500/30 transition-colors';
            clr.textContent = 'ล้างทั้งหมด';
            clr.addEventListener('click', () => {
                $('stock-issue-search-input').value = '';
                $('stock-issue-filter-mode').value = '';
                $('stock-issue-filter-branch').value = '';
                renderHistory();
            });
            box.appendChild(clr);
        }
    };

    const renderHistory = () => {
        const body = $('stock-issue-table-body');
        if (!body) return;
        const f = getFilters();
        renderChips(f);

        const rows = _issues.filter(i => {
            if (f.mode && i.mode !== f.mode) return false;
            if (f.branch && String(i.branch_id) !== f.branch) return false;
            if (f.q) {
                const hay = [i.issue_no, i.reason, i.created_by_name, i.branch_name]
                    .concat((i.items || []).flatMap(x => [x.imei, x.product_name, x.product_code]))
                    .join(' ').toLowerCase();
                if (!hay.includes(f.q)) return false;
            }
            return true;
        });

        const count = $('stock-issue-result-count');
        if (count) count.textContent = `แสดง ${rows.length} จาก ${_issues.length} รายการ`;

        if (rows.length === 0) {
            body.innerHTML = `<tr><td colspan="${TABLE_COLS}" class="px-6 py-8 text-center text-white/50 italic">${_issues.length ? 'ไม่พบรายการที่ค้นหา' : 'ยังไม่มีประวัติการจ่ายออกสินค้า'}</td></tr>`;
            return;
        }

        body.innerHTML = rows.map(i => {
            const open = _expanded.has(i._id);
            const main = `<tr class="hover:bg-[#464646] transition-colors">
                <td class="px-6 py-4"><span class="font-mono font-semibold text-[#FFE169]">${esc(i.issue_no)}</span></td>
                <td class="px-6 py-4 text-white text-sm">${fmtDateTime(i.createdAt)}</td>
                <td class="px-6 py-4 text-white text-sm">${esc(i.branch_name || '-')}</td>
                <td class="px-6 py-4">${modeBadge(i.mode)}</td>
                <td class="px-6 py-4 text-center text-white font-medium">${i.total_qty || (i.items || []).length} <span class="text-xs font-normal">ชิ้น</span></td>
                <td class="px-6 py-4 text-right text-white font-mono">${baht(i.total_cost)}</td>
                <td class="px-6 py-4 text-white text-sm max-w-[260px] truncate" title="${esc(i.reason)}">${esc(i.reason || '-')}</td>
                <td class="px-6 py-4 text-white text-sm">${esc(i.created_by_name || '-')}</td>
                <td class="px-6 py-4"><div class="flex items-center justify-end gap-1">
                    <button type="button" data-toggle="${esc(i._id)}" aria-expanded="${open}" class="text-white hover:text-indigo-400 transition-colors p-2" title="ดูรายการสินค้า" aria-label="ดูรายการสินค้า ${esc(i.issue_no)}"><i class="fa-solid fa-eye"></i></button>
                </div></td>
            </tr>`;
            if (!open) return main;
            const groups = groupBySupplier(i.items || []).map(g => {
                const rowsHtml = g.entries.map(({ item: it }) => `<tr>
                    <td class="px-4 py-2 text-white text-sm">${esc(it.product_name)}${it.color_name ? ` <span class="text-xs text-white/70 ml-2">${colorTag(it.color_name)}</span>` : ''}${it.product_code ? ` <span class="text-xs text-white/70 font-mono">${esc(it.product_code)}</span>` : ''}</td>
                    <td class="px-4 py-2 font-mono text-sm text-white">${esc(it.imei)}</td>
                    <td class="px-4 py-2 text-right font-mono text-sm text-white">${baht(it.cost_price)}</td></tr>`).join('');
                return `<div class="mb-4 last:mb-0">
                    <div class="flex items-center justify-between px-4 py-2">
                        <p class="text-sm font-medium text-[#FFE169]">${esc(g.name)} <span class="text-xs text-white/70 font-normal">(${g.entries.length} ชิ้น)</span></p>
                        <p class="text-sm text-white font-mono">รวม ${baht(g.total)}</p>
                    </div>
                    <table class="w-full text-left border-collapse"><thead><tr>
                        <th class="px-4 py-2 text-xs font-semibold text-white/70">สินค้า</th>
                        <th class="px-4 py-2 text-xs font-semibold text-white/70">IMEI</th>
                        <th class="px-4 py-2 text-xs font-semibold text-white/70 text-right">ราคาต้นทุน</th></tr></thead>
                        <tbody class="divide-y divide-[#464646]">${rowsHtml}</tbody></table></div>`;
            }).join('');
            return main + `<tr><td colspan="${TABLE_COLS}" class="px-6 py-4 bg-[#18181B]/60">${groups}</td></tr>`;
        }).join('');
    };

    const loadHistory = async () => {
        const body = $('stock-issue-table-body');
        if (body) body.innerHTML = skeletonRows();
        try {
            const res = await authFetch(`${API_BASE_URL}/stock-issues`);
            const json = await res.json();
            if (!json.success) throw new Error(json.message || 'โหลดประวัติไม่สำเร็จ');
            _issues = json.data || [];
            syncBranchFilter();
            renderHistory();
        } catch (err) {
            console.error(err);
            if (body) body.innerHTML = `<tr><td colspan="${TABLE_COLS}" class="px-6 py-8 text-center text-red-300">${esc(err.message || 'เชื่อมต่อเซิร์ฟเวอร์ไม่ได้')}</td></tr>`;
        }
    };

    // ตัวกรองสาขาในแถบควบคุม: เติมจากสาขาที่มีในประวัติจริง
    const syncBranchFilter = () => {
        const sel = $('stock-issue-filter-branch');
        if (!sel) return;
        const current = sel.value;
        const seen = new Map();
        _issues.forEach(i => { if (!seen.has(String(i.branch_id))) seen.set(String(i.branch_id), i.branch_name || '-'); });
        sel.innerHTML = '<option value="">ทุกสาขา</option>'
            + [...seen].map(([id, name]) => `<option value="${esc(id)}">${esc(name)}</option>`).join('');
        sel.value = seen.has(current) ? current : '';
    };

    // ==========================================
    // โมดัลจ่ายออกสินค้า
    // ==========================================
    const renderScanned = () => {
        const body = $('stock-issue-scan-body');
        $('stock-issue-scan-count').textContent = `${_scanned.length} รายการ`;
        $('stock-issue-submit-btn').disabled = _submitting || _scanned.length === 0;
        if (!body) return;
        if (_scanned.length === 0) {
            body.innerHTML = '<tr><td colspan="4" class="px-4 py-6 text-center text-white/50 italic text-sm">ยังไม่มีรายการที่สแกน</td></tr>';
            return;
        }
        body.innerHTML = groupBySupplier(_scanned).map(g => `<tr class="bg-[#4D4D4D]/40">
            <td colspan="2" class="px-4 py-2 text-sm font-medium text-[#FFE169]">${esc(g.name)} <span class="text-xs text-white/70 font-normal">(${g.entries.length} ชิ้น)</span></td>
            <td colspan="2" class="px-4 py-2 text-sm text-white font-mono text-right">รวม ${baht(g.total)}</td></tr>`
            + g.entries.map(({ item: s, idx }) => `<tr class="hover:bg-[#464646] transition-colors">
            <td class="px-4 py-3 text-white text-sm">
                <p class="font-medium">${esc(s.product_name)}</p>
                <p class="text-xs text-white/70 flex items-center gap-1.5">${colorTag(s.color) || ''}${s.color && s.capacity ? ' · ' : ''}${esc(s.capacity || (s.color ? '' : (s.product_code || '-')))}</p>
            </td>
            <td class="px-4 py-3 font-mono text-sm text-[#FFE169]">${esc(s.imei)}</td>
            <td class="px-4 py-3 text-right font-mono text-sm text-white">${baht(s.cost_price)}</td>
            <td class="px-4 py-3 text-right"><button type="button" data-remove="${idx}" class="text-white hover:text-red-400 transition-colors p-2" title="นำออก" aria-label="นำ IMEI ${esc(s.imei)} ออกจากรายการ"><i class="fa-solid fa-trash"></i></button></td>
        </tr>`).join('')).join('')
            + `<tr class="bg-[#4D4D4D]/40"><td colspan="2" class="px-4 py-3 text-sm font-semibold text-white">มูลค่าต้นทุนรวมทั้งหมด</td>
            <td colspan="2" class="px-4 py-3 text-sm font-semibold text-white font-mono text-right">${baht(_scanned.reduce((t, s) => t + Number(s.cost_price || 0), 0))}</td></tr>`;
    };

    const getIssueBranchId = () => (canPickBranch() ? $('stock-issue-branch').value : '');

    const addImei = async () => {
        if (_lookingUp) return;
        const input = $('stock-issue-imei');
        const imei = input.value.trim();
        if (!imei) { showToast('กรุณาสแกนหรือระบุเลข IMEI', 'error'); input.focus(); return; }
        if (_scanned.some(s => s.imei === imei)) {
            showToast(`IMEI ${imei} อยู่ในรายการแล้ว`, 'error');
            input.value = ''; input.focus();
            return;
        }
        _lookingUp = true;
        try {
            const qs = new URLSearchParams({ code: imei });
            const bid = getIssueBranchId();
            if (bid) qs.set('branch_id', bid);
            const res = await authFetch(`${API_BASE_URL}/stock-issues/lookup?${qs}`);
            const json = await res.json();
            if (!json.success) { showToast(json.message || 'ไม่พบ IMEI ในสต็อก', 'error'); return; }
            _scanned.push(json.item);
            input.value = '';
            renderScanned();
        } catch (err) {
            console.error(err);
            showToast('ไม่สามารถเชื่อมต่อเซิร์ฟเวอร์ได้', 'error');
        } finally {
            _lookingUp = false;
            input.focus();
        }
    };

    const openModal = async () => {
        const modal = $('stock-issue-modal');
        if (!modal) return;
        _scanned = [];
        _submitting = false;
        $('stock-issue-imei').value = '';
        $('stock-issue-reason').value = '';
        renderScanned();

        const wrap = $('stock-issue-branch-wrap');
        const sel = $('stock-issue-branch');
        if (canPickBranch()) {
            wrap.classList.remove('hidden');
            if (!sel.options.length) {
                try {
                    const res = await authFetch(`${API_BASE_URL}/branches`);
                    const json = await res.json();
                    sel.innerHTML = (json.data || []).map(b => `<option value="${esc(b._id)}">${esc(b.name)}</option>`).join('');
                    const u = getUser();
                    const mine = u.branch && (u.branch._id || u.branch);
                    if (mine) sel.value = mine;
                } catch (e) { console.error(e); }
            }
        } else {
            wrap.classList.add('hidden');
        }

        modal.classList.remove('hidden');
        modal.classList.add('flex');
        requestAnimationFrame(() => {
            modal.classList.remove('opacity-0');
            $('stock-issue-imei').focus();
        });
    };

    const closeModal = () => {
        const modal = $('stock-issue-modal');
        if (!modal) return;
        modal.classList.add('opacity-0');
        setTimeout(() => { modal.classList.add('hidden'); modal.classList.remove('flex'); }, 300);
    };

    const submit = async (e) => {
        e.preventDefault();
        if (_submitting) return;
        const reason = $('stock-issue-reason').value.trim();
        if (_scanned.length === 0) { showToast('กรุณาสแกน IMEI อย่างน้อย 1 รายการ', 'error'); return; }
        if (!reason) { showToast('กรุณาระบุหมายเหตุการจ่ายออก', 'error'); $('stock-issue-reason').focus(); return; }

        const doSubmit = async () => {
            _submitting = true;
            renderScanned();
            const btn = $('stock-issue-submit-btn');
            const original = btn.innerHTML;
            btn.innerHTML = '<i class="fa-solid fa-circle-notch fa-spin"></i> กำลังบันทึก...';
            try {
                // POST ไม่ retry (authFetch retry เฉพาะ GET) — กันตัดสต็อกซ้ำ
                const res = await authFetch(`${API_BASE_URL}/stock-issues`, {
                    method: 'POST',
                    headers: { 'Content-Type': 'application/json' },
                    body: JSON.stringify({
                        mode: 'multi',
                        branch_id: getIssueBranchId() || undefined,
                        reason,
                        imeis: _scanned.map(s => s.imei)
                    })
                });
                const json = await res.json();
                if (json.success) {
                    showToast(json.message || 'จ่ายออกสินค้าสำเร็จ', 'success');
                    closeModal();
                    loadHistory();
                } else {
                    showToast(json.message || 'จ่ายออกสินค้าไม่สำเร็จ', 'error');
                }
            } catch (err) {
                console.error(err);
                showToast('ไม่สามารถเชื่อมต่อเซิร์ฟเวอร์ได้', 'error');
            } finally {
                _submitting = false;
                btn.innerHTML = original;
                renderScanned();
            }
        };

        // การตัดสต็อกย้อนไม่ได้ → ยืนยันก่อนยิง API (DESIGN.md 11.6)
        showConfirm('ยืนยันการจ่ายออกสินค้า',
            `จ่ายออกสินค้า ${_scanned.length} ชิ้นออกจากสต็อก — ย้อนกลับไม่ได้`,
            doSubmit, 'จ่ายออก');
    };

    // ==========================================
    // เริ่มหน้า — initStockIssue ถูกเรียกซ้ำทุกครั้งที่เข้าหน้า: ผูก listener ครั้งเดียว แต่โหลดประวัติใหม่ทุกครั้ง
    // ==========================================
    window.initStockIssue = () => {
        if (!_bound) {
            _bound = true;
            $('btn-open-stock-issue')?.addEventListener('click', openModal);
            $('stock-issue-modal-close')?.addEventListener('click', closeModal);
            $('stock-issue-cancel-btn')?.addEventListener('click', closeModal);
            $('stock-issue-form')?.addEventListener('submit', submit);
            $('stock-issue-add-btn')?.addEventListener('click', addImei);
            $('stock-issue-imei')?.addEventListener('keydown', (e) => {
                if (e.key === 'Enter') { e.preventDefault(); addImei(); } // เครื่องสแกนส่ง Enter ท้ายรหัส
            });
            document.querySelectorAll('.stock-issue-reason-chip').forEach(btn =>
                btn.addEventListener('click', () => {
                    const ta = $('stock-issue-reason');
                    ta.value = ta.value.trim() ? `${ta.value.trim()}, ${btn.dataset.reason}` : btn.dataset.reason;
                    ta.focus();
                }));
            $('stock-issue-scan-body')?.addEventListener('click', (e) => {
                const b = e.target.closest('[data-remove]');
                if (!b) return;
                _scanned.splice(Number(b.dataset.remove), 1);
                renderScanned();
            });
            $('stock-issue-table-body')?.addEventListener('click', (e) => {
                const b = e.target.closest('[data-toggle]');
                if (!b) return;
                const id = b.dataset.toggle;
                if (_expanded.has(id)) _expanded.delete(id); else _expanded.add(id);
                renderHistory();
            });
            $('stock-issue-search-input')?.addEventListener('input', renderHistory);
            $('stock-issue-filter-mode')?.addEventListener('change', renderHistory);
            $('stock-issue-filter-branch')?.addEventListener('change', renderHistory);
        }
        loadHistory();
    };
})();
