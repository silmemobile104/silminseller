// Employee Management Logic (จัดการพนักงาน)
// แยกออกมาจาก script.js — โหลดแบบ dynamic เฉพาะตอนเปิดหน้า "จัดการพนักงาน" ครั้งแรกเท่านั้น
// พึ่งพา window.authFetch, window.showToast, window.showConfirm, window.closeDetailModal, API_BASE_URL (global จาก script.js)
(function () {
    // ==========================================
    // Employee Management Logic (จัดการพนักงาน)
    // ==========================================

    const employeeTableBody = document.getElementById('employee-table-body');
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
    const empStatusSelect = document.getElementById('emp-status');
    const submitEmployeeBtn = document.getElementById('submit-employee-btn');
    const passwordRequiredStar = document.getElementById('password-required-star');
    const empPasswordHint = document.getElementById('emp-password-hint');

    // ---------- ตารางพนักงาน (DESIGN.md ข้อ 11.5 - 11.7) ----------
    const EMP_COLS = 6;
    let _empCache = [];
    let _empSearch = '';
    let _empRole = '';
    let _empBranch = '';
    let _empBound = false;

    const empEsc = (s) => String(s == null ? '' : s)
        .replace(/&/g, '&amp;').replace(/</g, '&lt;').replace(/>/g, '&gt;')
        .replace(/"/g, '&quot;').replace(/'/g, '&#39;');

    const empStateRow = (msg, cls = 'text-ink/50 italic') =>
        `<tr><td colspan="${EMP_COLS}" class="px-6 py-8 text-center ${cls}">${empEsc(msg)}</td></tr>`;

    const empSkeleton = (rows = 5) => {
        if (!employeeTableBody) return;
        const bar = (w) => `<div class="h-3.5 ${w} rounded-full bg-skeleton animate-pulse"></div>`;
        employeeTableBody.innerHTML = Array.from({ length: rows }).map(() => `
            <tr>
                <td class="px-6 py-4">
                    <div class="flex items-center gap-3">
                        <div class="w-9 h-9 rounded-full bg-skeleton animate-pulse flex-shrink-0"></div>
                        ${bar('w-40')}
                    </div>
                </td>
                <td class="px-6 py-4">${bar('w-24')}</td>
                <td class="px-6 py-4">${bar('w-24')}</td>
                <td class="px-6 py-4">${bar('w-28')}</td>
                <td class="px-6 py-4">${bar('w-20')}</td>
                <td class="px-6 py-4">${bar('w-16')}</td>
            </tr>`).join('');
    };

    // รูปประจำตัวสร้างในเครื่อง — เดิมยิงไปที่บริการทำ avatar ภายนอก ซึ่งส่ง "ชื่อพนักงานจริง"
    // ออกไปนอกระบบทุกแถว และทำให้หน้าเว็บมี external origin (CLAUDE.md ระบุว่าต้องเป็นศูนย์)
    // ทุกสีต้องอ่านออกบนพื้นทึบ #27272A (วัดแล้วต่ำสุด 6.45:1)
    const EMP_AVATAR_COLORS = ['#FFE169', '#20D500', '#5AB0FF', '#C79BFF', '#FF9F0A', '#22D3EE', '#FF8A8A', '#34D399'];
    const empAvatarColor = (seed) => {
        const s = String(seed || '');
        let h = 0;
        for (let i = 0; i < s.length; i++) h = (h * 31 + s.charCodeAt(i)) >>> 0;
        return EMP_AVATAR_COLORS[h % EMP_AVATAR_COLORS.length];
    };
    const empAvatar = (name, seed) => {
        const initial = (String(name || '?').trim()[0] || '?').toUpperCase();
        const c = empAvatarColor(seed || name);
        return `<div class="w-9 h-9 rounded-full flex items-center justify-center shrink-0 font-semibold text-sm"
                     style="color:${c};background-color:${c}1F;"
                     aria-hidden="true">${empEsc(initial)}</div>`;
    };

    // ป้ายตำแหน่งใช้พื้นเทาเหมือนป้ายหมวดหมู่อื่นในระบบ (ข้อ 11.6)
    // ของเดิมไล่สีแดง/ม่วง/เขียวตามตำแหน่ง ซึ่งครอบคลุมแค่ 3 จาก 6 ตำแหน่งที่มีจริง
    const empRoleBadge = (role) =>
        `<span class="px-2.5 py-1 rounded-[0.375rem] text-xs font-medium bg-chip/60 text-ink">${empEsc(role || '-')}</span>`;

    const empStatusBadge = (status) => {
        const suspended = status === 'ระงับ';
        const t = suspended
            ? { dot: 'bg-state-danger', bg: 'bg-state-danger/[0.12]', text: 'text-state-danger', label: 'ระงับ' }
            : { dot: 'bg-state-ok', bg: 'bg-state-ok-tint/[0.12]', text: 'text-state-ok', label: 'ปกติ' };
        return `<div class="inline-flex items-center gap-2 px-2.5 py-1 rounded-[0.375rem] ${t.bg}">
                    <div class="w-2 h-2 rounded-full ${t.dot}"></div>
                    <span class="${t.text} font-medium text-xs">${t.label}</span>
                </div>`;
    };

    // เติมตัวเลือกตัวกรองจากข้อมูลจริงที่โหลดมา
    const empFillFilters = () => {
        const roleSel = document.getElementById('employee-filter-role');
        const branchSel = document.getElementById('employee-filter-branch');
        if (roleSel) {
            const keep = roleSel.value;
            const roles = [...new Set(_empCache.map(e => e.role).filter(Boolean))].sort();
            roleSel.innerHTML = '<option value="">ทุกตำแหน่ง</option>' +
                roles.map(r => `<option value="${empEsc(r)}">${empEsc(r)}</option>`).join('');
            roleSel.value = keep;
        }
        if (branchSel) {
            const keep = branchSel.value;
            const map = new Map();
            _empCache.forEach(e => {
                if (e.branch_id && e.branch_id.name) map.set(String(e.branch_id._id || e.branch_id), e.branch_id.name);
            });
            branchSel.innerHTML = '<option value="">ทุกสาขา</option>' +
                [...map.entries()].sort((a, b) => a[1].localeCompare(b[1], 'th'))
                    .map(([id, name]) => `<option value="${empEsc(id)}">${empEsc(name)}</option>`).join('');
            branchSel.value = keep;
        }
    };

    // ชิปตัวกรองที่ใช้อยู่ (ข้อ 11.5 — ลบได้เฉพาะตอนคลิกกากบาท)
    const empRenderChips = () => {
        const box = document.getElementById('employee-active-filters');
        if (!box) return;
        box.innerHTML = '';

        const branchSel = document.getElementById('employee-filter-branch');
        const chips = [];
        if (_empSearch.trim()) chips.push({ key: 'search', label: `ค้นหา: ${_empSearch.trim()}` });
        if (_empRole) chips.push({ key: 'role', label: `ตำแหน่ง: ${_empRole}` });
        if (_empBranch) {
            const opt = branchSel ? branchSel.querySelector(`option[value="${_empBranch}"]`) : null;
            chips.push({ key: 'branch', label: `สาขา: ${opt ? opt.textContent : _empBranch}` });
        }

        const clearOne = (key) => {
            if (key === 'search') {
                _empSearch = '';
                const s = document.getElementById('employee-search');
                if (s) s.value = '';
            } else if (key === 'role') {
                _empRole = '';
                const r = document.getElementById('employee-filter-role');
                if (r) r.value = '';
            } else {
                _empBranch = '';
                if (branchSel) branchSel.value = '';
            }
            empRender();
        };

        chips.forEach(c => {
            const chip = document.createElement('button');
            chip.type = 'button';
            chip.className = 'elev-card px-4 py-2.5 rounded-xl bg-panel/40' +
                'text-ink text-sm font-medium transition-colors flex items-center gap-2 cursor-pointer';
            chip.innerHTML = `<span>${empEsc(c.label)}</span><i class="fa-solid fa-xmark text-[10px] opacity-80"></i>`;
            chip.setAttribute('aria-label', `ลบตัวกรอง ${c.label}`);
            chip.addEventListener('click', (e) => {
                if (!e.target.closest('i.fa-xmark')) return;
                clearOne(c.key);
            });
            box.appendChild(chip);
        });

        // ปุ่มล้างทั้งหมดโผล่เมื่อมีตัวกรองมากกว่า 1 ตัวเท่านั้น
        if (chips.length > 1) {
            const clearAll = document.createElement('button');
            clearAll.type = 'button';
            clearAll.className = 'px-2.5 py-1 bg-red-500/10 hover:bg-red-500/15 text-red-300 ' +
                'rounded-full text-xs font-medium ring-1 ring-red-500/30 transition-colors cursor-pointer';
            clearAll.textContent = 'ล้างทั้งหมด';
            clearAll.addEventListener('click', () => {
                _empSearch = ''; _empRole = ''; _empBranch = '';
                ['employee-search', 'employee-filter-role', 'employee-filter-branch'].forEach(id => {
                    const el = document.getElementById(id);
                    if (el) el.value = '';
                });
                empRender();
            });
            box.appendChild(clearAll);
        }
    };

    const empRender = () => {
        if (!employeeTableBody) return;
        empRenderChips();

        const q = _empSearch.trim().toLowerCase();
        const rows = _empCache.filter(e => {
            if (_empRole && e.role !== _empRole) return false;
            if (_empBranch) {
                const bId = e.branch_id ? String(e.branch_id._id || e.branch_id) : '';
                if (bId !== _empBranch) return false;
            }
            if (!q) return true;
            return [e.name, e.emp_id, e.username, e.role, e.branch_id && e.branch_id.name]
                .filter(Boolean).join(' ').toLowerCase().includes(q);
        });

        const countEl = document.getElementById('employee-result-count');
        if (countEl) countEl.textContent = _empCache.length ? `แสดง ${rows.length} จาก ${_empCache.length} รายการ` : '';
        if (employeeCountBadge) employeeCountBadge.textContent = `${_empCache.length} คน`;

        if (!rows.length) {
            employeeTableBody.innerHTML = empStateRow(_empCache.length
                ? 'ไม่พบพนักงานที่ตรงกับตัวกรอง'
                : 'ยังไม่มีข้อมูลพนักงานในระบบ');
            return;
        }

        employeeTableBody.innerHTML = rows.map(emp => `
            <tr class="hover:bg-divider transition-colors">
                <td class="px-6 py-4">
                    <div class="flex items-center gap-3">
                        ${empAvatar(emp.name, emp.emp_id || emp._id)}
                        <p class="font-medium text-ink">${empEsc(emp.name || '-')}</p>
                    </div>
                </td>
                <td class="px-6 py-4"><span class="font-mono font-semibold text-accent-ink">${empEsc(emp.emp_id || '-')}</span></td>
                <td class="px-6 py-4">${empRoleBadge(emp.role)}</td>
                <td class="px-6 py-4 text-ink">${empEsc(emp.branch_id && emp.branch_id.name ? emp.branch_id.name : '-')}</td>
                <td class="px-6 py-4">${empStatusBadge(emp.status)}</td>
                <td class="px-6 py-4 text-right">
                    <div class="flex items-center justify-end gap-1">
                        <button type="button" class="view-emp-btn text-ink hover:text-indigo-400 transition-colors p-2 cursor-pointer"
                            data-id="${empEsc(emp._id)}" title="ดูรายละเอียด"
                            aria-label="ดูรายละเอียดพนักงาน ${empEsc(emp.name || '')}">
                            <i class="fa-solid fa-eye"></i>
                        </button>
                        <button type="button" class="delete-emp-btn text-ink hover:text-red-400 transition-colors p-2 cursor-pointer"
                            data-id="${empEsc(emp._id)}" title="ลบพนักงาน"
                            aria-label="ลบพนักงาน ${empEsc(emp.name || '')}">
                            <i class="fa-solid fa-trash"></i>
                        </button>
                    </div>
                </td>
            </tr>`).join('');

        const byId = (id) => rows.find(e => String(e._id) === String(id));
        employeeTableBody.querySelectorAll('.view-emp-btn').forEach(b =>
            b.addEventListener('click', () => { const e = byId(b.dataset.id); if (e) openViewEmployeeModal(e); }));
        employeeTableBody.querySelectorAll('.delete-emp-btn').forEach(b =>
            b.addEventListener('click', () => { const e = byId(b.dataset.id); if (e) deleteEmployee(e._id, e.name); }));
    };

    // Load employees from API
    async function loadEmployees() {
        if (!employeeTableBody) return;

        // ผูก listener ครั้งเดียว (loadPageView แทรก HTML ครั้งเดียว)
        if (!_empBound) {
            _empBound = true;
            const s = document.getElementById('employee-search');
            if (s) {
                let t = null;
                s.addEventListener('input', () => {
                    clearTimeout(t);
                    t = setTimeout(() => { _empSearch = s.value; empRender(); }, 200);
                });
            }
            const r = document.getElementById('employee-filter-role');
            if (r) r.addEventListener('change', () => { _empRole = r.value; empRender(); });
            const b = document.getElementById('employee-filter-branch');
            if (b) b.addEventListener('change', () => { _empBranch = b.value; empRender(); });
        }

        empSkeleton();

        try {
            const response = await authFetch(`${API_BASE_URL}/employees`);
            const json = await response.json();

            if (json.success) {
                _empCache = json.data || [];
                empFillFilters();
                empRender();
            } else {
                _empCache = [];
                employeeTableBody.innerHTML = empStateRow(json.message || 'ดึงข้อมูลพนักงานไม่สำเร็จ', 'text-red-400');
                if (employeeCountBadge) employeeCountBadge.textContent = '0 คน';
                const c = document.getElementById('employee-result-count');
                if (c) c.textContent = '';
                showToast('ดึงข้อมูลพนักงานไม่สำเร็จ', 'error');
            }
        } catch (error) {
            console.error('เกิดข้อผิดพลาดในการดึงข้อมูลพนักงาน:', error);
            _empCache = [];
            employeeTableBody.innerHTML = empStateRow('เชื่อมต่อเซิร์ฟเวอร์ไม่สำเร็จ', 'text-red-400');
            if (employeeCountBadge) employeeCountBadge.textContent = '0 คน';
            const c = document.getElementById('employee-result-count');
            if (c) c.textContent = '';
            showToast('ดึงข้อมูลพนักงานไม่สำเร็จ', 'error');
        }
    }
    window.loadEmployees = loadEmployees;

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

    const openViewEmployeeModal = (emp) => {
        document.getElementById('v-employee-name').textContent = emp.name || '-';
        document.getElementById('v-employee-username').textContent = emp.username || emp.emp_id || '-';

        const branchName = emp.branch_id ? emp.branch_id.name : '-';
        document.getElementById('v-employee-branch').textContent = branchName;

        // ป้ายตำแหน่ง/สถานะในโมดัลใช้ตัวสร้างชุดเดียวกับในตาราง จะได้ไม่มีสองหน้าตา
        const roleContainer = document.getElementById('v-employee-role');
        if (roleContainer) roleContainer.innerHTML = empRoleBadge(emp.role);

        const statusContainer = document.getElementById('v-employee-status');
        if (statusContainer) statusContainer.innerHTML = empStatusBadge(emp.status);

        const modal = document.getElementById('modal-employee-view');
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
        const editBtn = document.getElementById('edit-employee-from-view-btn');
        if (editBtn) {
            editBtn.onclick = () => {
                closeDetailModal('modal-employee-view');
                openEmployeeModal(emp);
            };
        }
    };

    // Close handlers for Employee View Modal
    const closeEmployeeBtn = document.getElementById('close-employee-view-btn');
    if (closeEmployeeBtn) closeEmployeeBtn.onclick = () => closeDetailModal('modal-employee-view');
    const closeEmployeeBtnBottom = document.getElementById('close-employee-view-btn-bottom');
    if (closeEmployeeBtnBottom) closeEmployeeBtnBottom.onclick = () => closeDetailModal('modal-employee-view');

    // Open Employee Modal
    const openEmployeeModal = (emp = null) => {
        if (!employeeModal) return;

        loadBranchesForEmployeeModal().then(() => {
            loadRolesForEmployeeModal().then(() => {
                const statusContainer = document.getElementById('emp-status-container');
                if (emp) {
                    // Edit mode
                    employeeModalTitle.innerHTML = `<i class="fa-solid fa-pen-to-square text-accent-ink"></i> แก้ไขข้อมูลพนักงาน`;
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
                    if (empStatusSelect) empStatusSelect.value = emp.status || 'ปกติ';
                    if (statusContainer) statusContainer.classList.remove('hidden'); // Show status toggle on edit
                } else {
                    // Add mode
                    employeeModalTitle.innerHTML = `<i class="fa-solid fa-user-plus text-accent-ink"></i> เพิ่มพนักงานใหม่`;
                    employeeEditId.value = '';
                    employeeForm.reset();
                    empPasswordInput.setAttribute('required', '');
                    if (passwordRequiredStar) passwordRequiredStar.classList.remove('hidden');
                    if (empPasswordHint) empPasswordHint.classList.add('hidden');
                    if (empStatusSelect) empStatusSelect.value = 'ปกติ';
                    if (statusContainer) statusContainer.classList.add('hidden'); // Hide status toggle on add
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
            const status = empStatusSelect ? empStatusSelect.value : 'ปกติ';

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

                const body = { name, emp_id, role, branch_id, status };
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

})();
