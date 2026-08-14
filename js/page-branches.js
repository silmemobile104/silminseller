// Branch Management Logic (จัดการสาขา)
// แยกออกมาจาก script.js — โหลดแบบ dynamic เฉพาะตอนเปิดหน้า "จัดการสาขา" ครั้งแรกเท่านั้น
// พึ่งพา window.authFetch, window.showToast, window.showConfirm, window.closeDetailModal, API_BASE_URL (global จาก script.js)
(function () {
    // DOM elements ที่หน้านี้ใช้ (ดึงเองแยกจาก core เพราะ const เดิมอยู่คนละไฟล์กันแล้ว)
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
                            <button class="btn-view-branch w-8 h-8 rounded-lg bg-slate-700/50 flex items-center justify-center text-slate-400 hover:text-indigo-400 hover:bg-indigo-400/10 transition-colors" data-id="${branch._id}" title="ดูรายละเอียด">
                                <i class="fa-solid fa-eye text-sm"></i>
                            </button>
                            <button class="btn-delete-branch w-8 h-8 rounded-lg bg-slate-700/50 flex items-center justify-center text-slate-400 hover:text-red-400 hover:bg-red-400/10 transition-colors" data-id="${branch._id}">
                                <i class="fa-solid fa-trash-can text-sm"></i>
                            </button>
                        </div>
                        <div class="w-12 h-12 rounded-xl bg-cyan-500/10 flex items-center justify-center text-cyan-400 mb-4 border border-cyan-500/20">
                            <i class="fa-solid fa-store text-xl"></i>
                        </div>
                        <h4 class="text-xl font-bold text-white mb-2">${branch.name}</h4>
                        ${branch.phone ? `<p class="text-xs text-cyan-400 font-mono mb-2 flex items-center gap-1.5"><i class="fa-solid fa-phone text-[10px]"></i> ${branch.phone}</p>` : ''}
                        <p class="text-sm text-slate-400 line-clamp-2">${branch.address || 'ไม่มีรายละเอียดที่อยู่'}</p>
                    `;
                    branchGrid.appendChild(card);
                });

                // Attach event listeners for View/Edit/Delete buttons
                document.querySelectorAll('.btn-view-branch').forEach(btn => {
                    btn.addEventListener('click', (e) => {
                        const id = e.currentTarget.getAttribute('data-id');
                        const branch = json.data.find(b => b._id === id || (b._id && b._id.$oid === id));
                        if (branch) openViewBranchModal(branch);
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
    window.loadBranches = loadBranches;

    const openViewBranchModal = (branch) => {
        document.getElementById('v-branch-name').textContent = branch.name || '-';
        document.getElementById('v-branch-phone').textContent = branch.phone || 'ไม่ได้ระบุเบอร์โทรศัพท์';
        document.getElementById('v-branch-address').textContent = branch.address || 'ไม่มีรายละเอียดที่อยู่';

        const modal = document.getElementById('modal-branch-view');
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
        const editBtn = document.getElementById('edit-branch-from-view-btn');
        if (editBtn) {
            editBtn.onclick = () => {
                closeDetailModal('modal-branch-view');
                openBranchModal(branch._id, branch.name, branch.address || '', branch.phone || '');
            };
        }
    };

    // Close handlers for Branch View Modal
    const closeBranchBtn = document.getElementById('close-branch-view-btn');
    if (closeBranchBtn) closeBranchBtn.onclick = () => closeDetailModal('modal-branch-view');
    const closeBranchBtnBottom = document.getElementById('close-branch-view-btn-bottom');
    if (closeBranchBtnBottom) closeBranchBtnBottom.onclick = () => closeDetailModal('modal-branch-view');

    const openBranchModal = (id = '', name = '', address = '', phone = '') => {
        branchIdInput.value = id;
        branchNameInput.value = name;
        branchAddressInput.value = address;
        if (branchPhoneInput) branchPhoneInput.value = phone;

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
            const phone = branchPhoneInput ? branchPhoneInput.value.trim() : '';

            const originalText = submitBranchBtn.innerHTML;
            submitBranchBtn.disabled = true;
            submitBranchBtn.innerHTML = `<i class="fa-solid fa-circle-notch fa-spin"></i> กำลังบันทึก...`;

            try {
                const url = id ? `${API_BASE_URL}/branches/${id}` : `${API_BASE_URL}/branches`;
                const method = id ? 'PUT' : 'POST';

                const response = await authFetch(url, {
                    method: method,
                    headers: { 'Content-Type': 'application/json' },
                    body: JSON.stringify({ name, address, phone })
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
})();
