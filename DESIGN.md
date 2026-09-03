# Design System — Dark Mode / Yellow Accent

ปรับจากระบบเดิม (Apple-style, light-dominant, Action Blue) เป็นธีมมืดที่ใช้ **#FFE169** เป็นสีโต้ตอบเดียวของทั้งระบบ

โครงสร้างทั้งหมด — ระบบตัวอักษร จังหวะ spacing ไวยากรณ์รูปทรง breakpoints — **ไม่เปลี่ยน** สิ่งที่เปลี่ยนคือชั้นสีและกฎที่ตามมาจากการที่ accent กลายเป็นสีสว่าง

> **จะทำหน้าใหม่ อ่านข้อ 11 ก่อน** — ข้อ 1–10 คือระบบสี/รูปทรงระดับโทเคน ส่วน **[ข้อ 11](#11-หน้าต้นแบบของแอป--stock-จัดการสต็อก)** คือแบบแปลนหน้าจริงที่หน้ารายการข้อมูลทุกหน้าต้องเดินตาม (ยึดหน้า `#stock` เป็นต้นแบบ) และ **[ข้อ 12](#12-จุดที่หน้า-stock-ขัดกับข้อ-110--ต้องตัดสินใจ)** คือจุดที่สองส่วนนี้ยังไม่ตรงกัน

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
- ~~โหมดสว่างคู่ขนาน~~ **ตัดสินใจแล้ว: ทำ** (ดูข้อ 13)

  ทางออกของปัญหา "#FFE169 ใช้บนพื้นสว่างไม่ได้" คือ **แยก accent ตามบทบาท** ไม่ใช่สลับทั้งก้อน
  - accent เป็น *พื้นผิว* (ปุ่ม เมนู active) — คงเป็น #FFE169 ทั้งสองโหมด ตัวอักษรเข้มบนเหลืองได้ 13:1 อยู่แล้ว แบรนด์จึงไม่เพี้ยน
  - accent เป็น *หมึกหรือเส้น* (ตัวอักษร ขอบ focus ring) — ใช้โทเคนใหม่ `{colors.accent-ink}` ซึ่งเป็น #FFE169 ในโหมดมืด และ #806400 ในโหมดสว่าง

  จากการนับจริง accent ถูกใช้เป็นพื้น 124 จุด และเป็นหมึก/เส้น 512 จุด การแยกจึงคุ้มค่า

---

## 11. หน้าต้นแบบของแอป — `#stock` (จัดการสต็อก)

ข้อ 1–10 คือระบบสี/รูปทรงระดับโทเคน **ข้อนี้คือแบบแปลนหน้าจริง** ที่หน้ารายการข้อมูลทุกหน้าต้องเดินตาม

**ต้นฉบับที่ต้องไปอ่านของจริง**

| ส่วน | ที่อยู่ |
|---|---|
| โครงหน้า + แถบควบคุม + ตาราง | `index.html` → `#view-stock` |
| พาเนลกรองละเอียด (drawer) | `index.html` → `#stock-filter-panel` |
| โมดัลฟอร์ม | `index.html` → `#add-product-modal` |
| เรนเดอร์แถวตาราง + สถานะ | `script.js` → `renderProductTable` |
| ชิปตัวกรองที่ใช้อยู่ | `script.js` → `renderActiveFilterChips` |
| แถวโครงร่างตอนรอข้อมูล | `script.js` → `renderStockTableSkeleton` |
| ตรรกะ pill group | `script.js` → บริเวณ `.filter-pill` |

**ขอบเขต:** ทุกหน้าที่เป็น "รายการข้อมูล + ตัวกรอง + ตาราง" — สต็อก, รายการขาย, ใบสั่งซื้อ, สมาชิก, บุคลากร, สาขา, บัญชี
หน้าที่มีไวยากรณ์ของตัวเอง (POS `#transactions`, แดชบอร์ด) ไม่ต้องบังคับตามข้อนี้ แต่ยังต้องอยู่ใต้ข้อ 1–10

---

### 11.1 โครงหน้า 3 ชั้น

```
<main class="bg-black">            ← canvas ดำสนิท ไม่มีข้อยกเว้น
└─ #main-content                    p-4 pb-24 sm:p-6 sm:pb-6 lg:p-8 lg:pb-8
   └─ #view-<ชื่อ>                  class="hidden space-y-8 animate-fade-in"
      ├─ [1] หัวหน้า                ไอคอน + ชื่อหน้า (ซ้าย) · ปุ่มการกระทำหลัก (ขวา)
      └─ [2] การ์ดพาเนล             ครอบ 2a + 2b + 2c ไว้ในกล่องเดียว
         ├─ 2a แถบควบคุม           ค้นหา · ตัวกรองด่วน · ปุ่มกรองละเอียด · ส่งออก
         ├─ 2b ชิปตัวกรอง + ตัวนับ
         └─ 2c ตาราง
```

กฎของโครง:

- ระยะระหว่างบล็อกระดับบนสุด = `space-y-8` (32px) เสมอ
- **ห้ามใส่พื้นหลังให้ `#view-*`** — พื้นทั้งหมดต้องมาจากการ์ดพาเนล ไม่งั้นจะได้กล่องซ้อนกล่องสีเดียวกัน
- **แถบควบคุมกับตารางอยู่ในการ์ดใบเดียวกัน** ไม่แยกเป็นสองการ์ด — นี่คือลายเซ็นของหน้านี้
- หน้ามีการ์ดพาเนลใบเดียว ถ้าต้องมีหลายใบให้ทบทวนว่ามันควรเป็นคนละหน้าหรือไม่

---

### 11.2 หัวหน้า

```html
<div class="flex flex-col sm:flex-row sm:items-center sm:justify-between gap-4">
    <div class="flex items-center gap-4">
        <i class="bi bi-box-seam text-white w-5 text-2xl text-center"></i>
        <h3 class="text-2xl text-white">จัดการสต็อก</h3>
    </div>
    <div class="flex items-center gap-3">
        <!-- ปุ่มการกระทำหลักของหน้า -->
    </div>
</div>
```

- ชื่อหน้าเป็น `<h3>` (`<h1>`/`<h2>` ถูกใช้ในโครงแอปแล้ว — **ห้ามข้ามระดับหัวข้อ** ดูหัวข้อ Accessibility ใน `CLAUDE.md`)
- ไอคอนนำหน้าเป็น Bootstrap Icons ที่ `text-2xl` + `w-5 text-center` เพื่อให้ความกว้างคงที่ ชื่อหน้าจึงไม่ขยับตามไอคอน
- ไม่ใส่ `font-bold` — `text-2xl` เปล่าคือน้ำหนักของหัวหน้าในระบบนี้

**ปุ่มการกระทำหลัก** (ทึบ accent — หนึ่งหน้ามีได้ปุ่มเดียว ตามกฎข้อ 6):

```html
<button class="px-4 py-2 bg-[#FFE169] hover:bg-[#E2B93C] text-[#333333] font-medium
               rounded-xl transition-all flex items-center gap-2 w-fit cursor-pointer relative">
    <i class="fa-solid fa-plus"></i>
    <p>เพิ่มสินค้าในสต็อก</p>
</button>
```

ถ้าปุ่มต้องมีคำอธิบายกำกับ ใช้ป้ายลอยมุมบนขวา: `text-xs absolute -top-3 right-0 px-2 py-1 bg-white rounded-full`

---

### 11.3 การ์ดพาเนล

```html
<div class="bg-[#4D4D4D]/40 rounded-2xl shadow-lg overflow-hidden backdrop-blur-sm">
```

- `bg-[#4D4D4D]/40` บนพื้นดำได้สีจริง **#1F1F1F** ซึ่งห่างจากโทเคน `canvas-elevated` (#1d1d1f) แค่ 2 จุด — ตาแยกไม่ออก จะเขียนแบบไหนก็ได้ผลเดียวกัน
- `overflow-hidden` **จำเป็น** ไม่งั้นหัวตารางกับมุมโค้ง 16px จะชนกัน
- `backdrop-blur-sm` ไม่มีผลตอนวางบนพื้นทึบ แต่คงไว้เพื่อให้ยังถูกเมื่อมีอะไรอยู่ข้างหลัง

---

### 11.4 แถบควบคุม (2a)

```html
<div class="p-6 pb-0 flex flex-col lg:flex-row lg:items-center lg:justify-between gap-4">
    <h3 class="text-lg text-white flex items-center gap-2">
        <img src="icons_img/information 3.png" alt="" width="20" height="20"> ภาพรวมคลังสินค้า
    </h3>
    <div class="flex flex-wrap items-center gap-2.5 relative w-full lg:w-auto">
        <!-- ค้นหา · select · ปุ่มกรอง · ส่งออก -->
    </div>
</div>
```

ยุบตัวที่ `lg`: ต่ำกว่านั้นหัวข้อกับกลุ่มคอนโทรลเรียงลงมาเป็นสองแถว คอนโทรลกินเต็มความกว้าง (`w-full lg:w-auto`)

**ช่องค้นหา** — ไอคอนเปลี่ยนเป็นเหลืองตอนโฟกัสด้วย `group-focus-within`

```html
<div class="relative group w-full sm:w-64 cursor-pointer rounded-[0.5rem] overflow-hidden">
    <div class="absolute inset-y-0 left-0 pl-3 flex items-center pointer-events-none">
        <i class="fa-solid fa-search text-white group-focus-within:text-[#FFE169] transition-colors"></i>
    </div>
    <input id="<หน้า>-search-input" type="text" placeholder="ค้นหา..."
        class="bg-transparent text-sm pl-10 pr-4 py-2 w-full text-white focus:outline-none
               focus:ring-1 focus:ring-[#FFE169] transition-all placeholder-white">
</div>
```

**Select ตัวกรองด่วน** — ต้องเขียน `[&>option]` เอง เพราะ `<option>` ไม่รับสไตล์จาก parent

```html
<select class="bg-[#4D4D4D]/40 cursor-pointer text-sm rounded-[0.5rem] px-3 py-2 text-white
               focus:outline-none focus:ring-1 focus:ring-[#FFE169] w-full sm:w-auto
               [&>option]:bg-[#4D4D4D]
               [&>option:checked]:bg-[#FFE169] [&>option:checked]:text-[#333333]">
```

ตัวกรองรองที่ไม่จำเป็นบนจอเล็กให้ซ่อนด้วย `hidden md:block` (หน้านี้ซ่อน "หมวดหมู่" กับ "สถานะ") ค่าเหล่านั้นยังเข้าถึงได้จาก drawer เสมอ

**ปุ่มกรองละเอียด (ghost)** — ป้ายต้องบอกจำนวนตัวกรองที่ใช้อยู่ `เพิ่มเติม (3)`

```html
<button class="px-3 py-2 bg-[#4D4D4D]/40 cursor-pointer text-white flex items-center
               rounded-[0.5rem] text-sm hover:bg-[#5C5C5C] transition-colors w-full sm:w-auto">
    <img src="icons_img/filter 3.png" alt="" class="mr-1" width="16">
    <span id="<หน้า>-filter-text">เพิ่มเติม</span>
</button>
```

**ปุ่มส่งออก (ทึบเล็ก)** — `px-4 py-2 bg-[#FFE169] text-[#333333] flex items-center font-semibold rounded-[0.5rem] text-sm hover:bg-[#E2B93C] transition-colors w-full sm:w-auto`

---

### 11.5 ชิปตัวกรอง + ตัวนับผลลัพธ์ (2b)

```html
<div class="px-6 py-4">
    <div class="flex flex-col sm:flex-row sm:items-center sm:justify-between gap-3">
        <div id="<หน้า>-active-filters" class="flex flex-wrap gap-2"></div>
        <div id="<หน้า>-result-count" class="text-xs text-white font-medium"></div>
    </div>
</div>
```

ตัวนับใช้ข้อความ **`แสดง N จาก M รายการ`** เสมอ

**ชิปหนึ่งตัว** (สร้างจาก JS):

```js
chip.className = 'px-4 py-2.5 rounded-xl bg-[#4D4D4D]/40 border border-[#3F3F46] ' +
                 'text-white text-sm font-medium transition-colors flex items-center gap-2';
chip.innerHTML = `<span>${label}</span><i class="fa-solid fa-xmark text-[10px] opacity-80"></i>`;
```

กฎของชิป:

- ป้ายเป็นรูป **`หมวด: ค่า`** เสมอ (`สาขา: สาขาหาดใหญ่`, `ราคาขาย: ฿15,000 - ฿30,000`) ไม่ใช่ค่าลอยๆ
- **ลบได้เฉพาะตอนคลิกที่กากบาท** — ตัวชิปเองไม่ตอบสนอง: `if (!e.target.closest('i.fa-xmark')) return;`
- ช่วงตัวเลขที่เปิดปลายข้างหนึ่งใช้คำว่า `0` และ `ไม่จำกัด` ไม่ใช่ค่าว่าง
- **ปุ่ม "ล้างทั้งหมด" โผล่เมื่อมีตัวกรองมากกว่า 1 ตัวเท่านั้น** ตัวเดียวไม่ต้องมี — ผู้ใช้กดกากบาทเร็วกว่าอยู่แล้ว

```js
clearBtn.className = 'px-2.5 py-1 bg-red-500/10 hover:bg-red-500/15 text-red-300 ' +
                     'rounded-full text-xs font-medium border border-red-500/30 transition-colors';
```

---

### 11.6 ตาราง (2c)

```html
<div class="overflow-x-auto">
    <table class="w-full text-left text-sm whitespace-nowrap border-collapse">
        <thead class="bg-[#4D4D4D]/40 text-white">
            <tr><th class="px-6 py-4 font-semibold text-[15px]">รหัสสินค้า</th>…</tr>
        </thead>
        <tbody id="<หน้า>-table-body" class="divide-y divide-[#464646]"></tbody>
    </table>
</div>
```

- ทุกเซลล์ `px-6 py-4` — **ค่าเดียว ไม่มีตารางแน่นตารางโปร่ง**
- หัวตาราง `text-[15px] font-semibold` ใหญ่กว่าเนื้อ (`text-sm` = 14px) 1px พอดี
- แถว `hover:bg-[#464646] transition-colors` และเส้นคั่น `divide-[#464646]` เป็นสีเดียวกัน — เวลาชี้ แถวจะดูกลืนเส้นเป็นก้อนเดียว
- `whitespace-nowrap` + `overflow-x-auto` คือกลยุทธ์มือถือของตารางในระบบนี้ — **ไม่ยุบเป็นการ์ด**
- ถ้ากล่องเลื่อนได้จริงบนจอที่รองรับ ให้ใส่ `tabindex="0"` ที่ `.overflow-x-auto` (WCAG 2.1.1 — ดู `CLAUDE.md`)
- การจัดชิด: ข้อความ = ซ้าย (ค่าเริ่มต้น), เงิน = `text-right`, จำนวน = `text-center`, คอลัมน์จัดการ = `text-right`

**สูตรเซลล์ตามชนิดข้อมูล**

| ชนิด | สูตร |
|---|---|
| รหัส/เลขที่เอกสาร | `<span class="font-mono font-semibold text-[#FFE169]">` — **รหัสเป็นสีเหลืองเสมอ** เป็นจุดยึดสายตาของแถว |
| ชื่อ + คำบรรยาย | จุดสี 16px หน้าชื่อ + `<p class="font-medium text-white">` ทับ `<p class="text-xs text-white/70">` |
| ข้อความทั่วไป | `text-white text-sm` และใช้ `-` เมื่อไม่มีค่า (ไม่ปล่อยว่าง) |
| ป้ายหมวดหมู่ | `px-2.5 py-1 rounded-[0.375rem] text-xs font-medium` บนพื้นเทา |
| เงิน | `text-right text-white font-mono` นำหน้าด้วย `฿` และผ่าน `toLocaleString()` |
| จำนวน + หน่วย | `text-center text-white font-medium` โดยหน่วยเป็น `<span class="text-xs text-white font-normal">` |
| สถานะ | ป้ายจุด (ดูล่าง) |
| ปุ่มจัดการ | `flex items-center justify-end gap-1` |

**ตัวบอกสีสินค้า** — จุดสี 16px วางหน้าชื่อในบรรทัดเดียวกัน:

```html
<p class="font-medium text-white flex items-center gap-2">
    <span class="w-4 h-4 rounded-full shrink-0" style="background-color:#RRGGBB;"></span>
    <span>ชื่อสินค้า</span>
</p>
```

สร้างจาก `window.productColorDot()` เท่านั้น ห้ามเขียนมาร์กอัปเอง
รายละเอียดครบ (อีกแบบหนึ่ง เกณฑ์เลือกใช้ กับดัก และที่มาของสี) อยู่ที่ **ข้อ 11.14**

**ป้ายสถานะ** — จุดสี + ข้อความ ในกล่อง tint 12%

```html
<div class="inline-flex items-center gap-2 px-2.5 py-1 rounded-[0.375rem] {พื้น}">
    <div class="w-2 h-2 rounded-full {จุด}"></div>
    <span class="{ตัวอักษร} font-medium text-xs">{ข้อความ}</span>
</div>
```

| ความหมาย | จุด | พื้น | ตัวอักษร |
|---|---|---|---|
| ปกติ / สำเร็จ | `bg-[#20D500]` | `bg-[#42A231]/[0.12]` | `text-[#20D500]` |
| หมด / ล้มเหลว | `bg-[#FE0000]` | `bg-[#FE0000]/[0.12]` | `text-[#FE0000]` |
| ระหว่างดำเนินการ | `bg-orange-500` | `bg-orange-500/[0.12]` | `text-orange-400` |

> แถว "กำลังโอนย้าย" ใน `script.js` ยังใช้ `bg-orange-50 border border-orange-200` + `text-orange-600` ซึ่งเป็นชุดสีของธีมสว่าง (พื้นเกือบขาว) — **อย่าลอกของเดิม** ใช้ค่าในตารางนี้

**ปุ่มไอคอนในคอลัมน์จัดการ** — ไม่มีพื้น มีแค่สีตอนชี้ และต้องมี `title`

```html
<button class="text-white hover:text-amber-400 transition-colors p-2" title="พิมพ์บาร์โค้ด">
<button class="text-white hover:text-indigo-400 transition-colors p-2" title="ดูรายละเอียด">
<button class="text-white hover:text-red-400  transition-colors p-2" title="ลบ">
```

การกระทำที่ย้อนไม่ได้ (ลบ) ต้อง**ทั้ง** ตรวจสิทธิ์ก่อนเรนเดอร์ปุ่ม **และ** ผ่าน `showConfirm()` ก่อนยิง API

---

### 11.7 สถานะว่าง และแถวโครงร่าง

**ว่าง** — แถวเดียวกินเต็มความกว้าง ไม่ใช่ภาพประกอบกลางจอ:

```html
<tr><td colspan="9" class="px-6 py-8 text-center text-white/50 italic">ไม่พบสินค้าที่ค้นหา</td></tr>
```

**กำลังโหลด** — เรียก skeleton **ก่อน** `await` ทุกครั้ง ไม่ปล่อยตารางว่างระหว่างรอ

- แท่ง: `h-3.5 <w-*> rounded-full bg-[#5c5c5c] animate-pulse`
- วงกลม: `w-10 h-10 rounded-full bg-[#5c5c5c] animate-pulse flex-shrink-0`
- 8 แถวเป็นค่าตั้งต้น และโครงต้องมีคอลัมน์/ความกว้างใกล้เคียงของจริง ไม่งั้นตารางจะกระตุกตอนข้อมูลมาแทน

---

### 11.8 พาเนลกรองละเอียด (drawer เลื่อนจากขวา)

ตัวกรองด่วนอยู่บนแถบควบคุม ส่วนที่เหลือทั้งหมดอยู่ใน drawer — **แถบควบคุมห้ามยาวจนล้นสองบรรทัดบนเดสก์ท็อป**

```html
<div id="…-filter-panel"
     class="fixed inset-0 z-50 flex justify-end opacity-0 pointer-events-none transition-opacity duration-300">
    <div class="modal-content relative w-[90%] md:w-[600px] h-full overflow-y-auto p-8
                bg-[#18181B] shadow-[-10px_0_40px_rgba(0,0,0,0.5)] border-l border-[#4D4D4D]
                translate-x-full transition-transform duration-300">
```

เปิด/ปิดด้วยสองชั้น: กล่องนอกสลับ `opacity-0 pointer-events-none` (300ms) กล่องในสลับ `translate-x-full` (300ms)

**หัว drawer / modal — สูตรเดียวกันทุกที่:**

```html
<div class="flex items-center justify-between mb-6 pb-2 border-b border-[#333333]">
    <h3 class="text-lg font-medium text-white flex items-center gap-2">
        <i class="fa-solid fa-filter text-[#FFE169]"></i> ตัวกรองคลังสินค้าอย่างละเอียด
    </h3>
    <button aria-label="ปิด" class="text-red-500 hover:text-red-400 transition-colors">
        <i class="fa-solid fa-xmark text-xl"></i>
    </button>
</div>
```

ไอคอนนำหัวข้อเป็น **เหลือง** ส่วนปุ่มปิดเป็น **แดง** และต้องมี `aria-label="ปิด"` เพราะไม่มีข้อความ

**ท้าย drawer:**

```html
<div class="flex items-center justify-center gap-4 pt-4 border-t border-[#333333]">
    <button class="px-10 py-2.5 rounded-xl bg-[#E4E4E7] text-[#18181B] text-[15px] font-bold hover:bg-white transition-colors w-1/2">ล้างทั้งหมด</button>
    <button class="px-12 py-2.5 rounded-xl bg-[#FFE169] text-[#333333] text-[15px] font-bold hover:bg-[#E2B93C] transition-colors flex items-center justify-center gap-2 w-1/2">ตกลง</button>
</div>
```

ซ้าย = การกระทำรอง (เทาอ่อน) · ขวา = การกระทำหลัก (เหลือง) · ใน drawer ให้ `w-1/2` ทั้งคู่ ในโมดัลปล่อยตามเนื้อหา

---

### 11.9 ฟอร์ม (ใช้ร่วมกันทั้ง drawer และโมดัล)

ตัวฟอร์ม: `space-y-5 text-sm` · แต่ละฟิลด์: `space-y-2` · สองคอลัมน์: `grid grid-cols-1 md:grid-cols-2 gap-5`

**ป้ายกำกับ**

```html
<label for="<id ของช่อง>" class="text-slate-200 font-medium flex items-center gap-2 text-xs">
    <i class="fa-solid fa-mobile-screen text-white"></i> ชื่อสินค้า <span class="text-red-500">*</span>
</label>
```

ป้ายอยู่**เหนือ**ช่องเสมอ ตัวเล็ก (`text-xs`) มีไอคอนนำ และ **ต้องมี `for=`** — ความใกล้กันไม่ผูกป้ายกับช่องให้ (ดูหัวข้อ Accessibility ใน `CLAUDE.md`) ดอกจันแดงใช้เฉพาะฟิลด์บังคับ

**ช่องกรอก / select**

```html
class="w-full px-4 py-2.5 rounded-xl bg-[#27272A] border border-[#3F3F46] text-white
       focus:border-[#FFE169] focus:outline-none transition-all placeholder-slate-500 text-sm"
```

`<select>` เพิ่ม `appearance-none` แล้ววาดลูกศรเอง (ลูกศรของระบบเป็นสีอ่อนอ่านไม่ออกบนพื้นมืด):

```html
<div class="absolute right-4 top-[14px] pointer-events-none text-slate-400">
    <i class="fa-solid fa-chevron-down text-xs"></i>
</div>
```

ช่องตัวเลขต้องมี `type="number" inputmode="numeric"` และช่วงค่าใช้สองช่อง `ต่ำสุด`/`สูงสุด` ใน `grid grid-cols-2 gap-5`
ค่าที่ผู้ใช้เลือกบ่อยให้ทำเป็นปุ่มเติมค่าใต้ช่อง: `px-2 py-0.5 bg-[#3F3F46] rounded text-[10px] text-slate-300 hover:text-white hover:bg-[#5C5C5C]`

**กลุ่ม pill — ใช้แทน select เมื่อตัวเลือกมีไม่มากและอยากให้เห็นทั้งหมด**

```html
<input type="hidden" id="…">                        <!-- หรือ <select class="hidden"> -->
<div id="…-container" class="flex items-center gap-2 overflow-x-auto hide-scrollbar pb-1 px-8">
    <button type="button" data-target="…" data-value=""
        class="flex-shrink-0 px-4 py-2.5 bg-[#27272A] border border-[#FFE169] rounded-xl
               text-[#FFE169] text-sm hover:border-[#FFE169] hover:text-white
               transition-colors filter-pill active">ทั้งหมด</button>
    <button type="button" data-target="…" data-value="iPhone"
        class="flex-shrink-0 px-4 py-2.5 bg-[#27272A] border border-[#3F3F46] rounded-xl
               text-slate-300 text-sm hover:border-[#FFE169] hover:text-white
               transition-colors filter-pill">iPhone</button>
</div>
```

สัญญาของ pill group (JS พึ่งพาทั้งหมดนี้):

- `.filter-pill` เป็น hook ของ JS — **ห้ามเปลี่ยนชื่อ**
- สถานะเลือก = สลับ `border-[#3F3F46]`+`text-slate-300` ↔ `border-[#FFE169]`+`text-[#FFE169]` **พื้นไม่เปลี่ยน** (ตรงกับ `configurator-option-chip` ในข้อ 6 — เลือกแล้วเปลี่ยนขอบ ไม่ใช่เปลี่ยนพื้น)
- ปุ่มแรกคือ `ทั้งหมด` ที่ `data-value=""` เสมอ และกด pill ที่เลือกอยู่ซ้ำ = กลับไป `ทั้งหมด`
- ค่าจริงเก็บใน `<input type="hidden">` / `<select class="hidden">` ที่ `data-target` ชี้ไป แล้ว dispatch `change` — ตัวกรองและฟอร์มจึงอ่านค่าทางเดียวกันหมด
- `hide-scrollbar` ซ่อนแถบเลื่อน (นิยามอยู่ใน `style.css`) และ `px-8` เว้นที่ให้ปุ่มเลื่อนซ้าย/ขวาทับ

ปุ่มเลื่อนซ้าย/ขวาของ pill group ใช้ gradient fade เป็น mask ปิดขอบ — **ข้อยกเว้นเดียวของกฎ "ไม่มี gradient"** ดูข้อ 12

---

### 11.10 โมดัลฟอร์ม

```html
<div class="fixed inset-0 z-50 flex items-center justify-center backdrop-blur-sm
            opacity-0 pointer-events-none transition-opacity duration-300 p-4">
    <div class="modal-content relative w-[95%] md:w-[650px] max-h-[90vh] overflow-y-auto p-8
                bg-[#18181B] rounded-2xl shadow-[0_10px_40px_rgba(0,0,0,0.5)] border border-[#4D4D4D]">
```

- **`.modal-content` เป็น hook ของ JS** (`querySelector('.modal-content')` ใน `js/page-deposits.js`, `js/page-sales-history.js`, `js/page-stock-audit.js`) — ต้องมี ห้ามลบ
- `z-50` สำหรับโมดัลปกติ · `z-[60]` เมื่อโมดัลซ้อนบนโมดัล (เช่น เลือก IMEI ระหว่างขาย)
- ความกว้าง: ฟอร์ม `md:w-[650px]` · drawer `md:w-[600px]` · ตารางในโมดัล `md:w-[900px]` · ยืนยันสั้นๆ `max-w-md`
- หัวข้อโมดัล **ต้องมีข้อความจริงใน HTML ตั้งแต่แรก** ห้ามปล่อยว่างให้ JS เติม (หัวข้อเปล่า = โปรแกรมอ่านหน้าจออ่านไม่ได้)

---

### 11.11 ตารางค่าอ้างอิงของหน้านี้

| บทบาท | ค่าที่เขียนจริง | สีจริงหลังซ้อน | โทเคนที่ตรงกัน |
|---|---|---|---|
| canvas | `bg-black` (บน `<main>`) | `#000000` | `canvas` ✅ |
| พื้นการ์ดพาเนล | `bg-[#4D4D4D]/40` บนดำ | **`#1F1F1F`** | `canvas-elevated` (#1d1d1f) — ห่าง 2 จุด |
| พื้นหัวตาราง | `bg-[#4D4D4D]/40` บนพาเนล | **`#313131`** | ไม่มีโทเคน (ใกล้ `surface-chip`) |
| แถวชี้ / เส้นคั่นแถว | `#464646` | | ไม่มีโทเคน |
| พื้น drawer / โมดัล | `#18181B` | | ไม่มีโทเคน (ใกล้ `surface-tile-3` #161618) |
| พื้นช่องกรอก / pill | `#27272A` | | ไม่มีโทเคน (ใกล้ `surface-chip` #2a2a2c) |
| ขอบช่องกรอก / pill | `#3F3F46` | | ไม่มีโทเคน (ใกล้ `hairline` #38383a) |
| เส้นคั่นหัว/ท้ายฟอร์ม | `#333333` | | ≈ `hairline` |
| ขอบ drawer / โมดัล | `#4D4D4D` | | สว่างกว่า `hairline` |
| accent | `#FFE169` | | `primary` ✅ |
| accent ตอนชี้ | `#E2B93C` | | ⚠️ ต่างจาก `primary-pressed` (#F5D24E) |
| ตัวอักษรบน accent | `#333333` | | ⚠️ ต่างจาก `on-primary` (#1d1d1f) |
| ตัวอักษรหลัก | `text-white` | `#ffffff` | ⚠️ ต่างจาก `ink` (#f5f5f7) |
| ตัวอักษรรอง | `text-white/70` | | ≈ `body-muted` |
| ป้ายกำกับฟอร์ม | `text-slate-200` | `#e2e8f0` | ⚠️ นอกพาเลตต์ |
| placeholder | `placeholder-slate-500` | `#64748b` | ⚠️ นอกพาเลตต์ |
| ปุ่มรอง (พื้นสว่าง) | `#E4E4E7` / ตัวอักษร `#18181B` | | ไม่มีโทเคน |
| แท่ง skeleton | `#5c5c5c` | | ไม่มีโทเคน |

**รัศมี — หน้านี้ใช้ 4 ค่า**

| ใช้กับ | คลาส | ค่าจริง |
|---|---|---|
| การ์ดพาเนล, โมดัล | `rounded-2xl` | 16px |
| ชิป, pill, ช่องกรอก, ปุ่มในฟอร์ม, ปุ่มหัวหน้า | `rounded-xl` | 12px |
| คอนโทรลในแถบควบคุม (ค้นหา/select/ปุ่ม) | `rounded-[0.5rem]` | 8px |
| ป้ายเล็ก (หมวดหมู่, สถานะ) | `rounded-[0.375rem]` | 6px |
| จุดสถานะ, ไอคอนวงกลม, ปุ่มล้างทั้งหมด | `rounded-full` | — |

> ⚠️ **กับดักที่หลอกตาที่สุดในโปรเจกต์นี้:** `src/tailwind-input.css` เขียนทับ `--radius-xs/sm/md/lg` เป็น 5/8/11/**18**px แต่ **ไม่ได้เขียนทับ `xl`/`2xl`** สองตัวนั้นจึงยังเป็นค่าเริ่มต้นของ Tailwind (12/16px) ผลคือ `rounded-lg` (18px) **ใหญ่กว่า** `rounded-xl` (12px) ในโปรเจกต์นี้ — สลับกับที่ทุกคนคุ้นเคย ให้ยึดค่าจากตารางข้างบน อย่าเดาจากชื่อคลาส

**ระยะ** — `p-6` (พาเนล) · `px-6 py-4` (เซลล์ตาราง, แถวชิป) · `p-8` (drawer/โมดัล) · `gap-2` ชิป · `gap-2.5` คอนโทรล · `gap-3`/`gap-4` กลุ่มปุ่ม · `space-y-2` ในฟิลด์ · `space-y-5` ระหว่างฟิลด์ · `space-y-8` ระหว่างบล็อกหลัก

**Breakpoint ที่ใช้จริง** — `sm` ยุบหัวหน้า/แถวชิป · `md` ซ่อนตัวกรองรอง + กำหนดความกว้าง drawer/โมดัล · `lg` ยุบแถบควบคุม

---

### 11.12 เช็กลิสต์ก่อนบอกว่าหน้าใหม่เสร็จ

1. `#view-*` เป็น `hidden space-y-8` ไม่มีพื้นหลังของตัวเอง
2. หัวหน้า = ไอคอน + `<h3 class="text-2xl text-white">` + ปุ่มหลัก **ทึบเหลืองไม่เกินหนึ่งปุ่ม**
3. แถบควบคุม + ชิป + ตาราง อยู่ในการ์ด `bg-[#4D4D4D]/40 rounded-2xl overflow-hidden` **ใบเดียว**
4. ช่องค้นหามีไอคอนที่เปลี่ยนเป็นเหลืองตอนโฟกัส
5. มีตัวนับ `แสดง N จาก M รายการ` และชิปรูป `หมวด: ค่า` ที่ลบได้จากกากบาท
6. ตัวกรองที่ไม่ใช่ตัวหลักอยู่ใน drawer และปุ่มเปิด drawer โชว์จำนวนที่ใช้อยู่
7. ทุกเซลล์ `px-6 py-4` · รหัสเป็น `font-mono text-[#FFE169]` · เงินเป็น `font-mono text-right` มี `฿` และคั่นหลักพัน
8. สถานะใช้ป้ายจุด + tint 12% จากตารางในข้อ 11.6 เท่านั้น
9. มี skeleton ก่อน `await` และมีแถวสถานะว่างที่ `colspan` ตรงกับจำนวนคอลัมน์
10. ทุก `<label>` มี `for=` · ปุ่มที่มีแต่ไอคอนมี `aria-label` · หัวข้อไม่ข้ามระดับ · กล่องที่เลื่อนได้มี `tabindex="0"`
11. การกระทำที่ย้อนไม่ได้ ตรวจสิทธิ์ก่อนเรนเดอร์ปุ่ม **และ** ผ่าน `showConfirm()`
12. บัมพ์เวอร์ชัน cache ตามตารางใน `CLAUDE.md` (`VIEW_FRAGMENT_VERSION` / `PAGE_SCRIPT_VERSION` / `?v=`)

---

### 11.13 อย่าลอกไปใช้ — เศษที่ค้างอยู่ในหน้านี้

หน้านี้เป็นต้นแบบของ *เลย์เอาต์* ไม่ใช่ของ *ทุกคลาสที่เขียนอยู่* ของพวกนี้เป็นซากธีมเก่า (cyan/slate) และคลาสที่ไม่มีอยู่จริง — ห้ามขยายต่อ และเก็บกวาดได้เมื่อแตะไฟล์นั้นอยู่แล้ว

| ที่พบ | ปัญหา | ใช้แทนด้วย |
|---|---|---|
| `shadow-lg shadow-cyan-500/20` (ปุ่มเพิ่มสินค้า) | เงาเรืองสีฟ้าจากธีมเดิม | ตัดทิ้ง |
| `glow-button`, `custom-pill`, `animate-fade-in`, `custom-scrollbar` | **ไม่มี CSS รองรับเลยสักบรรทัด** ไม่มีผลใดๆ | ตัดทิ้ง (แต่ `.modal-content` และ `.filter-pill` เป็น hook ของ JS — เก็บไว้) |
| `focus:border-cyan-500` (select หมวดหมู่) | โฟกัสเป็นสีฟ้า ต่างจาก select ข้างๆ | `focus:ring-1 focus:ring-[#FFE169]` |
| `hover:bg-slate-700`, `bg-slate-700 text-slate-300` | พาเลตต์ slate ปนเข้ามา | `hover:bg-[#5C5C5C]`, พื้นเทาจากตาราง 11.11 |
| `text-slate-400 italic` (แถวว่าง) | นอกพาเลตต์ | `text-white/50 italic` |
| `bg-orange-50 border border-orange-200` (สถานะโอนย้าย) | พื้นเกือบขาวจากธีมสว่าง | `bg-orange-500/[0.12]` + `text-orange-400` |
| `text-md` (เซลล์รหัสสินค้า) | **ไม่มีคลาสนี้ใน Tailwind** เขียนไปก็ไม่เกิดอะไร | ตัดทิ้ง หรือระบุ `text-[15px]` |
| `rounded-2xl` + `rounded-[0.5rem]` บนอีลีเมนต์เดียวกัน (select ตัวกรอง) | รัศมีสองค่าชนกัน ผลลัพธ์ขึ้นกับลำดับใน CSS ที่ build ออกมา ไม่ใช่ลำดับใน `class=` | เหลือค่าเดียว (`rounded-[0.5rem]`) |
| `focus:border-[#FFE169]` บนช่องค้นหาที่ไม่มีคลาส `border` | ไม่มีเส้นขอบให้เปลี่ยนสี (ความหนาเป็น 0) | อาศัย `focus:ring-1` อย่างเดียว หรือเพิ่ม `border` |

---

### 11.14 ตัวบอกสีสินค้า — จุดสี vs ไอคอนวงกลม

สีของเครื่องเป็น **ข้อมูล ไม่ใช่พาเลตต์** จึงเป็น inline style เสมอ ห้ามพยายามทำเป็นคลาส Tailwind
ระบบมีสองแบบ ใช้ตัวสร้างกลางใน `script.js` ทั้งคู่ **ห้ามเขียนมาร์กอัปเองซ้ำ**

| | จุดสี 16px | ไอคอนวงกลม 40px |
|---|---|---|
| ตัวสร้าง | `window.productColorDot(colorName, colorDoc)` | `window.productIconHtml(colorName, colorDoc, product, fallbackHex?)` |
| บอกอะไร | สีเครื่องอย่างเดียว | สีเครื่อง **+ ประเภท** (มือถือ/ของทั่วไป) |
| กินที่ | น้อยมาก ใส่ในบรรทัดข้อความได้ | สูงเท่าสองบรรทัด ต้องมีคอลัมน์ของตัวเอง |
| สีเข้มจัด (`ดำ` #000000) | **กลืนกับพื้น** | อ่านออก เพราะมีขอบสีเต็ม |
| ใช้อยู่ที่ | `#stock` · `#transactions` · `#branch-inventory` · `#deposits` | *(ยังไม่มีหน้าไหนใช้อยู่ตอนนี้ — เก็บไว้เป็นทางเลือกสำรองตามเกณฑ์ด้านล่าง)* |

**เลือกยังไง:** ตารางที่มีคอลัมน์บอกประเภท/หมวดหมู่อยู่แล้ว → ใช้จุดสี (กระชับกว่า)
ตารางที่ไม่มีที่บอกประเภทเลย หรือมีสินค้าสีเข้มเยอะจนจุดสีอ่านไม่ออก → ใช้ไอคอนวงกลม

#### จุดสี 16px

```html
<span class="w-4 h-4 rounded-full shrink-0" style="background-color:#RRGGBB;"></span>
```

วางไว้ **หน้าชื่อสินค้าในบรรทัดเดียวกัน** ไม่ใช่หน้ากล่องเนื้อหาทั้งก้อน — ทำให้จุดผูกกับชื่อจริงๆ
ไม่ลอยอยู่ข้างบล็อกที่มีทั้งชื่อ ป้ายสาขา ราคา ปนกัน

ในเซลล์ตาราง:

```html
<p class="font-medium text-white flex items-center gap-2">
    <span class="w-4 h-4 rounded-full shrink-0" style="background-color:#RRGGBB;"></span>
    <span>ชื่อสินค้า</span>
</p>
```

ในการ์ด (ชื่อถูกตัดด้วย `truncate`):

```html
<h4 class="flex-1 min-w-0 flex items-center gap-2 font-bold text-ink text-[13px] leading-snug">
    ${d.colorDot}<span class="truncate">${d.nameFull}</span>
</h4>
```

⚠️ **สองกับดักที่เจอมาแล้วทั้งคู่:**

1. ถ้าของเดิมมี `truncate` อยู่บนแท็กชื่อ **ต้องย้าย `truncate` ไปที่ `<span>` ที่ครอบเฉพาะชื่อ**
   ไม่งั้นชื่อยาวๆ จะตัดจุดสีหายไปด้วย
2. จุดต้องมี **`shrink-0` เสมอ** ไม่งั้น flex จะบีบให้กลายเป็นวงรี

#### ไอคอนวงกลม 40px

```html
<div class="w-10 h-10 flex items-center py-1 px-0.5 rounded-full justify-center shrink-0"
     style="color:#RRGGBB; background-color:#RRGGBB33; border:1px solid #RRGGBB;">
    <i class="fa-solid fa-mobile-screen text-xl"></i>
</div>
```

ไอคอนใช้สีเต็ม พื้นใช้สีเดียวกันที่ alpha `33` (20%) ขอบใช้สีเต็ม — สูตรนี้อ่านออกทุกสีบนพื้นมืด
ไอคอนสลับ `fa-mobile-screen` / `fa-box` ตาม `window.checkIsDevice()`

#### ที่มาของสี (ทั้งสองแบบใช้ทางเดียวกัน)

```
window.resolveProductColorHex(colorName, colorDoc)  →  hex
    1. colorDoc.color_code ที่แอดมินตั้งเองในหน้าตั้งค่า  ชนะเสมอ
    2. ไม่มีก็จับคำจากชื่อสี (ไทย/อังกฤษ) ใน PRODUCT_COLOR_MAP แบบ substring
    3. ไม่ตรงเลย  →  #8E8E93 (เทากลาง)

window.toSixDigitHex(hex)  →  กัน '#abc' และค่าที่ไม่ใช่ hex
```

⚠️ **`toSixDigitHex` ไม่ใช่ของประดับ** — ไอคอนวงกลมทำพื้นโปร่งด้วยการต่อ `${hex}33`
ซึ่งต่อได้เฉพาะ hex 6 หลัก ถ้าแอดมินตั้ง `color_code` เป็น `rgb(200,200,200)` จะกลายเป็น
`rgb(200,200,200)33` ที่เบราว์เซอร์อ่านไม่ออก **พื้นหลังหายไปเงียบๆ** โดยไม่มี error

⚠️ **ห้ามก็อป `PRODUCT_COLOR_MAP` ไปไว้ที่อื่น** — ตารางนี้เคยถูกก็อปกระจายหลายที่
แล้วตกหล่นตอนเพิ่มสีใหม่ จึงถูกยุบมาไว้ที่เดียวใน `script.js` แล้ว
---

## 12. จุดที่หน้า `#stock` ขัดกับข้อ 1–10 — ต้องตัดสินใจ

หน้า `#stock` เขียนด้วย hex ตรงๆ ส่วนโทเคนในข้อ 1–10 ถูกประกาศไว้ที่ `src/tailwind-input.css` แล้ว และหน้า `#transactions` (POS) กับหน้า login **ใช้โทเคนอยู่จริง** — ตอนนี้ระบบจึงมีสองภาษาปนกัน

รายการที่ขัดกันจริง (ไม่ใช่แค่เขียนคนละแบบแต่ได้ผลเท่ากัน):

| ประเด็น | `#stock` ทำ | ข้อ 1–10 บอก | ผลกระทบ |
|---|---|---|---|
| ตัวอักษรหลัก | `#ffffff` | `#f5f5f7` — "อย่าใช้ขาวสนิท" | เห็นต่างเล็กน้อยเมื่อวางเทียบกับหน้า POS |
| ตัวอักษรบนปุ่มเหลือง | `#333333` | `#1d1d1f` | ทั้งคู่ผ่าน contrast อย่างสบาย เป็นเรื่องความสม่ำเสมอล้วนๆ |
| สีเหลืองตอนชี้/กด | `#E2B93C` (เข้มลงและออกส้ม) | `#F5D24E` | สองหน้าตอบสนองการกดคนละสี |
| เงา | `shadow-lg` บนการ์ด/ปุ่ม/ช่องค้นหา | "เงามีชุดเดียว ใช้กับภาพสินค้าเท่านั้น ห้ามใส่การ์ด ปุ่ม" | ขัดกันตรงๆ |
| รัศมี | 16 / 12 / 8 / 6px | สเกล 5 / 8 / 11 / 18px | เป็นคนละสเกลกันคนละชุด |
| สีบอกสถานะ | เขียว `#20D500` แดง `#FE0000` ส้ม | "เหลืองถูกจองเป็น accent ห้ามเติมสีเชิงสถานะ" (ข้อ 10) | ขัดกันตรงๆ |
| Gradient | ใช้เป็น fade mask ที่ปุ่มเลื่อน pill | "ยังคงไม่มีอย่างเด็ดขาด" | ขัดกันตรงๆ |
| ป้ายกำกับฟอร์ม | `text-slate-200`, `placeholder-slate-500` | ไม่มี slate ในพาเลตต์ | สีหลุดพาเลตต์ 2 สี |

**ข้อเสนอ** (ยังไม่ได้ทำ รอตัดสินใจ):

1. **สีบอกสถานะควรได้เป็นข้อยกเว้นอย่างเป็นทางการ** — เขียว/แดง/ส้มในตารางข้อมูลไม่ได้แข่งกับ accent เพราะมันไม่ใช่สิ่งที่กดได้ และระบบสต็อกที่แยก "มีของ" กับ "ของหมด" ไม่ออกในหนึ่งวินาทีคือปัญหาการใช้งานจริง ทางที่ตรงกว่าคือ **เขียนสามสีนี้เป็นโทเคน** (`--color-state-ok` / `-danger` / `-pending`) แล้วประกาศชัดว่าใช้ได้เฉพาะป้ายสถานะที่กดไม่ได้ ดีกว่าปล่อยให้เป็น hex ลอยกระจายอยู่ใน `script.js`
2. **gradient ที่ pill group เป็น fade mask ไม่ใช่การตกแต่ง** ควรเขียนข้อยกเว้นให้ชัด ไม่ใช่ปล่อยให้ดูเหมือนคนแหกกฎ
3. **เงา, รัศมี, ขาวสนิท, `#E2B93C`, `#333333`, slate** ควรไล่ให้ตรงกันในทางใดทางหนึ่ง — จะแก้ข้อ 1–10 ให้ตามหน้า `#stock` หรือแก้หน้า `#stock` ให้ตามข้อ 1–10 ก็ได้ แต่ **ต้องเลือกก่อนจะทำหน้าใหม่เพิ่ม** ไม่งั้นหนี้จะโตตามจำนวนหน้า
4. ระหว่างที่ยังไม่ตัดสินใจ **ให้หน้าใหม่ลอกข้อ 11 ตรงๆ** — ระบบที่สม่ำเสมอแบบผิดหลักบางข้อ ยังใช้งานง่ายกว่าระบบที่แต่ละหน้าถูกคนละครึ่ง

---

## 13. ธีมสว่าง / มืด — ชั้นโทเคน

ตั้งแต่รอบที่ทำโหมดสว่าง **สีทุกสีในหน้าจอมาจากโทเคน CSS ตัวเดียว** ไม่มีการเขียน hex ลงในมาร์กอัปอีก
(เหลือข้อยกเว้นที่ตั้งใจ 4 กลุ่ม ดูท้ายหัวข้อ) นี่คือสิ่งที่ปิดหนี้ข้อ 12 ไปพร้อมกัน

### ทำไมต้องเป็นโทเคนเท่านั้น

Tailwind v4 คอมไพล์ utility ของโทเคนเป็น `var()` แต่คอมไพล์ค่าเฉพาะกิจเป็นค่าตายตัว:

```css
.bg-field        { background-color: var(--color-field) }   /* เปลี่ยนตามธีมได้ */
.bg-\[\#27272A\] { background-color: #27272a }              /* เปลี่ยนไม่ได้ */
```

เขียน `bg-[#27272A]` เข้ามาหน้าเดียว โหมดสว่างก็พังเป็นหย่อมโดยไม่มี error ให้เห็น
`tools/build-js.js` จึงมี assertion ที่ทำให้ build ล้มถ้าเจอสีในรายการต้องห้ามกลับเข้ามา

### โทเคนพื้นผิวและเส้น

| โทเคน | ใช้กับ | มืด | สว่าง |
|---|---|---|---|
| `{colors.canvas}` | พื้นหลังหน้า | `#000000` | `#F2F2F7` |
| `{colors.panel}` | การ์ดพาเนล (คู่กับ `/40`) | `#4D4D4D` | `#FFFFFF` |
| `{colors.chip}` | ชิป / พิล (คู่กับ `/60`) | `#4D4D4D` | `#E8E8ED` |
| `{colors.field}` | ช่องกรอก ไทล์ในฟอร์ม | `#27272A` | `#F2F2F7` |
| `{colors.elevated}` | โมดัล ลิ้นชัก | `#18181B` | `#FFFFFF` |
| `{colors.line}` | เส้นขอบมาตรฐาน | `#3F3F46` | `#D1D1D6` |
| `{colors.line-strong}` | ขอบโมดัล/ลิ้นชัก | `#4D4D4D` | `#C7C7CC` |
| `{colors.divider}` | เส้นคั่นแถว + แถวตอนชี้ | `#464646` | `#E5E5EA` |
| `{colors.skeleton}` | แถบโครงร่างตอนโหลด | `#5C5C5C` | `#D6D6DB` |
| `{colors.accent-ink}` | accent ที่เป็นหมึก/เส้น | `#FFE169` | `#806400` |

**ความโปร่งของการ์ดใช้ได้เฉพาะโหมดมืด** — `/40` มีไว้ frost บนพื้นดำ พอเป็นพื้นสว่างมันกลายเป็นการ์ดจาง
จนแยกจากพื้นแทบไม่ออก `src/tailwind-input.css` จึงคืนความทึบให้ `.bg-panel/40` กับ `.bg-chip/60` เฉพาะโหมดสว่าง

### สีบอกสถานะ

ได้เป็นโทเคนตามข้อเสนอข้อ 12.1 แล้ว — `{colors.state-ok}` / `{colors.state-danger}` / `{colors.state-pending}`
**ใช้ได้เฉพาะป้ายสถานะที่กดไม่ได้** ชุดของโหมดมืดสว่างเกินไปบนพื้นขาว โหมดสว่างจึงเข้มลงให้ผ่าน 4.5:1

### สามจุดที่ CSS อย่างเดียวเอาไม่อยู่

1. **กราฟยอดขาย** (`js/page-dashboard.js`) — สีถูกฝังลงในสตริง SVG ตอนสร้าง ไม่ได้ผ่านคลาส CSS
   จึงอ่านโทเคนด้วย `getComputedStyle` ตอนวาด และวาดใหม่เมื่อได้ event `themechange`
2. **สีไอคอนสินค้า** (`getProductColorTheme` ใน `script.js`) — ทิศที่ต้องดึงสีหนีพื้นกลับด้านตามธีม
   โหมดมืดสีเข้มจมพื้น (ผสมขาว) โหมดสว่างสีอ่อนจมพื้น (ผสมดำ)
3. **ไอคอนเมนู PNG** (`style.css`) — ย้อมด้วย `filter: invert()` โหมดสว่างใช้ค่า invert คนละชุด

### ข้อยกเว้นที่ยังเป็น hex ตรง ๆ (ตั้งใจ)

`#E2B93C` และ `#F2D149` (เหลืองตอนชี้) กับคู่ `#E4E4E7` / `#18181B` และ `hover:bg-white`
(ปุ่มรองพื้นสว่างตามข้อ 11.11) — ทั้งหมดเป็นสีที่อ่านออกทั้งสองธีมอยู่แล้ว จึงไม่ต้องแปลงเป็นโทเคน

### ค่าเริ่มต้นและการจำค่า

ครั้งแรกตาม `prefers-color-scheme` ของเครื่อง กดปุ่มแล้วจำลง `localStorage['silmin_theme']`
การตั้ง `data-theme` ทำที่สคริปต์ inline ใน `<head>` ของ `index.html` **ต้องอยู่ตรงนั้นเท่านั้น** —
ถ้ารอ `script.js` ที่โหลดแบบ `defer` หน้าจะกะพริบธีมมืดก่อนทุกครั้ง

### 13.1 กล่องนิยามด้วยเงา ไม่ใช่เส้นขอบ

**แทนที่กฎในข้อ 4 ที่ว่า "เงามีชุดเดียว ใช้กับภาพสินค้าเท่านั้น ห้ามใส่การ์ด ปุ่ม"**

เส้นขอบ 1px รอบกล่องทุกใบทำงานได้ดีบนพื้นดำ แต่บนพื้นสว่างมันให้ความรู้สึกเป็นตาราง
ไม่ใช่ของที่ลอยอยู่ กล่องจึงเปลี่ยนมานิยามด้วยระดับความลอยแทน:

| คลาส | ใช้กับ |
|---|---|
| `elev-card` | การ์ดพาเนล การ์ดสรุป |
| `elev-modal` | โมดัล ลิ้นชัก |
| `elev-field` | ช่องกรอก |
| `elev-chip` | ชิป พิล ปุ่มที่เดิมมีแต่ขอบ |

**โหมดมืดใช้ "วงแหวนสว่าง 1px" แทนเงาทิ้งตัว** เพราะเงาทิ้งตัวมองไม่เห็นบนพื้นดำ
ทั้งสองอย่างเป็น `box-shadow` เหมือนกัน ไม่ใช่ `border`

`elev-*` กับ `shadow-*` เขียน `box-shadow` ทับกัน **ห้ามใส่คู่กัน** (ปิดข้อขัดแย้งเรื่อง `shadow-lg` บนการ์ดในข้อ 12 ไปด้วย)

**สามอย่างที่ยังเป็นเส้นขอบ เพราะเงาแทนไม่ได้จริง:**
1. `border-t/b/l/r` — เส้นคั่นภายในกล่อง (หัวโมดัล แถวสรุป) เงาไม่ให้เส้นคั่นแนวนอน
2. `divide-*` — เส้นคั่นแถวตาราง เอาออกแล้วตารางอ่านไม่ออก
3. `border-dashed` — ช่องอัปโหลด เส้นประสื่อ "ลากไฟล์มาวาง" ซึ่งเงาสื่อแทนไม่ได้

ส่วน `focus:`/`hover:` ที่เดิมเปลี่ยนสีขอบ กลายเป็น `ring-*` ซึ่ง Tailwind สร้างด้วย `box-shadow`
จึงยังเป็นเงาตามหลักนี้ และตัวชี้ตำแหน่งโฟกัสไม่หายไป (WCAG 2.4.7)

### 13.2 กฎสีที่ตรวจพบตอนทำโหมดสว่าง

- **accent ที่เป็นตัวอักษร/ขอบ ต้องใช้ `{colors.accent-ink}` ไม่ใช่ `{colors.primary}`** —
  `text-primary` บนพื้นขาวได้ 1.1:1 มองไม่เห็นเลย
- **ห้ามทำตัวอักษรจางด้วย alpha** (`text-ink/50`) — บนพื้นดำคือขาว 50% อ่านได้สบาย
  แต่บนพื้นขาวคือเทาอ่อน 3.2:1 ให้ใช้ `{colors.body-muted}` หรือ `{colors.ink-muted-48}` แทน
  (มีกฎทับไว้ใน `src/tailwind-input.css` ให้ของเดิมแล้ว แต่ของใหม่ไม่ควรเขียนแบบนั้นอีก)
- **ปุ่มสีเขียวใช้ `{colors.on-state-ok}` เป็นสีตัวอักษร** — โหมดมืดพื้นเขียวสดต้องใช้ตัวอักษรเข้ม
  โหมดสว่างพื้นเขียวเข้มต้องใช้ตัวอักษรขาว เป็นรูปแบบเดียวกับ `{colors.on-primary}` บนปุ่มเหลือง
