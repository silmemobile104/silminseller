// TRANSFERS MODULE (การโอนย้ายสินค้าระหว่างสาขา)
// แยกออกมาจาก script.js — โหลดแบบ dynamic เฉพาะตอนเปิดหน้า "การโอนย้ายสินค้า" ครั้งแรกเท่านั้น
// พึ่งพา window.authFetch, window.showToast, window.showConfirm, window.pollPendingTransfers, API_BASE_URL (global จาก script.js)
(function () {
    // DOM elements ที่หน้านี้ใช้ (ดึงเองแยกจาก core เพราะ const เดิมอยู่คนละไฟล์กันแล้ว)
    const btnOpenCreateTransfer = document.getElementById('btn-open-create-transfer');
    const modalCreateTransfer = document.getElementById('modal-create-transfer');
    const transferFromBranch = document.getElementById('transfer-from-branch');
    const transferToBranch = document.getElementById('transfer-to-branch');
    const transferScanInput = document.getElementById('transfer-scan-input');
    const transferScanHint = document.getElementById('transfer-scan-hint');
    const transferScanStatus = document.getElementById('transfer-scan-status');
    const btnTransferScanAdd = document.getElementById('btn-transfer-scan-add');
    const transferCartItems = document.getElementById('transfer-cart-items');
    const transferCartEmpty = document.getElementById('transfer-cart-empty');
    const transferCartCount = document.getElementById('transfer-cart-count');
    const btnSubmitTransfer = document.getElementById('btn-submit-transfer');
    const transferTabIncoming = document.getElementById('transfer-tab-incoming');
    const transferTabHistory = document.getElementById('transfer-tab-history');
    const transferTableBody = document.getElementById('transfer-table-body');
    const transferEmpty = document.getElementById('transfer-empty');
    const btnCloseCreateTransfer = document.getElementById('btn-close-create-transfer');

    // Transfer State (ดึงมาจาก core เดิม — ย้ายมาเป็น local state ของไฟล์นี้)
    let transferCart = [];
    let currentTransferTab = 'incoming'; // 'incoming' or 'history'
    let transfersData = [];
    let branchesForTransfer = []; // รายชื่อสาขาทั้งหมด (cache ไว้ใช้กรองสาขาปลายทาง)

    // ผู้ใช้ปัจจุบัน + สาขาของตัวเอง
    function getCurrentUser() {
        try {
            return JSON.parse(localStorage.getItem('silmin_user') || '{}');
        } catch (e) {
            return {};
        }
    }

    // สาขาต้นทางคือสาขาของผู้ใช้ที่ล็อกอินเสมอ (เลือกเองไม่ได้)
    function getTransferSourceBranchId() {
        const user = getCurrentUser();
        return user.branch ? (user.branch._id || user.branch) : '';
    }

    // แสดงผลการสแกนค้างไว้ในกล่องรายการ (toast เด้ง 3 วิแล้วหาย อาจมองไม่ทัน)
    function setScanStatus(message, type) {
        if (!transferScanStatus) return;
        if (!message) {
            transferScanStatus.classList.add('hidden');
            transferScanStatus.textContent = '';
            return;
        }
        const style = type === 'error'
            ? 'bg-red-500/10 text-red-300 border border-red-500/30'
            : 'bg-emerald-500/10 text-emerald-300 border border-emerald-500/30';
        transferScanStatus.className = `mx-4 mt-4 px-3 py-2.5 rounded-xl text-xs font-medium ${style}`;
        transferScanStatus.textContent = message;
    }

    // แจ้งผลการสแกนทั้งแบบ toast และแบบค้างในกล่องรายการ
    function scanFeedback(message, type) {
        showToast(message, type);
        setScanStatus(message, type);
    }

    // ==========================================
    // TRANSFERS MODULE (โอนย้ายสินค้าระหว่างสาขา)
    // ==========================================

    // Load Transfers
    async function loadTransfers() {
        if (!transferTableBody) return;
        try {
            const response = await authFetch(`${API_BASE_URL}/transfers`);
            const result = await response.json();
            if (result.success) {
                transfersData = result.data;
                renderTransfersTable();
            } else {
                showToast(result.message || 'ไม่สามารถโหลดรายการโอนย้ายได้', 'error');
            }
        } catch (err) {
            showToast('ไม่สามารถเชื่อมต่อกับเซิร์ฟเวอร์ได้', 'error');
        }
    }
    window.loadTransfers = loadTransfers;

    // Render Transfers Table
    function renderTransfersTable() {
        if (!transferTableBody) return;
        transferTableBody.innerHTML = '';

        const filteredTransfers = transfersData.filter(t => {
            if (currentTransferTab === 'incoming') {
                return t.status === 'รอดำเนินการ';
            } else {
                return true; // แสดงทั้งหมดในประวัติ
            }
        });

        if (filteredTransfers.length === 0) {
            if (transferEmpty) transferEmpty.classList.remove('hidden');
            return;
        }

        if (transferEmpty) transferEmpty.classList.add('hidden');

        filteredTransfers.forEach(transfer => {
            const row = document.createElement('tr');
            row.className = 'hover:bg-slate-700/30 transition-colors';

            const dateStr = new Date(transfer.created_at).toLocaleString('th-TH');
            const fromBranch = transfer.from_branch?.name || '-';
            const toBranch = transfer.to_branch?.name || '-';
            const statusClass = transfer.status === 'รอดำเนินการ'
                ? 'bg-amber-500/10 text-amber-400 border border-amber-500/20'
                : 'bg-emerald-500/10 text-emerald-400 border border-emerald-500/20';

            const actionButtons = `<div class="flex items-center justify-end gap-2">
                    <button onclick="openTransferDetailModal('${transfer._id}')" class="px-3 py-1.5 rounded-lg bg-cyan-500 hover:bg-cyan-400 text-slate-900 text-xs font-bold transition-all">
                        ดูรายละเอียด
                    </button>
                   </div>`;

            row.innerHTML = `
                <td class="px-6 py-4 text-slate-300">${dateStr}</td>
                <td class="px-6 py-4 text-cyan-400 font-mono">${transfer.transfer_number}</td>
                <td class="px-6 py-4 text-slate-300">${fromBranch}</td>
                <td class="px-6 py-4 text-slate-300">${toBranch}</td>
                <td class="px-6 py-4">
                    <span class="px-2.5 py-1 rounded-lg text-xs font-bold ${statusClass}">${transfer.status}</span>
                </td>
                <td class="px-6 py-4 text-right">${actionButtons}</td>
            `;
            transferTableBody.appendChild(row);
        });
    }

    // Open View Transfer Modal
    window.openTransferDetailModal = function (transferId) {
        const transfer = transfersData.find(t => t._id === transferId);
        if (!transfer) return;

        const modal = document.getElementById('modal-transfer-view');
        if (!modal) return;

        const numEl = document.getElementById('transfer-view-number');
        const statusEl = document.getElementById('transfer-view-status');
        const fromEl = document.getElementById('transfer-view-from');
        const toEl = document.getElementById('transfer-view-to');
        const dateEl = document.getElementById('transfer-view-date');
        const senderEl = document.getElementById('transfer-view-sender');
        const itemsBody = document.getElementById('transfer-view-items-body');
        const btnPrint = document.getElementById('btn-transfer-view-print');
        const btnReceive = document.getElementById('btn-transfer-view-receive');

        if (numEl) numEl.textContent = transfer.transfer_number;

        if (statusEl) {
            statusEl.textContent = transfer.status;
            statusEl.className = 'px-2.5 py-1 rounded text-xs font-bold ' +
                (transfer.status === 'รอดำเนินการ'
                    ? 'bg-amber-500/10 text-amber-400 border border-amber-500/20'
                    : 'bg-emerald-500/10 text-emerald-400 border border-emerald-500/20');
        }

        if (fromEl) fromEl.textContent = transfer.from_branch?.name || '-';
        if (toEl) toEl.textContent = transfer.to_branch?.name || '-';
        if (dateEl) dateEl.textContent = new Date(transfer.created_at).toLocaleString('th-TH');
        if (senderEl) senderEl.textContent = transfer.created_by?.name || '-';

        if (itemsBody) {
            itemsBody.innerHTML = '';
            (transfer.items || []).forEach(item => {
                const tr = document.createElement('tr');
                tr.className = 'border-b border-slate-700/50';

                const colorStr = item.color ? `สี: ${item.color}` : '';
                const capStr = item.capacity ? `ความจุ: ${item.capacity}` : '';
                const details = [colorStr, capStr].filter(Boolean).join(' / ') || '-';

                const imeiHtml = item.imeis && item.imeis.length > 0
                    ? `<div class="flex flex-wrap gap-1 mt-1.5">
                        ${item.imeis.map(imei => `<span class="bg-cyan-500/10 text-cyan-400 px-1.5 py-0.5 rounded text-[10px] font-mono border border-cyan-500/20">${imei}</span>`).join('')}
                       </div>`
                    : '';

                tr.innerHTML = `
                    <td class="px-4 py-3">
                        <div class="font-medium">${item.product_name}</div>
                        <div class="text-slate-400 text-xs font-mono">${item.product_code}</div>
                        ${imeiHtml}
                    </td>
                    <td class="px-4 py-3 text-slate-400 text-xs">${details}</td>
                    <td class="px-4 py-3 text-right text-white font-bold font-mono">${item.quantity} ${item.unit || 'ชิ้น'}</td>
                `;
                itemsBody.appendChild(tr);
            });
        }

        if (btnPrint) {
            btnPrint.onclick = () => {
                printTransferDocument(transferId);
            };
        }

        if (btnReceive) {
            if (transfer.status === 'รอดำเนินการ') {
                btnReceive.classList.remove('hidden');
                btnReceive.onclick = async () => {
                    closeTransferViewModal();
                    await receiveTransfer(transferId);
                };
            } else {
                btnReceive.classList.add('hidden');
            }
        }

        modal.classList.remove('opacity-0', 'pointer-events-none');
        modal.children[0].classList.remove('scale-95');
    };

    const modalTransferView = document.getElementById('modal-transfer-view');
    const btnCloseTransferView = document.getElementById('btn-close-transfer-view');
    const btnTransferViewCloseModal = document.getElementById('btn-transfer-view-close-modal');

    window.closeTransferViewModal = function () {
        if (!modalTransferView) return;
        modalTransferView.classList.add('opacity-0', 'pointer-events-none');
        modalTransferView.children[0].classList.add('scale-95');
    };

    if (btnCloseTransferView) btnCloseTransferView.onclick = closeTransferViewModal;
    if (btnTransferViewCloseModal) btnTransferViewCloseModal.onclick = closeTransferViewModal;

    // Switch Transfer Tab
    function switchTransferTab(tab) {
        currentTransferTab = tab;
        if (transferTabIncoming && transferTabHistory) {
            if (tab === 'incoming') {
                transferTabIncoming.className = 'px-4 py-2 rounded-xl text-sm font-bold bg-cyan-500/10 text-cyan-400 border border-cyan-500/20 transition-all';
                transferTabHistory.className = 'px-4 py-2 rounded-xl text-sm font-bold bg-slate-900/40 text-slate-300 border border-slate-700 hover:border-slate-600 transition-all';
            } else {
                transferTabHistory.className = 'px-4 py-2 rounded-xl text-sm font-bold bg-cyan-500/10 text-cyan-400 border border-cyan-500/20 transition-all';
                transferTabIncoming.className = 'px-4 py-2 rounded-xl text-sm font-bold bg-slate-900/40 text-slate-300 border border-slate-700 hover:border-slate-600 transition-all';
            }
        }
        renderTransfersTable();
    }

    // Open/Close Transfer Modal
    async function openTransferModal() {
        if (!modalCreateTransfer) return;
        modalCreateTransfer.classList.remove('opacity-0', 'pointer-events-none');
        transferCart = [];
        renderTransferCart();
        setScanStatus('');
        if (transferToBranch) transferToBranch.value = '';
        await loadBranchesForTransfer();
        if (transferScanInput) {
            transferScanInput.value = '';
            transferScanInput.focus();
        }
    }

    function closeTransferModal() {
        if (!modalCreateTransfer) return;
        modalCreateTransfer.classList.add('opacity-0', 'pointer-events-none');
        transferCart = [];
        renderTransferCart();
        setScanStatus('');
        if (transferToBranch) transferToBranch.value = '';
        if (transferScanInput) transferScanInput.value = '';
    }

    // เติมรายชื่อสาขาปลายทาง (ตัดสาขาต้นทางที่เลือกอยู่ออก)
    function renderDestinationBranches() {
        if (!transferToBranch) return;
        const sourceId = getTransferSourceBranchId();
        const previous = transferToBranch.value;

        transferToBranch.innerHTML = '<option value="" disabled selected>-- เลือกสาขาปลายทาง --</option>';
        branchesForTransfer
            .filter(branch => branch._id !== sourceId)
            .forEach(branch => {
                const option = document.createElement('option');
                option.value = branch._id;
                option.textContent = branch.name;
                transferToBranch.appendChild(option);
            });

        // คงค่าเดิมไว้ถ้ายังเลือกได้อยู่
        if (previous && previous !== sourceId) transferToBranch.value = previous;
    }

    // อัปเดตข้อความบอกว่ากำลังสแกนจากสต็อกสาขาไหน
    function updateScanHint() {
        if (!transferScanHint) return;
        const sourceId = getTransferSourceBranchId();
        const branch = branchesForTransfer.find(b => b._id === sourceId);
        transferScanHint.textContent = branch ? branch.name : 'สาขาต้นทาง';
    }

    // Load Branches for Transfer (ต้นทาง = สาขาที่ล็อกอิน, ปลายทาง = สาขาอื่นทั้งหมด)
    async function loadBranchesForTransfer() {
        if (!transferToBranch) return;
        const sourceId = getTransferSourceBranchId();

        try {
            const response = await authFetch(`${API_BASE_URL}/branches`);
            const result = await response.json();

            if (!result.success || !Array.isArray(result.data)) {
                console.error('[TRANSFER] Failed to load branches:', result.message);
                showToast('ไม่สามารถโหลดข้อมูลสาขาได้', 'error');
                return;
            }

            branchesForTransfer = result.data;
            const ownBranch = branchesForTransfer.find(b => b._id === sourceId);

            // ช่องสาขาต้นทางเป็นแบบอ่านอย่างเดียว — ยึดตามสาขาของผู้ใช้ที่ล็อกอินเสมอ
            if (transferFromBranch) {
                transferFromBranch.innerHTML = ownBranch
                    ? `<option value="${ownBranch._id}" selected>${ownBranch.name}</option>`
                    : '<option value="" disabled selected>-- ไม่พบสาขาต้นทาง --</option>';
                transferFromBranch.disabled = true;
            }

            if (!ownBranch) {
                showToast('บัญชีของคุณยังไม่ได้ผูกกับสาขา กรุณาติดต่อผู้ดูแลระบบ', 'error');
            }

            renderDestinationBranches();
            updateScanHint();

            if (transferToBranch.options.length <= 1) {
                showToast('ไม่มีสาขาปลายทางให้เลือก', 'error');
            }
        } catch (err) {
            console.error('[TRANSFER] Error loading branches:', err);
            showToast('ไม่สามารถโหลดข้อมูลสาขาได้', 'error');
        }
    }

    // Add Product to Transfer Cart (by scanning barcode or IMEI)
    async function addProductToTransferCart(code) {
        const sourceBranchId = getTransferSourceBranchId();
        if (!sourceBranchId) {
            scanFeedback('บัญชีของคุณยังไม่ได้ผูกกับสาขา จึงสแกนสินค้าเพื่อโอนย้ายไม่ได้', 'error');
            return;
        }

        try {
            const response = await authFetch(`${API_BASE_URL}/products/search?code=${encodeURIComponent(code)}&branch_id=${encodeURIComponent(sourceBranchId)}`);
            const result = await response.json();

            if (result.success && result.product) {
                const product = result.product;
                const hasImeis = Array.isArray(product.imeis) && product.imeis.length > 0;

                if (hasImeis) {
                    // Check if the scanned code is one of the IMEIs of this product
                    const isImeiScan = product.imeis.includes(code);
                    if (!isImeiScan) {
                        scanFeedback(`สินค้าประเภทเครื่อง ${product.name} กรุณาสแกนหรือระบุหมายเลข IMEI แทนรหัสสินค้า`, 'error');
                        return;
                    }

                    // Check if this IMEI is already in transferCart
                    const isAlreadyScanned = transferCart.some(item => Array.isArray(item.imeis) && item.imeis.includes(code));
                    if (isAlreadyScanned) {
                        scanFeedback(`หมายเลข IMEI: ${code} ถูกสแกนเพิ่มในใบโอนแล้ว`, 'error');
                        return;
                    }

                    const existingItem = transferCart.find(item => item.product_code === product.product_code);
                    if (existingItem) {
                        if (!Array.isArray(existingItem.imeis)) existingItem.imeis = [];
                        existingItem.imeis.push(code);
                        existingItem.quantity = existingItem.imeis.length;
                    } else {
                        transferCart.push({
                            product_name: product.name,
                            product_code: product.product_code,
                            imeis: [code],
                            quantity: 1,
                            unit: product.unit_id?.name || 'เครื่อง',
                            color: product.color_id?.name || '',
                            capacity: product.capacity_id?.name || '',
                            condition: product.condition_id?.name || ''
                        });
                    }
                } else {
                    // Non-IMEI accessory: traditional counter quantity
                    const available = Number(product.quantity || 0);
                    if (available <= 0) {
                        scanFeedback(`${product.name} ไม่มีสต็อกคงเหลือที่สาขาต้นทาง`, 'error');
                        return;
                    }

                    const existingItem = transferCart.find(item => item.product_code === product.product_code);
                    if (existingItem) {
                        if (existingItem.quantity + 1 > available) {
                            scanFeedback(`${product.name} มีสต็อกที่สาขาต้นทางเพียง ${available} ${product.unit_id?.name || 'ชิ้น'}`, 'error');
                            return;
                        }
                        existingItem.quantity += 1;
                        if (!existingItem.color) existingItem.color = product.color_id?.name || '';
                        if (!existingItem.capacity) existingItem.capacity = product.capacity_id?.name || '';
                        if (!existingItem.condition) existingItem.condition = product.condition_id?.name || '';
                    } else {
                        transferCart.push({
                            product_name: product.name,
                            product_code: product.product_code,
                            imeis: [],
                            quantity: 1,
                            unit: product.unit_id?.name || 'ชิ้น',
                            color: product.color_id?.name || '',
                            capacity: product.capacity_id?.name || '',
                            condition: product.condition_id?.name || ''
                        });
                    }
                }

                renderTransferCart();
                scanFeedback(`เพิ่ม ${product.name} (${code}) ลงรายการโอนย้ายแล้ว`);
            } else {
                const branchName = transferScanHint ? transferScanHint.textContent : 'สาขาต้นทาง';
                scanFeedback(`ไม่พบ ${code} ในสต็อกของสาขา ${branchName}`, 'error');
            }
        } catch (err) {
            console.error('[TRANSFER] Error searching product:', err);
            scanFeedback('ไม่สามารถค้นหาสินค้าได้ กรุณาตรวจสอบการเชื่อมต่อเซิร์ฟเวอร์', 'error');
        }

        if (transferScanInput) {
            transferScanInput.value = '';
            transferScanInput.focus();
        }
    }

    // Render Transfer Cart
    function renderTransferCart() {
        if (!transferCartItems || !transferCartCount) return;

        if (transferCart.length === 0) {
            if (transferCartEmpty) {
                const branch = branchesForTransfer.find(b => b._id === getTransferSourceBranchId());
                transferCartEmpty.textContent = branch
                    ? `ยังไม่มีสินค้าในรายการโอนย้าย — สแกนหรือพิมพ์ IMEI ของสินค้าที่สาขา ${branch.name} แล้วกด Enter`
                    : 'ยังไม่มีสินค้าในรายการโอนย้าย';
                transferCartEmpty.classList.remove('hidden');
                transferCartItems.innerHTML = '';
                transferCartItems.appendChild(transferCartEmpty);
            }
            transferCartCount.textContent = '0 รายการ';
            return;
        }

        if (transferCartEmpty) transferCartEmpty.classList.add('hidden');
        transferCartCount.textContent = `${transferCart.length} รายการ`;

        transferCartItems.innerHTML = '';
        transferCart.forEach((item, index) => {
            const div = document.createElement('div');
            div.className = 'flex items-center justify-between bg-slate-900/40 rounded-xl p-3 border border-slate-700';
            div.innerHTML = `
                <div class="flex-1">
                    <div class="text-white font-medium">${item.product_name}</div>
                    <div class="text-slate-400 text-xs">${item.product_code} | จำนวน: ${item.quantity}</div>
                    ${item.imeis && item.imeis.length > 0 ? `
                        <div class="flex flex-wrap gap-1 mt-1.5">
                            ${item.imeis.map(imei => `
                                <span class="bg-cyan-500/10 text-cyan-400 px-2 py-0.5 rounded text-[10px] font-mono border border-cyan-500/20">${imei}</span>
                            `).join('')}
                        </div>
                    ` : ''}
                </div>
                <button onclick="removeFromTransferCart(${index})" class="text-red-400 hover:text-red-300 p-2">
                    <i class="fa-solid fa-trash"></i>
                </button>
            `;
            transferCartItems.appendChild(div);
        });
    }

    // Remove from Transfer Cart
    window.removeFromTransferCart = function (index) {
        transferCart.splice(index, 1);
        renderTransferCart();
    };

    // Submit Transfer
    async function submitTransfer() {
        if (transferCart.length === 0) {
            showToast('กรุณาเพิ่มสินค้าในรายการโอนย้าย', 'error');
            return;
        }

        const sourceBranchId = getTransferSourceBranchId();
        if (!sourceBranchId) {
            showToast('บัญชีของคุณยังไม่ได้ผูกกับสาขา จึงสร้างใบโอนไม่ได้', 'error');
            return;
        }

        if (!transferToBranch || !transferToBranch.value) {
            showToast('กรุณาเลือกสาขาปลายทาง', 'error');
            return;
        }

        if (transferToBranch.value === sourceBranchId) {
            showToast('ไม่สามารถโอนย้ายไปสาขาเดียวกันได้', 'error');
            return;
        }

        const originalBtnText = btnSubmitTransfer ? btnSubmitTransfer.innerHTML : '';
        if (btnSubmitTransfer) {
            btnSubmitTransfer.disabled = true;
            btnSubmitTransfer.innerHTML = '<i class="fa-solid fa-circle-notch fa-spin"></i> กำลังบันทึก...';
        }

        try {
            const response = await authFetch(`${API_BASE_URL}/transfers`, {
                method: 'POST',
                headers: { 'Content-Type': 'application/json' },
                body: JSON.stringify({
                    to_branch: transferToBranch.value,
                    items: transferCart
                })
            });

            const result = await response.json();

            if (result.success) {
                showToast('สร้างรายการโอนย้ายสำเร็จ');
                closeTransferModal();
                loadTransfers();
                pollPendingTransfers();

                // Show print option
                if (result.data && result.data._id) {
                    setTimeout(() => {
                        showConfirm('พิมพ์ใบโอนย้ายสินค้า', 'ต้องการพิมพ์ใบโอนย้ายสินค้าหรือไม่?', () => {
                            printTransferDocument(result.data._id);
                        }, 'พิมพ์ใบโอน');
                    }, 500);
                }
            } else {
                showToast(result.message || 'เกิดข้อผิดพลาด', 'error');
            }
        } catch (err) {
            console.error('[TRANSFER] Error submitting transfer:', err);
            showToast('ไม่สามารถเชื่อมต่อกับเซิร์ฟเวอร์ได้', 'error');
        } finally {
            if (btnSubmitTransfer) {
                btnSubmitTransfer.disabled = false;
                btnSubmitTransfer.innerHTML = originalBtnText;
            }
        }
    }

    // Receive Transfer
    window.receiveTransfer = async function (transferId) {
        showConfirm('ยืนยันการรับสินค้า', 'ยืนยันการรับเข้าสินค้า? สินค้าจะถูกเพิ่มเข้าสต็อกของสาขาปลายทาง', async () => {
            try {
                const response = await authFetch(`${API_BASE_URL}/transfers/${transferId}/receive`, {
                    method: 'PUT',
                    headers: { 'Content-Type': 'application/json' }
                });

                const result = await response.json();

                if (result.success) {
                    showToast('รับเข้าสินค้าสำเร็จ');
                    loadTransfers();
                    pollPendingTransfers();
                } else {
                    showToast(result.message || 'เกิดข้อผิดพลาด', 'error');
                }
            } catch (err) {
                showToast('ไม่สามารถเชื่อมต่อกับเซิร์ฟเวอร์ได้', 'error');
            }
        }, 'รับเข้าสต็อก');
    };

    // Print Transfer Document
    window.printTransferDocument = async function (transferId) {
        try {
            const response = await authFetch(`${API_BASE_URL}/transfers/${transferId}`);
            const result = await response.json();

            if (result.success && result.data) {
                const transfer = result.data;

                // Prepare data for document
                const documentData = {
                    transfer_number: transfer.transfer_number,
                    from_branch_name: transfer.from_branch?.name || '',
                    from_branch_address: transfer.from_branch?.address || '',
                    to_branch_name: transfer.to_branch?.name || '',
                    created_at: transfer.created_at,
                    items: transfer.items,
                    company_name: 'บริษัท ชิลมีน โมบาย จำกัด',
                    employee_name: transfer.created_by?.name || ''
                };

                // Open document in new window with data as URL parameter
                const dataParam = encodeURIComponent(JSON.stringify(documentData));
                const newWindow = window.open(`transfer-document.html?data=${dataParam}`, '_blank');

                if (!newWindow) {
                    showToast('ไม่สามารถเปิดหน้าต่างพิมพ์ได้', 'error');
                }
            } else {
                showToast(result.message || 'ไม่สามารถดึงข้อมูลรายการโอนย้ายได้', 'error');
            }
        } catch (err) {
            showToast('ไม่สามารถเชื่อมต่อกับเซิร์ฟเวอร์ได้', 'error');
        }
    };

    // Transfer Event Listeners
    if (transferTabIncoming) transferTabIncoming.addEventListener('click', () => switchTransferTab('incoming'));
    if (transferTabHistory) transferTabHistory.addEventListener('click', () => switchTransferTab('history'));
    if (btnOpenCreateTransfer) btnOpenCreateTransfer.addEventListener('click', openTransferModal);
    if (btnCloseCreateTransfer) btnCloseCreateTransfer.addEventListener('click', closeTransferModal);
    // ยิงค้นหาสินค้าจากช่องสแกน (ใช้ร่วมกันทั้งกด Enter และกดปุ่ม "เพิ่ม")
    function submitScanInput() {
        if (!transferScanInput) return;
        const code = transferScanInput.value.trim();
        if (!code) {
            scanFeedback('กรุณากรอกรหัสสินค้า หรือหมายเลข IMEI ก่อน', 'error');
            transferScanInput.focus();
            return;
        }
        addProductToTransferCart(code);
    }

    if (transferScanInput) {
        transferScanInput.addEventListener('keydown', (e) => {
            if (e.key === 'Enter') {
                e.preventDefault();
                submitScanInput();
            }
        });
    }
    if (btnTransferScanAdd) btnTransferScanAdd.addEventListener('click', submitScanInput);
    if (btnSubmitTransfer) btnSubmitTransfer.addEventListener('click', submitTransfer);
})();
