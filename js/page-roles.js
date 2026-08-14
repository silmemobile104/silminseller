// Role Management Logic (จัดการสิทธิ์ใช้งาน)
// แยกออกมาจาก script.js — โหลดแบบ dynamic เฉพาะตอนเปิดหน้า "จัดการสิทธิ์ใช้งาน" ครั้งแรกเท่านั้น
// พึ่งพา window.authFetch, window.showToast, window.showConfirm, window.closeDetailModal, API_BASE_URL (global จาก script.js)
(function () {
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

    const permKeys = ['view_dashboard', 'manage_stock', 'delete_stock', 'do_pos', 'manage_personnel', 'manage_branches', 'manage_settings', 'manage_roles', 'view_audit_logs', 'filter_stock_branch', 'cancel_sale', 'report_arrival', 'approve_import', 'manage_po', 'receive_po', 'manage_transfers', 'manage_finance', 'view_branch_inventory', 'view_daily_summary', 'do_stock_audit', 'manage_stock_audit', 'manage_deposits'];
    const permLabels = {
        view_dashboard: 'ดูแดชบอร์ด',
        manage_stock: 'จัดการสต็อก',
        delete_stock: 'ลบสินค้า',
        do_pos: 'ขายสินค้า (POS)',
        manage_personnel: 'จัดการพนักงาน',
        manage_branches: 'จัดการสาขา',
        manage_settings: 'ตั้งค่าระบบ',
        manage_roles: 'จัดการสิทธิ์',
        view_audit_logs: 'ประวัติกิจกรรมระบบ',
        filter_stock_branch: 'กรองสาขาในเมนู จัดการสต็อก',
        cancel_sale: 'ยกเลิกบิลขาย',
        report_arrival: 'แจ้งของถึงสาขา',
        approve_import: 'อนุมัตินำเข้าสต็อก',
        manage_po: 'จัดการระบบสั่งซื้อ (PO)',
        receive_po: 'ตรวจรับสินค้าเข้าสาขา',
        manage_transfers: 'โอนย้ายสินค้า',
        manage_finance: 'จัดการระบบบัญชีและการเงิน',
        view_branch_inventory: 'ดูสินค้าในสาขา',
        view_daily_summary: 'ดูสรุปยอดขายรายวัน',
        do_stock_audit: 'ตรวจนับสต็อกประจำวัน',
        manage_stock_audit: 'ตรวจสอบผลสต็อก (จัดการ/อนุมัติ)',
        manage_deposits: 'จัดการมัดจำสินค้า'
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
        view_audit_logs: 'fa-clock-rotate-left text-indigo-400',
        filter_stock_branch: 'fa-filter text-teal-400',
        cancel_sale: 'fa-ban text-red-500',
        report_arrival: 'fa-truck-ramp-box text-cyan-400',
        approve_import: 'fa-clipboard-check text-violet-400',
        manage_po: 'fa-file-invoice-dollar text-pink-400',
        receive_po: 'fa-boxes-packing text-indigo-400',
        manage_transfers: 'fa-right-left text-cyan-400',
        manage_finance: 'fa-chart-line text-amber-400',
        view_branch_inventory: 'fa-store text-emerald-400',
        view_daily_summary: 'fa-chart-line text-emerald-400',
        do_stock_audit: 'fa-qrcode text-violet-400',
        manage_stock_audit: 'fa-clipboard-check text-amber-400',
        manage_deposits: 'fa-wallet text-emerald-400'
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
    window.loadRoles = loadRoles;

    const openViewRoleModal = (role) => {
        document.getElementById('v-role-name').textContent = role.name || '-';
        const listContainer = document.getElementById('v-role-perms-list');
        if (listContainer) {
            const p = role.permissions || {};
            listContainer.innerHTML = permKeys.map(key => {
                const active = p[key];
                return `<div class="flex items-center gap-2 px-3 py-1.5 rounded-xl text-xs font-medium transition-all ${active
                    ? 'bg-emerald-500/10 text-emerald-400 border border-emerald-500/20'
                    : 'bg-slate-700/30 text-slate-400 border border-slate-700/50 opacity-60'
                    }">
                    <i class="fa-solid ${permIcons[key].split(' ')[0]} ${active ? '' : 'grayscale'}"></i>
                    <span>${permLabels[key]}</span>
                </div>`;
            }).join('');
        }

        const modal = document.getElementById('modal-role-view');
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
        const editBtn = document.getElementById('edit-role-from-view-btn');
        if (editBtn) {
            editBtn.onclick = () => {
                closeDetailModal('modal-role-view');
                editRoleId.value = role._id;
                roleModalTitle.innerHTML = '<i class="fa-solid fa-pen-to-square text-amber-400"></i> แก้ไขบทบาท';
                roleNameInput.value = role.name;
                permKeys.forEach(key => {
                    const el = document.getElementById(`perm-${key}`);
                    if (el) el.checked = !!(role.permissions && role.permissions[key]);
                });
                openRoleModal();
            };
        }
    };

    // Close handlers for Role View Modal
    const closeRoleBtn = document.getElementById('close-role-view-btn');
    if (closeRoleBtn) closeRoleBtn.onclick = () => closeDetailModal('modal-role-view');
    const closeRoleBtnBottom = document.getElementById('close-role-view-btn-bottom');
    if (closeRoleBtnBottom) closeRoleBtnBottom.onclick = () => closeDetailModal('modal-role-view');

    const renderRoleCard = (role) => {
        const p = role.permissions || {};
        const enabledCount = permKeys.filter(k => p[k]).length;

        const permBadges = permKeys.map(key => {
            const active = p[key];
            return `<div class="flex items-center gap-2 px-3 py-2 rounded-xl text-[13px] font-semibold transition-all ${active
                ? 'bg-amber-50 text-amber-700 border border-amber-200 shadow-sm'
                : 'bg-slate-100 text-slate-500 border border-slate-200'
                }">
                <i class="fa-solid ${permIcons[key].split(' ')[0]} ${active ? 'text-amber-500' : 'text-slate-400'}"></i>
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
                    <button class="view-role-btn w-9 h-9 flex items-center justify-center rounded-xl bg-slate-700/50 text-slate-400 hover:bg-indigo-500 hover:text-white transition-all duration-300 shadow-sm" title="ดูรายละเอียด">
                        <i class="fa-solid fa-eye text-sm"></i>
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

        // Event: View
        card.querySelector('.view-role-btn').addEventListener('click', () => {
            openViewRoleModal(role);
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

})();
