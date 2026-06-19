# ──────────────────────────────────────────────────────────────
# review-loop.ps1 — Claude ตรวจ Claude (worker + reviewer วนกันเอง)
#
# ใช้:  .\review-loop.ps1 "งานที่ต้องการให้ทำ" [จำนวนรอบสูงสุด]
# เช่น: .\review-loop.ps1 "เพิ่ม empty state ทุกหน้าที่ตารางว่าง" 6
#
# ต้องมี Claude CLI ก่อน:  npm install -g @anthropic-ai/claude-code
# ──────────────────────────────────────────────────────────────
param(
  [Parameter(Mandatory = $true)][string]$Task,
  [int]$Max = 6,
  # worker: acceptEdits = แก้ไฟล์ไม่ถาม / bypassPermissions = ไม่ถามอะไรเลย (เสี่ยง)
  [string]$WorkPerm = "acceptEdits"
)

$feedback = ""
for ($i = 1; $i -le $Max; $i++) {
  Write-Host "`n========== รอบ $i/$Max — 👷 WORKER ==========" -ForegroundColor Cyan
  if ([string]::IsNullOrEmpty($feedback)) {
    $prompt = $Task
  } else {
    $prompt = @"
งานเดิม: $Task

Reviewer เจอปัญหาต่อไปนี้ ให้อ่านโค้ดปัจจุบัน แล้วแก้ให้เรียบร้อย และอย่าทำ build พัง:
$feedback
"@
  }
  $null | claude -p $prompt --permission-mode $WorkPerm

  Write-Host "`n========== รอบ $i/$Max — 🔍 REVIEWER (read-only) ==========" -ForegroundColor Yellow
  $reviewPrompt = @"
คุณคือ reviewer ห้ามแก้โค้ดเด็ดขาด — ตรวจอย่างเดียว.
ดู git diff ของการเปลี่ยนแปลงล่าสุด (uncommitted) เทียบกับเป้าหมายงาน: "$Task".
เช็ก: ทำครบตามสั่งไหม / มีบั๊ก พิมพ์ผิด ของหาย / build น่าจะผ่านไหม / มี dead code ไหม.
- ถ้าเรียบร้อยดีแล้ว ตอบคำเดียว: APPROVED
- ถ้ายังมีปัญหา ขึ้นต้นบรรทัดแรกด้วย CHANGES: แล้วลิสต์เป็นข้อๆ สั้น ชัด แก้ได้จริง
"@
  $review = ($null | claude -p $reviewPrompt --permission-mode plan) | Out-String
  Write-Host $review

  if ($review -match "APPROVED") {
    Write-Host "`n✅ ผ่านการรีวิวในรอบที่ $i — จบงาน" -ForegroundColor Green
    exit 0
  }
  $feedback = $review
}

Write-Host "`n⚠️ ครบ $Max รอบแล้วยังไม่ APPROVED — อ่าน feedback รอบสุดท้ายด้านบน แล้วสั่งต่อเองได้" -ForegroundColor Red
