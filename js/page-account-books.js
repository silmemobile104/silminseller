// สมุดบัญชี (ตั้งค่าบัญชี) — เพิ่ม/แก้ไข/ลบสมุดบัญชี และกำหนดหมวดที่สมุดนั้นอยู่
// โหลดแบบ dynamic เฉพาะตอนเปิดหน้า "สมุดบัญชี" ครั้งแรกเท่านั้น
// พึ่งพา window.authFetch, window.showToast, window.showConfirm, API_BASE_URL (global จาก script.js)
// หมวดของสมุดใช้กรองฟอร์ม "รายได้และรายจ่ายอื่นๆ" (หมวด → สมุดบัญชี → รหัสบัญชี)
(function () {
    const AB_COLS = 4;
    let abBooks = [];
    let abCategories = [];
    let abBound = false;
    let abSaving = false;

    const $ = (id) => document.getElementById(id);
    const abEsc = (s) => String(s == null ? '' : s)
        .replace(/&/g, '&amp;').replace(/</g, '&lt;').replace(/>/g, '&gt;')
        .replace(/"/g, '&quot;').replace(/'/g, '&#39;');
    const abId = (v) => (v && typeof v === 'object' ? v._id : v) || '';
    const th = (a, b) => String(a || '').localeCompare(String(b || ''), 'th', { numeric: true });

    const stateRow = (message, extraClass = 'text-ink/50 italic') =>
        `<tr><td colspan="${AB_COLS}" class="px-6 py-8 text-center ${extraClass}">${message}</td></tr>`;

    // แถวโครงร่างระหว่างรอข้อมูล — ต้องเรียกก่อน await เสมอ (ข้อ 11.7)
    const renderSkeleton = (rowCount = 4) => {
        const body = $('account-book-table-body');
        if (!body) return;
        const cell = '<td class="px-6 py-4"><div class="h-4 rounded bg-skeleton animate-pulse"></div></td>';
        body.innerHTML = Array.from({ length: rowCount }, () => `<tr>${cell.repeat(AB_COLS)}</tr>`).join('');
    };

    function render() {
        const body = $('account-book-table-body');
        if (!body) return;
        const q = ($('account-book-search')?.value || '').trim().toLowerCase();
        const catName = (id) => (abCategories.find(c => c._id === id) || {}).category_name || '';
        const rows = abBooks
            .filter(b => !q || `${b.book_code} ${b.book_name} ${catName(abId(b.category_id))}`.toLowerCase().includes(q))
            .sort((a, b) => th(a.book_code, b.book_code));
        const count = $('account-book-count');
        if (count) count.textContent = rows.length ? `${rows.length} สมุดบัญชี` : '';
        if (!rows.length) {
            body.innerHTML = stateRow(abBooks.length ? 'ไม่พบสมุดบัญชีที่ค้นหา' : 'ยังไม่มีสมุดบัญชี กดปุ่ม "เพิ่มสมุดบัญชี" เพื่อเริ่มต้น');
            return;
        }
        body.innerHTML = rows.map(b => {
            const cat = catName(abId(b.category_id));
            return `<tr class="hover:bg-divider transition-colors">
                <td class="px-6 py-4"><span class="font-mono font-semibold text-accent-ink">${abEsc(b.book_code)}</span></td>
                <td class="px-6 py-4 text-ink font-medium">${abEsc(b.book_name)}</td>
                <td class="px-6 py-4 text-ink/80">${cat ? abEsc(cat) : '<span class="text-state-pending italic">ยังไม่กำหนดหมวด</span>'}</td>
                <td class="px-6 py-4 text-right whitespace-nowrap">
                    <button type="button" data-ab-edit="${abEsc(b._id)}" aria-label="แก้ไขสมุดบัญชี ${abEsc(b.book_code)}"
                        class="w-9 h-9 inline-flex items-center justify-center rounded-md text-ink hover:text-accent-ink transition-colors cursor-pointer"><i class="fa-solid fa-pen-to-square"></i></button>
                    <button type="button" data-ab-delete="${abEsc(b._id)}" aria-label="ลบสมุดบัญชี ${abEsc(b.book_code)}"
                        class="w-9 h-9 inline-flex items-center justify-center rounded-md text-body-muted hover:text-state-danger-soft transition-colors cursor-pointer"><i class="fa-solid fa-trash-can"></i></button>
                </td>
            </tr>`;
        }).join('');
    }

    async function load() {
        renderSkeleton();
        try {
            const [bookRes, coaRes] = await Promise.all([
                authFetch(`${API_BASE_URL}/acct/account-books`),
                authFetch(`${API_BASE_URL}/acct/chart-of-accounts`)
            ]);
            const books = await bookRes.json();
            const coa = await coaRes.json();
            if (!books.success) throw new Error(books.message || 'โหลดสมุดบัญชีไม่สำเร็จ');
            if (!coa.success) throw new Error(coa.message || 'โหลดหมวดบัญชีไม่สำเร็จ');
            abBooks = books.books;
            abCategories = coa.categories.slice().sort((a, b) => th(a.category_code, b.category_code));
            render();
        } catch (err) {
            const body = $('account-book-table-body');
            if (body) body.innerHTML = stateRow(abEsc(err.message), 'text-state-danger-soft');
        }
    }

    function openModal(book) {
        const modal = $('modal-account-book');
        if (!modal) return;
        $('account-book-modal-title').textContent = book ? 'แก้ไขสมุดบัญชี' : 'เพิ่มสมุดบัญชี';
        $('account-book-id').value = book ? book._id : '';
        $('account-book-code').value = book ? book.book_code : '';
        $('account-book-name').value = book ? book.book_name : '';
        const sel = $('account-book-category');
        sel.innerHTML = '<option value="">-- เลือกหมวด --</option>' + abCategories
            .map(c => `<option value="${abEsc(c._id)}">${abEsc(c.category_code)} ${abEsc(c.category_name)}</option>`).join('');
        sel.value = book ? abId(book.category_id) : '';
        modal.classList.remove('hidden');
        sel.focus();
    }

    function closeModal() {
        $('modal-account-book')?.classList.add('hidden');
    }

    async function save() {
        if (abSaving) return;
        const _id = $('account-book-id').value;
        const payload = {
            book_code: ($('account-book-code').value || '').trim(),
            book_name: ($('account-book-name').value || '').trim(),
            category_id: $('account-book-category').value
        };
        if (_id) payload._id = _id;
        if (!payload.category_id) { showToast('กรุณาเลือกหมวดบัญชี', 'warning'); return; }
        if (!payload.book_code || !payload.book_name) { showToast('กรุณากรอกรหัสและชื่อสมุดบัญชีให้ครบ', 'warning'); return; }
        abSaving = true;
        const btn = $('account-book-save');
        if (btn) btn.disabled = true;
        try {
            // POST ห้าม retry อัตโนมัติ (authFetch retry เฉพาะ GET) — กดซ้ำระหว่างบันทึกถูกกันด้วย abSaving
            const res = await authFetch(`${API_BASE_URL}/acct/account-books`, {
                method: 'POST',
                headers: { 'Content-Type': 'application/json' },
                body: JSON.stringify(payload)
            });
            const data = await res.json();
            if (!data.success) throw new Error(data.message || 'บันทึกไม่สำเร็จ');
            showToast(_id ? 'แก้ไขสมุดบัญชีเรียบร้อย' : 'เพิ่มสมุดบัญชีเรียบร้อย', 'success');
            closeModal();
            await load();
        } catch (err) {
            showToast(err.message, 'error');
        } finally {
            abSaving = false;
            if (btn) btn.disabled = false;
        }
    }

    function confirmDelete(id) {
        const b = abBooks.find(x => x._id === id);
        if (!b) return;
        // การลบย้อนไม่ได้ ต้องผ่าน showConfirm() ของระบบ (ข้อ 11.12 ข้อ 11)
        showConfirm('ลบสมุดบัญชี',
            `ต้องการลบสมุดบัญชี <strong>${abEsc(b.book_code)} ${abEsc(b.book_name)}</strong> หรือไม่<br><span class="text-xs text-ink/70">การลบนี้ย้อนกลับไม่ได้</span>`,
            async () => {
                try {
                    const res = await authFetch(`${API_BASE_URL}/acct/account-books/${id}`, { method: 'DELETE' });
                    const data = await res.json();
                    if (!data.success) throw new Error(data.message || 'ลบไม่สำเร็จ');
                    showToast('ลบสมุดบัญชีเรียบร้อย', 'success');
                    await load();
                } catch (err) {
                    showToast(err.message, 'error');
                }
            }, 'ลบ', 'danger');
    }

    function bindOnce() {
        if (abBound || !$('view-account-books')) return;
        abBound = true;
        $('btn-add-account-book')?.addEventListener('click', () => openModal(null));
        $('account-book-search')?.addEventListener('input', render);
        $('account-book-save')?.addEventListener('click', save);
        $('account-book-cancel')?.addEventListener('click', closeModal);
        $('account-book-table-body')?.addEventListener('click', (ev) => {
            const edit = ev.target.closest('[data-ab-edit]');
            if (edit) { openModal(abBooks.find(x => x._id === edit.dataset.abEdit)); return; }
            const del = ev.target.closest('[data-ab-delete]');
            if (del) confirmDelete(del.dataset.abDelete);
        });
    }

    function initAccountBooks() {
        bindOnce();
        load();
    }

    window.initAccountBooks = initAccountBooks;
})();
