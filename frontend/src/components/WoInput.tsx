import { useWoNumbers } from '../lib/lookups';

// ช่องกรอก WO แบบ datalist: พิมพ์เองได้ + มีดรอปดาวรายชื่อ WO ทางการให้เลือก
export function WoInput({
  value, onChange, placeholder = 'เช่น WO-202606-001', required, style, disabled,
}: {
  value: string;
  onChange: (v: string) => void;
  placeholder?: string;
  required?: boolean;
  style?: React.CSSProperties;
  disabled?: boolean;
}) {
  const { data: wos = [] } = useWoNumbers();
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
