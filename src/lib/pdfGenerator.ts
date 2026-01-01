import jsPDF from 'jspdf';
import autoTable from 'jspdf-autotable';
import { Income, Expense, Cigarette, Sale } from '@/types/finance';

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
  };
}

// Convert month key like "2025-01" or "01 / 2025" to "January 2025"
function formatMonthLabel(label: string): string {
  const monthNames = [
    'January', 'February', 'March', 'April', 'May', 'June',
    'July', 'August', 'September', 'October', 'November', 'December'
  ];
  
  // Handle format "01 / 2025"
  const slashMatch = label.match(/(\d{2})\s*\/\s*(\d{4})/);
  if (slashMatch) {
    const monthIndex = parseInt(slashMatch[1], 10) - 1;
    const year = slashMatch[2];
    return `${monthNames[monthIndex]} ${year}`;
  }
  
  // Handle format "2025-01"
  const dashMatch = label.match(/(\d{4})-(\d{2})/);
  if (dashMatch) {
    const year = dashMatch[1];
    const monthIndex = parseInt(dashMatch[2], 10) - 1;
    return `${monthNames[monthIndex]} ${year}`;
  }
  
  return label;
}

// Format currency properly
function formatMoney(value: number | undefined | null): string {
  const num = typeof value === 'number' && !isNaN(value) ? value : 0;
  return `£${num.toFixed(2)}`;
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

  autoTable(doc, {
    startY: yPos,
    head: [['Item', 'Value']],
    body: [
      ['Total Cash', formatMoney(summary.totalCash)],
      ['Total Card', formatMoney(summary.totalCard)],
      ['Total Income', formatMoney(summary.totalIncome)],
      ['Total Expense', formatMoney(summary.totalExpense)],
      ['Balance', formatMoney(summary.balance)],
      ['Cigarette Profit', formatMoney(summary.cigaretteProfit)],
      ['Net Profit', formatMoney(netProfit)],
      ['Stock Value', formatMoney(summary.totalStockValue)],
    ],
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
      head: [['Day', 'Cash', 'Card', 'Total', 'Note']],
      body: incomeData.map(inc => [
        `Day ${inc.day}`,
        formatMoney(inc.cash),
        formatMoney(inc.card),
        formatMoney(inc.total),
        inc.note || '-',
      ]),
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

  // Expenses Section
  if (expenseData && expenseData.length > 0) {
    doc.setFontSize(14);
    doc.setTextColor(60, 60, 60);
    doc.text('Expenses', 15, yPos);
    
    yPos += 5;

    autoTable(doc, {
      startY: yPos,
      head: [['Day', 'Description', 'Amount']],
      body: expenseData.map(exp => [
        `Day ${exp.day}`,
        exp.description ? (exp.description.length > 40 ? exp.description.substring(0, 40) + '...' : exp.description) : '-',
        formatMoney(exp.amount),
      ]),
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
      head: [['Day', 'Product', 'Packs', 'Total Sale', 'Profit']],
      body: salesData.map(sale => [
        `Day ${sale.day}`,
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
  const today = new Date();
  const dateStr = `${today.getDate().toString().padStart(2, '0')}/${(today.getMonth() + 1).toString().padStart(2, '0')}/${today.getFullYear()}`;
  
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
