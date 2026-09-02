// Branch Management Logic (จัดการสาขา)
// แยกออกมาจาก script.js — โหลดแบบ dynamic เฉพาะตอนเปิดหน้า "จัดการสาขา" ครั้งแรกเท่านั้น
// พึ่งพา window.authFetch, window.showToast, window.showConfirm, window.closeDetailModal, API_BASE_URL (global จาก script.js)
(function () {
    // DOM elements ที่หน้านี้ใช้ (ดึงเองแยกจาก core เพราะ const เดิมอยู่คนละไฟล์กันแล้ว)
    const btnAddBranch = document.getElementById('btn-add-branch');
    const branchGrid = document.getElementById('branch-grid');
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

    // ---------- กริดสาขา (DESIGN.md ข้อ 11.3 - 11.7) ----------
    let _brCache = [];
    let _brSearch = '';
    let _brBound = false;

    // ชื่อ/ที่อยู่/เบอร์โทรมาจากฐานข้อมูลแล้วถูกยัดเข้า innerHTML
    // ของเดิมใส่ดิบๆ ถ้าค่าไหนมี < หรือ " ปนมา จะทำให้การ์ดเพี้ยนหรือหน้าพัง
    const brEsc = (s) => String(s == null ? '' : s)
        .replace(/&/g, '&amp;').replace(/</g, '&lt;').replace(/>/g, '&gt;')
        .replace(/"/g, '&quot;').replace(/'/g, '&#39;');

    const brStateBox = (msg, cls = 'text-white/50 italic') =>
        `<div class="col-span-full px-6 py-10 text-center ${cls}">${brEsc(msg)}</div>`;

    const brSkeleton = (n = 6) => {
        if (!branchGrid) return;
        const bar = (w) => `<div class="h-3.5 ${w} rounded-full bg-[#5c5c5c] animate-pulse"></div>`;
        branchGrid.innerHTML = Array.from({ length: n }).map(() => `
            <div class="bg-[#27272A] border border-[#3F3F46] rounded-xl p-5">
                <div class="flex items-start gap-3">
                    <div class="w-11 h-11 rounded-full bg-[#5c5c5c] animate-pulse shrink-0"></div>
                    <div class="flex-1 space-y-2 pt-1">
                        ${bar('w-32')}
                        ${bar('w-24')}
                    </div>
                </div>
                <div class="mt-4 space-y-2">${bar('w-full')}${bar('w-3/4')}</div>
            </div>`).join('');
    };

    const brSetText = (id, text) => {
        const el = document.getElementById(id);
        if (el) el.textContent = text;
    };

    // ชิปตัวกรองที่ใช้อยู่ (ข้อ 11.5 — ลบได้เฉพาะตอนคลิกกากบาท)
    const brRenderChips = () => {
        const box = document.getElementById('branch-active-filters');
        if (!box) return;
        box.innerHTML = '';
        if (!_brSearch.trim()) return;

        const chip = document.createElement('button');
        chip.type = 'button';
        chip.className = 'px-4 py-2.5 rounded-xl bg-[#4D4D4D]/40 border border-[#3F3F46] ' +
            'text-white text-sm font-medium transition-colors flex items-center gap-2 cursor-pointer';
        chip.innerHTML = `<span>ค้นหา: ${brEsc(_brSearch.trim())}</span><i class="fa-solid fa-xmark text-[10px] opacity-80"></i>`;
        chip.setAttribute('aria-label', `ลบตัวกรอง ค้นหา ${_brSearch.trim()}`);
        chip.addEventListener('click', (e) => {
            if (!e.target.closest('i.fa-xmark')) return;
            _brSearch = '';
            const s = document.getElementById('branch-search');
            if (s) s.value = '';
            brRender();
        });
        box.appendChild(chip);
    };

    const brRender = () => {
        if (!branchGrid) return;
        brRenderChips();

        const q = _brSearch.trim().toLowerCase();
        const rows = _brCache.filter(b => !q ||
            [b.name, b.address, b.phone].filter(Boolean).join(' ').toLowerCase().includes(q));

        brSetText('branch-count-badge', `${_brCache.length} สาขา`);
        brSetText('branch-result-count', _brCache.length ? `แสดง ${rows.length} จาก ${_brCache.length} รายการ` : '');

        if (!rows.length) {
            branchGrid.innerHTML = brStateBox(_brCache.length
                ? 'ไม่พบสาขาที่ตรงกับคำค้นหา'
                : 'ยังไม่มีข้อมูลสาขา กด "เพิ่มสาขาใหม่" เพื่อเริ่มใช้งาน');
            return;
        }

        branchGrid.innerHTML = rows.map(branch => `
            <div class="bg-[#27272A] border border-[#3F3F46] rounded-xl p-5 hover:border-[#FFE169] transition-colors flex flex-col">
                <div class="flex items-start gap-3">
                    <div class="w-11 h-11 rounded-full flex items-center justify-center shrink-0"
                         style="color:#FFE169;background-color:#27272A;border:1px solid #FFE16959;">
                        <i class="fa-solid fa-store text-lg"></i>
                    </div>
                    <div class="min-w-0 flex-1">
                        <h4 class="text-base font-semibold text-white truncate" title="${brEsc(branch.name)}">${brEsc(branch.name)}</h4>
                        ${branch.phone
                ? `<p class="text-xs text-white/70 font-mono mt-0.5 flex items-center gap-1.5">
                                   <i class="fa-solid fa-phone text-[10px]"></i> ${brEsc(branch.phone)}</p>`
                : '<p class="text-xs text-white/50 italic mt-0.5">ไม่ได้ระบุเบอร์โทรศัพท์</p>'}
                    </div>
                    <!-- ปุ่มต้องเห็นตลอด ของเดิมซ่อนไว้แล้วให้โผล่ตอนเอาเมาส์ชี้การ์ด
                         ซึ่งคนใช้คีย์บอร์ดโฟกัสแล้วมองไม่เห็น และบนมือถือไม่มี hover เลย -->
                    <div class="flex items-center gap-1 shrink-0">
                        <button type="button" class="btn-view-branch text-white hover:text-indigo-400 transition-colors p-2 cursor-pointer"
                            data-id="${brEsc(branch._id)}" title="ดูรายละเอียด"
                            aria-label="ดูรายละเอียดสาขา ${brEsc(branch.name)}">
                            <i class="fa-solid fa-eye"></i>
                        </button>
                        <button type="button" class="btn-delete-branch text-white hover:text-red-400 transition-colors p-2 cursor-pointer"
                            data-id="${brEsc(branch._id)}" title="ลบสาขา"
                            aria-label="ลบสาขา ${brEsc(branch.name)}">
                            <i class="fa-solid fa-trash-can"></i>
                        </button>
                    </div>
                </div>
                <p class="text-sm text-white/70 mt-4 flex items-start gap-2 flex-1">
                    <i class="fa-solid fa-location-dot text-[11px] mt-1 shrink-0"></i>
                    <span class="line-clamp-2">${branch.address ? brEsc(branch.address) : '<span class="text-white/50 italic">ไม่มีรายละเอียดที่อยู่</span>'}</span>
                </p>
            </div>`).join('');

        const byId = (id) => rows.find(b => String(b._id) === String(id));
        branchGrid.querySelectorAll('.btn-view-branch').forEach(btn =>
            btn.addEventListener('click', () => { const b = byId(btn.dataset.id); if (b) openViewBranchModal(b); }));
        branchGrid.querySelectorAll('.btn-delete-branch').forEach(btn =>
            btn.addEventListener('click', () => { const b = byId(btn.dataset.id); if (b) deleteBranch(b._id, b.name); }));
    };

    // การลบย้อนไม่ได้ ต้องผ่าน showConfirm() และบอกชื่อสาขาที่จะลบให้ชัด (ข้อ 11.12 ข้อ 11)
    const deleteBranch = (id, name) => {
        showConfirm('ยืนยันการลบสาขา',
            `ต้องการลบสาขา <strong class="text-white">${brEsc(name || '')}</strong> ใช่หรือไม่<br><span class="text-xs text-white/70">ข้อมูลนี้ไม่สามารถกู้คืนได้</span>`,
            async () => {
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
            }, 'ลบสาขา', 'danger');
    };

    async function loadBranches() {
        if (!branchGrid) return;

        // ผูก listener ครั้งเดียว (loadPageView แทรก HTML ครั้งเดียว)
        if (!_brBound) {
            _brBound = true;
            const s = document.getElementById('branch-search');
            if (s) {
                let t = null;
                s.addEventListener('input', () => {
                    clearTimeout(t);
                    t = setTimeout(() => { _brSearch = s.value; brRender(); }, 200);
                });
            }
            const r = document.getElementById('btn-refresh-branches');
            if (r) r.addEventListener('click', () => loadBranches());
        }

        brSkeleton();

        try {
            const response = await authFetch(`${API_BASE_URL}/branches`);
            const json = await response.json();

            if (json.success) {
                _brCache = json.data || [];
                brRender();
            } else {
                _brCache = [];
                branchGrid.innerHTML = brStateBox(json.message || 'ดึงข้อมูลสาขาไม่สำเร็จ', 'text-red-400');
                brSetText('branch-count-badge', '0 สาขา');
                brSetText('branch-result-count', '');
                showToast('ดึงข้อมูลสาขาไม่สำเร็จ', 'error');
            }
        } catch (error) {
            console.error('Error loading branches:', error);
            _brCache = [];
            branchGrid.innerHTML = brStateBox('เชื่อมต่อเซิร์ฟเวอร์ไม่สำเร็จ', 'text-red-400');
            brSetText('branch-count-badge', '0 สาขา');
            brSetText('branch-result-count', '');
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
            branchModalTitle.innerHTML = `<i class="fa-solid fa-pen-to-square text-[#FFE169]"></i> แก้ไขสาขา`;
        } else {
            branchModalTitle.innerHTML = `<i class="fa-solid fa-store text-[#FFE169]"></i> เพิ่มสาขาใหม่`;
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
