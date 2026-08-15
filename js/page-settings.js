// Master Data Settings Logic (การตั้งค่าระบบ)
// แยกออกมาจาก script.js — โหลดแบบ dynamic เฉพาะตอนเปิดหน้า "การตั้งค่าระบบ" ครั้งแรกเท่านั้น
// พึ่งพา window.authFetch, window.showToast, window.showConfirm, window.showPrompt, window.fetchMasterData,
// window.masterDataCache, API_BASE_URL (global จาก script.js)
(function () {
    // DOM elements ที่หน้านี้ใช้ (ดึงเองแยกจาก core เพราะ const เดิมอยู่คนละไฟล์กันแล้ว)
    const settingsTabBtns = document.querySelectorAll('.settings-tab-btn');
    const masterDataInput = document.getElementById('master-data-input');
    const masterDataCodeInput = document.getElementById('master-data-code-input');
    const btnAddMasterData = document.getElementById('btn-add-master-data');
    const masterDataList = document.getElementById('master-data-list');
    const masterDataEmpty = document.getElementById('master-data-empty');
    let currentSettingsTab = 'productname';

    // Master Data Settings Logic
    function renderSettingsList() {
        if (!masterDataList) return;

        if (masterDataCodeInput) {
            if (currentSettingsTab === 'productname') {
                masterDataCodeInput.classList.remove('hidden');
            } else {
                masterDataCodeInput.classList.add('hidden');
            }
        }

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
                case 'financecompany': dataArray = window.masterDataCache.financeCompanies || []; break;
            }
        }

        masterDataList.innerHTML = '';

        if (dataArray.length === 0) {
            masterDataEmpty.classList.remove('hidden');
        } else {
            masterDataEmpty.classList.add('hidden');

            dataArray.forEach(item => {
                const card = document.createElement('div');
                card.className = 'bg-surface-tile-3 border border-hairline rounded-sm p-4 flex items-center justify-between group hover:border-primary/40 transition-colors';

                let displayName = item.name;
                let dataCodeAttr = '';
                if (currentSettingsTab === 'productname') {
                    dataCodeAttr = `data-code="${item.code || ''}"`;
                    if (item.code) {
                        displayName = `${item.name} <span class="text-xs text-body-muted font-mono ml-1 bg-surface-chip px-1.5 py-0.5 rounded border border-hairline">[${item.code}]</span>`;
                    }
                }

                card.innerHTML = `
                    <span class="text-ink font-medium truncate pr-2">${displayName}</span>
                    <div class="flex items-center gap-1">
                        <button class="btn-edit-master text-body-muted hover:text-primary transition-colors opacity-50 group-hover:opacity-100 p-2 rounded-sm hover:bg-surface-chip" data-id="${item._id}" data-name="${item.name}" ${dataCodeAttr}>
                            <i class="fa-solid fa-pen"></i>
                        </button>
                        <button class="btn-delete-master text-body-muted hover:text-red-400 transition-colors opacity-50 group-hover:opacity-100 p-2 rounded-sm hover:bg-red-500/10" data-id="${item._id}">
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
                    const oldCode = e.currentTarget.getAttribute('data-code') || '';

                    if (currentSettingsTab === 'productname') {
                        showPrompt('แก้ไขชื่อสินค้า', oldName, (newName) => {
                            if (newName && newName.trim() !== '') {
                                showPrompt('แก้ไขรหัสชื่อสินค้า (ปล่อยว่างไว้ได้)', oldCode, (newCode) => {
                                    const finalName = newName.trim();
                                    const finalCode = (newCode || '').trim();
                                    if (finalName !== oldName || finalCode !== oldCode) {
                                        editMasterData(id, finalName, finalCode);
                                    }
                                });
                            }
                        });
                    } else {
                        showPrompt('แก้ไขข้อมูล', oldName, (newName) => {
                            if (newName && newName.trim() !== '' && newName !== oldName) {
                                editMasterData(id, newName.trim());
                            }
                        });
                    }
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
                    b.classList.remove('active', 'text-primary', 'border-primary');
                    b.classList.add('text-body-muted', 'border-transparent');
                });

                e.currentTarget.classList.remove('text-body-muted', 'border-transparent');
                e.currentTarget.classList.add('active', 'text-primary', 'border-primary');

                currentSettingsTab = e.currentTarget.getAttribute('data-tab');
                if (masterDataInput) masterDataInput.value = ''; // clear input
                if (masterDataCodeInput) {
                    masterDataCodeInput.value = '';
                    if (currentSettingsTab === 'productname') {
                        masterDataCodeInput.classList.remove('hidden');
                    } else {
                        masterDataCodeInput.classList.add('hidden');
                    }
                }
                renderSettingsList();
            });
        });
    }

    if (btnAddMasterData) {
        btnAddMasterData.addEventListener('click', async () => {
            const name = masterDataInput.value.trim();
            if (!name) return showToast('กรุณาระบุชื่อข้อมูลที่ต้องการเพิ่ม', 'error');

            const payload = { name };
            if (currentSettingsTab === 'productname' && masterDataCodeInput) {
                payload.code = masterDataCodeInput.value.trim();
            }

            try {
                const response = await authFetch(`${API_BASE_URL}/master/${currentSettingsTab}`, {
                    method: 'POST',
                    headers: { 'Content-Type': 'application/json' },
                    body: JSON.stringify(payload)
                });
                const result = await response.json();

                if (result.success) {
                    masterDataInput.value = '';
                    if (masterDataCodeInput) masterDataCodeInput.value = '';
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

    const editMasterData = async (id, name, code) => {
        try {
            const payload = { name };
            if (currentSettingsTab === 'productname') {
                payload.code = code || '';
            }
            const response = await authFetch(`${API_BASE_URL}/master/${currentSettingsTab}/${id}`, {
                method: 'PUT',
                headers: { 'Content-Type': 'application/json' },
                body: JSON.stringify(payload)
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
})();
