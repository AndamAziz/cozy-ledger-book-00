# Multi-Currency, Income Source & Location/Branch for Finance

## Goal
Extend the Financial Management module so a single transaction can hold up to 3 currency amounts (GBP / IQD / EUR), track an income **Source**, and be tagged to a **Location/Branch**. The dashboard gains a Location filter and shows all totals broken down per currency (never converted/combined).

## Data model (Supabase)

New enum + tables and columns, all user-scoped with RLS + GRANTs, plus `updated_at` triggers.

```text
currency_code ENUM: 'GBP' | 'IQD' | 'EUR'

locations
  id, user_id, name, created_at, updated_at
  (unique per user_id+name; never deleted destructively — soft archive flag)

incomes            (header — unchanged rows preserved)
  + source        text null
  + location_id   uuid null FK -> locations(id) ON DELETE SET NULL
income_amounts     (NEW child — up to 3 rows per income)
  id, income_id FK -> incomes ON DELETE CASCADE, currency currency_code,
  cash numeric, card numeric, created_at

expenses
  + location_id   uuid null FK -> locations(id)
expense_amounts    (NEW child — up to 3 rows per expense)
  id, expense_id FK -> expenses ON DELETE CASCADE, currency currency_code,
  amount numeric, created_at

sales
  + location_id   uuid null FK -> locations(id)
  + currency      currency_code default 'GBP'
```

Migration back-fills existing data: for every current income row create one `income_amounts` row (`GBP`, existing cash/card); for every expense create one `expense_amounts` row (`GBP`, existing amount). The legacy `cash`/`card`/`amount` columns stay for safety but the app reads from the child tables. This keeps historical reports accurate.

## Types (`src/types/finance.ts`)
- `Currency = 'GBP' | 'IQD' | 'EUR'`, `CurrencyAmount` helpers.
- `Income.amounts: { currency; cash; card }[]`, `Income.source?`, `Income.locationId?`.
- `Expense.amounts: { currency; amount }[]`, `Expense.locationId?`.
- `Sale.currency`, `Sale.locationId?`.
- New `Location` type. Per-currency total shape `Record<Currency, number>`.

## Hook (`src/hooks/useFinanceData.ts`)
- Load incomes/expenses with their child `*_amounts` (nested select), map into new arrays.
- `addIncome/updateIncome` and `addExpense/updateExpense` write header + replace child rows in a small transaction (delete + insert children).
- Add `locations` CRUD (`addLocation`, `locations` list) + `selectedLocationId` state (persisted in localStorage).
- `getSummary()` returns **per-currency** maps: `totalCash`, `totalCard`, `totalIncome`, `totalExpense`, `totalPurchase`, `totalCost`, `totalSales`, `balance` — each `Record<Currency, number>`; filtered by `selectedLocationId` when set.

## UI components
- **New** `CurrencyAmountRows.tsx`: reusable control rendering 1–3 rows, each = amount input(s) + currency dropdown, with add/remove-row buttons. Used by both modals.
- **New** `LocationSelect.tsx`: dropdown of locations + inline "Add new location" option; used in modals and dashboard.
- `IncomeModal.tsx`: currency rows (cash+card per currency) + **Source** field (free text) + Location select.
- `ExpenseModal.tsx`: currency rows (amount per currency) + Location select (keeps purchase/cost toggle).
- `SellModal.tsx` / `SalesTab.tsx`: currency + location selectors.
- `FinanceTab.tsx`: Location filter bar at top; `SummaryCard`s render per-currency breakdown (stacked GBP/IQD/EUR lines). Income/expense lists show Source + Location + each amount's currency.
- `ReportsTab.tsx` + `pdfGenerator.ts`: show Source, Location, and per-currency totals.

## i18n
Add Kurdish + English keys in `src/lib/translations.ts`: `source`, `location`, `branch`, `allLocations`, `addLocation`, `currency`, `GBP`/`IQD`/`EUR` labels, `addCurrencyRow`, plus formatting helper for IQD/EUR symbols in `src/lib/format.ts`.

## Formatting
`format.ts` gains `formatCurrencyBy(value, currency)` (£ / د.ع / €). Dashboard/report totals never sum across currencies.

## Verification
- `tsgo` typecheck + `bunx vitest run` for touched libs.
- Playwright smoke on `/index`: add an income with 2 currencies + source + a new location, switch the location filter, confirm per-currency totals update. Screenshot desktop + mobile.

## Notes / decisions
- Currencies are a fixed enum (GBP/IQD/EUR) — no separate currencies table needed; locations are a real table with FKs so renames keep history.
- No live FX conversion (explicitly out of scope) — totals stay grouped by currency.
- Legacy single-currency rows keep working via the GBP back-fill.
