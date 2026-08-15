// Sales History + Daily Summary + Transaction Detail Modal (ประวัติการขาย + สรุปยอดขายรายวัน + โมดัลรายละเอียดรายการขาย)
// แยกออกมาจาก script.js — โหลดแบบ dynamic เฉพาะตอนเปิดหน้า "ประวัติการขาย", "สรุปยอดขายรายวัน" หรือ "เช็คประกัน" ครั้งแรกเท่านั้น
// (หน้าเช็คประกันก็ต้องพึ่งโมดัลนี้ผ่าน window.viewTransactionDetails ด้วย เพราะกดดูใบเสร็จจากหน้านั้นได้)
// พึ่งพา window.authFetch, window.showToast, window.showPrompt, window.openCheckoutSuccessModal,
// window.ensureMasterDataLoaded, window.fetchProducts, API_BASE_URL (global จาก script.js)
(function () {
    // DOM elements ที่หน้านี้ใช้ (ดึงเองแยกจาก core เพราะ const เดิมอยู่คนละไฟล์กันแล้ว)
    const salesHistorySearch = document.getElementById('sales-history-search');
    const salesHistoryDate = document.getElementById('sales-history-date');
    const salesHistoryBranch = document.getElementById('sales-history-branch');
    const salesHistoryTableBody = document.getElementById('sales-history-table-body');
    const salesHistoryEmpty = document.getElementById('sales-history-empty');
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
                showToast('เกิดข้อผิดพลาดในการดึงข้อมูล: ' + result.message, 'error');
            }
        } catch (error) {
            console.error('Error loading sales history:', error);
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

    // Load Daily Summary
    const loadDailySummary = async () => {
        try {
            const response = await authFetch(`${API_BASE_URL}/sales/daily-summary`);
            const result = await response.json();

            if (result.success && result.data) {
                const data = result.data;

                // Card values
                const cashEl = document.getElementById('daily-summary-cash-received');
                const financeEl = document.getElementById('daily-summary-finance-down');
                const devicesEl = document.getElementById('daily-summary-devices-sold');
                const countEl = document.getElementById('daily-summary-bill-count');

                const cashSalesEl = document.getElementById('daily-summary-cash-sales');
                const cashDisbursedEl = document.getElementById('daily-summary-cash-disbursed');

                const salesCash = data.cash_received || 0;
                const outCash = data.cash_disbursed || 0;
                const netCash = salesCash - outCash;

                if (cashEl) cashEl.textContent = `฿${netCash.toLocaleString(undefined, { minimumFractionDigits: 2 })}`;
                if (cashSalesEl) cashSalesEl.textContent = `฿${salesCash.toLocaleString(undefined, { minimumFractionDigits: 2 })}`;
                if (cashDisbursedEl) cashDisbursedEl.textContent = `-฿${outCash.toLocaleString(undefined, { minimumFractionDigits: 2 })}`;

                if (financeEl) financeEl.textContent = `฿${(data.finance_downpayment || 0).toLocaleString(undefined, { minimumFractionDigits: 2 })}`;
                if (devicesEl) devicesEl.textContent = `${data.devices_sold || 0} เครื่อง`;
                if (countEl) countEl.textContent = `${(data.bills || []).length} รายการ`;

                // Render table
                const tbody = document.getElementById('daily-summary-table-body');
                if (tbody) {
                    if (!data.bills || data.bills.length === 0) {
                        tbody.innerHTML = `
                            <tr>
                                <td colspan="7" class="text-center py-12 text-body-muted">
                                    ไม่มีบิลขายสำหรับวันนี้
                                </td>
                            </tr>
                        `;
                    } else {
                        tbody.innerHTML = data.bills.map(txn => {
                            const timeStr = new Date(txn.created_at).toLocaleTimeString('th-TH', { hour: '2-digit', minute: '2-digit' });
                            const memberName = txn.member_id
                                ? `${txn.member_id.first_name} ${txn.member_id.last_name}`
                                : 'ลูกค้าทั่วไป';
                            const empName = txn.employee_id ? txn.employee_id.name : '-';
                            const paymentType = txn.payment_type || txn.payment_method || '-';
                            const totalAmount = `฿${(txn.total_amount || 0).toLocaleString(undefined, { minimumFractionDigits: 2 })}`;

                            return `
                                <tr class="hover:bg-surface-chip/40 transition-colors">
                                    <td class="px-6 py-4 font-medium text-body-muted font-mono">${timeStr}</td>
                                    <td class="px-6 py-4 font-bold text-ink">${txn.receipt_number}</td>
                                    <td class="px-6 py-4 text-body-muted">${empName}</td>
                                    <td class="px-6 py-4 text-body-muted">${memberName}</td>
                                    <td class="px-6 py-4 text-right text-ink font-bold font-mono">${totalAmount}</td>
                                    <td class="px-6 py-4">
                                        <span class="px-2.5 py-1 rounded-full text-xs font-semibold bg-surface-chip border border-hairline text-body-muted">
                                            ${paymentType}
                                        </span>
                                    </td>
                                    <td class="px-6 py-4 text-center">
                                        <button type="button" class="view-daily-txn-btn px-3 py-1.5 bg-surface-chip hover:bg-surface-tile-2 text-ink rounded-pill text-xs font-medium transition-all" data-id="${txn._id}">
                                            <i class="fa-solid fa-eye mr-1"></i> ดูรายละเอียด
                                        </button>
                                    </td>
                                </tr>
                            `;
                        }).join('');

                        // Bind detail button clicks
                        tbody.querySelectorAll('.view-daily-txn-btn').forEach(btn => {
                            btn.addEventListener('click', () => {
                                const txnId = btn.dataset.id;
                                viewTransactionDetails(txnId);
                            });
                        });
                    }
                }
            } else {
                showToast('เกิดข้อผิดพลาดในการโหลดข้อมูล: ' + result.message, 'error');
            }
        } catch (error) {
            console.error('Error loading daily sales summary:', error);
            showToast('เกิดข้อผิดพลาดในการดึงข้อมูลสรุปยอดขายรายวัน', 'error');
        }
    };
    window.loadDailySummary = loadDailySummary;

    // Bind daily summary refresh button
    const btnRefreshDaily = document.getElementById('btn-refresh-daily-summary');
    if (btnRefreshDaily) {
        btnRefreshDaily.addEventListener('click', loadDailySummary);
    }

    const renderSalesHistoryTable = (transactions) => {
        if (!salesHistoryTableBody) return;

        salesHistoryTableBody.innerHTML = '';

        if (!transactions || transactions.length === 0) {
            if (salesHistoryEmpty) salesHistoryEmpty.classList.remove('hidden');
            return;
        }

        if (salesHistoryEmpty) salesHistoryEmpty.classList.add('hidden');

        transactions.forEach(txn => {
            const row = document.createElement('tr');
            const isCancelled = txn.status === 'ยกเลิกแล้ว';

            row.className = `border-b border-hairline hover:bg-surface-chip/40 transition-colors ${isCancelled ? 'opacity-70 bg-red-900/10' : ''}`;

            const dateStr = new Date(txn.created_at).toLocaleString('th-TH', {
                day: '2-digit',
                month: '2-digit',
                year: '2-digit',
                hour: '2-digit',
                minute: '2-digit'
            });

            row.innerHTML = `
                <td class="px-4 py-4 md:px-6 text-body-muted whitespace-nowrap ${isCancelled ? 'line-through text-red-400/70' : ''}">${dateStr}</td>
                <td class="px-4 py-4 md:px-6 text-body-muted whitespace-nowrap">
                    <span class="${isCancelled ? 'line-through text-red-400' : ''}">${txn.receipt_number}</span>
                    ${isCancelled ? '<span class="px-2 py-0.5 text-[10px] font-bold bg-red-500 text-white rounded-full shrink-0">ยกเลิกแล้ว</span>' : ''}
                </td>
                <td class="px-4 py-4 md:px-6 text-body-muted whitespace-nowrap ${isCancelled ? 'line-through text-red-400/70' : ''}">${txn.branch_id ? txn.branch_id.name : '-'}</td>
                <td class="px-4 py-4 md:px-6 text-body-muted whitespace-nowrap ${isCancelled ? 'line-through text-red-400/70' : ''}">${txn.employee_id ? txn.employee_id.name : '-'}</td>
                <td class="px-4 py-4 md:px-6 text-body-muted whitespace-nowrap ${isCancelled ? 'line-through text-red-400/70' : ''}">
                    ${txn.member_id ? `<span class="font-bold text-ink">${txn.member_id.first_name} ${txn.member_id.last_name}</span><br><span class="text-xs text-body-muted">${txn.member_id.phone || ''}</span>` : '<span class="text-ink-muted-48">-</span>'}
                </td>
                <td class="px-4 py-4 md:px-6 text-right whitespace-nowrap ${isCancelled ? 'text-red-400/70 line-through' : 'text-ink font-bold'} font-mono">฿${txn.total_amount.toLocaleString()}</td>
                <td class="px-4 py-4 md:px-6 text-body-muted whitespace-nowrap ${isCancelled ? 'line-through text-red-400/70' : ''}">
                    ${(() => {
                    const pt = txn.payment_type || txn.payment_method || '-';
                    let colorClass = 'bg-surface-chip text-body-muted border border-hairline';
                    if (pt === 'จัดไฟแนนซ์') {
                        colorClass = 'bg-amber-500/10 text-amber-400 border border-amber-500/20';
                    } else if (pt === 'ซื้อสด' || pt === 'เงินสด' || pt === 'สด') {
                        colorClass = 'bg-emerald-500/10 text-emerald-400 border border-emerald-500/20';
                    } else if (pt.includes('โอน')) {
                        colorClass = 'bg-blue-500/10 text-blue-400 border border-blue-500/20';
                    } else if (pt.includes('บัตรเครดิต')) {
                        colorClass = 'bg-purple-500/10 text-purple-400 border border-purple-500/20';
                    }
                    return `<span class="px-2 py-1 rounded-md text-[11px] font-bold whitespace-nowrap ${colorClass}">${pt}</span>`;
                })()}
                </td>
                <td class="px-4 py-4 md:px-6 text-center whitespace-nowrap">
                    <button class="view-transaction-btn px-4 py-2 ${isCancelled ? 'bg-red-500/10 text-red-400 hover:bg-red-500/20' : 'bg-primary/10 hover:bg-primary/20 text-primary'} rounded-pill transition-all font-medium whitespace-nowrap"
                            data-id="${txn._id}">
                        <i class="fa-solid fa-eye mr-2"></i>รายละเอียด
                    </button>
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
                const imeiValue = item.imei_sold || item.imei || item.serial || item.serial_number || '';
                const itemRow = document.createElement('tr');
                itemRow.className = 'border-b border-hairline';
                const isGift = item.is_gift === true;
                itemRow.innerHTML = `
                    <td class="px-4 py-3 text-ink">
                        ${item.product_name}
                        ${isGift ? '<span class="ml-2 px-1.5 py-0.5 text-[10px] font-bold bg-amber-500/20 text-amber-400 rounded">ของแถม</span>' : ''}
                    </td>
                    <td class="px-4 py-3 text-center text-body-muted">${imeiValue ? imeiValue : '-'}</td>
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
    const salesHistoryEmployee = document.getElementById('sales-history-employee');
    const salesHistoryPaymentType = document.getElementById('sales-history-payment-type');
    const salesHistoryStatus = document.getElementById('sales-history-status');
    const salesHistoryStartDate = document.getElementById('sales-history-start-date');
    const salesHistoryEndDate = document.getElementById('sales-history-end-date');
    const btnToggleAdvancedFilters = document.getElementById('btn-toggle-advanced-filters');
    const advancedFiltersPanel = document.getElementById('advanced-filters-panel');
    const iconChevronAdvanced = document.getElementById('icon-chevron-advanced');

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
            if (salesHistoryDate.value === 'custom') {
                if (advancedFiltersPanel && advancedFiltersPanel.classList.contains('hidden')) {
                    advancedFiltersPanel.classList.remove('hidden');
                    advancedFiltersPanel.classList.add('grid');
                    if (iconChevronAdvanced) iconChevronAdvanced.classList.add('rotate-180');
                }
            }
            loadSalesHistory();
        });
    }

    if (salesHistoryBranch) {
        salesHistoryBranch.addEventListener('change', loadSalesHistory);
    }

    if (salesHistoryEmployee) {
        salesHistoryEmployee.addEventListener('change', loadSalesHistory);
    }

    if (salesHistoryPaymentType) {
        salesHistoryPaymentType.addEventListener('change', loadSalesHistory);
    }

    if (salesHistoryStatus) {
        salesHistoryStatus.addEventListener('change', loadSalesHistory);
    }

    if (salesHistoryStartDate) {
        salesHistoryStartDate.addEventListener('change', loadSalesHistory);
    }

    if (salesHistoryEndDate) {
        salesHistoryEndDate.addEventListener('change', loadSalesHistory);
    }

    // Toggle advanced filters panel
    if (btnToggleAdvancedFilters) {
        btnToggleAdvancedFilters.addEventListener('click', () => {
            if (advancedFiltersPanel) {
                const isHidden = advancedFiltersPanel.classList.contains('hidden');
                if (isHidden) {
                    advancedFiltersPanel.classList.remove('hidden');
                    advancedFiltersPanel.classList.add('grid');
                    if (iconChevronAdvanced) iconChevronAdvanced.classList.add('rotate-180');
                } else {
                    advancedFiltersPanel.classList.add('hidden');
                    advancedFiltersPanel.classList.remove('grid');
                    if (iconChevronAdvanced) iconChevronAdvanced.classList.remove('rotate-180');
                }
            }
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
