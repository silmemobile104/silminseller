// Member Management (จัดการสมาชิก)
// แยกออกมาจาก script.js — โหลดแบบ dynamic เฉพาะตอนเปิดหน้า "สมาชิก" ครั้งแรกเท่านั้น
// พึ่งพา window.authFetch, window.showToast, window.showConfirm, window.closeDetailModal, compressImage, API_BASE_URL (global จาก script.js)
(function () {
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
    window.loadMembers = loadMembers;

    const renderMemberTable = (members) => {
        const tbody = document.getElementById('member-table-body');
        if (!tbody) return;
        tbody.innerHTML = '';

        if (members.length === 0) {
            tbody.innerHTML = `
                <tr>
                    <td colspan="8" class="px-6 py-12 text-center">
                        <div class="flex flex-col items-center text-body-muted">
                            <i class="fa-solid fa-users text-4xl mb-3 text-ink-muted-48"></i>
                            <p class="font-medium text-body-muted">ยังไม่มีข้อมูลสมาชิก</p>
                            <p class="text-sm text-ink-muted-48 mt-1">กดปุ่ม "เพิ่มสมาชิก" เพื่อเริ่มต้น</p>
                        </div>
                    </td>
                </tr>
            `;
            return;
        }

        members.forEach(m => {
            const row = document.createElement('tr');
            row.className = 'hover:bg-surface-chip/40 transition-colors';

            const fullName = `${m.prefix || ''} ${m.first_name || ''} ${m.last_name || ''}`.trim();
            const citizenDisplay = m.citizen_id ? m.citizen_id.replace(/(\d{1})(\d{4})(\d{5})(\d{2})(\d{1})/, '$1-$2-$3-$4-$5') : '-';
            const dateStr = m.createdAt ? new Date(m.createdAt).toLocaleDateString('th-TH', { year: 'numeric', month: 'short', day: 'numeric' }) : '-';

            const photoHtml = m.photo
                ? `<img src="data:image/jpeg;base64,${m.photo}" class="w-10 h-10 rounded-sm object-cover border border-hairline">`
                : `<div class="w-10 h-10 rounded-sm bg-surface-chip flex items-center justify-center text-body-muted"><i class="fa-solid fa-user"></i></div>`;

            const referralBadge = m.referral_source
                ? `<span class="px-2 py-1 bg-surface-chip text-body-muted rounded-md text-xs font-medium border border-hairline">${m.referral_source}</span>`
                : '<span class="text-ink-muted-48">-</span>';

            row.innerHTML = `
                <td class="px-6 py-4">${photoHtml}</td>
                <td class="px-6 py-4 font-bold text-ink font-mono">${m.member_number || '-'}</td>
                <td class="px-6 py-4">
                    <p class="font-medium text-ink">${fullName}</p>
                    ${m.first_name_en || m.last_name_en ? `<p class="text-xs text-body-muted">${(m.first_name_en || '')} ${(m.last_name_en || '')}</p>` : ''}
                </td>
                <td class="px-6 py-4 text-body-muted font-mono text-xs">${citizenDisplay}</td>
                <td class="px-6 py-4 text-body-muted">${m.phone || '-'}</td>
                <td class="px-6 py-4">${referralBadge}</td>
                <td class="px-6 py-4 text-ink-muted-48 text-sm">${dateStr}</td>
                <td class="px-6 py-4 text-right">
                    <div class="flex items-center justify-end gap-1">
                        <button class="view-member-btn text-body-muted hover:text-primary transition-colors p-2" data-id="${m._id}" title="ดูรายละเอียด"><i class="fa-solid fa-eye"></i></button>
                        <button class="delete-member-btn text-body-muted hover:text-red-400 transition-colors p-2" data-id="${m._id}"><i class="fa-solid fa-trash"></i></button>
                    </div>
                </td>
            `;
            tbody.appendChild(row);

            row.querySelector('.view-member-btn').addEventListener('click', () => openViewMemberModal(m));
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
            photoPreview.innerHTML = `<div class="text-center text-body-muted p-2"><i class="fa-solid fa-user-large text-2xl mb-2 block opacity-50"></i><p class="text-[10px]">รูปหลังอ่านบัตร</p></div>`;
        }

        // Reset Card Front Photo state and preview
        currentCardFrontPhotoBase64 = '';
        currentCardFrontPhotoUrl = '';
        const cardFrontContainer = document.getElementById('member-card-front-container');
        if (cardFrontContainer) {
            cardFrontContainer.innerHTML = `<div id="member-card-front-placeholder" class="text-center text-body-muted p-3 group-hover:text-primary transition-colors duration-300"><i class="fa-solid fa-cloud-arrow-up text-3xl mb-2 block opacity-60 group-hover:opacity-100 transform group-hover:-translate-y-1 transition-all duration-300"></i><p class="text-xs font-medium leading-tight">คลิกเลือกรูปหน้าบัตร</p></div>`;
        }
        const cardFrontInput = document.getElementById('member-card-front-input');
        if (cardFrontInput) cardFrontInput.value = '';

        // Reset modal title
        const title = document.getElementById('member-modal-title');
        if (title) title.innerHTML = `<div class="w-10 h-10 rounded-sm bg-surface-chip flex items-center justify-center"><i class="fa-solid fa-address-card text-ink"></i></div> เพิ่มสมาชิกใหม่`;
    };

    // Store the current member's photo for saving
    let currentMemberPhoto = '';
    let currentCardFrontPhotoBase64 = '';
    let currentCardFrontPhotoUrl = '';

    const openViewMemberModal = (m) => {
        document.getElementById('v-member-num').textContent = m.member_number || '-';

        const fullNameTh = `${m.prefix || ''} ${m.first_name || ''} ${m.last_name || ''}`.trim();
        const fullNameEn = `${m.first_name_en || ''} ${m.last_name_en || ''}`.trim();
        document.getElementById('v-member-name-th').textContent = fullNameTh || '-';
        document.getElementById('v-member-name-en').textContent = fullNameEn || '-';

        const citizenDisplay = m.citizen_id ? m.citizen_id.replace(/(\d{1})(\d{4})(\d{5})(\d{2})(\d{1})/, '$1-$2-$3-$4-$5') : '-';
        document.getElementById('v-member-citizen').textContent = citizenDisplay;
        document.getElementById('v-member-phone').textContent = m.phone || '-';
        document.getElementById('v-member-email').textContent = m.email || '-';

        const addressText = [
            m.address,
            m.sub_district ? `ต. ${m.sub_district}` : '',
            m.district ? `อ. ${m.district}` : '',
            m.province ? `จ. ${m.province}` : '',
            m.postal_code
        ].filter(Boolean).join(' ');

        document.getElementById('v-member-address').textContent = addressText.trim() || m.raw_address || '-';
        document.getElementById('v-member-referral').textContent = m.referral_source || '-';

        const dateStr = m.createdAt ? new Date(m.createdAt).toLocaleDateString('th-TH', { year: 'numeric', month: 'long', day: 'numeric' }) : '-';
        document.getElementById('v-member-date').textContent = dateStr;

        const photoContainer = document.getElementById('v-member-photo-container');
        if (photoContainer) {
            if (m.photo) {
                photoContainer.innerHTML = `<img src="data:image/jpeg;base64,${m.photo}" class="w-full h-full object-cover">`;
            } else {
                photoContainer.innerHTML = `<i class="fa-solid fa-user text-4xl text-body-muted"></i>`;
            }
        }

        const modal = document.getElementById('modal-member-view');
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
        const editBtn = document.getElementById('edit-member-from-view-btn');
        if (editBtn) {
            editBtn.onclick = () => {
                closeDetailModal('modal-member-view');
                openMemberModalForEdit(m);
            };
        }
    };

    // Close handlers for Member View Modal
    const closeMemberBtn = document.getElementById('close-member-view-btn');
    if (closeMemberBtn) closeMemberBtn.onclick = () => closeDetailModal('modal-member-view');
    const closeMemberBtnBottom = document.getElementById('close-member-view-btn-bottom');
    if (closeMemberBtnBottom) closeMemberBtnBottom.onclick = () => closeDetailModal('modal-member-view');

    const openMemberModalForEdit = (member) => {
        resetMemberForm();
        const title = document.getElementById('member-modal-title');
        if (title) {
            const memberTag = member.member_number ? `<span class="text-xs bg-surface-chip border border-hairline text-ink px-2.5 py-1 rounded-md font-mono font-bold ml-2 tracking-wider">${member.member_number}</span>` : '';
            title.innerHTML = `<div class="w-10 h-10 rounded-sm bg-surface-chip flex items-center justify-center"><i class="fa-solid fa-pen text-ink"></i></div> แก้ไขข้อมูลสมาชิก ${memberTag}`;
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
            cardFrontContainer.innerHTML = `<img src="${member.card_front_photo}" referrerpolicy="no-referrer" class="w-full h-full object-cover">`;
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
                const reader = new FileReader();
                reader.onload = async (event) => {
                    const rawBase64 = event.target.result;
                    try {
                        // Compress the front card image before sending
                        currentCardFrontPhotoBase64 = await compressImage(rawBase64, 1024, 1024, 0.7);
                    } catch (err) {
                        console.error('Image compression error:', err);
                        currentCardFrontPhotoBase64 = rawBase64; // Fallback
                    }
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

})();
