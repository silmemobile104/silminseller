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
            movementTimeline.innerHTML = '<div class="text-slate-400">ยังไม่มีประวัติการเคลื่อนไหว</div>';
            return;
        }

        // เส้นไทม์ไลน์
        const line = document.createElement('div');
        line.className = 'absolute top-0 bottom-0 left-[19px] w-1 bg-gradient-to-b from-rose-500/50 via-slate-700 to-transparent rounded-full';
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
                    colorClass = 'from-emerald-400 to-emerald-600 text-white shadow-[0_0_15px_rgba(16,185,129,0.5)] border-emerald-300/30';
                    detailsHtml = `
                        <div class="mt-3 bg-slate-800/80 rounded-xl p-3 border border-emerald-500/20">
                            <div class="text-slate-300 flex items-center">
                                <i class="fa-solid fa-store text-emerald-400 w-5"></i> เข้าสู่สาขา <span class="font-bold text-emerald-400 ml-2">${mov.to_branch ? mov.to_branch.name : '-'}</span>
                            </div>
                            <div class="text-xs text-slate-400 mt-2 flex items-center"><i class="fa-solid fa-user-check w-5"></i> รับเข้าโดย: ${mov.created_by ? mov.created_by.name : '-'}</div>
                        </div>
                    `;
                    break;
                case 'ส่งโอนย้าย':
                    iconHtml = '<i class="fa-solid fa-truck-fast"></i>';
                    colorClass = 'from-cyan-400 to-blue-600 text-white shadow-[0_0_15px_rgba(6,182,212,0.5)] border-cyan-300/30';
                    detailsHtml = `
                        <div class="mt-3 bg-slate-800/80 rounded-xl p-3 border border-cyan-500/20">
                            <div class="text-slate-300 flex items-center mb-1">
                                <i class="fa-solid fa-store text-slate-400 w-5"></i> ต้นทาง <span class="font-bold text-slate-200 ml-2">${mov.from_branch ? mov.from_branch.name : '-'}</span>
                            </div>
                            <div class="text-slate-300 flex items-center">
                                <i class="fa-solid fa-arrow-right-to-city text-cyan-400 w-5"></i> ปลายทาง <span class="font-bold text-cyan-400 ml-2">${mov.to_branch ? mov.to_branch.name : '-'}</span>
                            </div>
                            <div class="mt-2 pt-2 border-t border-slate-700/50 flex flex-wrap gap-3">
                                <div class="text-xs text-slate-400 flex items-center"><i class="fa-solid fa-file-invoice text-slate-400 mr-1"></i> เลขที่โอน: ${mov.reference_no}</div>
                                <div class="text-xs text-slate-400 flex items-center"><i class="fa-solid fa-user text-slate-400 mr-1"></i> ผู้โอน: ${mov.created_by ? mov.created_by.name : '-'}</div>
                            </div>
                        </div>
                    `;
                    break;
                case 'รับโอนย้าย':
                    iconHtml = '<i class="fa-solid fa-box-open"></i>';
                    colorClass = 'from-indigo-400 to-purple-600 text-white shadow-[0_0_15px_rgba(99,102,241,0.5)] border-indigo-300/30';
                    detailsHtml = `
                        <div class="mt-3 bg-slate-800/80 rounded-xl p-3 border border-indigo-500/20">
                            <div class="text-slate-300 flex items-center">
                                <i class="fa-solid fa-check-to-slot text-indigo-400 w-5"></i> รับเข้าสาขา <span class="font-bold text-indigo-400 ml-2">${mov.to_branch ? mov.to_branch.name : '-'}</span>
                            </div>
                            <div class="mt-2 pt-2 border-t border-slate-700/50 flex flex-wrap gap-3">
                                <div class="text-xs text-indigo-300 flex items-center bg-indigo-500/10 px-2 py-1 rounded-md"><i class="fa-solid fa-stopwatch mr-1"></i> ใช้เวลาขนส่ง: ${Number(mov.transit_hours).toFixed(1)} ชั่วโมง</div>
                                <div class="text-xs text-slate-400 flex items-center py-1"><i class="fa-solid fa-user-check text-slate-400 mr-1"></i> ผู้รับ: ${mov.created_by ? mov.created_by.name : '-'}</div>
                            </div>
                        </div>
                    `;
                    break;
                case 'ขายออก':
                    iconHtml = '<i class="fa-solid fa-cash-register"></i>';
                    colorClass = 'from-rose-500 to-red-600 text-white shadow-[0_0_15px_rgba(244,63,94,0.5)] border-rose-300/30';
                    detailsHtml = `
                        <div class="mt-3 bg-rose-950/20 rounded-xl p-3 border border-rose-500/30">
                            <div class="text-slate-200 flex items-center font-medium">
                                <i class="fa-solid fa-store text-rose-400 w-5"></i> ขายออกจาก <span class="font-bold text-rose-400 ml-2">${mov.from_branch ? mov.from_branch.name : '-'}</span>
                            </div>
                            <div class="mt-2 pt-2 border-t border-rose-900/50 flex flex-wrap gap-3">
                                <div class="text-xs text-rose-300 flex items-center"><i class="fa-solid fa-receipt mr-1"></i> ใบเสร็จ: ${mov.reference_no}</div>
                                <div class="text-xs text-slate-400 flex items-center"><i class="fa-solid fa-user-tag mr-1"></i> พนักงานขาย: ${mov.created_by ? mov.created_by.name : '-'}</div>
                            </div>
                        </div>
                    `;
                    break;
                default:
                    iconHtml = '<i class="fa-solid fa-circle-dot"></i>';
                    colorClass = 'from-slate-600 to-slate-700 text-slate-300 border-slate-500';
            }

            const itemDiv = document.createElement('div');
            itemDiv.className = `relative pl-12 transition-all duration-500 hover:-translate-y-1 ${isLatest ? 'opacity-100 scale-100' : 'opacity-80 scale-[0.98] hover:opacity-100'}`;
            itemDiv.innerHTML = `
                <!-- Timeline Dot (Premium) -->
                <div class="absolute left-0 top-1 -ml-[3px] w-10 h-10 rounded-full border border-white/20 flex items-center justify-center text-sm z-10 bg-gradient-to-br ${colorClass}">
                    ${isLatest ? '<div class="absolute -inset-1 bg-white rounded-full opacity-20 animate-ping"></div>' : ''}
                    ${iconHtml}
                </div>

                <!-- Content Box -->
                <div class="bg-gradient-to-b from-slate-800 to-slate-900 border ${isLatest ? 'border-slate-500/50 shadow-[0_4px_20px_rgba(0,0,0,0.3)] ring-1 ring-white/10' : 'border-slate-700/50'} rounded-2xl p-5 group hover:border-slate-500/40 transition-colors duration-300">
                    <div class="flex flex-col sm:flex-row justify-between items-start sm:items-center gap-2 mb-2">
                        <span class="font-bold text-white text-xl flex items-center gap-2">
                            ${mov.action}
                            ${isLatest ? '<span class="text-[10px] font-bold tracking-wider uppercase bg-rose-500 text-white px-2 py-0.5 rounded-full ml-2 animate-pulse">LATEST</span>' : ''}
                        </span>
                        <div class="flex items-center gap-2 bg-slate-950/50 px-3 py-1.5 rounded-lg border border-slate-700/50">
                            <i class="fa-regular fa-clock text-slate-400"></i>
                            <span class="text-sm text-slate-300 font-medium">${dateStr}</span>
                            <span class="text-sm text-slate-400 font-mono">${timeStr}</span>
                        </div>
                    </div>

                    ${data.is_imei_search === false && mov.imei ? '<div class="text-sm text-rose-400 font-mono mt-2 flex items-center"><i class="fa-solid fa-tag text-slate-400 w-5"></i> IMEI: <span class="font-bold ml-1 bg-rose-500/10 px-2 py-0.5 rounded border border-rose-500/20">' + mov.imei + '</span></div>' : ''}
                    ${data.is_imei_search === false && !mov.imei && mov.quantity ? '<div class="text-sm text-cyan-400 font-mono mt-2 flex items-center"><i class="fa-solid fa-cubes text-slate-400 w-5"></i> จำนวน: <span class="font-bold ml-1 bg-cyan-500/10 px-2 py-0.5 rounded border border-cyan-500/20">' + mov.quantity + '</span></div>' : ''}

                    ${detailsHtml}
                </div>
            `;
            movementTimeline.appendChild(itemDiv);
        });
    }
})();
