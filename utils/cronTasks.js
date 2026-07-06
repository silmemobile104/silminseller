const { Branch, StockAuditSession, Product } = require('../models');

async function generateDailySessionsForAllBranches() {
    try {
        console.log('[Scheduler] Starting daily stock audit session generation for all branches...');
        const branches = await Branch.find({});
        
        const todayStart = new Date(); todayStart.setHours(0,0,0,0);
        const todayEnd   = new Date(); todayEnd.setHours(23,59,59,999);
        
        for (const b of branches) {
            const existingToday = await StockAuditSession.findOne({
                branch_id: b._id,
                session_date: { $gte: todayStart, $lte: todayEnd },
                status: { $in: ['กำลังตรวจนับ', 'รอการอนุมัติ'] }
            });
            
            if (existingToday) {
                console.log(`[Scheduler] Branch ${b.name} already has an active session for today.`);
                continue;
            }
            
            // Auto-close any outstanding stale sessions for this branch
            await StockAuditSession.updateMany(
                { branch_id: b._id, status: { $in: ['กำลังตรวจนับ', 'รอการอนุมัติ'] } },
                { $set: { status: 'ปิดโดยอัตโนมัติ', closed_at: new Date() } }
            );
            
            // Count expected IMEIs in the branch
            const products = await Product.find({ 'stock_balances': { $elemMatch: { branch_id: b._id } } }).populate('unit_id');
            let totalExpected = 0;
            for (const p of products) {
                const bal = p.stock_balances.find(sb => sb.branch_id && sb.branch_id.toString() === b._id.toString());
                if (bal && p.unit_id && p.unit_id.name === 'เครื่อง' && Array.isArray(bal.imeis)) {
                    totalExpected += bal.imeis.length;
                }
            }
            
            // Create a new session
            const newSession = await StockAuditSession.create({
                session_date: todayStart,
                branch_id: b._id,
                status: 'กำลังตรวจนับ',
                created_by: null, // Created by SYSTEM
                total_items_expected: totalExpected,
                total_items_scanned: 0
            });
            
            console.log(`[Scheduler] Auto-created Stock Audit Session for branch: ${b.name} (Expected: ${totalExpected} units)`);
        }
        console.log('[Scheduler] Finished daily stock audit session generation.');
    } catch (error) {
        console.error('[Scheduler] Error generating daily sessions:', error);
    }
}

function initDailyStockAuditScheduler() {
    // Run once on server startup to ensure today's sessions exist
    generateDailySessionsForAllBranches();

    // Schedule to run at 00:05 AM every day
    const scheduleNext = () => {
        const now = new Date();
        const nextMidnight = new Date(now.getFullYear(), now.getMonth(), now.getDate() + 1, 0, 5, 0);
        const msToNext = nextMidnight.getTime() - now.getTime();
        
        setTimeout(async () => {
            console.log('[Scheduler] Running scheduled daily stock audit generation...');
            await generateDailySessionsForAllBranches();
            scheduleNext();
        }, msToNext);
        
        console.log(`[Scheduler] Daily Stock Audit Scheduler is active. Next run scheduled in ${Math.round(msToNext / 1000 / 60)} minutes (at 00:05 AM).`);
    };
    
    scheduleNext();
}

module.exports = {
    generateDailySessionsForAllBranches,
    initDailyStockAuditScheduler
};
