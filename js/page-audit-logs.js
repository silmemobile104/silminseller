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
    const AUDIT_COLS = 7;

    // คำบรรยายกิจกรรมมาจากทั่วทั้งระบบ (ชื่อสินค้า/พนักงาน/สาขา ที่ผู้ใช้พิมพ์เอง)
    // แล้วถูกยัดเข้า innerHTML — ของเดิมใส่ดิบๆ ทั้ง description, user_name และ reference_no
    const adEsc = (s) => String(s == null ? '' : s)
        .replace(/&/g, '&amp;').replace(/</g, '&lt;').replace(/>/g, '&gt;')
        .replace(/"/g, '&quot;').replace(/'/g, '&#39;');

    const adStateRow = (msg, cls = 'text-ink/50 italic') =>
        `<tr><td colspan="${AUDIT_COLS}" class="px-6 py-8 text-center ${cls}">${adEsc(msg)}</td></tr>`;

    const adSkeleton = (rows = 6) => {
        const tbody = document.getElementById('audit-logs-table-body');
        if (!tbody) return;
        const bar = (w) => `<div class="h-3.5 ${w} rounded-full bg-skeleton animate-pulse"></div>`;
        tbody.innerHTML = Array.from({ length: rows }).map(() => `
            <tr>
                <td class="px-6 py-4">${bar('w-32')}</td>
                <td class="px-6 py-4">
                    <div class="flex items-center gap-2">
                        <div class="w-7 h-7 rounded-full bg-skeleton animate-pulse shrink-0"></div>${bar('w-24')}
                    </div>
                </td>
                <td class="px-6 py-4">${bar('w-20')}</td>
                <td class="px-6 py-4">${bar('w-24')}</td>
                <td class="px-6 py-4">${bar('w-full')}</td>
                <td class="px-6 py-4">${bar('w-24')}</td>
                <td class="px-6 py-4">${bar('w-8')}</td>
            </tr>`).join('');
    };

    // ประเภทกิจกรรมยุบเหลือ 3 โทนตามตารางข้อ 11.6 (สร้าง=สำเร็จ · แก้ไข=ระหว่างดำเนินการ · ลบ/ยกเลิก=ล้มเหลว)
    const AUDIT_ACTIONS = {
        CREATE: { label: 'สร้างใหม่', icon: 'fa-circle-plus', tone: 'ok' },
        APPROVE: { label: 'อนุมัติ', icon: 'fa-check', tone: 'ok' },
        UPDATE: { label: 'แก้ไข', icon: 'fa-pen-to-square', tone: 'warn' },
        DELETE: { label: 'ลบข้อมูล', icon: 'fa-trash-can', tone: 'bad' },
        CANCEL: { label: 'ยกเลิก', icon: 'fa-ban', tone: 'bad' },
        LOGIN: { label: 'เข้าสู่ระบบ', icon: 'fa-right-to-bracket', tone: 'muted' }
    };
    const AUDIT_TONES = {
        ok: { dot: 'bg-state-ok', bg: 'bg-state-ok-tint/[0.12]', text: 'text-state-ok' },
        warn: { dot: 'bg-orange-500', bg: 'bg-orange-500/[0.12]', text: 'text-orange-400' },
        bad: { dot: 'bg-state-danger', bg: 'bg-state-danger/[0.12]', text: 'text-state-danger' },
        muted: { dot: 'bg-ink/40', bg: 'bg-chip/60', text: 'text-ink' }
    };

    // โมดูลทั้งหมดที่ระบบบันทึกจริง — ตัวเลือกในดรอปดาวน์และป้ายในตารางอ่านจากตารางนี้ชุดเดียว
    // ของเดิมดรอปดาวน์มีแค่ 7 โมดูล ทั้งที่ข้อมูลจริงมี 14 ทำให้กรองบางโมดูลไม่ได้เลย
    const AUDIT_MODULES = {
        AUTH: { label: 'เข้าสู่ระบบ', icon: 'fa-lock' },
        STOCK: { label: 'คลังสินค้า', icon: 'fa-box' },
        PO: { label: 'ใบสั่งซื้อ (PO)', icon: 'fa-file-invoice-dollar' },
        POS: { label: 'ขายหน้าร้าน (POS)', icon: 'fa-cash-register' },
        TRANSFER: { label: 'โอนย้ายสาขา', icon: 'fa-truck-ramp-box' },
        PERSONNEL: { label: 'พนักงาน', icon: 'fa-users' },
        ROLE: { label: 'สิทธิ์ใช้งาน', icon: 'fa-shield-halved' },
        ACCOUNTING: { label: 'บัญชีและการเงิน', icon: 'fa-chart-line' },
        DEPOSIT: { label: 'มัดจำ/จอง', icon: 'fa-wallet' },
        REQUISITION: { label: 'ใบเบิกสินค้า', icon: 'fa-clipboard-list' },
        COA: { label: 'ผังบัญชี', icon: 'fa-sitemap' },
        STOCK_AUDIT: { label: 'ตรวจนับสต็อก', icon: 'fa-clipboard-check' },
        PNL_CONFIG: { label: 'ตั้งค่างบกำไรขาดทุน', icon: 'fa-chart-pie' },
        DISBURSEMENT: { label: 'ใบสำคัญจ่าย', icon: 'fa-file-invoice' }
    };

    const getActionBadgeHtml = (action) => {
        const conf = AUDIT_ACTIONS[action] || { label: action || '-', icon: 'fa-circle-info', tone: 'muted' };
        const t = AUDIT_TONES[conf.tone];
        return `<div class="inline-flex items-center gap-2 px-2.5 py-1 rounded-[0.375rem] ${t.bg}" title="${adEsc(conf.label)} (${adEsc(action || '')})">
                    <div class="w-2 h-2 rounded-full ${t.dot}"></div>
                    <span class="${t.text} font-medium text-xs">${adEsc(conf.label)}</span>
                </div>`;
    };

    const getModuleBadgeHtml = (module) => {
        const conf = AUDIT_MODULES[module] || { label: module || '-', icon: 'fa-circle-info' };
        return `<span class="inline-flex items-center gap-1.5 px-2.5 py-1 rounded-[0.375rem] text-xs font-medium bg-chip/60 text-ink">
                    <i class="fa-solid ${adEsc(conf.icon)} text-[10px]"></i>${adEsc(conf.label)}
                </span>`;
    };

    // เติมตัวเลือกดรอปดาวน์จากตารางกลาง — จะได้ไม่มีโมดูลไหนตกหล่นอีก
    const adFillFilterOptions = () => {
        const mod = document.getElementById('audit-filter-module');
        if (mod && mod.options.length <= 1) {
            mod.innerHTML = '<option value="ALL">ทุกโมดูล</option>' +
                Object.entries(AUDIT_MODULES)
                    .map(([k, v]) => `<option value="${adEsc(k)}">${adEsc(v.label)}</option>`).join('');
        }
        const act = document.getElementById('audit-filter-action');
        if (act && act.options.length <= 1) {
            act.innerHTML = '<option value="ALL">ทุกประเภท</option>' +
                Object.entries(AUDIT_ACTIONS)
                    .map(([k, v]) => `<option value="${adEsc(k)}">${adEsc(v.label)}</option>`).join('');
        }
    };

    // ชิปตัวกรองที่ใช้อยู่ (ข้อ 11.5 — ลบได้เฉพาะตอนคลิกกากบาท)
    const adRenderChips = () => {
        const box = document.getElementById('audit-active-filters');
        if (!box) return;
        box.innerHTML = '';

        const search = document.getElementById('audit-filter-search');
        const user = document.getElementById('audit-filter-user');
        const mod = document.getElementById('audit-filter-module');
        const act = document.getElementById('audit-filter-action');

        const chips = [];
        if (search && search.value.trim()) chips.push({ key: 'search', label: `ค้นหา: ${search.value.trim()}` });
        if (user && user.value.trim()) chips.push({ key: 'user', label: `ผู้ทำรายการ: ${user.value.trim()}` });
        if (mod && mod.value && mod.value !== 'ALL') {
            chips.push({ key: 'module', label: `โมดูล: ${(AUDIT_MODULES[mod.value] || {}).label || mod.value}` });
        }
        if (act && act.value && act.value !== 'ALL') {
            chips.push({ key: 'action', label: `ประเภท: ${(AUDIT_ACTIONS[act.value] || {}).label || act.value}` });
        }

        const clearOne = (key) => {
            if (key === 'search' && search) search.value = '';
            if (key === 'user' && user) user.value = '';
            if (key === 'module' && mod) mod.value = 'ALL';
            if (key === 'action' && act) act.value = 'ALL';
            fetchAuditLogs(1);
        };

        chips.forEach(c => {
            const chip = document.createElement('button');
            chip.type = 'button';
            chip.className = 'elev-card px-4 py-2.5 rounded-xl bg-panel/40' +
                'text-ink text-sm font-medium transition-colors flex items-center gap-2 cursor-pointer';
            chip.innerHTML = `<span>${adEsc(c.label)}</span><i class="fa-solid fa-xmark text-[10px] opacity-80"></i>`;
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
                'rounded-full text-xs font-medium ring-1 ring-red-500/30 transition-colors cursor-pointer';
            clearAll.textContent = 'ล้างทั้งหมด';
            clearAll.addEventListener('click', () => {
                if (search) search.value = '';
                if (user) user.value = '';
                if (mod) mod.value = 'ALL';
                if (act) act.value = 'ALL';
                fetchAuditLogs(1);
            });
            box.appendChild(clearAll);
        }
    };

    const fetchAuditLogs = async (page = 1) => {
        auditCurrentPage = page;
        const tableBody = document.getElementById('audit-logs-table-body');
        const pageIndicator = document.getElementById('audit-current-page');
        const prevBtn = document.getElementById('btn-audit-prev');
        const nextBtn = document.getElementById('btn-audit-next');
        const paginationInfo = document.getElementById('audit-pagination-info');
        if (!tableBody) return;

        adFillFilterOptions();
        adRenderChips();
        adSkeleton();
        if (prevBtn) prevBtn.disabled = true;
        if (nextBtn) nextBtn.disabled = true;

        try {
            const search = document.getElementById('audit-filter-search')?.value || '';
            const module = document.getElementById('audit-filter-module')?.value || 'ALL';
            const action = document.getElementById('audit-filter-action')?.value || 'ALL';
            const user_name = document.getElementById('audit-filter-user')?.value || '';

            const params = new URLSearchParams({ page, limit: 50, search, module, action, user_name });
            const res = await authFetch(`${API_BASE_URL}/audit-logs?${params.toString()}`);
            const result = await res.json();

            if (!result.success) {
                tableBody.innerHTML = adStateRow(result.message || 'เกิดข้อผิดพลาดในการโหลดข้อมูล', 'text-red-400');
                if (paginationInfo) paginationInfo.textContent = '';
                return;
            }

            auditLogsCache = result.data || [];
            const logs = auditLogsCache;
            const pag = result.pagination || { total: 0, pages: 1, page: 1, limit: 50 };

            if (!logs.length) {
                tableBody.innerHTML = adStateRow('ไม่พบประวัติกิจกรรมตามตัวกรองที่เลือก');
                if (paginationInfo) paginationInfo.textContent = '';
                if (pageIndicator) pageIndicator.textContent = '1';
                return;
            }

            tableBody.innerHTML = logs.map(log => {
                const refBadge = log.reference_no
                    ? `<span class="font-mono font-semibold text-accent-ink">${adEsc(log.reference_no)}</span>`
                    : '<span class="text-ink/50">-</span>';
                const initial = adEsc((log.user_name || 'ร').trim().charAt(0).toUpperCase());
                return `
                <tr class="hover:bg-divider transition-colors">
                    <td class="px-6 py-4 text-ink/70 font-mono text-xs">${adEsc(formatThaiDateTime(log.createdAt))}</td>
                    <td class="px-6 py-4">
                        <div class="flex items-center gap-2">
                            <div class="w-7 h-7 rounded-full flex items-center justify-center shrink-0 text-xs font-semibold"
                                 style="color:#FFE169;background-color:#FFE1691F;"
                                 aria-hidden="true">${initial}</div>
                            <span class="text-ink font-medium">${adEsc(log.user_name || 'ระบบ')}</span>
                        </div>
                    </td>
                    <td class="px-6 py-4">${getActionBadgeHtml(log.action)}</td>
                    <td class="px-6 py-4">${getModuleBadgeHtml(log.module)}</td>
                    <td class="px-6 py-4">
                        <span class="text-ink block max-w-[420px] truncate" title="${adEsc(log.description || '')}">${adEsc(log.description || '-')}</span>
                    </td>
                    <td class="px-6 py-4">${refBadge}</td>
                    <td class="px-6 py-4 text-right">
                        <div class="flex items-center justify-end gap-1">
                            <button type="button" class="btn-audit-detail text-ink hover:text-indigo-400 transition-colors p-2 cursor-pointer"
                                data-id="${adEsc(log._id)}" title="ดูรายละเอียดเชิงลึก"
                                aria-label="ดูรายละเอียดเชิงลึกของกิจกรรม ${adEsc(log.description || '')}">
                                <i class="fa-solid fa-circle-info"></i>
                            </button>
                        </div>
                    </td>
                </tr>`;
            }).join('');

            tableBody.querySelectorAll('.btn-audit-detail').forEach(btn =>
                btn.addEventListener('click', () => window.viewAuditLogDetail(btn.dataset.id)));

            const startItem = (pag.page - 1) * pag.limit + 1;
            const endItem = Math.min(pag.page * pag.limit, pag.total);
            if (paginationInfo) {
                paginationInfo.textContent = `แสดง ${startItem}-${endItem} จาก ${pag.total} รายการ`;
            }
            if (pageIndicator) pageIndicator.textContent = pag.page;
            if (prevBtn) prevBtn.disabled = pag.page <= 1;
            if (nextBtn) nextBtn.disabled = pag.page >= pag.pages;
        } catch (error) {
            console.error('fetchAuditLogs error:', error);
            tableBody.innerHTML = adStateRow('ไม่สามารถเชื่อมต่อเซิร์ฟเวอร์เพื่อดึงข้อมูลประวัติกิจกรรมได้', 'text-red-400');
            if (paginationInfo) paginationInfo.textContent = '';
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
                    payloadContainer.classList.remove('text-ink/50', 'italic');
                    payloadContainer.classList.add('text-ink');
                } catch (e) {
                    payloadContainer.textContent = String(log.details);
                }
            } else {
                payloadContainer.textContent = 'ไม่มีข้อมูลเพิ่มเติม (No details payload provided)';
                payloadContainer.classList.add('text-ink/50', 'italic');
                payloadContainer.classList.remove('text-ink');
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
