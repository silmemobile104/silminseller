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

    function initStockAudit() {
        // โหลดสถานะ session วันนี้
        loadTodayAuditSession();

        // ปุ่มเปิดรอบ
        const btnOpen = document.getElementById('btn-open-audit-session');
        if (btnOpen) {
            btnOpen.onclick = async () => {
                btnOpen.disabled = true;
                btnOpen.innerHTML = '<i class="fa-solid fa-spinner fa-spin"></i> กำลังเปิด...';
                try {
                    const token = localStorage.getItem('silmin_token');
                    const r = await fetch('/api/stock-audit/sessions', {
                        method: 'POST',
                        headers: { 'Authorization': `Bearer ${token}`, 'Content-Type': 'application/json' }
                    });
                    const d = await r.json();
                    if (d.success) {
                        showToast('เปิดรอบตรวจนับสต็อกสำเร็จ');
                        loadTodayAuditSession();
                    } else {
                        showToast(d.message || 'เกิดข้อผิดพลาด', 'error');
                        btnOpen.disabled = false;
                        btnOpen.innerHTML = '<i class="fa-solid fa-plus"></i> เปิดรอบตรวจนับวันนี้';
                    }
                } catch (e) {
                    showToast('ไม่สามารถเชื่อมต่อเซิร์ฟเวอร์ได้', 'error');
                    btnOpen.disabled = false;
                    btnOpen.innerHTML = '<i class="fa-solid fa-plus"></i> เปิดรอบตรวจนับวันนี้';
                }
            };
        }

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
        const modalIndicator = document.getElementById('audit-modal-status-indicator');
        const modalImeiDisplay = document.getElementById('audit-modal-imei-display');
        const modalProductName = document.getElementById('audit-modal-product-name');

        if (modalImeiDisplay) modalImeiDisplay.textContent = imei;

        if (foundExpected) {
            if (modalTitle) modalTitle.textContent = 'พบสินค้าในระบบ';
            if (modalIndicator) {
                modalIndicator.className = 'w-2.5 h-2.5 rounded-full bg-emerald-500 shadow-sm shadow-emerald-500/50';
            }
            if (modalProductName) {
                modalProductName.className = 'text-emerald-400 text-sm mt-1 font-medium';
                modalProductName.innerHTML = `<i class="fa-solid fa-check-double mr-1"></i> ${foundExpected.product_name}`;
            }
        } else {
            if (modalTitle) modalTitle.textContent = 'ไม่พบสินค้าในระบบคลัง';
            if (modalIndicator) {
                modalIndicator.className = 'w-2.5 h-2.5 rounded-full bg-rose-500 shadow-sm shadow-rose-500/50';
            }
            if (modalProductName) {
                modalProductName.className = 'text-rose-400 text-sm mt-1 font-medium';
                modalProductName.innerHTML = `<i class="fa-solid fa-triangle-exclamation mr-1"></i> สินค้านอกแผน/ไม่พบในคลังสาขานี้`;
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
        try {
            const token = localStorage.getItem('silmin_token');
            const r = await fetch('/api/stock-audit/sessions/today', {
                headers: { 'Authorization': `Bearer ${token}` }
            });
            const d = await r.json();
            if (!d.success) return;

            const panel = document.getElementById('audit-session-panel');
            const btnOpen = document.getElementById('btn-open-audit-session');
            const badge = document.getElementById('audit-session-status-badge');

            if (!d.data) {
                if (_autoCreatingAudit) return;
                _autoCreatingAudit = true;

                if (panel) panel.classList.add('hidden');
                if (btnOpen) {
                    btnOpen.style.removeProperty('display');
                    btnOpen.disabled = true;
                    btnOpen.innerHTML = '<i class="fa-solid fa-spinner fa-spin"></i> กำลังสร้างรอบตรวจนับอัตโนมัติ...';
                }
                if (badge) badge.classList.add('hidden');

                const autoSuccess = await autoCreateAuditSession();
                _autoCreatingAudit = false;
                if (autoSuccess) {
                    await loadTodayAuditSession();
                } else {
                    if (btnOpen) {
                        btnOpen.style.removeProperty('display');
                        btnOpen.disabled = false;
                        btnOpen.innerHTML = '<i class="fa-solid fa-triangle-exclamation"></i> ไม่สามารถเปิดรอบอัตโนมัติได้ (คลิกเพื่อลองใหม่)';
                    }
                }
                return;
            }

            const { session, items, expectedImeis } = d.data;
            _auditSessionId = session._id;
            _auditSessionData = d.data;

            if (panel) panel.classList.remove('hidden');
            if (btnOpen) btnOpen.style.setProperty('display', 'none', 'important');

            // อัพเดต badge
            if (badge) {
                badge.classList.remove('hidden');
                const statusColors = {
                    'กำลังตรวจนับ': 'bg-violet-500/20 text-violet-400 border-violet-500/30',
                    'รอการอนุมัติ': 'bg-amber-500/20 text-amber-400 border-amber-500/30',
                    'อนุมัติแล้ว': 'bg-emerald-500/20 text-emerald-400 border-emerald-500/30',
                    'ปิดโดยอัตโนมัติ': 'bg-slate-500/20 text-slate-400 border-slate-500/30'
                };
                badge.className = `px-3 py-1.5 rounded-full text-xs font-bold border ${statusColors[session.status] || 'bg-slate-500/20 text-slate-400 border-slate-500/30'}`;
                badge.textContent = session.status;
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
                pill.className = 'px-2.5 py-0.5 rounded-full text-xs font-bold bg-emerald-500/20 text-emerald-400 border border-emerald-500/20';
                pill.textContent = `✓ ครบ ${total} เครื่อง`;
            } else {
                pill.className = 'px-2.5 py-0.5 rounded-full text-xs font-bold bg-indigo-500/20 text-indigo-400 border border-indigo-500/20';
                pill.textContent = `${total} เครื่อง`;
            }
        }
        if (summaryEl) {
            summaryEl.textContent = total > 0
                ? `✓ สำเร็จ ${resolved} | ⏳ รอสแกน ${pending}`
                : '';
        }

        // เรียง IMEI ตามชื่อสินค้า แล้วค่า (รอสแกนก่อน)
        const sorted = [..._expectedImeiData].sort((a, b) => {
            const aScanned = (_scannedImeiSet.has(a.imei) || a.sold) ? 1 : 0;
            const bScanned = (_scannedImeiSet.has(b.imei) || b.sold) ? 1 : 0;
            if (aScanned !== bScanned) return aScanned - bScanned;
            return a.product_name.localeCompare(b.product_name, 'th');
        });

        _renderExpectedTable(sorted);
    }

    function _renderExpectedTable(rows) {
        const tbody = document.getElementById('expected-items-tbody');
        if (!tbody) return;

        if (!rows.length) {
            tbody.innerHTML = `
            <tr><td colspan="6" class="text-center py-10 text-slate-400">
                <i class="fa-solid fa-inbox text-2xl mb-2 block"></i>
                ไม่พบสินค้าในสาขา
            </td></tr>`;
            return;
        }

        tbody.innerHTML = rows.map((e, idx) => {
            const isScanned = _scannedImeiSet.has(e.imei);
            const isSold = e.sold;

            let rowBg = 'hover:bg-slate-700/20';
            if (isScanned) rowBg = 'bg-emerald-500/5';
            else if (isSold) rowBg = 'bg-slate-800/80 opacity-70';

            let statusBadge = '';
            if (isScanned) {
                statusBadge = `<span class="inline-flex items-center gap-1 px-2 py-0.5 rounded-full text-[10px] font-bold bg-emerald-500/20 text-emerald-400 border border-emerald-500/20">
                               <i class="fa-solid fa-check"></i>สแกนแล้ว
                           </span>`;
            } else if (isSold) {
                statusBadge = `<span class="inline-flex items-center gap-1 px-2 py-0.5 rounded-full text-[10px] font-bold bg-slate-500/20 text-slate-400 border border-slate-500/20">
                               <i class="fa-solid fa-cart-shopping"></i>ขายแล้ว
                           </span>`;
            } else {
                statusBadge = `<span class="inline-flex items-center gap-1 px-2 py-0.5 rounded-full text-[10px] font-bold bg-amber-500/20 text-amber-400 border border-amber-500/20">
                               <i class="fa-solid fa-clock"></i>รอสแกน
                           </span>`;
            }

            let imeiHighlight = '';
            if (isScanned) {
                imeiHighlight = `<span class="font-mono text-xs text-emerald-400 line-through opacity-60">${e.imei}</span>`;
            } else if (isSold) {
                imeiHighlight = `<span class="font-mono text-xs text-slate-400 line-through opacity-60">${e.imei}</span>`;
            } else {
                imeiHighlight = `<span class="font-mono text-xs text-white">${e.imei}</span>
               <button onclick="fillImeiInput('${e.imei}')" title="กรอก IMEI"
                   class="ml-1.5 p-0.5 rounded text-slate-400 hover:text-violet-400 hover:bg-violet-500/10 transition-all">
                   <i class="fa-solid fa-arrow-up-from-bracket text-[10px]"></i>
               </button>`;
            }

            const colorHtml = e.color
                ? `<span class="inline-flex items-center gap-1 px-2 py-0.5 rounded-full text-[10px] font-semibold bg-pink-500/15 text-pink-300 border border-pink-500/20">${e.color}</span>`
                : `<span class="text-slate-400 text-xs">—</span>`;
            const capacityHtml = e.capacity
                ? `<span class="inline-flex items-center gap-1 px-2 py-0.5 rounded-full text-[10px] font-semibold bg-sky-500/15 text-sky-300 border border-sky-500/20">${e.capacity}</span>`
                : `<span class="text-slate-400 text-xs">—</span>`;
            return `
            <tr class="${rowBg} border-b border-slate-700/40 transition-all" data-imei="${e.imei}" data-name="${e.product_name}" data-status="${isScanned ? 'scanned' : (isSold ? 'sold' : 'pending')}">
                <td class="px-4 py-2.5 text-slate-400 text-xs">${idx + 1}</td>
                <td class="px-4 py-2.5">
                    <span class="text-slate-300 text-xs">${e.product_name}</span>
                </td>
                <td class="px-4 py-2.5">${colorHtml}</td>
                <td class="px-4 py-2.5">${capacityHtml}</td>
                <td class="px-4 py-2.5">${imeiHighlight}</td>
                <td class="px-4 py-2.5 text-center">${statusBadge}</td>
            </tr>`;
        }).join('');
    }

    function toggleExpectedList() {
        const body = document.getElementById('expected-list-body');
        const chevron = document.getElementById('expected-list-chevron');
        if (!body) return;
        const isHidden = body.classList.toggle('hidden');
        if (chevron) {
            chevron.style.transform = isHidden ? 'rotate(180deg)' : 'rotate(0deg)';
        }
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
        if (countEl) countEl.textContent = `${items.length} รายการ`;

        if (items.length === 0) {
            list.innerHTML = `
            <div class="flex flex-col items-center justify-center py-12 text-center">
                <div class="w-16 h-16 rounded-2xl bg-slate-700/50 flex items-center justify-center mb-4">
                    <i class="fa-solid fa-qrcode text-slate-400 text-2xl"></i>
                </div>
                <p class="text-slate-400">ยังไม่มีรายการ เริ่มสแกน IMEI เลย</p>
            </div>`;
            return;
        }

        list.innerHTML = items.map((item, idx) => {
            const statusColor = item.is_expected
                ? 'bg-emerald-500/10 border-emerald-500/20 text-emerald-400'
                : 'bg-red-500/10 border-red-500/20 text-red-400';
            const statusIcon = item.is_expected ? 'fa-circle-check' : 'fa-triangle-exclamation';
            const statusText = item.is_expected ? 'พบในระบบ' : 'ไม่พบในระบบ';
            const photoHtml = item.box_photo_url
                ? `<a href="${item.box_photo_url}" target="_blank" class="shrink-0 w-12 h-12 rounded-lg overflow-hidden border border-slate-600 hover:border-violet-400 transition-all">
                 <img src="${item.box_photo_url}" referrerpolicy="no-referrer" class="w-full h-full object-cover" loading="lazy" alt="box" />
               </a>`
                : `<div class="shrink-0 w-12 h-12 rounded-lg bg-slate-700 border border-slate-600 flex items-center justify-center">
                 <i class="fa-solid fa-image text-slate-400 text-sm"></i>
               </div>`;
            const canDelete = _auditSessionData?.session?.status === 'กำลังตรวจนับ';
            const deleteBtn = canDelete
                ? `<button onclick="deleteAuditItem('${item.imei}')" class="shrink-0 p-1.5 rounded-lg bg-red-500/10 hover:bg-red-500/20 text-red-400 border border-red-500/20 transition-all text-xs">
                 <i class="fa-solid fa-trash"></i>
               </button>`
                : '';
            return `
            <div class="flex items-center gap-3 p-3 border-b border-slate-700/60 hover:bg-slate-700/20 transition-all">
                <span class="text-slate-400 text-xs font-mono w-6 shrink-0">${idx + 1}</span>
                ${photoHtml}
                <div class="flex-1 min-w-0">
                    <p class="text-white font-mono text-sm font-bold truncate">${item.imei}</p>
                    <p class="text-slate-400 text-xs truncate">${item.product_name}</p>
                    ${item.scan_notes ? `<p class="text-slate-400 text-xs italic">"${item.scan_notes}"</p>` : ''}
                </div>
                <span class="shrink-0 px-2 py-0.5 rounded-full text-[10px] font-bold border ${statusColor} flex items-center gap-1">
                    <i class="fa-solid ${statusIcon}"></i>${statusText}
                </span>
                ${deleteBtn}
            </div>`;
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

    async function loadAuditReviewSessions() {
        const container = document.getElementById('audit-review-sessions-list');
        const detailPanel = document.getElementById('audit-review-detail-panel');
        const listPanel = container;
        if (detailPanel) detailPanel.classList.add('hidden');
        if (listPanel) listPanel.classList.remove('hidden');
        _reviewCurrentSessionId = null;
        _reviewCurrentSessionStatus = '';
        _reviewCurrentSessionItems = [];
        _reviewActiveFilter = 'รอตรวจสอบ';

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
                if (container) container.innerHTML = `
                <div class="flex flex-col items-center justify-center py-16 text-center">
                    <div class="w-20 h-20 rounded-3xl bg-slate-700/50 flex items-center justify-center mb-4">
                        <i class="fa-solid fa-clipboard-check text-slate-400 text-3xl"></i>
                    </div>
                    <p class="text-slate-400">ไม่พบรอบการตรวจนับสต็อก</p>
                </div>`;
                return;
            }

            const statusColors = {
                'กำลังตรวจนับ': 'bg-violet-500/20 text-violet-400 border-violet-500/30',
                'รอการอนุมัติ': 'bg-amber-500/20 text-amber-400 border-amber-500/30 animate-pulse',
                'อนุมัติแล้ว': 'bg-emerald-500/20 text-emerald-400 border-emerald-500/30',
                'ปิดโดยอัตโนมัติ': 'bg-slate-500/20 text-slate-400 border-slate-500/30'
            };

            if (container) container.innerHTML = d.data.map(session => `
            <div class="bg-slate-800/60 rounded-2xl border border-slate-700 p-5 hover:border-amber-500/30 transition-all cursor-pointer"
                 onclick="openAuditReviewDetail('${session._id}')">
                <div class="flex items-center justify-between mb-3">
                    <div>
                        <p class="text-white font-bold text-lg">${new Date(session.session_date).toLocaleDateString('th-TH', { weekday: 'long', year: 'numeric', month: 'long', day: 'numeric' })}</p>
                        <p class="text-slate-400 text-sm mt-0.5">สาขา: ${session.branch_id?.name || '—'} | ผู้เปิดรอบ: ${session.created_by?.name || 'ระบบอัตโนมัติ'}</p>
                    </div>
                    <span class="px-3 py-1.5 rounded-full text-xs font-bold border ${statusColors[session.status] || 'bg-slate-500/20 text-slate-400 border-slate-500/30'}">${session.status}</span>
                </div>
                <div class="flex items-center gap-4 text-sm">
                    <span class="text-slate-400"><i class="fa-solid fa-qrcode text-violet-400 mr-1"></i> สแกน ${session.total_items_scanned}/${session.total_items_expected} เครื่อง</span>
                    <span class="text-slate-400 ml-auto text-xs">คลิกเพื่อดูรายละเอียด <i class="fa-solid fa-chevron-right ml-1"></i></span>
                </div>
            </div>`).join('');

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
                        } else {
                            rangeContainer.classList.add('hidden');
                        }
                    }
                    loadAuditReviewSessions();
                };
            }
            if (customStartDate) customStartDate.onchange = loadAuditReviewSessions;
            if (customEndDate) customEndDate.onchange = loadAuditReviewSessions;

        } catch (e) {
            console.error('[AUDIT REVIEW] loadAuditReviewSessions:', e);
            if (container) container.innerHTML = '<p class="text-red-400 p-4">เกิดข้อผิดพลาดในการดึงข้อมูล</p>';
        }
    }

    async function openAuditReviewDetail(sessionId) {
        _reviewCurrentSessionId = sessionId;
        const listPanel = document.getElementById('audit-review-sessions-list');
        const detailPanel = document.getElementById('audit-review-detail-panel');
        if (listPanel) listPanel.classList.add('hidden');
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
        const summaryBar = document.getElementById('audit-review-summary-bar');
        if (!summaryBar) return;

        // Highlight styles depending on the active filter
        const activeClass = 'ring-2 ring-amber-500 ring-offset-2 ring-offset-slate-900 scale-105 font-bold';

        const cardAllActive = _reviewActiveFilter === 'all' ? activeClass : '';
        const cardPendingActive = _reviewActiveFilter === 'รอตรวจสอบ' ? activeClass : '';
        const cardPassedActive = _reviewActiveFilter === 'ผ่าน' ? activeClass : '';
        const cardFailedActive = _reviewActiveFilter === 'ไม่ผ่าน' ? activeClass : '';

        summaryBar.innerHTML = `
        <div onclick="filterReviewItemsByStatus('all')" 
             class="bg-slate-700/40 rounded-xl p-3 text-center cursor-pointer transition-all hover:bg-slate-700/60 active:scale-95 ${cardAllActive}">
            <p class="text-2xl font-black text-white">${summary.total}</p>
            <p class="text-[10px] text-slate-400 mt-0.5">ทั้งหมด</p>
        </div>
        <div onclick="filterReviewItemsByStatus('รอตรวจสอบ')" 
             class="bg-amber-500/10 border border-amber-500/20 rounded-xl p-3 text-center cursor-pointer transition-all hover:bg-amber-500/20 active:scale-95 ${cardPendingActive}">
            <p class="text-2xl font-black text-amber-400">${summary.pending}</p>
            <p class="text-[10px] text-amber-300 mt-0.5">รอตรวจสอบ</p>
        </div>
        <div onclick="filterReviewItemsByStatus('ผ่าน')" 
             class="bg-emerald-500/10 border border-emerald-500/20 rounded-xl p-3 text-center cursor-pointer transition-all hover:bg-emerald-500/20 active:scale-95 ${cardPassedActive}">
            <p class="text-2xl font-black text-emerald-400">${summary.passed}</p>
            <p class="text-[10px] text-emerald-300 mt-0.5">ผ่าน</p>
        </div>
        <div onclick="filterReviewItemsByStatus('ไม่ผ่าน')" 
             class="bg-red-500/10 border border-red-500/20 rounded-xl p-3 text-center cursor-pointer transition-all hover:bg-red-500/20 active:scale-95 ${cardFailedActive}">
            <p class="text-2xl font-black text-red-400">${summary.failed}</p>
            <p class="text-[10px] text-red-300 mt-0.5">ไม่ผ่าน</p>
        </div>`;
    }

    function renderReviewItemsGrid() {
        const grid = document.getElementById('audit-review-items-grid');
        if (!grid) return;

        let filteredItems = _reviewCurrentSessionItems;
        if (_reviewActiveFilter !== 'all') {
            filteredItems = _reviewCurrentSessionItems.filter(item => item.scan_status === _reviewActiveFilter);
        }

        if (!filteredItems.length) {
            grid.innerHTML = `<p class="text-slate-400 text-center py-8">ไม่มีรายการในสถานะนี้</p>`;
            return;
        }

        grid.innerHTML = filteredItems.map(item => {
            let cardBorder = 'border-slate-700/60';
            let badgeClass = 'bg-slate-500/10 text-slate-400 border-slate-500/20';
            if (item.scan_status === 'ผ่าน') {
                cardBorder = 'border-emerald-500/20';
                badgeClass = 'bg-emerald-500/10 text-emerald-400 border-emerald-500/20';
            } else if (item.scan_status === 'ไม่ผ่าน') {
                cardBorder = 'border-red-500/20';
                badgeClass = 'bg-red-500/10 text-red-400 border-red-500/20';
            } else if (item.scan_status === 'ตรวจใหม่') {
                cardBorder = 'border-violet-500/20';
                badgeClass = 'bg-violet-500/10 text-violet-400 border-violet-500/20';
            } else if (item.scan_status === 'รอตรวจสอบ') {
                cardBorder = 'border-amber-500/20';
                badgeClass = 'bg-amber-500/10 text-amber-400 border-amber-500/20';
            }

            const btnLabel = item.scan_status === 'รอตรวจสอบ' ? 'ตรวจสอบสินค้า' : 'ดูรายละเอียด';
            const btnColorClass = item.scan_status === 'รอตรวจสอบ'
                ? 'from-amber-600 to-amber-500 hover:from-amber-500 hover:to-amber-400 shadow-amber-500/10'
                : 'from-slate-700 to-slate-650 hover:from-slate-650 hover:to-slate-600 shadow-slate-700/10';
            const btnIcon = item.scan_status === 'รอตรวจสอบ' ? 'fa-magnifying-glass' : 'fa-circle-info';

            const checkBtnHtml = `<div class="mt-3">
            <button onclick="openAuditReviewItemModal('${item._id}')"
                class="w-full py-2 bg-gradient-to-r ${btnColorClass} text-white rounded-lg font-bold text-xs transition-all flex items-center justify-center gap-1 shadow-md active:scale-[0.98] cursor-pointer">
                <i class="fa-solid ${btnIcon}"></i> ${btnLabel}
            </button>
        </div>`;

            return `
            <div class="bg-slate-800/60 rounded-2xl border ${cardBorder} p-4">
                <div class="flex items-start justify-between gap-3 mb-3">
                    <div class="flex-1 min-w-0">
                        <p class="text-white font-mono font-bold">${item.imei}</p>
                        <p class="text-slate-400 text-sm truncate">${item.product_name}</p>
                        <p class="text-slate-400 text-xs">สแกนโดย: ${item.scanned_by?.name || '—'} ${item.scan_notes ? `| "${item.scan_notes}"` : ''}</p>
                    </div>
                    <span class="shrink-0 px-2.5 py-1 rounded-full text-[10px] font-bold border ${badgeClass}">${item.scan_status}</span>
                </div>
                ${checkBtnHtml}
            </div>`;
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

        // Populating indicator color
        const elIndicator = document.getElementById('audit-review-modal-indicator');
        const statusColors = { 'รอตรวจสอบ': 'bg-amber-500', 'ผ่าน': 'bg-emerald-500', 'ไม่ผ่าน': 'bg-red-500', 'ตรวจใหม่': 'bg-violet-500' };
        if (elIndicator) {
            elIndicator.className = `w-2.5 h-2.5 rounded-full ${statusColors[item.scan_status] || 'bg-slate-500'}`;
        }

        // Photo container
        const elPhotoContainer = document.getElementById('audit-review-modal-photo-container');
        if (elPhotoContainer) {
            elPhotoContainer.innerHTML = item.box_photo_url
                ? `<a href="${item.box_photo_url}" target="_blank" class="block w-full h-56 rounded-2xl overflow-hidden border border-slate-700 hover:border-amber-500 transition-all">
                   <img src="${item.box_photo_url}" referrerpolicy="no-referrer" class="w-full h-full object-cover" alt="กล่อง" />
               </a>`
                : `<div class="w-full h-48 rounded-2xl bg-slate-950 border border-slate-800 flex flex-col items-center justify-center gap-2">
                   <i class="fa-solid fa-image text-slate-400 text-3xl"></i>
                   <p class="text-slate-400 text-xs">ไม่มีรูปกล่อง</p>
               </div>`;
        }

        // Notes area
        const isReviewable = (_reviewCurrentSessionStatus === 'รอการอนุมัติ' || _reviewCurrentSessionStatus === 'กำลังตรวจนับ') && item.scan_status === 'รอตรวจสอบ';
        const elNotesArea = document.getElementById('audit-review-modal-notes-area');
        if (elNotesArea) {
            elNotesArea.innerHTML = isReviewable
                ? `<label class="block text-xs font-bold text-slate-400 uppercase tracking-wider mb-2">
                   หมายเหตุ (ต้องระบุหาก ไม่ผ่าน/ตรวจใหม่)
               </label>
               <input id="modal-review-notes-${item._id}" type="text" placeholder="ระบุหมายเหตุ..."
                   class="w-full px-4 py-2.5 bg-slate-950 border border-slate-700 rounded-xl placeholder-slate-500 focus:outline-none focus:border-amber-500 text-sm transition-all" />`
                : ``;
        }

        // Actions area
        const elActionsArea = document.getElementById('audit-review-modal-actions-area');
        if (elActionsArea) {
            if (isReviewable) {
                elActionsArea.innerHTML = `
                <button onclick="submitModalItemReview(this, '${item._id}', 'ผ่าน')"
                    class="flex-1 py-3 bg-emerald-600 hover:bg-emerald-500 text-white rounded-xl font-bold text-sm transition-all flex items-center justify-center gap-2 shadow-lg shadow-emerald-500/10 cursor-pointer">
                    <i class="fa-solid fa-check"></i> ผ่าน
                </button>
                <button onclick="submitModalItemReview(this, '${item._id}', 'ตรวจใหม่')"
                    class="flex-1 py-3 bg-violet-600 hover:bg-violet-500 text-white rounded-xl font-bold text-sm transition-all flex items-center justify-center gap-2 shadow-lg shadow-violet-500/10 cursor-pointer">
                    <i class="fa-solid fa-rotate"></i> ตรวจใหม่
                </button>
                <button onclick="submitModalItemReview(this, '${item._id}', 'ไม่ผ่าน')"
                    class="flex-1 py-3 bg-red-600 hover:bg-red-500 text-white rounded-xl font-bold text-sm transition-all flex items-center justify-center gap-2 shadow-lg shadow-red-500/10 cursor-pointer">
                    <i class="fa-solid fa-xmark"></i> ไม่ผ่าน
                </button>`;
            } else {
                // Already reviewed, show status details
                let resultTextClass = 'text-slate-400';
                if (item.scan_status === 'ผ่าน') resultTextClass = 'text-emerald-400';
                else if (item.scan_status === 'ไม่ผ่าน') resultTextClass = 'text-red-400';
                else if (item.scan_status === 'ตรวจใหม่') resultTextClass = 'text-violet-400';

                elActionsArea.innerHTML = `
                <div class="w-full p-4 bg-slate-950 rounded-2xl border border-slate-800 text-center">
                    <p class="text-sm text-slate-400">สถานะ: <span class="font-black ${resultTextClass}">${item.scan_status}</span>${item.reviewed_by ? ` โดย ${item.reviewed_by.name}` : ''}</p>
                    ${item.review_notes ? `<p class="text-xs text-slate-400 mt-1 italic">"${item.review_notes}"</p>` : ''}
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
        if (!confirm('ยืนยันปิดรอบและอนุมัติผลการตรวจนับ?')) return;
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
