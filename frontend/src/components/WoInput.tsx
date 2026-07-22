import { useWoNumbers } from '../lib/lookups';
import { SearchableSelect } from './SearchableSelect';
import { ComboBoxInput } from './ComboBoxInput';

// ช่องเลือก/กรอก WO: ค่าเริ่มต้นเป็น datalist (พิมพ์ได้+เลือกได้)
// asSelect = true → ดรอปดาวน์เลือกอย่างเดียว (คลิกเลือก) + ค้นหาได้เมื่อ WO เกิน 10 (เช่นหน้า Kitting)
export function WoInput({
  value, onChange, placeholder = 'e.g. WO-202606-001', required, style, disabled, asSelect, allowCustom,
}: {
  value: string;
  onChange: (v: string) => void;
  placeholder?: string;
  required?: boolean;
  style?: React.CSSProperties;
  disabled?: boolean;
  asSelect?: boolean;
  allowCustom?: boolean;   // true = พิมพ์ WO เองได้ (เช่น WO ที่ยังไม่ได้เปิด) นอกเหนือจากเลือกในลิสต์
}) {
  const { data: wos = [] } = useWoNumbers();
  if (asSelect) {
    // เก็บค่าปัจจุบันไว้เสมอ (กรณี edit งานเก่าที่ WO ไม่อยู่ใน board list แล้ว จะได้ไม่หาย)
    const options = wos.map(w => ({ value: w, label: w }));
    if (value && !wos.includes(value)) options.unshift({ value, label: value });
    return (
      <SearchableSelect
        value={value} onChange={onChange} disabled={disabled} required={required} style={style}
        options={options} allowCustom={allowCustom}
        placeholder="-- Select or type WO --" ariaLabel="Select WO"
      />
    );
  }
  // ดีฟอลต์ = combobox พิมพ์เองได้ + dropdown suggestion สีขาวเต็มกรอบ (แทน native datalist ที่พื้นดำ/แคบ)
  return (
    <ComboBoxInput
      value={value} onChange={onChange} options={wos}
      placeholder={placeholder} required={required} disabled={disabled} style={style}
      ariaLabel="WO"
    />
  );
}
