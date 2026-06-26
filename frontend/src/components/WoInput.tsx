import { useWoNumbers } from '../lib/lookups';

// ช่องเลือก/กรอก WO: ค่าเริ่มต้นเป็น datalist (พิมพ์ได้+เลือกได้)
// asSelect = true → เป็นดรอปดาวน์ล้วน เลือกอย่างเดียว พิมพ์ไม่ได้ (เช่นหน้า Kitting)
export function WoInput({
  value, onChange, placeholder = 'เช่น WO-202606-001', required, style, disabled, asSelect,
}: {
  value: string;
  onChange: (v: string) => void;
  placeholder?: string;
  required?: boolean;
  style?: React.CSSProperties;
  disabled?: boolean;
  asSelect?: boolean;
}) {
  const { data: wos = [] } = useWoNumbers();
  if (asSelect) {
    return (
      <select value={value} onChange={e => onChange(e.target.value)} required={required} disabled={disabled} style={style} title="เลือก WO" aria-label="เลือก WO">
        <option value="">-- เลือก WO --</option>
        {wos.map(w => <option key={w} value={w}>{w}</option>)}
      </select>
    );
  }
  return (
    <>
      <input
        list="wo-numbers-list"
        value={value}
        onChange={e => onChange(e.target.value)}
        placeholder={placeholder}
        required={required}
        disabled={disabled}
        style={style}
      />
      <datalist id="wo-numbers-list">
        {wos.map(w => <option key={w} value={w} />)}
      </datalist>
    </>
  );
}
