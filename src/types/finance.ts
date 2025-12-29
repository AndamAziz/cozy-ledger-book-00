export interface Income {
  id: number;
  day: number;
  cash: number;
  card: number;
  total: number;
}

export interface Expense {
  id: number;
  name: string;
  amount: number;
  purpose: string;
}

export interface Cigarette {
  id: number;
  name: string;
  boxPrice: number;
  packsPerBox: number;
  packPrice: number;
  sellPrice: number;
  alertLevel: number;
  boxes: number;
  extraPacks: number;
}

export interface Sale {
  id: number;
  day: number;
  cigaretteId: number;
  cigaretteName: string;
  packs: number;
  sellPrice: number;
  totalSale: number;
  costPerPack: number;
  totalCost: number;
  profit: number;
}

export interface MonthData {
  incomeData: Income[];
  expenseData: Expense[];
  cigaretteData: Cigarette[];
  salesData: Sale[];
}

export interface MonthOption {
  key: string;
  label: string;
}

export const MONTH_OPTIONS: MonthOption[] = [
  { key: '2025-01', label: '٢٠٢٥ / ٠١' },
  { key: '2025-02', label: '٢٠٢٥ / ٠٢' },
  { key: '2025-03', label: '٢٠٢٥ / ٠٣' },
  { key: '2025-04', label: '٢٠٢٥ / ٠٤' },
  { key: '2025-05', label: '٢٠٢٥ / ٠٥' },
  { key: '2025-06', label: '٢٠٢٥ / ٠٦' },
  { key: '2025-07', label: '٢٠٢٥ / ٠٧' },
  { key: '2025-08', label: '٢٠٢٥ / ٠٨' },
  { key: '2025-09', label: '٢٠٢٥ / ٠٩' },
  { key: '2025-10', label: '٢٠٢٥ / ١٠' },
  { key: '2025-11', label: '٢٠٢٥ / ١١' },
  { key: '2025-12', label: '٢٠٢٥ / ١٢' },
  { key: '2026-01', label: '٢٠٢٦ / ٠١' },
  { key: '2026-02', label: '٢٠٢٦ / ٠٢' },
  { key: '2026-03', label: '٢٠٢٦ / ٠٣' },
  { key: '2026-04', label: '٢٠٢٦ / ٠٤' },
  { key: '2026-05', label: '٢٠٢٦ / ٠٥' },
  { key: '2026-06', label: '٢٠٢٦ / ٠٦' },
  { key: '2026-07', label: '٢٠٢٦ / ٠٧' },
  { key: '2026-08', label: '٢٠٢٦ / ٠٨' },
  { key: '2026-09', label: '٢٠٢٦ / ٠٩' },
  { key: '2026-10', label: '٢٠٢٦ / ١٠' },
  { key: '2026-11', label: '٢٠٢٦ / ١١' },
  { key: '2026-12', label: '٢٠٢٦ / ١٢' },
];
