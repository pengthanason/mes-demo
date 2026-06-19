import { IncomingPage } from './IncomingPage';
import { KittingPage } from './KittingPage';

/* Incoming + Kitting = โมดูลคลังเดียวกัน (รับล็อต → QA → stock → เบิกเข้าไลน์)
   แสดงในหน้าเดียว: ส่วนรับเข้าด้านบน, ส่วนเบิกจ่ายด้านล่าง */
export function IncomingKittingPage() {
  return (
    <div className="stack-lg">
      <IncomingPage />
      <KittingPage />
    </div>
  );
}
