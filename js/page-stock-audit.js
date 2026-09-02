// STOCK AUDIT MODULE — ระบบตรวจนับสต็อกประจำวัน + ตรวจสอบผลสต็อก
// แยกออกมาจาก script.js — โหลดแบบ dynamic เฉพาะตอนเปิดหน้า "ตรวจนับสต็อกประจำวัน" หรือ "ตรวจสอบผลสต็อก" ครั้งแรกเท่านั้น
// พึ่งพา window.showToast, window.showConfirm, compressImage (global จาก script.js)
(function () {
    // ============================================================================
    // STOCK AUDIT MODULE — ระบบตรวจนับสต็อกประจำวัน
    // ============================================================================

    // -------------------------------------------------------------------
    // พนักงานขาย: สแกน IMEI + เด้งป๊อปอัพยืนยันพร้อมถ่ายรูปกล่อง
    // -------------------------------------------------------------------
    let _auditSessionId = null;
    let _auditPhotoBase64 = null;
    let _auditSessionData = null;
    let _expectedImeiData = [];
    let _scannedImeiSet = new Set();

    // เพจจิเนชันของตาราง "สินค้าที่ต้องตรวจนับวันนี้" — เหมือนหน้าจัดการสต็อก (script.js: stockLoadedCount/stockItemsPerPage)
    // เก็บชุดแถวที่ผ่านการกรอง/เรียงล่าสุดไว้ต่างหาก ให้ loadMoreExpectedItems() สไลซ์ทีละหน้าได้โดยไม่ต้องกรองซ้ำ
    let _expectedRenderRows = [];
    let _expectedLoadedCount = 0;
    const EXPECTED_ITEMS_PER_PAGE = 10;

    // ==========================================
    // ชิ้นส่วน UI ที่ใช้ซ้ำ (ตาม DESIGN.md ข้อ 11.5 - 11.7)
    // ==========================================

    const EXPECTED_TABLE_COLS = 6; // ตาราง "สินค้าที่ต้องตรวจนับวันนี้"
    const SCAN_TABLE_COLS = 6;     // ตาราง "รายการที่สแกนแล้ว"

    // โทนสีของป้ายสถานะ — ชุดเดียวกับที่ DESIGN.md ข้อ 11.6 กำหนดไว้
    // muted เป็นตัวที่ 4 ที่หน้านี้ต้องมีเพิ่ม เพราะ "ขายแล้ว" ไม่ใช่ทั้งสำเร็จและล้มเหลว
    // แต่เป็นเครื่องที่หลุดจากงานตรวจนับไปแล้ว (ดูข้อ 12 ของ DESIGN.md)
    const STATUS_TONE = {
        ok: { dot: 'bg-[#20D500]', bg: 'bg-[#42A231]/[0.12]', text: 'text-[#20D500]' },
        fail: { dot: 'bg-[#FE0000]', bg: 'bg-[#FE0000]/[0.12]', text: 'text-[#FE0000]' },
        working: { dot: 'bg-orange-500', bg: 'bg-orange-500/[0.12]', text: 'text-orange-400' },
        muted: { dot: 'bg-white/40', bg: 'bg-[#4D4D4D]/40', text: 'text-white/70' },
    };

    const statusBadge = (tone, label) => {
        const t = STATUS_TONE[tone] || STATUS_TONE.muted;
        return `<div class="inline-flex items-center gap-2 px-2.5 py-1 rounded-[0.375rem] ${t.bg}">`
            + `<div class="w-2 h-2 rounded-full ${t.dot}"></div>`
            + `<span class="${t.text} font-medium text-xs">${label}</span></div>`;
    };

    // ป้ายหมวดหมู่ในเซลล์ (สี / ความจุ) — ไม่มีค่าให้ใช้ "-" ไม่ปล่อยว่าง (ข้อ 11.6)
    const tagCell = (value) => value
        ? `<span class="px-2.5 py-1 rounded-[0.375rem] text-xs font-medium bg-[#4D4D4D]/40 text-white">${value}</span>`
        : '<span class="text-white/50">-</span>';

    const stateRow = (cols, message, extraClass = 'text-white/50 italic') =>
        `<tr><td colspan="${cols}" class="px-6 py-8 text-center ${extraClass}">${message}</td></tr>`;

    const skelBar = (w) => `<div class="h-3.5 ${w} rounded-full bg-[#5c5c5c] animate-pulse"></div>`;

    // แถวโครงร่างระหว่างรอข้อมูลรอบแรก (ข้อ 11.7)
    // เรียกเฉพาะตอนตารางยังว่างจริงๆ — loadTodayAuditSession() ถูกเรียกซ้ำหลังสแกนทุกครั้ง
    // ถ้าใส่โครงร่างทับของเดิมทุกรอบ ตารางจะกะพริบทั้งใบทุกครั้งที่ยิงบาร์โค้ด
    const renderAuditSkeletons = (rowCount = 6) => {
        const expected = document.getElementById('expected-items-tbody');
        if (expected && !expected.children.length) {
            let html = '';
            for (let i = 0; i < rowCount; i++) {
                html += `<tr>
                    <td class="px-6 py-4">${skelBar('w-5')}</td>
                    <td class="px-6 py-4"><div class="flex items-center gap-2">
                        <div class="w-4 h-4 rounded-full bg-[#5c5c5c] animate-pulse shrink-0"></div>
                        ${skelBar('w-44')}</div></td>
                    <td class="px-6 py-4">${skelBar('w-16')}</td>
                    <td class="px-6 py-4">${skelBar('w-20')}</td>
                    <td class="px-6 py-4">${skelBar('w-36')}</td>
                    <td class="px-6 py-4">${skelBar('w-20')}</td>
                </tr>`;
            }
            expected.innerHTML = html;
        }

        const scanned = document.getElementById('audit-scan-list');
        if (scanned && !scanned.children.length) {
            let html = '';
            for (let i = 0; i < 3; i++) {
                html += `<tr>
                    <td class="px-6 py-4">${skelBar('w-5')}</td>
                    <td class="px-6 py-4"><div class="w-10 h-10 rounded-[0.375rem] bg-[#5c5c5c] animate-pulse"></div></td>
                    <td class="px-6 py-4">${skelBar('w-36')}</td>
                    <td class="px-6 py-4">${skelBar('w-48')}</td>
                    <td class="px-6 py-4">${skelBar('w-24')}</td>
                    <td class="px-6 py-4">${skelBar('w-8 ml-auto')}</td>
                </tr>`;
            }
            scanned.innerHTML = html;
        }
    };

    const selectedText = (sel) => {
        if (!sel) return '';
        const opt = sel.options[sel.selectedIndex];
        return opt ? opt.textContent.trim() : '';
    };

    // ชิปตัวกรองที่ใช้อยู่ของตาราง "สินค้าที่ต้องตรวจนับวันนี้" (ข้อ 11.5)
    function renderExpectedChips() {
        const box = document.getElementById('expected-active-filters');
        if (!box) return;
        box.innerHTML = '';

        const searchEl = document.getElementById('expected-list-search');
        const filterEl = document.getElementById('expected-list-filter');

        const addChip = (label, onRemove) => {
            const chip = document.createElement('button');
            chip.type = 'button';
            chip.className = 'px-4 py-2.5 rounded-xl bg-[#4D4D4D]/40 border border-[#3F3F46] text-white text-sm font-medium transition-colors flex items-center gap-2';
            chip.innerHTML = `<span>${label}</span><i class="fa-solid fa-xmark text-[10px] opacity-80"></i>`;
            chip.addEventListener('click', (e) => {
                // ลบได้เฉพาะตอนคลิกที่กากบาท ตัวชิปเองไม่ตอบสนอง (ข้อ 11.5)
                if (!e.target.closest('i.fa-xmark')) return;
                onRemove();
            });
            box.appendChild(chip);
        };

        let activeCount = 0;

        const term = (searchEl && searchEl.value || '').trim();
        if (term) {
            activeCount++;
            addChip(`ค้นหา: ${term}`, () => { searchEl.value = ''; filterExpectedList(''); });
        }
        if (filterEl && filterEl.value !== 'all') {
            activeCount++;
            addChip(`สถานะ: ${selectedText(filterEl)}`, () => {
                filterEl.value = 'all';
                filterExpectedList(searchEl ? searchEl.value : '');
            });
        }

        // ปุ่มล้างทั้งหมดโผล่เมื่อมีตัวกรองมากกว่า 1 ตัวเท่านั้น (ข้อ 11.5)
        if (activeCount > 1) {
            const clearBtn = document.createElement('button');
            clearBtn.type = 'button';
            clearBtn.className = 'px-2.5 py-1 bg-red-500/10 hover:bg-red-500/15 text-red-300 rounded-full text-xs font-medium border border-red-500/30 transition-colors';
            clearBtn.textContent = 'ล้างทั้งหมด';
            clearBtn.addEventListener('click', () => {
                if (searchEl) searchEl.value = '';
                if (filterEl) filterEl.value = 'all';
                filterExpectedList('');
            });
            box.appendChild(clearBtn);
        }
    }
    function initStockAudit() {
        // วางแถวโครงร่างก่อนยิง API เสมอ ไม่ปล่อยตารางว่างระหว่างรอ (DESIGN.md ข้อ 11.7)
        // panel ไม่ได้ถูกซ่อนด้วย class="hidden" ใน HTML แล้ว (เดิมซ่อนไว้จนกว่าจะมีข้อมูลจริง
        // ผลคือแถวโครงร่างกระพริบอยู่ข้างในกล่องที่มองไม่เห็น) — แถวโครงร่างที่วางตรงนี้จึงเห็นผลทันที
        renderAuditSkeletons();

        // โหลดสถานะ session วันนี้
        loadTodayAuditSession();

        // ปุ่ม "ลองใหม่" ในแบนเนอร์ข้อผิดพลาด — ทางลองใหม่ทางเดียวหลังปุ่ม "เปิดรอบตรวจนับวันนี้"
        // ที่หัวหน้าถูกตัดออกไปแล้ว (ระบบเปิดรอบให้อัตโนมัติอยู่แล้ว ปุ่มเดิมมีไว้กรณีอัตโนมัติล้มเหลวเท่านั้น)
        const btnRetry = document.getElementById('btn-audit-load-retry');
        if (btnRetry) btnRetry.onclick = () => loadTodayAuditSession();

        // การสแกน IMEI (Step 1)
        const imeiInput = document.getElementById('audit-imei-input');
        const btnImeiVerify = document.getElementById('btn-audit-imei-verify');

        if (imeiInput) {
            imeiInput.addEventListener('keydown', (e) => {
                if (e.key === 'Enter') {
                    e.preventDefault();
                    verifyAuditImei();
                }
            });
        }
        if (btnImeiVerify) btnImeiVerify.onclick = verifyAuditImei;

        // การถ่ายรูป/เลือกรูปในหน้าต่างเด้ง (Modal Photo Input)
        const modalPhotoInput = document.getElementById('audit-modal-photo-input');
        if (modalPhotoInput) {
            modalPhotoInput.addEventListener('change', (e) => {
                const file = e.target.files[0];
                if (!file) return;
                const reader = new FileReader();
                reader.onload = async (ev) => {
                    const rawBase64 = ev.target.result;
                    const preview = document.getElementById('audit-modal-photo-preview');
                    const btnCamera = document.getElementById('btn-audit-modal-camera');

                    // Show a loading/compressing state
                    if (btnCamera) {
                        btnCamera.disabled = true;
                        btnCamera.innerHTML = '<i class="fa-solid fa-spinner fa-spin"></i> กำลังย่อภาพถ่าย...';
                    }

                    try {
                        // Compress the box photo to speed up uploads and save bandwidth
                        _auditPhotoBase64 = await compressImage(rawBase64, 1024, 1024, 0.7);
                    } catch (err) {
                        console.error('Image compression error:', err);
                        _auditPhotoBase64 = rawBase64; // Fallback
                    } finally {
                        if (btnCamera) {
                            btnCamera.disabled = false;
                            btnCamera.innerHTML = '<i class="fa-solid fa-rotate"></i> <span>ถ่ายภาพใหม่ / เปลี่ยนรูป</span>';
                        }
                    }

                    if (preview) {
                        preview.src = _auditPhotoBase64;
                        preview.classList.remove('hidden');
                    }
                };
                reader.readAsDataURL(file);
            });
        }

    }

    function verifyAuditImei() {
        if (!_auditSessionId) { showToast('กรุณาเปิดรอบตรวจนับก่อนทำการสแกน', 'error'); return; }
        const imeiInput = document.getElementById('audit-imei-input');
        const imei = imeiInput ? imeiInput.value.trim() : '';
        if (!imei) { showToast('กรุณาระบุหมายเลข IMEI', 'error'); if (imeiInput) imeiInput.focus(); return; }

        // 1. ตรวจสอบว่าเคยสแกนเครื่องนี้บันทึกเสร็จไปหรือยัง
        if (_scannedImeiSet && _scannedImeiSet.has(imei)) {
            showToast(`หมายเลข IMEI ${imei} ถูกสแกนและบันทึกข้อมูลไปแล้วในรอบนี้`, 'error');
            if (imeiInput) { imeiInput.value = ''; imeiInput.focus(); }
            return;
        }

        // 2. ตรวจสอบว่าพบในสินค้าที่ระบบคาดหวังในสาขานี้ไหม
        const foundExpected = _expectedImeiData.find(e => e.imei === imei);

        // ตั้งค่าข้อความและสีภายในหน้าต่างเด้ง (Modal)
        const modal = document.getElementById('modal-audit-verify');
        const modalTitle = document.getElementById('audit-modal-title');
        const modalImeiDisplay = document.getElementById('audit-modal-imei-display');
        const modalProductName = document.getElementById('audit-modal-product-name');

        if (modalImeiDisplay) modalImeiDisplay.textContent = imei;

        // ผลการตรวจใช้ป้ายจุดสีชุดเดียวกับตาราง (ข้อ 11.6) แทนจุดเปล่าๆ ที่หัวโมดัล
        // ป้ายมีทั้งสีและข้อความ จึงไม่ต้องพึ่งสีอย่างเดียวในการสื่อความหมาย
        if (foundExpected) {
            if (modalTitle) modalTitle.textContent = 'พบสินค้าในระบบ';
            if (modalProductName) {
                modalProductName.className = 'flex flex-wrap items-center gap-2 pt-1';
                modalProductName.innerHTML = statusBadge('ok', 'พบในระบบ')
                    + `<span class="text-white text-sm font-medium">${foundExpected.product_name}</span>`;
            }
        } else {
            if (modalTitle) modalTitle.textContent = 'ไม่พบสินค้าในระบบคลัง';
            if (modalProductName) {
                modalProductName.className = 'flex flex-wrap items-center gap-2 pt-1';
                modalProductName.innerHTML = statusBadge('fail', 'ไม่พบในระบบ')
                    + '<span class="text-white text-sm font-medium">สินค้านอกแผน / ไม่พบในคลังสาขานี้</span>';
            }
        }

        // เคลียร์ค่าค้างเก่าใน Modal
        _auditPhotoBase64 = null;
        const preview = document.getElementById('audit-modal-photo-preview');
        const btnCamera = document.getElementById('btn-audit-modal-camera');
        const notesInput = document.getElementById('audit-modal-notes');
        const photoInput = document.getElementById('audit-modal-photo-input');

        if (preview) { preview.src = ''; preview.classList.add('hidden'); }
        if (btnCamera) btnCamera.innerHTML = '<i class="fa-solid fa-camera text-base"></i> <span>เปิดกล้อง / เลือกรูป</span>';
        if (notesInput) notesInput.value = '';
        if (photoInput) photoInput.value = '';

        // แสดง Modal
        if (modal) {
            modal.classList.remove('hidden');
            modal.classList.add('flex');
            const content = modal.querySelector('.modal-content');
            if (content) {
                content.classList.remove('scale-95');
                content.classList.add('scale-100');
            }
        }
    }

    function closeAuditVerifyModal(instant = false) {
        const modal = document.getElementById('modal-audit-verify');
        const cleanFields = () => {
            _auditPhotoBase64 = null;
            const preview = document.getElementById('audit-modal-photo-preview');
            const btnCamera = document.getElementById('btn-audit-modal-camera');
            const notesInput = document.getElementById('audit-modal-notes');
            const photoInput = document.getElementById('audit-modal-photo-input');
            if (preview) { preview.src = ''; preview.classList.add('hidden'); }
            if (btnCamera) btnCamera.innerHTML = '<i class="fa-solid fa-camera text-base"></i> <span>เปิดกล้อง / เลือกรูป</span>';
            if (notesInput) notesInput.value = '';
            if (photoInput) photoInput.value = '';

            const imeiInput = document.getElementById('audit-imei-input');
            if (imeiInput) {
                imeiInput.value = '';
                imeiInput.focus();
                imeiInput.select();
            }
        };

        if (modal) {
            const content = modal.querySelector('.modal-content');
            if (instant) {
                modal.classList.add('hidden');
                modal.classList.remove('flex');
                if (content) {
                    content.classList.remove('scale-100');
                    content.classList.add('scale-95');
                }
                cleanFields();
            } else {
                if (content) {
                    content.classList.remove('scale-100');
                    content.classList.add('scale-95');
                }
                setTimeout(() => {
                    modal.classList.add('hidden');
                    modal.classList.remove('flex');
                    cleanFields();
                }, 150);
            }
        } else {
            cleanFields();
        }
    }

    async function submitModalAuditItem() {
        if (!_auditSessionId) return;
        const imeiDisplay = document.getElementById('audit-modal-imei-display');
        const imei = imeiDisplay ? imeiDisplay.textContent.trim() : '';
        if (!imei) { showToast('ไม่พบข้อมูล IMEI', 'error'); closeAuditVerifyModal(); return; }

        // บังคับแนบภาพถ่ายหลักฐานกล่องสินค้าก่อนบันทึก
        if (!_auditPhotoBase64) {
            showToast('⚠️ กรุณาถ่ายรูปกล่องสินค้าหรือเลือกรูปภาพหลักฐานก่อนบันทึก', 'error');
            return;
        }

        const btn = document.getElementById('btn-audit-modal-submit');
        if (btn) {
            btn.disabled = true;
            btn.innerHTML = '<i class="fa-solid fa-spinner fa-spin"></i> กำลังบันทึกข้อมูล...';
        }

        try {
            const token = localStorage.getItem('silmin_token');
            const notes = document.getElementById('audit-modal-notes')?.value || '';
            const body = { imei, scan_notes: notes, box_photo_base64: _auditPhotoBase64 };

            const r = await fetch(`/api/stock-audit/sessions/${_auditSessionId}/scan`, {
                method: 'POST',
                headers: { 'Authorization': `Bearer ${token}`, 'Content-Type': 'application/json' },
                body: JSON.stringify(body)
            });
            const d = await r.json();
            if (d.success) {
                showToast(d.message || 'ยืนยันการตรวจสอบสำเร็จ', 'success');
                closeAuditVerifyModal(true); // ปิด popup อัตโนมัติทันทีหลังสำเร็จ
                loadTodayAuditSession();
            } else {
                showToast(d.message || 'เกิดข้อผิดพลาดในการบันทึกข้อมูล', 'error');
            }
        } catch (err) {
            console.error(err);
            showToast('ไม่สามารถเชื่อมต่อเซิร์ฟเวอร์ได้', 'error');
        } finally {
            if (btn) {
                btn.disabled = false;
                btn.innerHTML = '<i class="fa-solid fa-circle-check"></i> ยืนยันการตรวจสอบ';
            }
        }
    }

    let _autoCreatingAudit = false;

    async function autoCreateAuditSession() {
        try {
            const token = localStorage.getItem('silmin_token');
            const r = await fetch('/api/stock-audit/sessions', {
                method: 'POST',
                headers: { 'Authorization': `Bearer ${token}`, 'Content-Type': 'application/json' }
            });
            const d = await r.json();
            return !!d.success;
        } catch (e) {
            console.error('[AUDIT] autoCreateAuditSession connection error:', e);
            return false;
        }
    }

    async function loadTodayAuditSession() {
        const errorBanner = document.getElementById('audit-load-error');
        if (errorBanner) errorBanner.classList.add('hidden'); // เริ่มความพยายามใหม่ ซ่อนข้อความผิดพลาดของรอบก่อนทิ้งไป

        try {
            const token = localStorage.getItem('silmin_token');
            const r = await fetch('/api/stock-audit/sessions/today', {
                headers: { 'Authorization': `Bearer ${token}` }
            });
            const d = await r.json();
            if (!d.success) return;

            const panel = document.getElementById('audit-session-panel');
            const badge = document.getElementById('audit-session-status-badge');

            if (!d.data) {
                if (_autoCreatingAudit) return;
                _autoCreatingAudit = true;

                // panel ไม่ถูกซ่อนแล้ว (เปลี่ยนจากเดิม) — แถวโครงร่างที่ renderAuditSkeletons() วางไว้ตอนเปิดหน้า
                // ต้องโผล่ให้เห็นตั้งแต่ตอนนี้ ไม่ใช่แค่หลังได้ข้อมูลจริงแล้ว ไม่งั้น animate-pulse จะไม่มีใครเห็นเลย
                if (badge) badge.classList.add('hidden');

                const autoSuccess = await autoCreateAuditSession();
                _autoCreatingAudit = false;
                if (autoSuccess) {
                    await loadTodayAuditSession();
                } else {
                    // ไม่มีปุ่ม "เปิดรอบตรวจนับวันนี้" ที่หัวหน้าแล้ว (ถูกตัดออกตามที่แจ้ง) —
                    // แบนเนอร์นี้คือทางลองใหม่ทางเดียวที่เหลืออยู่ ถ้าไม่แสดง ผู้ใช้จะติดอยู่กับ
                    // แถวโครงร่างที่กระพริบค้างไปเรื่อยๆ โดยไม่รู้ว่าต้องทำอะไรต่อ
                    showToast('ไม่สามารถเปิดรอบตรวจนับอัตโนมัติได้', 'error');
                    if (errorBanner) errorBanner.classList.remove('hidden');
                }
                return;
            }

            const { session, items, expectedImeis } = d.data;
            _auditSessionId = session._id;
            _auditSessionData = d.data;

            if (panel) panel.classList.remove('hidden');

            // อัพเดต badge — ป้ายจุดสีตาม DESIGN.md ข้อ 11.6
            // "กำลังตรวจนับ" กับ "รอการอนุมัติ" ใช้โทนเดียวกัน (ระหว่างดำเนินการ) เพราะข้อ 11.6
            // มีแค่ 3 โทน ตัวข้อความในป้ายเป็นตัวแยกความหมายของสองสถานะนี้เอง
            if (badge) {
                const statusTones = {
                    'กำลังตรวจนับ': 'working',
                    'รอการอนุมัติ': 'working',
                    'อนุมัติแล้ว': 'ok',
                    'ปิดโดยอัตโนมัติ': 'muted'
                };
                badge.className = 'inline-flex';
                badge.innerHTML = statusBadge(statusTones[session.status] || 'muted', session.status);
            }

            // อัพเดต progress
            const scannedCount = document.getElementById('audit-scanned-count');
            const expectedCount = document.getElementById('audit-expected-count');
            const progressBar = document.getElementById('audit-progress-bar');
            const progressPct = document.getElementById('audit-progress-pct');
            const branchName = document.getElementById('audit-branch-name');
            const sessionDate = document.getElementById('audit-session-date');

            const scannedImeiSet = new Set((items || []).map(i => i.imei));
            const total = expectedImeis.length;
            const resolved = expectedImeis.filter(e => scannedImeiSet.has(e.imei) || e.sold).length;
            const pct = total > 0 ? Math.min(100, Math.round((resolved / total) * 100)) : 0;

            if (scannedCount) scannedCount.textContent = resolved;
            if (expectedCount) expectedCount.textContent = total;
            if (progressBar) progressBar.style.width = `${pct}%`;
            if (progressPct) progressPct.textContent = `${pct}% สำเร็จ`;
            if (branchName) branchName.textContent = session.branch_id?.name || '—';
            if (sessionDate) sessionDate.textContent = new Date(session.session_date).toLocaleDateString('th-TH', { weekday: 'long', year: 'numeric', month: 'long', day: 'numeric' });

            // แสดง scan area หรือแสดงสถานะ
            const scanArea = document.getElementById('audit-scan-area');
            const submitArea = document.getElementById('audit-submit-area');
            const submittedMsg = document.getElementById('audit-submitted-msg');
            const approvedMsg = document.getElementById('audit-approved-msg');

            if (session.status === 'กำลังตรวจนับ' || session.status === 'รอการอนุมัติ') {
                if (scanArea) scanArea.classList.remove('hidden');
                if (submitArea) submitArea.classList.add('hidden');
                if (submittedMsg) submittedMsg.classList.add('hidden');
                if (approvedMsg) approvedMsg.classList.add('hidden');
            } else if (session.status === 'อนุมัติแล้ว') {
                if (scanArea) scanArea.classList.add('hidden');
                if (submitArea) submitArea.classList.add('hidden');
                if (submittedMsg) submittedMsg.classList.add('hidden');
                if (approvedMsg) approvedMsg.classList.remove('hidden');
            }

            // render scan lists
            renderAuditScanList(items);
            renderExpectedList(expectedImeis, items);

        } catch (err) {
            console.error('[AUDIT] loadTodayAuditSession error:', err);
        }
    }

    // -------------------------------------------------------------------
    // ตารางสินค้าที่ต้องตรวจนับวันนี้
    // -------------------------------------------------------------------
    function renderExpectedList(expectedImeis, scannedItems) {
        _expectedImeiData = expectedImeis || [];
        _scannedImeiSet = new Set((scannedItems || []).map(i => i.imei));

        const pill = document.getElementById('expected-list-pill');
        const summaryEl = document.getElementById('expected-list-summary');
        const total = _expectedImeiData.length;
        const resolved = _expectedImeiData.filter(e => _scannedImeiSet.has(e.imei) || e.sold).length;
        const pending = total - resolved;

        if (pill) {
            if (pending === 0 && total > 0) {
                pill.className = 'px-2.5 py-1 rounded-[0.375rem] text-xs font-medium bg-[#42A231]/[0.12] text-[#20D500]';
                pill.textContent = `ครบ ${total} เครื่อง`;
            } else {
                pill.className = 'px-2.5 py-1 rounded-[0.375rem] text-xs font-medium bg-[#4D4D4D]/40 text-white';
                pill.textContent = `${total} เครื่อง`;
            }
        }
        if (summaryEl) {
            summaryEl.textContent = total > 0 ? `สแกนแล้ว ${resolved} · รอสแกน ${pending}` : '';
        }

        // ถ้าผู้ใช้ตั้งตัวกรองไว้ ต้องเรนเดอร์ผ่านตัวกรองเดิม ไม่ใช่โยนรายการเต็มทับ
        // ไม่งั้นชิป "สถานะ: รอสแกน" จะยังค้างอยู่ทั้งที่ตารางกลับไปแสดงทุกแถวแล้ว
        const searchEl = document.getElementById('expected-list-search');
        const filterEl = document.getElementById('expected-list-filter');
        const hasFilter = (searchEl && searchEl.value.trim()) || (filterEl && filterEl.value !== 'all');
        if (hasFilter) {
            filterExpectedList(searchEl ? searchEl.value : '');
            return;
        }

        // เรียง IMEI ตามชื่อสินค้า แล้วค่า (รอสแกนก่อน)
        const sorted = [..._expectedImeiData].sort((a, b) => {
            const aScanned = (_scannedImeiSet.has(a.imei) || a.sold) ? 1 : 0;
            const bScanned = (_scannedImeiSet.has(b.imei) || b.sold) ? 1 : 0;
            if (aScanned !== bScanned) return aScanned - bScanned;
            return a.product_name.localeCompare(b.product_name, 'th');
        });

        _renderExpectedTable(sorted);
        renderExpectedChips();
    }

    // แถวเดียวของตาราง "สินค้าที่ต้องตรวจนับวันนี้" — แยกออกมาจาก _renderExpectedTable
    // เพื่อให้ loadMoreExpectedItems() เรียกซ้ำได้ทีละชุดโดยไม่ต้องวน map ทั้งอาเรย์ใหม่ทุกครั้ง
    const expectedRowHtml = (e, idx) => {
        const isScanned = _scannedImeiSet.has(e.imei);
        const isSold = !!e.sold;

        // แถวที่จบงานแล้วถูกทอนด้วย "สีที่จางลง" ไม่ใช่ opacity ของทั้งแถว
        // opacity-* ไปทับซ้อนกับสีที่จางอยู่แล้ว จนอัตราส่วนความต่างของ IMEI เหลือราว 2.4:1 (ต่ำกว่า WCAG AA)
        const rowClass = 'hover:bg-[#464646]';

        let badgeHtml, imeiHtml;
        if (isScanned) {
            badgeHtml = statusBadge('ok', 'สแกนแล้ว');
            imeiHtml = `<span class="font-mono font-semibold text-[#FFE169]/70 line-through">${e.imei}</span>`;
        } else if (isSold) {
            badgeHtml = statusBadge('muted', 'ขายแล้ว');
            imeiHtml = `<span class="font-mono font-semibold text-[#FFE169]/70 line-through">${e.imei}</span>`;
        } else {
            badgeHtml = statusBadge('working', 'รอสแกน');
            imeiHtml = `<span class="font-mono font-semibold text-[#FFE169]">${e.imei}</span>`
                + `<button type="button" onclick="fillImeiInput('${e.imei}')" title="กรอก IMEI นี้ลงช่องสแกน"`
                + ` aria-label="กรอก IMEI ${e.imei} ลงช่องสแกน"`
                + ` class="text-white hover:text-[#FFE169] transition-colors p-2"><i class="fa-solid fa-arrow-up-from-bracket text-xs"></i></button>`;
        }

        // จุดสีหน้าชื่อสินค้า — สร้างจากตัวสร้างกลางเท่านั้น (ข้อ 11.14)
        // ข้อมูลชุดนี้ส่งมาแค่ "ชื่อสี" ไม่มีเอกสารสี จึงให้ resolveProductColorHex เดาจากชื่อ
        const dot = (typeof window.productColorDot === 'function')
            ? window.productColorDot(e.color, null)
            : '';

        return `
        <tr class="${rowClass} transition-colors" data-imei="${e.imei}" data-name="${e.product_name}" data-status="${isScanned ? 'scanned' : (isSold ? 'sold' : 'pending')}">
            <td class="px-6 py-4 text-white/70">${idx + 1}</td>
            <td class="px-6 py-4">
                <p class="font-medium ${isSold ? 'text-white/70' : 'text-white'} flex items-center gap-2">${dot}<span>${e.product_name}</span></p>
            </td>
            <td class="px-6 py-4">${tagCell(e.color)}</td>
            <td class="px-6 py-4">${tagCell(e.capacity)}</td>
            <td class="px-6 py-4">${imeiHtml}</td>
            <td class="px-6 py-4">${badgeHtml}</td>
        </tr>`;
    };

    // โหลดแถวชุดถัดไป (EXPECTED_ITEMS_PER_PAGE แถว) มาต่อท้ายตารางที่มีอยู่ — เหมือน loadMoreStockProducts ใน script.js
    function loadMoreExpectedItems() {
        const tbody = document.getElementById('expected-items-tbody');
        if (!tbody) return;
        const total = _expectedRenderRows.length;
        if (_expectedLoadedCount >= total) return;

        const startIdx = _expectedLoadedCount;
        const nextBatch = _expectedRenderRows.slice(startIdx, startIdx + EXPECTED_ITEMS_PER_PAGE);
        tbody.insertAdjacentHTML('beforeend', nextBatch.map((e, i) => expectedRowHtml(e, startIdx + i)).join(''));
        _expectedLoadedCount += nextBatch.length;

        // ถ้าโหลดแล้วเนื้อหายังไม่ล้นพื้นที่ที่มองเห็น (#main-content ไม่มี scrollbar)
        // scroll event จะไม่มีวันยิงและแถวที่เหลือจะเข้าถึงไม่ได้ตลอดไป โหลดเพิ่มต่อจนกว่าจะล้นหรือหมด
        const container = document.getElementById('main-content');
        if (container && _expectedLoadedCount < total && container.scrollHeight <= container.clientHeight) {
            loadMoreExpectedItems();
        }
    }

    function _renderExpectedTable(rows) {
        const tbody = document.getElementById('expected-items-tbody');
        if (!tbody) return;

        // ตัวนับผลลัพธ์ — ตัวหารคือจำนวนเครื่องทั้งหมดของรอบ ไม่ใช่จำนวนแถวที่โหลดมาแสดง (ข้อ 11.5)
        const countEl = document.getElementById('expected-result-count');
        if (countEl) {
            countEl.textContent = _expectedImeiData.length
                ? `แสดง ${rows.length} จาก ${_expectedImeiData.length} รายการ`
                : '';
        }

        _expectedRenderRows = rows;
        _expectedLoadedCount = 0;
        tbody.innerHTML = '';

        if (!rows.length) {
            tbody.innerHTML = stateRow(EXPECTED_TABLE_COLS,
                _expectedImeiData.length ? 'ไม่พบสินค้าที่ตรงกับตัวกรอง' : 'ไม่พบสินค้าที่ต้องตรวจนับในสาขานี้');
            return;
        }

        loadMoreExpectedItems();
    }

    // Infinite scroll ของตาราง "สินค้าที่ต้องตรวจนับวันนี้" — ผูกกับ #main-content ครั้งเดียวตอนไฟล์นี้ถูกโหลด
    // (ไม่ผูกใน initStockAudit() เพราะฟังก์ชันนั้นถูกเรียกซ้ำทุกครั้งที่เข้าหน้านี้ จะได้ listener ซ้อนกันเพิ่มเรื่อยๆ)
    // เช็ก visibility ของ #view-stock-audit ในตัว handler เอง เหมือนที่ script.js ทำกับ #view-stock
    const _mainContentForExpectedScroll = document.getElementById('main-content');
    if (_mainContentForExpectedScroll) {
        _mainContentForExpectedScroll.addEventListener('scroll', () => {
            const viewEl = document.getElementById('view-stock-audit');
            if (!viewEl || viewEl.classList.contains('hidden')) return;
            const { scrollTop, scrollHeight, clientHeight } = _mainContentForExpectedScroll;
            if (scrollHeight - scrollTop - clientHeight < 200) {
                loadMoreExpectedItems();
            }
        });
    }

    function toggleExpectedList() {
        const body = document.getElementById('expected-list-body');
        const chevron = document.getElementById('expected-list-chevron');
        const btn = document.getElementById('btn-toggle-expected-list');
        if (!body) return;
        const isHidden = body.classList.toggle('hidden');
        if (chevron) {
            chevron.style.transform = isHidden ? 'rotate(180deg)' : 'rotate(0deg)';
        }
        // ปุ่มนี้เป็นตัวย่อ/ขยายจริง จึงต้องบอกสถานะให้โปรแกรมอ่านหน้าจอรู้ด้วย
        if (btn) btn.setAttribute('aria-expanded', String(!isHidden));
    }

    function filterExpectedList(searchVal) {
        const tbody = document.getElementById('expected-items-tbody');
        if (!tbody) return;
        const q = (searchVal || '').toLowerCase().trim();
        const statusFilter = document.getElementById('expected-list-filter')?.value || 'all';

        let filtered = _expectedImeiData.filter(e => {
            const matchText = !q || e.imei.toLowerCase().includes(q) || e.product_name.toLowerCase().includes(q);
            const isScanned = _scannedImeiSet.has(e.imei);
            const matchStatus = statusFilter === 'all'
                || (statusFilter === 'scanned' && isScanned)
                || (statusFilter === 'pending' && !isScanned);
            return matchText && matchStatus;
        });

        // re-sort: รอสแกนก่อน
        filtered.sort((a, b) => {
            const aS = _scannedImeiSet.has(a.imei) ? 1 : 0;
            const bS = _scannedImeiSet.has(b.imei) ? 1 : 0;
            if (aS !== bS) return aS - bS;
            return a.product_name.localeCompare(b.product_name, 'th');
        });

        _renderExpectedTable(filtered);
        renderExpectedChips();
    }

    function fillImeiInput(imei) {
        const input = document.getElementById('audit-imei-input');
        if (input) {
            input.value = imei;
            input.focus();
            // เลื่อนไปที่ scan area
            const scanArea = document.getElementById('audit-scan-area');
            if (scanArea) scanArea.scrollIntoView({ behavior: 'smooth', block: 'center' });
        }
    }

    function renderAuditScanList(items) {
        const list = document.getElementById('audit-scan-list');
        const countEl = document.getElementById('audit-scan-list-count');
        if (!list) return;
        // ตารางนี้ไม่มีตัวกรอง จึงไม่มี "จาก M" ให้เทียบ (ต่างจากตัวนับตามข้อ 11.5)
        if (countEl) countEl.textContent = items.length ? `ทั้งหมด ${items.length} รายการ` : '';

        if (items.length === 0) {
            list.innerHTML = stateRow(SCAN_TABLE_COLS, 'ยังไม่มีรายการ เริ่มสแกน IMEI เลย');
            return;
        }

        list.innerHTML = items.map((item, idx) => {
            const badgeHtml = item.is_expected
                ? statusBadge('ok', 'พบในระบบ')
                : statusBadge('fail', 'ไม่พบในระบบ');

            const photoHtml = item.box_photo_url
                ? `<a href="${item.box_photo_url}" target="_blank" rel="noreferrer" title="เปิดรูปกล่องขนาดเต็ม"
                     class="block w-10 h-10 rounded-[0.375rem] overflow-hidden border border-[#3F3F46] hover:border-[#FFE169] transition-colors">
                     <img src="${item.box_photo_url}" referrerpolicy="no-referrer" class="w-full h-full object-cover" loading="lazy" width="40" height="40" alt="รูปกล่องสินค้าของ IMEI ${item.imei}" />
                   </a>`
                : `<div class="w-10 h-10 rounded-[0.375rem] bg-[#4D4D4D]/40 border border-[#3F3F46] flex items-center justify-center text-white/50">
                     <i class="fa-solid fa-image text-sm"></i>
                   </div>`;

            // ลบได้เฉพาะรอบที่ยังตรวจนับอยู่ — ตรวจสิทธิ์ก่อนเรนเดอร์ปุ่ม และยังผ่าน showConfirm() อีกชั้น (ข้อ 11.6)
            const canDelete = _auditSessionData?.session?.status === 'กำลังตรวจนับ';
            const deleteBtn = canDelete
                ? `<button type="button" onclick="deleteAuditItem('${item.imei}')" title="ลบรายการนี้ออกจากรอบตรวจนับ"
                     aria-label="ลบ IMEI ${item.imei} ออกจากรอบตรวจนับ"
                     class="text-white hover:text-red-400 transition-colors p-2"><i class="fa-solid fa-trash"></i></button>`
                : '<span class="text-white/50">-</span>';

            return `
            <tr class="hover:bg-[#464646] transition-colors">
                <td class="px-6 py-4 text-white/70">${idx + 1}</td>
                <td class="px-6 py-4">${photoHtml}</td>
                <td class="px-6 py-4"><span class="font-mono font-semibold text-[#FFE169]">${item.imei}</span></td>
                <td class="px-6 py-4">
                    <p class="font-medium text-white">${item.product_name}</p>
                    ${item.scan_notes ? `<p class="text-xs text-white/70">${item.scan_notes}</p>` : ''}
                </td>
                <td class="px-6 py-4">${badgeHtml}</td>
                <td class="px-6 py-4 text-right"><div class="flex items-center justify-end gap-1">${deleteBtn}</div></td>
            </tr>`;
        }).join('');
    }

    async function deleteAuditItem(imei) {
        if (!_auditSessionId) return;

        showConfirm('ยืนยันลบรายการ', `คุณต้องการลบ IMEI ${imei} ออกจากรอบตรวจนับนี้ใช่หรือไม่?`, async () => {
            try {
                const token = localStorage.getItem('silmin_token');
                const r = await fetch(`/api/stock-audit/sessions/${_auditSessionId}/scan/${encodeURIComponent(imei)}`, {
                    method: 'DELETE', headers: { 'Authorization': `Bearer ${token}` }
                });
                const d = await r.json();
                if (d.success) { showToast(d.message); loadTodayAuditSession(); }
                else showToast(d.message || 'เกิดข้อผิดพลาด', 'error');
            } catch (e) { showToast('ไม่สามารถเชื่อมต่อเซิร์ฟเวอร์ได้', 'error'); }
        });
    }

    // -------------------------------------------------------------------
    // พนักงานสต็อก: ตรวจสอบและอนุมัติผล
    // -------------------------------------------------------------------
    let _reviewCurrentSessionId = null;
    let _reviewCurrentSessionStatus = '';
    let _reviewCurrentSessionItems = [];
    let _reviewActiveFilter = 'รอตรวจสอบ';


    const REVIEW_SESSIONS_COLS = 5; // ตาราง "รอบการตรวจนับ" — วันที่/สาขา, ผู้เปิดรอบ, ความคืบหน้า, สถานะ, จัดการ
    const REVIEW_ITEMS_COLS = 5;    // ตารายการที่สแกนในรอบที่เลือก — รูปกล่อง, IMEI, สินค้า/ผู้สแกน, สถานะ, จัดการ

    // สถานะ "รอบ" กับสถานะ "รายการสแกนแต่ละชิ้น" คนละชุดกัน แต่ใช้โทน ok/fail/working/muted ร่วมกัน
    // (ดู STATUS_TONE ด้านบน — เป็นโทนเดียวที่ทั้งไฟล์นี้และ DESIGN.md ข้อ 11.6 กำหนดไว้)
    const SESSION_STATUS_TONE = {
        'กำลังตรวจนับ': 'working',
        'รอการอนุมัติ': 'working',
        'อนุมัติแล้ว': 'ok',
        'ปิดโดยอัตโนมัติ': 'muted'
    };
    const ITEM_STATUS_TONE = {
        'รอตรวจสอบ': 'working',
        'ผ่าน': 'ok',
        'ไม่ผ่าน': 'fail',
        'ตรวจใหม่': 'working' // ยังไม่มีโทนที่ 5 ใน DESIGN.md — จัดเป็น "ยังไม่จบงาน" กลุ่มเดียวกับรอตรวจสอบ
    };

    // แถวโครงร่างของตาราง "รอบการตรวจนับ" — เรียกก่อน await เสมอ ไม่ปล่อยตารางว่าง (ข้อ 11.7)
    const renderReviewSessionsSkeleton = (rowCount = 6) => {
        const tbody = document.getElementById('audit-review-sessions-tbody');
        if (!tbody) return;
        let html = '';
        for (let i = 0; i < rowCount; i++) {
            html += `<tr>
                <td class="px-6 py-4"><div class="space-y-1.5">${skelBar('w-40')}${skelBar('w-24 h-3')}</div></td>
                <td class="px-6 py-4">${skelBar('w-28')}</td>
                <td class="px-6 py-4">${skelBar('w-20 mx-auto')}</td>
                <td class="px-6 py-4">${skelBar('w-24')}</td>
                <td class="px-6 py-4">${skelBar('w-8 ml-auto')}</td>
            </tr>`;
        }
        tbody.innerHTML = html;
    };

    // ชิปตัวกรองที่ใช้อยู่ของตาราง "รอบการตรวจนับ" (ข้อ 11.5)
    function renderReviewSessionChips() {
        const box = document.getElementById('audit-review-active-filters');
        if (!box) return;
        box.innerHTML = '';

        const statusEl = document.getElementById('audit-review-filter-status');
        const dateTypeEl = document.getElementById('audit-review-filter-date-type');

        const addChip = (label, onRemove) => {
            const chip = document.createElement('button');
            chip.type = 'button';
            chip.className = 'px-4 py-2.5 rounded-xl bg-[#4D4D4D]/40 border border-[#3F3F46] text-white text-sm font-medium transition-colors flex items-center gap-2';
            chip.innerHTML = `<span>${label}</span><i class="fa-solid fa-xmark text-[10px] opacity-80"></i>`;
            chip.addEventListener('click', (e) => {
                if (!e.target.closest('i.fa-xmark')) return; // ลบได้เฉพาะตอนคลิกกากบาท (ข้อ 11.5)
                onRemove();
            });
            box.appendChild(chip);
        };

        let activeCount = 0;

        if (statusEl && statusEl.value) {
            activeCount++;
            addChip(`สถานะ: ${selectedText(statusEl)}`, () => { statusEl.value = ''; loadAuditReviewSessions(); });
        }
        if (dateTypeEl && dateTypeEl.value === 'custom') {
            activeCount++;
            addChip('ช่วงวัน: กำหนดเอง', () => { dateTypeEl.value = 'today'; dateTypeEl.dispatchEvent(new Event('change')); });
        }

        if (activeCount > 1) {
            const clearBtn = document.createElement('button');
            clearBtn.type = 'button';
            clearBtn.className = 'px-2.5 py-1 bg-red-500/10 hover:bg-red-500/15 text-red-300 rounded-full text-xs font-medium border border-red-500/30 transition-colors';
            clearBtn.textContent = 'ล้างทั้งหมด';
            clearBtn.addEventListener('click', () => {
                if (statusEl) statusEl.value = '';
                if (dateTypeEl) dateTypeEl.value = 'today';
                if (dateTypeEl) dateTypeEl.dispatchEvent(new Event('change'));
                else loadAuditReviewSessions();
            });
            box.appendChild(clearBtn);
        }
    }

    async function loadAuditReviewSessions() {
        const listScreen = document.getElementById('audit-review-list-screen');
        const detailPanel = document.getElementById('audit-review-detail-panel');
        if (detailPanel) detailPanel.classList.add('hidden');
        if (listScreen) listScreen.classList.remove('hidden');
        _reviewCurrentSessionId = null;
        _reviewCurrentSessionStatus = '';
        _reviewCurrentSessionItems = [];
        _reviewActiveFilter = 'รอตรวจสอบ';

        const tbody = document.getElementById('audit-review-sessions-tbody');
        const countEl = document.getElementById('audit-review-result-count');
        renderReviewSessionsSkeleton(); // วางโครงร่างก่อน await เสมอ (ข้อ 11.7)
        renderReviewSessionChips();

        const filter = document.getElementById('audit-review-filter-status')?.value || '';
        const dateType = document.getElementById('audit-review-filter-date-type')?.value || 'today';
        const startDateVal = document.getElementById('audit-review-start-date')?.value || '';
        const endDateVal = document.getElementById('audit-review-end-date')?.value || '';

        const token = localStorage.getItem('silmin_token');
        try {
            const params = new URLSearchParams();
            if (filter) params.set('status', filter);

            if (dateType === 'today') {
                const todayStr = new Date().toLocaleDateString('en-CA');
                params.set('startDate', todayStr);
                params.set('endDate', todayStr);
            } else if (dateType === 'custom') {
                if (startDateVal) params.set('startDate', startDateVal);
                if (endDateVal) params.set('endDate', endDateVal);
            }

            const r = await fetch(`/api/stock-audit/sessions?${params}`, { headers: { 'Authorization': `Bearer ${token}` } });
            const d = await r.json();
            if (!d.success || !d.data?.length) {
                if (tbody) tbody.innerHTML = stateRow(REVIEW_SESSIONS_COLS, 'ไม่พบรอบการตรวจนับสต็อก');
                if (countEl) countEl.textContent = '';
            } else {
                if (tbody) tbody.innerHTML = d.data.map(session => {
                    const tone = SESSION_STATUS_TONE[session.status] || 'muted';
                    return `
                    <tr class="hover:bg-[#464646] transition-colors">
                        <td class="px-6 py-4">
                            <p class="font-medium text-white">${new Date(session.session_date).toLocaleDateString('th-TH', { weekday: 'long', year: 'numeric', month: 'long', day: 'numeric' })}</p>
                            <p class="text-xs text-white/70">${session.branch_id?.name || '—'}</p>
                        </td>
                        <td class="px-6 py-4 text-white">${session.created_by?.name || 'ระบบอัตโนมัติ'}</td>
                        <td class="px-6 py-4 text-center text-white font-medium">${session.total_items_scanned}<span class="text-xs text-white/70 font-normal"> / ${session.total_items_expected}</span></td>
                        <td class="px-6 py-4">${statusBadge(tone, session.status)}</td>
                        <td class="px-6 py-4 text-right">
                            <button type="button" onclick="openAuditReviewDetail('${session._id}')" title="ดูรายละเอียด"
                                class="text-white hover:text-[#FFE169] transition-colors p-2">
                                <i class="fa-solid fa-circle-info"></i>
                            </button>
                        </td>
                    </tr>`;
                }).join('');
                if (countEl) countEl.textContent = `ทั้งหมด ${d.data.length} รายการ`;
            }

            // Wire up filter & refresh
            const filterSel = document.getElementById('audit-review-filter-status');
            const btnRefresh = document.getElementById('btn-refresh-audit-review');
            if (filterSel) filterSel.onchange = loadAuditReviewSessions;
            if (btnRefresh) btnRefresh.onclick = loadAuditReviewSessions;

            const filterDateType = document.getElementById('audit-review-filter-date-type');
            const customStartDate = document.getElementById('audit-review-start-date');
            const customEndDate = document.getElementById('audit-review-end-date');
            const todayStr = new Date().toLocaleDateString('en-CA');

            if (customStartDate && !customStartDate.value) customStartDate.value = todayStr;
            if (customEndDate && !customEndDate.value) customEndDate.value = todayStr;

            if (filterDateType) {
                filterDateType.onchange = () => {
                    const rangeContainer = document.getElementById('audit-review-date-range-container');
                    if (rangeContainer) {
                        if (filterDateType.value === 'custom') {
                            rangeContainer.classList.remove('hidden');
                            rangeContainer.classList.add('flex');
                        } else {
                            rangeContainer.classList.add('hidden');
                            rangeContainer.classList.remove('flex');
                        }
                    }
                    loadAuditReviewSessions();
                };
            }
            if (customStartDate) customStartDate.onchange = loadAuditReviewSessions;
            if (customEndDate) customEndDate.onchange = loadAuditReviewSessions;

        } catch (e) {
            console.error('[AUDIT REVIEW] loadAuditReviewSessions:', e);
            if (tbody) tbody.innerHTML = stateRow(REVIEW_SESSIONS_COLS, 'เกิดข้อผิดพลาดในการดึงข้อมูล', 'text-red-400');
            if (countEl) countEl.textContent = '';
        }
    }

    async function openAuditReviewDetail(sessionId) {
        _reviewCurrentSessionId = sessionId;
        const listScreen = document.getElementById('audit-review-list-screen');
        const detailPanel = document.getElementById('audit-review-detail-panel');
        if (listScreen) listScreen.classList.add('hidden');
        if (detailPanel) detailPanel.classList.remove('hidden');

        // back button
        const btnBack = document.getElementById('btn-audit-review-back');
        if (btnBack) btnBack.onclick = loadAuditReviewSessions;

        const token = localStorage.getItem('silmin_token');
        try {
            const r = await fetch(`/api/stock-audit/sessions/${sessionId}`, { headers: { 'Authorization': `Bearer ${token}` } });
            const d = await r.json();
            if (!d.success) { showToast('ไม่สามารถดึงรายละเอียดได้', 'error'); return false; }

            const { session, items, summary } = d.data;
            _reviewCurrentSessionItems = items;
            _reviewCurrentSessionStatus = session.status;

            // Title
            const title = document.getElementById('audit-review-detail-title');
            if (title) title.textContent = `ตรวจนับ ${new Date(session.session_date).toLocaleDateString('th-TH')} — สาขา ${session.branch_id?.name || ''}`;

            // Render summary and items
            renderReviewSummaryBar(summary);
            renderReviewItemsGrid();

            // Close button (only if all reviewed)
            const closeArea = document.getElementById('audit-review-close-area');
            if (closeArea) {
                if ((session.status === 'รอการอนุมัติ' || session.status === 'กำลังตรวจนับ') && summary.pending === 0) {
                    closeArea.classList.remove('hidden');
                    const btnClose = document.getElementById('btn-audit-close-session');
                    if (btnClose) btnClose.onclick = () => closeAuditSession(sessionId);
                } else {
                    closeArea.classList.add('hidden');
                }
            }
            return true;

        } catch (e) {
            console.error('[AUDIT REVIEW] openAuditReviewDetail:', e);
            showToast('เกิดข้อผิดพลาด', 'error');
            return false;
        }
    }

    function renderReviewSummaryBar(summary) {
        const bar = document.getElementById('audit-review-summary-bar');
        if (!bar) return;

        // ปุ่มกดสลับแทนการ์ด KPI สีสันเดิม — สูตรทึบเหลืองตอนเลือกเดียวกับแท็บของหน้าสินค้าในสาขา (ข้อ 6)
        // จุดสีหน้าปุ่มยังคงบอกความหมาย ok/fail/working แม้ตอนไม่ได้เลือกอยู่ก็ตาม
        const tiles = [
            { key: 'all', label: 'ทั้งหมด', count: summary.total, dot: null },
            { key: 'รอตรวจสอบ', label: 'รอตรวจสอบ', count: summary.pending, dot: STATUS_TONE.working.dot },
            { key: 'ผ่าน', label: 'ผ่าน', count: summary.passed, dot: STATUS_TONE.ok.dot },
            { key: 'ไม่ผ่าน', label: 'ไม่ผ่าน', count: summary.failed, dot: STATUS_TONE.fail.dot },
        ];

        bar.innerHTML = tiles.map(t => {
            const active = _reviewActiveFilter === t.key;
            const cls = active
                ? 'bg-[#FFE169] border-[#FFE169] text-[#333333]'
                : 'bg-[#27272A] border-[#3F3F46] text-slate-300 hover:border-[#FFE169] hover:text-white';
            const dotHtml = t.dot ? `<span class="w-2 h-2 rounded-full ${t.dot} shrink-0"></span>` : '';
            const countCls = active ? '' : 'text-white/50';
            return `<button type="button" onclick="filterReviewItemsByStatus('${t.key}')"
                class="px-4 py-2.5 rounded-xl border text-sm font-bold transition-colors flex items-center gap-2 cursor-pointer ${cls}">
                ${dotHtml}<span>${t.label}</span><span class="font-mono ${countCls}">${t.count}</span>
            </button>`;
        }).join('');
    }

    function renderReviewItemsGrid() {
        const tbody = document.getElementById('audit-review-items-tbody');
        if (!tbody) return;

        let filteredItems = _reviewCurrentSessionItems;
        if (_reviewActiveFilter !== 'all') {
            filteredItems = _reviewCurrentSessionItems.filter(item => item.scan_status === _reviewActiveFilter);
        }

        if (!filteredItems.length) {
            tbody.innerHTML = stateRow(REVIEW_ITEMS_COLS,
                _reviewCurrentSessionItems.length ? 'ไม่มีรายการในสถานะนี้' : 'ยังไม่มีรายการสแกนในรอบนี้');
            return;
        }

        tbody.innerHTML = filteredItems.map(item => {
            const tone = ITEM_STATUS_TONE[item.scan_status] || 'muted';
            const photoHtml = item.box_photo_url
                ? `<a href="${item.box_photo_url}" target="_blank" rel="noreferrer" title="เปิดรูปกล่องขนาดเต็ม"
                     class="block w-10 h-10 rounded-[0.375rem] overflow-hidden border border-[#3F3F46] hover:border-[#FFE169] transition-colors">
                     <img src="${item.box_photo_url}" referrerpolicy="no-referrer" class="w-full h-full object-cover" loading="lazy" width="40" height="40" alt="รูปกล่องสินค้าของ IMEI ${item.imei}" />
                   </a>`
                : `<div class="w-10 h-10 rounded-[0.375rem] bg-[#4D4D4D]/40 border border-[#3F3F46] flex items-center justify-center text-white/50">
                     <i class="fa-solid fa-image text-sm"></i>
                   </div>`;

            const btnLabel = item.scan_status === 'รอตรวจสอบ' ? 'ตรวจสอบสินค้า' : 'ดูรายละเอียด';
            const btnIcon = item.scan_status === 'รอตรวจสอบ' ? 'fa-magnifying-glass' : 'fa-circle-info';

            return `
            <tr class="hover:bg-[#464646] transition-colors">
                <td class="px-6 py-4">${photoHtml}</td>
                <td class="px-6 py-4"><span class="font-mono font-semibold text-[#FFE169]">${item.imei}</span></td>
                <td class="px-6 py-4">
                    <p class="font-medium text-white truncate">${item.product_name}</p>
                    <p class="text-xs text-white/70">สแกนโดย ${item.scanned_by?.name || '—'}${item.scan_notes ? ` · "${item.scan_notes}"` : ''}</p>
                </td>
                <td class="px-6 py-4">${statusBadge(tone, item.scan_status)}</td>
                <td class="px-6 py-4 text-right">
                    <button type="button" onclick="openAuditReviewItemModal('${item._id}')" title="${btnLabel}"
                        aria-label="${btnLabel} IMEI ${item.imei}"
                        class="text-white hover:text-[#FFE169] transition-colors p-2">
                        <i class="fa-solid ${btnIcon}"></i>
                    </button>
                </td>
            </tr>`;
        }).join('');
    }

    function filterReviewItemsByStatus(status) {
        _reviewActiveFilter = status;
        const summary = {
            total: _reviewCurrentSessionItems.length,
            passed: _reviewCurrentSessionItems.filter(i => i.scan_status === 'ผ่าน').length,
            failed: _reviewCurrentSessionItems.filter(i => i.scan_status === 'ไม่ผ่าน').length,
            pending: _reviewCurrentSessionItems.filter(i => i.scan_status === 'รอตรวจสอบ').length
        };
        renderReviewSummaryBar(summary);
        renderReviewItemsGrid();
    }
    window.filterReviewItemsByStatus = filterReviewItemsByStatus;

    function openAuditReviewItemModal(itemId) {
        const item = _reviewCurrentSessionItems.find(i => i._id === itemId);
        if (!item) return;

        // Populating details
        const elImei = document.getElementById('audit-review-modal-imei');
        const elProduct = document.getElementById('audit-review-modal-product');
        const elScanner = document.getElementById('audit-review-modal-scanner');

        if (elImei) elImei.textContent = item.imei;
        if (elProduct) elProduct.textContent = item.product_name;
        if (elScanner) elScanner.textContent = `${item.scanned_by?.name || '—'} ${item.scan_notes ? `(${item.scan_notes})` : ''}`;

        // ป้ายสถานะที่หัวโมดัล — ใช้ตัวสร้างเดียวกับตาราง (ข้อ 11.6) แทนจุดสีเปล่าๆ เดิม
        const elIndicator = document.getElementById('audit-review-modal-indicator');
        if (elIndicator) {
            const tone = ITEM_STATUS_TONE[item.scan_status] || 'muted';
            elIndicator.innerHTML = statusBadge(tone, item.scan_status);
        }

        // Photo container
        const elPhotoContainer = document.getElementById('audit-review-modal-photo-container');
        if (elPhotoContainer) {
            elPhotoContainer.innerHTML = item.box_photo_url
                ? `<a href="${item.box_photo_url}" target="_blank" rel="noreferrer" class="block w-full h-56 rounded-xl overflow-hidden border border-[#3F3F46] hover:border-[#FFE169] transition-colors">
                   <img src="${item.box_photo_url}" referrerpolicy="no-referrer" class="w-full h-full object-cover" alt="รูปกล่องสินค้าของ IMEI ${item.imei}" />
               </a>`
                : `<div class="w-full h-48 rounded-xl bg-[#27272A] border border-[#3F3F46] flex flex-col items-center justify-center gap-2">
                   <i class="fa-solid fa-image text-white/50 text-3xl"></i>
                   <p class="text-white/50 text-xs">ไม่มีรูปกล่อง</p>
               </div>`;
        }

        // Notes area
        const isReviewable = (_reviewCurrentSessionStatus === 'รอการอนุมัติ' || _reviewCurrentSessionStatus === 'กำลังตรวจนับ') && item.scan_status === 'รอตรวจสอบ';
        const elNotesArea = document.getElementById('audit-review-modal-notes-area');
        if (elNotesArea) {
            elNotesArea.innerHTML = isReviewable
                ? `<label for="modal-review-notes-${item._id}" class="text-slate-200 font-medium flex items-center gap-2 text-xs mb-2">
                   <i class="fa-solid fa-pen text-white"></i> หมายเหตุ (ต้องระบุหาก ไม่ผ่าน/ตรวจใหม่)
               </label>
               <input id="modal-review-notes-${item._id}" type="text" placeholder="ระบุหมายเหตุ..."
                   class="w-full px-4 py-2.5 rounded-xl bg-[#27272A] border border-[#3F3F46] text-white focus:border-[#FFE169] focus:outline-none transition-all placeholder-slate-500 text-sm" />`
                : ``;
        }

        // Actions area
        const elActionsArea = document.getElementById('audit-review-modal-actions-area');
        if (elActionsArea) {
            if (isReviewable) {
                elActionsArea.innerHTML = `
                <button type="button" onclick="submitModalItemReview(this, '${item._id}', 'ผ่าน')"
                    class="flex-1 py-3 bg-emerald-600 hover:bg-emerald-500 text-white rounded-xl font-bold text-sm transition-all flex items-center justify-center gap-2 cursor-pointer">
                    <i class="fa-solid fa-check"></i> ผ่าน
                </button>
                <button type="button" onclick="submitModalItemReview(this, '${item._id}', 'ตรวจใหม่')"
                    class="flex-1 py-3 bg-violet-600 hover:bg-violet-500 text-white rounded-xl font-bold text-sm transition-all flex items-center justify-center gap-2 cursor-pointer">
                    <i class="fa-solid fa-rotate"></i> ตรวจใหม่
                </button>
                <button type="button" onclick="submitModalItemReview(this, '${item._id}', 'ไม่ผ่าน')"
                    class="flex-1 py-3 bg-red-600 hover:bg-red-500 text-white rounded-xl font-bold text-sm transition-all flex items-center justify-center gap-2 cursor-pointer">
                    <i class="fa-solid fa-xmark"></i> ไม่ผ่าน
                </button>`;
            } else {
                // Already reviewed, show status details
                elActionsArea.innerHTML = `
                <div class="w-full p-4 bg-[#27272A] rounded-xl border border-[#3F3F46] text-center flex flex-col items-center gap-2">
                    ${statusBadge(ITEM_STATUS_TONE[item.scan_status] || 'muted', item.scan_status)}
                    ${item.reviewed_by ? `<p class="text-xs text-white/70">โดย ${item.reviewed_by.name}</p>` : ''}
                    ${item.review_notes ? `<p class="text-xs text-white/70 mt-2 italic">"${item.review_notes}"</p>` : ''}
                </div>`;
            }
        }

        // Open Modal
        const modal = document.getElementById('modal-audit-review-item');
        if (modal) {
            modal.classList.remove('hidden');
            modal.classList.add('flex');
            setTimeout(() => {
                const content = modal.querySelector('.modal-content');
                if (content) {
                    content.classList.remove('scale-95');
                    content.classList.add('scale-100');
                }
            }, 50);
        }
    }

    function closeAuditReviewItemModal() {
        const modal = document.getElementById('modal-audit-review-item');
        if (modal) {
            const content = modal.querySelector('.modal-content');
            if (content) {
                content.classList.remove('scale-100');
                content.classList.add('scale-95');
            }
            setTimeout(() => {
                modal.classList.add('hidden');
                modal.classList.remove('flex');
            }, 150);
        }
    }

    async function submitModalItemReview(btnEl, itemId, status) {
        const notesEl = document.getElementById(`modal-review-notes-${itemId}`);
        const notes = notesEl ? notesEl.value.trim() : '';
        if ((status === 'ไม่ผ่าน' || status === 'ตรวจใหม่') && !notes) {
            showToast('กรุณาระบุหมายเหตุ/เหตุผลประกอบการตรวจสอบสำหรับสถานะนี้', 'error');
            if (notesEl) notesEl.focus();
            return;
        }

        // Disable all buttons in this review group
        const parentRow = btnEl.closest('.flex');
        let originalHtml = btnEl.innerHTML;
        if (parentRow) {
            parentRow.querySelectorAll('button').forEach(b => b.disabled = true);
        }
        btnEl.innerHTML = '<i class="fa-solid fa-spinner fa-spin"></i> กำลังส่ง...';

        try {
            const token = localStorage.getItem('silmin_token');
            const r = await fetch(`/api/stock-audit/items/${itemId}/review`, {
                method: 'POST',
                headers: { 'Authorization': `Bearer ${token}`, 'Content-Type': 'application/json' },
                body: JSON.stringify({ scan_status: status, review_notes: notes })
            });
            const d = await r.json();
            if (d.success) {
                showToast(d.message);
                closeAuditReviewItemModal(); // Close modal immediately
                if (_reviewCurrentSessionId) openAuditReviewDetail(_reviewCurrentSessionId);
            } else {
                showToast(d.message || 'เกิดข้อผิดพลาด', 'error');
                if (parentRow) parentRow.querySelectorAll('button').forEach(b => b.disabled = false);
                btnEl.innerHTML = originalHtml;
            }
        } catch (e) {
            showToast('ไม่สามารถเชื่อมต่อเซิร์ฟเวอร์ได้', 'error');
            if (parentRow) parentRow.querySelectorAll('button').forEach(b => b.disabled = false);
            btnEl.innerHTML = originalHtml;
        }
    }

    async function closeAuditSession(sessionId) {
        const notes = document.getElementById('audit-close-notes')?.value.trim() || '';
        // เดิมใช้ confirm() ของเบราว์เซอร์ — หน้าตาไม่ตรงกับระบบเลย และเป็นการกระทำที่ย้อนไม่ได้
        // จึงต้องผ่าน showConfirm() แบบเดียวกับ deleteAuditItem (ข้อ 11.6/11.12)
        showConfirm('ยืนยันปิดรอบ', 'ปิดรอบและอนุมัติผลการตรวจนับนี้ใช่หรือไม่? หลังปิดแล้วจะแก้ไขผลการตรวจไม่ได้อีก', async () => {
            try {
                const token = localStorage.getItem('silmin_token');
                const r = await fetch(`/api/stock-audit/sessions/${sessionId}/close`, {
                    method: 'POST',
                    headers: { 'Authorization': `Bearer ${token}`, 'Content-Type': 'application/json' },
                    body: JSON.stringify({ notes })
                });
                const d = await r.json();
                if (d.success) {
                    showToast(`ปิดรอบสำเร็จ! ผ่าน ${d.summary?.passed || 0} / ไม่ผ่าน ${d.summary?.failed || 0} รายการ`);
                    loadAuditReviewSessions();
                } else showToast(d.message || 'เกิดข้อผิดพลาด', 'error');
            } catch (e) { showToast('ไม่สามารถเชื่อมต่อเซิร์ฟเวอร์ได้', 'error'); }
        });
    }

    // Expose Stock Audit functions to the window object for inline HTML event handlers
    window.initStockAudit = initStockAudit;
    window.loadAuditReviewSessions = loadAuditReviewSessions;
    window.closeAuditVerifyModal = closeAuditVerifyModal;
    window.submitModalAuditItem = submitModalAuditItem;
    window.fillImeiInput = fillImeiInput;
    window.deleteAuditItem = deleteAuditItem;
    window.toggleExpectedList = toggleExpectedList;
    window.filterExpectedList = filterExpectedList;
    window.closeAuditSession = closeAuditSession;
    window.openAuditReviewDetail = openAuditReviewDetail;
    window.verifyAuditImei = verifyAuditImei;
    window.openAuditReviewItemModal = openAuditReviewItemModal;
    window.closeAuditReviewItemModal = closeAuditReviewItemModal;
    window.submitModalItemReview = submitModalItemReview;
})();
