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
    // สถานะรอบล่าสุดที่เคย render ไปแล้ว — ใช้กันไม่ให้แท็บเริ่มต้น (ดู loadTodayAuditSession)
    // ถูกตั้งทับแท็บที่ผู้ใช้เพิ่งกดเองซ้ำทุกครั้งที่ฟังก์ชันนี้ถูกเรียกโดยสถานะไม่ได้เปลี่ยนจริง
    let _lastAuditStatus = null;

    // ตารางรวมของหน้า (แบบ Figma "Desktop - 51"): แถว = สินค้าที่ต้องนับทั้งหมด + รายการที่สแกนได้แต่ไม่อยู่ในคลัง
    //   state: missing = ยังไม่พบ / match = ตรงกับระบบ / extra = เกินมา / sold = ขายไประหว่างรอบ (นับว่าเรียบร้อย)
    //   แท็บ: all / missing / match / extra — วาดทีละ AUDIT_PAGE_SIZE แถว กด "แสดงเพิ่ม" เพื่อต่อท้าย
    let _auditRows = [];
    let _auditTab = 'all';
    let _auditSearch = '';
    const AUDIT_PAGE_SIZE = 20;
    let _auditShown = AUDIT_PAGE_SIZE;
    let _auditBound = false; // ผูก listener ของหน้าครั้งเดียว (initStockAudit ถูกเรียกซ้ำทุกครั้งที่เข้าหน้า)

    // สลับ list-wrap/cards ให้ตรงมุมมองที่จำไว้ — ใช้กับตารางของหน้า "ตรวจสอบผลการตรวจนับสต็อก"
    const syncViewWrapVisibility = (prefix, mode) => {
        const listWrap = document.getElementById(`${prefix}-view-list-wrap`);
        const cardsWrap = document.getElementById(`${prefix}-view-cards`);
        if (listWrap) listWrap.classList.toggle('hidden', mode !== 'list');
        if (cardsWrap) cardsWrap.classList.toggle('hidden', mode !== 'card');
    };

    // ตัวแปรเดียวกันของหน้า "ตรวจสอบผลการตรวจนับสต็อก" (#stock-audit-review) — ประกาศไว้ต้นไฟล์เพราะ
    // ปุ่มสลับมุมมองถูกผูก (และเรียก _syncViewToggleButtons ทันที) ที่ top-level ของไฟล์นี้ตอนโหลดสคริปต์
    // ก่อนจุดที่ตัวแปรเหล่านี้เคยประกาศไว้เดิม (ใกล้โค้ดส่วนตรวจสอบผล) — ต้องอยู่เหนือจุดใช้งานเสมอ (TDZ ของ let)
    let _reviewSessionsViewMode = localStorage.getItem('audit_review_sessions_view_mode') === 'card' ? 'card' : 'list';
    let _reviewItemsViewMode = localStorage.getItem('audit_review_items_view_mode') === 'card' ? 'card' : 'list';
    let _reviewSessionsCache = []; // ผลลัพธ์ล่าสุดของตาราง "รอบการตรวจนับ" — สลับมุมมองแล้ว re-render ได้โดยไม่ยิง API ซ้ำ

    // ==========================================
    // ชิ้นส่วน UI ที่ใช้ซ้ำ (ตาม DESIGN.md ข้อ 11.5 - 11.7)
    // ==========================================

    const EXPECTED_TABLE_COLS = 6; // ตาราง "สินค้าที่ต้องตรวจนับวันนี้"
    const SCAN_TABLE_COLS = 6;     // ตาราง "รายการที่สแกนแล้ว"

    // โทนสีของป้ายสถานะ — ชุดเดียวกับที่ DESIGN.md ข้อ 11.6 กำหนดไว้
    // muted เป็นตัวที่ 4 ที่หน้านี้ต้องมีเพิ่ม เพราะ "ขายแล้ว" ไม่ใช่ทั้งสำเร็จและล้มเหลว
    // แต่เป็นเครื่องที่หลุดจากงานตรวจนับไปแล้ว (ดูข้อ 12 ของ DESIGN.md)
    const STATUS_TONE = {
        ok: { dot: 'bg-state-ok', bg: 'bg-state-ok-tint/[0.12]', text: 'text-state-ok' },
        fail: { dot: 'bg-state-danger', bg: 'bg-state-danger/[0.12]', text: 'text-state-danger' },
        working: { dot: 'bg-orange-500', bg: 'bg-orange-500/[0.12]', text: 'text-orange-400' },
        muted: { dot: 'bg-ink/40', bg: 'bg-panel/40', text: 'text-ink/70' },
    };

    const statusBadge = (tone, label) => {
        const t = STATUS_TONE[tone] || STATUS_TONE.muted;
        return `<div class="inline-flex items-center gap-2 px-2.5 py-1 rounded-[0.375rem] ${t.bg}">`
            + `<div class="w-2 h-2 rounded-full ${t.dot}"></div>`
            + `<span class="${t.text} font-medium text-xs">${label}</span></div>`;
    };

    const stateRow = (cols, message, extraClass = 'text-ink/50 italic') =>
        `<tr><td colspan="${cols}" class="px-6 py-8 text-center ${extraClass}">${message}</td></tr>`;

    const skelBar = (w) => `<div class="h-3.5 ${w} rounded-full bg-skeleton animate-pulse"></div>`;

    // แถวโครงร่างระหว่างรอข้อมูลรอบแรก — วางเฉพาะตอนตารางยังว่างจริงๆ
    // (loadTodayAuditSession() ถูกเรียกซ้ำหลังสแกนทุกครั้ง ถ้าวางทับทุกรอบ ตารางจะกะพริบทั้งใบ)
    const renderAuditSkeletons = (rowCount = 6) => {
        const tbody = document.getElementById('audit-items-tbody');
        const cards = document.getElementById('audit-items-cards');
        if (tbody && !tbody.children.length) {
            tbody.innerHTML = Array.from({ length: rowCount }, () => `<tr>
                <td class="px-6 py-4"><div class="flex items-center gap-2"><div class="w-4 h-4 rounded-full bg-skeleton animate-pulse shrink-0"></div>${skelBar('w-40')}</div>${skelBar('w-24 mt-2 ml-6')}</td>
                <td class="px-6 py-4">${skelBar('w-36')}</td>
                <td class="px-6 py-4">${skelBar('w-24 h-5')}</td>
                <td class="px-6 py-4">${skelBar('w-14')}</td>
                <td class="px-6 py-4">${skelBar('w-20')}</td>
                <td class="px-6 py-4">${skelBar('w-9 h-9 ml-auto')}</td>
            </tr>`).join('');
        }
        if (cards && !cards.children.length) {
            cards.innerHTML = Array.from({ length: 4 }, () => `<div class="px-4 py-4 flex items-start gap-3">
                <div class="w-4 h-4 rounded-full bg-skeleton animate-pulse shrink-0"></div>
                <div class="flex-1">${skelBar('w-40')}${skelBar('w-32 mt-2')}</div>
                ${skelBar('w-20 h-5')}
            </div>`).join('');
        }
    };

    const selectedText = (sel) => {
        if (!sel) return '';
        const opt = sel.options[sel.selectedIndex];
        return opt ? opt.textContent.trim() : '';
    };

    function initStockAudit() {
        // วางแถวโครงร่างก่อนยิง API เสมอ ไม่ปล่อยตารางว่างระหว่างรอ
        renderAuditSkeletons();

        // โหลดสถานะ session วันนี้
        loadTodayAuditSession();

        // ฟังก์ชันนี้ถูกเรียกซ้ำทุกครั้งที่เข้าหน้า — ผูก listener ครั้งเดียวพอ
        // (เดิมผูกช่องสแกนซ้ำทุกครั้ง กด Enter ครั้งเดียวจึงเปิดป๊อปอัพยืนยันซ้อนหลายรอบ)
        if (_auditBound) return;
        _auditBound = true;

        // ปุ่ม "ลองใหม่" ในแบนเนอร์ข้อผิดพลาด — ระบบเปิดรอบให้อัตโนมัติ ปุ่มนี้มีไว้กรณีอัตโนมัติล้มเหลว
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

        // แท็บ + ค้นหา + แสดงเพิ่ม ของตารางรวม
        document.querySelectorAll('#audit-item-tabs .audit-item-tab').forEach(btn =>
            btn.addEventListener('click', () => { _auditTab = btn.dataset.tab; renderAuditItems(); }));
        const search = document.getElementById('audit-item-search');
        if (search) {
            let t = null;
            search.addEventListener('input', () => {
                clearTimeout(t);
                t = setTimeout(() => { _auditSearch = search.value.trim().toLowerCase(); renderAuditItems(); }, 150);
            });
        }
        const more = document.getElementById('btn-audit-items-more');
        if (more) more.addEventListener('click', () => { _auditShown += AUDIT_PAGE_SIZE; renderAuditItems({ keepPage: true }); });

        // ปุ่มในแถว (ลบการสแกน / ใส่ IMEI ลงช่องสแกน) — ผูกแบบ delegation ที่ตัวตารางและตัวการ์ด
        const onRowAction = (e) => {
            const btn = e.target.closest('[data-audit-action]');
            if (!btn) return;
            if (btn.dataset.auditAction === 'delete') deleteAuditItem(btn.dataset.imei);
            else if (btn.dataset.auditAction === 'fill') fillImeiInput(btn.dataset.imei);
        };
        ['audit-items-tbody', 'audit-items-cards'].forEach(id => {
            const el = document.getElementById(id);
            if (el) el.addEventListener('click', onRowAction);
        });

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
                    setAuditModalSubmitEnabled(true);
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
                    + `<span class="text-ink text-sm font-medium">${foundExpected.product_name}</span>`;
            }
        } else {
            if (modalTitle) modalTitle.textContent = 'ไม่พบสินค้าในระบบคลัง';
            if (modalProductName) {
                modalProductName.className = 'flex flex-wrap items-center gap-2 pt-1';
                modalProductName.innerHTML = statusBadge('fail', 'ไม่พบในระบบ')
                    + '<span class="text-ink text-sm font-medium">สินค้านอกแผน / ไม่พบในคลังสาขานี้</span>';
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
        setAuditModalSubmitEnabled(false);

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
            setAuditModalSubmitEnabled(false);

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

    // ปิด/เปิดปุ่ม "ยืนยันการตรวจสอบ" ตามว่ามีรูปหลักฐานแล้วหรือยัง — สัญญาณ error ต้องอยู่ที่จุดเกิดเหตุ
    // (ตัวปุ่มเอง) ไม่ใช่พึ่ง toast ชั่วคราวเพียงอย่างเดียวเหมือนเดิม (STEP 3.3)
    const setAuditModalSubmitEnabled = (enabled) => {
        const btn = document.getElementById('btn-audit-modal-submit');
        if (!btn) return;
        btn.disabled = !enabled;
        btn.classList.toggle('opacity-50', !enabled);
        btn.classList.toggle('cursor-not-allowed', !enabled);
        btn.classList.toggle('cursor-pointer', enabled);
    };

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

            const badge = document.getElementById('audit-session-status-badge');

            if (!d.data) {
                if (_autoCreatingAudit) return;
                _autoCreatingAudit = true;
                if (badge) badge.classList.add('hidden');

                const autoSuccess = await autoCreateAuditSession();
                _autoCreatingAudit = false;
                if (autoSuccess) {
                    await loadTodayAuditSession();
                } else {
                    // แบนเนอร์นี้คือทางลองใหม่ทางเดียว — ถ้าไม่แสดง ผู้ใช้จะติดอยู่กับแถวโครงร่างที่กระพริบค้างไปเรื่อยๆ
                    showToast('ไม่สามารถเปิดรอบตรวจนับอัตโนมัติได้', 'error');
                    if (errorBanner) errorBanner.classList.remove('hidden');
                }
                return;
            }

            const { session, items, expectedImeis } = d.data;
            _auditSessionId = session._id;
            _auditSessionData = d.data;
            _expectedImeiData = expectedImeis || [];
            _scannedImeiSet = new Set((items || []).map(i => i.imei));

            // ---------- หัวหน้า ----------
            if (badge) {
                badge.className = 'inline-flex';
                badge.innerHTML = auditChip(AUDIT_SESSION_TONE[session.status] || 'muted', session.status);
            }
            const meta = document.getElementById('audit-session-meta');
            if (meta) {
                const parts = [
                    `รอบวันที่ ${new Date(session.session_date).toLocaleDateString('th-TH', { day: 'numeric', month: 'short', year: 'numeric' })}`,
                    `สาขา${session.branch_id?.name || ' —'}`,
                    `เปิดรอบ ${auditTime(session.createdAt)}${session.created_by?.name ? ` โดย ${session.created_by.name}` : ' (อัตโนมัติ)'}`
                ];
                meta.textContent = parts.join('  ·  ');
            }

            // ---------- แถว + ตัวเลข ----------
            _auditRows = buildAuditRows(_expectedImeiData, items || []);
            const n = countAuditRows(_auditRows);
            const total = _expectedImeiData.length;
            const resolved = n.match + n.sold; // ขายไประหว่างรอบ = ไม่ต้องหาแล้ว นับว่าเรียบร้อย (เหมือนเดิม)
            const pct = total > 0 ? Math.min(100, Math.round((resolved / total) * 100)) : 0;

            const setText = (id, text) => { const el = document.getElementById(id); if (el) el.textContent = text; };
            setText('audit-scanned-count', resolved.toLocaleString('th-TH'));
            setText('audit-expected-count', total.toLocaleString('th-TH'));
            setText('audit-progress-pct', total === 0
                ? 'ไม่มีสินค้าที่ต้องตรวจนับในสาขานี้'
                : (n.missing === 0 ? `${pct}% · ครบแล้ว พร้อมส่ง` : `${pct}% · เหลืออีก ${n.missing.toLocaleString('th-TH')} เครื่อง`));
            const bar = document.getElementById('audit-progress-bar');
            if (bar) {
                bar.style.width = `${pct}%`;
                bar.classList.toggle('bg-state-ok', pct === 100 && total > 0);
                bar.classList.toggle('bg-primary', !(pct === 100 && total > 0));
            }
            setText('audit-variance-match', n.match.toLocaleString('th-TH'));
            setText('audit-variance-missing', n.missing.toLocaleString('th-TH'));
            setText('audit-variance-extra', n.extra.toLocaleString('th-TH'));
            const soldEl = document.getElementById('audit-variance-sold');
            if (soldEl) {
                soldEl.classList.toggle('hidden', !n.sold);
                soldEl.textContent = `ขายไประหว่างรอบ ${n.sold.toLocaleString('th-TH')} เครื่อง — นับว่าเรียบร้อยแล้ว`;
            }

            // ---------- สี่สถานะของรอบ ----------
            const isCounting = session.status === 'กำลังตรวจนับ';
            const show = (id, on) => { const el = document.getElementById(id); if (el) el.classList.toggle('hidden', !on); };
            show('audit-scan-area', isCounting);
            show('audit-submitted-msg', session.status === 'รอการอนุมัติ');
            show('audit-approved-msg', session.status === 'อนุมัติแล้ว');
            show('audit-autoclosed-msg', session.status === 'ปิดโดยอัตโนมัติ');
            // ปุ่มส่งผลโผล่ทันทีที่มีรายการสแกนอย่างน้อย 1 ชิ้น — ตรงกับเงื่อนไขฝั่ง backend (ไม่บังคับครบ 100%)
            show('audit-submit-area', isCounting && (items || []).length > 0);
            setText('audit-submit-count', `${resolved.toLocaleString('th-TH')} / ${total.toLocaleString('th-TH')}`);
            const submitVar = document.getElementById('audit-submit-variance');
            if (submitVar) {
                submitVar.classList.toggle('hidden', !(n.missing || n.extra));
                submitVar.textContent = `ยังไม่พบ ${n.missing.toLocaleString('th-TH')} · เกินมา ${n.extra.toLocaleString('th-TH')}`;
            }

            // แท็บเริ่มต้นตั้งเฉพาะตอนสถานะ "เพิ่งเปลี่ยน" — ส่งผลแล้ว: เปิดแท็บที่ต้องตามต่อ (ยังไม่พบ > เกินมา)
            if (session.status !== _lastAuditStatus) {
                if (!isCounting) _auditTab = n.missing ? 'missing' : (n.extra ? 'extra' : 'all');
                else if (_lastAuditStatus !== null) _auditTab = 'all';
                _lastAuditStatus = session.status;
            }

            renderRecentScans(items || []);
            renderAuditItems({ keepPage: true });

        } catch (err) {
            console.error('[AUDIT] loadTodayAuditSession error:', err);
        }
    }

    // ------------------------------------------------------------------
    // ตัวช่วยของหน้า "ตรวจนับสต็อกประจำวัน" (แบบ Figma "Desktop - 51")
    // ------------------------------------------------------------------
    const auditEsc = (s) => String(s == null ? '' : s)
        .replace(/&/g, '&amp;').replace(/</g, '&lt;').replace(/>/g, '&gt;')
        .replace(/"/g, '&quot;').replace(/'/g, '&#39;');

    const auditTime = (d) => {
        const dt = new Date(d);
        return isNaN(dt) ? '—' : dt.toLocaleTimeString('th-TH', { hour: '2-digit', minute: '2-digit' }) + ' น.';
    };

    // ป้ายสถานะแบบแคปซูล (กดไม่ได้ — DESIGN.md §12 อนุญาตสี state เฉพาะป้ายแบบนี้)
    const AUDIT_CHIP_TONE = {
        ok: { dot: 'bg-state-ok', bg: 'bg-state-ok-tint/[0.12]', text: 'text-state-ok' },
        pending: { dot: 'bg-state-pending', bg: 'bg-state-pending/[0.12]', text: 'text-state-pending' },
        muted: { dot: 'bg-body-muted', bg: 'bg-body-muted/[0.12]', text: 'text-body-muted' }
    };
    const AUDIT_SESSION_TONE = { 'กำลังตรวจนับ': 'pending', 'รอการอนุมัติ': 'pending', 'อนุมัติแล้ว': 'ok', 'ปิดโดยอัตโนมัติ': 'muted' };
    const auditChip = (tone, label) => {
        const t = AUDIT_CHIP_TONE[tone] || AUDIT_CHIP_TONE.muted;
        return `<span class="inline-flex items-center gap-1.5 px-2.5 py-0.5 rounded-pill ${t.bg}">`
            + `<span class="w-1.5 h-1.5 rounded-full ${t.dot}"></span>`
            + `<span class="${t.text} font-semibold text-xs whitespace-nowrap">${auditEsc(label)}</span></span>`;
    };
    const AUDIT_STATE = {
        missing: ['muted', 'ยังไม่พบ'],
        match: ['ok', 'ตรงกับระบบ'],
        extra: ['pending', 'เกินมา'],
        sold: ['muted', 'ขายระหว่างรอบ']
    };

    // รวมสองแหล่ง (สินค้าที่ต้องนับ + รายการที่สแกน) เป็นแถวเดียวกัน — เรียง ยังไม่พบ > เกินมา > ตรงกับระบบ (สแกนล่าสุดก่อน) > ขายแล้ว
    const buildAuditRows = (expected, items) => {
        const itemByImei = new Map(items.map(i => [i.imei, i]));
        const expectedSet = new Set(expected.map(e => e.imei));
        const rows = expected.map(e => {
            const item = itemByImei.get(e.imei) || null;
            return {
                imei: e.imei, name: e.product_name, color: e.color || '', capacity: e.capacity || '', item,
                state: item ? 'match' : (e.sold ? 'sold' : 'missing')
            };
        });
        items.filter(i => !expectedSet.has(i.imei)).forEach(i => rows.push({
            imei: i.imei, name: i.product_name, color: '', capacity: '', item: i, state: 'extra'
        }));
        const order = { missing: 0, extra: 1, match: 2, sold: 3 };
        return rows.sort((a, b) => {
            if (order[a.state] !== order[b.state]) return order[a.state] - order[b.state];
            if (a.item && b.item) return new Date(b.item.scanned_at) - new Date(a.item.scanned_at);
            return String(a.name).localeCompare(String(b.name), 'th');
        });
    };

    const countAuditRows = (rows) => rows.reduce((c, r) => { c[r.state]++; return c; },
        { missing: 0, match: 0, extra: 0, sold: 0 });

    // จุดสี 16px หน้าชื่อสินค้า (DESIGN.md ข้อ 11.14) — วงแหวนบางกันสีดำกลืนพื้น
    //   รายการเกินไม่ทราบสี (ไม่อยู่ในคลังสาขา) จึงใช้วงกลมเส้นประแทน
    const auditColorDot = (row) => {
        if (row.state === 'extra') {
            return '<span class="w-4 h-4 rounded-full shrink-0 border border-dashed border-state-pending" title="ไม่ทราบสี (ไม่อยู่ในคลังสาขา)" aria-hidden="true"></span>';
        }
        if (!row.color) return '<span class="w-4 h-4 shrink-0" aria-hidden="true"></span>';
        const hex = typeof window.productColorHex === 'function' ? window.productColorHex(row.color) : '#8e8e93';
        return `<span class="w-4 h-4 rounded-full shrink-0 ring-1 ring-line" style="background-color:${hex};" title="${auditEsc(row.color)}" aria-hidden="true"></span>`;
    };

    const auditSubLine = (row) => {
        if (row.state === 'extra') return 'ไม่อยู่ในคลังสาขานี้';
        return [row.capacity, row.color].filter(Boolean).join(' · ');
    };

    // รูปกล่อง (หลักฐานตอนสแกน) + ปุ่มจัดการของแถว — ใช้ร่วมกันทั้งตารางและการ์ด
    //   ปุ่มไอคอนตามข้อ 11.6: ไม่มีพื้น มีแค่สีตอนชี้ และต้องมี title
    const auditRowActions = (row, isCounting) => {
        const parts = [];
        if (row.item && row.item.box_photo_url) {
            parts.push(`<a href="${auditEsc(row.item.box_photo_url)}" target="_blank" rel="noreferrer" title="เปิดรูปกล่องขนาดเต็ม"
                class="block w-8 h-8 rounded-sm overflow-hidden ring-1 ring-line hover:ring-accent-ink transition-all shrink-0">
                <img src="${auditEsc(row.item.box_photo_url)}" referrerpolicy="no-referrer" loading="lazy" width="32" height="32"
                    class="w-full h-full object-cover" alt="รูปกล่องสินค้าของ IMEI ${auditEsc(row.imei)}"></a>`);
        }
        if (isCounting && row.item) {
            parts.push(`<button type="button" data-audit-action="delete" data-imei="${auditEsc(row.imei)}" title="ลบการสแกน"
                class="w-9 h-9 flex items-center justify-center rounded-full text-body-muted hover:text-state-danger-soft hover:bg-surface-chip transition-colors cursor-pointer"
                aria-label="ลบการสแกน IMEI ${auditEsc(row.imei)}"><i class="fa-regular fa-trash-can"></i></button>`);
        } else if (isCounting && row.state === 'missing') {
            parts.push(`<button type="button" data-audit-action="fill" data-imei="${auditEsc(row.imei)}" title="ใส่ในช่องสแกน"
                class="w-9 h-9 flex items-center justify-center rounded-full text-body-muted hover:text-accent-ink hover:bg-surface-chip transition-colors cursor-pointer"
                aria-label="ใส่ IMEI ${auditEsc(row.imei)} ลงช่องสแกน"><i class="fa-solid fa-arrow-up-from-bracket"></i></button>`);
        }
        return parts.join('');
    };

    const AUDIT_TD = 'px-6 py-4 align-top';

    const auditRowHtml = (row, isCounting) => {
        const [tone, label] = AUDIT_STATE[row.state];
        const item = row.item;
        const nameCls = row.state === 'sold' ? 'text-body-muted' : 'text-ink';
        const sub = auditSubLine(row);
        return `
        <tr class="hover:bg-divider transition-colors">
            <td class="${AUDIT_TD}">
                <p class="font-medium ${nameCls} flex items-center gap-2">${auditColorDot(row)}<span>${auditEsc(row.name)}</span></p>
                ${sub ? `<p class="text-xs ${row.state === 'extra' ? 'text-state-pending' : 'text-body-muted'} mt-1 pl-6">${auditEsc(sub)}</p>` : ''}
                ${item && item.scan_notes ? `<p class="text-xs text-body-muted mt-1 pl-6 whitespace-normal">หมายเหตุ: ${auditEsc(item.scan_notes)}</p>` : ''}
            </td>
            <td class="${AUDIT_TD} font-mono text-[13px] ${row.state === 'missing' ? 'text-body-muted' : 'text-ink'}">${auditEsc(row.imei)}</td>
            <td class="${AUDIT_TD}">${auditChip(tone, label)}</td>
            <td class="${AUDIT_TD} ${item ? 'text-ink' : 'text-ink-muted-48'}">${item ? auditTime(item.scanned_at) : '-'}</td>
            <td class="${AUDIT_TD} ${item ? 'text-ink' : 'text-ink-muted-48'}">${item ? auditEsc(item.scanned_by?.name || '-') : '-'}</td>
            <td class="px-6 py-2.5 align-top"><div class="flex items-center justify-end gap-1">${auditRowActions(row, isCounting)}</div></td>
        </tr>`;
    };

    const auditCardHtml = (row, isCounting) => {
        const [tone, label] = AUDIT_STATE[row.state];
        const item = row.item;
        const nameCls = row.state === 'sold' ? 'text-body-muted' : 'text-ink';
        const actions = auditRowActions(row, isCounting);
        const sub = auditSubLine(row);
        return `
        <div class="px-4 py-4">
            <div class="flex items-start gap-3">
                <div class="min-w-0 flex-1">
                    <p class="font-medium ${nameCls} flex items-center gap-2">${auditColorDot(row)}<span class="truncate">${auditEsc(row.name)}</span></p>
                    ${sub ? `<p class="text-xs ${row.state === 'extra' ? 'text-state-pending' : 'text-body-muted'} mt-1 pl-6 truncate">${auditEsc(sub)}</p>` : ''}
                    <p class="font-mono text-[13px] ${row.state === 'missing' ? 'text-body-muted' : 'text-ink'} mt-1.5 pl-6">${auditEsc(row.imei)}</p>
                    ${item ? `<p class="text-xs text-body-muted mt-1 pl-6">สแกน ${auditTime(item.scanned_at)} · ${auditEsc(item.scanned_by?.name || '-')}</p>` : ''}
                    ${item && item.scan_notes ? `<p class="text-xs text-body-muted mt-1 pl-6">หมายเหตุ: ${auditEsc(item.scan_notes)}</p>` : ''}
                </div>
                <div class="shrink-0">${auditChip(tone, label)}</div>
            </div>
            ${actions ? `<div class="flex items-center justify-end gap-1 mt-2">${actions}</div>` : ''}
        </div>`;
    };

    // แท็บแบบ pill group (DESIGN.md ข้อ 11.9): เลือกแล้วเปลี่ยนขอบ/ตัวอักษรเป็นเหลือง พื้นไม่เปลี่ยน
    //   (ไม่ใช้พื้นเหลืองทึบ — หน้านี้เก็บปุ่มทึบไว้ให้ "ส่งผลตรวจนับ" ปุ่มเดียว)
    //   ตัวเลขในแท็บนับจากข้อมูลทั้งรอบ (ไม่ขึ้นกับช่องค้นหา)
    const AUDIT_TAB_BASE = 'audit-item-tab shrink-0 inline-flex items-center gap-2 px-4 py-2 rounded-xl bg-field text-sm cursor-pointer transition-colors';
    const AUDIT_TAB_ON = `${AUDIT_TAB_BASE} ring-1 ring-accent-ink text-accent-ink`;
    const AUDIT_TAB_OFF = `${AUDIT_TAB_BASE} text-body-muted hover:text-ink`;
    const AUDIT_TAB_COUNT_ON = 'text-xs font-semibold text-accent-ink';
    const AUDIT_TAB_COUNT_OFF = 'text-xs font-semibold text-ink-muted-48';

    // opts.keepPage = true เฉพาะ "แสดงเพิ่ม" และการโหลดรอบซ้ำหลังสแกน — เปลี่ยนแท็บ/ค้นหาเริ่มหน้าแรกใหม่
    function renderAuditItems(opts = {}) {
        const tbody = document.getElementById('audit-items-tbody');
        const cards = document.getElementById('audit-items-cards');
        const more = document.getElementById('btn-audit-items-more');
        if (!tbody) return;
        if (!opts.keepPage) _auditShown = AUDIT_PAGE_SIZE;

        const n = countAuditRows(_auditRows);
        const tabCount = { all: _auditRows.length, missing: n.missing, match: n.match, extra: n.extra };
        document.querySelectorAll('#audit-item-tabs .audit-item-tab').forEach(btn => {
            const on = btn.dataset.tab === _auditTab;
            btn.className = on ? AUDIT_TAB_ON : AUDIT_TAB_OFF;
            btn.setAttribute('aria-pressed', String(on));
            const c = btn.querySelector('[data-count]');
            if (c) { c.className = on ? AUDIT_TAB_COUNT_ON : AUDIT_TAB_COUNT_OFF; c.textContent = (tabCount[btn.dataset.tab] || 0).toLocaleString('th-TH'); }
        });

        const q = _auditSearch;
        const filtered = _auditRows.filter(r =>
            (_auditTab === 'all' || r.state === _auditTab) &&
            (!q || r.imei.toLowerCase().includes(q) || String(r.name).toLowerCase().includes(q)));
        const visible = filtered.slice(0, _auditShown);
        const isCounting = _auditSessionData?.session?.status === 'กำลังตรวจนับ';

        if (!visible.length) {
            const msg = !_auditRows.length ? 'ยังไม่มีสินค้าที่ต้องตรวจนับในสาขานี้'
                : (q ? 'ไม่พบรายการที่ตรงกับคำค้นหา'
                    : ({ missing: 'สแกนครบทุกเครื่องแล้ว', match: 'ยังไม่มีเครื่องที่สแกนตรงกับระบบ', extra: 'ไม่มีรายการเกิน' }[_auditTab] || 'ไม่มีรายการ'));
            tbody.innerHTML = stateRow(6, msg, 'text-body-muted');
            if (cards) cards.innerHTML = `<div class="py-10 text-center text-body-muted">${msg}</div>`;
        } else {
            tbody.innerHTML = visible.map(r => auditRowHtml(r, isCounting)).join('');
            if (cards) cards.innerHTML = visible.map(r => auditCardHtml(r, isCounting)).join('');
        }

        if (more) {
            const rest = filtered.length - visible.length;
            more.classList.toggle('hidden', rest <= 0);
            more.textContent = `แสดงเพิ่มอีก ${Math.min(rest, AUDIT_PAGE_SIZE).toLocaleString('th-TH')} รายการ (1–${visible.length.toLocaleString('th-TH')} จาก ${filtered.length.toLocaleString('th-TH')})`;
        }
    }

    // ผลการสแกนล่าสุด 3 รายการใต้ช่องสแกน — รายการจากเซิร์ฟเวอร์เรียงสแกนล่าสุดก่อนอยู่แล้ว
    function renderRecentScans(items) {
        const box = document.getElementById('audit-recent-scans');
        if (!box) return;
        // ยังไม่มีการสแกน — ใช้พื้นที่อธิบายขั้นตอนแทน (ขั้นถ่ายรูปกล่องเป็นขั้นที่คนใหม่มักไม่รู้ว่าต้องทำ)
        if (!items.length) {
            const step = (n, title, desc) => `
                <li class="flex items-start gap-3">
                    <span class="w-6 h-6 rounded-full bg-surface-chip text-body-muted text-xs font-semibold flex items-center justify-center shrink-0">${n}</span>
                    <div><p class="text-[13px] text-ink">${title}</p><p class="text-xs text-body-muted mt-0.5">${desc}</p></div>
                </li>`;
            box.innerHTML = '<ol class="grid grid-cols-1 md:grid-cols-3 gap-4 pt-1">'
                + step(1, 'ยิงบาร์โค้ด IMEI', 'ที่กล่องหรือตัวเครื่อง แล้วกด Enter')
                + step(2, 'ถ่ายรูปกล่อง', 'บังคับทุกเครื่อง ใช้เป็นหลักฐานตอนตรวจสอบ')
                + step(3, 'กดยืนยัน', 'เครื่องจะย้ายไปอยู่ "ตรงกับระบบ" หรือ "เกินมา"')
                + '</ol>';
            return;
        }
        const expectedByImei = new Map(_expectedImeiData.map(e => [e.imei, e]));
        box.innerHTML = '<p class="text-xs text-ink-muted-48 mb-1.5">สแกนล่าสุด</p><ul class="space-y-1">' + items.slice(0, 3).map(i => {
            const e = expectedByImei.get(i.imei);
            const ok = !!i.is_expected;
            const detail = ok
                ? [i.product_name, e && e.capacity, e && e.color].filter(Boolean).join(' · ')
                : 'ไม่พบในคลังสาขา — บันทึกเป็นรายการเกิน';
            return `<li class="flex items-center gap-2.5 text-[13px] leading-6">
                <i class="fa-solid ${ok ? 'fa-check text-state-ok' : 'fa-circle-exclamation text-state-pending'} text-[11px] w-3 text-center shrink-0"></i>
                <span class="font-mono text-ink shrink-0">${auditEsc(i.imei)}</span>
                <span class="${ok ? 'text-body-muted' : 'text-state-pending'} truncate flex-1 min-w-0">${auditEsc(detail)}</span>
                <span class="text-xs text-ink-muted-48 shrink-0">${auditTime(i.scanned_at)}</span>
            </li>`;
        }).join('') + '</ul>';
    }

    const _syncViewToggleButtons = (listBtn, cardBtn, mode) => window.syncViewToggleButtons(listBtn, cardBtn, mode);

    // สลับมุมมองของหน้า "ตรวจสอบผลการตรวจนับสต็อก" (#stock-audit-review) — ตาราง "รอบการตรวจนับ"
    const reviewSessionsViewListBtn = document.getElementById('audit-review-sessions-view-list');
    const reviewSessionsViewCardBtn = document.getElementById('audit-review-sessions-view-card');
    if (reviewSessionsViewListBtn && reviewSessionsViewCardBtn) {
        const apply = (mode) => {
            _reviewSessionsViewMode = mode;
            localStorage.setItem('audit_review_sessions_view_mode', mode);
            _syncViewToggleButtons(reviewSessionsViewListBtn, reviewSessionsViewCardBtn, mode);
            renderReviewSessionsResults();
        };
        reviewSessionsViewListBtn.addEventListener('click', () => apply('list'));
        reviewSessionsViewCardBtn.addEventListener('click', () => apply('card'));
        _syncViewToggleButtons(reviewSessionsViewListBtn, reviewSessionsViewCardBtn, _reviewSessionsViewMode);
    }

    // สลับมุมมองของตาราง "รายการที่สแกนในรอบที่เลือก" (หน้าจอ B ของ #stock-audit-review)
    const reviewItemsViewListBtn = document.getElementById('audit-review-items-view-list');
    const reviewItemsViewCardBtn = document.getElementById('audit-review-items-view-card');
    if (reviewItemsViewListBtn && reviewItemsViewCardBtn) {
        const apply = (mode) => {
            _reviewItemsViewMode = mode;
            localStorage.setItem('audit_review_items_view_mode', mode);
            _syncViewToggleButtons(reviewItemsViewListBtn, reviewItemsViewCardBtn, mode);
            renderReviewItemsGrid();
        };
        reviewItemsViewListBtn.addEventListener('click', () => apply('list'));
        reviewItemsViewCardBtn.addEventListener('click', () => apply('card'));
        _syncViewToggleButtons(reviewItemsViewListBtn, reviewItemsViewCardBtn, _reviewItemsViewMode);
    }

    // ส่งผลการตรวจนับให้พนักงานสต็อกตรวจสอบ — ผูกครั้งเดียวตอนไฟล์นี้ถูกโหลด (เหตุผลเดียวกับปุ่มอื่นด้านบน)
    // เดิมปุ่มนี้มีอยู่ใน HTML แต่ไม่เคยถูกผูก handler เลย ทำให้สแกนครบแล้วส่งผลจากหน้านี้ไม่ได้
    const btnAuditSubmit = document.getElementById('btn-audit-submit');
    if (btnAuditSubmit) {
        btnAuditSubmit.addEventListener('click', () => {
            if (!_auditSessionId) return;
            showConfirm(
                'ยืนยันส่งผลตรวจนับ',
                'ส่งผลการตรวจนับให้พนักงานสต็อกตรวจสอบ? หลังส่งแล้วจะสแกนเพิ่มไม่ได้จนกว่าจะถูกตีกลับให้ตรวจใหม่',
                async () => {
                    btnAuditSubmit.disabled = true;
                    btnAuditSubmit.classList.add('opacity-60', 'cursor-not-allowed');
                    try {
                        const token = localStorage.getItem('silmin_token');
                        const r = await fetch(`/api/stock-audit/sessions/${_auditSessionId}/submit`, {
                            method: 'POST', headers: { 'Authorization': `Bearer ${token}` }
                        });
                        const d = await r.json();
                        if (d.success) {
                            showToast(d.message);
                            await loadTodayAuditSession();
                        } else {
                            showToast(d.message || 'เกิดข้อผิดพลาด', 'error');
                            btnAuditSubmit.disabled = false;
                            btnAuditSubmit.classList.remove('opacity-60', 'cursor-not-allowed');
                        }
                    } catch (e) {
                        showToast('ไม่สามารถเชื่อมต่อเซิร์ฟเวอร์ได้', 'error');
                        btnAuditSubmit.disabled = false;
                        btnAuditSubmit.classList.remove('opacity-60', 'cursor-not-allowed');
                    }
                }
            );
        });
    }

    // ปุ่ม "ใส่ในช่องสแกน" ของแถวที่ยังไม่พบ — กรอก IMEI ให้แล้วเลื่อนขึ้นไปที่ช่องสแกน (ยังต้องกดตรวจนับ + ถ่ายรูปกล่องเอง)
    function fillImeiInput(imei) {
        const input = document.getElementById('audit-imei-input');
        if (input) {
            input.value = imei;
            input.focus();
            const scanArea = document.getElementById('audit-scan-area');
            if (scanArea) scanArea.scrollIntoView({ behavior: 'smooth', block: 'center' });
        }
    }

    async function deleteAuditItem(imei) {
        if (!_auditSessionId) return;

        showConfirm('ยืนยันลบรายการ',
            `ลบ IMEI <span class="font-mono text-accent-ink">${imei}</span> ออกจากรอบตรวจนับนี้? รูปกล่องและหมายเหตุที่บันทึกไว้จะหายไปด้วย ต้องสแกนใหม่อีกครั้งถ้ายังต้องนับเครื่องนี้`,
            async () => {
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
    // _reviewSessionsViewMode / _reviewItemsViewMode / _reviewSessionsCache ประกาศไว้ต้นไฟล์แล้ว (ดูคอมเมนต์ตรงนั้น)

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
        syncViewWrapVisibility('audit-review-sessions', _reviewSessionsViewMode);
        const tbody = document.getElementById('audit-review-sessions-tbody');
        const cardsWrap = document.getElementById('audit-review-sessions-view-cards');
        if (!tbody) return;

        if (_reviewSessionsViewMode === 'card' && cardsWrap) {
            cardsWrap.innerHTML = Array.from({ length: rowCount }, () => `
                <div class="elev-card bg-surface-tile-3 rounded-md p-3.5">
                    <div class="flex items-start justify-between gap-2">
                        <div class="space-y-1.5 flex-1">${skelBar('w-32')}${skelBar('w-20 h-3')}</div>
                        ${skelBar('w-20 h-5')}
                    </div>
                    <div class="flex items-center justify-between mt-3.5 pt-3 border-t border-hairline">
                        ${skelBar('w-24')}
                        ${skelBar('w-16')}
                    </div>
                </div>
            `).join('');
            return;
        }

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
            chip.className = 'elev-card px-4 py-2.5 rounded-xl bg-panel/40 text-ink text-sm font-medium transition-colors flex items-center gap-2';
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
            clearBtn.className = 'px-2.5 py-1 bg-red-500/10 hover:bg-red-500/15 text-red-300 rounded-full text-xs font-medium ring-1 ring-red-500/30 transition-colors';
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

    // ข้อมูลที่คำนวณร่วมกันระหว่างแถวตารางกับการ์ดของตาราง "รอบการตรวจนับ"
    const buildReviewSessionData = (session) => ({
        tone: SESSION_STATUS_TONE[session.status] || 'muted',
        dateStr: new Date(session.session_date).toLocaleDateString('th-TH', { weekday: 'long', year: 'numeric', month: 'long', day: 'numeric' }),
        branchName: session.branch_id?.name || '—',
        createdByName: session.created_by?.name || 'ระบบอัตโนมัติ'
    });

    const reviewSessionRowHtml = (session) => {
        const d = buildReviewSessionData(session);
        return `
        <tr class="hover:bg-divider transition-colors">
            <td class="px-6 py-4">
                <p class="font-medium text-ink">${d.dateStr}</p>
                <p class="text-xs text-ink/70">${d.branchName}</p>
            </td>
            <td class="px-6 py-4 text-ink">${d.createdByName}</td>
            <td class="px-6 py-4 text-center text-ink font-medium">${session.total_items_scanned}<span class="text-xs text-ink/70 font-normal"> / ${session.total_items_expected}</span></td>
            <td class="px-6 py-4">${statusBadge(d.tone, session.status)}</td>
            <td class="px-6 py-4 text-right">
                <button type="button" onclick="openAuditReviewDetail('${session._id}')" title="ดูรายละเอียด"
                    class="text-ink hover:text-accent-ink transition-colors p-2">
                    <i class="fa-solid fa-circle-info"></i>
                </button>
            </td>
        </tr>`;
    };

    // การ์ด — โครง: หัว (วันที่+สาขา / สถานะ) · footer (ผู้เปิดรอบ+ความคืบหน้า) — คลิกทั้งใบเปิดรายละเอียดได้เหมือนปุ่ม
    const reviewSessionCardHtml = (session) => {
        const d = buildReviewSessionData(session);
        return `
        <div class="elev-card bg-surface-tile-3 rounded-md p-3.5 transition-all hover:-translate-y-1 border-none cursor-pointer"
             onclick="openAuditReviewDetail('${session._id}')">
            <div class="flex items-start justify-between gap-2">
                <div class="min-w-0">
                    <p class="font-medium text-ink truncate">${d.dateStr}</p>
                    <p class="text-xs text-ink/70 mt-0.5">${d.branchName}</p>
                </div>
                <div class="shrink-0">${statusBadge(d.tone, session.status)}</div>
            </div>
            <div class="flex items-center justify-between mt-3.5 pt-3 border-t border-hairline">
                <span class="text-xs text-ink/70 truncate">${d.createdByName}</span>
                <span class="text-ink font-medium text-sm shrink-0">${session.total_items_scanned}<span class="text-xs text-ink/70 font-normal"> / ${session.total_items_expected}</span></span>
            </div>
        </div>`;
    };

    // จุดเดียวที่ตัดสินว่าจะ render ตารางหรือการ์ด — ใช้ทั้งตอน fetch เสร็จและตอนแค่สลับมุมมอง (อ่านจาก _reviewSessionsCache)
    function renderReviewSessionsResults() {
        const tbody = document.getElementById('audit-review-sessions-tbody');
        const cardsWrap = document.getElementById('audit-review-sessions-view-cards');
        const countEl = document.getElementById('audit-review-result-count');
        if (!tbody) return;

        const listWrap = document.getElementById('audit-review-sessions-view-list-wrap');
        if (listWrap) listWrap.classList.toggle('hidden', _reviewSessionsViewMode !== 'list');
        if (cardsWrap) cardsWrap.classList.toggle('hidden', _reviewSessionsViewMode !== 'card');

        if (!_reviewSessionsCache.length) {
            const msg = 'ไม่พบรอบการตรวจนับสต็อก';
            tbody.innerHTML = stateRow(REVIEW_SESSIONS_COLS, msg);
            if (cardsWrap) cardsWrap.innerHTML = `<div class="col-span-full py-12 text-center text-ink/50 italic">${msg}</div>`;
            if (countEl) countEl.textContent = '';
            return;
        }

        if (_reviewSessionsViewMode === 'card') {
            if (cardsWrap) cardsWrap.innerHTML = _reviewSessionsCache.map(reviewSessionCardHtml).join('');
            tbody.innerHTML = '';
        } else {
            tbody.innerHTML = _reviewSessionsCache.map(reviewSessionRowHtml).join('');
            if (cardsWrap) cardsWrap.innerHTML = '';
        }
        if (countEl) countEl.textContent = `ทั้งหมด ${_reviewSessionsCache.length} รายการ`;
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
            _reviewSessionsCache = (d.success && Array.isArray(d.data)) ? d.data : [];
            renderReviewSessionsResults();

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
                ? 'bg-primary ring-1 ring-accent-ink text-on-primary apple-active-accent'
                : 'elev-field bg-field text-body-muted hover:ring-1 hover:ring-accent-ink hover:text-ink';
            const dotHtml = t.dot ? `<span class="w-2 h-2 rounded-full ${t.dot} shrink-0"></span>` : '';
            const countCls = active ? '' : 'text-ink/50';
            return `<button type="button" onclick="filterReviewItemsByStatus('${t.key}')"
                class="elev-chip tab-toggle-btn px-4 py-2.5 rounded-xl text-sm font-bold transition-colors flex items-center gap-2 cursor-pointer ${cls}">
                ${dotHtml}<span>${t.label}</span><span class="font-mono ${countCls}">${t.count}</span>
            </button>`;
        }).join('');
    }

    // ข้อมูลที่คำนวณร่วมกันระหว่างแถวตารางกับการ์ดของตาราง "รายการที่สแกนในรอบที่เลือก"
    const buildReviewItemData = (item) => {
        const tone = ITEM_STATUS_TONE[item.scan_status] || 'muted';
        const photoHtmlSmall = item.box_photo_url
            ? `<a href="${item.box_photo_url}" target="_blank" rel="noreferrer" title="เปิดรูปกล่องขนาดเต็ม"
                 class="elev-chip block w-10 h-10 rounded-[0.375rem] overflow-hidden hover:ring-1 hover:ring-accent-ink transition-colors">
                 <img src="${item.box_photo_url}" referrerpolicy="no-referrer" class="w-full h-full object-cover" loading="lazy" width="40" height="40" alt="รูปกล่องสินค้าของ IMEI ${item.imei}" />
               </a>`
            : `<div class="elev-card w-10 h-10 rounded-[0.375rem] bg-panel/40 flex items-center justify-center text-ink/50">
                 <i class="fa-solid fa-image text-sm"></i>
               </div>`;
        // การ์ดมีที่ทางมากกว่าแถวตาราง — รูปกล่องขยายเป็น 56px แทน 40px (สูตรเดียวกับตาราง "รายการที่สแกนแล้ว" ในหน้าตรวจนับ)
        const photoHtmlLarge = item.box_photo_url
            ? `<a href="${item.box_photo_url}" target="_blank" rel="noreferrer" title="เปิดรูปกล่องขนาดเต็ม"
                 class="elev-chip block w-14 h-14 rounded-[0.375rem] overflow-hidden hover:ring-1 hover:ring-accent-ink transition-colors shrink-0">
                 <img src="${item.box_photo_url}" referrerpolicy="no-referrer" class="w-full h-full object-cover" loading="lazy" width="56" height="56" alt="รูปกล่องสินค้าของ IMEI ${item.imei}" />
               </a>`
            : `<div class="elev-card w-14 h-14 rounded-[0.375rem] bg-panel/40 flex items-center justify-center text-ink/50 shrink-0">
                 <i class="fa-solid fa-image text-lg"></i>
               </div>`;
        const btnLabel = item.scan_status === 'รอตรวจสอบ' ? 'ตรวจสอบสินค้า' : 'ดูรายละเอียด';
        const btnIcon = item.scan_status === 'รอตรวจสอบ' ? 'fa-magnifying-glass' : 'fa-circle-info';
        return { tone, photoHtmlSmall, photoHtmlLarge, btnLabel, btnIcon };
    };

    const reviewItemRowHtml = (item) => {
        const d = buildReviewItemData(item);
        return `
        <tr class="hover:bg-divider transition-colors">
            <td class="px-6 py-4">${d.photoHtmlSmall}</td>
            <td class="px-6 py-4"><span class="font-mono font-semibold text-accent-ink">${item.imei}</span></td>
            <td class="px-6 py-4">
                <p class="font-medium text-ink truncate">${item.product_name}</p>
                <p class="text-xs text-ink/70">สแกนโดย ${item.scanned_by?.name || '—'}${item.scan_notes ? ` · "${item.scan_notes}"` : ''}</p>
            </td>
            <td class="px-6 py-4">${statusBadge(d.tone, item.scan_status)}</td>
            <td class="px-6 py-4 text-right">
                <button type="button" onclick="openAuditReviewItemModal('${item._id}')" title="${d.btnLabel}"
                    aria-label="${d.btnLabel} IMEI ${item.imei}"
                    class="text-ink hover:text-accent-ink transition-colors p-2">
                    <i class="fa-solid ${d.btnIcon}"></i>
                </button>
            </td>
        </tr>`;
    };

    // การ์ด — คลิกทั้งใบเปิด modal ตรวจสอบ/ดูรายละเอียดได้เหมือนปุ่ม
    const reviewItemCardHtml = (item) => {
        const d = buildReviewItemData(item);
        return `
        <div class="elev-card bg-surface-tile-3 rounded-md p-3.5 transition-all hover:-translate-y-1 border-none cursor-pointer"
             onclick="openAuditReviewItemModal('${item._id}')">
            <div class="flex items-start gap-3">
                ${d.photoHtmlLarge}
                <div class="min-w-0 flex-1">
                    <span class="font-mono font-semibold text-accent-ink text-xs">${item.imei}</span>
                    <p class="font-medium text-ink mt-0.5 truncate">${item.product_name}</p>
                    <p class="text-xs text-ink/70 mt-0.5 truncate">สแกนโดย ${item.scanned_by?.name || '—'}${item.scan_notes ? ` · "${item.scan_notes}"` : ''}</p>
                </div>
            </div>
            <div class="flex items-center justify-between mt-3.5 pt-3 border-t border-hairline">
                ${statusBadge(d.tone, item.scan_status)}
                <button type="button" onclick="event.stopPropagation(); openAuditReviewItemModal('${item._id}')" title="${d.btnLabel}"
                    aria-label="${d.btnLabel} IMEI ${item.imei}"
                    class="text-ink hover:text-accent-ink transition-colors p-2">
                    <i class="fa-solid ${d.btnIcon}"></i>
                </button>
            </div>
        </div>`;
    };

    function renderReviewItemsGrid() {
        const tbody = document.getElementById('audit-review-items-tbody');
        const cardsWrap = document.getElementById('audit-review-items-view-cards');
        if (!tbody) return;

        const listWrap = document.getElementById('audit-review-items-view-list-wrap');
        if (listWrap) listWrap.classList.toggle('hidden', _reviewItemsViewMode !== 'list');
        if (cardsWrap) cardsWrap.classList.toggle('hidden', _reviewItemsViewMode !== 'card');

        let filteredItems = _reviewCurrentSessionItems;
        if (_reviewActiveFilter !== 'all') {
            filteredItems = _reviewCurrentSessionItems.filter(item => item.scan_status === _reviewActiveFilter);
        }

        if (!filteredItems.length) {
            const msg = _reviewCurrentSessionItems.length ? 'ไม่มีรายการในสถานะนี้' : 'ยังไม่มีรายการสแกนในรอบนี้';
            tbody.innerHTML = stateRow(REVIEW_ITEMS_COLS, msg);
            if (cardsWrap) cardsWrap.innerHTML = `<div class="col-span-full py-12 text-center text-ink/50 italic">${msg}</div>`;
            return;
        }

        if (_reviewItemsViewMode === 'card') {
            if (cardsWrap) cardsWrap.innerHTML = filteredItems.map(reviewItemCardHtml).join('');
            tbody.innerHTML = '';
        } else {
            tbody.innerHTML = filteredItems.map(reviewItemRowHtml).join('');
            if (cardsWrap) cardsWrap.innerHTML = '';
        }
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
                ? `<a href="${item.box_photo_url}" target="_blank" rel="noreferrer" class="elev-chip block w-full h-56 rounded-xl overflow-hidden hover:ring-1 hover:ring-accent-ink transition-colors">
                   <img src="${item.box_photo_url}" referrerpolicy="no-referrer" class="w-full h-full object-cover" alt="รูปกล่องสินค้าของ IMEI ${item.imei}" />
               </a>`
                : `<div class="elev-field w-full h-48 rounded-xl bg-field flex flex-col items-center justify-center gap-2">
                   <i class="fa-solid fa-image text-ink/50 text-3xl"></i>
                   <p class="text-ink/50 text-xs">ไม่มีรูปกล่อง</p>
               </div>`;
        }

        // Notes area
        const isReviewable = (_reviewCurrentSessionStatus === 'รอการอนุมัติ' || _reviewCurrentSessionStatus === 'กำลังตรวจนับ') && item.scan_status === 'รอตรวจสอบ';
        const elNotesArea = document.getElementById('audit-review-modal-notes-area');
        if (elNotesArea) {
            elNotesArea.innerHTML = isReviewable
                ? `<label for="modal-review-notes-${item._id}" class="text-ink font-medium flex items-center gap-2 text-xs mb-2">
                   <i class="fa-solid fa-pen text-ink"></i> หมายเหตุ (ต้องระบุหาก ไม่ผ่าน/ตรวจใหม่)
               </label>
               <input id="modal-review-notes-${item._id}" type="text" placeholder="ระบุหมายเหตุ..."
                   class="elev-field w-full px-4 py-2.5 rounded-xl bg-field text-ink focus:ring-2 focus:ring-accent-ink focus:outline-none transition-all placeholder-ink-muted-48 text-sm" />`
                : ``;
        }

        // Actions area
        const elActionsArea = document.getElementById('audit-review-modal-actions-area');
        if (elActionsArea) {
            if (isReviewable) {
                elActionsArea.innerHTML = `
                <button type="button" onclick="submitModalItemReview(this, '${item._id}', 'ผ่าน')"
                    class="flex-1 py-3 bg-emerald-600 hover:bg-emerald-500 text-ink rounded-xl font-bold text-sm transition-all flex items-center justify-center gap-2 cursor-pointer">
                    <i class="fa-solid fa-check"></i> ผ่าน
                </button>
                <button type="button" onclick="submitModalItemReview(this, '${item._id}', 'ตรวจใหม่')"
                    class="flex-1 py-3 bg-violet-600 hover:bg-violet-500 text-ink rounded-xl font-bold text-sm transition-all flex items-center justify-center gap-2 cursor-pointer">
                    <i class="fa-solid fa-rotate"></i> ตรวจใหม่
                </button>
                <button type="button" onclick="submitModalItemReview(this, '${item._id}', 'ไม่ผ่าน')"
                    class="flex-1 py-3 bg-red-600 hover:bg-red-500 text-ink rounded-xl font-bold text-sm transition-all flex items-center justify-center gap-2 cursor-pointer">
                    <i class="fa-solid fa-xmark"></i> ไม่ผ่าน
                </button>`;
            } else {
                // Already reviewed, show status details
                elActionsArea.innerHTML = `
                <div class="elev-field w-full p-4 bg-field rounded-xl text-center flex flex-col items-center gap-2">
                    ${statusBadge(ITEM_STATUS_TONE[item.scan_status] || 'muted', item.scan_status)}
                    ${item.reviewed_by ? `<p class="text-xs text-ink/70">โดย ${item.reviewed_by.name}</p>` : ''}
                    ${item.review_notes ? `<p class="text-xs text-ink/70 mt-2 italic">"${item.review_notes}"</p>` : ''}
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
    window.closeAuditSession = closeAuditSession;
    window.openAuditReviewDetail = openAuditReviewDetail;
    window.verifyAuditImei = verifyAuditImei;
    window.openAuditReviewItemModal = openAuditReviewItemModal;
    window.closeAuditReviewItemModal = closeAuditReviewItemModal;
    window.submitModalItemReview = submitModalItemReview;
})();
