// STOCK ISSUE MODULE — จ่ายออกสินค้า (ตัดสต็อกระดับ IMEI) + ประวัติการจ่ายออก
// โหลดแบบ dynamic เมื่อเปิดหน้า #stock-issue (ดู switchView case 'stock-issue' ใน script.js)
// พึ่งพา window.authFetch, window.showToast, API_BASE_URL (global จาก script.js)
(function () {
    const TABLE_COLS = 10;

    let _bound = false;
    let _issues = [];          // ประวัติทั้งหมดที่โหลดมา — กรองฝั่ง client
    // รายการที่จะจ่ายออก: เครื่อง { kind:'device', imei, ... } / อุปกรณ์เสริม { kind:'accessory', product_id, quantity, stock_available, ... }
    // ทุกรายการมี claim_type ของตัวเอง ('' = ยังไม่เลือก)
    let _scanned = [];
    let _submitting = false;
    let _lookingUp = false;
    let _kind = 'device';      // ประเภทที่กำลังเพิ่มในโมดัล: device | accessory
    let _accResults = [];      // ผลค้นอุปกรณ์เสริมล่าสุด
    let _accPicked = null;     // อุปกรณ์เสริมที่เลือกจากผลค้นหา
    let _accSeq = 0;           // กันผลค้นหาเก่ามาทับผลใหม่
    let _accTimer = null;

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
            g.total += Number(item.cost_price || 0) * Number(item.quantity || 1);
        });
        return [...groups.values()];
    };

    // ซัพพลายเออร์ที่ไม่ซ้ำในใบจ่ายออก (ใบเดียวมีหลายเจ้าได้)
    const supplierNames = (issue) => [...new Set((issue.items || []).map(x => x.supplier_name || 'ไม่ระบุ Supplier'))];

    // ==========================================
    // ประวัติการจ่ายออก
    // ==========================================
    const skeletonRows = () => {
        const bar = (w) => `<div class="h-3.5 ${w} rounded-full bg-skeleton animate-pulse"></div>`;
        const cells = ['w-32', 'w-28', 'w-20', 'w-16', 'w-8', 'w-40', 'w-24', 'w-24', 'w-8']
            .map(w => `<td class="px-6 py-4">${bar(w)}</td>`).join('');
        return Array.from({ length: 8 }, () => `<tr>${cells}</tr>`).join('');
    };

    // ---------- สถานะเคลม ----------
    const CLAIM_TYPE_LABEL = { goods: 'ได้รับสินค้า', cash: 'ได้รับเงินสด', discount: 'ได้รับส่วนลด', loss: 'จ่ายออกเปล่า (ขาดทุน)' };
    // ตัวเลือกที่เลือกได้ตอนจ่ายออก (ต่อชิ้น)
    const ISSUE_CLAIM_OPTIONS = ['goods', 'cash', 'discount', 'loss'];
    const CLAIM_STATUS_STYLE = {
        'ส่งเคลมแล้ว': { dot: 'bg-state-pending', bg: 'bg-state-pending/[0.12]', text: 'text-state-pending' },
        'ปิดเคลม': { dot: 'bg-state-ok', bg: 'bg-state-ok-tint/[0.12]', text: 'text-state-ok' },
        'ปฏิเสธ': { dot: 'bg-state-danger', bg: 'bg-state-danger/[0.12]', text: 'text-state-danger-soft' }
    };
    const claimBadge = (status, title) => {
        const t = CLAIM_STATUS_STYLE[status] || CLAIM_STATUS_STYLE['ส่งเคลมแล้ว'];
        const label = status === 'ปฏิเสธ' ? 'ซัพปฏิเสธ' : status;
        return `<div class="inline-flex items-center gap-2 px-2.5 py-1 rounded-[0.375rem] ${t.bg}" title="${esc(title || '')}">`
            + `<div class="w-2 h-2 rounded-full ${t.dot}"></div><span class="${t.text} font-medium text-xs">${esc(label)}</span></div>`;
    };
    // คอลัมน์สถานะเคลมในตาราง: ใบที่ไม่ใช่เคลมแสดง "-" ใบที่แตกหลายซัพแสดงป้ายต่อซัพ
    const claimCell = (issue) => {
        const claims = issue.claims || [];
        const lossCount = (issue.items || []).filter(x => x.claim_type === 'loss').length;
        const lossBadge = lossCount ? `<div class="inline-flex items-center gap-2 px-2.5 py-1 rounded-[0.375rem] bg-state-danger/[0.12]" title="${lossCount} ชิ้นที่จ่ายออกเปล่า ไม่เปิดใบเคลม"><div class="w-2 h-2 rounded-full bg-state-danger"></div><span class="text-state-danger-soft font-medium text-xs">ขาดทุน ${lossCount}</span></div>` : '';
        if (!issue.is_claim || claims.length === 0) return lossBadge || '<span class="text-ink/50">-</span>';
        return `<div class="flex flex-wrap gap-1">${claims.map(c => claimBadge(c.status, `${c.claim_no} · ${c.supplier_name}`)).join('')}${lossBadge}</div>`;
    };

    const getFilters = () => ({
        q: ($('stock-issue-search-input')?.value || '').trim().toLowerCase(),
        supplier: $('stock-issue-filter-supplier')?.value || '',
        claim: $('stock-issue-filter-claim')?.value || '',
        branch: $('stock-issue-filter-branch')?.value || ''
    });

    const renderChips = (f) => {
        const box = $('stock-issue-active-filters');
        if (!box) return;
        box.innerHTML = '';
        const chips = [];
        if (f.q) chips.push({ key: 'q', label: `ค้นหา: ${f.q}` });
        if (f.supplier) chips.push({ key: 'supplier', label: `ซัพพลายเออร์: ${f.supplier}` });
        if (f.claim) chips.push({ key: 'claim', label: `เคลม: ${f.claim === 'none' ? 'ไม่ใช่เคลม' : (f.claim === 'ปฏิเสธ' ? 'ซัพปฏิเสธ' : f.claim)}` });
        if (f.branch) {
            const name = $('stock-issue-filter-branch')?.selectedOptions[0]?.textContent || f.branch;
            chips.push({ key: 'branch', label: `สาขา: ${name}` });
        }
        chips.forEach(c => {
            const chip = document.createElement('div');
            chip.className = 'px-4 py-2.5 rounded-xl bg-panel/40 border border-line-strong text-ink text-sm font-medium transition-colors flex items-center gap-2';
            chip.innerHTML = `<span>${esc(c.label)}</span><i class="fa-solid fa-xmark text-[10px] opacity-80 cursor-pointer" role="button" aria-label="ลบตัวกรอง"></i>`;
            chip.addEventListener('click', (e) => {
                if (!e.target.closest('i.fa-xmark')) return;
                if (c.key === 'q') $('stock-issue-search-input').value = '';
                if (c.key === 'supplier') $('stock-issue-filter-supplier').value = '';
                if (c.key === 'claim') $('stock-issue-filter-claim').value = '';
                if (c.key === 'branch') $('stock-issue-filter-branch').value = '';
                renderHistory();
            });
            box.appendChild(chip);
        });
        if (chips.length > 1) {
            const clr = document.createElement('button');
            clr.type = 'button';
            clr.className = 'px-2.5 py-1 bg-state-danger/10 hover:bg-state-danger/15 text-state-danger-soft rounded-full text-xs font-medium border border-state-danger/30 transition-colors';
            clr.textContent = 'ล้างทั้งหมด';
            clr.addEventListener('click', () => {
                $('stock-issue-search-input').value = '';
                $('stock-issue-filter-supplier').value = '';
                $('stock-issue-filter-claim').value = '';
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
            if (f.supplier && !supplierNames(i).includes(f.supplier)) return false;
            if (f.claim === 'none' && i.is_claim) return false;
            if (f.claim && f.claim !== 'none' && !(i.claims || []).some(c => c.status === f.claim)) return false;
            if (f.branch && String(i.branch_id) !== f.branch) return false;
            if (f.q) {
                const hay = [i.issue_no, i.reason, i.created_by_name, i.branch_name].concat(supplierNames(i))
                    .concat((i.items || []).flatMap(x => [x.imei, x.product_name, x.product_code]))
                    .join(' ').toLowerCase();
                if (!hay.includes(f.q)) return false;
            }
            return true;
        });

        const count = $('stock-issue-result-count');
        if (count) count.textContent = `แสดง ${rows.length} จาก ${_issues.length} รายการ`;

        if (rows.length === 0) {
            body.innerHTML = `<tr><td colspan="${TABLE_COLS}" class="px-6 py-8 text-center text-ink/50 italic">${_issues.length ? 'ไม่พบรายการที่ค้นหา' : 'ยังไม่มีประวัติการจ่ายออกสินค้า'}</td></tr>`;
            return;
        }

        body.innerHTML = rows.map(i => {
            return `<tr class="hover:bg-divider transition-colors">
                <td class="px-6 py-4"><span class="font-mono font-semibold text-accent-ink">${esc(i.issue_no)}</span></td>
                <td class="px-6 py-4 text-ink text-sm">${fmtDateTime(i.createdAt)}</td>
                <td class="px-6 py-4 text-ink text-sm">${esc(i.branch_name || '-')}</td>
                <td class="px-6 py-4 text-ink text-sm max-w-[220px] truncate" title="${esc(supplierNames(i).join(', '))}">${esc(supplierNames(i).join(', ') || '-')}</td>
                <td class="px-6 py-4 text-center text-ink font-medium">${i.total_qty || (i.items || []).length} <span class="text-xs font-normal">ชิ้น</span></td>
                <td class="px-6 py-4 text-right text-ink font-mono">${baht(i.total_cost)}</td>
                <td class="px-6 py-4 text-ink text-sm max-w-[260px] truncate" title="${esc(i.reason)}">${esc(i.reason || '-')}</td>
                <td class="px-6 py-4 text-ink text-sm">${esc(i.created_by_name || '-')}</td>
                <td class="px-6 py-4">${claimCell(i)}</td>
                <td class="px-6 py-4"><div class="flex items-center justify-end gap-1">
                    <button type="button" data-detail="${esc(i._id)}" aria-haspopup="dialog" class="text-ink hover:text-accent-ink transition-colors p-2" title="ดูรายการสินค้า" aria-label="ดูรายการสินค้า ${esc(i.issue_no)}"><i class="fa-solid fa-eye"></i></button>
                </div></td>
            </tr>`;
        }).join('');
    };

    // ส่วน "ใบเคลม" ใน popup: ผลเคลมของแต่ละซัพ + ปุ่มปิดเคลม/ซัพปฏิเสธ (เฉพาะใบที่ยังรอผล)
    const claimSection = (issue) => {
        const claims = issue.claims || [];
        if (!issue.is_claim || claims.length === 0) return '';
        const cards = claims.map(c => {
            const open = c.status === 'ส่งเคลมแล้ว';
            const rs = c.resolution || {};
            const fmtDate = (d) => { const x = new Date(d); return isNaN(x) ? '' : x.toLocaleDateString('th-TH', { day: '2-digit', month: 'short', year: 'numeric' }); };
            let outcome = '';
            if (c.status === 'ปิดเคลม') {
                if (c.claim_type === 'goods' && c.item_kind === 'accessory') {
                    const got = rs.received_items || [];
                    const gotQty = got.reduce((t, r) => t + (Number(r.quantity) || 0), 0);
                    const nameOf = (pid) => ((c.items || []).find(x => String(x.product_id) === String(pid)) || {}).product_name || '';
                    outcome = `รับสินค้าแล้ว ${gotQty}/${c.total_qty} ชิ้น${gotQty < c.total_qty ? ' (ไม่ครบ)' : ''}`
                        + got.map(r => `<br>${esc(nameOf(r.product_id))} × ${Number(r.quantity) || 0}`).join('');
                } else if (c.claim_type === 'goods') {
                    const got = rs.received_items || [];
                    outcome = `รับสินค้าแล้ว ${got.length}/${c.total_qty} เครื่อง${got.length < c.total_qty ? ' (ไม่ครบ)' : ''}`
                        + got.map(r => `<br><span class="font-mono">${esc(r.original_imei)}${r.new_imei !== r.original_imei ? ` → ${esc(r.new_imei)}` : ' (เครื่องเดิม)'}</span>`).join('');
                } else if (c.claim_type === 'cash') {
                    outcome = `ได้รับเงินสด ${baht(rs.cash_amount)}${rs.received_date ? ` เมื่อ ${fmtDate(rs.received_date)}` : ''}`;
                } else if (c.claim_type === 'discount') {
                    outcome = `ได้รับส่วนลด ${baht(rs.discount_amount)} (${rs.discount_kind === 'accessory' ? 'อุปกรณ์เสริม' : 'มือถือ / แท็บเล็ต'})${rs.po_number ? ` · อ้างอิงใบสั่งซื้อ ${esc(rs.po_number)}` : ''}`;
                }
            }
            const outcomeHtml = outcome ? `<p class="text-xs text-state-ok mt-2">${outcome}</p>` : '';
            const result = c.result_note ? `<p class="text-xs text-ink/80 mt-2 whitespace-pre-line">ผล: ${esc(c.result_note)}${c.status === 'ปฏิเสธ' ? (c.returned_to_stock ? ' (คืนเครื่องเข้าสต็อกแล้ว)' : ' (ตัดทิ้ง)') : ''}</p>` : '';
            const actions = open ? `<div class="flex gap-2 mt-3">
                <button type="button" data-claim-close="${esc(c._id)}" data-issue="${esc(issue._id)}" class="px-4 py-1.5 rounded-xl bg-primary text-on-primary text-xs font-bold hover:bg-primary-pressed transition-colors">ปิดเคลม</button>
                <button type="button" data-claim-reject="${esc(c._id)}" data-issue="${esc(issue._id)}" class="px-4 py-1.5 rounded-xl bg-[#E4E4E7] text-[#18181B] text-xs font-bold hover:bg-white transition-colors">ซัพปฏิเสธ</button></div>` : '';
            return `<div class="elev-field bg-field rounded-xl px-4 py-3">
                <div class="flex items-center justify-between gap-2">
                    <p class="text-sm text-ink"><span class="font-mono text-accent-ink">${esc(c.claim_no)}</span> · ${esc(c.supplier_name || 'ไม่ระบุ')}</p>${claimBadge(c.status)}</div>
                <p class="text-xs text-ink/70 mt-1">กรณี: ${esc(CLAIM_TYPE_LABEL[c.claim_type] || 'ยังไม่กำหนด (เลือกตอนปิดเคลม)')} · ${c.item_kind === 'accessory' ? 'อุปกรณ์เสริม' : 'เครื่อง'} ${c.total_qty} ชิ้น · ต้นทุน ${baht(c.total_cost)}</p>
                <p class="text-xs text-ink/60 mt-1">${(c.items || []).map(x => x.imei ? `<span class="font-mono">${esc(x.imei)}</span>` : `${esc(x.product_name)} × ${Number(x.quantity) || 1}`).join(' · ')}</p>
                ${outcomeHtml}${result}${actions}</div>`;
        }).join('');
        return `<div class="mb-5"><p class="text-xs text-ink/70 mb-2">ใบเคลม</p><div class="space-y-2">${cards}</div></div>`;
    };

    const callClaim = async (id, action, body, issueId) => {
        try {
            // PUT ไม่ retry (authFetch retry เฉพาะ GET)
            const res = await authFetch(`${API_BASE_URL}/claims/${encodeURIComponent(id)}/${action}`, {
                method: 'PUT',
                headers: { 'Content-Type': 'application/json' },
                body: JSON.stringify(body)
            });
            const json = await res.json();
            if (!json.success) return showToast(json.message || 'บันทึกไม่สำเร็จ', 'error');
            showToast(json.message || 'บันทึกสำเร็จ', 'success');
            await loadHistory();
            openDetail(issueId); // วาด popup ใหม่ให้เห็นสถานะล่าสุด
        } catch (err) {
            console.error(err);
            showToast('ไม่สามารถเชื่อมต่อเซิร์ฟเวอร์ได้', 'error');
        }
    };

    const autoBtnCls = 'px-3 py-1 rounded-xl bg-field text-body-muted hover:text-ink text-xs font-semibold transition-colors cursor-pointer whitespace-nowrap';
    const noteBox = (label) => `<div class="text-left space-y-2">
        <div class="flex items-center justify-between gap-2"><label for="claim-result-note" class="text-ink font-medium text-xs">${label}</label>
            <button type="button" id="claim-auto-note" class="${autoBtnCls}">กรอกอัตโนมัติ</button></div>
        <textarea id="claim-result-note" rows="3" class="elev-field w-full px-4 py-2.5 rounded-xl bg-field text-ink text-sm focus:ring-2 focus:ring-accent-ink focus:outline-none resize-none"></textarea></div>`;

    // ปิดเคลม: ฟอร์มต่างกันตามกรณีของใบ (draft = ค่าที่กรอกไว้ ใช้เปิดฟอร์มใหม่เมื่อกรอกไม่ผ่าน เพราะ showConfirm ปิดตัวเองเสมอ)
    const findClaim = (id) => {
        for (const i of _issues) { const c = (i.claims || []).find(x => String(x._id) === String(id)); if (c) return c; }
        return null;
    };
    const inputCls = 'elev-field w-full px-4 py-2.5 rounded-xl bg-field text-ink text-sm focus:ring-2 focus:ring-accent-ink focus:outline-none';
    const todayStr = () => { const d = new Date(); return `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, '0')}-${String(d.getDate()).padStart(2, '0')}`; };

    const confirmCloseClaim = (id, issueId, draft = {}) => {
        const c0 = findClaim(id);
        if (!c0) return;
        // ซัพที่ยังไม่ได้ตั้งกรณีเคลม (เช่น SYNEX) -> ถามกรณีก่อน แล้วเปิดฟอร์มของกรณีนั้นต่อ
        if (!c0.claim_type && !draft.type) {
            showConfirm('เลือกกรณีเคลม',
                `<div class="text-left space-y-2"><p class="text-xs text-ink/70">ซัพรายนี้ยังไม่ได้ตั้งกรณีเคลมไว้ ผลเคลมครั้งนี้เป็นแบบไหน</p>
                    ${Object.keys(CLAIM_TYPE_LABEL).map((k, n) => `<label class="flex items-center gap-2 text-sm text-ink cursor-pointer"><input type="radio" name="claim-pick-type" value="${k}" ${n === 0 ? 'checked' : ''} class="accent-accent-ink"> ${CLAIM_TYPE_LABEL[k]}</label>`).join('')}</div>`,
                () => {
                    const t = (document.querySelector('input[name="claim-pick-type"]:checked') || {}).value || 'goods';
                    setTimeout(() => confirmCloseClaim(id, issueId, { ...draft, type: t }), 350); // showConfirm ปิดตัวเองเสมอ
                }, 'ถัดไป', 'info');
            return;
        }
        const c = { ...c0, claim_type: c0.claim_type || draft.type };
        const reopen = (msg, d) => { showToast(msg, 'error'); setTimeout(() => confirmCloseClaim(id, issueId, { ...d, type: draft.type }), 350); };
        const note = () => (($('claim-result-note') || {}).value || '');
        let fields = '', onOk = null;

        if (c.claim_type === 'goods' && c.item_kind === 'accessory') {
            fields = `<p class="text-xs text-ink/70">ระบุจำนวนที่ได้รับกลับมาของแต่ละรายการ (ไม่เกินจำนวนที่ส่งเคลม) — ใส่ 0 ถ้าไม่ได้รับ</p>`
                + c.items.map((it, n) => `<div class="flex items-center gap-2">
                    <span class="text-xs text-ink flex-1 min-w-0 truncate" title="${esc(it.product_name)}">${esc(it.product_name)} <span class="text-ink/60">(ส่งเคลม ${Number(it.quantity) || 1})</span></span>
                    <label for="claim-qty-${n}" class="sr-only">จำนวนที่ได้รับของ ${esc(it.product_name)}</label>
                    <input id="claim-qty-${n}" data-claim-qty="${esc(it.product_id)}" data-max="${Number(it.quantity) || 1}" type="number" min="0" max="${Number(it.quantity) || 1}" step="1" inputmode="numeric"
                        value="${esc((draft.qty || {})[it.product_id] !== undefined ? draft.qty[it.product_id] : (Number(it.quantity) || 1))}" class="${inputCls} font-mono text-right w-24"></div>`).join('');
            onOk = () => {
                const qty = {};
                const received = [];
                let bad = false;
                document.querySelectorAll('[data-claim-qty]').forEach(inp => {
                    const v = Number(inp.value);
                    qty[inp.dataset.claimQty] = inp.value;
                    if (!Number.isInteger(v) || v < 0 || v > Number(inp.dataset.max)) bad = true;
                    else if (v > 0) received.push({ product_id: inp.dataset.claimQty, quantity: v });
                });
                const d = { qty, note: note() };
                if (bad) return reopen('จำนวนที่ได้รับต้องเป็นจำนวนเต็ม และไม่เกินจำนวนที่ส่งเคลม', d);
                if (received.length === 0) return reopen('กรุณาระบุจำนวนที่ได้รับอย่างน้อย 1 รายการ', d);
                callClaim(id, 'close', { received, claim_type: c.claim_type, result_note: d.note }, issueId);
            };
        } else if (c.claim_type === 'goods') {
            fields = `<p class="text-xs text-ink/70">สแกนเลข IMEI ใหม่ของเครื่องที่ได้รับกลับมา เพื่อแทนที่ IMEI เดิม — ข้อมูลอื่นของสินค้ายังคงเดิมทั้งหมด (ซ่อมเสร็จแล้วใช้ IMEI เดิมได้) เว้นว่างถ้าเครื่องนั้นไม่ได้รับ</p>`
                + c.items.map((it, n) => `<div class="flex items-center gap-2">
                    <span class="font-mono text-xs text-ink w-36 shrink-0" title="${esc(it.product_name)}">${esc(it.imei)}</span>
                    <label for="claim-new-${n}" class="sr-only">IMEI ที่ได้รับแทน ${esc(it.imei)}</label>
                    <input id="claim-new-${n}" data-claim-new="${esc(it.imei)}" type="text" inputmode="numeric" autocomplete="off" placeholder="สแกน IMEI ใหม่"
                        value="${esc((draft.map || {})[it.imei] || '')}" class="${inputCls} font-mono"></div>`).join('');
            onOk = () => {
                const map = {};
                const received = [];
                document.querySelectorAll('[data-claim-new]').forEach(inp => {
                    const v = inp.value.trim();
                    map[inp.dataset.claimNew] = v;
                    if (v) received.push({ original_imei: inp.dataset.claimNew, new_imei: v });
                });
                const d = { map, note: note() };
                if (received.length === 0) return reopen('กรุณาระบุ IMEI เครื่องที่ได้รับอย่างน้อย 1 เครื่อง', d);
                if (new Set(received.map(r => r.new_imei)).size !== received.length) return reopen('IMEI ที่ได้รับซ้ำกัน', d);
                callClaim(id, 'close', { received, claim_type: c.claim_type, result_note: d.note }, issueId);
            };
        } else if (c.claim_type === 'cash') {
            fields = `<div><label for="claim-cash-amount" class="text-ink font-medium text-xs">จำนวนเงินที่ได้รับ (บาท) <span class="text-red-500">*</span></label>
                    <input id="claim-cash-amount" type="number" min="0.01" step="any" inputmode="decimal" value="${esc(draft.amount !== undefined ? draft.amount : (c.total_cost || ''))}" class="${inputCls} font-mono text-right mt-1.5">
                    <p class="text-xs text-ink/70 mt-1">ค่าเริ่มต้น = ต้นทุนรวมของเครื่องที่เคลม (${baht(c.total_cost)}) แก้ได้ถ้าซัพจ่ายไม่เท่ากัน</p></div>
                <div><label for="claim-cash-date" class="text-ink font-medium text-xs">วันที่ได้รับเงิน</label>
                    <input id="claim-cash-date" type="date" value="${esc(draft.date || todayStr())}" class="${inputCls} mt-1.5"></div>`;
            onOk = () => {
                const d = { amount: ($('claim-cash-amount') || {}).value || '', date: ($('claim-cash-date') || {}).value || '', note: note() };
                if (!(Number(d.amount) > 0)) return reopen('กรุณาระบุจำนวนเงินสดที่ได้รับ', d);
                callClaim(id, 'close', { cash_amount: Number(d.amount), claim_type: c.claim_type, received_date: d.date || undefined, result_note: d.note }, issueId);
            };
        } else {
            const kindFixed = c.item_kind === 'accessory' || c.item_kind === 'device';
            fields = (kindFixed
                ? `<p class="text-xs text-ink/70">ส่วนลดนี้ใช้กับ: <span class="text-ink font-semibold">${c.item_kind === 'accessory' ? 'อุปกรณ์เสริม' : 'มือถือ / แท็บเล็ต'}</span> (ตามชนิดสินค้าในใบเคลม)</p>`
                : `<fieldset class="space-y-2"><legend class="text-ink font-medium text-xs mb-1">ส่วนลดนี้ใช้กับสินค้าชนิดไหน <span class="text-red-500">*</span></legend>
                    <label class="flex items-center gap-2 text-sm text-ink cursor-pointer"><input type="radio" name="claim-discount-kind" value="device" ${draft.kind === 'accessory' ? '' : 'checked'} class="accent-accent-ink"> มือถือ / แท็บเล็ต</label>
                    <label class="flex items-center gap-2 text-sm text-ink cursor-pointer"><input type="radio" name="claim-discount-kind" value="accessory" ${draft.kind === 'accessory' ? 'checked' : ''} class="accent-accent-ink"> อุปกรณ์เสริม</label></fieldset>`)
                + `
                <div><label for="claim-discount-amount" class="text-ink font-medium text-xs">มูลค่าส่วนลดที่ได้รับ (บาท) <span class="text-red-500">*</span></label>
                    <input id="claim-discount-amount" type="number" min="0.01" step="any" inputmode="decimal" value="${esc(draft.amount !== undefined ? draft.amount : (c.total_cost || ''))}" class="${inputCls} font-mono text-right mt-1.5">
                    <p class="text-xs text-ink/70 mt-1">ค่าเริ่มต้น = ต้นทุนรวมของเครื่องที่เคลม (${baht(c.total_cost)}) แก้ได้ถ้าซัพให้ส่วนลดไม่เท่ากัน</p></div>
                <div><div class="flex items-center justify-between gap-2"><label for="claim-discount-po" class="text-ink font-medium text-xs">อ้างอิงใบสั่งซื้อที่จะใช้หักส่วนลด (ไม่บังคับ)</label>
                        <button type="button" id="claim-auto-po" class="${autoBtnCls}">กรอกอัตโนมัติ</button></div>
                    <input id="claim-discount-po" type="text" autocomplete="off" placeholder="เช่น PO-20260101-0001" value="${esc(draft.po || '')}" class="${inputCls} font-mono mt-1.5">
                    <p id="claim-po-hint" class="text-xs text-ink/70 mt-1" aria-live="polite"></p></div>
                <p class="text-xs text-ink/70">ส่วนลดจะแสดงในหน้าสร้างใบสั่งซื้อของซัพรายนี้ตามชนิดที่เลือก (ระบบไม่หักยอดในใบสั่งซื้อให้อัตโนมัติ)</p>`;
            onOk = () => {
                const d = { amount: ($('claim-discount-amount') || {}).value || '', po: (($('claim-discount-po') || {}).value || '').trim(), note: note(),
                    kind: kindFixed ? c.item_kind : ((document.querySelector('input[name="claim-discount-kind"]:checked') || {}).value || 'device') };
                if (!(Number(d.amount) > 0)) return reopen('กรุณาระบุมูลค่าส่วนลดที่ได้รับ', d);
                callClaim(id, 'close', { discount_amount: Number(d.amount), discount_kind: d.kind, claim_type: c.claim_type, po_number: d.po, result_note: d.note }, issueId);
            };
        }

        showConfirm(`ปิดเคลม · ${CLAIM_TYPE_LABEL[c.claim_type] || ''}`,
            `<div class="text-left space-y-3">${fields}${noteBox('หมายเหตุ (ไม่บังคับ)')}</div>`,
            onOk, 'ปิดเคลม', 'success', 'max-w-lg');
        // noteBox วาดหลัง showConfirm เปิด — ใส่ค่าที่กรอกไว้กลับ
        if (draft.note) { const t = $('claim-result-note'); if (t) t.value = draft.note; }

        // ปุ่มกรอกอัตโนมัติ: หมายเหตุ = สรุปใบเคลม, ใบสั่งซื้อ = ใบล่าสุดของซัพที่ยังจ่ายไม่ครบ
        $('claim-auto-note')?.addEventListener('click', () => {
            const t = $('claim-result-note');
            if (!t) return;
            const imeis = c.items.map(it => it.imei).join(', ');
            t.value = `เคลม ${c.claim_no} · ${c.supplier_name || 'ไม่ระบุซัพ'} · ${c.total_qty} ชิ้น (IMEI: ${imeis})`;
            t.focus();
        });
        const fillPo = async (silent) => {
            const inp = $('claim-discount-po');
            if (!inp) return;
            try {
                const res = await authFetch(`${API_BASE_URL}/claims/${encodeURIComponent(id)}/suggest-po`);
                const json = await res.json();
                const hint = $('claim-po-hint');
                if (json.success && json.data && json.data.po_number) {
                    inp.value = json.data.po_number;
                    const d = json.data;
                    if (hint) hint.textContent = d.source === 'item'
                        ? `ใบสั่งซื้อที่นำเครื่องนี้เข้าคลัง (ตรง ${d.matched}/${d.total} เครื่อง) · ${d.payment_status || ''}`
                        : `ไม่พบใบสั่งซื้อของเครื่องนี้ จึงใช้ใบล่าสุดของซัพที่ยังชำระไม่ครบ · ${d.payment_status || ''}`;
                } else {
                    if (hint) hint.textContent = '';
                    if (!silent) showToast('ไม่พบใบสั่งซื้อของสินค้านี้', 'error');
                }
            } catch (err) {
                console.error(err);
                if (!silent) showToast('หาใบสั่งซื้อไม่สำเร็จ', 'error');
            }
        };
        $('claim-auto-po')?.addEventListener('click', () => fillPo(false));
        if (c.claim_type === 'discount' && draft.po === undefined) fillPo(true); // เปิดฟอร์มครั้งแรกเติมให้เลย แก้หรือลบได้
    };

    const confirmRejectClaim = (id, issueId) => showConfirm('ซัพปฏิเสธเคลม',
        `<div class="text-left space-y-3">
            <fieldset class="space-y-2"><legend class="text-ink font-medium text-xs mb-1">เครื่องที่ถูกปฏิเสธ</legend>
                <label class="flex items-center gap-2 text-sm text-ink cursor-pointer"><input type="radio" name="claim-reject-return" value="1" checked class="accent-accent-ink"> คืนเข้าสต็อกสาขาเดิม</label>
                <label class="flex items-center gap-2 text-sm text-ink cursor-pointer"><input type="radio" name="claim-reject-return" value="0" class="accent-accent-ink"> ตัดทิ้ง (ไม่คืนสต็อก)</label></fieldset>
            ${noteBox('เหตุผลที่ซัพปฏิเสธ <span class="text-red-500">*</span>')}</div>`,
        () => {
            const note = (($('claim-result-note') || {}).value || '').trim();
            if (!note) { showToast('กรุณาระบุเหตุผลที่ซัพปฏิเสธเคลม', 'error'); setTimeout(() => confirmRejectClaim(id, issueId), 350); return; } // showConfirm ปิดตัวเองเสมอ จึงเปิดใหม่
            const ret = (document.querySelector('input[name="claim-reject-return"]:checked') || {}).value === '1';
            callClaim(id, 'reject', { result_note: note, return_to_stock: ret }, issueId);
        }, 'บันทึก', 'danger');

    // รายละเอียดใบจ่ายออก (popup) — ข้อมูลหัวใบ + รายการสินค้าจัดกลุ่มตามผู้จัดจำหน่าย
    const openDetail = (id) => {
        const i = _issues.find(x => String(x._id) === String(id));
        const modal = $('stock-issue-detail-modal');
        if (!i || !modal) return;

        $('stock-issue-detail-title').innerHTML = `<i class="fa-solid fa-clock-rotate-left text-accent-ink"></i> ใบจ่ายออก <span class="font-mono text-accent-ink">${esc(i.issue_no)}</span>`;
        const info = (label, val) => `<div><p class="text-xs text-ink/70">${label}</p><p class="text-sm text-ink font-medium">${val}</p></div>`;
        const head = [
            info('วันที่', fmtDateTime(i.createdAt)),
            info('สาขา', esc(i.branch_name || '-')),
            info('ซัพพลายเออร์', esc(supplierNames(i).join(', ') || '-')),
            info('ใบสั่งซื้อ (PO)', (i.po_numbers || []).length ? i.po_numbers.map(n => `<span class="font-mono">${esc(n)}</span>`).join('<br>') : '-'),
            info('สถานะเคลม', claimCell(i)),
            info('ผู้ทำรายการ', esc(i.created_by_name || '-')),
            info('จำนวน', `${i.total_qty || (i.items || []).length} ชิ้น`),
            info('มูลค่าต้นทุนรวม', `<span class="font-mono">${baht(i.total_cost)}</span>`)
        ].join('');
        const groups = groupBySupplier(i.items || []).map(g => {
            const rowsHtml = g.entries.map(({ item: it }) => `<tr>
                <td class="px-4 py-2 text-ink text-sm">${esc(it.product_name)}${it.color_name ? ` <span class="text-xs text-ink/70 ml-2">${colorTag(it.color_name)}</span>` : ''}${it.product_code ? ` <span class="text-xs text-ink/70 font-mono">${esc(it.product_code)}</span>` : ''}</td>
                <td class="px-4 py-2 font-mono text-sm text-ink">${it.imei ? esc(it.imei) : `× ${Number(it.quantity) || 1}`}</td>
                <td class="px-4 py-2 font-mono text-xs text-ink/80">${esc(it.po_number || '-')}</td>
                <td class="px-4 py-2 text-xs ${it.claim_type === 'loss' ? 'text-state-danger-soft' : 'text-ink/80'}">${esc(CLAIM_TYPE_LABEL[it.claim_type] || '-')}</td>
                <td class="px-4 py-2 text-right font-mono text-sm text-ink">${baht(Number(it.cost_price || 0) * Number(it.quantity || 1))}</td></tr>`).join('');
            return `<div class="mb-4 last:mb-0">
                <div class="flex items-center justify-between px-4 py-2">
                    <p class="text-sm font-medium text-accent-ink">${esc(g.name)} <span class="text-xs text-ink/70 font-normal">(${g.entries.length} ชิ้น)</span></p>
                    <p class="text-sm text-ink font-mono">รวม ${baht(g.total)}</p>
                </div>
                <table class="w-full text-left border-collapse"><thead><tr>
                    <th class="px-4 py-2 text-xs font-semibold text-ink/70">สินค้า</th>
                    <th class="px-4 py-2 text-xs font-semibold text-ink/70">IMEI / จำนวน</th>
                    <th class="px-4 py-2 text-xs font-semibold text-ink/70">ใบสั่งซื้อ</th>
                    <th class="px-4 py-2 text-xs font-semibold text-ink/70">กรณีเคลม</th>
                    <th class="px-4 py-2 text-xs font-semibold text-ink/70 text-right">ราคาต้นทุน</th></tr></thead>
                    <tbody class="divide-y divide-divider">${rowsHtml}</tbody></table></div>`;
        }).join('');
        $('stock-issue-detail-body').innerHTML = `
            <div class="grid grid-cols-2 sm:grid-cols-3 gap-4 mb-5">${head}</div>
            <div class="mb-5"><p class="text-xs text-ink/70">หมายเหตุ</p><p class="text-sm text-ink whitespace-pre-line">${esc(i.reason || '-')}</p></div>
            ${claimSection(i)}
            <div class="elev-field bg-field rounded-xl py-2">${groups || '<p class="px-4 py-6 text-center text-ink/50 italic text-sm">ไม่มีรายการสินค้า</p>'}</div>`;

        modal.classList.remove('hidden');
        modal.classList.add('flex');
        requestAnimationFrame(() => {
            modal.classList.remove('opacity-0');
            $('stock-issue-detail-close')?.focus();
        });
    };

    const closeDetail = () => {
        const modal = $('stock-issue-detail-modal');
        if (!modal) return;
        modal.classList.add('opacity-0');
        setTimeout(() => { modal.classList.add('hidden'); modal.classList.remove('flex'); }, 300);
    };

    // ตัวเลือกกรองซัพพลายเออร์ สร้างจากใบจ่ายออกที่โหลดมา (คงค่าที่เลือกไว้ถ้ายังมีอยู่)
    const syncSupplierFilter = () => {
        const sel = $('stock-issue-filter-supplier');
        if (!sel) return;
        const keep = sel.value;
        const names = [...new Set(_issues.flatMap(supplierNames))].sort((a, b) => a.localeCompare(b, 'th'));
        sel.innerHTML = '<option value="">ทุกซัพพลายเออร์</option>' + names.map(n => `<option value="${esc(n)}">${esc(n)}</option>`).join('');
        sel.value = names.includes(keep) ? keep : '';
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
            syncSupplierFilter();
            renderHistory();
        } catch (err) {
            console.error(err);
            if (body) body.innerHTML = `<tr><td colspan="${TABLE_COLS}" class="px-6 py-8 text-center text-state-danger-soft">${esc(err.message || 'เชื่อมต่อเซิร์ฟเวอร์ไม่ได้')}</td></tr>`;
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
    // เลือกกรณีเคลมต่อชิ้น — ยังไม่เลือกขอบแดงเตือน
    const claimSelectHtml = (idx, val) => `<label for="si-claim-${idx}" class="sr-only">กรณีเคลมของรายการที่ ${idx + 1}</label>
        <select id="si-claim-${idx}" data-claim-idx="${idx}" class="px-2 py-1.5 rounded-lg bg-field border ${val ? 'border-line-strong' : 'border-state-danger/60'} text-ink text-xs focus:border-accent-ink focus:outline-none cursor-pointer max-w-[10rem]">
            <option value="">-- เลือกกรณี --</option>
            ${ISSUE_CLAIM_OPTIONS.map(k => `<option value="${k}" ${val === k ? 'selected' : ''}>${esc(CLAIM_TYPE_LABEL[k])}</option>`).join('')}
        </select>`;

    const renderScanned = () => {
        const body = $('stock-issue-scan-body');
        $('stock-issue-scan-count').textContent = `${_scanned.length} รายการ`;
        $('stock-issue-submit-btn').disabled = _submitting || _scanned.length === 0;
        if (!body) return;
        if (_scanned.length === 0) {
            body.innerHTML = '<tr><td colspan="5" class="px-4 py-6 text-center text-ink/50 italic text-sm">ยังไม่มีรายการที่เพิ่ม</td></tr>';
            return;
        }
        const lineCost = (s) => Number(s.cost_price || 0) * Number(s.quantity || 1);
        body.innerHTML = groupBySupplier(_scanned).map(g => `<tr class="bg-panel/40">
            <td colspan="2" class="px-4 py-2 text-sm font-medium text-accent-ink">${esc(g.name)} <span class="text-xs text-ink/70 font-normal">(${g.entries.length} รายการ)</span></td>
            <td colspan="3" class="px-4 py-2 text-sm text-ink font-mono text-right">รวม ${baht(g.total)}</td></tr>`
            + g.entries.map(({ item: s, idx }) => `<tr class="hover:bg-divider transition-colors">
            <td class="px-4 py-3 text-ink text-sm">
                <p class="font-medium">${esc(s.product_name)}</p>
                <p class="text-xs text-ink/70 flex items-center gap-1.5">${s.kind === 'accessory' ? '<span class="px-1.5 py-0.5 rounded bg-line text-[10px]">อุปกรณ์เสริม</span>' : ''}${colorTag(s.color) || ''}${s.color && s.capacity ? ' · ' : ''}${esc(s.capacity || (s.color ? '' : (s.product_code || '-')))}</p>
            </td>
            <td class="px-4 py-3 text-sm">${s.kind === 'accessory'
                ? `<label for="si-qty-${idx}" class="sr-only">จำนวนของ ${esc(s.product_name)}</label>
                   <input id="si-qty-${idx}" data-qty-idx="${idx}" type="number" min="1" max="${Number(s.stock_available) || 1}" step="1" value="${Number(s.quantity) || 1}" inputmode="numeric"
                        class="w-20 px-2 py-1.5 rounded-lg bg-field border border-line-strong text-ink text-sm font-mono text-right focus:border-accent-ink focus:outline-none">
                   <span class="text-xs text-ink/60 block mt-0.5">คงเหลือ ${Number(s.stock_available) || 0}</span>`
                : `<span class="font-mono text-accent-ink">${esc(s.imei)}</span>`}</td>
            <td class="px-4 py-3 text-right font-mono text-sm text-ink">${baht(lineCost(s))}</td>
            <td class="px-4 py-3">${claimSelectHtml(idx, s.claim_type)}</td>
            <td class="px-4 py-3 text-right"><button type="button" data-remove="${idx}" class="text-ink hover:text-state-danger-soft transition-colors p-2" title="นำออก" aria-label="นำ ${esc(s.imei || s.product_name)} ออกจากรายการ"><i class="fa-solid fa-trash"></i></button></td>
        </tr>`).join('')).join('')
            + `<tr class="bg-panel/40"><td colspan="2" class="px-4 py-3 text-sm font-semibold text-ink">มูลค่าต้นทุนรวมทั้งหมด</td>
            <td colspan="3" class="px-4 py-3 text-sm font-semibold text-ink font-mono text-right">${baht(_scanned.reduce((t, s) => t + lineCost(s), 0))}</td></tr>`;
    };

    const getIssueBranchId = () => (canPickBranch() ? $('stock-issue-branch').value : '');

    // สลับประเภทที่กำลังเพิ่ม: เครื่อง (สแกน IMEI) / อุปกรณ์เสริม (ค้นหา + จำนวน)
    const setKind = (kind) => {
        _kind = kind === 'accessory' ? 'accessory' : 'device';
        $('stock-issue-panel-device').classList.toggle('hidden', _kind !== 'device');
        $('stock-issue-panel-accessory').classList.toggle('hidden', _kind !== 'accessory');
        document.querySelectorAll('.stock-issue-kind-btn').forEach(b => {
            const on = b.dataset.kind === _kind;
            b.setAttribute('aria-pressed', String(on));
            b.className = `stock-issue-kind-btn flex-1 py-2.5 rounded-xl text-sm font-bold transition-all flex items-center justify-center gap-2 cursor-pointer ${on ? 'bg-primary text-on-primary' : 'bg-field text-body-muted hover:text-ink'}`;
        });
        (_kind === 'device' ? $('stock-issue-imei') : $('stock-issue-acc-search'))?.focus();
    };

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
            _scanned.push({ ...json.item, kind: 'device', quantity: 1, claim_type: '' });
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

    // ---------- อุปกรณ์เสริม ----------
    const renderAccResults = () => {
        const box = $('stock-issue-acc-results');
        if (!box) return;
        if (_accResults.length === 0) {
            box.innerHTML = '<p class="px-4 py-3 text-xs text-ink/60 italic">ไม่พบอุปกรณ์เสริมที่มีของในสาขานี้</p>';
        } else {
            box.innerHTML = _accResults.map((r, n) => `<button type="button" data-acc-pick="${n}" class="w-full text-left px-4 py-2.5 hover:bg-line transition-colors">
                <p class="text-sm text-ink">${esc(r.product_name)}</p>
                <p class="text-xs text-ink/60">${esc(r.product_code || '-')} · คงเหลือ ${Number(r.stock_available) || 0} ${esc(r.unit_name)} · ${esc(r.supplier_name || 'ไม่ระบุ Supplier')}</p></button>`).join('');
        }
        box.classList.remove('hidden');
    };

    const searchAccessories = async () => {
        const q = ($('stock-issue-acc-search')?.value || '').trim();
        const seq = ++_accSeq;
        try {
            const qs = new URLSearchParams({ q });
            const bid = getIssueBranchId();
            if (bid) qs.set('branch_id', bid);
            const res = await authFetch(`${API_BASE_URL}/stock-issues/accessories?${qs}`);
            const json = await res.json();
            if (seq !== _accSeq) return;
            if (!json.success) { showToast(json.message || 'ค้นหาอุปกรณ์เสริมไม่สำเร็จ', 'error'); return; }
            _accResults = json.data || [];
            renderAccResults();
        } catch (err) {
            console.error(err);
            if (seq === _accSeq) showToast('ไม่สามารถเชื่อมต่อเซิร์ฟเวอร์ได้', 'error');
        }
    };

    const pickAccessory = (n) => {
        const r = _accResults[n];
        if (!r) return;
        _accPicked = r;
        $('stock-issue-acc-search').value = r.product_name;
        $('stock-issue-acc-results').classList.add('hidden');
        $('stock-issue-acc-picked').textContent = `เลือกแล้ว: ${r.product_name} · คงเหลือ ${r.stock_available} ${r.unit_name} · ${r.supplier_name || 'ไม่ระบุ Supplier'}`;
        $('stock-issue-acc-qty').focus();
        $('stock-issue-acc-qty').select();
    };

    const addAccessory = () => {
        if (!_accPicked) { showToast('กรุณาเลือกอุปกรณ์เสริมจากรายการที่ค้นพบ', 'error'); $('stock-issue-acc-search').focus(); return; }
        const qty = Number($('stock-issue-acc-qty').value);
        if (!Number.isInteger(qty) || qty < 1) { showToast('จำนวนต้องเป็นจำนวนเต็มตั้งแต่ 1 ขึ้นไป', 'error'); $('stock-issue-acc-qty').focus(); return; }
        const existing = _scanned.find(s => s.kind === 'accessory' && String(s.product_id) === String(_accPicked.product_id));
        const total = qty + (existing ? existing.quantity : 0);
        if (total > _accPicked.stock_available) {
            showToast(`"${_accPicked.product_name}" มีในสต็อกเพียง ${_accPicked.stock_available} ${_accPicked.unit_name}`, 'error');
            return;
        }
        if (existing) existing.quantity = total; // รายการเดียวกันรวมเป็นแถวเดียว
        else _scanned.push({ ..._accPicked, kind: 'accessory', quantity: qty, claim_type: '' });
        _accPicked = null;
        $('stock-issue-acc-search').value = '';
        $('stock-issue-acc-qty').value = '1';
        $('stock-issue-acc-picked').textContent = 'เลือกสินค้าจากรายการที่ค้นพบ แล้วระบุจำนวน';
        renderScanned();
        $('stock-issue-acc-search').focus();
    };

    const openModal = async () => {
        const modal = $('stock-issue-modal');
        if (!modal) return;
        _scanned = [];
        _submitting = false;
        _accResults = [];
        _accPicked = null;
        $('stock-issue-imei').value = '';
        $('stock-issue-acc-search').value = '';
        $('stock-issue-acc-qty').value = '1';
        $('stock-issue-acc-results').classList.add('hidden');
        $('stock-issue-acc-picked').textContent = 'เลือกสินค้าจากรายการที่ค้นพบ แล้วระบุจำนวน';
        $('stock-issue-claim-all').value = '';
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
            setKind('device');
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
        if (_scanned.length === 0) { showToast('กรุณาเพิ่มรายการสินค้าอย่างน้อย 1 รายการ', 'error'); return; }
        const noClaim = _scanned.findIndex(s => !s.claim_type);
        if (noClaim >= 0) {
            showToast('กรุณาเลือกกรณีเคลมให้ครบทุกรายการ', 'error');
            $(`si-claim-${noClaim}`)?.focus();
            return;
        }
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
                        branch_id: getIssueBranchId() || undefined,
                        reason,
                        items: _scanned.map(s => s.kind === 'accessory'
                            ? { kind: 'accessory', product_id: s.product_id, quantity: s.quantity, claim_type: s.claim_type }
                            : { kind: 'device', imei: s.imei, claim_type: s.claim_type })
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
            `จ่ายออกสินค้า ${_scanned.reduce((t, s) => t + (Number(s.quantity) || 1), 0)} ชิ้นออกจากสต็อก — ย้อนกลับไม่ได้`
            + (_scanned.some(s => s.claim_type !== 'loss') ? '<br><span class="text-xs">ระบบจะสร้างใบเคลมแยกตามผู้จัดจำหน่ายและกรณีเคลมที่เลือกให้อัตโนมัติ</span>' : '')
            + (_scanned.some(s => s.claim_type === 'loss') ? `<br><span class="text-xs text-state-danger-soft">มี ${_scanned.filter(s => s.claim_type === 'loss').length} รายการที่จ่ายออกเปล่า (ขาดทุน) — ไม่เปิดใบเคลม</span>` : ''),
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
            // เลือกกรณีเคลมต่อชิ้น / แก้จำนวนอุปกรณ์เสริม (change = เลือก/พิมพ์เสร็จ ไม่วาดตารางใหม่ทุกตัวอักษร)
            $('stock-issue-scan-body')?.addEventListener('change', (e) => {
                const sel = e.target.closest('[data-claim-idx]');
                if (sel) {
                    const item = _scanned[Number(sel.dataset.claimIdx)];
                    if (item) item.claim_type = sel.value;
                    sel.classList.toggle('border-state-danger/60', !sel.value);
                    sel.classList.toggle('border-line-strong', !!sel.value);
                    return;
                }
                const q = e.target.closest('[data-qty-idx]');
                if (q) {
                    const item = _scanned[Number(q.dataset.qtyIdx)];
                    if (!item) return;
                    const max = Number(item.stock_available) || 1;
                    let v = Math.floor(Number(q.value));
                    if (!Number.isFinite(v) || v < 1) v = 1;
                    if (v > max) { v = max; showToast(`มีในสต็อกเพียง ${max} ${item.unit_name || 'ชิ้น'}`, 'error'); }
                    item.quantity = v;
                    renderScanned();
                }
            });
            $('stock-issue-claim-all')?.addEventListener('change', (e) => {
                if (!e.target.value) return;
                _scanned.forEach(s => { s.claim_type = e.target.value; });
                e.target.value = '';
                renderScanned();
            });
            document.querySelectorAll('.stock-issue-kind-btn').forEach(b => b.addEventListener('click', () => setKind(b.dataset.kind)));
            $('stock-issue-acc-add-btn')?.addEventListener('click', addAccessory);
            $('stock-issue-acc-qty')?.addEventListener('keydown', (e) => {
                if (e.key === 'Enter') { e.preventDefault(); addAccessory(); }
            });
            $('stock-issue-acc-search')?.addEventListener('input', () => {
                _accPicked = null;
                clearTimeout(_accTimer);
                _accTimer = setTimeout(searchAccessories, 250);
            });
            $('stock-issue-acc-search')?.addEventListener('focus', searchAccessories);
            $('stock-issue-acc-results')?.addEventListener('click', (e) => {
                const b = e.target.closest('[data-acc-pick]');
                if (b) pickAccessory(Number(b.dataset.accPick));
            });
            document.addEventListener('click', (e) => {
                // คลิกนอกช่องค้นหา = ปิดรายการผลลัพธ์
                const box = $('stock-issue-acc-results');
                if (box && !box.classList.contains('hidden') && !e.target.closest('#stock-issue-acc-search') && !e.target.closest('#stock-issue-acc-results')) {
                    box.classList.add('hidden');
                }
            });
            $('stock-issue-table-body')?.addEventListener('click', (e) => {
                const b = e.target.closest('[data-detail]');
                if (b) openDetail(b.dataset.detail);
            });
            $('stock-issue-detail-close')?.addEventListener('click', closeDetail);
            $('stock-issue-detail-body')?.addEventListener('click', (e) => {
                const c = e.target.closest('[data-claim-close]');
                const r = e.target.closest('[data-claim-reject]');
                if (c) confirmCloseClaim(c.dataset.claimClose, c.dataset.issue);
                else if (r) confirmRejectClaim(r.dataset.claimReject, r.dataset.issue);
            });
            $('stock-issue-filter-claim')?.addEventListener('change', renderHistory);
            $('stock-issue-detail-modal')?.addEventListener('click', (e) => {
                if (e.target === e.currentTarget) closeDetail(); // คลิกพื้นหลังเพื่อปิด
            });
            document.addEventListener('keydown', (e) => {
                const m = $('stock-issue-detail-modal');
                if (e.key === 'Escape' && m && !m.classList.contains('hidden')) closeDetail();
            });
            $('stock-issue-search-input')?.addEventListener('input', renderHistory);
            $('stock-issue-filter-supplier')?.addEventListener('change', renderHistory);
            $('stock-issue-filter-branch')?.addEventListener('change', renderHistory);
        }
        loadHistory();
    };
})();
