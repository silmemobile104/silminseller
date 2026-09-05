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
        critical: { label: 'สำคัญสูงสุด', dot: 'bg-state-danger', bg: 'bg-state-danger/[0.12]', text: 'text-state-danger-soft' },
        high: { label: 'สำคัญมาก', dot: 'bg-orange-500', bg: 'bg-orange-500/[0.12]', text: 'text-orange-400' },
        normal: { label: 'ทั่วไป', dot: 'bg-state-ok', bg: 'bg-state-ok-tint/[0.12]', text: 'text-state-ok' }
    };

    let _dbCache = [];
    let _dbGroups = [];
    let _dbLegend = {};
    let _dbBound = false;
    // มุมมองตาราง/การ์ด — จำค่าไว้ข้ามการเข้าหน้า (เหมือนหน้า #deposits)
    let dbViewMode = localStorage.getItem('db_view_mode') === 'card' ? 'card' : 'list';

    // สถานะหน้าต่าง "ดูเอกสาร" — คุมแยกจากตารางแคตตาล็อกด้านหลัง
    let _docs = { key: '', title: '', page: 1, limit: 25, q: '', totalPages: 1, columns: [], docs: [] };
    let _docsSeq = 0;        // กันผลลัพธ์ของคำค้นเก่ามาทับของใหม่ (ผู้ใช้พิมพ์เร็วกว่าเน็ต)
    let _docsTimer = null;   // debounce ช่องค้นหา
    // มุมมองตาราง/การ์ดของหน้าต่าง "ดูเอกสาร" — แยกจาก dbViewMode ของตารางแคตตาล็อกด้านหลัง
    let docsViewMode = localStorage.getItem('db_docs_view_mode') === 'card' ? 'card' : 'list';

    const el = (id) => document.getElementById(id);
    const setText = (id, t) => { const n = el(id); if (n) n.textContent = t; };

    // ชั้นซ้อนเต็มจอที่มี backdrop-blur ต้องเป็น display:none ตอนปิด
    // แค่ opacity-0 ยังอยู่ในขั้นตอน composite เบราว์เซอร์ต้องเบลอฉากหลังใหม่ทุกเฟรมที่มีอะไรขยับ
    // ตัวจับเวลาซ่อนที่ยังค้างอยู่ ต้องยกเลิกถ้าผู้ใช้เปิดซ้ำภายใน 300ms
    // ไม่งั้น timeout ของรอบก่อนจะมาใส่ hidden ทับชั้นที่เพิ่งเปิด (แล้วล้างตารางทิ้งด้วย)
    const _layerTimers = new Map();

    const dbShowLayer = (node) => {
        if (!node) return;
        const pending = _layerTimers.get(node);
        if (pending) { clearTimeout(pending); _layerTimers.delete(node); }
        node.classList.remove('hidden');
        void node.offsetWidth; // reflow ให้ transition เริ่มจาก opacity 0 จริง ๆ
        node.classList.remove('opacity-0', 'pointer-events-none');
    };

    const dbHideLayer = (node, onHidden) => {
        if (!node || node.classList.contains('hidden')) return;
        node.classList.add('opacity-0', 'pointer-events-none');
        const pending = _layerTimers.get(node);
        if (pending) clearTimeout(pending);
        _layerTimers.set(node, setTimeout(() => {
            _layerTimers.delete(node);
            node.classList.add('hidden');
            if (onHidden) onHidden();
        }, 300)); // ตรงกับ duration-300 ของ transition
    };

    const dbStateRow = (msg, cls = 'text-ink/50 italic') =>
        `<tr><td colspan="${DB_COLS}" class="px-6 py-8 text-center ${cls}">${dbEsc(msg)}</td></tr>`;

    const dbStateCard = (msg, cls = 'text-ink/50 italic') =>
        `<div class="col-span-full py-12 text-center ${cls}">${dbEsc(msg)}</div>`;

    // แถวโครงร่างระหว่างรอข้อมูล (ข้อ 11.7) — ต้องวาดก่อน await เสมอ
    const dbTableSkeleton = (rows = 6) => {
        const body = el('db-table-body');
        if (!body) return;
        const bar = (w) => `<div class="h-3.5 ${w} rounded-full bg-skeleton animate-pulse"></div>`;
        body.innerHTML = Array.from({ length: rows }).map(() =>
            `<tr>${Array.from({ length: DB_COLS }).map(() =>
                `<td class="px-6 py-4">${bar('w-full')}</td>`).join('')}</tr>`).join('');
    };

    // โครงร่างการ์ด — สัดส่วนบล็อกเดินตามโครงจริงของ dbCardMarkup ด้านล่าง
    const dbCardSkeleton = (count = 6) => {
        const cardsWrap = el('db-view-cards');
        if (!cardsWrap) return;
        const bar = (w) => `<div class="h-3.5 ${w} rounded-full bg-skeleton animate-pulse"></div>`;
        cardsWrap.innerHTML = Array.from({ length: count }).map(() => `
            <div class="elev-card bg-surface-tile-3 rounded-md p-4">
                <div class="flex items-start justify-between gap-2">${bar('w-24')}${bar('w-20 h-6')}</div>
                ${bar('w-32 mt-2.5')}
                ${bar('w-full mt-3')}${bar('w-3/4 mt-2')}
                <div class="flex items-center justify-between mt-3.5 pt-3 border-t border-hairline">
                    ${bar('w-16')}
                    <div class="flex items-center gap-1.5">
                        <div class="w-8 h-8 rounded-lg bg-skeleton animate-pulse"></div>
                        <div class="w-8 h-8 rounded-lg bg-skeleton animate-pulse"></div>
                    </div>
                </div>
            </div>`).join('');
    };

    const dbSkeleton = (rows = 6) => {
        if (dbViewMode === 'card') dbCardSkeleton(rows); else dbTableSkeleton(rows);
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
            `<span class="elev-chip filter-pill inline-flex items-center gap-2 px-3 py-1.5 rounded-[0.5rem] bg-chip/60 text-xs text-ink">
                ${dbEsc(c.label)}
                <button type="button" data-chip="${i}" aria-label="ลบตัวกรอง ${dbEsc(c.label)}"
                    class="text-ink/70 hover:text-ink cursor-pointer transition-colors"><i class="fa-solid fa-xmark"></i></button>
            </span>`).join('')
            + (chips.length > 1
                ? `<button type="button" id="db-clear-all-chips"
                       class="inline-flex items-center gap-1.5 px-3 py-1.5 rounded-[0.5rem] text-xs text-ink/70 hover:text-ink cursor-pointer transition-colors">
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
    // ข้อมูลที่คำนวณร่วมกันระหว่างแถวตารางกับการ์ด — แยกออกมาครั้งเดียวเพื่อไม่ให้สองมุมมองเพี้ยนจากกัน
    const dbBuildRowData = (c) => {
        const tone = DB_IMPORTANCE[c.importance] || DB_IMPORTANCE.normal;
        const pages = (c.pages || []).slice(0, 3).map(p =>
            `<span class="px-2 py-0.5 rounded-[0.375rem] bg-chip/60 text-[11px] text-ink font-mono">#${dbEsc(p)}</span>`).join(' ');
        const more = (c.pages || []).length - 3;
        const pagesHtml = `${pages}${more > 0 ? `<span class="text-[11px] text-ink/60">+${more}</span>` : ''}`;
        const count = c.countError
            ? `<span class="text-state-danger-soft" title="${dbEsc(c.countError)}">-</span>`
            : `<span class="font-mono text-ink">${dbNum(c.count)}</span>`;
        const badge = `<span class="inline-flex items-center gap-1.5 px-2 py-0.5 rounded-[0.375rem] text-[11px] font-medium ${tone.bg} ${tone.text}">
                <span class="w-1.5 h-1.5 rounded-full ${tone.dot}"></span>${dbEsc(tone.label)}
            </span>`;
        const actions = `
            <button type="button" class="elev-chip btn-db-docs px-3 py-1.5 rounded-[0.375rem] bg-chip/60 text-ink hover:ring-1 hover:ring-accent-ink text-xs font-medium transition-colors inline-flex items-center gap-1.5 cursor-pointer"
                data-key="${dbEsc(c.key)}" aria-label="ดูเอกสารใน ${dbEsc(c.key)}">
                <i class="fa-solid fa-table-list"></i> ดูเอกสาร
            </button>
            <button type="button" class="elev-chip btn-db-detail px-3 py-1.5 rounded-[0.375rem] bg-chip/60 text-ink hover:ring-1 hover:ring-accent-ink text-xs font-medium transition-colors inline-flex items-center gap-1.5 cursor-pointer"
                data-key="${dbEsc(c.key)}" aria-label="ดูรายละเอียด ${dbEsc(c.key)}">
                <i class="fa-solid fa-eye"></i> รายละเอียด
            </button>`;
        // การ์ดแคบกว่าคอลัมน์ตาราง ปุ่มมีตัวหนังสือสองปุ่มชนกัน จึงใช้ไอคอนล้วนแทน (มี aria-label ชุดเดียวกัน)
        const cardActions = `
            <button type="button" class="btn-db-docs text-ink hover:text-indigo-400 transition-colors p-2 cursor-pointer"
                data-key="${dbEsc(c.key)}" title="ดูเอกสาร" aria-label="ดูเอกสารใน ${dbEsc(c.key)}">
                <i class="fa-solid fa-table-list"></i>
            </button>
            <button type="button" class="btn-db-detail text-ink hover:text-indigo-400 transition-colors p-2 cursor-pointer"
                data-key="${dbEsc(c.key)}" title="รายละเอียด" aria-label="ดูรายละเอียด ${dbEsc(c.key)}">
                <i class="fa-solid fa-eye"></i>
            </button>`;
        return { pagesHtml, count, badge, actions, cardActions };
    };

    const dbRowMarkup = (c) => {
        const d = dbBuildRowData(c);
        return `
        <tr class="hover:bg-divider transition-colors">
            <td class="px-6 py-4">
                <span class="font-mono font-semibold text-accent-ink">${dbEsc(c.key)}</span>
                <p class="text-xs text-ink/70 mt-0.5">${dbEsc(c.title)}</p>
            </td>
            <td class="px-6 py-4 text-ink">${dbEsc(c.group)}</td>
            <td class="px-6 py-4 text-right">${d.count}</td>
            <td class="px-6 py-4 whitespace-normal min-w-[22rem]">
                <p class="text-ink/80 text-xs leading-relaxed">${dbEsc(c.purpose)}</p>
            </td>
            <td class="px-6 py-4">
                <div class="flex flex-wrap items-center gap-1">${d.pagesHtml}</div>
            </td>
            <td class="px-6 py-4">${d.badge}</td>
            <td class="px-6 py-4 text-right">
                <div class="inline-flex items-center gap-2">${d.actions}</div>
            </td>
        </tr>`;
    };

    // การ์ด — โครง: หัว (key / ความสำคัญ) · ชื่อ · เก็บอะไร · footer (กลุ่ม+จำนวนเอกสาร + ปุ่มจัดการ)
    const dbCardMarkup = (c) => {
        const d = dbBuildRowData(c);
        return `
        <div class="elev-card bg-surface-tile-3 rounded-md p-4">
            <div class="flex items-start justify-between gap-2">
                <span class="font-mono font-semibold text-accent-ink truncate">${dbEsc(c.key)}</span>
                <div class="shrink-0">${d.badge}</div>
            </div>
            <p class="text-ink font-medium mt-2.5 truncate">${dbEsc(c.title)}</p>
            <p class="text-ink/80 text-xs leading-relaxed mt-2 line-clamp-2">${dbEsc(c.purpose)}</p>

            ${d.pagesHtml ? `<div class="flex flex-wrap items-center gap-1 mt-3">${d.pagesHtml}</div>` : ''}

            <div class="flex items-center justify-between mt-3.5 pt-3 border-t border-hairline gap-2">
                <div class="min-w-0 text-xs text-ink/70 truncate">${dbEsc(c.group)} · ${d.count}</div>
                <div class="flex items-center gap-1 shrink-0">${d.cardActions}</div>
            </div>
        </div>`;
    };

    const dbBindRowHandlers = (container) => {
        container.querySelectorAll('.btn-db-detail').forEach(b =>
            b.addEventListener('click', () => dbOpenDetail(b.dataset.key)));
        container.querySelectorAll('.btn-db-docs').forEach(b =>
            b.addEventListener('click', () => dbOpenDocs(b.dataset.key)));
    };

    const dbRender = () => {
        const body = el('db-table-body');
        if (!body) return;

        const listWrap = el('db-view-list-wrap');
        const cardsWrap = el('db-view-cards');
        if (listWrap) listWrap.classList.toggle('hidden', dbViewMode !== 'list');
        if (cardsWrap) cardsWrap.classList.toggle('hidden', dbViewMode !== 'card');

        const f = dbFilters();
        const rows = _dbCache.filter(c => dbMatches(c, f));

        dbRenderChips();
        setText('db-result-count', _dbCache.length
            ? `แสดง ${rows.length} จาก ${_dbCache.length} รายการ` : '');

        if (!rows.length) {
            const emptyMsg = _dbCache.length ? 'ไม่พบ collection ที่ตรงกับเงื่อนไข' : 'ยังไม่มีข้อมูลแคตตาล็อก';
            body.innerHTML = dbStateRow(emptyMsg);
            if (cardsWrap) cardsWrap.innerHTML = dbStateCard(emptyMsg);
            return;
        }

        if (dbViewMode === 'card') {
            cardsWrap.innerHTML = rows.map(dbCardMarkup).join('');
            dbBindRowHandlers(cardsWrap);
        } else {
            body.innerHTML = rows.map(dbRowMarkup).join('');
            dbBindRowHandlers(body);
        }
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
                <h4 class="text-sm font-semibold text-ink flex items-center gap-2 mb-2">
                    <i class="fa-solid ${icon} text-accent-ink text-xs"></i> ${dbEsc(title)}
                </h4>
                ${inner}
            </div>`;

        const fields = (c.keyFields || []).length
            ? `<div class="space-y-2">${c.keyFields.map(k => `
                <div class="elev-field px-4 py-3 rounded-xl bg-field">
                    <p class="font-mono text-xs text-accent-ink">${dbEsc(k.name)}</p>
                    <p class="text-xs text-ink/80 mt-1 leading-relaxed">${dbEsc(k.note)}</p>
                </div>`).join('')}</div>`
            : '<p class="text-xs text-ink/50 italic">ไม่มีฟิลด์ที่ต้องอธิบายเป็นพิเศษ</p>';

        const pages = (c.pages || []).length
            ? `<div class="flex flex-wrap gap-2">${c.pages.map(p =>
                `<span class="px-2.5 py-1 rounded-[0.375rem] bg-chip/60 text-xs text-ink font-mono">#${dbEsc(p)}</span>`).join('')}</div>`
            : '<p class="text-xs text-ink/50 italic">ไม่ได้ผูกกับหน้าใดโดยตรง</p>';

        const rel = (c.relations || []).length
            ? `<div class="flex flex-wrap gap-2">${c.relations.map(r =>
                `<span class="elev-field px-2.5 py-1 rounded-[0.375rem] bg-field text-xs text-accent-ink font-mono">${dbEsc(r)}</span>`).join('')}</div>`
            : '<p class="text-xs text-ink/50 italic">ไม่อ้างถึง collection อื่น</p>';

        el('db-drawer-body').innerHTML = `
            <div class="flex flex-wrap items-center gap-2">
                <span class="inline-flex items-center gap-1.5 px-2.5 py-1 rounded-[0.375rem] text-xs font-medium ${tone.bg} ${tone.text}">
                    <span class="w-1.5 h-1.5 rounded-full ${tone.dot}"></span>${dbEsc(tone.label)}
                </span>
                <span class="px-2.5 py-1 rounded-[0.375rem] bg-chip/60 text-xs text-ink">${dbEsc(c.group)}</span>
                <span class="px-2.5 py-1 rounded-[0.375rem] bg-chip/60 text-xs text-ink">
                    ${c.countError ? 'นับไม่สำเร็จ' : `${dbNum(c.count)} เอกสาร`}
                </span>
            </div>
            <p class="text-sm text-ink/80 leading-relaxed">${dbEsc(c.purpose)}</p>
            ${section('fa-circle-info', 'ความหมายของระดับความสำคัญ',
            `<p class="text-xs text-ink/70 leading-relaxed">${dbEsc(_dbLegend[c.importance] || '')}</p>`)}
            ${section('fa-key', 'ฟิลด์สำคัญ', fields)}
            ${section('fa-file-lines', 'หน้าที่ใช้ข้อมูลนี้', pages)}
            ${section('fa-sitemap', 'เชื่อมกับ collection อื่น', rel)}
            ${c.notes ? section('fa-triangle-exclamation', 'ข้อควรระวัง',
                `<p class="elev-chip text-xs text-ink/80 leading-relaxed px-4 py-3 rounded-xl bg-orange-500/[0.12] border-orange-500/30">${dbEsc(c.notes)}</p>`) : ''}
            <button type="button" id="btn-db-drawer-docs"
                class="elev-chip w-full px-4 py-3 rounded-xl bg-chip/60 text-ink hover:ring-1 hover:ring-accent-ink text-sm font-medium transition-colors inline-flex items-center justify-center gap-2 cursor-pointer">
                <i class="fa-solid fa-table-list text-accent-ink"></i> เปิดดูเอกสารจริงใน ${dbEsc(c.key)}
            </button>`;

        const toDocsBtn = el('btn-db-drawer-docs');
        if (toDocsBtn) toDocsBtn.addEventListener('click', () => { dbCloseDetail(); dbOpenDocs(c.key); });

        dbShowLayer(drawer);
        const card = drawer.querySelector('.modal-content');
        if (card) card.focus();
    };

    const dbCloseDetail = () => dbHideLayer(el('db-detail-drawer'));

    // ---------- หน้าต่างดูเอกสารจริงใน collection ----------
    // อ่านอย่างเดียว: เซิร์ฟเวอร์ตัดสตริงยาว/อาร์เรย์ใหญ่ และซ่อน employee.password ให้แล้ว
    const DOCS_CELL_MAX = 48;

    // ค่าที่ส่งมาเป็น JSON แล้ว — Date กลายเป็นสตริง ISO, ObjectId กลายเป็นสตริง hex
    const dbIsIso = (s) => /^\d{4}-\d{2}-\d{2}T\d{2}:\d{2}/.test(s);
    const dbIsOid = (s) => /^[0-9a-f]{24}$/i.test(s);

    const dbFmtCell = (v) => {
        if (v === null || v === undefined || v === '') return '<span class="text-ink/30">—</span>';
        if (typeof v === 'boolean') {
            return v ? '<span class="text-state-ok">ใช่</span>' : '<span class="text-ink/60">ไม่</span>';
        }
        if (typeof v === 'number') return `<span class="font-mono text-ink">${dbNum(v)}</span>`;
        if (Array.isArray(v)) {
            return v.length
                ? `<span class="px-2 py-0.5 rounded-[0.375rem] bg-chip/60 text-[11px] text-ink">${v.length} รายการ</span>`
                : '<span class="text-ink/30">— ว่าง</span>';
        }
        if (typeof v === 'object') {
            return `<span class="px-2 py-0.5 rounded-[0.375rem] bg-chip/60 text-[11px] text-ink font-mono">{ ${Object.keys(v).length} ฟิลด์ }</span>`;
        }

        const s = String(v);
        if (dbIsIso(s)) {
            const d = new Date(s);
            if (!isNaN(d)) {
                return `<span class="text-ink">${d.toLocaleString('th-TH', {
                    day: 'numeric', month: 'short', year: 'numeric', hour: '2-digit', minute: '2-digit'
                })}</span>`;
            }
        }
        if (dbIsOid(s)) {
            // id เต็มดูได้ที่ JSON ดิบ ในตารางโชว์ท้าย 6 ตัวพอให้ไล่ตามได้
            return `<span class="font-mono text-[11px] text-ink/70" title="${dbEsc(s)}">…${dbEsc(s.slice(-6))}</span>`;
        }
        const short = s.length > DOCS_CELL_MAX ? `${s.slice(0, DOCS_CELL_MAX)}…` : s;
        return `<span class="text-ink" title="${dbEsc(s)}">${dbEsc(short)}</span>`;
    };

    const dbDocsTableSkeleton = () => {
        const body = el('db-docs-body');
        if (!body) return;
        const cols = Math.max(4, (_docs.columns || []).length + 1);
        const bar = `<div class="h-3.5 w-full rounded-full bg-skeleton animate-pulse"></div>`;
        body.innerHTML = Array.from({ length: 8 }).map(() =>
            `<tr>${Array.from({ length: cols }).map(() => `<td class="px-6 py-4">${bar}</td>`).join('')}</tr>`).join('');
    };

    // โครงร่างการ์ด — สัดส่วนบล็อกเดินตามโครงจริงของ dbDocCardMarkup ด้านล่าง
    const dbDocsCardSkeleton = () => {
        const cardsWrap = el('db-docs-view-cards');
        if (!cardsWrap) return;
        const bar = (w) => `<div class="h-3.5 ${w} rounded-full bg-skeleton animate-pulse"></div>`;
        cardsWrap.innerHTML = Array.from({ length: 8 }).map(() => `
            <div class="elev-card bg-surface-tile-3 rounded-md p-4">
                <div class="space-y-2.5">
                    ${Array.from({ length: 4 }).map(() =>
                        `<div class="flex items-center justify-between gap-3">${bar('w-16')}${bar('w-24')}</div>`).join('')}
                </div>
                <div class="flex justify-end mt-3 pt-3 border-t border-hairline">
                    <div class="w-16 h-7 rounded-[0.375rem] bg-skeleton animate-pulse"></div>
                </div>
            </div>`).join('');
    };

    const dbDocsSkeleton = () => {
        if (docsViewMode === 'card') dbDocsCardSkeleton(); else dbDocsTableSkeleton();
    };

    const dbDocsStateRow = (msg, cls = 'text-ink/50 italic') => {
        const cols = Math.max(4, (_docs.columns || []).length + 1);
        return `<tr><td colspan="${cols}" class="px-6 py-10 text-center ${cls}">${dbEsc(msg)}</td></tr>`;
    };

    const dbDocsStateCard = (msg, cls = 'text-ink/50 italic') =>
        `<div class="col-span-full py-12 text-center ${cls}">${dbEsc(msg)}</div>`;

    // การ์ด — โครง: รายการฟิลด์:ค่า ตามคอลัมน์จริงของ collection นั้น (คอลัมน์ไม่คงที่ต่างจากตารางอื่นในระบบ)
    // · footer (ปุ่ม JSON ดิบ) — ใช้ dbFmtCell ชุดเดียวกับตาราง จะได้หน้าตาเซลล์ตรงกันทั้งสองมุมมอง
    const dbDocCardMarkup = (doc, i) => {
        const fields = _docs.columns.map(c => `
            <div class="flex items-start justify-between gap-3 text-xs">
                <span class="text-ink/60 font-mono shrink-0">${dbEsc(c.name)}</span>
                <span class="text-right min-w-0 truncate">${dbFmtCell(doc[c.name])}</span>
            </div>`).join('');
        return `
        <div class="elev-card bg-surface-tile-3 rounded-md p-4" data-row="${i}">
            <div class="space-y-2.5">${fields}</div>
            <div class="flex justify-end mt-3 pt-3 border-t border-hairline">
                <button type="button" class="elev-chip btn-db-json px-2.5 py-1 rounded-[0.375rem] bg-chip/60 text-ink hover:ring-1 hover:ring-accent-ink text-[11px] font-medium transition-colors inline-flex items-center gap-1.5 cursor-pointer"
                    aria-expanded="false">
                    <i class="fa-solid fa-code"></i> JSON
                </button>
            </div>
        </div>`;
    };

    const dbRenderDocs = () => {
        const head = el('db-docs-head');
        const body = el('db-docs-body');
        const listWrap = el('db-docs-view-list-wrap');
        const cardsWrap = el('db-docs-view-cards');
        if (!head || !body) return;

        if (listWrap) listWrap.classList.toggle('hidden', docsViewMode !== 'list');
        if (cardsWrap) cardsWrap.classList.toggle('hidden', docsViewMode !== 'card');

        head.innerHTML = _docs.columns.map(c =>
            `<th class="px-6 py-3 font-semibold text-[13px]">
                <span class="font-mono">${dbEsc(c.name)}</span>
                <span class="ml-1.5 text-[10px] font-normal text-ink/50">${dbEsc(c.type || '')}</span>
            </th>`).join('')
            + '<th class="px-6 py-3 font-semibold text-[13px] text-right">ข้อมูลดิบ</th>';

        if (!_docs.docs.length) {
            const emptyMsg = _docs.q ? 'ไม่พบเอกสารที่ตรงกับคำค้น' : 'collection นี้ยังไม่มีเอกสาร';
            body.innerHTML = dbDocsStateRow(emptyMsg);
            if (cardsWrap) cardsWrap.innerHTML = dbDocsStateCard(emptyMsg);
            return;
        }

        if (docsViewMode === 'card') {
            cardsWrap.innerHTML = _docs.docs.map(dbDocCardMarkup).join('');
        } else {
            // JSON ดิบสร้างตอนกดเท่านั้น (ดู dbToggleJson) ไม่ฝังไว้ล่วงหน้าทุกแถว
            body.innerHTML = _docs.docs.map((doc, i) => {
                const cells = _docs.columns.map(c =>
                    `<td class="px-6 py-3 max-w-[22rem] truncate">${dbFmtCell(doc[c.name])}</td>`).join('');
                return `
                <tr class="hover:bg-divider transition-colors" data-row="${i}">
                    ${cells}
                    <td class="px-6 py-3 text-right">
                        <button type="button" class="elev-chip btn-db-json px-2.5 py-1 rounded-[0.375rem] bg-chip/60 text-ink hover:ring-1 hover:ring-accent-ink text-[11px] font-medium transition-colors inline-flex items-center gap-1.5 cursor-pointer"
                            aria-expanded="false">
                            <i class="fa-solid fa-code"></i> JSON
                        </button>
                    </td>
                </tr>`;
            }).join('');
        }
    };

    // แถว/บล็อก JSON แทรกตอนกด และถอดออกตอนกดซ้ำ — ไม่ทิ้ง DOM ที่ซ่อนไว้ค้าง
    // ตาราง: แทรกเป็น <tr> ถัดจากแถว · การ์ด: แทรกเป็น <pre> ต่อท้ายในการ์ดเดียวกัน
    const dbToggleJson = (btn) => {
        const tr = btn.closest('tr');
        const card = btn.closest('[data-row]');

        if (tr) {
            const next = tr.nextElementSibling;
            if (next && next.classList.contains('db-docs-json')) {
                next.remove();
                btn.setAttribute('aria-expanded', 'false');
                return;
            }
            const doc = _docs.docs[Number(tr.dataset.row)];
            if (!doc) return;
            tr.insertAdjacentHTML('afterend', `
                <tr class="db-docs-json">
                    <td colspan="${_docs.columns.length + 1}" class="px-6 pb-4 pt-0">
                        <pre tabindex="0" class="elev-field max-h-72 overflow-auto whitespace-pre rounded-xl bg-field p-4 text-xs text-ink/85 font-mono leading-5">${dbEsc(JSON.stringify(doc, null, 2))}</pre>
                    </td>
                </tr>`);
            btn.setAttribute('aria-expanded', 'true');
            return;
        }

        if (card) {
            const existing = card.querySelector('.db-docs-json');
            if (existing) {
                existing.remove();
                btn.setAttribute('aria-expanded', 'false');
                return;
            }
            const doc = _docs.docs[Number(card.dataset.row)];
            if (!doc) return;
            // แทรกก่อน footer (พ่อของปุ่ม) ไม่ใช่ก่อนตัวปุ่มเอง ไม่งั้น <pre> จะไปติดอยู่ใน
            // แถว flex justify-end เดียวกับปุ่ม แทนที่จะเป็นบล็อกเต็มความกว้างเหนือปุ่ม
            btn.parentElement.insertAdjacentHTML('beforebegin', `
                <pre tabindex="0" class="db-docs-json elev-field max-h-72 overflow-auto whitespace-pre rounded-xl bg-field p-4 text-xs text-ink/85 font-mono leading-5 mb-3">${dbEsc(JSON.stringify(doc, null, 2))}</pre>`);
            btn.setAttribute('aria-expanded', 'true');
        }
    };

    const dbLoadDocs = async () => {
        const body = el('db-docs-body');
        if (!body || !_docs.key) return;

        const seq = ++_docsSeq;
        dbDocsSkeleton();

        try {
            const params = new URLSearchParams({
                page: String(_docs.page),
                limit: String(_docs.limit)
            });
            if (_docs.q) params.set('q', _docs.q);

            const res = await window.authFetch(`/api/database/${encodeURIComponent(_docs.key)}/documents?${params}`);
            const result = await res.json();
            if (seq !== _docsSeq) return; // มีคำค้นใหม่แซงไปแล้ว ทิ้งผลนี้

            if (!result.success) {
                body.innerHTML = dbDocsStateRow(result.message || 'โหลดเอกสารไม่สำเร็จ', 'text-state-danger-soft');
                return;
            }

            const d = result.data || {};
            _docs.columns = d.columns || [];
            _docs.docs = d.docs || [];
            _docs.page = d.page || 1;
            _docs.totalPages = d.totalPages || 1;

            setText('db-docs-count', `${dbNum(d.total || 0)} เอกสาร`);
            setText('db-docs-hint',
                `เรียงจากใหม่ไปเก่าตาม ${d.sortedBy || '_id'} · อ่านอย่างเดียว แก้ไขจากหน้านี้ไม่ได้`);
            setText('db-docs-page-info', `หน้า ${dbNum(_docs.page)} จาก ${dbNum(_docs.totalPages)}`);

            const prev = el('btn-db-docs-prev');
            const next = el('btn-db-docs-next');
            if (prev) prev.disabled = _docs.page <= 1;
            if (next) next.disabled = _docs.page >= _docs.totalPages;

            dbRenderDocs();
        } catch (err) {
            if (seq !== _docsSeq) return;
            console.error('[DATABASE] โหลดเอกสารไม่สำเร็จ:', err);
            body.innerHTML = dbDocsStateRow('เชื่อมต่อเซิร์ฟเวอร์ไม่สำเร็จ', 'text-state-danger-soft');
        }
    };

    const dbOpenDocs = (key) => {
        const c = _dbCache.find(x => x.key === key);
        const modal = el('db-docs-modal');
        if (!c || !modal) return;

        _docs = {
            key: c.key, title: c.title, page: 1,
            limit: Number(el('db-docs-limit')?.value) || 25,
            q: '', totalPages: 1, columns: [], docs: []
        };

        setText('db-docs-title', c.title);
        setText('db-docs-key', `${c.key}  ·  ${c.model}`);
        setText('db-docs-count', '');
        setText('db-docs-hint', '');
        setText('db-docs-page-info', '-');
        if (el('db-docs-search')) el('db-docs-search').value = '';

        dbShowLayer(modal);
        const card = modal.querySelector('.modal-content');
        if (card) card.focus();

        dbLoadDocs();
    };

    // ปิดแล้วต้องคืน DOM ด้วย — ตาราง 100 แถวที่ค้างไว้ยังโดนคิด layout ทุกครั้งที่หน้าเปลี่ยน
    const dbCloseDocs = () => dbHideLayer(el('db-docs-modal'), () => {
        const body = el('db-docs-body');
        const head = el('db-docs-head');
        if (body) body.innerHTML = '';
        if (head) head.innerHTML = '';
        _docs.docs = [];
        _docs.columns = [];
    });

    const dbIsDocsOpen = () => {
        const modal = el('db-docs-modal');
        return !!modal && !modal.classList.contains('hidden');
    };

    const dbBindDocs = () => {
        const closeBtn = el('btn-close-db-docs');
        if (closeBtn) closeBtn.addEventListener('click', dbCloseDocs);

        // ผูกครั้งเดียวที่ tbody/cards แทนที่จะผูกทีละปุ่มทุกครั้งที่วาดตาราง (100 แถว = 100 listener)
        const body = el('db-docs-body');
        if (body) body.addEventListener('click', (e) => {
            const btn = e.target.closest('.btn-db-json');
            if (btn) dbToggleJson(btn);
        });
        const cardsWrap = el('db-docs-view-cards');
        if (cardsWrap) cardsWrap.addEventListener('click', (e) => {
            const btn = e.target.closest('.btn-db-json');
            if (btn) dbToggleJson(btn);
        });

        // สลับมุมมอง List/Card ของหน้าต่างดูเอกสาร — re-render จาก _docs.docs ทันที ไม่ยิง API ซ้ำ
        const docsViewListBtn = el('db-docs-view-list');
        const docsViewCardBtn = el('db-docs-view-card');
        if (docsViewListBtn && docsViewCardBtn) {
            const syncDocsViewButtons = (mode) => window.syncViewToggleButtons(docsViewListBtn, docsViewCardBtn, mode);
            const applyDocsViewMode = (mode) => {
                docsViewMode = mode;
                localStorage.setItem('db_docs_view_mode', mode);
                syncDocsViewButtons(mode);
                dbRenderDocs();
            };
            docsViewListBtn.addEventListener('click', () => applyDocsViewMode('list'));
            docsViewCardBtn.addEventListener('click', () => applyDocsViewMode('card'));
            syncDocsViewButtons(docsViewMode);
        }

        const search = el('db-docs-search');
        if (search) {
            search.addEventListener('input', () => {
                clearTimeout(_docsTimer);
                _docsTimer = setTimeout(() => {
                    _docs.q = search.value.trim();
                    _docs.page = 1;
                    dbLoadDocs();
                }, 300);
            });
        }

        const limit = el('db-docs-limit');
        if (limit) {
            limit.addEventListener('change', () => {
                _docs.limit = Number(limit.value) || 25;
                _docs.page = 1;
                dbLoadDocs();
            });
        }

        const refresh = el('btn-db-docs-refresh');
        if (refresh) refresh.addEventListener('click', () => dbLoadDocs());

        const prev = el('btn-db-docs-prev');
        if (prev) prev.addEventListener('click', () => {
            if (_docs.page > 1) { _docs.page -= 1; dbLoadDocs(); }
        });
        const next = el('btn-db-docs-next');
        if (next) next.addEventListener('click', () => {
            if (_docs.page < _docs.totalPages) { _docs.page += 1; dbLoadDocs(); }
        });

        const modal = el('db-docs-modal');
        if (modal) modal.addEventListener('click', (e) => { if (e.target === modal) dbCloseDocs(); });
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
            dbBindDocs();
            document.addEventListener('keydown', (e) => {
                if (e.key !== 'Escape') return;
                // หน้าต่างเอกสารซ้อนอยู่บนลิ้นชัก — Escape ต้องปิดชั้นบนสุดก่อน
                if (dbIsDocsOpen()) dbCloseDocs();
                else dbCloseDetail();
            });
        }

        dbSkeleton();

        try {
            const res = await window.authFetch('/api/database/overview');
            const result = await res.json();

            if (!result.success) {
                // 403 = ไม่มีสิทธิ์ จัดการต่อจาก message ที่เซิร์ฟเวอร์ส่งมา
                body.innerHTML = dbStateRow(result.message || 'โหลดข้อมูลไม่สำเร็จ', 'text-state-danger-soft');
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
            body.innerHTML = dbStateRow('เชื่อมต่อเซิร์ฟเวอร์ไม่สำเร็จ', 'text-state-danger-soft');
        }
    };

    window.loadDatabaseOverview = loadDatabaseOverview;

    // สลับมุมมอง List/Card — ผูกที่ top-level ได้ (ไฟล์นี้เป็น js/page-*.js โหลดหลัง loadPageView
    // แทรก HTML ของ database.html เข้า DOM แล้วเสมอ)
    const dbViewListBtn = el('db-view-list');
    const dbViewCardBtn = el('db-view-card');
    if (dbViewListBtn && dbViewCardBtn) {
        const syncDbViewButtons = (mode) => window.syncViewToggleButtons(dbViewListBtn, dbViewCardBtn, mode);
        const applyDbViewMode = (mode) => {
            dbViewMode = mode;
            localStorage.setItem('db_view_mode', mode);
            syncDbViewButtons(mode);
            dbRender();
        };
        dbViewListBtn.addEventListener('click', () => applyDbViewMode('list'));
        dbViewCardBtn.addEventListener('click', () => applyDbViewMode('card'));
        syncDbViewButtons(dbViewMode);
    }
})();
