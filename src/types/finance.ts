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
  { key: '2025-01', label: '01 / 2025' },
  { key: '2025-02', label: '02 / 2025' },
  { key: '2025-03', label: '03 / 2025' },
  { key: '2025-04', label: '04 / 2025' },
  { key: '2025-05', label: '05 / 2025' },
  { key: '2025-06', label: '06 / 2025' },
  { key: '2025-07', label: '07 / 2025' },
  { key: '2025-08', label: '08 / 2025' },
  { key: '2025-09', label: '09 / 2025' },
  { key: '2025-10', label: '10 / 2025' },
  { key: '2025-11', label: '11 / 2025' },
  { key: '2025-12', label: '12 / 2025' },
  { key: '2026-01', label: '01 / 2026' },
  { key: '2026-02', label: '02 / 2026' },
  { key: '2026-03', label: '03 / 2026' },
  { key: '2026-04', label: '04 / 2026' },
  { key: '2026-05', label: '05 / 2026' },
  { key: '2026-06', label: '06 / 2026' },
  { key: '2026-07', label: '07 / 2026' },
  { key: '2026-08', label: '08 / 2026' },
  { key: '2026-09', label: '09 / 2026' },
  { key: '2026-10', label: '10 / 2026' },
  { key: '2026-11', label: '11 / 2026' },
  { key: '2026-12', label: '12 / 2026' },
];
