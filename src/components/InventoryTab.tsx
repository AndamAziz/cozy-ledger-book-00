import { useState } from 'react';
import { Button } from '@/components/ui/button';
import { SummaryCard } from './SummaryCard';
import { CigaretteModal } from './CigaretteModal';
import { AddStockModal } from './AddStockModal';
import { EditStockModal } from './EditStockModal';
import { Cigarette, UnitType } from '@/types/finance';
import { formatCurrency } from '@/lib/format';
import { Package, Plus, Pencil, Trash2, Settings, AlertTriangle, CheckCircle2, XCircle, Boxes, Hash, TrendingUp, Ruler, Scale, Droplets, Box } from 'lucide-react';
import { useToast } from '@/hooks/use-toast';
import { cn } from '@/lib/utils';
import { useLanguage } from '@/contexts/LanguageContext';

interface InventoryTabProps {
  cigaretteData: Cigarette[];
  summary: {
    totalCigaretteTypes: number;
    totalBoxes: number;
    totalPacks: number;
    totalStockValue: number;
  };
  onAddCigarette: (cigarette: Omit<Cigarette, 'id' | 'boxes' | 'extraPacks'>) => void;
  onUpdateCigarette: (id: string | number, cigarette: Partial<Cigarette>) => void;
  onDeleteCigarette: (id: string | number) => void;
  onAddStock: (id: string | number, boxes: number, extraPacks: number) => void;
  onUpdateStock: (id: string | number, boxes: number, extraPacks: number) => void;
}

export function InventoryTab({
  cigaretteData,
  summary,
  onAddCigarette,
  onUpdateCigarette,
  onDeleteCigarette,
  onAddStock,
  onUpdateStock,
}: InventoryTabProps) {
  const [cigaretteModalOpen, setCigaretteModalOpen] = useState(false);
  const [stockModalOpen, setStockModalOpen] = useState(false);
  const [editStockModalOpen, setEditStockModalOpen] = useState(false);
  const [editingCigarette, setEditingCigarette] = useState<Cigarette | null>(null);
  const [editingStock, setEditingStock] = useState<Cigarette | null>(null);
  const { toast } = useToast();
  const { t } = useLanguage();

  const handleCigaretteSubmit = (cigarette: Omit<Cigarette, 'id' | 'boxes' | 'extraPacks'>) => {
    if (editingCigarette) {
      onUpdateCigarette(editingCigarette.id, cigarette);
      toast({ title: t('success'), description: t('update') });
    } else {
      onAddCigarette(cigarette);
      toast({ title: t('success'), description: t('add') });
    }
    setEditingCigarette(null);
  };

  const handleAddStock = (cigaretteId: string | number, boxes: number, extraPacks: number) => {
    onAddStock(cigaretteId, boxes, extraPacks);
    const cig = cigaretteData.find(c => c.id === cigaretteId);
    const message = boxes > 0 && extraPacks > 0 
      ? `${boxes} ${t('boxes')} + ${extraPacks} ${t('units')} → ${cig?.name}`
      : boxes > 0 
        ? `${boxes} ${t('boxes')} → ${cig?.name}`
        : `${extraPacks} ${t('units')} → ${cig?.name}`;
    toast({ title: t('success'), description: message });
  };

  const handleEditStock = (id: string | number, boxes: number, extraPacks: number) => {
    onUpdateStock(id, boxes, extraPacks);
    toast({ title: t('success'), description: t('update') });
  };

  const getStatus = (cig: Cigarette) => {
    const totalPacks = (cig.boxes * cig.packsPerBox) + (cig.extraPacks || 0);
    if (totalPacks === 0) return { 
      text: t('outOfStock'), 
      variant: 'destructive' as const,
      icon: XCircle
    };
    if (totalPacks <= cig.alertLevel) return { 
      text: t('lowStock'), 
      variant: 'warning' as const,
      icon: AlertTriangle
    };
    return { 
      text: t('inStock'), 
      variant: 'success' as const,
      icon: CheckCircle2
    };
  };

  // Format number - always show the number including zero
  const formatNum = (num: number | undefined) => {
    if (num === undefined || num === null) return '0';
    return num.toLocaleString();
  };

  return (
    <div className="space-y-6">
      {/* Summary Grid */}
      <div className="grid grid-cols-2 gap-3 md:gap-4 animate-fade-in">
        <SummaryCard title={t('types')} value={summary.totalCigaretteTypes.toString()} variant="stock" icon="📦" />
        <SummaryCard title={t('totalBoxes')} value={formatNum(summary.totalBoxes)} variant="stock" icon="📋" />
        <SummaryCard title={t('totalUnits')} value={formatNum(summary.totalPacks)} variant="stock" icon="🔢" />
        <SummaryCard title={t('stockValue')} value={formatCurrency(summary.totalStockValue)} variant="balance" icon="💎" />
      </div>

      {/* Action Buttons */}
      <div className="grid grid-cols-2 gap-3 animate-fade-in" style={{ animationDelay: '100ms' }}>
        <Button 
          onClick={() => { setEditingCigarette(null); setCigaretteModalOpen(true); }} 
          className="btn-gradient-accent py-5 rounded-xl shadow-lg shadow-accent/20 hover:shadow-accent/40 hover:scale-[1.02] transition-all duration-300"
        >
          <Plus className="h-5 w-5 ltr:mr-2 rtl:ml-2" />
          {t('addNewProduct')}
        </Button>
        <Button 
          onClick={() => setStockModalOpen(true)} 
          className="btn-gradient-info py-5 rounded-xl shadow-lg shadow-info/20 hover:shadow-info/40 hover:scale-[1.02] transition-all duration-300"
        >
          <Package className="h-5 w-5 ltr:mr-2 rtl:ml-2" />
          {t('addStock')}
        </Button>
      </div>

      {/* Inventory List */}
      {cigaretteData.length === 0 ? (
        <div className="text-center py-16 text-muted-foreground animate-fade-in">
          <div className="w-24 h-24 rounded-2xl bg-secondary/50 flex items-center justify-center mx-auto mb-4">
            <Package className="w-12 h-12 text-muted-foreground/50" />
          </div>
          <p className="text-base font-medium mb-1">{t('noProductsYet')}</p>
          <p className="text-sm text-muted-foreground">{t('clickToAddProduct')}</p>
        </div>
      ) : (
        <div className="grid gap-4 md:grid-cols-2">
          {cigaretteData.map((cig, index) => {
            const totalUnits = (cig.boxes * cig.packsPerBox) + (cig.extraPacks || 0);
            const totalValue = totalUnits * cig.packPrice;
            const status = getStatus(cig);
            const StatusIcon = status.icon;

            return (
              <div 
                key={cig.id} 
                className="group relative overflow-hidden rounded-2xl border bg-card p-5 hover:shadow-xl transition-all duration-300 animate-fade-in"
                style={{ animationDelay: `${index * 50}ms` }}
              >
                {/* Status indicator bar */}
                <div className={cn(
                  'absolute top-0 left-0 right-0 h-1',
                  status.variant === 'success' && 'bg-success',
                  status.variant === 'warning' && 'bg-warning',
                  status.variant === 'destructive' && 'bg-destructive'
                )} />
                
                {/* Header */}
                <div className="flex justify-between items-start mb-4 pt-2">
                  <div className="flex items-center gap-3">
                    <div className={cn(
                      'w-11 h-11 rounded-xl flex items-center justify-center',
                      status.variant === 'success' && 'bg-success/10',
                      status.variant === 'warning' && 'bg-warning/10',
                      status.variant === 'destructive' && 'bg-destructive/10'
                    )}>
                      <Package className={cn(
                        'w-5 h-5',
                        status.variant === 'success' && 'text-success',
                        status.variant === 'warning' && 'text-warning',
                        status.variant === 'destructive' && 'text-destructive'
                      )} />
                    </div>
                    <div>
                      <h4 className="text-base font-bold text-foreground leading-tight">{cig.name}</h4>
                      <p className="text-xs text-muted-foreground mt-0.5 flex items-center gap-1">
                        <span>{cig.packsPerBox} {t('unitsPerBox')}</span>
                        <span className="text-muted-foreground/50">•</span>
                        <span>{t(`unitType${(cig.unitType || 'box').charAt(0).toUpperCase() + (cig.unitType || 'box').slice(1)}` as any)}</span>
                      </p>
                    </div>
                  </div>
                  <div className={cn(
                    'flex items-center gap-1.5 px-2.5 py-1 rounded-full text-xs font-semibold',
                    status.variant === 'success' && 'bg-success/10 text-success',
                    status.variant === 'warning' && 'bg-warning/10 text-warning',
                    status.variant === 'destructive' && 'bg-destructive/10 text-destructive'
                  )}>
                    <StatusIcon className="w-3.5 h-3.5" />
                    <span>{status.text}</span>
                  </div>
                </div>

                {/* Stats Grid */}
                <div className="grid grid-cols-2 gap-2 mb-4">
                  {/* Boxes */}
                  <div className="bg-secondary/30 rounded-xl p-3 text-center">
                    <div className="flex items-center justify-center gap-1.5 text-muted-foreground mb-1">
                      <Boxes className="w-3.5 h-3.5" />
                      <span className="text-[10px] uppercase font-medium">{t('boxes')}</span>
                    </div>
                    <div className={cn(
                      'text-xl font-bold',
                      cig.boxes === 0 ? 'text-muted-foreground/50' : 'text-info'
                    )}>
                      {formatNum(cig.boxes)}
                    </div>
                  </div>
                  
                  {/* Total Units */}
                  <div className="bg-secondary/30 rounded-xl p-3 text-center">
                    <div className="flex items-center justify-center gap-1.5 text-muted-foreground mb-1">
                      <Hash className="w-3.5 h-3.5" />
                      <span className="text-[10px] uppercase font-medium">{t('totalUnits')}</span>
                    </div>
                    <div className={cn(
                      'text-xl font-bold',
                      totalUnits === 0 ? 'text-muted-foreground/50' : 'text-success'
                    )}>
                      {formatNum(totalUnits)}
                    </div>
                  </div>
                  
                  {/* Sell Price */}
                  <div className="bg-secondary/30 rounded-xl p-3 text-center">
                    <div className="flex items-center justify-center gap-1.5 text-muted-foreground mb-1">
                      <TrendingUp className="w-3.5 h-3.5" />
                      <span className="text-[10px] uppercase font-medium">{t('sellPrice')}</span>
                    </div>
                    <div className="text-xl font-bold text-accent">
                      £{cig.sellPrice}
                    </div>
                  </div>
                  
                  {/* Total Value */}
                  <div className="bg-secondary/30 rounded-xl p-3 text-center">
                    <div className="flex items-center justify-center gap-1.5 text-muted-foreground mb-1">
                      <span className="text-[10px] uppercase font-medium">💰 {t('value')}</span>
                    </div>
                    <div className="text-xl font-bold text-foreground">
                      {formatCurrency(totalValue)}
                    </div>
                  </div>
                </div>

                {/* Extra Units indicator */}
                {(cig.extraPacks || 0) > 0 && (
                  <div className="mb-4 px-3 py-2 bg-info/5 border border-info/20 rounded-lg">
                    <p className="text-xs text-info">
                      <span className="font-medium">{t('looseUnits')}:</span> {cig.extraPacks} {t('units')}
                    </p>
                  </div>
                )}

                {/* Action Buttons */}
                <div className="flex gap-2 pt-3 border-t border-border/50">
                  <Button
                    variant="secondary"
                    size="sm"
                    className="flex-1 rounded-xl hover:bg-info/10 hover:text-info transition-colors"
                    onClick={() => { setEditingStock(cig); setEditStockModalOpen(true); }}
                  >
                    <Settings className="h-4 w-4 ltr:mr-1.5 rtl:ml-1.5" />
                    {t('stock')}
                  </Button>
                  <Button
                    variant="secondary"
                    size="sm"
                    className="flex-1 rounded-xl hover:bg-accent/10 hover:text-accent transition-colors"
                    onClick={() => { setEditingCigarette(cig); setCigaretteModalOpen(true); }}
                  >
                    <Pencil className="h-4 w-4 ltr:mr-1.5 rtl:ml-1.5" />
                    {t('edit')}
                  </Button>
                  <Button
                    variant="secondary"
                    size="sm"
                    onClick={() => {
                      if (confirm(t('confirmDelete'))) {
                        onDeleteCigarette(cig.id);
                        toast({ title: t('success'), description: t('delete') });
                      }
                    }}
                    className="rounded-xl hover:bg-destructive/10 hover:text-destructive transition-colors px-3"
                  >
                    <Trash2 className="h-4 w-4" />
                  </Button>
                </div>
              </div>
            );
          })}
        </div>
      )}

      {/* Modals */}
      <CigaretteModal
        isOpen={cigaretteModalOpen}
        onClose={() => { setCigaretteModalOpen(false); setEditingCigarette(null); }}
        onSubmit={handleCigaretteSubmit}
        editingCigarette={editingCigarette}
      />
      <AddStockModal
        isOpen={stockModalOpen}
        onClose={() => setStockModalOpen(false)}
        onSubmit={handleAddStock}
        cigarettes={cigaretteData}
      />
      <EditStockModal
        isOpen={editStockModalOpen}
        onClose={() => { setEditStockModalOpen(false); setEditingStock(null); }}
        onSubmit={handleEditStock}
        cigarette={editingStock}
      />
    </div>
  );
}
