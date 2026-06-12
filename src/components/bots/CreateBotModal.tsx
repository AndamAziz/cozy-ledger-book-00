import { useState } from "react";
import { Dialog, DialogContent, DialogHeader, DialogTitle } from "@/components/ui/dialog";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import {
  Select, SelectContent, SelectGroup, SelectItem, SelectLabel, SelectTrigger, SelectValue,
} from "@/components/ui/select";
import { ASSET_GROUPS, TIMEFRAMES, STRATEGIES, getAsset } from "@/lib/botAssets";
import { supabase } from "@/integrations/supabase/client";
import { toast } from "@/hooks/use-toast";
import { cn } from "@/lib/utils";

interface CreateBotModalProps {
  open: boolean;
  onClose: () => void;
  onCreated: () => void;
}

export function CreateBotModal({ open, onClose, onCreated }: CreateBotModalProps) {
  const [name, setName] = useState("Gold Scalper");
  const [symbol, setSymbol] = useState("XAU/USD");
  const [timeframe, setTimeframe] = useState("5m");
  const [amount, setAmount] = useState("100");
  const [sl, setSl] = useState("0.3");
  const [tp, setTp] = useState("0.6");
  const [strategy, setStrategy] = useState<"conservative" | "balanced" | "aggressive">("balanced");
  const [saving, setSaving] = useState(false);

  const strategyHint = STRATEGIES.find((s) => s.value === strategy)?.hint;

  const handleCreate = async () => {
    const amt = parseFloat(amount);
    const slPct = parseFloat(sl);
    const tpPct = parseFloat(tp);
    if (!name.trim()) return toast({ title: "Enter a bot name", variant: "destructive" });
    if (!(amt > 0)) return toast({ title: "Enter a valid amount", variant: "destructive" });
    if (!(slPct > 0) || !(tpPct > 0)) return toast({ title: "Enter valid SL / TP %", variant: "destructive" });

    setSaving(true);
    const { data: { user } } = await supabase.auth.getUser();
    if (!user) { setSaving(false); return toast({ title: "Please sign in", variant: "destructive" }); }

    const { error } = await supabase.from("bots").insert({
      user_id: user.id,
      name: name.trim(),
      symbol,
      asset_class: getAsset(symbol).assetClass,
      timeframe,
      amount: amt,
      sl_pct: slPct,
      tp_pct: tpPct,
      strategy,
      status: "idle",
    });
    setSaving(false);
    if (error) return toast({ title: "Could not create bot", description: error.message, variant: "destructive" });
    toast({ title: "Bot created 🤖" });
    onCreated();
    onClose();
  };

  return (
    <Dialog open={open} onOpenChange={(o) => !o && onClose()}>
      <DialogContent className="max-w-md max-h-[90dvh] overflow-y-auto">
        <DialogHeader>
          <DialogTitle>Create Bot</DialogTitle>
        </DialogHeader>

        <div className="space-y-4">
          <div>
            <Label htmlFor="bot-name">Bot name</Label>
            <Input id="bot-name" value={name} onChange={(e) => setName(e.target.value)} className="mt-1" />
          </div>

          <div>
            <Label>Asset</Label>
            <Select value={symbol} onValueChange={setSymbol}>
              <SelectTrigger className="mt-1">
                <SelectValue />
              </SelectTrigger>
              <SelectContent>
                {ASSET_GROUPS.map((g) => (
                  <SelectGroup key={g.label}>
                    <SelectLabel>{g.label}</SelectLabel>
                    {g.assets.map((a) => (
                      <SelectItem key={a.symbol} value={a.symbol}>
                        <span className="mr-1.5">{a.emoji}</span>
                        {a.name} <span className="text-muted-foreground">({a.symbol})</span>
                      </SelectItem>
                    ))}
                  </SelectGroup>
                ))}
              </SelectContent>
            </Select>
          </div>

          <div>
            <Label>Timeframe</Label>
            <div className="mt-1 grid grid-cols-6 gap-1.5">
              {TIMEFRAMES.map((tf) => (
                <button
                  key={tf}
                  onClick={() => setTimeframe(tf)}
                  className={cn(
                    "rounded-lg border py-2 text-sm font-medium transition-colors",
                    timeframe === tf
                      ? "border-gold bg-gold text-gold-foreground"
                      : "border-border bg-card text-foreground hover:bg-secondary",
                  )}
                >
                  {tf}
                </button>
              ))}
            </div>
          </div>

          <div className="grid grid-cols-3 gap-2">
            <div>
              <Label htmlFor="amt">Amount $</Label>
              <Input id="amt" inputMode="decimal" value={amount} onChange={(e) => setAmount(e.target.value)} className="mt-1" />
            </div>
            <div>
              <Label htmlFor="sl">SL %</Label>
              <Input id="sl" inputMode="decimal" value={sl} onChange={(e) => setSl(e.target.value)} className="mt-1" />
            </div>
            <div>
              <Label htmlFor="tp">TP %</Label>
              <Input id="tp" inputMode="decimal" value={tp} onChange={(e) => setTp(e.target.value)} className="mt-1" />
            </div>
          </div>

          <div>
            <Label>Strategy</Label>
            <div className="mt-1 grid grid-cols-3 gap-1.5">
              {STRATEGIES.map((s) => (
                <button
                  key={s.value}
                  onClick={() => setStrategy(s.value)}
                  className={cn(
                    "rounded-lg border py-2 text-sm font-medium transition-colors",
                    strategy === s.value
                      ? "border-gold bg-gold text-gold-foreground"
                      : "border-border bg-card text-foreground hover:bg-secondary",
                  )}
                >
                  {s.label}
                </button>
              ))}
            </div>
            <p className="mt-1.5 text-xs text-muted-foreground">{strategyHint}</p>
          </div>

          <Button
            onClick={handleCreate}
            disabled={saving}
            className="w-full bg-gradient-to-r from-gold to-accent text-gold-foreground font-bold hover:opacity-90"
          >
            {saving ? "Creating…" : "Create Bot"}
          </Button>
        </div>
      </DialogContent>
    </Dialog>
  );
}
