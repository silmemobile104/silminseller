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
    let isBranchReceiveBound = false; // loadPageView แทรก HTML ครั้งเดียว จึงผูก listener ครั้งเดียวพอ

    const RECEIVE_COLS = 6;

    // แท็บสถานะ (ข้อ 11.5 - ป้ายนับต้องอ่านออกทั้งบนพื้นเหลืองและพื้นเข้ม จึงสลับสีตามสถานะแท็บ)
    const RC_TAB_BASE = 'receive-tab px-4 py-2.5 rounded-xl text-sm font-bold border transition-colors flex items-center gap-2 cursor-pointer';
    const RC_TAB_ON = 'bg-[#FFE169] text-[#333333] border-[#FFE169]';
    const RC_TAB_OFF = 'bg-[#27272A] text-slate-300 border-[#3F3F46] hover:border-[#FFE169] hover:text-white';
    const RC_BADGE_ON = 'px-2 py-0.5 rounded-full text-[10px] font-bold bg-[#333333]/20';
    const RC_BADGE_OFF = {
        all: 'px-2 py-0.5 rounded-full text-[10px] font-bold bg-[#4D4D4D]/60 text-white',
        'รอจัดส่ง': 'px-2 py-0.5 rounded-full text-[10px] font-bold bg-orange-500/[0.12] text-orange-400',
        'ของถึงสาขาแล้ว': 'px-2 py-0.5 rounded-full text-[10px] font-bold bg-orange-500/[0.12] text-orange-400',
        'กำลังตรวจรับ': 'px-2 py-0.5 rounded-full text-[10px] font-bold bg-orange-500/[0.12] text-orange-400',
        'นำเข้าสำเร็จ': 'px-2 py-0.5 rounded-full text-[10px] font-bold bg-[#42A231]/[0.12] text-[#20D500]',
        'ยกเลิก': 'px-2 py-0.5 rounded-full text-[10px] font-bold bg-[#FE0000]/[0.12] text-[#FE0000]'
    };
    const RC_PANEL_TITLE = {
        all: 'ใบสั่งซื้อทั้งหมด',
        'รอจัดส่ง': 'ใบสั่งซื้อที่รอจัดส่ง',
        'ของถึงสาขาแล้ว': 'ใบสั่งซื้อที่ของถึงสาขาแล้ว',
        'กำลังตรวจรับ': 'ใบสั่งซื้อที่กำลังตรวจรับ',
        'นำเข้าสำเร็จ': 'ใบสั่งซื้อที่นำเข้าสต็อกสำเร็จ',
        'ยกเลิก': 'ใบสั่งซื้อที่ถูกยกเลิก'
    };

    const setReceiveTab = (status) => {
        currentReceiveTab = status;
        document.querySelectorAll('#receive-status-tabs .receive-tab').forEach(btn => {
            const on = btn.dataset.status === status;
            btn.className = `${RC_TAB_BASE} ${on ? RC_TAB_ON : RC_TAB_OFF}`;
            btn.setAttribute('aria-pressed', String(on));
            const badge = btn.querySelector('span');
            if (badge) badge.className = on ? RC_BADGE_ON : (RC_BADGE_OFF[btn.dataset.status] || RC_BADGE_OFF.all);
        });
        const title = document.getElementById('receive-panel-title');
        if (title) {
            title.innerHTML = `<i class="fa-solid fa-boxes-packing text-[#FFE169]"></i> ${RC_PANEL_TITLE[status] || RC_PANEL_TITLE.all}`;
        }
        renderFilteredPOs();
    };

    window.initBranchReceive = async () => {
        const searchInput = document.getElementById('search-receive-po');
        const filterBranch = document.getElementById('receive-filter-branch');

        // เติมรายชื่อสาขาใหม่ทุกครั้ง (master data อาจเพิ่งถูกแคชหลังเปิดหน้าครั้งแรก)
        if (filterBranch && window.masterDataCache && window.masterDataCache.branches) {
            const keep = filterBranch.value;
            filterBranch.innerHTML = '<option value="">ทุกสาขา</option>' +
                window.masterDataCache.branches.map(b => `<option value="${b._id}">${b.name}</option>`).join('');
            filterBranch.value = keep;
        }

        if (!isBranchReceiveBound) {
            isBranchReceiveBound = true;

            if (searchInput) {
                let t = null;
                searchInput.addEventListener('input', () => {
                    clearTimeout(t);
                    t = setTimeout(() => {
                        receiveSearchQuery = searchInput.value.trim();
                        renderFilteredPOs();
                    }, 200);
                });
            }
            if (filterBranch) {
                filterBranch.addEventListener('change', () => {
                    receiveSearchBranch = filterBranch.value;
                    renderFilteredPOs();
                });
            }
            document.querySelectorAll('#receive-status-tabs .receive-tab').forEach(btn =>
                btn.addEventListener('click', () => setReceiveTab(btn.dataset.status)));
        }

        loadPOs();
    };

    if (document.getElementById('btn-refresh-po-receive')) {
        document.getElementById('btn-refresh-po-receive').addEventListener('click', () => loadPOs());
    }

    // ==========================================
    // ระบบบัญชีและการเงิน — ดีไซน์แนวเดียวกับหน้า #dashboard
    // การ์ด KPI / การ์ดพาเนล / ตาราง ใช้สูตรเดียวกับ DESIGN.md ข้อ 11.3, 11.6, 11.7
    // ==========================================
    const AP_COLS = 8, PL_COLS = 5, AR_COLS = 5;

    const accEsc = (s) => String(s == null ? '' : s)
        .replace(/&/g, '&amp;').replace(/</g, '&lt;').replace(/>/g, '&gt;')
        .replace(/"/g, '&quot;').replace(/'/g, '&#39;');

    const accBaht = (n) => '฿' + Number(n || 0).toLocaleString('th-TH',
        { minimumFractionDigits: 2, maximumFractionDigits: 2 });

    const accDate = (d) => {
        if (!d) return '-';
        const dt = new Date(d);
        if (isNaN(dt)) return '-';
        return dt.toLocaleDateString('th-TH', { day: 'numeric', month: 'short', year: 'numeric' });
    };

    const accStateRow = (cols, msg, cls = 'text-white/50 italic') =>
        `<tr><td colspan="${cols}" class="px-6 py-8 text-center ${cls}">${accEsc(msg)}</td></tr>`;

    const accSkeleton = (tbodyId, cols, rows = 4) => {
        const tbody = document.getElementById(tbodyId);
        if (!tbody) return;
        const bar = '<div class="h-3.5 w-full rounded-full bg-[#5c5c5c] animate-pulse"></div>';
        tbody.innerHTML = Array.from({ length: rows }).map(() =>
            `<tr>${Array.from({ length: cols }).map(() =>
                `<td class="px-6 py-4">${bar}</td>`).join('')}</tr>`).join('');
    };

    const accSetText = (id, text) => {
        const el = document.getElementById(id);
        if (el) el.textContent = text;
    };

    // ---------- แท็บ ----------
    const ACC_TAB_BASE = 'px-4 py-2.5 rounded-xl text-sm font-bold border transition-colors flex items-center gap-2 cursor-pointer';
    const ACC_TAB_ON = 'bg-[#FFE169] text-[#333333] border-[#FFE169]';
    const ACC_TAB_OFF = 'bg-[#27272A] text-slate-300 border-[#3F3F46] hover:border-[#FFE169] hover:text-white';
    const ACC_BADGE_ON = 'px-2 py-0.5 rounded-full text-[10px] font-bold bg-[#333333]/20';
    const ACC_BADGE_OFF = {
        'badge-acc-ap': 'px-2 py-0.5 rounded-full text-[10px] font-bold bg-orange-500/[0.12] text-orange-400',
        'badge-acc-pl': 'px-2 py-0.5 rounded-full text-[10px] font-bold bg-[#4D4D4D]/60 text-white',
        'badge-acc-ar': 'px-2 py-0.5 rounded-full text-[10px] font-bold bg-orange-500/[0.12] text-orange-400'
    };

    let isAccountingBound = false;
    // listener ของ select ซัพพลายเออร์ผูกครั้งเดียว (dataset.listenerWired) ถ้าปิดทับ apPOs
    // ของรอบโหลดแรกไว้ พอโหลดข้อมูลใหม่หลังบันทึกจ่ายเงิน มันจะเรนเดอร์ด้วยข้อมูลเก่า
    // จึงต้องให้ listener อ่านผ่านตัวแปรสองตัวนี้ที่อัปเดตทุกรอบโหลดแทน
    let apPOsCache = [];
    let apRender = null;

    const initAccounting = async () => {
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

        const tabs = [
            { tab: 'tab-accounting-ap', sec: 'section-accounting-ap', badge: 'badge-acc-ap' },
            { tab: 'tab-accounting-pl', sec: 'section-accounting-pl', badge: 'badge-acc-pl' },
            { tab: 'tab-accounting-ar', sec: 'section-accounting-ar', badge: 'badge-acc-ar' }
        ];

        const activate = (activeId) => {
            tabs.forEach(t => {
                const btn = document.getElementById(t.tab);
                const sec = document.getElementById(t.sec);
                const badge = document.getElementById(t.badge);
                const on = t.tab === activeId;
                if (btn) {
                    btn.className = `${ACC_TAB_BASE} ${on ? ACC_TAB_ON : ACC_TAB_OFF}`;
                    btn.setAttribute('aria-pressed', String(on));
                }
                if (sec) sec.classList.toggle('hidden', !on);
                if (badge) badge.className = on ? ACC_BADGE_ON : ACC_BADGE_OFF[t.badge];
            });
        };

        if (!isAccountingBound) {
            isAccountingBound = true;
            tabs.forEach(t => {
                const btn = document.getElementById(t.tab);
                if (btn) btn.addEventListener('click', () => activate(t.tab));
            });
        }

        await loadAccountingData();
    };
    window.initAccounting = initAccounting;

    // ---------- กราฟรายรับ-รายจ่าย (ลอกวิธีวาดจาก renderSalesChart ในหน้า #dashboard) ----------
    const ACC_IN = '#20D500';   // รายรับ
    const ACC_OUT = '#FE0000';  // รายจ่าย

    const accCompact = (n) => {
        const v = Math.abs(n);
        if (v >= 1e6) return `${(n / 1e6).toFixed(v % 1e6 === 0 ? 0 : 1)}M`;
        if (v >= 1e3) return `${(n / 1e3).toFixed(v % 1e3 === 0 ? 0 : 1)}K`;
        return String(Math.round(n));
    };

    const accNiceMax = (v) => {
        if (v <= 0) return 1000;
        const mag = Math.pow(10, Math.floor(Math.log10(v)));
        const n = v / mag;
        const step = n <= 1 ? 1 : n <= 2 ? 2 : n <= 2.5 ? 2.5 : n <= 5 ? 5 : 10;
        return step * mag;
    };

    // เส้นโค้งแบบ monotone cubic (Fritsch–Carlson) — ห้ามใช้ Catmull-Rom ธรรมดา
    // เพราะช่วงที่ยอดพุ่งขึ้นจุดเดียวจะทำให้เส้นแกว่งต่ำกว่าศูนย์ กลายเป็นภาพว่า "ยอดติดลบ"
    const accSmoothPath = (pts) => {
        const n = pts.length;
        if (!n) return '';
        if (n < 3) return pts.map((p, i) => `${i ? 'L' : 'M'}${p.x},${p.y}`).join(' ');

        const dx = [], dy = [], delta = [];
        for (let i = 0; i < n - 1; i++) {
            dx[i] = pts[i + 1].x - pts[i].x;
            dy[i] = pts[i + 1].y - pts[i].y;
            delta[i] = dy[i] / dx[i];
        }
        const m = [delta[0]];
        for (let i = 1; i < n - 1; i++) {
            m[i] = (delta[i - 1] * delta[i] <= 0) ? 0 : (delta[i - 1] + delta[i]) / 2;
        }
        m[n - 1] = delta[n - 2];
        for (let i = 0; i < n - 1; i++) {
            if (delta[i] === 0) { m[i] = 0; m[i + 1] = 0; continue; }
            const a = m[i] / delta[i], b = m[i + 1] / delta[i];
            const s = a * a + b * b;
            if (s > 9) {
                const tau = 3 / Math.sqrt(s);
                m[i] = tau * a * delta[i];
                m[i + 1] = tau * b * delta[i];
            }
        }
        let out = `M${pts[0].x},${pts[0].y}`;
        for (let i = 0; i < n - 1; i++) {
            const c1x = pts[i].x + dx[i] / 3, c1y = pts[i].y + (m[i] * dx[i]) / 3;
            const c2x = pts[i + 1].x - dx[i] / 3, c2y = pts[i + 1].y - (m[i + 1] * dx[i]) / 3;
            out += ` C${c1x},${c1y} ${c2x},${c2y} ${pts[i + 1].x},${pts[i + 1].y}`;
        }
        return out;
    };

    const ACC_MONTHS = ['ม.ค', 'ก.พ', 'มี.ค', 'เม.ย', 'พ.ค', 'มิ.ย', 'ก.ค', 'ส.ค', 'ก.ย', 'ต.ค', 'พ.ย', 'ธ.ค'];
    const accYmd = (d) => `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, '0')}-${String(d.getDate()).padStart(2, '0')}`;
    const accYm = (d) => `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, '0')}`;

    // แบ่งช่วงเวลาเป็นถัง: ช่วงสั้นแบ่งรายวัน ช่วงยาวแบ่งรายเดือน
    const accBuckets = (start, end) => {
        const s = new Date(`${start}T00:00:00`);
        const e = new Date(`${end}T00:00:00`);
        if (isNaN(s) || isNaN(e) || e < s) return null;
        const days = Math.round((e - s) / 86400000) + 1;

        if (days <= 62) {
            const arr = [];
            for (let i = 0; i < days; i++) {
                const d = new Date(s);
                d.setDate(s.getDate() + i);
                arr.push({
                    key: accYmd(d),
                    label: `${d.getDate()} ${ACC_MONTHS[d.getMonth()]}`,
                    full: d.toLocaleDateString('th-TH', { day: 'numeric', month: 'short', year: 'numeric' })
                });
            }
            return { mode: 'day', arr };
        }

        const arr = [];
        const cur = new Date(s.getFullYear(), s.getMonth(), 1);
        while (cur <= e) {
            arr.push({
                key: accYm(cur),
                label: ACC_MONTHS[cur.getMonth()],
                full: `${ACC_MONTHS[cur.getMonth()]} ${cur.getFullYear() + 543}`
            });
            cur.setMonth(cur.getMonth() + 1);
        }
        return { mode: 'month', arr };
    };

    // สร้างชุดข้อมูลกราฟแบบ "เกณฑ์คงค้าง" ให้ยอดรวมตรงกับการ์ด KPI ด้านบนเป๊ะ
    //   รายรับ  = รายการเดินบัญชีฝั่งรายรับ (ยอดรวมเท่ากับ totalRevenue อยู่แล้ว)
    //   รายจ่าย = ค่าใช้จ่ายอื่น (เงินสด) + ต้นทุน PO ที่ "นำเข้าสำเร็จ" ในช่วงนั้น
    // ⚠️ ห้ามเอารายการ "ซื้อสินค้า (PO)" ในเดินบัญชีมาบวก เพราะนั่นคือตอน "จ่ายเงินให้ซัพพลายเออร์"
    //    ส่วน KPI นับต้นทุนตอน "รับของเข้าสต็อก" ถ้าเอามารวมด้วยจะนับซ้ำและยอดไม่ตรงการ์ดด้านบน
    const accSeries = (d, pos, start, end) => {
        const b = accBuckets(start, end);
        if (!b) return null;
        const idx = new Map(b.arr.map((x, i) => [x.key, i]));
        const keyOf = (dateVal) => {
            const dt = new Date(dateVal);
            if (isNaN(dt)) return null;
            return b.mode === 'day' ? accYmd(dt) : accYm(dt);
        };

        const income = new Array(b.arr.length).fill(0);
        const expense = new Array(b.arr.length).fill(0);

        (d.ledger || []).forEach(item => {
            const i = idx.get(keyOf(item.created_at));
            if (i === undefined) return;
            if (item.type === 'รายรับ') income[i] += item.amount || 0;
            else if (item.category !== 'ซื้อสินค้า (PO)') expense[i] += item.amount || 0;
        });

        const s = new Date(`${start}T00:00:00`);
        const e = new Date(`${end}T23:59:59`);
        (pos || []).forEach(po => {
            if (po.status !== 'นำเข้าสำเร็จ') return;
            const at = new Date(po.updatedAt);
            if (isNaN(at) || at < s || at > e) return;
            const i = idx.get(keyOf(po.updatedAt));
            if (i === undefined) return;
            expense[i] += (po.items || []).reduce(
                (sum, it) => sum + (it.cost_price || 0) * (it.received_qty || 0), 0);
        });

        return { buckets: b, income, expense };
    };

    let _accChartState = null;   // เก็บไว้วาดใหม่ตอนเปลี่ยนขนาดจอ
    let _accResizeBound = false;

    const renderAccBreakdown = (d, pos, start, end) => {
        const host = document.getElementById('acc-breakdown-body');
        if (!host) return;
        _accChartState = { d, pos, start, end };

        const series = accSeries(d, pos, start, end);
        const totalIn = d.totalRevenue || 0, totalOut = d.totalExpense || 0;

        if (!series || (totalIn <= 0 && totalOut <= 0)) {
            host.innerHTML = '<p class="py-16 text-center text-white/50 italic">ยังไม่มีรายรับหรือรายจ่ายในช่วงเวลานี้</p>';
            return;
        }

        const { buckets, income, expense } = series;
        const n = buckets.arr.length;
        const maxVal = Math.max(...income, ...expense, 0);

        const W = Math.max(host.clientWidth || 560, 320);
        const H = 280;
        const PAD = { top: 12, right: 12, bottom: 28, left: 56 };
        const plotW = W - PAD.left - PAD.right;
        const plotH = H - PAD.top - PAD.bottom;
        const top = accNiceMax(maxVal);
        const GRID = 5;
        const x = (i) => n === 1 ? PAD.left + plotW / 2 : PAD.left + (plotW * i) / (n - 1);
        const y = (v) => PAD.top + plotH - (plotH * v) / top;

        const inPts = income.map((v, i) => ({ x: x(i), y: y(v) }));
        const outPts = expense.map((v, i) => ({ x: x(i), y: y(v) }));
        const areaOf = (pts) =>
            `${accSmoothPath(pts)} L${pts[pts.length - 1].x},${PAD.top + plotH} L${pts[0].x},${PAD.top + plotH} Z`;

        let grid = '', yLabels = '';
        for (let i = 0; i <= GRID; i++) {
            const val = (top * i) / GRID;
            const gy = y(val);
            grid += `<line x1="${PAD.left}" y1="${gy}" x2="${W - PAD.right}" y2="${gy}"
                        stroke="#FFFFFF" stroke-opacity="0.08" stroke-width="1" />`;
            yLabels += `<text x="${PAD.left - 10}" y="${gy + 4}" text-anchor="end"
                        fill="#FFFFFF" fill-opacity="0.5" font-size="11">${accCompact(val)}</text>`;
        }

        // ป้ายแกน X ไม่เกิน 8 ตัว ไม่งั้นตัวหนังสือทับกันตอนเลือกช่วงยาว
        const stepLbl = Math.max(1, Math.ceil(n / 8));
        const xLabels = buckets.arr.map((bk, i) =>
            (i % stepLbl === 0 || i === n - 1)
                ? `<text x="${x(i)}" y="${H - 8}" text-anchor="middle"
                       fill="#FFFFFF" fill-opacity="0.5" font-size="11">${accEsc(bk.label)}</text>`
                : '').join('');

        const dots = (pts, vals, color) => pts.map((p, i) =>
            vals[i] > 0
                ? `<circle cx="${p.x}" cy="${p.y}" r="3.5" fill="${color}" stroke="#1F1F1F" stroke-width="1.5" />`
                : '').join('');

        const bandW = n > 1 ? plotW / (n - 1) : plotW;
        const bands = buckets.arr.map((bk, i) =>
            `<rect class="acc-band" data-i="${i}" x="${x(i) - bandW / 2}" y="${PAD.top}"
                   width="${bandW}" height="${plotH}" fill="transparent" style="cursor:crosshair" />`).join('');

        const net = d.netProfit || 0;
        const netColor = net >= 0 ? ACC_IN : ACC_OUT;

        host.innerHTML = `
            <div class="relative w-full">
                <svg width="${W}" height="${H}" viewBox="0 0 ${W} ${H}" role="img"
                     aria-label="กราฟรายรับและรายจ่ายตามช่วงเวลาที่เลือก">
                    <defs>
                        <linearGradient id="accGradIn" x1="0" y1="0" x2="0" y2="1">
                            <stop offset="0%" stop-color="${ACC_IN}" stop-opacity="0.35" />
                            <stop offset="100%" stop-color="${ACC_IN}" stop-opacity="0" />
                        </linearGradient>
                        <linearGradient id="accGradOut" x1="0" y1="0" x2="0" y2="1">
                            <stop offset="0%" stop-color="${ACC_OUT}" stop-opacity="0.35" />
                            <stop offset="100%" stop-color="${ACC_OUT}" stop-opacity="0" />
                        </linearGradient>
                    </defs>
                    ${grid}${yLabels}${xLabels}
                    <path d="${areaOf(outPts)}" fill="url(#accGradOut)" />
                    <path d="${areaOf(inPts)}" fill="url(#accGradIn)" />
                    <path d="${accSmoothPath(outPts)}" fill="none" stroke="${ACC_OUT}" stroke-width="2"
                          stroke-linecap="round" stroke-linejoin="round" />
                    <path d="${accSmoothPath(inPts)}" fill="none" stroke="${ACC_IN}" stroke-width="2"
                          stroke-linecap="round" stroke-linejoin="round" />
                    ${dots(outPts, expense, ACC_OUT)}${dots(inPts, income, ACC_IN)}
                    <line id="acc-hoverline" x1="0" y1="${PAD.top}" x2="0" y2="${PAD.top + plotH}"
                          stroke="#FFFFFF" stroke-opacity="0.25" stroke-width="1" style="display:none" />
                    ${bands}
                </svg>
                <div id="acc-tooltip"
                     class="pointer-events-none absolute hidden z-10 rounded-xl bg-[#18181B] border border-[#4D4D4D] shadow-lg px-3 py-2.5 text-xs whitespace-nowrap"></div>
            </div>
            <div class="grid grid-cols-1 sm:grid-cols-3 gap-3 mt-4">
                <div class="bg-[#27272A] border border-[#3F3F46] rounded-xl p-3">
                    <p class="text-xs" style="color:${ACC_IN}">รายรับรวม</p>
                    <p class="text-lg font-semibold font-mono" style="color:${ACC_IN}">${accBaht(totalIn)}</p>
                    <p class="text-[11px] text-white/70 mt-1">ขายสินค้า ${accBaht(d.salesRevenue)} · อื่นๆ ${accBaht(d.otherRevenue)}</p>
                </div>
                <div class="bg-[#27272A] border border-[#3F3F46] rounded-xl p-3">
                    <p class="text-xs" style="color:${ACC_OUT}">รายจ่ายรวม</p>
                    <p class="text-lg font-semibold font-mono" style="color:${ACC_OUT}">${accBaht(totalOut)}</p>
                    <p class="text-[11px] text-white/70 mt-1">ค่าสินค้า (PO) ${accBaht(d.poCost)} · อื่นๆ ${accBaht(d.otherExpenses)}</p>
                </div>
                <div class="bg-[#27272A] border border-[#3F3F46] rounded-xl p-3">
                    <p class="text-xs text-white/70">กำไรสุทธิ</p>
                    <p class="text-lg font-semibold font-mono" style="color:${netColor}">${accBaht(net)}</p>
                    <p class="text-[11px] text-white/70 mt-1">${totalIn ? 'อัตรากำไร ' + ((net / totalIn) * 100).toFixed(1) + '%' : 'ยังไม่มีรายรับให้คิดอัตรากำไร'}</p>
                </div>
            </div>`;

        // ---- tooltip ----
        const svg = host.querySelector('svg');
        const tip = host.querySelector('#acc-tooltip');
        const hoverLine = host.querySelector('#acc-hoverline');

        host.querySelectorAll('.acc-band').forEach(band => {
            band.addEventListener('mouseenter', () => {
                const i = Number(band.dataset.i);
                const diff = income[i] - expense[i];
                tip.innerHTML = `
                    <p class="text-white font-medium mb-1.5">${accEsc(buckets.arr[i].full)}</p>
                    <p class="flex items-center gap-2 text-white/80">
                        <span class="w-2 h-2 rounded-full shrink-0" style="background:${ACC_IN}"></span>
                        รายรับ <span class="ml-auto font-mono text-white">${accBaht(income[i])}</span></p>
                    <p class="flex items-center gap-2 text-white/80 mt-1">
                        <span class="w-2 h-2 rounded-full shrink-0" style="background:${ACC_OUT}"></span>
                        รายจ่าย <span class="ml-auto font-mono text-white">${accBaht(expense[i])}</span></p>
                    <p class="mt-1.5 pt-1.5 border-t border-[#333333] text-white/70">
                        คงเหลือ <span class="font-mono ml-1" style="color:${diff >= 0 ? ACC_IN : ACC_OUT}">${accBaht(diff)}</span></p>`;
                tip.classList.remove('hidden');

                const px = x(i);
                hoverLine.setAttribute('x1', px);
                hoverLine.setAttribute('x2', px);
                hoverLine.style.display = '';

                const tw = tip.offsetWidth || 190;
                tip.style.left = `${Math.max(0, Math.min(px - tw / 2, W - tw))}px`;
                tip.style.top = `${PAD.top + 8}px`;
            });
        });
        svg.addEventListener('mouseleave', () => {
            tip.classList.add('hidden');
            hoverLine.style.display = 'none';
        });

        // วาดใหม่เมื่อความกว้างเปลี่ยน (SVG กำหนดความกว้างเป็นพิกเซลตายตัว)
        if (!_accResizeBound) {
            _accResizeBound = true;
            let t = null;
            window.addEventListener('resize', () => {
                clearTimeout(t);
                t = setTimeout(() => {
                    if (_accChartState && document.getElementById('acc-breakdown-body')) {
                        const st = _accChartState;
                        renderAccBreakdown(st.d, st.pos, st.start, st.end);
                    }
                }, 200);
            });
        }
    };

    // ---------- แผงภาษีมูลค่าเพิ่ม ----------
    const renderAccVat = (d) => {
        const host = document.getElementById('acc-vat-body');
        if (!host) return;
        const row = (label, value, color) => `
            <div class="flex items-center justify-between py-2.5 border-b border-[#3F3F46] last:border-0">
                <span class="text-xs text-white/70">${accEsc(label)}</span>
                <span class="text-sm font-mono font-semibold" style="color:${color}">${accBaht(value)}</span>
            </div>`;
        host.innerHTML = `
            <div class="bg-[#27272A] border border-[#3F3F46] rounded-xl px-4 py-2">
                ${row('ภาษีขาย (Output VAT)', d.outputVat, '#20D500')}
                ${row('ภาษีซื้อ (Input VAT)', d.inputVat, '#FE0000')}
                ${row('ภาษีค้างจ่ายสุทธิ', d.taxPayable, '#FFE169')}
            </div>
            <p class="text-[11px] text-white/50 mt-3">
                ภาษีค้างจ่ายเป็น 0 เมื่อภาษีซื้อมากกว่าภาษีขาย (ยกไปเครดิตงวดถัดไป)</p>`;
    };

    const loadAccountingData = async () => {
        const startInput = document.getElementById('accounting-start-date');
        const endInput = document.getElementById('accounting-end-date');
        const start = startInput ? startInput.value : '';
        const end = endInput ? endInput.value : '';

        // แถวโครงร่างก่อน await ทุกตาราง (ข้อ 11.7)
        accSkeleton('table-body-accounting-ap', AP_COLS);
        accSkeleton('table-body-accounting-pl', PL_COLS);
        accSkeleton('table-body-accounting-ar', AR_COLS);

        const period = start && end ? `(${accDate(start)} - ${accDate(end)})` : '';
        accSetText('acc-breakdown-period', period);

        // กราฟต้องใช้ทั้งงบกำไร-ขาดทุนและรายการ PO จึงวาดหลังโหลดครบทั้งสองชุด
        let plData = null;
        let poListForChart = null;

        try {
            // ---------------- งบกำไร-ขาดทุน + Ledger ----------------
            const res = await authFetch(`${API_BASE_URL}/accounting/profit-loss?startDate=${start}&endDate=${end}`);
            const json = await res.json();

            if (json.success) {
                const data = json.data;

                accSetText('kpi-revenue', accBaht(data.totalRevenue));
                accSetText('kpi-revenue-sub', `ขายสินค้า ${accBaht(data.salesRevenue)} · อื่นๆ ${accBaht(data.otherRevenue)}`);
                accSetText('kpi-expense', accBaht(data.totalExpense));
                accSetText('kpi-expense-sub', `ค่าสินค้า ${accBaht(data.poCost)} · อื่นๆ ${accBaht(data.otherExpenses)}`);

                const profitEl = document.getElementById('kpi-profit');
                if (profitEl) {
                    profitEl.textContent = accBaht(data.netProfit);
                    profitEl.className = 'text-2xl font-semibold font-mono mt-0.5 truncate ' +
                        (data.netProfit >= 0 ? 'text-[#20D500]' : 'text-[#FE0000]');
                }
                accSetText('kpi-profit-sub', data.netProfit >= 0 ? 'กำไรจากการดำเนินงาน' : 'ขาดทุนจากการดำเนินงาน');

                accSetText('kpi-vat', accBaht(data.taxPayable));
                accSetText('kpi-vat-sub', `ภาษีขาย ${accBaht(data.outputVat)} · ภาษีซื้อ ${accBaht(data.inputVat)}`);

                plData = data;
                renderAccVat(data);

                // ---------------- แท็บ 2: รายการเดินบัญชี ----------------
                const plTbody = document.getElementById('table-body-accounting-pl');
                const ledger = data.ledger || [];
                accSetText('badge-acc-pl', ledger.length);
                accSetText('acc-pl-count', ledger.length ? `แสดง ${ledger.length} จาก ${ledger.length} รายการ` : '');

                if (plTbody) {
                    if (!ledger.length) {
                        plTbody.innerHTML = accStateRow(PL_COLS, 'ไม่มีรายการเดินบัญชีในช่วงเวลานี้');
                    } else {
                        plTbody.innerHTML = ledger.map(item => {
                            const isIncome = item.type === 'รายรับ';
                            const badge = isIncome
                                ? `<div class="inline-flex items-center gap-2 px-2.5 py-1 rounded-[0.375rem] bg-[#42A231]/[0.12]">
                                       <div class="w-2 h-2 rounded-full bg-[#20D500]"></div>
                                       <span class="text-[#20D500] font-medium text-xs">รายรับ</span></div>`
                                : `<div class="inline-flex items-center gap-2 px-2.5 py-1 rounded-[0.375rem] bg-[#FE0000]/[0.12]">
                                       <div class="w-2 h-2 rounded-full bg-[#FE0000]"></div>
                                       <span class="text-[#FE0000] font-medium text-xs">รายจ่าย</span></div>`;
                            const amount = isIncome
                                ? `<span class="text-[#20D500] font-mono font-semibold">+${accBaht(item.amount)}</span>`
                                : `<span class="text-[#FE0000] font-mono font-semibold">-${accBaht(item.amount)}</span>`;
                            return `
                            <tr class="hover:bg-[#464646] transition-colors">
                                <td class="px-6 py-4">
                                    <p class="font-mono font-semibold text-[#FFE169]">${accEsc(item.transaction_id)}</p>
                                    <p class="text-xs text-white/70 mt-0.5">${accEsc(accDate(item.created_at))}</p>
                                </td>
                                <td class="px-6 py-4">${badge}</td>
                                <td class="px-6 py-4 text-white">${accEsc(item.category || '-')}</td>
                                <td class="px-6 py-4 text-right">${amount}</td>
                                <td class="px-6 py-4 text-white">${accEsc(item.recorded_by || '-')}</td>
                            </tr>`;
                        }).join('');
                    }
                }
            } else {
                showToast(json.message || 'ดึงข้อมูลบัญชีผิดพลาด', 'error');
                const plTbody = document.getElementById('table-body-accounting-pl');
                if (plTbody) plTbody.innerHTML = accStateRow(PL_COLS, json.message || 'ดึงข้อมูลบัญชีผิดพลาด', 'text-red-400');
            }

            // ---------------- แท็บ 1: บัญชีเจ้าหนี้ (AP) ----------------
            const poRes = await authFetch(`${API_BASE_URL}/purchase-orders`);
            const poJson = await poRes.json();
            if (poJson.success) {
                const apPOs = (poJson.data || []).filter(po => po.status !== 'ยกเลิก');

                const supplierSelect = document.getElementById('filter-ap-supplier');
                const selectedSupplier = supplierSelect ? supplierSelect.value : '';
                const uniqueSuppliers = [...new Set(apPOs.map(po => po.supplier_name))].sort();

                if (supplierSelect) {
                    supplierSelect.innerHTML = '<option value="">ทุกซัพพลายเออร์</option>' +
                        uniqueSuppliers.map(s => `<option value="${accEsc(s)}">${accEsc(s)}</option>`).join('');
                    supplierSelect.value = selectedSupplier;

                    if (!supplierSelect.dataset.listenerWired) {
                        supplierSelect.dataset.listenerWired = 'true';
                        supplierSelect.addEventListener('change', () => {
                            if (apRender) apRender(apPOsCache, supplierSelect.value);
                        });
                    }
                }

                // ชิปตัวกรองซัพพลายเออร์ (ข้อ 11.5)
                const renderApChips = (filterVal) => {
                    const box = document.getElementById('acc-ap-filters');
                    if (!box) return;
                    box.innerHTML = '';
                    if (!filterVal) return;
                    const chip = document.createElement('button');
                    chip.type = 'button';
                    chip.className = 'px-4 py-2.5 rounded-xl bg-[#4D4D4D]/40 border border-[#3F3F46] ' +
                        'text-white text-sm font-medium transition-colors flex items-center gap-2 cursor-pointer';
                    chip.innerHTML = `<span>ซัพพลายเออร์: ${accEsc(filterVal)}</span><i class="fa-solid fa-xmark text-[10px] opacity-80"></i>`;
                    chip.setAttribute('aria-label', `ลบตัวกรองซัพพลายเออร์ ${filterVal}`);
                    chip.addEventListener('click', (e) => {
                        if (!e.target.closest('i.fa-xmark')) return;
                        if (supplierSelect) supplierSelect.value = '';
                        renderAPTable(apPOs, '');
                    });
                    box.appendChild(chip);
                };

                const renderAPTable = (poList, filterVal) => {
                    const apTbody = document.getElementById('table-body-accounting-ap');
                    if (!apTbody) return;

                    const list = filterVal ? poList.filter(po => po.supplier_name === filterVal) : poList;
                    renderApChips(filterVal);
                    accSetText('acc-ap-count', poList.length ? `แสดง ${list.length} จาก ${poList.length} รายการ` : '');

                    if (!list.length) {
                        apTbody.innerHTML = accStateRow(AP_COLS, poList.length
                            ? 'ไม่พบใบสั่งซื้อของซัพพลายเออร์ที่เลือก'
                            : 'ไม่มีหนี้สินใบสั่งซื้อค้างจ่าย');
                        return;
                    }

                    apTbody.innerHTML = list.map(po => {
                        const totalCost = (po.items || []).reduce((sum, i) => sum + (i.cost_price || 0) * (i.ordered_qty || 0), 0);
                        const paidAmount = po.paid_amount || 0;
                        const discount = po.discount || 0;
                        const outstanding = Math.max(0, totalCost - paidAmount - discount);
                        const isPaid = po.payment_status === 'ชำระเงินแล้ว';

                        let statusBadge;
                        if (isPaid) {
                            statusBadge = `<div class="inline-flex items-center gap-2 px-2.5 py-1 rounded-[0.375rem] bg-[#42A231]/[0.12]">
                                    <div class="w-2 h-2 rounded-full bg-[#20D500]"></div>
                                    <span class="text-[#20D500] font-medium text-xs">ชำระเงินแล้ว</span></div>`;
                        } else if (po.payment_status === 'ชำระเงินบางส่วน') {
                            statusBadge = `<div class="inline-flex items-center gap-2 px-2.5 py-1 rounded-[0.375rem] bg-orange-500/[0.12]">
                                    <div class="w-2 h-2 rounded-full bg-orange-500"></div>
                                    <span class="text-orange-400 font-medium text-xs">ชำระบางส่วน</span></div>`;
                        } else {
                            statusBadge = `<div class="inline-flex items-center gap-2 px-2.5 py-1 rounded-[0.375rem] bg-[#FE0000]/[0.12]">
                                    <div class="w-2 h-2 rounded-full bg-[#FE0000]"></div>
                                    <span class="text-[#FE0000] font-medium text-xs">ยังไม่ได้ชำระ</span></div>`;
                        }

                        const payAction = !isPaid
                            ? `<button type="button" class="btn-pay-po px-3 py-1.5 bg-[#FFE169] hover:bg-[#E2B93C] text-[#333333] font-semibold rounded-[0.375rem] text-xs transition-colors inline-flex items-center gap-1.5 cursor-pointer"
                                    data-id="${accEsc(po._id)}" data-no="${accEsc(po.po_number)}" data-amount="${totalCost}"
                                    data-paid="${paidAmount}" data-discount="${discount}" data-outstanding="${outstanding}">
                                    <i class="fa-solid fa-money-bill-wave"></i> จ่ายเงิน
                               </button>`
                            : `<span class="text-xs text-white/70">จ่ายแล้ว ${accEsc(accDate(po.paid_at || po.updatedAt))}</span>`;

                        return `
                        <tr class="hover:bg-[#464646] transition-colors">
                            <td class="px-6 py-4">
                                <p class="font-mono font-semibold text-[#FFE169]">${accEsc(po.po_number)}</p>
                                <p class="text-xs text-white/70 mt-0.5">${accEsc(accDate(po.createdAt))}</p>
                            </td>
                            <td class="px-6 py-4 text-white">${accEsc(po.supplier_name || '-')}</td>
                            <td class="px-6 py-4 text-right text-white font-mono">${accBaht(totalCost)}</td>
                            <td class="px-6 py-4 text-right text-[#20D500] font-mono">${accBaht(paidAmount)}</td>
                            <td class="px-6 py-4 text-right text-white/70 font-mono" title="${accEsc(po.discount_remark || 'ไม่มีส่วนลด')}">${accBaht(discount)}</td>
                            <td class="px-6 py-4 text-right font-mono font-semibold ${outstanding > 0 ? 'text-orange-400' : 'text-white'}">${accBaht(outstanding)}</td>
                            <td class="px-6 py-4">${statusBadge}</td>
                            <td class="px-6 py-4 text-right">
                                <div class="flex items-center justify-end gap-1">
                                    ${payAction}
                                    <button type="button" class="btn-view-po-detail text-white hover:text-indigo-400 transition-colors p-2 cursor-pointer"
                                        data-id="${accEsc(po._id)}" title="ดูรายละเอียดใบสั่งซื้อ"
                                        aria-label="ดูรายละเอียดใบสั่งซื้อ ${accEsc(po.po_number)}">
                                        <i class="fa-solid fa-eye"></i>
                                    </button>
                                </div>
                            </td>
                        </tr>`;
                    }).join('');

                    apTbody.querySelectorAll('.btn-view-po-detail').forEach(btn => {
                        const po = list.find(p => String(p._id) === btn.dataset.id);
                        if (po) btn.addEventListener('click', () => openViewPOModal(po));
                    });

                    apTbody.querySelectorAll('.btn-pay-po').forEach(payBtn => {
                        payBtn.addEventListener('click', () => {
                            const poId = payBtn.dataset.id;
                            const poNo = payBtn.dataset.no;
                            const poAmount = Number(payBtn.dataset.amount);
                            const poPaid = Number(payBtn.dataset.paid);
                            const poDiscount = Number(payBtn.dataset.discount);
                            const poOutstanding = Number(payBtn.dataset.outstanding);
                            const todayStr = new Date().toLocaleDateString('en-CA');

                            const fieldCls = 'w-full px-4 py-2.5 rounded-xl bg-[#27272A] border border-[#3F3F46] text-white focus:border-[#FFE169] focus:outline-none transition-all text-sm';
                            const labelCls = 'text-slate-200 font-medium flex items-center gap-2 text-xs mb-1.5';

                            showConfirm(
                                `บันทึกจ่ายเงินใบสั่งซื้อ (${poNo})`,
                                `<div class="text-left space-y-4">
                                    <div class="grid grid-cols-2 gap-2 bg-[#27272A] border border-[#3F3F46] p-4 rounded-xl text-xs text-white/70">
                                        <div>ยอดรวม PO:</div>
                                        <div class="text-right font-mono text-white">${accBaht(poAmount)}</div>
                                        <div>ชำระก่อนหน้า:</div>
                                        <div class="text-right font-mono text-[#20D500]">${accBaht(poPaid)}</div>
                                        <div>ส่วนลดสะสม:</div>
                                        <div class="text-right font-mono text-[#FE0000]">${accBaht(poDiscount)}</div>
                                        <div class="font-semibold text-white border-t border-[#3F3F46] pt-2 mt-1">ยอดค้างชำระ:</div>
                                        <div class="text-right font-mono text-orange-400 font-semibold border-t border-[#3F3F46] pt-2 mt-1">${accBaht(poOutstanding)}</div>
                                    </div>
                                    <div class="space-y-4 bg-[#27272A] border border-[#3F3F46] p-4 rounded-xl">
                                        <div>
                                            <label for="ap-pay-date-input" class="${labelCls}">
                                                <i class="fa-solid fa-calendar text-white"></i> วันที่ชำระเงิน</label>
                                            <input type="date" id="ap-pay-date-input" class="${fieldCls} [color-scheme:dark]" value="${todayStr}">
                                        </div>
                                        <div class="grid grid-cols-2 gap-4">
                                            <div>
                                                <label for="ap-pay-amount-input" class="${labelCls}">
                                                    <i class="fa-solid fa-money-bill-wave text-white"></i> จ่ายรอบนี้</label>
                                                <input type="number" inputmode="numeric" id="ap-pay-amount-input" step="any" min="0" max="${poOutstanding}"
                                                    class="${fieldCls} font-mono text-right" value="${poOutstanding.toFixed(2)}">
                                            </div>
                                            <div>
                                                <label for="ap-pay-discount-input" class="${labelCls}">
                                                    <i class="fa-solid fa-tag text-white"></i> ส่วนลดรอบนี้</label>
                                                <input type="number" inputmode="numeric" id="ap-pay-discount-input" step="any" min="0" max="${poOutstanding}"
                                                    class="${fieldCls} font-mono text-right" value="0.00">
                                            </div>
                                        </div>
                                        <div>
                                            <label for="ap-pay-discount-remark-input" class="${labelCls}">
                                                <i class="fa-solid fa-pen text-white"></i> หมายเหตุส่วนลด (ระบุหากได้ส่วนลด)</label>
                                            <input type="text" id="ap-pay-discount-remark-input"
                                                placeholder="เช่น ชำระก่อนครบกำหนดรับส่วนลด 2%" class="${fieldCls} placeholder-slate-500">
                                        </div>
                                        <div id="ap-pay-calc-result" class="text-[11px] font-semibold text-white/70 text-right">
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

                            // ตัวคำนวณยอดคงเหลือสดๆ ในโมดัลยืนยัน
                            setTimeout(() => {
                                const amtInp = document.getElementById('ap-pay-amount-input');
                                const discInp = document.getElementById('ap-pay-discount-input');
                                const calcRes = document.getElementById('ap-pay-calc-result');
                                const updateCalc = () => {
                                    if (!amtInp || !discInp || !calcRes) return;
                                    const amt = Number(amtInp.value || 0);
                                    const disc = Number(discInp.value || 0);
                                    if (amt + disc > poOutstanding + 0.01) {
                                        calcRes.className = 'text-[11px] font-semibold text-[#FE0000] text-right';
                                        calcRes.textContent = `เกินยอดค้างชำระ: ${accBaht(Math.abs(poOutstanding - amt - disc))}`;
                                    } else {
                                        calcRes.className = 'text-[11px] font-semibold text-[#20D500] text-right';
                                        calcRes.textContent = `คงเหลือหลังชำระ: ${accBaht(Math.max(0, poOutstanding - amt - disc))}`;
                                    }
                                };
                                if (amtInp && discInp) {
                                    amtInp.addEventListener('input', updateCalc);
                                    discInp.addEventListener('input', updateCalc);
                                    updateCalc();
                                }
                            }, 100);
                        });
                    });
                };

                apPOsCache = apPOs;
                apRender = renderAPTable;
                poListForChart = poJson.data || [];

                const unpaidCount = apPOs.filter(po => po.payment_status !== 'ชำระเงินแล้ว').length;
                accSetText('badge-acc-ap', unpaidCount);
                renderAPTable(apPOs, selectedSupplier);
            } else {
                const apTbody = document.getElementById('table-body-accounting-ap');
                if (apTbody) apTbody.innerHTML = accStateRow(AP_COLS, poJson.message || 'ดึงข้อมูลใบสั่งซื้อไม่สำเร็จ', 'text-red-400');
            }

            // วาดกราฟเมื่อมีครบทั้งสองชุด ถ้าดึง PO ไม่สำเร็จก็ไม่วาด
            // เพราะเส้นรายจ่ายจะขาดต้นทุน PO ไปทั้งก้อนแล้วไม่ตรงกับการ์ด KPI ด้านบน
            if (plData) {
                if (poListForChart) {
                    renderAccBreakdown(plData, poListForChart, start, end);
                } else {
                    const host = document.getElementById('acc-breakdown-body');
                    if (host) host.innerHTML = '<p class="py-16 text-center text-white/50 italic">ดึงข้อมูลใบสั่งซื้อไม่สำเร็จ จึงยังวาดกราฟรายจ่ายไม่ได้</p>';
                }
            }

            // ---------------- การ์ดสรุปหนี้ค้างจ่ายรายซัพพลายเออร์ ----------------
            try {
                const summaryRes = await authFetch(`${API_BASE_URL}/accounting/ap-summary`);
                const summaryJson = await summaryRes.json();
                if (summaryJson.success) {
                    const box = document.getElementById('ap-summary-widgets');
                    const list = summaryJson.data || [];
                    if (box) {
                        box.innerHTML = list.length
                            ? list.map(sum => `
                                <div class="bg-[#4D4D4D]/40 rounded-2xl shadow-lg backdrop-blur-sm p-5">
                                    <div class="flex items-center justify-between gap-3">
                                        <span class="text-sm font-semibold text-white truncate">${accEsc(sum.supplier_name)}</span>
                                        <span class="px-2 py-0.5 rounded-full text-[10px] font-bold bg-orange-500/[0.12] text-orange-400 shrink-0">${sum.pending_bill_count} ใบ</span>
                                    </div>
                                    <p class="text-xs text-white/70 mt-3">ยอดค้างจ่ายรวม</p>
                                    <p class="text-xl font-semibold font-mono text-orange-400 mt-0.5">${accBaht(sum.total_outstanding)}</p>
                                </div>`).join('')
                            : `<div class="col-span-full bg-[#4D4D4D]/40 rounded-2xl shadow-lg backdrop-blur-sm px-6 py-8 text-center text-white/50 italic">
                                   ไม่มีหนี้สินค้างจ่ายกับซัพพลายเออร์</div>`;
                    }
                }
            } catch (apSumErr) {
                console.error('Error fetching AP summary:', apSumErr);
            }

            // ---------------- แท็บ 3: บัญชีลูกหนี้ (AR) ----------------
            const arRes = await authFetch(`${API_BASE_URL}/accounting/receivables`);
            const arJson = await arRes.json();
            if (arJson.success) {
                const receivables = arJson.data || [];
                const arTbody = document.getElementById('table-body-accounting-ar');
                const pendingAr = receivables.filter(r =>
                    r.status !== 'ชำระแล้ว' && r.status !== 'ได้รับเงินครบแล้ว' && r.status !== 'ยกเลิก').length;
                accSetText('badge-acc-ar', pendingAr);
                accSetText('acc-ar-count', receivables.length ? `แสดง ${receivables.length} จาก ${receivables.length} รายการ` : '');

                if (arTbody) {
                    if (!receivables.length) {
                        arTbody.innerHTML = accStateRow(AR_COLS, 'ไม่มีรายการค้างโอนจากไฟแนนซ์');
                    } else {
                        arTbody.innerHTML = receivables.map(rec => {
                            const isSettled = rec.status === 'ชำระแล้ว' || rec.status === 'ได้รับเงินครบแล้ว';
                            const isCancelled = rec.status === 'ยกเลิก';
                            const receiptNum = rec.transaction_id ? rec.transaction_id.receipt_number : '-';
                            const soldDate = rec.transaction_id
                                ? (rec.transaction_id.created_at || rec.transaction_id.createdAt)
                                : rec.createdAt;

                            const settledCell = isSettled
                                ? `<div class="inline-flex items-center gap-2 px-2.5 py-1 rounded-[0.375rem] bg-[#42A231]/[0.12]">
                                       <div class="w-2 h-2 rounded-full bg-[#20D500]"></div>
                                       <span class="text-[#20D500] font-medium text-xs">${accEsc(accDate(rec.settled_at))}</span></div>`
                                : isCancelled
                                    ? `<div class="inline-flex items-center gap-2 px-2.5 py-1 rounded-[0.375rem] bg-[#FE0000]/[0.12]">
                                           <div class="w-2 h-2 rounded-full bg-[#FE0000]"></div>
                                           <span class="text-[#FE0000] font-medium text-xs">ยกเลิกแล้ว</span></div>`
                                    : `<div class="inline-flex items-center gap-2 px-2.5 py-1 rounded-[0.375rem] bg-orange-500/[0.12]">
                                           <div class="w-2 h-2 rounded-full bg-orange-500"></div>
                                           <span class="text-orange-400 font-medium text-xs">รอรับเงิน</span></div>`;

                            const action = (!isSettled && !isCancelled)
                                ? `<button type="button" class="btn-settle-ar px-3 py-1.5 bg-[#FFE169] hover:bg-[#E2B93C] text-[#333333] font-semibold rounded-[0.375rem] text-xs transition-colors inline-flex items-center gap-1.5 cursor-pointer"
                                        data-id="${accEsc(rec._id)}" data-no="${accEsc(receiptNum)}" data-amount="${rec.financed_amount}">
                                        <i class="fa-solid fa-circle-check"></i> บันทึกรับเงิน
                                   </button>`
                                : `<span class="text-xs text-white/70">${isSettled ? 'รับเงินครบแล้ว' : 'ยกเลิกแล้ว'}</span>`;

                            return `
                            <tr class="hover:bg-[#464646] transition-colors">
                                <td class="px-6 py-4">
                                    <p class="font-mono font-semibold text-[#FFE169]">${accEsc(receiptNum)}</p>
                                    <p class="text-xs text-white/70 mt-0.5">${accEsc(accDate(soldDate))}</p>
                                </td>
                                <td class="px-6 py-4 text-white">${accEsc(rec.finance_company || '-')}</td>
                                <td class="px-6 py-4">${settledCell}</td>
                                <td class="px-6 py-4 text-right text-white font-mono font-semibold">${accBaht(rec.financed_amount)}</td>
                                <td class="px-6 py-4 text-right">
                                    <div class="flex items-center justify-end gap-1">${action}</div>
                                </td>
                            </tr>`;
                        }).join('');

                        arTbody.querySelectorAll('.btn-settle-ar').forEach(settleBtn => {
                            settleBtn.addEventListener('click', () => {
                                const arId = settleBtn.dataset.id;
                                const recNo = settleBtn.dataset.no;
                                const amount = Number(settleBtn.dataset.amount);
                                const todayStr = new Date().toLocaleDateString('en-CA');

                                showConfirm(
                                    'ยืนยันการรับเงินโอน',
                                    `<div class="text-left space-y-4">
                                        <p class="text-sm text-white/70">ยืนยันว่าได้รับยอดโอนจากบริษัทไฟแนนซ์ สำหรับใบเสร็จเลขที่
                                            <strong class="font-mono text-[#FFE169]">${accEsc(recNo)}</strong>
                                            จำนวน <strong class="font-mono text-[#20D500]">${accBaht(amount)}</strong> หรือไม่</p>
                                        <div class="bg-[#27272A] border border-[#3F3F46] p-4 rounded-xl">
                                            <label for="ar-pay-date-input" class="text-slate-200 font-medium flex items-center gap-2 text-xs mb-1.5">
                                                <i class="fa-solid fa-calendar text-white"></i> วันที่ได้รับเงินจากไฟแนนซ์</label>
                                            <input type="date" id="ar-pay-date-input" value="${todayStr}"
                                                class="w-full px-4 py-2.5 rounded-xl bg-[#27272A] border border-[#3F3F46] text-white focus:border-[#FFE169] focus:outline-none transition-all text-sm [color-scheme:dark]">
                                        </div>
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
                            });
                        });
                    }
                }
            } else {
                const arTbody = document.getElementById('table-body-accounting-ar');
                if (arTbody) arTbody.innerHTML = accStateRow(AR_COLS, arJson.message || 'ดึงข้อมูลลูกหนี้ไม่สำเร็จ', 'text-red-400');
            }

            // ---------------- การ์ดสรุปรายบริษัทไฟแนนซ์ ----------------
            try {
                const summaryRes = await authFetch(`${API_BASE_URL}/finance/summary`);
                const summaryJson = await summaryRes.json();
                if (summaryJson.success) {
                    const box = document.getElementById('finance-summary-widgets');
                    const list = summaryJson.data || [];
                    if (box) {
                        box.innerHTML = list.length
                            ? list.map(sum => `
                                <div class="bg-[#4D4D4D]/40 rounded-2xl shadow-lg backdrop-blur-sm p-5">
                                    <div class="flex items-center justify-between gap-3">
                                        <span class="text-sm font-semibold text-white truncate">${accEsc(sum.finance_partner_name)}</span>
                                        <span class="px-2 py-0.5 rounded-full text-[10px] font-bold bg-[#4D4D4D]/60 text-white shrink-0">จัดไฟแนนซ์</span>
                                    </div>
                                    <div class="mt-3 space-y-2">
                                        <p class="flex items-center justify-between text-xs">
                                            <span class="text-white/70">ยอดรวมค้างโอน</span>
                                            <span class="font-mono font-semibold text-orange-400">${accBaht(sum.total_pending)}</span>
                                        </p>
                                        <p class="flex items-center justify-between text-xs">
                                            <span class="text-white/70">ยอดโอนสำเร็จแล้ว</span>
                                            <span class="font-mono font-semibold text-[#20D500]">${accBaht(sum.payout_received || sum.total_settled)}</span>
                                        </p>
                                    </div>
                                </div>`).join('')
                            : `<div class="col-span-full bg-[#4D4D4D]/40 rounded-2xl shadow-lg backdrop-blur-sm px-6 py-8 text-center text-white/50 italic">
                                   ไม่มีข้อมูลสรุปสำหรับบริษัทไฟแนนซ์</div>`;
                    }
                }
            } catch (sumErr) {
                console.error('Error loading finance summary widget:', sumErr);
            }
        } catch (e) {
            console.error('Error loading accounting data:', e);
            showToast('เกิดข้อผิดพลาดขณะโหลดข้อมูลบัญชี', 'error');
            [['table-body-accounting-ap', AP_COLS], ['table-body-accounting-pl', PL_COLS],
            ['table-body-accounting-ar', AR_COLS]].forEach(([id, cols]) => {
                const el = document.getElementById(id);
                if (el && el.querySelector('.animate-pulse')) {
                    el.innerHTML = accStateRow(cols, 'เกิดข้อผิดพลาดในการโหลดข้อมูล', 'text-red-400');
                }
            });
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

    // ---------- ตัวช่วยเรนเดอร์หน้าตรวจรับ (DESIGN.md ข้อ 11.6 - 11.7) ----------
    const rcEsc = (s) => String(s == null ? '' : s)
        .replace(/&/g, '&amp;').replace(/</g, '&lt;').replace(/>/g, '&gt;')
        .replace(/"/g, '&quot;').replace(/'/g, '&#39;');

    const rcStateRow = (msg, cls = 'text-white/50 italic') =>
        `<tr><td colspan="${RECEIVE_COLS}" class="px-6 py-8 text-center ${cls}">${rcEsc(msg)}</td></tr>`;

    const rcDate = (d) => {
        if (!d) return '-';
        const dt = new Date(d);
        if (isNaN(dt)) return '-';
        return dt.toLocaleDateString('th-TH', { day: 'numeric', month: 'short', year: 'numeric' });
    };

    // สถานะของ PO ยุบเหลือ 3 โทนตามตารางข้อ 11.6 (ข้อความในป้ายยังแยกสถานะได้อยู่)
    const rcStatusTone = (status) => {
        if (status === 'นำเข้าสำเร็จ' || status === 'รับของครบแล้ว')
            return { dot: 'bg-[#20D500]', bg: 'bg-[#42A231]/[0.12]', text: 'text-[#20D500]' };
        if (status === 'ยกเลิก')
            return { dot: 'bg-[#FE0000]', bg: 'bg-[#FE0000]/[0.12]', text: 'text-[#FE0000]' };
        return { dot: 'bg-orange-500', bg: 'bg-orange-500/[0.12]', text: 'text-orange-400' };
    };

    const rcStatusBadge = (status) => {
        const t = rcStatusTone(status);
        const label = (status === 'นำเข้าสำเร็จ' || status === 'รับของครบแล้ว') ? 'นำเข้าสำเร็จ' : status;
        return `<div class="inline-flex items-center gap-2 px-2.5 py-1 rounded-[0.375rem] ${t.bg}">
                    <div class="w-2 h-2 rounded-full ${t.dot}"></div>
                    <span class="${t.text} font-medium text-xs">${rcEsc(label)}</span>
                </div>`;
    };

    const rcSkeleton = (rows = 4) => {
        const tbody = document.getElementById('table-body-receive-po');
        if (!tbody) return;
        const bar = (w) => `<div class="h-3.5 ${w} rounded-full bg-[#5c5c5c] animate-pulse"></div>`;
        tbody.innerHTML = Array.from({ length: rows }).map(() => `
            <tr>
                <td class="px-6 py-4">${bar('w-36')}</td>
                <td class="px-6 py-4">${bar('w-24')}</td>
                <td class="px-6 py-4">${bar('w-full')}</td>
                <td class="px-6 py-4">${bar('w-20')}</td>
                <td class="px-6 py-4">${bar('w-24')}</td>
                <td class="px-6 py-4">${bar('w-16')}</td>
            </tr>`).join('');
    };

    // ชิปตัวกรองที่ใช้อยู่ (ข้อ 11.5 — ลบได้เฉพาะตอนคลิกกากบาท)
    const renderReceiveChips = () => {
        const box = document.getElementById('receive-active-filters');
        if (!box) return;
        box.innerHTML = '';

        const chips = [];
        if (receiveSearchQuery) chips.push({ key: 'search', label: `ค้นหา: ${receiveSearchQuery}` });
        if (receiveSearchBranch) {
            const sel = document.getElementById('receive-filter-branch');
            const opt = sel ? sel.querySelector(`option[value="${receiveSearchBranch}"]`) : null;
            chips.push({ key: 'branch', label: `สาขา: ${opt ? opt.textContent : receiveSearchBranch}` });
        }

        const clearOne = (key) => {
            if (key === 'search') {
                receiveSearchQuery = '';
                const s = document.getElementById('search-receive-po');
                if (s) s.value = '';
            } else if (key === 'branch') {
                receiveSearchBranch = '';
                const b = document.getElementById('receive-filter-branch');
                if (b) b.value = '';
            }
            renderFilteredPOs();
        };

        chips.forEach(c => {
            const chip = document.createElement('button');
            chip.type = 'button';
            chip.className = 'px-4 py-2.5 rounded-xl bg-[#4D4D4D]/40 border border-[#3F3F46] ' +
                'text-white text-sm font-medium transition-colors flex items-center gap-2 cursor-pointer';
            chip.innerHTML = `<span>${rcEsc(c.label)}</span><i class="fa-solid fa-xmark text-[10px] opacity-80"></i>`;
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
                'rounded-full text-xs font-medium border border-red-500/30 transition-colors cursor-pointer';
            clearAll.textContent = 'ล้างทั้งหมด';
            clearAll.addEventListener('click', () => {
                receiveSearchQuery = '';
                receiveSearchBranch = '';
                const s = document.getElementById('search-receive-po');
                const b = document.getElementById('receive-filter-branch');
                if (s) s.value = '';
                if (b) b.value = '';
                renderFilteredPOs();
            });
            box.appendChild(clearAll);
        }
    };

    const renderFilteredPOs = () => {
        const tbody = document.getElementById('table-body-receive-po');
        if (!tbody) return;

        // จำนวนของแท็บนับจากข้อมูลดิบเสมอ ไม่ขึ้นกับช่องค้นหา/สาขาที่เลือกอยู่
        const byTab = cachedPOsData.filter(po => {
            if (currentReceiveTab === 'all') return true;
            if (currentReceiveTab === 'นำเข้าสำเร็จ')
                return po.status === 'นำเข้าสำเร็จ' || po.status === 'รับของครบแล้ว';
            return po.status === currentReceiveTab;
        });

        const q = receiveSearchQuery.toLowerCase();
        const filtered = byTab.filter(po => {
            if (q) {
                const poNum = (po.po_number || '').toLowerCase();
                const sup = (po.supplier_name || '').toLowerCase();
                if (!poNum.includes(q) && !sup.includes(q)) return false;
            }
            // PO ที่ไม่มีสาขาต้องไม่ผ่านตัวกรองสาขาที่เจาะจง
            if (receiveSearchBranch) {
                const bId = po.branch_id && typeof po.branch_id === 'object' ? po.branch_id._id : po.branch_id;
                if (String(bId) !== String(receiveSearchBranch)) return false;
            }
            return true;
        });

        renderReceiveChips();

        const countDisplay = document.getElementById('receive-po-total-count');
        if (countDisplay) {
            countDisplay.textContent = byTab.length ? `แสดง ${filtered.length} จาก ${byTab.length} รายการ` : '';
        }

        if (!filtered.length) {
            tbody.innerHTML = rcStateRow(byTab.length
                ? 'ไม่พบใบสั่งซื้อที่ตรงกับตัวกรอง'
                : 'ไม่มีใบสั่งซื้อในสถานะนี้');
            return;
        }

        tbody.innerHTML = filtered.map(po => {
            const branchName = (po.branch_id && po.branch_id.name) ? po.branch_id.name : '-';
            const items = po.items || [];
            const totalOrdered = items.reduce((sum, i) => sum + (i.ordered_qty || 0), 0);
            let totalReceived = items.reduce((sum, i) => sum + (i.received_qty || 0), 0);
            if (po.status === 'นำเข้าสำเร็จ' || po.status === 'รับของครบแล้ว') totalReceived = totalOrdered;
            const pct = totalOrdered ? Math.round((totalReceived / totalOrdered) * 100) : 0;
            const barColor = pct >= 100 ? 'bg-[#20D500]' : pct > 0 ? 'bg-[#FFE169]' : 'bg-[#5c5c5c]';

            // ปุ่มการกระทำขึ้นกับสถานะ: แจ้งของถึง -> ตรวจรับ -> ดูอย่างเดียว
            let action;
            if (po.status === 'รอจัดส่ง') {
                action = `<button type="button" class="btn-action-arrival px-3 py-1.5 bg-[#FFE169] hover:bg-[#E2B93C] text-[#333333] font-semibold rounded-[0.375rem] text-xs transition-colors inline-flex items-center gap-1.5 cursor-pointer"
                        data-id="${rcEsc(po._id)}">
                        <i class="fa-solid fa-truck-ramp-box"></i> แจ้งของถึงสาขา
                    </button>`;
            } else if (po.status === 'ของถึงสาขาแล้ว' || po.status === 'กำลังตรวจรับ') {
                action = `<button type="button" class="btn-open-receive px-3 py-1.5 bg-[#FFE169] hover:bg-[#E2B93C] text-[#333333] font-semibold rounded-[0.375rem] text-xs transition-colors inline-flex items-center gap-1.5 cursor-pointer"
                        data-id="${rcEsc(po._id)}">
                        <i class="fa-solid fa-boxes-packing"></i> ตรวจรับของ
                    </button>`;
            } else {
                action = `<button type="button" class="btn-view-po text-white hover:text-indigo-400 transition-colors p-2 cursor-pointer"
                        data-id="${rcEsc(po._id)}" title="ดูข้อมูลใบสั่งซื้อ"
                        aria-label="ดูข้อมูลใบสั่งซื้อ ${rcEsc(po.po_number)}">
                        <i class="fa-solid fa-eye"></i>
                    </button>`;
            }

            return `
            <tr class="hover:bg-[#464646] transition-colors">
                <td class="px-6 py-4">
                    <p class="font-mono font-semibold text-[#FFE169]">${rcEsc(po.po_number)}</p>
                    <p class="text-xs text-white/70 mt-0.5">${rcEsc(rcDate(po.createdAt))}</p>
                </td>
                <td class="px-6 py-4 text-white">${rcEsc(po.supplier_name || '-')}</td>
                <td class="px-6 py-4 text-white">${rcEsc(branchName)}</td>
                <td class="px-6 py-4 text-center">
                    <p class="text-white font-medium">${totalReceived}/${totalOrdered}
                        <span class="text-xs text-white font-normal">ชิ้น</span></p>
                    <div class="mt-1.5 h-1 w-24 mx-auto rounded-full bg-[#5c5c5c]/50 overflow-hidden">
                        <div class="h-full ${barColor} rounded-full" style="width:${pct}%"></div>
                    </div>
                </td>
                <td class="px-6 py-4">${rcStatusBadge(po.status)}</td>
                <td class="px-6 py-4 text-right">
                    <div class="flex items-center justify-end gap-1">${action}</div>
                </td>
            </tr>`;
        }).join('');

        const byId = (id) => filtered.find(p => String(p._id) === String(id));
        tbody.querySelectorAll('.btn-action-arrival').forEach(b =>
            b.addEventListener('click', () => { const po = byId(b.dataset.id); if (po) openArrivalModal(po); }));
        tbody.querySelectorAll('.btn-open-receive').forEach(b =>
            b.addEventListener('click', () => { const po = byId(b.dataset.id); if (po) openReceiveModal(po); }));
        tbody.querySelectorAll('.btn-view-po').forEach(b =>
            b.addEventListener('click', () => { const po = byId(b.dataset.id); if (po) openViewPOModal(po); }));
    };

    const loadPOs = async () => {
        const tbody = document.getElementById('table-body-receive-po');
        if (!tbody) return;
        rcSkeleton();

        try {
            const res = await authFetch(`${API_BASE_URL}/purchase-orders`);
            const json = await res.json();
            if (json.success) {
                cachedPOsData = json.data || [];

                // ป้ายนับบนแท็บ นับจากข้อมูลทั้งชุด
                const counts = {
                    'badge-receive-all': cachedPOsData.length,
                    'badge-receive-pending': cachedPOsData.filter(po => po.status === 'รอจัดส่ง').length,
                    'badge-receive-arrived': cachedPOsData.filter(po => po.status === 'ของถึงสาขาแล้ว').length,
                    'badge-receive-checking': cachedPOsData.filter(po => po.status === 'กำลังตรวจรับ').length,
                    'badge-receive-imported': cachedPOsData.filter(po => po.status === 'นำเข้าสำเร็จ' || po.status === 'รับของครบแล้ว').length,
                    'badge-receive-cancelled': cachedPOsData.filter(po => po.status === 'ยกเลิก').length
                };
                Object.entries(counts).forEach(([id, n]) => {
                    const el = document.getElementById(id);
                    if (el) el.textContent = n;
                });

                renderFilteredPOs();
            } else {
                cachedPOsData = [];
                tbody.innerHTML = rcStateRow(json.message || 'ดึงข้อมูลใบสั่งซื้อไม่สำเร็จ', 'text-red-400');
                const c = document.getElementById('receive-po-total-count');
                if (c) c.textContent = '';
            }
        } catch (e) {
            console.error(e);
            cachedPOsData = [];
            tbody.innerHTML = rcStateRow('เชื่อมต่อบริการล้มเหลว', 'text-red-400');
            const c = document.getElementById('receive-po-total-count');
            if (c) c.textContent = '';
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
    // ตารางเดียวรวมทุกสถานะ + ตัวกรอง + แบ่งหน้า (ตามแบบที่ผู้ใช้กำหนด)
    // ==========================================
    const ARRIVAL_COLS = 6;
    const ARRIVAL_PER_PAGE = 10;
    let _arrivalCache = [];
    let _arrivalPage = 1;
    let _arrivalBound = false;

    const arEsc = (s) => String(s == null ? '' : s)
        .replace(/&/g, '&amp;').replace(/</g, '&lt;').replace(/>/g, '&gt;')
        .replace(/"/g, '&quot;').replace(/'/g, '&#39;');

    const arStateRow = (msg, cls = 'text-white/50 italic') =>
        `<tr><td colspan="${ARRIVAL_COLS}" class="px-6 py-8 text-center ${cls}">${arEsc(msg)}</td></tr>`;

    const arSkeleton = (rows = 6) => {
        const tbody = document.getElementById('table-body-arrival-po');
        if (!tbody) return;
        const bar = (w) => `<div class="h-3.5 ${w} rounded-full bg-[#5c5c5c] animate-pulse"></div>`;
        tbody.innerHTML = Array.from({ length: rows }).map(() => `
            <tr>
                <td class="px-6 py-4">${bar('w-36')}</td>
                <td class="px-6 py-4">${bar('w-20')}</td>
                <td class="px-6 py-4">${bar('w-full')}</td>
                <td class="px-6 py-4">${bar('w-20')}</td>
                <td class="px-6 py-4">${bar('w-24')}</td>
                <td class="px-6 py-4">${bar('w-28')}</td>
            </tr>`).join('');
    };

    const arDate = (d) => {
        if (!d) return '-';
        const dt = new Date(d);
        if (isNaN(dt)) return '-';
        return `${dt.getDate()}/${dt.getMonth() + 1}/${dt.getFullYear() + 543}`;
    };

    const arSetText = (id, text) => {
        const el = document.getElementById(id);
        if (el) el.textContent = text;
    };

    // สถานะ 4 ระดับตามแบบ: รอจัดส่ง (ฟ้า) → แจ้งถึงร้านแล้ว (เหลืองอำพัน) → นำเข้าสต็อกแล้ว (เขียว) · ยกเลิก (แดง)
    const AR_STATUS = {
        'รอจัดส่ง': { label: 'รอจัดส่ง', hex: '#0A84FF' },
        'ของถึงสาขาแล้ว': { label: 'แจ้งถึงร้านแล้ว', hex: '#FF9F0A' },
        'กำลังตรวจรับ': { label: 'กำลังตรวจรับ', hex: '#FF9F0A' },
        'นำเข้าสำเร็จ': { label: 'นำเข้าสต็อกแล้ว', hex: '#20D500' },
        'รับของครบแล้ว': { label: 'นำเข้าสต็อกแล้ว', hex: '#20D500' },
        'ยกเลิก': { label: 'ยกเลิกแล้ว', hex: '#FE0000' }
    };
    const arStatusConf = (s) => AR_STATUS[s] || { label: s || '-', hex: '#8E8E93' };

    const arStatusBadge = (status) => {
        const c = arStatusConf(status);
        return `<span class="inline-flex items-center px-2.5 py-1 rounded-[0.375rem] text-xs font-medium"
                      style="color:${c.hex};background-color:${c.hex}1F;">${arEsc(c.label)}</span>`;
    };

    const arItemsDesc = (po) => {
        const items = po.items || [];
        if (!items.length) return '-';
        return items.map(i => `${i.product_name} (${i.ordered_qty} ชิ้น)`).join(', ');
    };

    // ยังแจ้งของถึงไม่ได้เมื่อของยังไม่ออกจากสถานะ "รอจัดส่ง"
    const arCanConfirm = (po) => po.status === 'รอจัดส่ง';

    const arBranchOf = (po) => (po.branch_id && po.branch_id.name) ? po.branch_id.name : '';
    const arBranchId = (po) => po.branch_id ? String(po.branch_id._id || po.branch_id) : '';

    // เติมตัวเลือกตัวกรองจากข้อมูลจริงที่โหลดมา
    const arFillFilters = () => {
        const st = document.getElementById('arrival-filter-status');
        if (st && st.options.length <= 1) {
            const seen = [];
            _arrivalCache.forEach(po => { if (!seen.includes(po.status)) seen.push(po.status); });
            st.innerHTML = '<option value="">สถานะทั้งหมด</option>' +
                seen.map(s => `<option value="${arEsc(s)}">${arEsc(arStatusConf(s).label)}</option>`).join('');
        }
        const br = document.getElementById('arrival-filter-branch');
        if (br) {
            const keep = br.value;
            const map = new Map();
            _arrivalCache.forEach(po => { const id = arBranchId(po); if (id && arBranchOf(po)) map.set(id, arBranchOf(po)); });
            br.innerHTML = '<option value="">เลือกสาขา</option>' +
                [...map.entries()].sort((a, b) => a[1].localeCompare(b[1], 'th'))
                    .map(([id, name]) => `<option value="${arEsc(id)}">${arEsc(name)}</option>`).join('');
            br.value = keep;
        }
    };

    const arFilters = () => ({
        q: (document.getElementById('arrival-search')?.value || '').trim().toLowerCase(),
        status: document.getElementById('arrival-filter-status')?.value || '',
        branch: document.getElementById('arrival-filter-branch')?.value || '',
        start: document.getElementById('arrival-filter-start')?.value || '',
        end: document.getElementById('arrival-filter-end')?.value || ''
    });

    // ชิปตัวกรองที่ใช้อยู่ (ข้อ 11.5 — ลบได้เฉพาะตอนคลิกกากบาท)
    const arRenderChips = () => {
        const box = document.getElementById('arrival-active-filters');
        if (!box) return;
        box.innerHTML = '';
        const f = arFilters();
        const brSel = document.getElementById('arrival-filter-branch');

        const chips = [];
        if (f.q) chips.push({ key: 'arrival-search', label: `ค้นหา: ${f.q}` });
        if (f.status) chips.push({ key: 'arrival-filter-status', label: `สถานะ: ${arStatusConf(f.status).label}` });
        if (f.branch) {
            const opt = brSel ? brSel.querySelector(`option[value="${f.branch}"]`) : null;
            chips.push({ key: 'arrival-filter-branch', label: `สาขา: ${opt ? opt.textContent : f.branch}` });
        }
        if (f.start) chips.push({ key: 'arrival-filter-start', label: `ตั้งแต่: ${arDate(f.start)}` });
        if (f.end) chips.push({ key: 'arrival-filter-end', label: `ถึง: ${arDate(f.end)}` });

        const clearOne = (id) => {
            const el = document.getElementById(id);
            if (el) el.value = '';
            _arrivalPage = 1;
            renderArrivalTable();
        };

        chips.forEach(c => {
            const chip = document.createElement('button');
            chip.type = 'button';
            chip.className = 'px-4 py-2.5 rounded-xl bg-[#4D4D4D]/40 border border-[#3F3F46] ' +
                'text-white text-sm font-medium transition-colors flex items-center gap-2 cursor-pointer';
            chip.innerHTML = `<span>${arEsc(c.label)}</span><i class="fa-solid fa-xmark text-[10px] opacity-80"></i>`;
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
                'rounded-full text-xs font-medium border border-red-500/30 transition-colors cursor-pointer';
            clearAll.textContent = 'ล้างทั้งหมด';
            clearAll.addEventListener('click', () => {
                ['arrival-search', 'arrival-filter-status', 'arrival-filter-branch',
                    'arrival-filter-start', 'arrival-filter-end'].forEach(id => {
                        const el = document.getElementById(id);
                        if (el) el.value = '';
                    });
                _arrivalPage = 1;
                renderArrivalTable();
            });
            box.appendChild(clearAll);
        }
    };

    // จุดแบ่งหน้า — กดเลือกหน้าได้ ถ้าหน้าเยอะจะสลับเป็นปุ่มก่อนหน้า/ถัดไป
    const arRenderPagination = (totalPages) => {
        const box = document.getElementById('arrival-pagination');
        if (!box) return;
        box.innerHTML = '';
        if (totalPages <= 1) return;

        const go = (p) => { _arrivalPage = p; renderArrivalTable(); };

        if (totalPages <= 8) {
            for (let p = 1; p <= totalPages; p++) {
                const dot = document.createElement('button');
                dot.type = 'button';
                const on = p === _arrivalPage;
                dot.className = `rounded-full transition-all cursor-pointer ${on
                    ? 'w-2.5 h-2.5 bg-[#FFE169]' : 'w-2 h-2 bg-white/30 hover:bg-white/60'}`;
                dot.setAttribute('aria-label', `ไปหน้า ${p}`);
                dot.setAttribute('aria-current', on ? 'page' : 'false');
                dot.addEventListener('click', () => go(p));
                box.appendChild(dot);
            }
            return;
        }

        const mk = (label, page, disabled) => {
            const b = document.createElement('button');
            b.type = 'button';
            b.disabled = !!disabled;
            b.className = 'px-3 py-2 bg-[#4D4D4D]/40 cursor-pointer text-white flex items-center gap-1.5 ' +
                'rounded-[0.5rem] text-sm hover:bg-[#5C5C5C] transition-colors disabled:opacity-30 disabled:pointer-events-none';
            b.innerHTML = label;
            b.addEventListener('click', () => go(page));
            return b;
        };
        box.appendChild(mk('<i class="fa-solid fa-chevron-left text-xs"></i> ก่อนหน้า', _arrivalPage - 1, _arrivalPage <= 1));
        const info = document.createElement('span');
        info.className = 'px-4 py-2 bg-[#27272A] border border-[#3F3F46] text-white rounded-[0.5rem] text-sm font-mono';
        info.textContent = `${_arrivalPage} / ${totalPages}`;
        box.appendChild(info);
        box.appendChild(mk('ถัดไป <i class="fa-solid fa-chevron-right text-xs"></i>', _arrivalPage + 1, _arrivalPage >= totalPages));
    };

    const renderArrivalTable = () => {
        const tbody = document.getElementById('table-body-arrival-po');
        if (!tbody) return;

        arRenderChips();
        const f = arFilters();
        const startTs = f.start ? new Date(`${f.start}T00:00:00`).getTime() : null;
        const endTs = f.end ? new Date(`${f.end}T23:59:59`).getTime() : null;

        const rows = _arrivalCache.filter(po => {
            if (f.status && po.status !== f.status) return false;
            if (f.branch && arBranchId(po) !== f.branch) return false;
            if (startTs || endTs) {
                const ts = new Date(po.createdAt).getTime();
                if (isNaN(ts)) return false;
                if (startTs && ts < startTs) return false;
                if (endTs && ts > endTs) return false;
            }
            if (!f.q) return true;
            return [po.po_number, po.supplier_name, arBranchOf(po), arItemsDesc(po)]
                .filter(Boolean).join(' ').toLowerCase().includes(f.q);
        });

        arSetText('arrival-result-count',
            _arrivalCache.length ? `แสดง ${rows.length} จาก ${_arrivalCache.length} รายการ` : '');

        if (!rows.length) {
            tbody.innerHTML = arStateRow(_arrivalCache.length
                ? 'ไม่พบใบสั่งซื้อที่ตรงกับตัวกรอง'
                : 'ยังไม่มีใบสั่งซื้อในระบบ');
            arRenderPagination(0);
            return;
        }

        const totalPages = Math.max(1, Math.ceil(rows.length / ARRIVAL_PER_PAGE));
        if (_arrivalPage > totalPages) _arrivalPage = totalPages;
        const pageRows = rows.slice((_arrivalPage - 1) * ARRIVAL_PER_PAGE, _arrivalPage * ARRIVAL_PER_PAGE);

        tbody.innerHTML = pageRows.map(po => {
            const desc = arItemsDesc(po);
            const canConfirm = arCanConfirm(po);
            const btnClass = 'px-4 py-2 bg-[#4D4D4D]/60 hover:bg-[#5C5C5C] text-white text-xs font-medium ' +
                'rounded-[0.5rem] transition-colors cursor-pointer whitespace-nowrap';
            const action = canConfirm
                ? `<button type="button" class="btn-confirm-arrival ${btnClass}" data-id="${arEsc(po._id)}"
                        aria-label="ยืนยันของถึงร้าน ใบสั่งซื้อ ${arEsc(po.po_number)}">ยืนยันของถึงร้าน</button>`
                : `<button type="button" class="btn-view-arrival-details ${btnClass}" data-id="${arEsc(po._id)}"
                        aria-label="ดูรายละเอียดใบสั่งซื้อ ${arEsc(po.po_number)}">ดูรายละเอียด</button>`;

            return `
            <tr class="hover:bg-[#464646] transition-colors">
                <td class="px-6 py-4"><span class="font-mono font-semibold text-[#FFE169]">${arEsc(po.po_number)}</span></td>
                <td class="px-6 py-4 text-white">${arEsc(po.supplier_name || '-')}</td>
                <td class="px-6 py-4">
                    <span class="text-white block max-w-[360px] truncate" title="${arEsc(desc)}">${arEsc(desc)}</span>
                </td>
                <td class="px-6 py-4 text-white">${arEsc(arDate(po.createdAt))}</td>
                <td class="px-6 py-4">${arStatusBadge(po.status)}</td>
                <td class="px-6 py-4 text-right">
                    <div class="flex items-center justify-end gap-1">${action}</div>
                </td>
            </tr>`;
        }).join('');

        const byId = (id) => pageRows.find(p => String(p._id) === String(id));
        tbody.querySelectorAll('.btn-confirm-arrival').forEach(btn =>
            btn.addEventListener('click', () => { const po = byId(btn.dataset.id); if (po) openArrivalModal(po); }));
        tbody.querySelectorAll('.btn-view-arrival-details').forEach(btn =>
            btn.addEventListener('click', () => { const po = byId(btn.dataset.id); if (po) showCompletedPODetails(po); }));

        arRenderPagination(totalPages);
    };

    const loadArrivalPOs = async () => {
        const tbody = document.getElementById('table-body-arrival-po');
        if (!tbody) return;

        // ผูก listener ครั้งเดียว (loadPageView แทรก HTML ครั้งเดียว)
        if (!_arrivalBound) {
            _arrivalBound = true;
            const s = document.getElementById('arrival-search');
            if (s) {
                let t = null;
                s.addEventListener('input', () => {
                    clearTimeout(t);
                    t = setTimeout(() => { _arrivalPage = 1; renderArrivalTable(); }, 200);
                });
            }
            ['arrival-filter-status', 'arrival-filter-branch', 'arrival-filter-start', 'arrival-filter-end']
                .forEach(id => {
                    const el = document.getElementById(id);
                    if (el) el.addEventListener('change', () => { _arrivalPage = 1; renderArrivalTable(); });
                });

            // โมดัลแจ้งสินค้านอกระบบ PO
            const openBtn = document.getElementById('btn-open-nonpo-modal');
            const closeBtn = document.getElementById('btn-close-nonpo-modal');
            const modal = document.getElementById('modal-nonpo-arrival');
            if (openBtn && modal) {
                openBtn.addEventListener('click', async () => {
                    modal.classList.remove('opacity-0', 'pointer-events-none');
                    // เรนเดอร์ตัวเลือกใหม่ทุกครั้งที่เปิด — ถ้าเรียกแค่ตอนสลับเข้าหน้า
                    // แล้ว masterDataCache ยังมาไม่ถึง กลุ่ม pill จะว่างถาวรและเลือกอะไรไม่ได้เลย
                    if (typeof window.ensureMasterDataLoaded === 'function') {
                        await window.ensureMasterDataLoaded();
                    }
                    window.populateArrivalPickers();
                    window.npBindScrollButtons();
                });
            }
            if (closeBtn && modal) {
                closeBtn.addEventListener('click', () => {
                    modal.classList.add('opacity-0', 'pointer-events-none');
                    window.npCancelEdit();   // ปิดแล้วต้องไม่ค้างโหมดแก้ไขไว้
                });
            }
            const cancelEditBtn = document.getElementById('btn-cancel-arrival-edit');
            if (cancelEditBtn) {
                cancelEditBtn.addEventListener('click', () => window.npExitEditAndClear());
            }
        }

        arSkeleton();

        try {
            const res = await authFetch(`${API_BASE_URL}/purchase-orders`);
            const json = await res.json();
            if (!json.success) {
                _arrivalCache = [];
                tbody.innerHTML = arStateRow(json.message || 'ดึงข้อมูลใบสั่งซื้อไม่สำเร็จ', 'text-red-400');
                arSetText('arrival-result-count', '');
                return;
            }
            _arrivalCache = json.data || [];
            arFillFilters();
            renderArrivalTable();
        } catch (e) {
            console.error(e);
            _arrivalCache = [];
            tbody.innerHTML = arStateRow('เกิดข้อผิดพลาดในการโหลดข้อมูล', 'text-red-400');
            arSetText('arrival-result-count', '');
        }
    };
    // switchView ใน script.js เรียกผ่านชื่อ global (typeof loadArrivalPOs) จึงต้อง export ออกไป
    window.loadArrivalPOs = loadArrivalPOs;

    // ---------- กลุ่ม pill / swatch ของฟอร์มแจ้งสินค้านอกระบบ PO (DESIGN.md ข้อ 11.9, 11.14) ----------
    // สัญญาเดียวกับ .filter-pill ในหน้า #stock: ค่าจริงเก็บใน <select class="hidden"> ที่ data-target ชี้ไป
    // แล้ว dispatch change — ตัวส่งฟอร์มเดิมใน script.js จึงอ่านค่าทางเดิมได้โดยไม่ต้องแก้
    const NP_PILL_BASE = 'flex-shrink-0 px-4 py-2.5 bg-[#27272A] rounded-xl text-sm transition-colors cursor-pointer filter-pill';
    const NP_PILL_OFF = 'border border-[#3F3F46] text-slate-300 hover:border-[#FFE169] hover:text-white';
    const NP_PILL_ON = 'border border-[#FFE169] text-[#FFE169]';

    // ตั้งค่าให้ <select> โดยกันกรณีค่าที่บันทึกไว้ถูกลบออกจากข้อมูลพื้นฐานไปแล้ว
    // ถ้าไม่เติม <option> ให้ ช่องจะเด้งกลับเป็นตัวเลือกว่าง แล้วค่าเดิมหายตอนบันทึก
    const npSetSelectValue = (selectId, value) => {
        const sel = document.getElementById(selectId);
        if (!sel) return;
        const v = value || '';
        if (v && !sel.querySelector(`option[value="${CSS.escape(v)}"]`)) {
            const opt = document.createElement('option');
            opt.value = v;
            opt.textContent = `${v} (ไม่มีในข้อมูลพื้นฐานแล้ว)`;
            sel.appendChild(opt);
        }
        sel.value = v;
    };

    const npSetPillValue = (containerId, targetId, value) => {
        const container = document.getElementById(containerId);
        const target = document.getElementById(targetId);
        if (!container) return;

        // ค่าที่เคยบันทึกไว้อาจถูกลบออกจากข้อมูลพื้นฐานไปแล้ว ถ้าไม่มี pill รองรับ
        // การกดแก้ไขจะเห็นเป็นช่องว่าง แล้วพอกดบันทึกค่าเดิมจะหายไปเงียบๆ
        // จึงเติม pill ชั่วคราวให้ค่านั้นเพื่อให้เห็นและถูกส่งกลับไปตามเดิม
        if (value && !container.querySelector(`.filter-pill[data-value="${CSS.escape(value)}"]`)) {
            const ghost = document.createElement('button');
            ghost.type = 'button';
            ghost.className = `${NP_PILL_BASE} ${NP_PILL_OFF}`;
            ghost.dataset.target = targetId;
            ghost.dataset.value = value;
            ghost.dataset.ghost = '1';
            ghost.title = 'ค่านี้ไม่มีอยู่ในข้อมูลพื้นฐานแล้ว';
            ghost.textContent = value;
            ghost.addEventListener('click', () => {
                const already = ghost.classList.contains('active');
                npSetPillValue(containerId, targetId, already ? '' : value);
            });
            container.appendChild(ghost);
            if (target && !target.querySelector(`option[value="${CSS.escape(value)}"]`)) {
                const opt = document.createElement('option');
                opt.value = value;
                opt.textContent = value;
                target.appendChild(opt);
            }
        }

        container.querySelectorAll('.filter-pill').forEach(p => {
            const on = p.dataset.value === value;
            p.className = `${NP_PILL_BASE} ${on ? NP_PILL_ON : NP_PILL_OFF}`;
            p.classList.toggle('active', on);
            p.setAttribute('aria-pressed', String(on));
        });
        if (target) {
            target.value = value || '';
            target.dispatchEvent(new Event('change'));
        }
    };

    const npRenderPills = (containerId, targetId, items) => {
        const container = document.getElementById(containerId);
        const target = document.getElementById(targetId);
        if (!container || !target) return;

        // <select class="hidden"> ต้องมี option ครบ ไม่งั้น select.value = ... จะไม่ติด
        target.innerHTML = '<option value=""></option>' +
            (items || []).map(i => `<option value="${arEsc(i.name)}">${arEsc(i.name)}</option>`).join('');

        container.innerHTML = '';
        (items || []).forEach(item => {
            const btn = document.createElement('button');
            btn.type = 'button';
            btn.className = `${NP_PILL_BASE} ${NP_PILL_OFF}`;
            btn.dataset.target = targetId;
            btn.dataset.value = item.name;
            btn.setAttribute('aria-pressed', 'false');
            btn.textContent = item.name;
            // กด pill ที่เลือกอยู่ซ้ำ = ยกเลิกการเลือก (ฟอร์มนี้ไม่มีปุ่ม "ทั้งหมด")
            btn.addEventListener('click', () => {
                const already = btn.classList.contains('active');
                npSetPillValue(containerId, targetId, already ? '' : item.name);
            });
            container.appendChild(btn);
        });
    };

    // จานสี — สีมาจากตัวแปลงกลาง window.resolveProductColorHex เท่านั้น (ข้อ 11.14)
    const npRenderSwatches = (containerId, targetId, items) => {
        const container = document.getElementById(containerId);
        const target = document.getElementById(targetId);
        if (!container || !target) return;

        target.innerHTML = '<option value=""></option>' +
            (items || []).map(i => `<option value="${arEsc(i.name)}">${arEsc(i.name)}</option>`).join('');

        container.innerHTML = '';
        (items || []).forEach(item => {
            const hex = (typeof window.toSixDigitHex === 'function' && typeof window.resolveProductColorHex === 'function')
                ? window.toSixDigitHex(window.resolveProductColorHex(item.name, item))
                : '#8E8E93';

            const wrap = document.createElement('button');
            wrap.type = 'button';
            wrap.className = 'np-swatch flex flex-col items-center gap-1 shrink-0 cursor-pointer';
            wrap.dataset.value = item.name;
            wrap.setAttribute('aria-pressed', 'false');
            wrap.setAttribute('aria-label', `เลือกสี ${item.name}`);
            wrap.innerHTML = `
                <span class="np-swatch-dot w-7 h-7 rounded-full border-2 border-transparent transition-all"
                      style="background-color:${hex};"></span>
                <span class="np-swatch-label text-[10px] text-slate-400 whitespace-nowrap transition-colors">${arEsc(item.name)}</span>`;

            wrap.addEventListener('click', () => {
                const already = wrap.getAttribute('aria-pressed') === 'true';
                npSetSwatchValue(containerId, targetId, already ? '' : item.name);
            });
            container.appendChild(wrap);
        });
    };

    const npSetSwatchValue = (containerId, targetId, value) => {
        const container = document.getElementById(containerId);
        const target = document.getElementById(targetId);
        if (!container) return;

        // เหตุผลเดียวกับ npSetPillValue — สีที่ถูกลบออกจากข้อมูลพื้นฐานต้องยังเห็นและไม่หายตอนบันทึก
        if (value && !container.querySelector(`.np-swatch[data-value="${CSS.escape(value)}"]`)) {
            const hex = (typeof window.toSixDigitHex === 'function' && typeof window.resolveProductColorHex === 'function')
                ? window.toSixDigitHex(window.resolveProductColorHex(value, null))
                : '#8E8E93';
            const ghost = document.createElement('button');
            ghost.type = 'button';
            ghost.className = 'np-swatch flex flex-col items-center gap-1 shrink-0 cursor-pointer';
            ghost.dataset.value = value;
            ghost.dataset.ghost = '1';
            ghost.title = 'สีนี้ไม่มีอยู่ในข้อมูลพื้นฐานแล้ว';
            ghost.setAttribute('aria-pressed', 'false');
            ghost.setAttribute('aria-label', `เลือกสี ${value}`);
            ghost.innerHTML = `
                <span class="np-swatch-dot w-7 h-7 rounded-full border-2 border-transparent transition-all"
                      style="background-color:${hex};"></span>
                <span class="np-swatch-label text-[10px] text-slate-400 whitespace-nowrap transition-colors">${arEsc(value)}</span>`;
            ghost.addEventListener('click', () => {
                const already = ghost.getAttribute('aria-pressed') === 'true';
                npSetSwatchValue(containerId, targetId, already ? '' : value);
            });
            container.appendChild(ghost);
            if (target && !target.querySelector(`option[value="${CSS.escape(value)}"]`)) {
                const opt = document.createElement('option');
                opt.value = value;
                opt.textContent = value;
                target.appendChild(opt);
            }
        }

        container.querySelectorAll('.np-swatch').forEach(w => {
            const on = w.dataset.value === value;
            w.setAttribute('aria-pressed', String(on));
            const dot = w.querySelector('.np-swatch-dot');
            const label = w.querySelector('.np-swatch-label');
            if (dot) {
                dot.classList.toggle('border-[#FFE169]', on);
                dot.classList.toggle('scale-110', on);
                dot.classList.toggle('border-transparent', !on);
            }
            if (label) {
                label.classList.toggle('text-[#FFE169]', on);
                label.classList.toggle('text-slate-400', !on);
            }
        });
        if (target) {
            target.value = value || '';
            target.dispatchEvent(new Event('change'));
        }
    };

    // เติมตัวเลือกทั้งฟอร์มจาก masterDataCache
    window.populateArrivalPickers = () => {
        const md = window.masterDataCache;
        if (!md) return;
        // เรนเดอร์ใหม่สร้าง pill ทั้งแถวใหม่หมด จึงต้องจำค่าที่เลือกอยู่แล้วใส่กลับ
        const keepPicked = {};
        ['arrival-type-name', 'arrival-condition-name', 'arrival-color-name',
         'arrival-capacity-name', 'arrival-unit-name'].forEach(id => {
            const el = document.getElementById(id);
            if (el) keepPicked[id] = el.value;
        });
        const sel = document.getElementById('arrival-product-name');
        if (sel) {
            const keep = sel.value;
            sel.innerHTML = '<option value="">ระบุชื่อ</option>' +
                (md.productNames || []).map(i => `<option value="${arEsc(i.name)}">${arEsc(i.name)}</option>`).join('');
            npSetSelectValue('arrival-product-name', keep);
        }

        const supSel = document.getElementById('arrival-supplier-name');
        if (supSel) {
            const keep = supSel.value;
            supSel.innerHTML = '<option value="">เลือก Supplier</option>' +
                (md.suppliers || []).map(i => `<option value="${arEsc(i.name)}">${arEsc(i.name)}</option>`).join('');
            npSetSelectValue('arrival-supplier-name', keep);
        }
        npRenderPills('arrival-type-pills', 'arrival-type-name', md.productTypes);
        npRenderPills('arrival-condition-pills', 'arrival-condition-name', md.productConditions);
        npRenderSwatches('arrival-color-swatches', 'arrival-color-name', md.productColors);
        npRenderPills('arrival-capacity-pills', 'arrival-capacity-name', md.productCapacities);
        npRenderPills('arrival-unit-pills', 'arrival-unit-name', md.productUnits);

        npSetPillValue('arrival-type-pills', 'arrival-type-name', keepPicked['arrival-type-name'] || '');
        npSetPillValue('arrival-condition-pills', 'arrival-condition-name', keepPicked['arrival-condition-name'] || '');
        npSetSwatchValue('arrival-color-swatches', 'arrival-color-name', keepPicked['arrival-color-name'] || '');
        npSetPillValue('arrival-capacity-pills', 'arrival-capacity-name', keepPicked['arrival-capacity-name'] || '');
        npSetPillValue('arrival-unit-pills', 'arrival-unit-name', keepPicked['arrival-unit-name'] || '');
    };

    // ---------- การ์ด "รายการแจ้งล่าสุดของฉัน" ----------
    const NP_STATUS = {
        'รอดำเนินการ': { bg: 'bg-orange-500/[0.12]', text: 'text-orange-400' },
        'อนุมัติแล้ว': { bg: 'bg-[#42A231]/[0.12]', text: 'text-[#20D500]' },
        'ปฏิเสธ': { bg: 'bg-[#FE0000]/[0.12]', text: 'text-[#FE0000]' }
    };

    const npInfoRow = (label, value, extra = '') => value
        ? `<p class="text-xs text-white/70">${arEsc(label)} : ${extra}<span class="text-white">${arEsc(value)}</span></p>`
        : '';

    window.renderMyArrivalReports = (list) => {
        const box = document.getElementById('my-arrival-reports');
        if (!box) return;

        if (!list || !list.length) {
            box.innerHTML = '<p class="py-10 text-center text-white/50 italic text-sm">ยังไม่มีรายการแจ้งของคุณ</p>';
            return;
        }

        box.innerHTML = list.map(item => {
            const imeis = item.imeis || [];
            const shown = imeis.slice(0, 4);
            const rest = imeis.length - shown.length;
            const tone = NP_STATUS[item.status] || NP_STATUS['รอดำเนินการ'];
            // แก้ไข/ลบ ได้เฉพาะรายการที่ยังรอดำเนินการ (ตรงกับที่ฝั่งเซิร์ฟเวอร์บังคับไว้)
            const editable = item.status === 'รอดำเนินการ';

            const colorDot = item.color_name && typeof window.productColorDot === 'function'
                ? window.productColorDot(item.color_name, null)
                : '';

            return `
            <div class="bg-[#27272A] border border-[#3F3F46] rounded-xl p-4">
                <div class="flex items-start justify-between gap-2">
                    <h4 class="text-base font-semibold text-white truncate" title="${arEsc(item.product_name)}">${arEsc(item.product_name)}</h4>
                    <span class="px-2 py-0.5 rounded-[0.375rem] text-[10px] font-medium shrink-0 ${tone.bg} ${tone.text}">${arEsc(item.status)}</span>
                </div>
                <div class="mt-2 space-y-1">
                    ${npInfoRow('ประเภทสินค้า', item.type_name)}
                    ${npInfoRow('สภาพ', item.condition_name)}
                    ${item.color_name ? `<p class="text-xs text-white/70 flex items-center gap-1.5">
                        <span>สี :</span>
                        <span class="w-4 h-4 rounded-full shrink-0 ring-1 ring-white/25 flex items-center justify-center">${colorDot}</span>
                        <span class="text-white">${arEsc(item.color_name)}</span>
                    </p>` : ''}
                    ${npInfoRow('ความจุ', item.capacity_name)}
                    ${npInfoRow('Supplier / แหล่งที่มา', item.supplier_name)}
                    ${npInfoRow('หน่วยนับ', item.unit_name)}
                    ${npInfoRow('หมายเหตุ', item.notes)}
                </div>
                ${imeis.length ? `
                <p class="text-xs text-white/70 mt-3">เลข IMEI :</p>
                <div class="mt-1.5 grid grid-cols-2 gap-1.5">
                    ${shown.map(i => `<span class="px-2 py-1 rounded-[0.375rem] bg-[#18181B] border border-[#3F3F46] text-[11px] font-mono text-white text-center truncate">${arEsc(i)}</span>`).join('')}
                </div>
                ${rest > 0 ? `
                <details class="mt-1.5 group">
                    <summary class="text-[11px] text-white/70 hover:text-white cursor-pointer list-none flex items-center justify-center gap-1">
                        เพิ่มเติม ... <i class="fa-solid fa-chevron-down text-[9px] group-open:rotate-180 transition-transform"></i>
                    </summary>
                    <div class="mt-1.5 grid grid-cols-2 gap-1.5">
                        ${imeis.slice(4).map(i => `<span class="px-2 py-1 rounded-[0.375rem] bg-[#18181B] border border-[#3F3F46] text-[11px] font-mono text-white text-center truncate">${arEsc(i)}</span>`).join('')}
                    </div>
                </details>` : ''}` : ''}
                ${editable ? `
                <div class="flex items-center justify-end gap-2 mt-3 pt-3 border-t border-[#3F3F46]">
                    <button type="button" class="btn-edit-notif px-3 py-1.5 rounded-[0.375rem] bg-[#FF9F0A]/[0.12] border border-[#FF9F0A]/40 text-[#FF9F0A] hover:bg-[#FF9F0A]/20 text-xs font-medium transition-colors inline-flex items-center gap-1.5 cursor-pointer"
                        data-id="${arEsc(item._id)}" aria-label="แก้ไขรายการแจ้ง ${arEsc(item.product_name)}">
                        <i class="fa-solid fa-pen-to-square"></i> แก้ไข
                    </button>
                    <button type="button" class="btn-delete-notif px-3 py-1.5 rounded-[0.375rem] bg-[#FE0000]/[0.12] border border-[#FE0000]/40 text-[#FF6B6B] hover:bg-[#FE0000]/20 text-xs font-medium transition-colors inline-flex items-center gap-1.5 cursor-pointer"
                        data-id="${arEsc(item._id)}" data-name="${arEsc(item.product_name)}"
                        aria-label="ลบรายการแจ้ง ${arEsc(item.product_name)}">
                        <i class="fa-solid fa-trash"></i> ลบ
                    </button>
                </div>` : ''}
            </div>`;
        }).join('');

        const byId = (id) => list.find(x => String(x._id) === String(id));
        box.querySelectorAll('.btn-edit-notif').forEach(b =>
            b.addEventListener('click', () => { const it = byId(b.dataset.id); if (it) npStartEdit(it); }));
        box.querySelectorAll('.btn-delete-notif').forEach(b =>
            b.addEventListener('click', () => npDeleteNotif(b.dataset.id, b.dataset.name)));
    };

    // ---------- แก้ไข / ลบ ----------
    let _npEditingId = null;

    const npSetSubmitLabel = () => {
        const t = document.getElementById('btn-submit-arrival-text');
        if (t) t.textContent = _npEditingId ? 'บันทึกการแก้ไข' : 'แจ้งสินค้าถึงสาขา';
        const c = document.getElementById('btn-cancel-arrival-edit');
        if (c) c.classList.toggle('hidden', !_npEditingId);
        const banner = document.getElementById('arrival-edit-banner');
        if (banner) banner.classList.toggle('hidden', !_npEditingId);
    };

    const npStartEdit = async (item) => {
        _npEditingId = item._id;
        // ต้องมั่นใจว่าตัวเลือกทั้งหมดถูกเรนเดอร์แล้ว ไม่งั้นจะเห็นแต่ค่าเดิมและเลือกอย่างอื่นไม่ได้
        if (typeof window.ensureMasterDataLoaded === 'function') await window.ensureMasterDataLoaded();
        window.npResetPickers();          // ล้างก่อน ไม่งั้น ghost pill ของรายการที่แก้ก่อนหน้าจะค้าง
        window.populateArrivalPickers();
        window.npBindScrollButtons();
        const set = (id, v) => { const el = document.getElementById(id); if (el) el.value = v || ''; };

        npSetSelectValue('arrival-product-name', item.product_name || '');
        set('arrival-imeis', (item.imeis || []).join('\n'));
        set('arrival-notes', item.notes);
        npSetPillValue('arrival-type-pills', 'arrival-type-name', item.type_name || '');
        npSetPillValue('arrival-condition-pills', 'arrival-condition-name', item.condition_name || '');
        npSetSwatchValue('arrival-color-swatches', 'arrival-color-name', item.color_name || '');
        npSetPillValue('arrival-capacity-pills', 'arrival-capacity-name', item.capacity_name || '');
        npSetSelectValue('arrival-supplier-name', item.supplier_name || '');
        npSetPillValue('arrival-unit-pills', 'arrival-unit-name', item.unit_name || '');
        npSetSubmitLabel();
        const imeiEl = document.getElementById('arrival-imeis');
        if (imeiEl) imeiEl.dispatchEvent(new Event('input', { bubbles: true }));
        const card = document.querySelector('#modal-nonpo-arrival .modal-content');
        if (card) card.scrollTo({ top: 0, behavior: 'smooth' });
        showToast(`กำลังแก้ไขรายการ "${item.product_name}"`);
    };

    window.npCancelEdit = () => { _npEditingId = null; npSetSubmitLabel(); };

    // ออกจากโหมดแก้ไขแล้วล้างฟอร์ม กลับไปเป็นการแจ้งรายการใหม่
    window.npExitEditAndClear = () => {
        window.npCancelEdit();
        ['arrival-product-name', 'arrival-imeis', 'arrival-notes'].forEach(id => {
            const el = document.getElementById(id);
            if (el) el.value = '';
        });
        window.npResetPickers();
        const imeiEl = document.getElementById('arrival-imeis');
        if (imeiEl) imeiEl.dispatchEvent(new Event('input', { bubbles: true }));
    };

    // ล้างค่าที่เลือกไว้ในกลุ่ม pill และจานสี หลังส่งฟอร์มสำเร็จ
    window.npResetPickers = () => {
        npSetPillValue('arrival-type-pills', 'arrival-type-name', '');
        npSetPillValue('arrival-condition-pills', 'arrival-condition-name', '');
        npSetSwatchValue('arrival-color-swatches', 'arrival-color-name', '');
        npSetPillValue('arrival-capacity-pills', 'arrival-capacity-name', '');
        npSetSelectValue('arrival-supplier-name', '');
        npSetPillValue('arrival-unit-pills', 'arrival-unit-name', '');
    };
    window.npGetEditingId = () => _npEditingId;

    const npDeleteNotif = (id, name) => {
        showConfirm('ลบรายการแจ้งสินค้า',
            `ต้องการลบรายการแจ้ง <strong class="text-white">${arEsc(name || '')}</strong> ใช่หรือไม่<br><span class="text-xs text-white/70">ลบได้เฉพาะรายการที่ยังไม่ถูกอนุมัติ และย้อนกลับไม่ได้</span>`,
            async () => {
                try {
                    const res = await authFetch(`${API_BASE_URL}/import-notifications/${id}`, { method: 'DELETE' });
                    const json = await res.json();
                    if (json.success) {
                        showToast('ลบรายการแจ้งสำเร็จ');
                        if (_npEditingId === id) window.npCancelEdit();
                        if (typeof window.loadMyArrivalReports === 'function') window.loadMyArrivalReports();
                    } else {
                        showToast(json.message || 'ลบรายการแจ้งไม่สำเร็จ', 'error');
                    }
                } catch (err) {
                    console.error(err);
                    showToast('เชื่อมต่อเซิร์ฟเวอร์ไม่สำเร็จ', 'error');
                }
            }, 'ลบรายการ', 'danger');
    };

    // ปุ่มเลื่อนกลุ่ม pill (ผูกครั้งเดียวตอนโหลดหน้า)
    const npBindScrollButtons = () => {
        document.querySelectorAll('.arrival-pill-scroll').forEach(btn => {
            if (btn.dataset.bound) return;
            btn.dataset.bound = '1';
            btn.addEventListener('click', () => {
                const box = document.getElementById(btn.dataset.scroll);
                if (box) box.scrollBy({ left: 150 * Number(btn.dataset.dir || 1), behavior: 'smooth' });
            });
        });
    };
    window.npBindScrollButtons = npBindScrollButtons;

    // ==========================================
    // Connected PO Workflow: ตรวจสอบนำเข้า (Stock Manager / Approver)
    // เดินตามแบบแปลนหน้า #stock ใน DESIGN.md ข้อ 11.5 - 11.7
    // ==========================================
    const AI_COLS = { po: 5, nonpo: 6, histPo: 5, histNonPo: 6, histDirect: 7 };

    const aiEsc = (s) => String(s == null ? '' : s)
        .replace(/&/g, '&amp;').replace(/</g, '&lt;').replace(/>/g, '&gt;')
        .replace(/"/g, '&quot;').replace(/'/g, '&#39;');
    const aiBaht = (n) => `฿${Number(n || 0).toLocaleString('th-TH', { maximumFractionDigits: 0 })}`;
    const aiDate = (d) => d ? new Date(d).toLocaleDateString('th-TH',
        { day: 'numeric', month: 'short', year: 'numeric' }) : '-';
    const aiDateTime = (d) => d ? new Date(d).toLocaleString('th-TH',
        { day: 'numeric', month: 'short', year: 'numeric', hour: '2-digit', minute: '2-digit' }) : '-';

    const aiStateRow = (cols, msg, cls = 'text-white/50 italic') =>
        `<tr><td colspan="${cols}" class="px-6 py-8 text-center ${cls}">${aiEsc(msg)}</td></tr>`;

    // แถวโครงร่างระหว่างรอข้อมูล — ต้องเรียกก่อน await เสมอ (ข้อ 11.7)
    const aiSkeleton = (tbody, cols, rows = 4) => {
        if (!tbody) return;
        const bar = (w) => `<div class="h-3.5 ${w} rounded-full bg-[#5c5c5c] animate-pulse"></div>`;
        tbody.innerHTML = Array.from({ length: rows }).map(() =>
            `<tr>${Array.from({ length: cols }).map(() =>
                `<td class="px-6 py-4">${bar('w-full')}</td>`).join('')}</tr>`).join('');
    };

    // เซลล์สองบรรทัด (สูตร "ชื่อ + คำบรรยาย" ข้อ 11.6) ใช้ยุบคอลัมน์ที่เคยแยกกัน
    const aiTwoLine = (main, sub) => `
        <div>
            <p class="font-medium text-white">${main}</p>
            <p class="text-xs text-white/70 mt-0.5">${sub}</p>
        </div>`;

    const aiSetCount = (id, shown, total) => {
        const el = document.getElementById(id);
        if (!el) return;
        el.textContent = total ? `แสดง ${shown} จาก ${total} รายการ` : '';
    };

    // สรุปยอดของใบสั่งซื้อหนึ่งใบ (สแกนแล้ว/สั่งไป และมูลค่ารวม)
    const aiPoTotals = (po) => {
        let ordered = 0, scanned = 0, total = 0;
        (po.items || []).forEach(item => {
            ordered += item.ordered_qty || 0;
            scanned += item.received_qty || 0;
            total += (item.cost_price || 0) * (item.ordered_qty || 0);
        });
        return { ordered, scanned, total: po.grand_total || total };
    };

    // ตัวเลข "สแกนแล้ว x / y" — ครบแล้วเป็นเขียว ยังไม่ครบเป็นส้ม (โทนตามข้อ 11.6)
    const aiScanCell = (scanned, ordered) => {
        const done = ordered > 0 && scanned >= ordered;
        const color = done ? 'text-[#20D500]' : 'text-orange-400';
        return `<span class="font-mono font-medium ${color}">${scanned}</span>`
            + `<span class="text-white/70 font-mono"> / ${ordered}</span>`;
    };

    const loadApprovePOs = async () => {
        const tbody = document.getElementById('table-body-approve-po');
        const badgeCount = document.getElementById('po-approve-pending-count');
        if (!tbody) return;
        aiSkeleton(tbody, AI_COLS.po);

        try {
            const res = await authFetch(`${API_BASE_URL}/purchase-orders`);
            const json = await res.json();
            if (!json.success) {
                tbody.innerHTML = aiStateRow(AI_COLS.po, json.message || 'ดึงข้อมูลใบสั่งซื้อไม่สำเร็จ', 'text-red-400');
                aiSetCount('approve-po-result-count', 0, 0);
                return;
            }

            // เฉพาะใบที่สแกนรับของครบแล้วและรออนุมัตินำเข้าคลัง
            const pending = json.data.filter(po => po.status === 'กำลังตรวจรับ');

            if (badgeCount) {
                badgeCount.textContent = pending.length;
                badgeCount.classList.toggle('hidden', pending.length === 0);
            }
            aiSetCount('approve-po-result-count', pending.length, pending.length);

            if (!pending.length) {
                tbody.innerHTML = aiStateRow(AI_COLS.po, 'ไม่มีใบสั่งซื้อที่รออนุมัตินำเข้าคลังในขณะนี้');
                return;
            }

            tbody.innerHTML = pending.map(po => {
                const t = aiPoTotals(po);
                const branchName = po.branch_id ? po.branch_id.name : '-';
                return `
                <tr class="hover:bg-[#464646] transition-colors">
                    <td class="px-6 py-4">
                        <p class="font-mono font-semibold text-[#FFE169]">${aiEsc(po.po_number)}</p>
                        <p class="text-xs text-white/70 mt-0.5">สร้างเมื่อ ${aiDate(po.createdAt)}</p>
                    </td>
                    <td class="px-6 py-4">${aiTwoLine(aiEsc(po.supplier_name), aiEsc(branchName))}</td>
                    <td class="px-6 py-4 text-center">${aiScanCell(t.scanned, t.ordered)}</td>
                    <td class="px-6 py-4 text-right text-white font-mono">${aiBaht(t.total)}</td>
                    <td class="px-6 py-4 text-right">
                        <button type="button" class="btn-finalize-import px-3 py-1.5 bg-[#FFE169] hover:bg-[#E2B93C] text-[#333333] font-semibold rounded-[0.375rem] text-xs transition-colors inline-flex items-center gap-1.5 cursor-pointer"
                            data-id="${aiEsc(po._id)}">
                            <i class="fa-solid fa-clipboard-check"></i> อนุมัตินำเข้าสต็อก
                        </button>
                    </td>
                </tr>`;
            }).join('');

            // การกระทำที่ย้อนไม่ได้ ต้องผ่าน showConfirm() ก่อนยิง API (ข้อ 11.6)
            tbody.querySelectorAll('.btn-finalize-import').forEach(btn => {
                btn.addEventListener('click', () => {
                    const poId = btn.dataset.id;
                    const original = btn.innerHTML;
                    showConfirm('ยืนยันนำเข้าสินค้า', 'ยืนยันนำเข้าสินค้าใบสั่งซื้อนี้เข้าสต็อกสาขา?', async () => {
                        try {
                            btn.disabled = true;
                            btn.innerHTML = '<i class="fa-solid fa-spinner fa-spin"></i> กำลังอนุมัติ...';
                            const finalRes = await authFetch(`${API_BASE_URL}/po/${poId}/finalize-import`, { method: 'POST' });
                            const finalJson = await finalRes.json();
                            if (finalJson.success) {
                                showToast('อนุมัตินำเข้าสต็อกสำเร็จ! เพิ่มยอดสินค้าสั่งซื้อเข้าคลังสาขาเรียบร้อยแล้ว', 'success');
                                loadApprovePOs();
                                if (typeof fetchProducts === 'function') fetchProducts();
                                if (typeof loadDashboardData === 'function') loadDashboardData();
                            } else {
                                showToast(finalJson.message || 'เกิดข้อผิดพลาดในการอนุมัติ', 'error');
                                btn.disabled = false;
                                btn.innerHTML = original;
                            }
                        } catch (err) {
                            console.error(err);
                            showToast(err.message || 'เกิดข้อผิดพลาดในการทำรายการอนุมัติ', 'error');
                            btn.disabled = false;
                            btn.innerHTML = original;
                        }
                    });
                });
            });

        } catch (e) {
            console.error(e);
            tbody.innerHTML = aiStateRow(AI_COLS.po, 'เกิดข้อผิดพลาดในการโหลดข้อมูล', 'text-red-400');
            aiSetCount('approve-po-result-count', 0, 0);
        }
    };
    window.loadApprovePOs = loadApprovePOs;

    const loadApproveHistory = async () => {
        const tbodyPo = document.getElementById('table-body-history-po');
        const tbodyNonPo = document.getElementById('table-body-history-nonpo');
        const tbodyDirect = document.getElementById('table-body-history-direct-imports');
        const filterBranch = document.getElementById('approve-import-filter-branch');
        const selectedBranchId = filterBranch ? filterBranch.value : '';

        aiSkeleton(tbodyPo, AI_COLS.histPo);
        aiSkeleton(tbodyNonPo, AI_COLS.histNonPo);
        aiSkeleton(tbodyDirect, AI_COLS.histDirect);

        // ---------- ประวัติอนุมัติ PO ----------
        try {
            const res = await authFetch(`${API_BASE_URL}/purchase-orders`);
            const json = await res.json();
            if (json.success && tbodyPo) {
                const all = json.data.filter(po => po.status === 'นำเข้าสำเร็จ');
                const rows = selectedBranchId
                    ? all.filter(po => po.branch_id && (po.branch_id._id === selectedBranchId || po.branch_id === selectedBranchId))
                    : all;
                aiSetCount('history-po-result-count', rows.length, all.length);

                tbodyPo.innerHTML = rows.length ? rows.map(po => {
                    const t = aiPoTotals(po);
                    return `
                    <tr class="hover:bg-[#464646] transition-colors">
                        <td class="px-6 py-4">
                            <p class="font-mono font-semibold text-[#FFE169]">${aiEsc(po.po_number)}</p>
                            <p class="text-xs text-white/70 mt-0.5">${aiDateTime(po.updatedAt)}</p>
                        </td>
                        <td class="px-6 py-4">${aiTwoLine(aiEsc(po.supplier_name), aiEsc(po.branch_id ? po.branch_id.name : '-'))}</td>
                        <td class="px-6 py-4 text-center">${aiScanCell(t.scanned, t.ordered)}</td>
                        <td class="px-6 py-4 text-right text-white font-mono">${aiBaht(t.total)}</td>
                        <td class="px-6 py-4 text-white">${aiEsc(po.received_by ? po.received_by.name : '-')}</td>
                    </tr>`;
                }).join('') : aiStateRow(AI_COLS.histPo,
                    all.length ? 'ไม่มีประวัติของสาขาที่เลือก' : 'ยังไม่มีประวัติการอนุมัติ PO');
            }
        } catch (err) {
            console.error('Error loading PO history:', err);
            if (tbodyPo) tbodyPo.innerHTML = aiStateRow(AI_COLS.histPo, 'เกิดข้อผิดพลาดในการโหลดประวัติ PO', 'text-red-400');
            aiSetCount('history-po-result-count', 0, 0);
        }

        // ---------- ประวัติอนุมัติสินค้านอกระบบ PO ----------
        try {
            let url = `${API_BASE_URL}/import-notifications?status=อนุมัติแล้ว`;
            if (selectedBranchId) url += `&branch_id=${selectedBranchId}`;
            const res = await authFetch(url);
            const json = await res.json();
            if (json.success && tbodyNonPo) {
                const rows = json.data || [];
                aiSetCount('history-nonpo-result-count', rows.length, rows.length);

                tbodyNonPo.innerHTML = rows.length ? rows.map(item => `
                    <tr class="hover:bg-[#464646] transition-colors">
                        <td class="px-6 py-4 text-white font-medium">${aiEsc(item.product_name)}</td>
                        <td class="px-6 py-4">${aiTwoLine(
                    aiEsc(item.branch_id ? item.branch_id.name : '-'),
                    aiEsc(item.reported_by ? item.reported_by.name : '-'))}</td>
                        <td class="px-6 py-4 text-white">${aiDateTime(item.approved_at)}</td>
                        <td class="px-6 py-4 text-center text-white font-mono">${item.imeis ? item.imeis.length : 0}</td>
                        <td class="px-6 py-4 text-white">${aiEsc(item.approved_by ? item.approved_by.name : '-')}</td>
                        <td class="px-6 py-4 text-white/70">${item.notes ? aiEsc(item.notes) : '<span class="text-white/50">-</span>'}</td>
                    </tr>`).join('') : aiStateRow(AI_COLS.histNonPo, 'ยังไม่มีประวัติการอนุมัติสินค้านอกระบบ PO');
            }
        } catch (err) {
            console.error('Error loading Non-PO history:', err);
            if (tbodyNonPo) tbodyNonPo.innerHTML = aiStateRow(AI_COLS.histNonPo, 'เกิดข้อผิดพลาดในการโหลดประวัติสินค้านอกระบบ PO', 'text-red-400');
            aiSetCount('history-nonpo-result-count', 0, 0);
        }

        // ---------- ประวัตินำเข้าคลังโดยตรง ----------
        try {
            const res = await authFetch(`${API_BASE_URL}/products/direct-imports-history`);
            const json = await res.json();
            if (json.success && tbodyDirect) {
                const all = json.data || [];
                const rows = selectedBranchId
                    ? all.filter(log => log.details && log.details.branch_id === selectedBranchId)
                    : all;
                aiSetCount('history-direct-result-count', rows.length, all.length);

                tbodyDirect.innerHTML = rows.length ? rows.map(log => {
                    const d = log.details || {};
                    const isExcel = d.import_source === 'EXCEL';
                    // ป้ายประเภทใช้จุดสี + tint 12% เหมือนป้ายสถานะอื่นทั้งระบบ (ข้อ 11.6)
                    const typeBadge = isExcel
                        ? `<div class="inline-flex items-center gap-2 px-2.5 py-1 rounded-[0.375rem] bg-[#42A231]/[0.12]">
                               <div class="w-2 h-2 rounded-full bg-[#20D500]"></div>
                               <span class="text-[#20D500] font-medium text-xs">Excel</span></div>`
                        : `<div class="inline-flex items-center gap-2 px-2.5 py-1 rounded-[0.375rem] bg-[#4D4D4D]/40">
                               <div class="w-2 h-2 rounded-full bg-white/40"></div>
                               <span class="text-white/70 font-medium text-xs">คลังปกติ</span></div>`;

                    const imeis = Array.isArray(d.imeis) ? d.imeis : [];
                    const imeiCell = imeis.length
                        ? `<span class="font-mono text-xs text-white/70 block max-w-[220px] truncate"
                                 title="${aiEsc(imeis.join(', '))}">${aiEsc(imeis.join(', '))}</span>`
                        : '<span class="text-white/50">-</span>';

                    return `
                    <tr class="hover:bg-[#464646] transition-colors">
                        <td class="px-6 py-4">${aiTwoLine(
                        aiEsc(d.product_name || '-'),
                        `<span class="font-mono">${aiEsc(d.product_code || '-')}</span>`)}</td>
                        <td class="px-6 py-4">${typeBadge}</td>
                        <td class="px-6 py-4 text-white">${aiEsc(d.branch_name || '-')}</td>
                        <td class="px-6 py-4 text-white">${aiDateTime(log.createdAt)}</td>
                        <td class="px-6 py-4 text-center text-white font-mono">${d.quantity || 0}</td>
                        <td class="px-6 py-4 text-white">${aiEsc(log.user_name || '-')}</td>
                        <td class="px-6 py-4">${imeiCell}</td>
                    </tr>`;
                }).join('') : aiStateRow(AI_COLS.histDirect,
                    all.length ? 'ไม่มีประวัติของสาขาที่เลือก' : 'ยังไม่มีประวัติการนำเข้าคลังโดยตรง');
            }
        } catch (err) {
            console.error('Error loading Direct Imports history:', err);
            if (tbodyDirect) tbodyDirect.innerHTML = aiStateRow(AI_COLS.histDirect, 'เกิดข้อผิดพลาดในการโหลดประวัติการนำเข้าโดยตรง', 'text-red-400');
            aiSetCount('history-direct-result-count', 0, 0);
        }
    };
    window.loadApproveHistory = loadApproveHistory;

    // Tab toggle logic inside ตรวจสอบนำเข้าสินค้า (Approve Import)
    // แท็บที่เลือกอยู่คือปุ่มทึบเหลืองปุ่มเดียวของหน้านี้ (DESIGN.md ข้อ 6) ที่เหลือเป็นปุ่มขอบ
    const tabBtnApprovePO = document.getElementById('tab-btn-approve-po');
    const tabBtnApproveNonPO = document.getElementById('tab-btn-approve-nonpo');
    const tabBtnApproveHistory = document.getElementById('tab-btn-approve-history');
    const tabContentApprovePO = document.getElementById('tab-content-approve-po');
    const tabContentApproveNonPO = document.getElementById('tab-content-approve-nonpo');
    const tabContentApproveHistory = document.getElementById('tab-content-approve-history');

    if (tabBtnApprovePO && tabBtnApproveNonPO && tabBtnApproveHistory
        && tabContentApprovePO && tabContentApproveNonPO && tabContentApproveHistory) {

        const TAB_BASE = 'px-4 py-2.5 rounded-xl text-sm font-bold border transition-colors flex items-center gap-2 cursor-pointer';
        const TAB_ON = 'bg-[#FFE169] text-[#333333] border-[#FFE169]';
        const TAB_OFF = 'bg-[#27272A] text-slate-300 border-[#3F3F46] hover:border-[#FFE169] hover:text-white';

        // ป้ายตัวเลขบนแท็บต้องอ่านออกทั้งตอนพื้นเหลืองและพื้นเข้ม จึงสลับสีตามสถานะแท็บด้วย
        const BADGE_ON = 'px-2 py-0.5 rounded-full text-[10px] font-bold bg-[#333333]/20';
        const BADGE_OFF_PO = 'px-2 py-0.5 rounded-full text-[10px] font-bold bg-[#FFE169]/20 text-[#FFE169]';
        const BADGE_OFF_NONPO = 'px-2 py-0.5 rounded-full text-[10px] font-bold bg-orange-500/[0.12] text-orange-400';

        const setBadge = (el, cls) => {
            if (!el) return;
            const hidden = el.classList.contains('hidden');
            el.className = cls + (hidden ? ' hidden' : '');
        };

        const activate = (which) => {
            const map = {
                po: tabBtnApprovePO, nonpo: tabBtnApproveNonPO, history: tabBtnApproveHistory
            };
            Object.entries(map).forEach(([key, btn]) => {
                const on = key === which;
                btn.className = `${TAB_BASE} ${on ? TAB_ON : TAB_OFF}`;
                btn.setAttribute('aria-pressed', String(on));
            });
            setBadge(document.getElementById('po-approve-pending-count'),
                which === 'po' ? BADGE_ON : BADGE_OFF_PO);
            setBadge(document.getElementById('nonpo-approve-pending-count'),
                which === 'nonpo' ? BADGE_ON : BADGE_OFF_NONPO);

            tabContentApprovePO.classList.toggle('hidden', which !== 'po');
            tabContentApproveNonPO.classList.toggle('hidden', which !== 'nonpo');
            tabContentApproveHistory.classList.toggle('hidden', which !== 'history');
        };

        tabBtnApprovePO.addEventListener('click', () => { activate('po'); loadApprovePOs(); });
        tabBtnApproveNonPO.addEventListener('click', () => {
            activate('nonpo');
            if (typeof window.loadImportNotifications === 'function') window.loadImportNotifications();
        });
        tabBtnApproveHistory.addEventListener('click', () => { activate('history'); loadApproveHistory(); });
    }

    // Refresh triggers & Navigation linkages
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
