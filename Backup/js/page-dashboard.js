// Dashboard Statistics (สถิติแดชบอร์ด)
// แยกออกมาจาก script.js — โหลดแบบ dynamic เฉพาะตอนเปิดหน้า "แดชบอร์ด" ครั้งแรกเท่านั้น
// พึ่งพา window.authFetch, API_BASE_URL (global จาก script.js)
(function () {
    // ==========================================
    // Dashboard Statistics (สถิติแดชบอร์ด)
    // ==========================================

    const thaiCurrency = new Intl.NumberFormat('th-TH', {
        minimumFractionDigits: 0,
        maximumFractionDigits: 0
    });

    async function loadDashboardData() {
        try {
            const response = await authFetch(`${API_BASE_URL}/dashboard-stats`);
            const json = await response.json();

            if (!json.success) {
                console.error('ดึงข้อมูลแดชบอร์ดไม่สำเร็จ:', json.message);
                return;
            }

            const d = json.data;

            // Update Stat Cards
            const elSales = document.getElementById('stat-today-sales');
            const elProfit = document.getElementById('stat-today-profit');
            const elStock = document.getElementById('stat-total-stock');
            const elLow = document.getElementById('stat-low-stock');
            const elTxnCount = document.getElementById('stat-today-txn-count');
            const elTotalProducts = document.getElementById('stat-total-products');

            if (elSales) elSales.textContent = `฿${thaiCurrency.format(d.todaySales)}`;
            if (elProfit) elProfit.textContent = `฿${thaiCurrency.format(d.estimatedProfit)}`;
            if (elStock) elStock.textContent = thaiCurrency.format(d.totalStock);
            if (elLow) elLow.textContent = thaiCurrency.format(d.lowStockCount);
            if (elTxnCount) elTxnCount.textContent = d.todayTransactionCount;
            if (elTotalProducts) elTotalProducts.textContent = d.totalProducts;

            // Low stock warning glow
            if (elLow && d.lowStockCount > 0) {
                elLow.classList.add('text-amber-400');
                elLow.classList.remove('text-ink');
            } else if (elLow) {
                elLow.classList.remove('text-amber-400');
                elLow.classList.add('text-ink');
            }

            // Render Recent Transactions Table
            const tbody = document.getElementById('recent-txn-table-body');
            if (tbody) {
                tbody.innerHTML = '';

                if (d.recentTransactions.length === 0) {
                    tbody.innerHTML = `
                        <tr>
                            <td colspan="6" class="px-6 py-8 text-center text-body-muted italic">
                                <div class="flex flex-col items-center gap-2">
                                    <i class="fa-solid fa-receipt text-3xl text-ink-muted-48"></i>
                                    <span>ยังไม่มีรายการขาย</span>
                                </div>
                            </td>
                        </tr>
                    `;
                    return;
                }

                d.recentTransactions.forEach(txn => {
                    const row = document.createElement('tr');
                    row.className = 'hover:bg-surface-chip/40 transition-colors';

                    // Format date/time
                    const txnDate = new Date(txn.created_at);
                    const timeStr = txnDate.toLocaleString('th-TH', {
                        day: '2-digit',
                        month: 'short',
                        hour: '2-digit',
                        minute: '2-digit'
                    });

                    // Payment method icons
                    let payIcon = '💰';
                    if (txn.payment_method === 'โอนเงิน') payIcon = '📱';
                    else if (txn.payment_method === 'จัดไฟแนนซ์') payIcon = '🏦';
                    else if (txn.payment_method === 'เงินสด') payIcon = '💵';

                    row.innerHTML = `
                        <td class="px-6 py-4">
                            <span class="text-ink font-mono text-sm bg-surface-chip px-2.5 py-1 rounded-sm border border-hairline">${txn.receipt_number}</span>
                        </td>
                        <td class="px-6 py-4 text-body-muted">${txn.branch_name}</td>
                        <td class="px-6 py-4 text-center">
                            <span class="bg-surface-chip text-body-muted text-xs font-bold px-2 py-1 rounded-pill">${txn.items_count} ชิ้น</span>
                        </td>
                        <td class="px-6 py-4 text-body-muted">${payIcon} ${txn.payment_method}</td>
                        <td class="px-6 py-4 text-right font-mono font-semibold text-ink">฿${thaiCurrency.format(txn.total_amount)}</td>
                        <td class="px-6 py-4 text-right text-ink-muted-48 text-xs">${timeStr}</td>
                    `;
                    tbody.appendChild(row);
                });
            }

        } catch (error) {
            console.error('เกิดข้อผิดพลาดในการดึงข้อมูลแดชบอร์ด:', error);
        }
    }
    window.loadDashboardData = loadDashboardData;

})();
