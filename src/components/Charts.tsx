import { BarChart, Bar, XAxis, YAxis, CartesianGrid, Tooltip, ResponsiveContainer, PieChart, Pie, Cell, Legend, AreaChart, Area } from 'recharts';
import { Income, Sale, Cigarette } from '@/types/finance';
import { formatCurrency } from '@/lib/format';

const COLORS = ['#10b981', '#3b82f6', '#f59e0b', '#ef4444', '#8b5cf6', '#ec4899', '#06b6d4', '#84cc16'];

interface DailyIncomeChartProps {
  data: Income[];
}

export function DailyIncomeChart({ data }: DailyIncomeChartProps) {
  const chartData = data.map(inc => ({
    day: `ڕۆژ ${inc.day}`,
    cash: inc.cash,
    card: inc.card,
    total: inc.total,
  }));

  if (chartData.length === 0) {
    return (
      <div className="text-center py-8 text-muted-foreground">
        <p>هیچ داتایەک نییە بۆ پیشاندان</p>
      </div>
    );
  }

  return (
    <div className="h-[300px] w-full">
      <ResponsiveContainer width="100%" height="100%">
        <BarChart data={chartData} margin={{ top: 20, right: 10, left: 10, bottom: 5 }}>
          <CartesianGrid strokeDasharray="3 3" stroke="rgba(255,255,255,0.1)" />
          <XAxis 
            dataKey="day" 
            tick={{ fill: '#94a3b8', fontSize: 12 }}
            axisLine={{ stroke: 'rgba(255,255,255,0.1)' }}
          />
          <YAxis 
            tick={{ fill: '#94a3b8', fontSize: 12 }}
            axisLine={{ stroke: 'rgba(255,255,255,0.1)' }}
            tickFormatter={(value) => `£${value}`}
          />
          <Tooltip 
            contentStyle={{ 
              backgroundColor: 'hsl(222 47% 11%)', 
              border: '1px solid rgba(255,255,255,0.1)',
              borderRadius: '12px',
              color: '#fff'
            }}
            formatter={(value: number) => [`£${value.toFixed(2)}`, '']}
          />
          <Legend />
          <Bar dataKey="cash" name="کاش" fill="#10b981" radius={[4, 4, 0, 0]} />
          <Bar dataKey="card" name="کارت" fill="#3b82f6" radius={[4, 4, 0, 0]} />
        </BarChart>
      </ResponsiveContainer>
    </div>
  );
}

interface SalesByProductChartProps {
  salesData: Sale[];
  cigaretteData: Cigarette[];
}

export function SalesByProductChart({ salesData, cigaretteData }: SalesByProductChartProps) {
  const salesByProduct = cigaretteData.map(cig => {
    const cigSales = salesData.filter(s => s.cigaretteId === cig.id);
    const totalRevenue = cigSales.reduce((sum, s) => sum + s.totalSale, 0);
    return {
      name: cig.name,
      value: totalRevenue,
    };
  }).filter(s => s.value > 0);

  if (salesByProduct.length === 0) {
    return (
      <div className="text-center py-8 text-muted-foreground">
        <p>هیچ فرۆشتنێک نییە بۆ پیشاندان</p>
      </div>
    );
  }

  return (
    <div className="h-[300px] w-full">
      <ResponsiveContainer width="100%" height="100%">
        <PieChart>
          <Pie
            data={salesByProduct}
            cx="50%"
            cy="50%"
            innerRadius={60}
            outerRadius={100}
            paddingAngle={5}
            dataKey="value"
            label={({ name, percent }) => `${name} (${(percent * 100).toFixed(0)}%)`}
            labelLine={{ stroke: '#94a3b8' }}
          >
            {salesByProduct.map((_, index) => (
              <Cell key={`cell-${index}`} fill={COLORS[index % COLORS.length]} />
            ))}
          </Pie>
          <Tooltip 
            contentStyle={{ 
              backgroundColor: 'hsl(222 47% 11%)', 
              border: '1px solid rgba(255,255,255,0.1)',
              borderRadius: '12px',
              color: '#fff'
            }}
            formatter={(value: number) => [formatCurrency(value), 'فرۆشتن']}
          />
        </PieChart>
      </ResponsiveContainer>
    </div>
  );
}

interface ProfitChartProps {
  salesData: Sale[];
}

export function ProfitChart({ salesData }: ProfitChartProps) {
  // Group sales by day
  const dailyProfits: { [key: number]: number } = {};
  salesData.forEach(sale => {
    dailyProfits[sale.day] = (dailyProfits[sale.day] || 0) + sale.profit;
  });

  const chartData = Object.entries(dailyProfits)
    .map(([day, profit]) => ({
      day: `ڕۆژ ${day}`,
      profit,
    }))
    .sort((a, b) => parseInt(a.day.replace('ڕۆژ ', '')) - parseInt(b.day.replace('ڕۆژ ', '')));

  if (chartData.length === 0) {
    return (
      <div className="text-center py-8 text-muted-foreground">
        <p>هیچ قازانجێک نییە بۆ پیشاندان</p>
      </div>
    );
  }

  return (
    <div className="h-[300px] w-full">
      <ResponsiveContainer width="100%" height="100%">
        <AreaChart data={chartData} margin={{ top: 20, right: 10, left: 10, bottom: 5 }}>
          <defs>
            <linearGradient id="profitGradient" x1="0" y1="0" x2="0" y2="1">
              <stop offset="5%" stopColor="#10b981" stopOpacity={0.8}/>
              <stop offset="95%" stopColor="#10b981" stopOpacity={0.1}/>
            </linearGradient>
          </defs>
          <CartesianGrid strokeDasharray="3 3" stroke="rgba(255,255,255,0.1)" />
          <XAxis 
            dataKey="day" 
            tick={{ fill: '#94a3b8', fontSize: 12 }}
            axisLine={{ stroke: 'rgba(255,255,255,0.1)' }}
          />
          <YAxis 
            tick={{ fill: '#94a3b8', fontSize: 12 }}
            axisLine={{ stroke: 'rgba(255,255,255,0.1)' }}
            tickFormatter={(value) => `£${value}`}
          />
          <Tooltip 
            contentStyle={{ 
              backgroundColor: 'hsl(222 47% 11%)', 
              border: '1px solid rgba(255,255,255,0.1)',
              borderRadius: '12px',
              color: '#fff'
            }}
            formatter={(value: number) => [formatCurrency(value), 'قازانج']}
          />
          <Area 
            type="monotone" 
            dataKey="profit" 
            stroke="#10b981" 
            strokeWidth={3}
            fill="url(#profitGradient)" 
          />
        </AreaChart>
      </ResponsiveContainer>
    </div>
  );
}

interface IncomeExpenseComparisonProps {
  totalIncome: number;
  totalExpense: number;
  cigaretteProfit: number;
}

export function IncomeExpenseComparison({ totalIncome, totalExpense, cigaretteProfit }: IncomeExpenseComparisonProps) {
  const data = [
    { name: 'داهات', value: totalIncome, fill: '#10b981' },
    { name: 'خەرجی', value: totalExpense, fill: '#ef4444' },
    { name: 'قازانجی جگەرە', value: cigaretteProfit, fill: '#3b82f6' },
  ];

  return (
    <div className="h-[250px] w-full">
      <ResponsiveContainer width="100%" height="100%">
        <BarChart data={data} layout="vertical" margin={{ top: 20, right: 30, left: 60, bottom: 5 }}>
          <CartesianGrid strokeDasharray="3 3" stroke="rgba(255,255,255,0.1)" />
          <XAxis 
            type="number"
            tick={{ fill: '#94a3b8', fontSize: 12 }}
            axisLine={{ stroke: 'rgba(255,255,255,0.1)' }}
            tickFormatter={(value) => `£${value}`}
          />
          <YAxis 
            type="category"
            dataKey="name"
            tick={{ fill: '#94a3b8', fontSize: 12 }}
            axisLine={{ stroke: 'rgba(255,255,255,0.1)' }}
            width={60}
          />
          <Tooltip 
            contentStyle={{ 
              backgroundColor: 'hsl(222 47% 11%)', 
              border: '1px solid rgba(255,255,255,0.1)',
              borderRadius: '12px',
              color: '#fff'
            }}
            formatter={(value: number) => [formatCurrency(value), '']}
          />
          <Bar dataKey="value" radius={[0, 8, 8, 0]}>
            {data.map((entry, index) => (
              <Cell key={`cell-${index}`} fill={entry.fill} />
            ))}
          </Bar>
        </BarChart>
      </ResponsiveContainer>
    </div>
  );
}
