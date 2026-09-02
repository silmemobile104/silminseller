// หน้า "จัดการฐานข้อมูล" — แคตตาล็อกอ่านอย่างเดียว
// คำอธิบายมาจาก utils/dbCatalogue.js ฝั่งเซิร์ฟเวอร์ ส่วนจำนวนเอกสารนับจาก Atlas ตอนเรียก
// เดินตามแบบแปลนหน้า #stock ใน DESIGN.md ข้อ 11.4 - 11.7, 11.10
(() => {
    'use strict';

    const DB_COLS = 7;

    const dbEsc = (s) => String(s == null ? '' : s)
        .replace(/&/g, '&amp;').replace(/</g, '&lt;').replace(/>/g, '&gt;')
        .replace(/"/g, '&quot;').replace(/'/g, '&#39;');

    const dbNum = (n) => typeof n === 'number' ? n.toLocaleString('th-TH') : '-';

    // 3 โทนสถานะตาม DESIGN.md ข้อ 11.6
    const DB_IMPORTANCE = {
        critical: { label: 'สำคัญสูงสุด', dot: 'bg-[#FE0000]', bg: 'bg-[#FE0000]/[0.12]', text: 'text-[#FF6B6B]' },
        high: { label: 'สำคัญมาก', dot: 'bg-orange-500', bg: 'bg-orange-500/[0.12]', text: 'text-orange-400' },
        normal: { label: 'ทั่วไป', dot: 'bg-[#20D500]', bg: 'bg-[#42A231]/[0.12]', text: 'text-[#20D500]' }
    };

    let _dbCache = [];
    let _dbGroups = [];
    let _dbLegend = {};
    let _dbBound = false;

    const el = (id) => document.getElementById(id);
    const setText = (id, t) => { const n = el(id); if (n) n.textContent = t; };

    const dbStateRow = (msg, cls = 'text-white/50 italic') =>
        `<tr><td colspan="${DB_COLS}" class="px-6 py-8 text-center ${cls}">${dbEsc(msg)}</td></tr>`;

    // แถวโครงร่างระหว่างรอข้อมูล (ข้อ 11.7) — ต้องวาดก่อน await เสมอ
    const dbSkeleton = (rows = 6) => {
        const body = el('db-table-body');
        if (!body) return;
        const bar = (w) => `<div class="h-3.5 ${w} rounded-full bg-[#5c5c5c] animate-pulse"></div>`;
        body.innerHTML = Array.from({ length: rows }).map(() =>
            `<tr>${Array.from({ length: DB_COLS }).map(() =>
                `<td class="px-6 py-4">${bar('w-full')}</td>`).join('')}</tr>`).join('');
    };

    // ---------- ตัวกรอง ----------
    const dbFilters = () => ({
        q: (el('db-filter-search')?.value || '').trim().toLowerCase(),
        group: el('db-filter-group')?.value || 'ALL',
        importance: el('db-filter-importance')?.value || 'ALL'
    });

    const dbMatches = (c, f) => {
        if (f.group !== 'ALL' && c.group !== f.group) return false;
        if (f.importance !== 'ALL' && c.importance !== f.importance) return false;
        if (!f.q) return true;
        const hay = [c.key, c.model, c.title, c.group, c.purpose, c.notes,
            ...(c.pages || []), ...(c.relations || []),
            ...(c.keyFields || []).flatMap(k => [k.name, k.note])].join(' ').toLowerCase();
        return hay.includes(f.q);
    };

    // ชิปตัวกรอง (ข้อ 11.5) — ลบได้ที่ปุ่ม X เท่านั้น, "ล้างทั้งหมด" โผล่เมื่อมีมากกว่า 1 ชิป
    const dbRenderChips = () => {
        const box = el('db-active-filters');
        if (!box) return;
        const f = dbFilters();
        const chips = [];
        if (f.q) chips.push({ label: `ค้นหา: ${f.q}`, clear: () => { el('db-filter-search').value = ''; } });
        if (f.group !== 'ALL') chips.push({ label: `กลุ่ม: ${f.group}`, clear: () => { el('db-filter-group').value = 'ALL'; } });
        if (f.importance !== 'ALL') {
            chips.push({
                label: `ความสำคัญ: ${(DB_IMPORTANCE[f.importance] || {}).label || f.importance}`,
                clear: () => { el('db-filter-importance').value = 'ALL'; }
            });
        }

        box.innerHTML = chips.map((c, i) =>
            `<span class="filter-pill inline-flex items-center gap-2 px-3 py-1.5 rounded-[0.5rem] bg-[#4D4D4D]/60 border border-[#3F3F46] text-xs text-white">
                ${dbEsc(c.label)}
                <button type="button" data-chip="${i}" aria-label="ลบตัวกรอง ${dbEsc(c.label)}"
                    class="text-white/70 hover:text-white cursor-pointer transition-colors"><i class="fa-solid fa-xmark"></i></button>
            </span>`).join('')
            + (chips.length > 1
                ? `<button type="button" id="db-clear-all-chips"
                       class="inline-flex items-center gap-1.5 px-3 py-1.5 rounded-[0.5rem] text-xs text-white/70 hover:text-white cursor-pointer transition-colors">
                       <i class="fa-solid fa-xmark"></i> ล้างทั้งหมด</button>`
                : '');

        box.querySelectorAll('[data-chip]').forEach(b =>
            b.addEventListener('click', () => { chips[Number(b.dataset.chip)].clear(); dbRender(); }));
        const clearAll = el('db-clear-all-chips');
        if (clearAll) clearAll.addEventListener('click', () => dbClearFilters());
    };

    const dbClearFilters = () => {
        if (el('db-filter-search')) el('db-filter-search').value = '';
        if (el('db-filter-group')) el('db-filter-group').value = 'ALL';
        if (el('db-filter-importance')) el('db-filter-importance').value = 'ALL';
        dbRender();
    };

    // ---------- ตาราง ----------
    const dbRender = () => {
        const body = el('db-table-body');
        if (!body) return;
        const f = dbFilters();
        const rows = _dbCache.filter(c => dbMatches(c, f));

        dbRenderChips();
        setText('db-result-count', _dbCache.length
            ? `แสดง ${rows.length} จาก ${_dbCache.length} รายการ` : '');

        if (!rows.length) {
            body.innerHTML = dbStateRow(_dbCache.length
                ? 'ไม่พบ collection ที่ตรงกับเงื่อนไข'
                : 'ยังไม่มีข้อมูลแคตตาล็อก');
            return;
        }

        body.innerHTML = rows.map(c => {
            const tone = DB_IMPORTANCE[c.importance] || DB_IMPORTANCE.normal;
            const pages = (c.pages || []).slice(0, 3).map(p =>
                `<span class="px-2 py-0.5 rounded-[0.375rem] bg-[#4D4D4D]/60 text-[11px] text-white font-mono">#${dbEsc(p)}</span>`).join(' ');
            const more = (c.pages || []).length - 3;
            const count = c.countError
                ? `<span class="text-[#FF6B6B]" title="${dbEsc(c.countError)}">-</span>`
                : `<span class="font-mono text-white">${dbNum(c.count)}</span>`;

            return `
            <tr class="hover:bg-[#464646] transition-colors">
                <td class="px-6 py-4">
                    <span class="font-mono font-semibold text-[#FFE169]">${dbEsc(c.key)}</span>
                    <p class="text-xs text-white/70 mt-0.5">${dbEsc(c.title)}</p>
                </td>
                <td class="px-6 py-4 text-white">${dbEsc(c.group)}</td>
                <td class="px-6 py-4 text-right">${count}</td>
                <td class="px-6 py-4 whitespace-normal min-w-[22rem]">
                    <p class="text-white/80 text-xs leading-relaxed">${dbEsc(c.purpose)}</p>
                </td>
                <td class="px-6 py-4">
                    <div class="flex flex-wrap items-center gap-1">${pages}${more > 0
                    ? `<span class="text-[11px] text-white/60">+${more}</span>` : ''}</div>
                </td>
                <td class="px-6 py-4">
                    <span class="inline-flex items-center gap-1.5 px-2 py-0.5 rounded-[0.375rem] text-[11px] font-medium ${tone.bg} ${tone.text}">
                        <span class="w-1.5 h-1.5 rounded-full ${tone.dot}"></span>${dbEsc(tone.label)}
                    </span>
                </td>
                <td class="px-6 py-4 text-right">
                    <button type="button" class="btn-db-detail px-3 py-1.5 rounded-[0.375rem] bg-[#4D4D4D]/60 border border-[#3F3F46] text-white hover:border-[#FFE169] text-xs font-medium transition-colors inline-flex items-center gap-1.5 cursor-pointer"
                        data-key="${dbEsc(c.key)}" aria-label="ดูรายละเอียด ${dbEsc(c.key)}">
                        <i class="fa-solid fa-eye"></i> รายละเอียด
                    </button>
                </td>
            </tr>`;
        }).join('');

        body.querySelectorAll('.btn-db-detail').forEach(b =>
            b.addEventListener('click', () => dbOpenDetail(b.dataset.key)));
    };

    // ---------- ลิ้นชักรายละเอียด ----------
    const dbOpenDetail = (key) => {
        const c = _dbCache.find(x => x.key === key);
        const drawer = el('db-detail-drawer');
        if (!c || !drawer) return;

        setText('db-drawer-title', c.title);
        setText('db-drawer-key', `${c.key}  ·  ${c.model}`);

        const tone = DB_IMPORTANCE[c.importance] || DB_IMPORTANCE.normal;
        const section = (icon, title, inner) => `
            <div>
                <h4 class="text-sm font-semibold text-white flex items-center gap-2 mb-2">
                    <i class="fa-solid ${icon} text-[#FFE169] text-xs"></i> ${dbEsc(title)}
                </h4>
                ${inner}
            </div>`;

        const fields = (c.keyFields || []).length
            ? `<div class="space-y-2">${c.keyFields.map(k => `
                <div class="px-4 py-3 rounded-xl bg-[#27272A] border border-[#3F3F46]">
                    <p class="font-mono text-xs text-[#FFE169]">${dbEsc(k.name)}</p>
                    <p class="text-xs text-white/80 mt-1 leading-relaxed">${dbEsc(k.note)}</p>
                </div>`).join('')}</div>`
            : '<p class="text-xs text-white/50 italic">ไม่มีฟิลด์ที่ต้องอธิบายเป็นพิเศษ</p>';

        const pages = (c.pages || []).length
            ? `<div class="flex flex-wrap gap-2">${c.pages.map(p =>
                `<span class="px-2.5 py-1 rounded-[0.375rem] bg-[#4D4D4D]/60 text-xs text-white font-mono">#${dbEsc(p)}</span>`).join('')}</div>`
            : '<p class="text-xs text-white/50 italic">ไม่ได้ผูกกับหน้าใดโดยตรง</p>';

        const rel = (c.relations || []).length
            ? `<div class="flex flex-wrap gap-2">${c.relations.map(r =>
                `<span class="px-2.5 py-1 rounded-[0.375rem] bg-[#27272A] border border-[#3F3F46] text-xs text-[#FFE169] font-mono">${dbEsc(r)}</span>`).join('')}</div>`
            : '<p class="text-xs text-white/50 italic">ไม่อ้างถึง collection อื่น</p>';

        el('db-drawer-body').innerHTML = `
            <div class="flex flex-wrap items-center gap-2">
                <span class="inline-flex items-center gap-1.5 px-2.5 py-1 rounded-[0.375rem] text-xs font-medium ${tone.bg} ${tone.text}">
                    <span class="w-1.5 h-1.5 rounded-full ${tone.dot}"></span>${dbEsc(tone.label)}
                </span>
                <span class="px-2.5 py-1 rounded-[0.375rem] bg-[#4D4D4D]/60 text-xs text-white">${dbEsc(c.group)}</span>
                <span class="px-2.5 py-1 rounded-[0.375rem] bg-[#4D4D4D]/60 text-xs text-white">
                    ${c.countError ? 'นับไม่สำเร็จ' : `${dbNum(c.count)} เอกสาร`}
                </span>
            </div>
            <p class="text-sm text-white/80 leading-relaxed">${dbEsc(c.purpose)}</p>
            ${section('fa-circle-info', 'ความหมายของระดับความสำคัญ',
            `<p class="text-xs text-white/70 leading-relaxed">${dbEsc(_dbLegend[c.importance] || '')}</p>`)}
            ${section('fa-key', 'ฟิลด์สำคัญ', fields)}
            ${section('fa-file-lines', 'หน้าที่ใช้ข้อมูลนี้', pages)}
            ${section('fa-sitemap', 'เชื่อมกับ collection อื่น', rel)}
            ${c.notes ? section('fa-triangle-exclamation', 'ข้อควรระวัง',
                `<p class="text-xs text-white/80 leading-relaxed px-4 py-3 rounded-xl bg-orange-500/[0.12] border border-orange-500/30">${dbEsc(c.notes)}</p>`) : ''}`;

        drawer.classList.remove('opacity-0', 'pointer-events-none');
        const card = drawer.querySelector('.modal-content');
        if (card) card.focus();
    };

    const dbCloseDetail = () => {
        const drawer = el('db-detail-drawer');
        if (drawer) drawer.classList.add('opacity-0', 'pointer-events-none');
    };

    // ---------- โหลดข้อมูล ----------
    const loadDatabaseOverview = async () => {
        const body = el('db-table-body');
        if (!body) return;

        if (!_dbBound) {
            _dbBound = true;
            ['db-filter-search', 'db-filter-group', 'db-filter-importance'].forEach(id => {
                const n = el(id);
                if (!n) return;
                n.addEventListener(id === 'db-filter-search' ? 'input' : 'change', dbRender);
            });
            const clearBtn = el('btn-clear-db-filters');
            if (clearBtn) clearBtn.addEventListener('click', dbClearFilters);
            const closeBtn = el('btn-close-db-drawer');
            if (closeBtn) closeBtn.addEventListener('click', dbCloseDetail);
            document.addEventListener('keydown', (e) => {
                if (e.key === 'Escape') dbCloseDetail();
            });
        }

        dbSkeleton();

        try {
            const res = await window.authFetch('/api/database/overview');
            const result = await res.json();

            if (!result.success) {
                // 403 = ไม่มีสิทธิ์ จัดการต่อจาก message ที่เซิร์ฟเวอร์ส่งมา
                body.innerHTML = dbStateRow(result.message || 'โหลดข้อมูลไม่สำเร็จ', 'text-[#FF6B6B]');
                return;
            }

            const d = result.data || {};
            _dbCache = d.collections || [];
            _dbGroups = d.groups || [];
            _dbLegend = d.importanceLegend || {};

            const s = d.summary || {};
            setText('db-stat-collections', dbNum(s.collectionCount));
            setText('db-stat-documents', dbNum(s.documentTotal));
            setText('db-stat-name', s.dbName || '-');

            // เติมตัวเลือกกลุ่มจากข้อมูลจริง
            const gsel = el('db-filter-group');
            if (gsel && gsel.options.length <= 1) {
                gsel.innerHTML = '<option value="ALL">ทุกกลุ่ม</option>'
                    + _dbGroups.map(g => `<option value="${dbEsc(g)}">${dbEsc(g)}</option>`).join('');
            }

            if (s.countFailed) {
                window.showToast(`นับจำนวนเอกสารไม่สำเร็จ ${s.countFailed} collection`, 'error');
            }

            dbRender();
        } catch (err) {
            console.error('[DATABASE] โหลดข้อมูลไม่สำเร็จ:', err);
            body.innerHTML = dbStateRow('เชื่อมต่อเซิร์ฟเวอร์ไม่สำเร็จ', 'text-[#FF6B6B]');
        }
    };

    window.loadDatabaseOverview = loadDatabaseOverview;
})();
