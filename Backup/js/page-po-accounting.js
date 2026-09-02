// PO System + PO History + Accounting & Finance Module + Connected PO Workflow (แจ้งของถึงสาขา/ตรวจสอบนำเข้า ฝั่งเชื่อมกับ PO)
// แยกออกมาจาก script.js — โหลดแบบ dynamic เฉพาะตอนเปิดหน้า "ระบบสั่งซื้อ PO", "ตรวจรับของเข้า", "ระบบบัญชีและการเงิน", "แจ้งของถึงสาขา" หรือ "ตรวจสอบนำเข้า" ครั้งแรกเท่านั้น
// พึ่งพา window.authFetch, window.showToast, window.showConfirm, window.setPoRowValue, window.setSelectOptions,
// window.ensureMasterDataLoaded, window.fetchProducts, window.loadDashboardData, window.populateApproveImportBranchFilter,
// window.loadMyArrivalReports, window.checkedImeis/duplicateImeisDb/pendingChecks, API_BASE_URL (global จาก script.js)
(function () {
    // ==========================================
    // PO System Logic (ระบบสั่งซื้อและรับสินค้า)
    // ==========================================

    let poItemCount = 0;

    const calculatePOTotal = () => {
        const rows = document.querySelectorAll('.po-item-row');
        let totalItems = rows.length;
        let totalQty = 0;
        let grandTotal = 0;

        rows.forEach(row => {
            const qty = Number(row.querySelector('[name="po_item_qty"]').value) || 0;
            const cost = Number(row.querySelector('[name="po_item_cost"]').value) || 0;
            totalQty += qty;
            grandTotal += (qty * cost);
        });

        const elTotalItems = document.getElementById('po-total-items');
        const elTotalQty = document.getElementById('po-total-qty');
        const elGrandTotal = document.getElementById('po-grand-total');

        if (elTotalItems) elTotalItems.textContent = totalItems.toLocaleString();
        if (elTotalQty) elTotalQty.textContent = totalQty.toLocaleString();
        if (elGrandTotal) elGrandTotal.textContent = '฿' + grandTotal.toLocaleString();
    };

    // Note: window.initAccountingPO has been consolidated below to prevent duplicate declarations and overwriting issues.

    const addPoItemRow = () => {
        poItemCount++;
        const id = poItemCount;
        const container = document.getElementById('po-items-container');

        const row = document.createElement('div');
        row.className = 'p-4 border border-[#3F3F46] rounded-xl relative po-item-row hover:border-[#FFE169]/50 transition-colors ';

        const typeChips = (window.masterDataCache?.productTypes || []).map(t => t.name);
        const colorData = window.masterDataCache?.productColors || [];
        const colorSwatches = colorData.map(c => c.name || c);
        const capacityChips = (window.masterDataCache?.productCapacities || []).map(c => c.name || c);
        const unitChips = (window.masterDataCache?.productUnits || []).map(u => u.name);

        row.innerHTML = `
            <button type="button" class="btn-delete-row absolute top-2 right-2 w-6 h-6 rounded-md bg-[#222] text-red-500 hover:bg-red-500/20 flex items-center justify-center transition-all z-10"><i class="fa-solid fa-xmark text-[10px]"></i></button>
            
            <div class="flex flex-col gap-4">
                <!-- Hidden inputs to keep original JS functional -->
                <input type="hidden" name="po_item_code" value="">
                <select name="po_item_category" class="hidden"><option value=""></option>${typeChips.map(t => `<option value="${t}">${t}</option>`).join('')}</select>
                <select name="po_item_color" class="hidden"><option value=""></option>${colorSwatches.map(c => `<option value="${c}">${c}</option>`).join('')}</select>
                <select name="po_item_capacity" class="hidden"><option value=""></option>${capacityChips.map(c => `<option value="${c}">${c}</option>`).join('')}</select>
                <select name="po_item_unit" class="hidden"><option value=""></option>${unitChips.map(u => `<option value="${u}">${u}</option>`).join('')}</select>
                <input type="checkbox" name="po_item_track_imei" class="hidden" id="track_imei_${id}">

                <!-- ชื่อสินค้า -->
                <div class="space-y-2">
                    <label class="text-slate-200 font-medium flex items-center gap-2 text-xs"><i class="fa-solid fa-mobile-screen text-white"></i> ชื่อสินค้า <span class="text-red-500">*</span></label>
                    <div class="relative">
                        <select name="po_item_name" class="w-full px-4 py-2.5 rounded-xl bg-[#27272A] border border-[#3F3F46] text-white focus:border-[#FFE169] focus:outline-none transition-all text-sm appearance-none pr-10">
                            <option value="" selected>-- เลือกชื่อสินค้า --</option>
                            ${(window.masterDataCache?.productNames || []).map(x => `<option value="${x.name || x}">${x.name || x}</option>`).join('')}
                        </select>
                        <div class="absolute inset-y-0 right-0 flex items-center px-4 pointer-events-none text-slate-400">
                            <i class="fa-solid fa-chevron-down text-xs"></i>
                        </div>
                    </div>
                </div>

                <!-- หมวดหมู่สินค้า -->
                <div class="space-y-2">
                    <label class="text-slate-200 font-medium flex items-center gap-2 text-xs"><i class="fa-solid fa-layer-group text-white"></i> หมวดหมู่สินค้า</label>
                    <div class="flex flex-wrap gap-2 po-chip-group" data-target="po_item_category">
                        ${typeChips.map(t => `<button type="button" class="px-4 py-2.5 rounded-xl border border-[#3F3F46] bg-[#27272A] text-slate-300 text-sm hover:border-[#FFE169] hover:text-white transition-colors po-chip" data-value="${t}">${t}</button>`).join('')}
                    </div>
                </div>

                <!-- สี -->
                <div class="relative  w-full space-y-2">
                    <label class="text-slate-200 font-medium flex items-center gap-2 text-xs"><i class="fa-solid fa-palette text-white"></i> สี <span class="text-red-500">*</span></label>
                    <div class="flex items-center gap-3 overflow-x-auto hide-scrollbar py-2 px-8 w-full po-chip-group scroll-smooth" data-target="po_item_color">
                        <style>#po-items-container .po-chip-group::-webkit-scrollbar { display: none; } #po-items-container .hide-scrollbar { -ms-overflow-style: none; scrollbar-width: none; }</style>
                        ${colorData.map(c => {
            const name = c.name || c;
            const hex = window.resolveProductColorHex ? window.resolveProductColorHex(name, c) : '#6b7280';
            return `
                            <div class="flex flex-col items-center gap-1 cursor-pointer po-chip-color group shrink-0" data-value="${name}">
                                <div class="w-7 h-7 rounded-full border-2 border-transparent group-hover:scale-110 transition-all flex items-center justify-center color-ring relative shadow-sm" style="background-color: ${hex}">
                                </div>
                                <span class="text-[10px] text-slate-400 color-label transition-colors">${name}</span>
                            </div>`;
        }).join('')}
                    </div>
                    <button type="button" aria-label="ก่อนหน้า" onclick="this.parentElement.querySelector('.po-chip-group').scrollBy({left:-150, behavior:'smooth'})" class="absolute left-0 top-6 bottom-0 w-10 flex items-center justify-start bg-gradient-to-r from-[#18181B] via-[#18181B]/90 to-transparent pointer-events-none">
                        <div class="w-5 h-5 bg-[#3F3F46] hover:bg-[#FFE169] rounded-full flex items-center justify-center pointer-events-auto cursor-pointer shadow-md text-white hover:text-[#333333] transition-colors hover:scale-110 shrink-0">
                            <i class="fa-solid fa-chevron-left text-[10px]"></i>
                        </div>
                    </button>
                    <button type="button" aria-label="ถัดไป" onclick="this.parentElement.querySelector('.po-chip-group').scrollBy({left:150, behavior:'smooth'})" class="absolute right-0 top-6 bottom-0 w-10 flex items-center justify-end bg-gradient-to-l from-[#18181B] via-[#18181B]/90 to-transparent pointer-events-none">
                        <div class="w-5 h-5 bg-[#FFE169] rounded-full flex items-center justify-center pointer-events-auto cursor-pointer shadow-md text-[#333333] transition-transform hover:scale-110 shrink-0">
                            <i class="fa-solid fa-chevron-right text-[10px]"></i>
                        </div>
                    </button>
                </div>

                <!-- ความจุ -->
                <div class="space-y-2">
                    <label class="text-slate-200 font-medium flex items-center gap-2 text-xs"><i class="fa-solid fa-hard-drive text-white"></i> ความจุ</label>
                    <div class="flex flex-wrap gap-2 po-chip-group" data-target="po_item_capacity">
                        ${capacityChips.map(c => `<button type="button" class="px-4 py-2.5 rounded-xl border border-[#3F3F46] bg-[#27272A] text-slate-300 text-sm hover:border-[#FFE169] hover:text-white transition-colors po-chip min-w-[60px]" data-value="${c}">${c}</button>`).join('')}
                    </div>
                </div>

                <!-- ราคาทุน & ราคาขาย -->
                <div class="grid grid-cols-2 gap-5 pt-2">
                    <div class="space-y-2">
                        <label class="text-slate-200 font-medium flex items-center gap-2 text-xs"><i class="fa-solid fa-tag text-white"></i> ราคาทุน <span class="text-red-500">*</span></label>
                        <input type="number" name="po_item_cost" required min="0" placeholder="0" class="w-full px-4 py-2.5 rounded-xl bg-[#27272A] border border-[#3F3F46] text-white focus:border-[#FFE169] focus:outline-none transition-all placeholder-slate-500 text-sm">
                        <div class="flex gap-1.5 flex-wrap pt-1">
                            ${[15000, 20000, 27000, 35000].map(p => `<button type="button" class="px-2.5 py-1 bg-[#333] text-slate-300 rounded-full text-[11px] hover:text-[#FFE169] border border-transparent hover:border-[#FFE169] transition-all" onclick="const i = this.parentElement.previousElementSibling; i.value='${p}'; i.dispatchEvent(new Event('input'))">${p.toLocaleString()}</button>`).join('')}
                        </div>
                    </div>
                    <div class="space-y-2">
                        <label class="text-slate-200 font-medium flex items-center gap-2 text-xs"><i class="fa-solid fa-tags text-white"></i> ราคาขาย <span class="text-red-500">*</span></label>
                        <input type="number" name="po_item_sell" required min="0" placeholder="0" class="w-full px-4 py-2.5 rounded-xl bg-[#27272A] border border-[#3F3F46] text-white focus:border-[#FFE169] focus:outline-none transition-all placeholder-slate-500 text-sm">
                        <div class="flex gap-1.5 flex-wrap pt-1">
                            ${[15000, 20000, 27000, 35000].map(p => `<button type="button" class="px-2.5 py-1 bg-[#333] text-slate-300 rounded-full text-[11px] hover:text-[#FFE169] border border-transparent hover:border-[#FFE169] transition-all" onclick="this.parentElement.previousElementSibling.value='${p}'">${p.toLocaleString()}</button>`).join('')}
                        </div>
                    </div>
                </div>

                <!-- จำนวน & หน่วยนับ -->
                <div class="grid grid-cols-2 gap-5 items-start border-t border-[#3F3F46] pt-4 mt-2">
                    <div class="space-y-2">
                        <label class="text-slate-200 font-medium flex items-center gap-2 text-xs"><i class="fa-solid fa-cubes text-white"></i> จำนวน <span class="text-red-500">*</span></label>
                        <input type="number" name="po_item_qty" required min="1" value="1" class="w-full px-4 py-2.5 rounded-xl bg-[#27272A] border border-[#3F3F46] text-white focus:border-[#FFE169] focus:outline-none transition-all text-sm">
                    </div>
                    <div class="space-y-2">
                        <label class="text-slate-200 font-medium flex items-center gap-2 text-xs"><i class="fa-solid fa-box text-white"></i> หน่วยนับ <span class="text-red-500">*</span></label>
                        <div class="flex gap-2 po-chip-group" data-target="po_item_unit">
                            ${unitChips.map(u => `<button type="button" class="px-4 py-2.5 rounded-xl border border-[#3F3F46] bg-[#27272A] text-slate-300 text-sm hover:border-[#FFE169] hover:text-white transition-colors po-chip flex-1" data-value="${u}">${u}</button>`).join('')}
                        </div>
                    </div>
                </div>

                <!-- IMEI Tracking -->
                <div class="space-y-2">
                    <label class="text-slate-200 font-medium flex items-center gap-2 text-xs"><i class="fa-solid fa-barcode text-white"></i> สินค้านี้ต้องบันทึก IMEI (เช่น โทรศัพท์/แท็บเล็ต) <span class="text-red-500">*</span></label>
                    <div class="flex items-center gap-5 mt-2 po-radio-group" data-target="po_item_track_imei">
                        <label class="flex items-center gap-2 cursor-pointer group">
                            <div class="w-4 h-4 rounded-full border border-white/30 flex items-center justify-center group-hover:border-[#FFE169] transition-colors po-radio" data-value="true">
                                <div class="w-2 h-2 rounded-full bg-[#FFE169] opacity-0 indicator transition-opacity"></div>
                            </div>
                            <span class="text-[10px] text-white/60 group-hover:text-white/90">บันทึกเลข IMEI</span>
                        </label>
                        <label class="flex items-center gap-2 cursor-pointer group">
                            <div class="w-4 h-4 rounded-full border border-white/30 flex items-center justify-center group-hover:border-[#FFE169] transition-colors po-radio" data-value="false">
                                <div class="w-2 h-2 rounded-full bg-[#FFE169] opacity-0 indicator transition-opacity"></div>
                            </div>
                            <span class="text-[10px] text-white/60 group-hover:text-white/90">ไม่บันทึกเลข IMEI</span>
                        </label>
                    </div>
                </div>

                <div class="text-center text-xs text-slate-300 mt-2 p-2.5 bg-[#1f1f1f] rounded-xl border border-[#3F3F46]">
                     รวม: <span class="po-row-total text-white font-bold font-mono">฿0</span>
                </div>
            </div>
        `;
        container.appendChild(row);

        // --- Start of inline logic for Chips to Hidden Inputs ---

        // Generic text chips (Category, Capacity, Unit)
        row.querySelectorAll('.po-chip-group:not([data-target="po_item_color"])').forEach(group => {
            const targetName = group.getAttribute('data-target');
            const hiddenSelect = row.querySelector(`[name="${targetName}"]`);
            const chips = group.querySelectorAll('.po-chip');

            chips.forEach(chip => {
                chip.addEventListener('click', () => {
                    chips.forEach(c => {
                        c.classList.remove('border-[#FFE169]', 'text-[#FFE169]');
                        c.classList.add('border-[#3F3F46]', 'text-slate-300');
                    });
                    chip.classList.remove('border-[#3F3F46]', 'text-slate-300');
                    chip.classList.add('border-[#FFE169]', 'text-[#FFE169]');

                    if (hiddenSelect) {
                        hiddenSelect.value = chip.getAttribute('data-value');
                        hiddenSelect.dispatchEvent(new Event('change'));
                    }
                });
            });
        });

        // Color Swatches
        const colorGroup = row.querySelector('.po-chip-group[data-target="po_item_color"]');
        if (colorGroup) {
            const hiddenColorSelect = row.querySelector('[name="po_item_color"]');
            const colorChips = colorGroup.querySelectorAll('.po-chip-color');
            colorChips.forEach(chip => {
                chip.addEventListener('click', () => {
                    colorChips.forEach(c => {
                        c.querySelector('.color-ring').classList.remove('border-[#FFE169]', 'scale-110');
                        c.querySelector('.color-ring').classList.add('border-transparent');
                        c.querySelector('.color-label').classList.remove('text-[#FFE169]', 'text-[13px]');
                        c.querySelector('.color-label').classList.add('text-slate-400', 'text-[10px]');
                    });
                    chip.querySelector('.color-ring').classList.remove('border-transparent');
                    chip.querySelector('.color-ring').classList.add('border-[#FFE169]', 'scale-110');
                    chip.querySelector('.color-label').classList.remove('text-slate-400', 'text-[10px]');
                    chip.querySelector('.color-label').classList.add('text-[#FFE169]', 'text-[13px]');

                    if (hiddenColorSelect) {
                        hiddenColorSelect.value = chip.getAttribute('data-value');
                        hiddenColorSelect.dispatchEvent(new Event('change'));
                    }
                });
            });
        }

        // Radio Buttons (IMEI Tracking)
        const radioGroup = row.querySelector('.po-radio-group');
        if (radioGroup) {
            const hiddenImeiCheck = row.querySelector('[name="po_item_track_imei"]');
            const radios = radioGroup.querySelectorAll('.po-radio');
            radios.forEach(radio => {
                radio.parentElement.addEventListener('click', () => {
                    radios.forEach(r => {
                        r.classList.remove('border-[#FFE169]', 'active');
                        r.classList.add('border-white/30');
                        r.querySelector('.indicator').classList.remove('opacity-100');
                        r.querySelector('.indicator').classList.add('opacity-0');
                        r.nextElementSibling.classList.remove('text-white/90');
                        r.nextElementSibling.classList.add('text-white/60');
                    });
                    radio.classList.remove('border-white/30');
                    radio.classList.add('border-[#FFE169]', 'active');
                    radio.querySelector('.indicator').classList.remove('opacity-0');
                    radio.querySelector('.indicator').classList.add('opacity-100');
                    radio.nextElementSibling.classList.remove('text-white/60');
                    radio.nextElementSibling.classList.add('text-white/90');

                    if (hiddenImeiCheck) {
                        hiddenImeiCheck.checked = (radio.getAttribute('data-value') === 'true');
                        hiddenImeiCheck.dispatchEvent(new Event('change'));
                    }
                });
            });
        }

        // --- End of inline logic ---

        // Attach event listener for delete row
        const deleteBtn = row.querySelector('.btn-delete-row');
        if (deleteBtn) {
            deleteBtn.addEventListener('click', () => {
                row.remove();
                calculatePOTotal();
            });
        }

        // Attach events for calculation
        const inputQty = row.querySelector('[name="po_item_qty"]');
        const inputCost = row.querySelector('[name="po_item_cost"]');
        const labelTotal = row.querySelector('.po-row-total');
        const inputCode = row.querySelector('[name="po_item_code"]');
        const inputName = row.querySelector('[name="po_item_name"]');

        const updateRowTotal = () => {
            const q = Number(inputQty.value) || 0;
            const c = Number(inputCost.value) || 0;
            labelTotal.textContent = '฿' + (q * c).toLocaleString();
            calculatePOTotal();
        };

        inputQty.addEventListener('input', updateRowTotal);
        inputCost.addEventListener('input', updateRowTotal);

        // Auto-fill logic when SKU changes
        inputCode.addEventListener('change', (e) => {
            const val = e.target.value.trim();
            if (!val || typeof allProductsCache === 'undefined') return;
            const product = allProductsCache.find(p => p.product_code === val);
            if (product) {
                setPoRowValue(row, 'po_item_name', product.name);
            }
        });

        // Auto-fill logic when Name changes
        inputName.addEventListener('change', (e) => {
            const val = e.target.value.trim();

            // If the name is completely deleted/empty
            if (!val) {
                const elCode = row.querySelector('[name="po_item_code"]');
                if (elCode) elCode.value = '';
                return;
            }

            let foundMatch = false;
            let hasMasterCode = false;
            let masterCode = '';

            // Check if name has a code in Master Data
            if (window.masterDataCache && window.masterDataCache.productNames) {
                const matchedName = window.masterDataCache.productNames.find(x => x.name === val);
                if (matchedName && matchedName.code) {
                    masterCode = matchedName.code;
                    hasMasterCode = true;
                    const el = row.querySelector('[name="po_item_code"]');
                    if (el) el.value = masterCode;
                    foundMatch = true;
                }
            }

            // Check if name matches an existing product in cache for auto-fill of SKU only
            if (typeof allProductsCache !== 'undefined') {
                const product = allProductsCache.find(p => p.name === val);
                if (product) {
                    // Only fill code if this product name actually has a code in Master Data
                    if (hasMasterCode) {
                        setPoRowValue(row, 'po_item_code', product.product_code || masterCode);
                    } else {
                        setPoRowValue(row, 'po_item_code', '');
                    }
                    foundMatch = true;
                }
            }

            // If we changed to a name that does not have an existing SKU code or master code
            if (!foundMatch || !hasMasterCode) {
                const elCode = row.querySelector('[name="po_item_code"]');
                if (elCode) elCode.value = '';
            }
        });

        calculatePOTotal();
    };

    if (document.getElementById('btn-add-po-item')) {
        document.getElementById('btn-add-po-item').addEventListener('click', addPoItemRow);
    }

    // Highlight ช่องที่ไม่ผ่าน validation ด้วย inline error (แดง + ข้อความใต้ช่อง) — รูปแบบเดียวกับ Add Product
    // displayElement = element ที่จะใส่กรอบแดง/ข้อความต่อท้าย, watchElement = element ที่ต้องฟัง input/change เพื่อล้าง highlight
    const highlightPoInvalid = (displayElement, watchElement, toastMsg, isButton) => {
        if (!displayElement || !watchElement) return;
        showToast(toastMsg, 'error');

        if (displayElement.focus && typeof displayElement.focus === 'function' && displayElement.tagName !== 'DIV') {
            displayElement.focus();
        } else if (displayElement.scrollIntoView) {
            displayElement.scrollIntoView({ behavior: 'smooth', block: 'center' });
        }

        // ล้าง highlight/ข้อความเดิมก่อนตรวจใหม่ทุกครั้ง
        document.querySelectorAll('.invalid-highlight').forEach(el => {
            el.classList.remove('!border-red-500', '!ring-2', '!ring-red-500/20', 'invalid-highlight');
        });
        document.querySelectorAll('.invalid-inline-msg').forEach(el => el.remove());

        displayElement.classList.add('!border-red-500', '!ring-2', '!ring-red-500/20', 'invalid-highlight');
        if (displayElement.tagName === 'DIV') {
            displayElement.classList.add('p-2', 'rounded-xl'); // ให้กรอบแดงมีที่หายใจ ไม่ชิดชิพ/ปุ่มข้างใน
        }

        const errorText = document.createElement('p');
        errorText.className = 'invalid-inline-msg text-red-500 text-[11px] mt-1.5 ml-1 font-medium animate-pulse';
        const prefixMsg = isButton ? 'กรุณาเลือกข้อมูล' : 'กรุณากรอกข้อมูล';
        errorText.innerHTML = `<i class="fa-solid fa-circle-exclamation mr-1"></i> ${prefixMsg}`;
        displayElement.parentNode.insertBefore(errorText, displayElement.nextSibling);

        const removeHighlight = () => {
            displayElement.classList.remove('!border-red-500', '!ring-2', '!ring-red-500/20', 'invalid-highlight');
            if (errorText.parentNode) errorText.remove();
            watchElement.removeEventListener('input', removeHighlight);
            watchElement.removeEventListener('change', removeHighlight);
            displayElement.removeEventListener('click', removeHighlight);
        };
        watchElement.addEventListener('input', removeHighlight);
        watchElement.addEventListener('change', removeHighlight);
        displayElement.addEventListener('click', removeHighlight);
    };

    if (document.getElementById('form-create-po')) {
        document.getElementById('form-create-po').addEventListener('submit', async (e) => {
            e.preventDefault();

            const supplierEl = document.getElementById('po-supplier');
            const branchEl = document.getElementById('po-branch');
            const supplier_name = supplierEl.value;
            const branch_id = branchEl.value;

            if (!supplier_name) {
                return highlightPoInvalid(supplierEl, supplierEl, 'กรุณาเลือก Supplier / แหล่งที่มา', true);
            }
            if (!branch_id) {
                return highlightPoInvalid(branchEl, branchEl, 'กรุณาเลือกสาขาปลายทาง', true);
            }

            const rows = document.querySelectorAll('.po-item-row');

            if (rows.length === 0) {
                return showToast('กรุณาเพิ่มรายการสินค้าอย่างน้อย 1 รายการ', 'error');
            }

            const items = [];
            for (let row of rows) {
                const nameEl = row.querySelector('[name="po_item_name"]');
                if (!nameEl.value) {
                    return highlightPoInvalid(nameEl, nameEl, 'กรุณาเลือกชื่อสินค้า', true);
                }

                const colorEl = row.querySelector('[name="po_item_color"]');
                const colorContainer = row.querySelector('.po-chip-group[data-target="po_item_color"]');
                if (!colorEl.value) {
                    return highlightPoInvalid(colorContainer, colorEl, 'กรุณาเลือกสีสินค้า', true);
                }

                const costEl = row.querySelector('[name="po_item_cost"]');
                if (!costEl.value.trim()) {
                    return highlightPoInvalid(costEl, costEl, 'กรุณากรอกราคาทุน', false);
                }

                const sellEl = row.querySelector('[name="po_item_sell"]');
                if (!sellEl.value.trim()) {
                    return highlightPoInvalid(sellEl, sellEl, 'กรุณากรอกราคาขาย', false);
                }

                const qtyEl = row.querySelector('[name="po_item_qty"]');
                if (!qtyEl.value.trim()) {
                    return highlightPoInvalid(qtyEl, qtyEl, 'กรุณากรอกจำนวน', false);
                }

                const unitEl = row.querySelector('[name="po_item_unit"]');
                const unitContainer = row.querySelector('.po-chip-group[data-target="po_item_unit"]');
                if (!unitEl.value) {
                    return highlightPoInvalid(unitContainer, unitEl, 'กรุณาเลือกหน่วยนับ', true);
                }

                const imeiGroup = row.querySelector('.po-radio-group[data-target="po_item_track_imei"]');
                const imeiCheck = row.querySelector('[name="po_item_track_imei"]');
                if (imeiGroup && !imeiGroup.querySelector('.po-radio.active')) {
                    return highlightPoInvalid(imeiGroup, imeiCheck, 'กรุณาเลือกว่าต้องบันทึก IMEI หรือไม่', true);
                }

                let product_code = row.querySelector('[name="po_item_code"]').value.trim();
                if (!product_code) {
                    // หากไม่ได้กรอก SKU ระบบจะสุ่มรหัสให้อัตโนมัติ เพื่อนำไปใช้ติดตามสต็อกสินค้าอย่างถูกต้อง
                    product_code = 'SKU-' + Date.now().toString().slice(-6) + Math.floor(100 + Math.random() * 900);
                }
                items.push({
                    product_name: nameEl.value,
                    product_code: product_code,
                    category: row.querySelector('[name="po_item_category"]').value,
                    color: colorEl.value,
                    capacity: row.querySelector('[name="po_item_capacity"]').value,
                    unit: unitEl.value,
                    ordered_qty: Number(qtyEl.value),
                    cost_price: Number(costEl.value),
                    selling_price: Number(sellEl.value),
                    track_imei: imeiCheck.checked
                });
            }

            try {
                const url = editingPOId
                    ? `${API_BASE_URL}/purchase-orders/${editingPOId}/update`
                    : `${API_BASE_URL}/purchase-orders`;

                const res = await authFetch(url, {
                    method: 'POST',
                    headers: { 'Content-Type': 'application/json' },
                    body: JSON.stringify({ supplier_name, branch_id, items })
                });
                const json = await res.json();
                if (json.success) {
                    showToast(editingPOId ? 'แก้ไขใบสั่งซื้อสำเร็จ' : 'สร้างใบสั่งซื้อสำเร็จ');
                    stopEditingPO();
                    loadPOHistory(); // Refresh history cache
                    switchPoTab('history');
                } else {
                    showToast(json.message, 'error');
                }
            } catch (err) {
                console.error(err);
                showToast('เกิดข้อผิดพลาด', 'error');
            }
        });
    }

    // ==========================================
    // PO History & Printing System
    // ==========================================
    let poHistoryCache = [];
    let editingPOId = null;

    const startEditingPO = (po) => {
        editingPOId = po._id;

        // Switch to create tab
        switchPoTab('create');

        // Update Title/Submit Button text
        const btnCreate = document.getElementById('tab-btn-create-po');
        if (btnCreate) {
            btnCreate.innerHTML = `<i class="fa-solid fa-pen-to-square mr-1.5"></i>แก้ไขใบสั่งซื้อ`;
        }

        const textSubmit = document.getElementById('text-submit-po');
        if (textSubmit) textSubmit.textContent = 'บันทึกการแก้ไขใบสั่งซื้อ';

        const cancelEditBtn = document.getElementById('btn-cancel-edit-po');
        if (cancelEditBtn) cancelEditBtn.classList.remove('hidden');

        // Populate Supplier and Branch
        document.getElementById('po-supplier').value = po.supplier_name;
        document.getElementById('po-branch').value = po.branch_id?._id || po.branch_id || '';

        // Clear items container
        const container = document.getElementById('po-items-container');
        container.innerHTML = '';

        // Populate Items
        if (po.items && po.items.length > 0) {
            po.items.forEach(item => {
                addPoItemRow();
                const rows = container.querySelectorAll('.po-item-row');
                const row = rows[rows.length - 1];

                // Populate fields in this row
                setPoRowValue(row, 'po_item_name', item.product_name || '');
                setPoRowValue(row, 'po_item_code', item.product_code || '');
                setPoRowValue(row, 'po_item_category', item.category || '');
                setPoRowValue(row, 'po_item_color', item.color || '');
                setPoRowValue(row, 'po_item_capacity', item.capacity || '');
                setPoRowValue(row, 'po_item_unit', item.unit || '');
                setPoRowValue(row, 'po_item_qty', item.ordered_qty || 1);
                setPoRowValue(row, 'po_item_cost', item.cost_price || 0);
                setPoRowValue(row, 'po_item_sell', item.selling_price || 0);
                const checkImei = row.querySelector('[name="po_item_track_imei"]');
                if (checkImei) {
                    checkImei.checked = !!item.track_imei;
                    // ซิงค์ปุ่มเลือก IMEI ในหน้าจอให้ตรงกับค่าจริงของ PO เดิม (ไม่งั้นตอนแก้ไขจะดูเหมือนยังไม่ได้เลือก)
                    const imeiGroup = row.querySelector('.po-radio-group[data-target="po_item_track_imei"]');
                    if (imeiGroup) {
                        const targetValue = String(!!item.track_imei);
                        imeiGroup.querySelectorAll('.po-radio').forEach(r => {
                            const isMatch = r.getAttribute('data-value') === targetValue;
                            r.classList.toggle('border-[#FFE169]', isMatch);
                            r.classList.toggle('active', isMatch);
                            r.classList.toggle('border-white/30', !isMatch);
                            r.querySelector('.indicator').classList.toggle('opacity-100', isMatch);
                            r.querySelector('.indicator').classList.toggle('opacity-0', !isMatch);
                            r.nextElementSibling.classList.toggle('text-white/90', isMatch);
                            r.nextElementSibling.classList.toggle('text-white/60', !isMatch);
                        });
                    }
                }

                // Trigger calculation
                const event = new Event('input');
                row.querySelector('[name="po_item_qty"]').dispatchEvent(event);
            });
        }
    };

    const stopEditingPO = () => {
        editingPOId = null;

        const btnCreate = document.getElementById('tab-btn-create-po');
        if (btnCreate) {
            btnCreate.innerHTML = `<i class="fa-solid fa-plus mr-1.5"></i>สร้างใบสั่งซื้อ`;
        }

        const textSubmit = document.getElementById('text-submit-po');
        if (textSubmit) textSubmit.textContent = 'สร้างใบสั่งซื้อ';

        const cancelEditBtn = document.getElementById('btn-cancel-edit-po');
        if (cancelEditBtn) cancelEditBtn.classList.add('hidden');

        document.getElementById('form-create-po').reset();
        document.getElementById('po-items-container').innerHTML = '';
        addPoItemRow();
        calculatePOTotal();
    };

    if (document.getElementById('btn-cancel-edit-po')) {
        document.getElementById('btn-cancel-edit-po').addEventListener('click', stopEditingPO);
    }

    // Switch between PO tabs
    const switchPoTab = (tabName) => {
        const btnCreate = document.getElementById('tab-btn-create-po');
        const btnHistory = document.getElementById('tab-btn-po-history');
        const contentCreate = document.getElementById('tab-content-create-po');
        const contentHistory = document.getElementById('tab-content-po-history');

        if (!btnCreate || !btnHistory || !contentCreate || !contentHistory) return;

        if (tabName === 'create') {
            contentCreate.classList.remove('opacity-0', 'pointer-events-none');
            contentHistory.classList.add('hidden');

            btnCreate.className = 'px-5 py-2.5 rounded-lg text-sm font-semibold transition-all duration-200 bg-primary text-on-primary';
            btnHistory.className = 'px-5 py-2.5 rounded-lg text-sm font-semibold transition-all duration-200 text-body-muted hover:text-ink hover:bg-surface-chip/50';
        } else {
            contentCreate.classList.add('opacity-0', 'pointer-events-none');
            contentHistory.classList.remove('hidden');

            btnHistory.className = 'px-5 py-2.5 rounded-lg text-sm font-semibold transition-all duration-200 bg-primary text-on-primary';
            btnCreate.className = 'px-5 py-2.5 rounded-lg text-sm font-semibold transition-all duration-200 text-body-muted hover:text-ink hover:bg-surface-chip/50';

            loadPOHistory();
        }
    };

    if (document.getElementById('tab-btn-create-po')) {
        document.getElementById('tab-btn-create-po').addEventListener('click', () => switchPoTab('create'));
    }
    if (document.getElementById('tab-btn-po-history')) {
        document.getElementById('tab-btn-po-history').addEventListener('click', () => switchPoTab('history'));
    }

    if (document.getElementById('btn-refresh-po-history')) {
        document.getElementById('btn-refresh-po-history').addEventListener('click', () => loadPOHistory());
    }

    const handlePOFilterChange = () => {
        renderPOHistoryTable();
    };

    if (document.getElementById('search-po-history')) {
        document.getElementById('search-po-history').addEventListener('input', handlePOFilterChange);
    }
    if (document.getElementById('filter-po-status')) {
        document.getElementById('filter-po-status').addEventListener('change', handlePOFilterChange);
    }
    if (document.getElementById('filter-po-branch')) {
        document.getElementById('filter-po-branch').addEventListener('change', handlePOFilterChange);
    }
    if (document.getElementById('filter-po-supplier')) {
        document.getElementById('filter-po-supplier').addEventListener('change', handlePOFilterChange);
    }

    // Skeleton loading แถวตารางประวัติการสั่งซื้อ — ใช้โทนเดียวกับ skeleton หน้าจัดการสต็อก
    // (bg-[#5c5c5c] + animate-pulse) ให้จังหวะกระพริบของทั้งระบบเป็นแบบเดียวกัน
    const renderPOHistorySkeleton = (rowCount = 6) => {
        const tbody = document.getElementById('table-body-po-history');
        if (!tbody) return;
        const bar = (widthClass, extraClass = '') => `<div class="h-3.5 ${widthClass} rounded-full bg-[#5c5c5c] animate-pulse ${extraClass}"></div>`;
        let rowsHtml = '';
        for (let i = 0; i < rowCount; i++) {
            rowsHtml += `
                <tr>
                    <td class="px-6 py-4">${bar('w-20')}</td>
                    <td class="px-6 py-4">${bar('w-16')}</td>
                    <td class="px-6 py-4">${bar('w-28')}</td>
                    <td class="px-6 py-4">${bar('w-24')}</td>
                    <td class="px-6 py-4 text-right">${bar('w-16 ml-auto')}</td>
                    <td class="px-6 py-4 text-center">
                        <div class="h-5 w-20 mx-auto rounded-[0.375rem] bg-[#5c5c5c] animate-pulse"></div>
                    </td>
                    <td class="px-6 py-4 text-right">
                        <div class="flex items-center justify-end gap-1">
                            <div class="w-8 h-8 rounded-lg bg-[#5c5c5c] animate-pulse"></div>
                            <div class="w-8 h-8 rounded-lg bg-[#5c5c5c] animate-pulse"></div>
                        </div>
                    </td>
                </tr>
            `;
        }
        tbody.innerHTML = rowsHtml;
    };

    const loadPOHistory = async () => {
        const tbody = document.getElementById('table-body-po-history');
        if (!tbody) return;
        renderPOHistorySkeleton();

        try {
            const res = await authFetch(`${API_BASE_URL}/purchase-orders`);
            const json = await res.json();
            if (json.success) {
                poHistoryCache = json.data || [];

                // Populate filters from unique values in history (except status which is static)
                const branchFilter = document.getElementById('filter-po-branch');
                const supplierFilter = document.getElementById('filter-po-supplier');

                if (branchFilter && poHistoryCache.length > 0) {
                    const uniqueBranches = [...new Set(poHistoryCache.filter(p => p.branch_id && p.branch_id.name).map(p => p.branch_id.name))];
                    const currentBranch = branchFilter.value;
                    branchFilter.innerHTML = '<option value="">เลือกสาขา</option>' + uniqueBranches.map(b => `<option value="${b}">${b}</option>`).join('');
                    branchFilter.value = currentBranch;
                }

                if (supplierFilter && poHistoryCache.length > 0) {
                    const uniqueSuppliers = [...new Set(poHistoryCache.filter(p => p.supplier_name).map(p => p.supplier_name))];
                    const currentSupplier = supplierFilter.value;
                    supplierFilter.innerHTML = '<option value="">ซัพพลายเออร์</option>' + uniqueSuppliers.map(s => `<option value="${s}">${s}</option>`).join('');
                    supplierFilter.value = currentSupplier;
                }

                renderPOHistoryTable();
            } else {
                tbody.innerHTML = `<tr><td colspan="7" class="text-center py-6 text-red-400">ดึงข้อมูลไม่สำเร็จ: ${json.message}</td></tr>`;
            }
        } catch (err) {
            console.error('Error loading PO history:', err);
            tbody.innerHTML = '<tr><td colspan="7" class="text-center py-6 text-red-400">เกิดข้อผิดพลาดในการดึงข้อมูล</td></tr>';
        }
    };

    const updateActiveFilterChip = () => {
        const status = document.getElementById('filter-po-status')?.value;
        const branch = document.getElementById('filter-po-branch')?.value;
        const supplier = document.getElementById('filter-po-supplier')?.value;

        let texts = [];
        if (status) texts.push(`สถานะ:${status}`);
        if (branch) texts.push(`สาขา:${branch}`);
        if (supplier) texts.push(`ซัพพลายเออร์:${supplier}`);

        const textSpan = document.getElementById('po-active-filter-text');
        const container = document.getElementById('po-active-filters-container');

        if (textSpan && container) {
            if (texts.length > 0) {
                textSpan.textContent = texts.join(', ');
                container.style.display = 'flex';
            } else {
                textSpan.textContent = 'สถานะ:ทั้งหมด';
                container.style.display = 'flex';
            }
        }
    };

    const renderPOHistoryTable = () => {
        const tbody = document.getElementById('table-body-po-history');
        if (!tbody) return;

        updateActiveFilterChip();

        const query = (document.getElementById('search-po-history')?.value || '').trim().toLowerCase();
        const statusFilter = document.getElementById('filter-po-status')?.value || '';
        const branchFilter = document.getElementById('filter-po-branch')?.value || '';
        const supplierFilter = document.getElementById('filter-po-supplier')?.value || '';

        tbody.innerHTML = '';
        const filtered = poHistoryCache.filter(po => {
            const poNum = (po.po_number || '').toLowerCase();
            const supplier = (po.supplier_name || '').toLowerCase();
            const branchName = (po.branch_id && po.branch_id.name) ? po.branch_id.name : '';

            const matchSearch = poNum.includes(query) || supplier.includes(query);
            const matchStatus = statusFilter === '' || po.status === statusFilter;
            const matchBranch = branchFilter === '' || branchName === branchFilter;
            const matchSupplier = supplierFilter === '' || po.supplier_name === supplierFilter;

            return matchSearch && matchStatus && matchBranch && matchSupplier;
        });

        const countLabel = document.getElementById('po-history-total-count');
        if (countLabel) countLabel.textContent = filtered.length;

        if (filtered.length === 0) {
            tbody.innerHTML = '<tr><td colspan="7" class="px-6 py-8 text-center text-slate-400 italic">ไม่มีรายการใบสั่งซื้อ</td></tr>';
            return;
        }

        filtered.forEach(po => {
            const tr = document.createElement('tr');
            tr.className = 'hover:bg-[#464646] transition-colors';

            // Format date
            let dateStr = '-';
            if (po.createdAt) {
                const date = new Date(po.createdAt);
                const day = date.getDate().toString().padStart(2, '0');
                const month = (date.getMonth() + 1).toString().padStart(2, '0');
                const year = date.getFullYear() + 543; // Buddhist Era
                dateStr = `${day}/${month}/${year}`;
            }

            const branchName = (po.branch_id && po.branch_id.name) ? po.branch_id.name : '-';

            // Total values
            let totalAmount = 0;
            let totalQty = 0;
            if (po.items && po.items.length > 0) {
                po.items.forEach(item => {
                    totalAmount += (item.cost_price || 0) * (item.ordered_qty || 0);
                    totalQty += item.ordered_qty || 0;
                });
            }

            // Status Badge (dot + pill) — สีไล่ตามลำดับสถานะจริงของ PO (ต้องตรงกับ enum ใน models/index.js)
            const statusStyles = {
                'รอจัดส่ง': { dot: 'bg-sky-500', badge: 'bg-sky-500/10', text: 'text-sky-400' },
                'ของถึงสาขาแล้ว': { dot: 'bg-blue-500', badge: 'bg-blue-500/10', text: 'text-blue-400' },
                'กำลังตรวจรับ': { dot: 'bg-amber-500', badge: 'bg-amber-500/10', text: 'text-amber-400' },
                'นำเข้าสำเร็จ': { dot: 'bg-[#20D500]', badge: 'bg-[#42A231]/[0.12]', text: 'text-[#20D500]' },
                'ยกเลิก': { dot: 'bg-[#FE0000]', badge: 'bg-[#FE0000]/[0.12]', text: 'text-[#FE0000]' }
            };
            const st = statusStyles[po.status] || { dot: 'bg-slate-400', badge: 'bg-white/5', text: 'text-slate-300' };

            tr.innerHTML = `
                <td class="px-6 py-4 text-white text-sm whitespace-nowrap">
                    <i class="fa-regular fa-clock text-white/70 mr-1.5"></i>${dateStr}
                </td>
                <td class="px-6 py-4 font-mono font-semibold text-[#FFE169] whitespace-nowrap">${po.po_number || '-'}</td>
                <td class="px-6 py-4 text-white font-medium whitespace-nowrap">${po.supplier_name || '-'}</td>
                <td class="px-6 py-4 text-white text-sm whitespace-nowrap">
                    <i class="fa-solid fa-location-dot text-white/70 mr-1.5"></i>${branchName}
                </td>
                <td class="px-6 py-4 text-right font-mono text-white whitespace-nowrap">฿${totalAmount.toLocaleString()}</td>
                <td class="px-6 py-4 text-center whitespace-nowrap">
                    <div class="inline-flex items-center gap-2 px-2.5 py-1 rounded-[0.375rem] ${st.badge}">
                        <div class="w-2 h-2 rounded-full ${st.dot}"></div>
                        <span class="${st.text} font-medium text-xs">${po.status || '-'}</span>
                    </div>
                </td>
                <td class="px-6 py-4 text-right whitespace-nowrap">
                    <div class="flex items-center justify-end gap-1">
                        <button class="btn-view-po text-white hover:text-indigo-400 transition-colors p-2" title="รายละเอียดใบ PO">
                            <i class="fa-solid fa-eye"></i>
                        </button>
                        ${po.status === 'รอจัดส่ง' || po.status === 'สั่งซื้อแล้ว' ? `
                            <button class="btn-cancel-po text-white hover:text-red-400 transition-colors p-2" title="ยกเลิกใบ PO">
                                <i class="fa-solid fa-trash-can"></i>
                            </button>
                        ` : ''}
                        <button class="btn-print-po text-white hover:text-amber-400 transition-colors p-2" title="พิมพ์ใบ PO">
                            <i class="fa-solid fa-print"></i>
                        </button>
                    </div>
                </td>
            `;

            tr.querySelector('.btn-view-po').addEventListener('click', () => {
                openViewPOModal(po);
            });

            tr.querySelector('.btn-print-po').addEventListener('click', () => {
                const encodedData = encodeURIComponent(JSON.stringify(po));
                window.open(`po-print.html?data=${encodedData}`, '_blank');
            });

            const cancelBtn = tr.querySelector('.btn-cancel-po');
            if (cancelBtn) {
                cancelBtn.addEventListener('click', () => {
                    showConfirm(
                        'ยืนยันการยกเลิกใบสั่งซื้อ',
                        `คุณแน่ใจหรือไม่ว่าต้องการยกเลิกใบสั่งซื้อ <strong class="text- font-mono">${po.po_number}</strong>?<br><span class="text-body-muted text-xs">การดำเนินการนี้จะไม่สามารถแก้ไขกลับมาใช้งานได้อีก</span>`,
                        async () => {
                            try {
                                const res = await authFetch(`${API_BASE_URL}/purchase-orders/${po._id}/cancel`, {
                                    method: 'POST'
                                });
                                const json = await res.json();
                                if (json.success) {
                                    showToast('ยกเลิกใบสั่งซื้อเรียบร้อยแล้ว');
                                    loadPOHistory();
                                } else {
                                    showToast(json.message, 'error');
                                }
                            } catch (e) {
                                console.error(e);
                                showToast('เกิดข้อผิดพลาดในการยกเลิกใบสั่งซื้อ', 'error');
                            }
                        },
                        'ยืนยันการยกเลิก',
                        'danger'
                    );
                });
            }

            tbody.appendChild(tr);
        });
    };

    window.initAccountingPO = async () => {
        // Default view to history
        switchPoTab('history');

        // Populate branches list for selection in form (in case not loaded yet)
        const poBranchEl = document.getElementById('po-branch');
        if (poBranchEl) {
            try {
                const response = await authFetch(`${API_BASE_URL}/branches`);
                const json = await response.json();
                if (json.success) {
                    setSelectOptions(poBranchEl, json.data.map(b => ({ value: String(b._id), label: b.name })), '-- เลือกสาขา --');
                }
            } catch (e) {
                console.error('Error loading branches in PO initialization:', e);
            }
        }

        // Fetch master data if not loaded yet
        await ensureMasterDataLoaded();

        const md = window.masterDataCache || {};

        // Populate Suppliers Dropdown
        const poSupplier = document.getElementById('po-supplier');
        if (poSupplier && md.suppliers) {
            poSupplier.innerHTML = '<option value="" disabled selected>-- เลือกผู้จัดจำหน่าย --</option>' +
                md.suppliers.map(x => `<option value="${x.name}">${x.name}</option>`).join('');
        }

        // Populate Datalists
        const populateDL = (id, arr) => {
            const dl = document.getElementById(id);
            if (dl && arr) {
                dl.innerHTML = arr.map(x => {
                    const val = x.name || x.product_code || x;
                    const label = (id === 'dl-product-names' && x.code) ? `(${x.code})` : '';
                    return `<option value="${val}">${label}</option>`;
                }).join('');
            }
        };

        populateDL('dl-product-names', md.productNames);
        populateDL('dl-product-colors', md.productColors);
        populateDL('dl-product-capacities', md.productCapacities);

        // Fetch products for code autocompletion (since masterDataCache might not have all product_codes easily)
        if (typeof allProductsCache !== 'undefined' && allProductsCache && allProductsCache.length > 0) {
            const dlCodes = document.getElementById('dl-product-codes');
            if (dlCodes) {
                dlCodes.innerHTML = allProductsCache.map(p => `<option value="${p.product_code}"></option>`).join('');
            }
        }

        const itemsContainer = document.getElementById('po-items-container');
        if (itemsContainer) {
            itemsContainer.innerHTML = '';
            poItemCount = 0;
            addPoItemRow();
            calculatePOTotal();
        }
    };

    // State variables for tabbed PO receiving view
    let currentReceiveTab = 'all';
    let receiveSearchQuery = '';
    let cachedPOsData = [];

    let receiveSearchBranch = '';

    window.initBranchReceive = async () => {
        // Setup Search Input Event Listener
        const searchInput = document.getElementById('search-receive-po');
        if (searchInput) {
            searchInput.value = '';
            receiveSearchQuery = '';
            searchInput.addEventListener('input', (e) => {
                receiveSearchQuery = e.target.value.trim();
                renderFilteredPOs();
            });
        }

        const filterStatus = document.getElementById('receive-filter-status');
        if (filterStatus) {
            filterStatus.value = 'all';
            filterStatus.addEventListener('change', (e) => {
                currentReceiveTab = e.target.value;
                renderFilteredPOs();
            });
        }

        const filterBranch = document.getElementById('receive-filter-branch');
        if (filterBranch) {
            filterBranch.value = '';
            receiveSearchBranch = '';
            filterBranch.addEventListener('change', (e) => {
                receiveSearchBranch = e.target.value;
                renderFilteredPOs();
            });
            // Populate branches
            if (window.masterDataCache && window.masterDataCache.branches) {
                filterBranch.innerHTML = '<option value="">เลือกสาขา</option>' +
                    window.masterDataCache.branches.map(b => `<option value="${b._id}">${b.name}</option>`).join('');
            }
        }





        loadPOs();
    };

    if (document.getElementById('btn-refresh-po-receive')) {
        document.getElementById('btn-refresh-po-receive').addEventListener('click', () => loadPOs());
    }

    // ==========================================
    // Accounting & Finance Module Client Logic
    // ==========================================
    const initAccounting = async () => {
        // Set default dates if empty
        const startInput = document.getElementById('accounting-start-date');
        const endInput = document.getElementById('accounting-end-date');

        const formatDateInput = (d) => {
            const year = d.getFullYear();
            const month = String(d.getMonth() + 1).padStart(2, '0');
            const day = String(d.getDate()).padStart(2, '0');
            return `${year}-${month}-${day}`;
        };

        if (startInput && !startInput.value) {
            const thirtyDaysAgo = new Date();
            thirtyDaysAgo.setDate(thirtyDaysAgo.getDate() - 30);
            startInput.value = formatDateInput(thirtyDaysAgo);
        }
        if (endInput && !endInput.value) {
            endInput.value = formatDateInput(new Date());
        }

        const tabAp = document.getElementById('tab-accounting-ap');
        const tabPl = document.getElementById('tab-accounting-pl');
        const tabAr = document.getElementById('tab-accounting-ar');
        const secAp = document.getElementById('section-accounting-ap');
        const secPl = document.getElementById('section-accounting-pl');
        const secAr = document.getElementById('section-accounting-ar');

        if (tabAp && tabPl && tabAr && secAp && secPl && secAr) {
            tabAp.onclick = () => {
                tabAp.className = "px-6 py-3.5 border-b-2 border-primary text-primary text-sm font-bold flex items-center gap-2 transition-all duration-200 focus:outline-none";
                tabPl.className = "px-6 py-3.5 border-b-2 border-transparent text-body-muted hover:text-ink text-sm font-semibold flex items-center gap-2 transition-all duration-200 focus:outline-none";
                tabAr.className = "px-6 py-3.5 border-b-2 border-transparent text-body-muted hover:text-ink text-sm font-semibold flex items-center gap-2 transition-all duration-200 focus:outline-none";
                secAp.classList.remove('hidden');
                secPl.classList.add('hidden');
                secAr.classList.add('hidden');
            };
            tabPl.onclick = () => {
                tabPl.className = "px-6 py-3.5 border-b-2 border-primary text-primary text-sm font-bold flex items-center gap-2 transition-all duration-200 focus:outline-none";
                tabAp.className = "px-6 py-3.5 border-b-2 border-transparent text-body-muted hover:text-ink text-sm font-semibold flex items-center gap-2 transition-all duration-200 focus:outline-none";
                tabAr.className = "px-6 py-3.5 border-b-2 border-transparent text-body-muted hover:text-ink text-sm font-semibold flex items-center gap-2 transition-all duration-200 focus:outline-none";
                secPl.classList.remove('hidden');
                secAp.classList.add('hidden');
                secAr.classList.add('hidden');
            };
            tabAr.onclick = () => {
                tabAr.className = "px-6 py-3.5 border-b-2 border-primary text-primary text-sm font-bold flex items-center gap-2 transition-all duration-200 focus:outline-none";
                tabAp.className = "px-6 py-3.5 border-b-2 border-transparent text-body-muted hover:text-ink text-sm font-semibold flex items-center gap-2 transition-all duration-200 focus:outline-none";
                tabPl.className = "px-6 py-3.5 border-b-2 border-transparent text-body-muted hover:text-ink text-sm font-semibold flex items-center gap-2 transition-all duration-200 focus:outline-none";
                secAr.classList.remove('hidden');
                secAp.classList.add('hidden');
                secPl.classList.add('hidden');
            };
        }

        await loadAccountingData();
    };
    window.initAccounting = initAccounting;

    const loadAccountingData = async () => {
        const startInput = document.getElementById('accounting-start-date');
        const endInput = document.getElementById('accounting-end-date');
        const start = startInput ? startInput.value : '';
        const end = endInput ? endInput.value : '';

        try {
            // Fetch P&L data
            const res = await authFetch(`${API_BASE_URL}/accounting/profit-loss?startDate=${start}&endDate=${end}`);
            const json = await res.json();

            if (json.success) {
                const data = json.data;
                const formatThaiBaht = (num) => '฿' + Number(num || 0).toLocaleString('th-TH', { minimumFractionDigits: 2, maximumFractionDigits: 2 });

                // Render KPI values
                document.getElementById('kpi-revenue').textContent = formatThaiBaht(data.totalRevenue);
                document.getElementById('kpi-expense').textContent = formatThaiBaht(data.totalExpense);

                const profitEl = document.getElementById('kpi-profit');
                profitEl.textContent = formatThaiBaht(data.netProfit);
                if (data.netProfit >= 0) {
                    profitEl.className = "text-xl md:text-2xl font-black text-emerald-400 mt-2 font-mono";
                } else {
                    profitEl.className = "text-xl md:text-2xl font-black text-rose-500 mt-2 font-mono";
                }

                document.getElementById('kpi-vat').textContent = formatThaiBaht(data.taxPayable);

                // Render Tab 2: P&L Ledger
                const plTbody = document.getElementById('table-body-accounting-pl');
                if (plTbody) {
                    plTbody.innerHTML = '';
                    if (data.ledger.length === 0) {
                        plTbody.innerHTML = '<tr><td colspan="6" class="text-center py-8 text-body-muted text-sm"><i class="fa-solid fa-inbox text-slate-650 text-xl block mb-2"></i>ไม่มีรายการเดินบัญชีในช่วงเวลานี้</td></tr>';
                    } else {
                        data.ledger.forEach(item => {
                            const tr = document.createElement('tr');
                            tr.className = 'border-b border-hairline hover:bg-surface-chip/20 transition-all duration-150';

                            const badgeType = item.type === 'รายรับ'
                                ? `<span class="px-2.5 py-1 rounded-full text-xs font-semibold bg-emerald-500/10 text-emerald-400 border border-emerald-500/20 whitespace-nowrap inline-block"><i class="fa-solid fa-arrow-down text-[10px] mr-1"></i>รายรับ</span>`
                                : `<span class="px-2.5 py-1 rounded-full text-xs font-semibold bg-rose-500/10 text-rose-400 border border-rose-500/20 whitespace-nowrap inline-block"><i class="fa-solid fa-arrow-up text-[10px] mr-1"></i>รายจ่าย</span>`;

                            const amountVal = item.type === 'รายรับ'
                                ? `<span class="text-emerald-400 font-bold font-mono whitespace-nowrap">+฿${item.amount.toLocaleString(undefined, { minimumFractionDigits: 2 })}</span>`
                                : `<span class="text-rose-400 font-bold font-mono whitespace-nowrap">-฿${item.amount.toLocaleString(undefined, { minimumFractionDigits: 2 })}</span>`;

                            tr.innerHTML = `
                                <td class="px-4 py-4 md:px-6 font-mono font-bold text-body-muted text-sm whitespace-nowrap">${item.transaction_id}</td>
                                <td class="px-4 py-4 md:px-6 text-sm text-body-muted whitespace-nowrap">${new Date(item.created_at).toLocaleString('th-TH')}</td>
                                <td class="px-4 py-4 md:px-6 whitespace-nowrap">${badgeType}</td>
                                <td class="px-4 py-4 md:px-6 text-sm text-body-muted whitespace-nowrap">${item.category}</td>
                                <td class="px-4 py-4 md:px-6 text-right whitespace-nowrap">${amountVal}</td>
                                <td class="px-4 py-4 md:px-6 text-sm text-body-muted whitespace-nowrap">${item.recorded_by || 'Admin'}</td>
                            `;
                            plTbody.appendChild(tr);
                        });
                    }
                }
            } else {
                showToast(json.message || 'ดึงข้อมูลบัญชีผิดพลาด', 'error');
            }

            // Fetch POs for AP Queue
            const poRes = await authFetch(`${API_BASE_URL}/purchase-orders`);
            const poJson = await poRes.json();
            if (poJson.success) {
                const apPOs = poJson.data.filter(po => po.status !== 'ยกเลิก');

                // Populate Supplier Dropdown Filter
                const supplierSelect = document.getElementById('filter-ap-supplier');
                const selectedSupplier = supplierSelect ? supplierSelect.value : '';
                const uniqueSuppliers = [...new Set(apPOs.map(po => po.supplier_name))].sort();

                if (supplierSelect) {
                    supplierSelect.innerHTML = '<option value="">ทั้งหมด</option>';
                    uniqueSuppliers.forEach(sup => {
                        const opt = document.createElement('option');
                        opt.value = sup;
                        opt.textContent = sup;
                        supplierSelect.appendChild(opt);
                    });
                    supplierSelect.value = selectedSupplier;

                    if (!supplierSelect.dataset.listenerWired) {
                        supplierSelect.dataset.listenerWired = 'true';
                        supplierSelect.addEventListener('change', () => {
                            renderAPTable(apPOs, supplierSelect.value);
                        });
                    }
                }

                // Helper to render filtered AP table rows
                const renderAPTable = (poList, filterVal) => {
                    const apTbody = document.getElementById('table-body-accounting-ap');
                    if (!apTbody) return;
                    apTbody.innerHTML = '';

                    const filteredList = filterVal ? poList.filter(po => po.supplier_name === filterVal) : poList;

                    if (filteredList.length === 0) {
                        apTbody.innerHTML = '<tr><td colspan="9" class="text-center py-8 text-body-muted text-sm"><i class="fa-solid fa-check-double text-slate-650 text-xl block mb-2"></i>ไม่มีหนี้สินใบสั่งซื้อค้างจ่าย</td></tr>';
                    } else {
                        filteredList.forEach(po => {
                            const totalCost = po.items.reduce((sum, item) => sum + (item.cost_price * item.ordered_qty), 0);
                            const paidAmount = po.paid_amount || 0;
                            const discount = po.discount || 0;
                            const outstanding = Math.max(0, totalCost - paidAmount - discount);

                            const tr = document.createElement('tr');
                            tr.className = 'border-b border-hairline hover:bg-surface-chip/20 transition-all duration-150';

                            let statusBadge = '';
                            if (po.payment_status === 'ชำระเงินแล้ว') {
                                statusBadge = `<span class="px-2.5 py-1 rounded-full text-xs font-semibold bg-green-500/10 text-green-400 border border-green-500/20 whitespace-nowrap inline-block"><i class="fa-solid fa-circle-check text-[10px] mr-1"></i>ชำระเงินแล้ว</span>`;
                            } else if (po.payment_status === 'ชำระเงินบางส่วน') {
                                statusBadge = `<span class="px-2.5 py-1 rounded-full text-xs font-semibold bg-blue-500/10 text-blue-400 border border-blue-500/20 whitespace-nowrap inline-block"><i class="fa-solid fa-circle-info text-[10px] mr-1"></i>ชำระบางส่วน</span>`;
                            } else {
                                statusBadge = `<span class="px-2.5 py-1 rounded-full text-xs font-semibold bg-amber-500/10 text-amber-400 border border-amber-500/20 whitespace-nowrap inline-block"><i class="fa-solid fa-hourglass text-[10px] mr-1"></i>ยังไม่ได้ชำระ</span>`;
                            }

                            const payAction = po.payment_status !== 'ชำระเงินแล้ว'
                                ? `<button class="btn-pay-po px-3 py-1.5 bg-amber-500/10 text-amber-400 hover:bg-amber-500/20 border border-amber-500/35 hover:border-amber-500/60 rounded-xl text-xs font-bold transition-all inline-flex items-center gap-1.5 active:scale-95 whitespace-nowrap shrink-0" data-id="${po._id}" data-no="${po.po_number}" data-amount="${totalCost}" data-paid="${paidAmount}" data-discount="${discount}" data-outstanding="${outstanding}">
                                     <i class="fa-solid fa-money-bill-wave"></i> กดจ่ายเงิน
                                   </button>`
                                : `<span class="text-xs text-emerald-400 font-bold bg-emerald-500/10 border border-emerald-500/25 px-2.5 py-1.5 rounded-xl inline-flex items-center gap-1 whitespace-nowrap"><i class="fa-solid fa-circle-check text-[10px]"></i> จ่ายแล้ว วันที่ ${new Date(po.paid_at || po.updatedAt).toLocaleDateString('th-TH')}</span>`;

                            tr.innerHTML = `
                                <td class="px-4 py-4 md:px-6 font-mono font-bold text-body-muted text-sm whitespace-nowrap">${po.po_number}</td>
                                <td class="px-4 py-4 md:px-6 text-sm text-body-muted whitespace-nowrap">${new Date(po.createdAt).toLocaleDateString('th-TH')}</td>
                                <td class="px-4 py-4 md:px-6 text-sm text-body-muted whitespace-nowrap">${po.supplier_name}</td>
                                <td class="px-4 py-4 md:px-6 font-mono text-sm text-body-muted text-right whitespace-nowrap">฿${totalCost.toLocaleString(undefined, { minimumFractionDigits: 2 })}</td>
                                <td class="px-4 py-4 md:px-6 font-mono text-sm text-emerald-400 text-right whitespace-nowrap">฿${paidAmount.toLocaleString(undefined, { minimumFractionDigits: 2 })}</td>
                                <td class="px-4 py-4 md:px-6 font-mono text-sm text-rose-400 text-right cursor-help whitespace-nowrap" title="${po.discount_remark || 'ไม่มีส่วนลด'}">฿${discount.toLocaleString(undefined, { minimumFractionDigits: 2 })}</td>
                                <td class="px-4 py-4 md:px-6 font-mono text-sm text-amber-400 font-bold text-right whitespace-nowrap">฿${outstanding.toLocaleString(undefined, { minimumFractionDigits: 2 })}</td>
                                <td class="px-4 py-4 md:px-6 text-center whitespace-nowrap">${statusBadge}</td>
                                <td class="px-4 py-4 md:px-6 text-right whitespace-nowrap">
                                    <div class="flex items-center justify-end gap-2 whitespace-nowrap">
                                        <button class="btn-view-po-detail px-3 py-1.5 bg-surface-chip text-ink hover:bg-surface-tile-2 border border-hairline hover:border-primary/40 rounded-xl text-xs font-bold transition-all inline-flex items-center gap-1.5 active:scale-95 whitespace-nowrap shrink-0">
                                            <i class="fa-solid fa-eye"></i> ดูรายละเอียด
                                        </button>
                                        ${payAction}
                                    </div>
                                </td>
                            `;
                            apTbody.appendChild(tr);

                            // Bind view details click handler
                            const viewBtn = tr.querySelector('.btn-view-po-detail');
                            if (viewBtn) {
                                viewBtn.onclick = () => {
                                    openViewPOModal(po);
                                };
                            }

                            // Bind pay click handler
                            const payBtn = tr.querySelector('.btn-pay-po');
                            if (payBtn) {
                                payBtn.onclick = () => {
                                    const poId = payBtn.dataset.id;
                                    const poNo = payBtn.dataset.no;
                                    const poAmount = Number(payBtn.dataset.amount);
                                    const poPaid = Number(payBtn.dataset.paid);
                                    const poDiscount = Number(payBtn.dataset.discount);
                                    const poOutstanding = Number(payBtn.dataset.outstanding);

                                    const todayStr = new Date().toLocaleDateString('en-CA');
                                    showConfirm(
                                        `บันทึกจ่ายเงินใบสั่งซื้อ (${poNo})`,
                                        `<div class="text-left space-y-4">
                                            <!-- Financial Summary -->
                                            <div class="grid grid-cols-2 gap-2 bg-surface-tile-3 p-4 rounded-2xl border border-hairline text-xs text-body-muted">
                                                <div>ยอดรวม PO:</div>
                                                <div class="text-right font-mono text-ink">฿${poAmount.toLocaleString(undefined, { minimumFractionDigits: 2 })}</div>
                                                <div>ชำระก่อนหน้า:</div>
                                                <div class="text-right font-mono text-emerald-400">฿${poPaid.toLocaleString(undefined, { minimumFractionDigits: 2 })}</div>
                                                <div>ส่วนลดสะสม:</div>
                                                <div class="text-right font-mono text-rose-400">฿${poDiscount.toLocaleString(undefined, { minimumFractionDigits: 2 })}</div>
                                                <div class="font-bold text-ink border-t border-hairline pt-1 mt-1">ยอดค้างชำระ:</div>
                                                <div class="text-right font-mono text-amber-400 font-bold border-t border-hairline pt-1 mt-1">฿${poOutstanding.toLocaleString(undefined, { minimumFractionDigits: 2 })}</div>
                                            </div>

                                            <!-- Form Inputs -->
                                            <div class="space-y-3 bg-surface-tile-3 p-4 rounded-2xl border border-hairline">
                                                <div>
                                                    <label class="text-xs font-semibold text-body-muted block mb-1">วันที่ชำระเงิน:</label>
                                                    <input type="date" id="ap-pay-date-input" class="w-full bg-surface-tile-3 border border-hairline rounded-xl px-3 py-2  focus:outline-none focus:border-primary-focus text-sm" value="${todayStr}">
                                                </div>
                                                <div class="grid grid-cols-2 gap-3">
                                                    <div>
                                                        <label class="text-xs font-semibold text-body-muted block mb-1">จำนวนเงินที่จ่ายรอบนี้:</label>
                                                        <input type="number" id="ap-pay-amount-input" step="any" min="0" max="${poOutstanding}" class="w-full bg-surface-tile-3 border border-hairline rounded-xl px-3 py-2  focus:outline-none focus:border-primary-focus text-sm font-mono text-right" value="${poOutstanding.toFixed(2)}">
                                                    </div>
                                                    <div>
                                                        <label class="text-xs font-semibold text-body-muted block mb-1">ส่วนลดรอบนี้:</label>
                                                        <input type="number" id="ap-pay-discount-input" step="any" min="0" max="${poOutstanding}" class="w-full bg-surface-tile-3 border border-hairline rounded-xl px-3 py-2  focus:outline-none focus:border-primary-focus text-sm font-mono text-right" value="0.00">
                                                    </div>
                                                </div>
                                                <div>
                                                    <label class="text-xs font-semibold text-body-muted block mb-1">หมายเหตุส่วนลด (ระบุหากได้ส่วนลด):</label>
                                                    <input type="text" id="ap-pay-discount-remark-input" placeholder="เช่น ชำระก่อนครบกำหนดรับส่วนลด 2%" class="w-full bg-surface-tile-3 border border-hairline rounded-xl px-3 py-2  focus:outline-none focus:border-primary-focus text-sm">
                                                </div>
                                                <div id="ap-pay-calc-result" class="text-[11px] font-bold text-body-muted text-right pt-1">
                                                    คงเหลือหลังชำระ: ฿0.00
                                                </div>
                                            </div>
                                         </div>`,
                                        async () => {
                                            try {
                                                const payDateVal = document.getElementById('ap-pay-date-input')?.value || todayStr;
                                                const payAmtVal = Number(document.getElementById('ap-pay-amount-input')?.value || 0);
                                                const discountVal = Number(document.getElementById('ap-pay-discount-input')?.value || 0);
                                                const remarkVal = document.getElementById('ap-pay-discount-remark-input')?.value || '';

                                                if (payAmtVal === 0 && discountVal === 0) {
                                                    showToast('กรุณากรอกจำนวนเงินชำระหรือส่วนลดรอบนี้อย่างใดอย่างหนึ่ง', 'error');
                                                    return;
                                                }
                                                if (discountVal > 0 && !remarkVal.trim()) {
                                                    showToast('กรุณาระบุหมายเหตุของส่วนลดเพื่อใช้เป็นหลักฐานทางบัญชี', 'error');
                                                    return;
                                                }
                                                if (payAmtVal + discountVal > poOutstanding + 0.01) {
                                                    showToast('ยอดจ่ายรวมส่วนลด เกินยอดค้างชำระปัจจุบัน', 'error');
                                                    return;
                                                }

                                                const payRes = await authFetch(`${API_BASE_URL}/accounting/po-pay/${poId}`, {
                                                    method: 'PUT',
                                                    headers: { 'Content-Type': 'application/json' },
                                                    body: JSON.stringify({
                                                        payment_date: payDateVal,
                                                        payment_amount: payAmtVal,
                                                        discount_amount: discountVal,
                                                        discount_remark: remarkVal
                                                    })
                                                });
                                                const payJson = await payRes.json();
                                                if (payJson.success) {
                                                    showToast('บันทึกการชำระเงินสำเร็จ!', 'success');
                                                    loadAccountingData();
                                                } else {
                                                    showToast(payJson.message || 'ไม่สามารถทำรายการได้', 'error');
                                                }
                                            } catch (err) {
                                                console.error(err);
                                                showToast('เกิดข้อผิดพลาดในการเชื่อมต่อเซิร์ฟเวอร์', 'error');
                                            }
                                        },
                                        'ยืนยันชำระเงิน',
                                        'warning',
                                        'max-w-lg'
                                    );

                                    // Dynamic calculation handler inside the confirm modal
                                    setTimeout(() => {
                                        const amtInp = document.getElementById('ap-pay-amount-input');
                                        const discInp = document.getElementById('ap-pay-discount-input');
                                        const calcRes = document.getElementById('ap-pay-calc-result');

                                        const updateCalc = () => {
                                            if (!amtInp || !discInp || !calcRes) return;
                                            const amt = Number(amtInp.value || 0);
                                            const disc = Number(discInp.value || 0);
                                            const left = Math.max(0, poOutstanding - amt - disc);
                                            calcRes.textContent = `คงเหลือหลังชำระ: ฿${left.toLocaleString(undefined, { minimumFractionDigits: 2 })}`;
                                            if (amt + disc > poOutstanding + 0.01) {
                                                calcRes.className = 'text-[11px] font-bold text-rose-400 text-right pt-1';
                                                calcRes.textContent = `เกินยอดค้างชำระ: ฿${Math.abs(poOutstanding - amt - disc).toLocaleString(undefined, { minimumFractionDigits: 2 })}`;
                                            } else {
                                                calcRes.className = 'text-[11px] font-bold text-emerald-400 text-right pt-1';
                                            }
                                        };

                                        if (amtInp && discInp) {
                                            amtInp.addEventListener('input', updateCalc);
                                            discInp.addEventListener('input', updateCalc);
                                            updateCalc();
                                        }
                                    }, 100);
                                };
                            }
                        });
                    }
                };

                // Initial render with current filter value
                renderAPTable(apPOs, selectedSupplier);
            }

            // Fetch and Render Supplier Summary widgets
            try {
                const summaryRes = await authFetch(`${API_BASE_URL}/accounting/ap-summary`);
                const summaryJson = await summaryRes.json();
                if (summaryJson.success) {
                    const apSummaries = summaryJson.data;
                    const summaryContainer = document.getElementById('ap-summary-widgets');
                    if (summaryContainer) {
                        summaryContainer.innerHTML = '';
                        if (apSummaries.length === 0) {
                            summaryContainer.innerHTML = '<div class="col-span-full text-center py-6 text-body-muted text-sm border border-dashed border-hairline rounded-2xl">ไม่มีหนี้สินค้างจ่ายกับ Supplier</div>';
                        } else {
                            apSummaries.forEach(sum => {
                                const card = document.createElement('div');
                                card.className = 'bg-surface-tile-3 border border-hairline rounded-2xl p-4 flex flex-col justify-between hover:border-primary/40 transition-all duration-200';
                                card.innerHTML = `
                                    <div class="flex items-center justify-between mb-2">
                                        <span class="text-sm font-bold text-ink">${sum.supplier_name}</span>
                                        <span class="px-2 py-0.5 rounded-full text-[10px] font-bold bg-amber-500/10 text-amber-400 border border-amber-500/20">${sum.pending_bill_count} ใบ</span>
                                    </div>
                                    <div class="flex justify-between text-xs items-center mt-2">
                                        <span class="text-body-muted">ยอดค้างจ่ายรวมทั้งหมด:</span>
                                        <span class="font-mono text-amber-400 font-bold">฿${(sum.total_outstanding || 0).toLocaleString(undefined, { minimumFractionDigits: 2, maximumFractionDigits: 2 })}</span>
                                    </div>
                                `;
                                summaryContainer.appendChild(card);
                            });
                        }
                    }
                }
            } catch (apSumErr) {
                console.error('Error fetching AP summary:', apSumErr);
            }

            // Fetch Receivables for AR Queue
            const arRes = await authFetch(`${API_BASE_URL}/accounting/receivables`);
            const arJson = await arRes.json();
            if (arJson.success) {
                const receivables = arJson.data;
                const arTbody = document.getElementById('table-body-accounting-ar');
                if (arTbody) {
                    arTbody.innerHTML = '';
                    if (receivables.length === 0) {
                        arTbody.innerHTML = '<tr><td colspan="6" class="text-center py-8 text-body-muted text-sm"><i class="fa-solid fa-check-double text-slate-650 text-xl block mb-2"></i>ไม่มีรายการค้างโอนจากไฟแนนซ์</td></tr>';
                    } else {
                        receivables.forEach(rec => {
                            const tr = document.createElement('tr');
                            tr.className = 'border-b border-hairline hover:bg-surface-chip/20 transition-all duration-150';

                            const isSettled = rec.status === 'ชำระแล้ว' || rec.status === 'ได้รับเงินครบแล้ว';
                            const settledDateVal = isSettled && rec.settled_at
                                ? new Date(rec.settled_at).toLocaleDateString('th-TH')
                                : `<span class="px-2 py-0.5 rounded-full text-xs bg-amber-500/10 text-amber-400 border border-amber-500/20 inline-flex items-center gap-1 font-semibold whitespace-nowrap">⏳ รอรับเงิน</span>`;

                            let payAction = '';
                            if (!isSettled && rec.status !== 'ยกเลิก') {
                                payAction = `
                                    <button class="btn-settle-ar px-3 py-1.5 bg-green-500/10 text-green-400 hover:bg-green-500/20 border border-green-500/35 hover:border-green-500/60 rounded-xl text-xs font-bold transition-all inline-flex items-center gap-1.5 active:scale-95 whitespace-nowrap shrink-0" data-id="${rec._id}" data-no="${rec.transaction_id ? rec.transaction_id.receipt_number : ''}" data-amount="${rec.financed_amount}">
                                        <i class="fa-solid fa-circle-check"></i> บันทึกยอดรับเงิน
                                    </button>
                                `;
                            } else if (isSettled) {
                                payAction = `<span class="text-xs text-body-muted italic whitespace-nowrap">ผ่านรายการสำเร็จ (${new Date(rec.settled_at).toLocaleDateString('th-TH')})</span>`;
                            } else {
                                payAction = `<span class="text-xs text-rose-500 italic whitespace-nowrap">ยกเลิกแล้ว</span>`;
                            }

                            const receiptNum = rec.transaction_id ? rec.transaction_id.receipt_number : '-';
                            const createdDate = rec.transaction_id
                                ? new Date(rec.transaction_id.created_at || rec.transaction_id.createdAt).toLocaleDateString('th-TH', { day: '2-digit', month: '2-digit', year: '2-digit' })
                                : new Date(rec.createdAt).toLocaleDateString('th-TH', { day: '2-digit', month: '2-digit', year: '2-digit' });

                            tr.innerHTML = `
                                <td class="px-4 py-4 md:px-6 font-mono font-bold text-body-muted text-sm whitespace-nowrap">${receiptNum}</td>
                                <td class="px-4 py-4 md:px-6 text-sm text-body-muted whitespace-nowrap">${rec.finance_company}</td>
                                <td class="px-4 py-4 md:px-6 text-sm text-body-muted whitespace-nowrap">${createdDate}</td>
                                <td class="px-4 py-4 md:px-6 text-sm whitespace-nowrap">${settledDateVal}</td>
                                <td class="px-4 py-4 md:px-6 font-mono text-sm text-ink font-bold whitespace-nowrap">฿${rec.financed_amount.toLocaleString(undefined, { minimumFractionDigits: 2, maximumFractionDigits: 2 })}</td>
                                <td class="px-4 py-4 md:px-6 text-right whitespace-nowrap">${payAction}</td>
                            `;
                            arTbody.appendChild(tr);

                            const settleBtn = tr.querySelector('.btn-settle-ar');
                            if (settleBtn) {
                                settleBtn.onclick = () => {
                                    const arId = settleBtn.dataset.id;
                                    const recNo = settleBtn.dataset.no;
                                    const amount = Number(settleBtn.dataset.amount);

                                    const todayStr = new Date().toLocaleDateString('en-CA');
                                    showConfirm(
                                        `ยืนยันการรับเงินโอน`,
                                        `คุณต้องการยืนยันการได้รับยอดเงินโอนจากบริษัทไฟแนนซ์ สำหรับใบเสร็จเลขที่ <strong class="font-mono text-ink">${recNo}</strong><br>เป็นจำนวนเงินค้างโอน <strong class="text-green-400 font-mono">฿${amount.toLocaleString(undefined, { minimumFractionDigits: 2 })}</strong> หรือไม่?<br><br>
                                         <div class="text-left bg-surface-tile-3 p-4 rounded-2xl border border-hairline space-y-2 mt-3">
                                             <label class="text-xs font-semibold text-body-muted block">ระบุวันที่ได้รับเงิน (รับจากไฟแนนซ์):</label>
                                             <input type="date" id="ar-pay-date-input" class="w-full bg-surface-chip border border-hairline rounded-xl px-3 py-2 focus:outline-none focus:border-primary-focus text-sm" value="${todayStr}">
                                         </div>`,
                                        async () => {
                                            try {
                                                const payDateVal = document.getElementById('ar-pay-date-input')?.value || todayStr;
                                                const settleRes = await authFetch(`${API_BASE_URL}/finance/payout/${arId}`, {
                                                    method: 'POST',
                                                    headers: { 'Content-Type': 'application/json' },
                                                    body: JSON.stringify({ settled_at: payDateVal })
                                                });
                                                const settleJson = await settleRes.json();
                                                if (settleJson.success) {
                                                    showToast('บันทึกการชำระเงินลูกหนี้จัดไฟแนนซ์สำเร็จ!', 'success');
                                                    loadAccountingData();
                                                } else {
                                                    showToast(settleJson.message || 'ไม่สามารถทำรายการได้', 'error');
                                                }
                                            } catch (err) {
                                                console.error(err);
                                                showToast('เกิดข้อผิดพลาดในการเชื่อมต่อเซิร์ฟเวอร์', 'error');
                                            }
                                        },
                                        'ยืนยันรับยอด',
                                        'success'
                                    );
                                };
                            }
                        });
                    }
                }
            }

            // Fetch and Render Finance Partner Summary Cards
            try {
                const summaryRes = await authFetch(`${API_BASE_URL}/finance/summary`);
                const summaryJson = await summaryRes.json();
                if (summaryJson.success) {
                    const summaries = summaryJson.data;
                    const summaryContainer = document.getElementById('finance-summary-widgets');
                    if (summaryContainer) {
                        summaryContainer.innerHTML = '';
                        if (summaries.length === 0) {
                            summaryContainer.innerHTML = '<div class="col-span-full text-center py-6 text-body-muted text-sm border border-dashed border-hairline rounded-2xl">ไม่มีข้อมูลสรุปสำหรับบริษัทไฟแนนซ์</div>';
                        } else {
                            summaries.forEach(sum => {
                                const card = document.createElement('div');
                                card.className = 'bg-surface-tile-3 border border-hairline rounded-2xl p-4 flex flex-col justify-between hover:border-primary/40 transition-all duration-200';
                                card.innerHTML = `
                                    <div class="flex items-center justify-between mb-2">
                                        <span class="text-sm font-bold text-ink">${sum.finance_partner_name}</span>
                                        <span class="px-2 py-0.5 rounded-full text-[10px] font-bold bg-surface-chip text-ink border border-hairline">จัดไฟแนนซ์</span>
                                    </div>
                                    <div class="space-y-1.5 mt-2">
                                        <div class="flex justify-between text-xs items-center">
                                            <span class="text-body-muted">ยอดรวมค้างโอน:</span>
                                            <span class="font-mono text-amber-400 font-bold">฿${(sum.total_pending || 0).toLocaleString(undefined, { minimumFractionDigits: 2, maximumFractionDigits: 2 })}</span>
                                        </div>
                                        <div class="flex justify-between text-xs items-center">
                                            <span class="text-body-muted">ยอดโอนสำเร็จแล้ว:</span>
                                            <span class="font-mono text-green-400 font-bold">฿${(sum.payout_received || sum.total_settled || 0).toLocaleString(undefined, { minimumFractionDigits: 2, maximumFractionDigits: 2 })}</span>
                                        </div>
                                    </div>
                                `;
                                summaryContainer.appendChild(card);
                            });
                        }
                    }
                }
            } catch (sumErr) {
                console.error('Error loading finance summary widget:', sumErr);
            }
        } catch (e) {
            console.error('Error loading accounting data:', e);
            showToast('เกิดข้อผิดพลาดขณะโหลดข้อมูลบัญชี', 'error');
        }
    };

    // Bind filters & refresh click handlers
    if (document.getElementById('btn-refresh-accounting')) {
        document.getElementById('btn-refresh-accounting').onclick = () => loadAccountingData();
    }
    const startInput = document.getElementById('accounting-start-date');
    const endInput = document.getElementById('accounting-end-date');
    if (startInput) startInput.onchange = () => loadAccountingData();
    if (endInput) endInput.onchange = () => loadAccountingData();

    // Expense Modal setup
    const openExpenseModal = () => {
        const modal = document.getElementById('modal-accounting-expense');
        const form = document.getElementById('form-accounting-expense');
        if (form) form.reset();

        if (modal) {
            modal.classList.remove('hidden');
            void modal.offsetWidth; // force reflow
            modal.classList.remove('opacity-0', 'pointer-events-none');
        }
    };

    const closeExpenseModal = () => {
        const modal = document.getElementById('modal-accounting-expense');
        if (modal) {
            modal.classList.add('opacity-0', 'pointer-events-none');
            setTimeout(() => modal.classList.add('hidden'), 300);
        }
    };

    const btnOpenExpense = document.getElementById('btn-open-expense-modal');
    if (btnOpenExpense) btnOpenExpense.onclick = () => openExpenseModal();

    const btnCloseExpense = document.getElementById('btn-close-accounting-expense');
    if (btnCloseExpense) btnCloseExpense.onclick = () => closeExpenseModal();

    const formExpense = document.getElementById('form-accounting-expense');
    if (formExpense) {
        formExpense.onsubmit = async (e) => {
            e.preventDefault();
            const category = document.getElementById('expense-category').value;
            const amount = document.getElementById('expense-amount').value;
            const btnSubmit = document.getElementById('btn-submit-accounting-expense');

            if (!category || !amount || Number(amount) <= 0) {
                showToast('กรุณากรอกข้อมูลให้ครบถ้วนถูกต้อง', 'warning');
                return;
            }

            try {
                if (btnSubmit) btnSubmit.disabled = true;
                const response = await authFetch(`${API_BASE_URL}/accounting/expenses`, {
                    method: 'POST',
                    headers: { 'Content-Type': 'application/json' },
                    body: JSON.stringify({ category, amount: Number(amount) })
                });
                const json = await response.json();

                if (json.success) {
                    showToast('บันทึกค่าใช้จ่ายเสร็จสมบูรณ์!', 'success');
                    closeExpenseModal();
                    loadAccountingData();
                } else {
                    showToast(json.message || 'บันทึกค่าใช้จ่ายล้มเหลว', 'error');
                }
            } catch (err) {
                console.error(err);
                showToast('เกิดข้อผิดพลาดในการเชื่อมต่อ', 'error');
            } finally {
                if (btnSubmit) btnSubmit.disabled = false;
            }
        };
    }


    const openViewPOModal = async (po) => {
        const modal = document.getElementById('modal-po-view');
        if (!modal) return;

        document.getElementById('view-po-number').textContent = po.po_number;
        document.getElementById('view-po-supplier').innerHTML = `<i class="fa-solid fa-building text-white/70 text-xs"></i> ${po.supplier_name}`;

        const branchName = po.branch_id ? po.branch_id.name : '-';
        document.getElementById('view-po-branch').innerHTML = `<i class="fa-solid fa-location-dot text-white/70 text-xs"></i> ${branchName}`;

        // สีสถานะต้องตรงกับ enum จริงใน models/index.js (ชุดเดียวกับตารางประวัติการสั่งซื้อ)
        const statusColors = {
            'รอจัดส่ง': 'bg-sky-500/10 text-sky-400 border-sky-500/20',
            'ของถึงสาขาแล้ว': 'bg-blue-500/10 text-blue-400 border-blue-500/20',
            'กำลังตรวจรับ': 'bg-amber-500/10 text-amber-400 border-amber-500/20',
            'นำเข้าสำเร็จ': 'bg-[#42A231]/[0.12] text-[#20D500] border-[#20D500]/20',
            'ยกเลิก': 'bg-[#FE0000]/[0.12] text-[#FE0000] border-[#FE0000]/20'
        };
        const statusClass = statusColors[po.status] || 'bg-white/5 text-slate-300 border-white/10';

        const statusBadge = document.getElementById('view-po-status');
        statusBadge.className = `inline-flex px-3 py-1 rounded-full text-xs font-bold border ${statusClass}`;
        statusBadge.textContent = po.status;

        // คำนวณรายละเอียดการชำระเงิน
        const totalCost = po.items ? po.items.reduce((sum, item) => sum + (item.cost_price * item.ordered_qty), 0) : 0;
        const paidAmount = po.paid_amount || 0;
        const discount = po.discount || 0;
        const outstanding = Math.max(0, totalCost - paidAmount - discount);

        const payStatusColors = {
            'ยังไม่ได้ชำระ': 'text-amber-400 font-bold',
            'ชำระเงินบางส่วน': 'text-blue-400 font-bold',
            'ชำระเงินแล้ว': 'text-green-400 font-bold'
        };

        const payStatusEl = document.getElementById('view-po-pay-status');
        if (payStatusEl) {
            payStatusEl.className = `${payStatusColors[po.payment_status || 'ยังไม่ได้ชำระ'] || 'text-slate-300'} font-semibold text-sm`;
            payStatusEl.textContent = po.payment_status || 'ยังไม่ได้ชำระ';
        }

        const payPaidEl = document.getElementById('view-po-pay-paid');
        if (payPaidEl) {
            payPaidEl.textContent = '฿' + paidAmount.toLocaleString(undefined, { minimumFractionDigits: 2 });
        }

        const payDiscEl = document.getElementById('view-po-pay-discount');
        if (payDiscEl) {
            let discText = '฿' + discount.toLocaleString(undefined, { minimumFractionDigits: 2 });
            if (discount > 0 && po.discount_remark) {
                discText += ` (${po.discount_remark})`;
            }
            payDiscEl.textContent = discText;
        }

        const payOutEl = document.getElementById('view-po-pay-outstanding');
        if (payOutEl) {
            payOutEl.textContent = '฿' + outstanding.toLocaleString(undefined, { minimumFractionDigits: 2 });
        }

        const itemsContainer = document.getElementById('view-po-items');
        itemsContainer.innerHTML = '';

        if (!po.items || po.items.length === 0) {
            itemsContainer.innerHTML = '<div class="text-center py-6 text-slate-400 text-xs">ไม่มีรายการสินค้าในใบสั่งซื้อนี้</div>';
        } else {
            po.items.forEach(item => {
                const el = document.createElement('div');
                el.className = 'p-5 bg-[#27272A] border border-[#3F3F46] rounded-xl space-y-4';

                const received = item.received_qty || 0;
                const ordered = item.ordered_qty || 0;
                let itemPercent = 0;
                if (ordered > 0) {
                    itemPercent = Math.round((received / ordered) * 100);
                }

                let imeisHtml = '';
                if (item.track_imei && item.imeis_scanned && item.imeis_scanned.length > 0) {
                    const chips = item.imeis_scanned.map(imei => `
                        <span class="px-2.5 py-1 bg-[#1a1a1a] border border-[#3F3F46] text-white font-mono text-[10px] rounded-lg flex items-center gap-1">
                            <i class="fa-solid fa-barcode text-[8px] text-white/50"></i> ${imei}
                        </span>
                    `).join('');
                    imeisHtml = `
                        <div class="pt-3 border-t border-[#3F3F46] space-y-2">
                            <span class="text-xs text-slate-300 font-bold flex items-center gap-1"><i class="fa-solid fa-qrcode text-[10px]"></i> หมายเลข IMEI ที่สแกนนำเข้าคลังแล้ว (${item.imeis_scanned.length}):</span>
                            <div class="flex flex-wrap gap-1.5 max-h-[120px] overflow-y-auto p-1 bg-[#1a1a1a] border border-[#3F3F46] rounded-lg modal-scrollable-content">${chips}</div>
                        </div>
                    `;
                }

                el.innerHTML = `
                    <div class="flex justify-between items-start gap-4">
                        <div>
                            <span class="text-white font-bold text-sm md:text-base flex items-center gap-2">
                                ${item.product_name}
                                <span class="text-xs text-slate-400 font-mono font-normal">(${item.product_code})</span>
                            </span>
                            <p class="text-xs text-slate-300 mt-1">
                                ยอดสั่งซื้อ: <span class="text-white font-bold">${ordered}</span> |
                                ยอดรับจริง: <span class="text-emerald-400 font-bold">${received}</span> ชิ้น
                            </p>
                        </div>
                        <div class="text-right shrink-0">
                            <span class="text-[10px] font-semibold px-2 py-0.5 rounded-lg bg-[#1a1a1a] text-white border border-[#3F3F46]">
                                ${item.track_imei ? 'เก็บซีเรียล IMEI' : 'นับจำนวนชิ้น'}
                            </span>
                        </div>
                    </div>

                    <div class="space-y-1">
                        <div class="w-full bg-[#1a1a1a] rounded-full h-2 overflow-hidden border border-[#3F3F46]">
                            <div class="bg-emerald-500 h-full rounded-full transition-all duration-500" style="width: ${itemPercent}%"></div>
                        </div>
                        <div class="flex justify-between text-[10px] font-bold text-slate-300">
                            <span>สถานะตรวจรับเข้า</span>
                            <span class="font-mono text-emerald-400">${itemPercent}%</span>
                        </div>
                    </div>

                    ${imeisHtml}
                `;
                itemsContainer.appendChild(el);
            });
        }

        // ดึงประวัติการชำระเงินของ PO
        const historyContainer = document.getElementById('view-po-payments-history-container');
        const historyTbody = document.getElementById('view-po-payments-history-rows');

        if (historyContainer && historyTbody) {
            historyTbody.innerHTML = '<tr><td colspan="5" class="text-center p-3 text-slate-300 font-bold">กำลังโหลดประวัติการจ่ายเงิน...</td></tr>';
            historyContainer.classList.remove('hidden');

            try {
                const res = await authFetch(`${API_BASE_URL}/accounting/po-payments/${po._id}`);
                const json = await res.json();

                if (json.success && json.data && json.data.length > 0) {
                    historyTbody.innerHTML = json.data.map((item, index) => {
                        const round = index + 1;
                        const dateStr = new Date(item.created_at || item.createdAt).toLocaleDateString('th-TH');
                        const amount = item.amount ? '฿' + item.amount.toLocaleString(undefined, { minimumFractionDigits: 2 }) : '฿0.00';
                        const recordedBy = item.recorded_by ? item.recorded_by.name : 'แอดมิน';
                        const txnId = item.transaction_id || '-';

                        return `
                            <tr class="border-b border-[#3F3F46] hover:bg-white/5 transition-colors">
                                <td class="p-3 font-bold text-slate-300">${round}</td>
                                <td class="p-3 text-slate-300">${dateStr}</td>
                                <td class="p-3 font-mono font-semibold text-slate-300">${txnId}</td>
                                <td class="p-3 font-mono font-bold text-emerald-400 text-right">${amount}</td>
                                <td class="p-3 text-right text-slate-300">${recordedBy}</td>
                            </tr>
                        `;
                    }).join('');
                } else {
                    historyContainer.classList.add('hidden');
                    historyTbody.innerHTML = '';
                }
            } catch (err) {
                console.error('Error fetching PO payments history:', err);
                historyTbody.innerHTML = '<tr><td colspan="5" class="text-center p-3 text-rose-400">โหลดข้อมูลล้มเหลว</td></tr>';
            }
        }

        modal.classList.remove('hidden');
        void modal.offsetWidth;
        modal.classList.remove('opacity-0', 'pointer-events-none');
        const card = modal.querySelector('.relative.w-full');
        if (card) {
            card.classList.remove('scale-95');
            card.classList.add('scale-100');
        }

        // Bind Edit button from details modal
        const editBtn = document.getElementById('btn-edit-po-from-view');
        if (editBtn) {
            const canManagePO = window.__userPermissions && window.__userPermissions.manage_po;
            if (canManagePO && (po.status === 'รอจัดส่ง' || po.status === 'สั่งซื้อแล้ว')) {
                editBtn.classList.remove('hidden');
                editBtn.onclick = () => {
                    const viewModal = document.getElementById('modal-po-view');
                    if (viewModal) {
                        viewModal.classList.add('opacity-0', 'pointer-events-none');
                        const card = viewModal.querySelector('.relative.w-full');
                        if (card) {
                            card.classList.add('scale-95');
                            card.classList.remove('scale-100');
                        }
                        setTimeout(() => viewModal.classList.add('hidden'), 300);
                    }
                    startEditingPO(po);
                };
            } else {
                editBtn.classList.add('hidden');
            }
        }
    };

    const renderFilteredPOs = () => {
        const tbody = document.getElementById('table-body-receive-po');
        if (!tbody) return;

        const filtered = cachedPOsData.filter(po => {
            // 1. Tab filtering
            if (currentReceiveTab !== 'all') {
                if (currentReceiveTab === 'นำเข้าสำเร็จ') {
                    if (po.status !== 'นำเข้าสำเร็จ' && po.status !== 'รับของครบแล้ว') return false;
                } else {
                    if (po.status !== currentReceiveTab) return false;
                }
            }
            // 2. Search query filtering
            if (receiveSearchQuery) {
                const q = receiveSearchQuery.toLowerCase();
                const poNum = (po.po_number || '').toLowerCase();
                const sup = (po.supplier_name || '').toLowerCase();
                if (!(poNum.includes(q) || sup.includes(q))) return false;
            }
            // 3. Branch filtering
            // A PO with no branch_id should NOT match a specific branch filter — the
            // previous `&& po.branch_id` guard let branch-less POs through regardless
            // of which branch was selected.
            if (receiveSearchBranch) {
                const bId = po.branch_id && typeof po.branch_id === 'object' ? po.branch_id._id : po.branch_id;
                if (bId !== receiveSearchBranch) return false;
            }
            return true;
        });

        const countDisplay = document.getElementById('receive-po-total-count');
        if (countDisplay) countDisplay.textContent = filtered.length;

        tbody.innerHTML = '';
        if (filtered.length === 0) {
            tbody.innerHTML = `<tr><td colspan="6" class="text-center py-10 text-body-muted text-sm font-medium">
                <i class="fa-solid fa-folder-open text-body-muted text-2xl block mb-2"></i>
                ไม่พบข้อมูลใบสั่งซื้อตามที่ค้นหา
            </td></tr>`;
            return;
        }

        filtered.forEach(po => {
            const statusStyles = {
                'รอจัดส่ง': { icon: 'fa-truck', class: 'bg-[#B45309]/20 text-[#F59E0B] ' },
                'ของถึงสาขาแล้ว': { icon: 'fa-location-dot', class: 'bg-[#0E7490]/20 text-[#06B6D4] ' },
                'กำลังตรวจรับ': { icon: 'fa-clipboard-check', class: 'bg-[#6B21A8]/20 text-[#A855F7] ' },
                'นำเข้าสำเร็จ': { icon: 'fa-circle-check', class: 'bg-[#15803D]/20 text-[#22C55E] ' },
                'รับของครบแล้ว': { icon: 'fa-circle-check', class: 'bg-[#15803D]/20 text-[#22C55E] ' },
                'ยกเลิก': { icon: 'fa-xmark', class: 'bg-[#991B1B]/20 text-[#EF4444] ' }
            };
            const style = statusStyles[po.status] || { icon: 'fa-circle-info', class: 'bg-slate-500/20 text-body-muted ' };
            const displayStatus = po.status === 'นำเข้าสำเร็จ' || po.status === 'รับของครบแล้ว' ? 'นำเข้าสำเร็จ' : po.status;
            const branchName = po.branch_id ? po.branch_id.name : '-';

            // Calculate progress
            let totalOrdered = 0;
            let totalReceived = 0;
            if (po.items && po.items.length > 0) {
                totalOrdered = po.items.reduce((sum, i) => sum + i.ordered_qty, 0);
                totalReceived = po.items.reduce((sum, i) => sum + (i.received_qty || 0), 0);
                if (po.status === 'นำเข้าสำเร็จ' || po.status === 'รับของครบแล้ว') {
                    totalReceived = totalOrdered; // For display aesthetics
                }
            }

            const tr = document.createElement('tr');
            tr.className = 'hover:bg-surface-chip/40 transition-colors group duration-200 text-sm';
            tr.innerHTML = `
                <td class="px-6 py-4 font-normal whitespace-nowrap text-body-muted">
                    <i class="fa-regular fa-clock mr-1"></i> ${new Date(po.createdAt).toLocaleDateString('th-TH')}
                </td>
                <td class="px-6 py-4 font-normal whitespace-nowrap text-ink">
                    ${po.po_number}
                </td>
                <td class="px-6 py-4 text-body-muted font-normal whitespace-nowrap">
                    ${po.supplier_name}
                </td>
                <td class="px-6 py-4 text-body-muted font-normal whitespace-nowrap">
                    <div class="flex items-center gap-1.5"><i class="fa-solid fa-location-dot text-body-muted text-xs"></i> ${branchName}</div>
                </td>
                <td class="px-6 py-4 text-center whitespace-nowrap text-body-muted">
                    ${totalReceived}/${totalOrdered} ชิ้น
                </td>
                <td class="px-6 py-4 text-center whitespace-nowrap">
                    <span class="inline-flex items-center gap-1.5 px-3 py-1 rounded-md text-xs font-medium ${style.class} whitespace-nowrap">
                        <i class="fa-solid ${style.icon}"></i> ${displayStatus}
                    </span>
                </td>
                <td class="px-6 py-4 text-right whitespace-nowrap shrink-0">
                    ${po.status === 'รอจัดส่ง' ? `
                        <button class="btn-action-arrival text-xs px-4 py-1.5 bg-slate-700 hover:bg-slate-600 text-ink rounded-lg transition-colors flex items-center justify-center gap-2 ml-auto shrink-0" data-id="${po._id}">
                            <i class="fa-solid fa-truck text-body-muted"></i> ของถึงสาขา
                        </button>
                    ` : (po.status === 'ของถึงสาขาแล้ว' || po.status === 'กำลังตรวจรับ') ? `
                        <button class="btn-open-receive text-xs px-4 py-1.5 bg-slate-700 hover:bg-slate-600 text-ink rounded-lg transition-colors flex items-center justify-center gap-2 ml-auto shrink-0" data-id="${po._id}">
                            <i class="fa-solid fa-boxes-packing text-body-muted"></i> ตรวจรับของ
                        </button>
                    ` : `
                        <button class="btn-view-po text-xs px-4 py-1.5 bg-slate-700 hover:bg-slate-600 text-ink rounded-lg transition-colors flex items-center justify-center gap-2 ml-auto shrink-0" data-id="${po._id}">
                            <i class="fa-solid fa-eye text-body-muted"></i> ดูข้อมูล
                        </button>
                    `}
                </td>
            `;
            tbody.appendChild(tr);

            // Bind click event handlers
            const btnArrival = tr.querySelector('.btn-action-arrival');
            if (btnArrival) {
                btnArrival.addEventListener('click', () => openArrivalModal(po));
            }

            const btnReceive = tr.querySelector('.btn-open-receive');
            if (btnReceive) {
                btnReceive.addEventListener('click', () => openReceiveModal(po));
            }

            const btnView = tr.querySelector('.btn-view-po');
            if (btnView) {
                btnView.addEventListener('click', () => openViewPOModal(po));
            }
        });
    };

    const loadPOs = async () => {
        const tbody = document.getElementById('table-body-receive-po');
        if (!tbody) return;
        tbody.innerHTML = '<tr><td colspan="6" class="text-center py-10"><i class="fa-solid fa-circle-notch fa-spin text-body-muted text-xl"></i><span class="text-xs text-body-muted block mt-2">กำลังดึงข้อมูลใบสั่งซื้อ...</span></td></tr>';

        try {
            const res = await authFetch(`${API_BASE_URL}/purchase-orders`);
            const json = await res.json();
            if (json.success) {
                cachedPOsData = json.data || [];

                // Update live status counts in tabs
                const allCount = cachedPOsData.length;
                const pendingCount = cachedPOsData.filter(po => po.status === 'รอจัดส่ง').length;
                const arrivedCount = cachedPOsData.filter(po => po.status === 'ของถึงสาขาแล้ว').length;
                const checkingCount = cachedPOsData.filter(po => po.status === 'กำลังตรวจรับ').length;
                const importedCount = cachedPOsData.filter(po => po.status === 'นำเข้าสำเร็จ' || po.status === 'รับของครบแล้ว').length;
                const cancelledCount = cachedPOsData.filter(po => po.status === 'ยกเลิก').length;

                const badgeAll = document.getElementById('badge-receive-all');
                const badgePending = document.getElementById('badge-receive-pending');
                const badgeArrived = document.getElementById('badge-receive-arrived');
                const badgeChecking = document.getElementById('badge-receive-checking');
                const badgeImported = document.getElementById('badge-receive-imported');
                const badgeCancelled = document.getElementById('badge-receive-cancelled');

                if (badgeAll) badgeAll.textContent = allCount;
                if (badgePending) badgePending.textContent = pendingCount;
                if (badgeArrived) badgeArrived.textContent = arrivedCount;
                if (badgeChecking) badgeChecking.textContent = checkingCount;
                if (badgeImported) badgeImported.textContent = importedCount;
                if (badgeCancelled) badgeCancelled.textContent = cancelledCount;

                renderFilteredPOs();
            } else {
                tbody.innerHTML = `<tr><td colspan="6" class="text-center py-6 text-red-400">เกิดข้อผิดพลาด: ${json.message}</td></tr>`;
            }
        } catch (e) {
            console.error(e);
            tbody.innerHTML = '<tr><td colspan="6" class="text-center py-6 text-red-400">เชื่อมต่อบริการล้มเหลว</td></tr>';
        }
    };

    const openArrivalModal = (po) => {
        // ตั้งค่าหัวข้อ PO Number ใน Modal
        document.getElementById('arrival-po-number').textContent = po.po_number;

        const isEditMode = po.status === 'ของถึงสาขาแล้ว' || po.status === 'กำลังตรวจรับ';
        const titlePrefix = document.getElementById('arrival-title-prefix');
        const modalIconContainer = document.getElementById('arrival-modal-icon-container');
        const modalIcon = document.getElementById('arrival-modal-icon');
        const bannerTitle = document.getElementById('arrival-banner-title');
        const bannerDesc = document.getElementById('arrival-banner-desc');
        const btnSubmit = document.getElementById('btn-submit-po-arrival');

        if (isEditMode) {
            if (titlePrefix) titlePrefix.textContent = 'แก้ไขข้อมูลสินค้าถึงสาขาและ IMEI:';
            if (modalIconContainer) {
                modalIconContainer.className = "w-10 h-10 rounded-xl bg-amber-500/10 flex items-center justify-center border border-amber-500/20";
            }
            if (modalIcon) {
                modalIcon.className = "fa-solid fa-pen-to-square text-amber-400";
            }
            if (bannerTitle) bannerTitle.textContent = 'โหมดแก้ไขข้อมูลการรับสินค้า';
            if (bannerDesc) bannerDesc.textContent = 'คุณกำลังแก้ไขข้อมูลหมายเลข IMEI และรายการสินค้าที่ได้รับสำหรับใบสั่งซื้อนี้ กรุณาแก้ไขข้อมูลให้ถูกต้องก่อนบันทึก';
            if (btnSubmit) {
                btnSubmit.textContent = 'บันทึกการแก้ไขข้อมูล';
                btnSubmit.className = "w-full py-4 bg-primary hover:bg-primary-pressed text-on-primary font-bold rounded-pill active:scale-[0.98] transition-all";
            }
        } else {
            if (titlePrefix) titlePrefix.textContent = 'ยืนยันสินค้าถึงสาขาและบันทึก IMEI:';
            if (modalIconContainer) {
                modalIconContainer.className = "w-10 h-10 rounded-xl bg-green-500/10 flex items-center justify-center border border-green-500/20";
            }
            if (modalIcon) {
                modalIcon.className = "fa-solid fa-truck-ramp-box text-green-400";
            }
            if (bannerTitle) bannerTitle.textContent = 'คำแนะนำสำหรับพนักงานขาย';
            if (bannerDesc) bannerDesc.textContent = 'กรุณาตรวจสอบสินค้าที่จัดส่งมาถึงสาขา หากสินค้าประเภทใดต้องมีการบันทึก IMEI (เช่น โทรศัพท์มือถือ/แท็บเล็ต) กรุณาสแกนหรือระบุ IMEI ให้ครบตามจำนวนที่ส่งมาให้เรียบร้อยก่อนทำการบันทึก';
            if (btnSubmit) {
                btnSubmit.textContent = 'ยืนยันรายการและแจ้งของถึงสาขา';
                btnSubmit.className = "w-full py-4 bg-primary hover:bg-primary-pressed text-on-primary font-bold rounded-pill active:scale-[0.98] transition-all";
            }
        }

        // เคลียร์และสร้างรายการสินค้าใน Modal
        const container = document.getElementById('arrival-po-items');
        container.innerHTML = '';

        po.items.forEach(item => {
            const card = document.createElement('div');
            card.className = 'bg-surface-tile-2 border border-hairline rounded-2xl p-4 space-y-3 po-arrival-row';
            card.dataset.itemId = item._id;
            card.dataset.trackImei = item.track_imei ? 'true' : 'false';
            card.dataset.productName = item.product_name;
            card.dataset.orderedQty = item.ordered_qty;

            if (item.track_imei) {
                const scannedList = Array.isArray(item.imeis_scanned) ? item.imeis_scanned : [];
                const importedList = Array.isArray(item.imported_imeis) ? item.imported_imeis : [];

                card.innerHTML = `
                    <div class="flex justify-between items-center border-b border-hairline pb-2">
                        <span class="font-bold text-ink text-base flex items-center gap-2">
                            <i class="fa-solid fa-mobile-screen text-ink"></i> ${item.product_name}
                        </span>
                        <span id="badge-count-${item._id}" class="text-xs font-semibold px-2 py-0.5 rounded-full bg-amber-500/10 text-amber-400 border border-amber-500/20">
                            สแกนแล้ว 0 / ${item.ordered_qty} เครื่อง
                        </span>
                    </div>
                    <div class="space-y-2.5">
                        <div class="flex justify-between items-center text-xs">
                            <label class="font-medium text-body-muted flex items-center gap-1">
                                <i class="fa-solid fa-barcode text-green-400"></i> ระบุหมายเลข IMEI สำหรับแต่ละเครื่อง (แสดงลำดับเลขด้านหน้า)
                            </label>
                            ${importedList.length > 0 ? `<span class="text-slate-505 font-bold text-emerald-400">(นำเข้าสต็อกแล้ว ${importedList.length} เครื่อง)</span>` : ''}
                        </div>
                        <div class="grid grid-cols-1 gap-2 max-h-[220px] overflow-y-auto pr-1">
                            ${Array.from({ length: item.ordered_qty }).map((_, idx) => {
                    const savedImei = scannedList[idx] || '';
                    const isImported = importedList.includes(savedImei) && savedImei !== '';
                    return `
                                    <div class="flex items-center gap-3 bg-surface-tile-3 px-3 py-2.5 rounded-xl border border-hairline focus-within:border-primary/50 transition-all ${isImported ? 'opacity-60 bg-surface-tile-3 border-hairline' : ''}">
                                        <span class="text-xs font-bold text-body-muted font-mono w-5 text-right">${idx + 1}.</span>
                                        <input type="text" 
                                               data-index="${idx}"
                                               value="${savedImei}"
                                               ${isImported ? 'readonly disabled' : ''}
                                               placeholder="${isImported ? 'นำเข้าสต็อกแล้ว' : `สแกนหรือพิมพ์หมายเลข IMEI เครื่องที่ ${idx + 1}`}"
                                               class="imei-indiv-input w-full bg-transparent ${isImported ? 'text-body-muted cursor-not-allowed font-mono text-sm uppercase focus:outline-none' : 'text-ink focus:outline-none placeholder-slate-700 font-mono text-sm uppercase'}">
                                    </div>
                                `;
                }).join('')}
                        </div>
                        <textarea id="textarea-imei-${item._id}" class="hidden"></textarea>
                    </div>
                `;

                const textarea = card.querySelector(`textarea`);
                const badge = card.querySelector(`#badge-count-${item._id}`);
                const inputs = card.querySelectorAll(`.imei-indiv-input`);

                const syncInputsToTextarea = () => {
                    const vals = Array.from(inputs).map(inp => inp.value.trim().toUpperCase()).filter(Boolean);
                    textarea.value = vals.join('\n');

                    // Update badge count
                    const count = vals.length;
                    if (badge) {
                        badge.textContent = `สแกนแล้ว ${count} / ${item.ordered_qty} เครื่อง`;
                        if (count === item.ordered_qty) {
                            badge.className = 'text-xs font-semibold px-2 py-0.5 rounded-full bg-green-500/10 text-green-400 border border-green-500/20';
                        } else {
                            badge.className = 'text-xs font-semibold px-2 py-0.5 rounded-full bg-amber-500/10 text-amber-400 border border-amber-500/20';
                        }
                    }
                };

                const validateAllRowInputs = () => {
                    let seen = new Set();
                    inputs.forEach((input) => {
                        const val = input.value.trim().toUpperCase();
                        if (!val) return;

                        // Check internal duplicate
                        if (seen.has(val)) {
                            showToast(`หมายเลข IMEI ซ้ำ: ${val}`, 'warning');
                            input.value = '';
                            return;
                        }
                        seen.add(val);

                        // Check DB cache
                        if (duplicateImeisDb.has(val)) {
                            showToast(`⚠️ หมายเลข IMEI (${val}) มีอยู่ในคลังสินค้าแล้ว`, 'error');
                            input.value = '';
                            return;
                        }

                        // Check DB
                        if (val.length >= 5 && !checkedImeis.has(val) && !pendingChecks.has(val)) {
                            pendingChecks.add(val);
                            authFetch(`${API_BASE_URL}/products/check-existence?code=${encodeURIComponent(val)}`)
                                .then(res => res.json())
                                .then(data => {
                                    pendingChecks.delete(val);
                                    if (data.success && data.exists) {
                                        duplicateImeisDb.add(val);
                                        showToast(`⚠️ หมายเลข IMEI (${val}) มีอยู่ในคลังสินค้าแล้ว`, 'error');
                                        input.value = '';
                                        syncInputsToTextarea();
                                    } else if (data.success) {
                                        checkedImeis.add(val);
                                    }
                                })
                                .catch(err => {
                                    console.error(err);
                                    pendingChecks.delete(val);
                                });
                        }
                    });

                    syncInputsToTextarea();
                };

                inputs.forEach((input, idx) => {
                    // keydown for Enter to jump focus
                    input.addEventListener('keydown', (e) => {
                        if (e.key === 'Enter') {
                            e.preventDefault();
                            let nextInp = inputs[idx + 1];
                            while (nextInp && (nextInp.disabled || nextInp.readOnly)) {
                                nextInp = inputs[nextInp.dataset.index + 1];
                            }
                            if (nextInp) {
                                nextInp.focus();
                            } else {
                                input.blur(); // Remove cursor focus on last item to save/commit immediately
                            }
                        }
                    });

                    // paste listener to distribute lines across inputs
                    input.addEventListener('paste', (e) => {
                        e.preventDefault();
                        const text = (e.clipboardData || window.clipboardData).getData('text');
                        const pastedLines = text.split('\n').map(x => x.trim().toUpperCase()).filter(Boolean);

                        let pastedCount = 0;
                        for (let i = 0; i < inputs.length; i++) {
                            const targetIdx = idx + i;
                            const targetInput = inputs[targetIdx];
                            if (targetInput && !targetInput.disabled && !targetInput.readOnly) {
                                if (pastedLines[pastedCount]) {
                                    targetInput.value = pastedLines[pastedCount];
                                    pastedCount++;
                                }
                            }
                        }

                        validateAllRowInputs();
                    });

                    // change listener for individual validation
                    input.addEventListener('change', () => {
                        const val = input.value.trim().toUpperCase();
                        if (!val) {
                            syncInputsToTextarea();
                            return;
                        }

                        // 1. Check internal duplicates
                        const isDuplicate = Array.from(inputs).some((inp, i) => i !== idx && inp.value.trim().toUpperCase() === val);
                        if (isDuplicate) {
                            showToast(`หมายเลข IMEI ซ้ำ: ${val}`, 'warning');
                            input.value = '';
                            input.focus();
                            syncInputsToTextarea();
                            return;
                        }

                        // 2. Check DB cached duplicates
                        if (duplicateImeisDb.has(val)) {
                            showToast(`⚠️ หมายเลข IMEI (${val}) มีอยู่ในคลังสินค้าแล้ว`, 'error');
                            input.value = '';
                            input.focus();
                            syncInputsToTextarea();
                            return;
                        }

                        // 3. Check DB existence
                        if (val.length >= 5 && !checkedImeis.has(val) && !pendingChecks.has(val)) {
                            pendingChecks.add(val);
                            authFetch(`${API_BASE_URL}/products/check-existence?code=${encodeURIComponent(val)}`)
                                .then(res => res.json())
                                .then(data => {
                                    pendingChecks.delete(val);
                                    if (data.success && data.exists) {
                                        duplicateImeisDb.add(val);
                                        showToast(`⚠️ หมายเลข IMEI (${val}) มีอยู่ในคลังสินค้าแล้ว`, 'error');
                                        input.value = '';
                                        input.focus();
                                        syncInputsToTextarea();
                                    } else if (data.success) {
                                        checkedImeis.add(val);
                                    }
                                })
                                .catch(err => {
                                    console.error(err);
                                    pendingChecks.delete(val);
                                });
                        }

                        syncInputsToTextarea();
                    });

                    input.addEventListener('blur', () => {
                        syncInputsToTextarea();
                    });
                });

                // Sync initial value
                syncInputsToTextarea();
            } else {
                const importedQty = item.imported_qty || 0;
                const remainingQty = item.ordered_qty - importedQty;

                card.innerHTML = `
                    <div class="flex justify-between items-center border-b border-hairline pb-2.5">
                        <span class="font-bold text-ink text-base flex items-center gap-2">
                            <i class="fa-solid fa-plug text-ink"></i> ${item.product_name}
                        </span>
                        <div class="text-xs space-x-2">
                            <span class="font-semibold px-2 py-0.5 rounded-full bg-surface-chip text-body-muted">
                                สั่งซื้อ: ${item.ordered_qty} ชิ้น
                            </span>
                            <span class="font-semibold px-2 py-0.5 rounded-full bg-green-500/10 text-green-400 border border-green-500/20">
                                นำเข้าแล้ว: ${importedQty} / ${item.ordered_qty} ชิ้น
                            </span>
                        </div>
                    </div>
                    <div class="flex justify-between items-center pt-1">
                        <span class="text-xs text-body-muted">
                            อุปกรณ์ทั่วไป (ไม่มี IMEI) ค้างส่ง: <strong class="text-amber-400 font-mono text-sm">${remainingQty}</strong> ชิ้น
                        </span>
                        ${remainingQty > 0 ? `
                            <div class="flex items-center gap-2">
                                <label class="text-xs text-body-muted font-medium">ส่งมาเพิ่มรอบนี้:</label>
                                <input type="number" 
                                       min="0" 
                                       max="${remainingQty}" 
                                       value="${remainingQty}" 
                                       class="po-arrival-accessory-qty w-24 bg-surface-chip text-ink border border-divider-soft focus:border-primary-focus font-mono text-sm font-bold text-center py-2 rounded-xl focus:outline-none focus:ring-1 focus:ring-primary-focus/30 transition-colors">
                            </div>
                        ` : `
                            <span class="text-xs text-emerald-400 font-bold flex items-center gap-1">
                                <i class="fa-solid fa-circle-check"></i> ได้รับครบแล้ว
                            </span>
                        `}
                    </div>
                `;
            }
            container.appendChild(card);
        });

        // เปิดใช้งาน Modal
        const modal = document.getElementById('modal-po-arrival');
        modal.classList.remove('hidden');
        void modal.offsetWidth; // Force reflow
        modal.classList.remove('opacity-0', 'pointer-events-none');

        // ตั้งค่าปุ่มตกลงแจ้งของถึงร้าน
        btnSubmit.onclick = async () => {
            const rows = document.querySelectorAll('.po-arrival-row');
            const received_items = {};
            let totalNewReceived = 0;

            for (let row of rows) {
                const itemId = row.dataset.itemId;
                const trackImei = row.dataset.trackImei === 'true';
                const productName = row.dataset.productName;
                const orderedQty = Number(row.dataset.orderedQty);

                const dbItem = po.items.find(i => i._id === itemId);
                const importedImeis = dbItem ? (dbItem.imported_imeis || []) : [];
                const importedQty = dbItem ? (dbItem.imported_qty || 0) : 0;

                if (trackImei) {
                    const textarea = row.querySelector('textarea');
                    const imeis = textarea.value.split('\n').map(x => x.trim().toUpperCase()).filter(Boolean);

                    if (imeis.length > orderedQty) {
                        showToast(`จำนวน IMEI สำหรับ ${productName} เกินจำนวนสั่งซื้อ (${orderedQty})`, 'error');
                        return;
                    }

                    const uniqueImeis = [...new Set(imeis)];
                    if (uniqueImeis.length !== imeis.length) {
                        showToast(`มีหมายเลข IMEI ซ้ำกันในรายการสินค้า ${productName}`, 'error');
                        return;
                    }

                    // ป้องกันการลบหรือแก้ไข IMEI เดิมที่นำเข้าคลังไปแล้ว
                    const modifiedImported = importedImeis.some(imei => !imeis.includes(imei));
                    if (modifiedImported) {
                        showToast(`ไม่อนุญาตให้แก้ไขหรือลบหมายเลข IMEI ที่นำเข้าสต็อกแล้วในสินค้า ${productName}`, 'error');
                        return;
                    }

                    const newImeisCount = imeis.length - importedImeis.length;
                    if (newImeisCount > 0) {
                        totalNewReceived += newImeisCount;
                    }

                    received_items[itemId] = { imeis };
                } else {
                    const inputQty = row.querySelector('.po-arrival-accessory-qty');
                    const qtyThisRound = inputQty ? Number(inputQty.value) : 0;

                    if (qtyThisRound < 0) {
                        showToast(`จำนวนที่รับสำหรับ ${productName} ต้องไม่ต่ำกว่า 0`, 'error');
                        return;
                    }

                    const remaining = orderedQty - importedQty;
                    if (qtyThisRound > remaining) {
                        showToast(`จำนวนรับเพิ่มสำหรับ ${productName} เกินกว่าจำนวนค้างส่ง (ค้างส่ง: ${remaining} ชิ้น)`, 'error');
                        return;
                    }

                    if (qtyThisRound > 0) {
                        totalNewReceived += qtyThisRound;
                    }

                    received_items[itemId] = { qty: importedQty + qtyThisRound };
                }
            }

            if (totalNewReceived === 0) {
                showToast('กรุณาระบุสินค้าหรือ IMEI ที่ได้รับเพิ่มอย่างน้อย 1 รายการก่อนกดยืนยัน', 'warning');
                return;
            }

            const branchName = po.branch_id ? (typeof po.branch_id === 'object' ? po.branch_id.name : po.branch_id) : '-';

            // สร้าง HTML สำหรับแสดงข้อมูลให้พนักงานตรวจสอบก่อนยืนยันจริง (เวอร์ชันขนาดใหญ่/อ่านง่ายชัดเจน)
            let confirmHtml = `
                <div class="text-left bg-surface-tile-3 rounded-2xl p-5 border border-hairline space-y-5 max-h-[350px] overflow-y-auto mb-2 text-base mt-3 scrollbar-thin">
                    <!-- PO Details Summary -->
                    <div class="space-y-2.5 border-b border-hairline pb-4 text-sm">
                        <div class="flex justify-between items-center">
                            <span class="text-body-muted font-medium">เลขที่ PO:</span>
                            <span class="font-mono font-bold text-ink text-base">${po.po_number}</span>
                        </div>
                        <div class="flex justify-between items-center">
                            <span class="text-body-muted font-medium">คู่ค้า / Supplier:</span>
                            <span class="text-ink font-bold text-sm">${po.supplier_name || '-'}</span>
                        </div>
                        <div class="flex justify-between items-center">
                            <span class="text-body-muted font-medium">สาขา:</span>
                            <span class="text-ink font-bold text-sm">${branchName}</span>
                        </div>
                    </div>
                    
                    <!-- Items List -->
                    <div class="space-y-4">
                        <span class="text-body-muted font-bold text-xs uppercase tracking-wider block">รายการที่จะแจ้งของถึงสาขาในรอบนี้:</span>
            `;

            po.items.forEach(item => {
                const receivedInfo = received_items[item._id];
                const importedList = Array.isArray(item.imported_imeis) ? item.imported_imeis : [];
                const importedQty = item.imported_qty || 0;

                if (item.track_imei && receivedInfo && receivedInfo.imeis) {
                    const newImeisThisRound = receivedInfo.imeis.filter(imei => !importedList.includes(imei));
                    if (newImeisThisRound.length > 0) {
                        confirmHtml += `
                            <div class="border-b border-hairline pb-3.5 last:border-0 last:pb-0 space-y-2">
                                <div class="flex justify-between items-start">
                                    <span class="font-bold text-ink text-sm flex items-center gap-2">
                                        <i class="fa-solid fa-mobile-screen text-ink text-xs"></i> ${item.product_name}
                                    </span>
                                    <span class="text-xs bg-surface-chip text-ink border border-hairline px-2.5 py-0.5 rounded-full font-bold font-mono">
                                        ส่งมาเพิ่ม ${newImeisThisRound.length} เครื่อง (รวมรับแล้ว ${receivedInfo.imeis.length}/${item.ordered_qty})
                                    </span>
                                </div>
                                <!-- IMEI Pills -->
                                <div class="flex flex-wrap gap-1.5 mt-2">
                                    ${newImeisThisRound.map(imei => `
                                        <span class="px-2.5 py-1 bg-surface-chip text-body-muted rounded-lg border border-hairline font-mono text-xs tracking-wider font-semibold">${imei}</span>
                                    `).join('')}
                                </div>
                            </div>
                        `;
                    }
                } else if (receivedInfo) {
                    const newQtyThisRound = receivedInfo.qty - importedQty;
                    if (newQtyThisRound > 0) {
                        confirmHtml += `
                            <div class="border-b border-hairline pb-3.5 last:border-0 last:pb-0 flex justify-between items-center">
                                <span class="font-bold text-ink text-sm flex items-center gap-2">
                                    <i class="fa-solid fa-plug text-ink text-xs"></i> ${item.product_name}
                                </span>
                                <span class="text-xs bg-surface-chip text-ink border border-hairline px-2.5 py-0.5 rounded-full font-bold font-mono">
                                    ส่งมาเพิ่ม ${newQtyThisRound} ชิ้น (รวมรับแล้ว ${receivedInfo.qty}/${item.ordered_qty})
                                </span>
                            </div>
                        `;
                    }
                }
            });

            confirmHtml += `
                    </div>
                </div>
                <p class="text-xs text-body-muted text-center mt-3">โปรดตรวจสอบรายละเอียดข้อมูลด้านบนอีกครั้งเพื่อความถูกต้องก่อนกดยืนยัน</p>
            `;

            showConfirm(
                isEditMode ? 'ยืนยันบันทึกการแก้ไขข้อมูล' : 'ยืนยันแจ้งสินค้าถึงสาขา',
                confirmHtml,
                async () => {
                    try {
                        btnSubmit.disabled = true;
                        btnSubmit.innerHTML = '<i class="fa-solid fa-spinner fa-spin mr-2"></i>กำลังบันทึกข้อมูล...';

                        const res = await authFetch(`${API_BASE_URL}/po/${po._id}/report-arrival`, {
                            method: 'POST',
                            headers: { 'Content-Type': 'application/json' },
                            body: JSON.stringify({ received_items })
                        });

                        const json = await res.json();
                        if (json.success) {
                            showToast(isEditMode ? 'แก้ไขข้อมูลการรับสินค้าสำเร็จเรียบร้อยแล้ว!' : 'แจ้งสถานะสินค้าถึงสาขาและบันทึก IMEI สำเร็จเรียบร้อยแล้ว!', 'success');
                            document.getElementById('btn-close-po-arrival').click();
                            if (typeof loadArrivalPOs === 'function') loadArrivalPOs();
                            if (typeof loadPOs === 'function') loadPOs();
                        } else {
                            showToast(json.message, 'error');
                        }
                    } catch (err) {
                        console.error(err);
                        showToast('เกิดข้อผิดพลาดในการบันทึกรายการ', 'error');
                    } finally {
                        btnSubmit.disabled = false;
                        btnSubmit.innerHTML = isEditMode ? 'บันทึกการแก้ไขข้อมูล' : 'ยืนยันรายการและแจ้งของถึงสาขา';
                    }
                },
                isEditMode ? 'บันทึกข้อมูล' : 'ยืนยันและส่งข้อมูล',
                'success',
                'max-w-2xl'
            );
        };
    };

    const openReceiveModal = (po) => {
        const modal = document.getElementById('modal-po-receive');
        document.getElementById('receive-po-number').textContent = po.po_number;
        const container = document.getElementById('receive-po-items');
        container.innerHTML = '';

        window.__currentReceivePO = po._id;

        po.items.forEach(item => {
            const importedQty = item.imported_qty || 0;
            const pendingQty = item.ordered_qty - importedQty;
            if (pendingQty <= 0) return; // Full received already

            const el = document.createElement('div');
            el.className = 'p-5  border border-hairline rounded-xl po-receive-row';
            el.dataset.itemId = item._id;
            el.dataset.trackImei = item.track_imei;
            el.dataset.importedImeis = JSON.stringify(item.imported_imeis || []);
            el.dataset.importedQty = importedQty;

            let inputHtml = '';
            if (item.track_imei) {
                inputHtml = `
                    <div class="mt-4 space-y-3">
                        <div class="flex items-center justify-between">
                            <label class="text-xs font-bold text-body-muted block flex items-center gap-1.5">
                                <i class="fa-solid fa-barcode text-ink text-sm"></i>
                                สแกนหรือพิมพ์ IMEI (ยิงบาร์โค้ดแล้วกด Enter)
                            </label>
                            <span class="text-xs bg-surface-chip text-body-muted px-2.5 py-1 rounded-full font-bold">
                                สแกนแล้ว <span class="scanned-count font-mono text-ink font-black">0</span> / <span class="pending-count font-mono">${pendingQty}</span> เครื่อง
                            </span>
                        </div>
                        <input type="text" 
                            class="scan-imei-input w-full bg-surface-chip border border-divider-soft focus:border-primary-focus text-lg rounded-xl px-4 py-3.5 text-ink focus:outline-none focus:ring-2 focus:ring-primary-focus/20 transition-all font-mono placeholder-ink-muted-48"
                            placeholder="ยิงบาร์โค้ด หรือพิมพ์ IMEI ที่นี่..." 
                            autocomplete="off">
                        
                        <div class="scanned-imeis-container flex flex-wrap gap-2 min-h-[50px] p-3  border border-hairline rounded-xl">
                            <div class="no-imeis-placeholder text-xs text-body-muted flex items-center justify-center w-full py-2">
                                <i class="fa-solid fa-info-circle mr-1"></i> ยังไม่มีการสแกน IMEI
                            </div>
                        </div>
                    </div>
                `;
            } else {
                const defaultQty = Math.max(0, (item.received_qty || 0) - importedQty);
                inputHtml = `
                    <div class="mt-4 max-w-[200px]">
                        <label class="text-xs font-bold text-body-muted mb-1.5 block">จำนวนที่รับเข้า (รอรับ ${pendingQty} ชิ้น)</label>
                        <input type="number" class="receive-qty w-full px-3 py-2.5 text-sm bg-surface-chip border border-divider-soft text-ink rounded-lg focus:border-primary-focus focus:ring-1 focus:ring-primary-focus focus:outline-none font-bold text-center" min="0" max="${pendingQty}" value="${defaultQty}">
                    </div>
                `;
            }

            el.innerHTML = `
                <div class="flex justify-between items-start gap-4">
                    <div>
                        <h5 class=" font-bold text-base flex items-center gap-2">
                            <span>${item.product_name}</span>
                            <span class="text-xs text-body-muted font-mono font-normal">(${item.product_code})</span>
                        </h5>
                        <p class="text-xs text-body-muted mt-1">สั่ง: <span class="text-ink font-bold">${item.ordered_qty}</span> | นำเข้าคลังแล้ว: <span class="text-emerald-400 font-bold">${importedQty}</span> | <span class="text-amber-400 font-bold">ค้างรับ: ${pendingQty}</span></p>
                    </div>
                    ${item.track_imei ?
                    `<span class="text-xs font-semibold px-2.5 py-1 bg-surface-chip text-ink border border-hairline rounded-lg flex items-center gap-1"><i class="fa-solid fa-barcode text-xs"></i> เก็บ IMEI</span>` :
                    `<span class="text-xs font-semibold px-2.5 py-1 bg-surface-chip text-ink border border-hairline rounded-lg flex items-center gap-1"><i class="fa-solid fa-calculator text-xs"></i> นับจำนวน</span>`
                }
                </div>
                ${inputHtml}
            `;
            container.appendChild(el);

            if (item.track_imei) {
                const input = el.querySelector('.scan-imei-input');
                const tagsContainer = el.querySelector('.scanned-imeis-container');
                const scannedCountEl = el.querySelector('.scanned-count');
                const placeholder = el.querySelector('.no-imeis-placeholder');

                const updateScannedCount = () => {
                    const tags = tagsContainer.querySelectorAll('.imei-tag');
                    scannedCountEl.textContent = tags.length;
                    if (tags.length === 0) {
                        if (placeholder) placeholder.style.display = 'flex';
                    } else {
                        if (placeholder) placeholder.style.display = 'none';
                    }
                };

                const importedImeis = Array.isArray(item.imported_imeis) ? item.imported_imeis : [];

                const handleRemoveImei = (tagEl, imeiVal) => {
                    showConfirm('ยืนยันการลบ IMEI', `คุณต้องการลบ IMEI: ${imeiVal} ใช่หรือไม่?`, async () => {
                        tagEl.remove();
                        updateScannedCount();

                        // Get all remaining IMEIs in the UI container for this row and merge with imported ones to save cumulative set
                        const uiImeis = Array.from(tagsContainer.querySelectorAll('.imei-tag-text')).map(t => t.textContent.trim());
                        const remainingImeis = [...importedImeis, ...uiImeis];

                        try {
                            const received_items = {};
                            received_items[item._id] = { imeis: remainingImeis };

                            const res = await authFetch(`${API_BASE_URL}/po/${window.__currentReceivePO}/scan-item`, {
                                method: 'POST',
                                headers: { 'Content-Type': 'application/json' },
                                body: JSON.stringify({ received_items })
                            });
                            const json = await res.json();
                            if (json.success) {
                                showToast(`ลบ IMEI ${imeiVal} สำเร็จ`, 'success');
                                if (typeof loadPOs === 'function') loadPOs();
                            } else {
                                showToast(json.message || 'ไม่สามารถลบ IMEI ในฐานข้อมูลได้', 'error');
                            }
                        } catch (err) {
                            console.error('Error auto-saving IMEI deletion:', err);
                            showToast('เกิดข้อผิดพลาดในการเชื่อมต่อเซิร์ฟเวอร์เพื่อบันทึกการลบ IMEI', 'error');
                        }
                    }, 'ยืนยันการลบ');
                };

                // ถ้ามี IMEI ที่สแกนไว้จากหน้าร้าน ให้แสดงขึ้นมาเฉพาะ IMEI ใหม่ที่ยังไม่ได้นำเข้าสต็อก
                const newImeis = (Array.isArray(item.imeis_scanned) ? item.imeis_scanned : []).filter(val => !importedImeis.includes(val));
                if (newImeis.length > 0) {
                    newImeis.forEach(val => {
                        const tag = document.createElement('div');
                        tag.className = 'imei-tag inline-flex items-center gap-1.5 bg-surface-chip border border-hairline text-ink px-3 py-1.5 rounded-lg text-sm transition-all hover:bg-surface-tile-2 animate-fade-in font-mono';
                        tag.innerHTML = `
                            <span class="imei-tag-text font-bold tracking-wide">${val}</span>
                            <button type="button" class="btn-remove-imei text-primary hover:text-red-400 font-bold ml-0.5 focus:outline-none transition-colors text-base leading-none">&times;</button>
                        `;

                        tag.querySelector('.btn-remove-imei').addEventListener('click', () => {
                            handleRemoveImei(tag, val);
                        });

                        tagsContainer.appendChild(tag);
                    });
                    updateScannedCount();
                }

                input.addEventListener('keydown', async (e) => {
                    if (e.key === 'Enter') {
                        e.preventDefault();
                        const val = input.value.trim();
                        if (!val) return;

                        // Check duplicate in current scanned list
                        const existingTags = Array.from(tagsContainer.querySelectorAll('.imei-tag-text')).map(t => t.textContent.trim());
                        if (existingTags.includes(val)) {
                            showToast('IMEI นี้ถูกสแกนในรายการนี้แล้ว', 'warning');
                            input.value = '';
                            return;
                        }

                        // Check limit
                        if (existingTags.length >= pendingQty) {
                            showToast(`สแกนครบตามจำนวนค้างรับ (${pendingQty} เครื่อง) แล้ว`, 'warning');
                            input.value = '';
                            return;
                        }

                        // Check global database existence
                        try {
                            input.disabled = true;
                            const res = await authFetch(`${API_BASE_URL}/products/check-existence?code=${encodeURIComponent(val)}`);
                            const data = await res.json();
                            input.disabled = false;
                            input.focus();

                            if (data.success && data.exists) {
                                showToast(`⚠️ รหัสสินค้า/IMEI (${val}) มีอยู่ในระบบแล้ว ไม่สามารถนำเข้าซ้ำได้`, 'error');
                                input.value = '';
                                return;
                            }
                        } catch (err) {
                            console.error('Error checking code existence:', err);
                            input.disabled = false;
                            input.focus();
                        }

                        // Add tag
                        const tag = document.createElement('div');
                        tag.className = 'imei-tag inline-flex items-center gap-1.5 bg-surface-chip border border-hairline text-ink px-3 py-1.5 rounded-lg text-sm transition-all hover:bg-surface-tile-2 animate-fade-in font-mono';
                        tag.innerHTML = `
                            <span class="imei-tag-text font-bold tracking-wide">${val}</span>
                            <button type="button" class="btn-remove-imei text-primary hover:text-red-400 font-bold ml-0.5 focus:outline-none transition-colors text-base leading-none">&times;</button>
                        `;

                        tag.querySelector('.btn-remove-imei').addEventListener('click', () => {
                            handleRemoveImei(tag, val);
                        });

                        tagsContainer.appendChild(tag);
                        input.value = '';
                        updateScannedCount();
                    }
                });
            }
        });

        if (container.children.length === 0) {
            container.innerHTML = '<div class="text-center text-body-muted py-6">รับสินค้าครบทุกรายการแล้ว</div>';
            document.getElementById('btn-submit-po-receive').style.display = 'none';
        } else {
            document.getElementById('btn-submit-po-receive').style.display = 'block';
        }

        modal.classList.remove('hidden');
        void modal.offsetWidth;
        modal.classList.remove('opacity-0', 'pointer-events-none');
    };

    if (document.getElementById('btn-close-po-receive')) {
        document.getElementById('btn-close-po-receive').addEventListener('click', () => {
            const modal = document.getElementById('modal-po-receive');
            modal.classList.add('opacity-0', 'pointer-events-none');
            setTimeout(() => modal.classList.add('hidden'), 300);
        });
    }

    if (document.getElementById('btn-close-po-arrival')) {
        document.getElementById('btn-close-po-arrival').addEventListener('click', () => {
            const modal = document.getElementById('modal-po-arrival');
            modal.classList.add('opacity-0', 'pointer-events-none');
            setTimeout(() => modal.classList.add('hidden'), 300);
        });
    }

    if (document.getElementById('btn-submit-po-receive')) {
        document.getElementById('btn-submit-po-receive').addEventListener('click', async () => {
            const btn = document.getElementById('btn-submit-po-receive');
            const originalText = btn.innerHTML;

            const rows = document.querySelectorAll('.po-receive-row');
            const received_items = {};
            let hasInput = false;

            rows.forEach(row => {
                const itemId = row.dataset.itemId;
                const trackImei = row.dataset.trackImei === 'true';
                const importedImeis = JSON.parse(row.dataset.importedImeis || '[]');
                const importedQty = Number(row.dataset.importedQty || 0);

                if (trackImei) {
                    const uiImeis = Array.from(row.querySelectorAll('.imei-tag-text')).map(t => t.textContent.trim());
                    const imeis = [...importedImeis, ...uiImeis];
                    received_items[itemId] = { imeis };
                    if (uiImeis.length > 0) {
                        hasInput = true;
                    }
                } else {
                    const qtyInput = row.querySelector('.receive-qty');
                    const qtyNewRound = qtyInput ? Number(qtyInput.value) : 0;
                    received_items[itemId] = { qty: importedQty + qtyNewRound };
                    if (qtyNewRound > 0) {
                        hasInput = true;
                    }
                }
            });

            if (!hasInput) {
                return showToast('กรุณาระบุจำนวนหรือ IMEI อย่างน้อย 1 รายการ', 'error');
            }

            try {
                btn.disabled = true;
                btn.innerHTML = '<i class="fa-solid fa-circle-notch fa-spin"></i> กำลังบันทึก...';

                // In the linked PO workflow, Stock staff scans items and temporarily saves it to scan-item API,
                // which transitions the PO status to 'กำลังตรวจรับ' (Awaiting Import Approval).
                const res = await authFetch(`${API_BASE_URL}/po/${window.__currentReceivePO}/scan-item`, {
                    method: 'POST',
                    headers: { 'Content-Type': 'application/json' },
                    body: JSON.stringify({ received_items })
                });
                const json = await res.json();

                if (json.success) {
                    showToast('บันทึกความคืบหน้าการตรวจรับเรียบร้อยแล้ว (รอผู้จัดการอนุมัติเพื่อนำเข้าคลังสินค้า)', 'success');
                    document.getElementById('btn-close-po-receive').click();
                    if (typeof loadPOs === 'function') loadPOs();
                } else {
                    showToast(json.message, 'error');
                }
            } catch (err) {
                console.error(err);
                showToast('เกิดข้อผิดพลาด', 'error');
            } finally {
                btn.disabled = false;
                btn.innerHTML = originalText;
            }
        });
    }

    // ==========================================
    // Connected PO Workflow: แจ้งของถึงสาขา (Sales/Front Store)
    // ==========================================
    let isArrivalTabsInitialized = false;

    const loadArrivalPOs = async () => {
        const tbody = document.getElementById('table-body-arrival-po');
        const tbodyCompleted = document.getElementById('table-body-arrival-completed-po');
        const badgePending = document.getElementById('badge-arrival-pending-count');
        const badgeCompleted = document.getElementById('badge-arrival-completed-count');

        // Tab click listeners initialization
        const tabArrivalPending = document.getElementById('tab-arrival-pending');
        const tabArrivalCompleted = document.getElementById('tab-arrival-completed');
        const sectionArrivalPending = document.getElementById('section-arrival-pending');
        const sectionArrivalCompleted = document.getElementById('section-arrival-completed');

        if (!isArrivalTabsInitialized && tabArrivalPending && tabArrivalCompleted) {
            tabArrivalPending.addEventListener('click', () => {
                tabArrivalPending.className = "px-6 py-3.5 border-b-2 border-primary text-primary text-sm font-bold flex items-center gap-2 transition-all duration-200 focus:outline-none";
                tabArrivalCompleted.className = "px-6 py-3.5 border-b-2 border-transparent text-body-muted hover:text-ink text-sm font-semibold flex items-center gap-2 transition-all duration-200 focus:outline-none";
                if (sectionArrivalPending) sectionArrivalPending.classList.remove('hidden');
                if (sectionArrivalCompleted) sectionArrivalCompleted.classList.add('hidden');
            });

            tabArrivalCompleted.addEventListener('click', () => {
                tabArrivalCompleted.className = "px-6 py-3.5 border-b-2 border-primary text-primary text-sm font-bold flex items-center gap-2 transition-all duration-200 focus:outline-none";
                tabArrivalPending.className = "px-6 py-3.5 border-b-2 border-transparent text-body-muted hover:text-ink text-sm font-semibold flex items-center gap-2 transition-all duration-200 focus:outline-none";
                if (sectionArrivalCompleted) sectionArrivalCompleted.classList.remove('hidden');
                if (sectionArrivalPending) sectionArrivalPending.classList.add('hidden');
            });
            isArrivalTabsInitialized = true;
        }

        if (!tbody) return;
        tbody.innerHTML = '<tr><td colspan="6" class="text-center py-6 text-body-muted"><i class="fa-solid fa-spinner fa-spin mr-2 text-green-400"></i>กำลังโหลดข้อมูลใบสั่งซื้อ...</td></tr>';
        if (tbodyCompleted) {
            tbodyCompleted.innerHTML = '<tr><td colspan="6" class="text-center py-6 text-body-muted"><i class="fa-solid fa-spinner fa-spin mr-2 text-green-400"></i>กำลังโหลดข้อมูลใบสั่งซื้อ...</td></tr>';
        }

        try {
            const res = await authFetch(`${API_BASE_URL}/purchase-orders`);
            const json = await res.json();
            if (json.success) {
                tbody.innerHTML = '';
                if (tbodyCompleted) tbodyCompleted.innerHTML = '';

                // Filter POs heading to branch (status: 'รอจัดส่ง' หรือที่มีการลบ IMEI/สแกนไม่ครบในภายหลัง)
                const pendingPOs = json.data.filter(po => {
                    if (po.status === 'รอจัดส่ง') return true;

                    if (po.status === 'ของถึงสาขาแล้ว' || po.status === 'กำลังตรวจรับ') {
                        // เช็คว่ามีสินค้าตัวใดสแกนไม่ครบหรือไม่
                        return po.items.some(item => {
                            if (item.track_imei) {
                                const currentImeisCount = Array.isArray(item.imeis_scanned) ? item.imeis_scanned.length : 0;
                                return currentImeisCount < item.ordered_qty;
                            } else {
                                return (item.received_qty || 0) < item.ordered_qty;
                            }
                        });
                    }
                    return false;
                });

                // Filter POs completed (status: 'ของถึงสาขาแล้ว'/'กำลังตรวจรับ' ที่สแกนครบถ้วน หรือ 'นำเข้าสำเร็จ'/'รับของครบแล้ว')
                const completedPOs = json.data.filter(po => {
                    if (po.status === 'นำเข้าสำเร็จ' || po.status === 'รับของครบแล้ว') return true;
                    if (po.status === 'ของถึงสาขาแล้ว' || po.status === 'กำลังตรวจรับ') {
                        const isIncomplete = po.items.some(item => {
                            if (item.track_imei) {
                                const currentImeisCount = Array.isArray(item.imeis_scanned) ? item.imeis_scanned.length : 0;
                                return currentImeisCount < item.ordered_qty;
                            } else {
                                return (item.received_qty || 0) < item.ordered_qty;
                            }
                        });
                        return !isIncomplete;
                    }
                    return false;
                });

                // Update Badges
                if (badgePending) badgePending.textContent = pendingPOs.length;
                if (badgeCompleted) badgeCompleted.textContent = completedPOs.length;

                // 1. Render Pending POs
                if (pendingPOs.length === 0) {
                    tbody.innerHTML = '<tr><td colspan="6" class="text-center py-8 text-body-muted text-sm"><i class="fa-solid fa-inbox text-slate-650 text-xl block mb-2"></i>ไม่มีใบสั่งซื้อที่อยู่ระหว่างจัดส่งถึงสาขานี้</td></tr>';
                } else {
                    pendingPOs.forEach(po => {
                        const tr = document.createElement('tr');
                        tr.className = 'border-b border-hairline hover:bg-surface-chip/30 transition-all duration-150';
                        const itemsDesc = po.items.map(item => `${item.product_name} (${item.ordered_qty} ชิ้น)`).join(', ');

                        tr.innerHTML = `
                            <td class="px-4 py-4 md:px-6 font-mono font-bold text-ink whitespace-nowrap">${po.po_number}</td>
                            <td class="px-4 py-4 md:px-6 text-sm text-body-muted whitespace-nowrap">${new Date(po.createdAt).toLocaleDateString('th-TH')}</td>
                            <td class="px-4 py-4 md:px-6 text-sm text-body-muted whitespace-nowrap">${po.supplier_name}</td>
                            <td class="px-4 py-4 md:px-6 text-sm text-body-muted max-w-[250px] truncate font-medium whitespace-nowrap" title="${itemsDesc}">${itemsDesc}</td>
                            <td class="px-4 py-4 md:px-6 text-center whitespace-nowrap">
                                <span class="px-2.5 py-1 rounded-full text-xs font-semibold bg-amber-500/10 text-amber-400 border border-amber-500/20 whitespace-nowrap inline-block">${po.status}</span>
                            </td>
                            <td class="px-4 py-4 md:px-6 text-right whitespace-nowrap">
                                <button class="btn-confirm-arrival px-3 py-1.5 bg-green-500/10 text-green-400 hover:bg-green-500/20 border border-green-500/35 hover:border-green-500/60 rounded-xl text-xs font-bold transition-all inline-flex items-center gap-1.5 active:scale-95 whitespace-nowrap shrink-0" data-id="${po._id}">
                                    <i class="fa-solid fa-truck-circle-check"></i> ยืนยันของถึงร้าน
                                </button>
                            </td>
                        `;
                        tbody.appendChild(tr);

                        tr.querySelector('.btn-confirm-arrival').addEventListener('click', () => {
                            openArrivalModal(po);
                        });
                    });
                }

                // 2. Render Completed POs
                if (tbodyCompleted) {
                    if (completedPOs.length === 0) {
                        tbodyCompleted.innerHTML = '<tr><td colspan="6" class="text-center py-8 text-body-muted text-sm"><i class="fa-solid fa-clipboard-check text-slate-650 text-xl block mb-2"></i>ไม่มีใบสั่งซื้อที่ดำเนินการเสร็จสมบูรณ์</td></tr>';
                    } else {
                        completedPOs.forEach(po => {
                            const tr = document.createElement('tr');
                            tr.className = 'border-b border-hairline hover:bg-surface-chip/20 transition-all duration-150 opacity-90 hover:opacity-100';
                            const itemsDesc = po.items.map(item => `${item.product_name} (${item.ordered_qty} ชิ้น)`).join(', ');

                            let statusBadge = '';
                            if (po.status === 'นำเข้าสำเร็จ' || po.status === 'รับของครบแล้ว') {
                                statusBadge = `<span class="px-2.5 py-1 rounded-full text-xs font-semibold bg-green-500/10 text-green-400 border border-green-500/20 whitespace-nowrap inline-block"><i class="fa-solid fa-circle-check text-[10px] mr-1"></i>นำเข้าสต็อกแล้ว</span>`;
                            } else {
                                statusBadge = `<span class="px-2.5 py-1 rounded-full text-xs font-semibold bg-emerald-500/10 text-emerald-400 border border-emerald-500/20 whitespace-nowrap inline-block"><i class="fa-solid fa-check text-[10px] mr-1"></i>แจ้งของถึงร้านแล้ว</span>`;
                            }

                            tr.innerHTML = `
                                <td class="px-4 py-4 md:px-6 font-mono font-bold text-body-muted whitespace-nowrap">${po.po_number}</td>
                                <td class="px-4 py-4 md:px-6 text-sm text-body-muted whitespace-nowrap">${new Date(po.updatedAt || po.createdAt).toLocaleDateString('th-TH')}</td>
                                <td class="px-4 py-4 md:px-6 text-sm text-body-muted whitespace-nowrap">${po.supplier_name}</td>
                                <td class="px-4 py-4 md:px-6 text-sm text-body-muted max-w-[250px] truncate whitespace-nowrap" title="${itemsDesc}">${itemsDesc}</td>
                                <td class="px-4 py-4 md:px-6 text-center whitespace-nowrap">
                                    ${statusBadge}
                                </td>
                                <td class="px-4 py-4 md:px-6 text-right whitespace-nowrap">
                                    <button class="btn-view-arrival-details px-3 py-1.5 bg-surface-chip text-body-muted hover:bg-surface-tile-2 hover:text-ink border border-hairline hover:border-primary/40 rounded-xl text-xs font-semibold transition-all inline-flex items-center gap-1.5 active:scale-95 whitespace-nowrap shrink-0" data-id="${po._id}">
                                        <i class="fa-solid fa-eye"></i> ดูรายละเอียด
                                    </button>
                                </td>
                            `;
                            tbodyCompleted.appendChild(tr);

                            tr.querySelector('.btn-view-arrival-details').addEventListener('click', () => {
                                showCompletedPODetails(po);
                            });
                        });
                    }
                }
            }
        } catch (e) {
            console.error(e);
            tbody.innerHTML = '<tr><td colspan="6" class="text-center py-6 text-red-400">เกิดข้อผิดพลาดในการโหลดข้อมูล</td></tr>';
            if (tbodyCompleted) tbodyCompleted.innerHTML = '<tr><td colspan="6" class="text-center py-6 text-red-400">เกิดข้อผิดพลาดในการโหลดข้อมูล</td></tr>';
        }
    };

    // Helper to render PO details inside custom confirm modal
    const showCompletedPODetails = (po) => {
        let itemsHtml = `
            <div class="text-left space-y-3 font-sans max-h-[350px] overflow-y-auto pr-1">
                <div class="flex justify-between items-center border-b border-hairline pb-2 mb-2">
                    <span class="text-body-muted text-xs">เลขที่สั่งซื้อ: <strong class="text-ink font-mono text-sm">${po.po_number}</strong></span>
                    <span class="text-body-muted text-xs">ซัพพลายเออร์: <strong class="text-ink">${po.supplier_name}</strong></span>
                </div>
        `;

        po.items.forEach(item => {
            const hasImeis = item.track_imei && Array.isArray(item.imeis_scanned) && item.imeis_scanned.length > 0;
            itemsHtml += `
                <div class="bg-surface-tile-3 border border-hairline rounded-xl p-3 space-y-2">
                    <div class="flex justify-between items-center">
                        <span class="text-sm font-bold text-ink flex items-center gap-1.5 font-sans">
                            <i class="${item.track_imei ? 'fa-solid fa-mobile-screen text-ink' : 'fa-solid fa-plug text-ink'} text-xs"></i>
                            ${item.product_name}
                        </span>
                        <span class="text-xs font-semibold px-2 py-0.5 rounded-full bg-surface-chip text-emerald-400 border border-hairline">
                            ครบ ${item.ordered_qty} ชิ้น
                        </span>
                    </div>
            `;

            if (hasImeis) {
                itemsHtml += `
                    <div class="flex flex-wrap gap-1.5 pt-1">
                `;
                item.imeis_scanned.forEach(imei => {
                    itemsHtml += `
                        <span class="bg-surface-chip border border-hairline text-body-muted px-2 py-0.5 rounded text-[10px] font-mono select-all tracking-tight hover:text-ink transition-colors">${imei}</span>
                    `;
                });
                itemsHtml += `
                    </div>
                `;
            } else if (item.track_imei) {
                itemsHtml += `
                    <div class="text-xs text-rose-400 italic font-sans">ไม่มีหมายเลข IMEI ที่ถูกบันทึก</div>
                `;
            } else {
                itemsHtml += `
                    <div class="text-[11px] text-body-muted italic font-sans">สินค้าอุปกรณ์เสริม/ทั่วไป ไม่ต้องสแกน IMEI</div>
                `;
            }

            itemsHtml += `</div>`;
        });

        itemsHtml += `</div>`;

        // Check if the PO status is NOT fully imported or received
        const isEditable = po.status !== 'นำเข้าสำเร็จ' && po.status !== 'รับของครบแล้ว';

        showConfirm(
            `รายละเอียดการรับสินค้า`,
            itemsHtml,
            () => { },
            'ปิดหน้าต่าง',
            'info'
        );

        const cancelBtn = document.getElementById('confirm-cancel-btn');
        const okBtn = document.getElementById('confirm-ok-btn');

        if (isEditable && cancelBtn) {
            cancelBtn.style.display = 'block';
            cancelBtn.textContent = 'แก้ไขข้อมูลการรับ';
            cancelBtn.className = "flex-1 py-2.5 rounded-xl text-sm font-bold text-body-muted bg-surface-chip border border-hairline hover:bg-surface-tile-2 hover:text-ink transition-all active:scale-[0.98]";

            cancelBtn.onclick = () => {
                // Close confirm modal
                const modal = document.getElementById('custom-confirm-modal');
                if (modal) {
                    modal.classList.add('opacity-0', 'pointer-events-none');
                    setTimeout(() => modal.classList.add('hidden'), 300);
                }

                // Open edit arrival modal
                openArrivalModal(po);
            };
        } else if (cancelBtn) {
            cancelBtn.style.display = 'none';
        }

        if (okBtn) {
            const origClick = okBtn.onclick;
            okBtn.onclick = (e) => {
                if (origClick) origClick(e);
                if (cancelBtn) {
                    cancelBtn.style.display = 'block';
                    cancelBtn.textContent = 'ยกเลิก';
                }
            };
        }
    };
    window.loadArrivalPOs = loadArrivalPOs;

    // ==========================================
    // Connected PO Workflow: ตรวจสอบนำเข้า (Stock Manager / Approver)
    // ==========================================
    const loadApprovePOs = async () => {
        const tbody = document.getElementById('table-body-approve-po');
        const badgeCount = document.getElementById('po-approve-pending-count');
        if (!tbody) return;
        tbody.innerHTML = '<tr><td colspan="7" class="text-center py-6 text-body-muted"><i class="fa-solid fa-spinner fa-spin mr-2 text-ink"></i>กำลังโหลดรายการใบสั่งซื้อ...</td></tr>';

        try {
            const res = await authFetch(`${API_BASE_URL}/purchase-orders`);
            const json = await res.json();
            if (json.success) {
                tbody.innerHTML = '';
                // Filter POs awaiting finalization (status: 'กำลังตรวจรับ')
                const pendingApprovePOs = json.data.filter(po => po.status === 'กำลังตรวจรับ');

                if (badgeCount) {
                    if (pendingApprovePOs.length > 0) {
                        badgeCount.textContent = pendingApprovePOs.length;
                        badgeCount.classList.remove('hidden');
                    } else {
                        badgeCount.classList.add('hidden');
                    }
                }

                if (pendingApprovePOs.length === 0) {
                    tbody.innerHTML = '<tr><td colspan="7" class="text-center py-8 text-body-muted text-sm">ไม่มีใบสั่งซื้อที่สแกนรออนุมัตินำเข้าคลังในขณะนี้</td></tr>';
                    return;
                }

                pendingApprovePOs.forEach(po => {
                    const tr = document.createElement('tr');
                    tr.className = 'border-b border-hairline/50 hover:bg-slate-700/20 transition-colors';
                    const branchName = po.branch_id ? po.branch_id.name : '-';

                    // Count scanned items vs total items ordered
                    let totalOrdered = 0;
                    let totalScanned = 0;
                    let grandTotal = 0;
                    po.items.forEach(item => {
                        totalOrdered += item.ordered_qty;
                        totalScanned += item.received_qty || 0;
                        grandTotal += (item.cost_price || 0) * (item.ordered_qty || 0);
                    });

                    tr.innerHTML = `
                        <td class="px-6 py-4 font-mono font-bold text-ink">${po.po_number}</td>
                        <td class="px-6 py-4 text-sm text-body-muted">${new Date(po.createdAt).toLocaleDateString('th-TH')}</td>
                        <td class="px-6 py-4 text-sm text-body-muted">${po.supplier_name}</td>
                        <td class="px-6 py-4 text-sm text-body-muted">${branchName}</td>
                        <td class="px-6 py-4 text-center text-sm font-mono font-semibold">
                            <span class="text-ink font-bold">${totalScanned}</span> <span class="text-body-muted">/</span> <span class="text-body-muted">${totalOrdered}</span>
                        </td>
                        <td class="px-6 py-4 text-right font-mono text-sm font-bold text-ink">฿${(po.grand_total || grandTotal).toLocaleString()}</td>
                        <td class="px-6 py-4 text-right">
                            <button class="btn-finalize-import px-3 py-1.5 bg-surface-chip text-ink hover:bg-surface-tile-2 rounded-lg text-xs font-bold transition-all inline-flex items-center gap-1" data-id="${po._id}">
                                <i class="fa-solid fa-clipboard-check"></i> อนุมัตินำเข้าสต็อก
                            </button>
                        </td>
                    `;
                    tbody.appendChild(tr);

                    tr.querySelector('.btn-finalize-import').addEventListener('click', async (e) => {
                        const btnFinalize = e.currentTarget;
                        const poId = btnFinalize.dataset.id;
                        showConfirm('ยืนยันนำเข้าสินค้า', 'ยืนยันนำเข้าสินค้าใบสั่งซื้อนี้เข้าสต็อกสาขา?', async () => {
                            try {
                                btnFinalize.disabled = true;
                                btnFinalize.innerHTML = '<i class="fa-solid fa-spinner fa-spin"></i> อนุมัติ...';

                                const finalRes = await authFetch(`${API_BASE_URL}/po/${poId}/finalize-import`, {
                                    method: 'POST'
                                });
                                const finalJson = await finalRes.json();

                                if (finalJson.success) {
                                    showToast('อนุมัตินำเข้าสต็อกสำเร็จ! เพิ่มยอดสินค้าสั่งซื้อเข้าคลังสาขาเรียบร้อยแล้ว', 'success');
                                    loadApprovePOs();
                                    if (typeof fetchProducts === 'function') fetchProducts();
                                    if (typeof loadDashboardData === 'function') loadDashboardData();
                                } else {
                                    showToast(finalJson.message || 'เกิดข้อผิดพลาดในการอนุมัติ', 'error');
                                    btnFinalize.disabled = false;
                                    btnFinalize.innerHTML = '<i class="fa-solid fa-clipboard-check"></i> อนุมัตินำเข้าสต็อก';
                                }
                            } catch (err) {
                                console.error(err);
                                showToast(err.message || 'เกิดข้อผิดพลาดในการทำรายการอนุมัติ', 'error');
                                btnFinalize.disabled = false;
                                btnFinalize.innerHTML = '<i class="fa-solid fa-clipboard-check"></i> อนุมัตินำเข้าสต็อก';
                            }
                        });
                    });
                });
            }
        } catch (e) {
            console.error(e);
            tbody.innerHTML = '<tr><td colspan="7" class="text-center py-6 text-red-400">เกิดข้อผิดพลาดในการโหลดข้อมูล</td></tr>';
        }
    };
    window.loadApprovePOs = loadApprovePOs;

    const loadApproveHistory = async () => {
        const tbodyPo = document.getElementById('table-body-history-po');
        const tbodyNonPo = document.getElementById('table-body-history-nonpo');
        const filterBranch = document.getElementById('approve-import-filter-branch');
        const selectedBranchId = filterBranch ? filterBranch.value : '';

        if (tbodyPo) {
            tbodyPo.innerHTML = '<tr><td colspan="7" class="text-center py-6 text-body-muted"><i class="fa-solid fa-spinner fa-spin mr-2 text-ink"></i>กำลังโหลดประวัติ PO...</td></tr>';
        }
        if (tbodyNonPo) {
            tbodyNonPo.innerHTML = '<tr><td colspan="7" class="text-center py-6 text-body-muted"><i class="fa-solid fa-spinner fa-spin mr-2 text-body-muted"></i>กำลังโหลดประวัติพิเศษ...</td></tr>';
        }

        try {
            const res = await authFetch(`${API_BASE_URL}/purchase-orders`);
            const json = await res.json();
            if (json.success && tbodyPo) {
                tbodyPo.innerHTML = '';
                let approvedPOs = json.data.filter(po => po.status === 'นำเข้าสำเร็จ');
                if (selectedBranchId) {
                    approvedPOs = approvedPOs.filter(po => po.branch_id && (po.branch_id._id === selectedBranchId || po.branch_id === selectedBranchId));
                }

                if (approvedPOs.length === 0) {
                    tbodyPo.innerHTML = '<tr><td colspan="7" class="text-center py-8 text-body-muted text-sm">ไม่มีประวัติการอนุมัติ PO</td></tr>';
                } else {
                    approvedPOs.forEach(po => {
                        const tr = document.createElement('tr');
                        tr.className = 'border-b border-hairline/50 hover:bg-slate-700/20 transition-colors';
                        const branchName = po.branch_id ? po.branch_id.name : '-';
                        const approverName = po.received_by ? po.received_by.name : '-';

                        let totalOrdered = 0;
                        let totalScanned = 0;
                        let grandTotal = 0;
                        po.items.forEach(item => {
                            totalOrdered += item.ordered_qty;
                            totalScanned += item.received_qty || 0;
                            grandTotal += (item.cost_price || 0) * (item.ordered_qty || 0);
                        });

                        const approvalDate = po.updatedAt ? new Date(po.updatedAt).toLocaleString('th-TH') : '-';

                        tr.innerHTML = `
                            <td class="px-6 py-4 font-mono font-bold text-ink">${po.po_number}</td>
                            <td class="px-6 py-4 text-sm text-body-muted">${approvalDate}</td>
                            <td class="px-6 py-4 text-sm text-body-muted">${po.supplier_name}</td>
                            <td class="px-6 py-4 text-sm text-body-muted">${branchName}</td>
                            <td class="px-6 py-4 text-center text-sm font-mono font-semibold">
                                <span class="text-ink font-bold">${totalScanned}</span> <span class="text-body-muted">/</span> <span class="text-body-muted">${totalOrdered}</span>
                            </td>
                            <td class="px-6 py-4 text-right font-mono text-sm font-bold text-ink">฿${(po.grand_total || grandTotal).toLocaleString()}</td>
                            <td class="px-6 py-4 text-sm text-body-muted">${approverName}</td>
                        `;
                        tbodyPo.appendChild(tr);
                    });
                }
            }
        } catch (err) {
            console.error('Error loading PO history:', err);
            if (tbodyPo) tbodyPo.innerHTML = '<tr><td colspan="7" class="text-center py-6 text-red-400">เกิดข้อผิดพลาดในการโหลดประวัติ PO</td></tr>';
        }

        try {
            let url = `${API_BASE_URL}/import-notifications?status=อนุมัติแล้ว`;
            if (selectedBranchId) {
                url += `&branch_id=${selectedBranchId}`;
            }
            const res = await authFetch(url);
            const json = await res.json();
            if (json.success && tbodyNonPo) {
                tbodyNonPo.innerHTML = '';
                const approvedNonPOs = json.data || [];

                if (approvedNonPOs.length === 0) {
                    tbodyNonPo.innerHTML = '<tr><td colspan="7" class="text-center py-8 text-body-muted text-sm">ไม่มีประวัติการอนุมัติสินค้านอกระบบ PO</td></tr>';
                } else {
                    approvedNonPOs.forEach(item => {
                        const tr = document.createElement('tr');
                        tr.className = 'border-b border-hairline/50 hover:bg-slate-700/20 transition-colors';
                        const branchName = item.branch_id ? item.branch_id.name : '-';
                        const reporterName = item.reported_by ? item.reported_by.name : '-';
                        const approverName = item.approved_by ? item.approved_by.name : '-';
                        const approvalDate = item.approved_at ? new Date(item.approved_at).toLocaleString('th-TH') : '-';

                        tr.innerHTML = `
                            <td class="px-6 py-4 text-sm text-body-muted">${approvalDate}</td>
                            <td class="px-6 py-4 text-sm text-body-muted">${branchName}</td>
                            <td class="px-6 py-4 text-sm text-body-muted">${reporterName}</td>
                            <td class="px-6 py-4 text-sm font-medium text-ink">${item.product_name}</td>
                            <td class="px-6 py-4 text-sm text-ink font-mono">${item.imeis ? item.imeis.length : 0}</td>
                            <td class="px-6 py-4 text-sm text-body-muted">${approverName}</td>
                            <td class="px-6 py-4 text-sm text-body-muted">${item.notes || '-'}</td>
                        `;
                        tbodyNonPo.appendChild(tr);
                    });
                }
            }
        } catch (err) {
            console.error('Error loading Non-PO history:', err);
            if (tbodyNonPo) tbodyNonPo.innerHTML = '<tr><td colspan="7" class="text-center py-6 text-red-400">เกิดข้อผิดพลาดในการโหลดประวัติสินค้านอกระบบ PO</td></tr>';
        }

        const tbodyDirect = document.getElementById('table-body-history-direct-imports');
        if (tbodyDirect) {
            tbodyDirect.innerHTML = '<tr><td colspan="8" class="text-center py-6 text-body-muted"><i class="fa-solid fa-spinner fa-spin mr-2 text-emerald-400"></i>กำลังโหลดประวัตินำเข้าโดยตรง...</td></tr>';
        }

        try {
            const res = await authFetch(`${API_BASE_URL}/products/direct-imports-history`);
            const json = await res.json();
            if (json.success && tbodyDirect) {
                tbodyDirect.innerHTML = '';
                let directLogs = json.data || [];

                // Filter by branch if selected
                if (selectedBranchId) {
                    directLogs = directLogs.filter(log => log.details && log.details.branch_id === selectedBranchId);
                }

                if (directLogs.length === 0) {
                    tbodyDirect.innerHTML = '<tr><td colspan="8" class="text-center py-8 text-body-muted text-sm">ไม่มีประวัติการนำเข้าคลังสินค้าโดยตรง</td></tr>';
                } else {
                    directLogs.forEach(log => {
                        const tr = document.createElement('tr');
                        tr.className = 'border-b border-hairline/50 hover:bg-slate-700/20 transition-colors';

                        const importDate = log.createdAt ? new Date(log.createdAt).toLocaleString('th-TH') : '-';
                        const details = log.details || {};
                        const typeText = details.import_source === 'EXCEL' ?
                            '<span class="px-2 py-1 rounded bg-emerald-500/10 text-emerald-400 text-xs font-semibold border border-emerald-500/20">Excel</span>' :
                            '<span class="px-2 py-1 rounded bg-blue-500/10 text-blue-400 text-xs font-semibold border border-blue-500/20">คลังปกติ</span>';

                        const branchName = details.branch_name || '-';
                        const productName = details.product_name || '-';
                        const productCode = details.product_code || '-';
                        const qty = details.quantity || 0;
                        const importer = log.user_name || '-';

                        let imeiStr = '-';
                        if (Array.isArray(details.imeis) && details.imeis.length > 0) {
                            imeiStr = `<div class="max-w-xs truncate font-mono text-xs text-body-muted" title="${details.imeis.join(', ')}">${details.imeis.join(', ')}</div>`;
                        }

                        tr.innerHTML = `
                            <td class="px-6 py-4 text-sm text-body-muted">${importDate}</td>
                            <td class="px-6 py-4 text-sm">${typeText}</td>
                            <td class="px-6 py-4 text-sm text-body-muted">${branchName}</td>
                            <td class="px-6 py-4 text-sm font-medium text-ink">${productName}</td>
                            <td class="px-6 py-4 text-sm text-body-muted font-mono">${productCode}</td>
                            <td class="px-6 py-4 text-sm text-center text-ink font-mono font-bold">${qty}</td>
                            <td class="px-6 py-4 text-sm text-body-muted">${importer}</td>
                            <td class="px-6 py-4 text-sm">${imeiStr}</td>
                        `;
                        tbodyDirect.appendChild(tr);
                    });
                }
            }
        } catch (err) {
            console.error('Error loading Direct Imports history:', err);
            if (tbodyDirect) tbodyDirect.innerHTML = '<tr><td colspan="8" class="text-center py-6 text-red-400">เกิดข้อผิดพลาดในการโหลดประวัติการนำเข้าโดยตรง</td></tr>';
        }
    };
    window.loadApproveHistory = loadApproveHistory;

    // Tab toggle logic inside ตรวจสอบนำเข้าสินค้า (Approve Import)
    const tabBtnApprovePO = document.getElementById('tab-btn-approve-po');
    const tabBtnApproveNonPO = document.getElementById('tab-btn-approve-nonpo');
    const tabBtnApproveHistory = document.getElementById('tab-btn-approve-history');
    const tabContentApprovePO = document.getElementById('tab-content-approve-po');
    const tabContentApproveNonPO = document.getElementById('tab-content-approve-nonpo');
    const tabContentApproveHistory = document.getElementById('tab-content-approve-history');

    if (tabBtnApprovePO && tabBtnApproveNonPO && tabBtnApproveHistory && tabContentApprovePO && tabContentApproveNonPO && tabContentApproveHistory) {
        tabBtnApprovePO.addEventListener('click', () => {
            tabBtnApprovePO.className = 'flex-1 py-2.5 px-4 rounded-xl text-sm font-bold transition-all bg-surface-chip text-ink border border-hairline';
            tabBtnApproveNonPO.className = 'flex-1 py-2.5 px-4 rounded-xl text-sm font-bold transition-all text-body-muted hover:text-ink hover:bg-slate-700';
            tabBtnApproveHistory.className = 'flex-1 py-2.5 px-4 rounded-xl text-sm font-bold transition-all text-body-muted hover:text-ink hover:bg-slate-700';
            tabContentApprovePO.classList.remove('hidden');
            tabContentApproveNonPO.classList.add('hidden');
            tabContentApproveHistory.classList.add('hidden');
            loadApprovePOs();
        });

        tabBtnApproveNonPO.addEventListener('click', () => {
            tabBtnApproveNonPO.className = 'flex-1 py-2.5 px-4 rounded-xl text-sm font-bold transition-all bg-surface-chip text-ink border border-hairline';
            tabBtnApprovePO.className = 'flex-1 py-2.5 px-4 rounded-xl text-sm font-bold transition-all text-body-muted hover:text-ink hover:bg-slate-700';
            tabBtnApproveHistory.className = 'flex-1 py-2.5 px-4 rounded-xl text-sm font-bold transition-all text-body-muted hover:text-ink hover:bg-slate-700';
            tabContentApproveNonPO.classList.remove('hidden');
            tabContentApprovePO.classList.add('hidden');
            tabContentApproveHistory.classList.add('hidden');
            if (typeof window.loadImportNotifications === 'function') window.loadImportNotifications();
        });

        tabBtnApproveHistory.addEventListener('click', () => {
            tabBtnApproveHistory.className = 'flex-1 py-2.5 px-4 rounded-xl text-sm font-bold transition-all bg-surface-chip text-ink border border-hairline';
            tabBtnApprovePO.className = 'flex-1 py-2.5 px-4 rounded-xl text-sm font-bold transition-all text-body-muted hover:text-ink hover:bg-slate-700';
            tabBtnApproveNonPO.className = 'flex-1 py-2.5 px-4 rounded-xl text-sm font-bold transition-all text-body-muted hover:text-ink hover:bg-slate-700';
            tabContentApproveHistory.classList.remove('hidden');
            tabContentApprovePO.classList.add('hidden');
            tabContentApproveNonPO.classList.add('hidden');
            loadApproveHistory();
        });
    }

    // Refresh triggers & Navigation linkages
    const btnRefreshArrivalPO = document.getElementById('btn-refresh-arrival-po');
    if (btnRefreshArrivalPO) {
        btnRefreshArrivalPO.addEventListener('click', loadArrivalPOs);
    }

    const btnReloadImportList = document.getElementById('btn-reload-import-list');
    if (btnReloadImportList) {
        btnReloadImportList.addEventListener('click', () => {
            loadApprovePOs();
            if (typeof window.loadImportNotifications === 'function') window.loadImportNotifications();
            loadApproveHistory();
        });
    }

    // Connect to sidebar clicks
    const navReportArrivalBtn = document.getElementById('nav-report-arrival');
    if (navReportArrivalBtn) {
        navReportArrivalBtn.addEventListener('click', () => {
            loadArrivalPOs();
        });
    }

    const navApproveImportBtn = document.getElementById('nav-approve-import');
    if (navApproveImportBtn) {
        navApproveImportBtn.addEventListener('click', () => {
            populateApproveImportBranchFilter();
            loadApprovePOs();
            if (typeof window.loadImportNotifications === 'function') window.loadImportNotifications();
            loadApproveHistory();
        });
    }

    // ============================================================================
})();
