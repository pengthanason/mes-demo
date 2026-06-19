#!/usr/bin/env bash
# ──────────────────────────────────────────────────────────────
# review-loop.sh — Claude ตรวจ Claude (worker + reviewer วนกันเอง)
#
# ใช้:  ./review-loop.sh "งานที่ต้องการให้ทำ" [จำนวนรอบสูงสุด]
# เช่น: ./review-loop.sh "เพิ่ม empty state ทุกหน้าที่ตารางว่าง" 6
#
# ต้องมี Claude CLI ก่อน:  npm install -g @anthropic-ai/claude-code
# ──────────────────────────────────────────────────────────────
set -u

TASK="${1:?ใช้: ./review-loop.sh \"งานที่ต้องการ\" [จำนวนรอบ]}"
MAX="${2:-6}"
# โหมด permission ของ worker: acceptEdits = แก้ไฟล์ได้ไม่ถาม (ยังถาม bash เสี่ยงๆ)
#   ถ้าอยากไม่ถามอะไรเลย (เสี่ยง) เปลี่ยนเป็น: WORK_PERM=bypassPermissions
WORK_PERM="${WORK_PERM:-acceptEdits}"
feedback=""

for i in $(seq 1 "$MAX"); do
  echo ""
  echo "========== รอบ $i/$MAX — 👷 WORKER =========="
  if [ -z "$feedback" ]; then
    PROMPT="$TASK"
  else
    PROMPT="งานเดิม: ${TASK}

Reviewer เจอปัญหาต่อไปนี้ ให้อ่านโค้ดปัจจุบัน แล้วแก้ให้เรียบร้อย และอย่าทำ build พัง:
${feedback}"
  fi
  claude -p "$PROMPT" --permission-mode "$WORK_PERM" </dev/null

  echo ""
  echo "========== รอบ $i/$MAX — 🔍 REVIEWER (read-only) =========="
  REVIEW=$(claude -p "คุณคือ reviewer ห้ามแก้โค้ดเด็ดขาด — ตรวจอย่างเดียว.
ดู git diff ของการเปลี่ยนแปลงล่าสุด (uncommitted) เทียบกับเป้าหมายงาน: \"${TASK}\".
เช็ก: ทำครบตามสั่งไหม / มีบั๊ก พิมพ์ผิด ของหาย / build น่าจะผ่านไหม / มี dead code ไหม.
- ถ้าเรียบร้อยดีแล้ว ตอบคำเดียว: APPROVED
- ถ้ายังมีปัญหา ขึ้นต้นบรรทัดแรกด้วย CHANGES: แล้วลิสต์เป็นข้อๆ สั้น ชัด แก้ได้จริง" \
    --permission-mode plan </dev/null)
  echo "$REVIEW"

  if printf '%s' "$REVIEW" | grep -q "APPROVED"; then
    echo ""
    echo "✅ ผ่านการรีวิวในรอบที่ $i — จบงาน"
    exit 0
  fi
  feedback="$REVIEW"
done

echo ""
echo "⚠️ ครบ $MAX รอบแล้วยังไม่ APPROVED — อ่าน feedback รอบสุดท้ายด้านบน แล้วสั่งต่อเองได้"
