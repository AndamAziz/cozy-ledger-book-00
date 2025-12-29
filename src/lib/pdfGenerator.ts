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

export function generatePDFReport(data: ReportData): void {
  const { monthLabel, incomeData, expenseData, cigaretteData, salesData, summary } = data;
  const netProfit = summary.balance + summary.cigaretteProfit;

  // Create PDF
  const doc = new jsPDF({
    orientation: 'portrait',
    unit: 'mm',
    format: 'a4',
  });

  // Set RTL support
  doc.setR2L(true);

  let yPos = 20;

  // Title
  doc.setFontSize(22);
  doc.setTextColor(16, 185, 129); // Primary green
  doc.text(`Financial Report - ${monthLabel}`, 105, yPos, { align: 'center' });
  
  yPos += 15;

  // Summary Section
  doc.setFontSize(14);
  doc.setTextColor(60, 60, 60);
  doc.text('Summary', 190, yPos, { align: 'right' });
  
  yPos += 5;

  autoTable(doc, {
    startY: yPos,
    head: [['Value', 'Item']],
    body: [
      [`£${summary.totalCash.toFixed(2)}`, 'Total Cash'],
      [`£${summary.totalCard.toFixed(2)}`, 'Total Card'],
      [`£${summary.totalIncome.toFixed(2)}`, 'Total Income'],
      [`£${summary.totalExpense.toFixed(2)}`, 'Total Expense'],
      [`£${summary.balance.toFixed(2)}`, 'Balance'],
      [`£${summary.cigaretteProfit.toFixed(2)}`, 'Cigarette Profit'],
      [`£${netProfit.toFixed(2)}`, 'Net Profit'],
      [`£${summary.totalStockValue.toFixed(2)}`, 'Stock Value'],
    ],
    theme: 'grid',
    headStyles: { 
      fillColor: [16, 185, 129],
      halign: 'right',
      fontSize: 10,
    },
    bodyStyles: {
      halign: 'right',
      fontSize: 9,
    },
    columnStyles: {
      0: { cellWidth: 50 },
      1: { cellWidth: 80 },
    },
    margin: { right: 15 },
  });

  yPos = (doc as any).lastAutoTable.finalY + 15;

  // Daily Income Section
  if (incomeData.length > 0) {
    doc.setFontSize(14);
    doc.setTextColor(60, 60, 60);
    doc.text('Daily Income', 190, yPos, { align: 'right' });
    
    yPos += 5;

    autoTable(doc, {
      startY: yPos,
      head: [['Total', 'Card', 'Cash', 'Day']],
      body: incomeData.map(inc => [
        `£${inc.total.toFixed(2)}`,
        `£${inc.card.toFixed(2)}`,
        `£${inc.cash.toFixed(2)}`,
        `Day ${inc.day}`,
      ]),
      theme: 'striped',
      headStyles: { 
        fillColor: [34, 197, 94],
        halign: 'right',
        fontSize: 10,
      },
      bodyStyles: {
        halign: 'right',
        fontSize: 9,
      },
      margin: { right: 15 },
    });

    yPos = (doc as any).lastAutoTable.finalY + 15;
  }

  // Check if we need a new page
  if (yPos > 250) {
    doc.addPage();
    yPos = 20;
  }

  // Expenses Section
  if (expenseData.length > 0) {
    doc.setFontSize(14);
    doc.setTextColor(60, 60, 60);
    doc.text('Expenses', 190, yPos, { align: 'right' });
    
    yPos += 5;

    autoTable(doc, {
      startY: yPos,
      head: [['Amount', 'Purpose', 'Name']],
      body: expenseData.map(exp => [
        `£${exp.amount.toFixed(2)}`,
        exp.purpose.substring(0, 30) + (exp.purpose.length > 30 ? '...' : ''),
        exp.name,
      ]),
      theme: 'striped',
      headStyles: { 
        fillColor: [239, 68, 68],
        halign: 'right',
        fontSize: 10,
      },
      bodyStyles: {
        halign: 'right',
        fontSize: 9,
      },
      margin: { right: 15 },
    });

    yPos = (doc as any).lastAutoTable.finalY + 15;
  }

  // Check if we need a new page
  if (yPos > 250) {
    doc.addPage();
    yPos = 20;
  }

  // Inventory Section
  if (cigaretteData.length > 0) {
    doc.setFontSize(14);
    doc.setTextColor(60, 60, 60);
    doc.text('Inventory', 190, yPos, { align: 'right' });
    
    yPos += 5;

    autoTable(doc, {
      startY: yPos,
      head: [['Value', 'Total Packs', 'Boxes', 'Sell Price', 'Name']],
      body: cigaretteData.map(cig => {
        const totalPacks = (cig.boxes * cig.packsPerBox) + (cig.extraPacks || 0);
        const value = totalPacks * cig.packPrice;
        return [
          `£${value.toFixed(2)}`,
          totalPacks.toString(),
          cig.boxes.toString(),
          `£${cig.sellPrice.toFixed(2)}`,
          cig.name,
        ];
      }),
      theme: 'striped',
      headStyles: { 
        fillColor: [245, 158, 11],
        halign: 'right',
        fontSize: 10,
      },
      bodyStyles: {
        halign: 'right',
        fontSize: 9,
      },
      margin: { right: 15 },
    });

    yPos = (doc as any).lastAutoTable.finalY + 15;
  }

  // Check if we need a new page
  if (yPos > 250) {
    doc.addPage();
    yPos = 20;
  }

  // Sales Section
  if (salesData.length > 0) {
    doc.setFontSize(14);
    doc.setTextColor(60, 60, 60);
    doc.text('Sales History', 190, yPos, { align: 'right' });
    
    yPos += 5;

    autoTable(doc, {
      startY: yPos,
      head: [['Profit', 'Total', 'Packs', 'Product', 'Day']],
      body: salesData.map(sale => [
        `£${sale.profit.toFixed(2)}`,
        `£${sale.totalSale.toFixed(2)}`,
        sale.packs.toString(),
        sale.cigaretteName,
        `Day ${sale.day}`,
      ]),
      theme: 'striped',
      headStyles: { 
        fillColor: [59, 130, 246],
        halign: 'right',
        fontSize: 10,
      },
      bodyStyles: {
        halign: 'right',
        fontSize: 9,
      },
      margin: { right: 15 },
    });
  }

  // Footer
  const pageCount = doc.getNumberOfPages();
  for (let i = 1; i <= pageCount; i++) {
    doc.setPage(i);
    doc.setFontSize(8);
    doc.setTextColor(150, 150, 150);
    doc.text(
      `Generated on ${new Date().toLocaleDateString('en-GB')} - Page ${i} of ${pageCount}`,
      105,
      285,
      { align: 'center' }
    );
  }

  // Download
  doc.save(`Financial-Report-${monthLabel.replace(/\s/g, '-')}.pdf`);
}
