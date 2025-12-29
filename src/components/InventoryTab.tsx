import { useState } from 'react';
import { Button } from '@/components/ui/button';
import { SummaryCard } from './SummaryCard';
import { CigaretteModal } from './CigaretteModal';
import { AddStockModal } from './AddStockModal';
import { EditStockModal } from './EditStockModal';
import { Cigarette } from '@/types/finance';
import { formatCurrency } from '@/lib/format';
import { Package, Plus, Pencil, Trash2, Settings } from 'lucide-react';
import { useToast } from '@/hooks/use-toast';
import { cn } from '@/lib/utils';

interface InventoryTabProps {
  cigaretteData: Cigarette[];
  summary: {
    totalCigaretteTypes: number;
    totalBoxes: number;
    totalPacks: number;
    totalStockValue: number;
  };
  onAddCigarette: (cigarette: Omit<Cigarette, 'id' | 'boxes' | 'extraPacks'>) => void;
  onUpdateCigarette: (id: number, cigarette: Partial<Cigarette>) => void;
  onDeleteCigarette: (id: number) => void;
  onAddStock: (id: number, boxes: number) => void;
  onUpdateStock: (id: number, boxes: number, extraPacks: number) => void;
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

  const handleCigaretteSubmit = (cigarette: Omit<Cigarette, 'id' | 'boxes' | 'extraPacks'>) => {
    if (editingCigarette) {
      onUpdateCigarette(editingCigarette.id, cigarette);
      toast({ title: 'سەرکەوتوو', description: 'جگەرە نوێکرایەوە' });
    } else {
      onAddCigarette(cigarette);
      toast({ title: 'سەرکەوتوو', description: 'جگەرەی نوێ زیادکرا' });
    }
    setEditingCigarette(null);
  };

  const handleAddStock = (cigaretteId: number, boxes: number) => {
    onAddStock(cigaretteId, boxes);
    const cig = cigaretteData.find(c => c.id === cigaretteId);
    toast({ title: 'سەرکەوتوو', description: `${boxes} بۆکس زیادکرا بۆ ${cig?.name}` });
  };

  const handleEditStock = (id: number, boxes: number, extraPacks: number) => {
    onUpdateStock(id, boxes, extraPacks);
    toast({ title: 'سەرکەوتوو', description: 'کۆگا نوێکرایەوە' });
  };

  const getStatus = (cig: Cigarette) => {
    const totalPacks = (cig.boxes * cig.packsPerBox) + (cig.extraPacks || 0);
    if (totalPacks === 0) return { text: 'بەردەست نییە', class: 'status-unavailable' };
    if (totalPacks <= cig.alertLevel) return { text: 'کەمە', class: 'status-low' };
    return { text: 'بەردەستە', class: 'status-available' };
  };

  return (
    <div className="space-y-6">
      {/* Summary Grid */}
      <div className="grid grid-cols-2 gap-3 md:gap-4 animate-fade-in">
        <SummaryCard title="جۆرەکان" value={summary.totalCigaretteTypes.toString()} variant="stock" icon="🚬" />
        <SummaryCard title="کۆی بۆکس" value={summary.totalBoxes.toString()} variant="stock" icon="📦" />
        <SummaryCard title="کۆی پاکەت" value={summary.totalPacks.toString()} variant="stock" icon="📋" />
        <SummaryCard title="بەهای کۆگا" value={formatCurrency(summary.totalStockValue)} variant="balance" icon="💎" />
      </div>

      {/* Action Buttons */}
      <div className="grid grid-cols-2 gap-3 animate-fade-in" style={{ animationDelay: '100ms' }}>
        <Button 
          onClick={() => { setEditingCigarette(null); setCigaretteModalOpen(true); }} 
          className="btn-gradient-accent py-5 rounded-xl shadow-lg shadow-accent/20 hover:shadow-accent/40 hover:scale-[1.02] transition-all duration-300"
        >
          <Plus className="h-5 w-5 ml-2" />
          جۆری نوێ
        </Button>
        <Button 
          onClick={() => setStockModalOpen(true)} 
          className="btn-gradient-info py-5 rounded-xl shadow-lg shadow-info/20 hover:shadow-info/40 hover:scale-[1.02] transition-all duration-300"
        >
          <Package className="h-5 w-5 ml-2" />
          زیادکردن
        </Button>
      </div>

      {/* Inventory List */}
      {cigaretteData.length === 0 ? (
        <div className="text-center py-16 text-muted-foreground animate-fade-in">
          <div className="w-24 h-24 rounded-2xl bg-secondary/50 flex items-center justify-center mx-auto mb-4">
            <span className="text-5xl opacity-50">📦</span>
          </div>
          <p className="text-sm">هیچ جگەرەیەک نییە</p>
        </div>
      ) : (
        <div className="grid gap-4 md:grid-cols-2">
          {cigaretteData.map((cig, index) => {
            const totalPacks = (cig.boxes * cig.packsPerBox) + (cig.extraPacks || 0);
            const totalValue = totalPacks * cig.packPrice;
            const status = getStatus(cig);

            return (
              <div 
                key={cig.id} 
                className="group relative overflow-hidden rounded-2xl border border-info/20 bg-gradient-to-br from-info/10 via-transparent to-transparent p-5 hover:border-info/40 hover:shadow-xl hover:shadow-info/10 transition-all duration-300 animate-fade-in"
                style={{ animationDelay: `${index * 100}ms` }}
              >
                {/* Background glow */}
                <div className="absolute -top-12 -right-12 w-32 h-32 rounded-full bg-info/10 blur-3xl opacity-0 group-hover:opacity-100 transition-opacity" />
                
                <div className="relative">
                  <div className="flex justify-between items-start mb-5">
                    <div className="flex items-center gap-3">
                      <div className="w-12 h-12 rounded-xl bg-gradient-to-br from-info/20 to-info/5 flex items-center justify-center">
                        <span className="text-2xl">🚬</span>
                      </div>
                      <h4 className="text-lg font-bold text-foreground">{cig.name}</h4>
                    </div>
                    <span className={cn(
                      'px-3 py-1.5 rounded-full text-xs font-bold',
                      status.class === 'status-available' && 'bg-success/20 text-success border border-success/30',
                      status.class === 'status-low' && 'bg-warning/20 text-warning border border-warning/30',
                      status.class === 'status-unavailable' && 'bg-destructive/20 text-destructive border border-destructive/30'
                    )}>
                      {status.text}
                    </span>
                  </div>

                  <div className="grid grid-cols-4 gap-2 mb-5">
                    <div className="bg-background/40 backdrop-blur-sm p-3 rounded-xl text-center border border-border/30">
                      <div className="text-[10px] text-muted-foreground uppercase mb-1">بۆکس</div>
                      <div className="text-lg font-bold text-info">{cig.boxes}</div>
                    </div>
                    <div className="bg-background/40 backdrop-blur-sm p-3 rounded-xl text-center border border-border/30">
                      <div className="text-[10px] text-muted-foreground uppercase mb-1">پاکەت</div>
                      <div className="text-lg font-bold text-success">{totalPacks}</div>
                    </div>
                    <div className="bg-background/40 backdrop-blur-sm p-3 rounded-xl text-center border border-border/30">
                      <div className="text-[10px] text-muted-foreground uppercase mb-1">نرخ</div>
                      <div className="text-lg font-bold text-accent">£{cig.sellPrice}</div>
                    </div>
                    <div className="bg-background/40 backdrop-blur-sm p-3 rounded-xl text-center border border-border/30">
                      <div className="text-[10px] text-muted-foreground uppercase mb-1">بەها</div>
                      <div className="text-lg font-bold text-foreground">{formatCurrency(totalValue)}</div>
                    </div>
                  </div>

                  <div className="flex gap-2 pt-4 border-t border-border/30">
                    <Button
                      variant="secondary"
                      size="sm"
                      className="flex-1 rounded-xl hover:bg-info/10 hover:text-info transition-colors"
                      onClick={() => { setEditingStock(cig); setEditStockModalOpen(true); }}
                    >
                      <Settings className="h-4 w-4 ml-1" />
                      کۆگا
                    </Button>
                    <Button
                      variant="secondary"
                      size="sm"
                      className="flex-1 rounded-xl hover:bg-accent/10 hover:text-accent transition-colors"
                      onClick={() => { setEditingCigarette(cig); setCigaretteModalOpen(true); }}
                    >
                      <Pencil className="h-4 w-4 ml-1" />
                      دەستکاری
                    </Button>
                    <Button
                      variant="secondary"
                      size="sm"
                      onClick={() => {
                        if (confirm('دڵنیایت؟')) {
                          onDeleteCigarette(cig.id);
                          toast({ title: 'سەرکەوتوو', description: 'جگەرە سڕایەوە' });
                        }
                      }}
                      className="rounded-xl hover:bg-destructive/10 hover:text-destructive transition-colors"
                    >
                      <Trash2 className="h-4 w-4" />
                    </Button>
                  </div>
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
