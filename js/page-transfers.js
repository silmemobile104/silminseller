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
    const btnCloseCreateTransfer = document.getElementById('btn-close-create-transfer');
    const transferToBranchError = document.getElementById('transfer-to-branch-error');
    const transferCartError = document.getElementById('transfer-cart-error');
    const transferCartBox = document.getElementById('transfer-cart-box');
    // แถบควบคุม + ชิปตัวกรอง (DESIGN.md ข้อ 11.4 - 11.5)
    const transferSearchInput = document.getElementById('transfer-search-input');
    const transferFilterDirection = document.getElementById('transfer-filter-direction');
    const transferFilterStatus = document.getElementById('transfer-filter-status');
    const transferActiveFilters = document.getElementById('transfer-active-filters');
    const transferResultCount = document.getElementById('transfer-result-count');
    const transferPanelTitle = document.getElementById('transfer-panel-title');
    const badgeTransferPending = document.getElementById('badge-transfer-pending-count');
    const badgeTransferHistory = document.getElementById('badge-transfer-history-count');
    const btnTransferRefresh = document.getElementById('btn-transfer-refresh');
    // สลับมุมมอง List/Card (เดินตามรูปแบบ pos-view-grid/list ของหน้า #transactions ใน script.js)
    const transferViewListBtn = document.getElementById('transfer-view-list');
    const transferViewCardBtn = document.getElementById('transfer-view-card');
    const transferViewListWrap = document.getElementById('transfer-view-list-wrap');
    const transferViewCardsWrap = document.getElementById('transfer-view-cards');

    // Transfer State (ดึงมาจาก core เดิม — ย้ายมาเป็น local state ของไฟล์นี้)
    let transferCart = [];
    let currentTransferTab = 'incoming'; // 'incoming' = รอดำเนินการ, 'history' = ทั้งหมด
    let transfersData = [];
    let branchesForTransfer = []; // รายชื่อสาขาทั้งหมด (cache ไว้ใช้กรองสาขาปลายทาง)
    let transferSearchTerm = '';
    let transferDirectionFilter = ''; // '' | 'in' | 'out'
    let transferStatusFilter = '';    // '' | รอดำเนินการ | รับเข้าแล้ว | ยกเลิกแล้ว
    // มุมมองตาราง/การ์ด — จำค่าไว้ข้ามการเข้าหน้า (เหมือนหน้า #deposits)
    let transferViewMode = localStorage.getItem('transfer_view_mode') === 'card' ? 'card' : 'list';

    const TRANSFER_COLS = 6;

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

    // แสดง/ล้าง inline error message สีแดงใต้ฟิลด์ในฟอร์มสร้างใบโอนย้าย
    function setFieldError(errorEl, inputEl, message) {
        if (errorEl) {
            errorEl.textContent = message;
            errorEl.classList.remove('hidden');
        }
        if (inputEl) {
            inputEl.classList.remove('border-line');
            inputEl.classList.add('border-red-500');
        }
    }
    function clearFieldError(errorEl, inputEl) {
        if (errorEl) {
            errorEl.textContent = '';
            errorEl.classList.add('hidden');
        }
        if (inputEl) {
            inputEl.classList.remove('border-red-500');
            inputEl.classList.add('border-line');
        }
    }
    function clearAllTransferFieldErrors() {
        clearFieldError(transferToBranchError, transferToBranch);
        clearFieldError(transferCartError, transferCartBox);
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
            ? 'bg-state-danger/[0.12] text-state-danger ring-1 ring-state-danger/30'
            : 'bg-state-ok-tint/[0.12] text-state-ok ring-1 ring-state-ok-tint/30';
        transferScanStatus.className = `px-3 py-2.5 rounded-xl text-xs font-medium ${style}`;
        transferScanStatus.textContent = message;
    }

    // แจ้งผลการสแกนทั้งแบบ toast และแบบค้างในกล่องรายการ
    function scanFeedback(message, type) {
        showToast(message, type);
        setScanStatus(message, type);
    }

    // แจ้งเตือนแบบ popup (ใช้ custom-confirm-modal เดิมของระบบ แต่ซ่อนปุ่มยกเลิก เหลือแค่ปุ่ม "ตกลง")
    function showScanErrorPopup(title, message) {
        showConfirm(title, message, () => {}, 'ตกลง', 'danger');
        const cancelBtn = document.getElementById('confirm-cancel-btn');
        if (cancelBtn) cancelBtn.style.display = 'none';
    }

    // ==========================================
    // TRANSFERS MODULE (โอนย้ายสินค้าระหว่างสาขา)
    // ==========================================

    // ---------- ตัวช่วยเรนเดอร์ (DESIGN.md ข้อ 11.6 - 11.7) ----------
    const tfEsc = (s) => String(s == null ? '' : s)
        .replace(/&/g, '&amp;').replace(/</g, '&lt;').replace(/>/g, '&gt;')
        .replace(/"/g, '&quot;').replace(/'/g, '&#39;');

    const tfStateRow = (msg, cls = 'text-ink/50 italic') =>
        `<tr><td colspan="${TRANSFER_COLS}" class="px-6 py-8 text-center ${cls}">${tfEsc(msg)}</td></tr>`;

    const tfStateCard = (msg, cls = 'text-ink/50 italic') =>
        `<div class="col-span-full py-12 text-center ${cls}">${tfEsc(msg)}</div>`;

    // แถวโครงร่างกระพริบ เรียกก่อน await ทุกครั้ง ไม่ปล่อยตารางว่างระหว่างรอ (ข้อ 11.7)
    const tfTableSkeleton = (rows = 4) => {
        if (!transferTableBody) return;
        const bar = (w) => `<div class="h-3.5 ${w} rounded-full bg-skeleton animate-pulse"></div>`;
        transferTableBody.innerHTML = Array.from({ length: rows }).map(() => `
            <tr>
                <td class="px-6 py-4">${bar('w-32')}</td>
                <td class="px-6 py-4">${bar('w-16')}</td>
                <td class="px-6 py-4">${bar('w-40')}</td>
                <td class="px-6 py-4">${bar('w-full')}</td>
                <td class="px-6 py-4">${bar('w-20')}</td>
                <td class="px-6 py-4">${bar('w-12')}</td>
            </tr>`).join('');
    };

    // โครงร่างการ์ด — สัดส่วนบล็อกเดินตามโครงจริงของ tfCardMarkup ด้านล่าง
    const tfCardSkeleton = (count = 4) => {
        if (!transferViewCardsWrap) return;
        const bar = (w) => `<div class="h-3.5 ${w} rounded-full bg-skeleton animate-pulse"></div>`;
        transferViewCardsWrap.innerHTML = Array.from({ length: count }).map(() => `
            <div class="elev-card bg-surface-tile-3 rounded-md p-4">
                <div class="flex items-start justify-between gap-2">
                    ${bar('w-24 h-4')}
                    ${bar('w-16 h-5')}
                </div>
                ${bar('w-32 mt-3')}
                ${bar('w-full mt-4')}
                <div class="flex items-center justify-between mt-4 pt-3 border-t border-hairline">
                    ${bar('w-16')}
                    <div class="flex items-center gap-1.5">
                        <div class="w-8 h-8 rounded-[0.375rem] bg-skeleton animate-pulse"></div>
                        <div class="w-8 h-8 rounded-[0.375rem] bg-skeleton animate-pulse"></div>
                    </div>
                </div>
            </div>`).join('');
    };

    const tfSkeleton = (rows = 4) => {
        if (transferViewMode === 'card') tfCardSkeleton(rows);
        else tfTableSkeleton(rows);
    };

    const tfDateTime = (d) => {
        if (!d) return '-';
        const dt = new Date(d);
        if (isNaN(dt)) return '-';
        return dt.toLocaleString('th-TH', {
            day: 'numeric', month: 'short', year: 'numeric', hour: '2-digit', minute: '2-digit'
        });
    };

    // สาขาของผู้ใช้ที่ล็อกอิน — ใช้ตัดสินว่าใบโอนใบนี้เป็นขาเข้าหรือขาออก
    function myBranchId() {
        const user = getCurrentUser();
        return user.branch ? String(user.branch._id || user.branch) : '';
    }

    const branchIdOf = (b) => (b ? String(b._id || b) : '');

    // ทิศทางของใบโอนเทียบกับสาขาตัวเอง ('in' = รับเข้า, 'out' = ส่งออก, '' = ไม่เกี่ยวข้อง)
    function transferDirection(transfer) {
        const mine = myBranchId();
        if (!mine) return '';
        if (branchIdOf(transfer.to_branch) === mine) return 'in';
        if (branchIdOf(transfer.from_branch) === mine) return 'out';
        return '';
    }

    // สิทธิ์ต่อใบโอนหนึ่งใบ — ใช้ชุดเดียวกันทั้งปุ่มในตารางและปุ่มในโมดัล
    // กฎธุรกิจ: สาขาต้นทางเท่านั้นที่ยกเลิกได้ · สาขาปลายทางเท่านั้นที่รับเข้าได้ (สลับกันไม่ได้แม้เป็นแอดมิน)
    function transferPermissions(transfer) {
        const currentUser = getCurrentUser();
        const mine = myBranchId();
        const myRole = currentUser.role || '';
        const isPrivilegedRole = myRole === 'Administrator' || myRole === 'แอดมิน' || myRole === 'ผู้จัดการ';
        const branchIsSource = mine && mine === branchIdOf(transfer.from_branch);
        const branchIsDest = mine && mine === branchIdOf(transfer.to_branch);
        return {
            canReceive: transfer.status === 'รอดำเนินการ' && branchIsDest,
            canCancel: transfer.status === 'รอดำเนินการ' && (branchIsSource || (isPrivilegedRole && !branchIsDest))
        };
    }

    // Load Transfers
    async function loadTransfers() {
        if (!transferTableBody) return;
        tfSkeleton();
        try {
            const response = await authFetch(`${API_BASE_URL}/transfers`);
            const result = await response.json();
            if (result.success) {
                transfersData = Array.isArray(result.data) ? result.data : [];
                renderTransfersTable();
            } else {
                transfersData = [];
                transferTableBody.innerHTML = tfStateRow(result.message || 'ไม่สามารถโหลดรายการโอนย้ายได้', 'text-red-400');
                if (transferResultCount) transferResultCount.textContent = '';
                showToast(result.message || 'ไม่สามารถโหลดรายการโอนย้ายได้', 'error');
            }
        } catch (err) {
            transfersData = [];
            transferTableBody.innerHTML = tfStateRow('ไม่สามารถเชื่อมต่อกับเซิร์ฟเวอร์ได้', 'text-red-400');
            if (transferResultCount) transferResultCount.textContent = '';
            showToast('ไม่สามารถเชื่อมต่อกับเซิร์ฟเวอร์ได้', 'error');
        }
    }
    window.loadTransfers = loadTransfers;

    // โทนสีป้ายสถานะใบโอนย้าย (ข้อ 11.6 — จุดสี + พื้น tint 12%)
    function transferStatusTone(status) {
        if (status === 'รับเข้าแล้ว') return { dot: 'bg-state-ok', bg: 'bg-state-ok-tint/[0.12]', text: 'text-state-ok' };
        if (status === 'ยกเลิกแล้ว') return { dot: 'bg-state-danger', bg: 'bg-state-danger/[0.12]', text: 'text-state-danger' };
        return { dot: 'bg-orange-500', bg: 'bg-orange-500/[0.12]', text: 'text-orange-400' };
    }

    function transferStatusBadge(status) {
        const t = transferStatusTone(status);
        return `<div class="inline-flex items-center gap-2 px-2.5 py-1 rounded-[0.375rem] ${t.bg}">
                    <div class="w-2 h-2 rounded-full ${t.dot}"></div>
                    <span class="${t.text} font-medium text-xs">${tfEsc(status)}</span>
                </div>`;
    }

    // ป้ายทิศทาง — ขาเข้า/ขาออก เทียบกับสาขาของผู้ใช้
    function transferDirectionBadge(dir) {
        if (dir === 'in') {
            return `<div class="inline-flex items-center gap-1.5 px-2.5 py-1 rounded-[0.375rem] bg-chip/60">
                        <i class="fa-solid fa-arrow-down text-state-ok text-[10px]"></i>
                        <span class="text-ink font-medium text-xs">ขาเข้า</span>
                    </div>`;
        }
        if (dir === 'out') {
            return `<div class="inline-flex items-center gap-1.5 px-2.5 py-1 rounded-[0.375rem] bg-chip/60">
                        <i class="fa-solid fa-arrow-up text-accent-ink text-[10px]"></i>
                        <span class="text-ink font-medium text-xs">ขาออก</span>
                    </div>`;
        }
        return '<span class="text-ink/50">-</span>';
    }

    // สรุปรายการสินค้าในใบโอนให้อยู่ในบรรทัดเดียว
    function transferItemsDesc(transfer) {
        const items = transfer.items || [];
        if (!items.length) return '-';
        const totalQty = items.reduce((sum, i) => sum + (i.quantity || 1), 0);
        const names = items.map(i => i.product_name).join(', ');
        return `${names} · รวม ${totalQty} ชิ้น`;
    }

    // กรองตามแท็บ + ช่องค้นหา + ตัวกรองด่วน
    function filteredTransfers() {
        const byTab = transfersData.filter(t =>
            currentTransferTab === 'incoming' ? t.status === 'รอดำเนินการ' : true);

        const term = transferSearchTerm.trim().toLowerCase();
        const matched = byTab.filter(t => {
            if (transferDirectionFilter && transferDirection(t) !== transferDirectionFilter) return false;
            if (transferStatusFilter && t.status !== transferStatusFilter) return false;
            if (!term) return true;
            const haystack = [
                t.transfer_number,
                t.from_branch && t.from_branch.name,
                t.to_branch && t.to_branch.name,
                ...(t.items || []).map(i => i.product_name),
                ...(t.items || []).map(i => i.product_code)
            ].filter(Boolean).join(' ').toLowerCase();
            return haystack.includes(term);
        });

        return { total: byTab.length, rows: matched };
    }

    // ชิปตัวกรองที่ใช้อยู่ (ข้อ 11.5 — ป้ายเป็นรูป "หมวด: ค่า" ลบได้เฉพาะตอนคลิกกากบาท)
    function renderTransferFilterChips() {
        if (!transferActiveFilters) return;
        transferActiveFilters.innerHTML = '';

        const chips = [];
        if (transferSearchTerm.trim()) chips.push({ key: 'search', label: `ค้นหา: ${transferSearchTerm.trim()}` });
        if (transferDirectionFilter) {
            chips.push({
                key: 'direction',
                label: `ทิศทาง: ${transferDirectionFilter === 'in' ? 'ขาเข้า' : 'ขาออก'}`
            });
        }
        if (transferStatusFilter) chips.push({ key: 'status', label: `สถานะ: ${transferStatusFilter}` });

        const clearOne = (key) => {
            if (key === 'search') {
                transferSearchTerm = '';
                if (transferSearchInput) transferSearchInput.value = '';
            } else if (key === 'direction') {
                transferDirectionFilter = '';
                if (transferFilterDirection) transferFilterDirection.value = '';
            } else if (key === 'status') {
                transferStatusFilter = '';
                if (transferFilterStatus) transferFilterStatus.value = '';
            }
            renderTransfersTable();
        };

        chips.forEach(c => {
            const chip = document.createElement('button');
            chip.type = 'button';
            chip.className = 'elev-card px-4 py-2.5 rounded-xl bg-panel/40' +
                'text-ink text-sm font-medium transition-colors flex items-center gap-2 cursor-pointer';
            chip.innerHTML = `<span>${tfEsc(c.label)}</span><i class="fa-solid fa-xmark text-[10px] opacity-80"></i>`;
            chip.setAttribute('aria-label', `ลบตัวกรอง ${c.label}`);
            // ตัวชิปเองไม่ตอบสนอง ต้องคลิกที่กากบาทเท่านั้น
            chip.addEventListener('click', (e) => {
                if (!e.target.closest('i.fa-xmark')) return;
                clearOne(c.key);
            });
            transferActiveFilters.appendChild(chip);
        });

        // ปุ่มล้างทั้งหมดโผล่เมื่อมีตัวกรองมากกว่า 1 ตัวเท่านั้น
        if (chips.length > 1) {
            const clearAll = document.createElement('button');
            clearAll.type = 'button';
            clearAll.className = 'px-2.5 py-1 bg-red-500/10 hover:bg-red-500/15 text-red-300 ' +
                'rounded-full text-xs font-medium ring-1 ring-red-500/30 transition-colors cursor-pointer';
            clearAll.textContent = 'ล้างทั้งหมด';
            clearAll.addEventListener('click', () => {
                transferSearchTerm = '';
                transferDirectionFilter = '';
                transferStatusFilter = '';
                if (transferSearchInput) transferSearchInput.value = '';
                if (transferFilterDirection) transferFilterDirection.value = '';
                if (transferFilterStatus) transferFilterStatus.value = '';
                renderTransfersTable();
            });
            transferActiveFilters.appendChild(clearAll);
        }
    }

    // ปุ่มจัดการที่ย้อนไม่ได้ (รับเข้า/ยกเลิก) — ใช้ร่วมกันทั้งแถวตารางและการ์ด ตรวจสิทธิ์ก่อนเรนเดอร์
    // และยังผ่าน showConfirm() ตอนกดอีกชั้น
    function tfActionButtons(transfer, perms) {
        const receiveBtn = perms.canReceive
            ? `<button type="button" class="btn-transfer-receive text-ink hover:text-state-ok transition-colors p-2 cursor-pointer"
                    data-id="${tfEsc(transfer._id)}" title="ยืนยันรับเข้าสต็อก"
                    aria-label="ยืนยันรับเข้าสต็อก ใบโอน ${tfEsc(transfer.transfer_number)}">
                    <i class="fa-solid fa-circle-check"></i>
               </button>`
            : '';
        const cancelBtn = perms.canCancel
            ? `<button type="button" class="btn-transfer-cancel text-ink hover:text-red-400 transition-colors p-2 cursor-pointer"
                    data-id="${tfEsc(transfer._id)}" title="ยกเลิกการโอนย้าย"
                    aria-label="ยกเลิกการโอนย้าย ใบโอน ${tfEsc(transfer.transfer_number)}">
                    <i class="fa-solid fa-ban"></i>
               </button>`
            : '';
        const detailBtn = `<button type="button" class="btn-transfer-detail text-ink hover:text-indigo-400 transition-colors p-2 cursor-pointer"
                    data-id="${tfEsc(transfer._id)}" title="ดูรายละเอียด"
                    aria-label="ดูรายละเอียดใบโอน ${tfEsc(transfer.transfer_number)}">
                    <i class="fa-solid fa-eye"></i>
               </button>`;
        return { receiveBtn, cancelBtn, detailBtn };
    }

    function tfRowMarkup(transfer) {
        const dir = transferDirection(transfer);
        const perms = transferPermissions(transfer);
        const fromBranch = (transfer.from_branch && transfer.from_branch.name) || '-';
        const toBranch = (transfer.to_branch && transfer.to_branch.name) || '-';
        const desc = transferItemsDesc(transfer);
        const { receiveBtn, cancelBtn, detailBtn } = tfActionButtons(transfer, perms);

        return `
        <tr class="hover:bg-divider transition-colors">
            <td class="px-6 py-4">
                <p class="font-mono font-semibold text-accent-ink">${tfEsc(transfer.transfer_number)}</p>
                <p class="text-xs text-ink/70 mt-0.5">${tfEsc(tfDateTime(transfer.created_at))}</p>
            </td>
            <td class="px-6 py-4">${transferDirectionBadge(dir)}</td>
            <td class="px-6 py-4">
                <span class="text-ink inline-flex items-center gap-2">
                    <span>${tfEsc(fromBranch)}</span>
                    <i class="fa-solid fa-arrow-right text-ink/50 text-[10px]"></i>
                    <span>${tfEsc(toBranch)}</span>
                </span>
            </td>
            <td class="px-6 py-4">
                <span class="text-ink block max-w-[360px] truncate" title="${tfEsc(desc)}">${tfEsc(desc)}</span>
            </td>
            <td class="px-6 py-4">${transferStatusBadge(transfer.status)}</td>
            <td class="px-6 py-4">
                <div class="flex items-center justify-end gap-1">
                    ${receiveBtn}${cancelBtn}${detailBtn}
                </div>
            </td>
        </tr>`;
    }

    // การ์ด — โครง: หัว (เลขที่โอน+วันที่ / สถานะ) · ทิศทาง+เส้นทาง · รายการสินค้า · footer (ปุ่มจัดการ)
    function tfCardMarkup(transfer) {
        const dir = transferDirection(transfer);
        const perms = transferPermissions(transfer);
        const fromBranch = (transfer.from_branch && transfer.from_branch.name) || '-';
        const toBranch = (transfer.to_branch && transfer.to_branch.name) || '-';
        const desc = transferItemsDesc(transfer);
        const { receiveBtn, cancelBtn, detailBtn } = tfActionButtons(transfer, perms);

        return `
        <div class="elev-card pos-card bg-surface-tile-3 rounded-md p-4 transition-all hover:-translate-y-1 border-none">
            <div class="flex items-start justify-between gap-2">
                <div class="min-w-0">
                    <p class="font-mono font-semibold text-accent-ink truncate">${tfEsc(transfer.transfer_number)}</p>
                    <p class="text-xs text-ink/70 mt-0.5">${tfEsc(tfDateTime(transfer.created_at))}</p>
                </div>
                <div class="shrink-0">${transferStatusBadge(transfer.status)}</div>
            </div>

            <div class="mt-3 pt-3 border-t border-hairline">
                <div>${transferDirectionBadge(dir)}</div>
                <span class="text-ink text-sm inline-flex items-center gap-2 min-w-0 mt-2">
                    <span class="truncate">${tfEsc(fromBranch)}</span>
                    <i class="fa-solid fa-arrow-right text-ink/50 text-[10px] shrink-0"></i>
                    <span class="truncate">${tfEsc(toBranch)}</span>
                </span>
            </div>

            <p class="text-ink text-sm mt-3 truncate" title="${tfEsc(desc)}">${tfEsc(desc)}</p>

            <div class="flex items-center justify-end gap-1 mt-3.5 pt-3 border-t border-hairline">
                ${receiveBtn}${cancelBtn}${detailBtn}
            </div>
        </div>`;
    }

    function tfBindResultHandlers(container) {
        if (!container) return;
        container.querySelectorAll('.btn-transfer-detail').forEach(btn =>
            btn.addEventListener('click', () => openTransferDetailModal(btn.dataset.id)));
        container.querySelectorAll('.btn-transfer-receive').forEach(btn =>
            btn.addEventListener('click', () => receiveTransfer(btn.dataset.id)));
        container.querySelectorAll('.btn-transfer-cancel').forEach(btn =>
            btn.addEventListener('click', () => cancelTransfer(btn.dataset.id)));
    }

    // Render Transfers Table
    function renderTransfersTable() {
        if (!transferTableBody) return;

        if (transferViewListWrap) transferViewListWrap.classList.toggle('hidden', transferViewMode !== 'list');
        if (transferViewCardsWrap) transferViewCardsWrap.classList.toggle('hidden', transferViewMode !== 'card');

        // ป้ายตัวเลขบนแท็บนับจากข้อมูลดิบเสมอ ไม่ขึ้นกับตัวกรองที่เลือกอยู่
        const pendingCount = transfersData.filter(t => t.status === 'รอดำเนินการ').length;
        if (badgeTransferPending) badgeTransferPending.textContent = pendingCount;
        if (badgeTransferHistory) badgeTransferHistory.textContent = transfersData.length;

        renderTransferFilterChips();

        const { total, rows } = filteredTransfers();
        if (transferResultCount) {
            transferResultCount.textContent = total ? `แสดง ${rows.length} จาก ${total} รายการ` : '';
        }

        if (!rows.length) {
            const emptyMsg = total
                ? 'ไม่พบรายการที่ตรงกับตัวกรอง'
                : (currentTransferTab === 'incoming'
                    ? 'ไม่มีใบโอนย้ายที่รอดำเนินการ'
                    : 'ยังไม่มีประวัติการโอนย้ายของสาขานี้');
            transferTableBody.innerHTML = tfStateRow(emptyMsg);
            if (transferViewCardsWrap) transferViewCardsWrap.innerHTML = tfStateCard(emptyMsg);
            return;
        }

        if (transferViewMode === 'card') {
            transferViewCardsWrap.innerHTML = rows.map(tfCardMarkup).join('');
            tfBindResultHandlers(transferViewCardsWrap);
        } else {
            transferTableBody.innerHTML = rows.map(tfRowMarkup).join('');
            tfBindResultHandlers(transferTableBody);
        }
    }

    // ซิงก์คลาส active/idle ของปุ่มสลับมุมมองให้ตรงกับ transferViewMode ปัจจุบัน (ไม่ render ข้อมูล)
    function syncTransferViewButtons(mode) {
        window.syncViewToggleButtons(transferViewListBtn, transferViewCardBtn, mode);
    }

    // สลับมุมมอง List/Card — re-render จาก transfersData ทันที ไม่ยิง /api/transfers ซ้ำ
    function applyTransferViewMode(mode) {
        transferViewMode = mode;
        localStorage.setItem('transfer_view_mode', mode);
        syncTransferViewButtons(mode);
        renderTransfersTable();
    }

    if (transferViewListBtn) transferViewListBtn.addEventListener('click', () => applyTransferViewMode('list'));
    if (transferViewCardBtn) transferViewCardBtn.addEventListener('click', () => applyTransferViewMode('card'));
    // ซิงก์ปุ่มให้ตรงกับโหมดที่จำไว้ตั้งแต่โหลดสคริปต์ครั้งแรก — ก่อน loadTransfers() ที่ script.js เรียกตอนเข้าเพจ
    syncTransferViewButtons(transferViewMode);
    if (transferViewListWrap) transferViewListWrap.classList.toggle('hidden', transferViewMode !== 'list');
    if (transferViewCardsWrap) transferViewCardsWrap.classList.toggle('hidden', transferViewMode !== 'card');

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
            statusEl.className = 'inline-flex';
            statusEl.innerHTML = transferStatusBadge(transfer.status);
        }

        if (fromEl) fromEl.textContent = transfer.from_branch?.name || '-';
        if (toEl) toEl.textContent = transfer.to_branch?.name || '-';
        if (dateEl) dateEl.textContent = tfDateTime(transfer.created_at);
        if (senderEl) senderEl.textContent = transfer.created_by?.name || '-';

        if (itemsBody) {
            itemsBody.innerHTML = '';
            (transfer.items || []).forEach(item => {
                const tr = document.createElement('tr');
                tr.className = '';

                const colorStr = item.color ? `สี: ${item.color}` : '';
                const capStr = item.capacity ? `ความจุ: ${item.capacity}` : '';
                const details = [colorStr, capStr].filter(Boolean).join(' / ') || '-';

                const imeiHtml = item.imeis && item.imeis.length > 0
                    ? `<div class="flex flex-wrap gap-1 mt-1.5">
                        ${item.imeis.map(imei => `<span class="elev-modal bg-elevated text-ink px-1.5 py-0.5 rounded-[0.375rem] text-[10px] font-mono">${imei}</span>`).join('')}
                       </div>`
                    : '';

                tr.innerHTML = `
                    <td class="px-4 py-3">
                        <div class="font-medium text-ink">${item.product_name}</div>
                        <div class="text-xs font-mono text-accent-ink mt-0.5">${item.product_code}</div>
                        ${imeiHtml}
                    </td>
                    <td class="px-4 py-3 text-ink/70 text-xs">${details}</td>
                    <td class="px-4 py-3 text-right text-ink font-semibold font-mono">${item.quantity} <span class="text-xs font-normal">${item.unit || 'ชิ้น'}</span></td>
                `;
                itemsBody.appendChild(tr);
            });
        }

        if (btnPrint) {
            btnPrint.onclick = () => {
                printTransferDocument(transferId);
            };
        }

        const btnCancel = document.getElementById('btn-transfer-view-cancel');

        // สิทธิ์: เห็นปุ่ม "รับเข้าสินค้า" ได้เฉพาะผู้ที่สาขาตัวเองตรงกับสาขาปลายทางเท่านั้น
        // ทุกกรณีอื่น (สาขาต้นทาง, หรือแอดมิน/ผู้จัดการที่ไม่ตรงกับสาขาปลายทาง) เห็นแค่ปุ่ม "ยกเลิกการโอนย้าย"
        const currentUser = getCurrentUser();
        const myBranchId = currentUser.branch ? (currentUser.branch._id || currentUser.branch) : '';
        const myRole = currentUser.role || '';
        const isPrivilegedRole = myRole === 'Administrator' || myRole === 'แอดมิน' || myRole === 'ผู้จัดการ';
        const fromBranchId = transfer.from_branch ? (transfer.from_branch._id || transfer.from_branch) : '';
        const toBranchId = transfer.to_branch ? (transfer.to_branch._id || transfer.to_branch) : '';
        const branchIsSource = myBranchId && String(myBranchId) === String(fromBranchId);
        const branchIsDest = myBranchId && String(myBranchId) === String(toBranchId);
        const isDestBranch = branchIsDest;
        const isSourceBranch = branchIsSource || (isPrivilegedRole && !branchIsDest);

        if (btnReceive) {
            if (transfer.status === 'รอดำเนินการ' && isDestBranch) {
                btnReceive.classList.remove('hidden');
                btnReceive.onclick = async () => {
                    closeTransferViewModal();
                    await receiveTransfer(transferId);
                };
            } else {
                btnReceive.classList.add('hidden');
            }
        }

        if (btnCancel) {
            if (transfer.status === 'รอดำเนินการ' && isSourceBranch) {
                btnCancel.classList.remove('hidden');
                btnCancel.onclick = async () => {
                    closeTransferViewModal();
                    await cancelTransfer(transferId);
                };
            } else {
                btnCancel.classList.add('hidden');
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
    const TF_TAB_BASE = 'elev-chip tab-toggle-btn px-4 py-2.5 rounded-xl text-sm font-bold transition-colors flex items-center gap-2 cursor-pointer';
    const TF_TAB_ON = 'bg-primary text-on-primary ring-1 ring-accent-ink apple-active-accent';
    const TF_TAB_OFF = 'elev-field bg-field text-body-muted hover:ring-1 hover:ring-accent-ink hover:text-ink';
    // ป้ายตัวเลขต้องอ่านออกทั้งบนพื้นเหลือง (แท็บที่เลือก) และพื้นเข้ม จึงสลับสีตามสถานะแท็บ
    const TF_BADGE_ON = 'px-2 py-0.5 rounded-full text-[10px] font-bold bg-hairline/20';
    const TF_BADGE_OFF_PENDING = 'px-2 py-0.5 rounded-full text-[10px] font-bold bg-orange-500/[0.12] text-orange-400';
    const TF_BADGE_OFF_HISTORY = 'px-2 py-0.5 rounded-full text-[10px] font-bold bg-chip/60 text-ink';

    function switchTransferTab(tab) {
        currentTransferTab = tab;
        const onPending = tab === 'incoming';

        if (transferTabIncoming && transferTabHistory) {
            transferTabIncoming.className = `${TF_TAB_BASE} ${onPending ? TF_TAB_ON : TF_TAB_OFF}`;
            transferTabHistory.className = `${TF_TAB_BASE} ${onPending ? TF_TAB_OFF : TF_TAB_ON}`;
            transferTabIncoming.setAttribute('aria-pressed', String(onPending));
            transferTabHistory.setAttribute('aria-pressed', String(!onPending));
        }
        if (badgeTransferPending) badgeTransferPending.className = onPending ? TF_BADGE_ON : TF_BADGE_OFF_PENDING;
        if (badgeTransferHistory) badgeTransferHistory.className = onPending ? TF_BADGE_OFF_HISTORY : TF_BADGE_ON;

        if (transferPanelTitle) {
            transferPanelTitle.innerHTML = onPending
                ? '<i class="fa-solid fa-right-left text-accent-ink"></i> ใบโอนที่รอดำเนินการ'
                : '<i class="fa-solid fa-right-left text-accent-ink"></i> ประวัติการโอนย้ายทั้งหมด';
        }

        // แท็บ "รอดำเนินการ" ทุกแถวเป็นสถานะเดียวกันอยู่แล้ว ตัวกรองสถานะจึงไม่มีความหมาย — ซ่อนและล้างค่า
        const statusWrap = document.getElementById('transfer-status-filter-wrap');
        if (statusWrap) statusWrap.className = onPending ? 'hidden' : 'hidden md:block';
        if (onPending && transferStatusFilter) {
            transferStatusFilter = '';
            if (transferFilterStatus) transferFilterStatus.value = '';
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
        clearAllTransferFieldErrors();
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
        clearAllTransferFieldErrors();
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
                setScanStatus(`ไม่พบ ${code} ในสต็อกของสาขา ${branchName}`, 'error');
                showScanErrorPopup('ไม่พบสินค้าในสต็อก', `ไม่พบรหัสสินค้าหรือหมายเลข IMEI "${code}" ในสต็อกคงเหลือของสาขา <b>${branchName}</b> กรุณาตรวจสอบรหัสสินค้าอีกครั้ง`);
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

        if (transferCart.length > 0) clearFieldError(transferCartError, transferCartBox);

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
            div.className = 'elev-modal flex items-start justify-between gap-3 bg-elevated rounded-xl p-3';
            div.innerHTML = `
                <div class="flex-1 min-w-0">
                    <div class="text-ink font-medium">${item.product_name}</div>
                    <div class="text-ink/70 text-xs mt-0.5">
                        <span class="font-mono text-accent-ink">${item.product_code}</span> · จำนวน ${item.quantity}
                    </div>
                    ${item.imeis && item.imeis.length > 0 ? `
                        <div class="flex flex-wrap gap-1 mt-1.5">
                            ${item.imeis.map(imei => `
                                <span class="elev-field bg-field text-ink px-2 py-0.5 rounded-[0.375rem] text-[10px] font-mono">${imei}</span>
                            `).join('')}
                        </div>
                    ` : ''}
                </div>
                <button type="button" onclick="removeFromTransferCart(${index})" title="นำออกจากใบโอน"
                    aria-label="นำ ${item.product_name} ออกจากใบโอน"
                    class="shrink-0 text-ink hover:text-red-400 transition-colors p-2 cursor-pointer">
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
        clearAllTransferFieldErrors();
        let hasError = false;

        const sourceBranchId = getTransferSourceBranchId();
        if (!sourceBranchId) {
            showToast('บัญชีของคุณยังไม่ได้ผูกกับสาขา จึงสร้างใบโอนไม่ได้', 'error');
            return;
        }

        if (!transferToBranch || !transferToBranch.value) {
            setFieldError(transferToBranchError, transferToBranch, 'กรุณาเลือกสาขาปลายทาง');
            hasError = true;
        } else if (transferToBranch.value === sourceBranchId) {
            setFieldError(transferToBranchError, transferToBranch, 'ไม่สามารถโอนย้ายไปสาขาเดียวกันได้');
            hasError = true;
        }

        if (transferCart.length === 0) {
            setFieldError(transferCartError, transferCartBox, 'กรุณาเพิ่มสินค้าอย่างน้อย 1 รายการก่อนสร้างใบโอนย้าย');
            hasError = true;
        }

        if (hasError) return;

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

    // Cancel Transfer (เฉพาะสาขาต้นทาง และเฉพาะก่อนที่สาขาปลายทางจะยืนยันรับเข้า)
    window.cancelTransfer = async function (transferId) {
        showConfirm('ยกเลิกการโอนย้าย', 'ยืนยันยกเลิกรายการโอนย้ายนี้? สินค้าทั้งหมดจะถูกคืนกลับเข้าสต็อกสาขาต้นทาง', async () => {
            try {
                const response = await authFetch(`${API_BASE_URL}/transfers/${transferId}/cancel`, {
                    method: 'PUT',
                    headers: { 'Content-Type': 'application/json' }
                });

                const result = await response.json();

                if (result.success) {
                    showToast('ยกเลิกการโอนย้ายสำเร็จ สินค้ากลับเข้าสต็อกสาขาต้นทางแล้ว');
                    loadTransfers();
                    pollPendingTransfers();
                } else {
                    showToast(result.message || 'เกิดข้อผิดพลาด', 'error');
                }
            } catch (err) {
                showToast('ไม่สามารถเชื่อมต่อกับเซิร์ฟเวอร์ได้', 'error');
            }
        }, 'ยกเลิกการโอนย้าย');
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
    // มาร์กอัปตั้งต้นของแท็บ "รอดำเนินการ" ยังไม่มีคลาส tab-toggle-btn/apple-active-accent
    // (ใส่เฉพาะตอน switchTransferTab สลับแท็บ) เรียกครั้งแรกให้ตรงกันตั้งแต่เปิดหน้า ไม่งั้นแท็บที่
    // active อยู่ตั้งแต่ต้นจะยังมีเส้นขอบเดิมค้างอยู่ในโหมดสว่าง
    switchTransferTab('incoming');
    if (transferTabIncoming) transferTabIncoming.addEventListener('click', () => switchTransferTab('incoming'));
    if (transferTabHistory) transferTabHistory.addEventListener('click', () => switchTransferTab('history'));
    if (btnOpenCreateTransfer) btnOpenCreateTransfer.addEventListener('click', openTransferModal);
    if (btnCloseCreateTransfer) btnCloseCreateTransfer.addEventListener('click', closeTransferModal);
    if (transferToBranch) transferToBranch.addEventListener('change', () => clearFieldError(transferToBranchError, transferToBranch));

    // แถบควบคุม — กรองในหน่วยความจำทั้งหมด ไม่ยิง API ซ้ำ (ข้อมูลชุดเดียวถูกโหลดมาแล้ว)
    if (transferSearchInput) {
        let searchTimer = null;
        transferSearchInput.addEventListener('input', () => {
            clearTimeout(searchTimer);
            searchTimer = setTimeout(() => {
                transferSearchTerm = transferSearchInput.value;
                renderTransfersTable();
            }, 200);
        });
    }
    if (transferFilterDirection) {
        transferFilterDirection.addEventListener('change', () => {
            transferDirectionFilter = transferFilterDirection.value;
            renderTransfersTable();
        });
    }
    if (transferFilterStatus) {
        transferFilterStatus.addEventListener('change', () => {
            transferStatusFilter = transferFilterStatus.value;
            renderTransfersTable();
        });
    }
    if (btnTransferRefresh) btnTransferRefresh.addEventListener('click', () => loadTransfers());

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
