const API_BASE_URL = '/api';

function compressImage(base64Str, maxWidth = 1024, maxHeight = 1024, quality = 0.7) {
    return new Promise((resolve, reject) => {
        const img = new Image();
        img.src = base64Str;
        img.onload = () => {
            const canvas = document.createElement('canvas');
            let width = img.width;
            let height = img.height;

            if (width > height) {
                if (width > maxWidth) {
                    height = Math.round((height * maxWidth) / width);
                    width = maxWidth;
                }
            } else {
                if (height > maxHeight) {
                    width = Math.round((width * maxHeight) / height);
                    height = maxHeight;
                }
            }

            canvas.width = width;
            canvas.height = height;
            const ctx = canvas.getContext('2d');
            ctx.drawImage(img, 0, 0, width, height);

            const compressedBase64 = canvas.toDataURL('image/jpeg', quality);
            resolve(compressedBase64);
        };
        img.onerror = (err) => {
            reject(err);
        };
    });
}

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

        // ตรวจสอบ 401 → เซสชั่นหมดอายุ (Token ไม่ถูกต้อง/หมดอายุ)
        // หมายเหตุ: 403 สงวนไว้สำหรับ "ไม่มีสิทธิ์ทำรายการนี้" (business permission) ซึ่งแต่ละหน้าจะจัดการเองจาก result.message
        if (response.status === 401) {
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
    // เปิดให้สคริปต์หน้าอื่นที่โหลดแยก (js/page-*.js) เรียกใช้ได้ผ่าน window
    window.authFetch = authFetch;

    // โหลดสคริปต์เฉพาะหน้า (js/page-<name>.js) แบบ dynamic ครั้งเดียว แล้ว cache ไว้
    // PAGE_SCRIPT_VERSION: บัมพ์เลขนี้ทุกครั้งที่แก้ไฟล์ใน js/ เพื่อไม่ให้เบราว์เซอร์ใช้ของเก่าที่ cache ไว้
    const PAGE_SCRIPT_VERSION = 'member_inline_validation_v1';
    const __loadedPageScripts = {};
    function loadPageScript(name) {
        if (__loadedPageScripts[name]) return __loadedPageScripts[name];
        const promise = new Promise((resolve, reject) => {
            const s = document.createElement('script');
            s.src = `js/page-${name}.js?v=${PAGE_SCRIPT_VERSION}`;
            s.onload = () => resolve();
            s.onerror = () => {
                delete __loadedPageScripts[name];
                reject(new Error(`โหลดสคริปต์หน้า "${name}" ไม่สำเร็จ`));
            };
            document.body.appendChild(s);
        });
        // เก็บ promise ไว้ทันที (ไม่ใช่รอ onload) เพื่อกันการโหลดซ้ำถ้าเรียกซ้อนกันเร็วๆ ก่อนโหลดเสร็จ
        __loadedPageScripts[name] = promise;
        return promise;
    }

    // โหลดไลบรารีภายนอกแบบ on-demand (ใช้ pattern เดียวกับ loadPageScript: cache promise ไว้ กัน race/โหลดซ้ำ)
    // ใช้กับไลบรารีหนักที่ไม่ได้ใช้ทุกหน้า เช่น xlsx ที่ใช้เฉพาะตอนนำเข้าสินค้าจาก Excel
    const __loadedExternalScripts = {};
    function loadExternalScript(url) {
        if (__loadedExternalScripts[url]) return __loadedExternalScripts[url];
        const promise = new Promise((resolve, reject) => {
            const s = document.createElement('script');
            s.src = url;
            s.onload = () => resolve();
            s.onerror = () => {
                delete __loadedExternalScripts[url];
                reject(new Error(`โหลดไลบรารีภายนอกไม่สำเร็จ: ${url}`));
            };
            document.body.appendChild(s);
        });
        __loadedExternalScripts[url] = promise;
        return promise;
    }

    // xlsx: เดิมโหลดใน <head> แบบ render-blocking ทุกครั้งที่เข้าเว็บ ทั้งที่ใช้แค่ตอนนำเข้า Excel
    // ตอนนี้โหลดเฉพาะตอนเปิด modal นำเข้า Excel เท่านั้น
    const XLSX_CDN_URL = 'https://cdnjs.cloudflare.com/ajax/libs/xlsx/0.18.5/xlsx.full.min.js';
    function ensureXlsxLoaded() {
        if (typeof XLSX !== 'undefined') return Promise.resolve();
        return loadExternalScript(XLSX_CDN_URL);
    }
    window.ensureXlsxLoaded = ensureXlsxLoaded;

    // โหลด HTML เฉพาะหน้า (views/<name>.html) แบบ dynamic ครั้งเดียว แล้ว cache ไว้ — คู่กับ loadPageScript
    // ต้องเรียก loadPageView(name) ให้เสร็จก่อน loadPageScript(name) เสมอ เพราะสคริปต์หน้าบางไฟล์
    // (เช่น js/page-deposits.js, js/page-po-accounting.js) query DOM element ของ view นั้นทันทีตอนโหลด
    // ไม่ได้รอ init function ถ้า HTML ยังไม่ถูกแทรกเข้า DOM ก่อน ตัวแปรที่ query ไว้จะเป็น null ถาวร
    // ชื่อ name ต้องตรงกับชื่อที่ใช้ใน loadPageScript — ไฟล์เดียวอาจมีหลาย <div id="view-XXX"> รวมกัน
    // ถ้าหน้านั้นถูก share โดยสคริปต์เดียวกันหลาย view (ดูตาราง mapping ในแผน)
    const VIEW_FRAGMENT_VERSION = 'v3'; // บัมพ์เลขนี้ทุกครั้งที่แก้ไฟล์ใน views/
    const __loadedPageViews = {};
    function loadPageView(name) {
        if (__loadedPageViews[name]) return __loadedPageViews[name];
        const promise = fetch(`views/${name}.html?v=${VIEW_FRAGMENT_VERSION}`)
            .then(res => {
                if (!res.ok) throw new Error(`โหลด HTML หน้า "${name}" ไม่สำเร็จ (${res.status})`);
                return res.text();
            })
            .then(html => {
                const tpl = document.createElement('template');
                tpl.innerHTML = html;
                let injected = 0;
                tpl.content.querySelectorAll('[id^="view-"]').forEach(el => {
                    const target = document.getElementById(el.id);
                    if (target) {
                        target.innerHTML = el.innerHTML;
                        injected++;
                    }
                });
                if (injected === 0) {
                    throw new Error(`views/${name}.html ไม่มี element ที่ id ตรงกับ placeholder ใน index.html`);
                }
            })
            .catch(err => {
                delete __loadedPageViews[name];
                throw err;
            });
        __loadedPageViews[name] = promise;
        return promise;
    }

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

    // Helper to determine if a category/product is a device
    const checkIsDevice = (categoryName, product = null) => {
        if (product) {
            const hasCapacity = product.capacity_id && (typeof product.capacity_id === 'object' ? Object.keys(product.capacity_id).length > 0 : String(product.capacity_id).trim() !== '');
            const hasCondition = product.condition_id && (typeof product.condition_id === 'object' ? Object.keys(product.condition_id).length > 0 : String(product.condition_id).trim() !== '');
            const hasImeis = product.imeis && Array.isArray(product.imeis) && product.imeis.length > 0;
            if (hasCapacity || hasCondition || hasImeis) {
                return true;
            }
        }

        if (!categoryName || categoryName === 'เลือกหมวดหมู่') {
            return false;
        }

        if (typeof categoryName !== 'string') {
            categoryName = (categoryName && categoryName.name) ? categoryName.name : '';
        }

        const deviceKeywords = [
            'iphone', 'ipad', 'samsung', 'oppo', 'vivo', 'xiaomi', 'realme', 'huawei',
            'oneplus', 'google', 'pixel', 'sony', 'nokia', 'asus', 'rog', 'lenovo',
            'มือถือ', 'โทรศัพท์', 'สมาร์ทโฟน', 'tablet', 'แท็บเล็ต', 'smart watch', 'นาฬิกา', 'เครื่อง'
        ];
        const catLower = categoryName.toLowerCase();
        return deviceKeywords.some(keyword => catLower.includes(keyword));
    };

    // Helper to safely set PO row values (including SELECT elements)
    const setPoRowValue = (row, name, val) => {
        const el = row.querySelector(`[name="${name}"]`);
        if (!el || val === undefined || val === null) return;
        if (el.tagName === 'SELECT') {
            let optionExists = false;
            for (let i = 0; i < el.options.length; i++) {
                if (el.options[i].value === val) {
                    optionExists = true;
                    break;
                }
            }
            if (!optionExists && val !== '') {
                const newOpt = document.createElement('option');
                newOpt.value = val;
                newOpt.textContent = val;
                el.appendChild(newOpt);
            }
        }
        el.value = val;
    };
    window.setPoRowValue = setPoRowValue;

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
    let cart = [];

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
    const navDeposits = document.getElementById('nav-deposits');
    const navMovements = document.getElementById('nav-movements');
    const navMembers = document.getElementById('nav-members');
    const navReportArrival = document.getElementById('nav-report-arrival');
    const navApproveImport = document.getElementById('nav-approve-import');
    const navWarrantyCheck = document.getElementById('nav-warranty-check');
    const navBranchInventory = document.getElementById('nav-branch-inventory');
    const navAccountingPO = document.getElementById('nav-accounting-po');
    const navBranchReceive = document.getElementById('nav-branch-receive');
    const navAuditLogs = document.getElementById('nav-audit-logs');
    const navAccounting = document.getElementById('nav-accounting');
    const navDailySummary = document.getElementById('nav-daily-summary');
    const navStockAudit = document.getElementById('nav-stock-audit');
    const navStockAuditReview = document.getElementById('nav-stock-audit-review');
    const navAccountingSettings = document.getElementById('nav-accounting-settings');
    const navDisbursement = document.getElementById('nav-disbursement');

    // Mobile Navigation Buttons
    const mobileNavTransactions = document.getElementById('mobile-nav-transactions');
    const mobileNavStock = document.getElementById('mobile-nav-stock');
    const mobileNavAccountingPO = document.getElementById('mobile-nav-accounting-po');
    const mobileNavMembers = document.getElementById('mobile-nav-members');
    const mobileNavDailySummary = document.getElementById('mobile-nav-daily-summary');
    const mobileNavStockAudit = document.getElementById('mobile-nav-stock-audit');

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
    const viewDeposits = document.getElementById('view-deposits');
    const viewMovements = document.getElementById('view-movements');
    const viewMembers = document.getElementById('view-members');
    const viewReportArrival = document.getElementById('view-report-arrival');
    const viewApproveImport = document.getElementById('view-approve-import');
    const viewWarrantyCheck = document.getElementById('view-warranty-check');
    const viewAccountingPO = document.getElementById('view-accounting-po');
    const viewBranchReceive = document.getElementById('view-branch-receive');
    const viewAuditLogs = document.getElementById('view-audit-logs');
    const viewAccounting = document.getElementById('view-accounting');
    const viewDailySummary = document.getElementById('view-daily-summary');
    const viewStockAudit = document.getElementById('view-stock-audit');
    const viewStockAuditReview = document.getElementById('view-stock-audit-review');
    const viewAccountingSettings = document.getElementById('view-accounting-settings');
    const viewDisbursement = document.getElementById('view-disbursement');

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
    const stockFilterProdType = document.getElementById('stock-filter-prod-type');
    const stockFilterProductName = document.getElementById('stock-filter-product-name');
    const stockFilterColor = document.getElementById('stock-filter-color');
    const stockFilterCapacity = document.getElementById('stock-filter-capacity');
    const stockFilterCondition = document.getElementById('stock-filter-condition');
    const stockFilterUnit = document.getElementById('stock-filter-unit');
    const stockFilterCostMin = document.getElementById('stock-filter-cost-min');
    const stockFilterCostMax = document.getElementById('stock-filter-cost-max');
    const stockFilterQtyMin = document.getElementById('stock-filter-qty-min');
    const stockFilterQtyMax = document.getElementById('stock-filter-qty-max');
    const stockFilterSort = document.getElementById('stock-filter-sort');
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
    const branchPhoneInput = document.getElementById('branch-phone');
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
    // เปิดให้สคริปต์หน้าอื่นที่โหลดแยก (js/page-*.js) มองเห็นได้ผ่าน window — sync ทุกครั้งที่ reassign ตัวแปรนี้
    window.allProductsCache = allProductsCache;
    let stockFilteredCache = [];
    let stockLoadedCount = 0; // จำนวนสินค้าที่ render แล้วตอนนี้ (infinite scroll)
    const stockItemsPerPage = 10; // โหลดเพิ่มทีละ 10 รายการ
    let stockSearchDebounceId = null;
    let stockSearchQuery = '';
    let stockFilters = {
        branchId: '',
        categoryId: '',
        supplierId: '',
        status: 'in_stock',
        priceMin: '',
        priceMax: '',
        prodType: '',
        productName: '',
        colorId: '',
        capacityId: '',
        conditionId: '',
        unitId: '',
        costMin: '',
        costMax: '',
        qtyMin: '',
        qtyMax: '',
        sortBy: 'newest'
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

        if (filters.prodType && productCategoryId !== filters.prodType) return false;

        // stock-filter-product-name is a free-text input now (not a <select> of exact
        // known names), so match as a case-insensitive substring instead of exact
        // equality — otherwise any partial/differently-cased search returns nothing.
        if (filters.productName && !String(product.name || '').toLowerCase().includes(String(filters.productName).toLowerCase())) return false;

        const productColorId = getId(product.color_id);
        if (filters.colorId && productColorId !== filters.colorId) return false;

        const productCapacityId = getId(product.capacity_id);
        if (filters.capacityId && productCapacityId !== filters.capacityId) return false;

        const productConditionId = getId(product.condition_id);
        if (filters.conditionId && productConditionId !== filters.conditionId) return false;

        const productUnitId = getId(product.unit_id);
        if (filters.unitId && productUnitId !== filters.unitId) return false;

        const price = Number(product.selling_price || 0);
        const min = filters.priceMin !== '' ? Number(filters.priceMin) : null;
        const max = filters.priceMax !== '' ? Number(filters.priceMax) : null;
        if (min !== null && !Number.isNaN(min) && price < min) return false;
        if (max !== null && !Number.isNaN(max) && price > max) return false;

        const cost = Number(product.cost_price || 0);
        const costMinVal = filters.costMin !== '' ? Number(filters.costMin) : null;
        const costMaxVal = filters.costMax !== '' ? Number(filters.costMax) : null;
        if (costMinVal !== null && !Number.isNaN(costMinVal) && cost < costMinVal) return false;
        if (costMaxVal !== null && !Number.isNaN(costMaxVal) && cost > costMaxVal) return false;

        const qtyMinVal = filters.qtyMin !== '' ? Number(filters.qtyMin) : null;
        const qtyMaxVal = filters.qtyMax !== '' ? Number(filters.qtyMax) : null;
        if (qtyMinVal !== null && !Number.isNaN(qtyMinVal) && quantity < qtyMinVal) return false;
        if (qtyMaxVal !== null && !Number.isNaN(qtyMaxVal) && quantity > qtyMaxVal) return false;

        return true;
    };

    const getFilteredProducts = () => {
        const list = allProductsCache.filter(p => productMatchesSearch(p, stockSearchQuery) && productMatchesFilters(p, stockFilters));
        if (stockFilters.sortBy === 'name_asc') {
            list.sort((a, b) => (a.name || '').localeCompare(b.name || '', 'th'));
        } else if (stockFilters.sortBy === 'price_asc') {
            list.sort((a, b) => Number(a.selling_price || 0) - Number(b.selling_price || 0));
        } else if (stockFilters.sortBy === 'price_desc') {
            list.sort((a, b) => Number(b.selling_price || 0) - Number(a.selling_price || 0));
        } else if (stockFilters.sortBy === 'qty_asc') {
            list.sort((a, b) => Number(a.quantity || 0) - Number(b.quantity || 0));
        } else if (stockFilters.sortBy === 'qty_desc') {
            list.sort((a, b) => Number(b.quantity || 0) - Number(a.quantity || 0));
        } else if (stockFilters.sortBy === 'newest') {
            list.sort((a, b) => new Date(b.createdAt || 0) - new Date(a.createdAt || 0));
        }
        return list;
    };

    const countActiveFilters = () => {
        let n = 0;
        if (stockSearchQuery) n += 1;
        if (stockFilters.branchId) n += 1;
        if (stockFilters.categoryId) n += 1;
        if (stockFilters.supplierId) n += 1;
        if (stockFilters.status) n += 1;
        if (stockFilters.priceMin !== '' || stockFilters.priceMax !== '') n += 1;
        if (stockFilters.prodType) n += 1;
        if (stockFilters.colorId) n += 1;
        if (stockFilters.capacityId) n += 1;
        if (stockFilters.conditionId) n += 1;
        if (stockFilters.unitId) n += 1;
        if (stockFilters.costMin !== '' || stockFilters.costMax !== '') n += 1;
        if (stockFilters.qtyMin !== '' || stockFilters.qtyMax !== '') n += 1;
        if (stockFilters.sortBy && stockFilters.sortBy !== 'newest') n += 1;
        return n;
    };

    const updateFilterButtonBadge = () => {
        if (!btnStockFilterText) return;
        const n = countActiveFilters();
        btnStockFilterText.textContent = n > 0 ? `เพิ่มเติม (${n})` : 'เพิ่มเติม';
    };

    const getSelectedText = (selectEl) => {
        if (!selectEl) return '';
        // stock-filter-product-name is a plain text <input>, not a <select> — it has no
        // .options, so guard against that (and any other non-select element) instead of
        // throwing, which used to abort the rest of renderActiveFilterChips().
        if (selectEl.tagName !== 'SELECT') return selectEl.value || '';
        const opt = selectEl.options[selectEl.selectedIndex];
        return opt ? opt.textContent : '';
    };

    const renderActiveFilterChips = () => {
        if (!stockActiveFilters) return;
        stockActiveFilters.innerHTML = '';

        const addChip = (key, label) => {
            const chip = document.createElement('button');
            chip.type = 'button';
            chip.className = 'px-4 py-2.5 rounded-xl bg-[#4D4D4D]/40 border border-[#3F3F46] text-white text-sm font-medium transition-colors flex items-center gap-2';
            chip.dataset.key = key;
            chip.innerHTML = `<span>${label}</span><i class="fa-solid fa-xmark text-[10px] opacity-80"></i>`;
            chip.addEventListener('click', (e) => {
                if (!e.target.closest('i.fa-xmark')) return;

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
                } else if (key === 'prodType') {
                    stockFilters.prodType = '';
                    if (stockFilterProdType) stockFilterProdType.value = '';
                } else if (key === 'productName') {
                    stockFilters.productName = '';
                    if (stockFilterProductName) stockFilterProductName.value = '';
                } else if (key === 'color') {
                    stockFilters.colorId = '';
                    if (stockFilterColor) stockFilterColor.value = '';
                } else if (key === 'capacity') {
                    stockFilters.capacityId = '';
                    if (stockFilterCapacity) stockFilterCapacity.value = '';
                } else if (key === 'condition') {
                    stockFilters.conditionId = '';
                    if (stockFilterCondition) stockFilterCondition.value = '';
                } else if (key === 'unit') {
                    stockFilters.unitId = '';
                    if (stockFilterUnit) stockFilterUnit.value = '';
                } else if (key === 'cost') {
                    stockFilters.costMin = '';
                    stockFilters.costMax = '';
                    if (stockFilterCostMin) stockFilterCostMin.value = '';
                    if (stockFilterCostMax) stockFilterCostMax.value = '';
                } else if (key === 'qty') {
                    stockFilters.qtyMin = '';
                    stockFilters.qtyMax = '';
                    if (stockFilterQtyMin) stockFilterQtyMin.value = '';
                    if (stockFilterQtyMax) stockFilterQtyMax.value = '';
                } else if (key === 'sort') {
                    stockFilters.sortBy = 'newest';
                    if (stockFilterSort) stockFilterSort.value = 'newest';
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
        if (stockFilters.prodType) {
            const text = getSelectedText(stockFilterProdType) || 'ประเภทสินค้า';
            addChip('prodType', `ประเภท: ${text}`);
        }
        if (stockFilters.productName) {
            const text = getSelectedText(stockFilterProductName) || 'ชื่อสินค้า';
            addChip('productName', `ชื่อ: ${text}`);
        }
        if (stockFilters.colorId) {
            const text = getSelectedText(stockFilterColor) || 'สี';
            addChip('color', `สี: ${text}`);
        }
        if (stockFilters.capacityId) {
            const text = getSelectedText(stockFilterCapacity) || 'ความจุ';
            addChip('capacity', `ความจุ: ${text}`);
        }
        if (stockFilters.conditionId) {
            const text = getSelectedText(stockFilterCondition) || 'สภาพ';
            addChip('condition', `สภาพ: ${text}`);
        }
        if (stockFilters.unitId) {
            const text = getSelectedText(stockFilterUnit) || 'หน่วยนับ';
            addChip('unit', `หน่วยนับ: ${text}`);
        }
        if (stockFilters.priceMin !== '' || stockFilters.priceMax !== '') {
            const min = stockFilters.priceMin !== '' ? Number(stockFilters.priceMin).toLocaleString() : '0';
            const max = stockFilters.priceMax !== '' ? Number(stockFilters.priceMax).toLocaleString() : 'ไม่จำกัด';
            addChip('price', `ราคาขาย: ฿${min} - ฿${max}`);
        }
        if (stockFilters.costMin !== '' || stockFilters.costMax !== '') {
            const min = stockFilters.costMin !== '' ? Number(stockFilters.costMin).toLocaleString() : '0';
            const max = stockFilters.costMax !== '' ? Number(stockFilters.costMax).toLocaleString() : 'ไม่จำกัด';
            addChip('cost', `ราคาทุน: ฿${min} - ฿${max}`);
        }
        if (stockFilters.qtyMin !== '' || stockFilters.qtyMax !== '') {
            const min = stockFilters.qtyMin !== '' ? Number(stockFilters.qtyMin).toLocaleString() : '0';
            const max = stockFilters.qtyMax !== '' ? Number(stockFilters.qtyMax).toLocaleString() : 'ไม่จำกัด';
            addChip('qty', `จำนวนคงเหลือ: ${min} - ${max}`);
        }
        if (stockFilters.sortBy && stockFilters.sortBy !== 'newest') {
            const text = getSelectedText(stockFilterSort) || 'เรียงลำดับ';
            addChip('sort', `เรียง: ${text}`);
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

    // โหลดสินค้าชุดถัดไป (stockItemsPerPage รายการ) มาต่อท้ายตารางที่มีอยู่ — เรียกซ้ำได้เรื่อยๆ จน stockLoadedCount ถึง cache ทั้งหมด
    const loadMoreStockProducts = () => {
        const totalItems = stockFilteredCache.length;
        if (stockLoadedCount >= totalItems) return;
        const nextBatch = stockFilteredCache.slice(stockLoadedCount, stockLoadedCount + stockItemsPerPage);
        renderProductTable(nextBatch, true);
        stockLoadedCount += nextBatch.length;

        // ถ้าโหลดแล้วเนื้อหายังไม่ล้นพื้นที่ที่มองเห็น (#main-content ไม่มี scrollbar)
        // scroll event จะไม่มีวันยิงและรายการที่เหลือจะเข้าถึงไม่ได้ตลอดไป โหลดเพิ่มต่อจนกว่าจะล้นหรือหมด cache
        const container = document.getElementById('main-content');
        if (container && stockLoadedCount < totalItems && container.scrollHeight <= container.clientHeight) {
            loadMoreStockProducts();
        }
    };

    const renderStockPage = () => {
        stockLoadedCount = 0;
        if (productTableBody) productTableBody.innerHTML = '';
        if (stockFilteredCache.length === 0) {
            renderProductTable([]); // แสดงข้อความ "ไม่พบสินค้าที่ค้นหา"
            return;
        }
        loadMoreStockProducts();
    };

    const applyStockSearchAndFilters = () => {
        stockFilteredCache = getFilteredProducts();
        renderStockPage();
        renderActiveFilterChips();
        updateFilterButtonBadge();
        updateResultCount(stockFilteredCache.length, allProductsCache.length);
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
    window.setSelectOptions = setSelectOptions;

    const renderFilterPills = (containerId, targetId, dataArray, allLabel) => {
        const container = document.getElementById(containerId);
        const targetSelect = document.getElementById(targetId);
        if (!container || !targetSelect) return;

        container.innerHTML = '';
        if (!dataArray) return;

        // Add "All" option
        const allBtn = document.createElement('button');
        allBtn.type = 'button';
        allBtn.className = 'custom-pill flex-shrink-0 px-4 py-2.5 bg-[#27272A] border border-[#FFE169] rounded-xl text-[#FFE169] text-sm hover:border-[#FFE169] hover:text-white transition-colors filter-pill active';
        allBtn.dataset.target = targetId;
        allBtn.dataset.value = '';
        allBtn.textContent = allLabel;
        container.appendChild(allBtn);

        dataArray.forEach(item => {
            const btn = document.createElement('button');
            btn.type = 'button';
            btn.className = 'custom-pill flex-shrink-0 px-4 py-2.5 bg-[#27272A] border border-[#3F3F46] rounded-xl text-slate-300 text-sm hover:border-[#FFE169] hover:text-white transition-colors filter-pill';
            btn.dataset.target = targetId;
            btn.dataset.value = item._id ? item._id : item.name;
            btn.textContent = item.name;
            container.appendChild(btn);
        });

        // Re-attach event listeners
        container.querySelectorAll('.filter-pill').forEach(pill => {
            pill.addEventListener('click', function () {
                const targetId = this.getAttribute('data-target');
                const value = this.getAttribute('data-value');
                const targetSelect = document.getElementById(targetId);
                const isActive = this.classList.contains('active');

                // Remove active from all siblings
                this.parentElement.querySelectorAll('.filter-pill').forEach(s => {
                    s.classList.remove('active', 'border-[#FFE169]', 'text-[#FFE169]');
                    s.classList.add('border-[#3F3F46]', 'text-slate-300');
                });

                if (isActive && value !== '') {
                    // Toggle off to "all"
                    const allOpt = this.parentElement.querySelector('.filter-pill[data-value=""]');
                    if (allOpt) {
                        allOpt.classList.remove('border-[#3F3F46]', 'text-slate-300');
                        allOpt.classList.add('active', 'border-[#FFE169]', 'text-[#FFE169]');
                    }
                    if (targetSelect) {
                        targetSelect.value = '';
                        targetSelect.dispatchEvent(new Event('change'));
                    }
                } else {
                    // Toggle on
                    this.classList.remove('border-[#3F3F46]', 'text-slate-300');
                    this.classList.add('active', 'border-[#FFE169]', 'text-[#FFE169]');
                    if (targetSelect) {
                        targetSelect.value = value;
                        targetSelect.dispatchEvent(new Event('change'));
                    }
                }
            });
        });
    };

    // ==========================================
    // สีของสินค้า (ใช้ร่วมกันทุกหน้า)
    // ==========================================
    // เดิมตารางสีนี้ถูกก็อปไว้หลายที่ พอเพิ่มสีใหม่ต้องไล่แก้ทุกจุดและมักตกหล่น จึงรวมมาไว้ที่เดียว
    const PRODUCT_COLOR_MAP = {
        'ดำ': '#000000', 'black': '#000000', 'midnight': '#1C1C1E', 'มิดไนท์': '#1C1C1E',
        'ขาว': '#FFFFFF', 'white': '#FFFFFF', 'starlight': '#F9F6EF', 'สตาร์ไลท์': '#F9F6EF',
        'แดง': '#FF3B30', 'red': '#FF3B30',
        'ฟ้า': '#32ADE6', 'บลู': '#2E5C92', 'blue': '#2E5C92', 'sierra blue': '#9BB5CE', 'เซียร์ร่าบลู': '#9BB5CE',
        'น้ำเงิน': '#007AFF', 'navy': '#000080', 'กรม': '#000080', 'pacific blue': '#2E475D',
        'เหลือง': '#FFCC00', 'yellow': '#FFCC00', 'เหลืองอ่อน': '#FFF3B0', 'เหลืองเข้ม': '#FFC300',
        'ส้ม': '#FF9500', 'orange': '#FF9500',
        'ม่วง': '#AF52DE', 'purple': '#AF52DE', 'deep purple': '#594F63',
        'เขียว': '#34C759', 'green': '#34C759', 'alpine green': '#576856', 'midnight green': '#4E5851',
        'เงิน': '#C0C0C0', 'silver': '#C0C0C0', 'ซิลเวอร์': '#C0C0C0',
        'เทา': '#8E8E93', 'gray': '#8E8E93', 'space gray': '#535150', 'สเปซเกรย์': '#535150',
        'ทอง': '#FFD700', 'gold': '#FFD700', 'rose gold': '#B76E79', 'โรสโกลด์': '#B76E79',
        'ชมพู': '#FF2D55', 'pink': '#FF2D55',
        'ไทเทเนียม': '#878681', 'titanium': '#878681', 'natural titanium': '#878681', 'เนเชอรัล': '#878681',
        'ไวท์ไทเทเนียม': '#ECE9E3', 'ไทเทเนียมดำ': '#3E3F43', 'กราไฟต์': '#3E3F43',
        'บรอนซ์': '#CD7F32', 'ทะเลทราย': '#EDC9AF', 'เนื้อ': '#EDC9AF'
    };

    // แปลงชื่อสี (ไทย/อังกฤษ) เป็น hex — ถ้าแอดมินตั้ง color_code ไว้เองในหน้าตั้งค่า ให้ค่านั้นชนะเสมอ
    const resolveProductColorHex = (colorName, colorDoc, fallback = '#8E8E93') => {
        if (colorDoc && colorDoc.color_code) return colorDoc.color_code;
        let hex = fallback;
        if (colorName) {
            const lower = colorName.toLowerCase();
            Object.keys(PRODUCT_COLOR_MAP).forEach(k => {
                if (lower.includes(k.toLowerCase())) hex = PRODUCT_COLOR_MAP[k];
            });
        }
        return hex;
    };
    window.resolveProductColorHex = resolveProductColorHex;


    const hexToRgb = (hex) => {
        let h = String(hex || '').replace('#', '').trim();
        if (h.length === 3) h = h.split('').map(c => c + c).join('');
        if (!/^[0-9a-fA-F]{6}$/.test(h)) return { r: 142, g: 142, b: 147 };
        return { r: parseInt(h.slice(0, 2), 16), g: parseInt(h.slice(2, 4), 16), b: parseInt(h.slice(4, 6), 16) };
    };

    // ความสว่างเชิงสายตา 0-1 ใช้ตัดสินว่าสีนั้นจมไปกับพื้นมืดหรือไม่
    const colorLuminance = (hex) => {
        const { r, g, b } = hexToRgb(hex);
        return (0.2126 * r + 0.7152 * g + 0.0722 * b) / 255;
    };

    const mixHexWithWhite = (hex, amount) => {
        const { r, g, b } = hexToRgb(hex);
        const m = (c) => Math.round(c + (255 - c) * amount);
        return `#${[m(r), m(g), m(b)].map(c => c.toString(16).padStart(2, '0')).join('')}`;
    };

    const hexToRgba = (hex, alpha) => {
        const { r, g, b } = hexToRgb(hex);
        return `rgba(${r}, ${g}, ${b}, ${alpha})`;
    };

    // คืนชุดสีสำหรับไทล์ไอคอนสินค้า: ไอคอนใช้สีเต็ม พื้นหลังใช้สีเดียวกันแบบจางลง
    // สีเข้มมาก (ดำ, กรม, deep purple) ต้องดึงให้สว่างขึ้นก่อน ไม่งั้นไอคอนจะจมหายไปกับพื้นดำ
    const getProductColorTheme = (colorName, colorDoc) => {
        const base = resolveProductColorHex(colorName, colorDoc);
        const lum = colorLuminance(base);
        const icon = lum < 0.35 ? mixHexWithWhite(base, 0.55) : base;
        return {
            icon,
            bg: hexToRgba(icon, 0.16),
            border: hexToRgba(icon, 0.34)
        };
    };

    const renderFilterSwatches = (containerId, targetId, dataArray) => {
        const container = document.getElementById(containerId);
        const targetSelect = document.getElementById(targetId);
        if (!container || !targetSelect) return;

        container.innerHTML = '';
        if (!dataArray) return;

        dataArray.forEach(item => {
            const wrapper = document.createElement('div');
            wrapper.className = 'flex flex-col items-center gap-1 cursor-pointer filter-swatch custom-swatch-wrapper';
            wrapper.dataset.target = targetId;
            wrapper.dataset.value = item._id;

            const swatch = document.createElement('div');
            swatch.className = 'w-7 h-7 rounded-full border-2 border-transparent transition-all custom-swatch swatch-indicator';

            swatch.style.backgroundColor = resolveProductColorHex(item.name, item);

            const label = document.createElement('span');
            label.className = 'text-[10px] text-slate-400 whitespace-nowrap swatch-text transition-colors';
            label.textContent = item.name;

            wrapper.appendChild(swatch);
            wrapper.appendChild(label);
            container.appendChild(wrapper);
        });

        // Attach listeners
        container.querySelectorAll('.filter-swatch').forEach(swatch => {
            swatch.addEventListener('click', function () {
                const targetId = this.getAttribute('data-target');
                const value = this.getAttribute('data-value');
                const targetSelect = document.getElementById(targetId);
                const isActive = this.classList.contains('active');

                // Remove active from all siblings
                this.parentElement.querySelectorAll('.filter-swatch').forEach(s => {
                    s.classList.remove('active');
                    const indicator = s.querySelector('.swatch-indicator');
                    if (indicator) {
                        indicator.classList.remove('border-[#FFE169]', 'scale-110');
                        indicator.classList.add('border-transparent');
                    }
                    const label = s.querySelector('.swatch-text');
                    if (label) {
                        label.classList.remove('text-[#FFE169]', 'text-[13px]');
                        label.classList.add('text-slate-400', 'text-[10px]');
                    }
                });

                if (isActive) {
                    // Toggle off
                    if (targetSelect) {
                        targetSelect.value = '';
                        targetSelect.dispatchEvent(new Event('change'));
                    }
                } else {
                    // Toggle on
                    this.classList.add('active');
                    const indicator = this.querySelector('.swatch-indicator');
                    if (indicator) {
                        indicator.classList.remove('border-transparent');
                        indicator.classList.add('border-[#FFE169]', 'scale-110');
                    }
                    const label = this.querySelector('.swatch-text');
                    if (label) {
                        label.classList.remove('text-slate-400', 'text-[10px]');
                        label.classList.add('text-[#FFE169]', 'text-[13px]');
                    }
                    if (targetSelect) {
                        targetSelect.value = value;
                        targetSelect.dispatchEvent(new Event('change'));
                    }
                }
            });
        });
    };

    const loadFilterOptions = async () => {
        const master = window.masterDataCache || {};
        const categories = Array.isArray(master.productTypes) ? master.productTypes : [];
        const suppliers = Array.isArray(master.suppliers) ? master.suppliers : [];
        const colors = Array.isArray(master.productColors) ? master.productColors : [];
        const capacities = Array.isArray(master.productCapacities) ? master.productCapacities : [];
        const conditions = Array.isArray(master.productConditions) ? master.productConditions : [];
        const units = Array.isArray(master.productUnits) ? master.productUnits : [];

        const productNames = Array.isArray(master.productNames) ? master.productNames : [];

        setSelectOptions(stockFilterCategory, categories.map(c => ({ value: String(c._id), label: c.name })), 'ทุกหมวดหมู่');
        setSelectOptions(stockFilterProdType, categories.map(c => ({ value: String(c._id), label: c.name })), 'ทุกประเภท');
        setSelectOptions(stockFilterSupplier, suppliers.map(s => ({ value: String(s._id), label: s.name })), 'ทุก Supplier');
        setSelectOptions(stockFilterColor, colors.map(x => ({ value: String(x._id), label: x.name })), 'ทุกสี');
        setSelectOptions(stockFilterCapacity, capacities.map(x => ({ value: String(x._id), label: x.name })), 'ทุกความจุ');
        setSelectOptions(stockFilterCondition, conditions.map(x => ({ value: String(x._id), label: x.name })), 'ทุกสภาพ');
        setSelectOptions(stockFilterUnit, units.map(x => ({ value: String(x._id), label: x.name })), 'ทุกหน่วยนับ');

        // Dynamically render custom pills/swatches to bind with exact database _ids
        renderFilterPills('stock-filter-category-container', 'stock-filter-prod-type', categories, 'ทั้งหมด');
        renderFilterPills('stock-filter-condition-container', 'stock-filter-condition', conditions, 'ทั้งหมด');
        renderFilterPills('stock-filter-capacity-container', 'stock-filter-capacity', capacities, 'ทั้งหมด');
        renderFilterSwatches('stock-filter-color-container', 'stock-filter-color', colors);

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
        stockFilters.prodType = '';
        stockFilters.productName = '';
        stockFilters.colorId = '';
        stockFilters.capacityId = '';
        stockFilters.conditionId = '';
        stockFilters.unitId = '';
        stockFilters.costMin = '';
        stockFilters.costMax = '';
        stockFilters.qtyMin = '';
        stockFilters.qtyMax = '';
        stockFilters.sortBy = 'newest';

        if (stockSearchInput) stockSearchInput.value = '';
        if (stockFilterCategory) stockFilterCategory.value = stockFilters.categoryId;
        if (stockFilterSupplier) stockFilterSupplier.value = stockFilters.supplierId;
        if (stockFilterStatus) stockFilterStatus.value = stockFilters.status;
        if (stockFilterPriceMin) stockFilterPriceMin.value = '';
        if (stockFilterPriceMax) stockFilterPriceMax.value = '';
        if (stockFilterBranch) stockFilterBranch.value = stockFilters.branchId;
        if (stockFilterProdType) stockFilterProdType.value = '';
        if (stockFilterProductName) stockFilterProductName.value = '';
        if (stockFilterColor) stockFilterColor.value = '';
        if (stockFilterCapacity) stockFilterCapacity.value = '';
        if (stockFilterCondition) stockFilterCondition.value = '';
        if (stockFilterUnit) stockFilterUnit.value = '';
        if (stockFilterCostMin) stockFilterCostMin.value = '';
        if (stockFilterCostMax) stockFilterCostMax.value = '';
        if (stockFilterQtyMin) stockFilterQtyMin.value = '';
        if (stockFilterQtyMax) stockFilterQtyMax.value = '';
        if (stockFilterSort) stockFilterSort.value = 'newest';

        updateFilterButtonBadge();
    };

    const openStockFilterPanel = () => {
        if (!stockFilterPanel) return;
        stockFilterPanel.classList.remove('opacity-0', 'pointer-events-none');
        const content = document.getElementById('stock-filter-panel-content');
        if (content) content.classList.remove('translate-x-full');
    };

    const closeStockFilterPanel = () => {
        if (!stockFilterPanel) return;
        stockFilterPanel.classList.add('opacity-0', 'pointer-events-none');
        const content = document.getElementById('stock-filter-panel-content');
        if (content) content.classList.add('translate-x-full');
    };

    // ==========================================
    // UI Modal Logic
    // ==========================================
    const handleCategoryFields = (categoryName, forceShowDeviceFields = false) => {
        if (!categoryName || categoryName === 'เลือกหมวดหมู่') {
            if (!forceShowDeviceFields) {
                if (deviceFields) deviceFields.classList.add('hidden');
                if (imeiField) imeiField.classList.add('hidden');
                if (quantityField) quantityField.classList.remove('hidden');
                if (productQuantity) {
                    productQuantity.required = true;
                    productQuantity.readOnly = false;
                }
                if (productImeis) productImeis.required = false;
                if (productCapacity) productCapacity.required = false;
                if (productCondition) productCondition.required = false;
                return;
            }
        }

        const isDevice = forceShowDeviceFields || checkIsDevice(categoryName);

        if (isDevice) {
            if (deviceFields) deviceFields.classList.remove('hidden');
            if (imeiField) imeiField.classList.remove('hidden');
            if (quantityField) quantityField.classList.remove('hidden');

            if (productImeis) productImeis.required = true;
            if (productQuantity) {
                productQuantity.required = true;
                productQuantity.readOnly = true;
            }
            if (productCapacity) productCapacity.required = true;
            if (productCondition) productCondition.required = true;

            // Try to auto-select "เครื่อง" unit if available and not already set
            if (productUnit && (!productUnit.value || productUnit.value === '')) {
                Array.from(productUnit.options).forEach(opt => {
                    if (opt.textContent === 'เครื่อง') productUnit.value = opt.value;
                });
            }
        } else {
            if (deviceFields) deviceFields.classList.add('hidden');
            if (imeiField) imeiField.classList.add('hidden');
            if (quantityField) quantityField.classList.remove('hidden');

            if (productImeis) {
                productImeis.required = false;
            }
            if (productQuantity) {
                productQuantity.required = true;
                productQuantity.readOnly = false;
            }
            if (productCapacity) {
                productCapacity.required = false;
            }
            if (productCondition) {
                productCondition.required = false;
            }

            // Try to auto-select "ชิ้น" unit if available and not already set
            if (productUnit && (!productUnit.value || productUnit.value === '')) {
                Array.from(productUnit.options).forEach(opt => {
                    if (opt.textContent === 'ชิ้น') productUnit.value = opt.value;
                });
            }
        }
    };

    const openModal = () => {
        if (addProductModal) {
            addProductModal.classList.remove('opacity-0', 'pointer-events-none');

            // Removed restoring drafted prices per user request
        }
    };

    const closeModal = () => {
        if (addProductModal) {
            addProductModal.classList.add('opacity-0', 'pointer-events-none');
            if (addProductForm) addProductForm.reset();

            // Reset dynamic fields to default state
            handleCategoryFields("");

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
            if (modalTitle) modalTitle.innerHTML = `<i class="fa-solid fa-plus text-[#FFE169]"></i> เพิ่มสินค้าใหม่`;

            // Show Excel Button in modal header
            const btnExcelOpen = document.getElementById('btn-add-product-excel');
            if (btnExcelOpen) btnExcelOpen.classList.remove('hidden');

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

                // Render Custom Pills for Add Product Modal
                renderCustomSelectPills('product-category-container', 'product-category', json.data.productTypes);
                renderCustomColorSwatches('product-color-container', 'product-color', json.data.productColors);
                renderCustomSelectPills('product-capacity-container', 'product-capacity', json.data.productCapacities);
                populateDropdown(document.getElementById('product-supplier'), json.data.suppliers, '-- เลือก Supplier --');
                renderCustomSelectPills('product-unit-container', 'product-unit', json.data.productUnits);

                const pnSelect = document.getElementById('product-name');
                if (pnSelect && json.data.productNames) {
                    pnSelect.innerHTML = '<option value="">-- เลือกชื่อสินค้า --</option>';
                    json.data.productNames.forEach(item => {
                        const opt = document.createElement('option');
                        opt.value = item.name;
                        opt.textContent = item.name;
                        pnSelect.appendChild(opt);
                    });
                }

                populateDropdown(modalFinanceCompany, json.data.financeCompanies, 'เลือกบริษัทจัดไฟแนนซ์');

                // โหลดสาขาสำหรับ dropdown ที่จัดเก็บสินค้า
                loadBranchesForProductForm();

                // โหลดสาขาสำหรับตัวกรองหน้าตรวจสอบนำเข้า
                populateApproveImportBranchFilter();

                if (typeof renderSettingsList === 'function') renderSettingsList();
            } else {
                console.error('Failed to load master data:', json.message);
            }
        } catch (error) {
            console.error('Error fetching master data:', error);
        }
    }
    window.fetchMasterData = fetchMasterData;

    const ensureMasterDataLoaded = async () => {
        const c = window.masterDataCache || {};
        const hasTypes = Array.isArray(c.productTypes) && c.productTypes.length > 0;
        const hasSuppliers = Array.isArray(c.suppliers) && c.suppliers.length > 0;
        if (hasTypes && hasSuppliers) return;
        await fetchMasterData();
    };
    window.ensureMasterDataLoaded = ensureMasterDataLoaded;

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

    // Custom UI Renderers for Add Product Modal
    const renderCustomSelectPills = (containerId, hiddenInputId, dataArray) => {
        const container = document.getElementById(containerId);
        const hiddenInput = document.getElementById(hiddenInputId);
        if (!container || !hiddenInput) return;

        container.innerHTML = '';
        if (!dataArray) return;

        dataArray.forEach(item => {
            const btn = document.createElement('button');
            btn.type = 'button';
            btn.className = 'custom-pill flex-shrink-0 px-4 py-2.5 bg-[#27272A] border border-[#3F3F46] rounded-xl text-slate-300 text-sm hover:border-[#FFE169] hover:text-white transition-colors';
            btn.dataset.value = item._id;
            btn.textContent = item.code ? `${item.name} (${item.code})` : item.name;

            btn.addEventListener('click', () => {
                // Remove active from all
                Array.from(container.children).forEach(child => {
                    child.classList.remove('border-[#FFE169]', 'text-[#FFE169]');
                    child.classList.add('border-slate-600', 'text-slate-300');
                });
                // Set active to clicked
                btn.classList.remove('border-slate-600', 'text-slate-300');
                btn.classList.add('border-[#FFE169]', 'text-[#FFE169]');
                // Update hidden input
                hiddenInput.value = item._id;
            });

            container.appendChild(btn);
        });
    };

    const renderCustomColorSwatches = (containerId, hiddenInputId, dataArray) => {
        const container = document.getElementById(containerId);
        const hiddenInput = document.getElementById(hiddenInputId);
        if (!container || !hiddenInput) return;

        container.innerHTML = '';
        if (!dataArray) return;

        dataArray.forEach(item => {
            const wrapper = document.createElement('div');
            wrapper.className = 'flex flex-col items-center gap-1 cursor-pointer custom-swatch-wrapper';
            wrapper.dataset.value = item._id;

            const swatch = document.createElement('div');
            swatch.className = 'w-7 h-7 rounded-full border-2 border-transparent transition-all custom-swatch';

            swatch.style.backgroundColor = resolveProductColorHex(item.name, item);

            const label = document.createElement('span');
            label.className = 'text-[10px] text-slate-400 whitespace-nowrap custom-swatch-label transition-colors';
            label.textContent = item.name;

            wrapper.appendChild(swatch);
            wrapper.appendChild(label);

            wrapper.addEventListener('click', () => {
                // Remove active from all
                Array.from(container.children).forEach(child => {
                    child.querySelector('.custom-swatch').classList.remove('border-[#FFE169]', 'scale-110');
                    child.querySelector('.custom-swatch').classList.add('border-transparent');
                    child.querySelector('.custom-swatch-label').classList.remove('text-[#FFE169]', 'text-[13px]');
                    child.querySelector('.custom-swatch-label').classList.add('text-slate-400', 'text-[10px]');
                });
                // Set active to clicked
                swatch.classList.remove('border-transparent');
                swatch.classList.add('border-[#FFE169]', 'scale-110');
                label.classList.remove('text-slate-400', 'text-[10px]');
                label.classList.add('text-[#FFE169]', 'text-[13px]');
                // Update hidden input
                hiddenInput.value = item._id;
            });

            container.appendChild(wrapper);
        });
    };

    // Dynamic Quick Prices from sessionStorage
    const loadQuickPrices = () => {
        let costPrices = [];
        let sellingPrices = [];
        try {
            const savedCost = sessionStorage.getItem('silmin_frequent_cost_prices');
            if (savedCost) costPrices = JSON.parse(savedCost);
            const savedSelling = sessionStorage.getItem('silmin_frequent_selling_prices');
            if (savedSelling) sellingPrices = JSON.parse(savedSelling);
        } catch (e) {
            console.error('Error loading frequent prices', e);
        }

        const defaultPrices = [15999, 25999, 32999, 45999];

        const getTopPrices = (pricesArray) => {
            // Robust parsing: extract numbers even if legacy format [{price:..., count:...}] was used
            let recent = Array.isArray(pricesArray)
                ? pricesArray.map(x => typeof x === 'object' && x !== null ? Number(x.price) : Number(x)).filter(x => !isNaN(x) && x > 0)
                : [];

            for (let def of defaultPrices) {
                if (recent.length >= 4) break;
                if (!recent.includes(def)) {
                    recent.push(def);
                }
            }
            return recent.slice(0, 4);
        };

        const topCostPrices = getTopPrices(costPrices);
        const topSellingPrices = getTopPrices(sellingPrices);

        const renderButtons = (containerId, targetId, topPricesArray) => {
            const container = document.getElementById(containerId);
            if (!container) return;
            container.innerHTML = '';
            topPricesArray.forEach(price => {
                const btn = document.createElement('button');
                btn.type = 'button';
                btn.className = 'btn-quick-price px-2.5 py-1 bg-[#333] text-slate-300 rounded-full text-[11px] hover:text-[#FFE169] border border-transparent hover:border-[#FFE169] transition-all';
                btn.textContent = Number(price).toLocaleString();
                btn.addEventListener('click', () => {
                    const input = document.getElementById(targetId);
                    if (input) {
                        input.value = price;
                        input.dispatchEvent(new Event('input', { bubbles: true }));
                    }
                });
                container.appendChild(btn);
            });
        };

        renderButtons('quick-price-cost-container', 'cost-price', topCostPrices);
        renderButtons('quick-price-selling-container', 'selling-price', topSellingPrices);
    };

    window.recordFrequentPrice = (price, type) => {
        if (!price || isNaN(price) || price <= 0) return;
        const p = Number(price);
        const storageKey = type === 'cost' ? 'silmin_frequent_cost_prices' : 'silmin_frequent_selling_prices';
        let prices = [];
        try {
            const saved = sessionStorage.getItem(storageKey);
            if (saved) prices = JSON.parse(saved);
        } catch (e) { }

        // Remove if exists to move it to the front
        prices = prices.filter(x => x !== p);
        prices.unshift(p);

        // Keep only top 10 recent
        prices = prices.slice(0, 10);
        sessionStorage.setItem(storageKey, JSON.stringify(prices));
        loadQuickPrices();
    };

    loadQuickPrices();

    // Auto record on blur
    const costInput = document.getElementById('cost-price');
    if (costInput) {
        costInput.addEventListener('change', (e) => {
            if (e.target.value) {
                window.recordFrequentPrice(e.target.value, 'cost');
            }
        });
    }

    const sellingInput = document.getElementById('selling-price');
    if (sellingInput) {
        sellingInput.addEventListener('change', (e) => {
            if (e.target.value) {
                window.recordFrequentPrice(e.target.value, 'selling');
            }
        });
    }


    const populateApproveImportBranchFilter = () => {
        const select = document.getElementById('approve-import-filter-branch');
        if (!select) return;

        const currentVal = select.value;
        select.innerHTML = '<option value="">ทุกสาขา</option>';
        if (window.masterDataCache && window.masterDataCache.branches) {
            window.masterDataCache.branches.forEach(branch => {
                const opt = document.createElement('option');
                opt.value = branch._id;
                opt.textContent = branch.name;
                select.appendChild(opt);
            });
        }
        select.value = currentVal;
    };
    window.populateApproveImportBranchFilter = populateApproveImportBranchFilter;

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
        toast.className = 'bg-canvas-elevated border border-hairline px-4 py-3 rounded-lg flex items-center justify-between gap-3 toast-animate min-w-[300px] pointer-events-auto transfer-toast';
        toast.innerHTML = `
            <div class="flex items-center gap-3">
                <div class="w-8 h-8 rounded-full bg-surface-chip flex items-center justify-center text-amber-400 shrink-0">
                    <i class="fa-solid fa-box text-sm"></i>
                </div>
                <div class="flex flex-col">
                    <span class="text-ink text-sm font-medium">📦 มีสินค้าโอนเข้าใหม่</span>
                    <span class="text-body-muted text-xs">จาก ${sourceBranch} จำนวน ${count} รายการ</span>
                </div>
            </div>
            <div class="flex items-center gap-2">
                <button class="view-transfer-btn text-xs bg-primary/20 text-primary px-2 py-1 rounded hover:bg-primary/30 transition-colors">ดูรายละเอียด</button>
                <button class="close-transfer-btn text-body-muted hover:text-ink transition-colors p-1"><i class="fa-solid fa-xmark"></i></button>
            </div>
        `;

        transferToastContainer.appendChild(toast);

        const timeoutId = setTimeout(() => toast.remove(), 8000);

        toast.querySelector('.close-transfer-btn').addEventListener('click', () => {
            clearTimeout(timeoutId);
            toast.remove();
        });

        toast.querySelector('.view-transfer-btn').addEventListener('click', async () => {
            clearTimeout(timeoutId);
            toast.remove();
            if (navTransfers) {
                await switchView('transfers');
                const tabIncoming = document.getElementById('transfer-tab-incoming');
                if (tabIncoming) tabIncoming.click();
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
                        statPending.classList.add('text-amber-400');
                        statPending.classList.remove('text-ink');
                    } else {
                        statPending.classList.add('text-ink');
                        statPending.classList.remove('text-amber-400');
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
            if (e.message === 'เซสชั่นหมดอายุ') {
                stopPendingTransferPolling();
            } else {
                console.error('Error polling pending transfers', e);
            }
        }
    };
    window.pollPendingTransfers = pollPendingTransfers;

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

        // สีสถานะ (เขียว/แดง/ส้ม/ฟ้า) เป็นข้อยกเว้นที่ตั้งใจไว้จากกฎ single-accent ของ DESIGN.md
        // เก็บไว้เฉพาะสีไอคอน + พื้นหลังแบบจางของ toast เท่านั้น ไม่ใช้เป็นเส้นขอบ
        let iconColor = 'text-blue-400';
        let bgColor = 'bg-blue-400/60';
        let icon = 'fa-circle-info';

        if (type === 'success' || type === 'confirm') {
            iconColor = 'text-emerald-400';
            bgColor = 'bg-emerald-400/60';
            icon = 'fa-circle-check';
        } else if (type === 'error' || type === 'danger') {
            iconColor = 'text-rose-400';
            bgColor = 'bg-rose-400/60';
            icon = 'fa-circle-xmark';
        } else if (type === 'warning') {
            iconColor = 'text-amber-400';
            bgColor = 'bg-amber-400/60';
            icon = 'fa-triangle-exclamation';
        } else { // info
            iconColor = 'text-blue-400';
            bgColor = 'bg-blue-400/60';
            icon = 'fa-circle-info';
        }

        toast.className = `${bgColor} border border-hairline px-4 py-3 rounded-lg flex items-center gap-3 toast-animate min-w-[240px] pointer-events-auto transition-all duration-300`;
        toast.innerHTML = `
            <div class="flex items-center justify-center w-8 h-8 rounded-sm bg-surface-chip flex-shrink-0">
                <i class="fa-solid ${icon} ${iconColor} text-base"></i>
            </div>
            <span class="text-ink text-sm font-medium pr-2 leading-tight">${message}</span>
        `;

        const container = toastContainer || document.getElementById('toast-container');
        if (!container) {
            console.warn('Toast container not found');
            return;
        }

        container.appendChild(toast);
        setTimeout(() => toast.remove(), 3000);
    };

    if (typeof window !== 'undefined') {
        window.showToast = showToast;
    }

    const showConfirm = (title, message, onConfirm, okText = 'ยืนยัน', type = null, widthClass = 'max-w-md') => {
        const modal = document.getElementById('custom-confirm-modal');
        const card = document.getElementById('confirm-card');
        const iconContainer = document.getElementById('confirm-icon-container');
        const iconEl = document.getElementById('confirm-icon');
        const okBtn = document.getElementById('confirm-ok-btn');
        const cancelBtn = document.getElementById('confirm-cancel-btn');

        if (cancelBtn) {
            cancelBtn.style.display = 'block';
            cancelBtn.textContent = 'ยกเลิก';
            cancelBtn.className = "flex-1 py-2.5 rounded-pill text-sm font-bold text-body-muted bg-surface-chip hover:bg-surface-tile-2 hover:text-ink transition-all active:scale-[0.98]";
        }

        // Auto-detect type if not provided
        let detectedType = type;
        if (!detectedType) {
            const t = title.toLowerCase();
            if (t.includes('ลบ') || t.includes('delete') || t.includes('remove') || t.includes('ยกเลิก') || t.includes('cancel')) {
                detectedType = 'danger';
            } else if (t.includes('อนุมัติ') || t.includes('สำเร็จ') || t.includes('รับ') || t.includes('นำเข้า') || t.includes('save') || t.includes('บันทึก') || t.includes('เสร็จสิ้น')) {
                detectedType = 'success';
            } else if (t.includes('พิมพ์') || t.includes('print') || t.includes('โอน')) {
                detectedType = 'info';
            } else {
                detectedType = 'warning';
            }
        }

        // Apply styles based on detectedType
        // Reset old dynamic classes first
        card.className = `modal-content bg-canvas-elevated border border-hairline rounded-lg w-full ${widthClass} p-6 text-center modal-animate-in transition-all duration-300`;
        iconContainer.className = "w-16 h-16 rounded-lg flex items-center justify-center mx-auto mb-4 border transition-all duration-300";
        iconEl.className = "text-2xl transition-transform duration-300 hover:scale-110";
        okBtn.className = "flex-1 py-2.5 rounded-pill text-sm font-bold transition-all active:scale-[0.98]";

        if (detectedType === 'danger') {
            iconContainer.classList.add('bg-rose-500/10', 'text-rose-400', 'border-rose-500/20');
            iconEl.classList.add('fa-solid', 'fa-trash-can');
            okBtn.classList.add('bg-red-500', 'hover:bg-red-600', 'text-white');
        } else if (detectedType === 'success') {
            iconContainer.classList.add('bg-emerald-500/10', 'text-emerald-400', 'border-emerald-500/20');
            iconEl.classList.add('fa-solid', 'fa-circle-check');
            okBtn.classList.add('bg-primary', 'hover:bg-primary-pressed', 'text-on-primary');
        } else if (detectedType === 'warning') {
            iconContainer.classList.add('bg-amber-500/10', 'text-amber-400', 'border-amber-500/20');
            iconEl.classList.add('fa-solid', 'fa-triangle-exclamation');
            okBtn.classList.add('bg-primary', 'hover:bg-primary-pressed', 'text-on-primary');
        } else { // info
            iconContainer.classList.add('bg-surface-chip', 'text-ink', 'border-hairline');
            iconEl.classList.add('fa-solid', 'fa-circle-info');
            okBtn.classList.add('bg-primary', 'hover:bg-primary-pressed', 'text-on-primary');
        }

        document.getElementById('confirm-title').textContent = title;
        document.getElementById('confirm-message').innerHTML = message;
        okBtn.textContent = okText;

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
    if (typeof window !== 'undefined') window.showConfirm = showConfirm;

    // แจ้งเตือนแบบปุ่มเดียว (ไม่มีอะไรให้ "ยกเลิก") ใช้ modal ตัวเดียวกับ showConfirm
    // เพื่อให้กล่องแจ้งเตือนทั้งระบบหน้าตาและจังหวะ animation เหมือนกันหมด
    const showAlert = (title, message, okText = 'รับทราบ', type = 'warning', onOk = null) => {
        showConfirm(title, message, () => { if (onOk) onOk(); }, okText, type);
        const cancelBtn = document.getElementById('confirm-cancel-btn');
        if (cancelBtn) cancelBtn.style.display = 'none';
    };
    if (typeof window !== 'undefined') window.showAlert = showAlert;

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
    window.showPrompt = showPrompt;

    // Top App Bar elements
    const topbarUserName = document.getElementById('topbar-user-name');
    const topbarUserRole = document.getElementById('topbar-user-role');
    const topbarUserAvatar = document.getElementById('topbar-user-avatar');

    // Helper to decode JWT token in frontend safely
    const parseJwt = (token) => {
        try {
            const base64Url = token.split('.')[1];
            const base64 = base64Url.replace(/-/g, '+').replace(/_/g, '/');
            const jsonPayload = decodeURIComponent(window.atob(base64).split('').map(function (c) {
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
            const navbarBranch = document.getElementById('navbar-branch');
            if (topbarUserName) topbarUserName.textContent = userName;
            if (topbarUserRole) topbarUserRole.textContent = userRole;
            if (topbarBranch) topbarBranch.textContent = branchName;
            if (navbarBranch) navbarBranch.textContent = branchName;

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

            const navbarBranch = document.getElementById('navbar-branch');
            if (navbarBranch) navbarBranch.textContent = branchNameFallback;

            const topbarUserNameTablet = document.getElementById('topbar-user-name-tablet');
            const topbarUserRoleTablet = document.getElementById('topbar-user-role-tablet');
            if (topbarUserNameTablet) topbarUserNameTablet.textContent = userNameFallback;
            if (topbarUserRoleTablet) topbarUserRoleTablet.textContent = userRoleFallback;

            const topbarUserNameMobile = document.getElementById('topbar-user-name-mobile');
            const topbarUserBranchMobile = document.getElementById('topbar-user-branch-mobile');
            if (topbarUserNameMobile) topbarUserNameMobile.textContent = userNameFallback;
            if (topbarUserBranchMobile) {
                topbarUserBranchMobile.innerHTML = `<i class="fa-solid fa-store text-[9px]"></i> <span> ${branchNameFallback}</span>`;
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

    // Global Navbar: system status (online/offline) + Thai date/time — เหมือนกันทุกหน้า
    // ใช้ navigator.onLine ของเบราว์เซอร์ ไม่มีการเรียก Backend ใหม่
    const initNavbarGlobalInfo = () => {
        const statusDot = document.getElementById('navbar-status-dot');
        const statusText = document.getElementById('navbar-status-text');
        const dateEl = document.getElementById('navbar-date');
        const timeEl = document.getElementById('navbar-time');
        if (!statusDot && !statusText && !dateEl && !timeEl) return;

        const thaiDateFormatter = new Intl.DateTimeFormat('th-TH', {
            day: 'numeric', month: 'short', year: 'numeric', timeZone: 'Asia/Bangkok'
        });
        const thaiTimeFormatter = new Intl.DateTimeFormat('th-TH', {
            hour: '2-digit', minute: '2-digit', hour12: false, timeZone: 'Asia/Bangkok'
        });

        const updateClock = () => {
            const now = new Date();
            if (dateEl) dateEl.textContent = thaiDateFormatter.format(now);
            if (timeEl) timeEl.textContent = `${thaiTimeFormatter.format(now)} น.`;
        };

        const updateStatus = () => {
            const online = navigator.onLine;
            if (statusText) statusText.textContent = online ? 'ระบบออนไลน์' : 'ระบบออฟไลน์';
            if (statusDot) {
                statusDot.classList.toggle('bg-emerald-500', online);
                statusDot.classList.toggle('bg-red-500', !online);
            }
        };

        updateClock();
        updateStatus();
        setInterval(updateClock, 15000);
        window.addEventListener('online', updateStatus);
        window.addEventListener('offline', updateStatus);
    };
    initNavbarGlobalInfo();

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

        // ฟังก์ชันช่วยในการซ่อน/แสดง โดยคำนึงถึง display properties
        const setVisible = (el, visible) => {
            if (!el) return;
            if (visible) {
                el.style.removeProperty('display');
                el.classList.remove('hidden');
            } else {
                el.style.setProperty('display', 'none', 'important');
                el.classList.add('hidden');
            }
        };

        // ซ่อน/แสดง เมนู Sidebar ตาม permissions
        setVisible(navDashboard, permissions.view_dashboard);
        setVisible(navStock, permissions.manage_stock);
        setVisible(navTransactions, permissions.do_pos);
        setVisible(navSalesHistory, permissions.do_pos);
        setVisible(navTransfers, permissions.manage_transfers);
        setVisible(navDeposits, permissions.manage_deposits);
        setVisible(navMovements, permissions.manage_stock);
        setVisible(navMembers, permissions.do_pos);
        setVisible(navPersonnel, permissions.manage_personnel);
        setVisible(navBranches, permissions.manage_branches);
        setVisible(navSettings, permissions.manage_settings);
        setVisible(navRoles, permissions.manage_roles);

        // เมนูใหม่
        setVisible(navReportArrival, permissions.report_arrival);
        setVisible(navApproveImport, permissions.approve_import);
        setVisible(navWarrantyCheck, permissions.do_pos);
        setVisible(navAccountingPO, permissions.manage_po);
        setVisible(navBranchReceive, permissions.receive_po);
        setVisible(navAccounting, permissions.manage_finance);
        setVisible(navAccountingSettings, permissions.manage_finance);
        setVisible(navDisbursement, permissions.manage_finance);
        setVisible(navBranchInventory, permissions.view_branch_inventory);

        // Mobile Nav Permissions mapping
        setVisible(mobileNavTransactions, permissions.do_pos);
        setVisible(mobileNavStock, permissions.manage_stock);
        setVisible(mobileNavAccountingPO, permissions.manage_po);
        setVisible(mobileNavMembers, permissions.do_pos);

        // Toggle Audit Logs Sidebar view
        setVisible(navAuditLogs, permissions.view_audit_logs);

        // ซ่อน/แสดง ปุ่มเพิ่มสินค้า + ลบสินค้า
        const btnAdd = document.getElementById('btn-add-product');
        setVisible(btnAdd, permissions.manage_stock);

        // ซ่อน/แสดง ฟิลเตอร์สาขาในเมนูจัดการสต็อก
        const stockFilterBranch = document.getElementById('stock-filter-branch');
        setVisible(stockFilterBranch, permissions.filter_stock_branch);

        setVisible(navDailySummary, permissions.view_daily_summary);
        setVisible(mobileNavDailySummary, permissions.view_daily_summary);

        setVisible(navStockAudit, permissions.do_stock_audit);
        setVisible(mobileNavStockAudit, permissions.do_stock_audit);
        setVisible(navStockAuditReview, permissions.manage_stock_audit);

        // ซ่อน/แสดงหัวข้อกลุ่มเมนู (nav-section-header) อัตโนมัติ:
        // ถ้าเมนูทุกอันในหมวดหมู่นั้นถูกซ่อนหมด (ตาม permissions ด้านบน) ให้ซ่อนชื่อกลุ่มไปด้วย
        // เช็คจาก DOM จริงหลัง setVisible ทำงานเสร็จ แทนที่จะ hardcode เงื่อนไข permission ต่อกลุ่ม
        // เพื่อให้ยังถูกต้องแม้จะมีการเพิ่ม/ย้ายเมนูระหว่างกลุ่มในอนาคต
        const sectionHeaders = document.querySelectorAll('#sidebar .nav-section-header');
        sectionHeaders.forEach((header) => {
            let sibling = header.nextElementSibling;
            let hasVisibleItem = false;
            while (sibling && !sibling.classList.contains('nav-section-header')) {
                if (sibling.classList.contains('nav-menu-item') && !sibling.classList.contains('hidden') && sibling.style.display !== 'none') {
                    hasVisibleItem = true;
                    break;
                }
                sibling = sibling.nextElementSibling;
            }
            setVisible(header, hasVisibleItem);
        });

        // เก็บ permissions ไว้ใน window สำหรับใช้ตรวจสอบใน renderProductTable
        window.__userPermissions = permissions;
    };

    // Skeleton loading แถวตารางสต็อก — แสดงระหว่างรอข้อมูลสินค้าจาก server ครั้งแรก (ก่อน renderProductTable มีข้อมูลจริงมาแทนที่)
    const renderStockTableSkeleton = (rowCount = 8) => {
        if (!productTableBody) return;
        const bar = (widthClass, extraClass = '') => `<div class="h-3.5 ${widthClass} rounded-full bg-[#5c5c5c] animate-pulse ${extraClass}"></div>`;
        let rowsHtml = '';
        for (let i = 0; i < rowCount; i++) {
            rowsHtml += `
                <tr>
                    <td class="px-6 py-4">${bar('w-20')}</td>
                    <td class="px-6 py-4">
                        <div class="flex items-center gap-3">
                            <div class="w-10 h-10 rounded-full bg-[#5c5c5c] animate-pulse flex-shrink-0"></div>
                            <div class="space-y-2">
                                ${bar('w-32')}
                                ${bar('w-20 h-2.5')}
                            </div>
                        </div>
                    </td>
                    <td class="px-6 py-4">${bar('w-24')}</td>
                    <td class="px-6 py-4">${bar('w-24')}</td>
                    <td class="px-6 py-4">${bar('w-16')}</td>
                    <td class="px-6 py-4 text-right">${bar('w-16 ml-auto')}</td>
                    <td class="px-6 py-4 text-center">${bar('w-10 mx-auto')}</td>
                    <td class="px-6 py-4">${bar('w-20')}</td>
                    <td class="px-6 py-4">
                        <div class="flex items-center justify-end gap-2">
                            <div class="w-8 h-8 rounded-lg bg-[#5c5c5c] animate-pulse"></div>
                            <div class="w-8 h-8 rounded-lg bg-[#5c5c5c] animate-pulse"></div>
                        </div>
                    </td>
                </tr>
            `;
        }
        productTableBody.innerHTML = rowsHtml;
    };

    // Fetch All Products
    async function fetchProducts() {
        renderStockTableSkeleton();
        try {
            await ensureMasterDataLoaded();
            const response = await authFetch(`${API_BASE_URL}/products`);
            const json = await response.json();
            if (json.success) {
                allProductsCache = Array.isArray(json.data) ? json.data : [];
                window.allProductsCache = allProductsCache;

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
    window.fetchProducts = fetchProducts;

    const renderProductTable = (products, append = false) => {
        if (!productTableBody) return;
        if (!append) productTableBody.innerHTML = '';

        if (products.length === 0) {
            if (!append) {
                productTableBody.innerHTML = `
                    <tr>
                        <td colspan="9" class="px-6 py-8 text-center text-slate-400 italic">
                            ไม่พบสินค้าที่ค้นหา
                        </td>
                    </tr>
                `;
            }
            return;
        }

        products.forEach(product => {
            const row = document.createElement('tr');
            row.className = 'hover:bg-[#464646] transition-colors';

            const categoryName = product.type_id ? product.type_id.name : 'ทั่วไป';
            const unitName = product.unit_id ? product.unit_id.name : '';
            const colorName = product.color_id ? product.color_id.name : '';
            const capacityName = product.capacity_id ? product.capacity_id.name : '';
            const conditionName = product.condition_id ? product.condition_id.name : '';

            const iconColorHex = colorName
                ? resolveProductColorHex(colorName, product.color_id, '#cbd5e1')
                : '#cbd5e1'; // default slate-300

            const isDevice = checkIsDevice(categoryName, product);
            const stockDisplay = isDevice
                ? `${product.quantity || product.imeis.length} <span class="text-xs text-white font-normal">เครื่อง</span>`
                : `${product.quantity} <span class="text-xs text-white font-normal">${unitName}</span>`;

            let statusColor = (product.quantity) > 0 ? 'bg-[#20D500]' : 'bg-[#FE0000]';
            let statusText = (product.quantity) > 0 ? 'มีสินค้า' : 'สินค้าหมด';
            let statusClass = (product.quantity) > 0 ? 'text-[#20D500]' : 'text-[#FE0000]';
            let statusBadge = (product.quantity) > 0 ? 'bg-[#42A231]/[0.12]' : 'bg-[#FE0000]/[0.12]';

            if (product.is_transferring) {
                statusColor = 'bg-orange-500';
                statusText = 'กำลังโอนย้าย';
                statusClass = 'text-orange-600';
                statusBadge = 'bg-orange-50 border border-orange-200';
            }

            row.innerHTML = `
                <td class="px-6 py-4">
                    <span class=" font-mono text-md text-center font-semibold text-[#FFE169]  ">${product.product_code || '-'}</span>
                </td>
                <td class="px-6 py-4">
                    <div class="flex items-center gap-3">
                        <div class="w-10 h-10 flex items-center py-1 px-0.5 rounded-full justify-center" style="color: ${iconColorHex}; background-color: ${iconColorHex}33; border: 1px solid ${iconColorHex};">
                            <i class="fa-solid ${isDevice ? 'fa-mobile-screen' : 'fa-box'} text-xl"></i>
                        </div>
                        <div>
                            <p class="font-medium text-white">${product.name}</p>
                            <p class="text-xs text-white/70">${capacityName} ${colorName} ${conditionName}</p>
                        </div>
                    </div>
                </td>
                <td class="px-6 py-4 text-white text-sm">${product.branch_id ? product.branch_id.name : '-'}</td>
                <td class="px-6 py-4 text-white text-sm">${product.supplier_id ? product.supplier_id.name : '-'}</td>
                <td class="px-6 py-4"><span class="px-2.5 py-1 bg-slate-700 text-slate-300 rounded-[0.375rem] text-xs font-medium">${categoryName}</span></td>
                <td class="px-6 py-4 text-right text-white font-mono">฿${product.selling_price.toLocaleString()}</td>
                <td class="px-6 py-4 text-center text-white font-medium">${stockDisplay}</td>
                <td class="px-6 py-4">
                    <div class="inline-flex items-center gap-2 px-2.5 py-1 rounded-[0.375rem] ${statusBadge}">
                        <div class="w-2 h-2 rounded-full ${statusColor}"></div>
                        <span class="${statusClass} font-medium text-xs">${statusText}</span>
                    </div>
                </td>
                <td class="px-6 py-4 text-right">
                    <div class="flex items-center justify-end gap-1">
                        <button class="print-barcode-btn text-white hover:text-amber-400 transition-colors p-2" data-id="${product._id}" title="พิมพ์บาร์โค้ด"><i class="fa-solid fa-print"></i></button>
                        <button class="view-product-btn text-white hover:text-indigo-400 transition-colors p-2" data-id="${product._id}" title="ดูรายละเอียด"><i class="fa-solid fa-eye"></i></button>
                        ${window.__userPermissions && window.__userPermissions.delete_stock ? `<button class="delete-product-btn text-white hover:text-red-400 transition-colors p-2" data-id="${product._id}"><i class="fa-solid fa-trash"></i></button>` : ''}
                    </div>
                </td>
            `;
            productTableBody.appendChild(row);

            // Attach listeners to buttons
            const printBtn = row.querySelector('.print-barcode-btn');
            if (printBtn) printBtn.addEventListener('click', () => openBarcodeModal(product));
            row.querySelector('.view-product-btn').addEventListener('click', () => openViewProductModal(product));
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

    const closeDetailModal = (modalId) => {
        const modal = document.getElementById(modalId);
        if (!modal) return;
        modal.classList.add('opacity-0', 'pointer-events-none');
        const card = modal.querySelector('.relative.w-full');
        if (card) {
            card.classList.add('scale-95');
            card.classList.remove('scale-100');
        }
        setTimeout(() => modal.classList.add('hidden'), 300);
    };
    window.closeDetailModal = closeDetailModal;

    const openViewProductModal = (product) => {
        document.getElementById('v-product-name').textContent = product.name || '-';
        document.getElementById('v-product-code').textContent = product.product_code || '-';
        document.getElementById('v-product-category').textContent = product.type_id ? product.type_id.name : 'ทั่วไป';
        document.getElementById('v-product-branch').textContent = product.branch_id ? product.branch_id.name : '-';
        document.getElementById('v-product-supplier').textContent = product.supplier_id ? product.supplier_id.name : '-';
        document.getElementById('v-product-cost').textContent = `฿${(product.cost_price || 0).toLocaleString()}`;
        document.getElementById('v-product-sell').textContent = `฿${(product.selling_price || 0).toLocaleString()}`;
        const colorName = product.color_id ? product.color_id.name : '-';
        if (colorName !== '-') {
            const bgCol = resolveProductColorHex(colorName, product.color_id);

            document.getElementById('v-product-color').innerHTML = `<div class="w-4 h-4 rounded-full flex-shrink-0" style="background-color: ${bgCol};"></div> <span>${colorName}</span>`;
        } else {
            document.getElementById('v-product-color').innerHTML = '<span>-</span>';
        }
        document.getElementById('v-product-capacity').textContent = product.capacity_id ? product.capacity_id.name : '-';
        document.getElementById('v-product-condition').textContent = product.condition_id ? product.condition_id.name : '-';

        const categoryName = product.type_id ? product.type_id.name : 'ทั่วไป';
        const unitName = product.unit_id ? product.unit_id.name : '';
        const isDevice = checkIsDevice(categoryName, product);
        const stockQty = isDevice ? (product.quantity || (product.imeis ? product.imeis.length : 0)) : product.quantity;
        const unitText = isDevice ? 'เครื่อง' : (unitName || 'ชิ้น');
        document.getElementById('v-product-qty').textContent = `${stockQty} ${unitText}`;

        const imeisSection = document.getElementById('v-product-imeis-section');
        const imeisList = document.getElementById('v-product-imeis-list');
        if (imeisSection && imeisList) {
            if (isDevice && product.imeis && product.imeis.length > 0) {
                imeisSection.classList.remove('hidden');
                imeisList.innerHTML = product.imeis.map(imei => `
                    <span class="px-2.5 py-1 bg-slate-900 border border-slate-800 text-cyan-400 font-mono text-[11px] rounded-[0.5rem] flex items-center gap-1.5 shadow-sm">
                        <i class="fa-solid fa-barcode text-cyan-500/70"></i> ${imei}
                    </span>
                `).join('');
            } else {
                imeisSection.classList.add('hidden');
                imeisList.innerHTML = '';
            }
        }

        const modal = document.getElementById('modal-product-view');
        if (modal) {
            modal.classList.remove('hidden');
            void modal.offsetWidth;
            modal.classList.remove('opacity-0', 'pointer-events-none');
            const card = modal.querySelector('.relative.w-full');
            if (card) {
                card.classList.remove('scale-95');
                card.classList.add('scale-100');
            }
        }

        // Bind Edit button from details modal
        const editBtn = document.getElementById('edit-product-from-view-btn');
        if (editBtn) {
            editBtn.onclick = () => {
                closeDetailModal('modal-product-view');
                editProduct(product);
            };
        }
    };

    // Close handlers for Product View Modal
    const closeProductBtn = document.getElementById('close-product-view-btn');
    if (closeProductBtn) closeProductBtn.onclick = () => closeDetailModal('modal-product-view');
    const closeProductBtnBottom = document.getElementById('close-product-view-btn-bottom');
    if (closeProductBtnBottom) closeProductBtnBottom.onclick = () => closeDetailModal('modal-product-view');

    // Close handlers for PO View Modal (Global to support both Receive PO and AP Queue)
    const closePoBtn = document.getElementById('btn-close-po-view');
    if (closePoBtn) closePoBtn.onclick = () => closeDetailModal('modal-po-view');
    const closePoBtnBottom = document.getElementById('btn-close-po-view-bottom');
    if (closePoBtnBottom) closePoBtnBottom.onclick = () => closeDetailModal('modal-po-view');

    const editProduct = async (product) => {
        // Change Modal Title
        const modalTitle = document.getElementById('modal-title');
        if (modalTitle) modalTitle.innerHTML = `<i class="fa-solid fa-pen-to-square text-cyan-400"></i> แก้ไขข้อมูลสินค้า`;

        // Hide Excel Button in modal header when editing
        const btnExcelOpen = document.getElementById('btn-add-product-excel');
        if (btnExcelOpen) btnExcelOpen.classList.add('hidden');

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
        const hasDeviceAttributes = checkIsDevice(categoryName, product);
        handleCategoryFields(categoryName, hasDeviceAttributes);

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
        const isDevice = checkIsDevice(categoryName, product);

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
                        <p class="text-xs text-slate-400 text-right mt-1">สูงสุด: ${maxQty} ดวง</p>
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
            const isDevice = checkIsDevice(categoryName, currentBarcodeProduct);
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

                    // สลับไปหน้าแรกตามสิทธิ์การเข้าถึง หรือหน้าที่ค้างอยู่ใน URL hash ถ้ามี (switchView จะโหลดข้อมูลเฉพาะหน้านั้นให้เอง)
                    switchView(getViewFromHash() || getDefaultViewForUser(result.data.permissions));

                    // ข้อมูลกลางที่หลายหน้าใช้ร่วมกัน (dropdown ต่างๆ)
                    fetchMasterData();
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
    // Backdrop helper functions for mobile sidebar drawer
    const addSidebarBackdrop = () => {
        let backdrop = document.getElementById('sidebar-backdrop');
        if (!backdrop) {
            backdrop = document.createElement('div');
            backdrop.id = 'sidebar-backdrop';
            backdrop.className = 'fixed inset-0 z-[43] bg-slate-950/60 backdrop-blur-sm opacity-0 transition-opacity duration-300 md:hidden';
            document.body.appendChild(backdrop);

            // Trigger animation
            void backdrop.offsetWidth;
            backdrop.classList.remove('opacity-0');
            backdrop.classList.add('opacity-100');

            // Close sidebar when clicking backdrop
            backdrop.addEventListener('click', () => {
                sidebar.classList.remove('translate-x-0');
                sidebar.classList.add('-translate-x-full');
                removeSidebarBackdrop();
            });
        }
    };

    const removeSidebarBackdrop = () => {
        const backdrop = document.getElementById('sidebar-backdrop');
        if (backdrop) {
            backdrop.classList.remove('opacity-100');
            backdrop.classList.add('opacity-0');
            setTimeout(() => {
                if (backdrop.parentNode) {
                    backdrop.parentNode.removeChild(backdrop);
                }
            }, 300);
        }
    };

    toggleSidebarBtn.addEventListener('click', () => {
        if (window.innerWidth < 768) {
            // Mobile toggle drawer behavior
            if (sidebar.classList.contains('translate-x-0')) {
                sidebar.classList.remove('translate-x-0');
                sidebar.classList.add('-translate-x-full');
                removeSidebarBackdrop();
            } else {
                sidebar.classList.remove('-translate-x-full');
                sidebar.classList.add('translate-x-0');
                addSidebarBackdrop();
            }
        } else {
            // Desktop toggle behavior
            if (sidebar.classList.contains('sidebar-expanded')) {
                sidebar.classList.remove('sidebar-expanded');
                sidebar.classList.add('sidebar-collapsed');
            } else {
                sidebar.classList.remove('sidebar-collapsed');
                sidebar.classList.add('sidebar-expanded');
            }
        }
    });

    const handleResize = () => {
        if (window.innerWidth < 768) {
            sidebar.classList.remove('sidebar-collapsed');
            sidebar.classList.add('sidebar-expanded');
            if (!sidebar.classList.contains('translate-x-0') && !sidebar.classList.contains('-translate-x-full')) {
                sidebar.classList.add('-translate-x-full');
            }
        } else {
            sidebar.classList.remove('sidebar-collapsed');
            sidebar.classList.add('sidebar-expanded');
            sidebar.classList.remove('-translate-x-full', 'translate-x-0');
            removeSidebarBackdrop();
        }
    };

    handleResize();
    window.addEventListener('resize', handleResize);

    if (closeModalBtn) closeModalBtn.addEventListener('click', closeModal);
    if (cancelModalBtn) cancelModalBtn.addEventListener('click', closeModal);
    if (addProductModal) {
        addProductModal.addEventListener('click', (e) => {
            if (e.target === addProductModal) closeModal();
        });
    }

    // ==========================================
    // Dynamic Form Logic
    // ==========================================
    if (productCategory) {
        productCategory.addEventListener('change', (e) => {
            const selectedOption = e.target.options[e.target.selectedIndex];
            const categoryName = selectedOption ? selectedOption.textContent : '';
            handleCategoryFields(categoryName);
        });
    }

    if (productName) {
        productName.addEventListener('change', (e) => {
            // The #product-name <option> values are populated with the product's name
            // text (see json.data.productNames rendering above), not its _id, so lookups
            // must match on .name — matching on ._id here always misses and wipes
            // any product code the user already typed.
            const selectedName = e.target.value;
            if (productCode) {
                if (window.masterDataCache && Array.isArray(window.masterDataCache.productNames)) {
                    const matched = window.masterDataCache.productNames.find(x => x.name === selectedName);
                    if (matched && matched.code) {
                        productCode.value = matched.code;
                    } else {
                        productCode.value = '';
                    }
                } else {
                    productCode.value = '';
                }
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
            const originalBtnText = submitBtn ? submitBtn.innerHTML : 'บันทึกสินค้า';

            try {
                // Collect branch from input
                const branch_id = productBranch ? productBranch.value : null;

                // Build payload
                const nameValue = productName ? productName.value.trim() : '';

                // Highlight helper function
                const highlightInvalidInput = (element, message) => {
                    if (!element) return;
                    showToast(message, 'error');

                    let displayElement = element;
                    let isButton = false;

                    if (element.tagName === 'SELECT' || element.type === 'hidden') {
                        isButton = true;
                    }

                    // If input is hidden (e.g. category, color), highlight its container instead
                    if (element.type === 'hidden') {
                        const container = document.getElementById(element.id + '-container');
                        if (container) displayElement = container;
                    }

                    if (element.focus && typeof element.focus === 'function' && element.type !== 'hidden') {
                        element.focus();
                    } else if (displayElement.scrollIntoView) {
                        displayElement.scrollIntoView({ behavior: 'smooth', block: 'center' });
                    }

                    // Remove any existing highlights first
                    document.querySelectorAll('.invalid-highlight').forEach(el => {
                        // Do not remove p-2 or rounded-xl to avoid stripping them from elements that inherently have them
                        el.classList.remove('!border-red-500', '!ring-2', '!ring-red-500/20', 'invalid-highlight');
                    });

                    // Remove any existing inline text messages
                    document.querySelectorAll('.invalid-inline-msg').forEach(el => el.remove());

                    // Highlight current element
                    displayElement.classList.add('!border-red-500', '!ring-2', '!ring-red-500/20', 'invalid-highlight');
                    if (displayElement !== element) {
                        displayElement.classList.add('p-2', 'rounded-xl'); // Add padding for pill containers
                    }

                    // Create inline error text
                    const errorText = document.createElement('p');
                    errorText.className = 'invalid-inline-msg text-red-500 text-[11px] mt-1.5 ml-1 font-medium animate-pulse';
                    const prefixMsg = isButton ? 'กรุณาเลือกข้อมูล' : 'กรุณากรอกข้อมูล';
                    errorText.innerHTML = `<i class="fa-solid fa-circle-exclamation mr-1"></i> ${prefixMsg}`;

                    // Insert the error text right after the display element
                    displayElement.parentNode.insertBefore(errorText, displayElement.nextSibling);

                    // Remove highlight when user types or selects
                    const removeHighlight = () => {
                        displayElement.classList.remove('!border-red-500', '!ring-2', '!ring-red-500/20', 'invalid-highlight');
                        if (errorText.parentNode) errorText.remove();
                        element.removeEventListener('input', removeHighlight);
                        element.removeEventListener('change', removeHighlight);
                        displayElement.removeEventListener('click', removeHighlight);
                    };
                    element.addEventListener('input', removeHighlight);
                    element.addEventListener('change', removeHighlight);
                    displayElement.addEventListener('click', removeHighlight);
                };

                // Manual Validation for Required inputs (in visual order)
                if (!nameValue) {
                    highlightInvalidInput(productName, 'กรุณาระบุชื่อสินค้า (Product Name)');
                    return;
                }
                if (productCode && !productCode.value.trim()) {
                    highlightInvalidInput(productCode, 'กรุณาระบุรหัสสินค้า (Product Code)');
                    return;
                }
                if (productCategory && !productCategory.value) {
                    highlightInvalidInput(productCategory, 'กรุณาเลือกหมวดหมู่สินค้า (Category)');
                    return;
                }
                if (productColor && !productColor.value) {
                    highlightInvalidInput(productColor, 'กรุณาเลือกสีสินค้า (Color)');
                    return;
                }

                // For custom UI, we might always validate these if they are relevant
                if (productCapacity && !productCapacity.value) {
                    highlightInvalidInput(productCapacity, 'กรุณาเลือกความจุอุปกรณ์ (Capacity)');
                    return;
                }

                const costPriceElement = document.getElementById('cost-price');
                const sellingPriceElement = document.getElementById('selling-price');

                if (costPriceElement && costPriceElement.value.trim() === '') {
                    highlightInvalidInput(costPriceElement, 'กรุณาระบุราคาต้นทุน (Cost Price)');
                    return;
                }
                if (sellingPriceElement && sellingPriceElement.value.trim() === '') {
                    highlightInvalidInput(sellingPriceElement, 'กรุณาระบุราคาขาย (Selling Price)');
                    return;
                }
                if (productQuantity && (productQuantity.value.trim() === '' || Number(productQuantity.value) <= 0)) {
                    highlightInvalidInput(productQuantity, 'กรุณากรอกจำนวนสินค้าให้มากกว่า 0');
                    return;
                }
                if (productBranch && !productBranch.value) {
                    highlightInvalidInput(productBranch, 'กรุณาระบุสาขาที่จัดเก็บ (Branch)');
                    return;
                }
                if (productSupplier && !productSupplier.value) {
                    highlightInvalidInput(productSupplier, 'กรุณาเลือกผู้จัดจำหน่าย (Supplier)');
                    return;
                }
                if (productUnit && !productUnit.value) {
                    highlightInvalidInput(productUnit, 'กรุณาเลือกหน่วยนับสินค้า (Unit)');
                    return;
                }

                const payload = {
                    product_code: productCode ? productCode.value.trim() : '',
                    supplier_id: productSupplier ? productSupplier.value : null,
                    name: nameValue,
                    type_id: productCategory ? productCategory.value : '',
                    color_id: productColor ? productColor.value : null,
                    cost_price: Number(document.getElementById('cost-price') ? document.getElementById('cost-price').value : 0),
                    selling_price: Number(document.getElementById('selling-price') ? document.getElementById('selling-price').value : 0),
                    unit_id: productUnit ? productUnit.value : null,
                    capacity_id: productCapacity ? productCapacity.value : null,
                    condition_id: productCondition ? productCondition.value : null,
                    branch_id: branch_id || null,
                    quantity: Number(productQuantity ? productQuantity.value : 1) || 1,
                    old_branch_id: window.__editingProductOriginalBranchId || null,
                    import_source: 'MANUAL'
                };

                // product-imeis is not used during initial product creation, but checking in case it's in the DOM
                const productImeis = document.getElementById('product-imeis');
                if (productImeis && !productImeis.closest('.hidden')) {
                    payload.imeis = productImeis.value.split('\n').filter(i => i.trim() !== '');
                    if (payload.imeis.length === 0) {
                        showToast('กรุณาระบุ IMEI อย่างน้อย 1 รายการ', 'error');
                        return;
                    }
                }

                // Show Loading State
                if (submitBtn) {
                    submitBtn.disabled = true;
                    submitBtn.innerHTML = `<i class="fa-solid fa-circle-notch fa-spin mr-2"></i> กำลังบันทึก...`;
                }

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
                    if (window.recordFrequentPrice) {
                        window.recordFrequentPrice(payload.cost_price, 'cost');
                        window.recordFrequentPrice(payload.selling_price, 'selling');
                    }
                    closeModal();
                    await fetchProducts(); // Refresh Table
                } else {
                    showToast('เกิดข้อผิดพลาด: ' + result.message, 'error');
                }
            } catch (error) {
                console.error('Error saving product:', error);
                showToast('เกิดข้อผิดพลาดในการบันทึกข้อมูล: ' + error.message, 'error');
            } finally {
                // Reset Button
                if (submitBtn) {
                    submitBtn.disabled = false;
                    submitBtn.innerHTML = originalBtnText;
                }
            }
        });
    }

    // รายชื่อ view ทั้งหมดที่ switchView รู้จัก — ใช้ตรวจสอบค่าจาก URL hash ว่าถูกต้องก่อนใช้งาน
    const VALID_VIEW_NAMES = new Set([
        'dashboard', 'stock', 'transactions', 'personnel', 'branches', 'settings', 'roles',
        'sales-history', 'daily-summary', 'transfers', 'deposits', 'movements', 'members',
        'report-arrival', 'approve-import', 'warranty-check', 'branch-inventory', 'accounting-po',
        'branch-receive', 'accounting', 'audit-logs', 'stock-audit', 'stock-audit-review',
        'accounting-settings', 'disbursement'
    ]);
    // อ่านชื่อ view จาก URL hash (เช่น #deposits) — คืนค่า null ถ้าไม่มีหรือไม่ใช่ view ที่รู้จัก
    const getViewFromHash = () => {
        const name = (location.hash || '').replace(/^#/, '');
        return VALID_VIEW_NAMES.has(name) ? name : null;
    };

    const getDefaultViewForUser = (permissions) => {
        if (!permissions) return 'dashboard';
        if (permissions.view_dashboard) return 'dashboard';
        if (permissions.do_pos) return 'transactions';
        if (permissions.manage_stock) return 'stock';
        if (permissions.view_branch_inventory) return 'branch-inventory';
        if (permissions.manage_po) return 'accounting-po';

        const viewPermissionMap = {
            'dashboard': 'view_dashboard',
            'stock': 'manage_stock',
            'transactions': 'do_pos',
            'personnel': 'manage_personnel',
            'branches': 'manage_branches',
            'settings': 'manage_settings',
            'roles': 'manage_roles',
            'sales-history': 'do_pos',
            'daily-summary': 'view_daily_summary',
            'transfers': 'manage_transfers',
            'movements': 'manage_stock',
            'members': 'do_pos',
            'report-arrival': 'report_arrival',
            'approve-import': 'approve_import',
            'warranty-check': 'do_pos',
            'branch-inventory': 'view_branch_inventory',
            'accounting-po': 'manage_po',
            'branch-receive': 'receive_po',
            'accounting': 'manage_finance',
            'audit-logs': 'view_audit_logs',
            'stock-audit': 'do_stock_audit',
            'stock-audit-review': 'manage_stock_audit',
            'accounting-settings': 'manage_finance',
            'disbursement': 'manage_finance'
        };

        for (const [view, perm] of Object.entries(viewPermissionMap)) {
            if (permissions[perm]) return view;
        }
        return 'dashboard';
    };

    const switchView = async (viewName) => {
        // ตรวจสอบสิทธิ์การเข้าถึง View ก่อนเปลี่ยนหน้า
        const savedUserData = localStorage.getItem('silmin_user');
        let userPermissions = {};
        if (savedUserData) {
            try {
                userPermissions = JSON.parse(savedUserData).permissions || {};
            } catch (e) { }
        }

        const viewPermissionMap = {
            'dashboard': 'view_dashboard',
            'stock': 'manage_stock',
            'transactions': 'do_pos',
            'personnel': 'manage_personnel',
            'branches': 'manage_branches',
            'settings': 'manage_settings',
            'roles': 'manage_roles',
            'sales-history': 'do_pos',
            'daily-summary': 'view_daily_summary',
            'transfers': 'manage_transfers',
            'movements': 'manage_stock',
            'members': 'do_pos',
            'report-arrival': 'report_arrival',
            'approve-import': 'approve_import',
            'warranty-check': 'do_pos',
            'branch-inventory': 'view_branch_inventory',
            'accounting-po': 'manage_po',
            'branch-receive': 'receive_po',
            'accounting': 'manage_finance',
            'audit-logs': 'view_audit_logs',
            'stock-audit': 'do_stock_audit',
            'stock-audit-review': 'manage_stock_audit',
            'accounting-settings': 'manage_finance',
            'disbursement': 'manage_finance'
        };

        const requiredPermission = viewPermissionMap[viewName];
        if (requiredPermission && !userPermissions[requiredPermission]) {
            // Silently redirect to default allowed view if not authorized
            const defaultView = getDefaultViewForUser(userPermissions);
            if (viewName !== defaultView) {
                switchView(defaultView);
            }
            return;
        }

        // จำหน้าปัจจุบันไว้ใน URL hash เพื่อให้กด refresh แล้วยังอยู่หน้าเดิม (ดู getViewFromHash + auto-login)
        if (location.hash !== `#${viewName}`) {
            history.replaceState(null, '', `#${viewName}`);
        }

        // ล้างข้อมูลตะกร้าสินค้าเมื่อเปลี่ยนไปหน้าอื่นที่ไม่ใช่หน้ารายการขาย (transactions)
        if (viewName !== 'transactions') {
            if (typeof cart !== 'undefined' && Array.isArray(cart) && cart.length > 0) {
                cart = [];
                if (typeof renderCart === 'function') {
                    renderCart();
                }
            }
            // Hide mobile cart FAB on non-POS views
            const _fab = document.getElementById('pos-mobile-cart-fab');
            if (_fab) _fab.style.display = 'none';
            const _overlay = document.getElementById('pos-mobile-cart-overlay');
            const _panel = document.getElementById('pos-mobile-cart-panel');
            if (_overlay) { _overlay.classList.remove('active'); _overlay.style.display = 'none'; }
            if (_panel) { _panel.classList.remove('active'); _panel.style.display = 'none'; }
        }

        // Auto-close audit verify and review modals when switching views
        if (typeof closeAuditVerifyModal === 'function') {
            closeAuditVerifyModal();
        }
        if (typeof closeAuditReviewItemModal === 'function') {
            closeAuditReviewItemModal();
        }

        // Reset all active states
        document.querySelectorAll('.nav-menu-item').forEach(item => {
            item.classList.remove('active');
        });

        // Reset all mobile bottom nav items active states
        const mobileNavItems = [mobileNavTransactions, mobileNavStock, mobileNavAccountingPO, mobileNavMembers];
        mobileNavItems.forEach(item => {
            if (item) {
                item.classList.remove('text-primary', 'scale-105', 'font-semibold');
                item.classList.add('text-body-muted');
            }
        });

        // Auto-close mobile sidebar when switching views
        if (window.innerWidth < 768) {
            if (sidebar && sidebar.classList.contains('translate-x-0')) {
                sidebar.classList.remove('translate-x-0');
                sidebar.classList.add('-translate-x-full');
                removeSidebarBackdrop();
            }
        }

        const views = [
            viewDashboard, viewStock, viewTransactions, viewPersonnel,
            viewBranches, viewSettings, viewRoles, viewSalesHistory,
            viewTransfers, viewMovements, viewMembers,
            viewReportArrival, viewApproveImport, viewWarrantyCheck,
            viewBranchInventory, viewAccountingPO, viewBranchReceive,
            viewAuditLogs, viewAccounting, viewDailySummary,
            viewStockAudit, viewStockAuditReview, viewDeposits,
            viewAccountingSettings, viewDisbursement
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
                nav.classList.add('active');
            }
        };

        // Helper to activate mobile nav item
        const activateMobileNav = (mobileNav) => {
            if (mobileNav) {
                mobileNav.classList.remove('text-body-muted');
                mobileNav.classList.add('text-primary', 'scale-105', 'font-semibold');
            }
        };

        try {
            if (viewName === 'dashboard') {
                activateView(viewDashboard, navDashboard);
                await loadPageView('dashboard');
                await loadPageScript('dashboard');
                if (typeof loadDashboardData === 'function') loadDashboardData();
                if (!window.__isDashboardCardBound) {
                    window.__isDashboardCardBound = true;
                    const cardPendingTransfer = document.getElementById('card-pending-transfer');
                    if (cardPendingTransfer) {
                        cardPendingTransfer.addEventListener('click', async () => {
                            if (navTransfers) {
                                await switchView('transfers');
                                const tabIncoming = document.getElementById('transfer-tab-incoming');
                                if (tabIncoming) tabIncoming.click();
                            }
                        });
                    }
                }
            }
            else if (viewName === 'stock') {
                activateView(viewStock, navStock);
                activateMobileNav(mobileNavStock);
                allProductsCache = []; // Clear cache to ensure fresh data including transferring items
                window.allProductsCache = allProductsCache;
                await fetchProducts();
            }
            else if (viewName === 'transactions') {
                activateView(viewTransactions, navTransactions);
                activateMobileNav(mobileNavTransactions);
                // โหลดสินค้าสำหรับ POS (Backend จะกรองตามสาขาอัตโนมัติสำหรับพนักงานขาย)
                await fetchPosProducts();
                updatePosBranchBadge();
                // Show floating cart FAB below the desktop two-column breakpoint (lg, 1024px) —
                // matches the POS layout's own flex-col -> lg:flex-row stacking point, so there's
                // no dead zone between the mobile FAB and the desktop side-by-side cart column.
                const _posFab = document.getElementById('pos-mobile-cart-fab');
                if (_posFab && window.innerWidth < 1024) _posFab.style.display = 'flex';
            }
            else if (viewName === 'personnel') {
                activateView(viewPersonnel, navPersonnel);
                await loadPageView('personnel');
                await loadPageScript('personnel');
                loadEmployees();
            }
            else if (viewName === 'branches') {
                activateView(viewBranches, navBranches);
                await loadPageView('branches');
                await loadPageScript('branches');
                loadBranches();
            }
            else if (viewName === 'settings') {
                activateView(viewSettings, navSettings);
                await loadPageView('settings');
                await Promise.all([loadPageScript('settings'), fetchMasterData()]);
                if (typeof renderSettingsList === 'function') renderSettingsList();
            }
            else if (viewName === 'roles') {
                activateView(viewRoles, navRoles);
                await loadPageView('roles');
                await loadPageScript('roles');
                loadRoles();
            }
            else if (viewName === 'sales-history') {
                activateView(viewSalesHistory, navSalesHistory);
                await loadPageView('sales-history');
                await loadPageScript('sales-history');
                loadBranchesForSalesHistory();
                loadEmployeesForSalesHistory();
                loadSalesHistory();
            }
            else if (viewName === 'daily-summary') {
                activateView(viewDailySummary, navDailySummary);
                activateMobileNav(mobileNavDailySummary);
                await loadPageView('sales-history');
                await loadPageScript('sales-history');
                loadDailySummary();
            }
            else if (viewName === 'transfers') {
                activateView(viewTransfers, navTransfers);
                await loadPageView('transfers');
                await loadPageScript('transfers');
                loadTransfers();
            }
            else if (viewName === 'deposits') {
                activateView(viewDeposits, navDeposits);
                await loadPageView('deposits');
                await loadPageScript('deposits');
                if (typeof loadBranchesForDeposits === 'function') loadBranchesForDeposits();
                loadDeposits();
            }
            else if (viewName === 'movements') {
                activateView(viewMovements, navMovements);
                await loadPageView('movements');
                await loadPageScript('movements');
                setTimeout(() => {
                    const searchInput = document.getElementById('movement-search-input');
                    if (searchInput) searchInput.focus();
                }, 100);
            }
            else if (viewName === 'members') {
                activateView(viewMembers, navMembers);
                activateMobileNav(mobileNavMembers);
                await loadPageView('members');
                await loadPageScript('members');
                loadMembers();
            }
            else if (viewName === 'report-arrival') {
                activateView(viewReportArrival, navReportArrival);
                await loadPageView('po-accounting');
                await loadPageScript('po-accounting');
                if (typeof window.initImportWorkflowPage === 'function') window.initImportWorkflowPage();
                if (typeof window.populateArrivalDropdowns === 'function') window.populateArrivalDropdowns();
                if (typeof loadMyArrivalReports === 'function') loadMyArrivalReports();
                if (typeof loadArrivalPOs === 'function') loadArrivalPOs();
            }
            else if (viewName === 'approve-import') {
                activateView(viewApproveImport, navApproveImport);
                await loadPageView('po-accounting');
                await loadPageScript('po-accounting');
                if (typeof window.initImportWorkflowPage === 'function') window.initImportWorkflowPage();
                if (typeof populateApproveImportBranchFilter === 'function') populateApproveImportBranchFilter();
                if (typeof loadImportNotifications === 'function') {
                    loadImportNotifications();
                }
                if (typeof loadApprovePOs === 'function') loadApprovePOs();
                if (typeof loadApproveHistory === 'function') loadApproveHistory();
            }
            else if (viewName === 'warranty-check') {
                activateView(viewWarrantyCheck, navWarrantyCheck);
                await Promise.all([loadPageView('sales-history'), loadPageView('warranty-check')]);
                await Promise.all([loadPageScript('sales-history'), loadPageScript('warranty-check')]);
            }
            else if (viewName === 'branch-inventory') {
                activateView(viewBranchInventory, navBranchInventory);
                await loadPageView('branch-inventory');
                await loadPageScript('branch-inventory');
                if (typeof initBranchInventory === 'function') initBranchInventory();
            }
            else if (viewName === 'accounting-po') {
                activateView(viewAccountingPO, navAccountingPO);
                activateMobileNav(mobileNavAccountingPO);
                await loadPageView('po-accounting');
                await loadPageScript('po-accounting');
                if (typeof initAccountingPO === 'function') initAccountingPO();
            }
            else if (viewName === 'branch-receive') {
                activateView(viewBranchReceive, navBranchReceive);
                await loadPageView('po-accounting');
                await loadPageScript('po-accounting');
                if (typeof initBranchReceive === 'function') initBranchReceive();
            }
            else if (viewName === 'accounting') {
                activateView(viewAccounting, navAccounting);
                await loadPageView('po-accounting');
                await loadPageScript('po-accounting');
                if (typeof initAccounting === 'function') initAccounting();
            }
            else if (viewName === 'audit-logs') {
                activateView(viewAuditLogs, navAuditLogs);
                await loadPageView('audit-logs');
                await loadPageScript('audit-logs');
                await fetchAuditLogs(1);
            }
            else if (viewName === 'stock-audit') {
                activateView(viewStockAudit, navStockAudit);
                activateMobileNav(mobileNavStockAudit);
                await loadPageView('stock-audit');
                await loadPageScript('stock-audit');
                if (typeof initStockAudit === 'function') initStockAudit();
            }
            else if (viewName === 'stock-audit-review') {
                activateView(viewStockAuditReview, navStockAuditReview);
                await loadPageView('stock-audit');
                await loadPageScript('stock-audit');
                if (typeof loadAuditReviewSessions === 'function') loadAuditReviewSessions();
            }
            else if (viewName === 'accounting-settings') {
                activateView(viewAccountingSettings, navAccountingSettings);
                await loadPageView('accounting-settings');
                await loadPageScript('accounting-settings');
                if (typeof initAccountingSettings === 'function') initAccountingSettings();
            }
            else if (viewName === 'disbursement') {
                activateView(viewDisbursement, navDisbursement);
                await loadPageView('accounting-settings');
                await loadPageScript('accounting-settings');
                if (typeof initDisbursement === 'function') initDisbursement();
            }
        } catch (err) {
            console.error(`switchView('${viewName}') failed:`, err);
            if (typeof showToast === 'function') {
                showToast('โหลดหน้านี้ไม่สำเร็จ กรุณาลองใหม่อีกครั้ง', 'error');
            }
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
    if (navDeposits) navDeposits.addEventListener('click', (e) => { e.preventDefault(); switchView('deposits'); });
    if (navMovements) navMovements.addEventListener('click', (e) => { e.preventDefault(); switchView('movements'); });
    if (navMembers) navMembers.addEventListener('click', (e) => { e.preventDefault(); switchView('members'); });
    if (navReportArrival) navReportArrival.addEventListener('click', (e) => { e.preventDefault(); switchView('report-arrival'); });
    if (navApproveImport) navApproveImport.addEventListener('click', (e) => { e.preventDefault(); switchView('approve-import'); });
    if (navWarrantyCheck) navWarrantyCheck.addEventListener('click', (e) => { e.preventDefault(); switchView('warranty-check'); });
    if (navAccountingPO) navAccountingPO.style.display = 'none'; // Will be managed by applyPermissions
    if (navAccountingPO) navAccountingPO.addEventListener('click', (e) => { e.preventDefault(); switchView('accounting-po'); });
    if (navBranchReceive) navBranchReceive.addEventListener('click', (e) => { e.preventDefault(); switchView('branch-receive'); });
    if (navAccounting) navAccounting.style.display = 'none'; // Will be managed by applyPermissions
    if (navAccounting) navAccounting.addEventListener('click', (e) => { e.preventDefault(); switchView('accounting'); });
    if (navAuditLogs) navAuditLogs.addEventListener('click', (e) => { e.preventDefault(); switchView('audit-logs'); });
    if (navAccountingSettings) navAccountingSettings.style.display = 'none'; // Will be managed by applyPermissions
    if (navAccountingSettings) navAccountingSettings.addEventListener('click', (e) => { e.preventDefault(); switchView('accounting-settings'); });
    if (navDisbursement) navDisbursement.style.display = 'none'; // Will be managed by applyPermissions
    if (navDisbursement) navDisbursement.addEventListener('click', (e) => { e.preventDefault(); switchView('disbursement'); });

    // Mobile Navigation Click Listeners
    if (mobileNavTransactions) mobileNavTransactions.addEventListener('click', (e) => { e.preventDefault(); switchView('transactions'); });
    if (mobileNavStock) mobileNavStock.addEventListener('click', (e) => { e.preventDefault(); switchView('stock'); });
    if (mobileNavAccountingPO) mobileNavAccountingPO.addEventListener('click', (e) => { e.preventDefault(); switchView('accounting-po'); });
    if (mobileNavMembers) mobileNavMembers.addEventListener('click', (e) => { e.preventDefault(); switchView('members'); });
    if (navDailySummary) navDailySummary.addEventListener('click', (e) => { e.preventDefault(); switchView('daily-summary'); });
    if (mobileNavDailySummary) mobileNavDailySummary.addEventListener('click', (e) => { e.preventDefault(); switchView('daily-summary'); });
    if (navStockAudit) navStockAudit.addEventListener('click', (e) => { e.preventDefault(); switchView('stock-audit'); });
    if (navStockAuditReview) navStockAuditReview.addEventListener('click', (e) => { e.preventDefault(); switchView('stock-audit-review'); });
    if (mobileNavStockAudit) mobileNavStockAudit.addEventListener('click', (e) => { e.preventDefault(); switchView('stock-audit'); });


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
            updateTopBar(user);
            applyPermissions(user.permissions);
            switchView(getViewFromHash() || getDefaultViewForUser(user.permissions));
            fetchMasterData();
            startPendingTransferPolling();

            // Silently sync the latest permissions & user data from DB to bypass caching
            authFetch(`${API_BASE_URL}/auth/me`)
                .then(res => res.json())
                .then(result => {
                    if (result.success && result.data) {
                        localStorage.setItem('silmin_user', JSON.stringify(result.data));
                        updateTopBar(result.data);
                        applyPermissions(result.data.permissions);
                    }
                })
                .catch(err => console.error('Failed to sync user session on startup:', err));
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
            if (stockFilterPanel.classList.contains('opacity-0')) openStockFilterPanel();
            else closeStockFilterPanel();
        });
    }
    if (btnStockFilterClose) btnStockFilterClose.addEventListener('click', closeStockFilterPanel);
    if (stockFilterPanel) {
        stockFilterPanel.addEventListener('click', (e) => {
            if (e.target === stockFilterPanel) closeStockFilterPanel();
        });
    }

    const syncFiltersFromPanel = () => {
        if (stockFilterBranch) stockFilters.branchId = stockFilterBranch.value || '';
        if (stockFilterCategory) stockFilters.categoryId = stockFilterCategory.value || '';
        if (stockFilterSupplier) stockFilters.supplierId = stockFilterSupplier.value || '';
        if (stockFilterStatus) stockFilters.status = stockFilterStatus.value || '';
        stockFilters.priceMin = stockFilterPriceMin ? (stockFilterPriceMin.value === '' ? '' : stockFilterPriceMin.value) : '';
        stockFilters.priceMax = stockFilterPriceMax ? (stockFilterPriceMax.value === '' ? '' : stockFilterPriceMax.value) : '';
        if (stockFilterProdType) stockFilters.prodType = stockFilterProdType.value || '';
        if (stockFilterProductName) stockFilters.productName = stockFilterProductName.value || '';
        if (stockFilterColor) stockFilters.colorId = stockFilterColor.value || '';
        if (stockFilterCapacity) stockFilters.capacityId = stockFilterCapacity.value || '';
        if (stockFilterCondition) stockFilters.conditionId = stockFilterCondition.value || '';
        if (stockFilterUnit) stockFilters.unitId = stockFilterUnit.value || '';
        stockFilters.costMin = stockFilterCostMin ? (stockFilterCostMin.value === '' ? '' : stockFilterCostMin.value) : '';
        stockFilters.costMax = stockFilterCostMax ? (stockFilterCostMax.value === '' ? '' : stockFilterCostMax.value) : '';
        stockFilters.qtyMin = stockFilterQtyMin ? (stockFilterQtyMin.value === '' ? '' : stockFilterQtyMin.value) : '';
        stockFilters.qtyMax = stockFilterQtyMax ? (stockFilterQtyMax.value === '' ? '' : stockFilterQtyMax.value) : '';
        if (stockFilterSort) stockFilters.sortBy = stockFilterSort.value || 'newest';
    };

    // Custom Filter Pills Logic
    document.querySelectorAll('.filter-pill').forEach(pill => {
        pill.addEventListener('click', function () {
            const targetId = this.getAttribute('data-target');
            const value = this.getAttribute('data-value');
            const targetSelect = document.getElementById(targetId);

            const isActive = this.classList.contains('active');

            // Remove active from all siblings
            this.parentElement.querySelectorAll('.filter-pill').forEach(s => {
                s.classList.remove('active', 'border-[#FFE169]', 'text-[#FFE169]');
                s.classList.add('border-[#3F3F46]', 'text-slate-300');
            });

            if (isActive && value !== '') {
                // If it was active and not the "all" option, toggle off to "all"
                const allOption = this.parentElement.querySelector('.filter-pill[data-value=""]');
                if (allOption) {
                    allOption.classList.remove('border-[#3F3F46]', 'text-slate-300');
                    allOption.classList.add('active', 'border-[#FFE169]', 'text-[#FFE169]');
                }
                if (targetSelect) {
                    targetSelect.value = '';
                    targetSelect.dispatchEvent(new Event('change'));
                }
            } else {
                // Toggle on
                this.classList.remove('border-[#3F3F46]', 'text-slate-300');
                this.classList.add('active', 'border-[#FFE169]', 'text-[#FFE169]');
                if (targetSelect) {
                    targetSelect.value = value;
                    targetSelect.dispatchEvent(new Event('change'));
                }
            }
        });
    });

    // Custom Filter Swatches Logic
    document.querySelectorAll('.filter-swatch').forEach(swatch => {
        swatch.addEventListener('click', function () {
            const targetId = this.getAttribute('data-target');
            const value = this.getAttribute('data-value');
            const targetSelect = document.getElementById(targetId);

            const isActive = this.classList.contains('active');

            // Remove active from all siblings
            this.parentElement.querySelectorAll('.filter-swatch').forEach(s => {
                s.classList.remove('active');
                const indicator = s.querySelector('.swatch-indicator');
                if (indicator) {
                    indicator.classList.remove('border-[#FFE169]', 'scale-110');
                    indicator.classList.add('border-transparent');
                }
                const label = s.querySelector('.swatch-text');
                if (label) {
                    label.classList.remove('text-[#FFE169]', 'text-[13px]');
                    label.classList.add('text-slate-400', 'text-[10px]');
                }
            });

            if (isActive) {
                // Toggle off
                if (targetSelect) {
                    targetSelect.value = '';
                    targetSelect.dispatchEvent(new Event('change'));
                }
            } else {
                // Toggle on
                this.classList.add('active');
                const indicator = this.querySelector('.swatch-indicator');
                if (indicator) {
                    indicator.classList.remove('border-transparent');
                    indicator.classList.add('border-[#FFE169]', 'scale-110');
                }
                const label = this.querySelector('.swatch-text');
                if (label) {
                    label.classList.remove('text-slate-400', 'text-[10px]');
                    label.classList.add('text-[#FFE169]', 'text-[13px]');
                }
                if (targetSelect) {
                    targetSelect.value = value;
                    targetSelect.dispatchEvent(new Event('change'));
                }
            }
        });
    });

    const resetCustomFilterUI = () => {
        // Reset pills to "all"
        document.querySelectorAll('.filter-pill[data-value=""]').forEach(allPill => {
            const siblings = allPill.parentElement.querySelectorAll('.filter-pill');
            siblings.forEach(s => {
                s.classList.remove('active', 'border-[#FFE169]', 'text-[#FFE169]');
                s.classList.add('border-[#3F3F46]', 'text-slate-300');
            });
            allPill.classList.remove('border-[#3F3F46]', 'text-slate-300');
            allPill.classList.add('active', 'border-[#FFE169]', 'text-[#FFE169]');
        });

        // Reset swatches
        document.querySelectorAll('.filter-swatch').forEach(s => {
            s.classList.remove('active');
            const indicator = s.querySelector('.swatch-indicator');
            if (indicator) {
                indicator.classList.remove('border-[#FFE169]', 'scale-110');
                indicator.classList.add('border-transparent');
            }
            const label = s.querySelector('.swatch-text');
            if (label) {
                label.classList.remove('text-[#FFE169]', 'text-[13px]');
                label.classList.add('text-slate-400', 'text-[10px]');
            }
        });
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
            resetCustomFilterUI(); // Added to reset pills and swatches
            applyStockSearchAndFilters();
        });
    }

    if (stockFilterBranch) stockFilterBranch.addEventListener('change', () => { syncFiltersFromPanel(); applyStockSearchAndFilters(); });
    if (stockFilterCategory) stockFilterCategory.addEventListener('change', () => { syncFiltersFromPanel(); applyStockSearchAndFilters(); });
    if (stockFilterSupplier) stockFilterSupplier.addEventListener('change', () => { syncFiltersFromPanel(); applyStockSearchAndFilters(); });
    if (stockFilterStatus) stockFilterStatus.addEventListener('change', () => { syncFiltersFromPanel(); applyStockSearchAndFilters(); });
    if (stockFilterPriceMin) stockFilterPriceMin.addEventListener('input', () => { syncFiltersFromPanel(); applyStockSearchAndFilters(); });
    if (stockFilterPriceMax) stockFilterPriceMax.addEventListener('input', () => { syncFiltersFromPanel(); applyStockSearchAndFilters(); });
    if (stockFilterProdType) stockFilterProdType.addEventListener('change', () => { syncFiltersFromPanel(); applyStockSearchAndFilters(); });
    if (stockFilterProductName) stockFilterProductName.addEventListener('change', () => { syncFiltersFromPanel(); applyStockSearchAndFilters(); });
    if (stockFilterColor) stockFilterColor.addEventListener('change', () => { syncFiltersFromPanel(); applyStockSearchAndFilters(); });
    if (stockFilterCapacity) stockFilterCapacity.addEventListener('change', () => { syncFiltersFromPanel(); applyStockSearchAndFilters(); });
    if (stockFilterCondition) stockFilterCondition.addEventListener('change', () => { syncFiltersFromPanel(); applyStockSearchAndFilters(); });
    if (stockFilterUnit) stockFilterUnit.addEventListener('change', () => { syncFiltersFromPanel(); applyStockSearchAndFilters(); });
    if (stockFilterCostMin) stockFilterCostMin.addEventListener('input', () => { syncFiltersFromPanel(); applyStockSearchAndFilters(); });
    if (stockFilterCostMax) stockFilterCostMax.addEventListener('input', () => { syncFiltersFromPanel(); applyStockSearchAndFilters(); });
    if (stockFilterQtyMin) stockFilterQtyMin.addEventListener('input', () => { syncFiltersFromPanel(); applyStockSearchAndFilters(); });
    if (stockFilterQtyMax) stockFilterQtyMax.addEventListener('input', () => { syncFiltersFromPanel(); applyStockSearchAndFilters(); });
    if (stockFilterSort) stockFilterSort.addEventListener('change', () => { syncFiltersFromPanel(); applyStockSearchAndFilters(); });

    // Infinite scroll สำหรับตารางจัดการสต็อก — โหลดเพิ่มทีละ stockItemsPerPage เมื่อเลื่อนใกล้ถึงจุดล่างสุดของพื้นที่เนื้อหา
    const mainContentEl = document.getElementById('main-content');
    if (mainContentEl) {
        mainContentEl.addEventListener('scroll', () => {
            if (!viewStock || viewStock.classList.contains('hidden')) return;
            const { scrollTop, scrollHeight, clientHeight } = mainContentEl;
            if (scrollHeight - scrollTop - clientHeight < 200) {
                loadMoreStockProducts();
            }
        });
    }

    // Branch Management Logic (จัดการสาขา)
    // แยกออกไปที่ js/page-branches.js แล้ว โหลดแบบ dynamic ผ่าน loadPageScript('branches')
    // (ดู switchView case 'branches')

    // Master Data Settings Logic (การตั้งค่าระบบ)
    // แยกออกไปที่ js/page-settings.js แล้ว โหลดแบบ dynamic ผ่าน loadPageScript('settings')
    // (ดู switchView case 'settings')


    // Employee Management Logic (จัดการพนักงาน)
    // แยกออกไปที่ js/page-personnel.js แล้ว โหลดแบบ dynamic ผ่าน loadPageScript('personnel')
    // (ดู switchView case 'personnel')

    // ==========================================
    // POS / Transactions System (ระบบขายสินค้า)
    // ==========================================

    // Cart State (declared at top of DOMContentLoaded)
    let posProductsCache = [];

    // POS DOM Elements
    const posSearchInput = document.getElementById('pos-search-input');
    const posProductGrid = document.getElementById('pos-product-grid');
    const posEmptyState = document.getElementById('pos-empty-state');
    const posSearchResults = document.getElementById('pos-search-results');
    const cartItemsContainer = document.getElementById('cart-items-container');
    const cartEmptyState = document.getElementById('cart-empty-state');
    const cartHintBanner = document.getElementById('cart-hint-banner');
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

    const modalFinanceDownTotal = document.getElementById('modal-finance-down-total');
    const modalFinanceDownCash = document.getElementById('modal-finance-down-cash');
    const modalFinanceDownTransfer = document.getElementById('modal-finance-down-transfer');
    const modalFinanceTotalDownLabel = document.getElementById('modal-finance-total-down-label');

    const btnCheckout = document.getElementById('btn-checkout');

    // ข้อความแจ้งเตือน inline สีแดงใต้ช่องที่บังคับกรอกในโมดัลชำระเงิน (พร้อมขอบสีแดงที่ตัวช่องกรอกเอง ไม่ใช่แค่ข้อความ)
    // (เดิมมีแค่ showToast มุมจอซึ่งพลาดสายตาได้ง่าย ปุ่ม "ชำระเงิน" ก็เป็นสีเขียวตลอดไม่บอกว่ากรอกไม่ครบ)
    const posPaymentMethodGroup = document.getElementById('pos-payment-method-group');
    const posPaymentMethodError = document.getElementById('pos-payment-method-error');
    const posCashAmountError = document.getElementById('pos-cash-amount-error');
    const posFinanceCompanyError = document.getElementById('pos-finance-company-error');
    const posFinanceDownAmountError = document.getElementById('pos-finance-down-amount-error');

    // จับคู่ error message แต่ละอันกับช่องกรอก/กลุ่มที่ต้องขึ้นขอบแดงด้วย
    const posInlineErrorTargets = [
        {
            error: posPaymentMethodError,
            setBorder: (hasError) => {
                if (!posPaymentMethodGroup) return;
                posPaymentMethodGroup.classList.toggle('ring-2', hasError);
                posPaymentMethodGroup.classList.toggle('ring-red-500', hasError);
            }
        },
        {
            error: posCashAmountError,
            setBorder: (hasError) => {
                [modalCashAmount, modalTransferAmount].forEach(el => {
                    if (!el) return;
                    el.classList.toggle('border-red-500', hasError);
                    el.classList.toggle('border-[#444]', !hasError);
                });
            }
        },
        {
            error: posFinanceCompanyError,
            setBorder: (hasError) => {
                if (!modalFinanceCompany) return;
                modalFinanceCompany.classList.toggle('border-red-500', hasError);
                modalFinanceCompany.classList.toggle('border-[#444]', !hasError);
            }
        },
        {
            error: posFinanceDownAmountError,
            setBorder: (hasError) => {
                [modalFinanceDownCash, modalFinanceDownTransfer].forEach(el => {
                    if (!el) return;
                    el.classList.toggle('border-red-500', hasError);
                    el.classList.toggle('border-[#555]', !hasError);
                });
            }
        }
    ];

    const clearPosInlineErrors = () => {
        posInlineErrorTargets.forEach(({ error, setBorder }) => {
            if (error) error.classList.add('hidden');
            setBorder(false);
        });
    };
    const showPosInlineError = (el) => {
        clearPosInlineErrors();
        if (el) el.classList.remove('hidden');
        const target = posInlineErrorTargets.find(t => t.error === el);
        if (target) target.setBorder(true);
    };

    const modalSubtotalDisplay = document.getElementById('modal-subtotal-display');
    const modalDiscountDisplay = document.getElementById('modal-discount-display');
    const modalTotalDisplay = document.getElementById('modal-total-display');

    // DOM Elements for manual Contract and iCloud fees
    const checkboxContractFee = document.getElementById('checkbox-contract-fee');
    const inputContractFee = document.getElementById('input-contract-fee');
    const wrapperContractFee = document.getElementById('wrapper-contract-fee');
    const modalContractDisplay = document.getElementById('modal-contract-display');

    const checkboxIcloudFee = document.getElementById('checkbox-icloud-fee');
    const inputIcloudFee = document.getElementById('input-icloud-fee');
    const wrapperIcloudFee = document.getElementById('wrapper-icloud-fee');
    const modalIcloudDisplay = document.getElementById('modal-icloud-display');

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

    // Deposit Selection DOM
    const posDepositSearch = document.getElementById('pos-deposit-search');
    const posDepositSearchResults = document.getElementById('pos-deposit-search-results');
    const appliedDepositDisplay = document.getElementById('applied-deposit-display');
    const appliedDepositNumber = document.getElementById('applied-deposit-number');
    const appliedDepositInfo = document.getElementById('applied-deposit-info');
    const appliedDepositAmountText = document.getElementById('applied-deposit-amount-text');
    const btnRemoveAppliedDeposit = document.getElementById('btn-remove-applied-deposit');
    const appliedDepositId = document.getElementById('applied-deposit-id');
    const appliedDepositAmount = document.getElementById('applied-deposit-amount');
    const modalAppliedDepositRow = document.getElementById('modal-applied-deposit-row');
    const modalAppliedDepositDisplay = document.getElementById('modal-applied-deposit-display');

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
    const btnReprintReceipt = document.getElementById('btn-reprint-receipt');
    const btnCancelTransaction = document.getElementById('btn-cancel-transaction');

    // DOM Elements for Print Options Modal
    const modalPrintOptions = document.getElementById('modal-print-options');
    const closePrintOptionsBtn = document.getElementById('close-print-options-btn');
    const cancelPrintOptionsBtn = document.getElementById('cancel-print-options-btn');
    const confirmPrintBtn = document.getElementById('confirm-print-btn');
    const printOptItems = document.getElementById('print-opt-items');
    const printOptContract = document.getElementById('print-opt-contract');
    const printOptIcloud = document.getElementById('print-opt-icloud');
    const printOptContractWrapper = document.getElementById('print-opt-contract-wrapper');
    const printOptIcloudWrapper = document.getElementById('print-opt-icloud-wrapper');
    let pendingPrintTxnData = null;

    const transactionCancelledAlert = document.getElementById('transaction-cancelled-alert');
    const transactionCancelledReason = document.getElementById('transaction-cancelled-reason');
    const transactionCancelledBy = document.getElementById('transaction-cancelled-by');
    const transactionCancelledAt = document.getElementById('transaction-cancelled-at');

    // Fetch products for POS
    async function fetchPosProducts() {
        // ⚠️ switchView('transactions') ถูกเรียกได้ตั้งแต่ตอน restore หน้าล่าสุด ซึ่งเป็นจังหวะที่ยังรัน
        // body ของ DOMContentLoaded ไม่จบ — const ของหน้าขายที่ประกาศอยู่ท้ายไฟล์ (posProductsCache,
        // renderPosSkeleton ฯลฯ) จึงยังอยู่ใน TDZ แตะตรงๆ ตอนนี้จะได้ ReferenceError ทันที
        // (แม้แต่ `typeof` ก็ throw) จึงต้องเลื่อนไปทำหลัง stack ปัจจุบันคลายตัว ตอนนั้น const พร้อมแล้ว
        // microtask ทำงานก่อนที่ network จะตอบกลับเสมอ skeleton จึงยังทันขึ้นก่อนข้อมูลจริง
        queueMicrotask(() => {
            // โชว์ skeleton เฉพาะตอนที่ยังไม่มีอะไรให้ดูเลย ถ้ากลับเข้าหน้านี้ซ้ำและมีข้อมูลเดิมค้างอยู่
            // ให้คงรายการเดิมไว้ระหว่างโหลดใหม่ ดีกว่าให้หน้าจอกระพริบทุกครั้งที่สลับหน้ามา
            if (posProductsCache.length === 0) renderPosSkeleton();
        });

        // เรียกได้เฉพาะหลัง await เท่านั้น (พ้น TDZ แล้ว) และจะไม่ลบรายการเดิมทิ้งถ้าโหลดซ้ำแล้วพลาด
        const failIfEmpty = () => {
            if (posProductsCache.length === 0) showPosLoadError();
        };

        try {
            const response = await authFetch(`${API_BASE_URL}/products`);
            const json = await response.json();
            if (json.success) {
                posProductsCache = json.data;
                populatePosDropdowns();
                initPosRender();
            } else {
                failIfEmpty();
            }
        } catch (error) {
            console.error('เกิดข้อผิดพลาดในการดึงข้อมูลสินค้าสำหรับ POS:', error);
            failIfEmpty();
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
        const headerContainer = document.getElementById('pos-cart-header-container');
        if (!headerContainer) return;

        const user = getCurrentUserForPos();
        const branchName = user && user.branch && user.branch.name ? user.branch.name : '';

        let badge = document.getElementById('pos-branch-badge');
        if (!badge) {
            badge = document.createElement('p');
            badge.id = 'pos-branch-badge';
            badge.className = 'text-[11px] text-ink-muted-48 mt-1';
            headerContainer.appendChild(badge);
        }

        badge.textContent = branchName ? `คลังสินค้า : ${branchName}` : 'คลังสินค้า : -';
    };

    // State for POS UI
    // Infinite scroll: ทยอยเติมสินค้าทีละชุดเมื่อเลื่อนใกล้ล่างสุด แทนการแบ่งหน้าแบบเดิม
    // (แนวทางเดียวกับตารางหน้าจัดการสต็อก) 12 ชิ้นต่อชุดลงตัวพอดีกับกริด 3 คอลัมน์
    const POS_ITEMS_PER_BATCH = 12;
    let posLoadedCount = 0;
    let posFilteredData = [];
    let posActiveTab = 'search'; // 'search' or 'scan'

    const getProductImage = (productName, typeName) => {
        let imageName = 'default.png';
        if (!productName) return `/images/products/${imageName}`;
        const name = productName.toLowerCase();
        const type = typeName ? typeName.toLowerCase() : '';
        if (name.includes('iphone 15 pro max')) imageName = 'iphone-15-pro-max.png';
        else if (name.includes('iphone 15 pro')) imageName = 'iphone-15-pro.png';
        else if (name.includes('iphone 15 plus')) imageName = 'iphone-15-plus.png';
        else if (name.includes('iphone 15')) imageName = 'iphone-15.png';
        else if (name.includes('iphone 14 pro max')) imageName = 'iphone-14-pro-max.png';
        else if (name.includes('iphone 14 pro')) imageName = 'iphone-14-pro.png';
        else if (name.includes('iphone 14 plus')) imageName = 'iphone-14-plus.png';
        else if (name.includes('iphone 14')) imageName = 'iphone-14.png';
        else if (name.includes('iphone 13 pro max')) imageName = 'iphone-13-pro-max.png';
        else if (name.includes('iphone 13 pro')) imageName = 'iphone-13-pro.png';
        else if (name.includes('iphone 13')) imageName = 'iphone-13.png';
        else if (name.includes('ipad pro')) imageName = 'ipad-pro.png';
        else if (name.includes('ipad air')) imageName = 'ipad-air.png';
        else if (name.includes('ipad mini')) imageName = 'ipad-mini.png';
        else if (name.includes('ipad')) imageName = 'ipad.png';
        else if (name.includes('samsung galaxy s24 ultra')) imageName = 's24-ultra.png';
        else if (name.includes('samsung galaxy z fold5')) imageName = 'z-fold5.png';
        else if (type.includes('iphone')) imageName = 'iphone-15.png';
        else if (type.includes('ipad')) imageName = 'ipad.png';
        else if (type.includes('android')) imageName = 's24-ultra.png';
        return `/images/products/${imageName}`;
    };

    const getBrandFromProduct = (product) => {
        if (product.brand_id && product.brand_id.name) return product.brand_id.name;
        const name = (product.name || '').toLowerCase();
        const typeName = product.type_id ? (product.type_id.name || '').toLowerCase() : '';
        if (name.includes('apple') || name.includes('iphone') || name.includes('ipad') || name.includes('mac') || typeName.includes('iphone') || typeName.includes('ipad') || typeName.includes('apple')) return 'Apple';
        if (name.includes('samsung') || typeName.includes('samsung')) return 'Samsung';
        if (name.includes('oppo') || typeName.includes('oppo')) return 'Oppo';
        if (name.includes('vivo') || typeName.includes('vivo')) return 'Vivo';
        if (name.includes('xiaomi') || name.includes('redmi') || typeName.includes('xiaomi')) return 'Xiaomi';
        return 'อื่นๆ';
    };

    // สแนปช็อตข้อมูลสินค้า (รหัส/สี/ประเภท/สต็อกคงเหลือ ณ ตอนหยิบใส่ตะกร้า) สำหรับแสดงในตารางยืนยันการชำระเงิน
    // เก็บไว้ตอน push เข้าตะกร้าเพราะ posProductsCache อาจเปลี่ยนไปก่อนเปิด modal ชำระเงิน
    const getCartProductSnapshot = (product) => ({
        product_code: product.product_code || '',
        color_name: (product.color_id && product.color_id.name) ? product.color_id.name : '',
        type_name: (product.type_id && product.type_id.name) ? product.type_id.name : '',
        stock_available: (typeof product.quantity === 'number') ? product.quantity : null
    });

    // มุมมอง/การเรียง/การกรองของกริดสินค้า — เก็บเป็นสถานะเดียวกันทั้งหน้า เพื่อให้ปุ่มสลับมุมมอง
    // ตัวเลือกเรียงลำดับ และตัวกรอง อ่าน/เขียนที่เดียวกันหมด ไม่ต้องไล่ query DOM ซ้ำ
    let posViewMode = 'grid'; // 'grid' | 'list'
    let posSortMode = 'name-asc';
    // หมวดหมู่ที่เลือกอยู่ เก็บเป็นตัวแปรตรงๆ ไม่ฝากไว้กับ <select> ที่ซ่อน เพราะ select.value จะเงียบๆ
    // ไม่เปลี่ยนค่าถ้าไม่มี option ที่ตรงกัน ทำให้แท็บกดแล้วรายการไม่ถูกกรอง
    let posActiveCategory = '';
    // สินค้าที่หมดสต็อกถูกซ่อนออกจากกริดตั้งแต่แรก (display: none โดยพฤตินัย ผ่านการกรองออกจาก
    // posFilteredData) เพื่อไม่ให้พนักงานเผลอขายของที่ไม่มีจริง — เปิดดูได้จากตัวกรองถ้าต้องเช็คว่า
    // รุ่นไหนหมดโดยไม่ต้องออกจากหน้าขาย
    let posShowOutOfStock = false;

    // ==========================================
    // Skeleton loading ของหน้าจัดรายการขาย
    // ==========================================
    // ใช้โทนเดียวกับ skeleton หน้าสต็อก (bg-[#5c5c5c] + animate-pulse) เพื่อให้จังหวะกระพริบ
    // ของทั้งระบบเป็นแบบเดียวกัน โครงร่างจำลองการ์ด/แถวจริงไว้ เลย์เอาต์จะได้ไม่กระโดดตอนข้อมูลมาแทน
    const posSkeletonBar = (cls) => `<div class="rounded-full bg-[#5c5c5c] animate-pulse ${cls}"></div>`;

    const posSkeletonCard = () => `
        <div class="bg-surface-tile-3 border border-hairline rounded-md p-3.5">
            <div class="flex items-start gap-3">
                <div class="w-10 h-10 rounded-md bg-[#5c5c5c] animate-pulse shrink-0"></div>
                <div class="min-w-0 flex-1">
                    <div class="flex items-start gap-2">
                        ${posSkeletonBar('h-3.5 flex-1')}
                        ${posSkeletonBar('h-4 w-20 shrink-0')}
                    </div>
                    ${posSkeletonBar('h-2.5 w-3/5 mt-2.5')}
                    ${posSkeletonBar('h-2.5 w-2/5 mt-1.5')}
                    ${posSkeletonBar('h-2.5 w-1/4 mt-1.5')}
                </div>
            </div>
            <div class="flex items-center gap-2 mt-3.5">
                ${posSkeletonBar('h-5 w-24')}
                <div class="ml-auto flex items-center gap-1.5">
                    ${posSkeletonBar('h-8 w-20')}
                    ${posSkeletonBar('h-8 w-8')}
                </div>
            </div>
        </div>`;

    const posSkeletonTableRow = () => `
        <tr class="bg-canvas-elevated">
            <td class="px-4 py-3.5">
                <div class="flex items-center gap-3">
                    <div class="w-10 h-10 rounded-md bg-[#5c5c5c] animate-pulse shrink-0"></div>
                    <div class="min-w-0 flex-1 max-w-[220px]">
                        ${posSkeletonBar('h-3.5 w-4/5')}
                        ${posSkeletonBar('h-2.5 w-3/5 mt-2')}
                    </div>
                </div>
            </td>
            <td class="px-4 py-3.5">${posSkeletonBar('h-6 w-32')}</td>
            <td class="px-4 py-3.5">${posSkeletonBar('h-2.5 w-24')}${posSkeletonBar('h-2.5 w-28 mt-2')}</td>
            <td class="px-4 py-3.5">${posSkeletonBar('h-5 w-28')}</td>
            <td class="px-4 py-3.5">${posSkeletonBar('h-4 w-16')}</td>
            <td class="px-4 py-3.5">${posSkeletonBar('h-5 w-20')}</td>
            <td class="px-4 py-3.5">
                <div class="flex items-center gap-1.5">
                    ${posSkeletonBar('h-8 w-20')}
                    ${posSkeletonBar('h-8 w-8')}
                </div>
            </td>
        </tr>`;

    const renderPosSkeleton = () => {
        const tabsEl = document.getElementById('pos-category-tabs');
        if (tabsEl) {
            tabsEl.innerHTML = Array.from({ length: 6 }, (_, i) =>
                `<div class="shrink-0 h-[42px] ${i === 0 ? 'w-[104px]' : 'w-[96px]'} rounded-md bg-[#5c5c5c] animate-pulse"></div>`
            ).join('');
        }

        const resultCountEl = document.getElementById('pos-result-count');
        if (resultCountEl) resultCountEl.textContent = '–';

        const paginationContainer = document.getElementById('pos-pagination-container');
        if (paginationContainer) {
            paginationContainer.classList.remove('flex');
            paginationContainer.classList.add('hidden');
        }

        if (!posSearchResults || !posEmptyState) return;
        posEmptyState.classList.add('hidden');
        posSearchResults.classList.remove('hidden');

        // จำนวนโครงร่างอิงจำนวนต่อหน้า แต่ไม่เกิน 9 ชิ้น พอให้เต็มพื้นที่ที่มองเห็นโดยไม่ต้องวาดทิ้ง
        const count = Math.min(POS_ITEMS_PER_BATCH, 9);
        if (posViewMode === 'list') {
            posSearchResults.className = 'block';
            posSearchResults.innerHTML = `
                <div class="overflow-x-auto rounded-md border border-hairline">
                    <table class="w-full min-w-[1120px] border-collapse text-left overflow-x-auto">
                        <tbody class="divide-y divide-hairline">
                            ${Array.from({ length: count }, posSkeletonTableRow).join('')}
                        </tbody>
                    </table>
                </div>`;
        } else {
            posSearchResults.className = 'grid grid-cols-1 sm:grid-cols-2 xl:grid-cols-3 gap-3.5';
            posSearchResults.innerHTML = Array.from({ length: count }, posSkeletonCard).join('');
        }
    };

    // ถ้าโหลดไม่สำเร็จต้องเก็บ skeleton ทิ้ง ไม่งั้นหน้าจะค้างกระพริบตลอดไปโดยผู้ใช้ไม่รู้ว่าเกิดอะไรขึ้น
    const showPosLoadError = () => {
        const tabsEl = document.getElementById('pos-category-tabs');
        if (tabsEl) tabsEl.innerHTML = '';
        if (!posSearchResults || !posEmptyState) return;
        posSearchResults.innerHTML = '';
        posSearchResults.classList.add('hidden');
        posEmptyState.classList.remove('hidden');
        const titleEl = document.getElementById('pos-empty-state-title');
        const subtitleEl = document.getElementById('pos-empty-state-subtitle');
        if (titleEl) titleEl.textContent = 'โหลดรายการสินค้าไม่สำเร็จ';
        if (subtitleEl) subtitleEl.textContent = 'ตรวจสอบการเชื่อมต่อแล้วเข้าหน้านี้ใหม่อีกครั้ง';
    };

    const posCategoryIcon = (name) => {
        const n = (name || '').toLowerCase();
        if (n.includes('iphone') || n.includes('มือถือ') || n.includes('phone')) return 'fa-mobile-screen';
        if (n.includes('ipad') || n.includes('tablet') || n.includes('แท็บเล็ต')) return 'fa-tablet-screen-button';
        if (n.includes('mac') || n.includes('notebook') || n.includes('โน้ตบุ๊ก')) return 'fa-laptop';
        if (n.includes('watch') || n.includes('นาฬิกา')) return 'fa-clock';
        if (n.includes('airpod') || n.includes('หูฟัง') || n.includes('buds')) return 'fa-headphones';
        if (n.includes('เสริม') || n.includes('accessor')) return 'fa-plug';
        return 'fa-box';
    };

    const setPosCategory = (value) => {
        posActiveCategory = value || '';
        // sync ค่าไปที่ <select> ที่ซ่อนไว้เท่าที่ทำได้ เผื่อโค้ดส่วนอื่นยังอ่านจากมัน แต่ไม่ใช้เป็นแหล่งความจริง
        const categorySelect = document.getElementById('pos-filter-category');
        if (categorySelect) categorySelect.value = posActiveCategory;
        renderPosCategoryTabs();
        searchPosProducts();
    };

    const renderPosCategoryTabs = () => {
        const tabsEl = document.getElementById('pos-category-tabs');
        if (!tabsEl) return;

        const categories = Array.from(
            new Set(posProductsCache.map(p => (p.type_id && p.type_id.name) ? p.type_id.name : '').filter(Boolean))
        ).sort((a, b) => a.localeCompare(b, 'th'));

        // หมวดหมู่ที่เลือกค้างไว้อาจหายไปหลังโหลดข้อมูลรอบใหม่ ถ้าหายให้ตกกลับเป็น "ทั้งหมด"
        if (posActiveCategory && !categories.includes(posActiveCategory)) posActiveCategory = '';

        const tabs = [{ value: '', label: 'ทั้งหมด', icon: 'fa-table-cells-large' }]
            .concat(categories.map(c => ({ value: c, label: c, icon: posCategoryIcon(c) })));

        tabsEl.innerHTML = tabs.map(t => {
            const isActive = t.value === posActiveCategory;
            const cls = isActive
                ? 'bg-primary text-on-primary border-primary'
                : 'bg-canvas-elevated text-body-muted border-hairline hover:text-ink hover:border-primary/40';
            return `<button type="button" class="pos-cat-tab shrink-0 px-5 py-2.5 rounded-md border text-[13px] font-semibold transition-colors flex items-center gap-2 ${cls}" data-category="${escapeAttr(t.value)}" aria-pressed="${isActive}"><i class="fa-solid ${t.icon}"></i> ${t.label}</button>`;
        }).join('');

        // ผูก listener ครั้งเดียวที่ตัวคอนเทนเนอร์ แท็บถูก re-render บ่อย การผูกรายปุ่มทำให้หลุดง่าย
        if (!tabsEl.dataset.bound) {
            tabsEl.dataset.bound = '1';
            tabsEl.addEventListener('click', (e) => {
                const btn = e.target.closest('.pos-cat-tab');
                if (!btn || !tabsEl.contains(btn)) return;
                setPosCategory(btn.getAttribute('data-category'));
            });
        }
    };

    const updatePosStatTotal = () => {
        const el = document.getElementById('pos-stat-total');
        if (!el) return;
        const units = posProductsCache.reduce((sum, p) => sum + Math.max(0, p.quantity || 0), 0);
        el.textContent = units.toLocaleString();
    };

    const updatePosFilterDot = () => {
        const dot = document.getElementById('pos-filter-dot');
        if (!dot) return;
        const brandSelect = document.getElementById('pos-filter-brand');
        const hasFilter = !!((brandSelect && brandSelect.value) || posShowOutOfStock);
        dot.classList.toggle('hidden', !hasFilter);
    };

    const populatePosDropdowns = () => {
        const categorySelect = document.getElementById('pos-filter-category');
        const brandSelect = document.getElementById('pos-filter-brand');

        if (categorySelect) {
            const categories = new Set();
            posProductsCache.forEach(p => {
                if (p.type_id && p.type_id.name) categories.add(p.type_id.name);
            });
            categorySelect.innerHTML = '<option value="">หมวดหมู่ทั้งหมด</option>';
            Array.from(categories).sort().forEach(c => {
                const opt = document.createElement('option');
                opt.value = c;
                opt.textContent = c;
                categorySelect.appendChild(opt);
            });
            // แหล่งความจริงคือ posActiveCategory เสมอ ที่นี่แค่ทำให้ select เดินตาม
            if (posActiveCategory && !categories.has(posActiveCategory)) posActiveCategory = '';
            categorySelect.value = posActiveCategory;
        }

        if (brandSelect) {
            const brands = new Set();
            posProductsCache.forEach(p => brands.add(getBrandFromProduct(p)));
            const keep = brandSelect.value;
            brandSelect.innerHTML = '<option value="">แบรนด์ทั้งหมด</option>';
            Array.from(brands).sort().forEach(b => {
                const opt = document.createElement('option');
                opt.value = b;
                opt.textContent = b;
                brandSelect.appendChild(opt);
            });
            brandSelect.value = Array.from(brands).includes(keep) ? keep : '';
        }

        renderPosCategoryTabs();
        updatePosStatTotal();
        updatePosFilterDot();
    };

    const escapeAttr = (v) => String(v == null ? '' : v).replace(/&/g, '&amp;').replace(/"/g, '&quot;').replace(/</g, '&lt;');

    // ข้อมูลที่การ์ดและแถวใช้ร่วมกัน แยกออกมาเพื่อไม่ให้สองมุมมองหลุดจากกันเวลาแก้ทีหลัง
    const buildPosCardData = (product) => {
        const categoryName = product.type_id ? product.type_id.name : 'ทั่วไป';
        const colorName = product.color_id ? product.color_id.name : '';
        const capacityName = product.capacity_id ? product.capacity_id.name : '';
        const stockQty = product.quantity || 0;
        const imeiCount = Array.isArray(product.imeis) ? product.imeis.length : 0;
        const firstImei = imeiCount > 0 ? product.imeis[0] : '';
        return {
            categoryName,
            stockQty,
            firstImei,
            imeiCount,
            colorName,
            colorTheme: getProductColorTheme(colorName, product.color_id),
            branchName: (product.branch_id && product.branch_id.name) ? product.branch_id.name : '',
            conditionName: (product.condition_id && product.condition_id.name) ? product.condition_id.name : '',
            unitName: (product.unit_id && product.unit_id.name) ? product.unit_id.name : 'ชิ้น',
            isOutOfStock: stockQty <= 0,
            nameFull: `${product.name} ${capacityName} ${colorName}`.trim(),
            isDevice: typeof checkIsDevice === 'function' ? checkIsDevice(categoryName, product) : false,
            qtyInCart: typeof cart !== 'undefined'
                ? cart.filter(item => item.product_id === product._id).reduce((sum, item) => sum + item.quantity, 0)
                : 0,
            price: product.selling_price || 0
        };
    };

    const posQtyControlsMarkup = (product, d) => `
        <div class="pos-qty-controls flex items-center gap-2.5 ${d.qtyInCart > 0 ? '' : 'hidden'}">
            <button type="button" class="pos-card-qty-minus w-7 h-7 rounded-full border border-hairline flex items-center justify-center text-body-muted hover:text-ink hover:bg-surface-chip transition-colors" data-product-id="${product._id}" aria-label="ลดจำนวน">
                <i class="fa-solid fa-minus text-[10px]"></i>
            </button>
            <span class="pos-card-qty-display font-bold font-mono text-base text-ink w-4 text-center tabular-nums">${d.qtyInCart}</span>
            <button type="button" class="pos-card-qty-plus w-7 h-7 rounded-full border border-hairline flex items-center justify-center text-body-muted hover:text-ink hover:bg-surface-chip transition-colors" data-product-id="${product._id}" aria-label="เพิ่มจำนวน">
                <i class="fa-solid fa-plus text-[10px]"></i>
            </button>
        </div>`;

    const posAddButtonMarkup = (product, d, extraClass = '') => `
        <button type="button" class="pos-add-btn ${extraClass} px-4 py-2 rounded-pill text-xs font-bold transition-all flex items-center justify-center gap-1.5 ${d.qtyInCart > 0 ? 'hidden' : ''} ${d.isOutOfStock ? 'bg-surface-chip text-ink-muted-48 cursor-not-allowed' : 'bg-primary hover:bg-primary-pressed active:scale-95 text-on-primary'}" data-product-id="${product._id}" ${d.isOutOfStock ? 'disabled' : ''}>
            <i class="fa-solid fa-plus text-[10px]"></i> เพิ่ม
        </button>`;

    const renderPosProductCard = (product) => {
        const d = buildPosCardData(product);
        const card = document.createElement('div');
        card.className = `pos-card relative bg-surface-tile-3 border rounded-md p-3.5 transition-colors ${d.isOutOfStock ? 'border-hairline opacity-60' : 'border-hairline hover:border-primary/40'}`;
        card.setAttribute('data-product-id', product._id);
        card.innerHTML = `
            <div class="flex items-start gap-3">
                <div class="w-10 h-10 rounded-full border flex items-center justify-center shrink-0" style="color:${d.colorTheme.icon};background-color:${d.colorTheme.bg};border-color:${d.colorTheme.border};">
                    <i class="fa-solid ${d.isDevice ? 'fa-mobile-screen' : posCategoryIcon(d.categoryName)} text-base"></i>
                </div>
                <div class="min-w-0 flex-1">
                    <div class="flex items-start gap-2">
                        <h4 class="flex-1 min-w-0 font-bold text-ink text-[13px] leading-snug truncate">${d.nameFull}</h4>
                        <span class="shrink-0 flex items-center gap-1.5 max-w-[46%] px-2 py-1 rounded-pill bg-surface-chip text-[10px] font-bold ${d.branchName ? 'text-body-muted' : 'text-ink-muted-48'}">
                            <i class="fa-solid fa-shop text-[9px] text-ink-muted-48 shrink-0"></i>
                            <span class="truncate">${d.branchName || 'ไม่ระบุสาขา'}</span>
                        </span>
                    </div>
                    <p class="text-[11px] text-body-muted mt-0.5">คงเหลือ: ${d.stockQty}</p>
                    <div class="inline-flex items-center gap-2 mt-2">
                        <span class="inline-flex items-center gap-2 px-2.5 py-1.5 rounded-sm bg-primary/10 border border-primary/40 max-w-full">
                            <i class="fa-solid fa-barcode text-primary text-[10px] shrink-0"></i>
                            <span class="font-mono font-extrabold text-[12px] text-primary tracking-widest truncate">${product.product_code || '-'}</span>
                        </span>
                    </div>
                </div>
            </div>
            <div class="flex items-center gap-2 mt-3.5">
                <span class="text-[17px] font-extrabold font-mono text-primary tabular-nums">฿${d.price.toLocaleString()}</span>
                <div class="ml-auto flex items-center gap-1.5">
                    ${posQtyControlsMarkup(product, d)}
                    ${posAddButtonMarkup(product, d)}
                </div>
            </div>
        `;
        return card;
    };

    const posTableRowMarkup = (product) => {
        const d = buildPosCardData(product);
        return `
            <tr class="pos-card bg-canvas-elevated hover:bg-surface-tile-2 transition-colors ${d.isOutOfStock ? 'opacity-60' : ''}" data-product-id="${product._id}">
                <td class="px-4 py-3.5 align-middle">
                    <div class="flex items-center gap-3">
                        <div class="w-10 h-10 rounded-full border flex items-center justify-center shrink-0" style="color:${d.colorTheme.icon};background-color:${d.colorTheme.bg};border-color:${d.colorTheme.border};">
                            <i class="fa-solid ${d.isDevice ? 'fa-mobile-screen' : posCategoryIcon(d.categoryName)} text-base"></i>
                        </div>
                        <div class="min-w-0">
                            <p class="font-bold text-ink text-[13px] leading-snug truncate">${d.nameFull}</p>
                        </div>
                    </div>
                </td>
                <td class="px-4 py-3.5 align-middle whitespace-nowrap">
                    <span class="inline-flex items-center gap-2 px-3 py-1.5 rounded-sm bg-primary/10 border border-primary/40">
                        <i class="fa-solid fa-barcode text-primary text-[11px]"></i>
                        <span class="font-mono font-extrabold text-[13px] text-primary tracking-widest">${product.product_code || '-'}</span>
                    </span>
                </td>
                <td class="px-4 py-3.5 align-middle">
                    <p class="text-[11px] text-body-muted truncate">สี: ${d.colorName || '–'}</p>
                    <p class="text-[11px] text-body-muted mt-1 truncate">ประเภท: ${d.conditionName || d.categoryName || '–'}</p>
                </td>
                <td class="px-4 py-3.5 align-middle">
                    <span class="inline-flex items-center gap-1.5 max-w-[170px] px-2.5 py-1 rounded-pill bg-surface-chip text-[11px] font-semibold ${d.branchName ? 'text-body-muted' : 'text-ink-muted-48'}">
                        <i class="fa-solid fa-shop text-[9px] text-ink-muted-48 shrink-0"></i>
                        <span class="truncate">${d.branchName || 'ไม่ระบุสาขา'}</span>
                    </span>
                </td>
                <td class="px-4 py-3.5 align-middle whitespace-nowrap">
                    <p class="leading-none">
                        <span class="text-[15px] font-bold font-mono text-ink tabular-nums">${d.stockQty}</span>
                        <span class="text-[11px] text-body-muted ml-1">${d.unitName}</span>
                    </p>
                </td>
                <td class="px-4 py-3.5 align-middle whitespace-nowrap">
                    <span class="text-[17px] font-extrabold font-mono text-primary tabular-nums">฿${d.price.toLocaleString()}</span>
                </td>
                <td class="px-4 py-3.5 align-middle">
                    <div class="flex items-center gap-1.5">
                        ${posQtyControlsMarkup(product, d)}
                        ${posAddButtonMarkup(product, d)}
                    </div>
                </td>
            </tr>`;
    };

    // โครงตารางเปล่า (หัวตาราง + tbody ว่าง) — แถวจริงถูกทยอยเติมเข้า tbody ทีละชุดตอนเลื่อนดู
    const posTableShellMarkup = () => {
        const th = 'px-4 py-3 text-[11px] font-bold text-body-muted tracking-wide whitespace-nowrap';
        return `
            <div class="overflow-x-auto rounded-md border border-hairline">
                <table class="w-full min-w-[1120px] border-collapse text-left">
                    <thead>
                        <tr class="bg-surface-tile-2 border-b border-hairline">
                            <th class="${th}">สินค้า</th>
                            <th class="${th}">IMEI</th>
                            <th class="${th}">รายละเอียด</th>
                            <th class="${th}">สาขา</th>
                            <th class="${th}">สต็อกคงเหลือ</th>
                            <th class="${th}">ราคา</th>
                            <th class="${th}">จัดการ</th>
                        </tr>
                    </thead>
                    <tbody class="divide-y divide-hairline"></tbody>
                </table>
            </div>`;
    };

    // อัปเดตบรรทัด "แสดง X จาก Y รายการ" ให้เดินตามจำนวนที่โหลดมาแล้วจริง (รูปแบบเดียวกับหน้าจัดการสต็อก)
    const updatePosLoadedInfo = () => {
        const infoEl = document.getElementById('pos-pagination-info');
        if (!infoEl) return;
        const total = posFilteredData.length;
        infoEl.textContent = total === 0
            ? 'แสดง 0 จาก 0 รายการ'
            : `แสดง ${posLoadedCount.toLocaleString()} จาก ${total.toLocaleString()} รายการ`;
    };

    // โหลดสินค้าชุดถัดไปมาต่อท้ายของเดิม — เรียกซ้ำได้เรื่อยๆ จน posLoadedCount ถึงจำนวนที่กรองไว้ทั้งหมด
    const loadMorePosProducts = () => {
        if (!posSearchResults) return;
        const total = posFilteredData.length;
        if (posLoadedCount >= total) return;

        const batch = posFilteredData.slice(posLoadedCount, posLoadedCount + POS_ITEMS_PER_BATCH);

        if (posViewMode === 'list') {
            const tbody = posSearchResults.querySelector('tbody');
            if (!tbody) return;
            tbody.insertAdjacentHTML('beforeend', batch.map(posTableRowMarkup).join(''));
        } else {
            const frag = document.createDocumentFragment();
            batch.forEach(product => frag.appendChild(renderPosProductCard(product)));
            posSearchResults.appendChild(frag);
        }

        posLoadedCount += batch.length;
        updatePosLoadedInfo();

        // ถ้าโหลดแล้วเนื้อหายังไม่ล้นพื้นที่ที่มองเห็น scroll event จะไม่มีวันยิง
        // และรายการที่เหลือจะเข้าถึงไม่ได้ตลอดไป จึงโหลดต่อจนกว่าจะล้นหรือหมดรายการ
        if (posProductGrid && posLoadedCount < total && posProductGrid.scrollHeight <= posProductGrid.clientHeight) {
            loadMorePosProducts();
        }
    };

    // จับคลิกที่ตัวคอนเทนเนอร์ครั้งเดียว แทนการผูก listener รายปุ่ม — จำเป็นสำหรับ infinite scroll
    // เพราะการ์ดชุดใหม่ถูกเติมเข้ามาเรื่อยๆ ถ้าผูกรายปุ่มแล้วผูกซ้ำทุกชุด ปุ่มชุดเก่าจะมี listener ซ้อนกัน
    // จนกดเพิ่มสินค้าครั้งเดียวแล้วเด้งหลายรอบ
    const bindPosResultsDelegation = () => {
        if (!posSearchResults || posSearchResults.dataset.bound) return;
        posSearchResults.dataset.bound = '1';

        posSearchResults.addEventListener('click', async (e) => {
            const addBtn = e.target.closest('.pos-add-btn');
            if (addBtn && !addBtn.disabled) {
                const product = posProductsCache.find(p => p._id === addBtn.getAttribute('data-product-id'));
                if (product) handleAddToCart(product);
                return;
            }

            const plusBtn = e.target.closest('.pos-card-qty-plus');
            if (plusBtn) {
                const productId = plusBtn.getAttribute('data-product-id');
                const product = posProductsCache.find(p => p._id === productId);
                if (!product) return;
                const currentQty = typeof cart !== 'undefined' ? cart.filter(item => item.product_id === productId).reduce((sum, item) => sum + item.quantity, 0) : 0;
                if (currentQty >= product.quantity) {
                    if (typeof showToast === 'function') showToast(`สินค้า ${product.name} มีไม่เพียงพอในสต็อก`, 'error');
                    return;
                }
                // เพิ่มจำนวนตรงๆ ไม่ผ่าน handleAddToCart/modal ยืนยัน — ปุ่ม +/- มีไว้ปรับจำนวนสินค้าที่ "ยืนยันแล้ว" อยู่ในตะกร้า
                // อย่างรวดเร็ว การเด้ง modal ยืนยันซ้ำทุกครั้งที่กด + ขัดกับความหมายของปุ่มปรับจำนวนแบบ inline
                processAddToCart(product);
                return;
            }

            const minusBtn = e.target.closest('.pos-card-qty-minus');
            if (minusBtn) {
                const productId = minusBtn.getAttribute('data-product-id');
                if (typeof cart === 'undefined') return;
                const idx = cart.map(i => i.product_id).lastIndexOf(productId);
                if (idx === -1) return;
                if (cart[idx].quantity > 1) {
                    cart[idx].quantity -= 1;
                    cart[idx].subtotal = cart[idx].quantity * cart[idx].price;
                } else {
                    cart.splice(idx, 1);
                }
                if (typeof renderCart === 'function') renderCart();
                return;
            }

        });
    };

    const renderPosProductsTable = () => {
        if (!posSearchResults || !posEmptyState) return;

        bindPosResultsDelegation();

        posSearchResults.innerHTML = '';
        posLoadedCount = 0;

        const infoContainer = document.getElementById('pos-pagination-container');
        const resultCountEl = document.getElementById('pos-result-count');
        if (resultCountEl) resultCountEl.textContent = posFilteredData.length.toLocaleString();

        if (posFilteredData.length === 0) {
            // ข้อความ empty-state ต้องแยกกรณี "ยังไม่ได้ค้นหา" กับ "ค้นหาแล้วไม่พบ" — เดิมใช้ข้อความเดียวกันทั้งคู่
            // ("ค้นหาสินค้าเพื่อเริ่มขาย") ซึ่งเข้าใจผิดได้เมื่อผู้ใช้พิมพ์คำค้นหรือเลือกตัวกรองแล้วไม่พบสินค้าจริงๆ
            const brandSelect = document.getElementById('pos-filter-brand');
            const hasActiveFilter = !!(
                (posSearchInput && posSearchInput.value.trim()) ||
                posActiveCategory ||
                (brandSelect && brandSelect.value)
            );
            const titleEl = document.getElementById('pos-empty-state-title');
            const subtitleEl = document.getElementById('pos-empty-state-subtitle');
            if (titleEl && subtitleEl) {
                if (hasActiveFilter) {
                    titleEl.textContent = 'ไม่พบสินค้าที่ตรงกับคำค้นหา';
                    subtitleEl.textContent = 'ลองตรวจสอบคำค้นหา หรือล้างตัวกรองแล้วค้นหาใหม่';
                } else {
                    titleEl.textContent = 'ค้นหาสินค้าเพื่อเริ่มขาย';
                    subtitleEl.textContent = 'พิมพ์ชื่อสินค้า, รหัสสินค้า หรือ IMEI';
                }
            }
            posEmptyState.classList.remove('hidden');
            posSearchResults.classList.add('hidden');
            if (infoContainer) {
                // ต้องถอด flex ออกด้วย ไม่งั้น display:flex จะชนกับ hidden แล้วแถบสรุปยังโผล่อยู่
                infoContainer.classList.remove('flex');
                infoContainer.classList.add('hidden');
            }
            updatePosLoadedInfo();
            return;
        }

        posEmptyState.classList.add('hidden');
        posSearchResults.classList.remove('hidden');
        if (infoContainer) {
            infoContainer.classList.remove('hidden');
            infoContainer.classList.add('flex');
        }

        if (posViewMode === 'list') {
            posSearchResults.className = 'block';
            posSearchResults.innerHTML = posTableShellMarkup();
        } else {
            posSearchResults.className = 'grid grid-cols-1 sm:grid-cols-2 xl:grid-cols-3 gap-3.5';
        }

        if (posProductGrid) posProductGrid.scrollTop = 0;
        loadMorePosProducts();
    };

    const initPosRender = () => {
        if (posSearchInput) posSearchInput.value = '';
        const categorySelect = document.getElementById('pos-filter-category');
        const brandSelect = document.getElementById('pos-filter-brand');
        posActiveCategory = '';
        if (categorySelect) categorySelect.value = '';
        if (brandSelect) brandSelect.value = '';
        renderPosCategoryTabs();
        updatePosStatTotal();
        updatePosFilterDot();
        searchPosProducts();
    };

    const searchPosProducts = (query = null) => {
        const brandSelect = document.getElementById('pos-filter-brand');

        const selectedCategory = posActiveCategory;
        const selectedBrand = brandSelect ? brandSelect.value : '';

        const q = (query !== null ? query : (posSearchInput ? posSearchInput.value : '')).trim().toLowerCase();

        posFilteredData = posProductsCache.filter(p => {
            // สินค้าหมดสต็อกถูกซ่อนไว้เป็นค่าตั้งต้น (พนักงานขายของที่ยังมีอยู่จริงเท่านั้น)
            // แต่เปิดดูได้จากตัวกรอง เพื่อให้เช็คได้ว่าของรุ่นไหนหมดโดยไม่ต้องออกจากหน้าขาย
            if (!posShowOutOfStock && (p.quantity || 0) <= 0) return false;

            // Category filter
            if (selectedCategory && (!p.type_id || p.type_id.name !== selectedCategory)) return false;

            // Brand filter
            if (selectedBrand && getBrandFromProduct(p) !== selectedBrand) return false;

            // Text search filter
            if (q) {
                let matchText = false;
                if (p.name && p.name.toLowerCase().includes(q)) matchText = true;
                if (p.product_code && p.product_code.toLowerCase().includes(q)) matchText = true;
                if (p.imeis && p.imeis.some(imei => imei.toLowerCase().includes(q))) matchText = true;
                if (!matchText) return false;
            }

            return true;
        });

        const byName = (a, b) => (a.name || '').localeCompare(b.name || '', 'th', { numeric: true });
        posFilteredData.sort((a, b) => {
            switch (posSortMode) {
                case 'name-desc': return -byName(a, b);
                case 'price-asc': return (a.selling_price || 0) - (b.selling_price || 0);
                case 'price-desc': return (b.selling_price || 0) - (a.selling_price || 0);
                case 'stock-desc': return (b.quantity || 0) - (a.quantity || 0);
                case 'recent': {
                    // ลำดับเดิมของระบบ: เครื่อง (มือถือ/แท็บเล็ต) มาก่อน แล้วเรียงตามของที่เพิ่งเพิ่มเข้าระบบล่าสุด
                    const isDeviceA = typeof checkIsDevice === 'function' ? checkIsDevice(a.type_id ? a.type_id.name : '', a) : false;
                    const isDeviceB = typeof checkIsDevice === 'function' ? checkIsDevice(b.type_id ? b.type_id.name : '', b) : false;
                    if (isDeviceA !== isDeviceB) return isDeviceA ? -1 : 1;
                    return new Date(b.created_at || 0).getTime() - new Date(a.created_at || 0).getTime();
                }
                default: return byName(a, b);
            }
        });

        renderPosProductsTable();
    };

    // Confirmation Modal Elements
    const modalConfirmAddCart = document.getElementById('modal-confirm-add-cart');
    const btnCancelAddCart = document.getElementById('btn-cancel-add-cart');
    const btnConfirmAddCart = document.getElementById('btn-confirm-add-cart');
    const confirmAddProductName = document.getElementById('confirm-add-product-name');
    const confirmAddProductCode = document.getElementById('confirm-add-product-code');
    const confirmAddProductDetails = document.getElementById('confirm-add-product-details');
    let pendingProductToCart = null;

    if (btnCancelAddCart && modalConfirmAddCart) {
        btnCancelAddCart.addEventListener('click', () => {
            pendingProductToCart = null;
            modalConfirmAddCart.classList.add('opacity-0', 'pointer-events-none');
            modalConfirmAddCart.children[0].classList.add('scale-95');
        });
    }
    if (btnConfirmAddCart) {
        btnConfirmAddCart.addEventListener('click', () => {
            if (pendingProductToCart) {
                processAddToCart(pendingProductToCart);
                pendingProductToCart = null;
                modalConfirmAddCart.classList.add('opacity-0', 'pointer-events-none');
                modalConfirmAddCart.children[0].classList.add('scale-95');
            }
        });
    }

    const handleAddToCart = (product) => {
        if (!modalConfirmAddCart) {
            // Fallback if modal not present
            processAddToCart(product);
            return;
        }

        pendingProductToCart = product;
        confirmAddProductName.textContent = product.name;

        if (confirmAddProductCode) {
            confirmAddProductCode.textContent = product.product_code || '';
            confirmAddProductCode.style.display = product.product_code ? 'block' : 'none';
        }

        let details = [];
        if (product.type_id && product.type_id.name) details.push(product.type_id.name);
        if (product.capacity_id && product.capacity_id.name) details.push(product.capacity_id.name);
        if (product.color_id && product.color_id.name) details.push(product.color_id.name);
        details.push(`ราคา: ฿${(product.selling_price || 0).toLocaleString()}`);

        confirmAddProductDetails.textContent = details.join(' | ');

        modalConfirmAddCart.classList.remove('opacity-0', 'pointer-events-none');
        modalConfirmAddCart.children[0].classList.remove('scale-95');
    };

    // Actual Add to Cart Logic
    const processAddToCart = (product) => {
        const hasImeis = Array.isArray(product.imeis) && product.imeis.length > 0;
        const typeName = product.type_id ? (product.type_id.name || '') : '';
        const unitName = product.unit_id ? (product.unit_id.name || '') : '';
        const isDeviceLike = unitName.includes('เครื่อง') || typeName.toLowerCase().includes('iphone') || typeName.toLowerCase().includes('ipad');
        const shouldUseImeiFlow = hasImeis;

        if (shouldUseImeiFlow) {
            // Filter out IMEIs already in cart
            const cartImeis = cart.filter(i => i.product_id === product._id).map(i => i.imei_sold);
            let availableImeis = (product.imeis || []).filter(imei => !cartImeis.includes(imei));

            // Fallback: if product has no IMEIs in stock, use product_code as identifier
            if (availableImeis.length === 0 && product.product_code) {
                if (product.quantity <= 0) {
                    showToast(`สินค้า ${product.name} หมดสต็อก`, 'error');
                    return;
                }
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
                    ...getCartProductSnapshot(product),
                    imei_sold: imei,
                    quantity: 1,
                    price: product.selling_price,
                    subtotal: product.selling_price,
                    _isDevice: true,
                    is_gift: false,
                    unit_name: product.unit_id ? (product.unit_id.name || '') : '',
                    original_price: product.selling_price
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
                if (product.quantity <= 0) {
                    showToast(`สินค้า ${product.name} หมดสต็อก`, 'error');
                    return;
                }
                cart.push({
                    product_id: product._id,
                    product_name: product.name,
                    ...getCartProductSnapshot(product),
                    imei_sold: '',
                    quantity: 1,
                    price: product.selling_price,
                    subtotal: product.selling_price,
                    _isDevice: isDeviceLike,
                    is_gift: false,
                    unit_name: product.unit_id ? (product.unit_id.name || '') : 'ชิ้น',
                    original_price: product.selling_price
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
                    <div class="text-center py-8 text-body-muted">
                        <i class="fa-solid fa-search text-2xl mb-2"></i>
                        <p class="text-sm">ไม่พบ IMEI ที่ค้นหา</p>
                    </div>
                `;
                return;
            }

            filtered.forEach(imei => {
                const item = document.createElement('button');
                item.className = 'w-full text-left px-4 py-3 rounded-md bg-canvas border border-hairline hover:border-primary/40 hover:bg-surface-chip transition-all flex items-center gap-3 group';
                item.innerHTML = `
                    <div class="w-8 h-8 rounded-sm bg-surface-chip flex items-center justify-center text-ink flex-shrink-0">
                        <i class="fa-solid fa-sim-card text-sm"></i>
                    </div>
                    <div class="flex-1 min-w-0">
                        <p class="font-mono text-ink text-sm font-medium">${imei}</p>
                        <p class="text-xs text-body-muted">${product.name}</p>
                    </div>
                    <i class="fa-solid fa-plus text-primary opacity-0 group-hover:opacity-100 transition-opacity"></i>
                `;
                item.addEventListener('click', () => {
                    // Add specific IMEI to cart
                    cart.push({
                        product_id: product._id,
                        product_name: product.name,
                        ...getCartProductSnapshot(product),
                        imei_sold: imei,
                        quantity: 1,
                        price: product.selling_price,
                        subtotal: product.selling_price,
                        _isDevice: true,
                        is_gift: false,
                        unit_name: product.unit_id ? (product.unit_id.name || '') : '',
                        original_price: product.selling_price
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

    const syncPOSCardQuantities = () => {
        document.querySelectorAll('.pos-card').forEach(card => {
            const productId = card.getAttribute('data-product-id');
            const qtyInCart = typeof cart !== 'undefined' ? cart.filter(item => item.product_id === productId).reduce((sum, item) => sum + item.quantity, 0) : 0;

            const controls = card.querySelector('.pos-qty-controls');
            const display = card.querySelector('.pos-card-qty-display');
            const addBtn = card.querySelector('.pos-add-btn');

            if (qtyInCart > 0) {
                if (controls) controls.classList.remove('hidden');
                if (display) display.textContent = qtyInCart;
                if (addBtn) addBtn.classList.add('hidden');
            } else {
                if (controls) controls.classList.add('hidden');
                if (addBtn) addBtn.classList.remove('hidden');
            }
        });
    };

    // Render Cart
    const renderCart = () => {
        if (!cartItemsContainer) return;

        // Remove old cart items (keep empty state)
        const existingItems = cartItemsContainer.querySelectorAll('.cart-item');
        existingItems.forEach(el => el.remove());

        if (cart.length === 0) {
            if (cartEmptyState) cartEmptyState.classList.remove('hidden');
            if (cartHintBanner) cartHintBanner.classList.remove('hidden');
            if (cartCountBadge) cartCountBadge.textContent = '0 รายการ';
            updateCartTotals();
            if (typeof renderMobileCart === 'function') renderMobileCart();
            // ตะกร้าว่างแล้ว ต้องรีเซ็ตการ์ดสินค้าในกริดกลับเป็นสถานะ "เพิ่ม" ด้วย ไม่งั้นการ์ดของสินค้าชิ้นล่าสุดที่เพิ่งลบออก
            // จะค้างแสดงตัวปรับจำนวนที่ค่าเก่า (เพราะฟังก์ชันนี้ return ก่อนถึงจุดที่ sync กริดตามปกติด้านล่าง)
            if (typeof syncPOSCardQuantities === 'function') syncPOSCardQuantities();
            return;
        }

        if (cartEmptyState) cartEmptyState.classList.add('hidden');
        if (cartHintBanner) cartHintBanner.classList.add('hidden');
        if (cartCountBadge) cartCountBadge.textContent = `${cart.length} รายการ`;

        cart.forEach((item, index) => {
            const cartEl = document.createElement('div');
            cartEl.className = 'cart-item bg-canvas border border-hairline rounded-md p-3 flex items-center gap-3 transition-colors animate-fade-in';
            const itemColorTheme = getProductColorTheme(item.color_name, null);
            cartEl.innerHTML = `
                <div class="w-10 h-10 rounded-sm border flex items-center justify-center flex-shrink-0" style="color:${itemColorTheme.icon};background-color:${itemColorTheme.bg};border-color:${itemColorTheme.border};">
                    <i class="fa-solid ${item._isDevice ? 'fa-mobile-screen' : 'fa-box'} text-lg"></i>
                </div>
                <div class="flex-1 min-w-0">
                    <p class="font-medium text-ink text-sm truncate">${item.product_name}</p>
                    <p class="text-xs text-body-muted mt-0.5 truncate">
                        ${item.imei_sold ? `IMEI: ...${item.imei_sold.slice(-6)}` : `จำนวน: ${item.quantity}`}
                    </p>
                </div>
                <div class="text-right flex-shrink-0">
                    <div class="flex flex-col items-end justify-center">
                        <span class="text-[10px] text-ink-muted-48 uppercase font-bold tracking-wider">ราคา/หน่วย</span>
                    </div>
                    <p class="cart-line-subtotal font-bold text-ink font-mono text-sm mt-0.5">฿${item.subtotal.toLocaleString()}</p>
                    ${!item.imei_sold ? `
                        <div class="flex items-center gap-1 mt-1 justify-end">
                            <button class="cart-qty-minus w-6 h-6 rounded-sm bg-surface-chip text-body-muted hover:bg-surface-tile-2 text-xs flex items-center justify-center transition-colors" data-index="${index}">
                                <i class="fa-solid fa-minus text-[10px]"></i>
                            </button>
                            <span class="text-xs text-body-muted font-mono w-6 text-center">${item.quantity}</span>
                            <button class="cart-qty-plus w-6 h-6 rounded-sm bg-surface-chip text-body-muted hover:bg-surface-tile-2 text-xs flex items-center justify-center transition-colors" data-index="${index}">
                                <i class="fa-solid fa-plus text-[10px]"></i>
                            </button>
                        </div>
                    ` : ''}
                </div>
                <button class="cart-remove-btn text-body-muted hover:text-red-400 transition-colors p-1.5 rounded-sm hover:bg-red-500/10 flex-shrink-0" data-index="${index}">
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
        // Sync POS card quantities
        if (typeof syncPOSCardQuantities === 'function') syncPOSCardQuantities();
        // Sync mobile cart
        if (typeof renderMobileCart === 'function') renderMobileCart();
    };

    const formatBaht = (n) => `฿${Number(n || 0).toLocaleString('th-TH', { minimumFractionDigits: 2, maximumFractionDigits: 2 })}`;

    const updateCartTotals = () => {
        const subtotal = cart.reduce((sum, item) => sum + item.subtotal, 0);
        // ส่วนลดมาจากช่องเดียวกับที่ใช้ตอนชำระเงิน จึงเห็นยอดสุทธิตรงกันทั้งในตะกร้าและในหน้าจ่ายเงิน
        const discountInput = document.getElementById('modal-pos-discount');
        const discount = Math.min(subtotal, Math.max(0, parseFloat(discountInput ? discountInput.value : 0) || 0));

        const discountEl = document.getElementById('cart-discount');
        const netEl = document.getElementById('cart-net-total');

        if (cartSubtotal) cartSubtotal.textContent = formatBaht(subtotal);
        if (discountEl) discountEl.textContent = discount > 0 ? `-${formatBaht(discount)}` : formatBaht(0);
        if (netEl) netEl.textContent = formatBaht(subtotal - discount);
    };

    // ==========================================
    // Mobile POS Cart Logic
    // ==========================================
    const mobileCartFab = document.getElementById('pos-mobile-cart-fab');
    const mobileCartOverlay = document.getElementById('pos-mobile-cart-overlay');
    const mobileCartPanel = document.getElementById('pos-mobile-cart-panel');
    const mobileCartItemsList = document.getElementById('mobile-cart-items-list');
    const mobileCartCountNum = document.getElementById('mobile-cart-count-num');
    const mobileCartTotal = document.getElementById('mobile-cart-total');
    const mobileCartBranchName = document.getElementById('mobile-cart-branch-name');
    const cartFabBadgeCount = document.getElementById('cart-fab-badge-count');
    const btnCloseMobileCart = document.getElementById('btn-close-mobile-cart');
    const btnMobileCheckout = document.getElementById('btn-mobile-checkout');

    let mobileCartOpen = false;

    const showMobileCartFab = () => {
        if (mobileCartFab && window.innerWidth < 1024) {
            mobileCartFab.style.display = 'flex';
        }
    };

    const hideMobileCartFab = () => {
        if (mobileCartFab) {
            mobileCartFab.style.display = 'none';
        }
        closeMobileCart();
    };

    // ปรับปุ่มตะกร้าลอย (FAB) แบบเรียลไทม์เมื่อผู้ใช้ปรับขนาดหน้าต่าง/หมุนจอ ระหว่างที่ยังอยู่หน้ารายการขาย
    // (ก่อนหน้านี้ปุ่มจะเช็คขนาดจอแค่ตอนสลับเข้าหน้าเท่านั้น ถ้าปรับขนาดจอค้างอยู่ที่หน้านี้ ปุ่มจะไม่อัปเดตตาม)
    window.addEventListener('resize', () => {
        if (!viewTransactions || viewTransactions.classList.contains('hidden')) return;
        if (window.innerWidth < 1024) {
            showMobileCartFab();
        } else {
            hideMobileCartFab();
        }
    });

    const openMobileCart = () => {
        if (!mobileCartOverlay || !mobileCartPanel) return;
        mobileCartOpen = true;
        mobileCartOverlay.style.display = 'block';
        mobileCartPanel.style.display = 'flex';
        requestAnimationFrame(() => {
            mobileCartOverlay.classList.add('active');
            mobileCartPanel.classList.add('active');
        });
        renderMobileCart();
    };

    const closeMobileCart = () => {
        if (!mobileCartOverlay || !mobileCartPanel) return;
        mobileCartOpen = false;
        mobileCartOverlay.classList.remove('active');
        mobileCartPanel.classList.remove('active');
        setTimeout(() => {
            if (!mobileCartOpen) {
                mobileCartOverlay.style.display = 'none';
                mobileCartPanel.style.display = 'none';
            }
        }, 300);
    };

    const renderMobileCart = () => {
        if (!mobileCartItemsList) return;

        // Update branch name
        if (mobileCartBranchName) {
            const user = getCurrentUserForPos();
            const branchName = user && user.branch && user.branch.name ? user.branch.name : '-';
            mobileCartBranchName.textContent = '\u0e04\u0e25\u0e31\u0e07\u0e2a\u0e34\u0e19\u0e04\u0e49\u0e32 : ' + branchName;
        }

        // Update count
        if (mobileCartCountNum) {
            mobileCartCountNum.textContent = cart.length;
        }

        // Update FAB badge
        if (cartFabBadgeCount) {
            cartFabBadgeCount.textContent = cart.length;
            cartFabBadgeCount.style.display = cart.length > 0 ? 'flex' : 'none';
        }

        // Update total
        const subtotal = cart.reduce((sum, item) => sum + item.subtotal, 0);
        if (mobileCartTotal) {
            mobileCartTotal.innerHTML = '<span class="baht">\u0e3f</span>' + subtotal.toLocaleString();
        }

        // Clear and render items
        mobileCartItemsList.innerHTML = '';

        if (cart.length === 0) {
            const emptyDiv = document.createElement('div');
            emptyDiv.className = 'mobile-cart-empty flex flex-col items-center justify-center gap-2 py-10 text-body-muted';
            emptyDiv.innerHTML = '<i class="fa-solid fa-cart-shopping text-2xl"></i><p class="text-sm">\u0e44\u0e21\u0e48\u0e21\u0e35\u0e2a\u0e34\u0e19\u0e04\u0e49\u0e32\u0e43\u0e19\u0e15\u0e30\u0e01\u0e23\u0e49\u0e32</p>';
            mobileCartItemsList.appendChild(emptyDiv);
            return;
        }

        cart.forEach((item, index) => {
            const el = document.createElement('div');
            el.className = 'mobile-cart-item flex items-center gap-3 bg-canvas border border-hairline rounded-md p-3';

            const itemColorTheme = getProductColorTheme(item.color_name, null);
            const iconDiv = document.createElement('div');
            iconDiv.className = 'item-icon w-10 h-10 rounded-sm border flex items-center justify-center flex-shrink-0';
            iconDiv.style.color = itemColorTheme.icon;
            iconDiv.style.backgroundColor = itemColorTheme.bg;
            iconDiv.style.borderColor = itemColorTheme.border;
            iconDiv.innerHTML = '<i class="fa-solid ' + (item._isDevice ? 'fa-mobile-screen' : 'fa-box') + '"></i>';

            const infoDiv = document.createElement('div');
            infoDiv.className = 'item-info flex-1 min-w-0';
            const nameDiv = document.createElement('div');
            nameDiv.className = 'item-name font-medium text-ink text-sm truncate';
            nameDiv.textContent = item.product_name;
            const detailDiv = document.createElement('div');
            detailDiv.className = 'item-detail text-xs text-body-muted mt-0.5 truncate';
            detailDiv.textContent = item.imei_sold ? 'IMEI: ...' + item.imei_sold.slice(-6) : '\u0e08\u0e33\u0e19\u0e27\u0e19: ' + item.quantity;
            infoDiv.appendChild(nameDiv);
            infoDiv.appendChild(detailDiv);

            const pricesDiv = document.createElement('div');
            pricesDiv.className = 'item-prices text-right flex-shrink-0 flex flex-col items-end gap-0.5';
            const unitPrice = document.createElement('div');
            unitPrice.className = 'unit-price text-xs text-ink-muted-48 font-mono';
            unitPrice.textContent = '\u0e3f' + item.price.toLocaleString();
            const subtotalPrice = document.createElement('div');
            subtotalPrice.className = 'subtotal-price text-sm font-bold text-ink font-mono';
            subtotalPrice.textContent = '\u0e3f' + item.subtotal.toLocaleString();
            pricesDiv.appendChild(unitPrice);
            pricesDiv.appendChild(subtotalPrice);

            // \u0e2a\u0e34\u0e19\u0e04\u0e49\u0e32\u0e17\u0e35\u0e48\u0e44\u0e21\u0e48\u0e43\u0e0a\u0e48 IMEI \u0e1b\u0e23\u0e31\u0e1a\u0e08\u0e33\u0e19\u0e27\u0e19\u0e44\u0e14\u0e49\u0e15\u0e23\u0e07\u0e19\u0e35\u0e49\u0e40\u0e25\u0e22 \u2014 \u0e04\u0e39\u0e48\u0e02\u0e19\u0e32\u0e19\u0e01\u0e31\u0e1a\u0e15\u0e31\u0e27\u0e1b\u0e23\u0e31\u0e1a\u0e08\u0e33\u0e19\u0e27\u0e19\u0e1a\u0e19\u0e15\u0e30\u0e01\u0e23\u0e49\u0e32\u0e40\u0e14\u0e2a\u0e01\u0e4c\u0e17\u0e47\u0e2d\u0e1b
            // (\u0e40\u0e14\u0e34\u0e21\u0e21\u0e35\u0e41\u0e04\u0e48\u0e1b\u0e38\u0e48\u0e21\u0e25\u0e1a\u0e43\u0e19\u0e15\u0e30\u0e01\u0e23\u0e49\u0e32\u0e21\u0e37\u0e2d\u0e16\u0e37\u0e2d \u0e15\u0e49\u0e2d\u0e07\u0e1b\u0e34\u0e14\u0e41\u0e1c\u0e07\u0e41\u0e25\u0e49\u0e27\u0e22\u0e49\u0e2d\u0e19\u0e44\u0e1b\u0e01\u0e32\u0e23\u0e4c\u0e14\u0e2a\u0e34\u0e19\u0e04\u0e49\u0e32\u0e40\u0e1e\u0e37\u0e48\u0e2d\u0e40\u0e1e\u0e34\u0e48\u0e21\u0e08\u0e33\u0e19\u0e27\u0e19 \u0e44\u0e21\u0e48\u0e15\u0e23\u0e07\u0e01\u0e31\u0e1a\u0e15\u0e30\u0e01\u0e23\u0e49\u0e32\u0e40\u0e14\u0e2a\u0e01\u0e4c\u0e17\u0e47\u0e2d\u0e1b)
            if (!item.imei_sold) {
                const qtyRow = document.createElement('div');
                qtyRow.className = 'flex items-center gap-1 mt-0.5';

                const minusBtn = document.createElement('button');
                minusBtn.className = 'mobile-cart-qty-minus w-11 h-11 rounded-sm bg-surface-chip text-body-muted hover:bg-surface-tile-2 text-xs flex items-center justify-center transition-colors';
                minusBtn.innerHTML = '<i class="fa-solid fa-minus text-[10px]"></i>';
                minusBtn.addEventListener('click', () => {
                    if (item.quantity > 1) {
                        item.quantity -= 1;
                        item.subtotal = item.quantity * item.price;
                        renderCart();
                    }
                });

                const qtyLabel = document.createElement('span');
                qtyLabel.className = 'text-xs text-body-muted font-mono w-5 text-center';
                qtyLabel.textContent = item.quantity;

                const plusBtn = document.createElement('button');
                plusBtn.className = 'mobile-cart-qty-plus w-11 h-11 rounded-sm bg-surface-chip text-body-muted hover:bg-surface-tile-2 text-xs flex items-center justify-center transition-colors';
                plusBtn.innerHTML = '<i class="fa-solid fa-plus text-[10px]"></i>';
                plusBtn.addEventListener('click', () => {
                    const product = posProductsCache.find(p => p._id === item.product_id);
                    if (product && item.quantity >= product.quantity) {
                        showToast(`\u0e2a\u0e34\u0e19\u0e04\u0e49\u0e32 ${item.product_name} \u0e21\u0e35\u0e44\u0e21\u0e48\u0e40\u0e1e\u0e35\u0e22\u0e07\u0e1e\u0e2d\u0e43\u0e19\u0e2a\u0e15\u0e47\u0e2d\u0e01`, 'error');
                        return;
                    }
                    item.quantity += 1;
                    item.subtotal = item.quantity * item.price;
                    renderCart();
                });

                qtyRow.appendChild(minusBtn);
                qtyRow.appendChild(qtyLabel);
                qtyRow.appendChild(plusBtn);
                pricesDiv.appendChild(qtyRow);
            }

            const removeDiv = document.createElement('button');
            removeDiv.type = 'button';
            removeDiv.setAttribute('aria-label', 'ลบสินค้าออกจากตะกร้า');
            removeDiv.className = 'item-remove w-11 h-11 flex items-center justify-center text-body-muted hover:text-red-400 rounded-sm hover:bg-red-500/10 flex-shrink-0 transition-colors';
            removeDiv.dataset.index = index;
            removeDiv.innerHTML = '<i class="fa-solid fa-trash-can" style="font-size:12px;"></i>';
            removeDiv.addEventListener('click', () => {
                cart.splice(index, 1);
                renderCart();
            });

            el.appendChild(iconDiv);
            el.appendChild(infoDiv);
            el.appendChild(pricesDiv);
            el.appendChild(removeDiv);
            mobileCartItemsList.appendChild(el);
        });
    };

    // FAB click -> toggle cart overlay
    if (mobileCartFab) {
        mobileCartFab.addEventListener('click', () => {
            if (mobileCartOpen) {
                closeMobileCart();
            } else {
                openMobileCart();
            }
        });
    }

    // Close button
    if (btnCloseMobileCart) {
        btnCloseMobileCart.addEventListener('click', closeMobileCart);
    }

    // Overlay click -> close
    if (mobileCartOverlay) {
        mobileCartOverlay.addEventListener('click', closeMobileCart);
    }

    // Mobile checkout -> trigger existing checkout button
    if (btnMobileCheckout) {
        btnMobileCheckout.addEventListener('click', () => {
            closeMobileCart();
            const mainCheckoutBtn = document.getElementById('btn-checkout');
            if (mainCheckoutBtn) {
                mainCheckoutBtn.click();
            }
        });
    }

    const validateFinancePrices = () => {
        const isFinancing = (paymentMethod && paymentMethod.value === 'จัดไฟแนนซ์');

        cart.forEach((item, index) => {
            const badgeContainer = confirmPriceList ? confirmPriceList.querySelector(`.modal-item-price-badge[data-index="${index}"]`) : null;
            const input = confirmPriceList ? confirmPriceList.querySelector(`.modal-item-price-input[data-index="${index}"]`) : null;

            if (input) {
                if (item.is_gift || item.unit_name !== 'เครื่อง') {
                    input.setAttribute('disabled', 'true');
                    input.classList.add('opacity-60', 'bg-surface-tile-3/50');
                } else if (isFinancing) {
                    input.removeAttribute('disabled');
                    input.classList.remove('opacity-60', 'bg-surface-tile-3/50');
                } else {
                    input.setAttribute('disabled', 'true');
                    input.classList.add('opacity-60', 'bg-surface-tile-3/50');
                }
            }

            if (!badgeContainer) return;

            if (item.is_gift || item.unit_name !== 'เครื่อง') {
                badgeContainer.innerHTML = '';
                const targetPrice = item.is_gift ? 0 : (item.default_selling_price !== undefined ? item.default_selling_price : (item.original_price || 0));
                if (item.price !== targetPrice) {
                    item.price = targetPrice;
                    item.subtotal = item.price * item.quantity;
                    if (input) input.value = item.price;
                    const subtotalLabel = confirmPriceList ? confirmPriceList.querySelector(`.modal-item-subtotal[data-index="${index}"]`) : null;
                    if (subtotalLabel) {
                        subtotalLabel.textContent = `฿${item.subtotal.toLocaleString()}`;
                    }
                }
                return;
            }

            if (!isFinancing) {
                badgeContainer.innerHTML = '';
                const targetPrice = item.default_selling_price !== undefined ? item.default_selling_price : (item.original_price || 0);
                if (item.price !== targetPrice) {
                    item.price = targetPrice;
                    item.subtotal = item.price * item.quantity;
                    if (input) input.value = item.price;
                    const subtotalLabel = confirmPriceList ? confirmPriceList.querySelector(`.modal-item-subtotal[data-index="${index}"]`) : null;
                    if (subtotalLabel) {
                        subtotalLabel.textContent = `฿${item.subtotal.toLocaleString()}`;
                    }
                }
                return;
            }

            const currentPrice = item.price;
            const costPrice = item.cost_price || 0;
            const defaultSellingPrice = item.default_selling_price || 0;

            if (currentPrice < costPrice) {
                badgeContainer.innerHTML = `
                    <div class="px-2.5 py-1 rounded-lg text-[10px] font-bold bg-red-500/20 text-red-400 border border-red-500/30 flex items-center gap-1 mt-2.5 animate-pulse">
                        <i class="fa-solid fa-circle-exclamation"></i>
                        <span>ผิดพลาด: ราคาขายจัดไฟแนนซ์ต่ำกว่าราคาทุนของสินค้า</span>
                    </div>
                `;
            } else if (currentPrice < defaultSellingPrice) {
                badgeContainer.innerHTML = `
                    <div class="px-2.5 py-1 rounded-lg text-[10px] font-bold bg-amber-500/20 text-amber-400 border border-amber-500/30 flex items-center gap-1 mt-2.5">
                        <i class="fa-solid fa-triangle-exclamation"></i>
                        <span>ราคาต่ำกว่าราคาขายสดหน้าร้าน</span>
                    </div>
                `;
            } else {
                badgeContainer.innerHTML = '';
            }
        });

        // หมายเหตุ: ปุ่ม "ชำระเงิน" ตั้งใจให้เป็นสีเขียวและกดได้ตลอด ไม่ disable ล่วงหน้าจาก state
        // การตรวจสอบราคาต่ำกว่าทุนจริงๆ ทำตอนกดปุ่มใน checkoutNow() แทน (ดู badge สีแดงที่รายการสินค้าด้านบนประกอบ)
    };

    const updateFinancingAmount = () => {
        const financingInput = document.getElementById('modal-finance-financing-amount');
        if (!financingInput) return;

        const discount = posDiscount ? (parseFloat(posDiscount.value) || 0) : 0;
        const depositVal = appliedDepositAmount ? (parseFloat(appliedDepositAmount.value) || 0) : 0;
        const devicesTotal = cart.filter(item => item.unit_name === 'เครื่อง').reduce((sum, item) => sum + item.subtotal, 0);
        const totalDown = parseFloat(modalFinanceDownTotal ? modalFinanceDownTotal.value : 0) || 0;

        // ยอดจัด = ราคาเครื่อง - ส่วนลด - เงินมัดจำ (ดาวน์ก้อนแรก) - เงินดาวน์เพิ่ม (totalDown)
        const netDevicesTotal = Math.max(0, devicesTotal - discount - depositVal);
        const financingAmount = Math.max(0, netDevicesTotal - totalDown);

        financingInput.value = financingAmount.toLocaleString(undefined, { minimumFractionDigits: 2 });
    };

    const updateModalTotals = () => {
        validateFinancePrices();
        const subtotal = cart.reduce((sum, item) => sum + item.subtotal, 0);
        const discount = posDiscount ? (parseFloat(posDiscount.value) || 0) : 0;

        // Additional fees & Deposit inclusion
        const contractFee = (checkboxContractFee && checkboxContractFee.checked) ? (parseFloat(inputContractFee.value) || 0) : 0;
        const icloudFee = (checkboxIcloudFee && checkboxIcloudFee.checked) ? (parseFloat(inputIcloudFee.value) || 0) : 0;

        const depositVal = appliedDepositAmount ? (parseFloat(appliedDepositAmount.value) || 0) : 0;
        const grandTotal = Math.max(0, subtotal - discount - depositVal + contractFee + icloudFee);
        updateFinancingAmount();

        if (modalSubtotalDisplay) modalSubtotalDisplay.textContent = `฿${subtotal.toLocaleString(undefined, { minimumFractionDigits: 2 })}`;
        if (modalDiscountDisplay) modalDiscountDisplay.textContent = `-฿${discount.toLocaleString(undefined, { minimumFractionDigits: 2 })}`;

        // Applied Deposit Display Sync
        if (modalAppliedDepositRow) {
            if (depositVal > 0) {
                modalAppliedDepositRow.classList.remove('hidden');
                modalAppliedDepositRow.classList.add('flex');
                if (modalAppliedDepositDisplay) modalAppliedDepositDisplay.textContent = `-฿${depositVal.toLocaleString(undefined, { minimumFractionDigits: 2 })}`;
            } else {
                modalAppliedDepositRow.classList.add('hidden');
                modalAppliedDepositRow.classList.remove('flex');
            }
        }

        // Dynamic Additional Fees Ledger Sync
        const modalContractRow = document.getElementById('modal-contract-row');
        if (modalContractRow) {
            if (checkboxContractFee && checkboxContractFee.checked) {
                modalContractRow.classList.remove('hidden');
                modalContractRow.classList.add('flex');
                if (modalContractDisplay) modalContractDisplay.textContent = `฿${contractFee.toLocaleString(undefined, { minimumFractionDigits: 2 })}`;
            } else {
                modalContractRow.classList.add('hidden');
                modalContractRow.classList.remove('flex');
            }
        }

        const modalIcloudRow = document.getElementById('modal-icloud-row');
        if (modalIcloudRow) {
            if (checkboxIcloudFee && checkboxIcloudFee.checked) {
                modalIcloudRow.classList.remove('hidden');
                modalIcloudRow.classList.add('flex');
                if (modalIcloudDisplay) modalIcloudDisplay.textContent = `฿${icloudFee.toLocaleString(undefined, { minimumFractionDigits: 2 })}`;
            } else {
                modalIcloudRow.classList.add('hidden');
                modalIcloudRow.classList.remove('flex');
            }
        }

        if (modalTotalDisplay) modalTotalDisplay.textContent = `฿${grandTotal.toLocaleString(undefined, { minimumFractionDigits: 2 })}`;

        // ให้สรุปยอดในตะกร้าด้านข้างเดินตามส่วนลดที่กรอกในหน้าจ่ายเงินทันที
        if (typeof updateCartTotals === 'function') updateCartTotals();

        // Update Finance Summary Breakdown Row in Ledger
        const modalFinanceSummaryRow = document.getElementById('modal-finance-summary-row');
        const selectedPayment = paymentMethod ? paymentMethod.value : '';
        if (modalFinanceSummaryRow) {
            if (selectedPayment === 'จัดไฟแนนซ์') {
                modalFinanceSummaryRow.classList.remove('hidden');
                modalFinanceSummaryRow.classList.add('flex');

                const devicesTotal = cart.filter(item => item.unit_name === 'เครื่อง').reduce((sum, item) => sum + item.subtotal, 0);
                const netDevicesTotal = Math.max(0, devicesTotal - discount - depositVal);
                const totalDown = parseFloat(modalFinanceDownTotal ? modalFinanceDownTotal.value : 0) || 0;
                const financingAmount = Math.max(0, netDevicesTotal - totalDown);

                // ยอดที่ต้องรับเงินเพิ่มหน้าร้าน = ยอดเงินดาวน์เพิ่ม + ค่าบริการสัญญา + ค่า iCloud (เนื่องจากค่ามัดจำจ่ายไปก่อนหน้านี้แล้ว)
                const totalUpfrontToCollect = Math.max(0, totalDown + contractFee + icloudFee);

                const summaryAmountEl = document.getElementById('modal-finance-summary-amount');
                const summaryDownEl = document.getElementById('modal-finance-summary-down');
                const summaryUpfrontEl = document.getElementById('modal-finance-summary-upfront');

                if (summaryAmountEl) summaryAmountEl.textContent = `฿${financingAmount.toLocaleString(undefined, { minimumFractionDigits: 2 })}`;
                if (summaryDownEl) summaryDownEl.textContent = `฿${(totalDown + depositVal).toLocaleString(undefined, { minimumFractionDigits: 2 })}`; // แสดงเงินดาวน์รวม = ดาวน์เพิ่ม + มัดจำ
                if (summaryUpfrontEl) summaryUpfrontEl.textContent = `฿${totalUpfrontToCollect.toLocaleString(undefined, { minimumFractionDigits: 2 })}`;
            } else {
                modalFinanceSummaryRow.classList.add('hidden');
                modalFinanceSummaryRow.classList.remove('flex');
            }
        }

        // ===================================================================
        // ตรวจรับเงินและคำนวณเงินทอน Real-time Payment Verification Pipeline
        // ===================================================================

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
                    paymentStatusBadge.innerHTML = `<span class="w-2 h-2 rounded-full bg-red-500 animate-pulse"></span> ขาดเงินอีก`;
                }
                if (verifyResultLabel) verifyResultLabel.textContent = 'ยอดขาดคงเหลือ';
                if (verifyChangeDisplay) {
                    verifyChangeDisplay.textContent = `฿${missing.toLocaleString(undefined, { minimumFractionDigits: 2 })}`;
                    verifyChangeDisplay.className = 'text-2xl font-black font-mono text-red-400 animate-pulse';
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

            }
        } else if (selectedPayment === 'จัดไฟแนนซ์') {
            if (paymentVerifyPanel) paymentVerifyPanel.classList.add('hidden');
            updateFinanceDownPaymentLabel();
        } else {
            // ยังไม่ได้เลือกวิธีชำระเงิน — ปุ่ม "ชำระเงิน" ยังคงเป็นสีเขียวและกดได้เสมอ
            // ตรวจสอบว่าเลือกวิธีชำระเงินหรือยังตอนกดปุ่มใน checkoutNow() แทน
            if (paymentVerifyPanel) paymentVerifyPanel.classList.add('hidden');
        }
    };

    if (posDiscount) {
        posDiscount.addEventListener('input', () => {
            updateModalTotals();
        });
    }

    if (modalCashAmount) {
        modalCashAmount.addEventListener('input', () => {
            clearPosInlineErrors();
            updateModalTotals();
        });
    }

    if (modalTransferAmount) {
        modalTransferAmount.addEventListener('input', () => {
            clearPosInlineErrors();
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
            ...getCartProductSnapshot(product),
            imei_sold: imei.toString().trim(),
            quantity: 1,
            price: product.selling_price,
            subtotal: product.selling_price,
            _isDevice: true,
            is_gift: false,
            unit_name: product.unit_id ? (product.unit_id.name || '') : '',
            original_price: product.selling_price
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
                ...getCartProductSnapshot(product),
                imei_sold: '',
                quantity: 1,
                price: product.selling_price,
                subtotal: product.selling_price,
                _isDevice: false,
                is_gift: false,
                unit_name: product.unit_id ? (product.unit_id.name || '') : 'ชิ้น',
                original_price: product.selling_price
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
                if (posActiveTab === 'scan' && e.target.value.trim() !== '') {
                    const val = e.target.value.trim().toLowerCase();
                    const exactMatch = posProductsCache.find(p =>
                        (p.product_code && p.product_code.toLowerCase() === val) ||
                        (p.imeis && p.imeis.some(imei => imei.toLowerCase() === val))
                    );
                    if (exactMatch) {
                        handleAddToCart(exactMatch);
                        e.target.value = '';
                        searchPosProducts();
                    } else {
                        if (typeof showToast === 'function') showToast('ไม่พบสินค้าที่สแกน', 'warning');
                    }
                }
            }
        });
    }

    // POS Filters, Sorting, View Mode Events
    const categorySelect = document.getElementById('pos-filter-category');
    const brandSelect = document.getElementById('pos-filter-brand');
    const filterBtn = document.getElementById('pos-btn-filter');
    const filterPanel = document.getElementById('pos-filter-panel');
    const filterShowOut = document.getElementById('pos-filter-show-out');
    const filterClearBtn = document.getElementById('pos-btn-clear-filter');
    const posSortSelect = document.getElementById('pos-sort');
    const posViewGridBtn = document.getElementById('pos-view-grid');
    const posViewListBtn = document.getElementById('pos-view-list');
    const posScanBtn = document.getElementById('pos-btn-scan');

    if (categorySelect) {
        categorySelect.addEventListener('change', (e) => {
            posActiveCategory = e.target.value || '';
            if (typeof renderPosCategoryTabs === 'function') renderPosCategoryTabs();
            searchPosProducts();
        });
    }
    if (brandSelect) {
        brandSelect.addEventListener('change', () => {
            if (typeof updatePosFilterDot === 'function') updatePosFilterDot();
            searchPosProducts();
        });
    }

    const closePosFilterPanel = () => {
        if (!filterPanel || !filterBtn) return;
        filterPanel.classList.add('hidden');
        filterBtn.setAttribute('aria-expanded', 'false');
    };

    if (filterBtn && filterPanel) {
        filterBtn.addEventListener('click', (e) => {
            e.stopPropagation();
            const willOpen = filterPanel.classList.contains('hidden');
            filterPanel.classList.toggle('hidden', !willOpen);
            filterBtn.setAttribute('aria-expanded', String(willOpen));
        });
        filterPanel.addEventListener('click', (e) => e.stopPropagation());
    }

    if (filterShowOut) {
        filterShowOut.addEventListener('change', (e) => {
            posShowOutOfStock = e.target.checked;
            if (typeof updatePosFilterDot === 'function') updatePosFilterDot();
            searchPosProducts();
        });
    }

    if (filterClearBtn) {
        filterClearBtn.addEventListener('click', () => {
            posActiveCategory = '';
            if (categorySelect) categorySelect.value = '';
            if (brandSelect) brandSelect.value = '';
            if (filterShowOut) filterShowOut.checked = false;
            posShowOutOfStock = false;
            if (posSearchInput) posSearchInput.value = '';
            if (typeof renderPosCategoryTabs === 'function') renderPosCategoryTabs();
            if (typeof updatePosFilterDot === 'function') updatePosFilterDot();
            closePosFilterPanel();
            searchPosProducts();
        });
    }

    if (posSortSelect) {
        posSortSelect.addEventListener('change', (e) => {
            posSortMode = e.target.value;
            searchPosProducts();
        });
    }

    // Infinite scroll ของกริดสินค้า — พื้นที่ที่เลื่อนคือ #pos-product-grid เอง ไม่ใช่ #main-content
    // เหมือนหน้าจัดการสต็อก เพราะเลย์เอาต์หน้าขายตรึงความสูงไว้แล้วให้กริดเลื่อนอยู่ข้างใน
    if (posProductGrid) {
        posProductGrid.addEventListener('scroll', () => {
            const { scrollTop, scrollHeight, clientHeight } = posProductGrid;
            if (scrollHeight - scrollTop - clientHeight < 200) {
                loadMorePosProducts();
            }
        });
    }

    if (posViewGridBtn && posViewListBtn) {
        const activeCls = 'w-9 h-9 rounded-md flex items-center justify-center transition-colors bg-primary text-on-primary';
        const idleCls = 'w-9 h-9 rounded-md flex items-center justify-center transition-colors bg-surface-chip text-body-muted hover:text-ink';
        const applyViewMode = (mode) => {
            posViewMode = mode;
            posViewGridBtn.className = mode === 'grid' ? activeCls : idleCls;
            posViewListBtn.className = mode === 'list' ? activeCls : idleCls;
            posViewGridBtn.setAttribute('aria-pressed', String(mode === 'grid'));
            posViewListBtn.setAttribute('aria-pressed', String(mode === 'list'));
            renderPosProductsTable();
        };
        posViewGridBtn.addEventListener('click', () => applyViewMode('grid'));
        posViewListBtn.addEventListener('click', () => applyViewMode('list'));
    }

    // ปุ่มบาร์โค้ดในช่องค้นหาสลับเป็นโหมดสแกน: ยิงบาร์โค้ด/IMEI แล้วกด Enter จะเพิ่มลงตะกร้าทันที
    if (posScanBtn) {
        posScanBtn.addEventListener('click', () => {
            posActiveTab = posActiveTab === 'scan' ? 'search' : 'scan';
            const isScan = posActiveTab === 'scan';
            posScanBtn.className = isScan
                ? 'absolute inset-y-0 right-0 mr-2 my-2 w-10 rounded-md bg-primary text-on-primary transition-colors flex items-center justify-center'
                : 'absolute inset-y-0 right-0 mr-2 my-2 w-10 rounded-md bg-surface-chip text-body-muted hover:text-ink hover:bg-surface-tile-2 transition-colors flex items-center justify-center';
            posScanBtn.setAttribute('aria-pressed', String(isScan));
            if (posSearchInput) {
                posSearchInput.placeholder = isScan
                    ? 'สแกนบาร์โค้ด / IMEI แล้วกด Enter...'
                    : 'ค้นหาสินค้า / สแกนบาร์โค้ด / สแกน IMEI...';
                posSearchInput.focus();
            }
        });
    }

    // คลิกที่ว่างเพื่อปิดเมนูลอยทั้งหมดของหน้าขาย (ตัวกรอง)
    document.addEventListener('click', () => {
        closePosFilterPanel();
    });
    document.addEventListener('keydown', (e) => {
        if (e.key !== 'Escape') return;
        closePosFilterPanel();
    });

    // Update dynamic Down Payment labels reactive logic
    const updateFinanceDownPaymentLabel = () => {
        if (!modalFinanceTotalDownLabel) return;

        // Calculate totalUpfrontToCollect
        const subtotal = cart.reduce((sum, item) => sum + item.subtotal, 0);
        const discount = posDiscount ? (parseFloat(posDiscount.value) || 0) : 0;
        const contractFee = (checkboxContractFee && checkboxContractFee.checked) ? (parseFloat(inputContractFee.value) || 0) : 0;
        const icloudFee = (checkboxIcloudFee && checkboxIcloudFee.checked) ? (parseFloat(inputIcloudFee.value) || 0) : 0;
        const grandTotal = Math.max(0, subtotal - discount + contractFee + icloudFee);

        const devicesTotal = cart.filter(item => item.unit_name === 'เครื่อง').reduce((sum, item) => sum + item.subtotal, 0);
        const netDevicesTotal = Math.max(0, devicesTotal - discount);
        const totalDown = parseFloat(modalFinanceDownTotal ? modalFinanceDownTotal.value : 0) || 0;
        const financingAmount = Math.max(0, netDevicesTotal - totalDown);

        const totalUpfrontToCollect = Math.max(0, grandTotal - financingAmount);

        const cash = parseFloat(modalFinanceDownCash ? modalFinanceDownCash.value : 0) || 0;
        const transfer = parseFloat(modalFinanceDownTransfer ? modalFinanceDownTransfer.value : 0) || 0;
        const actualPaid = cash + transfer;
        const remaining = totalUpfrontToCollect - actualPaid;

        // หมายเหตุ: ปุ่ม "ชำระเงิน" ตั้งใจให้เป็นสีเขียวและกดได้ตลอด ไม่ disable ล่วงหน้าจาก state
        // ตรวจสอบยอดเงินดาวน์/รับเงินหน้าร้านครบไหมจริงๆ ตอนกดปุ่มใน checkoutNow() แทน
        if (totalUpfrontToCollect <= 0) {
            modalFinanceTotalDownLabel.className = 'text-sm font-bold text-body-muted font-mono';
            modalFinanceTotalDownLabel.textContent = 'ยอดต้องรับ: ฿0.00';
        } else if (remaining > 0) {
            modalFinanceTotalDownLabel.className = 'text-sm font-bold text-amber-400 font-mono';
            modalFinanceTotalDownLabel.textContent = `ยอดต้องรับ: ฿${totalUpfrontToCollect.toLocaleString(undefined, { minimumFractionDigits: 2 })} | ขาดอีก: ฿${remaining.toLocaleString(undefined, { minimumFractionDigits: 2 })}`;
        } else if (remaining < 0) {
            const change = Math.abs(remaining);
            modalFinanceTotalDownLabel.className = 'text-sm font-bold text-cyan-400 font-mono';
            modalFinanceTotalDownLabel.textContent = `ยอดต้องรับ: ฿${totalUpfrontToCollect.toLocaleString(undefined, { minimumFractionDigits: 2 })} | ทอนคืน: ฿${change.toLocaleString(undefined, { minimumFractionDigits: 2 })}`;
        } else {
            modalFinanceTotalDownLabel.className = 'text-sm font-bold text-emerald-400 font-mono';
            modalFinanceTotalDownLabel.textContent = `ยอดต้องรับ: ฿${totalUpfrontToCollect.toLocaleString(undefined, { minimumFractionDigits: 2 })} (ครบถ้วน)`;
        }
        updateFinancingAmount();
    };

    if (modalFinanceDownTotal) {
        modalFinanceDownTotal.addEventListener('input', () => {
            clearPosInlineErrors();
            updateFinanceDownPaymentLabel();
        });
    }
    if (modalFinanceDownCash) {
        modalFinanceDownCash.addEventListener('input', () => {
            clearPosInlineErrors();
            updateFinanceDownPaymentLabel();
        });
    }
    if (modalFinanceDownTransfer) {
        modalFinanceDownTransfer.addEventListener('input', () => {
            clearPosInlineErrors();
            updateFinanceDownPaymentLabel();
        });
    }
    if (modalFinanceCompany) {
        modalFinanceCompany.addEventListener('change', () => {
            clearPosInlineErrors();
        });
    }

    // Additional manual fees listeners
    if (checkboxContractFee) {
        checkboxContractFee.addEventListener('change', (e) => {
            if (e.target.checked) {
                if (wrapperContractFee) wrapperContractFee.classList.remove('hidden');
                if (inputContractFee) {
                    inputContractFee.value = '0';
                    inputContractFee.focus();
                    inputContractFee.select();
                }
            } else {
                if (wrapperContractFee) wrapperContractFee.classList.add('hidden');
                if (inputContractFee) inputContractFee.value = '0';
            }
            updateModalTotals();
        });
    }
    if (inputContractFee) {
        inputContractFee.addEventListener('input', updateModalTotals);
    }

    if (checkboxIcloudFee) {
        checkboxIcloudFee.addEventListener('change', (e) => {
            if (e.target.checked) {
                if (wrapperIcloudFee) wrapperIcloudFee.classList.remove('hidden');
                if (inputIcloudFee) {
                    inputIcloudFee.value = '0';
                    inputIcloudFee.focus();
                    inputIcloudFee.select();
                }
            } else {
                if (wrapperIcloudFee) wrapperIcloudFee.classList.add('hidden');
                if (inputIcloudFee) inputIcloudFee.value = '0';
            }
            updateModalTotals();
        });
    }
    if (inputIcloudFee) {
        inputIcloudFee.addEventListener('input', updateModalTotals);
    }

    // POS Payment method change listener - toggling expanded detail blocks
    if (paymentMethod) {
        paymentMethod.addEventListener('change', (e) => {
            const selectedVal = e.target.value;

            if (selectedVal === 'จัดไฟแนนซ์') {
                const hasDevice = cart.some(item => item.unit_name === 'เครื่อง');
                if (!hasDevice) {
                    showToast('ไม่สามารถจัดไฟแนนซ์ได้ เนื่องจากไม่มีสินค้าที่เป็นเครื่องในตะกร้า', 'error');
                    paymentMethod.value = 'ซื้อสด';
                    if (blockBuyCashDetails) blockBuyCashDetails.classList.remove('hidden');
                    if (blockFinanceDetails) blockFinanceDetails.classList.add('hidden');
                    updateModalTotals();
                    return;
                }
            }

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

    // ปุ่มสลับวิธีชำระเงินแบบ toggle (แทนที่ <select id="modal-pos-payment-method"> ที่ซ่อนไว้ทางสายตา)
    // เก็บ select เดิมไว้เป็นแหล่งความจริงเพื่อไม่ต้องแก้ไข logic คำนวณ/ตรวจสอบที่ผูกกับ paymentMethod.value ทั้งหมด
    const posPaymentToggleBtns = document.querySelectorAll('.pos-payment-toggle-btn');
    const syncPaymentToggleUI = () => {
        const currentVal = paymentMethod ? paymentMethod.value : '';
        posPaymentToggleBtns.forEach(btn => {
            const isActive = btn.dataset.value === currentVal;
            btn.className = `pos-payment-toggle-btn flex-1 py-2.5 rounded-sm text-sm font-bold transition-all flex items-center justify-center bg-[#222] border border-[#444] gap-2 ${isActive ? 'bg-primary text-on-primary' : 'text-body-muted hover:text-ink'}`;
        });
    };
    if (paymentMethod && posPaymentToggleBtns.length) {
        posPaymentToggleBtns.forEach(btn => {
            btn.addEventListener('click', () => {
                clearPosInlineErrors();
                if (paymentMethod.value === btn.dataset.value) return;
                paymentMethod.value = btn.dataset.value;
                paymentMethod.dispatchEvent(new Event('change', { bubbles: true }));
            });
        });
        // ต่อคิวหลัง listener หลักด้านบน เพื่อให้ UI ปุ่มสะท้อนค่าที่อาจถูกบังคับรีเซ็ต (เช่น จัดไฟแนนซ์ไม่ได้เพราะไม่มีเครื่องในตะกร้า) เสมอ
        paymentMethod.addEventListener('change', syncPaymentToggleUI);
    }

    const fetchCartLatestPrices = async () => {
        if (cart.length === 0) return;
        const productIds = cart.map(item => item.product_id);
        try {
            const response = await authFetch(`${API_BASE_URL}/products/validate-prices`, {
                method: 'POST',
                headers: { 'Content-Type': 'application/json' },
                body: JSON.stringify({ product_ids: productIds })
            });
            const json = await response.json();
            if (json.success) {
                cart.forEach(item => {
                    if (json.data[item.product_id]) {
                        item.cost_price = json.data[item.product_id].cost_price;
                        item.default_selling_price = json.data[item.product_id].selling_price;
                    }
                });
            }
        } catch (error) {
            console.error('เกิดข้อผิดพลาดในการดึงราคาล่าสุดจากฐานข้อมูล:', error);
        }
    };

    const openCheckoutModal = async () => {
        if (!confirmPriceModal) return;
        if (cart.length === 0) {
            // เดิมเป็น toast มุมจอซึ่งพลาดสายตาได้ง่ายตอนกำลังจดจ่ออยู่กับปุ่มชำระเงิน
            // เปลี่ยนเป็น popup กลางจอ พร้อมปุ่มที่พากลับไปยังช่องค้นหาสินค้าให้เลย
            showAlert(
                'ยังไม่มีสินค้าในตะกร้า',
                'เลือกสินค้าที่ต้องการขายจากรายการก่อน<br>แล้วจึงกดชำระเงินอีกครั้ง',
                'เลือกสินค้า',
                'warning',
                () => { if (posSearchInput) posSearchInput.focus(); }
            );
            return;
        }

        const btnCheckout = document.getElementById('btn-checkout');
        const originalBtnText = btnCheckout ? btnCheckout.innerHTML : '';
        if (btnCheckout) {
            btnCheckout.disabled = true;
            btnCheckout.innerHTML = `<i class="fa-solid fa-circle-notch fa-spin mr-2"></i>กำลังโหลดราคาสินค้า...`;
        }

        try {
            await fetchCartLatestPrices();
            cart.forEach(item => {
                if (item.is_gift) {
                    item.price = 0;
                } else if (item.default_selling_price !== undefined) {
                    item.price = item.default_selling_price;
                }
                item.subtotal = item.price * item.quantity;
            });
        } catch (err) {
            console.error(err);
        } finally {
            if (btnCheckout) {
                btnCheckout.disabled = false;
                btnCheckout.innerHTML = originalBtnText;
            }
        }

        // Reset ALL inputs in modal
        clearPosInlineErrors();
        if (posDiscount) posDiscount.value = '0';

        // Buy Cash detail resets
        if (modalCashAmount) modalCashAmount.value = '0';
        if (modalTransferAmount) modalTransferAmount.value = '0';

        // Finance detail resets
        if (modalFinanceCompany) modalFinanceCompany.value = '';
        if (modalFinancePaymentDay) modalFinancePaymentDay.value = '0';
        if (modalFinanceMonths) modalFinanceMonths.value = '0';
        if (modalFinanceDownTotal) modalFinanceDownTotal.value = '0';
        if (modalFinanceDownCash) modalFinanceDownCash.value = '0';
        if (modalFinanceDownTransfer) modalFinanceDownTransfer.value = '0';
        updateFinanceDownPaymentLabel();

        // Reset Additional Fees
        if (checkboxContractFee) checkboxContractFee.checked = false;
        if (wrapperContractFee) wrapperContractFee.classList.add('hidden');
        if (inputContractFee) inputContractFee.value = '0';

        if (checkboxIcloudFee) checkboxIcloudFee.checked = false;
        if (wrapperIcloudFee) wrapperIcloudFee.classList.add('hidden');
        if (inputIcloudFee) inputIcloudFee.value = '0';

        // Reset block visibilities
        if (blockBuyCashDetails) blockBuyCashDetails.classList.add('hidden');
        if (blockFinanceDetails) blockFinanceDetails.classList.add('hidden');

        // ตั้งค่าเริ่มต้นวิธีชำระเงินเป็น "เงินสด" (ซื้อสด) เสมอ แทนที่จะปล่อยว่างให้ผู้ใช้ต้องเลือกเอง
        // ต้องอยู่หลังบล็อก "Reset block visibilities" ด้านบน ไม่งั้น dispatch change ที่แสดง block-buy-cash-details จะถูกซ่อนทับอีกที
        if (paymentMethod) {
            paymentMethod.value = 'ซื้อสด';
            paymentMethod.dispatchEvent(new Event('change', { bubbles: true }));
        }
        if (typeof syncPaymentToggleUI === 'function') syncPaymentToggleUI();

        // Member Selection reset
        if (selectedMemberId) selectedMemberId.value = '';
        if (posMemberSearch) posMemberSearch.value = '';
        if (selectedMemberDisplay) selectedMemberDisplay.classList.add('hidden');
        if (posMemberSearch && posMemberSearch.parentElement) posMemberSearch.parentElement.classList.remove('hidden');

        // Deposit Selection reset
        if (appliedDepositId) appliedDepositId.value = '';
        if (appliedDepositAmount) appliedDepositAmount.value = '0';
        if (posDepositSearch) posDepositSearch.value = '';
        const searchWrapper = document.getElementById('pos-deposit-search-wrapper');
        if (searchWrapper) searchWrapper.classList.remove('hidden');
        if (appliedDepositDisplay) appliedDepositDisplay.classList.add('hidden');
        if (posDepositSearchResults) posDepositSearchResults.classList.add('hidden');

        // Render cart summary items with editable unit prices
        if (confirmPriceList) {
            confirmPriceList.innerHTML = '';
            const posUserForRow = getCurrentUserForPos();
            const posBranchNameForRow = (posUserForRow && posUserForRow.branch && posUserForRow.branch.name) ? posUserForRow.branch.name : '-';
            cart.forEach((item, index) => {
                const card = document.createElement('div');
                card.className = 'bg-[#1c1c1c] border border-[#333] rounded-sm p-3 flex flex-col gap-4 relative';
                const detailLines = [];
                if (item.color_name) detailLines.push(`สี: ${item.color_name}`);
                if (item.type_name) detailLines.push(`ประเภท: ${item.type_name}`);
                const itemColorTheme = getProductColorTheme(item.color_name, null);
                card.innerHTML = `
                    <div class="flex items-start gap-4">
                        <div class="w-12 h-12 rounded-full border flex items-center justify-center shrink-0" style="color:${itemColorTheme.icon};background-color:${itemColorTheme.bg};border-color:${itemColorTheme.border};">
                            <i class="fa-solid ${item._isDevice ? 'fa-mobile-screen' : 'fa-box'} text-xl"></i>
                        </div>
                        <div class="flex-1 min-w-0">
                            <div class="flex justify-between items-start">
                                <div>
                                    <p class="font-bold text-white text-base leading-tight">${item.product_name}</p>
                                    ${item.product_code ? `<p class="text-sm text-gray-400 font-mono mt-1">รหัสสินค้า: ${item.product_code}</p>` : ''}
                                    <p class="text-sm text-gray-400 mt-0.5">คงเหลือ: ${(item.stock_available !== null && item.stock_available !== undefined) ? item.stock_available.toLocaleString() : '-'}</p>
                                </div>
                                <div class="bg-[#2a2a2a] text-gray-400 text-xs px-2.5 py-1 rounded-full flex items-center gap-1.5 shrink-0">
                                    <i class="fa-solid fa-store"></i> ${posBranchNameForRow}
                                </div>
                            </div>
                            
                            <div class="mt-3 flex flex-wrap gap-2 items-center">
                                ${item.imei_sold ?
                        `<span class="inline-flex items-center gap-1.5 bg-[#2a2a2a] text-[#FFE169] border border-[#b48025] px-2.5 py-1 rounded-lg text-xs font-mono font-bold"><i class="fa-solid fa-sim-card"></i> ${item.imei_sold}</span>`
                        : `<span class="inline-flex items-center gap-1.5 bg-[#2a2a2a] text-gray-400 border border-[#444] px-2.5 py-1 rounded-lg text-xs"><i class="fa-solid fa-layer-group"></i> จำนวน: ${item.quantity} ${item.unit_name || 'ชิ้น'}</span>`
                    }
                                
                                ${detailLines.length ? detailLines.map(l => `<span class="text-xs text-gray-400 bg-[#222] px-2 py-1 rounded-lg border border-[#444]">${l}</span>`).join('') : ''}
                            </div>
                        </div>
                    </div>
                    
                    <div class="flex items-end justify-between mt-1">
                        <div class="flex flex-col gap-1 w-[150px]">
                            <div class="relative w-full">
                                <span class="absolute left-0 top-1/2 -translate-y-1/2 text-[#FFE169] text-xl font-bold">฿</span>
                                <input type="number" value="${item.price}" min="0" step="1" data-index="${index}"
                                    class="modal-item-price-input w-full pl-5 pr-2 py-1 rounded bg-transparent border-none text-[#FFE169] text-2xl font-bold focus:bg-[#2a2a2a] focus:outline-none transition-all"
                                    ${(paymentMethod && paymentMethod.value === 'จัดไฟแนนซ์' && !item.is_gift && item.unit_name === 'เครื่อง') ? '' : 'disabled'}>
                            </div>
                            <div class="modal-item-price-badge w-full text-xs" data-index="${index}"></div>
                        </div>
                        
                        <div class="flex items-center gap-2">
                            ${(item._isDevice || item.imei_sold) ? `
                                <select class="modal-warranty-select bg-[#2a2a2a] border border-[#444] text-gray-300 text-sm rounded-full px-4 py-2 focus:outline-none focus:border-[#FFE169] transition-all cursor-pointer hover:bg-[#333] hover:text-white" data-index="${index}">
                                    <option value="1 เดือน" ${(!item.warranty_period || item.warranty_period === '1 เดือน') ? 'selected' : ''}>ประกัน 1 เดือน</option>
                                    <option value="2 เดือน" ${(item.warranty_period === '2 เดือน') ? 'selected' : ''}>ประกัน 2 เดือน</option>
                                    <option value="3 เดือน" ${(item.warranty_period === '3 เดือน') ? 'selected' : ''}>ประกัน 3 เดือน</option>
                                    <option value="1 ปี" ${(item.warranty_period === '1 ปี') ? 'selected' : ''}>ประกัน 1 ปี</option>
                                </select>
                            ` : (item.unit_name === 'ชิ้น') ? `
                                <div class="inline-flex rounded-full overflow-hidden border border-[#444]" role="group">
                                    <button type="button" data-index="${index}" data-type="normal"
                                        class="gift-toggle-btn px-4 py-2 text-sm font-semibold transition-all ${!item.is_gift ? 'bg-[#FFE169] text-black' : 'bg-[#2a2a2a] text-gray-400 hover:text-white'}">
                                        ขายปกติ
                                    </button>
                                    <button type="button" data-index="${index}" data-type="gift"
                                        class="gift-toggle-btn px-4 py-2 text-sm font-semibold transition-all ${item.is_gift ? 'bg-[#FFE169] text-black' : 'bg-[#2a2a2a] text-gray-400 hover:text-white'}">
                                        ของแถม
                                    </button>
                                </div>
                            ` : ``}
                        </div>
                    </div>
                `;
                confirmPriceList.appendChild(card);
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
                    if (!cart[idx].is_gift) {
                        cart[idx].original_price = newPrice;
                    }

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

            // Attach dynamic listener for gift toggle buttons
            const giftToggleBtns = confirmPriceList.querySelectorAll('.gift-toggle-btn');
            giftToggleBtns.forEach(btn => {
                btn.addEventListener('click', (e) => {
                    const idx = parseInt(btn.dataset.index);
                    const type = btn.dataset.type;
                    const isGift = (type === 'gift');

                    // Update state
                    cart[idx].is_gift = isGift;
                    if (isGift) {
                        if (cart[idx].price > 0) {
                            cart[idx].original_price = cart[idx].price;
                        }
                        cart[idx].price = 0;
                    } else {
                        cart[idx].price = cart[idx].original_price || cart[idx].default_selling_price || 0;
                    }
                    cart[idx].subtotal = cart[idx].price * cart[idx].quantity;

                    // Update UI elements reactively
                    const priceInput = confirmPriceList.querySelector(`.modal-item-price-input[data-index="${idx}"]`);
                    if (priceInput) {
                        priceInput.value = cart[idx].price;
                        const selectedPayment = paymentMethod ? paymentMethod.value : '';
                        priceInput.disabled = isGift || (selectedPayment !== 'จัดไฟแนนซ์') || (cart[idx].unit_name !== 'เครื่อง');
                    }

                    const subtotalLabel = confirmPriceList.querySelector(`.modal-item-subtotal[data-index="${idx}"]`);
                    if (subtotalLabel) {
                        subtotalLabel.textContent = `฿${cart[idx].subtotal.toLocaleString()}`;
                    }

                    const parentGroup = btn.parentElement;
                    const buttons = parentGroup.querySelectorAll('.gift-toggle-btn');
                    buttons.forEach(b => {
                        const bType = b.dataset.type;
                        if (bType === 'normal') {
                            b.className = `gift-toggle-btn px-2.5 py-0.5 text-[10px] font-semibold transition-all ${!isGift ? 'bg-primary/20 text-primary border-r border-hairline' : 'bg-surface-chip/40 text-body-muted hover:text-ink border-r border-hairline'}`;
                        } else if (bType === 'gift') {
                            b.className = `gift-toggle-btn px-2.5 py-0.5 text-[10px] font-semibold transition-all ${isGift ? 'bg-amber-500/20 text-amber-400' : 'bg-surface-chip/40 text-body-muted hover:text-ink'}`;
                        }
                    });

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
        clearPosInlineErrors();

        if (cart.length === 0) {
            showToast('กรุณาเพิ่มสินค้าลงในตะกร้าก่อนทำรายการ', 'error');
            return;
        }

        const selectedPayment = paymentMethod ? paymentMethod.value : '';
        if (!selectedPayment) {
            showToast('กรุณาเลือกวิธีชำระเงิน', 'error');
            showPosInlineError(posPaymentMethodError);
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
            const depositChk = appliedDepositAmount ? (parseFloat(appliedDepositAmount.value) || 0) : 0;
            const subtotalChk = cart.reduce((sum, item) => sum + item.subtotal, 0);
            const totalChk = Math.max(0, subtotalChk - discountChk - depositChk);

            if (cashVal + transferVal < totalChk) {
                showToast('ยอดเงินที่รับมาไม่ครบถ้วนตามราคาสุทธิ กรุณาตรวจสอบการรับเงิน', 'error');
                showPosInlineError(posCashAmountError);
                if (modalCashAmount) modalCashAmount.focus();
                return;
            }
        } else if (selectedPayment === 'จัดไฟแนนซ์') {
            const belowCostItem = cart.find(item => !item.is_gift && item.unit_name === 'เครื่อง' && item.price < (item.cost_price || 0));
            if (belowCostItem) {
                showToast(`ผิดพลาด: ราคาขายจัดไฟแนนซ์ของ "${belowCostItem.product_name}" ต่ำกว่าราคาทุนของสินค้า กรุณาแก้ไขราคาก่อนทำรายการ`, 'error');
                return;
            }

            const selectedCompanyId = modalFinanceCompany ? modalFinanceCompany.value : '';
            const matchingCompany = (window.masterDataCache && window.masterDataCache.financeCompanies)
                ? window.masterDataCache.financeCompanies.find(c => c._id === selectedCompanyId)
                : null;
            compName = matchingCompany ? matchingCompany.name : (modalFinanceCompany ? modalFinanceCompany.value.trim() : '');
            dueDay = 0;
            instMonths = 0;
            const downTotal = parseFloat(modalFinanceDownTotal ? modalFinanceDownTotal.value : 0) || 0;
            const enteredCash = parseFloat(modalFinanceDownCash ? modalFinanceDownCash.value : 0) || 0;
            const enteredTrans = parseFloat(modalFinanceDownTransfer ? modalFinanceDownTransfer.value : 0) || 0;
            finalDownPayment = downTotal;

            if (!compName) {
                showToast('กรุณากรอกชื่อบริษัทไฟแนนซ์', 'error');
                showPosInlineError(posFinanceCompanyError);
                if (modalFinanceCompany) modalFinanceCompany.focus();
                return;
            }

            // Calculate totalUpfrontToCollect
            const subtotalChk = cart.reduce((sum, item) => sum + item.subtotal, 0);
            const discountChk = posDiscount ? (parseFloat(posDiscount.value) || 0) : 0;
            const depositChk = appliedDepositAmount ? (parseFloat(appliedDepositAmount.value) || 0) : 0;
            const contractFeeChk = (checkboxContractFee && checkboxContractFee.checked) ? (parseFloat(inputContractFee.value) || 0) : 0;
            const icloudFeeChk = (checkboxIcloudFee && checkboxIcloudFee.checked) ? (parseFloat(inputIcloudFee.value) || 0) : 0;
            const grandTotalChk = Math.max(0, subtotalChk - discountChk - depositChk + contractFeeChk + icloudFeeChk);

            const devicesTotalChk = cart.filter(item => item.unit_name === 'เครื่อง').reduce((sum, item) => sum + item.subtotal, 0);
            const netDevicesTotalChk = Math.max(0, devicesTotalChk - discountChk - depositChk);
            const financingAmountChk = Math.max(0, netDevicesTotalChk - downTotal);
            const totalUpfrontToCollect = Math.max(0, grandTotalChk - financingAmountChk);

            const actualReceived = enteredCash + enteredTrans;
            if (actualReceived < totalUpfrontToCollect) {
                showToast(`ยอดรับเงินรวมกัน (฿${actualReceived.toLocaleString(undefined, { minimumFractionDigits: 2 })}) ต้องไม่ต่ำกว่ายอดชำระหน้าร้าน (฿${totalUpfrontToCollect.toLocaleString(undefined, { minimumFractionDigits: 2 })})`, 'error');
                showPosInlineError(posFinanceDownAmountError);
                if (modalFinanceDownCash) modalFinanceDownCash.focus();
                return;
            }

            // Deduct change from enteredCash
            const change = actualReceived - totalUpfrontToCollect;
            const netCash = enteredCash - change;
            const netTransfer = enteredTrans;

            // Split into down_payment cash vs transfer
            downCash = Math.min(downTotal, Math.max(0, netCash));
            downTrans = downTotal - downCash;
        }

        const discount = posDiscount ? (parseFloat(posDiscount.value) || 0) : 0;
        const depositVal = appliedDepositAmount ? (parseFloat(appliedDepositAmount.value) || 0) : 0;
        const subtotal = cart.reduce((sum, item) => sum + item.subtotal, 0);
        const contractFee = (checkboxContractFee && checkboxContractFee.checked) ? (parseFloat(inputContractFee.value) || 0) : 0;
        const icloudFee = (checkboxIcloudFee && checkboxIcloudFee.checked) ? (parseFloat(inputIcloudFee.value) || 0) : 0;
        const total = Math.max(0, subtotal - discount - depositVal + contractFee + icloudFee);

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
                branch_id = user.branch ? (user.branch._id || user.branch) : null;
            }

            const payload = {
                member_id: selectedMemberId ? (selectedMemberId.value || null) : null,
                applied_deposit_id: appliedDepositId ? (appliedDepositId.value || null) : null,
                applied_deposit_amount: depositVal,
                items: cart.map(item => ({
                    product_id: item.product_id,
                    product_name: item.product_name,
                    imei_sold: item.imei_sold || '',
                    quantity: item.quantity,
                    price: item.price,
                    warranty_period: item.warranty_period || ((item._isDevice || item.imei_sold) ? '1 เดือน' : 'ไม่มีประกัน')
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
                contract_fee: contractFee,
                icloud_fee: icloudFee,
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
                fetchPosProducts();

                cart = [];
                renderCart();

                // Reset state and layouts
                if (paymentMethod) paymentMethod.value = 'ซื้อสด';
                if (typeof syncPaymentToggleUI === 'function') syncPaymentToggleUI();
                if (posDiscount) posDiscount.value = '0';
                if (modalCashAmount) modalCashAmount.value = '0';
                if (modalTransferAmount) modalTransferAmount.value = '0';
                if (modalFinanceCompany) modalFinanceCompany.value = '';
                if (modalFinancePaymentDay) modalFinancePaymentDay.value = '0';
                if (modalFinanceMonths) modalFinanceMonths.value = '0';
                if (modalFinanceDownTotal) modalFinanceDownTotal.value = '0';
                if (modalFinanceDownCash) modalFinanceDownCash.value = '0';
                if (modalFinanceDownTransfer) modalFinanceDownTransfer.value = '0';

                // Reset Additional Fees
                if (checkboxContractFee) checkboxContractFee.checked = false;
                if (wrapperContractFee) wrapperContractFee.classList.add('hidden');
                if (inputContractFee) inputContractFee.value = '0';

                if (checkboxIcloudFee) checkboxIcloudFee.checked = false;
                if (wrapperIcloudFee) wrapperIcloudFee.classList.add('hidden');
                if (inputIcloudFee) inputIcloudFee.value = '0';

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
                console.error('Checkout failed:', result.message);
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
            if (posDepositSearchResults && posDepositSearch && !posDepositSearch.contains(e.target) && !posDepositSearchResults.contains(e.target)) {
                posDepositSearchResults.classList.add('hidden');
            }
        });
    }

    // ==========================================
    // Deposit Search & Apply Logic (POS Discount)
    // ==========================================
    let depositSearchTimeout;
    if (posDepositSearch) {
        posDepositSearch.addEventListener('input', (e) => {
            const query = e.target.value.trim();
            clearTimeout(depositSearchTimeout);

            if (query.length < 2) {
                if (posDepositSearchResults) posDepositSearchResults.classList.add('hidden');
                return;
            }

            depositSearchTimeout = setTimeout(async () => {
                try {
                    // ดึงรายการมัดจำเฉพาะสถานะ 'รอดำเนินการ'
                    const response = await authFetch(`/api/deposits?status=รอดำเนินการ&search=${encodeURIComponent(query)}`);
                    const result = await response.json();

                    if (result.success && result.data.length > 0) {
                        renderDepositSearchResults(result.data);
                    } else {
                        if (posDepositSearchResults) posDepositSearchResults.classList.add('hidden');
                    }
                } catch (error) {
                    console.error('Deposit search error:', error);
                }
            }, 300);
        });
    }

    const renderDepositSearchResults = (deposits) => {
        if (!posDepositSearchResults) return;

        posDepositSearchResults.innerHTML = '';
        deposits.forEach(dep => {
            const div = document.createElement('div');
            div.className = 'p-3 hover:bg-surface-chip cursor-pointer transition-colors flex flex-col gap-0.5 text-left';
            div.innerHTML = `
                <div class="flex justify-between items-center">
                    <span class="text-xs font-bold text-ink font-mono">${dep.deposit_number}</span>
                    <span class="text-xs font-bold text-ink font-mono">฿${dep.deposit_amount.toLocaleString()}</span>
                </div>
                <div class="text-[11px] text-body-muted">
                    ลูกค้า: ${dep.customer_name} (${dep.customer_phone})
                </div>
                <div class="text-[10px] text-ink-muted-48 truncate">
                    สินค้ามัดจำ: ${dep.product_name}
                </div>
            `;
            div.addEventListener('click', () => applyDepositDiscount(dep));
            posDepositSearchResults.appendChild(div);
        });
        posDepositSearchResults.classList.remove('hidden');
    };

    const applyDepositDiscount = (dep) => {
        if (appliedDepositId) appliedDepositId.value = dep._id;
        if (appliedDepositAmount) appliedDepositAmount.value = dep.deposit_amount;

        if (appliedDepositNumber) appliedDepositNumber.textContent = dep.deposit_number;
        if (appliedDepositInfo) appliedDepositInfo.textContent = `จองโดย: ${dep.customer_name} (${dep.customer_phone})`;
        if (appliedDepositAmountText) appliedDepositAmountText.textContent = `ยอดมัดจำ: ฿${dep.deposit_amount.toLocaleString(undefined, { minimumFractionDigits: 2 })}`;

        // ซ่อน Input ค้นหา แสดงบล็อกที่เลือกแล้ว
        const searchWrapper = document.getElementById('pos-deposit-search-wrapper');
        if (searchWrapper) searchWrapper.classList.add('hidden');
        if (appliedDepositDisplay) appliedDepositDisplay.classList.remove('hidden');
        if (posDepositSearchResults) posDepositSearchResults.classList.add('hidden');

        // หากยังไม่ได้เลือกสมาชิกในหน้าระบบ POS ให้พยายามค้นหาหรือดึงสมาชิกที่มีเบอร์โทรตรงกับมัดจำให้ทันที
        autoSelectMemberByPhone(dep.customer_phone, dep.customer_name);

        // คำนวณเงินใน Modal ใหม่อีกครั้ง
        updateModalTotals();
    };

    const autoSelectMemberByPhone = async (phone, name) => {
        if (selectedMemberId && selectedMemberId.value) return; // เลือกไปแล้วไม่ต้องทับ

        try {
            const response = await authFetch(`/api/members/search?q=${encodeURIComponent(phone)}`);
            const result = await response.json();
            if (result.success && result.data && result.data.length > 0) {
                // เจอสมาชิกตามเบอร์โทรศัพท์
                selectMember(result.data[0]);
            }
        } catch (err) {
            console.error('Auto member selection err:', err);
        }
    };

    if (btnRemoveAppliedDeposit) {
        btnRemoveAppliedDeposit.addEventListener('click', () => {
            if (appliedDepositId) appliedDepositId.value = '';
            if (appliedDepositAmount) appliedDepositAmount.value = '0';

            const searchWrapper = document.getElementById('pos-deposit-search-wrapper');
            if (searchWrapper) {
                searchWrapper.classList.remove('hidden');
                posDepositSearch.value = '';
                posDepositSearch.focus();
            }
            if (appliedDepositDisplay) appliedDepositDisplay.classList.add('hidden');
            updateModalTotals();
        });
    }

    const renderMemberSearchResults = (members) => {
        if (!posMemberResults) return;

        posMemberResults.innerHTML = '';
        members.forEach(member => {
            const div = document.createElement('div');
            div.className = 'p-3 hover:bg-surface-chip cursor-pointer transition-colors flex items-center gap-3';
            div.innerHTML = `
                <div class="w-8 h-8 rounded-full bg-surface-chip flex items-center justify-center text-body-muted">
                    <i class="fa-solid fa-user text-sm"></i>
                </div>
                <div class="flex-1 overflow-hidden">
                    <p class="text-sm font-bold text-ink truncate">${member.prefix}${member.first_name} ${member.last_name}</p>
                    <p class="text-xs text-body-muted truncate">${member.phone || 'ไม่มีเบอร์โทร'} | ${member.member_number || '-'}</p>
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
            if (typeof closeCheckoutModal === 'function') closeCheckoutModal();
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

    // Sales History + Daily Summary + Transaction Detail Modal
    // แยกออกไปที่ js/page-sales-history.js แล้ว โหลดแบบ dynamic ผ่าน loadPageScript('sales-history')
    // (ดู switchView case 'sales-history', 'daily-summary', 'warranty-check')

    // Dashboard Statistics (สถิติแดชบอร์ด)
    // แยกออกไปที่ js/page-dashboard.js แล้ว โหลดแบบ dynamic ผ่าน loadPageScript('dashboard')
    // (ดู switchView case 'dashboard')

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
    window.openCheckoutSuccessModal = openCheckoutSuccessModal;

    const closeCheckoutSuccessModal = () => {
        if (!checkoutSuccessModal) return;
        checkoutSuccessModal.classList.add('opacity-0', 'pointer-events-none');
        checkoutSuccessModal.firstElementChild.classList.remove('scale-100');
        checkoutSuccessModal.firstElementChild.classList.add('scale-95');
        lastTransactionId = null;
    };

    const openPrintOptionsModal = () => {
        if (!modalPrintOptions || !pendingPrintTxnData) return;

        // Reset check boxes
        if (printOptItems) printOptItems.checked = true;

        // Check if transaction has contract fee
        if (pendingPrintTxnData.contract_fee > 0) {
            if (printOptContractWrapper) {
                printOptContractWrapper.classList.remove('hidden');
                printOptContractWrapper.classList.add('flex');
            }
            if (printOptContract) printOptContract.checked = true;
        } else {
            if (printOptContractWrapper) {
                printOptContractWrapper.classList.add('hidden');
                printOptContractWrapper.classList.remove('flex');
            }
            if (printOptContract) printOptContract.checked = false;
        }

        // Check if transaction has iCloud fee
        if (pendingPrintTxnData.icloud_fee > 0) {
            if (printOptIcloudWrapper) {
                printOptIcloudWrapper.classList.remove('hidden');
                printOptIcloudWrapper.classList.add('flex');
            }
            if (printOptIcloud) printOptIcloud.checked = true;
        } else {
            if (printOptIcloudWrapper) {
                printOptIcloudWrapper.classList.add('hidden');
                printOptIcloudWrapper.classList.remove('flex');
            }
            if (printOptIcloud) printOptIcloud.checked = false;
        }

        // Display modal
        modalPrintOptions.classList.remove('opacity-0', 'pointer-events-none');
        modalPrintOptions.firstElementChild.classList.remove('scale-95');
        modalPrintOptions.firstElementChild.classList.add('scale-100');
    };

    const closePrintOptionsModal = () => {
        if (!modalPrintOptions) return;
        modalPrintOptions.classList.add('opacity-0', 'pointer-events-none');
        modalPrintOptions.firstElementChild.classList.remove('scale-100');
        modalPrintOptions.firstElementChild.classList.add('scale-95');
        pendingPrintTxnData = null;
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

            pendingPrintTxnData = json.data;
            openPrintOptionsModal();

        } catch (error) {
            console.error('เกิดข้อผิดพลาดในการพิมพ์ใบเสร็จ:', error);
            showToast('เกิดข้อผิดพลาดในการเชื่อมต่อ', 'error');
        }
    };

    const executePrintReceipt = () => {
        if (!pendingPrintTxnData) return;

        const txnData = pendingPrintTxnData; // Capture local reference to avoid asynchronous race condition!

        // เปิดหน้าต่างใหม่สำหรับใบเสร็จ
        const printWindow = window.open('receipt-template.html', '_blank');

        if (!printWindow) {
            showToast('กรุณาอนุญาตให้เปิด Pop-up เพื่อพิมพ์ใบเสร็จ', 'warning');
            return;
        }

        const printOptions = {
            showItems: printOptItems ? printOptItems.checked : true,
            showContract: printOptContract ? printOptContract.checked : true,
            showIcloud: printOptIcloud ? printOptIcloud.checked : true
        };

        // ส่งข้อมูลไปยังหน้าต่างที่เปิดใหม่เมื่อมันโหลดเสร็จ
        printWindow.onload = function () {
            printWindow.postMessage({
                type: 'PRINT_RECEIPT',
                payload: txnData,
                options: printOptions
            }, '*');
        };

        // Fallback กรณี onload ไม่ทำงาน (บาง browser)
        setTimeout(() => {
            printWindow.postMessage({
                type: 'PRINT_RECEIPT',
                payload: txnData,
                options: printOptions
            }, '*');
        }, 1000);

        closePrintOptionsModal();
    };

    // Print Options Event Listeners
    if (closePrintOptionsBtn) {
        closePrintOptionsBtn.addEventListener('click', closePrintOptionsModal);
    }
    if (cancelPrintOptionsBtn) {
        cancelPrintOptionsBtn.addEventListener('click', closePrintOptionsModal);
    }
    if (confirmPrintBtn) {
        confirmPrintBtn.addEventListener('click', executePrintReceipt);
    }

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

    // Role Management Logic (จัดการสิทธิ์ใช้งาน)
    // แยกออกไปที่ js/page-roles.js แล้ว โหลดแบบ dynamic ผ่าน loadPageScript('roles')
    // (ดู switchView case 'roles')

    // TRANSFERS MODULE (การโอนย้ายสินค้าระหว่างสาขา)
    // แยกออกไปที่ js/page-transfers.js แล้ว โหลดแบบ dynamic ผ่าน loadPageScript('transfers')
    // (ดู switchView case 'transfers')

    // ==========================================
    // Movement Ledger Logic (ระบบประวัติการเคลื่อนไหว)
    // แยกออกไปที่ js/page-movements.js แล้ว โหลดแบบ dynamic ผ่าน loadPageScript('movements')
    // (ดู switchView case 'movements')
    // ==========================================

    // Member Management (จัดการสมาชิก)
    // แยกออกไปที่ js/page-members.js แล้ว โหลดแบบ dynamic ผ่าน loadPageScript('members')
    // (ดู switchView case 'members')

    // หมายเหตุ: การเช็ค token/auto-login ตอนโหลดหน้าแรกอยู่ที่บล็อก
    // "Auto-login check (JWT Token)" ด้านบนแล้ว (ทำงานครั้งเดียว ไม่ต้องมีบล็อกซ้ำตรงนี้)

    // ==========================================
    // WARRANTY CHECK LOGIC
    // แยกออกไปที่ js/page-warranty-check.js แล้ว โหลดแบบ dynamic ผ่าน loadPageScript('warranty-check')
    // (ดู switchView case 'warranty-check')
    // ==========================================

    // ==========================================
    // IMPORT WORKFLOW LOGIC (Report Arrival & Approve Import)
    // ==========================================
    // หมายเหตุ: element เหล่านี้อยู่ใน views/po-accounting.html ซึ่งโหลดแบบ lazy
    // ผ่าน loadPageView('po-accounting') จึงต้อง lookup ใหม่ทุกครั้งที่เข้าหน้านี้
    // (ห้าม getElementById ตอน DOMContentLoaded เพราะตอนนั้น view ยังไม่ถูก inject)
    let btnSubmitArrival, arrivalProductName, arrivalTypeName, arrivalConditionName,
        arrivalColorName, arrivalCapacityName, arrivalSupplierName, arrivalUnitName,
        arrivalImeis, arrivalImeiCount, arrivalNotes, myArrivalReports,
        importArrivalBadge, approveImportBadge;
    let isImportWorkflowBound = false;

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

    const checkedImeis = new Set();
    const duplicateImeisDb = new Set();
    const pendingChecks = new Set();
    let isPasting = false;
    // ให้หน้าอื่น (เช่น หน้าตรวจรับของเข้า) ที่ตรวจสอบ IMEI ซ้ำใช้แคชชุดเดียวกันได้
    window.checkedImeis = checkedImeis;
    window.duplicateImeisDb = duplicateImeisDb;
    window.pendingChecks = pendingChecks;

    const checkDbExistence = async (imei, targetTextarea) => {
        if (imei.length < 5) return;
        if (checkedImeis.has(imei) || duplicateImeisDb.has(imei) || pendingChecks.has(imei)) return;

        pendingChecks.add(imei);
        try {
            const res = await authFetch(`${API_BASE_URL}/products/check-existence?code=${encodeURIComponent(imei)}`);
            const data = await res.json();
            pendingChecks.delete(imei);

            if (data.success && data.exists) {
                duplicateImeisDb.add(imei);
                showToast(`⚠️ หมายเลข IMEI (${imei}) มีอยู่ในคลังสินค้าแล้ว`, 'error');
                removeImeiFromTextarea(imei, targetTextarea);
            } else if (data.success) {
                checkedImeis.add(imei);
            }
        } catch (err) {
            console.error('Error checking IMEI existence:', err);
            pendingChecks.delete(imei);
        }
    };

    const removeImeiFromTextarea = (imei, targetTextarea) => {
        const textarea = targetTextarea || arrivalImeis;
        if (!textarea) return;
        const scrollTop = textarea.scrollTop;
        const lines = textarea.value.split('\n');
        const filteredLines = lines.filter(l => l.trim() !== imei);
        textarea.value = filteredLines.join('\n');
        textarea.scrollTop = scrollTop;

        const event = new Event('input', { bubbles: true });
        textarea.dispatchEvent(event);
    };

    const validateImeisInput = (forceAll = false, targetTextarea, badgeElement, orderedQty) => {
        const textarea = targetTextarea || arrivalImeis;
        if (!textarea) return;

        const value = textarea.value;
        const lines = value.split('\n');
        const cursorPos = textarea.selectionStart;
        const textBeforeCursor = value.substring(0, cursorPos);
        const activeLineIndex = textBeforeCursor.split('\n').length - 1;

        let updatedLines = [];
        let duplicatesFound = [];
        let hasChanges = false;

        for (let i = 0; i < lines.length; i++) {
            const line = lines[i];
            const trimmed = line.trim();

            if (trimmed === '') {
                updatedLines.push(line);
                continue;
            }

            const isCompleted = forceAll || isPasting || (i !== activeLineIndex);

            if (isCompleted) {
                // 1. Check internal duplicate
                const isDuplicate = updatedLines.some(l => l.trim() === trimmed);
                if (isDuplicate) {
                    duplicatesFound.push(trimmed);
                    hasChanges = true;
                    continue;
                }

                // 2. Check DB cached duplicates
                if (duplicateImeisDb.has(trimmed)) {
                    duplicatesFound.push(trimmed);
                    hasChanges = true;
                    continue;
                }

                // 3. Check DB
                if (trimmed.length >= 5 && !checkedImeis.has(trimmed) && !pendingChecks.has(trimmed)) {
                    checkDbExistence(trimmed, textarea);
                }
            }

            updatedLines.push(line);
        }

        isPasting = false;

        if (hasChanges) {
            duplicatesFound.forEach(imei => {
                showToast(`หมายเลข IMEI ซ้ำ: ${imei} ถูกนำออกจากรายการแล้ว`, 'warning');
            });
            const scrollTop = textarea.scrollTop;
            textarea.value = updatedLines.join('\n');
            textarea.scrollTop = scrollTop;
        }

        // Update count or badge
        const nonEntries = updatedLines.filter(l => l.trim() !== '');
        const count = nonEntries.length;

        if (badgeElement && orderedQty) {
            badgeElement.textContent = `สแกนแล้ว ${count} / ${orderedQty} เครื่อง`;
            if (count === orderedQty) {
                badgeElement.className = 'text-xs font-semibold px-2 py-0.5 rounded-full bg-green-500/10 text-green-400 border border-green-500/20';
            } else {
                badgeElement.className = 'text-xs font-semibold px-2 py-0.5 rounded-full bg-amber-500/10 text-amber-400 border border-amber-500/20';
            }
        } else if (arrivalImeiCount) {
            arrivalImeiCount.textContent = `จำนวน: ${count} IMEI`;
        }
    };

    // เรียกจาก switchView หลัง loadPageView('po-accounting') เพราะ element เหล่านี้
    // เพิ่งถูก inject เข้า DOM ตอนนั้น (getElementById ตอน DOMContentLoaded จะได้ null เสมอ)
    window.initImportWorkflowPage = () => {
        btnSubmitArrival = document.getElementById('btn-submit-arrival');
        arrivalProductName = document.getElementById('arrival-product-name');
        arrivalTypeName = document.getElementById('arrival-type-name');
        arrivalConditionName = document.getElementById('arrival-condition-name');
        arrivalColorName = document.getElementById('arrival-color-name');
        arrivalCapacityName = document.getElementById('arrival-capacity-name');
        arrivalSupplierName = document.getElementById('arrival-supplier-name');
        arrivalUnitName = document.getElementById('arrival-unit-name');
        arrivalImeis = document.getElementById('arrival-imeis');
        arrivalImeiCount = document.getElementById('arrival-imei-count');
        arrivalNotes = document.getElementById('arrival-notes');
        myArrivalReports = document.getElementById('my-arrival-reports');
        importArrivalBadge = document.getElementById('import-arrival-badge');
        approveImportBadge = document.getElementById('approve-import-badge');

        if (isImportWorkflowBound) return; // loadPageView cache ผลลัพธ์ไว้ (__loadedPageViews) inject แค่ครั้งแรกครั้งเดียว จึงผูก listener ครั้งเดียวพอ
        isImportWorkflowBound = true;

        if (arrivalImeis && arrivalImeiCount) {
            arrivalImeis.addEventListener('paste', () => {
                isPasting = true;
            });

            arrivalImeis.addEventListener('input', () => {
                validateImeisInput(false);
            });

            arrivalImeis.addEventListener('blur', () => {
                validateImeisInput(true);
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

        const filterBranch = document.getElementById('approve-import-filter-branch');
        if (filterBranch) {
            filterBranch.addEventListener('change', () => {
                if (typeof window.loadImportNotifications === 'function') {
                    window.loadImportNotifications();
                }
                if (typeof loadApprovePOs === 'function') loadApprovePOs();
                if (typeof loadApproveHistory === 'function') loadApproveHistory();
            });
        }
    };

    const loadMyArrivalReports = async () => {
        if (!myArrivalReports) return;
        try {
            const user = JSON.parse(localStorage.getItem('silmin_user') || '{}');
            const res = await authFetch(`${API_BASE_URL}/import-notifications?reported_by=${user.id || user.employee_id}`);
            const data = await res.json();
            if (data.success) {
                myArrivalReports.innerHTML = '';
                if (data.data.length === 0) {
                    myArrivalReports.innerHTML = '<div class="text-center py-8 text-body-muted">ไม่มีประวัติการแจ้ง</div>';
                    return;
                }
                data.data.forEach(item => {
                    const statusColor = item.status === 'รอดำเนินการ' ? 'text-amber-400' : (item.status === 'อนุมัติแล้ว' ? 'text-emerald-400' : 'text-red-400');
                    const html = `
                        <div class="bg-surface-tile-3 p-3 rounded-md border border-hairline text-sm">
                            <div class="flex justify-between items-start mb-1">
                                <span class="font-bold text-ink">${item.product_name}</span>
                                <span class="${statusColor} text-xs font-bold">${item.status}</span>
                            </div>
                            <div class="text-xs text-body-muted">IMEI: ${item.imeis.length} รายการ</div>
                            <div class="text-[10px] text-body-muted mt-1">${new Date(item.created_at).toLocaleString('th-TH')}</div>
                        </div>
                    `;
                    myArrivalReports.innerHTML += html;
                });
            }
        } catch (err) {
            console.error(err);
        }
    };
    window.loadMyArrivalReports = loadMyArrivalReports;

    window.loadImportNotifications = async () => {
        const tbody = document.getElementById('approve-import-table-body');
        const filterBranch = document.getElementById('approve-import-filter-branch');
        if (!tbody) return;

        try {
            tbody.innerHTML = '<tr><td colspan="7" class="text-center py-4 text-body-muted"><i class="fa-solid fa-spinner fa-spin mr-2"></i>กำลังโหลด...</td></tr>';
            let url = `${API_BASE_URL}/import-notifications?status=รอดำเนินการ`;
            if (filterBranch && filterBranch.value) {
                url += `&branch_id=${filterBranch.value}`;
            }

            const res = await authFetch(url);
            const data = await res.json();

            if (data.success) {
                tbody.innerHTML = '';
                if (data.data.length === 0) {
                    tbody.innerHTML = '<tr><td colspan="7" class="text-center py-8 text-body-muted">ไม่มีรายการรออนุมัติ</td></tr>';
                    if (approveImportBadge) approveImportBadge.classList.add('hidden');
                    return;
                }

                if (approveImportBadge) {
                    approveImportBadge.textContent = data.data.length;
                    approveImportBadge.classList.remove('hidden');
                }

                data.data.forEach(item => {
                    const tr = document.createElement('tr');
                    tr.className = 'border-b border-hairline hover:bg-surface-chip/40 transition-colors';
                    tr.innerHTML = `
                        <td class="px-6 py-4 text-sm text-body-muted">${new Date(item.created_at).toLocaleString('th-TH')}</td>
                        <td class="px-6 py-4 text-sm text-body-muted">${item.branch_id ? item.branch_id.name : '-'}</td>
                        <td class="px-6 py-4 text-sm text-body-muted">${item.reported_by ? item.reported_by.name : '-'}</td>
                        <td class="px-6 py-4 text-sm font-medium text-ink">${item.product_name}</td>
                        <td class="px-6 py-4 text-sm text-ink font-mono">${item.imeis.length}</td>
                        <td class="px-6 py-4 text-sm text-body-muted">${item.notes || '-'}</td>
                        <td class="px-6 py-4 text-sm text-right">
                            <button onclick="approveImport('${item._id}')" class="px-3 py-1.5 bg-emerald-500/20 text-emerald-400 hover:bg-emerald-500/30 rounded-pill text-xs font-medium transition-colors">
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

    window.approveImport = (id) => {
        showConfirm(
            'อนุมัตินำเข้าสต็อก',
            'ยืนยันการนำเข้าสต็อกและอนุมัติรายการนี้? สินค้าจะถูกเพิ่มเข้าสู่คลังของสาขาคุณและบันทึกข้อมูลเรียบร้อย',
            async () => {
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
            },
            'อนุมัติรับของ',
            'success'
        );
    };

    // Initialize triggers
    // หมายเหตุ: listener ของ #nav-report-arrival ผูกซ้ำกับ navReportArrival (ดูใกล้บรรทัด 218) จึงตัดออกจากตรงนี้
    // หมายเหตุ: listener ของ #approve-import-filter-branch ถูกผูกใน window.initImportWorkflowPage() แล้ว (ดูใกล้บรรทัด 6535)

    // ==========================================
    // Branch Inventory Logic (สินค้าในสาขา)
    // แยกออกไปที่ js/page-branch-inventory.js แล้ว โหลดแบบ dynamic ผ่าน loadPageScript('branch-inventory')
    // (ดู switchView case 'branch-inventory')

    // PO System + PO History + Accounting & Finance Module + Connected PO Workflow
    // แยกออกไปที่ js/page-po-accounting.js แล้ว โหลดแบบ dynamic ผ่าน loadPageScript('po-accounting')
    // (ดู switchView case 'accounting-po', 'branch-receive', 'accounting', 'report-arrival', 'approve-import')

    // AUDIT TRAIL / ACTIVITY LOG SYSTEM (ประวัติกิจกรรมระบบ)
    // แยกออกไปที่ js/page-audit-logs.js แล้ว โหลดแบบ dynamic ผ่าน loadPageScript('audit-logs')
    // (ดู switchView case 'audit-logs')

    // ============================================================================
    // SEARCHABLE SELECTS IMPLEMENTATION
    // ============================================================================
    function makeSelectSearchable(selectElement, defaultPlaceholder) {
        if (!selectElement) return;

        // Prevent double initialization
        if (selectElement.dataset.searchableInitialized === 'true') {
            return;
        }
        selectElement.dataset.searchableInitialized = 'true';

        // Remove required attribute from native select to prevent browser focusing validation bugs on hidden inputs
        selectElement.removeAttribute('required');

        // Add class to hide select visually but keep it focusable for required validation
        selectElement.classList.add('searchable-hidden');

        // Create container and wrap the select element
        const wrapper = document.createElement('div');
        wrapper.className = 'relative w-full searchable-select-wrapper';
        selectElement.parentNode.insertBefore(wrapper, selectElement);
        wrapper.appendChild(selectElement);

        // Create trigger box
        const trigger = document.createElement('div');
        trigger.className = 'searchable-select-trigger';

        const input = document.createElement('input');
        input.type = 'text';
        input.className = 'searchable-select-input';
        input.placeholder = defaultPlaceholder || 'เลือกข้อมูล...';
        input.readOnly = true;

        const arrow = document.createElement('i');
        arrow.className = 'fa-solid fa-chevron-down text-slate-400 text-xs ml-2 transition-transform duration-200 searchable-select-arrow';

        trigger.appendChild(input);
        trigger.appendChild(arrow);
        wrapper.appendChild(trigger);

        // Create dropdown menu overlay
        const dropdown = document.createElement('div');
        dropdown.className = 'searchable-select-dropdown modal-scrollable-content scrollbar-thin';
        wrapper.appendChild(dropdown);

        // Function to rebuild options in our custom dropdown
        function rebuildDropdown() {
            dropdown.innerHTML = '';
            const options = Array.from(selectElement.options);

            // Filter out default placeholder option if it's disabled and has empty value
            const filteredOptions = options.filter(opt => !(opt.disabled && opt.value === ''));

            if (filteredOptions.length === 0) {
                const noResults = document.createElement('div');
                noResults.className = 'searchable-no-results';
                noResults.textContent = 'ไม่มีรายการตัวเลือก';
                dropdown.appendChild(noResults);
                return;
            }

            filteredOptions.forEach((opt) => {
                const item = document.createElement('div');
                item.className = 'searchable-option-item';
                item.textContent = opt.textContent;
                item.dataset.value = opt.value;

                // If it is currently selected in native select
                if (selectElement.value === opt.value) {
                    item.classList.add('selected');
                }

                item.addEventListener('click', (e) => {
                    e.stopPropagation();
                    selectOption(opt.value, opt.textContent);
                });

                dropdown.appendChild(item);
            });
        }

        // Function to select an option programmatically or manually
        function selectOption(value, text) {
            selectElement.value = value;
            input.value = text;

            // Dispatch change event to trigger existing app logic
            selectElement.dispatchEvent(new Event('change', { bubbles: true }));

            closeDropdown();
        }

        // Synchronize display text from native select
        function syncUI() {
            const selectedOpt = selectElement.options[selectElement.selectedIndex];
            if (selectedOpt && !(selectedOpt.disabled && selectedOpt.value === '')) {
                input.value = selectedOpt.textContent;
            } else {
                input.value = '';
            }

            // Sync selected class on items
            const items = dropdown.querySelectorAll('.searchable-option-item');
            items.forEach(item => {
                if (item.dataset.value === selectElement.value) {
                    item.classList.add('selected');
                } else {
                    item.classList.remove('selected');
                }
            });
        }

        // Close dropdown
        function closeDropdown() {
            dropdown.classList.remove('open');
            arrow.classList.remove('rotate-180');
            input.readOnly = true;

            // If they clicked out without selecting or value is empty, restore selected text or clear
            syncUI();

            document.removeEventListener('click', handleOutsideClick);
            document.removeEventListener('keydown', handleEscAndTab);
        }

        // Open dropdown
        function openDropdown() {
            // Close all other open searchable select dropdowns first
            document.querySelectorAll('.searchable-select-dropdown.open').forEach(openDrop => {
                if (openDrop !== dropdown) {
                    const dropWrapper = openDrop.closest('.searchable-select-wrapper');
                    const dropSelect = dropWrapper.querySelector('select');
                    if (dropSelect && typeof dropSelect.closeSearchableDropdown === 'function') {
                        dropSelect.closeSearchableDropdown();
                    }
                }
            });

            dropdown.classList.add('open');
            arrow.classList.add('rotate-180');
            input.readOnly = false;

            // Save current value
            input.dataset.oldValue = input.value;

            // Select all text so they can search immediately
            input.select();

            // Rebuild the items first so we always have the freshest options
            rebuildDropdown();

            // Sync highlighted and selected states
            syncUI();

            // Scroll selected item into view
            const selectedItem = dropdown.querySelector('.searchable-option-item.selected');
            if (selectedItem) {
                selectedItem.scrollIntoView({ block: 'nearest' });
            }

            document.addEventListener('click', handleOutsideClick);
            document.addEventListener('keydown', handleEscAndTab);
        }

        // Attaching closeDropdown to the selectElement so other elements can close it programmatically
        selectElement.closeSearchableDropdown = closeDropdown;

        // Handle click on trigger
        trigger.addEventListener('click', (e) => {
            e.stopPropagation();
            if (dropdown.classList.contains('open')) {
                closeDropdown();
            } else {
                openDropdown();
            }
        });

        // Filter items on input typing
        input.addEventListener('input', () => {
            const query = input.value.toLowerCase().trim();
            const items = dropdown.querySelectorAll('.searchable-option-item');
            let matchCount = 0;

            items.forEach(item => {
                const text = item.textContent.toLowerCase();
                if (text.includes(query)) {
                    item.style.display = 'block';
                    matchCount++;
                } else {
                    item.style.display = 'none';
                }
            });

            // Handle empty state
            let noResultsElement = dropdown.querySelector('.searchable-no-results');
            if (matchCount === 0) {
                if (!noResultsElement) {
                    noResultsElement = document.createElement('div');
                    noResultsElement.className = 'searchable-no-results';
                    noResultsElement.textContent = 'ไม่พบข้อมูล';
                    dropdown.appendChild(noResultsElement);
                }
                noResultsElement.style.display = 'block';
            } else {
                if (noResultsElement) {
                    noResultsElement.style.display = 'none';
                }
            }
        });

        // Handle outside clicks to close
        function handleOutsideClick(e) {
            if (!wrapper.contains(e.target)) {
                closeDropdown();
            }
        }

        // Keyboard navigation (Esc, Tab, Enter)
        function handleEscAndTab(e) {
            if (e.key === 'Escape') {
                closeDropdown();
            } else if (e.key === 'Tab') {
                closeDropdown();
            } else if (e.key === 'Enter') {
                e.preventDefault();
                // Select first visible option if there is one
                const visibleItems = Array.from(dropdown.querySelectorAll('.searchable-option-item')).filter(item => item.style.display !== 'none');
                if (visibleItems.length > 0) {
                    const firstItem = visibleItems[0];
                    selectOption(firstItem.dataset.value, firstItem.textContent);
                } else {
                    closeDropdown();
                }
            }
        }

        // MutationObserver to observe when options inside native select are updated
        const observer = new MutationObserver(() => {
            rebuildDropdown();
            syncUI();
        });
        observer.observe(selectElement, { childList: true, subtree: true });

        // Hijack select's .value property to catch direct JS assignments (e.g. edit mode)
        try {
            const originalValueProp = Object.getOwnPropertyDescriptor(HTMLSelectElement.prototype, 'value');
            if (originalValueProp) {
                Object.defineProperty(selectElement, 'value', {
                    get: function () {
                        return originalValueProp.get.call(this);
                    },
                    set: function (val) {
                        originalValueProp.set.call(this, val);
                        syncUI();
                    },
                    configurable: true
                });
            }
        } catch (err) {
            console.warn('Value property hijacking bypassed:', err);
        }

        // Hijack select's .selectedIndex property too
        try {
            const originalSelectedIndexProp = Object.getOwnPropertyDescriptor(HTMLSelectElement.prototype, 'selectedIndex');
            if (originalSelectedIndexProp) {
                Object.defineProperty(selectElement, 'selectedIndex', {
                    get: function () {
                        return originalSelectedIndexProp.get.call(this);
                    },
                    set: function (idx) {
                        originalSelectedIndexProp.set.call(this, idx);
                        syncUI();
                    },
                    configurable: true
                });
            }
        } catch (err) {
            console.warn('SelectedIndex property hijacking bypassed:', err);
        }

        // Sync on native change event
        selectElement.addEventListener('change', () => {
            syncUI();
        });

        // Sync when parent form resets
        if (selectElement.form) {
            selectElement.form.addEventListener('reset', () => {
                setTimeout(() => {
                    syncUI();
                }, 0);
            });
        }

        // Initial setup
        rebuildDropdown();
        syncUI();
    }

    // Initialize Searchable Dropdowns for Add Product Form (REMOVED: Custom UI is now used)

    // ==========================================
    // EXCEL PRODUCT IMPORT SYSTEM
    // ==========================================
    function initExcelImport() {
        const btnExcelOpen = document.getElementById('btn-add-product-excel');
        const btnStockExcelOpen = document.getElementById('btn-stock-add-excel');
        const excelModal = document.getElementById('excel-import-modal');
        const btnExcelClose = document.getElementById('close-excel-modal-btn');

        const step1Panel = document.getElementById('excel-step1-panel');
        const step2Panel = document.getElementById('excel-step2-panel');
        const step3Panel = document.getElementById('excel-step3-panel');

        const btnStep1Next = document.getElementById('excel-btn-step1-next');
        const btnStep2Back = document.getElementById('excel-btn-step2-back');
        const btnStep3Back = document.getElementById('excel-btn-step3-back');
        const btnImportConfirm = document.getElementById('excel-btn-import-confirm');

        const step1Indicator = document.getElementById('excel-step1-indicator');
        const step2Indicator = document.getElementById('excel-step2-indicator');
        const step3Indicator = document.getElementById('excel-step3-indicator');
        const connector1 = document.getElementById('excel-connector1');
        const connector2 = document.getElementById('excel-connector2');

        const dragDropZone = document.getElementById('excel-drag-drop-zone');
        const fileInput = document.getElementById('excel-file-input');

        const summaryTotal = document.getElementById('excel-summary-total');
        const summaryValid = document.getElementById('excel-summary-valid');
        const summaryInvalid = document.getElementById('excel-summary-invalid');
        const summaryInvalidCard = document.getElementById('excel-summary-invalid-card');
        const validationStatusBadge = document.getElementById('excel-validation-status-badge');
        const previewTbody = document.getElementById('excel-preview-tbody');
        const errorWarning = document.getElementById('excel-error-warning');

        const progressBox = document.getElementById('excel-import-progress-box');
        const progressText = document.getElementById('excel-progress-text');
        const progressPercent = document.getElementById('excel-progress-percent');
        const progressBar = document.getElementById('excel-progress-bar');

        let currentStep = 1;
        let parsedRows = []; // Stores the evaluated objects
        let isImporting = false;

        if (!excelModal) return;

        // Navigation
        function goToStep(step) {
            currentStep = step;

            // Hide all panels
            step1Panel.classList.add('hidden');
            step2Panel.classList.add('hidden');
            step3Panel.classList.add('hidden');

            // Reset Indicators & Connectors
            step1Indicator.className = "w-8 h-8 rounded-full flex items-center justify-center font-bold text-sm z-10 transition-colors bg-slate-700 text-slate-400";
            step2Indicator.className = "w-8 h-8 rounded-full flex items-center justify-center font-bold text-sm z-10 transition-colors bg-slate-700 text-slate-400";
            step3Indicator.className = "w-8 h-8 rounded-full flex items-center justify-center font-bold text-sm z-10 transition-colors bg-slate-700 text-slate-400";
            connector1.className = "h-full bg-slate-700 w-0 transition-all duration-300";
            connector2.className = "h-full bg-slate-700 w-0 transition-all duration-300";

            // Active Step Styling
            if (step === 1) {
                step1Panel.classList.remove('hidden');
                step1Indicator.className = "w-8 h-8 rounded-full bg-emerald-600 text-white flex items-center justify-center font-bold text-sm z-10 transition-colors shadow-lg shadow-emerald-600/30";

                document.querySelector('[id="excel-step1-indicator"] + span').className = "text-xs text-slate-300 mt-2 font-medium";
                document.querySelector('[id="excel-step2-indicator"] + span').className = "text-xs text-slate-400 mt-2 font-medium";
                document.querySelector('[id="excel-step3-indicator"] + span').className = "text-xs text-slate-400 mt-2 font-medium";
            } else if (step === 2) {
                step2Panel.classList.remove('hidden');
                step1Indicator.className = "w-8 h-8 rounded-full bg-emerald-600 text-white flex items-center justify-center font-bold text-sm z-10 transition-colors";
                step2Indicator.className = "w-8 h-8 rounded-full bg-emerald-600 text-white flex items-center justify-center font-bold text-sm z-10 transition-colors shadow-lg shadow-emerald-600/30";
                connector1.className = "h-full bg-emerald-600 w-full transition-all duration-300";

                document.querySelector('[id="excel-step1-indicator"] + span').className = "text-xs text-slate-300 mt-2 font-medium";
                document.querySelector('[id="excel-step2-indicator"] + span').className = "text-xs text-slate-300 mt-2 font-medium";
                document.querySelector('[id="excel-step3-indicator"] + span').className = "text-xs text-slate-400 mt-2 font-medium";
            } else if (step === 3) {
                step3Panel.classList.remove('hidden');
                step1Indicator.className = "w-8 h-8 rounded-full bg-emerald-600 text-white flex items-center justify-center font-bold text-sm z-10 transition-colors";
                step2Indicator.className = "w-8 h-8 rounded-full bg-emerald-600 text-white flex items-center justify-center font-bold text-sm z-10 transition-colors";
                step3Indicator.className = "w-8 h-8 rounded-full bg-emerald-600 text-white flex items-center justify-center font-bold text-sm z-10 transition-colors shadow-lg shadow-emerald-600/30";
                connector1.className = "h-full bg-emerald-600 w-full transition-all duration-300";
                connector2.className = "h-full bg-emerald-600 w-full transition-all duration-300";

                document.querySelector('[id="excel-step1-indicator"] + span').className = "text-xs text-slate-300 mt-2 font-medium";
                document.querySelector('[id="excel-step2-indicator"] + span').className = "text-xs text-slate-300 mt-2 font-medium";
                document.querySelector('[id="excel-step3-indicator"] + span').className = "text-xs text-slate-300 mt-2 font-medium";
            }
        }

        async function openExcelModal() {
            // Close main product modal
            if (typeof closeModal === 'function') {
                closeModal();
            }

            // เริ่มโหลดไลบรารี xlsx ทันทีที่เปิด modal (ไม่ await ตรงนี้ เพื่อไม่ให้ modal เปิดช้า)
            // handleExcelFile จะ await ให้แน่ใจอีกชั้นก่อนใช้งานจริง กันกรณีผู้ใช้เลือกไฟล์เร็วกว่าโหลดเสร็จ
            ensureXlsxLoaded().catch(err => console.error(err));

            goToStep(1);
            parsedRows = [];
            isImporting = false;

            // Reset form fields
            if (fileInput) fileInput.value = '';
            previewTbody.innerHTML = '';
            errorWarning.classList.add('hidden');
            progressBox.classList.add('hidden');
            progressBar.style.width = '0%';
            progressPercent.textContent = '0%';
            progressText.textContent = '';
            btnImportConfirm.disabled = false;

            // Show modal
            excelModal.classList.remove('opacity-0', 'pointer-events-none');
            excelModal.querySelector('.modal-content').classList.add('modal-animate-in');

            // Refresh Master Data Caches
            try {
                // Check master data
                const md = window.masterDataCache || {};
                const hasTypes = Array.isArray(md.productTypes) && md.productTypes.length > 0;
                const hasSuppliers = Array.isArray(md.suppliers) && md.suppliers.length > 0;
                if (!hasTypes || !hasSuppliers) {
                    await fetchMasterData();
                }

                // Fetch branches to make sure they are in the cache
                const branchResp = await authFetch(`${API_BASE_URL}/branches`);
                const branchJson = await branchResp.json();
                if (branchJson.success) {
                    window.masterDataCache.branches = branchJson.data;
                }
            } catch (err) {
                console.error("Error loading master data for Excel import:", err);
            }
        }

        function closeExcelModal() {
            if (isImporting) return; // Block closing while importing
            excelModal.classList.add('opacity-0', 'pointer-events-none');
            excelModal.querySelector('.modal-content').classList.remove('modal-animate-in');
        }

        if (btnExcelOpen) btnExcelOpen.addEventListener('click', openExcelModal);
        if (btnStockExcelOpen) btnStockExcelOpen.addEventListener('click', openExcelModal);
        if (btnExcelClose) btnExcelClose.addEventListener('click', closeExcelModal);

        // Modal Backdrop Click
        excelModal.addEventListener('click', (e) => {
            if (e.target === excelModal) {
                closeExcelModal();
            }
        });

        btnStep1Next.addEventListener('click', () => goToStep(2));
        btnStep2Back.addEventListener('click', () => goToStep(1));
        btnStep3Back.addEventListener('click', () => {
            if (isImporting) return;
            goToStep(2);
        });

        // Drag & Drop event bindings
        ['dragenter', 'dragover'].forEach(eventName => {
            dragDropZone.addEventListener(eventName, (e) => {
                e.preventDefault();
                e.stopPropagation();
                dragDropZone.classList.add('border-emerald-500', 'bg-emerald-500/5');
            }, false);
        });

        ['dragleave', 'drop'].forEach(eventName => {
            dragDropZone.addEventListener(eventName, (e) => {
                e.preventDefault();
                e.stopPropagation();
                dragDropZone.classList.remove('border-emerald-500', 'bg-emerald-500/5');
            }, false);
        });

        dragDropZone.addEventListener('drop', (e) => {
            const dt = e.dataTransfer;
            const files = dt.files;
            if (files && files.length > 0) {
                handleExcelFile(files[0]);
            }
        });

        dragDropZone.addEventListener('click', () => {
            fileInput.click();
        });

        fileInput.addEventListener('change', (e) => {
            if (fileInput.files && fileInput.files.length > 0) {
                handleExcelFile(fileInput.files[0]);
            }
        });

        // Helper to find match case-insensitively
        function findMasterItem(list, value) {
            if (!list || !value) return null;
            const cleanVal = String(value).toLowerCase().replace(/\s+/g, '');
            return list.find(item => {
                const name = typeof item === 'object' ? (item.name || '') : String(item);
                return name.toLowerCase().replace(/\s+/g, '') === cleanVal;
            });
        }

        // Process File
        function handleExcelFile(file) {
            const extension = file.name.split('.').pop().toLowerCase();
            if (extension !== 'xlsx' && extension !== 'xls') {
                showToast('กรุณาเลือกไฟล์ Excel (.xlsx, .xls) เท่านั้น', 'error');
                return;
            }

            const reader = new FileReader();
            reader.onload = async function (e) {
                try {
                    // กันกรณีผู้ใช้เลือกไฟล์ก่อนไลบรารี xlsx โหลดเสร็จ (โหลดไว้แล้วจะ resolve ทันที)
                    await ensureXlsxLoaded();
                    const data = new Uint8Array(e.target.result);
                    const workbook = XLSX.read(data, { type: 'array' });
                    const firstSheetName = workbook.SheetNames[0];
                    const worksheet = workbook.Sheets[firstSheetName];
                    const rows = XLSX.utils.sheet_to_json(worksheet, { header: 1 });

                    if (!rows || rows.length === 0) {
                        showToast('ไม่พบข้อมูลในไฟล์ Excel', 'error');
                        return;
                    }

                    processExcelRows(rows);
                } catch (err) {
                    console.error("Error reading excel file:", err);
                    showToast('เกิดข้อผิดพลาดในการอ่านไฟล์ Excel: ' + err.message, 'error');
                }
            };
            reader.readAsArrayBuffer(file);
        }

        function processExcelRows(rows) {
            // Check if first row is a header
            let startIndex = 0;
            if (rows.length > 0) {
                const firstRow = rows[0];
                const headerKeywords = ['รหัสสินค้า', 'ชื่อสินค้า', 'หมวดหมู่', 'ผู้จัดจำหน่าย', 'สาขา', 'สี', 'ราคา', 'ต้นทุน', 'sku', 'name', 'category', 'supplier', 'branch'];
                const isHeader = firstRow.some(cell => {
                    if (!cell) return false;
                    const str = String(cell).toLowerCase();
                    return headerKeywords.some(kw => str.includes(kw));
                });
                if (isHeader) {
                    startIndex = 1;
                }
            }

            const md = window.masterDataCache || {};
            parsedRows = [];
            let validCount = 0;
            let invalidCount = 0;

            for (let i = startIndex; i < rows.length; i++) {
                const row = rows[i];
                // Skip completely empty rows
                const isRowEmpty = row.every(cell => cell === undefined || cell === null || String(cell).trim() === '');
                if (isRowEmpty || row.length === 0) continue;

                // Extract fields
                const code = row[0] ? String(row[0]).trim() : '';
                const name = row[1] ? String(row[1]).trim() : '';
                const category = row[2] ? String(row[2]).trim() : '';
                const supplier = row[3] ? String(row[3]).trim() : '';
                const branch = row[4] ? String(row[4]).trim() : '';
                const color = row[5] ? String(row[5]).trim() : '';
                const capacity = row[6] ? String(row[6]).trim() : '';
                const condition = row[7] ? String(row[7]).trim() : '';
                const unit = row[8] ? String(row[8]).trim() : '';
                const cost = row[9] !== undefined && row[9] !== null ? parseFloat(row[9]) : NaN;
                const price = row[10] !== undefined && row[10] !== null ? parseFloat(row[10]) : NaN;
                const qty = row[11] !== undefined && row[11] !== null ? parseInt(row[11]) : NaN;
                const imeisRaw = row[12] ? String(row[12]).trim() : '';

                const errors = [];

                // Validations
                if (!code) errors.push("กรุณาระบุรหัสสินค้า (คอลัมน์ A)");

                let matchedName = null;
                if (!name) {
                    errors.push("กรุณาระบุชื่อสินค้า (คอลัมน์ B)");
                } else {
                    matchedName = findMasterItem(md.productNames, name);
                    if (!matchedName) errors.push(`ไม่พบชื่อสินค้า '${name}' ในระบบ`);
                }

                let matchedCategory = null;
                if (!category) {
                    errors.push("กรุณาระบุหมวดหมู่ (คอลัมน์ C)");
                } else {
                    matchedCategory = findMasterItem(md.productTypes, category);
                    if (!matchedCategory) errors.push(`ไม่พบหมวดหมู่ '${category}' ในระบบ`);
                }

                let matchedSupplier = null;
                if (!supplier) {
                    errors.push("กรุณาระบุผู้จัดจำหน่าย (คอลัมน์ D)");
                } else {
                    matchedSupplier = findMasterItem(md.suppliers, supplier);
                    if (!matchedSupplier) errors.push(`ไม่พบผู้จัดจำหน่าย '${supplier}' ในระบบ`);
                }

                let matchedBranch = null;
                if (!branch) {
                    errors.push("กรุณาระบุสาขา (คอลัมน์ E)");
                } else {
                    matchedBranch = findMasterItem(md.branches, branch);
                    if (!matchedBranch) errors.push(`ไม่พบสาขา '${branch}' ในระบบ`);
                }

                let matchedColor = null;
                if (!color) {
                    errors.push("กรุณาระบุสี (คอลัมน์ F)");
                } else {
                    matchedColor = findMasterItem(md.productColors, color);
                    if (!matchedColor) errors.push(`ไม่พบสี '${color}' ในระบบ`);
                }

                let matchedUnit = null;
                if (!unit) {
                    errors.push("กรุณาระบุหน่วยนับ (คอลัมน์ I)");
                } else {
                    matchedUnit = findMasterItem(md.productUnits, unit);
                    if (!matchedUnit) errors.push(`ไม่พบหน่วยนับ '${unit}' ในระบบ`);
                }

                if (isNaN(cost) || cost <= 0) {
                    errors.push("ราคาต้นทุนต้องระบุเป็นตัวเลขมากกว่า 0 (คอลัมน์ J)");
                }

                if (isNaN(price) || price < 0) {
                    errors.push("ราคาขายต้องระบุเป็นตัวเลขไม่น้อยกว่า 0 (คอลัมน์ K)");
                }

                // Check device rules
                const isDevice = matchedCategory ? checkIsDevice(matchedCategory.name) : checkIsDevice(category);
                let matchedCapacity = null;
                let matchedCondition = null;
                let finalImeis = [];

                if (isDevice) {
                    if (!capacity) {
                        errors.push("ประเภทอุปกรณ์มือถือ/แท็บเล็ต จำเป็นต้องระบุความจุ (คอลัมน์ G)");
                    } else {
                        matchedCapacity = findMasterItem(md.productCapacities, capacity);
                        if (!matchedCapacity) errors.push(`ไม่พบความจุ '${capacity}' ในระบบ`);
                    }

                    if (!condition) {
                        errors.push("ประเภทอุปกรณ์มือถือ/แท็บเล็ต จำเป็นต้องระบุสภาพเครื่อง (คอลัมน์ H)");
                    } else {
                        matchedCondition = findMasterItem(md.productConditions, condition);
                        if (!matchedCondition) errors.push(`ไม่พบสภาพเครื่อง '${condition}' ในระบบ`);
                    }

                    finalImeis = imeisRaw ? imeisRaw.split(',').map(x => x.trim()).filter(Boolean) : [];
                    if (finalImeis.length === 0) {
                        errors.push("ประเภทอุปกรณ์มือถือ/แท็บเล็ต จำเป็นต้องระบุ IMEI อย่างน้อย 1 รายการ (คอลัมน์ M)");
                    }
                } else {
                    if (isNaN(qty) || qty < 1) {
                        errors.push("จำนวนสินค้าต้องเป็นตัวเลขมากกว่าหรือเท่ากับ 1 (คอลัมน์ L)");
                    }
                }

                const isValid = errors.length === 0;
                if (isValid) validCount++;
                else invalidCount++;

                const finalQty = isDevice ? finalImeis.length : qty;

                // Build Payload
                const payload = {
                    product_code: code,
                    supplier_id: matchedSupplier ? matchedSupplier._id : null,
                    name: matchedName ? matchedName.name : name,
                    type_id: matchedCategory ? matchedCategory._id : null,
                    color_id: matchedColor ? matchedColor._id : null,
                    cost_price: cost,
                    selling_price: price,
                    unit_id: matchedUnit ? matchedUnit._id : null,
                    capacity_id: matchedCapacity ? matchedCapacity._id : null,
                    condition_id: matchedCondition ? matchedCondition._id : null,
                    branch_id: matchedBranch ? matchedBranch._id : null,
                    quantity: finalQty,
                    imeis: finalImeis,
                    import_source: 'EXCEL'
                };

                parsedRows.push({
                    index: i + 1 - startIndex,
                    isValid,
                    errors,
                    code,
                    name,
                    branch: matchedBranch ? matchedBranch.name : (branch || '-'),
                    cost: isNaN(cost) ? '-' : cost,
                    price: isNaN(price) ? '-' : price,
                    qty: finalQty || '-',
                    payload
                });
            }

            if (parsedRows.length === 0) {
                showToast('ไม่พบข้อมูลสินค้าที่จัดเรียงเหมาะสมในไฟล์ Excel', 'error');
                return;
            }

            // Render Preview Step
            renderExcelPreview(validCount, invalidCount);
            goToStep(3);
        }

        function renderExcelPreview(validCount, invalidCount) {
            summaryTotal.textContent = parsedRows.length;
            summaryValid.textContent = validCount;
            summaryInvalid.textContent = invalidCount;

            if (invalidCount > 0) {
                summaryInvalidCard.className = "bg-red-500/20 p-4 rounded-xl border border-red-500 text-center";
                validationStatusBadge.className = "px-2.5 py-1 text-xs rounded-full font-medium bg-red-500/10 text-red-400 border border-red-500/20";
                validationStatusBadge.textContent = "พบข้อผิดพลาด";
                errorWarning.classList.remove('hidden');
                btnImportConfirm.disabled = true;
                btnImportConfirm.className = "px-6 py-2.5 bg-slate-700 text-slate-500 font-bold rounded-xl flex items-center gap-2 cursor-not-allowed";
            } else {
                summaryInvalidCard.className = "bg-red-500/5 p-4 rounded-xl border border-slate-700 text-center text-slate-400";
                validationStatusBadge.className = "px-2.5 py-1 text-xs rounded-full font-medium bg-emerald-500/10 text-emerald-400 border border-emerald-500/20";
                validationStatusBadge.textContent = "ข้อมูลถูกต้องทั้งหมด";
                errorWarning.classList.add('hidden');
                btnImportConfirm.disabled = false;
                btnImportConfirm.className = "px-6 py-2.5 bg-emerald-600 hover:bg-emerald-500 text-white font-bold rounded-xl glow-button-emerald flex items-center gap-2";
            }

            previewTbody.innerHTML = '';

            // Show maximum of 5 items
            const previewItems = parsedRows.slice(0, 5);
            previewItems.forEach(item => {
                const tr = document.createElement('tr');
                tr.className = "hover:bg-slate-700/30 transition-colors";

                const statusBadge = item.isValid
                    ? `<span class="px-2 py-0.5 text-[10px] bg-emerald-500/10 text-emerald-400 border border-emerald-500/20 rounded-full font-medium">ผ่าน</span>`
                    : `<span class="px-2 py-0.5 text-[10px] bg-red-500/10 text-red-400 border border-red-500/20 rounded-full font-medium">ผิดพลาด</span>`;

                const errorList = item.isValid
                    ? `<span class="text-slate-400">-</span>`
                    : `<ul class="list-disc pl-4 text-red-400 text-[11px] space-y-0.5">${item.errors.map(err => `<li>${err}</li>`).join('')}</ul>`;

                tr.innerHTML = `
                    <td class="p-3 text-center text-slate-400">${item.index}</td>
                    <td class="p-3">${statusBadge}</td>
                    <td class="p-3 font-medium text-white">${item.code || '-'}</td>
                    <td class="p-3 text-slate-300 font-medium">${item.name || '-'}</td>
                    <td class="p-3 text-slate-400">${item.branch}</td>
                    <td class="p-3 text-slate-300">฿${Number(item.cost).toLocaleString(undefined, { minimumFractionDigits: 0, maximumFractionDigits: 2 })}</td>
                    <td class="p-3 text-slate-300">฿${Number(item.price).toLocaleString(undefined, { minimumFractionDigits: 0, maximumFractionDigits: 2 })}</td>
                    <td class="p-3 text-center font-bold text-white">${item.qty}</td>
                    <td class="p-3">${errorList}</td>
                `;
                previewTbody.appendChild(tr);
            });
        }

        btnImportConfirm.addEventListener('click', async () => {
            if (isImporting || parsedRows.some(r => !r.isValid)) return;

            isImporting = true;
            btnImportConfirm.disabled = true;
            btnImportConfirm.innerHTML = `<i class="fa-solid fa-circle-notch fa-spin mr-2"></i> กำลังนำเข้า...`;
            btnExcelClose.style.display = 'none'; // Hide close button during import
            btnStep3Back.disabled = true;
            btnStep3Back.className = "px-5 py-2.5 rounded-xl font-medium text-slate-600 cursor-not-allowed";

            progressBox.classList.remove('hidden');

            let successCount = 0;
            const total = parsedRows.length;

            for (let i = 0; i < total; i++) {
                const item = parsedRows[i];
                const pct = Math.round((i / total) * 100);

                // Update Progress UI
                progressBar.style.width = `${pct}%`;
                progressPercent.textContent = `${pct}%`;
                progressText.textContent = `กำลังรับเข้าคลังสินค้า (${i + 1}/${total}): ${item.name}`;

                try {
                    const response = await authFetch(`${API_BASE_URL}/products`, {
                        method: 'POST',
                        headers: { 'Content-Type': 'application/json' },
                        body: JSON.stringify(item.payload)
                    });
                    const res = await response.json();
                    if (res.success) {
                        successCount++;
                    } else {
                        console.error(`Error importing row ${item.index}: ${res.message}`);
                    }
                } catch (err) {
                    console.error(`Connection error importing row ${item.index}:`, err);
                }
            }

            progressBar.style.width = '100%';
            progressPercent.textContent = '100%';
            progressText.textContent = 'นำเข้าข้อมูลสินค้าทั้งหมดสำเร็จเสร็จสิ้น';

            // Show Toast with success message and count
            showToast(`ยืนยันการนำเข้าสำเร็จจำนวน ${successCount} รายการ`);

            // Restore close buttons
            btnExcelClose.style.display = 'block';
            isImporting = false;

            // Close Modal
            closeExcelModal();

            // Refresh Table & UI
            if (typeof fetchProducts === 'function') {
                await fetchProducts();
            }
        });
    }
    initExcelImport();

    // DEPOSIT MODULE (การมัดจำสินค้า)
    // แยกออกไปที่ js/page-deposits.js แล้ว โหลดแบบ dynamic ผ่าน loadPageScript('deposits')
    // (ดู switchView case 'deposits')

    // ============================================================================
    // GLOBAL UX: ป้องกันการเลื่อนลูกกลิ้งเมาส์เปลี่ยนค่าในช่องกรอกตัวเลข (Number Inputs)
    // ============================================================================
    document.addEventListener('wheel', function (e) {
        if (document.activeElement && document.activeElement.type === 'number') {
            e.preventDefault();
        }
    }, { passive: false });

    // STOCK AUDIT MODULE — ระบบตรวจนับสต็อกประจำวัน + ตรวจสอบผลสต็อก
    // แยกออกไปที่ js/page-stock-audit.js แล้ว โหลดแบบ dynamic ผ่าน loadPageScript('stock-audit')
    // (ดู switchView case 'stock-audit' และ 'stock-audit-review')

    // --- COA Settings & Disbursement Voucher Modules ---
    // แยกออกไปที่ js/page-accounting-settings.js แล้ว โหลดแบบ dynamic ผ่าน loadPageScript('accounting-settings')
    // (ดู switchView case 'accounting-settings' และ 'disbursement')


}); // End of DOMContentLoaded