import { useState, useEffect, useCallback } from 'react';
import { supabase } from '@/integrations/supabase/client';
import { Income, Expense, Cigarette, Sale, Location, Currency, IncomeAmount, ExpenseAmount, MONTH_OPTIONS } from '@/types/finance';
import { emptyTotals } from '@/lib/currency';
import { useAuth } from './useAuth';

function parseMonthKey(monthKey: string) {
  const parts = monthKey.split('-');
  return { year: parseInt(parts[0]), month: parseInt(parts[1]) };
}

function daysInMonth(monthKey: string) {
  const { year, month } = parseMonthKey(monthKey);
  return new Date(year, month, 0).getDate();
}

function isCurrentMonth(monthKey: string) {
  const now = new Date();
  const { year, month } = parseMonthKey(monthKey);
  return now.getFullYear() === year && (now.getMonth() + 1) === month;
}

function gbpIncome(amounts: IncomeAmount[]) {
  const gbp = amounts.find((a) => a.currency === 'GBP');
  const cash = gbp ? Number(gbp.cash) : 0;
  const card = gbp ? Number(gbp.card) : 0;
  return { cash, card, total: cash + card };
}

function gbpExpense(amounts: ExpenseAmount[]) {
  const gbp = amounts.find((a) => a.currency === 'GBP');
  return gbp ? Number(gbp.amount) : 0;
}

const LOCATION_STORAGE_KEY = 'selectedLocationId';

export function useFinanceData() {
  const { user } = useAuth();
  const [currentMonthKey, setCurrentMonthKey] = useState(() => {
    const now = new Date();
    const currentMonth = `${now.getFullYear()}-${String(now.getMonth() + 1).padStart(2, '0')}`;
    return localStorage.getItem('selectedMonthKey') || currentMonth;
  });

  const [incomeData, setIncomeData] = useState<Income[]>([]);
  const [expenseData, setExpenseData] = useState<Expense[]>([]);
  const [cigaretteData, setCigaretteData] = useState<Cigarette[]>([]);
  const [salesData, setSalesData] = useState<Sale[]>([]);
  const [locations, setLocations] = useState<Location[]>([]);
  const [selectedLocationId, setSelectedLocationIdState] = useState<string | null>(
    () => localStorage.getItem(LOCATION_STORAGE_KEY) || null
  );
  const [isLoading, setIsLoading] = useState(true);

  const setSelectedLocationId = useCallback((id: string | null) => {
    setSelectedLocationIdState(id);
    if (id) localStorage.setItem(LOCATION_STORAGE_KEY, id);
    else localStorage.removeItem(LOCATION_STORAGE_KEY);
  }, []);

  // Load locations (not month scoped)
  const loadLocations = useCallback(async () => {
    if (!user) return;
    const { data } = await supabase
      .from('locations')
      .select('*')
      .eq('user_id', user.id)
      .order('name', { ascending: true });
    setLocations(
      (data || []).map((l) => ({ id: l.id, name: l.name, isArchived: l.is_archived }))
    );
  }, [user]);

  useEffect(() => {
    loadLocations();
  }, [loadLocations]);

  const loadMonthData = useCallback(async () => {
    if (!user) {
      setIsLoading(false);
      return;
    }

    setIsLoading(true);

    try {
      const { data: incomes } = await supabase
        .from('incomes')
        .select('*, income_amounts(*)')
        .eq('user_id', user.id)
        .eq('month_key', currentMonthKey)
        .order('day', { ascending: true });

      const { data: expenses } = await supabase
        .from('expenses')
        .select('*, expense_amounts(*)')
        .eq('user_id', user.id)
        .eq('month_key', currentMonthKey);

      const { data: cigarettes } = await supabase
        .from('cigarettes')
        .select('*')
        .eq('user_id', user.id)
        .eq('month_key', currentMonthKey);

      const { data: sales } = await supabase
        .from('sales')
        .select('*')
        .eq('user_id', user.id)
        .eq('month_key', currentMonthKey);

      setIncomeData(
        (incomes || []).map((inc) => {
          const amounts: IncomeAmount[] = (inc.income_amounts || []).map((a: any) => ({
            currency: a.currency as Currency,
            cash: Number(a.cash),
            card: Number(a.card),
          }));
          if (amounts.length === 0) amounts.push({ currency: 'GBP', cash: Number(inc.cash), card: Number(inc.card) });
          const g = gbpIncome(amounts);
          return {
            id: inc.id,
            day: inc.day,
            amounts,
            source: inc.source || '',
            locationId: inc.location_id || null,
            note: inc.note || '',
            cash: g.cash,
            card: g.card,
            total: g.total,
          };
        })
      );

      setExpenseData(
        (expenses || []).map((exp) => {
          const amounts: ExpenseAmount[] = (exp.expense_amounts || []).map((a: any) => ({
            currency: a.currency as Currency,
            amount: Number(a.amount),
          }));
          if (amounts.length === 0) amounts.push({ currency: 'GBP', amount: Number(exp.amount) });
          return {
            id: exp.id,
            day: exp.day,
            amounts,
            description: exp.description,
            expenseType: (exp.expense_type as 'purchase' | 'cost') || 'cost',
            locationId: exp.location_id || null,
            amount: gbpExpense(amounts),
          };
        })
      );

      setCigaretteData(
        (cigarettes || []).map((cig) => ({
          id: cig.id,
          name: cig.name,
          packsPerBox: cig.packs_per_box,
          packPrice: Number(cig.pack_price),
          boxPrice: Number(cig.box_price),
          sellPrice: Number(cig.pack_price),
          boxes: cig.boxes,
          extraPacks: cig.extra_packs,
          alertLevel: cig.alert_level,
          unitType: (cig.unit_type as Cigarette['unitType']) || 'box',
        }))
      );

      setSalesData(
        (sales || []).map((sale) => ({
          id: sale.id,
          day: sale.day,
          cigaretteId: sale.cigarette_id,
          cigaretteName: sale.cigarette_name,
          packs: sale.packs,
          packPrice: Number(sale.pack_price),
          totalSale: Number(sale.total_sale),
          profit: Number(sale.profit),
          currency: (sale.currency as Currency) || 'GBP',
          locationId: sale.location_id || null,
        }))
      );
    } catch (error) {
      console.error('Error loading data:', error);
    }

    setIsLoading(false);
  }, [user, currentMonthKey]);

  useEffect(() => {
    loadMonthData();
  }, [loadMonthData]);

  const changeMonth = useCallback((monthKey: string) => {
    setCurrentMonthKey(monthKey);
    localStorage.setItem('selectedMonthKey', monthKey);
  }, []);

  // Location operations
  const addLocation = useCallback(async (name: string): Promise<Location | null> => {
    if (!user) return null;
    const trimmed = name.trim();
    if (!trimmed) return null;
    const existing = locations.find((l) => l.name.toLowerCase() === trimmed.toLowerCase());
    if (existing) return existing;
    const { data, error } = await supabase
      .from('locations')
      .insert({ user_id: user.id, name: trimmed })
      .select()
      .single();
    if (!error && data) {
      const loc: Location = { id: data.id, name: data.name, isArchived: data.is_archived };
      setLocations((prev) => [...prev, loc].sort((a, b) => a.name.localeCompare(b.name)));
      return loc;
    }
    return null;
  }, [user, locations]);

  // Income operations
  const addIncome = useCallback(async (income: Omit<Income, 'id'>) => {
    if (!user) return;
    const g = gbpIncome(income.amounts);
    const { data, error } = await supabase
      .from('incomes')
      .insert({
        user_id: user.id,
        month_key: currentMonthKey,
        day: income.day,
        cash: g.cash,
        card: g.card,
        note: income.note || null,
        source: income.source || null,
        location_id: income.locationId || null,
      })
      .select()
      .single();

    if (!error && data) {
      await supabase.from('income_amounts').insert(
        income.amounts.map((a) => ({ income_id: data.id, currency: a.currency, cash: a.cash, card: a.card }))
      );
      setIncomeData((prev) =>
        [...prev, { ...income, id: data.id, cash: g.cash, card: g.card, total: g.total }].sort((a, b) => a.day - b.day)
      );
    }
  }, [user, currentMonthKey]);

  const updateIncome = useCallback(async (id: string | number, income: Omit<Income, 'id'>) => {
    if (!user) return;
    const g = gbpIncome(income.amounts);
    const { error } = await supabase
      .from('incomes')
      .update({
        day: income.day,
        cash: g.cash,
        card: g.card,
        note: income.note || null,
        source: income.source || null,
        location_id: income.locationId || null,
      })
      .eq('id', String(id));

    if (!error) {
      await supabase.from('income_amounts').delete().eq('income_id', String(id));
      await supabase.from('income_amounts').insert(
        income.amounts.map((a) => ({ income_id: String(id), currency: a.currency, cash: a.cash, card: a.card }))
      );
      setIncomeData((prev) =>
        prev.map((item) => (item.id === id ? { ...income, id, cash: g.cash, card: g.card, total: g.total } : item)).sort((a, b) => a.day - b.day)
      );
    }
  }, [user]);

  const deleteIncome = useCallback(async (id: string | number) => {
    if (!user) return;
    const { error } = await supabase.from('incomes').delete().eq('id', String(id));
    if (!error) setIncomeData((prev) => prev.filter((item) => item.id !== id));
  }, [user]);

  // Expense operations
  const addExpense = useCallback(async (expense: Omit<Expense, 'id'>) => {
    if (!user) return;
    const gbp = gbpExpense(expense.amounts);
    const { data, error } = await supabase
      .from('expenses')
      .insert({
        user_id: user.id,
        month_key: currentMonthKey,
        day: expense.day,
        amount: gbp,
        description: expense.description,
        expense_type: expense.expenseType || 'cost',
        location_id: expense.locationId || null,
      })
      .select()
      .single();

    if (!error && data) {
      await supabase.from('expense_amounts').insert(
        expense.amounts.map((a) => ({ expense_id: data.id, currency: a.currency, amount: a.amount }))
      );
      setExpenseData((prev) => [...prev, { ...expense, id: data.id, amount: gbp }]);
    }
  }, [user, currentMonthKey]);

  const updateExpense = useCallback(async (id: string | number, expense: Omit<Expense, 'id'>) => {
    if (!user) return;
    const gbp = gbpExpense(expense.amounts);
    const { error } = await supabase
      .from('expenses')
      .update({
        day: expense.day,
        amount: gbp,
        description: expense.description,
        expense_type: expense.expenseType || 'cost',
        location_id: expense.locationId || null,
      })
      .eq('id', String(id));

    if (!error) {
      await supabase.from('expense_amounts').delete().eq('expense_id', String(id));
      await supabase.from('expense_amounts').insert(
        expense.amounts.map((a) => ({ expense_id: String(id), currency: a.currency, amount: a.amount }))
      );
      setExpenseData((prev) => prev.map((item) => (item.id === id ? { ...expense, id, amount: gbp } : item)));
    }
  }, [user]);

  const deleteExpense = useCallback(async (id: string | number) => {
    if (!user) return;
    const { error } = await supabase.from('expenses').delete().eq('id', String(id));
    if (!error) setExpenseData((prev) => prev.filter((item) => item.id !== id));
  }, [user]);

  // Cigarette operations
  const addCigarette = useCallback(async (cigarette: Omit<Cigarette, 'id' | 'boxes' | 'extraPacks'>) => {
    if (!user) return;

    const { data, error } = await supabase
      .from('cigarettes')
      .insert({
        user_id: user.id,
        month_key: currentMonthKey,
        name: cigarette.name,
        packs_per_box: cigarette.packsPerBox,
        pack_price: cigarette.packPrice,
        box_price: cigarette.boxPrice,
        alert_level: cigarette.alertLevel,
        boxes: 0,
        extra_packs: 0,
        unit_type: cigarette.unitType || 'box',
      })
      .select()
      .single();

    if (!error && data) {
      setCigaretteData((prev) => [
        ...prev,
        {
          id: data.id,
          name: data.name,
          packsPerBox: data.packs_per_box,
          packPrice: Number(data.pack_price),
          boxPrice: Number(data.box_price),
          sellPrice: cigarette.sellPrice,
          boxes: data.boxes,
          extraPacks: data.extra_packs,
          alertLevel: data.alert_level,
          unitType: (data.unit_type as Cigarette['unitType']) || 'box',
        },
      ]);
    }
  }, [user, currentMonthKey]);

  const updateCigarette = useCallback(async (id: string | number, cigarette: Partial<Cigarette>) => {
    if (!user) return;

    const updateData: Record<string, unknown> = {};
    if (cigarette.name !== undefined) updateData.name = cigarette.name;
    if (cigarette.packsPerBox !== undefined) updateData.packs_per_box = cigarette.packsPerBox;
    if (cigarette.packPrice !== undefined) updateData.pack_price = cigarette.packPrice;
    if (cigarette.boxPrice !== undefined) updateData.box_price = cigarette.boxPrice;
    if (cigarette.boxes !== undefined) updateData.boxes = cigarette.boxes;
    if (cigarette.extraPacks !== undefined) updateData.extra_packs = cigarette.extraPacks;
    if (cigarette.alertLevel !== undefined) updateData.alert_level = cigarette.alertLevel;

    const { error } = await supabase.from('cigarettes').update(updateData).eq('id', String(id));

    if (!error) {
      setCigaretteData((prev) => prev.map((item) => (item.id === id ? { ...item, ...cigarette } : item)));
    }
  }, [user]);

  const deleteCigarette = useCallback(async (id: string | number) => {
    if (!user) return;
    const { error } = await supabase.from('cigarettes').delete().eq('id', String(id));
    if (!error) setCigaretteData((prev) => prev.filter((item) => item.id !== id));
  }, [user]);

  const addStock = useCallback(async (id: string | number, boxes: number, extraPacks: number = 0) => {
    if (!user) return;
    const cigarette = cigaretteData.find((c) => c.id === id);
    if (!cigarette) return;
    const newBoxes = cigarette.boxes + boxes;
    const newExtraPacks = (cigarette.extraPacks || 0) + extraPacks;
    const { error } = await supabase.from('cigarettes').update({ boxes: newBoxes, extra_packs: newExtraPacks }).eq('id', String(id));
    if (!error) {
      setCigaretteData((prev) => prev.map((item) => (item.id === id ? { ...item, boxes: newBoxes, extraPacks: newExtraPacks } : item)));
    }
  }, [user, cigaretteData]);

  const updateStock = useCallback(async (id: string | number, boxes: number, extraPacks: number) => {
    if (!user) return;
    const { error } = await supabase.from('cigarettes').update({ boxes, extra_packs: extraPacks }).eq('id', String(id));
    if (!error) {
      setCigaretteData((prev) => prev.map((item) => (item.id === id ? { ...item, boxes, extraPacks } : item)));
    }
  }, [user]);

  // Sales operations
  const addSale = useCallback(async (sale: Omit<Sale, 'id'>, cigaretteId: string | number) => {
    if (!user) return;

    const { data, error } = await supabase
      .from('sales')
      .insert({
        user_id: user.id,
        month_key: currentMonthKey,
        day: sale.day,
        cigarette_id: String(cigaretteId),
        cigarette_name: sale.cigaretteName,
        packs: sale.packs,
        pack_price: sale.packPrice,
        total_sale: sale.totalSale,
        profit: sale.profit,
        currency: sale.currency || 'GBP',
        location_id: sale.locationId || null,
      })
      .select()
      .single();

    if (!error && data) {
      setSalesData((prev) => [
        ...prev,
        {
          id: data.id,
          day: data.day,
          cigaretteId: data.cigarette_id,
          cigaretteName: data.cigarette_name,
          packs: data.packs,
          packPrice: Number(data.pack_price),
          totalSale: Number(data.total_sale),
          profit: Number(data.profit),
          currency: (data.currency as Currency) || 'GBP',
          locationId: data.location_id || null,
        },
      ]);

      const cigarette = cigaretteData.find((c) => c.id === cigaretteId);
      if (cigarette) {
        let remainingPacks = sale.packs;
        let newExtraPacks = cigarette.extraPacks || 0;
        let newBoxes = cigarette.boxes;

        if (newExtraPacks >= remainingPacks) {
          newExtraPacks -= remainingPacks;
          remainingPacks = 0;
        } else {
          remainingPacks -= newExtraPacks;
          newExtraPacks = 0;
        }

        if (remainingPacks > 0) {
          const boxesNeeded = Math.ceil(remainingPacks / cigarette.packsPerBox);
          newBoxes -= boxesNeeded;
          const packsFromBoxes = boxesNeeded * cigarette.packsPerBox;
          newExtraPacks = packsFromBoxes - remainingPacks;
        }

        await supabase.from('cigarettes').update({ boxes: newBoxes, extra_packs: newExtraPacks }).eq('id', String(cigaretteId));
        setCigaretteData((prev) =>
          prev.map((cig) => (cig.id === cigaretteId ? { ...cig, boxes: newBoxes, extraPacks: newExtraPacks } : cig))
        );
      }
    }
  }, [user, currentMonthKey, cigaretteData]);

  const deleteSale = useCallback(async (id: string | number) => {
    if (!user) return;
    const sale = salesData.find((s) => s.id === id);
    if (sale && sale.cigaretteId) {
      const cigarette = cigaretteData.find((c) => c.id === sale.cigaretteId);
      if (cigarette) {
        const newExtraPacks = (cigarette.extraPacks || 0) + sale.packs;
        await supabase.from('cigarettes').update({ extra_packs: newExtraPacks }).eq('id', String(sale.cigaretteId));
        setCigaretteData((prev) =>
          prev.map((cig) => (cig.id === sale.cigaretteId ? { ...cig, extraPacks: newExtraPacks } : cig))
        );
      }
    }
    const { error } = await supabase.from('sales').delete().eq('id', String(id));
    if (!error) setSalesData((prev) => prev.filter((item) => item.id !== id));
  }, [user, salesData, cigaretteData]);

  const clearAllData = useCallback(async () => {
    if (!user) return;
    await Promise.all([
      supabase.from('incomes').delete().eq('user_id', user.id).eq('month_key', currentMonthKey),
      supabase.from('expenses').delete().eq('user_id', user.id).eq('month_key', currentMonthKey),
      supabase.from('sales').delete().eq('user_id', user.id).eq('month_key', currentMonthKey),
    ]);
    setIncomeData([]);
    setExpenseData([]);
    setSalesData([]);
  }, [user, currentMonthKey]);

  // Get summary (per-currency + legacy GBP scalars), filtered by selected location
  const getSummary = useCallback(() => {
    const locMatch = (locId?: string | null) => !selectedLocationId || locId === selectedLocationId;

    const incomes = incomeData.filter((i) => locMatch(i.locationId));
    const expenses = expenseData.filter((e) => locMatch(e.locationId));
    const sales = salesData.filter((s) => locMatch(s.locationId));

    const cashByCcy = emptyTotals();
    const cardByCcy = emptyTotals();
    const incomeByCcy = emptyTotals();
    for (const inc of incomes) {
      for (const a of inc.amounts) {
        cashByCcy[a.currency] += Number(a.cash) || 0;
        cardByCcy[a.currency] += Number(a.card) || 0;
        incomeByCcy[a.currency] += (Number(a.cash) || 0) + (Number(a.card) || 0);
      }
    }

    const purchaseByCcy = emptyTotals();
    const costByCcy = emptyTotals();
    const expenseByCcy = emptyTotals();
    for (const exp of expenses) {
      const target = exp.expenseType === 'purchase' ? purchaseByCcy : costByCcy;
      for (const a of exp.amounts) {
        target[a.currency] += Number(a.amount) || 0;
        expenseByCcy[a.currency] += Number(a.amount) || 0;
      }
    }

    const salesByCcy = emptyTotals();
    for (const s of sales) {
      salesByCcy[s.currency || 'GBP'] += Number(s.totalSale) || 0;
    }

    const balanceByCcy = emptyTotals();
    (['GBP', 'IQD', 'EUR'] as Currency[]).forEach((c) => {
      balanceByCcy[c] = incomeByCcy[c] - expenseByCcy[c];
    });

    // Inventory / profit stats (currency-agnostic, kept as-is)
    const totalCigaretteTypes = cigaretteData.length;
    const totalBoxes = cigaretteData.reduce((sum, cig) => sum + cig.boxes, 0);
    const totalPacks = cigaretteData.reduce((sum, cig) => sum + cig.boxes * cig.packsPerBox + (cig.extraPacks || 0), 0);
    const totalStockValue = cigaretteData.reduce((sum, cig) => {
      const totalCigPacks = cig.boxes * cig.packsPerBox + (cig.extraPacks || 0);
      return sum + totalCigPacks * cig.packPrice;
    }, 0);
    const todaySales = sales.filter((s) => s.day === new Date().getDate()).reduce((sum, s) => sum + s.totalSale, 0);
    const monthSales = sales.reduce((sum, s) => sum + s.totalSale, 0);
    const cigaretteProfit = sales.reduce((sum, s) => sum + s.profit, 0);

    return {
      // Per-currency breakdowns
      cashByCcy,
      cardByCcy,
      incomeByCcy,
      expenseByCcy,
      purchaseByCcy,
      costByCcy,
      salesByCcy,
      balanceByCcy,
      // Legacy GBP scalars (used by charts/reports)
      totalCash: cashByCcy.GBP,
      totalCard: cardByCcy.GBP,
      totalIncome: incomeByCcy.GBP,
      totalExpense: expenseByCcy.GBP,
      balance: balanceByCcy.GBP,
      totalCigaretteTypes,
      totalBoxes,
      totalPacks,
      totalStockValue,
      todaySales,
      monthSales,
      cigaretteProfit,
    };
  }, [incomeData, expenseData, cigaretteData, salesData, selectedLocationId]);

  const getLowStockItems = useCallback(() => {
    return cigaretteData.filter((cig) => {
      const total = cig.boxes * cig.packsPerBox + (cig.extraPacks || 0);
      return total <= cig.alertLevel;
    });
  }, [cigaretteData]);

  const getCurrentMonthLabel = useCallback(() => {
    const opt = MONTH_OPTIONS.find((m) => m.key === currentMonthKey);
    return opt ? opt.label : currentMonthKey;
  }, [currentMonthKey]);

  const getDefaultDay = useCallback(() => {
    return isCurrentMonth(currentMonthKey) ? new Date().getDate() : 1;
  }, [currentMonthKey]);

  const getMaxDays = useCallback(() => {
    return daysInMonth(currentMonthKey);
  }, [currentMonthKey]);

  return {
    currentMonthKey,
    incomeData,
    expenseData,
    cigaretteData,
    salesData,
    locations,
    selectedLocationId,
    setSelectedLocationId,
    addLocation,
    isLoading,
    changeMonth,
    addIncome,
    updateIncome,
    deleteIncome,
    addExpense,
    updateExpense,
    deleteExpense,
    addCigarette,
    updateCigarette,
    deleteCigarette,
    addStock,
    updateStock,
    addSale,
    deleteSale,
    clearAllData,
    getSummary,
    getLowStockItems,
    getCurrentMonthLabel,
    getDefaultDay,
    getMaxDays,
  };
}
