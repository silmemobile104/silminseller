// ประวัติการมัดจำ — ใบมัดจำแต่ละใบจบอย่างไร และใช้ในบิลขายใบไหนเท่าไร (อ่านอย่างเดียว ไม่แก้ข้อมูลใดๆ)
// โหลดแบบ dynamic เฉพาะตอนเปิดหน้า "ประวัติการมัดจำ" ครั้งแรก (ดู switchView case 'deposit-history' ใน script.js)
// ข้อมูลจาก GET /api/deposits/history · พึ่งพา window.authFetch, window.showToast, API_BASE_URL (global จาก script.js)
(function () {
    const PAGE_SIZE = 100;
    const COLS = 9;

    let dhBound = false;
    let dhBranchesLoaded = false;
    let dhRows = [];
    let dhShown = 0;
    let dhTruncated = false;

    const $ = (id) => document.getElementById(id);
    const esc = (s) => String(s == null ? '' : s)
        .replace(/&/g, '&amp;').replace(/</g, '&lt;').replace(/>/g, '&gt;')
        .replace(/"/g, '&quot;').replace(/'/g, '&#39;');
    const money = (n) => '฿' + Number(n || 0).toLocaleString('th-TH', { minimumFractionDigits: 2, maximumFractionDigits: 2 });
    const moneyOrDash = (n) => (Number(n) > 0 ? money(n) : '<span class="text-ink/40">-</span>');
    const fmtDate = (v) => (v ? new Date(v).toLocaleDateString('th-TH') : '-');
    const fmtDateTime = (v) => (v ? new Date(v).toLocaleString('th-TH', { dateStyle: 'short', timeStyle: 'short' }) + ' น.' : '-');

    const stateRow = (message, extra = 'text-ink/50 italic') =>
        `<tr><td colspan="${COLS}" class="px-6 py-8 text-center ${extra}">${message}</td></tr>`;

    // ป้ายผลลัพธ์: จุดสี + พื้น tint 12% (ตามตารางสถานะใน DESIGN.md ข้อ 11.6)
    const OUTCOME_STYLE = {
        'รับเครื่อง': ['bg-state-ok', 'bg-state-ok-tint/[0.12]', 'text-state-ok'],
        'เปลี่ยนเป็นอุปกรณ์เสริม': ['bg-state-ok', 'bg-state-ok-tint/[0.12]', 'text-state-ok'],
        'ยกเลิก (คืนเงิน)': ['bg-state-danger', 'bg-state-danger/[0.12]', 'text-state-danger'],
        'รอดำเนินการ': ['bg-orange-500', 'bg-orange-500/[0.12]', 'text-orange-400'],
        'ยึดมัดจำ': ['bg-ink/40', 'bg-chip/60', 'text-ink'],
        'สำเร็จ (ไม่พบบิลขาย)': ['bg-ink/40', 'bg-chip/60', 'text-ink']
    };
    const outcomeBadge = (outcome) => {
        const [dot, bg, text] = OUTCOME_STYLE[outcome] || OUTCOME_STYLE['ยึดมัดจำ'];
        return `<div class="inline-flex items-center gap-2 px-2.5 py-1 rounded-[0.375rem] ${bg}">
            <div class="w-2 h-2 rounded-full ${dot}"></div>
            <span class="${text} font-medium text-xs">${esc(outcome)}</span>
        </div>`;
    };

    async function loadBranches() {
        if (dhBranchesLoaded) return;
        try {
            const res = await authFetch(`${API_BASE_URL}/branches`);
            const data = await res.json();
            const sel = $('dh-branch');
            if (data.success && sel) {
                sel.innerHTML = '<option value="ALL">ทุกสาขา</option>' + (data.data || [])
                    .map(b => `<option value="${esc(b._id)}">${esc(b.name)}</option>`).join('');
                dhBranchesLoaded = true;
            }
        } catch (e) { /* ใช้ตัวเลือก "ทุกสาขา" ต่อไป */ }
    }

    function params() {
        const p = new URLSearchParams();
        const set = (k, v) => { if (v) p.set(k, v); };
        set('search', ($('dh-search')?.value || '').trim());
        set('startDate', $('dh-start')?.value);
        set('endDate', $('dh-end')?.value);
        const branch = $('dh-branch')?.value;
        if (branch && branch !== 'ALL') p.set('branch_id', branch);
        const outcome = $('dh-outcome')?.value;
        if (outcome && outcome !== 'ALL') p.set('outcome', outcome);
        p.set('scope', $('dh-scope')?.value === 'all' ? 'all' : 'closed');
        return p;
    }

    function renderSummary(s) {
        const set = (id, v) => { const el = $(id); if (el) el.textContent = money(v); };
        set('dh-sum-received', s.received);
        set('dh-sum-applied', s.applied);
        set('dh-sum-excess', s.excess);
        set('dh-sum-forfeited', s.forfeited);
        set('dh-sum-refunded', s.refunded);
    }

    function rowHtml(r) {
        const income = (Number(r.excess_amount) || 0) + (Number(r.forfeited_amount) || 0);
        const reason = r.reason ? `<p class="text-xs text-ink/60 mt-1 max-w-[16rem] truncate" title="${esc(r.reason)}">เหตุผล: ${esc(r.reason)}</p>` : '';
        const bill = r.bill_number
            ? `<span class="font-mono font-semibold text-accent-ink">${esc(r.bill_number)}</span>${r.bill_cancelled ? '<p class="text-xs text-state-danger mt-1">บิลถูกยกเลิกแล้ว</p>' : ''}`
            : '<span class="text-ink/40">-</span>';
        const closed = r.closed_at
            ? `<p class="text-ink">${fmtDateTime(r.closed_at)}</p><p class="text-xs text-ink/70 mt-0.5">${esc(r.closed_by_name || '-')}</p>`
            : `<p class="text-xs text-ink/70">รับมัดจำโดย ${esc(r.created_by_name || '-')}</p>`;
        return `<tr class="hover:bg-divider transition-colors">
            <td class="px-6 py-4">
                <p class="font-mono font-semibold text-accent-ink">${esc(r.deposit_number)}</p>
                <p class="text-xs text-ink/70 mt-0.5">รับ ${fmtDate(r.created_at)}${r.branch_name ? ' · ' + esc(r.branch_name) : ''}</p>
            </td>
            <td class="px-6 py-4">
                <p class="font-medium text-ink">${esc(r.customer_name)} <span class="font-mono text-xs text-ink/70">${esc(r.customer_phone)}</span></p>
                <p class="text-xs text-ink/70 mt-0.5">${esc(r.product_name)}</p>
            </td>
            <td class="px-6 py-4 text-right font-mono text-ink">${money(r.deposit_amount)}</td>
            <td class="px-6 py-4">${outcomeBadge(r.outcome)}${reason}</td>
            <td class="px-6 py-4">${bill}</td>
            <td class="px-6 py-4 text-right font-mono text-ink">${moneyOrDash(r.applied_amount)}</td>
            <td class="px-6 py-4 text-right font-mono ${income > 0 ? 'text-state-ok' : 'text-ink'}">${moneyOrDash(income)}</td>
            <td class="px-6 py-4 text-right font-mono ${r.refunded_amount > 0 ? 'text-state-danger' : 'text-ink'}">${moneyOrDash(r.refunded_amount)}</td>
            <td class="px-6 py-4">${closed}</td>
        </tr>`;
    }

    function renderRows() {
        const body = $('dh-table-body');
        if (!body) return;
        if (!dhRows.length) {
            body.innerHTML = stateRow('ไม่พบรายการมัดจำตามเงื่อนไขที่เลือก');
            $('dh-more-wrap')?.classList.add('hidden');
            return;
        }
        body.innerHTML = dhRows.slice(0, dhShown).map(rowHtml).join('');
        $('dh-more-wrap')?.classList.toggle('hidden', dhShown >= dhRows.length);
    }

    async function loadDepositHistory() {
        const body = $('dh-table-body');
        const count = $('dh-result-count');
        if (body) body.innerHTML = stateRow('กำลังโหลดข้อมูล...');
        if (count) count.textContent = '';
        try {
            const res = await authFetch(`${API_BASE_URL}/deposits/history?${params()}`);
            const data = await res.json();
            if (!data.success) throw new Error(data.message || 'โหลดประวัติการมัดจำไม่สำเร็จ');
            dhRows = data.data || [];
            dhShown = Math.min(PAGE_SIZE, dhRows.length);
            dhTruncated = !!data.truncated;
            renderSummary(data.summary || {});
            renderRows();
            if (count) {
                count.textContent = `พบ ${dhRows.length.toLocaleString('th-TH')} ใบ`
                    + (dhTruncated ? ' (แสดงสูงสุด 1,000 ใบล่าสุด — จำกัดช่วงวันที่เพื่อดูใบอื่น)' : '');
            }
        } catch (e) {
            dhRows = [];
            renderSummary({});
            if (body) body.innerHTML = stateRow(`โหลดประวัติการมัดจำไม่สำเร็จ: ${esc(e.message)}`, 'text-state-danger');
            $('dh-more-wrap')?.classList.add('hidden');
        }
    }

    function initDepositHistory() {
        if (!dhBound) {
            dhBound = true; // HTML ถูกแทรกครั้งเดียว แต่ init ถูกเรียกทุกครั้งที่เข้าหน้า
            $('btn-dh-load')?.addEventListener('click', loadDepositHistory);
            $('btn-dh-refresh')?.addEventListener('click', loadDepositHistory);
            $('dh-search')?.addEventListener('keydown', (e) => { if (e.key === 'Enter') loadDepositHistory(); });
            $('btn-dh-more')?.addEventListener('click', () => {
                dhShown = Math.min(dhShown + PAGE_SIZE, dhRows.length);
                renderRows();
            });
        }
        loadBranches();
        return loadDepositHistory();
    }

    window.initDepositHistory = initDepositHistory;
})();
