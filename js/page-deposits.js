// DEPOSIT MODULE (การมัดจำสินค้า)
// แยกออกมาจาก script.js — โหลดแบบ dynamic เฉพาะตอนเปิดหน้า "การมัดจำสินค้า" ครั้งแรกเท่านั้น
// พึ่งพา window.authFetch, window.showToast, window.masterDataCache, allProductsCache (จาก script.js), API_BASE_URL
(function () {
    // ==========================================
    // DEPOSIT MODULE (การมัดจำสินค้า)
    // ==========================================
    const depositFilterBranch = document.getElementById('deposit-filter-branch');
    const depositFilterStatus = document.getElementById('deposit-filter-status');
    const depositFilterStage = document.getElementById('deposit-filter-stage');
    const depositFilterStartDate = document.getElementById('deposit-filter-start-date');
    const depositFilterEndDate = document.getElementById('deposit-filter-end-date');
    const depositFilterSearch = document.getElementById('deposit-filter-search');
    const btnOpenCreateDeposit = document.getElementById('btn-open-create-deposit');
    const depositTableBody = document.getElementById('deposit-table-body');
    const depositEmpty = document.getElementById('deposit-empty');
    const depositBranchHeader = document.getElementById('deposit-branch-header');

    // Create Modal Elements
    const modalCreateDeposit = document.getElementById('modal-create-deposit');
    const depositForm = document.getElementById('deposit-form');
    const editDepositId = document.getElementById('edit-deposit-id');
    const depositModalTitle = document.getElementById('deposit-modal-title');
    const modalDepositCustomerName = document.getElementById('modal-deposit-customer-name');
    const modalDepositCustomerPhone = document.getElementById('modal-deposit-customer-phone');
    const modalDepositProductId = document.getElementById('modal-deposit-product-id');
    const modalDepositColor = document.getElementById('modal-deposit-color');
    const modalDepositCapacity = document.getElementById('modal-deposit-capacity');
    const modalDepositImei = document.getElementById('modal-deposit-imei');
    const modalDepositProductPrice = document.getElementById('modal-deposit-product-price');
    const modalDepositAmount = document.getElementById('modal-deposit-amount');
    const modalDepositRemaining = document.getElementById('modal-deposit-remaining');
    const modalDepositPaymentMethod = document.getElementById('modal-deposit-payment-method');
    const modalDepositAppointment = document.getElementById('modal-deposit-appointment');
    const modalDepositCashAmount = document.getElementById('modal-deposit-cash-amount');
    const modalDepositTransferAmount = document.getElementById('modal-deposit-transfer-amount');
    const depositSplitRow = document.getElementById('deposit-split-row');
    const modalDepositStage = document.getElementById('modal-deposit-stage');
    const modalDepositNotes = document.getElementById('modal-deposit-notes');
    const btnCloseCreateDeposit = document.getElementById('btn-close-create-deposit');
    const btnCancelCreateDeposit = document.getElementById('btn-cancel-create-deposit');

    // Details Modal Elements
    const modalDepositDetails = document.getElementById('modal-deposit-details');
    const btnCloseDepositDetails = document.getElementById('btn-close-deposit-details');
    const btnCloseDepositDetailModal = document.getElementById('btn-close-deposit-detail-modal');
    const btnDepositDetailPrint = document.getElementById('btn-deposit-detail-print');

    // Details Info
    const detailDepositNumber = document.getElementById('detail-deposit-number');
    const detailDepositStatus = document.getElementById('detail-deposit-status');
    const detailDepositCustomer = document.getElementById('detail-deposit-customer');
    const detailDepositPhone = document.getElementById('detail-deposit-phone');
    const detailDepositProduct = document.getElementById('detail-deposit-product');
    const detailDepositImeiText = document.getElementById('detail-deposit-imei-text');
    const detailDepositPrice = document.getElementById('detail-deposit-price');
    const detailDepositPaid = document.getElementById('detail-deposit-paid');
    const detailDepositRemaining = document.getElementById('detail-deposit-remaining');
    const detailDepositDates = document.getElementById('detail-deposit-dates');
    const detailDepositSender = document.getElementById('detail-deposit-sender');

    // Complete section
    const detailActionCompleteSection = document.getElementById('detail-action-complete-section');
    const detailAssignImeiRow = document.getElementById('detail-assign-imei-row');
    const detailAssignImeiSelect = document.getElementById('detail-assign-imei-select');
    const detailPickupPaymentMethod = document.getElementById('detail-pickup-payment-method');
    const detailPickupToPay = document.getElementById('detail-pickup-to-pay');
    const detailPickupSplitRow = document.getElementById('detail-pickup-split-row');
    const detailPickupCashAmount = document.getElementById('detail-pickup-cash-amount');
    const detailPickupTransferAmount = document.getElementById('detail-pickup-transfer-amount');
    const btnSubmitCompleteDeposit = document.getElementById('btn-submit-complete-deposit');

    // Cancel section
    const detailActionCancelSection = document.getElementById('detail-action-cancel-section');
    const detailCancelReason = document.getElementById('detail-cancel-reason');
    const btnSubmitCancelDeposit = document.getElementById('btn-submit-cancel-deposit');

    // History section
    const detailHistoryInfoSection = document.getElementById('detail-history-info-section');
    const detailHistoryCompletedByLabel = document.getElementById('detail-history-completed-by-label');
    const detailHistoryCompletedBy = document.getElementById('detail-history-completed-by');
    const detailHistoryCompletedAtLabel = document.getElementById('detail-history-completed-at-label');
    const detailHistoryCompletedAt = document.getElementById('detail-history-completed-at');
    const detailHistoryBillRow = document.getElementById('detail-history-bill-row');
    const detailHistoryBill = document.getElementById('detail-history-bill');
    const detailHistoryReasonRow = document.getElementById('detail-history-reason-row');
    const detailHistoryReason = document.getElementById('detail-history-reason');

    let activeDeposit = null;

    const getLoggedUserBranchId = () => {
        try {
            const userStr = localStorage.getItem('silmin_user');
            if (!userStr) return '';
            const user = JSON.parse(userStr);
            if (!user || !user.branch) return '';
            return user.branch._id || user.branch;
        } catch (e) {
            console.error('Error parsing logged user info:', e);
            return '';
        }
    };

    async function loadBranchesForDeposits() {
        if (!depositFilterBranch) return;
        try {
            const response = await authFetch(`${API_BASE_URL}/branches`);
            const json = await response.json();
            if (json.success && json.data) {
                depositFilterBranch.innerHTML = '<option value="ALL">ทุกสาขา</option>';
                json.data.forEach(branch => {
                    const opt = document.createElement('option');
                    opt.value = branch._id;
                    opt.textContent = branch.name;
                    depositFilterBranch.appendChild(opt);
                });
            }
        } catch (e) {
            console.error('Error loading branches for deposits filter:', e);
        }
    }

    const populateDepositProducts = () => {
        const datalist = document.getElementById('deposit-products-datalist');
        if (!datalist) return;
        datalist.innerHTML = '';
        if (window.masterDataCache && Array.isArray(window.masterDataCache.productNames)) {
            window.masterDataCache.productNames.forEach(p => {
                const opt = document.createElement('option');
                opt.value = p.name;
                datalist.appendChild(opt);
            });
        }
    };

    const populateDepositColorAndCapacity = () => {
        const colorDatalist = document.getElementById('deposit-colors-datalist');
        const capDatalist = document.getElementById('deposit-capacities-datalist');
        if (!colorDatalist || !capDatalist) return;
        colorDatalist.innerHTML = '';
        capDatalist.innerHTML = '';
        if (window.masterDataCache) {
            if (Array.isArray(window.masterDataCache.productColors)) {
                window.masterDataCache.productColors.forEach(c => {
                    const opt = document.createElement('option');
                    opt.value = c.name;
                    colorDatalist.appendChild(opt);
                });
            }
            if (Array.isArray(window.masterDataCache.productCapacities)) {
                window.masterDataCache.productCapacities.forEach(c => {
                    const opt = document.createElement('option');
                    opt.value = c.name;
                    capDatalist.appendChild(opt);
                });
            }
        }
    };

    const populateAssignImeiSelect = (productName) => {
        if (!detailAssignImeiSelect) return;
        detailAssignImeiSelect.innerHTML = '<option value="">-- กรุณาเลือก IMEI เครื่องที่ต้องการส่งมอบ --</option>';
        if (typeof allProductsCache === 'undefined') return;

        const currentBranchId = getLoggedUserBranchId();
        const matchingProducts = allProductsCache.filter(p => p.name === productName);

        matchingProducts.forEach(product => {
            if (!product.stock_balances) return;
            const bal = product.stock_balances.find(b => b.branch_id && (b.branch_id._id || b.branch_id) === currentBranchId);
            if (bal && Array.isArray(bal.imeis)) {
                bal.imeis.forEach(imei => {
                    const opt = document.createElement('option');
                    opt.value = imei;
                    const capacityStr = product.capacity_id ? ` ${product.capacity_id.name || product.capacity_id}` : '';
                    const colorStr = product.color_id ? ` ${product.color_id.name || product.color_id}` : '';
                    opt.textContent = `${imei} (${capacityStr}${colorStr})`;
                    detailAssignImeiSelect.appendChild(opt);
                });
            }
        });
    };

    const updateDepositRemaining = (priceInput, amountInput, remainingInput) => {
        const price = Number(priceInput.value) || 0;
        const deposit = Number(amountInput.value) || 0;
        remainingInput.value = Math.max(0, price - deposit);
    };

    const handlePaymentMethodChange = (selectEl, splitRowEl, cashInput, transferInput, totalAmount = 0) => {
        if (selectEl.value === 'ผสม') {
            splitRowEl.classList.remove('hidden');
            cashInput.required = true;
            transferInput.required = true;
            if (totalAmount > 0) {
                cashInput.value = Math.floor(totalAmount / 2);
                transferInput.value = totalAmount - Math.floor(totalAmount / 2);
            }
        } else {
            splitRowEl.classList.add('hidden');
            cashInput.required = false;
            transferInput.required = false;
            cashInput.value = '';
            transferInput.value = '';
        }
    };

    async function loadDeposits() {
        if (!depositTableBody) return;

        const branchVal = depositFilterBranch ? depositFilterBranch.value : 'ALL';
        const statusVal = depositFilterStatus ? depositFilterStatus.value : 'รอดำเนินการ';
        const stageVal = depositFilterStage ? depositFilterStage.value : 'ALL';
        const startVal = depositFilterStartDate ? depositFilterStartDate.value : '';
        const endVal = depositFilterEndDate ? depositFilterEndDate.value : '';
        const searchVal = depositFilterSearch ? depositFilterSearch.value : '';

        let params = [];
        if (statusVal !== 'ALL') params.push(`status=${statusVal}`);
        if (branchVal !== 'ALL') params.push(`branch_id=${branchVal}`);
        if (stageVal !== 'ALL') params.push(`stage=${stageVal}`);
        if (startVal) params.push(`startDate=${startVal}`);
        if (endVal) params.push(`endDate=${endVal}`);
        if (searchVal) params.push(`search=${encodeURIComponent(searchVal)}`);
        let url = `/api/deposits?` + params.join('&');

        const user = JSON.parse(localStorage.getItem('silmin_user') || '{}');
        const userRole = user.role || '';
        const canFilterBranch = user.permissions && (user.permissions.filter_stock_branch || userRole === 'Administrator' || userRole === 'ผู้จัดการ');

        if (!canFilterBranch) {
            const userBranchId = getLoggedUserBranchId();
            if (depositFilterBranch) {
                depositFilterBranch.value = userBranchId;
                depositFilterBranch.disabled = true;
            }
            if (depositBranchHeader) {
                depositBranchHeader.textContent = `สาขา: ${user.branch?.name || 'สาขาของคุณ'}`;
            }
        } else {
            if (depositFilterBranch) {
                depositFilterBranch.disabled = false;
            }
            if (depositBranchHeader && depositFilterBranch) {
                const selectedText = depositFilterBranch.options[depositFilterBranch.selectedIndex]?.textContent || 'ทั้งหมด';
                depositBranchHeader.textContent = `สาขา: ${selectedText}`;
            }
        }

        try {
            const token = localStorage.getItem('silmin_token');
            const response = await fetch(url, {
                headers: { 'Authorization': `Bearer ${token}` }
            });
            const result = await response.json();

            depositTableBody.innerHTML = '';
            if (result.success && result.data && result.data.length > 0) {
                depositEmpty.classList.add('hidden');
                result.data.forEach(item => {
                    const row = document.createElement('tr');
                    row.className = 'hover:bg-slate-700/20 transition-colors border-b border-slate-700/50 cursor-pointer';

                    const dateStr = new Date(item.createdAt).toLocaleDateString('th-TH', { hour: '2-digit', minute: '2-digit' }) + ' น.';
                    const apptStr = item.appointment_date ? new Date(item.appointment_date).toLocaleDateString('th-TH') : 'ไม่ระบุ';

                    let statusClass = 'bg-amber-500/10 text-amber-400 border border-amber-500/20';
                    if (item.status === 'สำเร็จ') statusClass = 'bg-emerald-500/10 text-emerald-400 border border-emerald-500/20';
                    else if (item.status === 'ยกเลิก') statusClass = 'bg-rose-500/10 text-rose-400 border border-rose-500/20';

                    row.innerHTML = `
                        <td class="px-1.5 py-2 font-medium text-slate-400">${dateStr}</td>
                        <td class="px-1.5 py-2 text-white font-medium">${item.customer_name}</td>
                        <td class="px-1.5 py-2 font-mono text-slate-300">${item.customer_phone}</td>
                        <td class="px-1.5 py-2 font-mono font-semibold text-emerald-400">฿${item.deposit_amount.toLocaleString()}</td>
                        <td class="px-1.5 py-2 text-slate-300">${apptStr}</td>
                        <td class="px-1.5 py-2 text-center font-mono font-bold border-r border-slate-750/30 text-slate-400">${item.bill_number || '-'}</td>
                        <td class="px-1.5 py-2 font-mono border-r border-slate-750/30 text-slate-300 break-words">${item.imei || '<span class="text-slate-400 italic">ไม่ระบุ</span>'}</td>
                        <td class="px-1.5 py-2 border-r border-slate-750/30 text-cyan-400 font-medium break-words" title="${item.product_name}">${item.product_name}</td>
                        <td class="px-1.5 py-2 font-mono border-r border-slate-750/30 text-slate-300">฿${item.product_price.toLocaleString()}</td>
                        <td class="px-1.5 py-2 font-mono font-bold text-red-400">฿${item.remaining_amount.toLocaleString()}</td>
                        <td class="px-1.5 py-2">
                            <span class="px-1.5 py-0.5 rounded text-[9px] font-bold ${statusClass}">${item.status}</span>
                            <div class="text-[9px] text-slate-400 mt-1">${item.stage}</div>
                        </td>
                        <td class="px-1.5 py-2 text-slate-400">${item.created_by?.name || '-'}</td>
                        <td class="px-1.5 py-2 text-slate-400">${item.branch_id?.name || '-'}</td>
                        <td class="px-1.5 py-2 text-center">
                            <button class="btn-print-deposit w-7 h-7 mx-auto rounded-lg bg-slate-700/50 flex items-center justify-center text-slate-400 hover:text-emerald-400 hover:bg-emerald-400/10 transition-colors" data-id="${item._id}" title="พิมพ์ใบมัดจำ">
                                <i class="fa-solid fa-print"></i>
                            </button>
                        </td>
                    `;

                    row.querySelector('.btn-print-deposit').addEventListener('click', (e) => {
                        e.stopPropagation();
                        printDepositSlip(item._id);
                    });

                    row.addEventListener('click', () => {
                        openDepositDetailsModal(item);
                    });

                    depositTableBody.appendChild(row);
                });
            } else {
                depositEmpty.classList.remove('hidden');
            }
        } catch (e) {
            console.error('Error loading deposits list:', e);
            showToast('เกิดข้อผิดพลาดในการโหลดรายการมัดจำ', 'error');
        }
    }

    const openCreateDepositModal = () => {
        if (!depositForm) return;
        depositForm.reset();
        editDepositId.value = '';
        depositModalTitle.innerHTML = '<i class="fa-solid fa-wallet text-emerald-400"></i> บันทึกรายการจองมัดจำใหม่';
        depositSplitRow.classList.add('hidden');
        modalDepositRemaining.value = '0';

        populateDepositProducts();
        populateDepositColorAndCapacity();

        modalCreateDeposit.classList.remove('opacity-0', 'pointer-events-none');
        const content = modalCreateDeposit.querySelector('.modal-content');
        if (content) {
            content.classList.remove('scale-95');
            content.classList.add('scale-100');
        }
    };

    const closeCreateDepositModal = () => {
        modalCreateDeposit.classList.add('opacity-0', 'pointer-events-none');
        const content = modalCreateDeposit.querySelector('.modal-content');
        if (content) {
            content.classList.remove('scale-100');
            content.classList.add('scale-95');
        }
    };

    const openDepositDetailsModal = (deposit) => {
        activeDeposit = deposit;

        detailDepositNumber.textContent = deposit.deposit_number;
        detailDepositStatus.textContent = deposit.status;

        detailDepositStatus.className = 'px-2 py-0.5 rounded text-[10px] font-bold border';
        if (deposit.status === 'รอดำเนินการ') {
            detailDepositStatus.classList.add('bg-amber-500/10', 'text-amber-400', 'border-amber-500/20');
        } else if (deposit.status === 'สำเร็จ') {
            detailDepositStatus.classList.add('bg-emerald-500/10', 'text-emerald-400', 'border-emerald-500/20');
        } else {
            detailDepositStatus.classList.add('bg-rose-500/10', 'text-rose-400', 'border-rose-500/20');
        }

        detailDepositCustomer.textContent = deposit.customer_name;
        detailDepositPhone.textContent = deposit.customer_phone;
        detailDepositProduct.textContent = deposit.product_name;
        detailDepositImeiText.textContent = deposit.imei || 'ไม่ระบุ (จองล่วงหน้า/รอสินค้า)';
        detailDepositPrice.textContent = '฿' + deposit.product_price.toLocaleString();
        detailDepositPaid.textContent = '฿' + deposit.deposit_amount.toLocaleString() + ' (' + deposit.payment_method + ')';
        detailDepositRemaining.textContent = '฿' + deposit.remaining_amount.toLocaleString();

        const createdDate = new Date(deposit.createdAt).toLocaleDateString('th-TH', { hour: '2-digit', minute: '2-digit' }) + ' น.';
        const apptDate = deposit.appointment_date ? new Date(deposit.appointment_date).toLocaleDateString('th-TH') : 'ไม่ระบุ';
        detailDepositDates.innerHTML = `วันที่ทำจอง: <span class="text-white font-medium">${createdDate}</span><br/>นัดรับเครื่อง: <span class="text-white font-medium">${apptDate}</span>`;

        detailDepositSender.textContent = `${deposit.created_by?.name || '-'} / สาขา: ${deposit.branch_id?.name || '-'}`;

        detailPickupToPay.value = '฿' + deposit.remaining_amount.toLocaleString();
        detailPickupPaymentMethod.value = 'เงินสด';
        detailPickupSplitRow.classList.add('hidden');
        detailPickupCashAmount.value = '';
        detailPickupTransferAmount.value = '';
        detailCancelReason.value = '';

        if (deposit.status === 'รอดำเนินการ') {
            detailActionCompleteSection.classList.remove('hidden');
            detailActionCancelSection.classList.remove('hidden');
            detailHistoryInfoSection.classList.add('hidden');

            if (deposit.imei && deposit.imei.trim() !== '') {
                detailAssignImeiRow.classList.add('hidden');
            } else {
                detailAssignImeiRow.classList.remove('hidden');
                if (detailAssignImeiSelect) {
                    detailAssignImeiSelect.value = '';
                }
            }
        } else {
            detailActionCompleteSection.classList.add('hidden');
            detailActionCancelSection.classList.add('hidden');
            detailHistoryInfoSection.classList.remove('hidden');

            if (deposit.status === 'สำเร็จ') {
                detailHistoryCompletedByLabel.textContent = 'ผู้ส่งมอบสินค้า';
                detailHistoryCompletedAtLabel.textContent = 'วันเวลาที่ส่งมอบ';
                detailHistoryCompletedBy.textContent = deposit.completed_by?.name || '-';
                detailHistoryCompletedAt.textContent = new Date(deposit.completed_at).toLocaleString('th-TH');
                detailHistoryBillRow.classList.remove('hidden');
                detailHistoryBill.textContent = deposit.bill_number;
                detailHistoryReasonRow.classList.add('hidden');
            } else {
                detailHistoryCompletedByLabel.textContent = 'ผู้ยกเลิกรายการ';
                detailHistoryCompletedAtLabel.textContent = 'วันเวลาที่ยกเลิก';
                detailHistoryCompletedBy.textContent = deposit.cancelled_by?.name || '-';
                detailHistoryCompletedAt.textContent = new Date(deposit.cancelled_at).toLocaleString('th-TH');
                detailHistoryBillRow.classList.add('hidden');
                detailHistoryReasonRow.classList.remove('hidden');
                detailHistoryReason.textContent = deposit.cancel_reason || 'ไม่ระบุ';
            }
        }

        modalDepositDetails.classList.remove('opacity-0', 'pointer-events-none');
        const content = modalDepositDetails.querySelector('.modal-content');
        if (content) {
            content.classList.remove('scale-95');
            content.classList.add('scale-100');
        }
    };

    const closeDepositDetailsModal = () => {
        modalDepositDetails.classList.add('opacity-0', 'pointer-events-none');
        const content = modalDepositDetails.querySelector('.modal-content');
        if (content) {
            content.classList.remove('scale-100');
            content.classList.add('scale-95');
        }
    };

    async function printDepositSlip(depositId) {
        try {
            const token = localStorage.getItem('silmin_token');
            const r = await fetch(`/api/deposits?_id=${depositId}`, {
                headers: { 'Authorization': `Bearer ${token}` }
            });
            const d = await r.json();
            if (!d.success || !d.data || d.data.length === 0) {
                showToast('ไม่สามารถดึงข้อมูลสำหรับพิมพ์ได้', 'error');
                return;
            }
            const deposit = d.data[0];
            const printWindow = window.open('', '_blank', 'width=800,height=600');

            const dateStr = new Date(deposit.createdAt).toLocaleDateString('th-TH', { year: 'numeric', month: 'long', day: 'numeric', hour: '2-digit', minute: '2-digit' }) + ' น.';
            const apptStr = deposit.appointment_date ? new Date(deposit.appointment_date).toLocaleDateString('th-TH', { year: 'numeric', month: 'long', day: 'numeric' }) : 'ไม่ระบุ';

            printWindow.document.write(`
                <html>
                <head>
                    <title>ใบจองมัดจำสินค้า #${deposit.deposit_number}</title>
                    <style>
                        body { font-family: 'Sarabun', sans-serif; color: #333; padding: 20px; line-height: 1.6; }
                        .receipt-box { max-width: 600px; margin: 0 auto; border: 1px solid #ccc; padding: 20px; border-radius: 8px; }
                        .header { text-align: center; margin-bottom: 20px; }
                        .header h2 { margin: 0; color: #047857; }
                        .info-table { width: 100%; border-collapse: collapse; margin: 20px 0; }
                        .info-table td { padding: 8px 0; }
                        .info-table td.label { font-weight: bold; color: #555; width: 150px; }
                        .divider { border-top: 2px dashed #ccc; margin: 20px 0; }
                        .footer { text-align: center; font-size: 12px; color: #777; margin-top: 30px; }
                        .total-row { background: #f0fdf4; font-size: 16px; font-weight: bold; }
                        @media print {
                            body { padding: 0; }
                            .receipt-box { border: none; }
                        }
                    </style>
                </head>
                <body>
                    <div class="receipt-box">
                        <div class="header">
                            <h2>ใบเสร็จรับเงินมัดจำ / ใบจองสินค้า</h2>
                            <p style="margin: 5px 0;">สาขา: ${deposit.branch_id?.name || '-'}</p>
                            <p style="margin: 0; font-size: 13px; font-weight: bold; color: #555;">เลขที่ใบจอง: ${deposit.deposit_number}</p>
                        </div>
                        <div class="divider"></div>
                        <table class="info-table">
                            <tr>
                                <td class="label">วันที่ทำรายการ:</td>
                                <td>${dateStr}</td>
                            </tr>
                            <tr>
                                <td class="label">ชื่อลูกค้า:</td>
                                <td>${deposit.customer_name}</td>
                            </tr>
                            <tr>
                                <td class="label">เบอร์โทรศัพท์:</td>
                                <td>${deposit.customer_phone}</td>
                            </tr>
                            <tr class="divider">
                                <td colspan="2"><hr style="border: 0; border-top: 1px solid #eee;"/></td>
                            </tr>
                            <tr>
                                <td class="label">สินค้าที่จอง:</td>
                                <td style="font-weight: bold;">${deposit.product_name}</td>
                            </tr>
                            <tr>
                                <td class="label">เลข IMEI จอง:</td>
                                <td>${deposit.imei || 'ไม่ระบุ (รอสินค้า/รอลูกค้ารับเครื่อง)'}</td>
                            </tr>
                            <tr>
                                <td class="label">วันเวลานัดรับเครื่อง:</td>
                                <td>${apptStr}</td>
                            </tr>
                            <tr class="divider">
                                <td colspan="2"><hr style="border: 0; border-top: 1px solid #eee;"/></td>
                            </tr>
                            <tr>
                                <td class="label">ราคาเต็ม:</td>
                                <td>฿${deposit.product_price.toLocaleString()}</td>
                            </tr>
                            <tr class="total-row">
                                <td class="label" style="padding: 10px 0 10px 10px;">ยอดมัดจำแล้ว:</td>
                                <td style="padding: 10px 0; color: #047857;">฿${deposit.deposit_amount.toLocaleString()} (${deposit.payment_method})</td>
                            </tr>
                            <tr>
                                <td class="label">คงเหลือค้างชำระ:</td>
                                <td style="color: #b91c1c; font-weight: bold;">฿${deposit.remaining_amount.toLocaleString()}</td>
                            </tr>
                            <tr>
                                <td class="label">ขั้นตอนดำเนินงาน:</td>
                                <td>${deposit.stage}</td>
                            </tr>
                        </table>
                        <div class="divider"></div>
                        <p style="font-size: 11px; text-align: center; margin: 10px 0;">* กรุณาเก็บใบเสร็จรับเงินมัดจำนี้ไว้เพื่อเป็นหลักฐานในการรับสินค้า *</p>
                        <div class="footer">
                            <p>ผู้ทำรายการ: ${deposit.created_by?.name || '-'}</p>
                            <p>© SILMIN SELLER System</p>
                        </div>
                    </div>
                    <script>
                        window.onload = function() {
                            window.print();
                            setTimeout(function() { window.close(); }, 500);
                        };
                    <\/script>
                </body>
                </html>
            `);
            printWindow.document.close();
        } catch (e) {
            console.error('Print Error:', e);
            showToast('เกิดข้อผิดพลาดในการพิมพ์', 'error');
        }
    }

    // Set event listeners for filter controls
    if (depositFilterBranch) depositFilterBranch.addEventListener('change', loadDeposits);
    if (depositFilterStatus) depositFilterStatus.addEventListener('change', loadDeposits);
    if (depositFilterStage) depositFilterStage.addEventListener('change', loadDeposits);
    if (depositFilterStartDate) depositFilterStartDate.addEventListener('change', loadDeposits);
    if (depositFilterEndDate) depositFilterEndDate.addEventListener('change', loadDeposits);
    if (depositFilterSearch) depositFilterSearch.addEventListener('input', loadDeposits);

    // Open/Close Modals Listeners
    if (btnOpenCreateDeposit) btnOpenCreateDeposit.addEventListener('click', openCreateDepositModal);
    if (btnCloseCreateDeposit) btnCloseCreateDeposit.addEventListener('click', closeCreateDepositModal);
    if (btnCancelCreateDeposit) btnCancelCreateDeposit.addEventListener('click', closeCreateDepositModal);
    if (btnCloseDepositDetails) btnCloseDepositDetails.addEventListener('click', closeDepositDetailsModal);
    if (btnCloseDepositDetailModal) btnCloseDepositDetailModal.addEventListener('click', closeDepositDetailsModal);

    // Split rows on forms toggle
    if (modalDepositProductId) {
        modalDepositProductId.addEventListener('change', (e) => {
            const productName = e.target.value.trim();

            const matched = window.masterDataCache && Array.isArray(window.masterDataCache.productNames)
                ? window.masterDataCache.productNames.find(x => x.name.toLowerCase() === productName.toLowerCase())
                : null;

            if (!matched && productName !== '') {
                showToast('ไม่พบสินค้า "' + productName + '" ในการตั้งค่าระบบ', 'error');
                e.target.value = '';
                return;
            }

            modalDepositProductPrice.value = '';
            populateDepositColorAndCapacity();
            updateDepositRemaining(modalDepositProductPrice, modalDepositAmount, modalDepositRemaining);
        });
    }

    const handleDepositVariationChange = () => {
        const productName = modalDepositProductId.value.trim();
        const colorName = modalDepositColor ? modalDepositColor.value.trim() : '';
        const capacityName = modalDepositCapacity ? modalDepositCapacity.value.trim() : '';

        if (!productName || !colorName || !capacityName) return;
        if (typeof allProductsCache === 'undefined' || !Array.isArray(allProductsCache)) return;

        const matchedProduct = allProductsCache.find(p => {
            if (p.name !== productName) return false;
            const pColorName = p.color_id && (typeof p.color_id === 'object' ? p.color_id.name : p.color_id);
            const pCapName = p.capacity_id && (typeof p.capacity_id === 'object' ? p.capacity_id.name : p.capacity_id);
            return pColorName === colorName && pCapName === capacityName;
        });

        if (matchedProduct) {
            modalDepositProductPrice.value = matchedProduct.price || 0;
            updateDepositRemaining(modalDepositProductPrice, modalDepositAmount, modalDepositRemaining);
        } else {
            // ยังไม่แจ้ง error ทันที เผื่อผู้ใช้ยังพิมพ์ไม่เสร็จ
            modalDepositProductPrice.value = '';
            updateDepositRemaining(modalDepositProductPrice, modalDepositAmount, modalDepositRemaining);
        }
    };

    if (modalDepositColor) {
        modalDepositColor.addEventListener('change', handleDepositVariationChange);
    }

    if (modalDepositCapacity) {
        modalDepositCapacity.addEventListener('change', handleDepositVariationChange);
    }

    if (modalDepositProductPrice) {
        modalDepositProductPrice.addEventListener('input', () => {
            updateDepositRemaining(modalDepositProductPrice, modalDepositAmount, modalDepositRemaining);
        });
    }

    if (modalDepositAmount) {
        modalDepositAmount.addEventListener('input', (e) => {
            updateDepositRemaining(modalDepositProductPrice, modalDepositAmount, modalDepositRemaining);
            const val = Number(e.target.value) || 0;
            handlePaymentMethodChange(modalDepositPaymentMethod, depositSplitRow, modalDepositCashAmount, modalDepositTransferAmount, val);
        });
    }

    if (modalDepositPaymentMethod) {
        modalDepositPaymentMethod.addEventListener('change', (e) => {
            const val = Number(modalDepositAmount.value) || 0;
            handlePaymentMethodChange(e.target, depositSplitRow, modalDepositCashAmount, modalDepositTransferAmount, val);
        });
    }

    if (detailPickupPaymentMethod) {
        detailPickupPaymentMethod.addEventListener('change', (e) => {
            const val = activeDeposit ? activeDeposit.remaining_amount : 0;
            handlePaymentMethodChange(e.target, detailPickupSplitRow, detailPickupCashAmount, detailPickupTransferAmount, val);
        });
    }

    if (btnDepositDetailPrint) {
        btnDepositDetailPrint.addEventListener('click', () => {
            if (activeDeposit) {
                printDepositSlip(activeDeposit._id);
            }
        });
    }

    // Submit Create Form
    if (depositForm) {
        depositForm.addEventListener('submit', async (e) => {
            e.preventDefault();

            const customer_name = modalDepositCustomerName.value.trim();
            const customer_phone = modalDepositCustomerPhone.value.trim();

            const productNameInput = modalDepositProductId.value.trim();
            const colorNameInput = modalDepositColor ? modalDepositColor.value.trim() : '';
            const capacityNameInput = modalDepositCapacity ? modalDepositCapacity.value.trim() : '';

            if (!productNameInput) {
                showToast('กรุณาระบุชื่อสินค้า', 'error');
                return;
            }

            if (typeof allProductsCache === 'undefined' || !Array.isArray(allProductsCache)) {
                showToast('ระบบขัดข้อง กรุณาลองใหม่อีกครั้ง', 'error');
                return;
            }

            // จับคู่ SKU จาก ชื่อสินค้า + สี + ความจุ (ใช้ชื่อแทน _id เพราะ input เป็น text)
            let matchedProduct = allProductsCache.find(p => {
                if (p.name !== productNameInput) return false;
                const pColorName = p.color_id && (typeof p.color_id === 'object' ? p.color_id.name : p.color_id);
                const pCapName = p.capacity_id && (typeof p.capacity_id === 'object' ? p.capacity_id.name : p.capacity_id);
                return pColorName === colorNameInput && pCapName === capacityNameInput;
            });

            // หากไม่พบ SKU ที่ตรง ให้หา fallback จากชื่อสินค้าเท่านั้น
            if (!matchedProduct) {
                matchedProduct = allProductsCache.find(p => p.name === productNameInput);
            }

            if (!matchedProduct) {
                showToast('ไม่พบสินค้า "' + productNameInput + '" ในระบบ กรุณาตรวจสอบการตั้งค่าสินค้า', 'error');
                return;
            }

            const product_id = matchedProduct._id;
            const colorName = colorNameInput;
            const capacityName = capacityNameInput;
            const product_name = [productNameInput, capacityName, colorName].filter(Boolean).join(' ').trim();

            const product_price = Number(modalDepositProductPrice.value) || 0;
            const deposit_amount = Number(modalDepositAmount.value) || 0;
            const appointment_date = modalDepositAppointment.value;
            const imei = modalDepositImei.value.trim();
            const payment_method = modalDepositPaymentMethod.value;
            const cash_amount = Number(modalDepositCashAmount.value) || 0;
            const transfer_amount = Number(modalDepositTransferAmount.value) || 0;
            const stage = modalDepositStage.value;
            const notes = modalDepositNotes.value.trim();

            if (payment_method === 'ผสม' && (cash_amount + transfer_amount !== deposit_amount)) {
                showToast('ยอดเงินสดและยอดเงินโอนต้องรวมกันได้เท่ากับยอดมัดจำ', 'error');
                return;
            }

            const submitBtn = document.getElementById('btn-submit-deposit');
            submitBtn.disabled = true;
            submitBtn.innerHTML = '<i class="fa-solid fa-spinner fa-spin"></i> กำลังบันทึก...';

            try {
                let body = {
                    customer_name, customer_phone, product_id, product_name, product_price,
                    deposit_amount, appointment_date, imei, payment_method, stage, notes
                };
                if (payment_method === 'ผสม') {
                    body.cash_amount = cash_amount;
                    body.transfer_amount = transfer_amount;
                } else if (payment_method === 'เงินสด') {
                    body.cash_amount = deposit_amount;
                    body.transfer_amount = 0;
                } else {
                    body.cash_amount = 0;
                    body.transfer_amount = deposit_amount;
                }

                const token = localStorage.getItem('silmin_token');
                const response = await fetch('/api/deposits', {
                    method: 'POST',
                    headers: {
                        'Authorization': `Bearer ${token}`,
                        'Content-Type': 'application/json'
                    },
                    body: JSON.stringify(body)
                });

                const result = await response.json();
                if (result.success) {
                    showToast('บันทึกใบมัดจำสินค้าสำเร็จเรียบร้อยแล้ว!');
                    closeCreateDepositModal();
                    loadDeposits();
                } else {
                    showToast(result.message || 'เกิดข้อผิดพลาดในการบันทึก', 'error');
                }
            } catch (err) {
                console.error(err);
                showToast('ไม่สามารถติดต่อเซิร์ฟเวอร์ได้', 'error');
            } finally {
                submitBtn.disabled = false;
                submitBtn.innerHTML = '<i class="fa-solid fa-save"></i> บันทึกข้อมูล';
            }
        });
    }

    // Submit Handover Complete
    if (btnSubmitCompleteDeposit) {
        btnSubmitCompleteDeposit.addEventListener('click', async () => {
            if (!activeDeposit) return;

            const imeiSelect = document.getElementById('detail-assign-imei-select');
            let imeiValue = activeDeposit.imei;
            if ((!imeiValue || imeiValue.trim() === '') && imeiSelect) {
                imeiValue = imeiSelect.value.trim();
                if (!imeiValue) {
                    showToast('กรุณาระบุ IMEI ของเครื่องที่ส่งมอบ', 'error');
                    return;
                }
            }

            const method = detailPickupPaymentMethod.value;
            const cash = Number(detailPickupCashAmount.value) || 0;
            const transfer = Number(detailPickupTransferAmount.value) || 0;
            const remaining = activeDeposit.remaining_amount;

            if (method === 'ผสม' && (cash + transfer !== remaining)) {
                showToast('ยอดเงินสดและยอดเงินโอนต้องรวมกันเท่ากับยอดค้างชำระ: ฿' + remaining.toLocaleString(), 'error');
                return;
            }

            btnSubmitCompleteDeposit.disabled = true;
            btnSubmitCompleteDeposit.innerHTML = '<i class="fa-solid fa-spinner fa-spin"></i> กำลังส่งมอบ...';

            try {
                let body = {
                    final_payment_method: method,
                    imei: imeiValue
                };
                if (method === 'ผสม') {
                    body.final_cash_amount = cash;
                    body.final_transfer_amount = transfer;
                } else if (method === 'เงินสด') {
                    body.final_cash_amount = remaining;
                    body.final_transfer_amount = 0;
                } else {
                    body.final_cash_amount = 0;
                    body.final_transfer_amount = remaining;
                }

                const token = localStorage.getItem('silmin_token');
                const response = await fetch(`/api/deposits/${activeDeposit._id}/complete`, {
                    method: 'PUT',
                    headers: {
                        'Authorization': `Bearer ${token}`,
                        'Content-Type': 'application/json'
                    },
                    body: JSON.stringify(body)
                });

                const result = await response.json();
                if (result.success) {
                    showToast('ดำเนินการส่งมอบเครื่องและตัดสต็อกสำเร็จเรียบร้อยแล้ว!');
                    closeDepositDetailsModal();
                    loadDeposits();
                } else {
                    showToast(result.message || 'เกิดข้อผิดพลาดในการส่งมอบ', 'error');
                }
            } catch (err) {
                console.error(err);
                showToast('ไม่สามารถติดต่อเซิร์ฟเวอร์ได้', 'error');
            } finally {
                btnSubmitCompleteDeposit.disabled = false;
                btnSubmitCompleteDeposit.innerHTML = '<i class="fa-solid fa-circle-check"></i> ยืนยันส่งมอบและปิดบิลขาย';
            }
        });
    }

    // Submit Cancel Form
    if (btnSubmitCancelDeposit) {
        btnSubmitCancelDeposit.addEventListener('click', async () => {
            if (!activeDeposit) return;
            const reason = detailCancelReason.value.trim();
            if (!reason) {
                showToast('กรุณาระบุเหตุผลในการยกเลิกใบมัดจำ', 'error');
                return;
            }

            if (!confirm('ยืนยันในการยกเลิกใบมัดจำสินค้าใบนี้?')) return;

            btnSubmitCancelDeposit.disabled = true;
            btnSubmitCancelDeposit.innerHTML = '<i class="fa-solid fa-spinner fa-spin"></i> กำลังดำเนินการ...';

            try {
                const token = localStorage.getItem('silmin_token');
                const response = await fetch(`/api/deposits/${activeDeposit._id}/cancel`, {
                    method: 'PUT',
                    headers: {
                        'Authorization': `Bearer ${token}`,
                        'Content-Type': 'application/json'
                    },
                    body: JSON.stringify({ reason })
                });
                const result = await response.json();
                if (result.success) {
                    showToast('ยกเลิกใบจองมัดจำสินค้าเรียบร้อยแล้ว');
                    closeDepositDetailsModal();
                    loadDeposits();
                } else {
                    showToast(result.message || 'เกิดข้อผิดพลาด', 'error');
                }
            } catch (err) {
                console.error(err);
                showToast('ไม่สามารถติดต่อเซิร์ฟเวอร์ได้', 'error');
            } finally {
                btnSubmitCancelDeposit.disabled = false;
                btnSubmitCancelDeposit.innerHTML = '<i class="fa-solid fa-ban"></i> ยืนยันยกเลิกรายการจอง';
            }
        });
    }

    // Expose functions to window
    window.openDepositDetailsModal = openDepositDetailsModal;
    window.printDepositSlip = printDepositSlip;
    window.loadDeposits = loadDeposits;
    window.openCreateDepositModal = openCreateDepositModal;
    window.closeCreateDepositModal = closeCreateDepositModal;
    window.closeDepositDetailsModal = closeDepositDetailsModal;
    window.loadBranchesForDeposits = loadBranchesForDeposits;


})();
