import { useState, useEffect, useCallback } from "react";

export interface SoundSettings {
  enabled: boolean;
  winVolume: number;   // 0 – 1
  loseVolume: number;  // 0 – 1
}

const KEY = "bot_sound_settings";
const DEFAULT: SoundSettings = { enabled: true, winVolume: 0.8, loseVolume: 0.8 };

function load(): SoundSettings {
  try {
    const raw = localStorage.getItem(KEY);
    if (!raw) return DEFAULT;
    const parsed = JSON.parse(raw) as Partial<SoundSettings>;
    return {
      enabled: parsed.enabled ?? DEFAULT.enabled,
      winVolume: parsed.winVolume ?? DEFAULT.winVolume,
      loseVolume: parsed.loseVolume ?? DEFAULT.loseVolume,
    };
  } catch {
    return DEFAULT;
  }
}

function save(s: SoundSettings) {
  try { localStorage.setItem(KEY, JSON.stringify(s)); } catch { /* ignore */ }
}

export function useSoundSettings() {
  const [settings, setSettings] = useState<SoundSettings>(load);

  const update = useCallback((patch: Partial<SoundSettings>) => {
    setSettings((prev) => {
      const next = { ...prev, ...patch };
      save(next);
      return next;
    });
  }, []);

  const toggle = useCallback(() => update({ enabled: !settings.enabled }), [settings.enabled, update]);
  const setWinVolume = useCallback((v: number) => update({ winVolume: Math.max(0, Math.min(1, v)) }), [update]);
  const setLoseVolume = useCallback((v: number) => update({ loseVolume: Math.max(0, Math.min(1, v)) }), [update]);

  return { settings, update, toggle, setWinVolume, setLoseVolume };
}
