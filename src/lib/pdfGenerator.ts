import jsPDF from 'jspdf';
import autoTable from 'jspdf-autotable';
import { Income, Expense, Cigarette, Sale, Currency } from '@/types/finance';
import { formatCurrentDate } from '@/lib/format';
import { CURRENCIES } from '@/lib/currency';

type CcyTotals = Record<Currency, number>;

interface ReportData {
  monthLabel: string;
  incomeData: Income[];
  expenseData: Expense[];
  cigaretteData: Cigarette[];
  salesData: Sale[];
  summary: {
    totalCash: number;
    totalCard: number;
    totalIncome: number;
    totalExpense: number;
    balance: number;
    totalStockValue: number;
    cigaretteProfit: number;
    cashByCcy?: CcyTotals;
    cardByCcy?: CcyTotals;
    incomeByCcy?: CcyTotals;
    expenseByCcy?: CcyTotals;
    balanceByCcy?: CcyTotals;
    salesByCcy?: CcyTotals;
  };
}

const MONTH_NAMES = [
  'January', 'February', 'March', 'April', 'May', 'June',
  'July', 'August', 'September', 'October', 'November', 'December'
];

const MONTH_ABBR = ['Jan', 'Feb', 'Mar', 'Apr', 'May', 'Jun', 'Jul', 'Aug', 'Sep', 'Oct', 'Nov', 'Dec'];

// Convert month key like "2025-01" or "01 / 2025" to "January 2025"
function formatMonthLabel(label: string): string {
  // Handle format "01 / 2025"
  const slashMatch = label.match(/(\d{2})\s*\/\s*(\d{4})/);
  if (slashMatch) {
    const monthIndex = parseInt(slashMatch[1], 10) - 1;
    const year = slashMatch[2];
    return `${MONTH_NAMES[monthIndex]} ${year}`;
  }
  
  // Handle format "2025-01"
  const dashMatch = label.match(/(\d{4})-(\d{2})/);
  if (dashMatch) {
    const year = dashMatch[1];
    const monthIndex = parseInt(dashMatch[2], 10) - 1;
    return `${MONTH_NAMES[monthIndex]} ${year}`;
  }
  
  return label;
}

// Format day with month abbreviation: "1-Jan-2026"
function formatDayWithMonth(day: number, monthLabel: string): string {
  // Handle format "01 / 2025"
  const slashMatch = monthLabel.match(/(\d{2})\s*\/\s*(\d{4})/);
  if (slashMatch) {
    const monthIndex = parseInt(slashMatch[1], 10) - 1;
    const year = slashMatch[2];
    return `${day}-${MONTH_ABBR[monthIndex]}-${year}`;
  }
  
  // Handle format "2025-01"
  const dashMatch = monthLabel.match(/(\d{4})-(\d{2})/);
  if (dashMatch) {
    const year = dashMatch[1];
    const monthIndex = parseInt(dashMatch[2], 10) - 1;
    return `${day}-${MONTH_ABBR[monthIndex]}-${year}`;
  }
  
  return `Day ${day}`;
}

// Format currency properly
function formatMoney(value: number | undefined | null): string {
  const num = typeof value === 'number' && !isNaN(value) ? value : 0;
  return `£${num.toFixed(2)}`;
}

// PDF-safe currency symbols. The default jsPDF (helvetica/WinAnsi) font renders
// £, $ and € correctly, but not the Arabic IQD glyph, so IQD uses its code.
const PDF_CURRENCY_PREFIX: Record<Currency, string> = {
  GBP: '£',
  USD: '$',
  IQD: 'IQD ',
  EUR: '€',
};

// Consistent per-currency money formatting for the PDF:
// correct symbol, IQD rounded to whole units, others to 2 decimals.
function moneyByCcy(value: number | undefined | null, ccy: Currency | string): string {
  const num = typeof value === 'number' && !isNaN(value) ? value : 0;
  const code = (ccy as Currency);
  const digits = code === 'IQD' ? 0 : 2;
  const formatted = num.toLocaleString('en-GB', { minimumFractionDigits: digits, maximumFractionDigits: digits });
  const prefix = PDF_CURRENCY_PREFIX[code] ?? `${code} `;
  return `${prefix}${formatted}`;
}


export function generatePDFReport(data: ReportData): void {
  const { monthLabel, incomeData, expenseData, cigaretteData, salesData, summary } = data;
  
  // Safely calculate values
  const safeBalance = typeof summary.balance === 'number' ? summary.balance : 0;
  const safeCigProfit = typeof summary.cigaretteProfit === 'number' ? summary.cigaretteProfit : 0;
  const netProfit = safeBalance + safeCigProfit;
  
  const formattedMonth = formatMonthLabel(monthLabel);

  // Create PDF
  const doc = new jsPDF({
    orientation: 'portrait',
    unit: 'mm',
    format: 'a4',
  });

  let yPos = 20;

  // Title
  doc.setFontSize(22);
  doc.setTextColor(16, 185, 129);
  doc.text(`Financial Report - ${formattedMonth}`, 105, yPos, { align: 'center' });
  
  yPos += 15;

  // Summary Section
  doc.setFontSize(14);
  doc.setTextColor(60, 60, 60);
  doc.text('Summary', 15, yPos);
  
  yPos += 5;

  // Build per-currency summary rows. Only show a currency when it has any activity.
  const zero = { GBP: 0, USD: 0, IQD: 0, EUR: 0 } as CcyTotals;
  const cashByCcy = summary.cashByCcy || { ...zero, GBP: summary.totalCash };
  const cardByCcy = summary.cardByCcy || { ...zero, GBP: summary.totalCard };
  const incomeByCcy = summary.incomeByCcy || { ...zero, GBP: summary.totalIncome };
  const expenseByCcy = summary.expenseByCcy || { ...zero, GBP: summary.totalExpense };
  const balanceByCcy = summary.balanceByCcy || { ...zero, GBP: summary.balance };

  const activeCurrencies = CURRENCIES.filter((c) =>
    Math.abs(cashByCcy[c]) > 0.0001 ||
    Math.abs(cardByCcy[c]) > 0.0001 ||
    Math.abs(incomeByCcy[c]) > 0.0001 ||
    Math.abs(expenseByCcy[c]) > 0.0001 ||
    Math.abs(balanceByCcy[c]) > 0.0001
  );
  const shownCurrencies = activeCurrencies.length ? activeCurrencies : (['GBP'] as Currency[]);

  const summaryBody: string[][] = [];
  for (const c of shownCurrencies) {
    summaryBody.push([`Total Cash (${c})`, moneyByCcy(cashByCcy[c], c)]);
    summaryBody.push([`Total Card (${c})`, moneyByCcy(cardByCcy[c], c)]);
    summaryBody.push([`Total Income (${c})`, moneyByCcy(incomeByCcy[c], c)]);
    summaryBody.push([`Total Expense (${c})`, moneyByCcy(expenseByCcy[c], c)]);
    summaryBody.push([`Balance (${c})`, moneyByCcy(balanceByCcy[c], c)]);
  }
  summaryBody.push(['Cigarette Profit', formatMoney(summary.cigaretteProfit)]);
  summaryBody.push(['Net Profit', formatMoney(netProfit)]);
  summaryBody.push(['Stock Value', formatMoney(summary.totalStockValue)]);

  autoTable(doc, {
    startY: yPos,
    head: [['Item', 'Value']],
    body: summaryBody,
    theme: 'grid',
    headStyles: { 
      fillColor: [16, 185, 129],
      halign: 'left',
      fontSize: 10,
    },
    bodyStyles: {
      halign: 'left',
      fontSize: 9,
    },
    columnStyles: {
      0: { cellWidth: 80 },
      1: { cellWidth: 50 },
    },
    margin: { left: 15 },
  });

  yPos = (doc as any).lastAutoTable.finalY + 15;

  // Daily Income Section
  if (incomeData && incomeData.length > 0) {
    doc.setFontSize(14);
    doc.setTextColor(60, 60, 60);
    doc.text('Daily Income', 15, yPos);
    
    yPos += 5;

    autoTable(doc, {
      startY: yPos,
      head: [['Date', 'Currency', 'Cash', 'Card', 'Total', 'Source']],
      body: incomeData.flatMap(inc => {
        const rows = (inc.amounts && inc.amounts.length ? inc.amounts : [{ currency: 'GBP', cash: inc.cash, card: inc.card }]);
        return rows.map((a, idx) => [
          idx === 0 ? formatDayWithMonth(inc.day, monthLabel) : '',
          a.currency,
          moneyByCcy(a.cash, a.currency),
          moneyByCcy(a.card, a.currency),
          moneyByCcy((Number(a.cash) || 0) + (Number(a.card) || 0), a.currency),
          idx === 0 ? (inc.source || '-') : '',
        ]);
      }),
      theme: 'striped',
      headStyles: { 
        fillColor: [34, 197, 94],
        halign: 'left',
        fontSize: 10,
      },
      bodyStyles: {
        halign: 'left',
        fontSize: 9,
      },
      margin: { left: 15 },
    });

    yPos = (doc as any).lastAutoTable.finalY + 15;
  }

  // Check if we need a new page
  if (yPos > 250) {
    doc.addPage();
    yPos = 20;
  }

  // Purchases Section
  const purchases = expenseData?.filter(exp => exp.expenseType === 'purchase') || [];
  if (purchases.length > 0) {
    doc.setFontSize(14);
    doc.setTextColor(60, 60, 60);
    doc.text('Purchases', 15, yPos);
    
    yPos += 5;

    autoTable(doc, {
      startY: yPos,
      head: [['Date', 'Description', 'Currency', 'Amount']],
      body: purchases.flatMap(exp => {
        const rows = (exp.amounts && exp.amounts.length ? exp.amounts : [{ currency: 'GBP', amount: exp.amount }]);
        return rows.map((a, idx) => [
          idx === 0 ? formatDayWithMonth(exp.day, monthLabel) : '',
          idx === 0 ? (exp.description ? (exp.description.length > 40 ? exp.description.substring(0, 40) + '...' : exp.description) : '-') : '',
          a.currency,
          moneyByCcy(a.amount, a.currency),
        ]);
      }),
      theme: 'striped',
      headStyles: { 
        fillColor: [245, 158, 11],
        halign: 'left',
        fontSize: 10,
      },
      bodyStyles: {
        halign: 'left',
        fontSize: 9,
      },
      margin: { left: 15 },
    });

    yPos = (doc as any).lastAutoTable.finalY + 15;
  }

  // Check if we need a new page
  if (yPos > 250) {
    doc.addPage();
    yPos = 20;
  }

  // Costs Section
  const costs = expenseData?.filter(exp => exp.expenseType === 'cost' || !exp.expenseType) || [];
  if (costs.length > 0) {
    doc.setFontSize(14);
    doc.setTextColor(60, 60, 60);
    doc.text('Costs (Business Expenses)', 15, yPos);
    
    yPos += 5;

    autoTable(doc, {
      startY: yPos,
      head: [['Date', 'Description', 'Currency', 'Amount']],
      body: costs.flatMap(exp => {
        const rows = (exp.amounts && exp.amounts.length ? exp.amounts : [{ currency: 'GBP', amount: exp.amount }]);
        return rows.map((a, idx) => [
          idx === 0 ? formatDayWithMonth(exp.day, monthLabel) : '',
          idx === 0 ? (exp.description ? (exp.description.length > 40 ? exp.description.substring(0, 40) + '...' : exp.description) : '-') : '',
          a.currency,
          moneyByCcy(a.amount, a.currency),
        ]);
      }),
      theme: 'striped',
      headStyles: { 
        fillColor: [239, 68, 68],
        halign: 'left',
        fontSize: 10,
      },
      bodyStyles: {
        halign: 'left',
        fontSize: 9,
      },
      margin: { left: 15 },
    });

    yPos = (doc as any).lastAutoTable.finalY + 15;
  }

  // Check if we need a new page
  if (yPos > 250) {
    doc.addPage();
    yPos = 20;
  }

  // Inventory Section
  if (cigaretteData && cigaretteData.length > 0) {
    doc.setFontSize(14);
    doc.setTextColor(60, 60, 60);
    doc.text('Inventory (Stock)', 15, yPos);
    
    yPos += 5;

    autoTable(doc, {
      startY: yPos,
      head: [['Name', 'Boxes', 'Extra Packs', 'Total Packs', 'Sell Price', 'Stock Value']],
      body: cigaretteData.map(cig => {
        const boxes = typeof cig.boxes === 'number' ? cig.boxes : 0;
        const packsPerBox = typeof cig.packsPerBox === 'number' ? cig.packsPerBox : 10;
        const extraPacks = typeof cig.extraPacks === 'number' ? cig.extraPacks : 0;
        const packPrice = typeof cig.packPrice === 'number' ? cig.packPrice : 0;
        const totalPacks = (boxes * packsPerBox) + extraPacks;
        const value = totalPacks * packPrice;
        return [
          cig.name || '-',
          boxes.toString(),
          extraPacks.toString(),
          totalPacks.toString(),
          formatMoney(cig.sellPrice),
          formatMoney(value),
        ];
      }),
      theme: 'striped',
      headStyles: { 
        fillColor: [245, 158, 11],
        halign: 'left',
        fontSize: 10,
      },
      bodyStyles: {
        halign: 'left',
        fontSize: 9,
      },
      margin: { left: 15 },
    });

    yPos = (doc as any).lastAutoTable.finalY + 15;
  }

  // Check if we need a new page
  if (yPos > 250) {
    doc.addPage();
    yPos = 20;
  }

  // Sales Section
  if (salesData && salesData.length > 0) {
    doc.setFontSize(14);
    doc.setTextColor(60, 60, 60);
    doc.text('Sales History', 15, yPos);
    
    yPos += 5;

    autoTable(doc, {
      startY: yPos,
      head: [['Date', 'Product', 'Packs', 'Total Sale', 'Profit']],
      body: salesData.map(sale => [
        formatDayWithMonth(sale.day, monthLabel),
        sale.cigaretteName || '-',
        (typeof sale.packs === 'number' ? sale.packs : 0).toString(),
        formatMoney(sale.totalSale),
        formatMoney(sale.profit),
      ]),
      theme: 'striped',
      headStyles: { 
        fillColor: [59, 130, 246],
        halign: 'left',
        fontSize: 10,
      },
      bodyStyles: {
        halign: 'left',
        fontSize: 9,
      },
      margin: { left: 15 },
    });
  }

  // Footer
  const pageCount = doc.getNumberOfPages();
  const dateStr = formatCurrentDate();
  
  for (let i = 1; i <= pageCount; i++) {
    doc.setPage(i);
    doc.setFontSize(8);
    doc.setTextColor(150, 150, 150);
    doc.text(
      `Generated on ${dateStr} - Page ${i} of ${pageCount}`,
      105,
      285,
      { align: 'center' }
    );
  }

  // Download
  const safeFileName = formattedMonth.replace(/\s/g, '-');
  doc.save(`Financial-Report-${safeFileName}.pdf`);
}
