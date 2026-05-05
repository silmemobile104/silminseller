const API_BASE_URL = 'http://localhost:5000/api';

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
            forceLogout();
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

    const viewDashboard = document.getElementById('view-dashboard');
    const viewStock = document.getElementById('view-stock');
    const viewTransactions = document.getElementById('view-transactions');
    const viewPersonnel = document.getElementById('view-personnel');
    const viewBranches = document.getElementById('view-branches');
    const viewSettings = document.getElementById('view-settings');
    const viewRoles = document.getElementById('view-roles');
    const viewSalesHistory = document.getElementById('view-sales-history');

    const settingsTabBtns = document.querySelectorAll('.settings-tab-btn');
    const masterDataInput = document.getElementById('master-data-input');
    const btnAddMasterData = document.getElementById('btn-add-master-data');
    const masterDataList = document.getElementById('master-data-list');
    const masterDataEmpty = document.getElementById('master-data-empty');
    const productTableBody = document.getElementById('product-table-body');

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

    let currentSettingsTab = 'productname';
    window.masterDataCache = {};

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
        btnAddProduct.addEventListener('click', () => {
            // Reset Edit ID
            const editIdInput = document.getElementById('edit-product-id');
            if (editIdInput) editIdInput.value = '';

            // Reset Title
            const modalTitle = document.getElementById('modal-title');
            if (modalTitle) modalTitle.innerHTML = `<i class="fa-solid fa-box-open text-cyan-400"></i> เพิ่มสินค้าใหม่`;

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

    const populateDropdown = (selectElement, dataArray, defaultText) => {
        if (!selectElement) return;
        selectElement.innerHTML = `<option value="" disabled selected>${defaultText}</option>`;
        dataArray.forEach(item => {
            const option = document.createElement('option');
            option.value = item._id;
            option.textContent = item.name;
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

    // Update Top App Bar with user data
    const updateTopBar = (userData) => {
        if (topbarUserName) topbarUserName.textContent = userData.name || 'ผู้ใช้งาน';
        if (topbarUserRole) topbarUserRole.textContent = userData.role || '-';
        if (topbarUserAvatar) {
            const nameForAvatar = encodeURIComponent(userData.name || 'User');
            topbarUserAvatar.src = `https://ui-avatars.com/api/?name=${nameForAvatar}&background=0D8ABC&color=fff`;
        }
    };

    // ==========================================
    // Dynamic Permissions (RBAC ตามสิทธิ์จาก Role)
    // ==========================================
    const applyPermissions = (permissions) => {
        if (!permissions) return;

        // ซ่อน/แสดง เมนู Sidebar ตาม permissions
        if (navDashboard) navDashboard.style.display = permissions.view_dashboard ? '' : 'none';
        if (navTransactions) navTransactions.style.display = permissions.do_pos ? '' : 'none';
        if (navPersonnel) navPersonnel.style.display = permissions.manage_personnel ? '' : 'none';
        if (navBranches) navBranches.style.display = permissions.manage_branches ? '' : 'none';
        if (navSettings) navSettings.style.display = permissions.manage_settings ? '' : 'none';
        if (navRoles) navRoles.style.display = permissions.manage_roles ? '' : 'none';

        // ซ่อน/แสดง ปุ่มเพิ่มสินค้า + ลบสินค้า
        const btnAdd = document.getElementById('btn-add-product');
        if (btnAdd) btnAdd.style.display = permissions.manage_stock ? '' : 'none';

        // เก็บ permissions ไว้ใน window สำหรับใช้ตรวจสอบใน renderProductTable
        window.__userPermissions = permissions;
    };

    // Fetch All Products
    async function fetchProducts() {
        try {
            const response = await authFetch(`${API_BASE_URL}/products`);
            const json = await response.json();
            if (json.success) {
                renderProductTable(json.data);
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
                    <td colspan="6" class="px-6 py-8 text-center text-slate-500 italic">
                        ยังไม่มีข้อมูลสินค้าในคลัง
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

            const statusColor = (product.quantity) > 0 ? 'bg-emerald-400' : 'bg-red-400';
            const statusText = (product.quantity) > 0 ? 'มีสินค้า' : 'สินค้าหมด';
            const statusClass = (product.quantity) > 0 ? 'text-emerald-400' : 'text-red-400';
            const statusShadow = (product.quantity) > 0 ? 'shadow-[0_0_8px_rgba(52,211,153,0.8)]' : 'shadow-[0_0_8px_rgba(248,113,113,0.8)]';

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
                        <button class="edit-product-btn text-slate-400 hover:text-cyan-400 transition-colors p-2" data-id="${product._id}"><i class="fa-solid fa-pen"></i></button>
                        ${window.__userPermissions && window.__userPermissions.delete_stock ? `<button class="delete-product-btn text-slate-400 hover:text-red-400 transition-colors p-2" data-id="${product._id}"><i class="fa-solid fa-trash"></i></button>` : ''}
                    </div>
                </td>
            `;
            productTableBody.appendChild(row);

            // Attach listeners to buttons
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

    const editProduct = (product) => {
        // Change Modal Title
        const modalTitle = document.getElementById('modal-title');
        if (modalTitle) modalTitle.innerHTML = `<i class="fa-solid fa-pen-to-square text-cyan-400"></i> แก้ไขข้อมูลสินค้า`;

        // Set Edit ID
        const editIdInput = document.getElementById('edit-product-id');
        if (editIdInput) editIdInput.value = product._id;

        // Populate Form Fields
        if (productCode) productCode.value = product.product_code || '';
        if (productSupplier) productSupplier.value = product.supplier_id ? product.supplier_id._id : '';
        if (productName) {
            // Find option with matching text or ID
            Array.from(productName.options).forEach(opt => {
                if (opt.textContent === product.name) productName.value = opt.value;
            });
        }
        if (productCategory) productCategory.value = product.type_id ? product.type_id._id : '';
        if (productColor) productColor.value = product.color_id ? product.color_id._id : '';
        if (productCapacity) productCapacity.value = product.capacity_id ? product.capacity_id._id : '';
        if (productCondition) productCondition.value = product.condition_id ? product.condition_id._id : '';
        if (productUnit) productUnit.value = product.unit_id ? product.unit_id._id : '';
        if (productQuantity) productQuantity.value = product.quantity || 1;

        // ตั้งค่าสาขาที่จัดเก็บ
        if (productBranch) {
            loadBranchesForProductForm().then(() => {
                productBranch.value = product.branch_id ? product.branch_id._id : '';
            });
        }

        document.getElementById('cost-price').value = product.cost_price || 0;
        document.getElementById('selling-price').value = product.selling_price || 0;

        // IMEIs
        if (productImeis) {
            productImeis.value = (product.imeis || []).join('\n');
        }

        // Handle field visibility based on category
        const categoryName = product.type_id ? product.type_id.name : '';
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
                }, 500);
            } else {
                showLoginError(result.message || 'รหัสพนักงานหรือรหัสผ่านไม่ถูกต้อง');
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
                if(productCapacity) productCapacity.required = true;
                if(productCondition) productCondition.required = true;

                // Try to auto-select "เครื่อง" unit if available
                Array.from(productUnit.options).forEach(opt => {
                    if (opt.textContent === 'เครื่อง') productUnit.value = opt.value;
                });
            } else if (categoryName.includes('อุปกรณ์เสริม')) {
                deviceFields.classList.add('hidden');
                imeiField.classList.add('hidden');

                productImeis.required = false;
                productQuantity.required = true;
                if(productCapacity) productCapacity.required = false;
                if(productCondition) productCondition.required = false;

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
            const payload = {
                product_code: productCode ? productCode.value.trim() : '',
                supplier_id: productSupplier ? productSupplier.value : null,
                name: productName.options[productName.selectedIndex].textContent,
                type_id: productCategory.value,
                color_id: productColor.value || null,
                cost_price: Number(document.getElementById('cost-price').value),
                selling_price: Number(document.getElementById('selling-price').value),
                unit_id: productUnit.value || null,
                capacity_id: productCapacity.value || null,
                condition_id: productCondition.value || null,
                branch_id: branch_id || null,
                quantity: Number(productQuantity.value) || 1
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
                const isEditing = editIdInput && editIdInput.value;
                const url = isEditing ? `${API_BASE_URL}/products/${editIdInput.value}` : `${API_BASE_URL}/products`;
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
        const views = [viewDashboard, viewStock, viewTransactions, viewPersonnel, viewBranches, viewSettings, viewRoles, viewSalesHistory];
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
            loadDashboardData();
        }
        else if (viewName === 'stock') activateView(viewStock, navStock);
        else if (viewName === 'transactions') {
            activateView(viewTransactions, navTransactions);
            fetchPosProducts();
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
            loadSalesHistory();
        }
    };

    if (navDashboard) navDashboard.addEventListener('click', (e) => { e.preventDefault(); switchView('dashboard'); });
    if (navStock) navStock.addEventListener('click', (e) => { e.preventDefault(); switchView('stock'); });
    if (navTransactions) navTransactions.addEventListener('click', (e) => { e.preventDefault(); switchView('transactions'); });
    if (navPersonnel) navPersonnel.addEventListener('click', (e) => { e.preventDefault(); switchView('personnel'); });
    if (navBranches) navBranches.addEventListener('click', (e) => { e.preventDefault(); switchView('branches'); });
    if (navSettings) navSettings.addEventListener('click', (e) => { e.preventDefault(); switchView('settings'); });
    if (navRoles) navRoles.addEventListener('click', (e) => { e.preventDefault(); switchView('roles'); });
    if (navSalesHistory) navSalesHistory.addEventListener('click', (e) => { e.preventDefault(); switchView('sales-history'); });

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
        } catch (e) {
            localStorage.removeItem('silmin_token');
            localStorage.removeItem('silmin_user');
        }
    }

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
    // ==========================================
    function renderSettingsList() {
        if (!masterDataList) return;

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

                card.innerHTML = `
                    <span class="text-white font-medium truncate pr-2">${item.name}</span>
                    <div class="flex items-center gap-1">
                        <button class="btn-edit-master text-slate-500 hover:text-cyan-400 transition-colors opacity-50 group-hover:opacity-100 p-2 rounded-lg hover:bg-cyan-500/10" data-id="${item._id}" data-name="${item.name}">
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

                    showPrompt('แก้ไขข้อมูล', oldName, (newName) => {
                        if (newName && newName.trim() !== '' && newName !== oldName) {
                            editMasterData(id, newName.trim());
                        }
                    });
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
                renderSettingsList();
            });
        });
    }

    if (btnAddMasterData) {
        btnAddMasterData.addEventListener('click', async () => {
            const name = masterDataInput.value.trim();
            if (!name) return showToast('กรุณาระบุชื่อข้อมูลที่ต้องการเพิ่ม', 'error');

            try {
                const response = await authFetch(`${API_BASE_URL}/master/${currentSettingsTab}`, {
                    method: 'POST',
                    headers: { 'Content-Type': 'application/json' },
                    body: JSON.stringify({ name })
                });
                const result = await response.json();

                if (result.success) {
                    masterDataInput.value = '';
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

    const editMasterData = async (id, name) => {
        try {
            const response = await authFetch(`${API_BASE_URL}/master/${currentSettingsTab}/${id}`, {
                method: 'PUT',
                headers: { 'Content-Type': 'application/json' },
                body: JSON.stringify({ name })
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
                if (empBranchSelect) empBranchSelect.value = emp.branch_id ? emp.branch_id._id : '';
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
    const cartSubtotal = document.getElementById('cart-subtotal');
    const cartDiscount = document.getElementById('cart-discount');
    const cartTotal = document.getElementById('cart-total');
    const posDiscount = document.getElementById('pos-discount');
    const paymentMethod = document.getElementById('pos-payment-method');
    const posDownPaymentSection = document.getElementById('pos-down-payment-section');
    const posDownPayment = document.getElementById('pos-down-payment');
    const btnCheckout = document.getElementById('btn-checkout');

    // IMEI Modal DOM
    const imeiSelectModal = document.getElementById('imei-select-modal');
    const closeImeiModalBtn = document.getElementById('close-imei-modal');
    const imeiSearchInput = document.getElementById('imei-search-input');
    const imeiListContainer = document.getElementById('imei-list-container');

    // Confirm Price Modal DOM (disabled - inline checkout)

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
    const btnReprintReceipt = document.getElementById('btn-reprint-receipt');

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
                        <h4 class="font-semibold text-white text-sm truncate">${product.name}</h4>
                        <p class="text-xs text-slate-500 mt-0.5">${capacityName} ${colorName}</p>
                        <p class="text-xs mt-1">
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
            // Show IMEI selection modal
            openImeiModal(product);
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
                    <div class="flex items-center justify-end gap-2">
                        <span class="text-xs text-slate-500">฿</span>
                        <input type="number" min="0" step="1" value="${item.price}"
                            class="cart-price-input w-24 px-2 py-1.5 rounded-lg bg-slate-800 border border-slate-600 text-white text-right font-mono text-sm focus:border-cyan-500 focus:ring-1 focus:ring-cyan-500 focus:outline-none transition-all"
                            data-index="${index}">
                    </div>
                    <p class="cart-line-subtotal font-bold text-cyan-400 font-mono text-sm mt-1" data-index="${index}">฿${item.subtotal.toLocaleString()}</p>
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

        document.querySelectorAll('.cart-price-input').forEach(input => {
            input.addEventListener('input', (e) => {
                const idx = parseInt(e.currentTarget.getAttribute('data-index'));
                const newPrice = parseFloat(e.currentTarget.value) || 0;
                if (!cart[idx]) return;

                cart[idx].price = newPrice;
                cart[idx].subtotal = cart[idx].quantity * cart[idx].price;

                const lineSubtotalEl = cartItemsContainer.querySelector(`.cart-line-subtotal[data-index="${idx}"]`);
                if (lineSubtotalEl) lineSubtotalEl.textContent = `฿${cart[idx].subtotal.toLocaleString()}`;

                updateCartTotals();
            });
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
        const discount = posDiscount ? (parseFloat(posDiscount.value) || 0) : 0;
        const grandTotal = Math.max(0, subtotal - discount);

        if (cartSubtotal) cartSubtotal.textContent = `฿${subtotal.toLocaleString()}`;
        if (cartDiscount) cartDiscount.textContent = `฿${discount.toLocaleString()}`;
        if (cartTotal) cartTotal.textContent = `฿${grandTotal.toLocaleString()}`;
    };

    if (posDiscount) {
        posDiscount.addEventListener('input', () => {
            updateCartTotals();
        });
    }

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
                e.preventDefault();
                clearTimeout(searchTimeout);
                searchPosProducts(e.target.value);
            }
        });
    }

    // POS Payment method change listener - show/hide down payment section
    if (paymentMethod) {
        paymentMethod.addEventListener('change', (e) => {
            if (e.target.value === 'จัดไฟแนนซ์' && posDownPaymentSection) {
                posDownPaymentSection.classList.remove('hidden');
            } else if (posDownPaymentSection) {
                posDownPaymentSection.classList.add('hidden');
                if (posDownPayment) posDownPayment.value = '0';
            }
        });
    }

    const checkoutNow = async () => {
        if (cart.length === 0) {
            showToast('กรุณาเพิ่มสินค้าลงในตะกร้าก่อนทำรายการ', 'error');
            return;
        }

        const selectedPayment = paymentMethod ? paymentMethod.value : '';
        if (!selectedPayment) {
            showToast('กรุณาเลือกวิธีชำระเงิน', 'error');
            return;
        }

        const discount = posDiscount ? (parseFloat(posDiscount.value) || 0) : 0;
        const downPayment = posDownPayment ? (parseFloat(posDownPayment.value) || 0) : 0;

        const subtotal = cart.reduce((sum, item) => sum + item.subtotal, 0);
        const total = Math.max(0, subtotal - discount);

        const originalText = btnCheckout ? btnCheckout.innerHTML : '';
        if (btnCheckout) {
            btnCheckout.disabled = true;
            btnCheckout.innerHTML = `<i class="fa-solid fa-circle-notch fa-spin text-xl"></i> กำลังดำเนินการ...`;
        }

        try {
            let branch_id = null;
            const savedUserData = localStorage.getItem('silmin_user');
            if (savedUserData) {
                const user = JSON.parse(savedUserData);
                branch_id = user.branch ? user.branch._id : null;
            }

            const payload = {
                items: cart.map(item => ({
                    product_id: item.product_id,
                    product_name: item.product_name,
                    imei_sold: item.imei_sold || '',
                    quantity: item.quantity,
                    price: item.price
                })),
                total_amount: total,
                payment_method: selectedPayment,
                down_payment: downPayment,
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

                cart = [];
                renderCart();

                if (paymentMethod) paymentMethod.selectedIndex = 0;
                if (posDiscount) posDiscount.value = '0';
                if (posDownPayment) posDownPayment.value = '0';
                if (posDownPaymentSection) posDownPaymentSection.classList.add('hidden');
                updateCartTotals();

                if (posSearchInput) posSearchInput.value = '';
                if (posEmptyState) posEmptyState.classList.remove('hidden');
                if (posSearchResults) {
                    posSearchResults.classList.add('hidden');
                    posSearchResults.innerHTML = '';
                }
            } else {
                showToast('เกิดข้อผิดพลาด: ' + result.message, 'error');
            }
        } catch (error) {
            console.error('Checkout error:', error);
            showToast('ไม่สามารถทำรายการได้', 'error');
        } finally {
            if (btnCheckout) {
                btnCheckout.disabled = false;
                btnCheckout.innerHTML = originalText;
            }
        }
    };

    // Checkout Logic
    if (btnCheckout) {
        btnCheckout.addEventListener('click', async () => {
            await checkoutNow();
        });
    }

    // Confirm Price Modal logic disabled (refactored to inline checkout)

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
            row.className = 'border-b border-slate-700 hover:bg-slate-700/30 transition-colors';

            const dateStr = new Date(txn.created_at).toLocaleString('th-TH', {
                day: '2-digit',
                month: '2-digit',
                year: '2-digit',
                hour: '2-digit',
                minute: '2-digit'
            });

            row.innerHTML = `
                <td class="px-6 py-4 text-slate-300">${dateStr}</td>
                <td class="px-6 py-4 text-white font-mono">${txn.receipt_number}</td>
                <td class="px-6 py-4 text-slate-300">${txn.branch_id ? txn.branch_id.name : '-'}</td>
                <td class="px-6 py-4 text-slate-300">${txn.employee_id ? txn.employee_id.name : '-'}</td>
                <td class="px-6 py-4 text-right text-cyan-400 font-bold font-mono">฿${txn.total_amount.toLocaleString()}</td>
                <td class="px-6 py-4 text-slate-300">${txn.payment_method}</td>
                <td class="px-6 py-4 text-center">
                    <button class="view-transaction-btn px-4 py-2 bg-amber-500/10 hover:bg-amber-500/20 text-amber-400 hover:text-amber-300 rounded-lg transition-all font-medium"
                            data-id="${txn._id}">
                        <i class="fa-solid fa-eye mr-2"></i>ดูรายละเอียด
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
        transactionDetailPayment.textContent = txn.payment_method;
        transactionDetailTotal.textContent = `฿${txn.total_amount.toLocaleString()}`;

        // Handle down payment (show only for financing)
        const isFinancing = (txn.payment_method || '').includes('ไฟแนนซ์');
        if (isFinancing) {
            const downPaymentValue = Number(txn.down_payment) || 0;
            transactionDetailDownpaymentSection.classList.remove('hidden');
            transactionDetailDownpayment.textContent = `฿${downPaymentValue.toLocaleString()}`;
            const balance = txn.total_amount - downPaymentValue;
            transactionDetailBalance.textContent = `฿${balance.toLocaleString()}`;
        } else {
            transactionDetailDownpaymentSection.classList.add('hidden');
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
        currentTransaction = null;
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
                closeTransactionDetailModal();
                openCheckoutSuccessModal(currentTransaction);
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
            printWindow.onload = function() {
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

    const permKeys = ['view_dashboard', 'manage_stock', 'delete_stock', 'do_pos', 'manage_personnel', 'manage_branches', 'manage_settings', 'manage_roles'];
    const permLabels = {
        view_dashboard: 'ดูแดชบอร์ด',
        manage_stock: 'จัดการสต็อก',
        delete_stock: 'ลบสินค้า',
        do_pos: 'ขายสินค้า (POS)',
        manage_personnel: 'จัดการพนักงาน',
        manage_branches: 'จัดการสาขา',
        manage_settings: 'ตั้งค่าระบบ',
        manage_roles: 'จัดการสิทธิ์'
    };
    const permIcons = {
        view_dashboard: 'fa-chart-pie text-blue-400',
        manage_stock: 'fa-box-open text-cyan-400',
        delete_stock: 'fa-trash text-red-400',
        do_pos: 'fa-money-bill-transfer text-green-400',
        manage_personnel: 'fa-users text-purple-400',
        manage_branches: 'fa-store text-orange-400',
        manage_settings: 'fa-gear text-slate-400',
        manage_roles: 'fa-shield-halved text-amber-400'
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
            return `<div class="flex items-center gap-2 px-3 py-1.5 rounded-xl text-xs font-medium transition-all ${
                active 
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
    // INITIAL APP LOAD (เรียกข้อมูลครั้งแรก)
    // ==========================================
    // เรียกใช้ฟังก์ชันดึงข้อมูลทั้งหมดที่ส่วนท้ายสุด เพื่อให้มั่นใจว่าฟังก์ชันทั้งหมดถูกประกาศแล้ว
    fetchMasterData();
    fetchProducts();
    loadBranches();
    loadEmployees();
    loadDashboardData();
    fetchPosProducts();
    loadRoles();

    console.log('[SILMIN] ระบบเริ่มต้นสำเร็จและโหลดข้อมูลครบถ้วน');
});
