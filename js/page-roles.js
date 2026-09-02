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
    const btnAddRole = document.getElementById('btn-add-role');
    const closeRoleModalBtn = document.getElementById('close-role-modal-btn');
    const cancelRoleModalBtn = document.getElementById('cancel-role-modal-btn');

    const permKeys = ['view_dashboard', 'manage_stock', 'delete_stock', 'do_pos', 'manage_personnel', 'manage_branches', 'manage_settings', 'manage_roles', 'view_audit_logs', 'filter_stock_branch', 'cancel_sale', 'report_arrival', 'approve_import', 'manage_po', 'receive_po', 'manage_transfers', 'manage_finance', 'view_branch_inventory', 'view_daily_summary', 'do_stock_audit', 'manage_stock_audit', 'manage_deposits', 'manage_database'];
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
        manage_deposits: 'จัดการมัดจำสินค้า',
        manage_database: 'จัดการฐานข้อมูล'
    };
    const permIcons = {
        view_dashboard: 'fa-chart-pie',
        manage_stock: 'fa-box-open',
        delete_stock: 'fa-trash',
        do_pos: 'fa-money-bill-transfer',
        manage_personnel: 'fa-users',
        manage_branches: 'fa-store',
        manage_settings: 'fa-gear',
        manage_roles: 'fa-shield-halved',
        view_audit_logs: 'fa-clock-rotate-left',
        filter_stock_branch: 'fa-filter',
        cancel_sale: 'fa-ban',
        report_arrival: 'fa-truck-ramp-box',
        approve_import: 'fa-clipboard-check',
        manage_po: 'fa-file-invoice-dollar',
        receive_po: 'fa-boxes-packing',
        manage_transfers: 'fa-right-left',
        manage_finance: 'fa-chart-line',
        view_branch_inventory: 'fa-store',
        view_daily_summary: 'fa-chart-line',
        do_stock_audit: 'fa-qrcode',
        manage_stock_audit: 'fa-clipboard-check',
        manage_deposits: 'fa-wallet',
        manage_database: 'fa-database'
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
        if (roleModalTitle) roleModalTitle.innerHTML = '<i class="fa-solid fa-shield-halved text-[#FFE169]"></i> เพิ่มบทบาทใหม่';
        if (roleForm) roleForm.reset();
        openRoleModal();
    });
    if (closeRoleModalBtn) closeRoleModalBtn.addEventListener('click', closeRoleModal);
    if (cancelRoleModalBtn) cancelRoleModalBtn.addEventListener('click', closeRoleModal);

    // ---------- กริดบทบาท (DESIGN.md ข้อ 11.3 - 11.7) ----------
    const ROLE_CHIP_LIMIT = 6;   // เกินนี้ยุบเป็น "+N อื่นๆ" รายการเต็มดูได้ในโมดัลรายละเอียด
    let _roleCache = [];
    let _roleSearch = '';
    let _roleBound = false;

    // ชื่อบทบาทมาจากฐานข้อมูลแล้วถูกยัดเข้า innerHTML — ของเดิมใส่ดิบๆ
    // ทั้งในเนื้อการ์ดและใน data-name ถ้ามี " หรือ < ปนมาจะทำให้การ์ดเพี้ยน
    const roleEsc = (s) => String(s == null ? '' : s)
        .replace(/&/g, '&amp;').replace(/</g, '&lt;').replace(/>/g, '&gt;')
        .replace(/"/g, '&quot;').replace(/'/g, '&#39;');

    const roleStateBox = (msg, cls = 'text-white/50 italic') =>
        `<div class="col-span-full px-6 py-10 text-center ${cls}">${roleEsc(msg)}</div>`;

    const roleSkeleton = (n = 6) => {
        if (!rolesGrid) return;
        const bar = (w) => `<div class="h-3.5 ${w} rounded-full bg-[#5c5c5c] animate-pulse"></div>`;
        rolesGrid.innerHTML = Array.from({ length: n }).map(() => `
            <div class="bg-[#27272A] border border-[#3F3F46] rounded-xl p-5">
                <div class="flex items-start gap-3">
                    <div class="w-11 h-11 rounded-full bg-[#5c5c5c] animate-pulse shrink-0"></div>
                    <div class="flex-1 space-y-2 pt-1">${bar('w-28')}${bar('w-20')}</div>
                </div>
                <div class="mt-4 space-y-2">${bar('w-full')}${bar('w-2/3')}</div>
            </div>`).join('');
    };

    const roleSetText = (id, text) => {
        const el = document.getElementById(id);
        if (el) el.textContent = text;
    };

    // ชิปตัวกรองที่ใช้อยู่ (ข้อ 11.5 — ลบได้เฉพาะตอนคลิกกากบาท)
    const roleRenderChips = () => {
        const box = document.getElementById('roles-active-filters');
        if (!box) return;
        box.innerHTML = '';
        if (!_roleSearch.trim()) return;

        const chip = document.createElement('button');
        chip.type = 'button';
        chip.className = 'px-4 py-2.5 rounded-xl bg-[#4D4D4D]/40 border border-[#3F3F46] ' +
            'text-white text-sm font-medium transition-colors flex items-center gap-2 cursor-pointer';
        chip.innerHTML = `<span>ค้นหา: ${roleEsc(_roleSearch.trim())}</span><i class="fa-solid fa-xmark text-[10px] opacity-80"></i>`;
        chip.setAttribute('aria-label', `ลบตัวกรอง ค้นหา ${_roleSearch.trim()}`);
        chip.addEventListener('click', (e) => {
            if (!e.target.closest('i.fa-xmark')) return;
            _roleSearch = '';
            const s = document.getElementById('roles-search');
            if (s) s.value = '';
            roleRender();
        });
        box.appendChild(chip);
    };

    const roleRender = () => {
        if (!rolesGrid) return;
        roleRenderChips();

        const q = _roleSearch.trim().toLowerCase();
        const rows = _roleCache.filter(r => {
            if (!q) return true;
            const p = r.permissions || {};
            const permNames = permKeys.filter(k => p[k]).map(k => permLabels[k]);
            return [r.name, ...permNames].filter(Boolean).join(' ').toLowerCase().includes(q);
        });

        roleSetText('roles-count-badge', `${_roleCache.length} บทบาท`);
        roleSetText('roles-result-count', _roleCache.length ? `แสดง ${rows.length} จาก ${_roleCache.length} รายการ` : '');

        if (!rows.length) {
            rolesGrid.innerHTML = roleStateBox(_roleCache.length
                ? 'ไม่พบบทบาทที่ตรงกับคำค้นหา'
                : 'ยังไม่มีข้อมูลระดับสิทธิ์ กด "เพิ่มบทบาทใหม่" เพื่อเริ่มใช้งาน');
            return;
        }

        rolesGrid.innerHTML = rows.map(role => {
            const p = role.permissions || {};
            const onKeys = permKeys.filter(k => p[k]);
            const pct = permKeys.length ? Math.round((onKeys.length / permKeys.length) * 100) : 0;

            // แสดงเฉพาะสิทธิ์ที่ "เปิด" — ของเดิมแสดงครบทั้ง 22 อัน โดยอันที่ปิดเป็นสีเทา
            // กลายเป็น 22 ป้ายต่อการ์ด ซึ่งอ่านยากและกลบสิ่งที่บทบาทนั้นทำได้จริง
            const shown = onKeys.slice(0, ROLE_CHIP_LIMIT);
            const rest = onKeys.length - shown.length;
            const chips = shown.map(k => `
                <span class="inline-flex items-center gap-1.5 px-2.5 py-1 rounded-[0.375rem] text-xs font-medium bg-[#42A231]/[0.12] text-[#20D500]">
                    <i class="fa-solid ${roleEsc(permIcons[k])} text-[10px]"></i>${roleEsc(permLabels[k])}
                </span>`).join('') +
                (rest > 0
                    ? `<span class="inline-flex items-center px-2.5 py-1 rounded-[0.375rem] text-xs font-medium bg-[#4D4D4D]/60 text-white">+${rest} อื่นๆ</span>`
                    : '');

            return `
            <div class="bg-[#27272A] border border-[#3F3F46] rounded-xl p-5 hover:border-[#FFE169] transition-colors flex flex-col">
                <div class="flex items-start gap-3">
                    <div class="w-11 h-11 rounded-full flex items-center justify-center shrink-0"
                         style="color:#FFE169;background-color:#27272A;border:1px solid #FFE16959;">
                        <i class="fa-solid fa-shield-halved text-lg"></i>
                    </div>
                    <div class="min-w-0 flex-1">
                        <h4 class="text-base font-semibold text-white truncate" title="${roleEsc(role.name)}">${roleEsc(role.name)}</h4>
                        <p class="text-xs text-white/70 mt-0.5">
                            <span class="font-mono text-[#FFE169]">${onKeys.length}</span> จาก ${permKeys.length} สิทธิ์
                        </p>
                    </div>
                    <div class="flex items-center gap-1 shrink-0">
                        <button type="button" class="view-role-btn text-white hover:text-indigo-400 transition-colors p-2 cursor-pointer"
                            data-id="${roleEsc(role._id)}" title="ดูรายละเอียดสิทธิ์"
                            aria-label="ดูรายละเอียดสิทธิ์ของบทบาท ${roleEsc(role.name)}">
                            <i class="fa-solid fa-eye"></i>
                        </button>
                        <button type="button" class="delete-role-btn text-white hover:text-red-400 transition-colors p-2 cursor-pointer"
                            data-id="${roleEsc(role._id)}" title="ลบบทบาท"
                            aria-label="ลบบทบาท ${roleEsc(role.name)}">
                            <i class="fa-solid fa-trash"></i>
                        </button>
                    </div>
                </div>

                <div class="mt-3 h-1.5 rounded-full bg-white/10 overflow-hidden">
                    <div class="h-full rounded-full bg-[#FFE169]" style="width:${pct}%"></div>
                </div>

                <div class="mt-4 flex flex-wrap gap-1.5 flex-1 content-start">
                    ${onKeys.length ? chips : '<span class="text-xs text-white/50 italic">ยังไม่ได้เปิดสิทธิ์ใดเลย</span>'}
                </div>
            </div>`;
        }).join('');

        const byId = (id) => rows.find(r => String(r._id) === String(id));
        rolesGrid.querySelectorAll('.view-role-btn').forEach(btn =>
            btn.addEventListener('click', () => { const r = byId(btn.dataset.id); if (r) openViewRoleModal(r); }));
        rolesGrid.querySelectorAll('.delete-role-btn').forEach(btn =>
            btn.addEventListener('click', () => { const r = byId(btn.dataset.id); if (r) deleteRole(r); }));
    };

    // การลบย้อนไม่ได้ ต้องผ่าน showConfirm() และบอกชื่อบทบาทให้ชัด (ข้อ 11.12 ข้อ 11)
    const deleteRole = (role) => {
        const name = role.name || '';
        showConfirm('ยืนยันการลบบทบาท',
            `ต้องการลบบทบาท <strong class="text-white">${roleEsc(name)}</strong> ใช่หรือไม่<br><span class="text-xs text-white/70">พนักงานที่ใช้บทบาทนี้อาจได้รับผลกระทบ และการลบย้อนกลับไม่ได้</span>`,
            async () => {
                try {
                    const response = await authFetch(`${API_BASE_URL}/roles/${role._id}`, { method: 'DELETE' });
                    const result = await response.json();
                    if (result.success) {
                        showToast(`ลบบทบาท "${name}" สำเร็จ`);
                        loadRoles();
                    } else {
                        showToast(result.message || 'ลบบทบาทไม่สำเร็จ', 'error');
                    }
                } catch (err) {
                    console.error('ลบบทบาทไม่สำเร็จ:', err);
                    showToast('เชื่อมต่อเซิร์ฟเวอร์ไม่สำเร็จ', 'error');
                }
            }, 'ลบบทบาท', 'danger');
    };

    // Load Roles
    async function loadRoles() {
        if (!rolesGrid) return;

        // ผูก listener ครั้งเดียว (loadPageView แทรก HTML ครั้งเดียว)
        if (!_roleBound) {
            _roleBound = true;
            const s = document.getElementById('roles-search');
            if (s) {
                let t = null;
                s.addEventListener('input', () => {
                    clearTimeout(t);
                    t = setTimeout(() => { _roleSearch = s.value; roleRender(); }, 200);
                });
            }
            const r = document.getElementById('btn-refresh-roles');
            if (r) r.addEventListener('click', () => loadRoles());
        }

        roleSkeleton();

        try {
            const response = await authFetch(`${API_BASE_URL}/roles`);
            const json = await response.json();

            if (json.success) {
                _roleCache = json.data || [];
                roleRender();
            } else {
                _roleCache = [];
                rolesGrid.innerHTML = roleStateBox(json.message || 'ดึงข้อมูลสิทธิ์ไม่สำเร็จ', 'text-red-400');
                roleSetText('roles-count-badge', '0 บทบาท');
                roleSetText('roles-result-count', '');
                showToast('ดึงข้อมูลสิทธิ์ไม่สำเร็จ', 'error');
            }
        } catch (error) {
            console.error('ดึงข้อมูลสิทธิ์ไม่สำเร็จ:', error);
            _roleCache = [];
            rolesGrid.innerHTML = roleStateBox('เชื่อมต่อเซิร์ฟเวอร์ไม่สำเร็จ', 'text-red-400');
            roleSetText('roles-count-badge', '0 บทบาท');
            roleSetText('roles-result-count', '');
            showToast('ดึงข้อมูลสิทธิ์ไม่สำเร็จ', 'error');
        }
    }
    window.loadRoles = loadRoles;

    const openViewRoleModal = (role) => {
        document.getElementById('v-role-name').textContent = role.name || '-';
        const listContainer = document.getElementById('v-role-perms-list');
        if (listContainer) {
            const p = role.permissions || {};
            // โมดัลนี้คือที่เดียวที่แสดงสิทธิ์ครบทุกข้อ (การ์ดในกริดโชว์เฉพาะที่เปิด)
            // สิทธิ์ที่ปิดใช้พื้นเทาธรรมดา ไม่ลดความทึบซ้ำอีก เพราะจะทำให้ตัวอักษรอ่านไม่ออก
            listContainer.innerHTML = permKeys.map(key => {
                const on = p[key];
                const tone = on
                    ? 'bg-[#42A231]/[0.12] text-[#20D500]'
                    : 'bg-[#4D4D4D]/60 text-white/70';
                return `<span class="inline-flex items-center gap-2 px-2.5 py-1 rounded-[0.375rem] text-xs font-medium ${tone}">
                    <i class="fa-solid ${on ? permIcons[key] : 'fa-xmark'} text-[10px]"></i>
                    <span>${permLabels[key]}</span>
                </span>`;
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
                roleModalTitle.innerHTML = '<i class="fa-solid fa-pen-to-square text-[#FFE169]"></i> แก้ไขบทบาท';
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
