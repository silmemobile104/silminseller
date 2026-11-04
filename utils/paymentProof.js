// หลักฐานการชำระเงินหน้าร้าน (สลิปโอน / เงินสด) — ฟังก์ชันล้วน ไม่แตะ DB หรือ Drive
// เพื่อให้ route และเทสเรียกใช้ตรรกะเดียวกัน

const MAX_PROOF_PHOTOS = 5;
const MAX_PROOF_BYTES = 4 * 1024 * 1024; // ต่อรูป (หน้าเว็บย่อรูปมาก่อนแล้ว ปกติไม่ถึง 500KB)
const PROOF_ROOT_FOLDER = 'silminseller';
const STOCK_CHECK_FOLDER = 'img_check_stock';

const PROOF_FOLDER_BY_KIND = {
    'โอน': 'หลักฐานการชำระเงินกดขาย(การโอน)',
    'เงินสด': 'หลักฐานการชำระเงินกดขาย(เงินสด)',
    'เงินสด+โอน': 'หลักฐานการชำระเงินกดขาย(เงินสด+เงินโอน)'
};

const round2 = (n) => Math.round((Number(n) || 0) * 100) / 100;

// แยกเงินสด/เงินโอนที่ "รับจริงที่หน้าร้าน" ของบิลนี้
// ซื้อสด: หน้าขายส่งเงินที่ลูกค้ายื่นมา (รวมทอน) ส่วนที่เกินยอดบิลคือเงินทอน ทอนจากเงินสดก่อน
// จัดไฟแนนซ์: เงินดาวน์ + ค่าใบสัญญา/ค่าระบบ ที่แยกสด/โอนมาแล้วจากหน้าเว็บ
const splitReceivedMoney = ({
    paymentType, cash, transfer, totalAmount,
    financeDownCash, financeDownTransfer, financeFeeCash, financeFeeTransfer
}) => {
    if (paymentType === 'จัดไฟแนนซ์') {
        return {
            cash: Math.max(0, round2((Number(financeDownCash) || 0) + (Number(financeFeeCash) || 0))),
            transfer: Math.max(0, round2((Number(financeDownTransfer) || 0) + (Number(financeFeeTransfer) || 0)))
        };
    }
    let c = Math.max(0, Number(cash) || 0);
    let t = Math.max(0, Number(transfer) || 0);
    const change = round2(c + t - (Number(totalAmount) || 0));
    if (change > 0) {
        const fromCash = Math.min(c, change);
        c = round2(c - fromCash);
        t = Math.max(0, round2(t - (change - fromCash)));
    }
    return { cash: round2(c), transfer: round2(t) };
};

// null = ไม่ได้รับเงินจริง (เช่น หักมัดจำครบ) จึงไม่ต้องมีหลักฐาน
const proofKindFor = (cash, transfer) => {
    const hasCash = (Number(cash) || 0) > 0;
    const hasTransfer = (Number(transfer) || 0) > 0;
    if (hasCash && hasTransfer) return 'เงินสด+โอน';
    if (hasTransfer) return 'โอน';
    if (hasCash) return 'เงินสด';
    return null;
};

// วันที่/เดือนตามเวลาไทย (UTC+7) ไม่ใช้ toISOString เพราะช่วง 00:00–07:00 จะนับเป็นเมื่อวาน
const bangkokDateParts = (date = new Date()) => {
    const d = new Date(date.getTime() + 7 * 60 * 60 * 1000);
    const day = d.toISOString().slice(0, 10);
    return { month: day.slice(0, 7), day };
};

const stockCheckFolderPath = (date = new Date()) => {
    const { month, day } = bangkokDateParts(date);
    return [PROOF_ROOT_FOLDER, STOCK_CHECK_FOLDER, month, day];
};

// silminseller / หลักฐาน... / เดือน / วัน / เลขบิล (N รูป)
const proofFolderPath = (kind, receiptNumber, photoCount, date = new Date()) => {
    const kindFolder = PROOF_FOLDER_BY_KIND[kind];
    if (!kindFolder) throw new Error(`ประเภทหลักฐานไม่ถูกต้อง: ${kind}`);
    const { month, day } = bangkokDateParts(date);
    return [PROOF_ROOT_FOLDER, kindFolder, month, day, `${receiptNumber} (${photoCount} รูป)`];
};

const MIME_EXT = { 'image/jpeg': 'jpg', 'image/png': 'png', 'image/webp': 'webp' };

// รับเฉพาะ data URL ของรูป jpeg/png/webp ที่ไม่ใหญ่เกินกำหนด · อย่างอื่นคืน null
const parseProofImage = (input) => {
    if (typeof input !== 'string') return null;
    const m = input.match(/^data:(image\/(?:jpeg|png|webp));base64,([A-Za-z0-9+/=]+)$/);
    if (!m) return null;
    const buffer = Buffer.from(m[2], 'base64');
    if (buffer.length === 0 || buffer.length > MAX_PROOF_BYTES) return null;
    return { buffer, mimeType: m[1], ext: MIME_EXT[m[1]] };
};

module.exports = {
    MAX_PROOF_PHOTOS,
    MAX_PROOF_BYTES,
    PROOF_FOLDER_BY_KIND,
    splitReceivedMoney,
    proofKindFor,
    bangkokDateParts,
    stockCheckFolderPath,
    proofFolderPath,
    parseProofImage
};
