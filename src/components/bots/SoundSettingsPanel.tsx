import { useState } from "react";
import { Volume2, VolumeX, Trophy, AlertTriangle } from "lucide-react";
import {
  Popover, PopoverContent, PopoverTrigger,
} from "@/components/ui/popover";
import { useSoundSettings } from "@/hooks/useSoundSettings";
import { playWinSound, playLoseSound } from "@/hooks/useTradeSounds";
import { cn } from "@/lib/utils";

export function SoundSettingsPanel() {
  const { settings, toggle, setWinVolume, setLoseVolume } = useSoundSettings();
  const [open, setOpen] = useState(false);

  const testWin = () => playWinSound();
  const testLose = () => playLoseSound();

  return (
    <Popover open={open} onOpenChange={setOpen}>
      <PopoverTrigger asChild>
        <button
          aria-label="Sound settings"
          className={cn(
            "relative flex h-11 w-11 items-center justify-center rounded-xl border bg-card hover:bg-secondary",
            settings.enabled ? "border-border text-foreground" : "border-destructive/40 text-destructive",
          )}
        >
          {settings.enabled ? <Volume2 className="h-5 w-5" /> : <VolumeX className="h-5 w-5" />}
        </button>
      </PopoverTrigger>
      <PopoverContent align="end" className="w-[280px] p-0">
        <div className="border-b border-border px-3 py-2">
          <div className="flex items-center justify-between">
            <span className="text-sm font-semibold text-foreground">Sound Settings</span>
            <button
              onClick={toggle}
              className={cn(
                "rounded-full px-3 py-1 text-[11px] font-bold transition-colors",
                settings.enabled
                  ? "bg-success/15 text-success hover:bg-success/25"
                  : "bg-destructive/15 text-destructive hover:bg-destructive/25",
              )}
            >
              {settings.enabled ? "ON" : "OFF"}
            </button>
          </div>
        </div>

        <div className="space-y-4 px-3 py-3">
          {/* Win sound */}
          <div className={cn("space-y-1.5", !settings.enabled && "opacity-50")}>
            <div className="flex items-center justify-between">
              <div className="flex items-center gap-1.5 text-sm text-foreground">
                <Trophy className="h-4 w-4 text-success" />
                Win Ringtone
              </div>
              <span className="text-[11px] font-medium tabular-nums text-muted-foreground">
                {Math.round(settings.winVolume * 100)}%
              </span>
            </div>
            <input
              type="range"
              min={0}
              max={1}
              step={0.05}
              value={settings.winVolume}
              onChange={(e) => setWinVolume(Number(e.target.value))}
              disabled={!settings.enabled}
              className="h-1.5 w-full cursor-pointer appearance-none rounded-full bg-secondary accent-gold"
            />
            <button
              onClick={testWin}
              disabled={!settings.enabled}
              className="mt-1 w-full rounded-md bg-secondary py-1 text-xs font-medium text-foreground hover:bg-secondary/80 disabled:opacity-40"
            >
              Test Win Sound 🏆
            </button>
          </div>

          {/* Lose sound */}
          <div className={cn("space-y-1.5", !settings.enabled && "opacity-50")}>
            <div className="flex items-center justify-between">
              <div className="flex items-center gap-1.5 text-sm text-foreground">
                <AlertTriangle className="h-4 w-4 text-destructive" />
                Lose Ringtone
              </div>
              <span className="text-[11px] font-medium tabular-nums text-muted-foreground">
                {Math.round(settings.loseVolume * 100)}%
              </span>
            </div>
            <input
              type="range"
              min={0}
              max={1}
              step={0.05}
              value={settings.loseVolume}
              onChange={(e) => setLoseVolume(Number(e.target.value))}
              disabled={!settings.enabled}
              className="h-1.5 w-full cursor-pointer appearance-none rounded-full bg-secondary accent-gold"
            />
            <button
              onClick={testLose}
              disabled={!settings.enabled}
              className="mt-1 w-full rounded-md bg-secondary py-1 text-xs font-medium text-foreground hover:bg-secondary/80 disabled:opacity-40"
            >
              Test Lose Sound
            </button>
          </div>
        </div>
      </PopoverContent>
    </Popover>
  );
}
