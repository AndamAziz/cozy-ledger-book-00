import { useState, useEffect, useCallback } from 'react';
import { supabase } from '@/integrations/supabase/client';
import { Income, Expense, Cigarette, Sale, MONTH_OPTIONS } from '@/types/finance';
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

export interface PrevMonthSummary {
  totalCash: number;
  totalCard: number;
  totalIncome: number;
  totalExpense: number;
  totalPurchase: number;
  totalCost: number;
  balance: number;
}

function getPrevMonthKey(monthKey: string): string {
  const { year, month } = parseMonthKey(monthKey);
  const prevDate = new Date(year, month - 2, 1); // month-2 because month is 1-indexed
  return `${prevDate.getFullYear()}-${String(prevDate.getMonth() + 1).padStart(2, '0')}`;
}

export function useFinanceData() {
  const { user } = useAuth();
  const [currentMonthKey, setCurrentMonthKey] = useState(() => {
    // Always default to current month
    const now = new Date();
    const currentMonth = `${now.getFullYear()}-${String(now.getMonth() + 1).padStart(2, '0')}`;
    return localStorage.getItem('selectedMonthKey') || currentMonth;
  });
  
  const [incomeData, setIncomeData] = useState<Income[]>([]);
  const [expenseData, setExpenseData] = useState<Expense[]>([]);
  const [cigaretteData, setCigaretteData] = useState<Cigarette[]>([]);
  const [salesData, setSalesData] = useState<Sale[]>([]);
  const [prevMonthSummary, setPrevMonthSummary] = useState<PrevMonthSummary | null>(null);
  const [isLoading, setIsLoading] = useState(true);

  // Load data from database
  const loadMonthData = useCallback(async () => {
    if (!user) {
      setIsLoading(false);
      return;
    }

    setIsLoading(true);

    try {
      const prevMonthKey = getPrevMonthKey(currentMonthKey);

      // Load current + previous month data in parallel
      const [
        { data: incomes },
        { data: expenses },
        { data: cigarettes },
        { data: sales },
        { data: prevIncomes },
        { data: prevExpenses },
      ] = await Promise.all([
        supabase.from('incomes').select('*').eq('user_id', user.id).eq('month_key', currentMonthKey).order('day', { ascending: true }),
        supabase.from('expenses').select('*').eq('user_id', user.id).eq('month_key', currentMonthKey),
        supabase.from('cigarettes').select('*').eq('user_id', user.id).eq('month_key', currentMonthKey),
        supabase.from('sales').select('*').eq('user_id', user.id).eq('month_key', currentMonthKey),
        supabase.from('incomes').select('cash, card').eq('user_id', user.id).eq('month_key', prevMonthKey),
        supabase.from('expenses').select('amount, expense_type').eq('user_id', user.id).eq('month_key', prevMonthKey),
      ]);

      setIncomeData(
        (incomes || []).map((inc) => ({
          id: inc.id,
          day: inc.day,
          cash: Number(inc.cash),
          card: Number(inc.card),
          total: Number(inc.cash) + Number(inc.card),
          note: inc.note || '',
        }))
      );

      setExpenseData(
        (expenses || []).map((exp) => ({
          id: exp.id,
          day: exp.day,
          amount: Number(exp.amount),
          description: exp.description,
          expenseType: (exp.expense_type as 'purchase' | 'cost') || 'cost',
        }))
      );

      setCigaretteData(
        (cigarettes || []).map((cig) => ({
          id: cig.id,
          name: cig.name,
          packsPerBox: cig.packs_per_box,
          packPrice: Number(cig.pack_price),
          boxPrice: Number(cig.box_price),
          sellPrice: Number(cig.pack_price), // Using pack_price as sell price for now
          boxes: cig.boxes,
          extraPacks: cig.extra_packs,
          alertLevel: cig.alert_level,
          unitType: (cig.unit_type as 'box' | 'meter' | 'piece' | 'kg' | 'liter' | 'pack') || 'box',
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
        }))
      );
      // Compute previous month summary
      const prevCash = (prevIncomes || []).reduce((s, i) => s + Number(i.cash), 0);
      const prevCard = (prevIncomes || []).reduce((s, i) => s + Number(i.card), 0);
      const prevIncome = prevCash + prevCard;
      const prevPurchase = (prevExpenses || []).filter(e => e.expense_type === 'purchase').reduce((s, e) => s + Number(e.amount), 0);
      const prevCost = (prevExpenses || []).filter(e => e.expense_type !== 'purchase').reduce((s, e) => s + Number(e.amount), 0);
      const prevExpense = prevPurchase + prevCost;
      setPrevMonthSummary({
        totalCash: prevCash,
        totalCard: prevCard,
        totalIncome: prevIncome,
        totalExpense: prevExpense,
        totalPurchase: prevPurchase,
        totalCost: prevCost,
        balance: prevIncome - prevExpense,
      });
    } catch (error) {
      console.error('Error loading data:', error);
    }

    setIsLoading(false);
  }, [user, currentMonthKey]);

  useEffect(() => {
    loadMonthData();
  }, [loadMonthData]);

  // Change month
  const changeMonth = useCallback((monthKey: string) => {
    setCurrentMonthKey(monthKey);
    localStorage.setItem('selectedMonthKey', monthKey);
  }, []);

  // Income operations
  const addIncome = useCallback(async (income: Omit<Income, 'id'>) => {
    if (!user) return;

    const { data, error } = await supabase
      .from('incomes')
      .insert({
        user_id: user.id,
        month_key: currentMonthKey,
        day: income.day,
        cash: income.cash,
        card: income.card,
        note: income.note || null,
      })
      .select()
      .single();

    if (!error && data) {
      setIncomeData((prev) =>
        [...prev, { 
          id: data.id, 
          day: data.day, 
          cash: Number(data.cash), 
          card: Number(data.card), 
          total: Number(data.cash) + Number(data.card),
          note: data.note || '' 
        }].sort((a, b) => a.day - b.day)
      );
    }
  }, [user, currentMonthKey]);

  const updateIncome = useCallback(async (id: string | number, income: Omit<Income, 'id'>) => {
    if (!user) return;

    const { error } = await supabase
      .from('incomes')
      .update({
        day: income.day,
        cash: income.cash,
        card: income.card,
        note: income.note || null,
      })
      .eq('id', String(id));

    if (!error) {
      setIncomeData((prev) =>
        prev.map((item) => (item.id === id ? { ...income, id, total: income.cash + income.card } : item)).sort((a, b) => a.day - b.day)
      );
    }
  }, [user]);

  const deleteIncome = useCallback(async (id: string | number) => {
    if (!user) return;

    const { error } = await supabase.from('incomes').delete().eq('id', String(id));

    if (!error) {
      setIncomeData((prev) => prev.filter((item) => item.id !== id));
    }
  }, [user]);

  // Expense operations
  const addExpense = useCallback(async (expense: Omit<Expense, 'id'>) => {
    if (!user) return;

    const { data, error } = await supabase
      .from('expenses')
      .insert({
        user_id: user.id,
        month_key: currentMonthKey,
        day: expense.day,
        amount: expense.amount,
        description: expense.description,
        expense_type: expense.expenseType || 'cost',
      })
      .select()
      .single();

    if (!error && data) {
      setExpenseData((prev) => [...prev, { 
        id: data.id, 
        day: data.day, 
        amount: Number(data.amount), 
        description: data.description,
        expenseType: (data.expense_type as 'purchase' | 'cost') || 'cost',
      }]);
    }
  }, [user, currentMonthKey]);

  const updateExpense = useCallback(async (id: string | number, expense: Omit<Expense, 'id'>) => {
    if (!user) return;

    const { error } = await supabase
      .from('expenses')
      .update({
        day: expense.day,
        amount: expense.amount,
        description: expense.description,
        expense_type: expense.expenseType || 'cost',
      })
      .eq('id', String(id));

    if (!error) {
      setExpenseData((prev) => prev.map((item) => (item.id === id ? { ...expense, id } : item)));
    }
  }, [user]);

  const deleteExpense = useCallback(async (id: string | number) => {
    if (!user) return;

    const { error } = await supabase.from('expenses').delete().eq('id', String(id));

    if (!error) {
      setExpenseData((prev) => prev.filter((item) => item.id !== id));
    }
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
          unitType: (data.unit_type as 'box' | 'meter' | 'piece' | 'kg' | 'liter' | 'pack') || 'box',
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

    if (!error) {
      setCigaretteData((prev) => prev.filter((item) => item.id !== id));
    }
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
        },
      ]);

      // Reduce stock
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

    if (!error) {
      setSalesData((prev) => prev.filter((item) => item.id !== id));
    }
  }, [user, salesData, cigaretteData]);

  // Clear all data for current month
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

  // Get summary
  const getSummary = useCallback(() => {
    const totalCash = incomeData.reduce((sum, inc) => sum + inc.cash, 0);
    const totalCard = incomeData.reduce((sum, inc) => sum + inc.card, 0);
    const totalIncome = totalCash + totalCard;
    const totalExpense = expenseData.reduce((sum, exp) => sum + exp.amount, 0);
    const balance = totalIncome - totalExpense;

    const totalCigaretteTypes = cigaretteData.length;
    const totalBoxes = cigaretteData.reduce((sum, cig) => sum + cig.boxes, 0);
    const totalPacks = cigaretteData.reduce((sum, cig) => sum + cig.boxes * cig.packsPerBox + (cig.extraPacks || 0), 0);
    const totalStockValue = cigaretteData.reduce((sum, cig) => {
      const totalCigPacks = cig.boxes * cig.packsPerBox + (cig.extraPacks || 0);
      return sum + totalCigPacks * cig.packPrice;
    }, 0);

    const todaySales = salesData.filter((s) => s.day === new Date().getDate()).reduce((sum, s) => sum + s.totalSale, 0);
    const monthSales = salesData.reduce((sum, s) => sum + s.totalSale, 0);
    const cigaretteProfit = salesData.reduce((sum, s) => sum + s.profit, 0);

    return {
      totalCash,
      totalCard,
      totalIncome,
      totalExpense,
      balance,
      totalCigaretteTypes,
      totalBoxes,
      totalPacks,
      totalStockValue,
      todaySales,
      monthSales,
      cigaretteProfit,
    };
  }, [incomeData, expenseData, cigaretteData, salesData]);

  // Get low stock items
  const getLowStockItems = useCallback(() => {
    return cigaretteData.filter((cig) => {
      const total = cig.boxes * cig.packsPerBox + (cig.extraPacks || 0);
      return total <= cig.alertLevel;
    });
  }, [cigaretteData]);

  // Get current month label
  const getCurrentMonthLabel = useCallback(() => {
    const opt = MONTH_OPTIONS.find((m) => m.key === currentMonthKey);
    return opt ? opt.label : currentMonthKey;
  }, [currentMonthKey]);

  // Get default day for forms
  const getDefaultDay = useCallback(() => {
    return isCurrentMonth(currentMonthKey) ? new Date().getDate() : 1;
  }, [currentMonthKey]);

  // Get max days in month
  const getMaxDays = useCallback(() => {
    return daysInMonth(currentMonthKey);
  }, [currentMonthKey]);

  return {
    currentMonthKey,
    incomeData,
    expenseData,
    cigaretteData,
    salesData,
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
    prevMonthSummary,
  };
}
