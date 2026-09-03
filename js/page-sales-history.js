// Sales History + Daily Summary + Transaction Detail Modal (ประวัติการขาย + สรุปยอดขายรายวัน + โมดัลรายละเอียดรายการขาย)
// แยกออกมาจาก script.js — โหลดแบบ dynamic เฉพาะตอนเปิดหน้า "ประวัติการขาย", "สรุปยอดขายรายวัน" หรือ "เช็คประกัน" ครั้งแรกเท่านั้น
// (หน้าเช็คประกันก็ต้องพึ่งโมดัลนี้ผ่าน window.viewTransactionDetails ด้วย เพราะกดดูใบเสร็จจากหน้านั้นได้)
// พึ่งพา window.authFetch, window.showToast, window.showPrompt, window.openCheckoutSuccessModal,
// window.ensureMasterDataLoaded, window.fetchProducts, API_BASE_URL (global จาก script.js)
(function () {
    // สีถูกใส่ลงในสตริง SVG ตอนสร้าง จึงตามธีมเองไม่ได้ ต้องอ่านโทเคนตอนวาด
    const shThemeColor = (name, fallback) => {
        const v = getComputedStyle(document.documentElement).getPropertyValue("--color-" + name).trim();
        return v || fallback;
    };
    // DOM elements ที่หน้านี้ใช้ (ดึงเองแยกจาก core เพราะ const เดิมอยู่คนละไฟล์กันแล้ว)
    const salesHistorySearch = document.getElementById('sales-history-search');
    const salesHistoryDate = document.getElementById('sales-history-date');
    const salesHistoryBranch = document.getElementById('sales-history-branch');
    const salesHistoryTableBody = document.getElementById('sales-history-table-body');

    // แถบชิปตัวกรอง + ตัวนับผลลัพธ์ + พาเนลกรองละเอียด (DESIGN.md ข้อ 11.5 / 11.8)
    const salesHistoryActiveFilters = document.getElementById('sales-history-active-filters');
    const salesHistoryResultCount = document.getElementById('sales-history-result-count');
    const salesHistoryFilterPanel = document.getElementById('sales-history-filter-panel');
    const salesHistoryFilterPanelContent = document.getElementById('sales-history-filter-panel-content');
    const btnSalesHistoryFilter = document.getElementById('btn-sales-history-filter');
    const btnSalesHistoryFilterText = document.getElementById('btn-sales-history-filter-text');
    const btnSalesHistoryFilterClose = document.getElementById('btn-sales-history-filter-close');
    const btnSalesHistoryFilterApply = document.getElementById('btn-sales-history-filter-apply');
    const btnSalesHistoryFilterReset = document.getElementById('btn-sales-history-filter-reset');

    // ตัวกรองที่ย้ายเข้าไปอยู่ในพาเนลละเอียด
    const salesHistoryEmployee = document.getElementById('sales-history-employee');
    const salesHistoryPaymentType = document.getElementById('sales-history-payment-type');
    const salesHistoryStatus = document.getElementById('sales-history-status');
    const salesHistoryStartDate = document.getElementById('sales-history-start-date');
    const salesHistoryEndDate = document.getElementById('sales-history-end-date');

    const SALES_HISTORY_COLS = 7;
    const transactionDetailModal = document.getElementById('modal-transaction-details');
    const closeTransactionDetailBtn = document.getElementById('close-transaction-detail-btn');
    const transactionDetailReceipt = document.getElementById('transaction-detail-receipt');
    const transactionDetailBranch = document.getElementById('transaction-detail-branch');
    const transactionDetailEmployee = document.getElementById('transaction-detail-employee');
    const transactionDetailDate = document.getElementById('transaction-detail-date');
    const transactionDetailPayment = document.getElementById('transaction-detail-payment');
    const transactionDetailDownpaymentSection = document.getElementById('transaction-detail-downpayment-section');
    const transactionDetailDownpayment = document.getElementById('transaction-detail-downpayment');
    const transactionDetailBalance = document.getElementById('transaction-detail-balance');
    const transactionDetailItems = document.getElementById('transaction-detail-items');
    const transactionDetailTotal = document.getElementById('transaction-detail-total');
    const transactionDetailMember = document.getElementById('transaction-detail-member');
    const transactionDetailPaymentBreakdown = document.getElementById('transaction-detail-payment-breakdown');
    const transactionDetailFinanceInfo = document.getElementById('transaction-detail-finance-info');
    const transactionDetailFinanceCompany = document.getElementById('transaction-detail-finance-company');
    const btnReprintReceipt = document.getElementById('btn-reprint-receipt');
    const btnCancelTransaction = document.getElementById('btn-cancel-transaction');
    const transactionCancelledAlert = document.getElementById('transaction-cancelled-alert');
    const transactionCancelledReason = document.getElementById('transaction-cancelled-reason');
    const transactionCancelledBy = document.getElementById('transaction-cancelled-by');
    const transactionCancelledAt = document.getElementById('transaction-cancelled-at');

    // ==========================================
    // Sales History (ประวัติการขาย)
    // ==========================================

    let currentTransaction = null;

    const loadSalesHistory = async () => {
        // ชิปต้องอัปเดตทันทีที่ผู้ใช้เปลี่ยนตัวกรอง ไม่ต้องรอ API ตอบ
        renderSalesHistoryChips();
        if (salesHistoryResultCount) salesHistoryResultCount.textContent = '';
        renderSalesHistorySkeleton();

        try {
            // Build query parameters
            const params = new URLSearchParams();
            const searchValue = salesHistorySearch ? salesHistorySearch.value.trim() : '';
            const dateValue = salesHistoryDate ? salesHistoryDate.value : '';
            const branchValue = salesHistoryBranch ? salesHistoryBranch.value : '';

            // Advanced filters
            const empEl = document.getElementById('sales-history-employee');
            const payEl = document.getElementById('sales-history-payment-type');
            const statEl = document.getElementById('sales-history-status');
            const startEl = document.getElementById('sales-history-start-date');
            const endEl = document.getElementById('sales-history-end-date');

            const employeeValue = empEl ? empEl.value : '';
            const paymentValue = payEl ? payEl.value : '';
            const statusValue = statEl ? statEl.value : '';
            const startDateValue = startEl ? startEl.value : '';
            const endDateValue = endEl ? endEl.value : '';

            if (searchValue) params.append('search', searchValue);
            if (dateValue) params.append('date', dateValue);
            if (branchValue) params.append('branch_id', branchValue);
            if (employeeValue) params.append('employee_id', employeeValue);
            if (paymentValue) params.append('payment_type', paymentValue);
            if (statusValue) params.append('status', statusValue);
            if (startDateValue) params.append('startDate', startDateValue);
            if (endDateValue) params.append('endDate', endDateValue);

            const response = await authFetch(`${API_BASE_URL}/transactions?${params.toString()}`);
            const result = await response.json();

            if (result.success) {
                renderSalesHistoryTable(result.data);
            } else {
                if (salesHistoryTableBody) salesHistoryTableBody.innerHTML = salesHistoryStateRow('เกิดข้อผิดพลาดในการดึงข้อมูล', 'text-red-400');
                if (salesHistoryResultCount) salesHistoryResultCount.textContent = '';
                showToast('เกิดข้อผิดพลาดในการดึงข้อมูล: ' + result.message, 'error');
            }
        } catch (error) {
            console.error('Error loading sales history:', error);
            if (salesHistoryTableBody) salesHistoryTableBody.innerHTML = salesHistoryStateRow('เกิดข้อผิดพลาดในการดึงข้อมูล', 'text-red-400');
            if (salesHistoryResultCount) salesHistoryResultCount.textContent = '';
            showToast('เกิดข้อผิดพลาดในการดึงข้อมูล', 'error');
        }
    };
    window.loadSalesHistory = loadSalesHistory;

    // Load Branches for Sales History Filter
    async function loadBranchesForSalesHistory() {
        if (!salesHistoryBranch) return;

        console.log('[SALES-HISTORY] Loading branches for filter');

        try {
            const response = await authFetch(`${API_BASE_URL}/branches`);
            const result = await response.json();

            console.log('[SALES-HISTORY] Branches API response:', result);

            if (result.success && result.data) {
                salesHistoryBranch.innerHTML = '<option value="">ทุกสาขา</option>';

                result.data.forEach(branch => {
                    const option = document.createElement('option');
                    option.value = branch._id;
                    option.textContent = branch.name;
                    salesHistoryBranch.appendChild(option);
                });
            } else {
                console.error('[SALES-HISTORY] Failed to load branches:', result.message);
            }
        } catch (err) {
            console.error('[SALES-HISTORY] Error loading branches:', err);
        }
    }
    window.loadBranchesForSalesHistory = loadBranchesForSalesHistory;

    // Load Employees for Sales History Filter
    async function loadEmployeesForSalesHistory() {
        const salesHistoryEmployee = document.getElementById('sales-history-employee');
        if (!salesHistoryEmployee) return;

        try {
            const response = await authFetch(`${API_BASE_URL}/employees`);
            const result = await response.json();

            if (result.success && result.data) {
                salesHistoryEmployee.innerHTML = '<option value="">ทุกคน</option>';

                result.data.forEach(emp => {
                    const option = document.createElement('option');
                    option.value = emp._id;
                    option.textContent = emp.name;
                    salesHistoryEmployee.appendChild(option);
                });
            } else {
                console.error('[SALES-HISTORY] Failed to load employees:', result.message);
            }
        } catch (err) {
            console.error('[SALES-HISTORY] Error loading employees:', err);
        }
    }
    window.loadEmployeesForSalesHistory = loadEmployeesForSalesHistory;

    // ==========================================
    // สรุปยอดขายรายวัน (#daily-summary)
    // ใช้ภาษาภาพชุดเดียวกับหน้าแดชบอร์ดผู้บริหาร — การ์ดตัวเลข + โดนัท + ตารางแบบข้อ 11.6
    //
    // ⚠️ ตัวเลขทุกตัวมาจาก /api/sales/daily-summary ที่คำนวณจากบิลจริงของวันนี้เท่านั้น
    //    ส่วนที่แยกตามช่องทางชำระ/รายพนักงาน คิดจาก bills ที่ API ส่งมา ไม่ได้ประมาณค่าเอง
    // ==========================================
    const dsNf = new Intl.NumberFormat('th-TH', { minimumFractionDigits: 0, maximumFractionDigits: 0 });
    const dsBaht = (n) => `฿${dsNf.format(Math.round(n || 0))}`;
    const dsNum = (n) => dsNf.format(Math.round(n || 0));
    const dsEsc = (s) => String(s == null ? '' : s)
        .replace(/&/g, '&amp;').replace(/</g, '&lt;').replace(/>/g, '&gt;')
        .replace(/"/g, '&quot;').replace(/'/g, '&#39;');

    // สีช่องทางชำระ — ใช้โทนเดียวกับกราฟหน้าแดชบอร์ด
    const DS_PAY_COLOR = { 'ซื้อสด': '#20D500', 'จัดไฟแนนซ์': '#FFE169' };
    const DS_FALLBACK_COLORS = ['#0A84FF', '#A855F7', '#FF9F0A', '#8E8E93'];

    const dsKpiCard = (icon, color, label, value, extraHtml) => `
        <div class="bg-panel/40 rounded-2xl shadow-lg backdrop-blur-sm p-5 flex items-start gap-4">
            <div class="w-11 h-11 rounded-full flex items-center justify-center shrink-0"
                 style="color:${color};background-color:${color}1F;">
                <i class="fa-solid ${icon} text-lg"></i>
            </div>
            <div class="min-w-0 flex-1">
                <p class="text-xs text-ink/70 truncate">${dsEsc(label)}</p>
                <p class="text-2xl font-semibold text-ink font-mono mt-0.5 truncate">${value}</p>
                ${extraHtml || ''}
            </div>
        </div>`;

    const dsSkelBar = (w) => `<div class="h-3.5 ${w} rounded-full bg-skeleton animate-pulse"></div>`;

    const dsRenderSkeletons = () => {
        const grid = document.getElementById('daily-kpi-grid');
        if (grid && !grid.children.length) {
            grid.innerHTML = Array.from({ length: 5 }).map(() => `
                <div class="bg-panel/40 rounded-2xl shadow-lg backdrop-blur-sm p-5 flex items-start gap-4">
                    <div class="w-11 h-11 rounded-full bg-skeleton animate-pulse shrink-0"></div>
                    <div class="flex-1 space-y-2">${dsSkelBar('w-20')}${dsSkelBar('w-28 h-5')}</div>
                </div>`).join('');
        }
        [['daily-employee-tbody', 4], ['daily-summary-table-body', 6]].forEach(([id, cols]) => {
            const tb = document.getElementById(id);
            if (tb && !tb.children.length) {
                tb.innerHTML = Array.from({ length: 4 }).map(() =>
                    `<tr>${Array.from({ length: cols }).map(() =>
                        `<td class="px-6 py-4">${dsSkelBar('w-full')}</td>`).join('')}</tr>`).join('');
            }
        });
    };

    const dsStateRow = (cols, msg, cls = 'text-ink/50 italic') =>
        `<tr><td colspan="${cols}" class="px-6 py-8 text-center ${cls}">${dsEsc(msg)}</td></tr>`;

    // โหลดไม่สำเร็จ — ล้างแถวโครงร่างแล้วบอกสาเหตุ ไม่ปล่อยให้กระพริบค้าง
    const dsRenderError = (message) => {
        const msg = dsEsc(message);
        const grid = document.getElementById('daily-kpi-grid');
        if (grid) grid.innerHTML = `
            <div class="col-span-full bg-state-danger/[0.12] rounded-2xl px-5 py-4 flex items-center gap-3">
                <i class="fa-solid fa-triangle-exclamation text-state-danger"></i>
                <p class="text-sm text-state-danger font-medium">${msg}</p>
            </div>`;
        [['daily-employee-tbody', 4], ['daily-summary-table-body', 6]].forEach(([id, cols]) => {
            const tb = document.getElementById(id);
            if (tb) tb.innerHTML = `<tr><td colspan="${cols}"
                class="px-6 py-8 text-center text-ink/50 italic">${msg}</td></tr>`;
        });
        const pay = document.getElementById('daily-payment-body');
        if (pay) pay.innerHTML = `<p class="py-12 text-center text-ink/50 italic">${msg}</p>`;
        const cnt = document.getElementById('daily-bill-count');
        if (cnt) cnt.textContent = '';
    };

    // โดนัทสัดส่วน — สูตรเดียวกับการ์ดหมวดหมู่สินค้าในหน้าแดชบอร์ด
    const dsRenderPaymentMix = (bills) => {
        const host = document.getElementById('daily-payment-body');
        if (!host) return;

        if (!bills.length) {
            host.innerHTML = `<p class="py-12 text-center text-ink/50 italic">ยังไม่มีบิลขายวันนี้</p>`;
            return;
        }

        const byPay = new Map();
        bills.forEach(t => {
            const key = t.payment_type || t.payment_method || 'ไม่ระบุ';
            if (!byPay.has(key)) byPay.set(key, { label: key, value: 0, count: 0 });
            const r = byPay.get(key);
            r.value += t.total_amount || 0;
            r.count += 1;
        });

        let fb = 0;
        const slices = [...byPay.values()]
            .sort((a, b) => b.value - a.value)
            .map(s => ({ ...s, color: DS_PAY_COLOR[s.label] || DS_FALLBACK_COLORS[fb++ % DS_FALLBACK_COLORS.length] }));
        const total = slices.reduce((s, r) => s + r.value, 0);

        const R = 58, SW = 20, C = 2 * Math.PI * R;
        let offset = 0;
        const arcs = total > 0 ? slices.map(s => {
            const len = (s.value / total) * C;
            const seg = `<circle cx="80" cy="80" r="${R}" fill="none" stroke="${s.color}"
                stroke-width="${SW}" stroke-dasharray="${len} ${C - len}"
                stroke-dashoffset="${-offset}" transform="rotate(-90 80 80)" stroke-linecap="butt" />`;
            offset += len;
            return seg;
        }).join('') : '';

        host.innerHTML = `
            <div class="flex flex-col items-center gap-5">
                <div class="relative shrink-0">
                    <svg width="160" height="160" viewBox="0 0 160 160" role="img"
                         aria-label="สัดส่วนยอดขายวันนี้แยกตามช่องทางชำระเงิน">
                        <circle cx="80" cy="80" r="${R}" fill="none" stroke="${shThemeColor('ink', '#FFFFFF')}"
                                stroke-opacity="0.08" stroke-width="${SW}" />
                        ${arcs}
                    </svg>
                    <div class="absolute inset-0 flex flex-col items-center justify-center pointer-events-none">
                        <span class="text-[11px] text-ink/70">ยอดขายรวม</span>
                        <span class="text-base font-semibold text-ink font-mono">${dsNum(total)}</span>
                    </div>
                </div>
                <div class="w-full space-y-3">
                    ${slices.map(s => `
                        <div class="flex items-start gap-2.5">
                            <span class="w-3 h-3 rounded-full shrink-0 mt-1" style="background:${s.color}"></span>
                            <div class="min-w-0 flex-1">
                                <p class="text-sm text-ink">${dsEsc(s.label)}</p>
                                <p class="text-xs text-ink/70 font-mono">
                                    ${total ? ((s.value / total) * 100).toFixed(1) : '0.0'}% ·
                                    ${dsBaht(s.value)} · ${dsNum(s.count)} บิล</p>
                            </div>
                        </div>`).join('')}
                </div>
            </div>`;
    };

    const dsRenderEmployeeTable = (bills) => {
        const tbody = document.getElementById('daily-employee-tbody');
        if (!tbody) return;

        if (!bills.length) { tbody.innerHTML = dsStateRow(4, 'ยังไม่มีบิลขายวันนี้'); return; }

        const byEmp = new Map();
        bills.forEach(t => {
            const name = t.employee_id && t.employee_id.name ? t.employee_id.name : 'ไม่ระบุพนักงาน';
            if (!byEmp.has(name)) byEmp.set(name, { name, sales: 0, bills: 0, devices: 0 });
            const r = byEmp.get(name);
            r.sales += t.total_amount || 0;
            r.bills += 1;
            r.devices += t.devices_count || 0;
        });

        tbody.innerHTML = [...byEmp.values()]
            .sort((a, b) => b.sales - a.sales)
            .map(r => `
                <tr class="hover:bg-divider transition-colors">
                    <td class="px-6 py-3.5 text-ink font-medium">${dsEsc(r.name)}</td>
                    <td class="px-6 py-3.5 text-center text-ink">${dsNum(r.bills)}</td>
                    <td class="px-6 py-3.5 text-center text-ink">${dsNum(r.devices)}</td>
                    <td class="px-6 py-3.5 text-right text-ink font-mono">${dsBaht(r.sales)}</td>
                </tr>`).join('');
    };

    const dsRenderBills = (bills) => {
        const tbody = document.getElementById('daily-summary-table-body');
        const countEl = document.getElementById('daily-bill-count');
        if (countEl) countEl.textContent = bills.length ? `ทั้งหมด ${dsNum(bills.length)} บิล` : '';
        if (!tbody) return;

        if (!bills.length) { tbody.innerHTML = dsStateRow(6, 'ไม่มีบิลขายสำหรับวันนี้'); return; }

        tbody.innerHTML = bills.map(txn => {
            const timeStr = new Date(txn.created_at).toLocaleTimeString('th-TH',
                { hour: '2-digit', minute: '2-digit' });
            const memberName = txn.member_id
                ? `${txn.member_id.first_name || ''} ${txn.member_id.last_name || ''}`.trim() || 'ลูกค้าทั่วไป'
                : 'ลูกค้าทั่วไป';
            const empName = txn.employee_id && txn.employee_id.name ? txn.employee_id.name : '-';
            const payType = txn.payment_type || txn.payment_method || '-';
            const payColor = DS_PAY_COLOR[payType] || '#8E8E93';

            return `
            <tr class="hover:bg-divider transition-colors">
                <td class="px-6 py-4 text-ink/70 font-mono">${timeStr}</td>
                <td class="px-6 py-4"><span class="font-mono font-semibold text-accent-ink">${dsEsc(txn.receipt_number)}</span></td>
                <td class="px-6 py-4">
                    <p class="font-medium text-ink">${dsEsc(empName)}</p>
                    <p class="text-xs text-ink/70 mt-0.5">${dsEsc(memberName)}</p>
                </td>
                <td class="px-6 py-4">
                    <div class="inline-flex items-center gap-2 px-2.5 py-1 rounded-[0.375rem]"
                         style="background-color:${payColor}1F;">
                        <div class="w-2 h-2 rounded-full" style="background-color:${payColor}"></div>
                        <span class="font-medium text-xs" style="color:${payColor}">${dsEsc(payType)}</span>
                    </div>
                </td>
                <td class="px-6 py-4 text-right text-ink font-mono">${dsBaht(txn.total_amount)}</td>
                <td class="px-6 py-4 text-right">
                    <button type="button" class="view-daily-txn-btn text-ink hover:text-accent-ink transition-colors p-2"
                        title="ดูรายละเอียดบิล" aria-label="ดูรายละเอียดบิล ${dsEsc(txn.receipt_number)}"
                        data-id="${dsEsc(txn._id)}">
                        <i class="fa-solid fa-eye"></i>
                    </button>
                </td>
            </tr>`;
        }).join('');

        tbody.querySelectorAll('.view-daily-txn-btn').forEach(btn => {
            btn.addEventListener('click', () => viewTransactionDetails(btn.dataset.id));
        });
    };

    const loadDailySummary = async () => {
        dsRenderSkeletons();
        try {
            const response = await authFetch(`${API_BASE_URL}/sales/daily-summary`);
            const result = await response.json();

            if (!result.success || !result.data) {
                dsRenderError(result.message || 'ดึงข้อมูลสรุปยอดขายรายวันไม่สำเร็จ');
                return;
            }

            const data = result.data;
            const bills = data.bills || [];

            const dateEl = document.getElementById('daily-summary-date');
            if (dateEl) dateEl.textContent = new Date().toLocaleDateString('th-TH',
                { weekday: 'long', day: 'numeric', month: 'long', year: 'numeric' });

            const salesCash = data.cash_received || 0;
            const outCash = data.cash_disbursed || 0;
            const netCash = salesCash - outCash;

            const grid = document.getElementById('daily-kpi-grid');
            if (grid) {
                grid.innerHTML = [
                    dsKpiCard('fa-baht-sign', '#FFE169', 'ยอดขายรวม', dsBaht(data.total_sales),
                        `<p class="text-xs text-ink/50 mt-1">รวมทุกช่องทางชำระ</p>`),
                    dsKpiCard('fa-wallet', '#20D500', 'เงินสดคงเหลือหน้าร้าน (สุทธิ)', dsBaht(netCash), `
                        <p class="text-xs mt-1 flex items-center gap-1 text-ink/70">
                            <span class="text-state-ok">รับ ${dsBaht(salesCash)}</span> ·
                            <span class="text-state-danger">จ่าย ${dsBaht(outCash)}</span>
                        </p>`),
                    dsKpiCard('fa-hand-holding-dollar', '#0A84FF', 'เงินดาวน์ไฟแนนซ์',
                        dsBaht(data.finance_downpayment),
                        `<p class="text-xs text-ink/50 mt-1">ยอดรวมเงินดาวน์วันนี้</p>`),
                    dsKpiCard('fa-mobile-screen', '#A855F7', 'เครื่องที่ขายได้',
                        `${dsNum(data.devices_sold)}`,
                        `<p class="text-xs text-ink/50 mt-1">นับเฉพาะสินค้าหน่วย "เครื่อง"</p>`),
                    dsKpiCard('fa-receipt', '#FF9F0A', 'จำนวนบิลขาย', dsNum(bills.length),
                        `<p class="text-xs text-ink/50 mt-1">ไม่รวมบิลที่ยกเลิกแล้ว</p>`)
                ].join('');
            }

            dsRenderPaymentMix(bills);
            dsRenderEmployeeTable(bills);
            dsRenderBills(bills);

        } catch (error) {
            console.error('Error loading daily sales summary:', error);
            // เซสชั่นหมดอายุ: script.js เด้งไปหน้าล็อกอินทับอยู่แล้ว แต่ยังต้องล้างโครงร่างทิ้ง
            const expired = String(error && error.message || '').includes('เซสชั่นหมดอายุ');
            dsRenderError(expired
                ? 'เซสชั่นหมดอายุ กรุณาเข้าสู่ระบบใหม่'
                : 'เชื่อมต่อเซิร์ฟเวอร์ไม่ได้ กรุณาลองใหม่อีกครั้ง');
        }
    };
    window.loadDailySummary = loadDailySummary;

    // Bind daily summary refresh button
    const btnRefreshDaily = document.getElementById('btn-refresh-daily-summary');
    if (btnRefreshDaily) {
        btnRefreshDaily.addEventListener('click', loadDailySummary);
    }

    // ==========================================
    // ชิ้นส่วน UI ที่ใช้ซ้ำ — เดินตามแบบแปลนหน้า #stock ใน DESIGN.md ข้อ 11.5 - 11.7
    // ==========================================

    // แถวโครงร่างระหว่างรอข้อมูล — ต้องเรียกก่อน await เสมอ ไม่ปล่อยตารางว่าง (ข้อ 11.7)
    const renderSalesHistorySkeleton = (rowCount = 6) => {
        if (!salesHistoryTableBody) return;
        const bar = (w) => `<div class="h-3.5 ${w} rounded-full bg-skeleton animate-pulse"></div>`;
        const twoLine = (a, b) => `<div class="space-y-2">${bar(a)}${bar(b)}</div>`;
        let html = '';
        for (let i = 0; i < rowCount; i++) {
            html += `
                <tr>
                    <td class="px-6 py-4">${twoLine('w-28', 'w-24')}</td>
                    <td class="px-6 py-4">${twoLine('w-24', 'w-20')}</td>
                    <td class="px-6 py-4">${twoLine('w-32', 'w-24')}</td>
                    <td class="px-6 py-4">${bar('w-20 ml-auto')}</td>
                    <td class="px-6 py-4">${bar('w-16')}</td>
                    <td class="px-6 py-4">${bar('w-20')}</td>
                    <td class="px-6 py-4"><div class="w-8 h-8 rounded-[0.375rem] bg-skeleton animate-pulse ml-auto"></div></td>
                </tr>
            `;
        }
        salesHistoryTableBody.innerHTML = html;
    };

    const salesHistoryStateRow = (message, extraClass = 'text-ink/50 italic') =>
        `<tr><td colspan="${SALES_HISTORY_COLS}" class="px-6 py-8 text-center ${extraClass}">${message}</td></tr>`;

    // ป้ายสถานะ: จุดสี + พื้น tint 12% ตามตารางสถานะใน DESIGN.md ข้อ 11.6
    const salesHistoryStatusBadge = (status) => {
        const cancelled = status === 'ยกเลิกแล้ว';
        const dot = cancelled ? 'bg-state-danger' : 'bg-state-ok';
        const bg = cancelled ? 'bg-state-danger/[0.12]' : 'bg-state-ok-tint/[0.12]';
        const text = cancelled ? 'text-state-danger' : 'text-state-ok';
        return `
            <div class="inline-flex items-center gap-2 px-2.5 py-1 rounded-[0.375rem] ${bg}">
                <div class="w-2 h-2 rounded-full ${dot}"></div>
                <span class="${text} font-medium text-xs">${status || 'เสร็จสิ้น'}</span>
            </div>
        `;
    };

    // เซลล์สองบรรทัด: บรรทัดหลัก + คำบรรยายรอง (สูตร "ชื่อ + คำบรรยาย" ข้อ 11.6)
    const twoLineCell = (main, sub) => `
        <div>
            <p class="font-medium text-ink">${main}</p>
            <p class="text-xs text-ink/70 mt-0.5">${sub}</p>
        </div>
    `;

    const selectedOptionText = (el) => {
        if (!el) return '';
        const opt = el.options[el.selectedIndex];
        return opt ? opt.textContent.trim() : '';
    };

    // นับเฉพาะตัวกรองที่อยู่ในพาเนลละเอียด — ไปโชว์บนปุ่ม "เพิ่มเติม (n)"
    const updateSalesHistoryFilterBadge = () => {
        if (!btnSalesHistoryFilterText) return;
        let n = 0;
        if (salesHistoryStartDate && salesHistoryStartDate.value) n++;
        if (salesHistoryEndDate && salesHistoryEndDate.value) n++;
        if (salesHistoryEmployee && salesHistoryEmployee.value) n++;
        if (salesHistoryPaymentType && salesHistoryPaymentType.value) n++;
        if (salesHistoryStatus && salesHistoryStatus.value) n++;
        btnSalesHistoryFilterText.textContent = n > 0 ? `เพิ่มเติม (${n})` : 'เพิ่มเติม';
    };

    const renderSalesHistoryChips = () => {
        if (!salesHistoryActiveFilters) return;
        salesHistoryActiveFilters.innerHTML = '';

        const addChip = (label, onRemove) => {
            const chip = document.createElement('button');
            chip.type = 'button';
            chip.className = 'elev-card px-4 py-2.5 rounded-xl bg-panel/40 text-ink text-sm font-medium transition-colors flex items-center gap-2';
            chip.innerHTML = `<span>${label}</span><i class="fa-solid fa-xmark text-[10px] opacity-80"></i>`;
            chip.addEventListener('click', (e) => {
                // ลบได้เฉพาะตอนคลิกที่กากบาท ตัวชิปเองไม่ตอบสนอง (ข้อ 11.5)
                if (!e.target.closest('i.fa-xmark')) return;
                onRemove();
            });
            salesHistoryActiveFilters.appendChild(chip);
        };

        let active = 0;
        const term = (salesHistorySearch && salesHistorySearch.value || '').trim();
        if (term) {
            active++;
            addChip(`ค้นหา: ${term}`, () => { salesHistorySearch.value = ''; loadSalesHistory(); });
        }
        if (salesHistoryDate && salesHistoryDate.value) {
            active++;
            addChip(`ช่วงเวลา: ${selectedOptionText(salesHistoryDate)}`, () => { salesHistoryDate.value = ''; loadSalesHistory(); });
        }
        if (salesHistoryBranch && salesHistoryBranch.value) {
            active++;
            addChip(`สาขา: ${selectedOptionText(salesHistoryBranch)}`, () => { salesHistoryBranch.value = ''; loadSalesHistory(); });
        }
        if (salesHistoryEmployee && salesHistoryEmployee.value) {
            active++;
            addChip(`พนักงาน: ${selectedOptionText(salesHistoryEmployee)}`, () => { salesHistoryEmployee.value = ''; loadSalesHistory(); });
        }
        if (salesHistoryPaymentType && salesHistoryPaymentType.value) {
            active++;
            addChip(`ชำระ: ${selectedOptionText(salesHistoryPaymentType)}`, () => { salesHistoryPaymentType.value = ''; loadSalesHistory(); });
        }
        if (salesHistoryStatus && salesHistoryStatus.value) {
            active++;
            addChip(`สถานะ: ${selectedOptionText(salesHistoryStatus)}`, () => { salesHistoryStatus.value = ''; loadSalesHistory(); });
        }
        const sd = salesHistoryStartDate && salesHistoryStartDate.value;
        const ed = salesHistoryEndDate && salesHistoryEndDate.value;
        if (sd || ed) {
            active++;
            const thai = (v) => new Date(v).toLocaleDateString('th-TH');
            addChip(`วันที่: ${sd ? thai(sd) : 'ไม่จำกัด'} - ${ed ? thai(ed) : 'ไม่จำกัด'}`, () => {
                if (salesHistoryStartDate) salesHistoryStartDate.value = '';
                if (salesHistoryEndDate) salesHistoryEndDate.value = '';
                loadSalesHistory();
            });
        }

        // ปุ่มล้างทั้งหมดโผล่เมื่อมีตัวกรองมากกว่า 1 ตัวเท่านั้น (ข้อ 11.5)
        if (active > 1) {
            const clearBtn = document.createElement('button');
            clearBtn.type = 'button';
            clearBtn.className = 'px-2.5 py-1 bg-red-500/10 hover:bg-red-500/15 text-red-300 rounded-full text-xs font-medium ring-1 ring-red-500/30 transition-colors';
            clearBtn.textContent = 'ล้างทั้งหมด';
            clearBtn.addEventListener('click', resetAllSalesHistoryFilters);
            salesHistoryActiveFilters.appendChild(clearBtn);
        }

        updateSalesHistoryFilterBadge();
    };

    function resetAllSalesHistoryFilters() {
        [salesHistorySearch, salesHistoryStartDate, salesHistoryEndDate].forEach(el => { if (el) el.value = ''; });
        [salesHistoryDate, salesHistoryBranch, salesHistoryEmployee, salesHistoryPaymentType, salesHistoryStatus]
            .forEach(el => { if (el) el.value = ''; });
        loadSalesHistory();
    }

    // เปิด/ปิดพาเนลกรองละเอียด — สองชั้น: กล่องนอกจางเข้า/ออก กล่องในเลื่อนเข้า/ออก (ข้อ 11.8)
    const openSalesHistoryFilterPanel = () => {
        if (!salesHistoryFilterPanel) return;
        salesHistoryFilterPanel.classList.remove('opacity-0', 'pointer-events-none');
        if (salesHistoryFilterPanelContent) salesHistoryFilterPanelContent.classList.remove('translate-x-full');
    };
    const closeSalesHistoryFilterPanel = () => {
        if (!salesHistoryFilterPanel) return;
        salesHistoryFilterPanel.classList.add('opacity-0', 'pointer-events-none');
        if (salesHistoryFilterPanelContent) salesHistoryFilterPanelContent.classList.add('translate-x-full');
    };

    const renderSalesHistoryTable = (transactions) => {
        if (!salesHistoryTableBody) return;

        salesHistoryTableBody.innerHTML = '';

        if (!transactions || transactions.length === 0) {
            salesHistoryTableBody.innerHTML = salesHistoryStateRow('ไม่พบประวัติการขายตามตัวเลือก');
            if (salesHistoryResultCount) salesHistoryResultCount.textContent = '';
            return;
        }

        if (salesHistoryResultCount) {
            salesHistoryResultCount.textContent = `แสดง ${transactions.length} รายการ`;
        }

        transactions.forEach(txn => {
            const row = document.createElement('tr');
            const isCancelled = txn.status === 'ยกเลิกแล้ว';

            // แถวที่ยกเลิกไม่ย้อมพื้นทั้งแถวแล้ว (พื้นแถวมีสีเดียวตามข้อ 11.6)
            // ความหมาย "ยกเลิก" สื่อด้วยป้ายสถานะในคอลัมน์ของมัน + ขีดฆ่าเลขบิลกับยอดเงิน
            row.className = 'hover:bg-divider transition-colors';

            const dateStr = new Date(txn.created_at).toLocaleString('th-TH', {
                day: '2-digit',
                month: '2-digit',
                year: '2-digit',
                hour: '2-digit',
                minute: '2-digit'
            });

            const paymentType = txn.payment_type || txn.payment_method || '-';
            const memberCell = txn.member_id
                ? twoLineCell(
                    `${txn.member_id.first_name} ${txn.member_id.last_name}`,
                    `<span class="font-mono">${txn.member_id.phone || '-'}</span>`
                )
                : '<span class="text-ink/50">-</span>';

            row.innerHTML = `
                <td class="px-6 py-4">
                    <div>
                        <p class="font-mono font-semibold text-accent-ink ${isCancelled ? 'line-through' : ''}">${txn.receipt_number}</p>
                        <p class="text-xs text-ink/70 mt-0.5">${dateStr}</p>
                    </div>
                </td>
                <td class="px-6 py-4">
                    ${twoLineCell(txn.branch_id ? txn.branch_id.name : '-', txn.employee_id ? txn.employee_id.name : '-')}
                </td>
                <td class="px-6 py-4">${memberCell}</td>
                <td class="px-6 py-4 text-right text-ink font-mono ${isCancelled ? 'line-through text-ink/50' : ''}">฿${txn.total_amount.toLocaleString()}</td>
                <td class="px-6 py-4">
                    <span class="px-2.5 py-1 bg-line text-ink/70 rounded-[0.375rem] text-xs font-medium">${paymentType}</span>
                </td>
                <td class="px-6 py-4">${salesHistoryStatusBadge(txn.status)}</td>
                <td class="px-6 py-4 text-right">
                    <div class="flex items-center justify-end gap-1">
                        <button type="button" class="view-transaction-btn text-ink hover:text-indigo-400 transition-colors p-2"
                                data-id="${txn._id}" title="ดูรายละเอียด">
                            <i class="fa-solid fa-eye"></i>
                        </button>
                    </div>
                </td>
            `;

            salesHistoryTableBody.appendChild(row);
        });

        // Add click listeners to view buttons
        document.querySelectorAll('.view-transaction-btn').forEach(btn => {
            btn.addEventListener('click', () => {
                const txnId = btn.dataset.id;
                viewTransactionDetails(txnId);
            });
        });
    };

    const viewTransactionDetails = async (txnId) => {
        try {
            await ensureMasterDataLoaded();
            const response = await authFetch(`${API_BASE_URL}/transactions/${txnId}`);
            const result = await response.json();

            if (result.success) {
                currentTransaction = result.data;
                populateTransactionDetails(result.data);
                openTransactionDetailModal();
            } else {
                showToast('เกิดข้อผิดพลาดในการดึงข้อมูล: ' + result.message, 'error');
            }
        } catch (error) {
            console.error('Error viewing transaction details:', error);
            showToast('เกิดข้อผิดพลาดในการดึงข้อมูล', 'error');
        }
    };
    // เปิดให้สคริปต์หน้าอื่นที่โหลดแยก (เช่น js/page-warranty-check.js) เรียกดูใบเสร็จได้
    window.viewTransactionDetails = viewTransactionDetails;

    const populateTransactionDetails = (txn) => {
        if (!transactionDetailReceipt) return;

        transactionDetailReceipt.textContent = txn.receipt_number;
        transactionDetailBranch.textContent = txn.branch_id ? txn.branch_id.name : '-';
        transactionDetailEmployee.textContent = txn.employee_id ? txn.employee_id.name : '-';
        transactionDetailDate.textContent = new Date(txn.created_at).toLocaleString('th-TH');
        transactionDetailPayment.textContent = txn.payment_type || txn.payment_method;
        transactionDetailTotal.textContent = `฿${txn.total_amount.toLocaleString(undefined, { minimumFractionDigits: 2 })}`;

        // Additional Fees Details Rendering
        const detailContractRow = document.getElementById('detail-contract-row');
        const transactionDetailContract = document.getElementById('transaction-detail-contract');
        if (detailContractRow && transactionDetailContract) {
            if (txn.contract_fee > 0) {
                detailContractRow.classList.remove('hidden');
                detailContractRow.classList.add('flex');
                transactionDetailContract.textContent = `฿${txn.contract_fee.toLocaleString(undefined, { minimumFractionDigits: 2 })}`;
            } else {
                detailContractRow.classList.add('hidden');
                detailContractRow.classList.remove('flex');
            }
        }

        const detailIcloudRow = document.getElementById('detail-icloud-row');
        const transactionDetailIcloud = document.getElementById('transaction-detail-icloud');
        if (detailIcloudRow && transactionDetailIcloud) {
            if (txn.icloud_fee > 0) {
                detailIcloudRow.classList.remove('hidden');
                detailIcloudRow.classList.add('flex');
                transactionDetailIcloud.textContent = `฿${txn.icloud_fee.toLocaleString(undefined, { minimumFractionDigits: 2 })}`;
            } else {
                detailIcloudRow.classList.add('hidden');
                detailIcloudRow.classList.remove('flex');
            }
        }

        // Member Details
        if (transactionDetailMember) {
            if (txn.member_id) {
                const m = txn.member_id;
                transactionDetailMember.innerHTML = `
                    <div class="flex flex-col">
                        <span class="text-ink text-base">${m.prefix || ''}${m.first_name} ${m.last_name}</span>
                        <span class="text-body-muted text-xs font-mono">${m.phone || 'ไม่ทราบเบอร์'} | ${m.member_number || 'ไม่มีเลขสมาชิก'}</span>
                    </div>
                `;
            } else {
                transactionDetailMember.textContent = 'ไม่ระบุสมาชิก (ขายเงินสด)';
            }
        }

        // Handle payment breakdown and downpayment
        const isFinancing = (txn.payment_type === 'จัดไฟแนนซ์');
        if (transactionDetailDownpaymentSection) {
            transactionDetailDownpaymentSection.classList.remove('hidden');

            const paidTotal = isFinancing ? (Number(txn.down_payment) || 0) : txn.total_amount;
            transactionDetailDownpayment.textContent = `฿${paidTotal.toLocaleString()}`;

            if (transactionDetailPaymentBreakdown) {
                let breakdownHTML = '';
                const cash = isFinancing ? (txn.finance_down_payment_cash || 0) : (txn.cash_amount || 0);
                const transfer = isFinancing ? (txn.finance_down_payment_transfer || 0) : (txn.transfer_amount || 0);

                if (cash > 0) breakdownHTML += `<div class="flex justify-between text-xs text-body-muted italic"><span>- เงินสด:</span><span>฿${cash.toLocaleString()}</span></div>`;
                if (transfer > 0) breakdownHTML += `<div class="flex justify-between text-xs text-body-muted italic"><span>- เงินโอน:</span><span>฿${transfer.toLocaleString()}</span></div>`;

                transactionDetailPaymentBreakdown.innerHTML = breakdownHTML;
                transactionDetailPaymentBreakdown.classList.toggle('hidden', breakdownHTML === '');
            }

            if (isFinancing) {
                const balance = txn.total_amount - (Number(txn.down_payment) || 0);
                transactionDetailBalance.textContent = `฿${balance.toLocaleString()}`;
                transactionDetailBalance.parentElement.classList.remove('hidden');

                // Populate Finance Details
                if (transactionDetailFinanceInfo) {
                    transactionDetailFinanceInfo.classList.remove('hidden');
                    if (transactionDetailFinanceCompany) {
                        let compName = txn.finance_company || '-';
                        if (window.masterDataCache && window.masterDataCache.financeCompanies) {
                            const matchingCompany = window.masterDataCache.financeCompanies.find(c => c._id === txn.finance_company);
                            if (matchingCompany) {
                                compName = matchingCompany.name;
                            }
                        }
                        transactionDetailFinanceCompany.textContent = compName;
                    }
                }
            } else {
                transactionDetailBalance.textContent = `฿0`;
                transactionDetailBalance.parentElement.classList.add('hidden');
                if (transactionDetailFinanceInfo) transactionDetailFinanceInfo.classList.add('hidden');
            }
        }

        // Populate items table
        if (transactionDetailItems) {
            transactionDetailItems.innerHTML = '';
            (txn.items || []).forEach(item => {
                const productCode = (item.product_id && item.product_id.product_code) || item.product_code || '';
                const itemRow = document.createElement('tr');
                itemRow.className = 'border-b border-hairline';
                const isGift = item.is_gift === true;
                itemRow.innerHTML = `
                    <td class="px-4 py-3 text-ink">
                        ${item.product_name}
                        ${isGift ? '<span class="ml-2 px-1.5 py-0.5 text-[10px] font-bold bg-amber-500/20 text-amber-400 rounded">ของแถม</span>' : ''}
                    </td>
                    <td class="px-4 py-3 text-center">${productCode ? `<span class="font-mono font-bold text-accent-ink tracking-wide">${productCode}</span>` : '<span class="text-body-muted">-</span>'}</td>
                    <td class="px-4 py-3 text-center text-body-muted">${item.quantity}</td>
                    <td class="px-4 py-3 text-right text-ink font-mono">${isGift ? '<span class="text-amber-400 font-bold">ของแถม</span>' : `฿${item.price.toLocaleString()}`}</td>
                `;
                transactionDetailItems.appendChild(itemRow);
            });
        }

        // Handle Cancel Button and Alert Box visibility
        const isCancelled = txn.status === 'ยกเลิกแล้ว';
        const userStr = localStorage.getItem('silmin_user');
        const user = userStr ? JSON.parse(userStr) : null;
        const hasCancelPerm = user && (user.role === 'Administrator' || user.role === 'ผู้จัดการ' || user.role === 'แอดมิน' || (user.permissions && user.permissions.cancel_sale));

        if (isCancelled) {
            if (transactionCancelledAlert) transactionCancelledAlert.classList.remove('hidden');
            if (transactionCancelledReason) transactionCancelledReason.textContent = txn.cancel_reason || '-';
            if (transactionCancelledBy) transactionCancelledBy.textContent = txn.cancelled_by ? txn.cancelled_by.name || 'Admin' : 'Admin';
            if (transactionCancelledAt) transactionCancelledAt.textContent = new Date(txn.cancelled_at || txn.updated_at).toLocaleString('th-TH');

            if (btnCancelTransaction) btnCancelTransaction.classList.add('hidden');
        } else {
            if (transactionCancelledAlert) transactionCancelledAlert.classList.add('hidden');

            if (btnCancelTransaction) {
                if (hasCancelPerm) {
                    btnCancelTransaction.classList.remove('hidden');
                } else {
                    btnCancelTransaction.classList.add('hidden');
                }
            }
        }
    };

    const openTransactionDetailModal = () => {
        if (!transactionDetailModal) return;
        transactionDetailModal.classList.remove('opacity-0', 'pointer-events-none');
        const modalContent = transactionDetailModal.querySelector('.modal-content');
        if (modalContent) modalContent.classList.remove('scale-95');
    };

    const closeTransactionDetailModal = () => {
        if (!transactionDetailModal) return;
        transactionDetailModal.classList.add('opacity-0', 'pointer-events-none');
        const modalContent = transactionDetailModal.querySelector('.modal-content');
        if (modalContent) modalContent.classList.add('scale-95');
        // Do not set currentTransaction = null here, as it might be needed for Reprint
    };

    // Advanced Filters DOM Elements
    // (ตัวกรองในพาเนลละเอียดถูกประกาศไว้ด้านบนสุดของไฟล์แล้ว)

    // Event listeners for filters
    if (salesHistorySearch) {
        let searchTimeout;
        salesHistorySearch.addEventListener('input', () => {
            clearTimeout(searchTimeout);
            searchTimeout = setTimeout(() => {
                loadSalesHistory();
            }, 500);
        });
    }

    if (salesHistoryDate) {
        salesHistoryDate.addEventListener('change', () => {
            // เลือก "กำหนดเอง" = ต้องไประบุช่วงวันที่ ซึ่งย้ายไปอยู่ในพาเนลละเอียดแล้ว จึงเปิดให้เลย
            if (salesHistoryDate.value === 'custom') openSalesHistoryFilterPanel();
            loadSalesHistory();
        });
    }

    if (salesHistoryBranch) {
        salesHistoryBranch.addEventListener('change', loadSalesHistory);
    }

    // ตัวกรองในพาเนลละเอียด — ไม่ยิงทันทีตอนเปลี่ยน รอกด "ตกลง"
    // (ไวยากรณ์เดียวกับพาเนลกรองหน้า #stock และหน้าการมัดจำ)
    if (btnSalesHistoryFilter) btnSalesHistoryFilter.addEventListener('click', openSalesHistoryFilterPanel);
    if (btnSalesHistoryFilterClose) btnSalesHistoryFilterClose.addEventListener('click', closeSalesHistoryFilterPanel);
    if (btnSalesHistoryFilterApply) {
        btnSalesHistoryFilterApply.addEventListener('click', () => {
            closeSalesHistoryFilterPanel();
            loadSalesHistory();
        });
    }
    if (btnSalesHistoryFilterReset) {
        btnSalesHistoryFilterReset.addEventListener('click', () => {
            closeSalesHistoryFilterPanel();
            resetAllSalesHistoryFilters();
        });
    }
    // คลิกพื้นที่มืดนอกพาเนล = ปิด (ไม่ใช้ค่าที่เพิ่งเลือก)
    if (salesHistoryFilterPanel) {
        salesHistoryFilterPanel.addEventListener('click', (e) => {
            if (e.target === salesHistoryFilterPanel) closeSalesHistoryFilterPanel();
        });
    }

    // Transaction detail modal close button
    if (closeTransactionDetailBtn) {
        closeTransactionDetailBtn.addEventListener('click', closeTransactionDetailModal);
    }

    // Reprint receipt button
    if (btnReprintReceipt) {
        btnReprintReceipt.addEventListener('click', () => {
            if (currentTransaction) {
                const txnToPrint = currentTransaction;
                closeTransactionDetailModal();
                setTimeout(() => {
                    openCheckoutSuccessModal(txnToPrint);
                }, 300);
            } else {
                showToast('ไม่พบข้อมูลรายการที่จะพิมพ์', 'error');
            }
        });
    }

    // Cancel transaction button
    if (btnCancelTransaction) {
        btnCancelTransaction.addEventListener('click', () => {
            if (currentTransaction) {
                showPrompt('ระบุเหตุผลที่ต้องการยกเลิกบิลนี้:', '', async (reason) => {
                    if (!reason || reason.trim() === '') {
                        showToast('กรุณาระบุเหตุผล', 'warning');
                        return;
                    }
                    try {
                        const response = await authFetch(`${API_BASE_URL}/transactions/${currentTransaction._id}/cancel`, {
                            method: 'POST',
                            headers: { 'Content-Type': 'application/json' },
                            body: JSON.stringify({ reason: reason.trim() })
                        });
                        const result = await response.json();
                        if (result.success) {
                            showToast('ยกเลิกบิลขายสำเร็จ', 'success');
                            closeTransactionDetailModal();
                            loadSalesHistory();
                            if (typeof fetchProducts === 'function') fetchProducts();
                        } else {
                            showToast(result.message || 'เกิดข้อผิดพลาดในการยกเลิก', 'error');
                        }
                    } catch (err) {
                        console.error(err);
                        showToast('เกิดข้อผิดพลาดในการเชื่อมต่อ', 'error');
                    }
                });
            }
        });
    }

})();
