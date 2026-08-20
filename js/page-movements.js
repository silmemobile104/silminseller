// Movement Ledger Logic (ระบบประวัติการเคลื่อนไหว)
// แยกออกมาจาก script.js — โหลดแบบ dynamic เฉพาะตอนเปิดหน้า "ประวัติการเคลื่อนไหว" ครั้งแรกเท่านั้น
// พึ่งพา window.authFetch, window.showToast, API_BASE_URL (global จาก script.js)
(function () {
    const formSearchMovement = document.getElementById('form-search-movement');
    const movementSearchInput = document.getElementById('movement-search-input');
    const movementResultArea = document.getElementById('movement-result-area');
    const movementEmptyState = document.getElementById('movement-empty-state');
    const movementTimeline = document.getElementById('movement-timeline');

    if (formSearchMovement) {
        formSearchMovement.addEventListener('submit', async (e) => {
            e.preventDefault();
            const query = movementSearchInput.value.trim();
            if (!query) return;

            try {
                const btnSearch = document.getElementById('btn-search-movement');
                const origHtml = btnSearch.innerHTML;
                btnSearch.innerHTML = '<i class="fa-solid fa-spinner fa-spin mr-2"></i> กำลังค้นหา...';
                btnSearch.disabled = true;

                const response = await window.authFetch(`${API_BASE_URL}/movements/search?query=${encodeURIComponent(query)}`);
                const res = await response.json();
                if (res && res.success) {
                    renderMovementResult(res.data);
                } else {
                    window.showToast(res?.message || 'ไม่พบประวัติการเคลื่อนไหว', 'error');
                    movementResultArea.classList.add('hidden');
                    movementEmptyState.classList.remove('hidden');
                }

                btnSearch.innerHTML = origHtml;
                btnSearch.disabled = false;
            } catch (error) {
                console.error('Error searching movement:', error);
                window.showToast('เกิดข้อผิดพลาดในการค้นหาประวัติ', 'error');
                movementResultArea.classList.add('hidden');
                movementEmptyState.classList.remove('hidden');

                const btnSearch = document.getElementById('btn-search-movement');
                btnSearch.innerHTML = '<i class="fa-solid fa-search mr-2"></i> ค้นหาข้อมูล';
                btnSearch.disabled = false;
            }
        });
    }

    function renderMovementResult(data) {
        movementEmptyState.classList.add('hidden');
        movementResultArea.classList.remove('hidden');

        // Product Info
        document.getElementById('mov-product-name').textContent = data.product.name;
        document.getElementById('mov-product-code').textContent = data.product.product_code || '-';
        document.getElementById('mov-type').textContent = data.product.type || 'ไม่ระบุ';
        document.getElementById('mov-color').textContent = data.product.color || 'ไม่ระบุ';
        document.getElementById('mov-capacity').textContent = data.product.capacity || 'ไม่ระบุ';

        const badge = document.getElementById('mov-query-badge');
        if (data.is_imei_search) {
            document.getElementById('mov-query-text').textContent = data.searched_query;
            badge.classList.remove('hidden');
        } else {
            badge.classList.add('hidden');
        }

        // Timeline
        movementTimeline.innerHTML = '';
        if (!data.movements || data.movements.length === 0) {
            movementTimeline.innerHTML = '<div class="text-body-muted">ยังไม่มีประวัติการเคลื่อนไหว</div>';
            return;
        }

        // เส้นไทม์ไลน์
        const line = document.createElement('div');
        line.className = 'absolute top-0 bottom-0 left-[19px] w-1 bg-hairline rounded-full';
        movementTimeline.appendChild(line);

        data.movements.forEach((mov, index) => {
            const isLatest = index === 0;
            const dateObj = new Date(mov.created_at);
            const dateStr = dateObj.toLocaleDateString('th-TH', { year: 'numeric', month: 'short', day: 'numeric' });
            const timeStr = dateObj.toLocaleTimeString('th-TH', { hour: '2-digit', minute: '2-digit' });

            let iconHtml = '';
            let colorClass = '';
            let detailsHtml = '';

            switch (mov.action) {
                case 'รับเข้าสต็อก':
                    iconHtml = '<i class="fa-solid fa-arrow-down"></i>';
                    colorClass = 'bg-emerald-500 text-white border-emerald-400/30';
                    detailsHtml = `
                        <div class="mt-3 bg-surface-tile-3 rounded-md p-3 border border-emerald-500/20">
                            <div class="text-body-muted flex items-center">
                                <i class="fa-solid fa-store text-emerald-400 w-5"></i> เข้าสู่สาขา <span class="font-bold text-emerald-400 ml-2">${mov.to_branch ? mov.to_branch.name : '-'}</span>
                            </div>
                            <div class="text-xs text-body-muted mt-2 flex items-center"><i class="fa-solid fa-user-check w-5"></i> รับเข้าโดย: ${mov.created_by ? mov.created_by.name : '-'}</div>
                        </div>
                    `;
                    break;
                case 'ส่งโอนย้าย':
                    iconHtml = '<i class="fa-solid fa-truck-fast"></i>';
                    colorClass = 'bg-cyan-500 text-white border-cyan-400/30';
                    detailsHtml = `
                        <div class="mt-3 bg-surface-tile-3 rounded-md p-3 border border-cyan-500/20">
                            <div class="text-body-muted flex items-center mb-1">
                                <i class="fa-solid fa-store text-body-muted w-5"></i> ต้นทาง <span class="font-bold text-ink ml-2">${mov.from_branch ? mov.from_branch.name : '-'}</span>
                            </div>
                            <div class="text-body-muted flex items-center">
                                <i class="fa-solid fa-arrow-right-to-city text-cyan-400 w-5"></i> ปลายทาง <span class="font-bold text-cyan-400 ml-2">${mov.to_branch ? mov.to_branch.name : '-'}</span>
                            </div>
                            <div class="mt-2 pt-2 border-t border-hairline flex flex-wrap gap-3">
                                <div class="text-xs text-body-muted flex items-center"><i class="fa-solid fa-file-invoice text-body-muted mr-1"></i> เลขที่โอน: ${mov.reference_no}</div>
                                <div class="text-xs text-body-muted flex items-center"><i class="fa-solid fa-user text-body-muted mr-1"></i> ผู้โอน: ${mov.created_by ? mov.created_by.name : '-'}</div>
                            </div>
                        </div>
                    `;
                    break;
                case 'รับโอนย้าย':
                    iconHtml = '<i class="fa-solid fa-box-open"></i>';
                    colorClass = 'bg-indigo-500 text-white border-indigo-400/30';
                    detailsHtml = `
                        <div class="mt-3 bg-surface-tile-3 rounded-md p-3 border border-indigo-500/20">
                            <div class="text-body-muted flex items-center">
                                <i class="fa-solid fa-check-to-slot text-indigo-400 w-5"></i> รับเข้าสาขา <span class="font-bold text-indigo-400 ml-2">${mov.to_branch ? mov.to_branch.name : '-'}</span>
                            </div>
                            <div class="mt-2 pt-2 border-t border-hairline flex flex-wrap gap-3">
                                <div class="text-xs text-indigo-300 flex items-center bg-indigo-500/10 px-2 py-1 rounded-md"><i class="fa-solid fa-stopwatch mr-1"></i> ใช้เวลาขนส่ง: ${Number(mov.transit_hours).toFixed(1)} ชั่วโมง</div>
                                <div class="text-xs text-body-muted flex items-center py-1"><i class="fa-solid fa-user-check text-body-muted mr-1"></i> ผู้รับ: ${mov.created_by ? mov.created_by.name : '-'}</div>
                            </div>
                        </div>
                    `;
                    break;
                case 'ขายออก':
                    iconHtml = '<i class="fa-solid fa-cash-register"></i>';
                    colorClass = 'bg-rose-500 text-white border-rose-400/30';
                    detailsHtml = `
                        <div class="mt-3 bg-surface-tile-3 rounded-md p-3 border border-rose-500/30">
                            <div class="text-ink flex items-center font-medium">
                                <i class="fa-solid fa-store text-rose-400 w-5"></i> ขายออกจาก <span class="font-bold text-rose-400 ml-2">${mov.from_branch ? mov.from_branch.name : '-'}</span>
                            </div>
                            <div class="mt-2 pt-2 border-t border-hairline flex flex-wrap gap-3">
                                <div class="text-xs text-rose-300 flex items-center"><i class="fa-solid fa-receipt mr-1"></i> ใบเสร็จ: ${mov.reference_no}</div>
                                <div class="text-xs text-body-muted flex items-center"><i class="fa-solid fa-user-tag mr-1"></i> พนักงานขาย: ${mov.created_by ? mov.created_by.name : '-'}</div>
                            </div>
                        </div>
                    `;
                    break;
                default:
                    iconHtml = '<i class="fa-solid fa-circle-dot"></i>';
                    colorClass = 'bg-surface-tile-2 text-body-muted border-hairline';
            }

            const itemDiv = document.createElement('div');
            itemDiv.className = `relative pl-12 transition-all duration-500 hover:-translate-y-1 ${isLatest ? 'opacity-100 scale-100' : 'opacity-80 scale-[0.98] hover:opacity-100'}`;
            itemDiv.innerHTML = `
                <!-- Timeline Dot -->
                <div class="absolute left-0 top-1 -ml-[3px] w-10 h-10 rounded-full border flex items-center justify-center text-sm z-10 ${colorClass}">
                    ${isLatest ? '<div class="absolute -inset-1 bg-primary rounded-full opacity-20 animate-ping"></div>' : ''}
                    ${iconHtml}
                </div>

                <!-- Content Box -->
                <div class="bg-canvas-elevated border ${isLatest ? 'border-divider-soft' : 'border-hairline'} rounded-lg p-5 group hover:border-primary/30 transition-colors duration-300">
                    <div class="flex flex-col sm:flex-row justify-between items-start sm:items-center gap-2 mb-2">
                        <span class="font-bold text-ink text-xl flex items-center gap-2">
                            ${mov.action}
                            ${isLatest ? '<span class="text-[10px] font-bold tracking-wider uppercase bg-surface-chip text-ink px-2 py-0.5 rounded-pill border border-hairline ml-2">LATEST</span>' : ''}
                        </span>
                        <div class="flex items-center gap-2 bg-surface-tile-3 px-3 py-1.5 rounded-md border border-hairline">
                            <i class="fa-regular fa-clock text-body-muted"></i>
                            <span class="text-sm text-body-muted font-medium">${dateStr}</span>
                            <span class="text-sm text-ink-muted-48 font-mono">${timeStr}</span>
                        </div>
                    </div>

                    ${data.is_imei_search === false && mov.imei ? '<div class="text-sm text-ink font-mono mt-2 flex items-center"><i class="fa-solid fa-tag text-body-muted w-5"></i> IMEI: <span class="font-bold ml-1 bg-surface-chip px-2 py-0.5 rounded border border-hairline">' + mov.imei + '</span></div>' : ''}
                    ${data.is_imei_search === false && !mov.imei && mov.quantity ? '<div class="text-sm text-ink font-mono mt-2 flex items-center"><i class="fa-solid fa-cubes text-body-muted w-5"></i> จำนวน: <span class="font-bold ml-1 bg-surface-chip px-2 py-0.5 rounded border border-hairline">' + mov.quantity + '</span></div>' : ''}

                    ${detailsHtml}
                </div>
            `;
            movementTimeline.appendChild(itemDiv);
        });
    }
})();
