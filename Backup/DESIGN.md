# Design System — Dark Mode / Yellow Accent

ปรับจากระบบเดิม (Apple-style, light-dominant, Action Blue) เป็นธีมมืดที่ใช้ **#FFE169** เป็นสีโต้ตอบเดียวของทั้งระบบ

โครงสร้างทั้งหมด — ระบบตัวอักษร จังหวะ spacing ไวยากรณ์รูปทรง breakpoints — **ไม่เปลี่ยน** สิ่งที่เปลี่ยนคือชั้นสีและกฎที่ตามมาจากการที่ accent กลายเป็นสีสว่าง

---

## 1. สิ่งที่เปลี่ยนตรรกะ ไม่ใช่แค่เปลี่ยนค่าสี

| ประเด็น | ระบบเดิม | ระบบใหม่ | เหตุผล |
|---|---|---|---|
| ตัวอักษรบนปุ่มหลัก | ขาว บนน้ำเงินเข้ม | **#1d1d1f บนเหลือง** | ขาวบน #FFE169 ได้ contrast 1.3:1 — อ่านไม่ออก ส่วนดำได้ 12.8:1 |
| วง focus | เหลือบสว่างกว่า accent | **เข้มกว่า + offset 2px** | #FFE169 สว่างเกือบสุดอยู่แล้ว หาสีที่ "สว่างกว่า" ไม่ได้ |
| เงาสินค้า | `rgba(0,0,0,.22)` | `rgba(0,0,0,.55)` + วางบนไทล์ยกระดับ | เงาดำบนพื้น #000 มองไม่เห็น |
| ปุ่มทึบต่อไทล์ | ได้ 2 ปุ่ม | **1 ปุ่มทึบ + 1 ghost** | เหลืองบนดำดังกว่าน้ำเงินบนขาวมาก |
| แถบนำทาง | #000 (จุดเดียวที่ดำสนิท) | **rgba(0,0,0,.8) + blur + hairline** | พื้นหลังกลายเป็นดำแล้ว nav จึงต้องแยกด้วยวิธีอื่น |
| น้ำหนัก 300 | ใช้ที่ 18px และ 24px | **ใช้เฉพาะ ≥ 24px** | ตัวอักษรสว่างบนพื้นมืดดูบางลง 18px/300 จะเปราะ |

---

## 2. Colors

### Accent — สีเดียวของระบบ

- **Signal Yellow** (`{colors.primary}` — `#FFE169`) — ทุกสิ่งที่กดได้ ลิงก์ ปุ่มแคปซูล ขอบชิปที่เลือก **ห้ามมีสีเน้นที่สอง** (กฎเดิมยังศักดิ์สิทธิ์)
- **Yellow Pressed** (`{colors.primary-pressed}` — `#F5D24E`) — ใช้คู่กับ `scale(0.95)` ตอนกด
- **Yellow Focus** (`{colors.primary-focus}` — `#FFD43B`) — วง focus `outline: 2px solid` + `outline-offset: 2px` (offset สำคัญ ไม่งั้นวงจะกลืนกับตัวปุ่ม)
- **Yellow Muted** (`{colors.primary-muted}` — `rgba(255,225,105,0.4)`) — ขอบ ghost pill และเส้นคั่นเชิง accent
- **Yellow On Light** (`{colors.primary-on-light}` — `#8A6D00`) — เฉพาะกรณีหายากที่ CTA ต้องวางบนภาพถ่ายพื้นสว่าง #FFE169 บนขาวได้ 1.4:1 ใช้ไม่ได้เด็ดขาด
- **On Primary** (`{colors.on-primary}` — `#1d1d1f`) — ตัวอักษรบนพื้นเหลืองทุกกรณี

> ระบบเดิมมี `primary-on-dark` (Sky Link Blue) ไว้ใช้บนไทล์มืด — โทเคนนี้ **ถูกลบ** เพราะทั้งระบบมืดหมดแล้ว #FFE169 ทำงานได้ทุกพื้นผิวมืด

### Surface

- **Void** (`{colors.canvas}` — `#000000`) — canvas หลัก ไทล์สว่าง(เดิม)กลายเป็นดำสนิท ดีกับ OLED
- **Elevated** (`{colors.canvas-elevated}` — `#1d1d1f`) — แทนที่ Parchment เป็นไทล์สลับ พื้นการ์ด พื้น footer **และเป็นพื้นบังคับสำหรับวางภาพสินค้า**
- **Tile 2** (`{colors.surface-tile-2}` — `#232325`) — ไทล์ยกระดับที่ติดกับ Elevated เพื่อสร้างรอยต่อบางเฉียบ
- **Tile 3** (`{colors.surface-tile-3}` — `#161618`) — ก้นสแตกและกรอบวิดีโอ
- **Chip** (`{colors.surface-chip}` — `#2a2a2c`) — พื้นปุ่ม ghost/pearl เดิม พื้นภาพในการ์ด
- **Chip Translucent** (`{colors.surface-chip-translucent}` — `rgba(60,60,64,0.72)`) — ปุ่มวงกลมลอยบนภาพถ่าย (เดิมเป็นเทาอ่อนโปร่ง ต้องพลิกเป็นเทาเข้มโปร่ง)

จังหวะสลับไทล์ใหม่: `#000000` ↔ `#1d1d1f` ระยะห่าง L\* ประมาณ 11 จุด — เห็นเป็นคนละเซกชันชัด โดยไม่ต้องมีเส้นขอบ ปรัชญา "สีพื้นคือเส้นแบ่ง" ยังอยู่ครบ

### Text

- **Primary** (`{colors.ink}` — `#f5f5f7`) — หัวเรื่องและเนื้อความ ไม่ใช่ขาวสนิท (สะท้อนตรรกะเดิมที่เลี่ยงดำสนิท ช่วยลดอาการตากระพริบบนพื้นดำ)
- **Secondary** (`{colors.body-muted}` — `#a1a1a6`) — subcopy ราคา คำอธิบายรอง
- **Tertiary** (`{colors.ink-muted-48}` — `#6e6e73`) — ปุ่มที่ถูกปิด fine print
- **On Primary** (`{colors.on-primary}` — `#1d1d1f`) — บนพื้นเหลืองเท่านั้น

### Hairlines

- **Hairline** (`{colors.hairline}` — `#38383a`) — ขอบการ์ด เส้นใต้ nav เส้นคั่นชิป
- **Divider Soft** (`{colors.divider-soft}` — `rgba(255,255,255,0.08)`) — วงขอบนุ่มบนปุ่มรอง (พลิกจาก `rgba(0,0,0,0.04)` เดิม)

### Gradient

ยังคง **ไม่มี** อย่างเด็ดขาด บรรยากาศมาจากภาพถ่ายเหมือนเดิม

---

## 3. Typography

ตารางลำดับชั้นทั้งหมด **คงเดิมทุกค่า** — ขนาด น้ำหนัก line-height letter-spacing ไม่แตะเลย เนื้อความยังรันที่ 17px / 400 / 1.47 / -0.374px หัวเรื่องยังเป็น 600 พร้อม tracking ติดลบ

มีข้อยกเว้นสองข้อที่เกิดจากการพลิกเป็นพื้นมืด:

**`{typography.button-large}` เปลี่ยน 300 → 400** ตัวอักษรสว่างบนพื้นมืดเกิด optical bloom ทำให้ดูบางกว่าความจริง ที่ 18px น้ำหนัก 300 จะดูเปราะและอ่านยาก ส่วน `{typography.lead-airy}` (24px/300) **เก็บไว้เหมือนเดิม** — ที่ 24px น้ำหนัก 300 ยังให้ความโปร่งได้โดยไม่เสียความอ่านง่าย

**เพิ่ม `-webkit-font-smoothing: antialiased`** บน root ถ้าไม่ใส่ ตัวอักษรสว่างบนพื้นมืดจะดูหนาเกินและ tracking ติดลบจะแน่นเกินไปจนตัวอักษรชนกัน

บันได 300 / 400 / 600 / 700 ยังคงเดิม — **500 ยังไม่มี**

---

## 4. Elevation & Depth

| Level | Treatment | Use |
|---|---|---|
| Flat | ไม่มีเงา ไม่มีขอบ | ไทล์เต็มจอ nav footer |
| Surface step | เปลี่ยนพื้นเป็น `{colors.canvas-elevated}` | แทนที่บทบาทของ "ยกระดับ" ทั้งหมด |
| Hairline | 1px `{colors.hairline}` | การ์ดยูทิลิตี้ เส้นใต้ sub-nav |
| Backdrop blur | `saturate(180%) blur(20px)` บนพื้น 80% | sub-nav และแถบ sticky |
| Product shadow | `rgba(0,0,0,0.55) 3px 5px 30px 0` | ภาพสินค้าเท่านั้น |

**กฎใหม่ที่สำคัญที่สุดของหมวดนี้:** ภาพสินค้าที่ต้องมีเงา **ต้องวางบน `{colors.canvas-elevated}` (#1d1d1f) ห้ามวางบน #000** เพราะเงาดำบนพื้นดำสนิทให้ผลเป็นศูนย์ ถ้าเลย์เอาต์บังคับให้ภาพอยู่บนพื้นดำ ให้ตัดเงาทิ้งไปเลยแทนที่จะใส่แล้วมองไม่เห็น — อย่าไปแก้ด้วยการเติม glow หรือ radial gradient เพราะจะพังกฎ "ไม่มี gradient"

หลักการเดิมยังอยู่: เงามีชุดเดียวในระบบ ห้ามใส่การ์ด ปุ่ม หรือข้อความ

---

## 5. Shapes

สเกล border-radius **ไม่เปลี่ยนเลย** — `none` 0 · `xs` 5px · `sm` 8px · `md` 11px · `lg` 18px · `pill` 9999px · `full` 50%

ไวยากรณ์เดิมยังใช้ได้ครบ: pill = การกระทำ, 8px = ยูทิลิตี้กะทัดรัด, 18px = การ์ดในกริด, ไทล์เต็มจอไม่มนมุม

---

## 6. Components

### Navigation

**`global-nav`** — พื้น `rgba(0,0,0,0.8)` + `backdrop-filter: saturate(180%) blur(20px)`, **เพิ่มเส้น 1px `{colors.hairline}` ด้านล่าง** สูง 44px ตัวอักษร `{colors.ink}` ใน `{typography.nav-link}` เส้นล่างจำเป็นเพราะ nav กับ canvas เป็นสีเดียวกันแล้ว ต่างจากระบบเดิมที่ nav ดำตัดกับหน้าขาว

**`sub-nav-frosted`** — พื้น `{colors.canvas-elevated}` ที่ 80% + blur, สูง 52px, เส้นล่าง 1px hairline ซ้าย: ชื่อหมวดใน `{typography.tagline}` ขวา: ลิงก์ + `{component.button-primary}` ค้างไว้

### Buttons

**`button-primary`** — พื้น `{colors.primary}` (#FFE169) ตัวอักษร `{colors.on-primary}` (#1d1d1f) ใน `{typography.body}` (17px/400) radius `{rounded.pill}` padding 11×22px
- Active: `transform: scale(0.95)` + พื้นเป็น `{colors.primary-pressed}`
- Focus: `outline: 2px solid {colors.primary-focus}` + `outline-offset: 2px`

**`button-secondary-pill`** — พื้นโปร่ง ตัวอักษร `{colors.primary}` ขอบ 1px `{colors.primary-muted}` (เหลือง 40%) radius pill padding 11×22px ขอบที่ทอนลง 40% ทำให้ปุ่มคู่ไม่แย่งกันดัง

> **กฎใหม่: หนึ่งไทล์ ปุ่มทึบได้ปุ่มเดียว** ที่เหลือเป็น ghost หมด ระบบเดิมวางแคปซูลน้ำเงินทึบสองอันข้างกันได้เพราะน้ำเงินเงียบพอ — เหลืองบนดำไม่เงียบขนาดนั้น

**`button-dark-utility`** — พื้น `{colors.surface-chip}` (#2a2a2c) ตัวอักษร `{colors.ink}` ใน `{typography.button-utility}` radius `{rounded.sm}` padding 8×15px (เดิมพื้นเป็น ink ดำ ซึ่งตอนนี้กลืนพื้นหลังไปแล้ว)

**`button-ghost-capsule`** — แทนที่ `button-pearl-capsule` เดิม พื้น `{colors.surface-chip}` ตัวอักษร `{colors.body-muted}` ขอบ 1px `{colors.divider-soft}` radius `{rounded.md}` (11px) padding 8×14px

**`button-store-hero`** — เหมือน `button-primary` แต่ `{typography.button-large}` (18px / **400** — เปลี่ยนจาก 300) padding 14×28px

**`button-icon-circular`** — 44×44px พื้น `{colors.surface-chip-translucent}` ไอคอน `{colors.ink}` radius `{rounded.full}`

**`text-link`** — `{colors.primary}` ทุกพื้นผิว **แนะนำให้ขีดเส้นใต้ในย่อหน้าเนื้อความ** เพราะเหลืองสดในกลางย่อหน้าจะอ่านเหมือนข้อความถูกไฮไลต์มากกว่าลิงก์ ส่วนลิงก์เดี่ยวที่จบท้ายบล็อก ("ดูรายละเอียด") ไม่ต้องขีด

### Cards & Containers

**`product-tile-void`** — เต็มจอ พื้น `{colors.canvas}` (#000) ตัวอักษร `{colors.ink}` radius `{rounded.none}` padding แนวตั้ง 80px สแตก: ชื่อสินค้า `{typography.display-lg}` → tagline `{typography.lead}` ใน `{colors.body-muted}` → CTA หนึ่งทึบหนึ่ง ghost → ภาพสินค้า **ไม่มีเงา**

**`product-tile-elevated`** — เหมือนข้างบนแต่พื้น `{colors.canvas-elevated}` (#1d1d1f) **ภาพสินค้ามีเงาได้** ใช้สลับกับ void tile เป็นจังหวะหลักของหน้า

**`product-tile-2` / `product-tile-3`** — พื้น `#232325` / `#161618` ใช้เมื่อมีไทล์ยกระดับติดกันสองอัน และที่ก้นสแตก

**`store-utility-card`** — พื้น `{colors.canvas-elevated}` ขอบ 1px `{colors.hairline}` radius `{rounded.lg}` (18px) padding 24px บน: ภาพ 1:1 บนพื้น `{colors.surface-chip}` มุม 8px ล่าง: ชื่อ `{typography.body-strong}` → ราคา `{typography.body}` ใน `{colors.body-muted}` → `{component.text-link}`

**`configurator-option-chip`** — พื้น `{colors.canvas}` ตัวอักษร `{colors.body-muted}` ขอบ 1px `{colors.hairline}` radius pill padding 12×16px
**`-selected`** — ขอบ **2px solid `{colors.primary}`** + ตัวอักษรเป็น `{colors.ink}` ชดเชย padding เป็น 11×15px กันขนาดกระโดด

**`floating-sticky-bar`** — พื้น `{colors.surface-tile-3}` ที่ 80% + blur เส้นบน 1px hairline สูง 64px padding 12×32px ซ้าย: ราคารวม ขวา: `{component.button-primary}`

**`search-input`** — พื้น `{colors.surface-chip}` ตัวอักษร `{colors.ink}` ขอบ 1px `{colors.divider-soft}` radius pill padding 12×20px สูง 44px placeholder `{colors.ink-muted-48}` focus: ขอบเป็น `{colors.primary-focus}`

### Footer

พื้น `{colors.canvas-elevated}` ตัวอักษร `{colors.body-muted}` ลิงก์ใน `{typography.dense-link}` (17px / 2.41) หัวคอลัมน์ `{typography.caption-strong}` ใน `{colors.ink}` แถวกฎหมาย `{typography.fine-print}` ใน `{colors.ink-muted-48}` padding แนวตั้ง 64px

---

## 7. Layout & Responsive

**ไม่เปลี่ยนอะไรเลย** — ฐาน 8px, section padding 80px, โทเคน spacing เดิม, max-width 980/1440px, breakpoints ทั้ง 8 ระดับ, กลยุทธ์ยุบคอลัมน์ 5→4→3→2→1, touch target ขั้นต่ำ 44px, การไล่ขนาด hero 56→40→34→28px

จุดเดียวที่ควรเพิ่ม: **ภาพสินค้าที่มีพื้นหลังสว่าง** ต้องเตรียมครอปเวอร์ชันพื้นมืดไว้ ไม่งั้นภาพจะกลายเป็นแผ่นสว่างลอยกลางหน้าดำ ซึ่งขัดกับปรัชญา "ภาพกลืนไปกับไทล์"

---

## 8. Do's & Don'ts (ฉบับปรับ)

### Do
- ใช้ `{colors.primary}` (#FFE169) เป็นสัญญาณ "กดได้" เพียงสีเดียว
- ตัวอักษรบนพื้นเหลืองใช้ `{colors.on-primary}` (#1d1d1f) เสมอ
- สลับ `{component.product-tile-void}` กับ `{component.product-tile-elevated}` เป็นจังหวะของหน้า
- วางภาพสินค้าที่ต้องมีเงาบนไทล์ยกระดับเท่านั้น
- ขีดเส้นใต้ลิงก์ที่อยู่กลางย่อหน้า
- ให้เส้น hairline กับ nav และ sticky bar เพื่อแยกจาก canvas
- ใส่ `outline-offset: 2px` กับวง focus ทุกครั้ง

### Don't
- **อย่าใช้ตัวอักษรสีขาวบนปุ่มเหลือง** — ข้อผิดพลาดที่เกิดบ่อยที่สุดของธีมนี้
- **อย่าวางปุ่มทึบสองอันข้างกัน** — อันที่สองต้องเป็น ghost
- **อย่าใช้ #FFE169 บนพื้นสว่าง** — ใช้ `{colors.primary-on-light}` (#8A6D00) แทน
- **อย่าใส่เงาบนพื้น #000** — มองไม่เห็น ตัดทิ้งดีกว่า
- อย่าแก้ปัญหาเงาไม่ขึ้นด้วย glow หรือ radial gradient
- อย่าเพิ่มสีเน้นที่สอง
- อย่าใส่เงาให้การ์ด ปุ่ม หรือข้อความ
- อย่าใช้น้ำหนัก 500
- อย่าใช้ 300 ที่ขนาดต่ำกว่า 24px
- อย่าใช้ขาวสนิท (#fff) เป็นสีตัวอักษร — ใช้ #f5f5f7

---

## 9. Contrast check

| คู่สี | อัตราส่วน | มาตรฐาน |
|---|---|---|
| #1d1d1f บน #FFE169 (ปุ่มหลัก) | 12.8:1 | ผ่าน AAA |
| #f5f5f7 บน #000000 | 19.6:1 | ผ่าน AAA |
| #f5f5f7 บน #1d1d1f | 15.1:1 | ผ่าน AAA |
| #FFE169 บน #000000 (ลิงก์) | 16.4:1 | ผ่าน AAA |
| #FFE169 บน #1d1d1f | 12.6:1 | ผ่าน AAA |
| #a1a1a6 บน #000000 | 8.9:1 | ผ่าน AAA |
| #a1a1a6 บน #1d1d1f | 6.9:1 | ผ่าน AA (AAA ที่ 18px+) |
| #6e6e73 บน #1d1d1f | 3.4:1 | ผ่าน AA เฉพาะข้อความใหญ่ — ใช้กับ fine print เท่านั้น |
| #ffffff บน #FFE169 | **1.3:1** | **ไม่ผ่าน — ห้ามใช้** |
| #FFE169 บน #ffffff | **1.4:1** | **ไม่ผ่าน — ห้ามใช้** |

---

## 10. ช่องว่างที่ยังไม่ได้ระบุ

- สถานะ error / validation ของฟอร์ม — ยังไม่มีในต้นฉบับ **ข้อควรระวัง:** ถ้าจะเพิ่มสีแดงเตือน มันจะเป็นสีที่สองของระบบ ทางออกที่ตรงกับปรัชญาเดิมมากกว่าคือใช้ข้อความ + ไอคอนสื่อความหมายแทนการเติมสี
- โทเคนสำหรับ "สำเร็จ / เตือน" — เหลืองถูกจองเป็น accent แล้ว ห้ามนำไปสื่อความหมายเชิงสถานะ ไม่งั้นผู้ใช้จะสับสนว่าอะไรกดได้
- ค่า blur ที่แน่นอนของ backdrop-filter ยังไม่ถูกทำเป็นโทเคน ใช้ `saturate(180%) blur(20px)` เป็นค่าตั้งต้น
- โหมดสว่างคู่ขนาน — ถ้าต้องรองรับทั้งสองโหมด #FFE169 ใช้บนพื้นสว่างไม่ได้ ต้องสลับเป็น `{colors.primary-on-light}` ซึ่งจะทำให้ "สีแบรนด์" ดูเป็นคนละสีระหว่างสองโหมด นี่เป็นข้อจำกัดที่แก้ไม่ได้ของ accent สีสว่าง ควรตัดสินใจแต่เนิ่นๆ ว่าจะทำโหมดสว่างหรือไม่
