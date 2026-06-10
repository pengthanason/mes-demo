export type WoSummary = {
  woId: string;
  productCode: string;
  customer: string;
  qty: number;
  currentStep: string;
  station: string;
  updatedAt: string;
};

const SAMPLE_WO: WoSummary[] = [
  { woId: 'WO-26060012', productCode: 'E13A_STD', customer: 'THS', qty: 270, currentStep: 'RUNNING', station: 'R8 Test FCT', updatedAt: '2026-06-05 09:12' },
  { woId: 'WO-26060015', productCode: 'ZSZ003-081A', customer: 'TAD', qty: 1200, currentStep: 'WAIT_FAI', station: 'R5 Test ICT', updatedAt: '2026-06-05 08:40' },
  { woId: 'WO-26060018', productCode: '01489E-081', customer: 'TAD', qty: 90, currentStep: 'OPEN', station: 'R1 SMT Setup', updatedAt: '2026-06-05 07:55' },
  { woId: 'WO-26060009', productCode: '5K45', customer: 'THS', qty: 500, currentStep: 'CLOSED', station: 'R11 FQC Packing', updatedAt: '2026-06-05 06:30' },
];

export async function fetchWoList(): Promise<WoSummary[]> {
  await new Promise(resolve => setTimeout(resolve, 500));
  return SAMPLE_WO;
}