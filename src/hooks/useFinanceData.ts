import { useState, useEffect, useCallback } from 'react';
import { Income, Expense, Cigarette, Sale, MONTH_OPTIONS } from '@/types/finance';

function storageKey(base: string, monthKey: string) {
  return `${base}_${monthKey}`;
}

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

export function useFinanceData() {
  const [currentMonthKey, setCurrentMonthKey] = useState(() => {
    return localStorage.getItem('selectedMonthKey') || '2025-12';
  });
  
  const [incomeData, setIncomeData] = useState<Income[]>([]);
  const [expenseData, setExpenseData] = useState<Expense[]>([]);
  const [cigaretteData, setCigaretteData] = useState<Cigarette[]>([]);
  const [salesData, setSalesData] = useState<Sale[]>([]);

  // Load data for current month
  const loadMonthData = useCallback(() => {
    const income = JSON.parse(localStorage.getItem(storageKey('incomeData', currentMonthKey)) || '[]');
    const expense = JSON.parse(localStorage.getItem(storageKey('expenseData', currentMonthKey)) || '[]');
    const cigarette = JSON.parse(localStorage.getItem(storageKey('cigaretteData', currentMonthKey)) || '[]');
    const sales = JSON.parse(localStorage.getItem(storageKey('salesData', currentMonthKey)) || '[]');
    
    setIncomeData(income);
    setExpenseData(expense);
    setCigaretteData(cigarette);
    setSalesData(sales);
  }, [currentMonthKey]);

  // Save all data
  const saveAllData = useCallback(() => {
    localStorage.setItem(storageKey('incomeData', currentMonthKey), JSON.stringify(incomeData));
    localStorage.setItem(storageKey('expenseData', currentMonthKey), JSON.stringify(expenseData));
    localStorage.setItem(storageKey('cigaretteData', currentMonthKey), JSON.stringify(cigaretteData));
    localStorage.setItem(storageKey('salesData', currentMonthKey), JSON.stringify(salesData));
    localStorage.setItem('selectedMonthKey', currentMonthKey);
  }, [currentMonthKey, incomeData, expenseData, cigaretteData, salesData]);

  useEffect(() => {
    loadMonthData();
  }, [loadMonthData]);

  useEffect(() => {
    saveAllData();
  }, [incomeData, expenseData, cigaretteData, salesData]);

  // Change month
  const changeMonth = useCallback((monthKey: string) => {
    setCurrentMonthKey(monthKey);
    localStorage.setItem('selectedMonthKey', monthKey);
  }, []);

  // Income operations
  const addIncome = useCallback((income: Omit<Income, 'id'>) => {
    setIncomeData(prev => {
      const newIncome = { ...income, id: Date.now() };
      return [...prev, newIncome].sort((a, b) => a.day - b.day);
    });
  }, []);

  const updateIncome = useCallback((id: number, income: Omit<Income, 'id'>) => {
    setIncomeData(prev => 
      prev.map(item => item.id === id ? { ...income, id } : item).sort((a, b) => a.day - b.day)
    );
  }, []);

  const deleteIncome = useCallback((id: number) => {
    setIncomeData(prev => prev.filter(item => item.id !== id));
  }, []);

  // Expense operations
  const addExpense = useCallback((expense: Omit<Expense, 'id'>) => {
    setExpenseData(prev => [...prev, { ...expense, id: Date.now() }]);
  }, []);

  const updateExpense = useCallback((id: number, expense: Omit<Expense, 'id'>) => {
    setExpenseData(prev => prev.map(item => item.id === id ? { ...expense, id } : item));
  }, []);

  const deleteExpense = useCallback((id: number) => {
    setExpenseData(prev => prev.filter(item => item.id !== id));
  }, []);

  // Cigarette operations
  const addCigarette = useCallback((cigarette: Omit<Cigarette, 'id' | 'boxes' | 'extraPacks'>) => {
    setCigaretteData(prev => [...prev, { ...cigarette, id: Date.now(), boxes: 0, extraPacks: 0 }]);
  }, []);

  const updateCigarette = useCallback((id: number, cigarette: Partial<Cigarette>) => {
    setCigaretteData(prev => prev.map(item => item.id === id ? { ...item, ...cigarette } : item));
  }, []);

  const deleteCigarette = useCallback((id: number) => {
    setCigaretteData(prev => prev.filter(item => item.id !== id));
  }, []);

  const addStock = useCallback((id: number, boxes: number) => {
    setCigaretteData(prev => prev.map(item => 
      item.id === id ? { ...item, boxes: item.boxes + boxes } : item
    ));
  }, []);

  const updateStock = useCallback((id: number, boxes: number, extraPacks: number) => {
    setCigaretteData(prev => prev.map(item => 
      item.id === id ? { ...item, boxes, extraPacks } : item
    ));
  }, []);

  // Sales operations
  const addSale = useCallback((sale: Omit<Sale, 'id'>, cigaretteId: number) => {
    setSalesData(prev => [...prev, { ...sale, id: Date.now() }]);
    
    // Reduce stock
    setCigaretteData(prev => {
      return prev.map(cig => {
        if (cig.id !== cigaretteId) return cig;
        
        let remainingPacks = sale.packs;
        let newExtraPacks = cig.extraPacks || 0;
        let newBoxes = cig.boxes;
        
        // First use extra packs
        if (newExtraPacks >= remainingPacks) {
          newExtraPacks -= remainingPacks;
          remainingPacks = 0;
        } else {
          remainingPacks -= newExtraPacks;
          newExtraPacks = 0;
        }
        
        // Then use boxes
        if (remainingPacks > 0) {
          const boxesNeeded = Math.ceil(remainingPacks / cig.packsPerBox);
          newBoxes -= boxesNeeded;
          const packsFromBoxes = boxesNeeded * cig.packsPerBox;
          newExtraPacks = packsFromBoxes - remainingPacks;
        }
        
        return { ...cig, boxes: newBoxes, extraPacks: newExtraPacks };
      });
    });
  }, []);

  const deleteSale = useCallback((id: number) => {
    const sale = salesData.find(s => s.id === id);
    if (sale) {
      // Return packs to stock
      setCigaretteData(prev => prev.map(cig => 
        cig.id === sale.cigaretteId 
          ? { ...cig, extraPacks: (cig.extraPacks || 0) + sale.packs }
          : cig
      ));
    }
    setSalesData(prev => prev.filter(item => item.id !== id));
  }, [salesData]);

  // Clear all data for current month
  const clearAllData = useCallback(() => {
    setIncomeData([]);
    setExpenseData([]);
    setSalesData([]);
  }, []);

  // Get summary
  const getSummary = useCallback(() => {
    const totalCash = incomeData.reduce((sum, inc) => sum + inc.cash, 0);
    const totalCard = incomeData.reduce((sum, inc) => sum + inc.card, 0);
    const totalIncome = totalCash + totalCard;
    const totalExpense = expenseData.reduce((sum, exp) => sum + exp.amount, 0);
    const balance = totalIncome - totalExpense;
    
    const totalCigaretteTypes = cigaretteData.length;
    const totalBoxes = cigaretteData.reduce((sum, cig) => sum + cig.boxes, 0);
    const totalPacks = cigaretteData.reduce((sum, cig) => 
      sum + (cig.boxes * cig.packsPerBox) + (cig.extraPacks || 0), 0
    );
    const totalStockValue = cigaretteData.reduce((sum, cig) => {
      const totalCigPacks = (cig.boxes * cig.packsPerBox) + (cig.extraPacks || 0);
      return sum + (totalCigPacks * cig.packPrice);
    }, 0);
    
    const todaySales = salesData.filter(s => s.day === new Date().getDate())
      .reduce((sum, s) => sum + s.totalSale, 0);
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
    return cigaretteData.filter(cig => {
      const total = (cig.boxes * cig.packsPerBox) + (cig.extraPacks || 0);
      return total <= cig.alertLevel;
    });
  }, [cigaretteData]);

  // Get current month label
  const getCurrentMonthLabel = useCallback(() => {
    const opt = MONTH_OPTIONS.find(m => m.key === currentMonthKey);
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
