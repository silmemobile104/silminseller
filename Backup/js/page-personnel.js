// Employee Management Logic (จัดการพนักงาน)
// แยกออกมาจาก script.js — โหลดแบบ dynamic เฉพาะตอนเปิดหน้า "จัดการพนักงาน" ครั้งแรกเท่านั้น
// พึ่งพา window.authFetch, window.showToast, window.showConfirm, window.closeDetailModal, API_BASE_URL (global จาก script.js)
(function () {
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
    const empStatusSelect = document.getElementById('emp-status');
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
    window.loadEmployees = loadEmployees;

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
                    <td colspan="6" class="px-6 py-8 text-center text-body-muted italic">
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
            row.className = 'hover:bg-surface-chip/40 transition-colors';

            const branchName = emp.branch_id ? emp.branch_id.name : '-';
            const nameForAvatar = encodeURIComponent(emp.name || 'User');

            // Role badge colors
            let roleClass = 'bg-surface-chip text-body-muted border-hairline';
            if (emp.role === 'แอดมิน') roleClass = 'bg-red-500/10 text-red-400 border-red-500/20';
            else if (emp.role === 'ผู้จัดการ') roleClass = 'bg-violet-500/10 text-violet-400 border-violet-500/20';
            else if (emp.role === 'พนักงานขาย') roleClass = 'bg-emerald-500/10 text-emerald-400 border-emerald-500/20';

            // Status badge colors
            const isSuspended = emp.status === 'ระงับ';
            const statusClass = isSuspended
                ? 'bg-red-500/10 text-red-400 border-red-500/20'
                : 'bg-emerald-500/10 text-emerald-400 border-emerald-500/20';
            const statusText = isSuspended ? 'ระงับ' : 'ปกติ';
            const statusBadge = `<span class="px-2.5 py-1 ${statusClass} rounded-md text-xs font-medium border">${statusText}</span>`;

            row.innerHTML = `
                <td class="px-6 py-4">
                    <div class="flex items-center gap-3">
                        <div class="w-8 h-8 rounded-full bg-surface-chip overflow-hidden flex-shrink-0">
                            <img src="https://ui-avatars.com/api/?name=${nameForAvatar}&background=0D8ABC&color=fff"
                                alt="${emp.name}" class="w-full h-full object-cover">
                        </div>
                        <p class="font-medium text-ink">${emp.name}</p>
                    </div>
                </td>
                <td class="px-6 py-4">
                    <span class="text-body-muted font-mono text-sm bg-surface-chip px-2 py-1 rounded border border-hairline">${emp.emp_id}</span>
                </td>
                <td class="px-6 py-4">
                    <span class="px-2.5 py-1 ${roleClass} rounded-md text-xs font-medium border">${emp.role}</span>
                </td>
                <td class="px-6 py-4 text-body-muted">${branchName}</td>
                <td class="px-6 py-4 text-center">${statusBadge}</td>
                <td class="px-6 py-4 text-right">
                    <div class="flex items-center justify-end gap-1">
                        <button class="view-emp-btn text-body-muted hover:text-primary transition-colors p-2" data-id="${emp._id}" title="ดูรายละเอียด"><i class="fa-solid fa-eye"></i></button>
                        <button class="delete-emp-btn text-body-muted hover:text-red-400 transition-colors p-2" data-id="${emp._id}"><i class="fa-solid fa-trash"></i></button>
                    </div>
                </td>
            `;
            employeeTableBody.appendChild(row);

            // Attach edit listener
            row.querySelector('.view-emp-btn').addEventListener('click', () => openViewEmployeeModal(emp));
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

    const openViewEmployeeModal = (emp) => {
        document.getElementById('v-employee-name').textContent = emp.name || '-';
        document.getElementById('v-employee-username').textContent = emp.username || emp.emp_id || '-';

        const branchName = emp.branch_id ? emp.branch_id.name : '-';
        document.getElementById('v-employee-branch').textContent = branchName;

        // Role badge colors
        let roleClass = 'bg-surface-chip text-body-muted border-hairline';
        if (emp.role === 'แอดมิน') roleClass = 'bg-red-500/10 text-red-400 border-red-500/20';
        else if (emp.role === 'ผู้จัดการ') roleClass = 'bg-violet-500/10 text-violet-400 border-violet-500/20';
        else if (emp.role === 'พนักงานขาย') roleClass = 'bg-emerald-500/10 text-emerald-400 border-emerald-500/20';

        const roleContainer = document.getElementById('v-employee-role');
        if (roleContainer) {
            roleContainer.innerHTML = `<span class="px-2.5 py-1 ${roleClass} border rounded-lg text-xs font-bold">${emp.role || '-'}</span>`;
        }

        const statusContainer = document.getElementById('v-employee-status');
        if (statusContainer) {
            const isSuspended = emp.status === 'ระงับ';
            const statusClass = isSuspended
                ? 'bg-red-500/10 text-red-400 border-red-500/20'
                : 'bg-emerald-500/10 text-emerald-400 border-emerald-500/20';
            const statusText = isSuspended ? 'ระงับ (Suspended)' : 'ปกติ (Active)';
            statusContainer.innerHTML = `<span class="px-2.5 py-1 ${statusClass} border rounded-lg text-xs font-bold">${statusText}</span>`;
        }

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
                    employeeModalTitle.innerHTML = `<i class="fa-solid fa-pen-to-square text-primary"></i> แก้ไขข้อมูลพนักงาน`;
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
                    employeeModalTitle.innerHTML = `<i class="fa-solid fa-user-plus text-primary"></i> เพิ่มพนักงานใหม่`;
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
