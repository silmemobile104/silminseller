// รายได้และรายจ่ายอื่นๆ (บัญชีและการเงิน)
// โหลดแบบ dynamic เฉพาะตอนเปิดหน้า "รายได้และรายจ่ายอื่นๆ" ครั้งแรกเท่านั้น
// พึ่งพา window.authFetch, window.showToast, window.showConfirm, API_BASE_URL (global จาก script.js)
// หน้าเดียวมี 2 โหมด (ปุ่ม รายได้ / รายจ่าย) ใช้ฟอร์มและตารางชุดเดียวกัน สลับแค่ป้ายและข้อมูลที่ดึง
(function () {
    const OE_COLS = 6;
    const KIND = {
        income: { label: 'รายได้', sourceLabel: 'รายได้จาก', amountClass: 'text-green-400', sign: '+', solid: 'bg-green-500 hover:bg-green-600', text: 'text-green-400', bar: 'bg-green-500' },
        expense: { label: 'รายจ่าย', sourceLabel: 'รายจ่ายจาก', amountClass: 'text-red-400', sign: '-', solid: 'bg-red-500 hover:bg-red-600', text: 'text-red-400', bar: 'bg-red-500' }
    };

    let oeKind = 'income';
    let oeMaster = null;      // { categories, groups, accounts } โหลดครั้งเดียวต่อการเปิดหน้า
    let oeEntries = [];
    let oeBound = false;
    let oeSaving = false;

    const $ = (id) => document.getElementById(id);
    const oeEsc = (s) => String(s == null ? '' : s)
        .replace(/&/g, '&amp;').replace(/</g, '&lt;').replace(/>/g, '&gt;')
        .replace(/"/g, '&quot;').replace(/'/g, '&#39;');
    const oeMoney = (n) => Number(n || 0).toLocaleString('th-TH', { minimumFractionDigits: 2, maximumFractionDigits: 2 });
    const oeToday = () => {
        const d = new Date();
        return `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, '0')}-${String(d.getDate()).padStart(2, '0')}`;
    };
    const oeId = (v) => (v && typeof v === 'object' ? v._id : v);

    const oeStateRow = (message, extraClass = 'text-ink/50 italic') =>
        `<tr><td colspan="${OE_COLS}" class="px-6 py-8 text-center ${extraClass}">${message}</td></tr>`;

    // แถวโครงร่างระหว่างรอข้อมูล — ต้องเรียกก่อน await เสมอ (ข้อ 11.7)
    const renderOeSkeleton = (rowCount = 4) => {
        const body = $('oe-table-body');
        if (!body) return;
        const cell = '<td class="px-6 py-4"><div class="h-4 rounded bg-skeleton animate-pulse"></div></td>';
        body.innerHTML = Array.from({ length: rowCount }, () => `<tr>${cell.repeat(OE_COLS)}</tr>`).join('');
    };

    function fillSelect(sel, items, placeholder, labelOf) {
        if (!sel) return;
        const prev = sel.value;
        sel.innerHTML = `<option value="">${placeholder}</option>` +
            items.map(i => `<option value="${oeEsc(i._id)}">${oeEsc(labelOf(i))}</option>`).join('');
        if (prev && items.some(i => String(i._id) === prev)) sel.value = prev;
    }

    // ตัวเลือกไล่เป็นลำดับ: หมวด → กลุ่มบัญชี (เฉพาะกลุ่มในหมวดนั้น) → รหัสบัญชี (เฉพาะรหัสในกลุ่มนั้น)
    // เหมือนที่ API ตรวจตอนบันทึก — เปลี่ยนตัวบนแล้วตัวล่างถูกล้างและกรองใหม่
    function refreshGroupOptions() {
        const catId = $('oe-category')?.value;
        const sel = $('oe-group');
        if (!sel || !oeMaster) return;
        sel.value = '';
        if (!catId) { sel.innerHTML = '<option value="">-- เลือกหมวดก่อน --</option>'; refreshAccountOptions(); return; }
        const groups = oeMaster.groups
            .filter(g => String(oeId(g.category_id)) === catId && g.is_active !== false)
            .sort((a, b) => String(a.group_code).localeCompare(String(b.group_code), 'th', { numeric: true }));
        fillSelect(sel, groups, groups.length ? '-- เลือกกลุ่มบัญชี --' : '-- หมวดนี้ยังไม่มีกลุ่มบัญชี --',
            g => `${g.group_code} ${g.group_name}`);
        refreshAccountOptions();
    }

    function refreshAccountOptions() {
        const catId = $('oe-category')?.value;
        const groupId = $('oe-group')?.value;
        const sel = $('oe-account');
        if (!sel || !oeMaster) return;
        sel.value = '';
        if (!groupId) { sel.innerHTML = '<option value="">-- เลือกกลุ่มบัญชีก่อน --</option>'; return; }
        const accs = oeMaster.accounts.filter(a => String(oeId(a.group_id) || '') === groupId
            && String(oeId(a.category_id)) === catId && a.is_active !== false);
        fillSelect(sel, accs, accs.length ? '-- เลือกรหัสบัญชี --' : '-- กลุ่มนี้ยังไม่มีรหัสบัญชี --',
            a => `${a.account_code} ${a.account_name}`);
    }

    async function loadMaster() {
        const coaRes = await authFetch(`${API_BASE_URL}/acct/chart-of-accounts`);
        const coa = await coaRes.json();
        if (!coa.success) throw new Error(coa.message || 'โหลดผังบัญชีไม่สำเร็จ');
        oeMaster = { categories: coa.categories, groups: coa.groups, accounts: coa.accounts };
        fillSelect($('oe-category'), oeMaster.categories, '-- เลือกหมวด --', c => c.category_name);
        refreshGroupOptions();
    }

    function applyKindLabels() {
        const k = KIND[oeKind];
        // สีแยกประเภทชัดเจน: รายได้ = เขียว, รายจ่าย = แดง (ปุ่มที่เลือก, ปุ่มบันทึก, แถบสีบนการ์ด, ไอคอนหัวข้อ)
        const swap = (el, add, remove) => {
            if (!el) return;
            Object.values(KIND).forEach(v => {
                v[remove].split(' ').forEach(c => el.classList.remove(c));
            });
            k[add].split(' ').forEach(c => el.classList.add(c));
        };
        const setPressed = (id, kind) => {
            const btn = $(id);
            if (!btn) return;
            const on = oeKind === kind;
            btn.setAttribute('aria-pressed', String(on));
            Object.values(KIND).forEach(v => v.solid.split(' ').forEach(c => btn.classList.remove(c)));
            ['text-white', 'bg-surface-chip', 'text-body-muted', 'hover:text-ink'].forEach(c => btn.classList.remove(c));
            if (on) { KIND[kind].solid.split(' ').forEach(c => btn.classList.add(c)); btn.classList.add('text-white'); }
            else btn.classList.add('bg-surface-chip', 'text-body-muted', 'hover:text-ink');
        };
        setPressed('oe-tab-income', 'income');
        setPressed('oe-tab-expense', 'expense');
        swap($('btn-submit-oe'), 'solid', 'solid');
        swap($('oe-form-bar'), 'bar', 'bar');
        swap($('oe-history-bar'), 'bar', 'bar');
        const sourceLabel = $('oe-source-label');
        if (sourceLabel) sourceLabel.innerHTML = `${k.sourceLabel} <span class="text-red-500">*</span>`;
        const formTitle = $('oe-form-title');
        if (formTitle) formTitle.innerHTML = `<i class="fa-solid fa-pen-to-square ${k.text}"></i> บันทึก${k.label}`;
        const histTitle = $('oe-history-title');
        if (histTitle) histTitle.innerHTML = `<i class="fa-solid fa-clock-rotate-left ${k.text}"></i> ประวัติ${k.label}`;
        const th = $('oe-th-source');
        if (th) th.textContent = k.sourceLabel;
        const btnText = $('btn-submit-oe-text');
        if (btnText) btnText.textContent = `บันทึก${k.label}`;
    }

    function renderEntries() {
        const body = $('oe-table-body');
        if (!body) return;
        const k = KIND[oeKind];
        const count = $('oe-result-count');
        const total = $('oe-total');
        if (!oeEntries.length) {
            body.innerHTML = oeStateRow(`ยังไม่มีรายการ${k.label}ในช่วงเวลานี้`);
            if (count) count.textContent = '';
            if (total) total.textContent = '';
            return;
        }
        body.innerHTML = oeEntries.map(e => {
            const cat = e.category_id && e.category_id.category_name || '-';
            const group = e.group_id ? `${e.group_id.group_code} ${e.group_id.group_name}` : '-';
            const acc = e.account_id ? `${e.account_id.account_code} ${e.account_id.account_name}` : '-';
            const date = new Date(e.entry_date).toLocaleDateString('th-TH', { day: '2-digit', month: 'short', year: 'numeric' });
            return `<tr class="hover:bg-field/30 transition-colors">
                <td class="px-6 py-4 text-ink">${oeEsc(date)}</td>
                <td class="px-6 py-4 text-ink font-medium">${oeEsc(e.source)}</td>
                <td class="px-6 py-4 text-ink/80">
                    <div class="text-ink">${oeEsc(acc)}</div>
                    <div class="text-xs text-body-muted">${oeEsc(cat)} · ${oeEsc(group)}</div>
                </td>
                <td class="px-6 py-4 text-ink/70 whitespace-normal">${oeEsc(e.remark) || '<span class="text-body-muted">-</span>'}</td>
                <td class="px-6 py-4 text-right font-semibold ${k.amountClass}">${k.sign}${oeMoney(e.amount)}</td>
                <td class="px-6 py-4 text-right">
                    <button type="button" data-oe-delete="${oeEsc(e._id)}" aria-label="ลบรายการ ${oeEsc(e.source)}"
                        class="w-9 h-9 inline-flex items-center justify-center rounded-md text-body-muted hover:text-red-400 hover:bg-field/50 transition-colors cursor-pointer">
                        <i class="fa-solid fa-trash-can"></i>
                    </button>
                </td>
            </tr>`;
        }).join('');
        if (count) count.textContent = `${oeEntries.length} รายการ`;
        if (total) total.textContent = `รวม${k.label} ${oeMoney(oeEntries.reduce((n, e) => n + (e.amount || 0), 0))} บาท`;
    }

    async function loadEntries() {
        const kind = oeKind; // กันผู้ใช้สลับแท็บระหว่างรอ — ทิ้งผลของโหมดเก่า
        renderOeSkeleton();
        try {
            const qs = new URLSearchParams({ kind });
            const start = $('oe-filter-start')?.value;
            const end = $('oe-filter-end')?.value;
            if (start) qs.set('startDate', start);
            if (end) qs.set('endDate', end);
            const res = await authFetch(`${API_BASE_URL}/acct/other-entries?${qs}`);
            const data = await res.json();
            if (kind !== oeKind) return;
            if (!data.success) throw new Error(data.message || 'โหลดรายการไม่สำเร็จ');
            oeEntries = data.entries;
            renderEntries();
        } catch (err) {
            if (kind !== oeKind) return;
            const body = $('oe-table-body');
            if (body) body.innerHTML = oeStateRow(oeEsc(err.message), 'text-red-400');
        }
    }

    function setKind(kind) {
        if (!KIND[kind] || kind === oeKind) return;
        oeKind = kind;
        applyKindLabels();
        loadEntries();
    }

    function resetForm() {
        ['oe-source', 'oe-amount', 'oe-remark'].forEach(id => { const el = $(id); if (el) el.value = ''; });
        const date = $('oe-date');
        if (date) date.value = oeToday();
    }

    async function submitEntry() {
        if (oeSaving) return;
        const payload = {
            kind: oeKind,
            entry_date: $('oe-date')?.value,
            source: ($('oe-source')?.value || '').trim(),
            amount: Number($('oe-amount')?.value),
            category_id: $('oe-category')?.value,
            group_id: $('oe-group')?.value,
            account_id: $('oe-account')?.value,
            remark: ($('oe-remark')?.value || '').trim()
        };
        const k = KIND[oeKind];
        if (!payload.source) { showToast(`กรุณากรอก${k.sourceLabel}`, 'warning'); return; }
        if (!(payload.amount > 0)) { showToast('จำนวนเงินต้องมากกว่า 0', 'warning'); return; }
        if (!payload.category_id || !payload.group_id || !payload.account_id) {
            showToast('กรุณาเลือกหมวด กลุ่มบัญชี และรหัสบัญชีให้ครบ', 'warning'); return;
        }
        oeSaving = true;
        const btn = $('btn-submit-oe');
        if (btn) btn.disabled = true;
        try {
            // POST ห้าม retry อัตโนมัติ (authFetch retry เฉพาะ GET) — กดซ้ำระหว่างบันทึกถูกกันด้วย oeSaving
            const res = await authFetch(`${API_BASE_URL}/acct/other-entries`, {
                method: 'POST',
                headers: { 'Content-Type': 'application/json' },
                body: JSON.stringify(payload)
            });
            const data = await res.json();
            if (!data.success) throw new Error(data.message || 'บันทึกไม่สำเร็จ');
            showToast(`บันทึก${k.label}เรียบร้อย`, 'success');
            resetForm();
            await loadEntries();
        } catch (err) {
            showToast(err.message, 'error');
        } finally {
            oeSaving = false;
            if (btn) btn.disabled = false;
        }
    }

    function deleteEntry(id) {
        const e = oeEntries.find(x => String(x._id) === String(id));
        if (!e) return;
        // การลบย้อนไม่ได้ ต้องผ่าน showConfirm() ของระบบ (ข้อ 11.12 ข้อ 11)
        showConfirm(`ลบรายการ${KIND[oeKind].label}`,
            `ต้องการลบ "${oeEsc(e.source)}" จำนวน ${oeMoney(e.amount)} บาท หรือไม่<br><span class="text-xs text-ink/70">การลบนี้ย้อนกลับไม่ได้</span>`,
            async () => {
                try {
                    const res = await authFetch(`${API_BASE_URL}/acct/other-entries/${id}`, { method: 'DELETE' });
                    const data = await res.json();
                    if (!data.success) throw new Error(data.message || 'ลบไม่สำเร็จ');
                    showToast('ลบรายการเรียบร้อย', 'success');
                    await loadEntries();
                } catch (err) {
                    showToast(err.message, 'error');
                }
            }, 'ลบ', 'danger');
    }

    function bindOnce() {
        if (oeBound) return;
        // view ถูก inject ใหม่ทุกครั้งที่โหลด fragment — ผูกใหม่ได้เมื่อ element เดิมหายไปเท่านั้น
        const root = $('view-other-entries');
        if (!root) return;
        oeBound = true;
        $('oe-tab-income')?.addEventListener('click', () => setKind('income'));
        $('oe-tab-expense')?.addEventListener('click', () => setKind('expense'));
        $('btn-refresh-oe')?.addEventListener('click', () => { loadMaster().catch(err => showToast(err.message, 'error')); loadEntries(); });
        $('oe-category')?.addEventListener('change', refreshGroupOptions);
        $('oe-group')?.addEventListener('change', refreshAccountOptions);
        $('oe-filter-start')?.addEventListener('change', loadEntries);
        $('oe-filter-end')?.addEventListener('change', loadEntries);
        $('btn-submit-oe')?.addEventListener('click', submitEntry);
        $('oe-table-body')?.addEventListener('click', (ev) => {
            const btn = ev.target.closest('[data-oe-delete]');
            if (btn) deleteEntry(btn.dataset.oeDelete);
        });
    }

    async function initOtherEntries() {
        bindOnce();
        const date = $('oe-date');
        if (date && !date.value) date.value = oeToday();
        applyKindLabels();
        loadEntries();
        try {
            await loadMaster();
        } catch (err) {
            showToast(err.message, 'error');
        }
    }

    window.initOtherEntries = initOtherEntries;
})();
