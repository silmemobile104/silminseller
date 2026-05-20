const API_BASE_URL = '/api';

document.addEventListener('DOMContentLoaded', () => {

    // ==========================================
    // Auth Fetch Helper (ส่ง Token อัตโนมัติ)
    // ==========================================
    const getAuthHeaders = () => {
        const token = localStorage.getItem('silmin_token');
        return token ? { 'Authorization': `Bearer ${token}` } : {};
    };

    const authFetch = async (url, options = {}) => {
        const headers = {
            ...getAuthHeaders(),
            ...(options.headers || {})
        };
        const response = await fetch(url, { ...options, headers });

        // ตรวจสอบ 401/403 → เซสชั่นหมดอายุ
        if (response.status === 401 || response.status === 403) {
            // Toast debounce - แสดง error เพียงครั้งเดียว
            if (!window.__isShowingAuthError) {
                window.__isShowingAuthError = true;
                forceLogout();
                showToast('เซสชั่นหมดอายุ กรุณาเข้าสู่ระบบใหม่', 'error');
                setTimeout(() => {
                    window.__isShowingAuthError = false;
                }, 3000);
            } else {
                // ถ้ามีการแสดง error อยู่แล้ว ให้ logout เงียบๆ
                forceLogout();
            }
            throw new Error('เซสชั่นหมดอายุ');
        }
        return response;
    };

    const forceLogout = () => {
        localStorage.removeItem('silmin_token');
        localStorage.removeItem('silmin_user');

        const mainLayout = document.getElementById('main-layout');
        const loginScreen = document.getElementById('login-screen');

        if (mainLayout) {
            mainLayout.classList.remove('opacity-100');
            mainLayout.classList.add('opacity-0', 'hidden');
        }
        if (loginScreen) {
            loginScreen.classList.remove('hidden', 'opacity-0');
            loginScreen.classList.add('flex', 'opacity-100');
        }

        // แสดง Toast แจ้งเตือน (ถ้ามี showToast)
        setTimeout(() => {
            if (typeof showToast === 'function') {
                showToast('เซสชั่นหมดอายุ กรุณาเข้าสู่ระบบใหม่', 'error');
            }
        }, 600);
    };

    // ==========================================
    // DOM Elements
    // ==========================================
    const loginForm = document.getElementById('login-form');
    const usernameInput = document.getElementById('username');
    const passwordInput = document.getElementById('password');
    const loginScreen = document.getElementById('login-screen');
    const mainLayout = document.getElementById('main-layout');
    const loginError = document.getElementById('login-error');
    const toggleSidebarBtn = document.getElementById('toggle-sidebar');
    const sidebar = document.getElementById('sidebar');
    const logoutBtn = document.getElementById('logout-btn');

    const btnAddProduct = document.getElementById('btn-add-product');
    const addProductModal = document.getElementById('add-product-modal');
    const closeModalBtn = document.getElementById('close-modal-btn');
    const cancelModalBtn = document.getElementById('cancel-modal-btn');
    const addProductForm = document.getElementById('add-product-form');

    const productCategory = document.getElementById('product-category');
    const productName = document.getElementById('product-name');
    const productColor = document.getElementById('product-color');
    const productCapacity = document.getElementById('product-capacity');
    const productCondition = document.getElementById('product-condition');
    const productUnit = document.getElementById('product-unit');

    const deviceFields = document.getElementById('device-fields');
    const imeiField = document.getElementById('imei-field');
    const quantityField = document.getElementById('quantity-field');

    const productImeis = document.getElementById('product-imeis');
    const productQuantity = document.getElementById('product-quantity');
    const productCode = document.getElementById('product-code');
    const productSupplier = document.getElementById('product-supplier');
    const productBranch = document.getElementById('product-branch');

    // New DOM Elements for Master Data Management
    const navDashboard = document.getElementById('nav-dashboard');
    const navStock = document.getElementById('nav-stock');
    const navTransactions = document.getElementById('nav-transactions');
    const navPersonnel = document.getElementById('nav-personnel');
    const navBranches = document.getElementById('nav-branches');
    const navSettings = document.getElementById('nav-settings');
    const navRoles = document.getElementById('nav-roles');
    const navSalesHistory = document.getElementById('nav-sales-history');
    const navTransfers = document.getElementById('nav-transfers');
    const navMovements = document.getElementById('nav-movements');
    const navMembers = document.getElementById('nav-members');
    const navReportArrival = document.getElementById('nav-report-arrival');
    const navApproveImport = document.getElementById('nav-approve-import');
    const navWarrantyCheck = document.getElementById('nav-warranty-check');
    const navBranchInventory = document.getElementById('nav-branch-inventory');
    const navAccountingPO = document.getElementById('nav-accounting-po');
    const navBranchReceive = document.getElementById('nav-branch-receive');

    const viewDashboard = document.getElementById('view-dashboard');
    const viewStock = document.getElementById('view-stock');
    const viewTransactions = document.getElementById('view-transactions');
    const viewBranchInventory = document.getElementById('view-branch-inventory');
    const viewPersonnel = document.getElementById('view-personnel');
    const viewBranches = document.getElementById('view-branches');
    const viewSettings = document.getElementById('view-settings');
    const viewRoles = document.getElementById('view-roles');
    const viewSalesHistory = document.getElementById('view-sales-history');
    const viewTransfers = document.getElementById('view-transfers');
    const viewMovements = document.getElementById('view-movements');
    const viewMembers = document.getElementById('view-members');
    const viewReportArrival = document.getElementById('view-report-arrival');
    const viewApproveImport = document.getElementById('view-approve-import');
    const viewWarrantyCheck = document.getElementById('view-warranty-check');
    const viewAccountingPO = document.getElementById('view-accounting-po');
    const viewBranchReceive = document.getElementById('view-branch-receive');

    const settingsTabBtns = document.querySelectorAll('.settings-tab-btn');
    const masterDataInput = document.getElementById('master-data-input');
    const masterDataCodeInput = document.getElementById('master-data-code-input');
    const btnAddMasterData = document.getElementById('btn-add-master-data');
    const masterDataList = document.getElementById('master-data-list');
    const masterDataEmpty = document.getElementById('master-data-empty');
    const productTableBody = document.getElementById('product-table-body');

    const stockSearchInput = document.getElementById('stock-search-input');
    const btnStockFilter = document.getElementById('btn-stock-filter');
    const btnStockFilterText = document.getElementById('btn-stock-filter-text');
    const stockFilterPanel = document.getElementById('stock-filter-panel');
    const btnStockFilterClose = document.getElementById('btn-stock-filter-close');
    const btnStockFilterApply = document.getElementById('btn-stock-filter-apply');
    const btnStockFilterReset = document.getElementById('btn-stock-filter-reset');
    const stockFilterBranch = document.getElementById('stock-filter-branch');
    const stockFilterCategory = document.getElementById('stock-filter-category');
    const stockFilterSupplier = document.getElementById('stock-filter-supplier');
    const stockFilterStatus = document.getElementById('stock-filter-status');
    const stockFilterPriceMin = document.getElementById('stock-filter-price-min');
    const stockFilterPriceMax = document.getElementById('stock-filter-price-max');
    const stockActiveFilters = document.getElementById('stock-active-filters');
    const stockResultCount = document.getElementById('stock-result-count');

    // UI Helper Elements (Custom Modals & Toasts)
    const toastContainer = document.getElementById('toast-container');
    const customConfirmModal = document.getElementById('custom-confirm-modal');
    const customPromptModal = document.getElementById('custom-prompt-modal');

    const confirmTitle = document.getElementById('confirm-title');
    const confirmMessage = document.getElementById('confirm-message');
    const confirmOkBtn = document.getElementById('confirm-ok-btn');
    const confirmCancelBtn = document.getElementById('confirm-cancel-btn');

    const promptTitle = document.getElementById('prompt-title');
    const promptInput = document.getElementById('prompt-input');

    // Branch DOM Elements
    const btnAddBranch = document.getElementById('btn-add-branch');
    const branchGrid = document.getElementById('branch-grid');
    const branchEmptyState = document.getElementById('branch-empty-state');
    const branchModal = document.getElementById('branch-modal');
    const closeBranchModalBtn = document.getElementById('close-branch-modal-btn');
    const cancelBranchModalBtn = document.getElementById('cancel-branch-modal-btn');
    const branchForm = document.getElementById('branch-form');
    const branchIdInput = document.getElementById('branch-id');
    const branchNameInput = document.getElementById('branch-name');
    const branchAddressInput = document.getElementById('branch-address');
    const branchModalTitle = document.getElementById('branch-modal-title');
    const submitBranchBtn = document.getElementById('submit-branch-btn');
    const promptOkBtn = document.getElementById('prompt-ok-btn');
    const promptCancelBtn = document.getElementById('prompt-cancel-btn');

    // Transfer DOM Elements
    const btnOpenCreateTransfer = document.getElementById('btn-open-create-transfer');
    const modalCreateTransfer = document.getElementById('modal-create-transfer');
    const btnCloseCreateTransfer = document.getElementById('btn-close-create-transfer');
    const transferToBranch = document.getElementById('transfer-to-branch');
    const transferScanInput = document.getElementById('transfer-scan-input');
    const transferCartItems = document.getElementById('transfer-cart-items');
    const transferCartEmpty = document.getElementById('transfer-cart-empty');
    const transferCartCount = document.getElementById('transfer-cart-count');
    const btnSubmitTransfer = document.getElementById('btn-submit-transfer');
    const transferTabIncoming = document.getElementById('transfer-tab-incoming');
    const transferTabHistory = document.getElementById('transfer-tab-history');
    const transferTableBody = document.getElementById('transfer-table-body');
    const transferEmpty = document.getElementById('transfer-empty');
    const transferBranchHint = document.getElementById('transfer-branch-hint');

    // Barcode Modal Elements
    const barcodeModal = document.getElementById('barcode-modal');
    const closeBarcodeModalBtn = document.getElementById('close-barcode-modal-btn');
    const cancelBarcodeModalBtn = document.getElementById('cancel-barcode-modal-btn');
    const submitBarcodePrintBtn = document.getElementById('submit-barcode-print-btn');
    const barcodeModalProductName = document.getElementById('barcode-modal-product-name');
    const barcodeModalProductCode = document.getElementById('barcode-modal-product-code');
    const barcodeModalDynamicContent = document.getElementById('barcode-modal-dynamic-content');

    // Barcode State
    let currentBarcodeProduct = null;

    let currentSettingsTab = 'productname';
    window.masterDataCache = {};

    // Transfer State
    let transferCart = [];
    let currentTransferTab = 'incoming'; // 'incoming' or 'history'
    let transfersData = [];

    // Pending Transfer Polling State
    let knownPendingTransferIds = new Set();
    let pendingTransferPollInterval = null;
    let initialPollDone = false;

    // Stock Search & Filter State
    let allProductsCache = [];
    let stockSearchDebounceId = null;
    let stockSearchQuery = '';
    let stockFilters = {
        branchId: '',
        categoryId: '',
        supplierId: '',
        status: 'in_stock',
        priceMin: '',
        priceMax: ''
    };

    const getCurrentUser = () => {
        const s = localStorage.getItem('silmin_user');
        if (!s) return null;
        try { return JSON.parse(s); } catch { return null; }
    };

    const toStr = (v) => (v === null || v === undefined) ? '' : String(v);

    const getId = (v) => {
        if (!v) return '';
        if (typeof v === 'string') return v;
        if (v._id) return String(v._id);
        return '';
    };

    const normalize = (s) => toStr(s).trim().toLowerCase();

    const productMatchesSearch = (product, q) => {
        const query = normalize(q);
        if (!query) return true;
        const name = normalize(product.name);
        const code = normalize(product.product_code);
        const imeis = Array.isArray(product.imeis) ? product.imeis : [];
        const imeiJoined = normalize(imeis.join(' '));
        return name.includes(query) || code.includes(query) || imeiJoined.includes(query);
    };

    const productMatchesFilters = (product, filters) => {
        const productBranchId = getId(product.branch_id);
        const productCategoryId = getId(product.type_id);
        const productSupplierId = getId(product.supplier_id);

        if (filters.branchId && productBranchId !== filters.branchId) return false;
        if (filters.categoryId && productCategoryId !== filters.categoryId) return false;
        if (filters.supplierId && productSupplierId !== filters.supplierId) return false;

        const quantity = Number(product.quantity || 0);
        const isTransferring = product.is_transferring === true;

        if (filters.status === 'in_stock' && (quantity <= 0 || isTransferring)) return false;
        if (filters.status === 'out_of_stock' && quantity > 0 && !isTransferring) return false;
        if (filters.status === 'transferring' && !isTransferring) return false;

        const price = Number(product.selling_price || 0);
        const min = filters.priceMin !== '' ? Number(filters.priceMin) : null;
        const max = filters.priceMax !== '' ? Number(filters.priceMax) : null;
        if (min !== null && !Number.isNaN(min) && price < min) return false;
        if (max !== null && !Number.isNaN(max) && price > max) return false;
        return true;
    };

    const getFilteredProducts = () => {
        return allProductsCache.filter(p => productMatchesSearch(p, stockSearchQuery) && productMatchesFilters(p, stockFilters));
    };

    const countActiveFilters = () => {
        let n = 0;
        if (stockSearchQuery) n += 1;
        if (stockFilters.branchId) n += 1;
        if (stockFilters.categoryId) n += 1;
        if (stockFilters.supplierId) n += 1;
        if (stockFilters.status) n += 1;
        if (stockFilters.priceMin !== '' || stockFilters.priceMax !== '') n += 1;
        return n;
    };

    const updateFilterButtonBadge = () => {
        if (!btnStockFilterText) return;
        const n = countActiveFilters();
        btnStockFilterText.textContent = n > 0 ? `เพิ่มเติม (${n})` : 'เพิ่มเติม';
    };

    const getSelectedText = (selectEl) => {
        if (!selectEl) return '';
        const opt = selectEl.options[selectEl.selectedIndex];
        return opt ? opt.textContent : '';
    };

    const renderActiveFilterChips = () => {
        if (!stockActiveFilters) return;
        stockActiveFilters.innerHTML = '';

        const addChip = (key, label) => {
            const chip = document.createElement('button');
            chip.type = 'button';
            chip.className = 'px-2.5 py-1 bg-slate-700/60 hover:bg-slate-600 text-slate-200 rounded-full text-xs font-medium border border-slate-600 transition-colors flex items-center gap-2';
            chip.dataset.key = key;
            chip.innerHTML = `<span>${label}</span><i class="fa-solid fa-xmark text-[10px] opacity-80"></i>`;
            chip.addEventListener('click', () => {
                if (key === 'search') {
                    stockSearchQuery = '';
                    if (stockSearchInput) stockSearchInput.value = '';
                } else if (key === 'branch') {
                    stockFilters.branchId = '';
                    if (stockFilterBranch) stockFilterBranch.value = '';
                } else if (key === 'category') {
                    stockFilters.categoryId = '';
                    if (stockFilterCategory) stockFilterCategory.value = '';
                } else if (key === 'supplier') {
                    stockFilters.supplierId = '';
                    if (stockFilterSupplier) stockFilterSupplier.value = '';
                } else if (key === 'status') {
                    stockFilters.status = '';
                    if (stockFilterStatus) stockFilterStatus.value = '';
                } else if (key === 'price') {
                    stockFilters.priceMin = '';
                    stockFilters.priceMax = '';
                    if (stockFilterPriceMin) stockFilterPriceMin.value = '';
                    if (stockFilterPriceMax) stockFilterPriceMax.value = '';
                }
                applyStockSearchAndFilters();
            });
            stockActiveFilters.appendChild(chip);
        };

        if (stockSearchQuery) addChip('search', `ค้นหา: ${stockSearchQuery}`);

        if (stockFilters.branchId) {
            const text = getSelectedText(stockFilterBranch) || 'สาขา';
            addChip('branch', `สาขา: ${text}`);
        }
        if (stockFilters.categoryId) {
            const text = getSelectedText(stockFilterCategory) || 'หมวดหมู่';
            addChip('category', `หมวดหมู่: ${text}`);
        }
        if (stockFilters.supplierId) {
            const text = getSelectedText(stockFilterSupplier) || 'Supplier';
            addChip('supplier', `Supplier: ${text}`);
        }
        if (stockFilters.status) {
            const text = getSelectedText(stockFilterStatus) || 'สถานะ';
            addChip('status', `สถานะ: ${text}`);
        }
        if (stockFilters.priceMin !== '' || stockFilters.priceMax !== '') {
            const min = stockFilters.priceMin !== '' ? Number(stockFilters.priceMin).toLocaleString() : '0';
            const max = stockFilters.priceMax !== '' ? Number(stockFilters.priceMax).toLocaleString() : 'ไม่จำกัด';
            addChip('price', `ราคา: ${min} - ${max}`);
        }

        const activeCount = countActiveFilters();
        if (activeCount > 1) {
            const clearBtn = document.createElement('button');
            clearBtn.type = 'button';
            clearBtn.className = 'px-2.5 py-1 bg-red-500/10 hover:bg-red-500/15 text-red-300 rounded-full text-xs font-medium border border-red-500/30 transition-colors';
            clearBtn.textContent = 'ล้างทั้งหมด';
            clearBtn.addEventListener('click', () => {
                resetStockFiltersToDefault();
                applyStockSearchAndFilters();
            });
            stockActiveFilters.appendChild(clearBtn);
        }
    };

    const updateResultCount = (filteredCount, totalCount) => {
        if (!stockResultCount) return;
        stockResultCount.textContent = `แสดง ${filteredCount} จาก ${totalCount} รายการ`;
    };

    const applyStockSearchAndFilters = () => {
        const filtered = getFilteredProducts();
        renderProductTable(filtered);
        renderActiveFilterChips();
        updateFilterButtonBadge();
        updateResultCount(filtered.length, allProductsCache.length);
    };

    const setSelectOptions = (selectEl, options, placeholderText) => {
        if (!selectEl) return;
        selectEl.innerHTML = '';
        const defaultOpt = document.createElement('option');
        defaultOpt.value = '';
        defaultOpt.textContent = placeholderText;
        selectEl.appendChild(defaultOpt);

        options.forEach(({ value, label }) => {
            const opt = document.createElement('option');
            opt.value = value;
            opt.textContent = label;
            selectEl.appendChild(opt);
        });
    };

    const loadFilterOptions = async () => {
        const master = window.masterDataCache || {};
        const categories = Array.isArray(master.productTypes) ? master.productTypes : [];
        const suppliers = Array.isArray(master.suppliers) ? master.suppliers : [];

        setSelectOptions(stockFilterCategory, categories.map(c => ({ value: String(c._id), label: c.name })), 'ทุกหมวดหมู่');
        setSelectOptions(stockFilterSupplier, suppliers.map(s => ({ value: String(s._id), label: s.name })), 'ทุก Supplier');

        try {
            const response = await authFetch(`${API_BASE_URL}/branches`);
            const json = await response.json();
            if (json.success) {
                const branches = Array.isArray(json.data) ? json.data : [];
                setSelectOptions(stockFilterBranch, branches.map(b => ({ value: String(b._id), label: b.name })), 'ทุกสาขา');
            }
        } catch (e) {
            console.error('Error loading branches for stock filter:', e);
        }
    };

    const resetStockFiltersToDefault = () => {
        const user = getCurrentUser();
        const isAdmin = user && String(user.role || '').toLowerCase() === 'admin';
        const userBranchId = user && user.branch ? String(user.branch._id || user.branch) : '';

        stockSearchQuery = '';
        stockFilters.categoryId = '';
        stockFilters.supplierId = '';
        stockFilters.status = 'in_stock';
        stockFilters.priceMin = '';
        stockFilters.priceMax = '';
        stockFilters.branchId = (!isAdmin && userBranchId) ? userBranchId : '';

        if (stockSearchInput) stockSearchInput.value = '';
        if (stockFilterCategory) stockFilterCategory.value = stockFilters.categoryId;
        if (stockFilterSupplier) stockFilterSupplier.value = stockFilters.supplierId;
        if (stockFilterStatus) stockFilterStatus.value = stockFilters.status;
        if (stockFilterPriceMin) stockFilterPriceMin.value = '';
        if (stockFilterPriceMax) stockFilterPriceMax.value = '';
        if (stockFilterBranch) stockFilterBranch.value = stockFilters.branchId;

        updateFilterButtonBadge();
    };

    const openStockFilterPanel = () => {
        if (!stockFilterPanel) return;
        stockFilterPanel.classList.remove('hidden');
    };

    const closeStockFilterPanel = () => {
        if (!stockFilterPanel) return;
        stockFilterPanel.classList.add('hidden');
    };

    // ==========================================
    // UI Modal Logic
    // ==========================================
    const openModal = () => {
        if (addProductModal) {
            addProductModal.classList.remove('opacity-0', 'pointer-events-none');
        }
    };

    const closeModal = () => {
        if (addProductModal) {
            addProductModal.classList.add('opacity-0', 'pointer-events-none');
            if (addProductForm) addProductForm.reset();
            if (deviceFields) deviceFields.classList.add('hidden');
            if (imeiField) imeiField.classList.add('hidden');
            if (quantityField) quantityField.classList.add('hidden');

            // Reset Image Preview
            const imagePreview = document.getElementById('image-preview');
            if (imagePreview) {
                imagePreview.innerHTML = `<i class="fa-solid fa-image text-2xl"></i>`;
            }
        }
    };

    // Modal Events
    if (btnAddProduct) {
        btnAddProduct.addEventListener('click', async () => {
            // Reset Edit ID
            const editIdInput = document.getElementById('edit-product-id');
            if (editIdInput) editIdInput.value = '';

            // Reset Title
            const modalTitle = document.getElementById('modal-title');
            if (modalTitle) modalTitle.innerHTML = `<i class="fa-solid fa-box-open text-cyan-400"></i> เพิ่มสินค้าใหม่`;

            // โหลดข้อมูล master data ก่อนเปิด modal
            await fetchMasterData();

            openModal();
        });
    }

    // ==========================================
    // Initial Setup & Master Data
    // ==========================================

    // Add shake keyframes to document head
    const style = document.createElement('style');
    style.textContent = `
        @keyframes shake {
            0%, 100% { transform: translateX(0); }
            10%, 30%, 50%, 70%, 90% { transform: translateX(-5px); }
            20%, 40%, 60%, 80% { transform: translateX(5px); }
        }
    `;
    document.head.appendChild(style);

    // Fetch Master Data
    async function fetchMasterData() {
        try {
            const response = await authFetch(`${API_BASE_URL}/master-data`);
            const json = await response.json();

            if (json.success) {
                window.masterDataCache = json.data;

                populateDropdown(productCategory, json.data.productTypes, 'เลือกหมวดหมู่');
                populateDropdown(productName, json.data.productNames, 'เลือกชื่อสินค้า');
                populateDropdown(productColor, json.data.productColors, 'เลือกสี');
                populateDropdown(productCapacity, json.data.productCapacities, 'เลือกความจุ');
                populateDropdown(productCondition, json.data.productConditions, 'เลือกสภาพเครื่อง');
                populateDropdown(productUnit, json.data.productUnits, 'เลือกหน่วยนับ');
                populateDropdown(productSupplier, json.data.suppliers, 'เลือกผู้จัดจำหน่าย');

                // โหลดสาขาสำหรับ dropdown ที่จัดเก็บสินค้า
                loadBranchesForProductForm();

                renderSettingsList();
            } else {
                console.error('Failed to load master data:', json.message);
            }
        } catch (error) {
            console.error('Error fetching master data:', error);
        }
    }

    const ensureMasterDataLoaded = async () => {
        const c = window.masterDataCache || {};
        const hasTypes = Array.isArray(c.productTypes) && c.productTypes.length > 0;
        const hasSuppliers = Array.isArray(c.suppliers) && c.suppliers.length > 0;
        if (hasTypes && hasSuppliers) return;
        await fetchMasterData();
    };

    const populateDropdown = (selectElement, dataArray, defaultText) => {
        if (!selectElement) return;
        selectElement.innerHTML = `<option value="" disabled selected>${defaultText}</option>`;
        dataArray.forEach(item => {
            const option = document.createElement('option');
            option.value = item._id;
            option.textContent = item.code ? `${item.name} (${item.code})` : item.name;
            selectElement.appendChild(option);
        });
    };

    // โหลดสาขาสำหรับ dropdown ที่จัดเก็บสินค้า
    const loadBranchesForProductForm = async () => {
        if (!productBranch) return;
        try {
            const response = await authFetch(`${API_BASE_URL}/branches`);
            const json = await response.json();
            if (json.success) {
                productBranch.innerHTML = '<option value="" disabled selected>เลือกสาขาที่จัดเก็บ</option>';
                json.data.forEach(branch => {
                    productBranch.innerHTML += `<option value="${branch._id}">${branch.name}</option>`;
                });
            }
        } catch (error) {
            console.error('ดึงข้อมูลสาขาสำหรับฟอร์มสินค้าไม่สำเร็จ:', error);
        }
    };

    // ==========================================
    // UI Notification & Dialog Systems
    // ==========================================

    const showTransferToast = (sourceBranch, count) => {
        const transferToastContainer = document.getElementById('transfer-toast-container');
        if (!transferToastContainer) return;

        const currentTransferToasts = transferToastContainer.querySelectorAll('.transfer-toast');
        if (currentTransferToasts.length >= 3) {
            currentTransferToasts[0].remove();
        }

        const toast = document.createElement('div');
        toast.className = 'bg-slate-800 border border-orange-500/50 shadow-[0_0_15px_rgba(249,115,22,0.15)] px-4 py-3 rounded-xl flex items-center justify-between gap-3 toast-animate min-w-[300px] pointer-events-auto transfer-toast';
        toast.innerHTML = `
            <div class="flex items-center gap-3">
                <div class="w-8 h-8 rounded-full bg-orange-500/10 flex items-center justify-center text-orange-400 shrink-0">
                    <i class="fa-solid fa-box text-sm"></i>
                </div>
                <div class="flex flex-col">
                    <span class="text-white text-sm font-medium">📦 มีสินค้าโอนเข้าใหม่</span>
                    <span class="text-slate-400 text-xs">จาก ${sourceBranch} จำนวน ${count} รายการ</span>
                </div>
            </div>
            <div class="flex items-center gap-2">
                <button class="view-transfer-btn text-xs bg-orange-500/20 text-orange-400 px-2 py-1 rounded hover:bg-orange-500/30 transition-colors">ดูรายละเอียด</button>
                <button class="close-transfer-btn text-slate-400 hover:text-white transition-colors p-1"><i class="fa-solid fa-xmark"></i></button>
            </div>
        `;

        transferToastContainer.appendChild(toast);

        const timeoutId = setTimeout(() => toast.remove(), 8000);

        toast.querySelector('.close-transfer-btn').addEventListener('click', () => {
            clearTimeout(timeoutId);
            toast.remove();
        });

        toast.querySelector('.view-transfer-btn').addEventListener('click', () => {
            clearTimeout(timeoutId);
            toast.remove();
            if (navTransfers) {
                switchView('transfers');
                if (transferTabIncoming) transferTabIncoming.click();
            }
        });
    };

    const pollPendingTransfers = async () => {
        try {
            const userStr = localStorage.getItem('silmin_user');
            if (!userStr) return;
            const user = JSON.parse(userStr);
            if (!user || !user.branch) return;

            const response = await authFetch(`${API_BASE_URL}/transfers/pending-count`);
            const json = await response.json();

            if (json.success) {
                const count = json.data.count;
                const pendingList = json.data.pendingTransfers;

                const navBadge = document.getElementById('transfer-nav-badge');
                if (navBadge) {
                    if (count > 0) {
                        navBadge.textContent = count > 9 ? '9+' : count;
                        navBadge.classList.remove('hidden');
                    } else {
                        navBadge.classList.add('hidden');
                    }
                }

                const pendingCard = document.getElementById('card-pending-transfer');
                const statPending = document.getElementById('stat-pending-transfers');
                if (pendingCard && statPending) {
                    pendingCard.classList.remove('hidden');
                    statPending.textContent = count;
                    if (count > 0) {
                        statPending.classList.add('text-orange-400');
                        statPending.classList.remove('text-white');
                    } else {
                        statPending.classList.add('text-white');
                        statPending.classList.remove('text-orange-400');
                    }
                }

                const newIds = new Set(pendingList.map(t => t._id));

                if (knownPendingTransferIds.size === 0 && count > 0 && !initialPollDone) {
                    pendingList.forEach(t => knownPendingTransferIds.add(t._id));
                    initialPollDone = true;
                } else {
                    initialPollDone = true;
                    pendingList.forEach(t => {
                        if (!knownPendingTransferIds.has(t._id)) {
                            knownPendingTransferIds.add(t._id);
                            showTransferToast(t.from_branch_name, t.item_count);
                        }
                    });

                    knownPendingTransferIds.forEach(id => {
                        if (!newIds.has(id)) {
                            knownPendingTransferIds.delete(id);
                        }
                    });
                }
            }
        } catch (e) {
            console.error('Error polling pending transfers', e);
        }
    };

    const startPendingTransferPolling = () => {
        if (pendingTransferPollInterval) clearInterval(pendingTransferPollInterval);
        initialPollDone = false;
        knownPendingTransferIds.clear();
        pollPendingTransfers();
        pendingTransferPollInterval = setInterval(pollPendingTransfers, 30000);
    };

    const stopPendingTransferPolling = () => {
        if (pendingTransferPollInterval) {
            clearInterval(pendingTransferPollInterval);
            pendingTransferPollInterval = null;
        }
    };

    const showToast = (message, type = 'success') => {
        const toast = document.createElement('div');
        const bgColor = type === 'success' ? 'bg-slate-800' : 'bg-slate-800';
        const borderColor = type === 'success' ? 'border-cyan-500/50' : 'border-red-500/50';
        const iconColor = type === 'success' ? 'text-cyan-400' : 'text-red-400';
        const icon = type === 'success' ? 'fa-circle-check' : 'fa-circle-xmark';
        const shadow = type === 'success' ? 'shadow-[0_0_15px_rgba(6,182,212,0.15)]' : 'shadow-[0_0_15px_rgba(239,68,68,0.15)]';

        toast.className = `${bgColor} border ${borderColor} ${shadow} px-4 py-3 rounded-xl flex items-center gap-3 toast-animate min-w-[200px] pointer-events-auto`;
        toast.innerHTML = `
            <i class="fa-solid ${icon} ${iconColor} text-lg"></i>
            <span class="text-white text-sm font-medium">${message}</span>
        `;

        toastContainer.appendChild(toast);
        setTimeout(() => toast.remove(), 3000);
    };

    const showConfirm = (title, message, onConfirm) => {
        const modal = document.getElementById('custom-confirm-modal');
        const okBtn = document.getElementById('confirm-ok-btn');
        const cancelBtn = document.getElementById('confirm-cancel-btn');

        document.getElementById('confirm-title').textContent = title;
        document.getElementById('confirm-message').textContent = message;

        modal.classList.remove('hidden');
        void modal.offsetWidth;
        modal.classList.remove('opacity-0', 'pointer-events-none');

        const cleanup = () => {
            modal.classList.add('opacity-0', 'pointer-events-none');
            setTimeout(() => modal.classList.add('hidden'), 300);
            // Clear onclick to prevent multiple executions
            okBtn.onclick = null;
            cancelBtn.onclick = null;
        };

        okBtn.onclick = () => {
            onConfirm();
            cleanup();
        };

        cancelBtn.onclick = cleanup;
    };

    const showPrompt = (title, defaultValue, onConfirm) => {
        promptTitle.textContent = title;
        promptInput.value = defaultValue;

        customPromptModal.classList.remove('hidden');
        void customPromptModal.offsetWidth;
        customPromptModal.classList.remove('opacity-0', 'pointer-events-none');
        promptInput.focus();

        const cleanup = () => {
            customPromptModal.classList.add('opacity-0', 'pointer-events-none');
            setTimeout(() => customPromptModal.classList.add('hidden'), 300);
            document.getElementById('prompt-ok-btn').replaceWith(document.getElementById('prompt-ok-btn').cloneNode(true));
            document.getElementById('prompt-cancel-btn').replaceWith(document.getElementById('prompt-cancel-btn').cloneNode(true));
        };

        document.getElementById('prompt-ok-btn').onclick = () => {
            const value = document.getElementById('prompt-input').value;
            onConfirm(value);
            cleanup();
        };

        document.getElementById('prompt-cancel-btn').onclick = cleanup;
    };

    // Top App Bar elements
    const topbarUserName = document.getElementById('topbar-user-name');
    const topbarUserRole = document.getElementById('topbar-user-role');
    const topbarUserAvatar = document.getElementById('topbar-user-avatar');

    // Helper to decode JWT token in frontend safely
    const parseJwt = (token) => {
        try {
            const base64Url = token.split('.')[1];
            const base64 = base64Url.replace(/-/g, '+').replace(/_/g, '/');
            const jsonPayload = decodeURIComponent(window.atob(base64).split('').map(function(c) {
                return '%' + ('00' + c.charCodeAt(0).toString(16)).slice(-2);
            }).join(''));
            return JSON.parse(jsonPayload);
        } catch (error) {
            console.error('[SILMIN] Failed to parse JWT token:', error);
            return null;
        }
    };

    // Update Top App Bar with user data
    const updateTopBar = (userData) => {
        try {
            // Retrieve user data if not passed explicitly
            let user = userData;
            if (!user) {
                user = getCurrentUser();
            }
            if (!user) {
                const token = localStorage.getItem('silmin_token');
                if (token) {
                    const decoded = parseJwt(token);
                    if (decoded) {
                        user = {
                            name: decoded.name,
                            role: decoded.role,
                            emp_id: decoded.emp_id,
                            branch: decoded.branch_id ? { _id: decoded.branch_id, name: 'กำลังตรวจสอบ...' } : null
                        };
                    }
                }
            }

            // Throw error if user data cannot be retrieved to trigger fallback block
            if (!user) {
                throw new Error('No user data or session available');
            }

            const userName = user.name || 'ผู้ใช้งาน';
            const userRole = user.role || '-';
            const branchName = (user.branch && user.branch.name) ? user.branch.name : 'ไม่ระบุสาขา';
            const empId = user.emp_id || '-';

            // 1. Update Header Elements
            // Desktop topbar elements
            const topbarBranch = document.getElementById('topbar-user-branch');
            if (topbarUserName) topbarUserName.textContent = userName;
            if (topbarUserRole) topbarUserRole.textContent = userRole;
            if (topbarBranch) topbarBranch.textContent = branchName;

            // Tablet topbar elements
            const topbarUserNameTablet = document.getElementById('topbar-user-name-tablet');
            const topbarUserRoleTablet = document.getElementById('topbar-user-role-tablet');
            if (topbarUserNameTablet) topbarUserNameTablet.textContent = userName;
            if (topbarUserRoleTablet) topbarUserRoleTablet.textContent = userRole;

            // Mobile topbar elements
            const topbarUserNameMobile = document.getElementById('topbar-user-name-mobile');
            const topbarUserBranchMobile = document.getElementById('topbar-user-branch-mobile');
            if (topbarUserNameMobile) topbarUserNameMobile.textContent = userName;
            if (topbarUserBranchMobile) {
                topbarUserBranchMobile.innerHTML = `<i class="fa-solid fa-store text-[9px]"></i> <span>${branchName}</span>`;
            }

            // Set Avatar images
            const nameForAvatar = encodeURIComponent(userName);
            const avatarUrl = `https://ui-avatars.com/api/?name=${nameForAvatar}&background=0D8ABC&color=fff`;
            if (topbarUserAvatar) topbarUserAvatar.src = avatarUrl;
            
            // 2. Update Popup Elements
            const popupUserAvatar = document.getElementById('popup-user-avatar');
            const popupUserName = document.getElementById('popup-user-name');
            const popupUserUsername = document.getElementById('popup-user-username');
            const popupUserBranch = document.getElementById('popup-user-branch');
            const popupUserRole = document.getElementById('popup-user-role');

            if (popupUserAvatar) popupUserAvatar.src = avatarUrl;
            if (popupUserName) popupUserName.textContent = userName;
            if (popupUserUsername) popupUserUsername.textContent = `${empId}@silmin.com`;
            if (popupUserBranch) popupUserBranch.textContent = branchName;
            if (popupUserRole) popupUserRole.textContent = userRole;

        } catch (error) {
            console.error('[SILMIN] Error updating top bar with session info:', error);
            
            // Fallback display
            const userNameFallback = 'ผู้ใช้งาน';
            const userRoleFallback = '-';
            const branchNameFallback = 'ไม่ระบุสาขา';
            const empIdFallback = '-';
            const avatarUrlFallback = `https://ui-avatars.com/api/?name=User&background=0D8ABC&color=fff`;

            if (topbarUserName) topbarUserName.textContent = userNameFallback;
            if (topbarUserRole) topbarUserRole.textContent = userRoleFallback;
            
            const topbarBranch = document.getElementById('topbar-user-branch');
            if (topbarBranch) topbarBranch.textContent = branchNameFallback;

            const topbarUserNameTablet = document.getElementById('topbar-user-name-tablet');
            const topbarUserRoleTablet = document.getElementById('topbar-user-role-tablet');
            if (topbarUserNameTablet) topbarUserNameTablet.textContent = userNameFallback;
            if (topbarUserRoleTablet) topbarUserRoleTablet.textContent = userRoleFallback;

            const topbarUserNameMobile = document.getElementById('topbar-user-name-mobile');
            const topbarUserBranchMobile = document.getElementById('topbar-user-branch-mobile');
            if (topbarUserNameMobile) topbarUserNameMobile.textContent = userNameFallback;
            if (topbarUserBranchMobile) {
                topbarUserBranchMobile.innerHTML = `<i class="fa-solid fa-store text-[9px]"></i> <span>${branchNameFallback}</span>`;
            }

            if (topbarUserAvatar) topbarUserAvatar.src = avatarUrlFallback;

            const popupUserAvatar = document.getElementById('popup-user-avatar');
            const popupUserName = document.getElementById('popup-user-name');
            const popupUserUsername = document.getElementById('popup-user-username');
            const popupUserBranch = document.getElementById('popup-user-branch');
            const popupUserRole = document.getElementById('popup-user-role');

            if (popupUserAvatar) popupUserAvatar.src = avatarUrlFallback;
            if (popupUserName) popupUserName.textContent = userNameFallback;
            if (popupUserUsername) popupUserUsername.textContent = `${empIdFallback}@silmin.com`;
            if (popupUserBranch) popupUserBranch.textContent = branchNameFallback;
            if (popupUserRole) popupUserRole.textContent = userRoleFallback;
        }
    };

    // User Profile Dropdown Popup behavior
    const userProfileTrigger = document.getElementById('user-profile-trigger');
    const userInfoPopup = document.getElementById('user-info-popup');
    const popupLogoutBtn = document.getElementById('popup-logout-btn');

    if (userProfileTrigger && userInfoPopup) {
        userProfileTrigger.addEventListener('click', (e) => {
            e.stopPropagation();
            userInfoPopup.classList.toggle('hidden');
        });

        // Close popup when clicking anywhere outside
        document.addEventListener('click', (e) => {
            if (!userInfoPopup.classList.contains('hidden')) {
                if (!userInfoPopup.contains(e.target) && !userProfileTrigger.contains(e.target)) {
                    userInfoPopup.classList.add('hidden');
                }
            }
        });
    }

    if (popupLogoutBtn) {
        popupLogoutBtn.addEventListener('click', () => {
            // Trigger logout flow
            if (logoutBtn) {
                logoutBtn.click();
            } else {
                // Fallback manual logout
                localStorage.removeItem('silmin_token');
                localStorage.removeItem('silmin_user');
                stopPendingTransferPolling();
                
                mainLayout.classList.add('opacity-0');
                setTimeout(() => {
                    mainLayout.classList.add('hidden');
                    loginForm.reset();
                    loginError.classList.add('hidden');
                    loginScreen.classList.remove('hidden');
                    loginScreen.classList.add('flex');
                    void loginScreen.offsetWidth;
                    loginScreen.classList.remove('opacity-0');
                    loginScreen.classList.add('opacity-100');
                }, 500);
            }
        });
    }

    // ==========================================
    // Dynamic Permissions (RBAC ตามสิทธิ์จาก Role)
    // ==========================================
    const applyPermissions = (permissions) => {
        if (!permissions) return;

        // ซ่อน/แสดง เมนู Sidebar ตาม permissions
        if (navDashboard) navDashboard.style.display = permissions.view_dashboard ? '' : 'none';
        if (navStock) navStock.style.display = permissions.manage_stock ? '' : 'none';
        if (navTransactions) navTransactions.style.display = permissions.do_pos ? '' : 'none';
        if (navSalesHistory) navSalesHistory.style.display = permissions.do_pos ? '' : 'none';
        if (navTransfers) navTransfers.style.display = permissions.manage_transfers ? '' : 'none';
        if (navMovements) navMovements.style.display = permissions.manage_stock ? '' : 'none';
        if (navMembers) navMembers.style.display = permissions.do_pos ? '' : 'none';
        if (navPersonnel) navPersonnel.style.display = permissions.manage_personnel ? '' : 'none';
        if (navBranches) navBranches.style.display = permissions.manage_branches ? '' : 'none';
        if (navSettings) navSettings.style.display = permissions.manage_settings ? '' : 'none';
        if (navRoles) navRoles.style.display = permissions.manage_roles ? '' : 'none';

        // เมนูใหม่
        if (typeof navReportArrival !== 'undefined' && navReportArrival) navReportArrival.style.display = permissions.report_arrival ? '' : 'none';
        if (typeof navApproveImport !== 'undefined' && navApproveImport) navApproveImport.style.display = permissions.approve_import ? '' : 'none';
        if (typeof navWarrantyCheck !== 'undefined' && navWarrantyCheck) navWarrantyCheck.style.display = permissions.do_pos ? '' : 'none';
        if (navAccountingPO) navAccountingPO.style.display = permissions.manage_po ? '' : 'none';
        if (navBranchReceive) navBranchReceive.style.display = permissions.receive_po ? '' : 'none';

        // ซ่อน/แสดง ปุ่มเพิ่มสินค้า + ลบสินค้า
        const btnAdd = document.getElementById('btn-add-product');
        if (btnAdd) btnAdd.style.display = permissions.manage_stock ? '' : 'none';

        // ซ่อน/แสดง ฟิลเตอร์สาขาในเมนูจัดการสต็อก
        const stockFilterBranch = document.getElementById('stock-filter-branch');
        if (stockFilterBranch) {
            stockFilterBranch.style.display = permissions.filter_stock_branch ? '' : 'none';
        }

        // เก็บ permissions ไว้ใน window สำหรับใช้ตรวจสอบใน renderProductTable
        window.__userPermissions = permissions;
    };

    // Fetch All Products
    async function fetchProducts() {
        try {
            await ensureMasterDataLoaded();
            const response = await authFetch(`${API_BASE_URL}/products`);
            const json = await response.json();
            if (json.success) {
                allProductsCache = Array.isArray(json.data) ? json.data : [];

                await loadFilterOptions();
                if (!stockSearchQuery && !stockFilters.categoryId && !stockFilters.supplierId && stockFilters.priceMin === '' && stockFilters.priceMax === '' && !stockFilters.branchId && !stockFilters.status) {
                    resetStockFiltersToDefault();
                }
                applyStockSearchAndFilters();
            }
        } catch (error) {
            console.error('Error fetching products:', error);
        }
    }

    const renderProductTable = (products) => {
        if (!productTableBody) return;
        productTableBody.innerHTML = '';

        if (products.length === 0) {
            productTableBody.innerHTML = `
                <tr>
                    <td colspan="9" class="px-6 py-8 text-center text-slate-500 italic">
                        ไม่พบสินค้าที่ค้นหา
                    </td>
                </tr>
            `;
            return;
        }

        products.forEach(product => {
            const row = document.createElement('tr');
            row.className = 'hover:bg-slate-700/20 transition-colors';

            const categoryName = product.type_id ? product.type_id.name : 'ทั่วไป';
            const unitName = product.unit_id ? product.unit_id.name : '';
            const colorName = product.color_id ? product.color_id.name : '';
            const capacityName = product.capacity_id ? product.capacity_id.name : '';
            const conditionName = product.condition_id ? product.condition_id.name : '';

            const isDevice = categoryName.includes('iPhone') || categoryName.includes('iPad');
            const stockDisplay = isDevice
                ? `${product.quantity || product.imeis.length} <span class="text-xs text-slate-500 font-normal">เครื่อง</span>`
                : `${product.quantity} <span class="text-xs text-slate-500 font-normal">${unitName}</span>`;

            let statusColor = (product.quantity) > 0 ? 'bg-emerald-400' : 'bg-red-400';
            let statusText = (product.quantity) > 0 ? 'มีสินค้า' : 'สินค้าหมด';
            let statusClass = (product.quantity) > 0 ? 'text-emerald-400' : 'text-red-400';
            let statusShadow = (product.quantity) > 0 ? 'shadow-[0_0_8px_rgba(52,211,153,0.8)]' : 'shadow-[0_0_8px_rgba(248,113,113,0.8)]';

            if (product.is_transferring) {
                statusColor = 'bg-amber-400';
                statusText = 'กำลังโอนย้าย';
                statusClass = 'text-amber-400';
                statusShadow = 'shadow-[0_0_8px_rgba(251,191,36,0.8)]';
            }

            row.innerHTML = `
                <td class="px-6 py-4">
                    <span class="text-slate-300 font-mono text-sm bg-slate-800 px-2 py-1 rounded border border-slate-700">${product.product_code || '-'}</span>
                </td>
                <td class="px-6 py-4">
                    <div class="flex items-center gap-3">
                        <div class="w-10 h-10 rounded-lg bg-slate-700 flex items-center justify-center text-slate-300">
                            <i class="fa-solid ${isDevice ? 'fa-mobile-screen' : 'fa-box'} text-xl"></i>
                        </div>
                        <div>
                            <p class="font-medium text-white">${product.name}</p>
                            <p class="text-xs text-slate-500">${capacityName} ${colorName} (${conditionName})</p>
                        </div>
                    </div>
                </td>
                <td class="px-6 py-4 text-slate-400 text-sm">${product.branch_id ? product.branch_id.name : '-'}</td>
                <td class="px-6 py-4 text-slate-400 text-sm">${product.supplier_id ? product.supplier_id.name : '-'}</td>
                <td class="px-6 py-4"><span class="px-2.5 py-1 bg-slate-700 text-slate-300 rounded-md text-xs font-medium">${categoryName}</span></td>
                <td class="px-6 py-4 text-right text-slate-300 font-mono">฿${product.selling_price.toLocaleString()}</td>
                <td class="px-6 py-4 text-center text-white font-medium">${stockDisplay}</td>
                <td class="px-6 py-4">
                    <div class="flex items-center gap-2">
                        <div class="w-2 h-2 rounded-full ${statusColor} ${statusShadow}"></div>
                        <span class="${statusClass} font-medium">${statusText}</span>
                    </div>
                </td>
                <td class="px-6 py-4 text-right">
                    <div class="flex items-center justify-end gap-1">
                        <button class="print-barcode-btn text-slate-400 hover:text-amber-400 transition-colors p-2" data-id="${product._id}" title="พิมพ์บาร์โค้ด"><i class="fa-solid fa-print"></i></button>
                        <button class="edit-product-btn text-slate-400 hover:text-cyan-400 transition-colors p-2" data-id="${product._id}"><i class="fa-solid fa-pen"></i></button>
                        ${window.__userPermissions && window.__userPermissions.delete_stock ? `<button class="delete-product-btn text-slate-400 hover:text-red-400 transition-colors p-2" data-id="${product._id}"><i class="fa-solid fa-trash"></i></button>` : ''}
                    </div>
                </td>
            `;
            productTableBody.appendChild(row);

            // Attach listeners to buttons
            const printBtn = row.querySelector('.print-barcode-btn');
            if (printBtn) printBtn.addEventListener('click', () => openBarcodeModal(product));
            row.querySelector('.edit-product-btn').addEventListener('click', () => editProduct(product));
            const delBtn = row.querySelector('.delete-product-btn');
            if (delBtn) delBtn.addEventListener('click', () => deleteProduct(product._id));
        });
    };

    const deleteProduct = (id) => {
        showConfirm('ยืนยันการลบสินค้า', 'คุณแน่ใจหรือไม่ว่าต้องการลบสินค้านี้? ข้อมูลนี้ไม่สามารถกู้คืนได้', async () => {
            try {
                const response = await authFetch(`${API_BASE_URL}/products/${id}`, {
                    method: 'DELETE'
                });
                const result = await response.json();

                if (result.success) {
                    showToast('ลบข้อมูลสินค้าสำเร็จ');
                    await fetchProducts();
                } else {
                    showToast('ไม่สามารถลบข้อมูลได้: ' + result.message, 'error');
                }
            } catch (error) {
                console.error('Error deleting product:', error);
                showToast('เกิดข้อผิดพลาดในการลบข้อมูล', 'error');
            }
        });
    };

    const editProduct = async (product) => {
        // Change Modal Title
        const modalTitle = document.getElementById('modal-title');
        if (modalTitle) modalTitle.innerHTML = `<i class="fa-solid fa-pen-to-square text-cyan-400"></i> แก้ไขข้อมูลสินค้า`;

        // Set Edit ID
        const editIdInput = document.getElementById('edit-product-id');
        if (editIdInput) {
            editIdInput.value = (product._id && product._id.$oid) ? product._id.$oid : (product._id ? product._id.toString() : '');
        }

        // เก็บสาขาเดิมไว้ตรวจสอบกรณีมีการเปลี่ยนสาขาตอนกดเซฟ
        window.__editingProductOriginalBranchId = product.branch_id ? (product.branch_id._id || product.branch_id).toString() : null;

        // โหลดข้อมูล Master Data ทั้งหมดให้เสร็จก่อนเริ่มใส่ค่าลงฟอร์ม เพื่อรับประกันว่าข้อมูลตัวเลือกจะขึ้นครบถ้วนโดยไม่ต้องไปหน้าตั้งค่าก่อน
        await fetchMasterData();

        // Helper to extract ID robustly whether populated or not
        const getFieldId = (field) => {
            if (!field) return '';
            if (typeof field === 'string') return field;
            if (field._id) return field._id.toString();
            if (typeof field.toString === 'function') return field.toString();
            return '';
        };

        // Populate Form Fields
        if (productCode) productCode.value = product.product_code || '';
        if (productSupplier) productSupplier.value = getFieldId(product.supplier_id);
        if (productName) {
            // Find option with matching text or ID
            let matched = false;
            Array.from(productName.options).forEach(opt => {
                if (opt.textContent.trim() === product.name.trim() || opt.value === product.name) {
                    productName.value = opt.value;
                    matched = true;
                }
            });
            if (!matched && product.name) {
                // Fallback: Add as temporary option if not in master data
                const opt = document.createElement('option');
                opt.value = product.name;
                opt.textContent = product.name;
                productName.appendChild(opt);
                productName.value = product.name;
            }
        }
        if (productCategory) productCategory.value = getFieldId(product.type_id);
        if (productColor) productColor.value = getFieldId(product.color_id);
        if (productCapacity) productCapacity.value = getFieldId(product.capacity_id);
        if (productCondition) productCondition.value = getFieldId(product.condition_id);
        if (productUnit) productUnit.value = getFieldId(product.unit_id);
        if (productQuantity) productQuantity.value = product.quantity || 1;

        // ตั้งค่าสาขาที่จัดเก็บ
        if (productBranch) {
            await loadBranchesForProductForm();
            productBranch.value = getFieldId(product.branch_id);
        }

        document.getElementById('cost-price').value = product.cost_price || 0;
        document.getElementById('selling-price').value = product.selling_price || 0;

        // IMEIs
        if (productImeis) {
            productImeis.value = (product.imeis || []).join('\n');
        }

        // Handle field visibility based on category
        const categoryName = product.type_id && product.type_id.name ? product.type_id.name : '';
        if (categoryName.includes('iPhone') || categoryName.includes('iPad')) {
            deviceFields.classList.remove('hidden');
            imeiField.classList.remove('hidden');
        } else {
            deviceFields.classList.add('hidden');
            imeiField.classList.add('hidden');
        }

        openModal();
    };

    // ==========================================
    // Barcode Printing Logic
    // ==========================================
    const openBarcodeModal = (product) => {
        currentBarcodeProduct = product;
        if (barcodeModalProductName) barcodeModalProductName.textContent = product.name;
        if (barcodeModalProductCode) barcodeModalProductCode.textContent = product.product_code || '-';
        if (barcodeModalDynamicContent) barcodeModalDynamicContent.innerHTML = '';

        const categoryName = product.type_id && product.type_id.name ? product.type_id.name : '';
        const isDevice = categoryName.includes('iPhone') || categoryName.includes('iPad');

        if (isDevice) {
            // Device: Checkboxes for IMEIs
            const imeis = product.imeis || [];
            if (imeis.length === 0) {
                if (barcodeModalDynamicContent) barcodeModalDynamicContent.innerHTML = '<p class="text-slate-400 text-sm italic">ไม่มีหมายเลข IMEI ให้เลือกพิมพ์</p>';
            } else {
                let html = `
                    <div class="flex items-center justify-between mb-2">
                        <span class="text-slate-300 text-sm font-medium">เลือก IMEI ที่ต้องการพิมพ์</span>
                        <label class="flex items-center text-cyan-400 text-sm cursor-pointer hover:text-cyan-300 transition-colors">
                            <input type="checkbox" id="barcode-select-all" class="rounded border-slate-600 bg-slate-900 text-cyan-500 focus:ring-cyan-500 mr-2" checked>
                            เลือกทั้งหมด
                        </label>
                    </div>
                    <div class="max-h-48 overflow-y-auto pr-2 space-y-2 custom-scrollbar">
                `;
                imeis.forEach((imei, index) => {
                    html += `
                        <label class="flex items-center p-3 bg-slate-900/60 border border-slate-700 rounded-xl cursor-pointer hover:border-cyan-500/50 transition-colors">
                            <input type="checkbox" class="barcode-imei-checkbox rounded border-slate-600 bg-slate-900 text-cyan-500 focus:ring-cyan-500 mr-3" value="${imei}" checked>
                            <span class="text-slate-300 font-mono text-sm">${imei}</span>
                        </label>
                    `;
                });
                html += `</div>`;
                if (barcodeModalDynamicContent) barcodeModalDynamicContent.innerHTML = html;

                const selectAllCb = document.getElementById('barcode-select-all');
                const imeiCbs = document.querySelectorAll('.barcode-imei-checkbox');
                if (selectAllCb) {
                    selectAllCb.addEventListener('change', (e) => {
                        imeiCbs.forEach(cb => cb.checked = e.target.checked);
                    });
                }
                imeiCbs.forEach(cb => {
                    cb.addEventListener('change', () => {
                        const allChecked = Array.from(imeiCbs).every(c => c.checked);
                        if (selectAllCb) selectAllCb.checked = allChecked;
                    });
                });
            }
        } else {
            // Accessory: Quantity Input
            const maxQty = product.quantity || 0;
            if (barcodeModalDynamicContent) {
                barcodeModalDynamicContent.innerHTML = `
                    <div class="space-y-2">
                        <label class="block text-slate-300 text-sm font-medium">จำนวนที่ต้องการพิมพ์</label>
                        <div class="flex items-center gap-3">
                            <button type="button" id="barcode-qty-minus" class="w-10 h-10 rounded-xl bg-slate-700 text-white flex items-center justify-center hover:bg-slate-600 transition-colors"><i class="fa-solid fa-minus"></i></button>
                            <input type="number" id="barcode-qty-input" value="1" min="1" max="${maxQty > 0 ? maxQty : 1}" class="flex-1 h-10 bg-slate-900 border border-slate-700 rounded-xl text-center text-white focus:outline-none focus:border-cyan-500 font-mono text-lg">
                            <button type="button" id="barcode-qty-plus" class="w-10 h-10 rounded-xl bg-slate-700 text-white flex items-center justify-center hover:bg-slate-600 transition-colors"><i class="fa-solid fa-plus"></i></button>
                        </div>
                        <p class="text-xs text-slate-500 text-right mt-1">สูงสุด: ${maxQty} ดวง</p>
                    </div>
                `;

                const qtyInput = document.getElementById('barcode-qty-input');
                const btnMinus = document.getElementById('barcode-qty-minus');
                const btnPlus = document.getElementById('barcode-qty-plus');

                if (qtyInput) {
                    qtyInput.addEventListener('blur', () => {
                        let val = parseInt(qtyInput.value);
                        let limit = Math.max(1, maxQty);
                        if (isNaN(val) || val < 1) {
                            qtyInput.value = 1;
                        } else if (val > limit) {
                            qtyInput.value = limit;
                        } else {
                            qtyInput.value = val;
                        }
                    });
                }

                if (btnMinus) {
                    btnMinus.addEventListener('click', () => {
                        let val = parseInt(qtyInput.value) || 1;
                        if (val > 1) qtyInput.value = val - 1;
                    });
                }
                if (btnPlus) {
                    btnPlus.addEventListener('click', () => {
                        let val = parseInt(qtyInput.value) || 1;
                        let limit = Math.max(1, maxQty);
                        if (val < limit) qtyInput.value = val + 1;
                    });
                }
            }
        }

        if (barcodeModal) {
            barcodeModal.classList.remove('hidden');
            void barcodeModal.offsetWidth;
            barcodeModal.classList.remove('opacity-0', 'pointer-events-none');
        }
    };

    const closeBarcodeModal = () => {
        if (!barcodeModal) return;
        barcodeModal.classList.add('opacity-0', 'pointer-events-none');
        setTimeout(() => barcodeModal.classList.add('hidden'), 300);
        currentBarcodeProduct = null;
    };

    if (closeBarcodeModalBtn) closeBarcodeModalBtn.addEventListener('click', closeBarcodeModal);
    if (cancelBarcodeModalBtn) cancelBarcodeModalBtn.addEventListener('click', closeBarcodeModal);

    if (submitBarcodePrintBtn) {
        submitBarcodePrintBtn.addEventListener('click', () => {
            if (!currentBarcodeProduct) return;

            const categoryName = currentBarcodeProduct.type_id && currentBarcodeProduct.type_id.name ? currentBarcodeProduct.type_id.name : '';
            const isDevice = categoryName.includes('iPhone') || categoryName.includes('iPad');
            let printData = [];

            if (isDevice) {
                const imeiCbs = document.querySelectorAll('.barcode-imei-checkbox:checked');
                if (imeiCbs.length === 0) {
                    showToast('กรุณาเลือก IMEI อย่างน้อย 1 รายการ', 'error');
                    return;
                }
                imeiCbs.forEach(cb => {
                    printData.push({
                        barcode: cb.value,
                        name: currentBarcodeProduct.name
                    });
                });
            } else {
                const qtyInput = document.getElementById('barcode-qty-input');
                const qty = parseInt(qtyInput ? qtyInput.value : 1) || 1;

                if (!currentBarcodeProduct.product_code) {
                    showToast('สินค้านี้ไม่มีรหัสสินค้า (Barcode)', 'error');
                    return;
                }

                for (let i = 0; i < qty; i++) {
                    printData.push({
                        barcode: currentBarcodeProduct.product_code,
                        name: currentBarcodeProduct.name
                    });
                }
            }

            if (printData.length > 0) {
                localStorage.setItem('print_barcodes', JSON.stringify(printData));
                window.open('barcode-print.html', '_blank');
                closeBarcodeModal();
            }
        });
    }

    // ซ่อน Error Message เมื่อผู้ใช้เริ่มพิมพ์ใหม่
    const hideLoginError = () => {
        if (loginError) {
            loginError.classList.add('hidden');
            loginError.textContent = '';
        }
    };

    if (usernameInput) {
        usernameInput.addEventListener('input', hideLoginError);
    }
    if (passwordInput) {
        passwordInput.addEventListener('input', hideLoginError);
    }

    // ==========================================
    // Login Logic (JWT Authentication)
    // ==========================================
    loginForm.addEventListener('submit', async (e) => {
        e.preventDefault();

        const username = usernameInput.value.trim();
        const password = passwordInput.value;

        try {
            const response = await fetch(`${API_BASE_URL}/auth/login`, {
                method: 'POST',
                headers: { 'Content-Type': 'application/json' },
                body: JSON.stringify({ username, password })
            });

            const result = await response.json();

            if (result.success) {
                loginError.classList.add('hidden');

                // Save JWT token & user data
                localStorage.setItem('silmin_token', result.token);
                localStorage.setItem('silmin_user', JSON.stringify(result.data));

                // Fade out login
                loginScreen.classList.remove('opacity-100');
                loginScreen.classList.add('opacity-0');

                setTimeout(() => {
                    loginScreen.classList.add('hidden');
                    loginScreen.classList.remove('flex');

                    mainLayout.classList.remove('hidden');
                    void mainLayout.offsetWidth;
                    mainLayout.classList.remove('opacity-0');
                    mainLayout.classList.add('opacity-100');

                    // Update top bar
                    updateTopBar(result.data);
                    applyPermissions(result.data.permissions);

                    // แสดง dashboard โดย default
                    switchView('dashboard');

                    // เรียกใช้ฟังก์ชันดึงข้อมูลทั้งหมดหลังจาก login สำเร็จ
                    fetchMasterData();
                    fetchProducts();
                    loadBranches();
                    loadEmployees();
                    loadDashboardData();
                    fetchPosProducts();
                    loadRoles();
                    startPendingTransferPolling();
                }, 500);
            } else {
                showLoginError(result.message || 'ชื่อผู้ใช้งานหรือรหัสผ่านไม่ถูกต้อง กรุณาลองใหม่อีกครั้ง');
            }
        } catch (error) {
            console.error('Login error:', error);
            showLoginError('เกิดข้อผิดพลาดในการเชื่อมต่อกับเซิร์ฟเวอร์');
        }
    });

    const showLoginError = (message) => {
        loginError.textContent = message;
        loginError.classList.remove('hidden');
        loginForm.classList.add('animate-[shake_0.5s_ease-in-out]');
        setTimeout(() => {
            loginForm.classList.remove('animate-[shake_0.5s_ease-in-out]');
        }, 500);
    };

    // Logout Logic (ออกจากระบบ)
    logoutBtn.addEventListener('click', () => {
        // Clear JWT & session
        localStorage.removeItem('silmin_token');
        localStorage.removeItem('silmin_user');
        stopPendingTransferPolling();

        mainLayout.classList.remove('opacity-100');
        mainLayout.classList.add('opacity-0');

        setTimeout(() => {
            mainLayout.classList.add('hidden');
            loginForm.reset();
            loginError.classList.add('hidden');

            loginScreen.classList.remove('hidden');
            loginScreen.classList.add('flex');
            void loginScreen.offsetWidth;
            loginScreen.classList.remove('opacity-0');
            loginScreen.classList.add('opacity-100');
        }, 500);
    });

    // ==========================================
    // UI Behaviors (Sidebar, Modals)
    // ==========================================
    toggleSidebarBtn.addEventListener('click', () => {
        if (sidebar.classList.contains('sidebar-expanded')) {
            sidebar.classList.remove('sidebar-expanded');
            sidebar.classList.add('sidebar-collapsed');
        } else {
            sidebar.classList.remove('sidebar-collapsed');
            sidebar.classList.add('sidebar-expanded');
        }
    });

    const handleResize = () => {
        if (window.innerWidth < 768) {
            sidebar.classList.remove('sidebar-expanded');
            sidebar.classList.add('sidebar-collapsed');
        } else {
            sidebar.classList.remove('sidebar-collapsed');
            sidebar.classList.add('sidebar-expanded');
        }
    };

    handleResize();
    window.addEventListener('resize', handleResize);

    if (closeModalBtn) closeModalBtn.addEventListener('click', closeModal);
    if (cancelModalBtn) cancelModalBtn.addEventListener('click', closeModal);

    // ==========================================
    // Dynamic Form Logic
    // ==========================================
    if (productCategory) {
        productCategory.addEventListener('change', (e) => {
            // Get the text of the selected option, not the ObjectId value
            const selectedOption = e.target.options[e.target.selectedIndex];
            const categoryName = selectedOption.textContent;

            // Simple logic: if it contains "อุปกรณ์เสริม", it's an accessory
            if (categoryName.includes('iPhone') || categoryName.includes('iPad')) {
                deviceFields.classList.remove('hidden');
                imeiField.classList.remove('hidden');

                productImeis.required = true;
                productQuantity.required = true;
                if (productCapacity) productCapacity.required = true;
                if (productCondition) productCondition.required = true;

                // Try to auto-select "เครื่อง" unit if available
                Array.from(productUnit.options).forEach(opt => {
                    if (opt.textContent === 'เครื่อง') productUnit.value = opt.value;
                });
            } else if (categoryName.includes('อุปกรณ์เสริม')) {
                deviceFields.classList.add('hidden');
                imeiField.classList.add('hidden');

                productImeis.required = false;
                productQuantity.required = true;
                if (productCapacity) productCapacity.required = false;
                if (productCondition) productCondition.required = false;

                // Try to auto-select "ชิ้น" unit if available
                Array.from(productUnit.options).forEach(opt => {
                    if (opt.textContent === 'ชิ้น') productUnit.value = opt.value;
                });
            }
        });
    }

    if (productImeis) {
        productImeis.addEventListener('input', (e) => {
            const imeis = e.target.value.split('\n').filter(i => i.trim() !== '');
            if (imeis.length > 0) {
                productQuantity.value = imeis.length;
            }
        });
    }

    // Image Preview Logic
    const productImageInput = document.getElementById('product-image');
    const imagePreview = document.getElementById('image-preview');

    if (productImageInput && imagePreview) {
        productImageInput.addEventListener('change', (e) => {
            const file = e.target.files[0];
            if (file) {
                const reader = new FileReader();
                reader.onload = (event) => {
                    imagePreview.innerHTML = `<img src="${event.target.result}" class="w-full h-full object-cover">`;
                };
                reader.readAsDataURL(file);
            }
        });
    }

    // ==========================================
    // Form Submit (API Call)
    // ==========================================
    if (addProductForm) {
        addProductForm.addEventListener('submit', async (e) => {
            e.preventDefault();

            const submitBtn = addProductForm.querySelector('button[type="submit"]');
            const originalBtnText = submitBtn.innerHTML;

            // Collect branch from dropdown
            const branch_id = productBranch ? productBranch.value : null;

            // Build payload
            const selectedNameOption = productName.options[productName.selectedIndex];
            const nameValue = (selectedNameOption && !selectedNameOption.disabled) ? selectedNameOption.textContent : '';

            const payload = {
                product_code: productCode ? productCode.value.trim() : '',
                supplier_id: productSupplier ? productSupplier.value : null,
                name: nameValue,
                type_id: productCategory.value,
                color_id: productColor.value || null,
                cost_price: Number(document.getElementById('cost-price').value),
                selling_price: Number(document.getElementById('selling-price').value),
                unit_id: productUnit.value || null,
                capacity_id: productCapacity.value || null,
                condition_id: productCondition.value || null,
                branch_id: branch_id || null,
                quantity: Number(productQuantity.value) || 1,
                old_branch_id: window.__editingProductOriginalBranchId || null
            };

            const selectedOption = productCategory.options[productCategory.selectedIndex];
            const categoryName = selectedOption.textContent;

            if (categoryName.includes('iPhone') || categoryName.includes('iPad')) {
                payload.imeis = productImeis.value.split('\n').filter(i => i.trim() !== '');
                if (payload.imeis.length === 0) return showToast('กรุณาระบุ IMEI อย่างน้อย 1 รายการ', 'error');
            }

            try {
                // Show Loading State
                submitBtn.disabled = true;
                submitBtn.innerHTML = `<i class="fa-solid fa-circle-notch fa-spin mr-2"></i> กำลังบันทึก...`;

                const editIdInput = document.getElementById('edit-product-id');
                const editIdValue = editIdInput ? editIdInput.value : '';
                const isEditing = editIdValue && editIdValue.trim() !== '';

                const url = isEditing ? `${API_BASE_URL}/products/${editIdValue}` : `${API_BASE_URL}/products`;
                const method = isEditing ? 'PUT' : 'POST';

                const response = await authFetch(url, {
                    method: method,
                    headers: { 'Content-Type': 'application/json' },
                    body: JSON.stringify(payload)
                });

                const result = await response.json();

                if (result.success) {
                    showToast(isEditing ? 'แก้ไขข้อมูลสินค้าสำเร็จ' : 'บันทึกข้อมูลสินค้าใหม่สำเร็จ');
                    closeModal();
                    await fetchProducts(); // Refresh Table
                } else {
                    showToast('เกิดข้อผิดพลาด: ' + result.message, 'error');
                }
            } catch (error) {
                console.error('Error saving product:', error);
                showToast('ไม่สามารถเชื่อมต่อกับเซิร์ฟเวอร์ได้', 'error');
            } finally {
                // Reset Button
                submitBtn.disabled = false;
                submitBtn.innerHTML = originalBtnText;
            }
        });
    }

    // ==========================================
    // View Navigation Logic
    // ==========================================
    const switchView = async (viewName) => {
        // Reset all active states
        document.querySelectorAll('.nav-menu-item').forEach(item => {
            item.classList.remove('bg-cyan-500/10', 'text-cyan-400', 'border', 'border-cyan-500/20', 'active');
            item.classList.add('text-slate-300', 'hover:bg-slate-700/50', 'hover:text-white');
            item.style.borderColor = 'transparent';
        });

        // Hide all views and remove animation
        const views = [
            viewDashboard, viewStock, viewTransactions, viewPersonnel,
            viewBranches, viewSettings, viewRoles, viewSalesHistory,
            viewTransfers, viewMovements, viewMembers,
            viewReportArrival, viewApproveImport, viewWarrantyCheck,
            viewBranchInventory, viewAccountingPO, viewBranchReceive
        ];
        views.forEach(view => {
            if (view) {
                view.classList.add('hidden');
                view.classList.remove('animate-fade-in');
            }
        });

        // Helper to activate
        const activateView = (view, nav) => {
            if (view) {
                view.classList.remove('hidden');
                // เลื่อนขึ้นบนสุดเมื่อเปลี่ยนหน้า
                const mainContent = document.getElementById('main-content');
                if (mainContent) mainContent.scrollTop = 0;

                void view.offsetWidth; // trigger reflow
                void view.offsetWidth;
                view.classList.add('animate-fade-in');
            }
            if (nav) {
                nav.classList.remove('text-slate-300', 'hover:bg-slate-700/50', 'hover:text-white');
                nav.classList.add('bg-cyan-500/10', 'text-cyan-400', 'border', 'border-cyan-500/20', 'active');
            }
        };

        if (viewName === 'dashboard') {
            activateView(viewDashboard, navDashboard);
        }
        else if (viewName === 'stock') {
            activateView(viewStock, navStock);
            allProductsCache = []; // Clear cache to ensure fresh data including transferring items
            await fetchProducts();
        }
        else if (viewName === 'transactions') {
            activateView(viewTransactions, navTransactions);
            // โหลดสินค้าสำหรับ POS (Backend จะกรองตามสาขาอัตโนมัติสำหรับพนักงานขาย)
            await fetchPosProducts();
            updatePosBranchBadge();
        }
        else if (viewName === 'personnel') {
            activateView(viewPersonnel, navPersonnel);
            loadEmployees();
        }
        else if (viewName === 'branches') {
            activateView(viewBranches, navBranches);
            loadBranches();
        }
        else if (viewName === 'settings') {
            activateView(viewSettings, navSettings);
            await fetchMasterData();
            if (typeof renderSettingsList === 'function') renderSettingsList();
        }
        else if (viewName === 'roles') {
            activateView(viewRoles, navRoles);
            loadRoles();
        }
        else if (viewName === 'sales-history') {
            activateView(viewSalesHistory, navSalesHistory);
            loadBranchesForSalesHistory();
            loadSalesHistory();
        }
        else if (viewName === 'transfers') {
            activateView(viewTransfers, navTransfers);
            loadTransfers();
        }
        else if (viewName === 'movements') {
            activateView(viewMovements, navMovements);
            setTimeout(() => {
                const searchInput = document.getElementById('movement-search-input');
                if (searchInput) searchInput.focus();
            }, 100);
        }
        else if (viewName === 'members') {
            activateView(viewMembers, navMembers);
            loadMembers();
        }
        else if (viewName === 'report-arrival') {
            activateView(viewReportArrival, navReportArrival);
        }
        else if (viewName === 'approve-import') {
            activateView(viewApproveImport, navApproveImport);
            if (typeof loadImportNotifications === 'function') {
                loadImportNotifications();
            }
        }
        else if (viewName === 'warranty-check') {
            activateView(viewWarrantyCheck, navWarrantyCheck);
        }
        else if (viewName === 'branch-inventory') {
            activateView(viewBranchInventory, navBranchInventory);
            if (typeof initBranchInventory === 'function') initBranchInventory();
        }
        else if (viewName === 'accounting-po') {
            activateView(viewAccountingPO, navAccountingPO);
            if (typeof initAccountingPO === 'function') initAccountingPO();
        }
        else if (viewName === 'branch-receive') {
            activateView(viewBranchReceive, navBranchReceive);
            if (typeof initBranchReceive === 'function') initBranchReceive();
        }
    };

    if (navDashboard) navDashboard.addEventListener('click', (e) => { e.preventDefault(); switchView('dashboard'); });
    if (navBranchInventory) navBranchInventory.addEventListener('click', (e) => { e.preventDefault(); switchView('branch-inventory'); });
    if (navStock) navStock.addEventListener('click', (e) => { e.preventDefault(); switchView('stock'); });
    if (navTransactions) navTransactions.addEventListener('click', (e) => { e.preventDefault(); switchView('transactions'); });
    if (navPersonnel) navPersonnel.addEventListener('click', (e) => { e.preventDefault(); switchView('personnel'); });
    if (navBranches) navBranches.addEventListener('click', (e) => { e.preventDefault(); switchView('branches'); });
    if (navSettings) navSettings.addEventListener('click', (e) => { e.preventDefault(); switchView('settings'); });
    if (navRoles) navRoles.addEventListener('click', (e) => { e.preventDefault(); switchView('roles'); });
    if (navSalesHistory) navSalesHistory.addEventListener('click', (e) => { e.preventDefault(); switchView('sales-history'); });
    if (navTransfers) navTransfers.addEventListener('click', (e) => { e.preventDefault(); switchView('transfers'); });
    if (navMovements) navMovements.addEventListener('click', (e) => { e.preventDefault(); switchView('movements'); });
    if (navMembers) navMembers.addEventListener('click', (e) => { e.preventDefault(); switchView('members'); });
    if (navReportArrival) navReportArrival.addEventListener('click', (e) => { e.preventDefault(); switchView('report-arrival'); });
    if (navApproveImport) navApproveImport.addEventListener('click', (e) => { e.preventDefault(); switchView('approve-import'); });
    if (navWarrantyCheck) navWarrantyCheck.addEventListener('click', (e) => { e.preventDefault(); switchView('warranty-check'); });
    if (navAccountingPO) navAccountingPO.addEventListener('click', (e) => { e.preventDefault(); switchView('accounting-po'); });
    if (navBranchReceive) navBranchReceive.addEventListener('click', (e) => { e.preventDefault(); switchView('branch-receive'); });

    // Dashboard card click to transfers
    const cardPendingTransfer = document.getElementById('card-pending-transfer');
    if (cardPendingTransfer) {
        cardPendingTransfer.addEventListener('click', () => {
            if (navTransfers) {
                switchView('transfers');
                if (transferTabIncoming) transferTabIncoming.click();
            }
        });
    }

    // Auto-login check (JWT Token) - moved here after switchView is defined
    const savedToken = localStorage.getItem('silmin_token');
    const savedUser = localStorage.getItem('silmin_user');
    if (savedToken && savedUser) {
        try {
            const user = JSON.parse(savedUser);
            loginScreen.classList.add('hidden');
            loginScreen.classList.remove('flex');
            mainLayout.classList.remove('hidden', 'opacity-0');
            mainLayout.classList.add('opacity-100');
            switchView('dashboard');
            updateTopBar(user);
            applyPermissions(user.permissions);
            fetchMasterData();
            startPendingTransferPolling();
        } catch (e) {
            localStorage.removeItem('silmin_token');
            localStorage.removeItem('silmin_user');
        }
    }

    // ==========================================
    // Stock Search & Filter UI Events
    // ==========================================
    if (stockSearchInput) {
        stockSearchInput.addEventListener('input', (e) => {
            const v = e.target.value;
            clearTimeout(stockSearchDebounceId);
            stockSearchDebounceId = setTimeout(() => {
                stockSearchQuery = v.trim();
                applyStockSearchAndFilters();
            }, 300);
        });

        stockSearchInput.addEventListener('keydown', (e) => {
            if (e.key === 'Escape') {
                e.preventDefault();
                stockSearchQuery = '';
                stockSearchInput.value = '';
                applyStockSearchAndFilters();
            }
        });
    }

    if (btnStockFilter) {
        btnStockFilter.addEventListener('click', (e) => {
            e.stopPropagation();
            if (!stockFilterPanel) return;
            if (stockFilterPanel.classList.contains('hidden')) openStockFilterPanel();
            else closeStockFilterPanel();
        });
    }
    if (btnStockFilterClose) btnStockFilterClose.addEventListener('click', closeStockFilterPanel);
    document.addEventListener('click', (e) => {
        if (!stockFilterPanel || stockFilterPanel.classList.contains('hidden')) return;
        const t = e.target;
        if (btnStockFilter && (btnStockFilter === t || btnStockFilter.contains(t))) return;
        if (stockFilterPanel.contains(t)) return;
        closeStockFilterPanel();
    });

    const syncFiltersFromPanel = () => {
        if (stockFilterBranch) stockFilters.branchId = stockFilterBranch.value || '';
        if (stockFilterCategory) stockFilters.categoryId = stockFilterCategory.value || '';
        if (stockFilterSupplier) stockFilters.supplierId = stockFilterSupplier.value || '';
        if (stockFilterStatus) stockFilters.status = stockFilterStatus.value || '';
        stockFilters.priceMin = stockFilterPriceMin ? (stockFilterPriceMin.value === '' ? '' : stockFilterPriceMin.value) : '';
        stockFilters.priceMax = stockFilterPriceMax ? (stockFilterPriceMax.value === '' ? '' : stockFilterPriceMax.value) : '';
    };

    if (btnStockFilterApply) {
        btnStockFilterApply.addEventListener('click', () => {
            syncFiltersFromPanel();
            applyStockSearchAndFilters();
            closeStockFilterPanel();
        });
    }

    if (btnStockFilterReset) {
        btnStockFilterReset.addEventListener('click', () => {
            resetStockFiltersToDefault();
            applyStockSearchAndFilters();
        });
    }

    if (stockFilterBranch) stockFilterBranch.addEventListener('change', () => { syncFiltersFromPanel(); applyStockSearchAndFilters(); });
    if (stockFilterCategory) stockFilterCategory.addEventListener('change', () => { syncFiltersFromPanel(); applyStockSearchAndFilters(); });
    if (stockFilterSupplier) stockFilterSupplier.addEventListener('change', () => { syncFiltersFromPanel(); applyStockSearchAndFilters(); });
    if (stockFilterStatus) stockFilterStatus.addEventListener('change', () => { syncFiltersFromPanel(); applyStockSearchAndFilters(); });
    if (stockFilterPriceMin) stockFilterPriceMin.addEventListener('input', () => { syncFiltersFromPanel(); applyStockSearchAndFilters(); });
    if (stockFilterPriceMax) stockFilterPriceMax.addEventListener('input', () => { syncFiltersFromPanel(); applyStockSearchAndFilters(); });

    // ==========================================
    // Branch Management Logic
    // ==========================================

    async function loadBranches() {
        if (!branchGrid) return;

        try {
            const response = await authFetch(`${API_BASE_URL}/branches`);
            const json = await response.json();

            branchGrid.innerHTML = '';

            if (json.success && json.data.length > 0) {
                branchEmptyState.classList.add('hidden');

                json.data.forEach(branch => {
                    const card = document.createElement('div');
                    card.className = 'bg-slate-800 rounded-2xl border border-slate-700 p-6 shadow-lg hover:border-slate-500 transition-colors group relative overflow-hidden';
                    card.innerHTML = `
                        <div class="absolute top-0 right-0 p-4 flex gap-2 opacity-0 group-hover:opacity-100 transition-opacity">
                            <button class="btn-edit-branch w-8 h-8 rounded-lg bg-slate-700/50 flex items-center justify-center text-slate-400 hover:text-yellow-400 hover:bg-yellow-400/10 transition-colors" data-id="${branch._id}" data-name="${branch.name}" data-address="${branch.address || ''}">
                                <i class="fa-solid fa-pen text-sm"></i>
                            </button>
                            <button class="btn-delete-branch w-8 h-8 rounded-lg bg-slate-700/50 flex items-center justify-center text-slate-400 hover:text-red-400 hover:bg-red-400/10 transition-colors" data-id="${branch._id}">
                                <i class="fa-solid fa-trash-can text-sm"></i>
                            </button>
                        </div>
                        <div class="w-12 h-12 rounded-xl bg-cyan-500/10 flex items-center justify-center text-cyan-400 mb-4 border border-cyan-500/20">
                            <i class="fa-solid fa-store text-xl"></i>
                        </div>
                        <h4 class="text-xl font-bold text-white mb-2">${branch.name}</h4>
                        <p class="text-sm text-slate-400 line-clamp-2">${branch.address || 'ไม่มีรายละเอียดที่อยู่'}</p>
                    `;
                    branchGrid.appendChild(card);
                });

                // Attach event listeners for Edit/Delete buttons
                document.querySelectorAll('.btn-edit-branch').forEach(btn => {
                    btn.addEventListener('click', (e) => {
                        const target = e.currentTarget;
                        openBranchModal(
                            target.getAttribute('data-id'),
                            target.getAttribute('data-name'),
                            target.getAttribute('data-address')
                        );
                    });
                });

                document.querySelectorAll('.btn-delete-branch').forEach(btn => {
                    btn.addEventListener('click', (e) => {
                        const id = e.currentTarget.getAttribute('data-id');
                        showConfirm('ยืนยันการลบสาขา', 'คุณแน่ใจหรือไม่ที่จะลบสาขานี้? ข้อมูลนี้ไม่สามารถกู้คืนได้', async () => {
                            try {
                                const response = await authFetch(`${API_BASE_URL}/branches/${id}`, { method: 'DELETE' });
                                const result = await response.json();
                                if (result.success) {
                                    showToast('ลบสาขาสำเร็จ');
                                    loadBranches();
                                } else {
                                    showToast('เกิดข้อผิดพลาด: ' + result.message, 'error');
                                }
                            } catch (err) {
                                showToast('ไม่สามารถลบสาขาได้', 'error');
                            }
                        });
                    });
                });

            } else {
                branchEmptyState.classList.remove('hidden');
                branchEmptyState.classList.add('flex');
            }
        } catch (error) {
            console.error('Error loading branches:', error);
            showToast('ดึงข้อมูลสาขาไม่สำเร็จ', 'error');
        }
    }

    const openBranchModal = (id = '', name = '', address = '') => {
        branchIdInput.value = id;
        branchNameInput.value = name;
        branchAddressInput.value = address;

        if (id) {
            branchModalTitle.innerHTML = `<i class="fa-solid fa-pen-to-square text-cyan-400"></i> แก้ไขสาขา`;
        } else {
            branchModalTitle.innerHTML = `<i class="fa-solid fa-store text-cyan-400"></i> เพิ่มสาขาใหม่`;
        }

        branchModal.classList.remove('opacity-0', 'pointer-events-none');
        // trigger reflow
        void branchModal.offsetWidth;
        branchModal.firstElementChild.classList.remove('scale-95');
        branchModal.firstElementChild.classList.add('scale-100');
    };

    const closeBranchModal = () => {
        branchModal.classList.add('opacity-0', 'pointer-events-none');
        branchModal.firstElementChild.classList.remove('scale-100');
        branchModal.firstElementChild.classList.add('scale-95');
        branchForm.reset();
        branchIdInput.value = '';
    };

    if (btnAddBranch) btnAddBranch.addEventListener('click', () => openBranchModal());
    if (closeBranchModalBtn) closeBranchModalBtn.addEventListener('click', closeBranchModal);
    if (cancelBranchModalBtn) cancelBranchModalBtn.addEventListener('click', closeBranchModal);

    if (branchForm) {
        branchForm.addEventListener('submit', async (e) => {
            e.preventDefault();
            const id = branchIdInput.value;
            const name = branchNameInput.value.trim();
            const address = branchAddressInput.value.trim();

            const originalText = submitBranchBtn.innerHTML;
            submitBranchBtn.disabled = true;
            submitBranchBtn.innerHTML = `<i class="fa-solid fa-circle-notch fa-spin"></i> กำลังบันทึก...`;

            try {
                const url = id ? `${API_BASE_URL}/branches/${id}` : `${API_BASE_URL}/branches`;
                const method = id ? 'PUT' : 'POST';

                const response = await authFetch(url, {
                    method: method,
                    headers: { 'Content-Type': 'application/json' },
                    body: JSON.stringify({ name, address })
                });

                const result = await response.json();

                if (result.success) {
                    showToast(id ? 'แก้ไขข้อมูลสาขาสำเร็จ' : 'เพิ่มสาขาใหม่สำเร็จ');
                    closeBranchModal();
                    loadBranches();
                } else {
                    showToast('เกิดข้อผิดพลาด: ' + result.message, 'error');
                }
            } catch (err) {
                console.error('Error saving branch:', err);
                showToast('ไม่สามารถบันทึกข้อมูลได้', 'error');
            } finally {
                submitBranchBtn.disabled = false;
                submitBranchBtn.innerHTML = originalText;
            }
        });
    }

    // ==========================================
    // Master Data Settings Logic
    function renderSettingsList() {
        if (!masterDataList) return;

        if (masterDataCodeInput) {
            if (currentSettingsTab === 'productname') {
                masterDataCodeInput.classList.remove('hidden');
            } else {
                masterDataCodeInput.classList.add('hidden');
            }
        }

        let dataArray = [];
        if (window.masterDataCache) {
            switch (currentSettingsTab) {
                case 'productname': dataArray = window.masterDataCache.productNames || []; break;
                case 'producttype': dataArray = window.masterDataCache.productTypes || []; break;
                case 'productunit': dataArray = window.masterDataCache.productUnits || []; break;
                case 'productcolor': dataArray = window.masterDataCache.productColors || []; break;
                case 'productcapacity': dataArray = window.masterDataCache.productCapacities || []; break;
                case 'productcondition': dataArray = window.masterDataCache.productConditions || []; break;
                case 'supplier': dataArray = window.masterDataCache.suppliers || []; break;
            }
        }

        masterDataList.innerHTML = '';

        if (dataArray.length === 0) {
            masterDataEmpty.classList.remove('hidden');
        } else {
            masterDataEmpty.classList.add('hidden');

            dataArray.forEach(item => {
                const card = document.createElement('div');
                card.className = 'bg-slate-900 border border-slate-700 rounded-xl p-4 flex items-center justify-between group hover:border-cyan-500/50 transition-colors';

                let displayName = item.name;
                let dataCodeAttr = '';
                if (currentSettingsTab === 'productname') {
                    dataCodeAttr = `data-code="${item.code || ''}"`;
                    if (item.code) {
                        displayName = `${item.name} <span class="text-xs text-slate-400 font-mono ml-1 bg-slate-800 px-1.5 py-0.5 rounded border border-slate-700/50">[${item.code}]</span>`;
                    }
                }

                card.innerHTML = `
                    <span class="text-white font-medium truncate pr-2">${displayName}</span>
                    <div class="flex items-center gap-1">
                        <button class="btn-edit-master text-slate-500 hover:text-cyan-400 transition-colors opacity-50 group-hover:opacity-100 p-2 rounded-lg hover:bg-cyan-500/10" data-id="${item._id}" data-name="${item.name}" ${dataCodeAttr}>
                            <i class="fa-solid fa-pen"></i>
                        </button>
                        <button class="btn-delete-master text-slate-500 hover:text-red-400 transition-colors opacity-50 group-hover:opacity-100 p-2 rounded-lg hover:bg-red-500/10" data-id="${item._id}">
                            <i class="fa-solid fa-trash-can"></i>
                        </button>
                    </div>
                `;
                masterDataList.appendChild(card);
            });

            // Attach edit listeners
            document.querySelectorAll('.btn-edit-master').forEach(btn => {
                btn.addEventListener('click', (e) => {
                    const id = e.currentTarget.getAttribute('data-id');
                    const oldName = e.currentTarget.getAttribute('data-name');
                    const oldCode = e.currentTarget.getAttribute('data-code') || '';

                    if (currentSettingsTab === 'productname') {
                        showPrompt('แก้ไขชื่อสินค้า', oldName, (newName) => {
                            if (newName && newName.trim() !== '') {
                                showPrompt('แก้ไขรหัสชื่อสินค้า (ปล่อยว่างไว้ได้)', oldCode, (newCode) => {
                                    const finalName = newName.trim();
                                    const finalCode = (newCode || '').trim();
                                    if (finalName !== oldName || finalCode !== oldCode) {
                                        editMasterData(id, finalName, finalCode);
                                    }
                                });
                            }
                        });
                    } else {
                        showPrompt('แก้ไขข้อมูล', oldName, (newName) => {
                            if (newName && newName.trim() !== '' && newName !== oldName) {
                                editMasterData(id, newName.trim());
                            }
                        });
                    }
                });
            });

            // Attach delete listeners
            document.querySelectorAll('.btn-delete-master').forEach(btn => {
                btn.addEventListener('click', (e) => {
                    const id = e.currentTarget.getAttribute('data-id');
                    showConfirm('ยืนยันการลบ', 'คุณแน่ใจหรือไม่ที่จะลบข้อมูลนี้? การลบอาจส่งผลกระทบต่อข้อมูลสินค้าที่มีอยู่', () => {
                        deleteMasterData(id);
                    });
                });
            });
        }
    }
    window.renderSettingsList = renderSettingsList;

    if (settingsTabBtns) {
        settingsTabBtns.forEach(btn => {
            btn.addEventListener('click', (e) => {
                // Update active tab styling
                settingsTabBtns.forEach(b => {
                    b.classList.remove('active', 'text-cyan-400', 'border-cyan-400');
                    b.classList.add('text-slate-400', 'border-transparent');
                });

                e.currentTarget.classList.remove('text-slate-400', 'border-transparent');
                e.currentTarget.classList.add('active', 'text-cyan-400', 'border-cyan-400');

                currentSettingsTab = e.currentTarget.getAttribute('data-tab');
                if (masterDataInput) masterDataInput.value = ''; // clear input
                if (masterDataCodeInput) {
                    masterDataCodeInput.value = '';
                    if (currentSettingsTab === 'productname') {
                        masterDataCodeInput.classList.remove('hidden');
                    } else {
                        masterDataCodeInput.classList.add('hidden');
                    }
                }
                renderSettingsList();
            });
        });
    }

    if (btnAddMasterData) {
        btnAddMasterData.addEventListener('click', async () => {
            const name = masterDataInput.value.trim();
            if (!name) return showToast('กรุณาระบุชื่อข้อมูลที่ต้องการเพิ่ม', 'error');

            const payload = { name };
            if (currentSettingsTab === 'productname' && masterDataCodeInput) {
                payload.code = masterDataCodeInput.value.trim();
            }

            try {
                const response = await authFetch(`${API_BASE_URL}/master/${currentSettingsTab}`, {
                    method: 'POST',
                    headers: { 'Content-Type': 'application/json' },
                    body: JSON.stringify(payload)
                });
                const result = await response.json();

                if (result.success) {
                    masterDataInput.value = '';
                    if (masterDataCodeInput) masterDataCodeInput.value = '';
                    showToast('เพิ่มข้อมูลสำเร็จ');
                    await fetchMasterData(); // reload data & re-render
                } else {
                    showToast('เกิดข้อผิดพลาด: ' + result.message, 'error');
                }
            } catch (error) {
                console.error('Error adding master data:', error);
                showToast('ไม่สามารถเพิ่มข้อมูลได้', 'error');
            }
        });
    }

    const editMasterData = async (id, name, code) => {
        try {
            const payload = { name };
            if (currentSettingsTab === 'productname') {
                payload.code = code || '';
            }
            const response = await authFetch(`${API_BASE_URL}/master/${currentSettingsTab}/${id}`, {
                method: 'PUT',
                headers: { 'Content-Type': 'application/json' },
                body: JSON.stringify(payload)
            });
            const result = await response.json();

            if (result.success) {
                showToast('แก้ไขข้อมูลสำเร็จ');
                await fetchMasterData(); // reload data & re-render
            } else {
                showToast('เกิดข้อผิดพลาด: ' + result.message, 'error');
            }
        } catch (error) {
            console.error('Error editing master data:', error);
            showToast('ไม่สามารถแก้ไขข้อมูลได้', 'error');
        }
    };

    const deleteMasterData = async (id) => {
        try {
            const response = await authFetch(`${API_BASE_URL}/master/${currentSettingsTab}/${id}`, {
                method: 'DELETE'
            });
            const result = await response.json();

            if (result.success) {
                showToast('ลบข้อมูลสำเร็จ');
                await fetchMasterData(); // reload data & re-render
            } else {
                showToast('เกิดข้อผิดพลาด: ' + result.message, 'error');
            }
        } catch (error) {
            console.error('Error deleting master data:', error);
            showToast('ไม่สามารถลบข้อมูลได้', 'error');
        }
    };

    // ==========================================
    // Employee Management Logic (จัดการพนักงาน)
    // ==========================================

    const employeeTableBody = document.getElementById('employee-table-body');
    const employeeEmptyState = document.getElementById('employee-empty-state');
    const employeeCountBadge = document.getElementById('employee-count-badge');
    const btnAddEmployee = document.getElementById('btn-add-employee');
    const employeeModal = document.getElementById('employee-modal');
    const employeeModalTitle = document.getElementById('employee-modal-title');
    const closeEmployeeModalBtn = document.getElementById('close-employee-modal-btn');
    const cancelEmployeeModalBtn = document.getElementById('cancel-employee-modal-btn');
    const employeeForm = document.getElementById('employee-form');
    const employeeEditId = document.getElementById('employee-edit-id');
    const empNameInput = document.getElementById('emp-name');
    const empIdInput = document.getElementById('emp-id');
    const empPasswordInput = document.getElementById('emp-password');
    const empBranchSelect = document.getElementById('emp-branch');
    const empRoleSelect = document.getElementById('emp-role');
    const submitEmployeeBtn = document.getElementById('submit-employee-btn');
    const passwordRequiredStar = document.getElementById('password-required-star');
    const empPasswordHint = document.getElementById('emp-password-hint');

    // Load employees from API
    async function loadEmployees() {
        if (!employeeTableBody) return;

        try {
            const response = await authFetch(`${API_BASE_URL}/employees`);
            const json = await response.json();

            if (json.success) {
                renderEmployeeTable(json.data);
            } else {
                showToast('ดึงข้อมูลพนักงานไม่สำเร็จ', 'error');
            }
        } catch (error) {
            console.error('เกิดข้อผิดพลาดในการดึงข้อมูลพนักงาน:', error);
            showToast('ดึงข้อมูลพนักงานไม่สำเร็จ', 'error');
        }
    }

    const renderEmployeeTable = (employees) => {
        if (!employeeTableBody) return;
        employeeTableBody.innerHTML = '';

        if (employeeCountBadge) employeeCountBadge.textContent = `${employees.length} คน`;

        if (employees.length === 0) {
            if (employeeEmptyState) {
                employeeEmptyState.classList.remove('hidden');
                employeeEmptyState.classList.add('flex');
            }
            employeeTableBody.innerHTML = `
                <tr>
                    <td colspan="5" class="px-6 py-8 text-center text-slate-500 italic">
                        ยังไม่มีข้อมูลพนักงานในระบบ
                    </td>
                </tr>
            `;
            return;
        }

        if (employeeEmptyState) {
            employeeEmptyState.classList.add('hidden');
            employeeEmptyState.classList.remove('flex');
        }

        employees.forEach(emp => {
            const row = document.createElement('tr');
            row.className = 'hover:bg-slate-700/20 transition-colors';

            const branchName = emp.branch_id ? emp.branch_id.name : '-';
            const nameForAvatar = encodeURIComponent(emp.name || 'User');

            // Role badge colors
            let roleClass = 'bg-slate-500/10 text-slate-400 border-slate-500/20';
            if (emp.role === 'แอดมิน') roleClass = 'bg-red-500/10 text-red-400 border-red-500/20';
            else if (emp.role === 'ผู้จัดการ') roleClass = 'bg-purple-500/10 text-purple-400 border-purple-500/20';
            else if (emp.role === 'พนักงานขาย') roleClass = 'bg-emerald-500/10 text-emerald-400 border-emerald-500/20';

            row.innerHTML = `
                <td class="px-6 py-4">
                    <div class="flex items-center gap-3">
                        <div class="w-8 h-8 rounded-full bg-slate-700 overflow-hidden flex-shrink-0">
                            <img src="https://ui-avatars.com/api/?name=${nameForAvatar}&background=0D8ABC&color=fff"
                                alt="${emp.name}" class="w-full h-full object-cover">
                        </div>
                        <p class="font-medium text-white">${emp.name}</p>
                    </div>
                </td>
                <td class="px-6 py-4">
                    <span class="text-slate-300 font-mono text-sm bg-slate-800 px-2 py-1 rounded border border-slate-700">${emp.emp_id}</span>
                </td>
                <td class="px-6 py-4">
                    <span class="px-2.5 py-1 ${roleClass} rounded-md text-xs font-medium border">${emp.role}</span>
                </td>
                <td class="px-6 py-4 text-slate-400">${branchName}</td>
                <td class="px-6 py-4 text-right">
                    <div class="flex items-center justify-end gap-1">
                        <button class="edit-emp-btn text-slate-400 hover:text-cyan-400 transition-colors p-2" data-id="${emp._id}"><i class="fa-solid fa-pen"></i></button>
                        <button class="delete-emp-btn text-slate-400 hover:text-red-400 transition-colors p-2" data-id="${emp._id}"><i class="fa-solid fa-trash"></i></button>
                    </div>
                </td>
            `;
            employeeTableBody.appendChild(row);

            // Attach edit listener
            row.querySelector('.edit-emp-btn').addEventListener('click', () => openEmployeeModal(emp));
            row.querySelector('.delete-emp-btn').addEventListener('click', () => deleteEmployee(emp._id, emp.name));
        });
    };

    // Load branches for employee modal dropdown
    const loadBranchesForEmployeeModal = async () => {
        if (!empBranchSelect) return;
        try {
            const response = await authFetch(`${API_BASE_URL}/branches`);
            const json = await response.json();
            if (json.success) {
                empBranchSelect.innerHTML = '<option value="">-- ไม่ระบุสาขา --</option>';
                json.data.forEach(branch => {
                    empBranchSelect.innerHTML += `<option value="${branch._id}">${branch.name}</option>`;
                });
            }
        } catch (error) {
            console.error('ดึงข้อมูลสาขาสำหรับฟอร์มพนักงานไม่สำเร็จ:', error);
        }
    };

    // โหลดตำแหน่ง (Role) สำหรับ dropdown พนักงาน
    const loadRolesForEmployeeModal = async () => {
        if (!empRoleSelect) return;
        try {
            const response = await authFetch(`${API_BASE_URL}/roles`);
            const json = await response.json();
            if (json.success) {
                empRoleSelect.innerHTML = '<option value="" disabled selected>เลือกตำแหน่ง</option>';
                json.data.forEach(role => {
                    empRoleSelect.innerHTML += `<option value="${role.name}">${role.name}</option>`;
                });
            }
        } catch (error) {
            console.error('ดึงข้อมูลตำแหน่งไม่สำเร็จ:', error);
        }
    };

    // Open Employee Modal
    const openEmployeeModal = (emp = null) => {
        if (!employeeModal) return;

        loadBranchesForEmployeeModal().then(() => {
            loadRolesForEmployeeModal().then(() => {
                if (emp) {
                    // Edit mode
                    employeeModalTitle.innerHTML = `<i class="fa-solid fa-pen-to-square text-cyan-400"></i> แก้ไขข้อมูลพนักงาน`;
                    employeeEditId.value = emp._id;
                    empNameInput.value = emp.name;
                    empIdInput.value = emp.emp_id;
                    empPasswordInput.value = '';
                    empPasswordInput.removeAttribute('required');
                    if (passwordRequiredStar) passwordRequiredStar.classList.add('hidden');
                    if (empPasswordHint) empPasswordHint.classList.remove('hidden');
                    if (empBranchSelect) {
                        const bId = emp.branch_id ? (emp.branch_id._id || emp.branch_id) : '';
                        empBranchSelect.value = bId ? bId.toString() : '';
                    }
                    if (empRoleSelect) empRoleSelect.value = emp.role || 'พนักงานขาย';
                } else {
                    // Add mode
                    employeeModalTitle.innerHTML = `<i class="fa-solid fa-user-plus text-cyan-400"></i> เพิ่มพนักงานใหม่`;
                    employeeEditId.value = '';
                    employeeForm.reset();
                    empPasswordInput.setAttribute('required', '');
                    if (passwordRequiredStar) passwordRequiredStar.classList.remove('hidden');
                    if (empPasswordHint) empPasswordHint.classList.add('hidden');
                }

                employeeModal.classList.remove('opacity-0', 'pointer-events-none');
                void employeeModal.offsetWidth;
                employeeModal.firstElementChild.classList.remove('scale-95');
                employeeModal.firstElementChild.classList.add('scale-100');
            });
        });
    };

    const closeEmployeeModal = () => {
        if (!employeeModal) return;
        employeeModal.classList.add('opacity-0', 'pointer-events-none');
        employeeModal.firstElementChild.classList.remove('scale-100');
        employeeModal.firstElementChild.classList.add('scale-95');
        employeeForm.reset();
        employeeEditId.value = '';
    };

    if (btnAddEmployee) btnAddEmployee.addEventListener('click', () => openEmployeeModal());
    if (closeEmployeeModalBtn) closeEmployeeModalBtn.addEventListener('click', closeEmployeeModal);
    if (cancelEmployeeModalBtn) cancelEmployeeModalBtn.addEventListener('click', closeEmployeeModal);

    // Employee Form Submit
    if (employeeForm) {
        employeeForm.addEventListener('submit', async (e) => {
            e.preventDefault();
            const id = employeeEditId.value;
            const name = empNameInput.value.trim();
            const emp_id = empIdInput.value.trim();
            const password = empPasswordInput.value;
            const role = empRoleSelect.value;
            const branch_id = empBranchSelect.value || null;

            if (!name || !emp_id) {
                showToast('กรุณากรอกข้อมูลให้ครบถ้วน', 'error');
                return;
            }

            // For new employee, password is required
            if (!id && !password) {
                showToast('กรุณาตั้งรหัสผ่าน', 'error');
                return;
            }

            const originalText = submitEmployeeBtn.innerHTML;
            submitEmployeeBtn.disabled = true;
            submitEmployeeBtn.innerHTML = `<i class="fa-solid fa-circle-notch fa-spin"></i> กำลังบันทึก...`;

            try {
                const url = id ? `${API_BASE_URL}/employees/${id}` : `${API_BASE_URL}/employees`;
                const method = id ? 'PUT' : 'POST';

                const body = { name, emp_id, role, branch_id };
                if (password) body.password = password;

                const response = await authFetch(url, {
                    method,
                    headers: { 'Content-Type': 'application/json' },
                    body: JSON.stringify(body)
                });

                const result = await response.json();

                if (result.success) {
                    showToast(id ? 'แก้ไขข้อมูลพนักงานสำเร็จ' : 'เพิ่มพนักงานใหม่สำเร็จ');
                    closeEmployeeModal();
                    loadEmployees();
                } else {
                    showToast('เกิดข้อผิดพลาด: ' + result.message, 'error');
                }
            } catch (error) {
                console.error('เกิดข้อผิดพลาดในการบันทึกพนักงาน:', error);
                showToast('ไม่สามารถบันทึกข้อมูลได้', 'error');
            } finally {
                submitEmployeeBtn.disabled = false;
                submitEmployeeBtn.innerHTML = originalText;
            }
        });
    }

    // Delete Employee
    const deleteEmployee = (id, name) => {
        showConfirm('ยืนยันการลบพนักงาน', `คุณแน่ใจหรือไม่ที่จะลบ "${name}"? ข้อมูลนี้ไม่สามารถกู้คืนได้`, async () => {
            try {
                const response = await authFetch(`${API_BASE_URL}/employees/${id}`, { method: 'DELETE' });
                const result = await response.json();

                if (result.success) {
                    showToast('ลบพนักงานสำเร็จ');
                    loadEmployees();
                } else {
                    showToast('เกิดข้อผิดพลาด: ' + result.message, 'error');
                }
            } catch (error) {
                console.error('เกิดข้อผิดพลาดในการลบพนักงาน:', error);
                showToast('ไม่สามารถลบพนักงานได้', 'error');
            }
        });
    };

    // ==========================================
    // POS / Transactions System (ระบบขายสินค้า)
    // ==========================================

    // Cart State
    let cart = [];
    let posProductsCache = [];

    // POS DOM Elements
    const posSearchInput = document.getElementById('pos-search-input');
    const posProductGrid = document.getElementById('pos-product-grid');
    const posEmptyState = document.getElementById('pos-empty-state');
    const posSearchResults = document.getElementById('pos-search-results');
    const cartItemsContainer = document.getElementById('cart-items-container');
    const cartEmptyState = document.getElementById('cart-empty-state');
    const cartCountBadge = document.getElementById('cart-count-badge');
    const posCartHeader = document.querySelector('#view-transactions .fa-basket-shopping')
        ? document.querySelector('#view-transactions .fa-basket-shopping').closest('h3')
        : null;
    const cartSubtotal = document.getElementById('cart-subtotal');
    // POS Modal & Checkout DOM Remapping
    const confirmPriceModal = document.getElementById('confirm-price-modal');
    const btnConfirmCheckout = document.getElementById('confirm-price-checkout-btn');
    const btnCancelPriceModal = document.getElementById('cancel-price-modal-btn');
    const btnClosePriceModal = document.getElementById('close-price-modal-btn');
    const confirmPriceList = document.getElementById('confirm-price-list');

    const posDiscount = document.getElementById('modal-pos-discount');
    const paymentMethod = document.getElementById('modal-pos-payment-method');
    // Split payment controls selectors
    const blockBuyCashDetails = document.getElementById('block-buy-cash-details');
    const blockFinanceDetails = document.getElementById('block-finance-details');

    const modalCashAmount = document.getElementById('modal-cash-amount');
    const modalTransferAmount = document.getElementById('modal-transfer-amount');

    const modalFinanceCompany = document.getElementById('modal-finance-company');
    const modalFinancePaymentDay = document.getElementById('modal-finance-payment-day');
    const modalFinanceMonths = document.getElementById('modal-finance-months');

    const modalFinanceDownCash = document.getElementById('modal-finance-down-cash');
    const modalFinanceDownTransfer = document.getElementById('modal-finance-down-transfer');
    const modalFinanceTotalDownLabel = document.getElementById('modal-finance-total-down-label');

    const btnCheckout = document.getElementById('btn-checkout');

    const modalSubtotalDisplay = document.getElementById('modal-subtotal-display');
    const modalDiscountDisplay = document.getElementById('modal-discount-display');
    const modalTotalDisplay = document.getElementById('modal-total-display');

    const paymentVerifyPanel = document.getElementById('payment-verify-panel');
    const paymentStatusBadge = document.getElementById('payment-status-badge');
    const verifyReceivedDisplay = document.getElementById('verify-received-display');
    const verifyResultLabel = document.getElementById('verify-result-label');
    const verifyChangeDisplay = document.getElementById('verify-change-display');

    // IMEI Modal DOM
    const imeiSelectModal = document.getElementById('imei-select-modal');
    const closeImeiModalBtn = document.getElementById('close-imei-modal');
    const imeiSearchInput = document.getElementById('imei-search-input');
    const imeiListContainer = document.getElementById('imei-list-container');

    // Member Selection DOM
    const posMemberSearch = document.getElementById('pos-member-search');
    const posMemberResults = document.getElementById('pos-member-results');
    const selectedMemberDisplay = document.getElementById('selected-member-display');
    const selectedMemberName = document.getElementById('selected-member-name');
    const selectedMemberPhone = document.getElementById('selected-member-phone');
    const selectedMemberId = document.getElementById('selected-member-id');
    const btnRemoveMember = document.getElementById('btn-remove-member');
    const btnPosAddMember = document.getElementById('btn-pos-add-member');

    // Sales History DOM Elements
    const salesHistorySearch = document.getElementById('sales-history-search');
    const salesHistoryDate = document.getElementById('sales-history-date');
    const salesHistoryBranch = document.getElementById('sales-history-branch');
    const salesHistoryBranchFilter = document.getElementById('sales-history-branch-filter');
    const salesHistoryTableBody = document.getElementById('sales-history-table-body');
    const salesHistoryEmpty = document.getElementById('sales-history-empty');

    // Transaction Details Modal DOM
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
    const transactionDetailFinanceMonths = document.getElementById('transaction-detail-finance-months');
    const transactionDetailFinanceDay = document.getElementById('transaction-detail-finance-day');
    const btnReprintReceipt = document.getElementById('btn-reprint-receipt');
    const btnCancelTransaction = document.getElementById('btn-cancel-transaction');
    const transactionCancelledAlert = document.getElementById('transaction-cancelled-alert');
    const transactionCancelledReason = document.getElementById('transaction-cancelled-reason');
    const transactionCancelledBy = document.getElementById('transaction-cancelled-by');
    const transactionCancelledAt = document.getElementById('transaction-cancelled-at');

    // Fetch products for POS
    async function fetchPosProducts() {
        try {
            const response = await authFetch(`${API_BASE_URL}/products`);
            const json = await response.json();
            if (json.success) {
                posProductsCache = json.data;
            }
        } catch (error) {
            console.error('เกิดข้อผิดพลาดในการดึงข้อมูลสินค้าสำหรับ POS:', error);
        }
    }

    const getCurrentUserForPos = () => {
        try {
            const savedUserData = localStorage.getItem('silmin_user');
            if (!savedUserData) return null;
            return JSON.parse(savedUserData);
        } catch {
            return null;
        }
    };

    const updatePosBranchBadge = () => {
        if (!posCartHeader) return;

        const user = getCurrentUserForPos();
        const branchName = user && user.branch && user.branch.name ? user.branch.name : '';

        let badge = document.getElementById('pos-branch-badge');
        if (!badge) {
            badge = document.createElement('span');
            badge.id = 'pos-branch-badge';
            badge.className = 'ml-2 text-xs font-bold px-2 py-1 rounded-full border border-slate-600 text-slate-300 bg-slate-900/50';
            posCartHeader.insertBefore(badge, cartCountBadge);
        }

        badge.textContent = branchName ? `คลังสินค้า: ${branchName}` : 'คลังสินค้า: -';
    };

    // Search/Filter Logic
    const searchPosProducts = (query) => {
        if (!query || query.trim() === '') {
            posEmptyState.classList.remove('hidden');
            posSearchResults.classList.add('hidden');
            posSearchResults.innerHTML = '';
            return;
        }

        const q = query.trim().toLowerCase();
        const results = posProductsCache.filter(p => {
            // Match by name
            if (p.name && p.name.toLowerCase().includes(q)) return true;
            // Match by product code
            if (p.product_code && p.product_code.toLowerCase().includes(q)) return true;
            // Match by IMEI
            if (p.imeis && p.imeis.some(imei => imei.toLowerCase().includes(q))) return true;
            return false;
        });

        posEmptyState.classList.add('hidden');
        posSearchResults.classList.remove('hidden');
        posSearchResults.innerHTML = '';

        if (results.length === 0) {
            posSearchResults.innerHTML = `
                <div class="col-span-full flex flex-col items-center justify-center py-12 text-slate-500">
                    <i class="fa-solid fa-box-open text-4xl mb-3 text-slate-600"></i>
                    <p class="font-medium text-slate-400">ไม่พบสินค้าที่ค้นหา</p>
                    <p class="text-sm text-slate-600 mt-1">ลองค้นหาด้วยคำอื่น</p>
                </div>
            `;
            return;
        }

        results.forEach(product => {
            const categoryName = product.type_id ? product.type_id.name : 'ทั่วไป';
            const isDevice = categoryName.includes('iPhone') || categoryName.includes('iPad');
            const colorName = product.color_id ? product.color_id.name : '';
            const capacityName = product.capacity_id ? product.capacity_id.name : '';
            const stockQty = product.quantity || 0;
            const isOutOfStock = stockQty <= 0;

            const card = document.createElement('div');
            card.className = `bg-slate-900 border rounded-xl p-4 transition-all ${isOutOfStock ? 'border-red-500/30 opacity-60' : 'border-slate-700 hover:border-cyan-500/50 hover:shadow-[0_0_15px_rgba(6,182,212,0.1)]'}`;
            card.innerHTML = `
                <div class="flex items-start gap-3 mb-3">
                    <div class="w-12 h-12 rounded-lg ${isDevice ? 'bg-cyan-500/10 text-cyan-400' : 'bg-orange-500/10 text-orange-400'} flex items-center justify-center flex-shrink-0">
                        <i class="fa-solid ${isDevice ? 'fa-mobile-screen' : 'fa-box'} text-xl"></i>
                    </div>
                    <div class="min-w-0 flex-1">
                        <h4 class="font-semibold text-white text-sm leading-tight">${product.name} ${capacityName} ${colorName}</h4>
                        <p class="text-lg font-black font-mono text-white mt-0.5 tracking-wider">${product.product_code || '-'}</p>
                        <p class="text-xs mt-1.5">
                            <span class="px-1.5 py-0.5 rounded ${isOutOfStock ? 'bg-red-500/10 text-red-400' : 'bg-emerald-500/10 text-emerald-400'} text-[10px] font-medium">${isOutOfStock ? 'สินค้าหมด' : `คงเหลือ: ${stockQty}`}</span>
                        </p>
                    </div>
                </div>
                <div class="flex items-center justify-between mt-2 pt-3 border-t border-slate-700/50">
                    <span class="font-bold text-cyan-400 font-mono text-lg">฿${product.selling_price.toLocaleString()}</span>
                    <button class="pos-add-btn px-3 py-1.5 rounded-lg text-sm font-bold transition-all flex items-center gap-1.5 ${isOutOfStock ? 'bg-slate-700 text-slate-500 cursor-not-allowed' : 'bg-cyan-500 hover:bg-cyan-400 text-slate-900 shadow-lg shadow-cyan-500/20'}"
                        data-product-id="${product._id}" ${isOutOfStock ? 'disabled' : ''}>
                        <i class="fa-solid fa-plus text-xs"></i> เพิ่ม
                    </button>
                </div>
            `;
            posSearchResults.appendChild(card);
        });

        // Attach Add to Cart listeners
        document.querySelectorAll('.pos-add-btn:not([disabled])').forEach(btn => {
            btn.addEventListener('click', (e) => {
                const productId = e.currentTarget.getAttribute('data-product-id');
                const product = posProductsCache.find(p => p._id === productId);
                if (product) {
                    handleAddToCart(product);
                }
            });
        });
    };

    // Add to Cart Handler
    const handleAddToCart = (product) => {
        const hasImeis = Array.isArray(product.imeis) && product.imeis.length > 0;
        const typeName = product.type_id ? (product.type_id.name || '') : '';
        const unitName = product.unit_id ? (product.unit_id.name || '') : '';
        const isDeviceLike = unitName.includes('เครื่อง') || typeName.toLowerCase().includes('iphone') || typeName.toLowerCase().includes('ipad');
        const shouldUseImeiFlow = hasImeis || (isDeviceLike && product.product_code);

        if (shouldUseImeiFlow) {
            // Filter out IMEIs already in cart
            const cartImeis = cart.filter(i => i.product_id === product._id).map(i => i.imei_sold);
            let availableImeis = (product.imeis || []).filter(imei => !cartImeis.includes(imei));

            // Fallback: if product has no IMEIs in stock, use product_code as identifier
            if (availableImeis.length === 0 && product.product_code) {
                const codeAsImei = product.product_code.toString().trim();
                if (codeAsImei && !cartImeis.includes(codeAsImei)) {
                    availableImeis = [codeAsImei];
                }
            }

            // If only 1 available IMEI, add to cart directly without showing modal
            if (availableImeis.length === 1) {
                const imei = availableImeis[0].toString().trim();
                cart.push({
                    product_id: product._id,
                    product_name: product.name,
                    imei_sold: imei,
                    quantity: 1,
                    price: product.selling_price,
                    subtotal: product.selling_price,
                    _isDevice: true
                });
                showToast(`เพิ่ม ${product.name} (IMEI: ...${imei.slice(-4)}) ลงตะกร้าแล้ว`);
                renderCart();
            } else if (availableImeis.length > 1) {
                // Show IMEI selection modal only if multiple IMEIs available
                openImeiModal(product);
            } else {
                showToast(`ไม่มี IMEI ที่ยังไม่ได้เพิ่มในตะกร้า`, 'error');
            }
        } else {
            // Accessory: check if already in cart
            const existingItem = cart.find(item => item.product_id === product._id && !item.imei_sold);
            if (existingItem) {
                // Check stock
                if (existingItem.quantity >= product.quantity) {
                    showToast(`สินค้า ${product.name} มีไม่เพียงพอในสต็อก`, 'error');
                    return;
                }
                existingItem.quantity += 1;
                existingItem.subtotal = existingItem.quantity * existingItem.price;
            } else {
                cart.push({
                    product_id: product._id,
                    product_name: product.name,
                    imei_sold: '',
                    quantity: 1,
                    price: product.selling_price,
                    subtotal: product.selling_price,
                    _isDevice: false
                });
            }
            showToast(`เพิ่ม ${product.name} ลงตะกร้าแล้ว`);
            renderCart();
        }
    };

    // IMEI Modal
    const openImeiModal = (product) => {
        if (!imeiSelectModal) return;

        // Filter out IMEIs already in cart
        const cartImeis = cart.filter(i => i.product_id === product._id).map(i => i.imei_sold);
        let availableImeis = (product.imeis || []).filter(imei => !cartImeis.includes(imei));

        // Fallback: if product has no IMEIs in stock, use product_code as identifier
        if (availableImeis.length === 0 && product.product_code) {
            const codeAsImei = product.product_code.toString().trim();
            if (codeAsImei && !cartImeis.includes(codeAsImei)) {
                availableImeis = [codeAsImei];
            }
        }

        if (availableImeis.length === 0) {
            showToast(`ไม่มี IMEI ที่ยังไม่ได้เพิ่มในตะกร้า`, 'error');
            return;
        }

        const renderImeiList = (filterQuery = '') => {
            imeiListContainer.innerHTML = '';
            const filtered = filterQuery
                ? availableImeis.filter(imei => imei.toLowerCase().includes(filterQuery.toLowerCase()))
                : availableImeis;

            if (filtered.length === 0) {
                imeiListContainer.innerHTML = `
                    <div class="text-center py-8 text-slate-500">
                        <i class="fa-solid fa-search text-2xl mb-2"></i>
                        <p class="text-sm">ไม่พบ IMEI ที่ค้นหา</p>
                    </div>
                `;
                return;
            }

            filtered.forEach(imei => {
                const item = document.createElement('button');
                item.className = 'w-full text-left px-4 py-3 rounded-xl bg-slate-900 border border-slate-700 hover:border-cyan-500/50 hover:bg-slate-800 transition-all flex items-center gap-3 group';
                item.innerHTML = `
                    <div class="w-8 h-8 rounded-lg bg-cyan-500/10 flex items-center justify-center text-cyan-400 flex-shrink-0 group-hover:bg-cyan-500/20 transition-colors">
                        <i class="fa-solid fa-sim-card text-sm"></i>
                    </div>
                    <div class="flex-1 min-w-0">
                        <p class="font-mono text-white text-sm font-medium">${imei}</p>
                        <p class="text-xs text-slate-500">${product.name}</p>
                    </div>
                    <i class="fa-solid fa-plus text-cyan-500 opacity-0 group-hover:opacity-100 transition-opacity"></i>
                `;
                item.addEventListener('click', () => {
                    // Add specific IMEI to cart
                    cart.push({
                        product_id: product._id,
                        product_name: product.name,
                        imei_sold: imei,
                        quantity: 1,
                        price: product.selling_price,
                        subtotal: product.selling_price,
                        _isDevice: true
                    });
                    showToast(`เพิ่ม ${product.name} (IMEI: ...${imei.slice(-4)}) ลงตะกร้าแล้ว`);
                    closeImeiModal();
                    renderCart();
                });
                imeiListContainer.appendChild(item);
            });
        };

        renderImeiList();

        // IMEI search filter
        if (imeiSearchInput) {
            imeiSearchInput.value = '';
            imeiSearchInput.oninput = (e) => renderImeiList(e.target.value);
        }

        imeiSelectModal.classList.remove('opacity-0', 'pointer-events-none');
    };

    const closeImeiModal = () => {
        if (imeiSelectModal) {
            imeiSelectModal.classList.add('opacity-0', 'pointer-events-none');
        }
    };

    if (closeImeiModalBtn) closeImeiModalBtn.addEventListener('click', closeImeiModal);

    // Render Cart
    const renderCart = () => {
        if (!cartItemsContainer) return;

        // Remove old cart items (keep empty state)
        const existingItems = cartItemsContainer.querySelectorAll('.cart-item');
        existingItems.forEach(el => el.remove());

        if (cart.length === 0) {
            if (cartEmptyState) cartEmptyState.classList.remove('hidden');
            if (cartCountBadge) cartCountBadge.textContent = '0 รายการ';
            if (cartSubtotal) cartSubtotal.textContent = '฿0.00';
            if (cartDiscount) cartDiscount.textContent = '฿0.00';
            if (cartTotal) cartTotal.textContent = '฿0.00';
            return;
        }

        if (cartEmptyState) cartEmptyState.classList.add('hidden');
        if (cartCountBadge) cartCountBadge.textContent = `${cart.length} รายการ`;

        cart.forEach((item, index) => {
            const cartEl = document.createElement('div');
            cartEl.className = 'cart-item bg-slate-900 border border-slate-700 rounded-xl p-3 flex items-center gap-3 hover:border-slate-600 transition-colors animate-fade-in';
            cartEl.innerHTML = `
                <div class="w-10 h-10 rounded-lg ${item._isDevice ? 'bg-cyan-500/10 text-cyan-400' : 'bg-orange-500/10 text-orange-400'} flex items-center justify-center flex-shrink-0">
                    <i class="fa-solid ${item._isDevice ? 'fa-mobile-screen' : 'fa-box'} text-lg"></i>
                </div>
                <div class="flex-1 min-w-0">
                    <p class="font-medium text-white text-sm truncate">${item.product_name}</p>
                    <p class="text-xs text-slate-500 mt-0.5 truncate">
                        ${item.imei_sold ? `IMEI: ...${item.imei_sold.slice(-6)}` : `จำนวน: ${item.quantity}`}
                    </p>
                </div>
                <div class="text-right flex-shrink-0">
                    <div class="flex flex-col items-end justify-center">
                        <span class="text-[10px] text-slate-500 uppercase font-bold tracking-wider">ราคา/หน่วย</span>
                        <p class="text-slate-300 font-semibold font-mono text-sm">฿${item.price.toLocaleString()}</p>
                    </div>
                    <p class="cart-line-subtotal font-bold text-cyan-400 font-mono text-sm mt-0.5">฿${item.subtotal.toLocaleString()}</p>
                    ${!item._isDevice ? `
                        <div class="flex items-center gap-1 mt-1 justify-end">
                            <button class="cart-qty-minus w-6 h-6 rounded bg-slate-700 text-slate-300 hover:bg-slate-600 text-xs flex items-center justify-center transition-colors" data-index="${index}">
                                <i class="fa-solid fa-minus text-[10px]"></i>
                            </button>
                            <span class="text-xs text-slate-400 font-mono w-6 text-center">${item.quantity}</span>
                            <button class="cart-qty-plus w-6 h-6 rounded bg-slate-700 text-slate-300 hover:bg-slate-600 text-xs flex items-center justify-center transition-colors" data-index="${index}">
                                <i class="fa-solid fa-plus text-[10px]"></i>
                            </button>
                        </div>
                    ` : ''}
                </div>
                <button class="cart-remove-btn text-slate-600 hover:text-red-400 transition-colors p-1.5 rounded-lg hover:bg-red-500/10 flex-shrink-0" data-index="${index}">
                    <i class="fa-solid fa-trash-can text-sm"></i>
                </button>
            `;
            cartItemsContainer.appendChild(cartEl);
        });

        // Attach cart item listeners
        document.querySelectorAll('.cart-remove-btn').forEach(btn => {
            btn.addEventListener('click', (e) => {
                const idx = parseInt(e.currentTarget.getAttribute('data-index'));
                cart.splice(idx, 1);
                renderCart();
            });
        });

        document.querySelectorAll('.cart-qty-minus').forEach(btn => {
            btn.addEventListener('click', (e) => {
                const idx = parseInt(e.currentTarget.getAttribute('data-index'));
                if (cart[idx].quantity > 1) {
                    cart[idx].quantity -= 1;
                    cart[idx].subtotal = cart[idx].quantity * cart[idx].price;
                    renderCart();
                }
            });
        });

        document.querySelectorAll('.cart-qty-plus').forEach(btn => {
            btn.addEventListener('click', (e) => {
                const idx = parseInt(e.currentTarget.getAttribute('data-index'));
                // Check stock limit
                const product = posProductsCache.find(p => p._id === cart[idx].product_id);
                if (product && cart[idx].quantity >= product.quantity) {
                    showToast(`สินค้า ${cart[idx].product_name} มีไม่เพียงพอในสต็อก`, 'error');
                    return;
                }
                cart[idx].quantity += 1;
                cart[idx].subtotal = cart[idx].quantity * cart[idx].price;
                renderCart();
            });
        });

        // Update totals
        updateCartTotals();
    };

    const updateCartTotals = () => {
        const subtotal = cart.reduce((sum, item) => sum + item.subtotal, 0);
        if (cartSubtotal) cartSubtotal.textContent = `฿${subtotal.toLocaleString()}`;
    };

    const updateModalTotals = () => {
        const subtotal = cart.reduce((sum, item) => sum + item.subtotal, 0);
        const discount = posDiscount ? (parseFloat(posDiscount.value) || 0) : 0;
        const grandTotal = Math.max(0, subtotal - discount);

        if (modalSubtotalDisplay) modalSubtotalDisplay.textContent = `฿${subtotal.toLocaleString(undefined, { minimumFractionDigits: 2 })}`;
        if (modalDiscountDisplay) modalDiscountDisplay.textContent = `-฿${discount.toLocaleString(undefined, { minimumFractionDigits: 2 })}`;
        if (modalTotalDisplay) modalTotalDisplay.textContent = `฿${grandTotal.toLocaleString(undefined, { minimumFractionDigits: 2 })}`;

        // ===================================================================
        // ตรวจรับเงินและคำนวณเงินทอน Real-time Payment Verification Pipeline
        // ===================================================================
        const selectedPayment = paymentMethod ? paymentMethod.value : '';

        if (selectedPayment === 'ซื้อสด') {
            // แสดงแผงตรวจรับเงิน
            if (paymentVerifyPanel) paymentVerifyPanel.classList.remove('hidden');

            const cash = modalCashAmount ? (parseFloat(modalCashAmount.value) || 0) : 0;
            const transfer = modalTransferAmount ? (parseFloat(modalTransferAmount.value) || 0) : 0;
            const receivedSum = cash + transfer;

            if (verifyReceivedDisplay) {
                verifyReceivedDisplay.textContent = `฿${receivedSum.toLocaleString(undefined, { minimumFractionDigits: 2 })}`;
            }

            if (receivedSum < grandTotal) {
                // รับเงินขาด!
                const missing = grandTotal - receivedSum;
                if (paymentStatusBadge) {
                    paymentStatusBadge.className = 'px-2.5 py-1 rounded-lg text-xs font-black uppercase tracking-wider flex items-center gap-1.5 bg-red-500/20 text-red-400 border border-red-500/30';
                    paymentStatusBadge.innerHTML = `<span class="w-2 h-2 rounded-full bg-red-500 animate-pulse"></span> ขาดเงินอีก ❌`;
                }
                if (verifyResultLabel) verifyResultLabel.textContent = 'ยอดขาดคงเหลือ';
                if (verifyChangeDisplay) {
                    verifyChangeDisplay.textContent = `฿${missing.toLocaleString(undefined, { minimumFractionDigits: 2 })}`;
                    verifyChangeDisplay.className = 'text-2xl font-black font-mono text-red-400 animate-pulse';
                }

                // บล็อกปุ่มชำระเงิน
                if (btnConfirmCheckout) {
                    btnConfirmCheckout.disabled = true;
                    btnConfirmCheckout.classList.add('opacity-40', 'cursor-not-allowed', 'grayscale');
                    btnConfirmCheckout.classList.remove('hover:shadow-emerald-500/35');
                    btnConfirmCheckout.title = 'กรุณารับยอดเงินชำระให้ครบก่อนทำรายการ';
                }
            } else {
                // ครบ หรือ มีเงินทอน
                const change = receivedSum - grandTotal;
                if (paymentStatusBadge) {
                    if (change === 0) {
                        paymentStatusBadge.className = 'px-2.5 py-1 rounded-lg text-xs font-black uppercase tracking-wider flex items-center gap-1.5 bg-emerald-500/20 text-emerald-400 border border-emerald-500/30';
                        paymentStatusBadge.innerHTML = `<i class="fa-solid fa-circle-check"></i> จ่ายยอดครบถ้วน`;
                    } else {
                        paymentStatusBadge.className = 'px-2.5 py-1 rounded-lg text-xs font-black uppercase tracking-wider flex items-center gap-1.5 bg-cyan-500/20 text-cyan-400 border border-cyan-500/30';
                        paymentStatusBadge.innerHTML = `<i class="fa-solid fa-coins"></i> เงินทอนลูกค้า`;
                    }
                }
                if (verifyResultLabel) verifyResultLabel.textContent = change > 0 ? 'ยอดที่ต้องทอนลูกค้า' : 'สถานะเงินทอน';
                if (verifyChangeDisplay) {
                    verifyChangeDisplay.textContent = `฿${change.toLocaleString(undefined, { minimumFractionDigits: 2 })}`;
                    verifyChangeDisplay.className = `text-2xl font-black font-mono ${change > 0 ? 'text-cyan-400' : 'text-emerald-400'}`;
                }

                // ปลดล็อกปุ่ม
                if (btnConfirmCheckout) {
                    btnConfirmCheckout.disabled = false;
                    btnConfirmCheckout.classList.remove('opacity-40', 'cursor-not-allowed', 'grayscale');
                    btnConfirmCheckout.classList.add('hover:shadow-emerald-500/35');
                    btnConfirmCheckout.title = '';
                }
            }
        } else if (selectedPayment === 'จัดไฟแนนซ์') {
            // กรณีจัดไฟแนนซ์ ซ่อนส่วนเงินทอน เนื่องจากยอดเงินคือเงินดาวน์
            if (paymentVerifyPanel) paymentVerifyPanel.classList.add('hidden');

            if (btnConfirmCheckout) {
                btnConfirmCheckout.disabled = false;
                btnConfirmCheckout.classList.remove('opacity-40', 'cursor-not-allowed', 'grayscale');
                btnConfirmCheckout.classList.add('hover:shadow-emerald-500/35');
                btnConfirmCheckout.title = '';
            }
        } else {
            // ยังไม่ได้เลือกวิธีชำระเงิน
            if (paymentVerifyPanel) paymentVerifyPanel.classList.add('hidden');
            if (btnConfirmCheckout) {
                btnConfirmCheckout.disabled = true;
                btnConfirmCheckout.classList.add('opacity-40', 'cursor-not-allowed', 'grayscale');
                btnConfirmCheckout.title = 'กรุณาเลือกวิธีชำระเงิน';
            }
        }
    };

    if (posDiscount) {
        posDiscount.addEventListener('input', () => {
            updateModalTotals();
        });
    }

    if (modalCashAmount) {
        modalCashAmount.addEventListener('input', () => {
            updateModalTotals();
        });
    }

    if (modalTransferAmount) {
        modalTransferAmount.addEventListener('input', () => {
            updateModalTotals();
        });
    }

    // Helper: Find product by exact IMEI match (only available IMEIs)
    const findProductByImei = (imei) => {
        const trimmedImei = imei.toString().trim();
        for (const product of posProductsCache) {
            // Check if product has imeis array
            if (Array.isArray(product.imeis) && product.imeis.length > 0) {
                // Filter out IMEIs already in cart
                const cartImeis = cart.filter(i => i.product_id === product._id).map(i => i.imei_sold);
                const availableImeis = product.imeis.filter(i => !cartImeis.includes(i.toString().trim()));

                if (availableImeis.some(i => i.toString().trim() === trimmedImei)) {
                    return { product, matchedImei: trimmedImei };
                }
            } else {
                // Fallback: check if it's a device-like product and matches product_code
                const typeName = product.type_id ? (product.type_id.name || '') : '';
                const unitName = product.unit_id ? (product.unit_id.name || '') : '';
                const isDeviceLike = unitName.includes('เครื่อง') || typeName.toLowerCase().includes('iphone') || typeName.toLowerCase().includes('ipad');

                if (isDeviceLike && product.product_code && product.product_code.toString().trim() === trimmedImei) {
                    // Check if this product_code is already in cart
                    const cartImeis = cart.filter(i => i.product_id === product._id).map(i => i.imei_sold);
                    if (!cartImeis.includes(trimmedImei)) {
                        return { product, matchedImei: trimmedImei };
                    }
                }
            }
        }
        return null;
    };

    // Helper: Check if IMEI exists in any product but is already sold (in cart)
    const isSoldOutImei = (imei) => {
        const trimmedImei = imei.toString().trim();
        for (const product of posProductsCache) {
            // Check if IMEI exists in product's imeis array
            if (Array.isArray(product.imeis) && product.imeis.length > 0) {
                if (product.imeis.some(i => i.toString().trim() === trimmedImei)) {
                    // Check if it's already in cart (sold)
                    const cartImeis = cart.filter(i => i.product_id === product._id).map(i => i.imei_sold);
                    if (cartImeis.includes(trimmedImei)) {
                        return true;
                    }
                }
            } else {
                // Fallback: check if it's a device-like product and matches product_code
                const typeName = product.type_id ? (product.type_id.name || '') : '';
                const unitName = product.unit_id ? (product.unit_id.name || '') : '';
                const isDeviceLike = unitName.includes('เครื่อง') || typeName.toLowerCase().includes('iphone') || typeName.toLowerCase().includes('ipad');

                if (isDeviceLike && product.product_code && product.product_code.toString().trim() === trimmedImei) {
                    // Check if this product_code is already in cart
                    const cartImeis = cart.filter(i => i.product_id === product._id).map(i => i.imei_sold);
                    if (cartImeis.includes(trimmedImei)) {
                        return true;
                    }
                }
            }
        }
        return false;
    };

    // Helper: Find product by exact product_code match (for accessories)
    const findProductByCode = (code) => {
        const trimmedCode = code.toString().trim();
        const product = posProductsCache.find(p => p.product_code && p.product_code.toString().trim() === trimmedCode);
        return product;
    };

    // Helper: Add product to cart by IMEI (for barcode scanning)
    const addProductByImei = (product, imei) => {
        // Check if this IMEI is already in cart
        const existingCartItem = cart.find(item => item.product_id === product._id && item.imei_sold === imei);
        if (existingCartItem) {
            showToast('IMEI นี้ถูกเพิ่มในตะกร้าแล้ว', 'error');
            return false;
        }

        // Check if IMEI is still available (not already in cart for this product)
        const cartImeis = cart.filter(i => i.product_id === product._id).map(i => i.imei_sold);
        if (cartImeis.includes(imei)) {
            showToast('IMEI นี้ถูกเพิ่มในตะกร้าแล้ว', 'error');
            return false;
        }

        // Add to cart with specific IMEI and mark as device
        cart.push({
            product_id: product._id,
            product_name: product.name,
            imei_sold: imei.toString().trim(),
            quantity: 1,
            price: product.selling_price,
            subtotal: product.selling_price,
            _isDevice: true
        });
        return true;
    };

    // Helper: Add accessory to cart by product_code
    const addAccessoryByCode = (product) => {
        // Check if already in cart (accessories without IMEI)
        const existingItem = cart.find(item => item.product_id === product._id && !item.imei_sold);
        if (existingItem) {
            if (existingItem.quantity >= product.quantity) {
                showToast(`สินค้า ${product.name} มีไม่เพียงพอในสต็อก`, 'error');
                return false;
            }
            existingItem.quantity += 1;
            existingItem.subtotal = existingItem.quantity * existingItem.price;
        } else {
            cart.push({
                product_id: product._id,
                product_name: product.name,
                imei_sold: '',
                quantity: 1,
                price: product.selling_price,
                subtotal: product.selling_price,
                _isDevice: false
            });
        }
        return true;
    };

    // Search Input Events
    if (posSearchInput) {
        let searchTimeout;
        posSearchInput.addEventListener('input', (e) => {
            clearTimeout(searchTimeout);
            searchTimeout = setTimeout(() => {
                searchPosProducts(e.target.value);
            }, 300);
        });

        posSearchInput.addEventListener('keydown', (e) => {
            if (e.key === 'Enter') {
                e.preventDefault(); // ป้องกันการกด Enter แล้วทำการบันทึกตามคำขอของลูกค้า ให้ค้นหาอย่างเดียว
            }
        });
    }

    // Update dynamic Down Payment labels reactive logic
    const updateFinanceDownPaymentLabel = () => {
        if (!modalFinanceTotalDownLabel) return;
        const cash = parseFloat(modalFinanceDownCash ? modalFinanceDownCash.value : 0) || 0;
        const transfer = parseFloat(modalFinanceDownTransfer ? modalFinanceDownTransfer.value : 0) || 0;
        const total = cash + transfer;
        modalFinanceTotalDownLabel.textContent = `ดาวน์รวม: ฿${total.toLocaleString(undefined, { minimumFractionDigits: 2 })}`;
    };

    if (modalFinanceDownCash) {
        modalFinanceDownCash.addEventListener('input', updateFinanceDownPaymentLabel);
    }
    if (modalFinanceDownTransfer) {
        modalFinanceDownTransfer.addEventListener('input', updateFinanceDownPaymentLabel);
    }

    // POS Payment method change listener - toggling expanded detail blocks
    if (paymentMethod) {
        paymentMethod.addEventListener('change', (e) => {
            const selectedVal = e.target.value;

            // Hide both initially
            if (blockBuyCashDetails) blockBuyCashDetails.classList.add('hidden');
            if (blockFinanceDetails) blockFinanceDetails.classList.add('hidden');

            if (selectedVal === 'ซื้อสด' && blockBuyCashDetails) {
                blockBuyCashDetails.classList.remove('hidden');
            } else if (selectedVal === 'จัดไฟแนนซ์' && blockFinanceDetails) {
                blockFinanceDetails.classList.remove('hidden');
                updateFinanceDownPaymentLabel();
            }

            // รีเซ็ตและอัปเดตยอดรวม & ล็อกปุ่มตามสถาะการเงิน
            updateModalTotals();
        });
    }

    const openCheckoutModal = () => {
        if (!confirmPriceModal) return;
        if (cart.length === 0) {
            showToast('กรุณาเพิ่มสินค้าลงในตะกร้าก่อนทำรายการ', 'error');
            return;
        }

        // Reset ALL inputs in modal
        if (posDiscount) posDiscount.value = '0';
        if (paymentMethod) paymentMethod.selectedIndex = 0;

        // Buy Cash detail resets
        if (modalCashAmount) modalCashAmount.value = '0';
        if (modalTransferAmount) modalTransferAmount.value = '0';

        // Finance detail resets
        if (modalFinanceCompany) modalFinanceCompany.value = '';
        if (modalFinancePaymentDay) modalFinancePaymentDay.value = '1';
        if (modalFinanceMonths) modalFinanceMonths.value = '12';
        if (modalFinanceDownCash) modalFinanceDownCash.value = '0';
        if (modalFinanceDownTransfer) modalFinanceDownTransfer.value = '0';
        updateFinanceDownPaymentLabel();

        // Reset block visibilities
        if (blockBuyCashDetails) blockBuyCashDetails.classList.add('hidden');
        if (blockFinanceDetails) blockFinanceDetails.classList.add('hidden');

        // Member Selection reset
        if (selectedMemberId) selectedMemberId.value = '';
        if (posMemberSearch) posMemberSearch.value = '';
        if (selectedMemberDisplay) selectedMemberDisplay.classList.add('hidden');
        if (posMemberSearch && posMemberSearch.parentElement) posMemberSearch.parentElement.classList.remove('hidden');

        // Render cart summary items with editable unit prices
        if (confirmPriceList) {
            confirmPriceList.innerHTML = '';
            cart.forEach((item, index) => {
                const div = document.createElement('div');
                div.className = 'flex justify-between items-center py-3 text-sm hover:bg-slate-800/20 px-2 rounded-lg transition-colors';
                div.innerHTML = `
                    <div>
                        <p class="font-bold text-white">${item.product_name}</p>
                        <div class="mt-1 flex flex-col gap-1.5">
                            ${item.imei_sold ?
                        `<span class="w-fit bg-slate-800 text-slate-300 border border-slate-700 px-1.5 py-0.5 rounded text-[10px] font-mono">IMEI: ${item.imei_sold}</span>`
                        : `<span class="w-fit bg-slate-800/60 px-1.5 py-0.5 rounded text-slate-400 text-[10px]">จำนวน: ${item.quantity} ชิ้น</span>`
                    }
                            ${(item._isDevice || item.imei_sold) ? `
                                <div class="flex items-center gap-2 mt-1">
                                    <span class="text-[10px] text-slate-400">ระยะประกัน:</span>
                                    <select class="modal-warranty-select bg-slate-800 border border-slate-700 text-cyan-400 text-[10px] font-bold rounded px-2 py-0.5 focus:outline-none focus:border-cyan-500" data-index="${index}">
                                        <option value="1 เดือน" ${(!item.warranty_period || item.warranty_period === '1 เดือน') ? 'selected' : ''}>1 เดือน</option>
                                        <option value="2 เดือน" ${(item.warranty_period === '2 เดือน') ? 'selected' : ''}>2 เดือน</option>
                                        <option value="3 เดือน" ${(item.warranty_period === '3 เดือน') ? 'selected' : ''}>3 เดือน</option>
                                        <option value="1 ปี" ${(item.warranty_period === '1 ปี') ? 'selected' : ''}>1 ปี</option>
                                    </select>
                                </div>
                            ` : ''}
                        </div>
                    </div>
                    <div class="flex items-center gap-3 text-right">
                        <div class="flex flex-col items-end">
                            <span class="text-[10px] text-slate-500 uppercase font-bold mb-1 tracking-wider">แก้ไขราคา</span>
                            <div class="relative">
                                <span class="absolute left-2 top-1/2 -translate-y-1/2 text-slate-500 text-xs font-mono">฿</span>
                                <input type="number" value="${item.price}" min="0" step="1" data-index="${index}"
                                    class="modal-item-price-input w-28 pl-5 pr-2 py-1 rounded bg-slate-900 border border-slate-700 text-white text-right font-mono text-sm focus:border-cyan-500 focus:ring-1 focus:ring-cyan-500 focus:outline-none transition-all">
                            </div>
                        </div>
                        <div class="w-24 flex flex-col items-end pt-3.5 font-mono">
                            <span class="text-slate-500 text-[10px] uppercase font-bold mb-0.5">รวม</span>
                            <p class="text-emerald-400 font-bold text-sm modal-item-subtotal" data-index="${index}">฿${(item.price * item.quantity).toLocaleString()}</p>
                        </div>
                    </div>
                `;
                confirmPriceList.appendChild(div);
            });

            // Attach dynamic listener for price edits inside the checkout modal
            const modalPriceInputs = confirmPriceList.querySelectorAll('.modal-item-price-input');
            modalPriceInputs.forEach(input => {
                input.addEventListener('input', (e) => {
                    const idx = parseInt(e.target.dataset.index);
                    const newPrice = parseFloat(e.target.value) || 0;

                    // Update state
                    cart[idx].price = newPrice;
                    cart[idx].subtotal = newPrice * cart[idx].quantity;

                    // Update item line subtotal text reactively
                    const subtotalLabel = confirmPriceList.querySelector(`.modal-item-subtotal[data-index="${idx}"]`);
                    if (subtotalLabel) {
                        subtotalLabel.textContent = `฿${cart[idx].subtotal.toLocaleString()}`;
                    }

                    // Recalculate global modal summary totals
                    updateModalTotals();

                    // Synchronize state seamlessly with sidebar background cart view
                    renderCart();
                });
            });

            // Attach dynamic listener for warranty changes
            const modalWarrantySelects = confirmPriceList.querySelectorAll('.modal-warranty-select');
            modalWarrantySelects.forEach(select => {
                select.addEventListener('change', (e) => {
                    const idx = parseInt(e.target.dataset.index);
                    cart[idx].warranty_period = e.target.value;
                    renderCart(); // Synchronize with background cart
                });
            });
        }

        updateModalTotals();

        // Show Modal
        confirmPriceModal.classList.remove('opacity-0', 'pointer-events-none');
        const modalContent = confirmPriceModal.querySelector('.modal-content');
        if (modalContent) modalContent.classList.remove('scale-95');
    };

    const closeCheckoutModal = () => {
        if (!confirmPriceModal) return;
        confirmPriceModal.classList.add('opacity-0', 'pointer-events-none');
        const modalContent = confirmPriceModal.querySelector('.modal-content');
        if (modalContent) modalContent.classList.add('scale-95');
    };

    const checkoutNow = async () => {
        if (cart.length === 0) {
            showToast('กรุณาเพิ่มสินค้าลงในตะกร้าก่อนทำรายการ', 'error');
            return;
        }

        const memberIdVal = selectedMemberId ? selectedMemberId.value : '';
        if (!memberIdVal) {
            showToast('กรุณาเลือกข้อมูลลูกค้า/สมาชิกทุกครั้งก่อนชำระเงิน', 'error');
            if (posMemberSearch) posMemberSearch.focus();
            return;
        }

        const selectedPayment = paymentMethod ? paymentMethod.value : '';
        if (!selectedPayment) {
            showToast('กรุณาเลือกวิธีชำระเงิน', 'error');
            return;
        }

        // Granular Fields Read & Validation
        let finalDownPayment = 0;
        let cashVal = 0;
        let transferVal = 0;
        let compName = '';
        let dueDay = 0;
        let instMonths = 0;
        let downCash = 0;
        let downTrans = 0;

        if (selectedPayment === 'ซื้อสด') {
            cashVal = parseFloat(modalCashAmount ? modalCashAmount.value : 0) || 0;
            transferVal = parseFloat(modalTransferAmount ? modalTransferAmount.value : 0) || 0;

            const discountChk = posDiscount ? (parseFloat(posDiscount.value) || 0) : 0;
            const subtotalChk = cart.reduce((sum, item) => sum + item.subtotal, 0);
            const totalChk = Math.max(0, subtotalChk - discountChk);

            if (cashVal + transferVal < totalChk) {
                showToast('ยอดเงินที่รับมาไม่ครบถ้วนตามราคาสุทธิ กรุณาตรวจสอบการรับเงิน', 'error');
                if (modalCashAmount) modalCashAmount.focus();
                return;
            }
        } else if (selectedPayment === 'จัดไฟแนนซ์') {
            compName = modalFinanceCompany ? modalFinanceCompany.value.trim() : '';
            dueDay = parseInt(modalFinancePaymentDay ? modalFinancePaymentDay.value : 0) || 0;
            instMonths = parseInt(modalFinanceMonths ? modalFinanceMonths.value : 0) || 0;
            downCash = parseFloat(modalFinanceDownCash ? modalFinanceDownCash.value : 0) || 0;
            downTrans = parseFloat(modalFinanceDownTransfer ? modalFinanceDownTransfer.value : 0) || 0;
            finalDownPayment = downCash + downTrans;

            if (!compName) {
                showToast('กรุณากรอกชื่อบริษัทไฟแนนซ์', 'error');
                if (modalFinanceCompany) modalFinanceCompany.focus();
                return;
            }
            if (dueDay < 1 || dueDay > 31) {
                showToast('วันที่ชำระเงินต้องอยู่ระหว่าง 1 ถึง 31', 'error');
                if (modalFinancePaymentDay) modalFinancePaymentDay.focus();
                return;
            }
            if (instMonths <= 0) {
                showToast('กรุณาระบุระยะผ่อนชำระที่มากกว่า 0 เดือน', 'error');
                if (modalFinanceMonths) modalFinanceMonths.focus();
                return;
            }
        }

        const discount = posDiscount ? (parseFloat(posDiscount.value) || 0) : 0;
        const subtotal = cart.reduce((sum, item) => sum + item.subtotal, 0);
        const total = Math.max(0, subtotal - discount);

        const originalText = btnConfirmCheckout ? btnConfirmCheckout.innerHTML : '';
        if (btnConfirmCheckout) {
            btnConfirmCheckout.disabled = true;
            btnConfirmCheckout.innerHTML = `<i class="fa-solid fa-circle-notch fa-spin text-xl"></i> กำลังดำเนินการ...`;
        }

        try {
            let branch_id = null;
            const savedUserData = localStorage.getItem('silmin_user');
            if (savedUserData) {
                const user = JSON.parse(savedUserData);
                branch_id = user.branch ? user.branch._id : null;
            }

            const payload = {
                member_id: selectedMemberId ? (selectedMemberId.value || null) : null,
                items: cart.map(item => ({
                    product_id: item.product_id,
                    product_name: item.product_name,
                    imei_sold: item.imei_sold || '',
                    quantity: item.quantity,
                    price: item.price,
                    warranty_period: item.warranty_period || '1 เดือน'
                })),
                total_amount: total,
                payment_method: selectedPayment, // Keep legacy
                down_payment: finalDownPayment, // Keep legacy total

                // Granular fields
                payment_type: selectedPayment,
                cash_amount: cashVal,
                transfer_amount: transferVal,
                finance_company: compName,
                finance_payment_day: dueDay,
                finance_months: instMonths,
                finance_down_payment_cash: downCash,
                finance_down_payment_transfer: downTrans,
                branch_id
            };

            const response = await authFetch(`${API_BASE_URL}/transactions`, {
                method: 'POST',
                headers: { 'Content-Type': 'application/json' },
                body: JSON.stringify(payload)
            });

            const result = await response.json();
            if (result.success) {
                showToast('ทำรายการขายสำเร็จ');
                openCheckoutSuccessModal(result.data);
                closeCheckoutModal();

                cart = [];
                renderCart();

                // Reset state and layouts
                if (paymentMethod) paymentMethod.selectedIndex = 0;
                if (posDiscount) posDiscount.value = '0';
                if (modalCashAmount) modalCashAmount.value = '0';
                if (modalTransferAmount) modalTransferAmount.value = '0';
                if (modalFinanceCompany) modalFinanceCompany.value = '';
                if (modalFinancePaymentDay) modalFinancePaymentDay.value = '1';
                if (modalFinanceMonths) modalFinanceMonths.value = '12';
                if (modalFinanceDownCash) modalFinanceDownCash.value = '0';
                if (modalFinanceDownTransfer) modalFinanceDownTransfer.value = '0';

                if (blockBuyCashDetails) blockBuyCashDetails.classList.add('hidden');
                if (blockFinanceDetails) blockFinanceDetails.classList.add('hidden');

                updateCartTotals();

                if (posSearchInput) posSearchInput.value = '';
                if (posEmptyState) posEmptyState.classList.remove('hidden');
                if (posSearchResults) {
                    posSearchResults.classList.add('hidden');
                    posSearchResults.innerHTML = '';
                }

                // Reset Member
                if (selectedMemberId) selectedMemberId.value = '';
                if (posMemberSearch) posMemberSearch.value = '';
                if (selectedMemberDisplay) selectedMemberDisplay.classList.add('hidden');
                if (posMemberSearch && posMemberSearch.parentElement) posMemberSearch.parentElement.classList.remove('hidden');
            } else {
                showToast('เกิดข้อผิดพลาด: ' + result.message, 'error');
            }
        } catch (error) {
            console.error('Checkout error:', error);
            showToast('ไม่สามารถทำรายการได้', 'error');
        } finally {
            if (btnConfirmCheckout) {
                btnConfirmCheckout.disabled = false;
                btnConfirmCheckout.innerHTML = originalText;
            }
        }
    };

    // Checkout Modals Logic wiring
    if (btnCheckout) {
        btnCheckout.addEventListener('click', () => {
            openCheckoutModal();
        });
    }

    // ==========================================
    // Member Selection Logic (POS)
    // ==========================================
    let memberSearchTimeout;
    if (posMemberSearch) {
        posMemberSearch.addEventListener('input', (e) => {
            const query = e.target.value.trim();
            clearTimeout(memberSearchTimeout);

            if (query.length < 2) {
                if (posMemberResults) posMemberResults.classList.add('hidden');
                return;
            }

            memberSearchTimeout = setTimeout(async () => {
                try {
                    const response = await authFetch(`${API_BASE_URL}/members/search?q=${encodeURIComponent(query)}`);
                    const result = await response.json();

                    if (result.success && result.data.length > 0) {
                        renderMemberSearchResults(result.data);
                    } else {
                        if (posMemberResults) posMemberResults.classList.add('hidden');
                    }
                } catch (error) {
                    console.error('Member search error:', error);
                }
            }, 300);
        });

        // Close results when clicking outside
        document.addEventListener('click', (e) => {
            if (posMemberResults && !posMemberSearch.contains(e.target) && !posMemberResults.contains(e.target)) {
                posMemberResults.classList.add('hidden');
            }
        });
    }

    const renderMemberSearchResults = (members) => {
        if (!posMemberResults) return;

        posMemberResults.innerHTML = '';
        members.forEach(member => {
            const div = document.createElement('div');
            div.className = 'p-3 hover:bg-slate-700 cursor-pointer transition-colors flex items-center gap-3';
            div.innerHTML = `
                <div class="w-8 h-8 rounded-full bg-slate-700 flex items-center justify-center text-slate-400">
                    <i class="fa-solid fa-user text-sm"></i>
                </div>
                <div class="flex-1 overflow-hidden">
                    <p class="text-sm font-bold text-white truncate">${member.prefix}${member.first_name} ${member.last_name}</p>
                    <p class="text-xs text-slate-400 truncate">${member.phone || 'ไม่มีเบอร์โทร'} | ${member.member_number || '-'}</p>
                </div>
            `;
            div.addEventListener('click', () => selectMember(member));
            posMemberResults.appendChild(div);
        });
        posMemberResults.classList.remove('hidden');
    };

    const selectMember = (member) => {
        if (selectedMemberId) selectedMemberId.value = member._id;
        if (selectedMemberName) selectedMemberName.textContent = `${member.prefix}${member.first_name} ${member.last_name}`;
        if (selectedMemberPhone) selectedMemberPhone.textContent = member.phone || member.member_number || 'ไม่ทราบเบอร์โทร';

        if (selectedMemberDisplay) selectedMemberDisplay.classList.remove('hidden');
        if (posMemberSearch && posMemberSearch.parentElement) posMemberSearch.parentElement.classList.add('hidden');
        if (posMemberResults) posMemberResults.classList.add('hidden');
    };

    if (btnRemoveMember) {
        btnRemoveMember.addEventListener('click', () => {
            if (selectedMemberId) selectedMemberId.value = '';
            if (selectedMemberDisplay) selectedMemberDisplay.classList.add('hidden');
            if (posMemberSearch && posMemberSearch.parentElement) {
                posMemberSearch.parentElement.classList.remove('hidden');
                posMemberSearch.value = '';
                posMemberSearch.focus();
            }
        });
    }

    if (btnPosAddMember) {
        btnPosAddMember.addEventListener('click', () => {
            switchView('members');
            // Option: auto-click add member button in members view
            setTimeout(() => {
                const btnAddMember = document.getElementById('btn-add-member');
                if (btnAddMember) btnAddMember.click();
            }, 100);
        });
    }

    if (btnConfirmCheckout) {
        btnConfirmCheckout.addEventListener('click', async () => {
            await checkoutNow();
        });
    }

    if (btnCancelPriceModal) {
        btnCancelPriceModal.addEventListener('click', () => {
            closeCheckoutModal();
        });
    }

    if (btnClosePriceModal) {
        btnClosePriceModal.addEventListener('click', () => {
            closeCheckoutModal();
        });
    }

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

            if (searchValue) params.append('search', searchValue);
            if (dateValue) params.append('date', dateValue);
            if (branchValue) params.append('branch_id', branchValue);

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

            row.className = `border-b border-slate-700 hover:bg-slate-700/30 transition-colors ${isCancelled ? 'opacity-70 bg-red-900/10' : ''}`;

            const dateStr = new Date(txn.created_at).toLocaleString('th-TH', {
                day: '2-digit',
                month: '2-digit',
                year: '2-digit',
                hour: '2-digit',
                minute: '2-digit'
            });

            row.innerHTML = `
                <td class="px-6 py-4 text-slate-300 ${isCancelled ? 'line-through text-red-400/70' : ''}">${dateStr}</td>
                <td class="px-6 py-4 text-white font-mono flex items-center gap-2">
                    <span class="${isCancelled ? 'line-through text-red-400' : ''}">${txn.receipt_number}</span>
                    ${isCancelled ? '<span class="px-2 py-0.5 text-[10px] font-bold bg-red-500 text-white rounded-full">ยกเลิกแล้ว</span>' : ''}
                </td>
                <td class="px-6 py-4 text-slate-300 ${isCancelled ? 'line-through text-red-400/70' : ''}">${txn.branch_id ? txn.branch_id.name : '-'}</td>
                <td class="px-6 py-4 text-slate-300 ${isCancelled ? 'line-through text-red-400/70' : ''}">${txn.employee_id ? txn.employee_id.name : '-'}</td>
                <td class="px-6 py-4 text-slate-300 ${isCancelled ? 'line-through text-red-400/70' : ''}">
                    ${txn.member_id ? `<span class="font-bold text-white">${txn.member_id.first_name} ${txn.member_id.last_name}</span><br><span class="text-xs text-slate-500">${txn.member_id.phone || ''}</span>` : '<span class="text-slate-500">-</span>'}
                </td>
                <td class="px-6 py-4 text-right ${isCancelled ? 'text-red-400/70 line-through' : 'text-cyan-400 font-bold'} font-mono">฿${txn.total_amount.toLocaleString()}</td>
                <td class="px-6 py-4 text-slate-300 ${isCancelled ? 'line-through text-red-400/70' : ''}">
                    <span class="px-2 py-1 rounded-md text-[11px] font-bold ${txn.payment_type === 'จัดไฟแนนซ์' ? 'bg-amber-500/10 text-amber-400 border border-amber-500/20' : 'bg-emerald-500/10 text-emerald-400 border border-emerald-500/20'}">
                        ${txn.payment_type || txn.payment_method}
                    </span>
                </td>
                <td class="px-6 py-4 text-center">
                    <button class="view-transaction-btn px-4 py-2 ${isCancelled ? 'bg-red-500/10 text-red-400 hover:bg-red-500/20' : 'bg-amber-500/10 hover:bg-amber-500/20 text-amber-400 hover:text-amber-300'} rounded-lg transition-all font-medium"
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

    const populateTransactionDetails = (txn) => {
        if (!transactionDetailReceipt) return;

        transactionDetailReceipt.textContent = txn.receipt_number;
        transactionDetailBranch.textContent = txn.branch_id ? txn.branch_id.name : '-';
        transactionDetailEmployee.textContent = txn.employee_id ? txn.employee_id.name : '-';
        transactionDetailDate.textContent = new Date(txn.created_at).toLocaleString('th-TH');
        transactionDetailPayment.textContent = txn.payment_type || txn.payment_method;
        transactionDetailTotal.textContent = `฿${txn.total_amount.toLocaleString()}`;

        // Member Details
        if (transactionDetailMember) {
            if (txn.member_id) {
                const m = txn.member_id;
                transactionDetailMember.innerHTML = `
                    <div class="flex flex-col">
                        <span class="text-white text-base">${m.prefix || ''}${m.first_name} ${m.last_name}</span>
                        <span class="text-slate-400 text-xs font-mono">${m.phone || 'ไม่ทราบเบอร์'} | ${m.member_number || 'ไม่มีเลขสมาชิก'}</span>
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

                if (cash > 0) breakdownHTML += `<div class="flex justify-between text-xs text-slate-500 italic"><span>- เงินสด:</span><span>฿${cash.toLocaleString()}</span></div>`;
                if (transfer > 0) breakdownHTML += `<div class="flex justify-between text-xs text-slate-500 italic"><span>- เงินโอน:</span><span>฿${transfer.toLocaleString()}</span></div>`;

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
                    if (transactionDetailFinanceCompany) transactionDetailFinanceCompany.textContent = txn.finance_company || '-';
                    if (transactionDetailFinanceMonths) transactionDetailFinanceMonths.textContent = `${txn.finance_months || 0} เดือน`;
                    if (transactionDetailFinanceDay) transactionDetailFinanceDay.textContent = `วันที่ ${txn.finance_payment_day || 0} ของเดือน`;
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
                itemRow.className = 'border-b border-slate-700';
                itemRow.innerHTML = `
                    <td class="px-4 py-3 text-white">${item.product_name}</td>
                    <td class="px-4 py-3 text-center text-slate-400">${imeiValue ? imeiValue : '-'}</td>
                    <td class="px-4 py-3 text-center text-slate-300">${item.quantity}</td>
                    <td class="px-4 py-3 text-right text-cyan-400 font-mono">฿${item.price.toLocaleString()}</td>
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
        salesHistoryDate.addEventListener('change', loadSalesHistory);
    }

    if (salesHistoryBranch) {
        salesHistoryBranch.addEventListener('change', loadSalesHistory);
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

    // ==========================================
    // Dashboard Statistics (สถิติแดชบอร์ด)
    // ==========================================

    const thaiCurrency = new Intl.NumberFormat('th-TH', {
        minimumFractionDigits: 0,
        maximumFractionDigits: 0
    });

    async function loadDashboardData() {
        try {
            const response = await authFetch(`${API_BASE_URL}/dashboard-stats`);
            const json = await response.json();

            if (!json.success) {
                console.error('ดึงข้อมูลแดชบอร์ดไม่สำเร็จ:', json.message);
                return;
            }

            const d = json.data;

            // Update Stat Cards
            const elSales = document.getElementById('stat-today-sales');
            const elProfit = document.getElementById('stat-today-profit');
            const elStock = document.getElementById('stat-total-stock');
            const elLow = document.getElementById('stat-low-stock');
            const elTxnCount = document.getElementById('stat-today-txn-count');
            const elTotalProducts = document.getElementById('stat-total-products');

            if (elSales) elSales.textContent = `฿${thaiCurrency.format(d.todaySales)}`;
            if (elProfit) elProfit.textContent = `฿${thaiCurrency.format(d.estimatedProfit)}`;
            if (elStock) elStock.textContent = thaiCurrency.format(d.totalStock);
            if (elLow) elLow.textContent = thaiCurrency.format(d.lowStockCount);
            if (elTxnCount) elTxnCount.textContent = d.todayTransactionCount;
            if (elTotalProducts) elTotalProducts.textContent = d.totalProducts;

            // Low stock warning glow
            if (elLow && d.lowStockCount > 0) {
                elLow.classList.add('text-amber-400');
                elLow.classList.remove('text-white');
            } else if (elLow) {
                elLow.classList.remove('text-amber-400');
                elLow.classList.add('text-white');
            }

            // Render Recent Transactions Table
            const tbody = document.getElementById('recent-txn-table-body');
            if (tbody) {
                tbody.innerHTML = '';

                if (d.recentTransactions.length === 0) {
                    tbody.innerHTML = `
                        <tr>
                            <td colspan="6" class="px-6 py-8 text-center text-slate-500 italic">
                                <div class="flex flex-col items-center gap-2">
                                    <i class="fa-solid fa-receipt text-3xl text-slate-600"></i>
                                    <span>ยังไม่มีรายการขาย</span>
                                </div>
                            </td>
                        </tr>
                    `;
                    return;
                }

                d.recentTransactions.forEach(txn => {
                    const row = document.createElement('tr');
                    row.className = 'hover:bg-slate-700/20 transition-colors';

                    // Format date/time
                    const txnDate = new Date(txn.created_at);
                    const timeStr = txnDate.toLocaleString('th-TH', {
                        day: '2-digit',
                        month: 'short',
                        hour: '2-digit',
                        minute: '2-digit'
                    });

                    // Payment method icons
                    let payIcon = '💰';
                    if (txn.payment_method === 'โอนเงิน') payIcon = '📱';
                    else if (txn.payment_method === 'จัดไฟแนนซ์') payIcon = '🏦';
                    else if (txn.payment_method === 'เงินสด') payIcon = '💵';

                    row.innerHTML = `
                        <td class="px-6 py-4">
                            <span class="text-cyan-400 font-mono text-sm bg-cyan-500/10 px-2.5 py-1 rounded-lg border border-cyan-500/20">${txn.receipt_number}</span>
                        </td>
                        <td class="px-6 py-4 text-slate-400">${txn.branch_name}</td>
                        <td class="px-6 py-4 text-center">
                            <span class="bg-slate-700 text-slate-300 text-xs font-bold px-2 py-1 rounded-full">${txn.items_count} ชิ้น</span>
                        </td>
                        <td class="px-6 py-4 text-slate-300">${payIcon} ${txn.payment_method}</td>
                        <td class="px-6 py-4 text-right font-mono font-semibold text-white">฿${thaiCurrency.format(txn.total_amount)}</td>
                        <td class="px-6 py-4 text-right text-slate-400 text-xs">${timeStr}</td>
                    `;
                    tbody.appendChild(row);
                });
            }

        } catch (error) {
            console.error('เกิดข้อผิดพลาดในการดึงข้อมูลแดชบอร์ด:', error);
        }
    }

    // ==========================================
    // Checkout Success & Receipt Printing Logic
    // ==========================================
    const checkoutSuccessModal = document.getElementById('checkout-success-modal');
    const successReceiptNumber = document.getElementById('success-receipt-number');
    const btnPrintReceiptSeparate = document.getElementById('btn-print-receipt-separate');
    const btnCloseSuccessModal = document.getElementById('btn-close-success-modal');

    let lastTransactionId = null;

    const openCheckoutSuccessModal = (txn) => {
        if (!checkoutSuccessModal) return;
        lastTransactionId = txn._id;
        if (successReceiptNumber) successReceiptNumber.textContent = `เลขที่ใบเสร็จ: ${txn.receipt_number}`;

        checkoutSuccessModal.classList.remove('opacity-0', 'pointer-events-none');
        checkoutSuccessModal.firstElementChild.classList.remove('scale-95');
        checkoutSuccessModal.firstElementChild.classList.add('scale-100');
    };

    const closeCheckoutSuccessModal = () => {
        if (!checkoutSuccessModal) return;
        checkoutSuccessModal.classList.add('opacity-0', 'pointer-events-none');
        checkoutSuccessModal.firstElementChild.classList.remove('scale-100');
        checkoutSuccessModal.firstElementChild.classList.add('scale-95');
        lastTransactionId = null;
    };

    const printReceipt = async (txnId) => {
        try {
            // ดึงข้อมูล Transaction เต็มรูปแบบ (populated)
            const response = await authFetch(`${API_BASE_URL}/transactions/${txnId}`);
            const json = await response.json();

            if (!json.success) {
                showToast('ไม่สามารถดึงข้อมูลใบเสร็จได้', 'error');
                return;
            }

            const txnData = json.data;

            // เปิดหน้าต่างใหม่สำหรับใบเสร็จ
            const printWindow = window.open('receipt-template.html', '_blank');

            if (!printWindow) {
                showToast('กรุณาอนุญาตให้เปิด Pop-up เพื่อพิมพ์ใบเสร็จ', 'warning');
                return;
            }

            // ส่งข้อมูลไปยังหน้าต่างที่เปิดใหม่เมื่อมันโหลดเสร็จ
            printWindow.onload = function () {
                printWindow.postMessage({
                    type: 'PRINT_RECEIPT',
                    payload: txnData
                }, '*');
            };

            // Fallback กรณี onload ไม่ทำงาน (บาง browser)
            setTimeout(() => {
                printWindow.postMessage({
                    type: 'PRINT_RECEIPT',
                    payload: txnData
                }, '*');
            }, 1000);

        } catch (error) {
            console.error('เกิดข้อผิดพลาดในการพิมพ์ใบเสร็จ:', error);
            showToast('เกิดข้อผิดพลาดในการเชื่อมต่อ', 'error');
        }
    };

    if (btnPrintReceiptSeparate) {
        btnPrintReceiptSeparate.addEventListener('click', () => {
            if (lastTransactionId) {
                printReceipt(lastTransactionId);
            }
        });
    }

    if (btnCloseSuccessModal) {
        btnCloseSuccessModal.addEventListener('click', closeCheckoutSuccessModal);
    }

    // ==========================================
    // Role Management Logic (จัดการสิทธิ์)
    // ==========================================
    const roleModal = document.getElementById('role-modal');
    const roleForm = document.getElementById('role-form');
    const roleNameInput = document.getElementById('role-name');
    const editRoleId = document.getElementById('edit-role-id');
    const roleModalTitle = document.getElementById('role-modal-title');
    const rolesGrid = document.getElementById('roles-grid');
    const rolesEmpty = document.getElementById('roles-empty');
    const btnAddRole = document.getElementById('btn-add-role');
    const closeRoleModalBtn = document.getElementById('close-role-modal-btn');
    const cancelRoleModalBtn = document.getElementById('cancel-role-modal-btn');

    const permKeys = ['view_dashboard', 'manage_stock', 'delete_stock', 'do_pos', 'manage_personnel', 'manage_branches', 'manage_settings', 'manage_roles', 'filter_stock_branch', 'cancel_sale', 'report_arrival', 'approve_import', 'manage_po', 'receive_po', 'manage_transfers'];
    const permLabels = {
        view_dashboard: 'ดูแดชบอร์ด',
        manage_stock: 'จัดการสต็อก',
        delete_stock: 'ลบสินค้า',
        do_pos: 'ขายสินค้า (POS)',
        manage_personnel: 'จัดการพนักงาน',
        manage_branches: 'จัดการสาขา',
        manage_settings: 'ตั้งค่าระบบ',
        manage_roles: 'จัดการสิทธิ์',
        filter_stock_branch: 'กรองสาขาในเมนู จัดการสต็อก',
        cancel_sale: 'ยกเลิกบิลขาย',
        report_arrival: 'แจ้งของถึงสาขา',
        approve_import: 'อนุมัตินำเข้าสต็อก',
        manage_po: 'จัดการระบบสั่งซื้อ (PO)',
        receive_po: 'ตรวจรับสินค้าเข้าสาขา',
        manage_transfers: 'โอนย้ายสินค้า'
    };
    const permIcons = {
        view_dashboard: 'fa-chart-pie text-blue-400',
        manage_stock: 'fa-box-open text-cyan-400',
        delete_stock: 'fa-trash text-red-400',
        do_pos: 'fa-money-bill-transfer text-green-400',
        manage_personnel: 'fa-users text-purple-400',
        manage_branches: 'fa-store text-orange-400',
        manage_settings: 'fa-gear text-slate-400',
        manage_roles: 'fa-shield-halved text-amber-400',
        filter_stock_branch: 'fa-filter text-teal-400',
        cancel_sale: 'fa-ban text-red-500',
        report_arrival: 'fa-truck-ramp-box text-cyan-400',
        approve_import: 'fa-clipboard-check text-violet-400',
        manage_po: 'fa-file-invoice-dollar text-pink-400',
        receive_po: 'fa-boxes-packing text-indigo-400',
        manage_transfers: 'fa-right-left text-cyan-400'
    };

    const openRoleModal = () => {
        if (roleModal) roleModal.classList.remove('opacity-0', 'pointer-events-none');
    };
    const closeRoleModal = () => {
        if (roleModal) {
            roleModal.classList.add('opacity-0', 'pointer-events-none');
            if (roleForm) roleForm.reset();
            if (editRoleId) editRoleId.value = '';
        }
    };

    if (btnAddRole) btnAddRole.addEventListener('click', () => {
        if (editRoleId) editRoleId.value = '';
        if (roleModalTitle) roleModalTitle.innerHTML = '<i class="fa-solid fa-shield-halved text-amber-400"></i> เพิ่มบทบาทใหม่';
        if (roleForm) roleForm.reset();
        openRoleModal();
    });
    if (closeRoleModalBtn) closeRoleModalBtn.addEventListener('click', closeRoleModal);
    if (cancelRoleModalBtn) cancelRoleModalBtn.addEventListener('click', closeRoleModal);

    // Load Roles
    async function loadRoles() {
        if (!rolesGrid) return;
        try {
            const response = await authFetch(`${API_BASE_URL}/roles`);
            const json = await response.json();

            rolesGrid.innerHTML = '';
            if (json.success && json.data.length > 0) {
                if (rolesEmpty) rolesEmpty.classList.add('hidden');
                json.data.forEach(role => renderRoleCard(role));
            } else {
                if (rolesEmpty) rolesEmpty.classList.remove('hidden');
            }
        } catch (error) {
            console.error('ดึงข้อมูลสิทธิ์ไม่สำเร็จ:', error);
        }
    };

    const renderRoleCard = (role) => {
        const p = role.permissions || {};
        const enabledCount = permKeys.filter(k => p[k]).length;

        const permBadges = permKeys.map(key => {
            const active = p[key];
            return `<div class="flex items-center gap-2 px-3 py-1.5 rounded-xl text-xs font-medium transition-all ${active
                ? 'bg-emerald-500/10 text-emerald-400 border border-emerald-500/20'
                : 'bg-slate-700/30 text-slate-500 border border-slate-700/50 opacity-60'
                }">
                <i class="fa-solid ${permIcons[key].split(' ')[0]} ${active ? '' : 'grayscale'}"></i>
                <span>${permLabels[key]}</span>
            </div>`;
        }).join('');

        const card = document.createElement('div');
        card.className = 'bg-slate-800/80 backdrop-blur-sm rounded-3xl border border-slate-700/50 p-6 hover:border-amber-500/40 hover:shadow-2xl hover:shadow-amber-500/10 transition-all duration-300 group relative overflow-hidden';
        card.innerHTML = `
            <!-- Decor -->
            <div class="absolute -right-4 -top-4 w-24 h-24 bg-amber-500/5 rounded-full blur-2xl group-hover:bg-amber-500/10 transition-all"></div>
            
            <div class="relative flex items-start justify-between mb-6">
                <div class="flex items-center gap-4">
                    <div class="w-12 h-12 rounded-2xl bg-gradient-to-br from-amber-500/20 to-orange-600/10 flex items-center justify-center border border-amber-500/20 shadow-inner group-hover:scale-110 transition-transform duration-500">
                        <i class="fa-solid fa-shield-halved text-amber-400 text-xl"></i>
                    </div>
                    <div>
                        <h4 class="text-white text-lg font-bold tracking-tight">${role.name}</h4>
                        <div class="flex items-center gap-2 mt-0.5">
                            <span class="w-1.5 h-1.5 rounded-full bg-emerald-500 animate-pulse"></span>
                            <p class="text-xs text-slate-400 font-medium">${enabledCount}/${permKeys.length} สิทธิ์เปิดใช้งาน</p>
                        </div>
                    </div>
                </div>
                <div class="flex gap-1">
                    <button class="edit-role-btn w-9 h-9 flex items-center justify-center rounded-xl bg-slate-700/50 text-slate-400 hover:bg-amber-500 hover:text-slate-900 transition-all duration-300 shadow-sm" data-id="${role._id}" title="แก้ไข">
                        <i class="fa-solid fa-pen-to-square text-sm"></i>
                    </button>
                    <button class="delete-role-btn w-9 h-9 flex items-center justify-center rounded-xl bg-slate-700/50 text-slate-400 hover:bg-red-500/80 hover:text-white transition-all duration-300 shadow-sm" data-id="${role._id}" data-name="${role.name}" title="ลบ">
                        <i class="fa-solid fa-trash text-sm"></i>
                    </button>
                </div>
            </div>
            
            <div class="grid grid-cols-2 gap-2 relative">
                ${permBadges}
            </div>
        `;
        rolesGrid.appendChild(card);

        // Event: Edit
        card.querySelector('.edit-role-btn').addEventListener('click', () => {
            editRoleId.value = role._id;
            roleModalTitle.innerHTML = '<i class="fa-solid fa-pen-to-square text-amber-400"></i> แก้ไขบทบาท';
            roleNameInput.value = role.name;
            permKeys.forEach(key => {
                const el = document.getElementById(`perm-${key}`);
                if (el) el.checked = !!(role.permissions && role.permissions[key]);
            });
            openRoleModal();
        });

        // Event: Delete
        card.querySelector('.delete-role-btn').addEventListener('click', () => {
            const name = role.name;
            showConfirm('ยืนยันการลบตำแหน่ง', `คุณแน่ใจหรือไม่ที่จะลบ "${name}"? พนักงานที่ใช้ตำแหน่งนี้อาจได้รับผลกระทบ`, async () => {
                try {
                    const response = await authFetch(`${API_BASE_URL}/roles/${role._id}`, { method: 'DELETE' });
                    const result = await response.json();
                    if (result.success) {
                        showToast(`ลบตำแหน่ง "${name}" สำเร็จ`);
                        loadRoles();
                    } else {
                        showToast(result.message, 'error');
                    }
                } catch (err) {
                    showToast('เกิดข้อผิดพลาดในการลบตำแหน่ง', 'error');
                }
            });
        });
    };

    // Role Form Submit
    if (roleForm) {
        roleForm.addEventListener('submit', async (e) => {
            e.preventDefault();
            const name = roleNameInput.value.trim();
            if (!name) return showToast('กรุณาระบุชื่อตำแหน่ง', 'error');

            const permissions = {};
            permKeys.forEach(key => {
                const el = document.getElementById(`perm-${key}`);
                permissions[key] = el ? el.checked : false;
            });

            const submitBtn = document.getElementById('submit-role-btn');
            const originalText = submitBtn.innerHTML;
            submitBtn.disabled = true;
            submitBtn.innerHTML = '<i class="fa-solid fa-circle-notch fa-spin"></i> กำลังบันทึก...';

            try {
                const id = editRoleId.value;
                const url = id ? `${API_BASE_URL}/roles/${id}` : `${API_BASE_URL}/roles`;
                const method = id ? 'PUT' : 'POST';

                const response = await authFetch(url, {
                    method,
                    headers: { 'Content-Type': 'application/json' },
                    body: JSON.stringify({ name, permissions })
                });
                const result = await response.json();

                if (result.success) {
                    showToast(id ? 'แก้ไขตำแหน่งสำเร็จ' : 'เพิ่มตำแหน่งสำเร็จ');
                    closeRoleModal();
                    loadRoles();
                } else {
                    showToast(result.message || 'เกิดข้อผิดพลาด', 'error');
                }
            } catch (err) {
                showToast('ไม่สามารถเชื่อมต่อกับเซิร์ฟเวอร์ได้', 'error');
            } finally {
                submitBtn.disabled = false;
                submitBtn.innerHTML = originalText;
            }
        });
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

            const actionButtons = transfer.status === 'รอดำเนินการ'
                ? `<div class="flex items-center justify-end gap-2">
                    <button onclick="printTransferDocument('${transfer._id}')" class="px-3 py-1.5 rounded-lg bg-slate-600 hover:bg-slate-500 text-white text-xs font-bold transition-all" title="พิมพ์ใบโอน">
                        <i class="fa-solid fa-print"></i> พิมพ์
                    </button>
                    <button onclick="receiveTransfer('${transfer._id}')" class="px-3 py-1.5 rounded-lg bg-cyan-500 hover:bg-cyan-400 text-slate-900 text-xs font-bold transition-all">
                        รับเข้า
                    </button>
                   </div>`
                : `<div class="flex items-center justify-end gap-2">
                    <button onclick="printTransferDocument('${transfer._id}')" class="px-3 py-1.5 rounded-lg bg-slate-600 hover:bg-slate-500 text-white text-xs font-bold transition-all" title="พิมพ์ใบโอน">
                        <i class="fa-solid fa-print"></i> พิมพ์
                    </button>
                    <span class="text-slate-500 text-xs">รับเข้าแล้ว</span>
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
        await loadBranchesForTransfer();
        if (transferToBranch) transferToBranch.value = '';
        if (transferScanInput) transferScanInput.value = '';
    }

    function closeTransferModal() {
        if (!modalCreateTransfer) return;
        modalCreateTransfer.classList.add('opacity-0', 'pointer-events-none');
        transferCart = [];
        renderTransferCart();
        if (transferToBranch) transferToBranch.value = '';
        if (transferScanInput) transferScanInput.value = '';
    }

    // Load Branches for Transfer (exclude current branch)
    async function loadBranchesForTransfer() {
        if (!transferToBranch) return;
        const user = JSON.parse(localStorage.getItem('silmin_user') || '{}');
        const currentBranchId = user.branch_id;

        console.log('[TRANSFER] Loading branches for transfer, current branch:', currentBranchId);

        try {
            const response = await authFetch(`${API_BASE_URL}/branches`);
            const result = await response.json();

            console.log('[TRANSFER] Branches API response:', result);

            if (result.success && result.data) {
                transferToBranch.innerHTML = '<option value="" disabled selected>-- เลือกสาขาปลายทาง --</option>';

                const filteredBranches = result.data.filter(branch => branch._id !== currentBranchId);
                console.log('[TRANSFER] Available destination branches:', filteredBranches);

                if (filteredBranches.length === 0) {
                    showToast('ไม่มีสาขาปลายทางให้เลือก', 'error');
                    return;
                }

                filteredBranches.forEach(branch => {
                    const option = document.createElement('option');
                    option.value = branch._id;
                    option.textContent = branch.name;
                    transferToBranch.appendChild(option);
                });
            } else {
                console.error('[TRANSFER] Failed to load branches:', result.message);
                showToast('ไม่สามารถโหลดข้อมูลสาขาได้', 'error');
            }
        } catch (err) {
            console.error('[TRANSFER] Error loading branches:', err);
            showToast('ไม่สามารถโหลดข้อมูลสาขาได้', 'error');
        }
    }

    // Add Product to Transfer Cart (by scanning barcode or IMEI)
    async function addProductToTransferCart(code) {
        try {
            const response = await authFetch(`${API_BASE_URL}/products/search?code=${encodeURIComponent(code)}`);
            const result = await response.json();

            if (result.success && result.product) {
                const product = result.product;
                const hasImeis = Array.isArray(product.imeis) && product.imeis.length > 0;
                
                if (hasImeis) {
                    // Check if the scanned code is one of the IMEIs of this product
                    const isImeiScan = product.imeis.includes(code);
                    if (!isImeiScan) {
                        showToast(`สินค้าประเภทเครื่อง ${product.name} กรุณาสแกนหรือระบุหมายเลข IMEI แทนรหัสสินค้า`, 'error');
                        return;
                    }
                    
                    // Check if this IMEI is already in transferCart
                    const isAlreadyScanned = transferCart.some(item => Array.isArray(item.imeis) && item.imeis.includes(code));
                    if (isAlreadyScanned) {
                        showToast(`หมายเลข IMEI: ${code} ถูกสแกนเพิ่มในใบโอนแล้ว`, 'error');
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
                    const existingItem = transferCart.find(item => item.product_code === product.product_code);
                    if (existingItem) {
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
                showToast(`เพิ่ม ${product.name} ลงรายการโอนย้ายแล้ว`);
            } else {
                showToast('ไม่พบสินค้าที่สแกน', 'error');
            }
        } catch (err) {
            showToast('ไม่สามารถค้นหาสินค้าได้', 'error');
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
            if (transferCartEmpty) transferCartEmpty.classList.remove('hidden');
            transferCartItems.innerHTML = '';
            transferCartItems.appendChild(transferCartEmpty);
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
                    <div class="text-slate-500 text-xs">${item.product_code} | จำนวน: ${item.quantity}</div>
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

        if (!transferToBranch || !transferToBranch.value) {
            showToast('กรุณาเลือกสาขาปลายทาง', 'error');
            return;
        }

        const user = JSON.parse(localStorage.getItem('silmin_user') || '{}');

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
                        if (confirm('ต้องการพิมพ์ใบโอนย้ายสินค้าหรือไม่?')) {
                            printTransferDocument(result.data._id);
                        }
                    }, 500);
                }
            } else {
                showToast(result.message || 'เกิดข้อผิดพลาด', 'error');
            }
        } catch (err) {
            showToast('ไม่สามารถเชื่อมต่อกับเซิร์ฟเวอร์ได้', 'error');
        }
    }

    // Receive Transfer
    window.receiveTransfer = async function (transferId) {
        if (!confirm('ยืนยันการรับเข้าสินค้า? สินค้าจะถูกเพิ่มเข้าสต็อกสาขาของคุณ')) {
            return;
        }

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
    if (transferScanInput) {
        transferScanInput.addEventListener('keypress', (e) => {
            if (e.key === 'Enter') {
                e.preventDefault();
                const code = transferScanInput.value.trim();
                if (code) {
                    addProductToTransferCart(code);
                }
            }
        });
    }
    if (btnSubmitTransfer) btnSubmitTransfer.addEventListener('click', submitTransfer);

    // ==========================================
    // Movement Ledger Logic (ระบบประวัติการเคลื่อนไหว)
    // ==========================================
    const formSearchMovement = document.getElementById('form-search-movement');
    const movementSearchInput = document.getElementById('movement-search-input');
    const movementResultArea = document.getElementById('movement-result-area');
    const movementEmptyState = document.getElementById('movement-empty-state');
    const movementTimeline = document.getElementById('movement-timeline');

    if (formSearchMovement) {
        formSearchMovement.addEventListener('submit', async (e) => {
            e.preventDefault();
            const query = movementSearchInput.value.trim();
            if (!query) return;

            try {
                const btnSearch = document.getElementById('btn-search-movement');
                const origHtml = btnSearch.innerHTML;
                btnSearch.innerHTML = '<i class="fa-solid fa-spinner fa-spin mr-2"></i> กำลังค้นหา...';
                btnSearch.disabled = true;

                const response = await authFetch(`${API_BASE_URL}/movements/search?query=${encodeURIComponent(query)}`);
                const res = await response.json();
                if (res && res.success) {
                    renderMovementResult(res.data);
                } else {
                    showToast(res?.message || 'ไม่พบประวัติการเคลื่อนไหว', 'error');
                    movementResultArea.classList.add('hidden');
                    movementEmptyState.classList.remove('hidden');
                }

                btnSearch.innerHTML = origHtml;
                btnSearch.disabled = false;
            } catch (error) {
                console.error('Error searching movement:', error);
                showToast('เกิดข้อผิดพลาดในการค้นหาประวัติ', 'error');
                movementResultArea.classList.add('hidden');
                movementEmptyState.classList.remove('hidden');

                const btnSearch = document.getElementById('btn-search-movement');
                btnSearch.innerHTML = '<i class="fa-solid fa-search mr-2"></i> ค้นหาข้อมูล';
                btnSearch.disabled = false;
            }
        });
    }

    function renderMovementResult(data) {
        movementEmptyState.classList.add('hidden');
        movementResultArea.classList.remove('hidden');

        // Product Info
        document.getElementById('mov-product-name').textContent = data.product.name;
        document.getElementById('mov-product-code').textContent = data.product.product_code || '-';
        document.getElementById('mov-type').textContent = data.product.type || 'ไม่ระบุ';
        document.getElementById('mov-color').textContent = data.product.color || 'ไม่ระบุ';
        document.getElementById('mov-capacity').textContent = data.product.capacity || 'ไม่ระบุ';

        const badge = document.getElementById('mov-query-badge');
        if (data.is_imei_search) {
            document.getElementById('mov-query-text').textContent = data.searched_query;
            badge.classList.remove('hidden');
        } else {
            badge.classList.add('hidden');
        }

        // Timeline
        movementTimeline.innerHTML = '';
        if (!data.movements || data.movements.length === 0) {
            movementTimeline.innerHTML = '<div class="text-slate-400">ยังไม่มีประวัติการเคลื่อนไหว</div>';
            return;
        }

        // เส้นไทม์ไลน์
        const line = document.createElement('div');
        line.className = 'absolute top-0 bottom-0 left-[19px] w-1 bg-gradient-to-b from-rose-500/50 via-slate-700 to-transparent rounded-full';
        movementTimeline.appendChild(line);

        data.movements.forEach((mov, index) => {
            const isLatest = index === 0;
            const dateObj = new Date(mov.created_at);
            const dateStr = dateObj.toLocaleDateString('th-TH', { year: 'numeric', month: 'short', day: 'numeric' });
            const timeStr = dateObj.toLocaleTimeString('th-TH', { hour: '2-digit', minute: '2-digit' });

            let iconHtml = '';
            let colorClass = '';
            let detailsHtml = '';

            switch (mov.action) {
                case 'รับเข้าสต็อก':
                    iconHtml = '<i class="fa-solid fa-arrow-down"></i>';
                    colorClass = 'from-emerald-400 to-emerald-600 text-white shadow-[0_0_15px_rgba(16,185,129,0.5)] border-emerald-300/30';
                    detailsHtml = `
                        <div class="mt-3 bg-slate-800/80 rounded-xl p-3 border border-emerald-500/20">
                            <div class="text-slate-300 flex items-center">
                                <i class="fa-solid fa-store text-emerald-400 w-5"></i> เข้าสู่สาขา <span class="font-bold text-emerald-400 ml-2">${mov.to_branch ? mov.to_branch.name : '-'}</span>
                            </div>
                            <div class="text-xs text-slate-500 mt-2 flex items-center"><i class="fa-solid fa-user-check w-5"></i> รับเข้าโดย: ${mov.created_by ? mov.created_by.name : '-'}</div>
                        </div>
                    `;
                    break;
                case 'ส่งโอนย้าย':
                    iconHtml = '<i class="fa-solid fa-truck-fast"></i>';
                    colorClass = 'from-cyan-400 to-blue-600 text-white shadow-[0_0_15px_rgba(6,182,212,0.5)] border-cyan-300/30';
                    detailsHtml = `
                        <div class="mt-3 bg-slate-800/80 rounded-xl p-3 border border-cyan-500/20">
                            <div class="text-slate-300 flex items-center mb-1">
                                <i class="fa-solid fa-store text-slate-400 w-5"></i> ต้นทาง <span class="font-bold text-slate-200 ml-2">${mov.from_branch ? mov.from_branch.name : '-'}</span>
                            </div>
                            <div class="text-slate-300 flex items-center">
                                <i class="fa-solid fa-arrow-right-to-city text-cyan-400 w-5"></i> ปลายทาง <span class="font-bold text-cyan-400 ml-2">${mov.to_branch ? mov.to_branch.name : '-'}</span>
                            </div>
                            <div class="mt-2 pt-2 border-t border-slate-700/50 flex flex-wrap gap-3">
                                <div class="text-xs text-slate-500 flex items-center"><i class="fa-solid fa-file-invoice text-slate-400 mr-1"></i> เลขที่โอน: ${mov.reference_no}</div>
                                <div class="text-xs text-slate-500 flex items-center"><i class="fa-solid fa-user text-slate-400 mr-1"></i> ผู้โอน: ${mov.created_by ? mov.created_by.name : '-'}</div>
                            </div>
                        </div>
                    `;
                    break;
                case 'รับโอนย้าย':
                    iconHtml = '<i class="fa-solid fa-box-open"></i>';
                    colorClass = 'from-indigo-400 to-purple-600 text-white shadow-[0_0_15px_rgba(99,102,241,0.5)] border-indigo-300/30';
                    detailsHtml = `
                        <div class="mt-3 bg-slate-800/80 rounded-xl p-3 border border-indigo-500/20">
                            <div class="text-slate-300 flex items-center">
                                <i class="fa-solid fa-check-to-slot text-indigo-400 w-5"></i> รับเข้าสาขา <span class="font-bold text-indigo-400 ml-2">${mov.to_branch ? mov.to_branch.name : '-'}</span>
                            </div>
                            <div class="mt-2 pt-2 border-t border-slate-700/50 flex flex-wrap gap-3">
                                <div class="text-xs text-indigo-300 flex items-center bg-indigo-500/10 px-2 py-1 rounded-md"><i class="fa-solid fa-stopwatch mr-1"></i> ใช้เวลาขนส่ง: ${Number(mov.transit_hours).toFixed(1)} ชั่วโมง</div>
                                <div class="text-xs text-slate-500 flex items-center py-1"><i class="fa-solid fa-user-check text-slate-400 mr-1"></i> ผู้รับ: ${mov.created_by ? mov.created_by.name : '-'}</div>
                            </div>
                        </div>
                    `;
                    break;
                case 'ขายออก':
                    iconHtml = '<i class="fa-solid fa-cash-register"></i>';
                    colorClass = 'from-rose-500 to-red-600 text-white shadow-[0_0_15px_rgba(244,63,94,0.5)] border-rose-300/30';
                    detailsHtml = `
                        <div class="mt-3 bg-rose-950/20 rounded-xl p-3 border border-rose-500/30">
                            <div class="text-slate-200 flex items-center font-medium">
                                <i class="fa-solid fa-store text-rose-400 w-5"></i> ขายออกจาก <span class="font-bold text-rose-400 ml-2">${mov.from_branch ? mov.from_branch.name : '-'}</span>
                            </div>
                            <div class="mt-2 pt-2 border-t border-rose-900/50 flex flex-wrap gap-3">
                                <div class="text-xs text-rose-300 flex items-center"><i class="fa-solid fa-receipt mr-1"></i> ใบเสร็จ: ${mov.reference_no}</div>
                                <div class="text-xs text-slate-400 flex items-center"><i class="fa-solid fa-user-tag mr-1"></i> พนักงานขาย: ${mov.created_by ? mov.created_by.name : '-'}</div>
                            </div>
                        </div>
                    `;
                    break;
                default:
                    iconHtml = '<i class="fa-solid fa-circle-dot"></i>';
                    colorClass = 'from-slate-600 to-slate-700 text-slate-300 border-slate-500';
            }

            const itemDiv = document.createElement('div');
            itemDiv.className = `relative pl-12 transition-all duration-500 hover:-translate-y-1 ${isLatest ? 'opacity-100 scale-100' : 'opacity-80 scale-[0.98] hover:opacity-100'}`;
            itemDiv.innerHTML = `
                <!-- Timeline Dot (Premium) -->
                <div class="absolute left-0 top-1 -ml-[3px] w-10 h-10 rounded-full border border-white/20 flex items-center justify-center text-sm z-10 bg-gradient-to-br ${colorClass}">
                    ${isLatest ? '<div class="absolute -inset-1 bg-white rounded-full opacity-20 animate-ping"></div>' : ''}
                    ${iconHtml}
                </div>
                
                <!-- Content Box -->
                <div class="bg-gradient-to-b from-slate-800 to-slate-900 border ${isLatest ? 'border-slate-500/50 shadow-[0_4px_20px_rgba(0,0,0,0.3)] ring-1 ring-white/10' : 'border-slate-700/50'} rounded-2xl p-5 group hover:border-slate-500/40 transition-colors duration-300">
                    <div class="flex flex-col sm:flex-row justify-between items-start sm:items-center gap-2 mb-2">
                        <span class="font-bold text-white text-xl flex items-center gap-2">
                            ${mov.action} 
                            ${isLatest ? '<span class="text-[10px] font-bold tracking-wider uppercase bg-rose-500 text-white px-2 py-0.5 rounded-full ml-2 animate-pulse">LATEST</span>' : ''}
                        </span>
                        <div class="flex items-center gap-2 bg-slate-950/50 px-3 py-1.5 rounded-lg border border-slate-700/50">
                            <i class="fa-regular fa-clock text-slate-500"></i>
                            <span class="text-sm text-slate-300 font-medium">${dateStr}</span>
                            <span class="text-sm text-slate-400 font-mono">${timeStr}</span>
                        </div>
                    </div>
                    
                    ${data.is_imei_search === false && mov.imei ? '<div class="text-sm text-rose-400 font-mono mt-2 flex items-center"><i class="fa-solid fa-tag text-slate-500 w-5"></i> IMEI: <span class="font-bold ml-1 bg-rose-500/10 px-2 py-0.5 rounded border border-rose-500/20">' + mov.imei + '</span></div>' : ''}
                    ${data.is_imei_search === false && !mov.imei && mov.quantity ? '<div class="text-sm text-cyan-400 font-mono mt-2 flex items-center"><i class="fa-solid fa-cubes text-slate-500 w-5"></i> จำนวน: <span class="font-bold ml-1 bg-cyan-500/10 px-2 py-0.5 rounded border border-cyan-500/20">' + mov.quantity + '</span></div>' : ''}
                    
                    ${detailsHtml}
                </div>
            `;
            movementTimeline.appendChild(itemDiv);
        });
    }

    // ==========================================
    // Member Management (จัดการสมาชิก)
    // ==========================================
    let membersData = [];

    const loadMembers = async () => {
        try {
            const response = await authFetch(`${API_BASE_URL}/members`);
            const json = await response.json();
            if (json.success) {
                membersData = Array.isArray(json.data) ? json.data : [];
                renderMemberTable(membersData);
            }
        } catch (error) {
            console.error('Error loading members:', error);
        }
    };

    const renderMemberTable = (members) => {
        const tbody = document.getElementById('member-table-body');
        if (!tbody) return;
        tbody.innerHTML = '';

        if (members.length === 0) {
            tbody.innerHTML = `
                <tr>
                    <td colspan="8" class="px-6 py-12 text-center">
                        <div class="flex flex-col items-center text-slate-500">
                            <i class="fa-solid fa-users text-4xl mb-3 text-slate-600"></i>
                            <p class="font-medium text-slate-400">ยังไม่มีข้อมูลสมาชิก</p>
                            <p class="text-sm text-slate-600 mt-1">กดปุ่ม "เพิ่มสมาชิก" เพื่อเริ่มต้น</p>
                        </div>
                    </td>
                </tr>
            `;
            return;
        }

        members.forEach(m => {
            const row = document.createElement('tr');
            row.className = 'hover:bg-slate-700/20 transition-colors';

            const fullName = `${m.prefix || ''} ${m.first_name || ''} ${m.last_name || ''}`.trim();
            const citizenDisplay = m.citizen_id ? m.citizen_id.replace(/(\d{1})(\d{4})(\d{5})(\d{2})(\d{1})/, '$1-$2-$3-$4-$5') : '-';
            const dateStr = m.createdAt ? new Date(m.createdAt).toLocaleDateString('th-TH', { year: 'numeric', month: 'short', day: 'numeric' }) : '-';

            const photoHtml = m.photo
                ? `<img src="data:image/jpeg;base64,${m.photo}" class="w-10 h-10 rounded-lg object-cover border border-slate-600">`
                : `<div class="w-10 h-10 rounded-lg bg-slate-700 flex items-center justify-center text-slate-400"><i class="fa-solid fa-user"></i></div>`;

            const referralBadge = m.referral_source
                ? `<span class="px-2 py-1 bg-teal-500/10 text-teal-400 rounded-md text-xs font-medium border border-teal-500/20">${m.referral_source}</span>`
                : '<span class="text-slate-500">-</span>';

            row.innerHTML = `
                <td class="px-6 py-4">${photoHtml}</td>
                <td class="px-6 py-4 font-bold text-cyan-400 font-mono">${m.member_number || '-'}</td>
                <td class="px-6 py-4">
                    <p class="font-medium text-white">${fullName}</p>
                    ${m.first_name_en || m.last_name_en ? `<p class="text-xs text-slate-500">${(m.first_name_en || '')} ${(m.last_name_en || '')}</p>` : ''}
                </td>
                <td class="px-6 py-4 text-slate-300 font-mono text-xs">${citizenDisplay}</td>
                <td class="px-6 py-4 text-slate-300">${m.phone || '-'}</td>
                <td class="px-6 py-4">${referralBadge}</td>
                <td class="px-6 py-4 text-slate-400 text-sm">${dateStr}</td>
                <td class="px-6 py-4 text-right">
                    <div class="flex items-center justify-end gap-1">
                        <button class="edit-member-btn text-slate-400 hover:text-cyan-400 transition-colors p-2" data-id="${m._id}"><i class="fa-solid fa-pen"></i></button>
                        <button class="delete-member-btn text-slate-400 hover:text-red-400 transition-colors p-2" data-id="${m._id}"><i class="fa-solid fa-trash"></i></button>
                    </div>
                </td>
            `;
            tbody.appendChild(row);

            row.querySelector('.edit-member-btn').addEventListener('click', () => openMemberModalForEdit(m));
            row.querySelector('.delete-member-btn').addEventListener('click', () => deleteMember(m._id));
        });
    };

    // Member Search
    const memberSearchInput = document.getElementById('member-search-input');
    if (memberSearchInput) {
        let memberSearchDebounce = null;
        memberSearchInput.addEventListener('input', (e) => {
            clearTimeout(memberSearchDebounce);
            memberSearchDebounce = setTimeout(() => {
                const q = e.target.value.trim().toLowerCase();
                if (!q) {
                    renderMemberTable(membersData);
                    return;
                }
                const filtered = membersData.filter(m => {
                    const name = `${m.prefix || ''} ${m.first_name || ''} ${m.last_name || ''} ${m.first_name_en || ''} ${m.last_name_en || ''}`.toLowerCase();
                    const cid = (m.citizen_id || '').toLowerCase();
                    const phone = (m.phone || '').toLowerCase();
                    const memNum = (m.member_number || '').toLowerCase();
                    return name.includes(q) || cid.includes(q) || phone.includes(q) || memNum.includes(q);
                });
                renderMemberTable(filtered);
            }, 300);
        });
    }

    // Member Modal Management
    const memberModal = document.getElementById('member-modal');
    const openMemberModal = () => {
        if (memberModal) memberModal.classList.remove('opacity-0', 'pointer-events-none');
    };
    const closeMemberModal = () => {
        if (memberModal) memberModal.classList.add('opacity-0', 'pointer-events-none');
        resetMemberForm();
    };

    const resetMemberForm = () => {
        document.getElementById('edit-member-id').value = '';
        document.getElementById('member-citizen-id').value = '';
        document.getElementById('member-prefix').value = '';
        document.getElementById('member-first-name').value = '';
        document.getElementById('member-last-name').value = '';
        document.getElementById('member-first-name-en').value = '';
        document.getElementById('member-last-name-en').value = '';
        document.getElementById('member-birthdate').value = '';
        document.getElementById('member-card-expiry').value = '';
        document.getElementById('member-gender').value = '';
        document.getElementById('member-address').value = '';
        document.getElementById('member-zipcode').value = '';
        document.getElementById('member-phone').value = '';
        document.getElementById('member-facebook-name').value = '';
        document.getElementById('member-facebook-link').value = '';
        document.getElementById('member-line-id').value = '';
        document.getElementById('member-referral').value = '';
        // Reset photo preview
        const photoPreview = document.getElementById('member-photo-preview');
        if (photoPreview) {
            photoPreview.innerHTML = `<div class="text-center text-slate-500 p-2"><i class="fa-solid fa-user-large text-2xl mb-2 block opacity-50"></i><p class="text-[10px]">รูปหลังอ่านบัตร</p></div>`;
        }

        // Reset Card Front Photo state and preview
        currentCardFrontPhotoBase64 = '';
        currentCardFrontPhotoUrl = '';
        const cardFrontContainer = document.getElementById('member-card-front-container');
        if (cardFrontContainer) {
            cardFrontContainer.innerHTML = `<div id="member-card-front-placeholder" class="text-center text-slate-500 p-3 group-hover:text-cyan-400 transition-colors duration-300"><i class="fa-solid fa-cloud-arrow-up text-3xl mb-2 block opacity-60 group-hover:opacity-100 transform group-hover:-translate-y-1 transition-all duration-300"></i><p class="text-xs font-medium leading-tight">คลิกเลือกรูปหน้าบัตร</p></div>`;
        }
        const cardFrontInput = document.getElementById('member-card-front-input');
        if (cardFrontInput) cardFrontInput.value = '';

        // Reset modal title
        const title = document.getElementById('member-modal-title');
        if (title) title.innerHTML = `<div class="w-10 h-10 rounded-xl bg-teal-500/10 flex items-center justify-center border border-teal-500/20"><i class="fa-solid fa-address-card text-teal-400"></i></div> เพิ่มสมาชิกใหม่`;
    };

    // Store the current member's photo for saving
    let currentMemberPhoto = '';
    let currentCardFrontPhotoBase64 = '';
    let currentCardFrontPhotoUrl = '';

    const openMemberModalForEdit = (member) => {
        resetMemberForm();
        const title = document.getElementById('member-modal-title');
        if (title) {
            const memberTag = member.member_number ? `<span class="text-xs bg-cyan-500/10 border border-cyan-500/20 text-cyan-400 px-2.5 py-1 rounded-lg font-mono font-bold ml-2 tracking-wider">${member.member_number}</span>` : '';
            title.innerHTML = `<div class="w-10 h-10 rounded-xl bg-teal-500/10 flex items-center justify-center border border-teal-500/20"><i class="fa-solid fa-pen text-teal-400"></i></div> แก้ไขข้อมูลสมาชิก ${memberTag}`;
        }

        document.getElementById('edit-member-id').value = member._id;
        document.getElementById('member-citizen-id').value = member.citizen_id || '';
        document.getElementById('member-prefix').value = member.prefix || '';
        document.getElementById('member-first-name').value = member.first_name || '';
        document.getElementById('member-last-name').value = member.last_name || '';
        document.getElementById('member-first-name-en').value = member.first_name_en || '';
        document.getElementById('member-last-name-en').value = member.last_name_en || '';
        document.getElementById('member-birthdate').value = member.birthdate || '';
        document.getElementById('member-card-expiry').value = member.card_expiry || '';
        document.getElementById('member-gender').value = member.gender || '';
        document.getElementById('member-address').value = member.address || '';
        document.getElementById('member-zipcode').value = member.zipcode || '';
        document.getElementById('member-phone').value = member.phone || '';
        document.getElementById('member-facebook-name').value = member.facebook_name || '';
        document.getElementById('member-facebook-link').value = member.facebook_link || '';
        document.getElementById('member-line-id').value = member.line_id || '';
        document.getElementById('member-referral').value = member.referral_source || '';

        currentMemberPhoto = member.photo || '';
        const photoPreview = document.getElementById('member-photo-preview');
        if (photoPreview && member.photo) {
            photoPreview.innerHTML = `<img src="data:image/jpeg;base64,${member.photo}" class="w-full h-full object-cover">`;
        }

        // Populate card front photo preview
        currentCardFrontPhotoUrl = member.card_front_photo || '';
        currentCardFrontPhotoBase64 = '';
        const cardFrontContainer = document.getElementById('member-card-front-container');
        if (cardFrontContainer && member.card_front_photo) {
            cardFrontContainer.innerHTML = `<img src="${member.card_front_photo}" class="w-full h-full object-cover">`;
        }

        openMemberModal();
    };

    // Add Member Button
    const btnAddMember = document.getElementById('btn-add-member');
    if (btnAddMember) {
        btnAddMember.addEventListener('click', () => {
            resetMemberForm();
            currentMemberPhoto = '';
            openMemberModal();
        });
    }

    // Close/Cancel Member Modal
    const closeMemberModalBtn = document.getElementById('close-member-modal-btn');
    const cancelMemberModalBtn = document.getElementById('cancel-member-modal-btn');
    if (closeMemberModalBtn) closeMemberModalBtn.addEventListener('click', closeMemberModal);
    if (cancelMemberModalBtn) cancelMemberModalBtn.addEventListener('click', closeMemberModal);

    // Smart Card Reader
    const btnReadSmartcard = document.getElementById('btn-read-smartcard');
    if (btnReadSmartcard) {
        btnReadSmartcard.addEventListener('click', async () => {
            const originalHtml = btnReadSmartcard.innerHTML;
            btnReadSmartcard.disabled = true;
            btnReadSmartcard.innerHTML = `<i class="fa-solid fa-spinner fa-spin text-2xl"></i> กำลังอ่านบัตร...`;
            btnReadSmartcard.classList.add('opacity-75');

            try {
                const response = await fetch('http://localhost:3001/api/read-card');
                const result = await response.json();

                if (!result || !result.success) {
                    showToast(result.message || 'อ่านข้อมูลไม่สำเร็จ กรุณาตรวจสอบเครื่องอ่านบัตร', 'error');
                    return;
                }

                const data = result.data;
                if (data) {
                    // Map smart card response to form fields
                    if (data.citizenId) document.getElementById('member-citizen-id').value = data.citizenId;
                    if (data.prefix) document.getElementById('member-prefix').value = data.prefix;
                    if (data.firstName) document.getElementById('member-first-name').value = data.firstName;
                    if (data.lastName) document.getElementById('member-last-name').value = data.lastName;
                    if (data.firstNameEn) document.getElementById('member-first-name-en').value = data.firstNameEn;
                    if (data.lastNameEn) document.getElementById('member-last-name-en').value = data.lastNameEn;
                    if (data.birthdate) document.getElementById('member-birthdate').value = data.birthdate;
                    if (data.expiryDate) document.getElementById('member-card-expiry').value = data.expiryDate;
                    if (data.gender) document.getElementById('member-gender').value = data.gender;
                    if (data.address) document.getElementById('member-address').value = data.address;

                    // Photo preview
                    if (data.photo) {
                        const fullPhoto = data.photo.startsWith('data:') ? data.photo : `data:image/jpeg;base64,${data.photo}`;

                        // Remove data URI prefix for storage in database
                        currentMemberPhoto = fullPhoto.replace(/^data:image\/[a-z]+;base64,/, '');

                        const photoPreview = document.getElementById('member-photo-preview');
                        if (photoPreview) {
                            photoPreview.innerHTML = `<img src="${fullPhoto}" class="w-full h-full object-cover">`;
                        }
                    }

                    showToast('อ่านข้อมูลจากบัตรประชาชนสำเร็จ');
                }
            } catch (error) {
                console.error('Smart card read error:', error);
                showToast('ไม่สามารถเชื่อมต่อเครื่องอ่านบัตรได้ กรุณาเปิดโปรแกรม Run_Agent และเสียบบัตรประชาชน', 'error');
            } finally {
                btnReadSmartcard.disabled = false;
                btnReadSmartcard.innerHTML = originalHtml;
                btnReadSmartcard.classList.remove('opacity-75');
            }
        });
    }

    // Card Front Photo Upload Logic
    const cardFrontPreviewBtn = document.getElementById('member-card-front-preview-btn');
    const cardFrontInput = document.getElementById('member-card-front-input');
    const cardFrontContainer = document.getElementById('member-card-front-container');

    if (cardFrontPreviewBtn && cardFrontInput) {
        cardFrontPreviewBtn.addEventListener('click', (e) => {
            if (e.target !== cardFrontInput) {
                cardFrontInput.click();
            }
        });

        cardFrontInput.addEventListener('change', (e) => {
            const file = e.target.files[0];
            if (file) {
                if (file.size > 5 * 1024 * 1024) {
                    showToast('ไฟล์มีขนาดใหญ่เกินไป (ไม่ควรเกิน 5MB)', 'error');
                    cardFrontInput.value = '';
                    return;
                }

                const reader = new FileReader();
                reader.onload = (event) => {
                    currentCardFrontPhotoBase64 = event.target.result;
                    if (cardFrontContainer) {
                        cardFrontContainer.innerHTML = `<img src="${currentCardFrontPhotoBase64}" class="w-full h-full object-cover">`;
                    }
                };
                reader.readAsDataURL(file);
            }
        });
    }

    // Submit Member (Add/Edit)
    const submitMemberBtn = document.getElementById('submit-member-btn');
    if (submitMemberBtn) {
        submitMemberBtn.addEventListener('click', async () => {
            const citizenId = document.getElementById('member-citizen-id').value.trim();
            const prefix = document.getElementById('member-prefix').value.trim();
            const firstName = document.getElementById('member-first-name').value.trim();
            const lastName = document.getElementById('member-last-name').value.trim();
            const firstNameEn = document.getElementById('member-first-name-en').value.trim();
            const lastNameEn = document.getElementById('member-last-name-en').value.trim();
            const birthdate = document.getElementById('member-birthdate').value.trim();
            const cardExpiry = document.getElementById('member-card-expiry').value.trim();
            const gender = document.getElementById('member-gender').value;
            const address = document.getElementById('member-address').value.trim();
            const zipcode = document.getElementById('member-zipcode').value.trim();
            const phone = document.getElementById('member-phone').value.trim();
            const facebookName = document.getElementById('member-facebook-name').value.trim();
            const facebookLink = document.getElementById('member-facebook-link').value.trim();
            const lineId = document.getElementById('member-line-id').value.trim();
            const referral = document.getElementById('member-referral').value;

            // Comprehensive Form Validations
            if (!citizenId) return showToast('กรุณากรอกเลขบัตรประชาชน', 'error');
            if (!prefix) return showToast('กรุณากรอกคำนำหน้า', 'error');
            if (!firstName || !lastName) return showToast('กรุณากรอกชื่อและนามสกุลภาษาไทย', 'error');
            if (!firstNameEn || !lastNameEn) return showToast('กรุณากรอกชื่อและนามสกุลภาษาอังกฤษ', 'error');
            if (!birthdate) return showToast('กรุณากรอกวันเกิด', 'error');
            if (!cardExpiry) return showToast('กรุณากรอกวันหมดอายุบัตร', 'error');
            if (!gender) return showToast('กรุณาเลือกเพศ', 'error');
            if (!address) return showToast('กรุณากรอกที่อยู่', 'error');
            if (!zipcode) return showToast('กรุณากรอกรหัสไปรษณีย์', 'error');
            if (!phone) return showToast('กรุณากรอกเบอร์โทรศัพท์', 'error');
            if (!facebookName) return showToast('กรุณากรอกชื่อ Facebook', 'error');
            if (!facebookLink) return showToast('กรุณากรอกลิงก์ Facebook', 'error');
            if (!lineId) return showToast('กรุณากรอก LINE ID', 'error');
            if (!referral) return showToast('กรุณาเลือกแหล่งที่มาที่รู้จัก', 'error');

            // Strict Photo Validations
            if (!currentMemberPhoto) {
                return showToast('กรุณากด "อ่านบัตร" เพื่อดึงรูปถ่ายจากชิปการ์ด', 'error');
            }
            if (!currentCardFrontPhotoUrl && !currentCardFrontPhotoBase64) {
                return showToast('กรุณาแนบรูปถ่ายหน้าบัตรประชาชนทุกครั้ง', 'error');
            }

            const editId = document.getElementById('edit-member-id').value;
            const payload = {
                citizen_id: document.getElementById('member-citizen-id').value.trim(),
                prefix: document.getElementById('member-prefix').value.trim(),
                first_name: firstName,
                last_name: lastName,
                first_name_en: document.getElementById('member-first-name-en').value.trim(),
                last_name_en: document.getElementById('member-last-name-en').value.trim(),
                birthdate: document.getElementById('member-birthdate').value.trim(),
                card_expiry: document.getElementById('member-card-expiry').value.trim(),
                gender: document.getElementById('member-gender').value,
                address: document.getElementById('member-address').value.trim(),
                photo: currentMemberPhoto,
                card_front_photo: currentCardFrontPhotoUrl,
                card_front_photo_base64: currentCardFrontPhotoBase64,
                zipcode: document.getElementById('member-zipcode').value.trim(),
                phone: document.getElementById('member-phone').value.trim(),
                facebook_name: document.getElementById('member-facebook-name').value.trim(),
                facebook_link: document.getElementById('member-facebook-link').value.trim(),
                line_id: document.getElementById('member-line-id').value.trim(),
                referral_source: document.getElementById('member-referral').value
            };

            try {
                submitMemberBtn.disabled = true;
                submitMemberBtn.innerHTML = '<i class="fa-solid fa-spinner fa-spin"></i> กำลังบันทึก...';

                let response;
                if (editId) {
                    response = await authFetch(`${API_BASE_URL}/members/${editId}`, {
                        method: 'PUT',
                        headers: { 'Content-Type': 'application/json' },
                        body: JSON.stringify(payload)
                    });
                } else {
                    response = await authFetch(`${API_BASE_URL}/members`, {
                        method: 'POST',
                        headers: { 'Content-Type': 'application/json' },
                        body: JSON.stringify(payload)
                    });
                }

                const result = await response.json();
                if (result.success) {
                    showToast(editId ? 'แก้ไขข้อมูลสมาชิกสำเร็จ' : 'เพิ่มสมาชิกใหม่สำเร็จ');
                    closeMemberModal();
                    loadMembers();
                } else {
                    showToast(result.message || 'เกิดข้อผิดพลาด', 'error');
                }
            } catch (error) {
                console.error('Error saving member:', error);
                showToast('เกิดข้อผิดพลาดในการบันทึกข้อมูล', 'error');
            } finally {
                submitMemberBtn.disabled = false;
                submitMemberBtn.innerHTML = '<i class="fa-solid fa-floppy-disk"></i> บันทึกสมาชิก';
            }
        });
    }

    // Delete Member
    const deleteMember = (id) => {
        showConfirm('ยืนยันการลบสมาชิก', 'คุณแน่ใจหรือไม่ว่าต้องการลบสมาชิกรายนี้? ข้อมูลนี้ไม่สามารถกู้คืนได้', async () => {
            try {
                const response = await authFetch(`${API_BASE_URL}/members/${id}`, { method: 'DELETE' });
                const result = await response.json();
                if (result.success) {
                    showToast('ลบสมาชิกสำเร็จ');
                    loadMembers();
                } else {
                    showToast(result.message || 'ไม่สามารถลบสมาชิกได้', 'error');
                }
            } catch (error) {
                console.error('Error deleting member:', error);
                showToast('เกิดข้อผิดพลาดในการลบสมาชิก', 'error');
            }
        });
    };

    // ==========================================
    // INITIAL APP LOAD (เรียกข้อมูลครั้งแรก)
    // ==========================================
    // ตรวจสอบ authentication ก่อนโหลดข้อมูล
    const token = localStorage.getItem('silmin_token');
    const user = JSON.parse(localStorage.getItem('silmin_user') || '{}');

    if (!token) {
        // ไม่มี token - แสดงหน้า login และไม่โหลดข้อมูลใดๆ
        console.log('[SILMIN] ไม่พบ token - แสดงหน้า login');
        const mainLayout = document.getElementById('main-layout');
        const loginScreen = document.getElementById('login-screen');

        if (mainLayout) {
            mainLayout.classList.remove('opacity-100');
            mainLayout.classList.add('opacity-0', 'hidden');
        }
        if (loginScreen) {
            loginScreen.classList.remove('hidden', 'opacity-0');
        }
    } else {
        // มี token - แสดง main layout และโหลดข้อมูล
        console.log('[SILMIN] พบ token - โหลดข้อมูลแอปพลิเคชัน');

        const mainLayout = document.getElementById('main-layout');
        const loginScreen = document.getElementById('login-screen');

        if (mainLayout) {
            mainLayout.classList.remove('hidden', 'opacity-0');
            mainLayout.classList.add('opacity-100');
        }
        if (loginScreen) {
            loginScreen.classList.add('hidden', 'opacity-0');
        }

        // Update top bar และ permissions
        updateTopBar(user);
        applyPermissions(user.permissions);

        // แสดง dashboard โดย default
        switchView('dashboard');

        // เรียกใช้ฟังก์ชันดึงข้อมูลทั้งหมด
        fetchMasterData();
        fetchProducts();
        loadBranches();
        loadEmployees();
        loadDashboardData();
        fetchPosProducts();
        loadRoles();
        startPendingTransferPolling();

        console.log('[SILMIN] ระบบเริ่มต้นสำเร็จและโหลดข้อมูลครบถ้วน');
    }

    // ==========================================
    // WARRANTY CHECK LOGIC
    // ==========================================

    const warrantySearchForm = document.getElementById('warranty-search-form');
    const warrantySearchInput = document.getElementById('warranty-search-input');
    const warrantyResultsContainer = document.getElementById('warranty-results-container');
    const warrantyEmptyState = document.getElementById('warranty-empty-state');

    const calculateRemainingDays = (expiryDate) => {
        const now = new Date();
        const exp = new Date(expiryDate);
        const diffTime = exp.getTime() - now.getTime();
        return Math.ceil(diffTime / (1000 * 60 * 60 * 24));
    };

    const renderWarrantyResults = (results) => {
        if (!warrantyResultsContainer) return;

        warrantyResultsContainer.innerHTML = '';

        if (!results || results.length === 0) {
            warrantyResultsContainer.innerHTML = `
                <div class="flex flex-col items-center justify-center py-12 text-slate-500">
                    <i class="fa-solid fa-box-open text-5xl mb-4 text-slate-600 opacity-50"></i>
                    <p class="font-medium text-lg">ไม่พบข้อมูลการรับประกัน</p>
                    <p class="text-sm mt-1">กรุณาตรวจสอบ IMEI หรือชื่อลูกค้าอีกครั้ง</p>
                </div>
            `;
            return;
        }

        results.forEach(item => {
            const expDate = new Date(item.warranty_expiry);
            const remainingDays = calculateRemainingDays(item.warranty_expiry);
            const isExpired = remainingDays < 0;

            const card = document.createElement('div');
            card.className = `bg-slate-800 border ${isExpired ? 'border-red-500/30' : 'border-cyan-500/30'} rounded-2xl p-6 shadow-lg relative overflow-hidden`;

            card.innerHTML = `
                <div class="absolute top-0 right-0 w-32 h-32 ${isExpired ? 'bg-red-500/5' : 'bg-cyan-500/5'} rounded-bl-full -mr-10 -mt-10 pointer-events-none"></div>
                <div class="flex flex-col md:flex-row justify-between gap-6 relative z-10">
                    <div class="space-y-4">
                        <div>
                            <h4 class="text-xl font-bold text-white leading-tight">${item.product_name}</h4>
                            <div class="flex items-center gap-2 mt-1">
                                <span class="text-slate-400 font-mono text-sm bg-slate-800 px-2 py-0.5 rounded border border-slate-700">IMEI: ${item.imei_sold}</span>
                                <span class="text-slate-500 text-xs">เลขที่ใบเสร็จ: <a href="#" class="warranty-receipt-link text-cyan-400 hover:underline" data-id="${item.txn_id}">${item.receipt_number}</a></span>
                            </div>
                        </div>
                        <div class="flex flex-col items-start gap-1">
                            <p class="text-sm text-slate-300"><i class="fa-solid fa-user text-slate-500 mr-2"></i> ${item.member ? (item.member.first_name + ' ' + item.member.last_name) : 'ลูกค้าทั่วไป'}</p>
                            ${item.member && item.member.phone ? `<p class="text-sm text-slate-300"><i class="fa-solid fa-phone text-slate-500 mr-2"></i> ${item.member.phone}</p>` : ''}
                        </div>
                    </div>
                    <div class="flex flex-col items-end justify-center min-w-[200px]">
                        ${isExpired ? `
                            <div class="bg-red-500/20 text-red-400 px-4 py-2 rounded-xl border border-red-500/30 flex items-center gap-2 mb-3">
                                <i class="fa-solid fa-circle-xmark"></i> <span class="font-bold">หมดประกันแล้ว</span>
                            </div>
                        ` : `
                            <div class="bg-emerald-500/20 text-emerald-400 px-4 py-2 rounded-xl border border-emerald-500/30 flex items-center gap-2 mb-3">
                                <i class="fa-solid fa-shield-check"></i> <span class="font-bold">อยู่ในประกัน</span>
                            </div>
                        `}
                        <div class="text-right w-full bg-slate-900/50 p-3 rounded-xl border border-slate-700/50">
                            <div class="flex justify-between text-xs mb-1">
                                <span class="text-slate-400">วันที่ซื้อ:</span>
                                <span class="text-slate-200">${new Date(item.created_at).toLocaleDateString('th-TH')}</span>
                            </div>
                            <div class="flex justify-between text-xs mb-1">
                                <span class="text-slate-400">ระยะประกัน:</span>
                                <span class="text-slate-200">${item.warranty_period}</span>
                            </div>
                            <div class="flex justify-between text-xs font-bold mt-2 pt-2 border-t border-slate-700">
                                <span class="text-slate-400">วันหมดอายุ:</span>
                                <span class="${isExpired ? 'text-red-400' : 'text-cyan-400'}">${expDate.toLocaleDateString('th-TH')}</span>
                            </div>
                            ${!isExpired ? `<div class="text-right text-[10px] text-emerald-500 mt-1">เหลืออีก ${remainingDays} วัน</div>` : ''}
                        </div>
                    </div>
                </div>
            `;
            warrantyResultsContainer.appendChild(card);
        });

        // Attach receipt link listeners
        document.querySelectorAll('.warranty-receipt-link').forEach(link => {
            link.addEventListener('click', (e) => {
                e.preventDefault();
                const txnId = e.currentTarget.getAttribute('data-id');
                if (txnId && typeof viewTransactionDetails === 'function') {
                    viewTransactionDetails(txnId);
                }
            });
        });
    };

    const checkWarranty = async (query) => {
        if (!query) return;
        try {
            const response = await authFetch(`${API_BASE_URL}/warranty/check?q=${encodeURIComponent(query)}`);
            const result = await response.json();
            if (result.success) {
                renderWarrantyResults(result.data);
            } else {
                showToast('เกิดข้อผิดพลาดในการตรวจสอบประกัน: ' + result.message, 'error');
                renderWarrantyResults([]);
            }
        } catch (error) {
            console.error('Error checking warranty:', error);
            showToast('เชื่อมต่อเซิร์ฟเวอร์ไม่ได้', 'error');
            renderWarrantyResults([]);
        }
    };

    if (warrantySearchForm) {
        warrantySearchForm.addEventListener('submit', (e) => {
            e.preventDefault();
            const query = warrantySearchInput.value.trim();
            if (query) {
                checkWarranty(query);
            } else {
                renderWarrantyResults([]);
            }
        });
    }

    // ==========================================
    // IMPORT WORKFLOW LOGIC (Report Arrival & Approve Import)
    // ==========================================
    const btnSubmitArrival = document.getElementById('btn-submit-arrival');
    const arrivalProductName = document.getElementById('arrival-product-name');
    const arrivalTypeName = document.getElementById('arrival-type-name');
    const arrivalConditionName = document.getElementById('arrival-condition-name');
    const arrivalColorName = document.getElementById('arrival-color-name');
    const arrivalCapacityName = document.getElementById('arrival-capacity-name');
    const arrivalSupplierName = document.getElementById('arrival-supplier-name');
    const arrivalUnitName = document.getElementById('arrival-unit-name');
    const arrivalImeis = document.getElementById('arrival-imeis');
    const arrivalImeiCount = document.getElementById('arrival-imei-count');
    const arrivalNotes = document.getElementById('arrival-notes');
    const myArrivalReports = document.getElementById('my-arrival-reports');
    const importArrivalBadge = document.getElementById('import-arrival-badge');
    const approveImportBadge = document.getElementById('approve-import-badge');

    // Auto populate dropdowns when master data is loaded
    // This is handled by renderSettingsList/fetchMasterData implicitly or we can just populate here if needed
    // Assuming master data is in window.masterDataCache
    const populateArrivalDropdown = (selectId, dataArray) => {
        const select = document.getElementById(selectId);
        if (!select || !dataArray) return;
        select.innerHTML = '<option value="">-- ไม่ระบุ --</option>';
        dataArray.forEach(item => {
            select.innerHTML += `<option value="${item.name}">${item.name}</option>`;
        });
    };

    window.populateArrivalDropdowns = () => {
        if (!window.masterDataCache) return;
        populateArrivalDropdown('arrival-product-name', window.masterDataCache.productNames);
        populateArrivalDropdown('arrival-type-name', window.masterDataCache.productTypes);
        populateArrivalDropdown('arrival-condition-name', window.masterDataCache.productConditions);
        populateArrivalDropdown('arrival-color-name', window.masterDataCache.productColors);
        populateArrivalDropdown('arrival-capacity-name', window.masterDataCache.productCapacities);
        populateArrivalDropdown('arrival-supplier-name', window.masterDataCache.suppliers);
        populateArrivalDropdown('arrival-unit-name', window.masterDataCache.productUnits);
    };

    if (arrivalImeis && arrivalImeiCount) {
        arrivalImeis.addEventListener('input', () => {
            const lines = arrivalImeis.value.split('\n').filter(l => l.trim() !== '');
            arrivalImeiCount.textContent = `จำนวน: ${lines.length} IMEI`;
        });
    }

    if (btnSubmitArrival) {
        btnSubmitArrival.addEventListener('click', async () => {
            if (!arrivalProductName.value) {
                showToast('กรุณาระบุชื่อสินค้า', 'error');
                return;
            }
            try {
                btnSubmitArrival.disabled = true;
                btnSubmitArrival.innerHTML = '<i class="fa-solid fa-spinner fa-spin"></i> กำลังส่ง...';

                const payload = {
                    product_name: arrivalProductName.value,
                    type_name: arrivalTypeName.value,
                    condition_name: arrivalConditionName.value,
                    color_name: arrivalColorName.value,
                    capacity_name: arrivalCapacityName.value,
                    supplier_name: arrivalSupplierName.value,
                    unit_name: arrivalUnitName.value,
                    notes: arrivalNotes.value,
                    imeis: arrivalImeis.value
                };

                const res = await authFetch(`${API_BASE_URL}/import-notifications`, {
                    method: 'POST',
                    headers: { 'Content-Type': 'application/json' },
                    body: JSON.stringify(payload)
                });

                const data = await res.json();
                if (data.success) {
                    showToast('ส่งแจ้งของถึงสาขาเรียบร้อยแล้ว รอการอนุมัติ', 'success');
                    // Reset form
                    arrivalProductName.value = '';
                    arrivalImeis.value = '';
                    arrivalNotes.value = '';
                    if (arrivalImeiCount) arrivalImeiCount.textContent = 'จำนวน: 0 IMEI';
                    loadMyArrivalReports();
                } else {
                    showToast(data.message, 'error');
                }
            } catch (err) {
                console.error(err);
                showToast('เกิดข้อผิดพลาดในการเชื่อมต่อ', 'error');
            } finally {
                btnSubmitArrival.disabled = false;
                btnSubmitArrival.innerHTML = '<i class="fa-solid fa-paper-plane mr-2"></i> ส่งแจ้งของถึงสาขา';
            }
        });
    }

    const loadMyArrivalReports = async () => {
        if (!myArrivalReports) return;
        try {
            const user = JSON.parse(localStorage.getItem('silmin_user') || '{}');
            const res = await authFetch(`${API_BASE_URL}/import-notifications?reported_by=${user.id || user.employee_id}`);
            const data = await res.json();
            if (data.success) {
                myArrivalReports.innerHTML = '';
                if (data.data.length === 0) {
                    myArrivalReports.innerHTML = '<div class="text-center py-8 text-slate-500">ไม่มีประวัติการแจ้ง</div>';
                    return;
                }
                data.data.forEach(item => {
                    const statusColor = item.status === 'รอดำเนินการ' ? 'text-amber-400' : (item.status === 'อนุมัติแล้ว' ? 'text-emerald-400' : 'text-red-400');
                    const html = `
                        <div class="bg-slate-900/50 p-3 rounded-xl border border-slate-700/50 text-sm">
                            <div class="flex justify-between items-start mb-1">
                                <span class="font-bold text-white">${item.product_name}</span>
                                <span class="${statusColor} text-xs font-bold">${item.status}</span>
                            </div>
                            <div class="text-xs text-slate-400">IMEI: ${item.imeis.length} รายการ</div>
                            <div class="text-[10px] text-slate-500 mt-1">${new Date(item.created_at).toLocaleString('th-TH')}</div>
                        </div>
                    `;
                    myArrivalReports.innerHTML += html;
                });
            }
        } catch (err) {
            console.error(err);
        }
    };

    window.loadImportNotifications = async () => {
        const tbody = document.getElementById('approve-import-table-body');
        const filterBranch = document.getElementById('approve-import-filter-branch');
        if (!tbody) return;

        try {
            tbody.innerHTML = '<tr><td colspan="7" class="text-center py-4 text-slate-400"><i class="fa-solid fa-spinner fa-spin mr-2"></i>กำลังโหลด...</td></tr>';
            let url = `${API_BASE_URL}/import-notifications?status=รอดำเนินการ`;
            if (filterBranch && filterBranch.value) {
                url += `&branch_id=${filterBranch.value}`;
            }

            const res = await authFetch(url);
            const data = await res.json();

            if (data.success) {
                tbody.innerHTML = '';
                if (data.data.length === 0) {
                    tbody.innerHTML = '<tr><td colspan="7" class="text-center py-8 text-slate-500">ไม่มีรายการรออนุมัติ</td></tr>';
                    if (approveImportBadge) approveImportBadge.classList.add('hidden');
                    return;
                }

                if (approveImportBadge) {
                    approveImportBadge.textContent = data.data.length;
                    approveImportBadge.classList.remove('hidden');
                }

                data.data.forEach(item => {
                    const tr = document.createElement('tr');
                    tr.className = 'border-b border-slate-700/50 hover:bg-slate-700/20 transition-colors';
                    tr.innerHTML = `
                        <td class="px-6 py-4 text-sm text-slate-300">${new Date(item.created_at).toLocaleString('th-TH')}</td>
                        <td class="px-6 py-4 text-sm text-slate-300">${item.branch_id ? item.branch_id.name : '-'}</td>
                        <td class="px-6 py-4 text-sm text-slate-300">${item.reported_by ? item.reported_by.name : '-'}</td>
                        <td class="px-6 py-4 text-sm font-medium text-white">${item.product_name}</td>
                        <td class="px-6 py-4 text-sm text-cyan-400 font-mono">${item.imeis.length}</td>
                        <td class="px-6 py-4 text-sm text-slate-400">${item.notes || '-'}</td>
                        <td class="px-6 py-4 text-sm text-right">
                            <button onclick="approveImport('${item._id}')" class="px-3 py-1.5 bg-emerald-500/20 text-emerald-400 hover:bg-emerald-500/30 rounded-lg text-xs font-medium transition-colors">
                                <i class="fa-solid fa-check mr-1"></i> อนุมัติ
                            </button>
                        </td>
                    `;
                    tbody.appendChild(tr);
                });
            }
        } catch (err) {
            console.error(err);
            tbody.innerHTML = '<tr><td colspan="7" class="text-center py-4 text-red-400">เกิดข้อผิดพลาดในการโหลดข้อมูล</td></tr>';
        }
    };

    window.approveImport = async (id) => {
        if (!confirm('ยืนยันการนำเข้าสต็อกและอนุมัติรายการนี้?')) return;
        try {
            const res = await authFetch(`${API_BASE_URL}/import-notifications/${id}/approve`, {
                method: 'POST'
            });
            const data = await res.json();
            if (data.success) {
                showToast('อนุมัตินำเข้าสต็อกสำเร็จ', 'success');
                window.loadImportNotifications();
                if (typeof loadDashboardData === 'function') loadDashboardData();
            } else {
                showToast(data.message, 'error');
            }
        } catch (err) {
            console.error(err);
            showToast('เกิดข้อผิดพลาด', 'error');
        }
    };

    // Initialize triggers
    const navReportBtn = document.getElementById('nav-report-arrival');
    if (navReportBtn) {
        navReportBtn.addEventListener('click', () => {
            window.populateArrivalDropdowns();
            loadMyArrivalReports();
        });
    }

    const filterBranch = document.getElementById('approve-import-filter-branch');
    if (filterBranch) {
        filterBranch.addEventListener('change', () => {
            if (typeof window.loadImportNotifications === 'function') {
                window.loadImportNotifications();
            }
        });
    }

    // ==========================================
    // Branch Inventory Logic (สินค้าในสาขา)
    // ==========================================
    let isBranchInventoryInitialized = false;

    window.initBranchInventory = () => {
        if (!isBranchInventoryInitialized) {
            // Setup Tabs
            const tabMyStock = document.getElementById('tab-branch-mystock');
            const tabGlobalStock = document.getElementById('tab-branch-globalstock');
            const contentMyStock = document.getElementById('content-branch-mystock');
            const contentGlobalStock = document.getElementById('content-branch-globalstock');

            const activateTab = (activeTab, inactiveTab, activeContent, inactiveContent) => {
                activeTab.classList.add('text-emerald-400', 'border-b-2', 'border-emerald-400', 'bg-emerald-500/10');
                activeTab.classList.remove('text-slate-400', 'border-transparent');

                inactiveTab.classList.remove('text-emerald-400', 'border-b-2', 'border-emerald-400', 'bg-emerald-500/10');
                inactiveTab.classList.add('text-slate-400', 'border-transparent');

                activeContent.classList.remove('hidden');
                inactiveContent.classList.add('hidden');
            };

            if (tabMyStock && tabGlobalStock) {
                tabMyStock.addEventListener('click', () => {
                    activateTab(tabMyStock, tabGlobalStock, contentMyStock, contentGlobalStock);
                    loadBranchInventoryMyStock();
                });
                tabGlobalStock.addEventListener('click', () => {
                    activateTab(tabGlobalStock, tabMyStock, contentGlobalStock, contentMyStock);
                    loadBranchInventoryGlobalStock();
                });
            }

            // Bind Refresh Buttons
            document.getElementById('btn-refresh-mystock')?.addEventListener('click', loadBranchInventoryMyStock);
            document.getElementById('btn-refresh-globalstock')?.addEventListener('click', loadBranchInventoryGlobalStock);

            // Populate Type Filters from master data
            const md = window.masterDataCache || {};
            const populateTypeFilter = (filterId) => {
                const filter = document.getElementById(filterId);
                if (filter && md.productTypes) {
                    filter.innerHTML = '<option value="ALL">ประเภททั้งหมด</option>';
                    md.productTypes.forEach(type => {
                        filter.innerHTML += `<option value="${type.name}">${type.name}</option>`;
                    });
                }
            };
            populateTypeFilter('filter-branch-mystock-type');
            populateTypeFilter('filter-branch-globalstock-type');

            // Bind Type Filters
            document.getElementById('filter-branch-mystock-type')?.addEventListener('change', loadBranchInventoryMyStock);
            document.getElementById('filter-branch-globalstock-type')?.addEventListener('change', loadBranchInventoryGlobalStock);

            // Bind Condition Filters
            document.getElementById('filter-branch-mystock-condition')?.addEventListener('change', loadBranchInventoryMyStock);
            document.getElementById('filter-branch-globalstock-condition')?.addEventListener('change', loadBranchInventoryGlobalStock);

            // Bind Search
            document.getElementById('search-branch-mystock')?.addEventListener('input', (e) => {
                const term = e.target.value.toLowerCase().trim();
                const tbody = document.getElementById('table-body-branch-mystock');
                if (!tbody) return;

                const allRows = Array.from(tbody.children);

                if (term === '') {
                    allRows.forEach(row => {
                        row.style.display = '';
                        if (row.classList.contains('name-row')) {
                            const icon = row.querySelector('i.fa-solid');
                            if (icon) icon.classList.replace('fa-chevron-down', 'fa-chevron-right');
                        } else {
                            row.classList.add('hidden');
                            if (row.classList.contains('color-row')) {
                                const icon = row.querySelector('i.fa-solid');
                                if (icon) icon.classList.replace('fa-chevron-down', 'fa-chevron-right');
                            }
                        }
                    });
                    return;
                }

                allRows.forEach(row => {
                    row.style.display = 'none';
                    row.classList.remove('match-row');
                });

                const parentsToShow = new Set();

                allRows.forEach(row => {
                    if (row.textContent.toLowerCase().includes(term)) {
                        row.style.display = '';
                        row.classList.remove('hidden');
                        row.classList.add('match-row');

                        row.classList.forEach(cls => {
                            if (cls.startsWith('child-of-')) {
                                parentsToShow.add(cls.replace('child-of-', ''));
                            }
                        });
                    }
                });

                allRows.forEach(row => {
                    parentsToShow.forEach(parentId => {
                        if (row.classList.contains(parentId)) {
                            row.style.display = '';
                            row.classList.remove('hidden');
                            const icon = row.querySelector('i.fa-solid');
                            if (icon && icon.classList.contains('fa-chevron-right')) {
                                icon.classList.replace('fa-chevron-right', 'fa-chevron-down');
                            }
                        }
                    });
                });
            });

            document.getElementById('search-branch-globalstock')?.addEventListener('input', (e) => {
                const term = e.target.value.toLowerCase().trim();
                const tbody = document.getElementById('table-body-branch-globalstock');
                if (!tbody) return;

                const allRows = Array.from(tbody.children);

                if (term === '') {
                    allRows.forEach(row => {
                        row.style.display = '';
                        if (row.classList.contains('name-row')) {
                            const icon = row.querySelector('i.fa-solid');
                            if (icon) icon.classList.replace('fa-chevron-down', 'fa-chevron-right');
                        } else {
                            row.classList.add('hidden');
                            if (row.classList.contains('branch-row')) {
                                const icon = row.querySelector('i.fa-solid');
                                if (icon) icon.classList.replace('fa-chevron-down', 'fa-chevron-right');
                            }
                        }
                    });
                    return;
                }

                allRows.forEach(row => {
                    row.style.display = 'none';
                    row.classList.remove('match-row');
                });

                const parentsToShow = new Set();

                allRows.forEach(row => {
                    if (row.textContent.toLowerCase().includes(term)) {
                        row.style.display = '';
                        row.classList.remove('hidden');
                        row.classList.add('match-row');

                        row.classList.forEach(cls => {
                            if (cls.startsWith('child-of-')) {
                                parentsToShow.add(cls.replace('child-of-', ''));
                            }
                        });
                    }
                });

                allRows.forEach(row => {
                    parentsToShow.forEach(parentId => {
                        if (row.classList.contains(parentId)) {
                            row.style.display = '';
                            row.classList.remove('hidden');
                            const icon = row.querySelector('i.fa-solid');
                            if (icon && icon.classList.contains('fa-chevron-right')) {
                                icon.classList.replace('fa-chevron-right', 'fa-chevron-down');
                            }
                        }
                    });
                });
            });

            isBranchInventoryInitialized = true;
        }

        // Default load My Stock
        loadBranchInventoryMyStock();
    };

    window.loadBranchInventoryMyStock = async () => {
        const tbody = document.getElementById('table-body-branch-mystock');
        if (!tbody) return;
        tbody.innerHTML = '<tr><td colspan="5" class="text-center py-8"><div class="inline-block animate-spin rounded-full h-6 w-6 border-b-2 border-emerald-400"></div></td></tr>';

        try {
            const res = await authFetch(`${API_BASE_URL}/products`); // Normal endpoint defaults to current branch
            const data = await res.json();
            if (data.success) {
                tbody.innerHTML = '';
                // Filter only items with > 0 quantity
                let items = data.data.filter(p => Number(p.quantity || 0) > 0);

                // Apply type filter (ประเภทสินค้า)
                const typeFilter = document.getElementById('filter-branch-mystock-type')?.value || 'ALL';
                if (typeFilter !== 'ALL') {
                    items = items.filter(p => {
                        const typeName = p.type_id ? p.type_id.name : '';
                        return typeName === typeFilter;
                    });
                }

                // Apply condition filter (สภาพเครื่อง)
                const condFilter = document.getElementById('filter-branch-mystock-condition')?.value || 'ALL';
                if (condFilter !== 'ALL') {
                    items = items.filter(p => {
                        const condName = p.condition_id ? p.condition_id.name : '';
                        return condName.replace(/\s+/g, '') === condFilter.replace(/\s+/g, '');
                    });
                }

                if (items.length === 0) {
                    tbody.innerHTML = '<tr><td colspan="5" class="text-center py-6 text-slate-400">ไม่พบสินค้าคงเหลือในสาขาของคุณ</td></tr>';
                    return;
                }

                const groupedData = {};

                items.forEach(p => {
                    const imeiCount = (p.imeis && p.imeis.length) ? p.imeis.length : 0;
                    const qty = imeiCount > 0 ? imeiCount : (p.quantity || 0);

                    if (qty <= 0) return;

                    const name = p.name || 'ไม่ระบุชื่อ';
                    const color = (p.color_id && p.color_id.name) ? p.color_id.name : 'ไม่ระบุสี';
                    const unit = (p.unit_id && p.unit_id.name) ? p.unit_id.name : 'ชิ้น';

                    if (!groupedData[name]) groupedData[name] = { total: 0, colors: {}, unit: unit };
                    groupedData[name].total += qty;
                    groupedData[name].unit = unit;

                    if (!groupedData[name].colors[color]) groupedData[name].colors[color] = { total: 0, items: [], unit: unit };
                    groupedData[name].colors[color].total += qty;
                    groupedData[name].colors[color].unit = unit;

                    groupedData[name].colors[color].items.push({
                        ...p,
                        qtyToDisplay: qty,
                        unit: unit
                    });
                });

                let nameIndex = 0;
                for (const [name, nameGroup] of Object.entries(groupedData)) {
                    nameIndex++;
                    const nameRowId = `mystock-group-${nameIndex}`;

                    const trName = document.createElement('tr');
                    trName.className = `name-row ${nameRowId} bg-slate-800/80 hover:bg-slate-700/50 transition-colors cursor-pointer border-l-4 border-emerald-500`;
                    trName.onclick = () => {
                        const icon = document.getElementById(`icon-${nameRowId}`);
                        const isExpanded = icon.classList.contains('fa-chevron-down');

                        if (isExpanded) {
                            icon.classList.remove('fa-chevron-down');
                            icon.classList.add('fa-chevron-right');
                            document.querySelectorAll(`.child-of-${nameRowId}`).forEach(c => {
                                c.classList.add('hidden');
                            });
                            document.querySelectorAll(`.color-icon-of-${nameRowId}`).forEach(i => {
                                i.classList.remove('fa-chevron-down');
                                i.classList.add('fa-chevron-right');
                            });
                        } else {
                            icon.classList.remove('fa-chevron-right');
                            icon.classList.add('fa-chevron-down');
                            document.querySelectorAll(`.level2-of-${nameRowId}`).forEach(c => c.classList.remove('hidden'));
                        }
                    };
                    trName.innerHTML = `
                        <td class="px-6 py-4">
                            <div class="flex items-center gap-3">
                                <i id="icon-${nameRowId}" class="fa-solid fa-chevron-right text-emerald-400 w-4 text-center"></i>
                                <span class="font-bold text-white text-base">${name}</span>
                            </div>
                        </td>
                        <td class="px-6 py-4 text-center">
                            <span class="bg-emerald-500/20 text-emerald-400 border border-emerald-500/30 px-3 py-1 rounded-full font-bold text-sm">
                                ${nameGroup.total} ${nameGroup.unit || 'ชิ้น'}
                            </span>
                        </td>
                        <td class="px-6 py-4 text-right"></td>
                    `;
                    tbody.appendChild(trName);

                    let colorIndex = 0;
                    for (const [color, colorGroup] of Object.entries(nameGroup.colors)) {
                        colorIndex++;
                        const colorRowId = `${nameRowId}-color-${colorIndex}`;

                        const trColor = document.createElement('tr');
                        trColor.className = `color-row ${colorRowId} hidden child-of-${nameRowId} level2-of-${nameRowId} bg-slate-800/40 hover:bg-slate-700/30 transition-colors cursor-pointer border-l-4 border-slate-600`;
                        trColor.onclick = (e) => {
                            e.stopPropagation();
                            const icon = document.getElementById(`icon-${colorRowId}`);
                            const isExpanded = icon.classList.contains('fa-chevron-down');

                            const itemsLevel = document.querySelectorAll(`.child-of-${colorRowId}`);
                            if (isExpanded) {
                                icon.classList.remove('fa-chevron-down');
                                icon.classList.add('fa-chevron-right');
                                itemsLevel.forEach(c => c.classList.add('hidden'));
                            } else {
                                icon.classList.remove('fa-chevron-right');
                                icon.classList.add('fa-chevron-down');
                                itemsLevel.forEach(c => c.classList.remove('hidden'));
                            }
                        };
                        trColor.innerHTML = `
                            <td class="px-6 py-3 pl-12">
                                <div class="flex items-center gap-2">
                                    <i id="icon-${colorRowId}" class="fa-solid fa-chevron-right text-slate-400 w-4 text-center text-xs color-icon-of-${nameRowId}"></i>
                                    <span class="font-bold text-slate-200 text-sm">สี: ${color}</span>
                                </div>
                            </td>
                            <td class="px-6 py-3 text-center">
                                <span class="text-slate-300 font-bold text-sm">${colorGroup.total} ${colorGroup.unit || 'ชิ้น'}</span>
                            </td>
                            <td class="px-6 py-3"></td>
                        `;
                        tbody.appendChild(trColor);

                        colorGroup.items.forEach(p => {
                            const capacity = (p.capacity_id && p.capacity_id.name) ? p.capacity_id.name : 'ไม่ระบุความจุ';
                            const condition = (p.condition_id && p.condition_id.name) ? p.condition_id.name : '';
                            const trItem = document.createElement('tr');
                            trItem.className = `item-row hidden child-of-${nameRowId} child-of-${colorRowId} hover:bg-slate-700/20 transition-colors border-l-4 border-slate-700`;
                            trItem.innerHTML = `
                                <td class="px-6 py-3 pl-20">
                                    <div class="flex flex-col">
                                        <span class="text-sm text-slate-300">ความจุ: <span class="font-bold text-white">${capacity}</span> ${condition ? `/ ${condition}` : ''}</span>
                                        <span class="text-xs text-slate-500 font-mono mt-0.5">รหัส: ${p.product_code || '-'}</span>
                                    </div>
                                </td>
                                <td class="px-6 py-3 text-center">
                                    <span class="text-sm text-emerald-400 font-bold">${p.qtyToDisplay} ${p.unit || 'ชิ้น'}</span>
                                    ${p.is_transferring ? '<span class="text-[10px] bg-amber-500/20 text-amber-400 px-1 rounded ml-1 mt-1 block">กำลังโอน</span>' : ''}
                                </td>
                                <td class="px-6 py-3 text-right">
                                    <span class="text-sm text-cyan-400 font-mono font-bold">฿${(p.selling_price || 0).toLocaleString()}</span>
                                </td>
                            `;
                            tbody.appendChild(trItem);
                        });
                    }
                }
            }
        } catch (err) {
            console.error(err);
            tbody.innerHTML = '<tr><td colspan="5" class="text-center py-4 text-red-400">เกิดข้อผิดพลาดในการโหลดข้อมูล</td></tr>';
        }
    };

    window.loadBranchInventoryGlobalStock = async () => {
        const tbody = document.getElementById('table-body-branch-globalstock');
        if (!tbody) return;
        tbody.innerHTML = '<tr><td colspan="4" class="text-center py-8"><div class="inline-block animate-spin rounded-full h-6 w-6 border-b-2 border-emerald-400"></div></td></tr>';

        try {
            const res = await authFetch(`${API_BASE_URL}/products/global-stock`);
            const data = await res.json();
            if (data.success) {
                tbody.innerHTML = '';
                let items = data.data.filter(p => Number(p.global_total_quantity || 0) > 0);

                // Apply type filter (ประเภทสินค้า)
                const typeFilter = document.getElementById('filter-branch-globalstock-type')?.value || 'ALL';
                if (typeFilter !== 'ALL') {
                    items = items.filter(p => {
                        const typeName = p.type_id ? p.type_id.name : '';
                        return typeName === typeFilter;
                    });
                }

                // Apply condition filter (สภาพเครื่อง)
                const condFilter = document.getElementById('filter-branch-globalstock-condition')?.value || 'ALL';
                if (condFilter !== 'ALL') {
                    items = items.filter(p => {
                        const condName = p.condition_id ? p.condition_id.name : '';
                        return condName.replace(/\s+/g, '') === condFilter.replace(/\s+/g, '');
                    });
                }

                if (items.length === 0) {
                    tbody.innerHTML = '<tr><td colspan="4" class="text-center py-6 text-slate-400">ไม่พบข้อมูลสินค้าในระบบ</td></tr>';
                    return;
                }

                const groupedData = {};

                items.forEach(p => {
                    const name = p.name || 'ไม่ระบุชื่อ';
                    const unit = (p.unit_id && p.unit_id.name) ? p.unit_id.name : 'ชิ้น';
                    if (!groupedData[name]) groupedData[name] = { total: 0, branches: {}, unit: unit };
                    groupedData[name].unit = unit;

                    if (p.stock_balances && p.stock_balances.length > 0) {
                        p.stock_balances.forEach(b => {
                            const bQty = (b.imeis && b.imeis.length > 0) ? b.imeis.length : (b.quantity || 0);
                            if (bQty > 0) {
                                groupedData[name].total += bQty;
                                const bName = b.branch_id ? (b.branch_id.name || 'ไม่ทราบสาขา') : 'ไม่ทราบสาขา';
                                if (!groupedData[name].branches[bName]) groupedData[name].branches[bName] = { total: 0, items: [], unit: unit };
                                groupedData[name].branches[bName].total += bQty;
                                groupedData[name].branches[bName].unit = unit;
                                groupedData[name].branches[bName].items.push({
                                    ...p,
                                    qtyToDisplay: bQty,
                                    branchImeis: b.imeis || [],
                                    unit: unit
                                });
                            }
                        });
                    }
                });

                let nameIndex = 0;
                for (const [name, nameGroup] of Object.entries(groupedData)) {
                    // Skip if totally out of stock
                    if (nameGroup.total <= 0) continue;

                    nameIndex++;
                    const nameRowId = `globalstock-group-${nameIndex}`;

                    const trName = document.createElement('tr');
                    trName.className = `name-row ${nameRowId} bg-slate-800/80 hover:bg-slate-700/50 transition-colors cursor-pointer border-l-4 border-cyan-500`;
                    trName.onclick = () => {
                        const icon = document.getElementById(`icon-${nameRowId}`);
                        const isExpanded = icon.classList.contains('fa-chevron-down');

                        if (isExpanded) {
                            icon.classList.remove('fa-chevron-down');
                            icon.classList.add('fa-chevron-right');
                            document.querySelectorAll(`.child-of-${nameRowId}`).forEach(c => c.classList.add('hidden'));
                            document.querySelectorAll(`.branch-icon-of-${nameRowId}`).forEach(i => {
                                i.classList.remove('fa-chevron-down');
                                i.classList.add('fa-chevron-right');
                            });
                        } else {
                            icon.classList.remove('fa-chevron-right');
                            icon.classList.add('fa-chevron-down');
                            document.querySelectorAll(`.level2-of-${nameRowId}`).forEach(c => c.classList.remove('hidden'));
                        }
                    };
                    trName.innerHTML = `
                        <td class="px-6 py-4">
                            <div class="flex items-center gap-3">
                                <i id="icon-${nameRowId}" class="fa-solid fa-chevron-right text-cyan-400 w-4 text-center"></i>
                                <span class="font-bold text-white text-base">${name}</span>
                            </div>
                        </td>
                        <td class="px-6 py-4 text-center">
                            <span class="bg-cyan-500/20 text-cyan-400 border border-cyan-500/30 px-3 py-1 rounded-full font-bold text-sm">
                                ${nameGroup.total} ${nameGroup.unit || 'ชิ้น'}
                            </span>
                        </td>
                        <td class="px-6 py-4 text-right"></td>
                    `;
                    tbody.appendChild(trName);

                    let branchIndex = 0;
                    for (const [branchName, branchGroup] of Object.entries(nameGroup.branches)) {
                        branchIndex++;
                        const branchRowId = `${nameRowId}-branch-${branchIndex}`;

                        const trBranch = document.createElement('tr');
                        trBranch.className = `branch-row ${branchRowId} hidden child-of-${nameRowId} level2-of-${nameRowId} bg-slate-800/40 hover:bg-slate-700/30 transition-colors cursor-pointer border-l-4 border-slate-600`;
                        trBranch.onclick = (e) => {
                            e.stopPropagation();
                            const icon = document.getElementById(`icon-${branchRowId}`);
                            const isExpanded = icon.classList.contains('fa-chevron-down');

                            const itemsLevel = document.querySelectorAll(`.child-of-${branchRowId}`);
                            if (isExpanded) {
                                icon.classList.remove('fa-chevron-down');
                                icon.classList.add('fa-chevron-right');
                                itemsLevel.forEach(c => c.classList.add('hidden'));
                            } else {
                                icon.classList.remove('fa-chevron-right');
                                icon.classList.add('fa-chevron-down');
                                itemsLevel.forEach(c => c.classList.remove('hidden'));
                            }
                        };
                        trBranch.innerHTML = `
                            <td class="px-6 py-3 pl-12">
                                <div class="flex items-center gap-2">
                                    <i id="icon-${branchRowId}" class="fa-solid fa-chevron-right text-slate-400 w-4 text-center text-xs branch-icon-of-${nameRowId}"></i>
                                    <span class="font-bold text-slate-200 text-sm"><i class="fa-solid fa-store text-emerald-400 mr-1"></i> สาขา: ${branchName}</span>
                                </div>
                            </td>
                            <td class="px-6 py-3 text-center">
                                <span class="text-slate-300 font-bold text-sm">${branchGroup.total} ${branchGroup.unit || 'ชิ้น'}</span>
                            </td>
                            <td class="px-6 py-3"></td>
                        `;
                        tbody.appendChild(trBranch);

                        branchGroup.items.forEach(p => {
                            const capacity = (p.capacity_id && p.capacity_id.name) ? p.capacity_id.name : 'ไม่ระบุความจุ';
                            const color = (p.color_id && p.color_id.name) ? p.color_id.name : 'ไม่ระบุสี';
                            const condition = (p.condition_id && p.condition_id.name) ? p.condition_id.name : '';

                            let imeiDisplay = '';
                            if (p.branchImeis && p.branchImeis.length > 0) {
                                imeiDisplay = `<div class="mt-1 flex flex-wrap gap-1 text-[10px] text-slate-400">IMEI: ${p.branchImeis.map(i => `<span class="bg-slate-700/50 px-1 rounded border border-slate-600">${i}</span>`).join('')}</div>`;
                            }

                            const trItem = document.createElement('tr');
                            trItem.className = `item-row hidden child-of-${nameRowId} child-of-${branchRowId} hover:bg-slate-700/20 transition-colors border-l-4 border-slate-700`;
                            trItem.innerHTML = `
                                <td class="px-6 py-3 pl-20">
                                    <div class="flex flex-col">
                                        <span class="text-sm text-slate-300">สี: <span class="font-bold text-white">${color}</span> / ความจุ: <span class="font-bold text-white">${capacity}</span> ${condition ? `/ ${condition}` : ''}</span>
                                        <span class="text-xs text-slate-500 font-mono mt-0.5">รหัส: ${p.product_code || '-'}</span>
                                        ${imeiDisplay}
                                    </div>
                                </td>
                                <td class="px-6 py-3 text-center">
                                    <span class="text-sm text-cyan-400 font-bold">${p.qtyToDisplay} ${p.unit || 'ชิ้น'}</span>
                                </td>
                                <td class="px-6 py-3 text-right">
                                    <span class="text-sm text-cyan-400 font-mono font-bold">฿${(p.selling_price || 0).toLocaleString()}</span>
                                </td>
                            `;
                            tbody.appendChild(trItem);
                        });
                    }
                }
            }
        } catch (err) {
            console.error(err);
            tbody.innerHTML = '<tr><td colspan="4" class="text-center py-4 text-red-400">เกิดข้อผิดพลาดในการโหลดข้อมูล</td></tr>';
        }
    };

    // ==========================================
    // PO System Logic (ระบบสั่งซื้อและรับสินค้า)
    // ==========================================

    let poItemCount = 0;

    const calculatePOTotal = () => {
        const rows = document.querySelectorAll('.po-item-row');
        let totalItems = rows.length;
        let totalQty = 0;
        let grandTotal = 0;

        rows.forEach(row => {
            const qty = Number(row.querySelector('[name="po_item_qty"]').value) || 0;
            const cost = Number(row.querySelector('[name="po_item_cost"]').value) || 0;
            totalQty += qty;
            grandTotal += (qty * cost);
        });

        const elTotalItems = document.getElementById('po-total-items');
        const elTotalQty = document.getElementById('po-total-qty');
        const elGrandTotal = document.getElementById('po-grand-total');

        if (elTotalItems) elTotalItems.textContent = totalItems.toLocaleString();
        if (elTotalQty) elTotalQty.textContent = totalQty.toLocaleString();
        if (elGrandTotal) elGrandTotal.textContent = '฿' + grandTotal.toLocaleString();
    };

    // Note: window.initAccountingPO has been consolidated below to prevent duplicate declarations and overwriting issues.

    const addPoItemRow = () => {
        poItemCount++;
        const id = poItemCount;
        const container = document.getElementById('po-items-container');

        const row = document.createElement('div');
        row.className = 'p-5 bg-[#151515] border border-gray-800 rounded-xl relative po-item-row shadow-sm hover:border-cyan-500/30 transition-colors group';
        row.innerHTML = `
            <button type="button" class="absolute -top-3 -right-3 w-8 h-8 rounded-full bg-slate-800 border border-slate-700 text-slate-400 hover:text-white hover:bg-red-500 flex items-center justify-center shadow-lg transition-all opacity-0 group-hover:opacity-100 z-10" onclick="this.closest('.po-item-row').remove(); calculatePOTotal();"><i class="fa-solid fa-trash text-xs"></i></button>
            <div class="grid grid-cols-1 md:grid-cols-4 gap-4 mb-4">
                <div class="md:col-span-2">
                    <label class="text-[10px] font-bold text-slate-400 uppercase tracking-wide">ชื่อสินค้า <span class="text-red-400">*</span></label>
                    <input type="text" name="po_item_name" list="dl-product-names" required placeholder="ค้นหาชื่อสินค้า..." class="w-full px-3 py-2.5 text-sm rounded-lg bg-[#2a2a2a] border border-gray-700 text-white focus:border-cyan-500 focus:ring-1 focus:ring-cyan-500 focus:outline-none placeholder-slate-500 transition-all">
                </div>
                <div>
                    <label class="text-[10px] font-bold text-slate-400 uppercase tracking-wide">รหัส/SKU</label>
                    <input type="text" name="po_item_code" list="dl-product-codes" placeholder="ว่างไว้เพื่อสุ่มรหัส" class="w-full px-3 py-2.5 text-sm rounded-lg bg-[#2a2a2a] border border-gray-700 text-white focus:border-cyan-500 focus:ring-1 focus:ring-cyan-500 focus:outline-none placeholder-slate-500 transition-all font-mono">
                </div>
                <div>
                    <label class="text-[10px] font-bold text-slate-400 uppercase tracking-wide">หมวดหมู่</label>
                    <select name="po_item_category" class="w-full px-3 py-2.5 text-sm rounded-lg bg-[#2a2a2a] border border-gray-700 text-white focus:border-cyan-500 focus:ring-1 focus:ring-cyan-500 focus:outline-none transition-all">
                        <option value="">-- เลือก --</option>
                        ${(window.masterDataCache?.productTypes || []).map(t => `<option value="${t.name}">${t.name}</option>`).join('')}
                    </select>
                </div>
            </div>
            <div class="grid grid-cols-2 md:grid-cols-6 gap-4 items-end">
                <div>
                    <label class="text-[10px] font-bold text-slate-400 uppercase tracking-wide">สี</label>
                    <input type="text" name="po_item_color" list="dl-product-colors" placeholder="สี" class="w-full px-3 py-2.5 text-sm rounded-lg bg-[#2a2a2a] border border-gray-700 text-white focus:border-cyan-500 focus:ring-1 focus:ring-cyan-500 focus:outline-none placeholder-slate-500 transition-all">
                </div>
                <div>
                    <label class="text-[10px] font-bold text-slate-400 uppercase tracking-wide">ความจุ</label>
                    <input type="text" name="po_item_capacity" list="dl-product-capacities" placeholder="ความจุ" class="w-full px-3 py-2.5 text-sm rounded-lg bg-[#2a2a2a] border border-gray-700 text-white focus:border-cyan-500 focus:ring-1 focus:ring-cyan-500 focus:outline-none placeholder-slate-500 transition-all">
                </div>
                <div>
                    <label class="text-[10px] font-bold text-slate-400 uppercase tracking-wide">หน่วยนับ <span class="text-red-400">*</span></label>
                    <select name="po_item_unit" required class="w-full px-3 py-2.5 text-sm rounded-lg bg-[#2a2a2a] border border-gray-700 text-white focus:border-cyan-500 focus:ring-1 focus:ring-cyan-500 focus:outline-none transition-all">
                        <option value="">-- เลือก --</option>
                        ${(window.masterDataCache?.productUnits || []).map(u => `<option value="${u.name}">${u.name}</option>`).join('')}
                    </select>
                </div>
                <div>
                    <label class="text-[10px] font-bold text-slate-400 uppercase tracking-wide">จำนวน <span class="text-red-400">*</span></label>
                    <input type="number" name="po_item_qty" required min="1" value="1" class="w-full px-3 py-2.5 text-sm rounded-lg bg-[#2a2a2a] border border-gray-700 text-white focus:border-cyan-500 focus:ring-1 focus:ring-cyan-500 focus:outline-none font-bold text-center transition-all">
                </div>
                <div>
                    <label class="text-[10px] font-bold text-slate-400 uppercase tracking-wide">ราคาทุน <span class="text-red-400">*</span></label>
                    <input type="number" name="po_item_cost" required min="0" placeholder="0" step="any" class="w-full px-3 py-2.5 text-sm rounded-lg bg-[#2a2a2a] border border-gray-700 text-white focus:border-cyan-500 focus:ring-1 focus:ring-cyan-500 focus:outline-none font-mono placeholder-slate-500 transition-all">
                </div>
                <div>
                    <label class="text-[10px] font-bold text-slate-400 uppercase tracking-wide">ราคาขาย <span class="text-red-400">*</span></label>
                    <input type="number" name="po_item_sell" required min="0" placeholder="0" step="any" class="w-full px-3 py-2.5 text-sm rounded-lg bg-[#2a2a2a] border border-gray-700 text-white focus:border-cyan-500 focus:ring-1 focus:ring-cyan-500 focus:outline-none font-mono placeholder-slate-500 transition-all">
                </div>
            </div>
            <div class="mt-4 pt-3 border-t border-slate-700/50 flex items-center justify-between">
                <div class="flex items-center gap-2">
                    <input type="checkbox" name="po_item_track_imei" id="track_imei_${id}" class="w-4 h-4 rounded border-gray-600 bg-slate-900 text-cyan-500 focus:ring-cyan-500 focus:ring-offset-slate-800">
                    <label for="track_imei_${id}" class="text-xs text-slate-300 cursor-pointer hover:text-white transition-colors">สินค้านี้ต้องบันทึก IMEI (เช่น โทรศัพท์/แท็บเล็ต)</label>
                </div>
                <div class="text-right text-xs text-slate-400">
                    รวม: <span class="po-row-total text-cyan-400 font-bold font-mono">฿0</span>
                </div>
            </div>
        `;
        container.appendChild(row);

        // Attach events for calculation
        const inputQty = row.querySelector('[name="po_item_qty"]');
        const inputCost = row.querySelector('[name="po_item_cost"]');
        const labelTotal = row.querySelector('.po-row-total');
        const inputCode = row.querySelector('[name="po_item_code"]');
        const inputName = row.querySelector('[name="po_item_name"]');

        const updateRowTotal = () => {
            const q = Number(inputQty.value) || 0;
            const c = Number(inputCost.value) || 0;
            labelTotal.textContent = '฿' + (q * c).toLocaleString();
            calculatePOTotal();
        };

        inputQty.addEventListener('input', updateRowTotal);
        inputCost.addEventListener('input', updateRowTotal);

        // Auto-fill logic when SKU changes
        inputCode.addEventListener('change', (e) => {
            const val = e.target.value.trim();
            if (!val || typeof allProductsCache === 'undefined') return;
            const product = allProductsCache.find(p => p.product_code === val);
            if (product) {
                const setVal = (name, val) => {
                    const el = row.querySelector(`[name="${name}"]`);
                    if (el && val !== undefined && val !== null) el.value = val;
                };
                setVal('po_item_name', product.name);
                setVal('po_item_category', product.category);
                setVal('po_item_color', product.color || '');
                setVal('po_item_capacity', product.capacity || '');
                setVal('po_item_cost', product.cost_price);
                setVal('po_item_sell', product.selling_price);

                const checkImei = row.querySelector(`[name="po_item_track_imei"]`);
                if (checkImei) checkImei.checked = !!product.track_imei;

                updateRowTotal();
            }
        });

        // Auto-fill logic when Name changes
        inputName.addEventListener('change', (e) => {
            const val = e.target.value.trim();
            if (!val) return;

            // Check if name has a code in Master Data
            if (window.masterDataCache && window.masterDataCache.productNames) {
                const matchedName = window.masterDataCache.productNames.find(x => x.name === val);
                if (matchedName && matchedName.code) {
                    const el = row.querySelector('[name="po_item_code"]');
                    if (el) el.value = matchedName.code;
                }
            }

            // Check if name matches an existing product in cache for auto-fill
            if (typeof allProductsCache !== 'undefined') {
                const product = allProductsCache.find(p => p.name === val);
                if (product) {
                    const setVal = (name, val) => {
                        const el = row.querySelector(`[name="${name}"]`);
                        if (el && val !== undefined && val !== null) el.value = val;
                    };
                    setVal('po_item_code', product.product_code);
                    setVal('po_item_category', product.category);
                    setVal('po_item_color', product.color || '');
                    setVal('po_item_capacity', product.capacity || '');
                    setVal('po_item_cost', product.cost_price);
                    setVal('po_item_sell', product.selling_price);

                    const checkImei = row.querySelector(`[name="po_item_track_imei"]`);
                    if (checkImei) checkImei.checked = !!product.track_imei;

                    updateRowTotal();
                }
            }
        });

        calculatePOTotal();
    };

    if (document.getElementById('btn-add-po-item')) {
        document.getElementById('btn-add-po-item').addEventListener('click', addPoItemRow);
    }

    if (document.getElementById('form-create-po')) {
        document.getElementById('form-create-po').addEventListener('submit', async (e) => {
            e.preventDefault();
            const supplier_name = document.getElementById('po-supplier').value;
            const branch_id = document.getElementById('po-branch').value;
            const rows = document.querySelectorAll('.po-item-row');

            if (rows.length === 0) {
                return showToast('กรุณาเพิ่มรายการสินค้าอย่างน้อย 1 รายการ', 'error');
            }

            const items = [];
            for (let row of rows) {
                let product_code = row.querySelector('[name="po_item_code"]').value.trim();
                if (!product_code) {
                    // หากไม่ได้กรอก SKU ระบบจะสุ่มรหัสให้อัตโนมัติ เพื่อนำไปใช้ติดตามสต็อกสินค้าอย่างถูกต้อง
                    product_code = 'SKU-' + Date.now().toString().slice(-6) + Math.floor(100 + Math.random() * 900);
                }
                items.push({
                    product_name: row.querySelector('[name="po_item_name"]').value,
                    product_code: product_code,
                    category: row.querySelector('[name="po_item_category"]').value,
                    color: row.querySelector('[name="po_item_color"]').value,
                    capacity: row.querySelector('[name="po_item_capacity"]').value,
                    unit: row.querySelector('[name="po_item_unit"]').value,
                    ordered_qty: Number(row.querySelector('[name="po_item_qty"]').value),
                    cost_price: Number(row.querySelector('[name="po_item_cost"]').value),
                    selling_price: Number(row.querySelector('[name="po_item_sell"]').value),
                    track_imei: row.querySelector('[name="po_item_track_imei"]').checked
                });
            }

            try {
                const res = await authFetch(`${API_BASE_URL}/purchase-orders`, {
                    method: 'POST',
                    headers: { 'Content-Type': 'application/json' },
                    body: JSON.stringify({ supplier_name, branch_id, items })
                });
                const json = await res.json();
                if (json.success) {
                    showToast('สร้างใบสั่งซื้อสำเร็จ');
                    document.getElementById('form-create-po').reset();
                    document.getElementById('po-items-container').innerHTML = '';
                    addPoItemRow();
                    loadPOHistory(); // Refresh history cache
                } else {
                    showToast(json.message, 'error');
                }
            } catch (err) {
                console.error(err);
                showToast('เกิดข้อผิดพลาด', 'error');
            }
        });
    }

    // ==========================================
    // PO History & Printing System
    // ==========================================
    let poHistoryCache = [];

    // Switch between PO tabs
    const switchPoTab = (tabName) => {
        const btnCreate = document.getElementById('tab-btn-create-po');
        const btnHistory = document.getElementById('tab-btn-po-history');
        const contentCreate = document.getElementById('tab-content-create-po');
        const contentHistory = document.getElementById('tab-content-po-history');

        if (!btnCreate || !btnHistory || !contentCreate || !contentHistory) return;

        if (tabName === 'create') {
            contentCreate.classList.remove('hidden');
            contentHistory.classList.add('hidden');

            btnCreate.className = 'px-5 py-2.5 rounded-lg text-sm font-semibold transition-all duration-200 bg-cyan-500 text-slate-900 shadow-lg shadow-cyan-500/10';
            btnHistory.className = 'px-5 py-2.5 rounded-lg text-sm font-semibold transition-all duration-200 text-slate-400 hover:text-white hover:bg-slate-800/50';
        } else {
            contentCreate.classList.add('hidden');
            contentHistory.classList.remove('hidden');

            btnHistory.className = 'px-5 py-2.5 rounded-lg text-sm font-semibold transition-all duration-200 bg-cyan-500 text-slate-900 shadow-lg shadow-cyan-500/10';
            btnCreate.className = 'px-5 py-2.5 rounded-lg text-sm font-semibold transition-all duration-200 text-slate-400 hover:text-white hover:bg-slate-800/50';

            loadPOHistory();
        }
    };

    if (document.getElementById('tab-btn-create-po')) {
        document.getElementById('tab-btn-create-po').addEventListener('click', () => switchPoTab('create'));
    }
    if (document.getElementById('tab-btn-po-history')) {
        document.getElementById('tab-btn-po-history').addEventListener('click', () => switchPoTab('history'));
    }

    if (document.getElementById('btn-refresh-po-history')) {
        document.getElementById('btn-refresh-po-history').addEventListener('click', () => loadPOHistory());
    }

    if (document.getElementById('search-po-history')) {
        document.getElementById('search-po-history').addEventListener('input', (e) => {
            const query = e.target.value.trim().toLowerCase();
            renderPOHistoryTable(query);
        });
    }

    const loadPOHistory = async () => {
        const tbody = document.getElementById('table-body-po-history');
        if (!tbody) return;
        tbody.innerHTML = '<tr><td colspan="7" class="text-center py-4"><i class="fa-solid fa-circle-notch fa-spin text-slate-500"></i></td></tr>';

        try {
            const res = await authFetch(`${API_BASE_URL}/purchase-orders`);
            const json = await res.json();
            if (json.success) {
                poHistoryCache = json.data || [];
                renderPOHistoryTable();
            } else {
                tbody.innerHTML = `<tr><td colspan="7" class="text-center py-6 text-red-400">ดึงข้อมูลไม่สำเร็จ: ${json.message}</td></tr>`;
            }
        } catch (err) {
            console.error('Error loading PO history:', err);
            tbody.innerHTML = '<tr><td colspan="7" class="text-center py-6 text-red-400">เกิดข้อผิดพลาดในการดึงข้อมูล</td></tr>';
        }
    };

    const renderPOHistoryTable = (query = '') => {
        const tbody = document.getElementById('table-body-po-history');
        if (!tbody) return;

        tbody.innerHTML = '';
        const filtered = poHistoryCache.filter(po => {
            const poNum = (po.po_number || '').toLowerCase();
            const supplier = (po.supplier_name || '').toLowerCase();
            return poNum.includes(query) || supplier.includes(query);
        });

        if (filtered.length === 0) {
            tbody.innerHTML = '<tr><td colspan="7" class="text-center py-6 text-slate-500">ไม่มีรายการใบสั่งซื้อ</td></tr>';
            return;
        }

        filtered.forEach(po => {
            const tr = document.createElement('tr');
            tr.className = 'border-b border-gray-800 hover:bg-gray-800/30 transition-colors';

            // Format date
            let dateStr = '-';
            if (po.createdAt) {
                const date = new Date(po.createdAt);
                const day = date.getDate().toString().padStart(2, '0');
                const month = (date.getMonth() + 1).toString().padStart(2, '0');
                const year = date.getFullYear() + 543; // Buddhist Era
                dateStr = `${day}/${month}/${year}`;
            }

            const branchName = (po.branch_id && po.branch_id.name) ? po.branch_id.name : '-';
            
            // Total values
            let totalAmount = 0;
            let totalQty = 0;
            if (po.items && po.items.length > 0) {
                po.items.forEach(item => {
                    totalAmount += (item.cost_price || 0) * (item.ordered_qty || 0);
                    totalQty += item.ordered_qty || 0;
                });
            }

            // Status Badge
            const statusColors = {
                'รอจัดส่ง': 'border-cyan-500/30 bg-cyan-500/10 text-cyan-400',
                'สั่งซื้อแล้ว': 'border-cyan-500/30 bg-cyan-500/10 text-cyan-400',
                'กำลังตรวจรับ': 'border-amber-500/30 bg-amber-500/10 text-amber-400',
                'รับของบางส่วน': 'border-amber-500/30 bg-amber-500/10 text-amber-400',
                'รับของครบแล้ว': 'border-emerald-500/30 bg-emerald-500/10 text-emerald-400',
                'ยกเลิก': 'border-red-500/30 bg-red-500/10 text-red-400'
            };
            const badgeClass = statusColors[po.status] || 'border-slate-700 bg-slate-800 text-slate-400';

            tr.innerHTML = `
                <td class="px-6 py-4 font-mono font-bold text-slate-300">${po.po_number || '-'}</td>
                <td class="px-6 py-4 text-slate-400 text-sm">${dateStr}</td>
                <td class="px-6 py-4 text-white font-medium">${po.supplier_name || '-'}</td>
                <td class="px-6 py-4 text-slate-400 text-sm">${branchName}</td>
                <td class="px-6 py-4 text-center">
                    <span class="inline-flex px-2.5 py-0.5 rounded-full text-xs font-semibold border ${badgeClass}">
                        ${po.status || '-'}
                    </span>
                </td>
                <td class="px-6 py-4 text-right font-mono font-bold text-cyan-400">฿${totalAmount.toLocaleString()}</td>
                <td class="px-6 py-4 text-right">
                    <button class="btn-print-po px-3.5 py-1.5 bg-slate-800 hover:bg-cyan-950/80 text-slate-300 hover:text-cyan-400 rounded-lg border border-slate-700 hover:border-cyan-800/60 transition-all flex items-center gap-1 ml-auto text-xs font-bold" title="พิมพ์ใบ PO">
                        <i class="fa-solid fa-print"></i> พิมพ์ PO
                    </button>
                </td>
            `;

            tr.querySelector('.btn-print-po').addEventListener('click', () => {
                const encodedData = encodeURIComponent(JSON.stringify(po));
                window.open(`po-print.html?data=${encodedData}`, '_blank');
            });

            tbody.appendChild(tr);
        });
    };

    window.initAccountingPO = async () => {
        // Reset view tab to create PO default
        switchPoTab('create');
        
        // Populate branches list for selection in form (in case not loaded yet)
        const poBranchEl = document.getElementById('po-branch');
        if (poBranchEl) {
            try {
                const response = await authFetch(`${API_BASE_URL}/branches`);
                const json = await response.json();
                if (json.success) {
                    setSelectOptions(poBranchEl, json.data.map(b => ({ value: String(b._id), label: b.name })), '-- เลือกสาขา --');
                }
            } catch (e) {
                console.error('Error loading branches in PO initialization:', e);
            }
        }

        // Fetch master data if not loaded yet
        await ensureMasterDataLoaded();

        const md = window.masterDataCache || {};

        // Populate Suppliers Dropdown
        const poSupplier = document.getElementById('po-supplier');
        if (poSupplier && md.suppliers) {
            poSupplier.innerHTML = '<option value="" disabled selected>-- เลือกผู้จัดจำหน่าย --</option>' +
                md.suppliers.map(x => `<option value="${x.name}">${x.name}</option>`).join('');
        }

        // Populate Datalists
        const populateDL = (id, arr) => {
            const dl = document.getElementById(id);
            if (dl && arr) {
                dl.innerHTML = arr.map(x => {
                    const val = x.name || x.product_code || x;
                    const label = (id === 'dl-product-names' && x.code) ? `(${x.code})` : '';
                    return `<option value="${val}">${label}</option>`;
                }).join('');
            }
        };

        populateDL('dl-product-names', md.productNames);
        populateDL('dl-product-colors', md.productColors);
        populateDL('dl-product-capacities', md.productCapacities);

        // Fetch products for code autocompletion (since masterDataCache might not have all product_codes easily)
        if (allProductsCache && allProductsCache.length > 0) {
            const dlCodes = document.getElementById('dl-product-codes');
            if (dlCodes) {
                dlCodes.innerHTML = allProductsCache.map(p => `<option value="${p.product_code}"></option>`).join('');
            }
        }

        const itemsContainer = document.getElementById('po-items-container');
        if (itemsContainer) {
            itemsContainer.innerHTML = '';
            poItemCount = 0;
            addPoItemRow();
            calculatePOTotal();
        }
    };

    window.initBranchReceive = async () => {
        loadPOs();
    };

    if (document.getElementById('btn-refresh-po-receive')) {
        document.getElementById('btn-refresh-po-receive').addEventListener('click', () => loadPOs());
    }

    const loadPOs = async () => {
        const tbody = document.getElementById('table-body-receive-po');
        if (!tbody) return;
        tbody.innerHTML = '<tr><td colspan="5" class="text-center py-4"><i class="fa-solid fa-circle-notch fa-spin text-slate-500"></i></td></tr>';

        try {
            const res = await authFetch(`${API_BASE_URL}/purchase-orders`);
            const json = await res.json();
            if (json.success) {
                tbody.innerHTML = '';
                if (json.data.length === 0) {
                    tbody.innerHTML = '<tr><td colspan="5" class="text-center py-6 text-slate-500">ไม่มีใบสั่งซื้อที่รอรับ</td></tr>';
                    return;
                }

                json.data.forEach(po => {
                    const statusColors = {
                        'รอจัดส่ง': 'bg-amber-500/20 text-amber-400 border-amber-500/30',
                        'กำลังตรวจรับ': 'bg-cyan-500/20 text-cyan-400 border-cyan-500/30',
                        'รับของครบแล้ว': 'bg-emerald-500/20 text-emerald-400 border-emerald-500/30',
                        'ยกเลิก': 'bg-red-500/20 text-red-400 border-red-500/30'
                    };
                    const badgeClass = statusColors[po.status] || 'bg-slate-500/20 text-slate-400 border-slate-500/30';
                    const branchName = po.branch_id ? po.branch_id.name : '-';

                    const tr = document.createElement('tr');
                    tr.className = 'border-b border-gray-800 hover:bg-gray-800/50 transition-colors';
                    tr.innerHTML = `
                        <td class="px-6 py-4">
                            <span class="text-white font-mono font-bold">${po.po_number}</span>
                            <div class="text-xs text-slate-500 mt-1">${new Date(po.createdAt).toLocaleDateString('th-TH')}</div>
                        </td>
                        <td class="px-6 py-4 text-slate-300">${po.supplier_name}</td>
                        <td class="px-6 py-4 text-slate-300">${branchName}</td>
                        <td class="px-6 py-4 text-center">
                            <span class="px-3 py-1 rounded-full text-xs font-medium border ${badgeClass}">${po.status}</span>
                        </td>
                        <td class="px-6 py-4 text-right">
                            ${po.status !== 'รับของครบแล้ว' && po.status !== 'ยกเลิก' ?
                            `<button class="btn-open-receive text-sm px-4 py-2 bg-indigo-500 hover:bg-indigo-400 text-white rounded-lg shadow-lg shadow-indigo-500/20 transition-all" data-id="${po._id}">ตรวจรับของ</button>` :
                            `<button class="btn-view-po text-sm px-4 py-2 bg-slate-700 hover:bg-slate-600 text-white rounded-lg transition-all" data-id="${po._id}">ดูข้อมูล</button>`
                        }
                        </td>
                    `;
                    tbody.appendChild(tr);

                    const btnReceive = tr.querySelector('.btn-open-receive');
                    if (btnReceive) {
                        btnReceive.addEventListener('click', () => openReceiveModal(po));
                    }
                });
            }
        } catch (e) {
            console.error(e);
            tbody.innerHTML = '<tr><td colspan="5" class="text-center py-4 text-red-400">โหลดข้อมูลล้มเหลว</td></tr>';
        }
    };

    const openReceiveModal = (po) => {
        const modal = document.getElementById('modal-po-receive');
        document.getElementById('receive-po-number').textContent = po.po_number;
        const container = document.getElementById('receive-po-items');
        container.innerHTML = '';

        window.__currentReceivePO = po._id;

        po.items.forEach(item => {
            let pendingQty = item.ordered_qty - item.received_qty;
            if (po.status === 'ของถึงสาขาแล้ว') {
                pendingQty = item.ordered_qty;
            }
            if (pendingQty <= 0) return; // Full received already

            const el = document.createElement('div');
            el.className = 'p-5 bg-[#151515] border border-gray-800 rounded-xl po-receive-row shadow-sm';
            el.dataset.itemId = item._id;
            el.dataset.trackImei = item.track_imei;

            let inputHtml = '';
            if (item.track_imei) {
                inputHtml = `
                    <div class="mt-4 space-y-3">
                        <div class="flex items-center justify-between">
                            <label class="text-xs font-bold text-slate-400 block flex items-center gap-1.5">
                                <i class="fa-solid fa-barcode text-cyan-400 text-sm"></i>
                                สแกนหรือพิมพ์ IMEI (ยิงบาร์โค้ดแล้วกด Enter)
                            </label>
                            <span class="text-xs bg-slate-800 text-slate-400 px-2.5 py-1 rounded-full font-bold">
                                สแกนแล้ว <span class="scanned-count font-mono text-cyan-400 font-black">0</span> / <span class="pending-count font-mono">${pendingQty}</span> เครื่อง
                            </span>
                        </div>
                        <input type="text" 
                            class="scan-imei-input w-full bg-[#1a1a1a] border border-gray-700 hover:border-gray-600 focus:border-cyan-500 text-lg rounded-xl px-4 py-3.5 text-white focus:outline-none focus:ring-2 focus:ring-cyan-500/20 transition-all font-mono placeholder-slate-600" 
                            placeholder="ยิงบาร์โค้ด หรือพิมพ์ IMEI ที่นี่..." 
                            autocomplete="off">
                        
                        <div class="scanned-imeis-container flex flex-wrap gap-2 min-h-[50px] p-3 bg-[#111111] border border-gray-800 rounded-xl">
                            <div class="no-imeis-placeholder text-xs text-slate-600 flex items-center justify-center w-full py-2">
                                <i class="fa-solid fa-info-circle mr-1"></i> ยังไม่มีการสแกน IMEI
                            </div>
                        </div>
                    </div>
                `;
            } else {
                const defaultQty = (po.status === 'ของถึงสาขาแล้ว') ? pendingQty : 0;
                inputHtml = `
                    <div class="mt-4 max-w-[200px]">
                        <label class="text-xs font-bold text-slate-400 mb-1.5 block">จำนวนที่รับเข้า (รอรับ ${pendingQty} ชิ้น)</label>
                        <input type="number" class="receive-qty w-full px-3 py-2.5 text-sm bg-[#2a2a2a] border border-gray-700 text-white rounded-lg focus:border-indigo-500 focus:ring-1 focus:ring-indigo-500 focus:outline-none font-bold text-center" min="0" max="${pendingQty}" value="${defaultQty}">
                    </div>
                `;
            }

            el.innerHTML = `
                <div class="flex justify-between items-start gap-4">
                    <div>
                        <h5 class="text-white font-bold text-base flex items-center gap-2">
                            <span>${item.product_name}</span>
                            <span class="text-xs text-slate-500 font-mono font-normal">(${item.product_code})</span>
                        </h5>
                        <p class="text-xs text-slate-400 mt-1">สั่ง: <span class="text-white font-bold">${item.ordered_qty}</span> | รับแล้ว: <span class="text-emerald-400 font-bold">${po.status === 'ของถึงสาขาแล้ว' ? 0 : item.received_qty}</span> | <span class="text-amber-400 font-bold">ค้างรับ: ${pendingQty}</span></p>
                    </div>
                    ${item.track_imei ? 
                        `<span class="text-xs font-semibold px-2.5 py-1 bg-indigo-500/10 text-indigo-400 border border-indigo-500/20 rounded-lg flex items-center gap-1"><i class="fa-solid fa-barcode text-xs"></i> เก็บ IMEI</span>` : 
                        `<span class="text-xs font-semibold px-2.5 py-1 bg-cyan-500/10 text-cyan-400 border border-cyan-500/20 rounded-lg flex items-center gap-1"><i class="fa-solid fa-calculator text-xs"></i> นับจำนวน</span>`
                    }
                </div>
                ${inputHtml}
            `;
            container.appendChild(el);

            if (item.track_imei) {
                const input = el.querySelector('.scan-imei-input');
                const tagsContainer = el.querySelector('.scanned-imeis-container');
                const scannedCountEl = el.querySelector('.scanned-count');
                const placeholder = el.querySelector('.no-imeis-placeholder');

                const updateScannedCount = () => {
                    const tags = tagsContainer.querySelectorAll('.imei-tag');
                    scannedCountEl.textContent = tags.length;
                    if (tags.length === 0) {
                        if (placeholder) placeholder.style.display = 'flex';
                    } else {
                        if (placeholder) placeholder.style.display = 'none';
                    }
                };

                // ถ้ามี IMEI ที่สแกนไว้จากหน้าร้าน ให้แสดงขึ้นมาเป็น Tag อัตโนมัติเพื่อให้พนักงานสต็อกตรวจสอบ
                if (Array.isArray(item.imeis_scanned) && item.imeis_scanned.length > 0) {
                    item.imeis_scanned.forEach(val => {
                        const tag = document.createElement('div');
                        tag.className = 'imei-tag inline-flex items-center gap-1.5 bg-cyan-950/80 border border-cyan-800/60 text-cyan-300 px-3 py-1.5 rounded-lg text-sm transition-all hover:bg-cyan-900/80 animate-fade-in font-mono shadow-sm';
                        tag.innerHTML = `
                            <span class="imei-tag-text font-bold tracking-wide">${val}</span>
                            <button type="button" class="btn-remove-imei text-cyan-500 hover:text-red-400 font-bold ml-0.5 focus:outline-none transition-colors text-base leading-none">&times;</button>
                        `;

                        tag.querySelector('.btn-remove-imei').addEventListener('click', () => {
                            tag.remove();
                            updateScannedCount();
                        });

                        tagsContainer.appendChild(tag);
                    });
                    updateScannedCount();
                }

                input.addEventListener('keydown', async (e) => {
                    if (e.key === 'Enter') {
                        e.preventDefault();
                        const val = input.value.trim();
                        if (!val) return;

                        // Check duplicate in current scanned list
                        const existingTags = Array.from(tagsContainer.querySelectorAll('.imei-tag-text')).map(t => t.textContent.trim());
                        if (existingTags.includes(val)) {
                            showToast('IMEI นี้ถูกสแกนในรายการนี้แล้ว', 'warning');
                            input.value = '';
                            return;
                        }

                        // Check limit
                        if (existingTags.length >= pendingQty) {
                            showToast(`สแกนครบตามจำนวนค้างรับ (${pendingQty} เครื่อง) แล้ว`, 'warning');
                            input.value = '';
                            return;
                        }

                        // Check global database existence
                        try {
                            input.disabled = true;
                            const res = await authFetch(`${API_BASE_URL}/products/check-existence?code=${encodeURIComponent(val)}`);
                            const data = await res.json();
                            input.disabled = false;
                            input.focus();

                            if (data.success && data.exists) {
                                showToast(`⚠️ รหัสสินค้า/IMEI (${val}) มีอยู่ในระบบแล้ว ไม่สามารถนำเข้าซ้ำได้`, 'error');
                                input.value = '';
                                return;
                            }
                        } catch (err) {
                            console.error('Error checking code existence:', err);
                            input.disabled = false;
                            input.focus();
                        }

                        // Add tag
                        const tag = document.createElement('div');
                        tag.className = 'imei-tag inline-flex items-center gap-1.5 bg-cyan-950/80 border border-cyan-800/60 text-cyan-300 px-3 py-1.5 rounded-lg text-sm transition-all hover:bg-cyan-900/80 animate-fade-in font-mono shadow-sm';
                        tag.innerHTML = `
                            <span class="imei-tag-text font-bold tracking-wide">${val}</span>
                            <button type="button" class="btn-remove-imei text-cyan-500 hover:text-red-400 font-bold ml-0.5 focus:outline-none transition-colors text-base leading-none">&times;</button>
                        `;

                        tag.querySelector('.btn-remove-imei').addEventListener('click', () => {
                            tag.remove();
                            updateScannedCount();
                        });

                        tagsContainer.appendChild(tag);
                        input.value = '';
                        updateScannedCount();
                    }
                });
            }
        });

        if (container.children.length === 0) {
            container.innerHTML = '<div class="text-center text-slate-400 py-6">รับสินค้าครบทุกรายการแล้ว</div>';
            document.getElementById('btn-submit-po-receive').style.display = 'none';
        } else {
            document.getElementById('btn-submit-po-receive').style.display = 'block';
        }

        modal.classList.remove('hidden');
        void modal.offsetWidth;
        modal.classList.remove('opacity-0', 'pointer-events-none');
    };

    if (document.getElementById('btn-close-po-receive')) {
        document.getElementById('btn-close-po-receive').addEventListener('click', () => {
            const modal = document.getElementById('modal-po-receive');
            modal.classList.add('opacity-0', 'pointer-events-none');
            setTimeout(() => modal.classList.add('hidden'), 300);
        });
    }

    if (document.getElementById('btn-close-po-arrival')) {
        document.getElementById('btn-close-po-arrival').addEventListener('click', () => {
            const modal = document.getElementById('modal-po-arrival');
            modal.classList.add('opacity-0', 'pointer-events-none');
            setTimeout(() => modal.classList.add('hidden'), 300);
        });
    }

    if (document.getElementById('btn-submit-po-receive')) {
        document.getElementById('btn-submit-po-receive').addEventListener('click', async () => {
            const btn = document.getElementById('btn-submit-po-receive');
            const originalText = btn.innerHTML;

            const rows = document.querySelectorAll('.po-receive-row');
            const received_items = {};
            let hasInput = false;

            rows.forEach(row => {
                const itemId = row.dataset.itemId;
                const trackImei = row.dataset.trackImei === 'true';

                if (trackImei) {
                    const imeis = Array.from(row.querySelectorAll('.imei-tag-text')).map(t => t.textContent.trim());
                    if (imeis.length > 0) {
                        received_items[itemId] = { imeis };
                        hasInput = true;
                    }
                } else {
                    const qty = Number(row.querySelector('.receive-qty').value);
                    if (qty > 0) {
                        received_items[itemId] = { qty };
                        hasInput = true;
                    }
                }
            });

            if (!hasInput) {
                return showToast('กรุณาระบุจำนวนหรือ IMEI อย่างน้อย 1 รายการ', 'error');
            }

            try {
                btn.disabled = true;
                btn.innerHTML = '<i class="fa-solid fa-circle-notch fa-spin"></i> กำลังบันทึก...';

                // In the linked PO workflow, Stock staff scans items and temporarily saves it to scan-item API,
                // which transitions the PO status to 'กำลังตรวจรับ' (Awaiting Import Approval).
                const res = await authFetch(`${API_BASE_URL}/po/${window.__currentReceivePO}/scan-item`, {
                    method: 'POST',
                    headers: { 'Content-Type': 'application/json' },
                    body: JSON.stringify({ received_items })
                });
                const json = await res.json();

                if (json.success) {
                    showToast('บันทึกความคืบหน้าการตรวจรับเรียบร้อยแล้ว (รอผู้จัดการอนุมัติเพื่อนำเข้าคลังสินค้า)', 'success');
                    document.getElementById('btn-close-po-receive').click();
                    if (typeof loadPOs === 'function') loadPOs();
                } else {
                    showToast(json.message, 'error');
                }
            } catch (err) {
                console.error(err);
                showToast('เกิดข้อผิดพลาด', 'error');
            } finally {
                btn.disabled = false;
                btn.innerHTML = originalText;
            }
        });
    }

    // ==========================================
    // Connected PO Workflow: แจ้งของถึงสาขา (Sales/Front Store)
    // ==========================================
    const loadArrivalPOs = async () => {
        const tbody = document.getElementById('table-body-arrival-po');
        if (!tbody) return;
        tbody.innerHTML = '<tr><td colspan="6" class="text-center py-6 text-slate-400"><i class="fa-solid fa-spinner fa-spin mr-2 text-green-400"></i>กำลังโหลดข้อมูลใบสั่งซื้อ...</td></tr>';

        try {
            const res = await authFetch(`${API_BASE_URL}/purchase-orders`);
            const json = await res.json();
            if (json.success) {
                tbody.innerHTML = '';
                // Filter POs heading to branch (status: 'รอจัดส่ง')
                const pendingPOs = json.data.filter(po => po.status === 'รอจัดส่ง');
                
                if (pendingPOs.length === 0) {
                    tbody.innerHTML = '<tr><td colspan="6" class="text-center py-8 text-slate-500 text-sm">ไม่มีใบสั่งซื้อที่อยู่ระหว่างจัดส่งถึงสาขานี้</td></tr>';
                    return;
                }

                pendingPOs.forEach(po => {
                    const tr = document.createElement('tr');
                    tr.className = 'border-b border-slate-700/50 hover:bg-slate-700/20 transition-colors';
                    const itemsDesc = po.items.map(item => `${item.product_name} (${item.ordered_qty} ชิ้น)`).join(', ');
                    
                    tr.innerHTML = `
                        <td class="px-6 py-4 font-mono font-bold text-white">${po.po_number}</td>
                        <td class="px-6 py-4 text-sm text-slate-350">${new Date(po.createdAt).toLocaleDateString('th-TH')}</td>
                        <td class="px-6 py-4 text-sm text-slate-300">${po.supplier_name}</td>
                        <td class="px-6 py-4 text-sm text-slate-400 max-w-[250px] truncate" title="${itemsDesc}">${itemsDesc}</td>
                        <td class="px-6 py-4 text-center">
                            <span class="px-2.5 py-1 rounded-full text-xs font-semibold bg-amber-500/10 text-amber-400 border border-amber-500/20">${po.status}</span>
                        </td>
                        <td class="px-6 py-4 text-right">
                            <button class="btn-confirm-arrival px-3 py-1.5 bg-green-500/20 text-green-400 hover:bg-green-500/30 rounded-lg text-xs font-bold transition-all inline-flex items-center gap-1" data-id="${po._id}">
                                <i class="fa-solid fa-truck-circle-check"></i> ยืนยันของถึงร้าน
                            </button>
                        </td>
                    `;
                    tbody.appendChild(tr);

                    tr.querySelector('.btn-confirm-arrival').addEventListener('click', async (e) => {
                        const poId = e.currentTarget.dataset.id;
                        const po = pendingPOs.find(p => p._id === poId);
                        if (!po) return;

                        // ตั้งค่าหัวข้อ PO Number ใน Modal
                        document.getElementById('arrival-po-number').textContent = po.po_number;

                        // เคลียร์และสร้างรายการสินค้าใน Modal
                        const container = document.getElementById('arrival-po-items');
                        container.innerHTML = '';

                        po.items.forEach(item => {
                            const card = document.createElement('div');
                            card.className = 'bg-slate-900 border border-slate-800 rounded-2xl p-4 space-y-3 po-arrival-row';
                            card.dataset.itemId = item._id;
                            card.dataset.trackImei = item.track_imei ? 'true' : 'false';
                            card.dataset.productName = item.product_name;
                            card.dataset.orderedQty = item.ordered_qty;

                            if (item.track_imei) {
                                card.innerHTML = `
                                    <div class="flex justify-between items-center border-b border-slate-800 pb-2">
                                        <span class="font-bold text-white text-base flex items-center gap-2">
                                            <i class="fa-solid fa-mobile-screen text-cyan-400"></i> ${item.product_name}
                                        </span>
                                        <span id="badge-count-${item._id}" class="text-xs font-semibold px-2 py-0.5 rounded-full bg-amber-500/10 text-amber-400 border border-amber-500/20">
                                            สแกนแล้ว 0 / ${item.ordered_qty} เครื่อง
                                        </span>
                                    </div>
                                    <div class="space-y-1.5">
                                        <label class="text-xs font-medium text-slate-400 flex items-center gap-1">
                                            <i class="fa-solid fa-barcode text-green-400 text-xs"></i> สแกนหรือระบุหมายเลข IMEI (1 รายการต่อบรรทัด)
                                        </label>
                                        <textarea id="textarea-imei-${item._id}" 
                                                  rows="4" 
                                                  class="w-full px-4 py-3 rounded-xl bg-slate-950 border border-slate-800 text-white focus:border-green-500 focus:ring-1 focus:ring-green-500 focus:outline-none transition-all font-mono placeholder-slate-700 text-sm"
                                                  placeholder="วางหรือสแกน IMEI ที่นี่...&#10;ตัวอย่าง:&#10;358901234567891&#10;358901234567892"></textarea>
                                    </div>
                                `;

                                const textarea = card.querySelector(`textarea`);
                                textarea.addEventListener('input', () => {
                                    const lines = textarea.value.split('\n').map(x => x.trim()).filter(Boolean);
                                    const count = lines.length;
                                    const badge = card.querySelector(`#badge-count-${item._id}`);
                                    if (badge) {
                                        badge.textContent = `สแกนแล้ว ${count} / ${item.ordered_qty} เครื่อง`;
                                        if (count === item.ordered_qty) {
                                            badge.className = 'text-xs font-semibold px-2 py-0.5 rounded-full bg-green-500/10 text-green-400 border border-green-500/20';
                                        } else {
                                            badge.className = 'text-xs font-semibold px-2 py-0.5 rounded-full bg-amber-500/10 text-amber-400 border border-amber-500/20';
                                        }
                                    }
                                });
                            } else {
                                card.innerHTML = `
                                    <div class="flex justify-between items-center">
                                        <span class="font-bold text-white text-base flex items-center gap-2">
                                            <i class="fa-solid fa-plug text-violet-400"></i> ${item.product_name}
                                        </span>
                                        <span class="text-xs font-semibold px-2 py-0.5 rounded-full bg-green-500/10 text-green-400 border border-green-500/20">
                                            จำนวนครบ ${item.ordered_qty} ชิ้น
                                        </span>
                                    </div>
                                    <div class="text-xs text-slate-500">
                                        สินค้าชิ้นนี้เป็นอุปกรณ์เสริม/ทั่วไป ไม่ต้องการบันทึกหมายเลข IMEI
                                    </div>
                                `;
                            }
                            container.appendChild(card);
                        });

                        // เปิดใช้งาน Modal
                        const modal = document.getElementById('modal-po-arrival');
                        modal.classList.remove('hidden');
                        void modal.offsetWidth; // Force reflow
                        modal.classList.remove('opacity-0', 'pointer-events-none');

                        // ตั้งค่าปุ่มตกลงแจ้งของถึงร้าน
                        const btnSubmit = document.getElementById('btn-submit-po-arrival');
                        btnSubmit.onclick = async () => {
                            const rows = document.querySelectorAll('.po-arrival-row');
                            const received_items = {};

                            for (let row of rows) {
                                const itemId = row.dataset.itemId;
                                const trackImei = row.dataset.trackImei === 'true';
                                const productName = row.dataset.productName;
                                const orderedQty = Number(row.dataset.orderedQty);

                                if (trackImei) {
                                    const textarea = row.querySelector('textarea');
                                    const imeis = textarea.value.split('\n').map(x => x.trim()).filter(Boolean);

                                    if (imeis.length !== orderedQty) {
                                        showToast(`กรุณากรอก IMEI สำหรับ ${productName} ให้ครบ ${orderedQty} เครื่อง (ปัจจุบันกรอก ${imeis.length})`, 'error');
                                        return;
                                    }

                                    const uniqueImeis = [...new Set(imeis)];
                                    if (uniqueImeis.length !== imeis.length) {
                                        showToast(`มีหมายเลข IMEI ซ้ำกันในรายการสินค้า ${productName}`, 'error');
                                        return;
                                    }

                                    received_items[itemId] = { imeis };
                                } else {
                                    received_items[itemId] = { qty: orderedQty };
                                }
                            }

                            try {
                                btnSubmit.disabled = true;
                                btnSubmit.innerHTML = '<i class="fa-solid fa-spinner fa-spin mr-2"></i>กำลังบันทึกข้อมูล...';

                                const res = await authFetch(`${API_BASE_URL}/po/${po._id}/report-arrival`, {
                                    method: 'POST',
                                    headers: { 'Content-Type': 'application/json' },
                                    body: JSON.stringify({ received_items })
                                });

                                const json = await res.json();
                                if (json.success) {
                                    showToast('แจ้งสถานะสินค้าถึงสาขาและบันทึก IMEI สำเร็จเรียบร้อยแล้ว!', 'success');
                                    document.getElementById('btn-close-po-arrival').click();
                                    loadArrivalPOs();
                                } else {
                                    showToast(json.message, 'error');
                                }
                            } catch (err) {
                                console.error(err);
                                showToast('เกิดข้อผิดพลาดในการบันทึกรายการ', 'error');
                            } finally {
                                btnSubmit.disabled = false;
                                btnSubmit.innerHTML = 'ยืนยันรายการและแจ้งของถึงสาขา';
                            }
                        };
                    });
                });
            }
        } catch (e) {
            console.error(e);
            tbody.innerHTML = '<tr><td colspan="6" class="text-center py-6 text-red-400">เกิดข้อผิดพลาดในการโหลดข้อมูล</td></tr>';
        }
    };

    // ==========================================
    // Connected PO Workflow: ตรวจสอบนำเข้า (Stock Manager / Approver)
    // ==========================================
    const loadApprovePOs = async () => {
        const tbody = document.getElementById('table-body-approve-po');
        const badgeCount = document.getElementById('po-approve-pending-count');
        if (!tbody) return;
        tbody.innerHTML = '<tr><td colspan="7" class="text-center py-6 text-slate-400"><i class="fa-solid fa-spinner fa-spin mr-2 text-violet-400"></i>กำลังโหลดรายการใบสั่งซื้อ...</td></tr>';

        try {
            const res = await authFetch(`${API_BASE_URL}/purchase-orders`);
            const json = await res.json();
            if (json.success) {
                tbody.innerHTML = '';
                // Filter POs awaiting finalization (status: 'กำลังตรวจรับ')
                const pendingApprovePOs = json.data.filter(po => po.status === 'กำลังตรวจรับ');

                if (badgeCount) {
                    if (pendingApprovePOs.length > 0) {
                        badgeCount.textContent = pendingApprovePOs.length;
                        badgeCount.classList.remove('hidden');
                    } else {
                        badgeCount.classList.add('hidden');
                    }
                }

                if (pendingApprovePOs.length === 0) {
                    tbody.innerHTML = '<tr><td colspan="7" class="text-center py-8 text-slate-500 text-sm">ไม่มีใบสั่งซื้อที่สแกนรออนุมัตินำเข้าคลังในขณะนี้</td></tr>';
                    return;
                }

                pendingApprovePOs.forEach(po => {
                    const tr = document.createElement('tr');
                    tr.className = 'border-b border-slate-700/50 hover:bg-slate-700/20 transition-colors';
                    const branchName = po.branch_id ? po.branch_id.name : '-';
                    
                    // Count scanned items vs total items ordered
                    let totalOrdered = 0;
                    let totalScanned = 0;
                    po.items.forEach(item => {
                        totalOrdered += item.ordered_qty;
                        totalScanned += item.received_qty || 0;
                    });

                    tr.innerHTML = `
                        <td class="px-6 py-4 font-mono font-bold text-white">${po.po_number}</td>
                        <td class="px-6 py-4 text-sm text-slate-350">${new Date(po.createdAt).toLocaleDateString('th-TH')}</td>
                        <td class="px-6 py-4 text-sm text-slate-300">${po.supplier_name}</td>
                        <td class="px-6 py-4 text-sm text-slate-300">${branchName}</td>
                        <td class="px-6 py-4 text-center text-sm font-mono font-semibold">
                            <span class="text-cyan-400 font-bold">${totalScanned}</span> <span class="text-slate-500">/</span> <span class="text-slate-400">${totalOrdered}</span>
                        </td>
                        <td class="px-6 py-4 text-right font-mono text-sm font-bold text-white">฿${(po.grand_total || 0).toLocaleString()}</td>
                        <td class="px-6 py-4 text-right">
                            <button class="btn-finalize-import px-3 py-1.5 bg-violet-500/20 text-violet-400 hover:bg-violet-500/30 rounded-lg text-xs font-bold transition-all inline-flex items-center gap-1" data-id="${po._id}">
                                <i class="fa-solid fa-clipboard-check"></i> อนุมัตินำเข้าสต็อก
                            </button>
                        </td>
                    `;
                    tbody.appendChild(tr);

                    tr.querySelector('.btn-finalize-import').addEventListener('click', async (e) => {
                        const poId = e.currentTarget.dataset.id;
                        showConfirm('ยืนยันนำเข้าสินค้า', 'ยืนยันนำเข้าสินค้าใบสั่งซื้อนี้เข้าสต็อกสาขา?', async () => {
                            try {
                                const btnFinalize = e.currentTarget;
                                btnFinalize.disabled = true;
                                btnFinalize.innerHTML = '<i class="fa-solid fa-spinner fa-spin"></i> อนุมัติ...';

                                const finalRes = await authFetch(`${API_BASE_URL}/po/${poId}/finalize-import`, {
                                    method: 'POST'
                                });
                                const finalJson = await finalRes.json();

                                if (finalJson.success) {
                                    showToast('อนุมัตินำเข้าสต็อกสำเร็จ! เพิ่มยอดสินค้าสั่งซื้อเข้าคลังสาขาเรียบร้อยแล้ว', 'success');
                                    loadApprovePOs();
                                    if (typeof fetchProducts === 'function') fetchProducts();
                                    if (typeof loadDashboardData === 'function') loadDashboardData();
                                } else {
                                    showToast(finalJson.message, 'error');
                                }
                            } catch (err) {
                                console.error(err);
                                showToast('เกิดข้อผิดพลาดในการทำรายการอนุมัติ', 'error');
                            }
                        });
                    });
                });
            }
        } catch (e) {
            console.error(e);
            tbody.innerHTML = '<tr><td colspan="7" class="text-center py-6 text-red-400">เกิดข้อผิดพลาดในการโหลดข้อมูล</td></tr>';
        }
    };

    // Tab toggle logic inside ตรวจสอบนำเข้าสินค้า (Approve Import)
    const tabBtnApprovePO = document.getElementById('tab-btn-approve-po');
    const tabBtnApproveNonPO = document.getElementById('tab-btn-approve-nonpo');
    const tabContentApprovePO = document.getElementById('tab-content-approve-po');
    const tabContentApproveNonPO = document.getElementById('tab-content-approve-nonpo');

    if (tabBtnApprovePO && tabBtnApproveNonPO && tabContentApprovePO && tabContentApproveNonPO) {
        tabBtnApprovePO.addEventListener('click', () => {
            tabBtnApprovePO.className = 'flex-1 py-2.5 px-4 rounded-xl text-sm font-bold transition-all bg-violet-500/20 text-violet-300 border border-violet-500/30';
            tabBtnApproveNonPO.className = 'flex-1 py-2.5 px-4 rounded-xl text-sm font-bold transition-all text-slate-400 hover:text-white hover:bg-slate-700';
            tabContentApprovePO.classList.remove('hidden');
            tabContentApproveNonPO.classList.add('hidden');
            loadApprovePOs();
        });

        tabBtnApproveNonPO.addEventListener('click', () => {
            tabBtnApproveNonPO.className = 'flex-1 py-2.5 px-4 rounded-xl text-sm font-bold transition-all bg-violet-500/20 text-violet-300 border border-violet-500/30';
            tabBtnApprovePO.className = 'flex-1 py-2.5 px-4 rounded-xl text-sm font-bold transition-all text-slate-400 hover:text-white hover:bg-slate-700';
            tabContentApproveNonPO.classList.remove('hidden');
            tabContentApprovePO.classList.add('hidden');
            if (typeof window.loadImportNotifications === 'function') window.loadImportNotifications();
        });
    }

    // Refresh triggers & Navigation linkages
    const btnRefreshArrivalPO = document.getElementById('btn-refresh-arrival-po');
    if (btnRefreshArrivalPO) {
        btnRefreshArrivalPO.addEventListener('click', loadArrivalPOs);
    }

    const btnReloadImportList = document.getElementById('btn-reload-import-list');
    if (btnReloadImportList) {
        btnReloadImportList.addEventListener('click', () => {
            loadApprovePOs();
            if (typeof window.loadImportNotifications === 'function') window.loadImportNotifications();
        });
    }

    // Connect to sidebar clicks
    const navReportArrivalBtn = document.getElementById('nav-report-arrival');
    if (navReportArrivalBtn) {
        navReportArrivalBtn.addEventListener('click', () => {
            loadArrivalPOs();
        });
    }

    const navApproveImportBtn = document.getElementById('nav-approve-import');
    if (navApproveImportBtn) {
        navApproveImportBtn.addEventListener('click', () => {
            loadApprovePOs();
            if (typeof window.loadImportNotifications === 'function') window.loadImportNotifications();
        });
    }
});

// ============================================================================
// GLOBAL UX: ป้องกันการเลื่อนลูกกลิ้งเมาส์เปลี่ยนค่าในช่องกรอกตัวเลข (Number Inputs)
// ============================================================================
document.addEventListener('wheel', function (e) {
    if (document.activeElement && document.activeElement.type === 'number') {
        e.preventDefault();
    }
}, { passive: false });
