# 🧪 ชุดข้อมูลเทสเต็มระบบ (กรอกตามลำดับ flow)

> ล็อกอิน **admin / admin** · ข้อมูลทุกชุด "เชื่อมกัน" (Product/WO/Serial เดียวกันไหลทั้ง flow)
> กรอกตามลำดับหัวข้อ 1→11 จะได้ข้อมูลครบสวยทุกหน้า

## 🔖 Master data (ใช้ซ้ำทุกหน้า — จำไว้)
| Product/Code | Model | Customer | Parts ที่ใช้ |
|---|---|---|---|
| `PCB-A100` | PCB Assembly A100 | Toyota TH | R-100K, C-10UF, IC-555 |
| `ASY-300` | Motor Assembly 300 | Honda TH | MTR-DC, GBX-01 |
| `MOT-4500` | Motor Unit 4500 | Denso | STL-ROD, BRG-6201 |

Serial ที่จะใช้: `SN-A100-0001` ถึง `0005`, `SN-A300-0001`, `SN-M450-0001`

---

## 1️⃣ Production Plan → Add Project (กรอก 3 โปรเจกต์)

**โปรเจกต์ A**
| ฟิลด์ | ค่า |
|---|---|
| Status | On Process |
| WK | `25` |
| Date Record | วันนี้ |
| Product P/N | `PCB-A100` |
| Model | `PCB Assembly A100` |
| QTY | `2000` |
| Customer | `Toyota TH` |
| WO (Work Order) | `WO-2506-001` |
| Waiting (Mat'l coming) | `PCB, Stencil` |
| เช็ค 4M | ✅ Man ✅ Machine ✅ Material ☐ Method |
| PD | ✅ PCBA ☐ BBAS ☐ TEST |
| PD Start / Finish | วันนี้ / อีก 7 วัน |
| QA Test rate% | `1.00%` |
| Expected date | อีก 10 วัน |
| PD PIC | `Noi, Kiert` |
| Team Member | `5` · OK/Day `300` · Total OK `0` · Total NG `0` |

**โปรเจกต์ B** — Product `ASY-300`, Model `Motor Assembly 300`, Customer `Honda TH`, QTY `1500`, WO `WO-2506-002`, Expected อีก 14 วัน, PIC `Aof`
**โปรเจกต์ C** — Product `MOT-4500`, Model `Motor Unit 4500`, Customer `Denso`, QTY `3000`, WO `WO-2506-003`, ติ๊ก **done** ✅ (ทดสอบงานเสร็จ), Total OK `2950`, Total NG `50`

✅ เช็ค: 3 แถวในตาราง + Dashboard ตัวเลขขยับ + ลอง **Export Excel** ดูฟอร์ม FM03

---

## 2️⃣ Work Orders → + เปิด WO (กรอก 3 ตัว)
| Product Code * | Customer | จำนวน (Qty) * |
|---|---|---|
| `PCB-A100` | `Toyota TH` | `2000` |
| `ASY-300` | `Honda TH` | `1500` |
| `MOT-4500` | `Denso` | `3000` |

✅ เช็ค: ได้ WO 3 ตัวสถานะ **ร่าง** → กดเข้าไปแต่ละตัว ลองเลื่อนสถานะ (DRAFT→OPEN→READY→RUNNING)
> 💡 **จำเลข WO No ที่ระบบสร้าง** (เช่น WO-xxxx) เอาไปใช้หน้า QC/Kitting

---

## 3️⃣ Incoming → รับของเข้าใหม่ (กรอก 5 ล็อต)
| Part No * | ชื่อชิ้นส่วน | Lot No * | จำนวน * |
|---|---|---|---|
| `R-100K` | Resistor 100K Ohm | `LOT-R100K-A` | `5000` |
| `C-10UF` | Capacitor 10uF | `LOT-C10UF-A` | `3000` |
| `IC-555` | Timer IC 555 | `LOT-IC555-A` | `1000` |
| `MTR-DC` | DC Motor 12V | `LOT-MTR-A` | `1500` |
| `STL-ROD` | Steel Rod 10mm | `LOT-STL-A` | `2000` |

✅ เช็ค: หลังรับเข้า → กด **อนุมัติ (APPROVED)** อย่างน้อย 3 ล็อต (R-100K, C-10UF, IC-555) ให้พร้อมเบิก

---

## 4️⃣ Kitting → เบิกของ (เบิกเข้า WO ของ PCB-A100)
| WO ที่จะเบิกให้ * | Part No * | จำนวนที่เบิก * |
|---|---|---|
| (WO ของ PCB-A100) | `R-100K` | `500` |
| (WO ของ PCB-A100) | `C-10UF` | `300` |
| (WO ของ PCB-A100) | `IC-555` | `100` |

✅ เช็ค: stock part ลดลง + เข้าไปหน้า WO detail ของ PCB-A100 → เห็น **ประวัติ Kitting**

---

## 5️⃣ Workflow (Sequence Builder) → สร้าง + Record
**สร้าง sequence** (ใส่ชื่อ preset เช่น `PCB-A100 STD`):
| ลำดับ | กระบวนการ | เวลา (วินาที) |
|---|---|---|
| 1 | SET UP LINE | 120 |
| 2 | SMT | 45 |
| 3 | SOLDERING | 30 |
| 4 | ICT TEST | 25 |
| 5 | FQC | 20 |
| 6 | PACKING | 15 |

**Record ผล** (กรอกหลายชิ้น):
| Serial | ผล |
|---|---|
| `SN-A100-0001` | PASS |
| `SN-A100-0002` | PASS |
| `SN-A100-0003` | FAIL (เลือก step ที่ FAIL = ICT TEST) |
| `SN-A100-0004` | PASS |

✅ เช็ค: ตาราง results โผล่ + cycle time รวมคำนวณให้

---

## 6️⃣ QC → 3 แท็บ
**แท็บ QC Board** (สแกนทีละชิ้น): สแกน/พิมพ์ SN แล้วกดผล
| Unit SN | ผล |
|---|---|
| `SN-A100-0001` | ✅ PASS |
| `SN-A100-0002` | ✅ PASS |
| `SN-A100-0003` | ❌ FAIL |

**แท็บ QC Result** (สรุปตามล็อต):
| ฟิลด์ | ค่า |
|---|---|
| WO Number * | (WO ของ PCB-A100) |
| Lot No * | `LOT-A100-01` |
| จำนวนตรวจ | `100` |
| PASS | `95` |
| FAIL | `5` |
| รายละเอียดของเสีย * | `บัดกรีขาดที่ขา IC-555 จำนวน 5 จุด` |

→ ผลออกมา **PARTIAL/FAIL** → กดปุ่ม **เปิด Rework**:
| ประเภทของเสีย * | ผู้รับผิดชอบ | วันแก้เสร็จ |
|---|---|---|
| `บัดกรีเสีย (cold solder)` | `ช่างเอก` | อีก 3 วัน |

**แท็บ Rework**: เลื่อนสถานะ เปิด → กำลังซ่อม → เสร็จ

✅ เช็ค: ผล QC บันทึก + Rework ticket วิ่งครบ 3 สถานะ

---

## 7️⃣ Jig Test
**สร้างโปรเจกต์** (ปุ่มเพิ่มโปรเจกต์ Jig):
| Project Code * | ชื่อโปรเจกต์ * | Jig ID |
|---|---|---|
| `PCB-A100` | PCB Assembly A100 | `JIG-001` |

**บันทึกผลทดสอบ** (เข้าโปรเจกต์ → กรอกหลายชิ้น):
| Serial | ผล | Voltage | Current | Temp | Fail Param |
|---|---|---|---|---|---|
| `SN-A100-0001` | PASS | `3.30` | `1.20` | `42` | — |
| `SN-A100-0002` | PASS | `3.28` | `1.22` | `43` | — |
| `SN-A100-0003` | FAIL | `2.90` | `1.05` | `48` | `VOLTAGE_LOW` |

✅ เช็ค: กราฟ/ตารางผลเทสขึ้น + อัตรา PASS/FAIL

---

## 8️⃣ Traceability → ค้นหา
พิมพ์ค้น: `SN-A100-0001` (และ `SN-A100-0003` ตัวที่ FAIL)
✅ เช็ค: เห็นประวัติการสแกนทุก station + ผล QC/Jig ของชิ้นนั้น (ดึงจากข้อมูลที่กรอกข้างบนจริง)

---

## 9️⃣ 4M Change → เปิด Change Request (2 ตัว)
| ประเภท 4M * | WO/Product | รายละเอียด * | ผลกระทบ |
|---|---|---|---|
| Material | `PCB-A100` | เปลี่ยน supplier IC-555 จาก A→B เพราะของขาด | ต้อง re-qualify, อาจช้า 2 วัน |
| Machine | `ASY-300` | เปลี่ยนหัว soldering เครื่อง #3 | ปรับ parameter ใหม่ |

✅ เช็ค: CR โผล่สถานะ DRAFT → ลองเลื่อน gate G1→G2→ACTIVE

---

## 🔟 SCM Cases → New Case (2 ตัว + Split Lot)
| Case Type | Ref PO | Ref Invoice | Part No | Due Date |
|---|---|---|---|---|
| QTY_SHORT | `PO-10234` | `INV-5501` | `R-100K` | อีก 5 วัน |
| DAMAGED | `PO-10235` | `INV-5502` | `IC-555` | อีก 7 วัน |

**Split Lot Wizard**: Original UID `UID-A100-0001`, OK Qty `950`, NG Qty `50`, Reason `แยกของเสีย 50 ชิ้นออกจากล็อต`

✅ เช็ค: case เข้า inbox → ลองปิดเคส (ใส่ Resolution Note) + Split lot สร้าง OK/NG UID ใหม่

---

## 1️⃣1️⃣ WO Detail → FAI + ปิดงาน (เข้าจากหน้า Work Orders กดที่ WO)
- **FAI**: ใส่ Inspector `สมชาย`, Approver `หัวหน้าเอ`, กด PASS
- **ปิดงาน (Close WO)**: ใส่ actual qty `1950`, qty good `1950`
✅ เช็ค: WO เลื่อนเป็น **ปิดงานแล้ว (CLOSED)** + เห็นประวัติ QA/QC/Kitting/Production ครบในหน้านั้น

---

# 🔑 เทสข้อมูลไม่หาย (สำคัญสุด — จุดประสงค์ Neon)
หลังกรอกครบ:
1. **F5 refresh** → ทุกอย่างยังอยู่ ✅
2. **Logout → Login ใหม่** → ยังอยู่ ✅
3. **เปิดมือถือ/อีกเบราว์เซอร์** เข้า URL เดียวกัน → เห็นชุดเดียวกัน ✅
4. ดู **Dashboard** → KPI/กราฟตรงกับที่กรอกจริง ✅
