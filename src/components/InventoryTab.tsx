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
    <div className="fade-in space-y-6">
      {/* Summary Grid */}
      <div className="grid grid-cols-2 gap-3 md:gap-4">
        <SummaryCard title="جۆرەکان" value={summary.totalCigaretteTypes.toString()} variant="stock" icon="🚬" />
        <SummaryCard title="کۆی بۆکس" value={summary.totalBoxes.toString()} variant="stock" icon="📦" />
        <SummaryCard title="کۆی پاکەت" value={summary.totalPacks.toString()} variant="stock" icon="📋" />
        <SummaryCard title="بەهای کۆگا" value={formatCurrency(summary.totalStockValue)} variant="balance" icon="💎" />
      </div>

      {/* Action Buttons */}
      <div className="grid grid-cols-2 gap-3">
        <Button 
          onClick={() => { setEditingCigarette(null); setCigaretteModalOpen(true); }} 
          className="btn-gradient-accent py-4"
        >
          <Plus className="h-4 w-4 ml-2" />
          جۆری نوێ
        </Button>
        <Button 
          onClick={() => setStockModalOpen(true)} 
          className="btn-gradient-info py-4"
        >
          <Package className="h-4 w-4 ml-2" />
          زیادکردن
        </Button>
      </div>

      {/* Inventory List */}
      {cigaretteData.length === 0 ? (
        <div className="text-center py-12 text-muted-foreground">
          <div className="text-5xl mb-4">📦</div>
          <p>هیچ جگەرەیەک نییە</p>
        </div>
      ) : (
        <div className="grid gap-4 md:grid-cols-2">
          {cigaretteData.map((cig) => {
            const totalPacks = (cig.boxes * cig.packsPerBox) + (cig.extraPacks || 0);
            const totalValue = totalPacks * cig.packPrice;
            const status = getStatus(cig);

            return (
              <div key={cig.id} className="inventory-card">
                <div className="flex justify-between items-start mb-4">
                  <h4 className="text-lg font-bold text-foreground">{cig.name}</h4>
                  <span className={cn('status-badge', status.class)}>{status.text}</span>
                </div>

                <div className="grid grid-cols-2 md:grid-cols-4 gap-3 mb-4">
                  <div className="bg-background/30 p-3 rounded-xl text-center">
                    <div className="text-xs text-muted-foreground uppercase mb-1">بۆکس</div>
                    <div className="text-xl font-bold text-info">{cig.boxes}</div>
                  </div>
                  <div className="bg-background/30 p-3 rounded-xl text-center">
                    <div className="text-xs text-muted-foreground uppercase mb-1">پاکەت</div>
                    <div className="text-xl font-bold text-success">{totalPacks}</div>
                  </div>
                  <div className="bg-background/30 p-3 rounded-xl text-center">
                    <div className="text-xs text-muted-foreground uppercase mb-1">نرخ</div>
                    <div className="text-xl font-bold text-accent">£{cig.sellPrice}</div>
                  </div>
                  <div className="bg-background/30 p-3 rounded-xl text-center">
                    <div className="text-xs text-muted-foreground uppercase mb-1">بەها</div>
                    <div className="text-xl font-bold text-foreground">{formatCurrency(totalValue)}</div>
                  </div>
                </div>

                <div className="flex gap-2 pt-3 border-t border-border/30">
                  <Button
                    variant="secondary"
                    size="sm"
                    className="flex-1"
                    onClick={() => { setEditingStock(cig); setEditStockModalOpen(true); }}
                  >
                    <Settings className="h-4 w-4 ml-1" />
                    کۆگا
                  </Button>
                  <Button
                    variant="secondary"
                    size="sm"
                    className="flex-1"
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
                    className="text-destructive hover:bg-destructive/10"
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
