import { useState } from 'react';
import {
  Dialog,
  DialogContent,
  DialogHeader,
  DialogTitle,
  DialogTrigger,
} from '@/components/ui/dialog';
import {
  Accordion,
  AccordionContent,
  AccordionItem,
  AccordionTrigger,
} from '@/components/ui/accordion';
import { HelpCircle, Wallet, BarChart3, ShoppingCart, Package, Coins } from 'lucide-react';
import { useLanguage } from '@/contexts/LanguageContext';
import { Language } from '@/lib/translations';

interface GuideSection {
  id: string;
  icon: typeof Wallet;
  title: string;
  body: string;
  steps?: string[];
}

interface GuideContent {
  title: string;
  subtitle: string;
  tabLabel: string;
  sections: GuideSection[];
}

const ICONS = {
  income: Coins,
  reports: BarChart3,
  sales: ShoppingCart,
  inventory: Package,
  finance: Wallet,
} as const;

const GUIDE: Record<Language, GuideContent> = {
  en: {
    title: 'Help & Guide',
    subtitle: 'How to use each section of the app',
    tabLabel: 'Help',
    sections: [
      {
        id: 'income',
        icon: ICONS.income,
        title: '1. Income',
        body: "Records money coming in. It's automatically added to Daily Income and reflected in Total Income.",
        steps: [
          'Tap "+ Income" in the Finance tab',
          'Enter the amount',
          'Select Cash or Card',
          '(Optional) Add a note',
          'Tap Save',
        ],
      },
      {
        id: 'reports',
        icon: ICONS.reports,
        title: '2. Reports',
        body: 'Generates a monthly summary — Total Expense, Total Income, Stock Value, and Net Profit — with an Income vs Expense chart. Can be downloaded as PDF or shared.',
      },
      {
        id: 'sales',
        icon: ICONS.sales,
        title: '3. Sales',
        body: 'Used to record product/service sales. Every sale is automatically counted as Income and reflected in overall totals.',
      },
      {
        id: 'inventory',
        icon: ICONS.inventory,
        title: '4. Inventory',
        body: 'Used to manage stock — track remaining items, low-stock alerts, and restocking needs.',
      },
      {
        id: 'finance',
        icon: ICONS.finance,
        title: '5. Finance',
        body: 'The main financial overview — Card balance, Cash balance, Total Expense, Total Sales, and overall Balance. The Cost, Purchase, and Income buttons here are used to add new financial entries.',
      },
    ],
  },
  ku: {
    title: 'یارمەتی و ڕێنمایی',
    subtitle: 'چۆنیەتی بەکارهێنانی هەر بەشێک',
    tabLabel: 'یارمەتی',
    sections: [
      {
        id: 'income',
        icon: ICONS.income,
        title: '١. داهات',
        body: 'پارەی هاتوو تۆمار دەکات. بەشێوەی خۆکار زیاد دەکرێت بۆ داهاتی ڕۆژانە و لە کۆی داهاتدا دەردەکەوێت.',
        steps: [
          'لە تابی داراییدا کلیک لە "+ داهات" بکە',
          'بڕەکە بنووسە',
          'کاش یان کارت هەڵبژێرە',
          '(ئارەزوومەندانە) تێبینییەک زیاد بکە',
          'کلیک لە پاشەکەوت بکە',
        ],
      },
      {
        id: 'reports',
        icon: ICONS.reports,
        title: '٢. ڕاپۆرت',
        body: 'پوختەی مانگانە دروست دەکات — کۆی مەسرەف، کۆی داهات، بەهای کۆگا و قازانجی ساف — لەگەڵ هێڵکاری داهات بەرامبەر مەسرەف. دەتوانرێت وەک PDF دابگیرێت یان هاوبەش بکرێت.',
      },
      {
        id: 'sales',
        icon: ICONS.sales,
        title: '٣. فرۆشتن',
        body: 'بۆ تۆمارکردنی فرۆشتنی بەرهەم/خزمەتگوزاری بەکاردێت. هەر فرۆشتنێک بەشێوەی خۆکار وەک داهات ژمێردراوە و لە کۆی گشتیدا دەردەکەوێت.',
      },
      {
        id: 'inventory',
        icon: ICONS.inventory,
        title: '٤. کۆگا',
        body: 'بۆ بەڕێوەبردنی کۆگا بەکاردێت — شوێنکەوتنی شتی ماوە، ئاگادارکردنەوەی کەمی کۆگا و پێداویستی پڕکردنەوە.',
      },
      {
        id: 'finance',
        icon: ICONS.finance,
        title: '٥. داراییی',
        body: 'سەرنجی سەرەکی دارایی — باڵانسی کارت، باڵانسی کاش، کۆی مەسرەف، کۆی فرۆشتن و باڵانسی گشتی. دوگمەکانی تێچوو، کڕین و داهات لێرە بۆ زیادکردنی تۆماری نوێی دارایی بەکاردێن.',
      },
    ],
  },
  ar: {
    title: 'المساعدة والدليل',
    subtitle: 'كيفية استخدام كل قسم من التطبيق',
    tabLabel: 'مساعدة',
    sections: [
      {
        id: 'income',
        icon: ICONS.income,
        title: '١. الدخل',
        body: 'يسجّل الأموال الواردة. يُضاف تلقائياً إلى الدخل اليومي ويظهر في إجمالي الدخل.',
        steps: [
          'اضغط على "+ دخل" في تبويب المالية',
          'أدخل المبلغ',
          'اختر نقداً أو بطاقة',
          '(اختياري) أضف ملاحظة',
          'اضغط حفظ',
        ],
      },
      {
        id: 'reports',
        icon: ICONS.reports,
        title: '٢. التقارير',
        body: 'تنشئ ملخصاً شهرياً — إجمالي المصروفات، إجمالي الدخل، قيمة المخزون وصافي الربح — مع رسم بياني للدخل مقابل المصروفات. يمكن تنزيله كملف PDF أو مشاركته.',
      },
      {
        id: 'sales',
        icon: ICONS.sales,
        title: '٣. المبيعات',
        body: 'تُستخدم لتسجيل مبيعات المنتجات/الخدمات. تُحتسب كل عملية بيع تلقائياً كدخل وتظهر في الإجماليات العامة.',
      },
      {
        id: 'inventory',
        icon: ICONS.inventory,
        title: '٤. المخزون',
        body: 'يُستخدم لإدارة المخزون — تتبّع العناصر المتبقية، تنبيهات نقص المخزون واحتياجات إعادة التزويد.',
      },
      {
        id: 'finance',
        icon: ICONS.finance,
        title: '٥. المالية',
        body: 'النظرة المالية العامة — رصيد البطاقة، رصيد النقد، إجمالي المصروفات، إجمالي المبيعات والرصيد الكلي. تُستخدم أزرار التكلفة والشراء والدخل هنا لإضافة قيود مالية جديدة.',
      },
    ],
  },
  fa: {
    title: 'راهنما و کمک',
    subtitle: 'نحوه استفاده از هر بخش برنامه',
    tabLabel: 'راهنما',
    sections: [
      {
        id: 'income',
        icon: ICONS.income,
        title: '۱. درآمد',
        body: 'پول ورودی را ثبت می‌کند. به‌طور خودکار به درآمد روزانه افزوده شده و در مجموع درآمد نمایش داده می‌شود.',
        steps: [
          'در تب مالی روی "+ درآمد" بزنید',
          'مبلغ را وارد کنید',
          'نقدی یا کارت را انتخاب کنید',
          '(اختیاری) یادداشت اضافه کنید',
          'روی ذخیره بزنید',
        ],
      },
      {
        id: 'reports',
        icon: ICONS.reports,
        title: '۲. گزارش‌ها',
        body: 'یک خلاصه ماهانه ایجاد می‌کند — مجموع هزینه، مجموع درآمد، ارزش موجودی و سود خالص — همراه با نمودار درآمد در برابر هزینه. می‌توان آن را به‌صورت PDF دانلود یا به اشتراک گذاشت.',
      },
      {
        id: 'sales',
        icon: ICONS.sales,
        title: '۳. فروش',
        body: 'برای ثبت فروش محصول/خدمات استفاده می‌شود. هر فروش به‌طور خودکار به‌عنوان درآمد محاسبه شده و در مجموع کل نمایش داده می‌شود.',
      },
      {
        id: 'inventory',
        icon: ICONS.inventory,
        title: '۴. موجودی',
        body: 'برای مدیریت موجودی استفاده می‌شود — پیگیری اقلام باقی‌مانده، هشدارهای کمبود موجودی و نیاز به تأمین مجدد.',
      },
      {
        id: 'finance',
        icon: ICONS.finance,
        title: '۵. مالی',
        body: 'نمای کلی مالی — موجودی کارت، موجودی نقد، مجموع هزینه، مجموع فروش و موجودی کل. دکمه‌های هزینه، خرید و درآمد در اینجا برای افزودن ثبت‌های مالی جدید استفاده می‌شوند.',
      },
    ],
  },
  tr: {
    title: 'Yardım ve Kılavuz',
    subtitle: 'Uygulamanın her bölümünün nasıl kullanılacağı',
    tabLabel: 'Yardım',
    sections: [
      {
        id: 'income',
        icon: ICONS.income,
        title: '1. Gelir',
        body: 'Gelen parayı kaydeder. Otomatik olarak Günlük Gelire eklenir ve Toplam Gelirde gösterilir.',
        steps: [
          'Finans sekmesinde "+ Gelir"e dokunun',
          'Tutarı girin',
          'Nakit veya Kart seçin',
          '(İsteğe bağlı) Not ekleyin',
          'Kaydet\'e dokunun',
        ],
      },
      {
        id: 'reports',
        icon: ICONS.reports,
        title: '2. Raporlar',
        body: 'Aylık bir özet oluşturur — Toplam Gider, Toplam Gelir, Stok Değeri ve Net Kâr — Gelir-Gider grafiğiyle birlikte. PDF olarak indirilebilir veya paylaşılabilir.',
      },
      {
        id: 'sales',
        icon: ICONS.sales,
        title: '3. Satışlar',
        body: 'Ürün/hizmet satışlarını kaydetmek için kullanılır. Her satış otomatik olarak Gelir sayılır ve genel toplamlara yansır.',
      },
      {
        id: 'inventory',
        icon: ICONS.inventory,
        title: '4. Envanter',
        body: 'Stok yönetimi için kullanılır — kalan ürünleri, düşük stok uyarılarını ve yeniden stoklama ihtiyaçlarını takip eder.',
      },
      {
        id: 'finance',
        icon: ICONS.finance,
        title: '5. Finans',
        body: 'Ana finansal genel bakış — Kart bakiyesi, Nakit bakiyesi, Toplam Gider, Toplam Satış ve genel Bakiye. Buradaki Maliyet, Alış ve Gelir düğmeleri yeni finansal kayıtlar eklemek için kullanılır.',
      },
    ],
  },
};

export function HelpGuide() {
  const { language, dir } = useLanguage();
  const [open, setOpen] = useState(false);
  const guide = GUIDE[language] ?? GUIDE.en;

  return (
    <Dialog open={open} onOpenChange={setOpen}>
      <DialogTrigger asChild>
        <button
          type="button"
          aria-label={guide.title}
          title={guide.title}
          className="group relative p-2 sm:p-2.5 md:p-3.5 rounded-xl sm:rounded-2xl font-semibold transition-all duration-200 flex flex-col items-center gap-1 sm:gap-1.5 md:gap-2 border overflow-hidden active:scale-95 touch-manipulation bg-gradient-to-br from-gold/20 via-gold/10 to-transparent border-gold/30 hover:border-gold/50 hover:from-gold/30 hover:via-gold/15"
        >
          <div className="relative z-10 w-8 h-8 sm:w-9 sm:h-9 md:w-12 md:h-12 rounded-lg sm:rounded-xl flex items-center justify-center transition-all duration-200 bg-gradient-to-br from-gold to-amber-400 text-white shadow-md shadow-gold/40">
            <HelpCircle className="h-3.5 w-3.5 sm:h-4 sm:w-4 md:h-5 md:w-5" />
          </div>
          <span className="relative z-10 text-[9px] sm:text-[10px] md:text-xs font-bold text-gold truncate max-w-full">
            {guide.tabLabel}
          </span>
        </button>
      </DialogTrigger>
      <DialogContent dir={dir} className="max-w-lg max-h-[85vh] overflow-y-auto bg-card border-gold/20">
        <DialogHeader className="text-start">
          <DialogTitle className="flex items-center gap-2 text-gold">
            <HelpCircle className="h-5 w-5" />
            {guide.title}
          </DialogTitle>
          <p className="text-sm text-muted-foreground">{guide.subtitle}</p>
        </DialogHeader>

        <Accordion type="single" collapsible className="w-full">
          {guide.sections.map((section) => {
            const Icon = section.icon;
            return (
              <AccordionItem key={section.id} value={section.id} className="border-border/50">
                <AccordionTrigger className="text-start hover:no-underline gap-3">
                  <span className="flex items-center gap-3">
                    <span className="flex-shrink-0 w-8 h-8 rounded-lg bg-gradient-to-br from-primary/20 to-transparent border border-primary/30 flex items-center justify-center text-primary">
                      <Icon className="h-4 w-4" />
                    </span>
                    <span className="font-semibold text-foreground">{section.title}</span>
                  </span>
                </AccordionTrigger>
                <AccordionContent>
                  <div className="ps-11 space-y-3">
                    <p className="text-sm text-muted-foreground leading-relaxed">{section.body}</p>
                    {section.steps && (
                      <ol className="space-y-1.5">
                        {section.steps.map((step, i) => (
                          <li key={i} className="flex items-start gap-2 text-sm text-foreground">
                            <span className="flex-shrink-0 mt-0.5 w-5 h-5 rounded-full bg-primary/15 text-primary text-xs font-bold flex items-center justify-center">
                              {i + 1}
                            </span>
                            <span className="leading-relaxed">{step}</span>
                          </li>
                        ))}
                      </ol>
                    )}
                  </div>
                </AccordionContent>
              </AccordionItem>
            );
          })}
        </Accordion>
      </DialogContent>
    </Dialog>
  );
}
