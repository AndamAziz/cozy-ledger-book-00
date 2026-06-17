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

/** Pleasant ascending chime for a winning trade. */
export function playWinSound() {
  try {
    resumeIfSuspended();
    const c = getCtx();
    const t = c.currentTime;

    // First tone (higher, brighter)
    const o1 = c.createOscillator();
    const g1 = c.createGain();
    o1.type = "sine";
    o1.frequency.setValueAtTime(880, t); // A5
    o1.frequency.exponentialRampToValueAtTime(1760, t + 0.15); // A6
    g1.gain.setValueAtTime(0.25, t);
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
    g2.gain.setValueAtTime(0.15, t + 0.08);
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
    resumeIfSuspended();
    const c = getCtx();
    const t = c.currentTime;

    // Descending womp tone
    const o1 = c.createOscillator();
    const g1 = c.createGain();
    o1.type = "sawtooth";
    o1.frequency.setValueAtTime(300, t);
    o1.frequency.exponentialRampToValueAtTime(80, t + 0.35);
    g1.gain.setValueAtTime(0.15, t);
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
    g2.gain.setValueAtTime(0.12, t + 0.05);
    g2.gain.exponentialRampToValueAtTime(0.001, t + 0.45);
    o2.connect(g2);
    g2.connect(c.destination);
    o2.start(t + 0.05);
    o2.stop(t + 0.45);
  } catch {
    /* ignore — audio is optional */
  }
}
