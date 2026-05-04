const API_BASE_URL = 'http://localhost:5000/api';

document.addEventListener('DOMContentLoaded', () => {
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

    // New DOM Elements for Master Data Management
    const navDashboard = document.getElementById('nav-dashboard');
    const navStock = document.getElementById('nav-stock');
    const navTransactions = document.getElementById('nav-transactions');
    const navPersonnel = document.getElementById('nav-personnel');
    const navBranches = document.getElementById('nav-branches');
    const navSettings = document.getElementById('nav-settings');

    const viewDashboard = document.getElementById('view-dashboard');
    const viewStock = document.getElementById('view-stock');
    const viewTransactions = document.getElementById('view-transactions');
    const viewPersonnel = document.getElementById('view-personnel');
    const viewBranches = document.getElementById('view-branches');
    const viewSettings = document.getElementById('view-settings');

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
    const fetchMasterData = async () => {
        try {
            const response = await fetch(`${API_BASE_URL}/master-data`);
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

                if (typeof renderSettingsList === 'function') {
                    renderSettingsList();
                }
            } else {
                console.error('Failed to load master data:', json.message);
            }
        } catch (error) {
            console.error('Error fetching master data:', error);
        }
    };

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

    // Auto-login check
    const savedUser = localStorage.getItem('silmin_user');
    if (savedUser) {
        try {
            const user = JSON.parse(savedUser);
            // Show stock view immediately
            loginScreen.classList.add('hidden');
            loginScreen.classList.remove('flex');
            mainLayout.classList.remove('hidden', 'opacity-0');
            mainLayout.classList.add('opacity-100');
            switchView('stock');

            // Optionally update UI with user info
            const userNameDisplay = document.querySelector('.text-sm.font-semibold.text-white');
            if (userNameDisplay) userNameDisplay.textContent = user.name;
        } catch (e) {
            localStorage.removeItem('silmin_user');
        }
    }

    // Fetch All Products
    const fetchProducts = async () => {
        try {
            const response = await fetch(`${API_BASE_URL}/products`);
            const json = await response.json();
            if (json.success) {
                renderProductTable(json.data);
            }
        } catch (error) {
            console.error('Error fetching products:', error);
        }
    };

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
                        <button class="delete-product-btn text-slate-400 hover:text-red-400 transition-colors p-2" data-id="${product._id}"><i class="fa-solid fa-trash"></i></button>
                    </div>
                </td>
            `;
            productTableBody.appendChild(row);

            // Attach listeners to buttons
            row.querySelector('.edit-product-btn').addEventListener('click', () => editProduct(product));
            row.querySelector('.delete-product-btn').addEventListener('click', () => deleteProduct(product._id));
        });
    };

    const deleteProduct = (id) => {
        showConfirm('ยืนยันการลบสินค้า', 'คุณแน่ใจหรือไม่ว่าต้องการลบสินค้านี้? ข้อมูลนี้ไม่สามารถกู้คืนได้', async () => {
            try {
                const response = await fetch(`${API_BASE_URL}/products/${id}`, {
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

    // Only fetch master data when dashboard is visible or app loads
    fetchMasterData();
    fetchProducts();

    // ==========================================
    // Login Logic
    // ==========================================
    loginForm.addEventListener('submit', async (e) => {
        e.preventDefault();

        const username = usernameInput.value.trim();
        const password = passwordInput.value;

        try {
            const response = await fetch(`${API_BASE_URL}/login`, {
                method: 'POST',
                headers: { 'Content-Type': 'application/json' },
                body: JSON.stringify({ username, password })
            });

            const result = await response.json();

            if (result.success) {
                // Success path
                loginError.classList.add('hidden');

                // Persist session
                localStorage.setItem('silmin_user', JSON.stringify(result.data));

                // Add some animation out
                loginScreen.classList.remove('opacity-100');
                loginScreen.classList.add('opacity-0');

                // Show dashboard after fade out
                setTimeout(() => {
                    loginScreen.classList.add('hidden');
                    loginScreen.classList.remove('flex');

                    mainLayout.classList.remove('hidden');
                    // Trigger reflow to ensure transition works
                    void mainLayout.offsetWidth;
                    mainLayout.classList.remove('opacity-0');
                    mainLayout.classList.add('opacity-100');

                    // Update UI with user info
                    const userNameDisplay = document.querySelector('.text-sm.font-semibold.text-white');
                    if (userNameDisplay) userNameDisplay.textContent = result.data.name;
                }, 500);
            } else {
                showLoginError(result.message);
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

    // Logout Logic
    logoutBtn.addEventListener('click', () => {
        // Clear session
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

            // Collect User ID from localStorage if available
            let branch_id = null;
            if (savedUser) {
                const user = JSON.parse(savedUser);
                branch_id = user.branch ? user.branch._id : null;
            }

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
                branch_id: branch_id,
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

                const response = await fetch(url, {
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
    const switchView = (viewName) => {
        // Reset all active states
        document.querySelectorAll('.nav-menu-item').forEach(item => {
            item.classList.remove('bg-cyan-500/10', 'text-cyan-400', 'border', 'border-cyan-500/20', 'active');
            item.classList.add('text-slate-300', 'hover:bg-slate-700/50', 'hover:text-white');
            item.style.borderColor = 'transparent';
        });

        // Hide all views and remove animation
        const views = [viewDashboard, viewStock, viewTransactions, viewPersonnel, viewBranches, viewSettings];
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
                // trigger reflow for animation
                void view.offsetWidth;
                view.classList.add('animate-fade-in');
            }
            if (nav) {
                nav.classList.remove('text-slate-300', 'hover:bg-slate-700/50', 'hover:text-white');
                nav.classList.add('bg-cyan-500/10', 'text-cyan-400', 'border', 'border-cyan-500/20', 'active');
            }
        };

        if (viewName === 'dashboard') activateView(viewDashboard, navDashboard);
        else if (viewName === 'stock') activateView(viewStock, navStock);
        else if (viewName === 'transactions') activateView(viewTransactions, navTransactions);
        else if (viewName === 'personnel') activateView(viewPersonnel, navPersonnel);
        else if (viewName === 'branches') {
            activateView(viewBranches, navBranches);
            loadBranches();
        }
        else if (viewName === 'settings') {
            activateView(viewSettings, navSettings);
            if (typeof renderSettingsList === 'function') renderSettingsList();
        }
    };

    if (navDashboard) navDashboard.addEventListener('click', (e) => { e.preventDefault(); switchView('dashboard'); });
    if (navStock) navStock.addEventListener('click', (e) => { e.preventDefault(); switchView('stock'); });
    if (navTransactions) navTransactions.addEventListener('click', (e) => { e.preventDefault(); switchView('transactions'); });
    if (navPersonnel) navPersonnel.addEventListener('click', (e) => { e.preventDefault(); switchView('personnel'); });
    if (navBranches) navBranches.addEventListener('click', (e) => { e.preventDefault(); switchView('branches'); });
    if (navSettings) navSettings.addEventListener('click', (e) => { e.preventDefault(); switchView('settings'); });

    // ==========================================
    // Branch Management Logic
    // ==========================================

    const loadBranches = async () => {
        if (!branchGrid) return;

        try {
            const response = await fetch(`${API_BASE_URL}/branches`);
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
                                const response = await fetch(`${API_BASE_URL}/branches/${id}`, { method: 'DELETE' });
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
    };

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

                const response = await fetch(url, {
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
    window.renderSettingsList = () => {
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
    };

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
                const response = await fetch(`${API_BASE_URL}/master/${currentSettingsTab}`, {
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
            const response = await fetch(`${API_BASE_URL}/master/${currentSettingsTab}/${id}`, {
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
            const response = await fetch(`${API_BASE_URL}/master/${currentSettingsTab}/${id}`, {
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
});
