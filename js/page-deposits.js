// DEPOSIT MODULE (การมัดจำสินค้า)
// แยกออกมาจาก script.js — โหลดแบบ dynamic เฉพาะตอนเปิดหน้า "การมัดจำสินค้า" ครั้งแรกเท่านั้น
// พึ่งพา window.authFetch, window.showToast, window.masterDataCache, allProductsCache (จาก script.js), API_BASE_URL
(function () {
    // ==========================================
    // DEPOSIT MODULE (การมัดจำสินค้า)
    // ==========================================
    const depositFilterBranch = document.getElementById('deposit-filter-branch');
    const depositFilterStatus = document.getElementById('deposit-filter-status');
    const depositFilterStage = document.getElementById('deposit-filter-stage');
    const depositFilterStartDate = document.getElementById('deposit-filter-start-date');
    const depositFilterEndDate = document.getElementById('deposit-filter-end-date');
    const depositFilterSearch = document.getElementById('deposit-filter-search');
    const btnOpenCreateDeposit = document.getElementById('btn-open-create-deposit');
    const depositTableBody = document.getElementById('deposit-table-body');
    const depositBranchHeader = document.getElementById('deposit-branch-header');

    // แถบชิปตัวกรอง + ตัวนับผลลัพธ์ + พาเนลกรองละเอียด (DESIGN.md ข้อ 11.5 / 11.8)
    const depositActiveFilters = document.getElementById('deposit-active-filters');
    const depositResultCount = document.getElementById('deposit-result-count');
    const depositFilterPanel = document.getElementById('deposit-filter-panel');
    const depositFilterPanelContent = document.getElementById('deposit-filter-panel-content');
    const btnDepositFilter = document.getElementById('btn-deposit-filter');
    const btnDepositFilterText = document.getElementById('btn-deposit-filter-text');
    const btnDepositFilterClose = document.getElementById('btn-deposit-filter-close');
    const btnDepositFilterApply = document.getElementById('btn-deposit-filter-apply');
    const btnDepositFilterReset = document.getElementById('btn-deposit-filter-reset');

    const DEPOSIT_TABLE_COLS = 10;

    // Create Modal Elements
    const modalCreateDeposit = document.getElementById('modal-create-deposit');
    const depositForm = document.getElementById('deposit-form');
    const editDepositId = document.getElementById('edit-deposit-id');
    const depositModalTitle = document.getElementById('deposit-modal-title');
    const modalDepositCustomerName = document.getElementById('modal-deposit-customer-name');
    const modalDepositCustomerPhone = document.getElementById('modal-deposit-customer-phone');
    const modalDepositProductId = document.getElementById('modal-deposit-product-id');
    const modalDepositColor = document.getElementById('modal-deposit-color');
    const modalDepositCapacity = document.getElementById('modal-deposit-capacity');
    const modalDepositImei = document.getElementById('modal-deposit-imei');
    const modalDepositProductPrice = document.getElementById('modal-deposit-product-price');
    const modalDepositAmount = document.getElementById('modal-deposit-amount');
    const modalDepositRemaining = document.getElementById('modal-deposit-remaining');
    const modalDepositPaymentMethod = document.getElementById('modal-deposit-payment-method');
    const modalDepositAppointment = document.getElementById('modal-deposit-appointment');
    const modalDepositCashAmount = document.getElementById('modal-deposit-cash-amount');
    const modalDepositTransferAmount = document.getElementById('modal-deposit-transfer-amount');
    const depositSplitRow = document.getElementById('deposit-split-row');
    const modalDepositStage = document.getElementById('modal-deposit-stage');
    const modalDepositNotes = document.getElementById('modal-deposit-notes');
    const btnCloseCreateDeposit = document.getElementById('btn-close-create-deposit');
    const btnCancelCreateDeposit = document.getElementById('btn-cancel-create-deposit');

    // Details Modal Elements
    const modalDepositDetails = document.getElementById('modal-deposit-details');
    const btnCloseDepositDetails = document.getElementById('btn-close-deposit-details');
    const btnCloseDepositDetailModal = document.getElementById('btn-close-deposit-detail-modal');
    const btnDepositDetailPrint = document.getElementById('btn-deposit-detail-print');

    // Details Info
    const detailDepositNumber = document.getElementById('detail-deposit-number');
    const detailDepositStatus = document.getElementById('detail-deposit-status');
    const detailDepositCustomer = document.getElementById('detail-deposit-customer');
    const detailDepositPhone = document.getElementById('detail-deposit-phone');
    const detailDepositProduct = document.getElementById('detail-deposit-product');
    const detailDepositImeiText = document.getElementById('detail-deposit-imei-text');
    const detailDepositPrice = document.getElementById('detail-deposit-price');
    const detailDepositPaid = document.getElementById('detail-deposit-paid');
    const detailDepositRemaining = document.getElementById('detail-deposit-remaining');
    const detailDepositDates = document.getElementById('detail-deposit-dates');
    const detailDepositSender = document.getElementById('detail-deposit-sender');

    // Complete section
    const detailActionCompleteSection = document.getElementById('detail-action-complete-section');
    const detailAssignImeiRow = document.getElementById('detail-assign-imei-row');
    const detailAssignImeiSelect = document.getElementById('detail-assign-imei-select');
    const detailPickupPaymentMethod = document.getElementById('detail-pickup-payment-method');
    const detailPickupToPay = document.getElementById('detail-pickup-to-pay');
    const detailPickupSplitRow = document.getElementById('detail-pickup-split-row');
    const detailPickupCashAmount = document.getElementById('detail-pickup-cash-amount');
    const detailPickupTransferAmount = document.getElementById('detail-pickup-transfer-amount');
    const btnSubmitCompleteDeposit = document.getElementById('btn-submit-complete-deposit');

    // Cancel section
    const detailActionCancelSection = document.getElementById('detail-action-cancel-section');
    const detailCancelReason = document.getElementById('detail-cancel-reason');
    const btnSubmitCancelDeposit = document.getElementById('btn-submit-cancel-deposit');

    // History section
    const detailHistoryInfoSection = document.getElementById('detail-history-info-section');
    const detailHistoryCompletedByLabel = document.getElementById('detail-history-completed-by-label');
    const detailHistoryCompletedBy = document.getElementById('detail-history-completed-by');
    const detailHistoryCompletedAtLabel = document.getElementById('detail-history-completed-at-label');
    const detailHistoryCompletedAt = document.getElementById('detail-history-completed-at');
    const detailHistoryBillRow = document.getElementById('detail-history-bill-row');
    const detailHistoryBill = document.getElementById('detail-history-bill');
    const detailHistoryReasonRow = document.getElementById('detail-history-reason-row');
    const detailHistoryReason = document.getElementById('detail-history-reason');

    let activeDeposit = null;

    const getLoggedUserBranchId = () => {
        try {
            const userStr = localStorage.getItem('silmin_user');
            if (!userStr) return '';
            const user = JSON.parse(userStr);
            if (!user || !user.branch) return '';
            return user.branch._id || user.branch;
        } catch (e) {
            console.error('Error parsing logged user info:', e);
            return '';
        }
    };

    async function loadBranchesForDeposits() {
        if (!depositFilterBranch) return;
        try {
            const response = await authFetch(`${API_BASE_URL}/branches`);
            const json = await response.json();
            if (json.success && json.data) {
                depositFilterBranch.innerHTML = '<option value="ALL">ทุกสาขา</option>';
                json.data.forEach(branch => {
                    const opt = document.createElement('option');
                    opt.value = branch._id;
                    opt.textContent = branch.name;
                    depositFilterBranch.appendChild(opt);
                });
            }
        } catch (e) {
            console.error('Error loading branches for deposits filter:', e);
        }
    }

    // ==========================================
    // ตัวเลือกในโมดัล "บันทึกรายการจองมัดจำใหม่"
    //
    // คลาสทุกตัวด้านล่างลอกมาจากโมดัล "เพิ่มสินค้าใหม่" (#add-product-modal) ให้หน้าตาตรงกัน
    // ต่างกันจุดเดียวคือ "ค่าที่เขียนลง hidden input":
    //   หน้าสต็อกเก็บ _id ของ master data
    //   ใบมัดจำเก็บ "ชื่อ" เพราะตอน submit มันเอาชื่อสินค้า + ความจุ + สี มาต่อกันเป็น product_name
    //   (ดู const product_name = [productNameInput, capacityName, colorName].join(' '))
    // และต้อง dispatch 'change' เองด้วย เพราะ <input type="hidden"> ไม่ยิง event ให้อัตโนมัติ
    // ถ้าไม่ยิง handleDepositVariationChange จะไม่ทำงาน = ราคาไม่เติมให้อัตโนมัติ
    // ==========================================

    const setDepositPickerValue = (hiddenInput, name) => {
        if (!hiddenInput) return;
        hiddenInput.value = name;
        hiddenInput.dispatchEvent(new Event('change'));
    };

    const populateDepositProducts = () => {
        const select = document.getElementById('modal-deposit-product-id');
        if (!select) return;
        const names = (window.masterDataCache && Array.isArray(window.masterDataCache.productNames))
            ? window.masterDataCache.productNames : [];
        select.innerHTML = '<option value="">-- เลือกสินค้าที่จอง --</option>'
            + names.map(p => `<option value="${p.name}">${p.name}</option>`).join('');
    };

    // Swatch สี — โครงเดียวกับ renderCustomColorSwatches ใน script.js
    const renderDepositColorSwatches = () => {
        const container = document.getElementById('modal-deposit-color-container');
        const hiddenInput = document.getElementById('modal-deposit-color');
        if (!container || !hiddenInput) return;
        container.innerHTML = '';

        const colors = (window.masterDataCache && Array.isArray(window.masterDataCache.productColors))
            ? window.masterDataCache.productColors : [];

        colors.forEach(item => {
            const wrapper = document.createElement('div');
            wrapper.className = 'flex flex-col items-center gap-1 cursor-pointer custom-swatch-wrapper';
            wrapper.dataset.value = item.name;

            const swatch = document.createElement('div');
            swatch.className = 'w-7 h-7 rounded-full border-2 border-transparent transition-all custom-swatch';
            swatch.style.backgroundColor = window.resolveProductColorHex
                ? window.resolveProductColorHex(item.name, item)
                : '#8E8E93';

            const label = document.createElement('span');
            label.className = 'text-[10px] text-slate-400 whitespace-nowrap custom-swatch-label transition-colors';
            label.textContent = item.name;

            wrapper.appendChild(swatch);
            wrapper.appendChild(label);

            wrapper.addEventListener('click', () => {
                Array.from(container.children).forEach(child => {
                    const sw = child.querySelector('.custom-swatch');
                    const lb = child.querySelector('.custom-swatch-label');
                    if (sw) { sw.classList.remove('border-[#FFE169]', 'scale-110'); sw.classList.add('border-transparent'); }
                    if (lb) { lb.classList.remove('text-[#FFE169]', 'text-[13px]'); lb.classList.add('text-slate-400', 'text-[10px]'); }
                });
                swatch.classList.remove('border-transparent');
                swatch.classList.add('border-[#FFE169]', 'scale-110');
                label.classList.remove('text-slate-400', 'text-[10px]');
                label.classList.add('text-[#FFE169]', 'text-[13px]');
                setDepositPickerValue(hiddenInput, item.name);
            });

            container.appendChild(wrapper);
        });
    };

    // Pill ความจุ — โครงเดียวกับ renderCustomSelectPills ใน script.js
    const renderDepositCapacityPills = () => {
        const container = document.getElementById('modal-deposit-capacity-container');
        const hiddenInput = document.getElementById('modal-deposit-capacity');
        if (!container || !hiddenInput) return;
        container.innerHTML = '';

        const caps = (window.masterDataCache && Array.isArray(window.masterDataCache.productCapacities))
            ? window.masterDataCache.productCapacities : [];

        caps.forEach(item => {
            const btn = document.createElement('button');
            btn.type = 'button';
            btn.className = 'custom-pill flex-shrink-0 px-4 py-2.5 bg-[#27272A] border border-[#3F3F46] rounded-xl text-slate-300 text-sm hover:border-[#FFE169] hover:text-white transition-colors';
            btn.dataset.value = item.name;
            btn.textContent = item.name;

            btn.addEventListener('click', () => {
                Array.from(container.children).forEach(child => {
                    child.classList.remove('border-[#FFE169]', 'text-[#FFE169]');
                    child.classList.add('border-[#3F3F46]', 'text-slate-300');
                });
                btn.classList.remove('border-[#3F3F46]', 'text-slate-300');
                btn.classList.add('border-[#FFE169]', 'text-[#FFE169]');
                setDepositPickerValue(hiddenInput, item.name);
            });

            container.appendChild(btn);
        });
    };

    // เดิมฟังก์ชันนี้เติม <datalist> ให้ช่องพิมพ์ ตอนนี้เปลี่ยนเป็น swatch/pill ตามดีไซน์โมดัลเพิ่มสินค้า
    // เรียกใหม่ทุกครั้งที่เปิดโมดัล ซึ่งเท่ากับล้างสถานะ "ที่เลือกไว้" ของครั้งก่อนไปในตัว
    // (depositForm.reset() ล้างค่าใน hidden input ให้ แต่ล้างสีขอบ/ตัวหนังสือของ pill ไม่ได้)
    const populateDepositColorAndCapacity = () => {
        renderDepositColorSwatches();
        renderDepositCapacityPills();
    };

    const populateAssignImeiSelect = (productName) => {
        if (!detailAssignImeiSelect) return;
        detailAssignImeiSelect.innerHTML = '<option value="">-- กรุณาเลือก IMEI เครื่องที่ต้องการส่งมอบ --</option>';
        if (typeof allProductsCache === 'undefined') return;

        const currentBranchId = getLoggedUserBranchId();
        const matchingProducts = allProductsCache.filter(p => p.name === productName);

        matchingProducts.forEach(product => {
            if (!product.stock_balances) return;
            const bal = product.stock_balances.find(b => b.branch_id && (b.branch_id._id || b.branch_id) === currentBranchId);
            if (bal && Array.isArray(bal.imeis)) {
                bal.imeis.forEach(imei => {
                    const opt = document.createElement('option');
                    opt.value = imei;
                    const capacityStr = product.capacity_id ? ` ${product.capacity_id.name || product.capacity_id}` : '';
                    const colorStr = product.color_id ? ` ${product.color_id.name || product.color_id}` : '';
                    opt.textContent = `${imei} (${capacityStr}${colorStr})`;
                    detailAssignImeiSelect.appendChild(opt);
                });
            }
        });
    };

    const updateDepositRemaining = (priceInput, amountInput, remainingInput) => {
        const price = Number(priceInput.value) || 0;
        const deposit = Number(amountInput.value) || 0;
        remainingInput.value = Math.max(0, price - deposit);
    };

    const handlePaymentMethodChange = (selectEl, splitRowEl, cashInput, transferInput, totalAmount = 0) => {
        if (selectEl.value === 'ผสม') {
            splitRowEl.classList.remove('hidden');
            cashInput.required = true;
            transferInput.required = true;
            if (totalAmount > 0) {
                cashInput.value = Math.floor(totalAmount / 2);
                transferInput.value = totalAmount - Math.floor(totalAmount / 2);
            }
        } else {
            splitRowEl.classList.add('hidden');
            cashInput.required = false;
            transferInput.required = false;
            cashInput.value = '';
            transferInput.value = '';
        }
    };

    // ==========================================
    // ชิ้นส่วน UI ที่ใช้ซ้ำ — เดินตามแบบแปลนหน้า #stock ใน DESIGN.md ข้อ 11.5 - 11.7
    // ==========================================

    // แถวโครงร่างระหว่างรอข้อมูล — ต้องเรียกก่อน await เสมอ ไม่ปล่อยตารางว่าง (ข้อ 11.7)
    const renderDepositSkeleton = (rowCount = 6) => {
        const bar = (widthClass) => `<div class="h-3.5 ${widthClass} rounded-full bg-[#5c5c5c] animate-pulse"></div>`;
        const twoLine = (w1, w2) => `<div class="space-y-2">${bar(w1)}${bar(w2)}</div>`;
        let html = '';
        for (let i = 0; i < rowCount; i++) {
            html += `
                <tr>
                    <td class="px-6 py-4">${twoLine('w-24', 'w-20')}</td>
                    <td class="px-6 py-4">${twoLine('w-32', 'w-24')}</td>
                    <td class="px-6 py-4">${twoLine('w-36', 'w-28')}</td>
                    <td class="px-6 py-4">${bar('w-16 ml-auto')}</td>
                    <td class="px-6 py-4">${bar('w-16 ml-auto')}</td>
                    <td class="px-6 py-4">${bar('w-16 ml-auto')}</td>
                    <td class="px-6 py-4">${bar('w-20')}</td>
                    <td class="px-6 py-4">${twoLine('w-24', 'w-28')}</td>
                    <td class="px-6 py-4">${twoLine('w-24', 'w-20')}</td>
                    <td class="px-6 py-4">
                        <div class="flex items-center justify-end gap-2">
                            <div class="w-8 h-8 rounded-[0.375rem] bg-[#5c5c5c] animate-pulse"></div>
                            <div class="w-8 h-8 rounded-[0.375rem] bg-[#5c5c5c] animate-pulse"></div>
                        </div>
                    </td>
                </tr>
            `;
        }
        depositTableBody.innerHTML = html;
    };

    const depositStateRow = (message, extraClass = 'text-white/50 italic') =>
        `<tr><td colspan="${DEPOSIT_TABLE_COLS}" class="px-6 py-8 text-center ${extraClass}">${message}</td></tr>`;

    // ป้ายสถานะ: จุดสี + พื้น tint 12% ตามตารางสถานะใน DESIGN.md ข้อ 11.6
    const depositStatusBadge = (status) => {
        let dot = 'bg-orange-500', bg = 'bg-orange-500/[0.12]', text = 'text-orange-400';
        if (status === 'สำเร็จ') {
            dot = 'bg-[#20D500]'; bg = 'bg-[#42A231]/[0.12]'; text = 'text-[#20D500]';
        } else if (status === 'ยกเลิก') {
            dot = 'bg-[#FE0000]'; bg = 'bg-[#FE0000]/[0.12]'; text = 'text-[#FE0000]';
        }
        return `
            <div class="inline-flex items-center gap-2 px-2.5 py-1 rounded-[0.375rem] ${bg}">
                <div class="w-2 h-2 rounded-full ${dot}"></div>
                <span class="${text} font-medium text-xs">${status}</span>
            </div>
        `;
    };

    // ไอคอนสินค้าประจำแถว — สูตรเดียวกับคอลัมน์ "ชื่อสินค้า" หน้า #stock (ตัวสร้างอยู่ใน script.js ที่เดียว)
    //
    // ใบมัดจำไม่ได้เก็บ color_id / type_id แยกไว้ — schema มีแค่ product_name ที่เป็นสตริงรวม
    // (เช่น "iPhone 15 128 Black") และ product_id ที่ /api/deposits ไม่ได้ populate มาให้
    // จึงหาข้อมูลสินค้าจากสองทาง เรียงตามความแม่นยำ:
    //   1) จับคู่ product_id กับ allProductsCache ที่ script.js โหลดไว้แล้ว — ได้ color_id/type_id ของจริง
    //   2) ถ้าไม่มีในแคช (เข้าหน้านี้ตรงๆ โดยไม่ผ่านหน้าสต็อก) ให้อ่านจากชื่อสินค้าแทน
    //      resolveProductColorHex จับคำแบบ substring อยู่แล้ว "…128 Black" จึงได้ #000000
    //      ส่วนใบที่มี IMEI ถือเป็นเครื่องแน่นอน ยัดเข้า imeis ให้ checkIsDevice ตัดสินได้
    const findCachedProduct = (productId) => {
        if (!productId || !Array.isArray(window.allProductsCache)) return null;
        const id = String(productId);
        return window.allProductsCache.find(p => String(p._id) === id) || null;
    };

    // จุดสี 16px แทนไอคอนวงกลม 40px เดิม — ตามข้อ 11.14 (สีเครื่องอย่างเดียว ไม่ต้องแยกประเภทสินค้า)
    // ไม่ต้องใช้ probe/type_id แล้วเพราะ productColorDot ไม่สนใจว่าเป็นเครื่องหรือกล่อง
    const depositProductIcon = (item) => {
        if (!window.productColorDot) return '';
        const cached = findCachedProduct(item.product_id);
        const colorName = (cached && cached.color_id && cached.color_id.name)
            ? cached.color_id.name
            : item.product_name;
        return window.productColorDot(colorName, cached ? cached.color_id : null);
    };

    // เซลล์สองบรรทัด: บรรทัดหลัก + คำบรรยายรอง (สูตร "ชื่อ + คำบรรยาย" ข้อ 11.6)
    // ใช้ยุบคอลัมน์ที่เคยแยกกัน (ลูกค้า+เบอร์โทร, สินค้า+IMEI, ผู้ทำรายการ+สาขา) โดยไม่ทำข้อมูลหาย
    const twoLineCell = (main, sub) => `
        <div>
            <p class="font-medium text-white">${main}</p>
            <p class="text-xs text-white/70 mt-0.5">${sub}</p>
        </div>
    `;

    const selectedOptionText = (selectEl) => {
        if (!selectEl) return '';
        const opt = selectEl.options[selectEl.selectedIndex];
        return opt ? opt.textContent.trim() : '';
    };

    // นับตัวกรองที่ "อยู่ในพาเนลละเอียด" เท่านั้น — ตัวเลขนี้ไปโชว์บนปุ่ม "เพิ่มเติม (n)"
    const countDrawerFilters = () => {
        let n = 0;
        if (depositFilterStage && depositFilterStage.value !== 'ALL') n++;
        if (depositFilterStartDate && depositFilterStartDate.value) n++;
        if (depositFilterEndDate && depositFilterEndDate.value) n++;
        return n;
    };

    const updateDepositFilterBadge = () => {
        if (!btnDepositFilterText) return;
        const n = countDrawerFilters();
        btnDepositFilterText.textContent = n > 0 ? `เพิ่มเติม (${n})` : 'เพิ่มเติม';
    };

    const renderDepositChips = () => {
        if (!depositActiveFilters) return;
        depositActiveFilters.innerHTML = '';

        const addChip = (label, onRemove) => {
            const chip = document.createElement('button');
            chip.type = 'button';
            chip.className = 'px-4 py-2.5 rounded-xl bg-[#4D4D4D]/40 border border-[#3F3F46] text-white text-sm font-medium transition-colors flex items-center gap-2';
            chip.innerHTML = `<span>${label}</span><i class="fa-solid fa-xmark text-[10px] opacity-80"></i>`;
            chip.addEventListener('click', (e) => {
                // ลบได้เฉพาะตอนคลิกที่กากบาท ตัวชิปเองไม่ตอบสนอง (ข้อ 11.5)
                if (!e.target.closest('i.fa-xmark')) return;
                onRemove();
            });
            depositActiveFilters.appendChild(chip);
        };

        let activeCount = 0;

        const term = (depositFilterSearch && depositFilterSearch.value || '').trim();
        if (term) {
            activeCount++;
            addChip(`ค้นหา: ${term}`, () => { depositFilterSearch.value = ''; loadDeposits(); });
        }
        // ฟิลเตอร์สาขาถูกล็อกไว้สำหรับคนที่ไม่มีสิทธิ์ข้ามสาขา — ล็อกอยู่ก็ไม่ต้องมีชิปให้กดลบ
        if (depositFilterBranch && depositFilterBranch.value !== 'ALL' && !depositFilterBranch.disabled) {
            activeCount++;
            addChip(`สาขา: ${selectedOptionText(depositFilterBranch)}`, () => {
                depositFilterBranch.value = 'ALL';
                loadDeposits();
            });
        }
        if (depositFilterStatus && depositFilterStatus.value !== 'ALL') {
            activeCount++;
            addChip(`สถานะ: ${selectedOptionText(depositFilterStatus)}`, () => {
                depositFilterStatus.value = 'ALL';
                loadDeposits();
            });
        }
        if (depositFilterStage && depositFilterStage.value !== 'ALL') {
            activeCount++;
            addChip(`ขั้นตอน: ${selectedOptionText(depositFilterStage)}`, () => {
                depositFilterStage.value = 'ALL';
                loadDeposits();
            });
        }
        const startVal = depositFilterStartDate && depositFilterStartDate.value;
        const endVal = depositFilterEndDate && depositFilterEndDate.value;
        if (startVal || endVal) {
            activeCount++;
            const thaiDate = (v) => new Date(v).toLocaleDateString('th-TH');
            const from = startVal ? thaiDate(startVal) : 'ไม่จำกัด';
            const to = endVal ? thaiDate(endVal) : 'ไม่จำกัด';
            addChip(`นัดรับ: ${from} - ${to}`, () => {
                if (depositFilterStartDate) depositFilterStartDate.value = '';
                if (depositFilterEndDate) depositFilterEndDate.value = '';
                loadDeposits();
            });
        }

        // ปุ่มล้างทั้งหมดโผล่เมื่อมีตัวกรองมากกว่า 1 ตัวเท่านั้น (ข้อ 11.5)
        if (activeCount > 1) {
            const clearBtn = document.createElement('button');
            clearBtn.type = 'button';
            clearBtn.className = 'px-2.5 py-1 bg-red-500/10 hover:bg-red-500/15 text-red-300 rounded-full text-xs font-medium border border-red-500/30 transition-colors';
            clearBtn.textContent = 'ล้างทั้งหมด';
            clearBtn.addEventListener('click', resetAllDepositFilters);
            depositActiveFilters.appendChild(clearBtn);
        }

        updateDepositFilterBadge();
    };

    function resetAllDepositFilters() {
        if (depositFilterSearch) depositFilterSearch.value = '';
        // สาขาที่ถูกล็อกต้องคงค่าเดิมไว้ ไม่งั้นผู้ใช้ที่ดูได้แค่สาขาตัวเองจะเห็นข้ามสาขา
        if (depositFilterBranch && !depositFilterBranch.disabled) depositFilterBranch.value = 'ALL';
        if (depositFilterStatus) depositFilterStatus.value = 'ALL';
        if (depositFilterStage) depositFilterStage.value = 'ALL';
        if (depositFilterStartDate) depositFilterStartDate.value = '';
        if (depositFilterEndDate) depositFilterEndDate.value = '';
        loadDeposits();
    }

    // เปิด/ปิดพาเนลกรองละเอียด — สองชั้น: กล่องนอกจางเข้า/ออก กล่องในเลื่อนเข้า/ออก (ข้อ 11.8)
    const openDepositFilterPanel = () => {
        if (!depositFilterPanel) return;
        depositFilterPanel.classList.remove('opacity-0', 'pointer-events-none');
        if (depositFilterPanelContent) depositFilterPanelContent.classList.remove('translate-x-full');
    };
    const closeDepositFilterPanel = () => {
        if (!depositFilterPanel) return;
        depositFilterPanel.classList.add('opacity-0', 'pointer-events-none');
        if (depositFilterPanelContent) depositFilterPanelContent.classList.add('translate-x-full');
    };

    async function loadDeposits() {
        if (!depositTableBody) return;

        const branchVal = depositFilterBranch ? depositFilterBranch.value : 'ALL';
        const statusVal = depositFilterStatus ? depositFilterStatus.value : 'รอดำเนินการ';
        const stageVal = depositFilterStage ? depositFilterStage.value : 'ALL';
        const startVal = depositFilterStartDate ? depositFilterStartDate.value : '';
        const endVal = depositFilterEndDate ? depositFilterEndDate.value : '';
        const searchVal = depositFilterSearch ? depositFilterSearch.value : '';

        let params = [];
        if (statusVal !== 'ALL') params.push(`status=${statusVal}`);
        if (branchVal !== 'ALL') params.push(`branch_id=${branchVal}`);
        if (stageVal !== 'ALL') params.push(`stage=${stageVal}`);
        if (startVal) params.push(`startDate=${startVal}`);
        if (endVal) params.push(`endDate=${endVal}`);
        if (searchVal) params.push(`search=${encodeURIComponent(searchVal)}`);
        let url = `/api/deposits?` + params.join('&');

        const user = JSON.parse(localStorage.getItem('silmin_user') || '{}');
        const userRole = user.role || '';
        const canFilterBranch = user.permissions && (user.permissions.filter_stock_branch || userRole === 'Administrator' || userRole === 'ผู้จัดการ');

        if (!canFilterBranch) {
            const userBranchId = getLoggedUserBranchId();
            if (depositFilterBranch) {
                depositFilterBranch.value = userBranchId;
                depositFilterBranch.disabled = true;
            }
            if (depositBranchHeader) {
                depositBranchHeader.textContent = `สาขา: ${user.branch?.name || 'สาขาของคุณ'}`;
            }
        } else {
            if (depositFilterBranch) {
                depositFilterBranch.disabled = false;
            }
            if (depositBranchHeader && depositFilterBranch) {
                const selectedText = depositFilterBranch.options[depositFilterBranch.selectedIndex]?.textContent || 'ทั้งหมด';
                depositBranchHeader.textContent = `สาขา: ${selectedText}`;
            }
        }

        // ชิปต้องอัปเดตทันทีที่ผู้ใช้เปลี่ยนตัวกรอง ไม่ต้องรอ API ตอบ
        renderDepositChips();
        if (depositResultCount) depositResultCount.textContent = '';
        renderDepositSkeleton();

        try {
            const token = localStorage.getItem('silmin_token');
            const response = await fetch(url, {
                headers: { 'Authorization': `Bearer ${token}` }
            });
            const result = await response.json();

            depositTableBody.innerHTML = '';
            if (result.success && result.data && result.data.length > 0) {
                result.data.forEach(item => {
                    const row = document.createElement('tr');
                    row.className = 'hover:bg-[#464646] transition-colors cursor-pointer';

                    const dateStr = new Date(item.createdAt).toLocaleDateString('th-TH', { hour: '2-digit', minute: '2-digit' }) + ' น.';
                    const apptStr = item.appointment_date ? new Date(item.appointment_date).toLocaleDateString('th-TH') : 'ไม่ระบุ';
                    const imeiStr = item.imei
                        ? `<span class="font-mono">${item.imei}</span>`
                        : '<span class="italic">IMEI: ยังไม่ระบุ</span>';
                    // เลขที่บิล POS มีเฉพาะรายการที่ส่งมอบแล้ว จึงเกาะไปกับบรรทัดขั้นตอนแทนที่จะกินคอลัมน์ของตัวเอง
                    const stageStr = item.bill_number ? `${item.stage} · บิล ${item.bill_number}` : item.stage;
                    const remaining = item.remaining_amount || 0;

                    row.innerHTML = `
                        <td class="px-6 py-4">
                            <div>
                                <p class="font-mono font-semibold text-[#FFE169]">${item.deposit_number || '-'}</p>
                                <p class="text-xs text-white/70 mt-0.5">${dateStr}</p>
                            </div>
                        </td>
                        <td class="px-6 py-4">
                            ${twoLineCell(item.customer_name, `<span class="font-mono">${item.customer_phone}</span>`)}
                        </td>
                        <td class="px-6 py-4">
                            <p class="font-medium text-white flex items-center gap-2">${depositProductIcon(item)}<span>${item.product_name}</span></p>
                            <p class="text-xs text-white/70 pl-6 mt-0.5">${imeiStr}</p>
                        </td>
                        <td class="px-6 py-4 text-right text-white font-mono">฿${item.product_price.toLocaleString()}</td>
                        <td class="px-6 py-4 text-right text-white font-mono">฿${item.deposit_amount.toLocaleString()}</td>
                        <td class="px-6 py-4 text-right font-mono ${remaining > 0 ? 'text-[#FE0000]' : 'text-white'}">฿${remaining.toLocaleString()}</td>
                        <td class="px-6 py-4 text-white text-sm">${apptStr}</td>
                        <td class="px-6 py-4">
                            <div>
                                ${depositStatusBadge(item.status)}
                                <p class="text-xs text-white/70 mt-1">${stageStr}</p>
                            </div>
                        </td>
                        <td class="px-6 py-4">
                            ${twoLineCell(item.created_by?.name || '-', item.branch_id?.name || '-')}
                        </td>
                        <td class="px-6 py-4 text-right">
                            <div class="flex items-center justify-end gap-1">
                                <button type="button" class="btn-view-deposit text-white hover:text-indigo-400 transition-colors p-2" title="ดูรายละเอียด">
                                    <i class="fa-solid fa-eye"></i>
                                </button>
                                <button type="button" class="btn-print-deposit text-white hover:text-amber-400 transition-colors p-2" data-id="${item._id}" title="พิมพ์ใบมัดจำ">
                                    <i class="fa-solid fa-print"></i>
                                </button>
                            </div>
                        </td>
                    `;

                    row.querySelector('.btn-print-deposit').addEventListener('click', (e) => {
                        e.stopPropagation();
                        printDepositSlip(item._id);
                    });

                    // ปุ่มตาเป็นทางเข้าที่คีย์บอร์ดใช้ได้จริง ส่วนคลิกทั้งแถวเก็บไว้เป็นทางลัดของเมาส์
                    row.querySelector('.btn-view-deposit').addEventListener('click', (e) => {
                        e.stopPropagation();
                        openDepositDetailsModal(item);
                    });

                    row.addEventListener('click', () => {
                        openDepositDetailsModal(item);
                    });

                    depositTableBody.appendChild(row);
                });

                if (depositResultCount) {
                    depositResultCount.textContent = `แสดง ${result.data.length} รายการ`;
                }
            } else {
                depositTableBody.innerHTML = depositStateRow('ไม่พบข้อมูลใบมัดจำสินค้าตามตัวเลือก');
                if (depositResultCount) depositResultCount.textContent = '';
            }
        } catch (e) {
            console.error('Error loading deposits list:', e);
            depositTableBody.innerHTML = depositStateRow('เกิดข้อผิดพลาดในการโหลดรายการมัดจำ', 'text-red-400');
            if (depositResultCount) depositResultCount.textContent = '';
            showToast('เกิดข้อผิดพลาดในการโหลดรายการมัดจำ', 'error');
        }
    }

    const openCreateDepositModal = () => {
        if (!depositForm) return;
        depositForm.reset();
        editDepositId.value = '';
        depositModalTitle.innerHTML = 'บันทึกรายการจองมัดจำใหม่';
        depositSplitRow.classList.add('hidden');
        modalDepositRemaining.value = '0';

        populateDepositProducts();
        populateDepositColorAndCapacity();

        modalCreateDeposit.classList.remove('opacity-0', 'pointer-events-none');
        const content = modalCreateDeposit.querySelector('.modal-content');
        if (content) {
            content.classList.remove('scale-95');
            content.classList.add('scale-100');
        }
    };

    const closeCreateDepositModal = () => {
        modalCreateDeposit.classList.add('opacity-0', 'pointer-events-none');
        const content = modalCreateDeposit.querySelector('.modal-content');
        if (content) {
            content.classList.remove('scale-100');
            content.classList.add('scale-95');
        }
    };

    const openDepositDetailsModal = (deposit) => {
        activeDeposit = deposit;

        detailDepositNumber.textContent = deposit.deposit_number;
        // ใช้ป้ายสถานะสูตรเดียวกับในตาราง (จุดสี + tint 12%) แทนการสลับคลาสเองทีละชุด
        detailDepositStatus.innerHTML = depositStatusBadge(deposit.status);

        detailDepositCustomer.textContent = deposit.customer_name;
        detailDepositPhone.textContent = deposit.customer_phone;
        detailDepositProduct.textContent = deposit.product_name;
        detailDepositImeiText.textContent = deposit.imei || 'ไม่ระบุ (จองล่วงหน้า/รอสินค้า)';
        detailDepositPrice.textContent = '฿' + deposit.product_price.toLocaleString();
        detailDepositPaid.textContent = '฿' + deposit.deposit_amount.toLocaleString() + ' (' + deposit.payment_method + ')';
        detailDepositRemaining.textContent = '฿' + deposit.remaining_amount.toLocaleString();

        const createdDate = new Date(deposit.createdAt).toLocaleDateString('th-TH', { hour: '2-digit', minute: '2-digit' }) + ' น.';
        const apptDate = deposit.appointment_date ? new Date(deposit.appointment_date).toLocaleDateString('th-TH') : 'ไม่ระบุ';
        detailDepositDates.innerHTML = `วันที่ทำจอง: <span class="text-white font-medium">${createdDate}</span><br/>นัดรับเครื่อง: <span class="text-white font-medium">${apptDate}</span>`;

        detailDepositSender.textContent = `${deposit.created_by?.name || '-'} / สาขา: ${deposit.branch_id?.name || '-'}`;

        detailPickupToPay.value = '฿' + deposit.remaining_amount.toLocaleString();
        detailPickupPaymentMethod.value = 'เงินสด';
        detailPickupSplitRow.classList.add('hidden');
        detailPickupCashAmount.value = '';
        detailPickupTransferAmount.value = '';
        detailCancelReason.value = '';

        if (deposit.status === 'รอดำเนินการ') {
            detailActionCompleteSection.classList.remove('hidden');
            detailActionCancelSection.classList.remove('hidden');
            detailHistoryInfoSection.classList.add('hidden');

            if (deposit.imei && deposit.imei.trim() !== '') {
                detailAssignImeiRow.classList.add('hidden');
            } else {
                detailAssignImeiRow.classList.remove('hidden');
                if (detailAssignImeiSelect) {
                    detailAssignImeiSelect.value = '';
                }
            }
        } else {
            detailActionCompleteSection.classList.add('hidden');
            detailActionCancelSection.classList.add('hidden');
            detailHistoryInfoSection.classList.remove('hidden');

            if (deposit.status === 'สำเร็จ') {
                detailHistoryCompletedByLabel.textContent = 'ผู้ส่งมอบสินค้า';
                detailHistoryCompletedAtLabel.textContent = 'วันเวลาที่ส่งมอบ';
                detailHistoryCompletedBy.textContent = deposit.completed_by?.name || '-';
                detailHistoryCompletedAt.textContent = new Date(deposit.completed_at).toLocaleString('th-TH');
                detailHistoryBillRow.classList.remove('hidden');
                detailHistoryBill.textContent = deposit.bill_number;
                detailHistoryReasonRow.classList.add('hidden');
            } else {
                detailHistoryCompletedByLabel.textContent = 'ผู้ยกเลิกรายการ';
                detailHistoryCompletedAtLabel.textContent = 'วันเวลาที่ยกเลิก';
                detailHistoryCompletedBy.textContent = deposit.cancelled_by?.name || '-';
                detailHistoryCompletedAt.textContent = new Date(deposit.cancelled_at).toLocaleString('th-TH');
                detailHistoryBillRow.classList.add('hidden');
                detailHistoryReasonRow.classList.remove('hidden');
                detailHistoryReason.textContent = deposit.cancel_reason || 'ไม่ระบุ';
            }
        }

        modalDepositDetails.classList.remove('opacity-0', 'pointer-events-none');
        const content = modalDepositDetails.querySelector('.modal-content');
        if (content) {
            content.classList.remove('scale-95');
            content.classList.add('scale-100');
        }
    };

    const closeDepositDetailsModal = () => {
        modalDepositDetails.classList.add('opacity-0', 'pointer-events-none');
        const content = modalDepositDetails.querySelector('.modal-content');
        if (content) {
            content.classList.remove('scale-100');
            content.classList.add('scale-95');
        }
    };

    async function printDepositSlip(depositId) {
        try {
            const token = localStorage.getItem('silmin_token');
            const r = await fetch(`/api/deposits?_id=${depositId}`, {
                headers: { 'Authorization': `Bearer ${token}` }
            });
            const d = await r.json();
            if (!d.success || !d.data || d.data.length === 0) {
                showToast('ไม่สามารถดึงข้อมูลสำหรับพิมพ์ได้', 'error');
                return;
            }
            const deposit = d.data[0];
            const printWindow = window.open('', '_blank', 'width=800,height=600');

            const dateStr = new Date(deposit.createdAt).toLocaleDateString('th-TH', { year: 'numeric', month: 'long', day: 'numeric', hour: '2-digit', minute: '2-digit' }) + ' น.';
            const apptStr = deposit.appointment_date ? new Date(deposit.appointment_date).toLocaleDateString('th-TH', { year: 'numeric', month: 'long', day: 'numeric' }) : 'ไม่ระบุ';

            printWindow.document.write(`
                <html>
                <head>
                    <title>ใบจองมัดจำสินค้า #${deposit.deposit_number}</title>
                    <style>
                        body { font-family: 'Sarabun', sans-serif; color: #333; padding: 20px; line-height: 1.6; }
                        .receipt-box { max-width: 600px; margin: 0 auto; border: 1px solid #ccc; padding: 20px; border-radius: 8px; }
                        .header { text-align: center; margin-bottom: 20px; }
                        .header h2 { margin: 0; color: #047857; }
                        .info-table { width: 100%; border-collapse: collapse; margin: 20px 0; }
                        .info-table td { padding: 8px 0; }
                        .info-table td.label { font-weight: bold; color: #555; width: 150px; }
                        .divider { border-top: 2px dashed #ccc; margin: 20px 0; }
                        .footer { text-align: center; font-size: 12px; color: #777; margin-top: 30px; }
                        .total-row { background: #f0fdf4; font-size: 16px; font-weight: bold; }
                        @media print {
                            body { padding: 0; }
                            .receipt-box { border: none; }
                        }
                    </style>
                </head>
                <body>
                    <div class="receipt-box">
                        <div class="header">
                            <h2>ใบเสร็จรับเงินมัดจำ / ใบจองสินค้า</h2>
                            <p style="margin: 5px 0;">สาขา: ${deposit.branch_id?.name || '-'}</p>
                            <p style="margin: 0; font-size: 13px; font-weight: bold; color: #555;">เลขที่ใบจอง: ${deposit.deposit_number}</p>
                        </div>
                        <div class="divider"></div>
                        <table class="info-table">
                            <tr>
                                <td class="label">วันที่ทำรายการ:</td>
                                <td>${dateStr}</td>
                            </tr>
                            <tr>
                                <td class="label">ชื่อลูกค้า:</td>
                                <td>${deposit.customer_name}</td>
                            </tr>
                            <tr>
                                <td class="label">เบอร์โทรศัพท์:</td>
                                <td>${deposit.customer_phone}</td>
                            </tr>
                            <tr class="divider">
                                <td colspan="2"><hr style="border: 0; border-top: 1px solid #eee;"/></td>
                            </tr>
                            <tr>
                                <td class="label">สินค้าที่จอง:</td>
                                <td style="font-weight: bold;">${deposit.product_name}</td>
                            </tr>
                            <tr>
                                <td class="label">เลข IMEI จอง:</td>
                                <td>${deposit.imei || 'ไม่ระบุ (รอสินค้า/รอลูกค้ารับเครื่อง)'}</td>
                            </tr>
                            <tr>
                                <td class="label">วันเวลานัดรับเครื่อง:</td>
                                <td>${apptStr}</td>
                            </tr>
                            <tr class="divider">
                                <td colspan="2"><hr style="border: 0; border-top: 1px solid #eee;"/></td>
                            </tr>
                            <tr>
                                <td class="label">ราคาเต็ม:</td>
                                <td>฿${deposit.product_price.toLocaleString()}</td>
                            </tr>
                            <tr class="total-row">
                                <td class="label" style="padding: 10px 0 10px 10px;">ยอดมัดจำแล้ว:</td>
                                <td style="padding: 10px 0; color: #047857;">฿${deposit.deposit_amount.toLocaleString()} (${deposit.payment_method})</td>
                            </tr>
                            <tr>
                                <td class="label">คงเหลือค้างชำระ:</td>
                                <td style="color: #b91c1c; font-weight: bold;">฿${deposit.remaining_amount.toLocaleString()}</td>
                            </tr>
                            <tr>
                                <td class="label">ขั้นตอนดำเนินงาน:</td>
                                <td>${deposit.stage}</td>
                            </tr>
                        </table>
                        <div class="divider"></div>
                        <p style="font-size: 11px; text-align: center; margin: 10px 0;">* กรุณาเก็บใบเสร็จรับเงินมัดจำนี้ไว้เพื่อเป็นหลักฐานในการรับสินค้า *</p>
                        <div class="footer">
                            <p>ผู้ทำรายการ: ${deposit.created_by?.name || '-'}</p>
                            <p>© SILMIN SELLER System</p>
                        </div>
                    </div>
                    <script>
                        window.onload = function() {
                            window.print();
                            setTimeout(function() { window.close(); }, 500);
                        };
                    <\/script>
                </body>
                </html>
            `);
            printWindow.document.close();
        } catch (e) {
            console.error('Print Error:', e);
            showToast('เกิดข้อผิดพลาดในการพิมพ์', 'error');
        }
    }

    // ตัวกรองบนแถบควบคุม — เปลี่ยนแล้วยิงทันที
    if (depositFilterBranch) depositFilterBranch.addEventListener('change', loadDeposits);
    if (depositFilterStatus) depositFilterStatus.addEventListener('change', loadDeposits);

    // ช่องค้นหาต้องหน่วงก่อนยิง — เดิมผูก 'input' กับ loadDeposits ตรงๆ ทำให้ยิง API ทุกตัวอักษรที่พิมพ์
    // คำค้น 10 ตัวอักษร = 10 requests ทั้งที่ผู้ใช้ต้องการผลลัพธ์ชุดเดียว
    let depositSearchTimer = null;
    if (depositFilterSearch) {
        depositFilterSearch.addEventListener('input', () => {
            clearTimeout(depositSearchTimer);
            depositSearchTimer = setTimeout(loadDeposits, 300);
        });
    }

    // ตัวกรองในพาเนลละเอียด — ไม่ยิงทันทีตอนเปลี่ยน รอกด "ตกลง" (ไวยากรณ์เดียวกับพาเนลกรองหน้า #stock)
    if (btnDepositFilter) btnDepositFilter.addEventListener('click', openDepositFilterPanel);
    if (btnDepositFilterClose) btnDepositFilterClose.addEventListener('click', closeDepositFilterPanel);
    if (btnDepositFilterApply) {
        btnDepositFilterApply.addEventListener('click', () => {
            closeDepositFilterPanel();
            loadDeposits();
        });
    }
    if (btnDepositFilterReset) {
        btnDepositFilterReset.addEventListener('click', () => {
            closeDepositFilterPanel();
            resetAllDepositFilters();
        });
    }
    // คลิกพื้นที่มืดนอกพาเนล = ปิด (ไม่ใช้ค่าที่เพิ่งเลือก)
    if (depositFilterPanel) {
        depositFilterPanel.addEventListener('click', (e) => {
            if (e.target === depositFilterPanel) closeDepositFilterPanel();
        });
    }

    // Open/Close Modals Listeners
    if (btnOpenCreateDeposit) btnOpenCreateDeposit.addEventListener('click', openCreateDepositModal);
    if (btnCloseCreateDeposit) btnCloseCreateDeposit.addEventListener('click', closeCreateDepositModal);
    if (btnCancelCreateDeposit) btnCancelCreateDeposit.addEventListener('click', closeCreateDepositModal);
    if (btnCloseDepositDetails) btnCloseDepositDetails.addEventListener('click', closeDepositDetailsModal);
    if (btnCloseDepositDetailModal) btnCloseDepositDetailModal.addEventListener('click', closeDepositDetailsModal);

    // Split rows on forms toggle
    if (modalDepositProductId) {
        modalDepositProductId.addEventListener('change', (e) => {
            const productName = e.target.value.trim();

            const matched = window.masterDataCache && Array.isArray(window.masterDataCache.productNames)
                ? window.masterDataCache.productNames.find(x => x.name.toLowerCase() === productName.toLowerCase())
                : null;

            if (!matched && productName !== '') {
                showToast('ไม่พบสินค้า "' + productName + '" ในการตั้งค่าระบบ', 'error');
                e.target.value = '';
                return;
            }

            modalDepositProductPrice.value = '';
            populateDepositColorAndCapacity();
            updateDepositRemaining(modalDepositProductPrice, modalDepositAmount, modalDepositRemaining);
        });
    }

    const handleDepositVariationChange = () => {
        const productName = modalDepositProductId.value.trim();
        const colorName = modalDepositColor ? modalDepositColor.value.trim() : '';
        const capacityName = modalDepositCapacity ? modalDepositCapacity.value.trim() : '';

        if (!productName || !colorName || !capacityName) return;
        if (typeof allProductsCache === 'undefined' || !Array.isArray(allProductsCache)) return;

        const matchedProduct = allProductsCache.find(p => {
            if (p.name !== productName) return false;
            const pColorName = p.color_id && (typeof p.color_id === 'object' ? p.color_id.name : p.color_id);
            const pCapName = p.capacity_id && (typeof p.capacity_id === 'object' ? p.capacity_id.name : p.capacity_id);
            return pColorName === colorName && pCapName === capacityName;
        });

        if (matchedProduct) {
            modalDepositProductPrice.value = matchedProduct.price || 0;
            updateDepositRemaining(modalDepositProductPrice, modalDepositAmount, modalDepositRemaining);
        } else {
            // ยังไม่แจ้ง error ทันที เผื่อผู้ใช้ยังพิมพ์ไม่เสร็จ
            modalDepositProductPrice.value = '';
            updateDepositRemaining(modalDepositProductPrice, modalDepositAmount, modalDepositRemaining);
        }
    };

    if (modalDepositColor) {
        modalDepositColor.addEventListener('change', handleDepositVariationChange);
    }

    if (modalDepositCapacity) {
        modalDepositCapacity.addEventListener('change', handleDepositVariationChange);
    }

    if (modalDepositProductPrice) {
        modalDepositProductPrice.addEventListener('input', () => {
            updateDepositRemaining(modalDepositProductPrice, modalDepositAmount, modalDepositRemaining);
        });
    }

    if (modalDepositAmount) {
        modalDepositAmount.addEventListener('input', (e) => {
            updateDepositRemaining(modalDepositProductPrice, modalDepositAmount, modalDepositRemaining);
            const val = Number(e.target.value) || 0;
            handlePaymentMethodChange(modalDepositPaymentMethod, depositSplitRow, modalDepositCashAmount, modalDepositTransferAmount, val);
        });
    }

    if (modalDepositPaymentMethod) {
        modalDepositPaymentMethod.addEventListener('change', (e) => {
            const val = Number(modalDepositAmount.value) || 0;
            handlePaymentMethodChange(e.target, depositSplitRow, modalDepositCashAmount, modalDepositTransferAmount, val);
        });
    }

    if (detailPickupPaymentMethod) {
        detailPickupPaymentMethod.addEventListener('change', (e) => {
            const val = activeDeposit ? activeDeposit.remaining_amount : 0;
            handlePaymentMethodChange(e.target, detailPickupSplitRow, detailPickupCashAmount, detailPickupTransferAmount, val);
        });
    }

    if (btnDepositDetailPrint) {
        btnDepositDetailPrint.addEventListener('click', () => {
            if (activeDeposit) {
                printDepositSlip(activeDeposit._id);
            }
        });
    }

    // Submit Create Form
    if (depositForm) {
        depositForm.addEventListener('submit', async (e) => {
            e.preventDefault();

            const customer_name = modalDepositCustomerName.value.trim();
            const customer_phone = modalDepositCustomerPhone.value.trim();

            const productNameInput = modalDepositProductId.value.trim();
            const colorNameInput = modalDepositColor ? modalDepositColor.value.trim() : '';
            const capacityNameInput = modalDepositCapacity ? modalDepositCapacity.value.trim() : '';

            // ตรวจช่องบังคับเองทีละช่องตามลำดับที่เห็นบนหน้าจอ แล้วเตือนแบบ inline
            // (ฟอร์มตั้ง novalidate ไว้เหมือนฟอร์มเพิ่มสินค้า จึงต้องตรวจเองทั้งหมด
            //  ไม่งั้นช่องที่ติด required จะไม่ถูกบังคับเลย)
            // ใช้ window.highlightInvalidInput ตัวเดียวกับโมดัล "เพิ่มสินค้าใหม่" หน้า #stock
            const invalid = (el, msg) => {
                if (window.highlightInvalidInput) window.highlightInvalidInput(el, msg);
                else showToast(msg, 'error');
            };

            if (!customer_name) {
                invalid(modalDepositCustomerName, 'กรุณาระบุชื่อลูกค้า');
                return;
            }
            if (!customer_phone) {
                invalid(modalDepositCustomerPhone, 'กรุณาระบุเบอร์โทรลูกค้า');
                return;
            }
            if (!productNameInput) {
                invalid(modalDepositProductId, 'กรุณาเลือกสินค้าที่จอง');
                return;
            }
            if (modalDepositColor && !colorNameInput) {
                invalid(modalDepositColor, 'กรุณาเลือกสีสินค้า');
                return;
            }
            if (modalDepositCapacity && !capacityNameInput) {
                invalid(modalDepositCapacity, 'กรุณาเลือกความจุสินค้า');
                return;
            }
            if (!Number(modalDepositProductPrice.value)) {
                invalid(modalDepositProductPrice, 'กรุณาระบุราคาเต็มสินค้า');
                return;
            }
            if (!Number(modalDepositAmount.value)) {
                invalid(modalDepositAmount, 'กรุณาระบุยอดเงินมัดจำ');
                return;
            }
            if (!modalDepositAppointment.value) {
                invalid(modalDepositAppointment, 'กรุณาระบุวันที่นัดรับเครื่อง');
                return;
            }
            if (!modalDepositPaymentMethod.value) {
                invalid(modalDepositPaymentMethod, 'กรุณาเลือกช่องทางการชำระมัดจำ');
                return;
            }
            if (!modalDepositStage.value) {
                invalid(modalDepositStage, 'กรุณาเลือกขั้นตอนการดำเนินงาน');
                return;
            }

            if (typeof allProductsCache === 'undefined' || !Array.isArray(allProductsCache)) {
                showToast('ระบบขัดข้อง กรุณาลองใหม่อีกครั้ง', 'error');
                return;
            }

            // จับคู่ SKU จาก ชื่อสินค้า + สี + ความจุ (ใช้ชื่อแทน _id เพราะ input เป็น text)
            let matchedProduct = allProductsCache.find(p => {
                if (p.name !== productNameInput) return false;
                const pColorName = p.color_id && (typeof p.color_id === 'object' ? p.color_id.name : p.color_id);
                const pCapName = p.capacity_id && (typeof p.capacity_id === 'object' ? p.capacity_id.name : p.capacity_id);
                return pColorName === colorNameInput && pCapName === capacityNameInput;
            });

            // หากไม่พบ SKU ที่ตรง ให้หา fallback จากชื่อสินค้าเท่านั้น
            if (!matchedProduct) {
                matchedProduct = allProductsCache.find(p => p.name === productNameInput);
            }

            if (!matchedProduct) {
                showToast('ไม่พบสินค้า "' + productNameInput + '" ในระบบ กรุณาตรวจสอบการตั้งค่าสินค้า', 'error');
                return;
            }

            const product_id = matchedProduct._id;
            const colorName = colorNameInput;
            const capacityName = capacityNameInput;
            const product_name = [productNameInput, capacityName, colorName].filter(Boolean).join(' ').trim();

            const product_price = Number(modalDepositProductPrice.value) || 0;
            const deposit_amount = Number(modalDepositAmount.value) || 0;
            const appointment_date = modalDepositAppointment.value;
            const imei = modalDepositImei.value.trim();
            const payment_method = modalDepositPaymentMethod.value;
            const cash_amount = Number(modalDepositCashAmount.value) || 0;
            const transfer_amount = Number(modalDepositTransferAmount.value) || 0;
            const stage = modalDepositStage.value;
            const notes = modalDepositNotes.value.trim();

            if (payment_method === 'ผสม' && (cash_amount + transfer_amount !== deposit_amount)) {
                invalid(modalDepositCashAmount, 'ยอดเงินสดและยอดเงินโอนต้องรวมกันได้เท่ากับยอดมัดจำ');
                return;
            }

            const submitBtn = document.getElementById('btn-submit-deposit');
            submitBtn.disabled = true;
            submitBtn.innerHTML = '<i class="fa-solid fa-spinner fa-spin"></i> กำลังบันทึก...';

            try {
                let body = {
                    customer_name, customer_phone, product_id, product_name, product_price,
                    deposit_amount, appointment_date, imei, payment_method, stage, notes
                };
                if (payment_method === 'ผสม') {
                    body.cash_amount = cash_amount;
                    body.transfer_amount = transfer_amount;
                } else if (payment_method === 'เงินสด') {
                    body.cash_amount = deposit_amount;
                    body.transfer_amount = 0;
                } else {
                    body.cash_amount = 0;
                    body.transfer_amount = deposit_amount;
                }

                const token = localStorage.getItem('silmin_token');
                const response = await fetch('/api/deposits', {
                    method: 'POST',
                    headers: {
                        'Authorization': `Bearer ${token}`,
                        'Content-Type': 'application/json'
                    },
                    body: JSON.stringify(body)
                });

                const result = await response.json();
                if (result.success) {
                    showToast('บันทึกใบมัดจำสินค้าสำเร็จเรียบร้อยแล้ว!');
                    closeCreateDepositModal();
                    loadDeposits();
                } else {
                    showToast(result.message || 'เกิดข้อผิดพลาดในการบันทึก', 'error');
                }
            } catch (err) {
                console.error(err);
                showToast('ไม่สามารถติดต่อเซิร์ฟเวอร์ได้', 'error');
            } finally {
                submitBtn.disabled = false;
                submitBtn.innerHTML = '<i class="fa-solid fa-save"></i> บันทึกข้อมูล';
            }
        });
    }

    // Submit Handover Complete
    if (btnSubmitCompleteDeposit) {
        btnSubmitCompleteDeposit.addEventListener('click', async () => {
            if (!activeDeposit) return;

            const imeiSelect = document.getElementById('detail-assign-imei-select');
            let imeiValue = activeDeposit.imei;
            if ((!imeiValue || imeiValue.trim() === '') && imeiSelect) {
                imeiValue = imeiSelect.value.trim();
                if (!imeiValue) {
                    showToast('กรุณาระบุ IMEI ของเครื่องที่ส่งมอบ', 'error');
                    return;
                }
            }

            const method = detailPickupPaymentMethod.value;
            const cash = Number(detailPickupCashAmount.value) || 0;
            const transfer = Number(detailPickupTransferAmount.value) || 0;
            const remaining = activeDeposit.remaining_amount;

            if (method === 'ผสม' && (cash + transfer !== remaining)) {
                showToast('ยอดเงินสดและยอดเงินโอนต้องรวมกันเท่ากับยอดค้างชำระ: ฿' + remaining.toLocaleString(), 'error');
                return;
            }

            btnSubmitCompleteDeposit.disabled = true;
            btnSubmitCompleteDeposit.innerHTML = '<i class="fa-solid fa-spinner fa-spin"></i> กำลังส่งมอบ...';

            try {
                let body = {
                    final_payment_method: method,
                    imei: imeiValue
                };
                if (method === 'ผสม') {
                    body.final_cash_amount = cash;
                    body.final_transfer_amount = transfer;
                } else if (method === 'เงินสด') {
                    body.final_cash_amount = remaining;
                    body.final_transfer_amount = 0;
                } else {
                    body.final_cash_amount = 0;
                    body.final_transfer_amount = remaining;
                }

                const token = localStorage.getItem('silmin_token');
                const response = await fetch(`/api/deposits/${activeDeposit._id}/complete`, {
                    method: 'PUT',
                    headers: {
                        'Authorization': `Bearer ${token}`,
                        'Content-Type': 'application/json'
                    },
                    body: JSON.stringify(body)
                });

                const result = await response.json();
                if (result.success) {
                    showToast('ดำเนินการส่งมอบเครื่องและตัดสต็อกสำเร็จเรียบร้อยแล้ว!');
                    closeDepositDetailsModal();
                    loadDeposits();
                } else {
                    showToast(result.message || 'เกิดข้อผิดพลาดในการส่งมอบ', 'error');
                }
            } catch (err) {
                console.error(err);
                showToast('ไม่สามารถติดต่อเซิร์ฟเวอร์ได้', 'error');
            } finally {
                btnSubmitCompleteDeposit.disabled = false;
                btnSubmitCompleteDeposit.innerHTML = '<i class="fa-solid fa-circle-check"></i> ยืนยันส่งมอบและปิดบิลขาย';
            }
        });
    }

    // Submit Cancel Form
    if (btnSubmitCancelDeposit) {
        btnSubmitCancelDeposit.addEventListener('click', async () => {
            if (!activeDeposit) return;
            const reason = detailCancelReason.value.trim();
            if (!reason) {
                showToast('กรุณาระบุเหตุผลในการยกเลิกใบมัดจำ', 'error');
                return;
            }

            if (!confirm('ยืนยันในการยกเลิกใบมัดจำสินค้าใบนี้?')) return;

            btnSubmitCancelDeposit.disabled = true;
            btnSubmitCancelDeposit.innerHTML = '<i class="fa-solid fa-spinner fa-spin"></i> กำลังดำเนินการ...';

            try {
                const token = localStorage.getItem('silmin_token');
                const response = await fetch(`/api/deposits/${activeDeposit._id}/cancel`, {
                    method: 'PUT',
                    headers: {
                        'Authorization': `Bearer ${token}`,
                        'Content-Type': 'application/json'
                    },
                    body: JSON.stringify({ reason })
                });
                const result = await response.json();
                if (result.success) {
                    showToast('ยกเลิกใบจองมัดจำสินค้าเรียบร้อยแล้ว');
                    closeDepositDetailsModal();
                    loadDeposits();
                } else {
                    showToast(result.message || 'เกิดข้อผิดพลาด', 'error');
                }
            } catch (err) {
                console.error(err);
                showToast('ไม่สามารถติดต่อเซิร์ฟเวอร์ได้', 'error');
            } finally {
                btnSubmitCancelDeposit.disabled = false;
                btnSubmitCancelDeposit.innerHTML = '<i class="fa-solid fa-ban"></i> ยืนยันยกเลิกรายการจอง';
            }
        });
    }

    // Expose functions to window
    window.openDepositDetailsModal = openDepositDetailsModal;
    window.printDepositSlip = printDepositSlip;
    window.loadDeposits = loadDeposits;
    window.openCreateDepositModal = openCreateDepositModal;
    window.closeCreateDepositModal = closeCreateDepositModal;
    window.closeDepositDetailsModal = closeDepositDetailsModal;
    window.loadBranchesForDeposits = loadBranchesForDeposits;


})();
