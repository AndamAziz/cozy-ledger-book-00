export type Language = 'ku' | 'en';

export const translations = {
  ku: {
    // Header
    financialManagement: 'بەڕێوەبردنی داراییی',
    logout: 'خروج',
    
    // Tabs
    finance: 'داراییی',
    inventory: 'کۆگا',
    sales: 'فرۆشتن',
    reports: 'ڕاپۆرت',
    
    // Finance Tab
    cash: 'کاش',
    card: 'کارت',
    totalSales: 'کۆی فرۆشتن',
    totalExpense: 'کۆی مەسرەف',
    purchase: 'کڕین',
    cost: 'تێچوو',
    balance: 'پارەی ماوە',
    income: 'داهات',
    
    // Inventory Tab
    types: 'جۆرەکان',
    totalBoxes: 'کۆی بۆکس',
    totalPacks: 'کۆی دانە',
    totalUnits: 'کۆی یەکە',
    stockValue: 'بەهای کۆگا',
    unavailable: 'بەردەست نییە',
    low: 'کەمە',
    available: 'بەردەستە',
    addNewType: 'زیادکردنی جۆری نوێ',
    addStock: 'زیادکردنی کۆگا',
    editStock: 'دەستکاری کۆگا',
    numberOfBoxes: 'ژمارەی بۆکس',
    numberOfPacks: 'ژمارەی دانە',
    numberOfUnits: 'ژمارەی یەکە',
    separatePacks: 'ژمارەی دانە (جیا)',
    separateUnits: 'یەکەی جیا',
    update: 'نوێکردنەوە',
    add: 'زیادکردن',
    
    // Sales Tab
    todaySales: 'فرۆشتنی ئەمڕۆ',
    monthlySales: 'فرۆشتنی مانگانە',
    productProfit: 'قازانجی بەرهەم',
    cigaretteProfit: 'قازانجی بەرهەم',
    recordSale: 'تۆمارکردنی فرۆشتن',
    day: 'ڕۆژ',
    productType: 'جۆری بەرهەم',
    cigaretteType: 'جۆری بەرهەم',
    selectProduct: 'بەرهەم هەڵبژێرە...',
    selectCigarette: 'بەرهەم هەڵبژێرە...',
    packsCount: 'ژمارەی دانە',
    unitsCount: 'ژمارەی یەکە',
    packPrice: 'نرخی دانە',
    unitPrice: 'نرخی یەکە',
    total: 'کۆ',
    
    // Reports Tab
    netProfit: 'قازانجی نێت',
    totalIncome: 'کۆی داهات',
    downloadPDF: 'داگرتنی PDF',
    share: 'بەستەری',
    salesByProduct: 'فرۆشتن بەپێی بەرهەم',
    dailyIncome: 'داهاتی ڕۆژانە',
    profitTrend: 'ڕەوتی قازانج',
    incomeExpenseComparison: 'بەراوردی داهات و خەرجی',
    stockByBox: 'کۆگا بەپێی بۆکس',
    stockByPack: 'کۆگا بەپێی پاکەت',
    expensesSummary: 'کورتەی خەرجییەکان',
    
    // Modals
    addIncome: 'زیادکردنی داهات',
    editIncome: 'دەستکاری داهات',
    addExpense: 'زیادکردنی خەرجی',
    editExpense: 'دەستکاری خەرجی',
    addProduct: 'زیادکردنی بەرهەم',
    editProduct: 'دەستکاری بەرهەم',
    addCigarette: 'زیادکردنی بەرهەم',
    editCigarette: 'دەستکاری بەرهەم',
    name: 'ناو',
    boxPrice: 'نرخی بۆکس',
    packsPerBox: 'دانە لە بۆکسێک',
    unitsPerBox: 'یەکە لە بۆکسێک',
    sellPrice: 'نرخی فرۆشتن',
    alertLevel: 'ئاستی ئاگاداری',
    description: 'تێبینی',
    amount: 'بڕ',
    expenseType: 'جۆری خەرجی',
    product: 'بەرهەم',
    
    // Login
    login: 'چوونەژوورەوە',
    signup: 'تۆمارکردن',
    email: 'ئیمەیڵ',
    password: 'وشەی نهێنی',
    companyName: 'ناوی کۆمپانیا',
    loginWithGoogle: 'چوونەژوورەوە بە Google',
    enterEmail: 'ئیمەیڵ بنووسە',
    enterPassword: 'وشەی نهێنی',
    enterCompanyName: 'ناوی کۆمپانیا بنووسە',
    loggingIn: 'چاوەڕوان بە...',
    signingUp: 'چاوەڕوان بە...',
    
    // Splash Screen
    splashSubtitle: 'سیستەمی بەڕێوەبردنی دارایی و کۆگا',
    
    // Alerts
    lowStockAlert: 'ئاگادارکردنەوە - کۆگا کەمە!',
    only: 'تەنها',
    packs: 'دانە',
    units: 'یەکە',
    
    // Common
    delete: 'سڕینەوە',
    edit: 'دەستکاری',
    save: 'پاشەکەوتکردن',
    cancel: 'پاشگەزبوونەوە',
    confirm: 'دڵنیابوونەوە',
    success: 'سەرکەوتوو',
    error: 'هەڵە',
    warning: 'ئاگاداری',
    noData: 'هیچ داتایەک نییە',
    loading: 'چاوەڕوان بە...',
    
    // Month names
    january: 'کانوونی دووەم',
    february: 'شوبات',
    march: 'ئازار',
    april: 'نیسان',
    may: 'ئایار',
    june: 'حوزەیران',
    july: 'تەممووز',
    august: 'ئاب',
    september: 'ئەیلوول',
    october: 'تشرینی یەکەم',
    november: 'تشرینی دووەم',
    december: 'کانوونی یەکەم',
    
    // Admin
    adminPanel: 'پەنەڵی بەڕێوەبەری',
    users: 'بەکارهێنەران',
    pendingApproval: 'چاوەڕوانی ئەپروڤکردن',
    approved: 'ئەپروڤکراو',
    active: 'چالاک',
    inactive: 'ناچالاک',
    expired: 'بەسەرچوو',
    approve: 'ئەپروڤکردن',
    deactivate: 'ناچالاککردن',
    activate: 'چالاککردن',
    changeExpiry: 'گۆڕینی کات',
    searchPlaceholder: 'گەڕان بە ئیمەیڵ یان ناوی کۆمپانیا...',
    all: 'هەموو',
    
    // Expiry Warning
    expiryWarning: 'ڕۆژ ماوە بۆ بەسەرچوونی کاتی بەکارهێنان',
    expiryTomorrow: 'بەیانی کاتی بەکارهێنان بەسەردەچێت!',
    contactAdmin: 'تکایە پەیوەندی بە بەڕێوەبەرەوە بکە بۆ درێژکردنەوەی کاتی بەکارهێنانی ئەپەکە.',
    contact: 'پەیوەندی',
    
    // Pending/Deactivated/Expired
    accountPending: 'ئەکاونتەکەت چاوەڕوانی ئەپروڤکردنە',
    accountDeactivated: 'ئەکاونتەکەت ناچالاک کراوە',
    accountExpired: 'کاتی بەکارهێنانی ئەپروڤت بەسەرچووە',
    contactForApproval: 'پەیوەندی بکە بۆ خێراکردنی ئەپروڤ',
    contactForReactivation: 'پەیوەندی بکە بۆ چالاککردنەوە',
    contactForRenewal: 'پەیوەندی بکە بۆ نوێکردنەوە',
    
    // Days of week
    sunday: 'یەکشەممە',
    monday: 'دووشەممە',
    tuesday: 'سێشەممە',
    wednesday: 'چوارشەممە',
    thursday: 'پێنجشەممە',
    friday: 'هەینی',
    saturday: 'شەممە',
    
    // Day Picker
    today: 'ئەمڕۆ',
    firstDay: 'ڕۆژی ١',
    lastDay: 'ڕۆژی کۆتایی',
    
    // Quick actions Month Picker
    thisMonth: 'ئەم مانگە',
    previousMonth: 'مانگی پێشوو',
    
    // Confirmation
    confirmDelete: 'دڵنیایت لە سڕینەوە؟',
    
    // Stock
    boxes: 'بۆکس',
    pack: 'دانە',
    unit: 'یەکە',
    profit: 'قازانج',
  },
  en: {
    // Header
    financialManagement: 'Financial Management',
    logout: 'Logout',
    
    // Tabs
    finance: 'Finance',
    inventory: 'Inventory',
    sales: 'Sales',
    reports: 'Reports',
    
    // Finance Tab
    cash: 'Cash',
    card: 'Card',
    totalSales: 'Total Sales',
    totalExpense: 'Total Expense',
    purchase: 'Purchase',
    cost: 'Cost',
    balance: 'Balance',
    income: 'Income',
    
    // Inventory Tab
    types: 'Types',
    totalBoxes: 'Total Boxes',
    totalPacks: 'Total Units',
    totalUnits: 'Total Units',
    stockValue: 'Stock Value',
    unavailable: 'Unavailable',
    low: 'Low',
    available: 'Available',
    addNewType: 'Add New Type',
    addStock: 'Add Stock',
    editStock: 'Edit Stock',
    numberOfBoxes: 'Number of Boxes',
    numberOfPacks: 'Number of Units',
    numberOfUnits: 'Number of Units',
    separatePacks: 'Separate Units',
    separateUnits: 'Separate Units',
    update: 'Update',
    add: 'Add',
    
    // Sales Tab
    todaySales: "Today's Sales",
    monthlySales: 'Monthly Sales',
    productProfit: 'Product Profit',
    cigaretteProfit: 'Product Profit',
    recordSale: 'Record Sale',
    day: 'Day',
    productType: 'Product Type',
    cigaretteType: 'Product Type',
    selectProduct: 'Select product...',
    selectCigarette: 'Select product...',
    packsCount: 'Units Count',
    unitsCount: 'Units Count',
    packPrice: 'Unit Price',
    unitPrice: 'Unit Price',
    total: 'Total',
    
    // Reports Tab
    netProfit: 'Net Profit',
    totalIncome: 'Total Income',
    downloadPDF: 'Download PDF',
    share: 'Share',
    salesByProduct: 'Sales by Product',
    dailyIncome: 'Daily Income',
    profitTrend: 'Profit Trend',
    incomeExpenseComparison: 'Income vs Expense',
    stockByBox: 'Stock by Box',
    stockByPack: 'Stock by Pack',
    expensesSummary: 'Expenses Summary',
    
    // Modals
    addIncome: 'Add Income',
    editIncome: 'Edit Income',
    addExpense: 'Add Expense',
    editExpense: 'Edit Expense',
    addProduct: 'Add Product',
    editProduct: 'Edit Product',
    addCigarette: 'Add Product',
    editCigarette: 'Edit Product',
    name: 'Name',
    boxPrice: 'Box Price',
    packsPerBox: 'Units Per Box',
    unitsPerBox: 'Units Per Box',
    sellPrice: 'Sell Price',
    alertLevel: 'Alert Level',
    description: 'Description',
    amount: 'Amount',
    expenseType: 'Expense Type',
    product: 'Product',
    
    // Login
    login: 'Login',
    signup: 'Sign Up',
    email: 'Email',
    password: 'Password',
    companyName: 'Company Name',
    loginWithGoogle: 'Sign in with Google',
    enterEmail: 'Enter your email',
    enterPassword: 'Enter your password',
    enterCompanyName: 'Enter company name',
    loggingIn: 'Logging in...',
    signingUp: 'Signing up...',
    
    // Splash Screen
    splashSubtitle: 'Finance and Inventory Management System',
    
    // Alerts
    lowStockAlert: 'Alert - Low Stock!',
    only: 'Only',
    packs: 'units',
    units: 'units',
    
    // Common
    delete: 'Delete',
    edit: 'Edit',
    save: 'Save',
    cancel: 'Cancel',
    confirm: 'Confirm',
    success: 'Success',
    error: 'Error',
    warning: 'Warning',
    noData: 'No data available',
    loading: 'Loading...',
    
    // Month names
    january: 'January',
    february: 'February',
    march: 'March',
    april: 'April',
    may: 'May',
    june: 'June',
    july: 'July',
    august: 'August',
    september: 'September',
    october: 'October',
    november: 'November',
    december: 'December',
    
    // Admin
    adminPanel: 'Admin Panel',
    users: 'Users',
    pendingApproval: 'Pending Approval',
    approved: 'Approved',
    active: 'Active',
    inactive: 'Inactive',
    expired: 'Expired',
    approve: 'Approve',
    deactivate: 'Deactivate',
    activate: 'Activate',
    changeExpiry: 'Change Expiry',
    searchPlaceholder: 'Search by email or company name...',
    all: 'All',
    
    // Expiry Warning
    expiryWarning: 'days until subscription expires',
    expiryTomorrow: 'Subscription expires tomorrow!',
    contactAdmin: 'Please contact the administrator to extend your subscription.',
    contact: 'Contact',
    
    // Pending/Deactivated/Expired
    accountPending: 'Your account is pending approval',
    accountDeactivated: 'Your account has been deactivated',
    accountExpired: 'Your subscription has expired',
    contactForApproval: 'Contact for faster approval',
    contactForReactivation: 'Contact to reactivate',
    contactForRenewal: 'Contact to renew',
    
    // Days of week
    sunday: 'Sunday',
    monday: 'Monday',
    tuesday: 'Tuesday',
    wednesday: 'Wednesday',
    thursday: 'Thursday',
    friday: 'Friday',
    saturday: 'Saturday',
    
    // Day Picker
    today: 'Today',
    firstDay: 'Day 1',
    lastDay: 'Last Day',
    
    // Quick actions Month Picker
    thisMonth: 'This Month',
    previousMonth: 'Previous Month',
    
    // Confirmation
    confirmDelete: 'Are you sure you want to delete?',
    
    // Stock
    boxes: 'boxes',
    pack: 'unit',
    unit: 'unit',
    profit: 'Profit',
  },
} as const;

export type TranslationKey = keyof typeof translations.ku;
