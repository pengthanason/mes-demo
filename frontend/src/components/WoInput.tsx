import { useWoNumbers } from '../lib/lookups';
import { SearchableSelect } from './SearchableSelect';

// ช่องเลือก/กรอก WO: ค่าเริ่มต้นเป็น datalist (พิมพ์ได้+เลือกได้)
// asSelect = true → ดรอปดาวน์เลือกอย่างเดียว (คลิกเลือก) + ค้นหาได้เมื่อ WO เกิน 10 (เช่นหน้า Kitting)
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
      <SearchableSelect
        value={value} onChange={onChange} disabled={disabled} required={required} style={style}
        options={wos.map(w => ({ value: w, label: w }))}
        placeholder="-- เลือก WO --" ariaLabel="เลือก WO"
      />
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
