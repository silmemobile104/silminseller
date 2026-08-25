// Warranty Check Logic (เช็คประกัน)
// แยกออกมาจาก script.js — โหลดแบบ dynamic เฉพาะตอนเปิดหน้า "เช็คประกัน" ครั้งแรกเท่านั้น
// พึ่งพา window.authFetch, window.showToast, window.viewTransactionDetails, API_BASE_URL (global จาก script.js)
(function () {
    const warrantySearchForm = document.getElementById('warranty-search-form');
    const warrantySearchInput = document.getElementById('warranty-search-input');
    const warrantyResultsContainer = document.getElementById('warranty-results-container');
    const warrantyEmptyState = document.getElementById('warranty-empty-state');

    const calculateRemainingDays = (expiryDate) => {
        const now = new Date();
        const exp = new Date(expiryDate);
        const diffTime = exp.getTime() - now.getTime();
        return Math.ceil(diffTime / (1000 * 60 * 60 * 24));
    };

    const renderWarrantyResults = (results) => {
        if (!warrantyResultsContainer) return;

        warrantyResultsContainer.innerHTML = '';

        if (!results || results.length === 0) {
            warrantyResultsContainer.innerHTML = `
                <div class="flex flex-col items-center justify-center py-12 text-body-muted">
                    <i class="fa-solid fa-box-open text-5xl mb-4 text-ink-muted-48 opacity-50"></i>
                    <p class="font-medium text-lg">ไม่พบข้อมูลการรับประกัน</p>
                    <p class="text-sm mt-1">กรุณาตรวจสอบ IMEI หรือชื่อลูกค้าอีกครั้ง</p>
                </div>
            `;
            return;
        }

        results.forEach(item => {
            const expDate = new Date(item.warranty_expiry);
            const remainingDays = calculateRemainingDays(item.warranty_expiry);
            const isExpired = remainingDays < 0;

            const card = document.createElement('div');
            card.className = `bg-canvas-elevated border ${isExpired ? 'border-red-500/30' : 'border-emerald-500/30'} rounded-lg p-6 relative overflow-hidden`;

            card.innerHTML = `
                <div class="flex flex-col md:flex-row justify-between gap-6 relative z-10">
                    <div class="space-y-4">
                        <div>
                            <h4 class="text-xl font-bold text-ink leading-tight">${item.product_name}</h4>
                            <div class="flex items-center gap-2 mt-1">
                                <span class="text-body-muted font-mono text-sm bg-surface-chip px-2 py-0.5 rounded border border-hairline">IMEI: ${item.imei_sold}</span>
                                <span class="text-body-muted text-xs">เลขที่ใบเสร็จ: <a href="#" class="warranty-receipt-link text-primary hover:underline" data-id="${item.txn_id}">${item.receipt_number}</a></span>
                            </div>
                        </div>
                        <div class="flex flex-col items-start gap-1">
                            <p class="text-sm text-body-muted"><i class="fa-solid fa-user text-body-muted mr-2"></i> ${item.member ? (item.member.first_name + ' ' + item.member.last_name) : 'ลูกค้าทั่วไป'}</p>
                            ${item.member && item.member.phone ? `<p class="text-sm text-body-muted"><i class="fa-solid fa-phone text-body-muted mr-2"></i> ${item.member.phone}</p>` : ''}
                        </div>
                    </div>
                    <div class="flex flex-col items-end justify-center min-w-[200px]">
                        ${isExpired ? `
                            <div class="bg-red-500/10 text-red-400 px-4 py-2 rounded-md border border-red-500/20 flex items-center gap-2 mb-3">
                                <i class="fa-solid fa-circle-xmark"></i> <span class="font-bold">หมดประกันแล้ว</span>
                            </div>
                        ` : `
                            <div class="bg-emerald-500/10 text-emerald-400 px-4 py-2 rounded-md border border-emerald-500/20 flex items-center gap-2 mb-3">
                                <i class="fa-solid fa-shield-check"></i> <span class="font-bold">อยู่ในประกัน</span>
                            </div>
                        `}
                        <div class="text-right w-full bg-surface-tile-3 p-3 rounded-md border border-hairline">
                            <div class="flex justify-between text-xs mb-1">
                                <span class="text-body-muted">วันที่ซื้อ:</span>
                                <span class="text-ink">${new Date(item.created_at).toLocaleDateString('th-TH')}</span>
                            </div>
                            <div class="flex justify-between text-xs mb-1">
                                <span class="text-body-muted">ระยะประกัน:</span>
                                <span class="text-ink">${item.warranty_period}</span>
                            </div>
                            <div class="flex justify-between text-xs font-bold mt-2 pt-2 border-t border-hairline">
                                <span class="text-body-muted">วันหมดอายุ:</span>
                                <span class="${isExpired ? 'text-red-400' : 'text-emerald-400'}">${expDate.toLocaleDateString('th-TH')}</span>
                            </div>
                            ${!isExpired ? `<div class="text-right text-[10px] text-emerald-500 mt-1">เหลืออีก ${remainingDays} วัน</div>` : ''}
                        </div>
                    </div>
                </div>
            `;
            warrantyResultsContainer.appendChild(card);
        });

        // Attach receipt link listeners
        document.querySelectorAll('.warranty-receipt-link').forEach(link => {
            link.addEventListener('click', (e) => {
                e.preventDefault();
                const txnId = e.currentTarget.getAttribute('data-id');
                if (txnId && typeof window.viewTransactionDetails === 'function') {
                    window.viewTransactionDetails(txnId);
                }
            });
        });
    };

    const checkWarranty = async (query) => {
        if (!query) return;
        try {
            const response = await window.authFetch(`${API_BASE_URL}/warranty/check?q=${encodeURIComponent(query)}`);
            const result = await response.json();
            if (result.success) {
                renderWarrantyResults(result.data);
            } else {
                window.showToast('เกิดข้อผิดพลาดในการตรวจสอบประกัน: ' + result.message, 'error');
                renderWarrantyResults([]);
            }
        } catch (error) {
            console.error('Error checking warranty:', error);
            window.showToast('เชื่อมต่อเซิร์ฟเวอร์ไม่ได้', 'error');
            renderWarrantyResults([]);
        }
    };

    if (warrantySearchForm) {
        warrantySearchForm.addEventListener('submit', (e) => {
            e.preventDefault();
            const query = warrantySearchInput.value.trim();
            if (query) {
                checkWarranty(query);
            } else {
                renderWarrantyResults([]);
            }
        });
    }
})();
