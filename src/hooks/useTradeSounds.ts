/**
 * Simple Web Audio API trade sounds — no external assets needed.
 * Works in all modern browsers. Must be triggered by user interaction
 * (e.g. button click or page load after first touch) for the AudioContext
 * to start on some mobile browsers.
 */

let ctx: AudioContext | null = null;

function getCtx(): AudioContext {
  if (!ctx) {
    ctx = new (window.AudioContext || (window as any).webkitAudioContext)();
  }
  return ctx;
}

function resumeIfSuspended() {
  const c = getCtx();
  if (c.state === "suspended") {
    c.resume().catch(() => {});
  }
}

/** Read current sound settings from localStorage (must stay in sync with useSoundSettings). */
function readSettings(): { enabled: boolean; winVolume: number; loseVolume: number } {
  try {
    const raw = localStorage.getItem("bot_sound_settings");
    if (!raw) return { enabled: true, winVolume: 0.8, loseVolume: 0.8 };
    const parsed = JSON.parse(raw);
    return {
      enabled: parsed.enabled ?? true,
      winVolume: parsed.winVolume ?? 0.8,
      loseVolume: parsed.loseVolume ?? 0.8,
    };
  } catch {
    return { enabled: true, winVolume: 0.8, loseVolume: 0.8 };
  }
}

/** Pleasant ascending chime for a winning trade. */
export function playWinSound() {
  try {
    const s = readSettings();
    if (!s.enabled) return;
    resumeIfSuspended();
    const c = getCtx();
    const t = c.currentTime;
    const vol = Math.max(0, Math.min(1, s.winVolume));

    // First tone (higher, brighter)
    const o1 = c.createOscillator();
    const g1 = c.createGain();
    o1.type = "sine";
    o1.frequency.setValueAtTime(880, t); // A5
    o1.frequency.exponentialRampToValueAtTime(1760, t + 0.15); // A6
    g1.gain.setValueAtTime(0.25 * vol, t);
    g1.gain.exponentialRampToValueAtTime(0.001, t + 0.4);
    o1.connect(g1);
    g1.connect(c.destination);
    o1.start(t);
    o1.stop(t + 0.4);

    // Second tone (harmonic, slightly delayed)
    const o2 = c.createOscillator();
    const g2 = c.createGain();
    o2.type = "sine";
    o2.frequency.setValueAtTime(1100, t + 0.08);
    o2.frequency.exponentialRampToValueAtTime(2200, t + 0.23);
    g2.gain.setValueAtTime(0.15 * vol, t + 0.08);
    g2.gain.exponentialRampToValueAtTime(0.001, t + 0.5);
    o2.connect(g2);
    g2.connect(c.destination);
    o2.start(t + 0.08);
    o2.stop(t + 0.5);
  } catch {
    /* ignore — audio is optional */
  }
}

/** Lower descending buzz for a losing trade. */
export function playLoseSound() {
  try {
    const s = readSettings();
    if (!s.enabled) return;
    resumeIfSuspended();
    const c = getCtx();
    const t = c.currentTime;
    const vol = Math.max(0, Math.min(1, s.loseVolume));

    // Descending womp tone
    const o1 = c.createOscillator();
    const g1 = c.createGain();
    o1.type = "sawtooth";
    o1.frequency.setValueAtTime(300, t);
    o1.frequency.exponentialRampToValueAtTime(80, t + 0.35);
    g1.gain.setValueAtTime(0.15 * vol, t);
    g1.gain.exponentialRampToValueAtTime(0.001, t + 0.45);
    o1.connect(g1);
    g1.connect(c.destination);
    o1.start(t);
    o1.stop(t + 0.45);

    // Subtle low rumble underneath
    const o2 = c.createOscillator();
    const g2 = c.createGain();
    o2.type = "triangle";
    o2.frequency.setValueAtTime(150, t + 0.05);
    o2.frequency.exponentialRampToValueAtTime(40, t + 0.35);
    g2.gain.setValueAtTime(0.12 * vol, t + 0.05);
    g2.gain.exponentialRampToValueAtTime(0.001, t + 0.45);
    o2.connect(g2);
    g2.connect(c.destination);
    o2.start(t + 0.05);
    o2.stop(t + 0.45);
  } catch {
    /* ignore — audio is optional */
  }
}

/** Subtle two-tone "ding" for status alerts (pause / stop / break-even). */
export function playDing() {
  try {
    const s = readSettings();
    if (!s.enabled) return;
    resumeIfSuspended();
    const c = getCtx();
    const t = c.currentTime;
    const vol = Math.max(0, Math.min(1, s.winVolume));

    const o = c.createOscillator();
    const g = c.createGain();
    o.type = "sine";
    o.frequency.setValueAtTime(660, t);       // E5
    o.frequency.setValueAtTime(880, t + 0.1); // A5
    g.gain.setValueAtTime(0.18 * vol, t);
    g.gain.exponentialRampToValueAtTime(0.001, t + 0.3);
    o.connect(g);
    g.connect(c.destination);
    o.start(t);
    o.stop(t + 0.3);
  } catch {
    /* ignore — audio is optional */
  }
}
