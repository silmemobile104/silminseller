// Branch Inventory Logic (สินค้าในสาขา)
// แยกออกมาจาก script.js — โหลดแบบ dynamic เฉพาะตอนเปิดหน้า "สินค้าในสาขา" ครั้งแรกเท่านั้น
// พึ่งพา window.authFetch, window.masterDataCache, API_BASE_URL (global จาก script.js)
(function () {
    // Branch Inventory Logic (สินค้าในสาขา)
    // ==========================================
    let isBranchInventoryInitialized = false;

    window.initBranchInventory = () => {
        if (!isBranchInventoryInitialized) {
            // Setup Tabs
            const tabMyStock = document.getElementById('tab-branch-mystock');
            const tabGlobalStock = document.getElementById('tab-branch-globalstock');
            const contentMyStock = document.getElementById('content-branch-mystock');
            const contentGlobalStock = document.getElementById('content-branch-globalstock');

            const activateTab = (activeTab, inactiveTab, activeContent, inactiveContent) => {
                activeTab.classList.add('text-on-primary', 'bg-primary', 'border-transparent');
                activeTab.classList.remove('text-body-muted', 'border-hairline', 'bg-transparent', 'hover:text-ink');

                inactiveTab.classList.remove('text-on-primary', 'bg-primary', 'border-transparent');
                inactiveTab.classList.add('text-body-muted', 'border-hairline', 'bg-transparent', 'hover:text-ink');

                activeContent.classList.remove('hidden');
                inactiveContent.classList.add('hidden');
            };

            if (tabMyStock && tabGlobalStock) {
                tabMyStock.addEventListener('click', () => {
                    activateTab(tabMyStock, tabGlobalStock, contentMyStock, contentGlobalStock);
                    loadBranchInventoryMyStock();
                });
                tabGlobalStock.addEventListener('click', () => {
                    activateTab(tabGlobalStock, tabMyStock, contentGlobalStock, contentMyStock);
                    loadBranchInventoryGlobalStock();
                });
            }

            // Bind Refresh Buttons
            document.getElementById('btn-refresh-mystock')?.addEventListener('click', loadBranchInventoryMyStock);
            document.getElementById('btn-refresh-globalstock')?.addEventListener('click', loadBranchInventoryGlobalStock);

            // Populate Type Filters from master data
            const md = window.masterDataCache || {};
            const populateTypeFilter = (filterId) => {
                const filter = document.getElementById(filterId);
                if (filter && md.productTypes) {
                    filter.innerHTML = '<option value="ALL">ประเภททั้งหมด</option>';
                    md.productTypes.forEach(type => {
                        filter.innerHTML += `<option value="${type.name}">${type.name}</option>`;
                    });
                }
            };
            populateTypeFilter('filter-branch-mystock-type');
            populateTypeFilter('filter-branch-globalstock-type');

            // Bind Type Filters
            document.getElementById('filter-branch-mystock-type')?.addEventListener('change', loadBranchInventoryMyStock);
            document.getElementById('filter-branch-globalstock-type')?.addEventListener('change', loadBranchInventoryGlobalStock);

            // Bind Condition Filters
            document.getElementById('filter-branch-mystock-condition')?.addEventListener('change', loadBranchInventoryMyStock);
            document.getElementById('filter-branch-globalstock-condition')?.addEventListener('change', loadBranchInventoryGlobalStock);

            // Bind Search
            document.getElementById('search-branch-mystock')?.addEventListener('input', (e) => {
                const term = e.target.value.toLowerCase().trim();
                const tbody = document.getElementById('table-body-branch-mystock');
                if (!tbody) return;

                const allRows = Array.from(tbody.children);

                if (term === '') {
                    allRows.forEach(row => {
                        row.style.display = '';
                        if (row.classList.contains('name-row')) {
                            const icon = row.querySelector('i.fa-solid');
                            if (icon) icon.classList.replace('fa-chevron-down', 'fa-chevron-right');
                        } else {
                            row.classList.add('hidden');
                            if (row.classList.contains('color-row')) {
                                const icon = row.querySelector('i.fa-solid');
                                if (icon) icon.classList.replace('fa-chevron-down', 'fa-chevron-right');
                            }
                        }
                    });
                    return;
                }

                allRows.forEach(row => {
                    row.style.display = 'none';
                    row.classList.remove('match-row');
                });

                const parentsToShow = new Set();

                allRows.forEach(row => {
                    if (row.textContent.toLowerCase().includes(term)) {
                        row.style.display = '';
                        row.classList.remove('hidden');
                        row.classList.add('match-row');

                        row.classList.forEach(cls => {
                            if (cls.startsWith('child-of-')) {
                                parentsToShow.add(cls.replace('child-of-', ''));
                            }
                        });
                    }
                });

                allRows.forEach(row => {
                    parentsToShow.forEach(parentId => {
                        if (row.classList.contains(parentId)) {
                            row.style.display = '';
                            row.classList.remove('hidden');
                            const icon = row.querySelector('i.fa-solid');
                            if (icon && icon.classList.contains('fa-chevron-right')) {
                                icon.classList.replace('fa-chevron-right', 'fa-chevron-down');
                            }
                        }
                    });
                });
            });

            document.getElementById('search-branch-globalstock')?.addEventListener('input', (e) => {
                const term = e.target.value.toLowerCase().trim();
                const tbody = document.getElementById('table-body-branch-globalstock');
                if (!tbody) return;

                const allRows = Array.from(tbody.children);

                if (term === '') {
                    allRows.forEach(row => {
                        row.style.display = '';
                        if (row.classList.contains('name-row')) {
                            const icon = row.querySelector('i.fa-solid');
                            if (icon) icon.classList.replace('fa-chevron-down', 'fa-chevron-right');
                        } else {
                            row.classList.add('hidden');
                            if (row.classList.contains('branch-row')) {
                                const icon = row.querySelector('i.fa-solid');
                                if (icon) icon.classList.replace('fa-chevron-down', 'fa-chevron-right');
                            }
                        }
                    });
                    return;
                }

                allRows.forEach(row => {
                    row.style.display = 'none';
                    row.classList.remove('match-row');
                });

                const parentsToShow = new Set();

                allRows.forEach(row => {
                    if (row.textContent.toLowerCase().includes(term)) {
                        row.style.display = '';
                        row.classList.remove('hidden');
                        row.classList.add('match-row');

                        row.classList.forEach(cls => {
                            if (cls.startsWith('child-of-')) {
                                parentsToShow.add(cls.replace('child-of-', ''));
                            }
                        });
                    }
                });

                allRows.forEach(row => {
                    parentsToShow.forEach(parentId => {
                        if (row.classList.contains(parentId)) {
                            row.style.display = '';
                            row.classList.remove('hidden');
                            const icon = row.querySelector('i.fa-solid');
                            if (icon && icon.classList.contains('fa-chevron-right')) {
                                icon.classList.replace('fa-chevron-right', 'fa-chevron-down');
                            }
                        }
                    });
                });
            });

            isBranchInventoryInitialized = true;
        }

        // Default load My Stock
        loadBranchInventoryMyStock();
    };

    window.loadBranchInventoryMyStock = async () => {
        const tbody = document.getElementById('table-body-branch-mystock');
        if (!tbody) return;
        tbody.innerHTML = '<tr><td colspan="5" class="text-center py-8"><div class="inline-block animate-spin rounded-full h-6 w-6 border-b-2 border-primary"></div></td></tr>';

        try {
            const res = await authFetch(`${API_BASE_URL}/products`); // Normal endpoint defaults to current branch
            const data = await res.json();
            if (data.success) {
                tbody.innerHTML = '';
                // Filter only items with > 0 quantity
                let items = data.data.filter(p => Number(p.quantity || 0) > 0);

                // Apply type filter (ประเภทสินค้า)
                const typeFilter = document.getElementById('filter-branch-mystock-type')?.value || 'ALL';
                if (typeFilter !== 'ALL') {
                    items = items.filter(p => {
                        const typeName = p.type_id ? p.type_id.name : '';
                        return typeName === typeFilter;
                    });
                }

                // Apply condition filter (สภาพเครื่อง)
                const condFilter = document.getElementById('filter-branch-mystock-condition')?.value || 'ALL';
                if (condFilter !== 'ALL') {
                    items = items.filter(p => {
                        const condName = p.condition_id ? p.condition_id.name : '';
                        return condName.replace(/\s+/g, '') === condFilter.replace(/\s+/g, '');
                    });
                }

                if (items.length === 0) {
                    tbody.innerHTML = '<tr><td colspan="5" class="text-center py-6 text-body-muted">ไม่พบสินค้าคงเหลือในสาขาของคุณ</td></tr>';
                    return;
                }

                const groupedData = {};

                items.forEach(p => {
                    const imeiCount = (p.imeis && p.imeis.length) ? p.imeis.length : 0;
                    const qty = imeiCount > 0 ? imeiCount : (p.quantity || 0);

                    if (qty <= 0) return;

                    const name = p.name || 'ไม่ระบุชื่อ';
                    const color = (p.color_id && p.color_id.name) ? p.color_id.name : 'ไม่ระบุสี';
                    const unit = (p.unit_id && p.unit_id.name) ? p.unit_id.name : 'ชิ้น';

                    if (!groupedData[name]) groupedData[name] = { total: 0, colors: {}, unit: unit };
                    groupedData[name].total += qty;
                    groupedData[name].unit = unit;

                    if (!groupedData[name].colors[color]) groupedData[name].colors[color] = { total: 0, items: [], unit: unit };
                    groupedData[name].colors[color].total += qty;
                    groupedData[name].colors[color].unit = unit;

                    groupedData[name].colors[color].items.push({
                        ...p,
                        qtyToDisplay: qty,
                        unit: unit
                    });
                });

                let nameIndex = 0;
                for (const [name, nameGroup] of Object.entries(groupedData)) {
                    nameIndex++;
                    const nameRowId = `mystock-group-${nameIndex}`;

                    const trName = document.createElement('tr');
                    trName.className = `name-row ${nameRowId} bg-canvas-elevated hover:bg-surface-chip/40 transition-colors cursor-pointer border-l-4 border-primary`;
                    trName.onclick = () => {
                        const icon = document.getElementById(`icon-${nameRowId}`);
                        const isExpanded = icon.classList.contains('fa-chevron-down');

                        if (isExpanded) {
                            icon.classList.remove('fa-chevron-down');
                            icon.classList.add('fa-chevron-right');
                            document.querySelectorAll(`.child-of-${nameRowId}`).forEach(c => {
                                c.classList.add('hidden');
                            });
                            document.querySelectorAll(`.color-icon-of-${nameRowId}`).forEach(i => {
                                i.classList.remove('fa-chevron-down');
                                i.classList.add('fa-chevron-right');
                            });
                        } else {
                            icon.classList.remove('fa-chevron-right');
                            icon.classList.add('fa-chevron-down');
                            document.querySelectorAll(`.level2-of-${nameRowId}`).forEach(c => c.classList.remove('hidden'));
                        }
                    };
                    trName.innerHTML = `
                        <td class="px-3 py-4 md:px-6">
                            <div class="flex items-center gap-2 md:gap-3">
                                <i id="icon-${nameRowId}" class="fa-solid fa-chevron-right text-body-muted w-4 text-center shrink-0"></i>
                                <span class="font-bold text-ink text-base">${name}</span>
                            </div>
                        </td>
                        <td class="px-3 py-4 md:px-6 text-center whitespace-nowrap">
                            <span class="bg-surface-chip text-ink border border-hairline px-3 py-1 rounded-pill font-bold text-sm whitespace-nowrap">
                                ${nameGroup.total} ${nameGroup.unit || 'ชิ้น'}
                            </span>
                        </td>
                        <td class="px-3 py-4 md:px-6 text-right"></td>
                    `;
                    tbody.appendChild(trName);

                    let colorIndex = 0;
                    for (const [color, colorGroup] of Object.entries(nameGroup.colors)) {
                        colorIndex++;
                        const colorRowId = `${nameRowId}-color-${colorIndex}`;

                        const trColor = document.createElement('tr');
                        trColor.className = `color-row ${colorRowId} hidden child-of-${nameRowId} level2-of-${nameRowId} bg-surface-tile-3 hover:bg-surface-chip/30 transition-colors cursor-pointer border-l-4 border-hairline`;
                        trColor.onclick = (e) => {
                            e.stopPropagation();
                            const icon = document.getElementById(`icon-${colorRowId}`);
                            const isExpanded = icon.classList.contains('fa-chevron-down');

                            const itemsLevel = document.querySelectorAll(`.child-of-${colorRowId}`);
                            if (isExpanded) {
                                icon.classList.remove('fa-chevron-down');
                                icon.classList.add('fa-chevron-right');
                                itemsLevel.forEach(c => c.classList.add('hidden'));
                            } else {
                                icon.classList.remove('fa-chevron-right');
                                icon.classList.add('fa-chevron-down');
                                itemsLevel.forEach(c => c.classList.remove('hidden'));
                            }
                        };
                        trColor.innerHTML = `
                            <td class="px-3 py-3 md:px-6 pl-8 md:pl-12">
                                <div class="flex items-center gap-2">
                                    <i id="icon-${colorRowId}" class="fa-solid fa-chevron-right text-body-muted w-4 text-center text-xs color-icon-of-${nameRowId} shrink-0"></i>
                                    <span class="font-bold text-ink text-sm">สี: ${color}</span>
                                </div>
                            </td>
                            <td class="px-3 py-3 md:px-6 text-center whitespace-nowrap">
                                <span class="text-body-muted font-bold text-sm whitespace-nowrap">${colorGroup.total} ${colorGroup.unit || 'ชิ้น'}</span>
                            </td>
                            <td class="px-3 py-3 md:px-6"></td>
                        `;
                        tbody.appendChild(trColor);

                        colorGroup.items.forEach(p => {
                            const capacity = (p.capacity_id && p.capacity_id.name) ? p.capacity_id.name : 'ไม่ระบุความจุ';
                            const condition = (p.condition_id && p.condition_id.name) ? p.condition_id.name : '';
                            const trItem = document.createElement('tr');
                            trItem.className = `item-row hidden child-of-${nameRowId} child-of-${colorRowId} hover:bg-surface-chip/40 transition-colors border-l-4 border-hairline`;
                            trItem.innerHTML = `
                                <td class="px-3 py-3 md:px-6 pl-14 md:pl-20">
                                    <div class="flex flex-col">
                                        <span class="text-sm text-body-muted">ความจุ: <span class="font-bold text-ink">${capacity}</span> ${condition ? `/ ${condition}` : ''}</span>
                                        <span class="text-xs text-ink-muted-48 font-mono mt-0.5">รหัส: ${p.product_code || '-'}</span>
                                    </div>
                                </td>
                                <td class="px-3 py-3 md:px-6 text-center whitespace-nowrap">
                                    <span class="text-sm text-ink font-bold whitespace-nowrap">${p.qtyToDisplay} ${p.unit || 'ชิ้น'}</span>
                                    ${p.is_transferring ? '<span class="text-[10px] bg-amber-500/20 text-amber-400 px-1 rounded ml-1 mt-1 block whitespace-nowrap">กำลังโอน</span>' : ''}
                                </td>
                                <td class="px-3 py-3 md:px-6 text-right whitespace-nowrap">
                                    <span class="text-sm text-ink font-mono font-bold whitespace-nowrap">฿${(p.selling_price || 0).toLocaleString()}</span>
                                </td>
                            `;
                            tbody.appendChild(trItem);
                        });
                    }
                }
            }
        } catch (err) {
            console.error(err);
            tbody.innerHTML = '<tr><td colspan="5" class="text-center py-4 text-red-400">เกิดข้อผิดพลาดในการโหลดข้อมูล</td></tr>';
        }
    };

    window.loadBranchInventoryGlobalStock = async () => {
        const tbody = document.getElementById('table-body-branch-globalstock');
        if (!tbody) return;
        tbody.innerHTML = '<tr><td colspan="4" class="text-center py-8"><div class="inline-block animate-spin rounded-full h-6 w-6 border-b-2 border-primary"></div></td></tr>';

        try {
            const res = await authFetch(`${API_BASE_URL}/products/global-stock`);
            const data = await res.json();
            if (data.success) {
                tbody.innerHTML = '';
                let items = data.data.filter(p => Number(p.global_total_quantity || 0) > 0);

                // Apply type filter (ประเภทสินค้า)
                const typeFilter = document.getElementById('filter-branch-globalstock-type')?.value || 'ALL';
                if (typeFilter !== 'ALL') {
                    items = items.filter(p => {
                        const typeName = p.type_id ? p.type_id.name : '';
                        return typeName === typeFilter;
                    });
                }

                // Apply condition filter (สภาพเครื่อง)
                const condFilter = document.getElementById('filter-branch-globalstock-condition')?.value || 'ALL';
                if (condFilter !== 'ALL') {
                    items = items.filter(p => {
                        const condName = p.condition_id ? p.condition_id.name : '';
                        return condName.replace(/\s+/g, '') === condFilter.replace(/\s+/g, '');
                    });
                }

                if (items.length === 0) {
                    tbody.innerHTML = '<tr><td colspan="4" class="text-center py-6 text-body-muted">ไม่พบข้อมูลสินค้าในระบบ</td></tr>';
                    return;
                }

                const groupedData = {};

                items.forEach(p => {
                    const name = p.name || 'ไม่ระบุชื่อ';
                    const unit = (p.unit_id && p.unit_id.name) ? p.unit_id.name : 'ชิ้น';
                    if (!groupedData[name]) groupedData[name] = { total: 0, branches: {}, unit: unit };
                    groupedData[name].unit = unit;

                    if (p.stock_balances && p.stock_balances.length > 0) {
                        p.stock_balances.forEach(b => {
                            const bQty = (b.imeis && b.imeis.length > 0) ? b.imeis.length : (b.quantity || 0);
                            if (bQty > 0) {
                                groupedData[name].total += bQty;
                                const bName = b.branch_id ? (b.branch_id.name || 'ไม่ทราบสาขา') : 'ไม่ทราบสาขา';
                                if (!groupedData[name].branches[bName]) groupedData[name].branches[bName] = { total: 0, items: [], unit: unit };
                                groupedData[name].branches[bName].total += bQty;
                                groupedData[name].branches[bName].unit = unit;
                                groupedData[name].branches[bName].items.push({
                                    ...p,
                                    qtyToDisplay: bQty,
                                    branchImeis: b.imeis || [],
                                    unit: unit
                                });
                            }
                        });
                    }
                });

                let nameIndex = 0;
                for (const [name, nameGroup] of Object.entries(groupedData)) {
                    // Skip if totally out of stock
                    if (nameGroup.total <= 0) continue;

                    nameIndex++;
                    const nameRowId = `globalstock-group-${nameIndex}`;

                    const trName = document.createElement('tr');
                    trName.className = `name-row ${nameRowId} bg-canvas-elevated hover:bg-surface-chip/40 transition-colors cursor-pointer border-l-4 border-primary`;
                    trName.onclick = () => {
                        const icon = document.getElementById(`icon-${nameRowId}`);
                        const isExpanded = icon.classList.contains('fa-chevron-down');

                        if (isExpanded) {
                            icon.classList.remove('fa-chevron-down');
                            icon.classList.add('fa-chevron-right');
                            document.querySelectorAll(`.child-of-${nameRowId}`).forEach(c => c.classList.add('hidden'));
                            document.querySelectorAll(`.branch-icon-of-${nameRowId}`).forEach(i => {
                                i.classList.remove('fa-chevron-down');
                                i.classList.add('fa-chevron-right');
                            });
                        } else {
                            icon.classList.remove('fa-chevron-right');
                            icon.classList.add('fa-chevron-down');
                            document.querySelectorAll(`.level2-of-${nameRowId}`).forEach(c => c.classList.remove('hidden'));
                        }
                    };
                    trName.innerHTML = `
                        <td class="px-3 py-4 md:px-6">
                            <div class="flex items-center gap-2 md:gap-3">
                                <i id="icon-${nameRowId}" class="fa-solid fa-chevron-right text-body-muted w-4 text-center shrink-0"></i>
                                <span class="font-bold text-ink text-base">${name}</span>
                            </div>
                        </td>
                        <td class="px-3 py-4 md:px-6 text-center whitespace-nowrap">
                            <span class="bg-surface-chip text-ink border border-hairline px-3 py-1 rounded-pill font-bold text-sm whitespace-nowrap">
                                ${nameGroup.total} ${nameGroup.unit || 'ชิ้น'}
                            </span>
                        </td>
                        <td class="px-3 py-4 md:px-6 text-right"></td>
                    `;
                    tbody.appendChild(trName);

                    let branchIndex = 0;
                    for (const [branchName, branchGroup] of Object.entries(nameGroup.branches)) {
                        branchIndex++;
                        const branchRowId = `${nameRowId}-branch-${branchIndex}`;

                        const trBranch = document.createElement('tr');
                        trBranch.className = `branch-row ${branchRowId} hidden child-of-${nameRowId} level2-of-${nameRowId} bg-surface-tile-3 hover:bg-surface-chip/30 transition-colors cursor-pointer border-l-4 border-hairline`;
                        trBranch.onclick = (e) => {
                            e.stopPropagation();
                            const icon = document.getElementById(`icon-${branchRowId}`);
                            const isExpanded = icon.classList.contains('fa-chevron-down');

                            const itemsLevel = document.querySelectorAll(`.child-of-${branchRowId}`);
                            if (isExpanded) {
                                icon.classList.remove('fa-chevron-down');
                                icon.classList.add('fa-chevron-right');
                                itemsLevel.forEach(c => c.classList.add('hidden'));
                            } else {
                                icon.classList.remove('fa-chevron-right');
                                icon.classList.add('fa-chevron-down');
                                itemsLevel.forEach(c => c.classList.remove('hidden'));
                            }
                        };
                        trBranch.innerHTML = `
                            <td class="px-3 py-3 md:px-6 pl-8 md:pl-12">
                                <div class="flex items-center gap-2">
                                    <i id="icon-${branchRowId}" class="fa-solid fa-chevron-right text-body-muted w-4 text-center text-xs branch-icon-of-${nameRowId} shrink-0"></i>
                                    <span class="font-bold text-ink text-sm whitespace-nowrap"><i class="fa-solid fa-store text-body-muted mr-1"></i> สาขา: ${branchName}</span>
                                </div>
                            </td>
                            <td class="px-3 py-3 md:px-6 text-center whitespace-nowrap">
                                <span class="text-body-muted font-bold text-sm whitespace-nowrap">${branchGroup.total} ${branchGroup.unit || 'ชิ้น'}</span>
                            </td>
                            <td class="px-3 py-3 md:px-6"></td>
                        `;
                        tbody.appendChild(trBranch);

                        branchGroup.items.forEach(p => {
                            const capacity = (p.capacity_id && p.capacity_id.name) ? p.capacity_id.name : 'ไม่ระบุความจุ';
                            const color = (p.color_id && p.color_id.name) ? p.color_id.name : 'ไม่ระบุสี';
                            const condition = (p.condition_id && p.condition_id.name) ? p.condition_id.name : '';

                            let imeiDisplay = '';
                            if (p.branchImeis && p.branchImeis.length > 0) {
                                imeiDisplay = `<div class="mt-1 flex flex-wrap gap-1 text-[10px] text-body-muted">IMEI: ${p.branchImeis.map(i => `<span class="bg-surface-chip px-1 rounded border border-hairline">${i}</span>`).join('')}</div>`;
                            }

                            const trItem = document.createElement('tr');
                            trItem.className = `item-row hidden child-of-${nameRowId} child-of-${branchRowId} hover:bg-surface-chip/40 transition-colors border-l-4 border-hairline`;
                            trItem.innerHTML = `
                                <td class="px-3 py-3 md:px-6 pl-14 md:pl-20">
                                    <div class="flex flex-col">
                                        <span class="text-sm text-body-muted">สี: <span class="font-bold text-ink">${color}</span> / ความจุ: <span class="font-bold text-ink">${capacity}</span> ${condition ? `/ ${condition}` : ''}</span>
                                        <span class="text-xs text-ink-muted-48 font-mono mt-0.5">รหัส: ${p.product_code || '-'}</span>
                                        ${imeiDisplay}
                                    </div>
                                </td>
                                <td class="px-3 py-3 md:px-6 text-center whitespace-nowrap">
                                    <span class="text-sm text-ink font-bold whitespace-nowrap">${p.qtyToDisplay} ${p.unit || 'ชิ้น'}</span>
                                </td>
                                <td class="px-3 py-3 md:px-6 text-right whitespace-nowrap">
                                    <span class="text-sm text-ink font-mono font-bold whitespace-nowrap">฿${(p.selling_price || 0).toLocaleString()}</span>
                                </td>
                            `;
                            tbody.appendChild(trItem);
                        });
                    }
                }
            }
        } catch (err) {
            console.error(err);
            tbody.innerHTML = '<tr><td colspan="4" class="text-center py-4 text-red-400">เกิดข้อผิดพลาดในการโหลดข้อมูล</td></tr>';
        }
    };

})();
