// AUDIT TRAIL / ACTIVITY LOG SYSTEM (ประวัติกิจกรรมระบบ)
// แยกออกมาจาก script.js — โหลดแบบ dynamic เฉพาะตอนเปิดหน้า "ประวัติกิจกรรมระบบ" ครั้งแรกเท่านั้น
// พึ่งพา window.authFetch, window.showToast, API_BASE_URL (global จาก script.js)
(function () {
    // AUDIT TRAIL / ACTIVITY LOG SYSTEM (ระบบบันทึกประวัติการทำงาน)
    // ============================================================================
    let auditCurrentPage = 1;
    let auditLogsCache = [];

    // Helper to format date cleanly in Thai format
    const formatThaiDateTime = (dateStr) => {
        if (!dateStr) return '-';
        const d = new Date(dateStr);
        if (isNaN(d.getTime())) return dateStr;
        return d.toLocaleString('th-TH', {
            year: 'numeric',
            month: 'short',
            day: 'numeric',
            hour: '2-digit',
            minute: '2-digit',
            second: '2-digit'
        });
    };

    // Render action badges with beautiful styling and icons
    const getActionBadgeHtml = (action) => {
        let bgClass = '', textClass = '', iconClass = '', titleText = action;
        switch (action) {
            case 'CREATE':
                bgClass = 'bg-emerald-500/10 border border-emerald-500/20';
                textClass = 'text-emerald-400';
                iconClass = 'fa-solid fa-circle-plus';
                titleText = 'สร้างใหม่ (CREATE)';
                break;
            case 'UPDATE':
                bgClass = 'bg-amber-500/10 border border-amber-500/20';
                textClass = 'text-amber-400';
                iconClass = 'fa-solid fa-pen-to-square';
                titleText = 'แก้ไข/ปรับปรุง (UPDATE)';
                break;
            case 'DELETE':
                bgClass = 'bg-rose-500/10 border border-rose-500/20';
                textClass = 'text-rose-400';
                iconClass = 'fa-solid fa-trash-can';
                titleText = 'ลบข้อมูล (DELETE)';
                break;
            case 'LOGIN':
                bgClass = 'bg-sky-500/10 border border-sky-500/20';
                textClass = 'text-sky-400';
                iconClass = 'fa-solid fa-right-to-bracket';
                titleText = 'ล็อกอิน (LOGIN)';
                break;
            case 'CANCEL':
                bgClass = 'bg-orange-500/10 border border-orange-500/20';
                textClass = 'text-orange-400';
                iconClass = 'fa-solid fa-ban';
                titleText = 'ยกเลิก (CANCEL)';
                break;
            case 'APPROVE':
                bgClass = 'bg-violet-500/10 border border-violet-500/20';
                textClass = 'text-violet-400';
                iconClass = 'fa-solid fa-circle-check';
                titleText = 'อนุมัติ (APPROVE)';
                break;
            default:
                bgClass = 'bg-slate-500/10 border border-slate-500/20';
                textClass = 'text-slate-400';
                iconClass = 'fa-solid fa-gear';
        }
        return `
            <span class="inline-flex items-center gap-1.5 px-2.5 py-1 rounded-full text-xs font-bold ${bgClass} ${textClass}" title="${titleText}">
                <i class="${iconClass} text-[10px]"></i>
                ${action}
            </span>
        `;
    };

    // Render module badges with custom icons
    const getModuleBadgeHtml = (module) => {
        let bgClass = '', textClass = '', iconClass = '', thaiName = module;
        switch (module) {
            case 'AUTH':
                bgClass = 'bg-slate-700/30 text-slate-300 border-slate-700/50';
                iconClass = 'fa-solid fa-lock';
                thaiName = 'เข้าสู่ระบบ';
                break;
            case 'PO':
                bgClass = 'bg-amber-500/10 text-amber-400 border-amber-500/20';
                iconClass = 'fa-solid fa-file-invoice-dollar';
                thaiName = 'ใบสั่งซื้อ (PO)';
                break;
            case 'STOCK':
                bgClass = 'bg-emerald-500/10 text-emerald-400 border-emerald-500/20';
                iconClass = 'fa-solid fa-box';
                thaiName = 'คลังสินค้า';
                break;
            case 'POS':
                bgClass = 'bg-sky-500/10 text-sky-400 border-sky-500/20';
                iconClass = 'fa-solid fa-cash-register';
                thaiName = 'ขายสินค้า (POS)';
                break;
            case 'TRANSFER':
                bgClass = 'bg-violet-500/10 text-violet-400 border-violet-500/20';
                iconClass = 'fa-solid fa-truck-ramp-box';
                thaiName = 'โอนย้ายสาขา';
                break;
            case 'PERSONNEL':
                bgClass = 'bg-rose-500/10 text-rose-400 border-rose-500/20';
                iconClass = 'fa-solid fa-users';
                thaiName = 'จัดการพนักงาน';
                break;
            case 'ROLE':
                bgClass = 'bg-indigo-500/10 text-indigo-400 border-indigo-500/20';
                iconClass = 'fa-solid fa-shield-halved';
                thaiName = 'จัดการสิทธิ์';
                break;
            default:
                bgClass = 'bg-slate-800 text-slate-400 border-slate-700';
                iconClass = 'fa-solid fa-bars-progress';
        }
        return `
            <span class="inline-flex items-center gap-1.5 px-2.5 py-1 rounded-xl text-xs font-semibold bg-slate-900/40 border ${bgClass}" title="${module}">
                <i class="${iconClass} text-[10px]"></i>
                ${thaiName}
            </span>
        `;
    };

    // Fetch and render logs from the API
    const fetchAuditLogs = async (page = 1) => {
        auditCurrentPage = page;
        const tableBody = document.getElementById('audit-logs-table-body');
        const emptyState = document.getElementById('audit-logs-empty');
        const pageIndicator = document.getElementById('audit-current-page');
        const prevBtn = document.getElementById('btn-audit-prev');
        const nextBtn = document.getElementById('btn-audit-next');
        const paginationInfo = document.getElementById('audit-pagination-info');

        if (!tableBody) return;

        // Render skeleton loading
        tableBody.innerHTML = `
            <tr>
                <td colspan="7" class="py-12 text-center text-slate-400">
                    <div class="flex flex-col items-center justify-center gap-3">
                        <i class="fa-solid fa-circle-notch fa-spin text-3xl text-indigo-500"></i>
                        <span class="text-sm font-medium tracking-wide">กำลังโหลดข้อมูลประวัติความปลอดภัย...</span>
                    </div>
                </td>
            </tr>
        `;
        if (emptyState) emptyState.classList.add('hidden');
        if (prevBtn) prevBtn.disabled = true;
        if (nextBtn) nextBtn.disabled = true;

        try {
            // Compile filters
            const search = document.getElementById('audit-filter-search')?.value || '';
            const module = document.getElementById('audit-filter-module')?.value || 'ALL';
            const action = document.getElementById('audit-filter-action')?.value || 'ALL';
            const user_name = document.getElementById('audit-filter-user')?.value || '';

            const params = new URLSearchParams({
                page,
                limit: 50,
                search,
                module,
                action,
                user_name
            });

            const res = await authFetch(`${API_BASE_URL}/audit-logs?${params.toString()}`);
            const result = await res.json();

            if (result.success) {
                auditLogsCache = result.data || [];
                const logs = result.data || [];
                const pag = result.pagination || { total: 0, pages: 1, page: 1, limit: 50 };

                if (logs.length === 0) {
                    tableBody.innerHTML = '';
                    if (emptyState) emptyState.classList.remove('hidden');
                    if (paginationInfo) paginationInfo.textContent = 'กำลังแสดงรายการที่ 0-0 จาก 0 รายการทั้งหมด';
                    if (pageIndicator) pageIndicator.textContent = '1';
                    return;
                }

                // Render table rows
                let rowsHtml = '';
                logs.forEach((log, index) => {
                    const timeStr = formatThaiDateTime(log.createdAt);
                    const refBadge = log.reference_no
                        ? `<span class="px-2 py-0.5 rounded bg-slate-700/40 border border-slate-700 text-slate-300 font-mono text-[11px]">${log.reference_no}</span>`
                        : `<span class="text-slate-400">-</span>`;

                    rowsHtml += `
                        <tr class="hover:bg-slate-800/20 transition-colors">
                            <td class="py-4 px-6 text-xs text-slate-400 font-mono">${timeStr}</td>
                            <td class="py-4 px-6">
                                <div class="flex items-center gap-2">
                                    <div class="w-7 h-7 rounded-full bg-indigo-500/10 border border-indigo-500/20 text-indigo-300 flex items-center justify-center font-bold text-xs">
                                        ${(log.user_name || 'U').charAt(0).toUpperCase()}
                                    </div>
                                    <span class="text-sm font-bold text-slate-200">${log.user_name || 'ระบบ'}</span>
                                </div>
                            </td>
                            <td class="py-4 px-6">${getActionBadgeHtml(log.action)}</td>
                            <td class="py-4 px-6">${getModuleBadgeHtml(log.module)}</td>
                            <td class="py-4 px-6 text-sm text-slate-300 font-medium">${log.description || '-'}</td>
                            <td class="py-4 px-6">${refBadge}</td>
                            <td class="py-4 px-6 text-right">
                                <button onclick="window.viewAuditLogDetail('${log._id}')" class="p-2 bg-indigo-500/10 border border-indigo-500/20 text-indigo-400 hover:bg-indigo-500/20 hover:text-white rounded-xl transition-all active:scale-95 shadow-md shadow-indigo-500/5 hover:shadow-indigo-500/10" title="ตรวจสอบเชิงลึก">
                                    <i class="fa-solid fa-circle-info text-sm"></i>
                                </button>
                            </td>
                        </tr>
                    `;
                });

                tableBody.innerHTML = rowsHtml;
                if (emptyState) emptyState.classList.add('hidden');

                // Update Pagination Info
                const startItem = (pag.page - 1) * pag.limit + 1;
                const endItem = Math.min(pag.page * pag.limit, pag.total);
                if (paginationInfo) {
                    paginationInfo.textContent = `กำลังแสดงรายการที่ ${startItem}-${endItem} จาก ${pag.total} รายการทั้งหมด`;
                }

                if (pageIndicator) pageIndicator.textContent = pag.page;
                if (prevBtn) prevBtn.disabled = pag.page <= 1;
                if (nextBtn) nextBtn.disabled = pag.page >= pag.pages;
            } else {
                tableBody.innerHTML = `<tr><td colspan="7" class="py-8 text-center text-red-400 font-medium">${result.message || 'เกิดข้อผิดพลาดในการโหลดข้อมูล'}</td></tr>`;
            }
        } catch (error) {
            console.error('fetchAuditLogs error:', error);
            tableBody.innerHTML = `<tr><td colspan="7" class="py-8 text-center text-red-400 font-medium">ไม่สามารถเชื่อมต่อเซิร์ฟเวอร์เพื่อดึงข้อมูลประวัติกิจกรรมได้</td></tr>`;
        }
    };
    window.fetchAuditLogs = fetchAuditLogs;

    // Open detailed security payload view
    window.viewAuditLogDetail = (logId) => {
        const log = auditLogsCache.find(l => l._id === logId);
        if (!log) return;

        const modal = document.getElementById('modal-audit-detail');
        if (!modal) return;

        // Set content
        document.getElementById('detail-audit-time').textContent = formatThaiDateTime(log.createdAt);
        document.getElementById('detail-audit-ip').textContent = log.ip_address || '-';
        document.getElementById('detail-audit-target').textContent = log.target_id || '-';
        document.getElementById('detail-audit-user-id').textContent = log.user_id || '-';
        document.getElementById('detail-audit-desc').textContent = log.description || '-';

        // Prettify details payload
        const payloadContainer = document.getElementById('detail-audit-payload');
        if (payloadContainer) {
            if (log.details) {
                try {
                    payloadContainer.textContent = JSON.stringify(log.details, null, 2);
                    payloadContainer.classList.remove('text-slate-400');
                    payloadContainer.classList.add('text-indigo-300');
                } catch (e) {
                    payloadContainer.textContent = String(log.details);
                }
            } else {
                payloadContainer.textContent = 'ไม่มีข้อมูลเพิ่มเติม (No details payload provided)';
                payloadContainer.classList.add('text-slate-400');
                payloadContainer.classList.remove('text-indigo-300');
            }
        }

        // Open Modal elegantly
        modal.classList.remove('hidden');
        void modal.offsetWidth;
        modal.classList.remove('opacity-0', 'pointer-events-none');
        const modalInner = modal.querySelector('.transform');
        if (modalInner) {
            modalInner.classList.remove('scale-95');
            modalInner.classList.add('scale-100');
        }
    };

    // Close Modal helper
    const closeAuditDetailModal = () => {
        const modal = document.getElementById('modal-audit-detail');
        if (!modal) return;

        modal.classList.add('opacity-0', 'pointer-events-none');
        const modalInner = modal.querySelector('.transform');
        if (modalInner) {
            modalInner.classList.add('scale-95');
            modalInner.classList.remove('scale-100');
        }
        setTimeout(() => modal.classList.add('hidden'), 300);
    };

    // Attach filters and pagination listeners
    const auditSearch = document.getElementById('audit-filter-search');
    const auditModule = document.getElementById('audit-filter-module');
    const auditAction = document.getElementById('audit-filter-action');
    const auditUser = document.getElementById('audit-filter-user');
    const auditClearBtn = document.getElementById('btn-clear-audit-filters');
    const auditPrevBtn = document.getElementById('btn-audit-prev');
    const auditNextBtn = document.getElementById('btn-audit-next');

    // Debounce for text inputs
    let auditDebounceId = null;
    const triggerAuditFilterRefresh = () => {
        clearTimeout(auditDebounceId);
        auditDebounceId = setTimeout(() => {
            fetchAuditLogs(1);
        }, 400);
    };

    if (auditSearch) auditSearch.addEventListener('input', triggerAuditFilterRefresh);
    if (auditUser) auditUser.addEventListener('input', triggerAuditFilterRefresh);
    if (auditModule) auditModule.addEventListener('change', () => fetchAuditLogs(1));
    if (auditAction) auditAction.addEventListener('change', () => fetchAuditLogs(1));

    if (auditClearBtn) {
        auditClearBtn.addEventListener('click', () => {
            if (auditSearch) auditSearch.value = '';
            if (auditModule) auditModule.value = 'ALL';
            if (auditAction) auditAction.value = 'ALL';
            if (auditUser) auditUser.value = '';
            fetchAuditLogs(1);
            showToast('ล้างค่าการกรองประวัติกิจกรรมเรียบร้อย', 'success');
        });
    }

    if (auditPrevBtn) {
        auditPrevBtn.addEventListener('click', () => {
            if (auditCurrentPage > 1) {
                fetchAuditLogs(auditCurrentPage - 1);
            }
        });
    }

    if (auditNextBtn) {
        auditNextBtn.addEventListener('click', () => {
            fetchAuditLogs(auditCurrentPage + 1);
        });
    }

    // Modal close triggers bindings
    const closeBtns = document.querySelectorAll('#modal-audit-detail .modal-close-btn');
    closeBtns.forEach(btn => {
        btn.addEventListener('click', closeAuditDetailModal);
    });

    // Close on clicking backdrop
    const modalBackdrop = document.getElementById('modal-audit-detail');
    if (modalBackdrop) {
        modalBackdrop.addEventListener('click', (e) => {
            if (e.target === modalBackdrop) {
                closeAuditDetailModal();
            }
        });
    }

})();
