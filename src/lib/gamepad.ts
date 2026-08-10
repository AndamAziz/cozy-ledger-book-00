/**
 * Gamepad → remote-action bridge.
 *
 * Console browsers (Edge on Xbox, Chrome with a controller attached) and many
 * Android TV boxes expose a controller through the Gamepad API instead of
 * keyboard events. This module maps the standard gamepad layout onto the same
 * `RemoteAction` vocabulary the TV remote uses, so channel switching works
 * identically from a D-pad, an Xbox controller or a keyboard.
 *
 * The polling loop is deliberately cheap: it only runs while a pad is
 * connected, reads at most 4 pads per frame, and applies a repeat delay so a
 * held stick never floods the UI (which is what locks up low-spec TVs).
 */

import type { RemoteAction } from './tvRemote';

/** Standard-mapping button index → action. */
export const BUTTON_MAP: Record<number, RemoteAction> = {
  0: 'ok', // A / cross
  1: 'back', // B / circle
  2: 'info', // X / square
  3: 'playPause', // Y / triangle
  4: 'channelDown', // LB
  5: 'channelUp', // RB
  6: 'channelDown', // LT
  7: 'channelUp', // RT
  8: 'back', // View / Select
  9: 'playPause', // Menu / Start
  12: 'up', // D-pad
  13: 'down',
  14: 'left',
  15: 'right',
};


const AXIS_DEADZONE = 0.6;

export interface PadSnapshot {
  buttons: readonly { pressed: boolean }[];
  axes: readonly number[];
}

/** Actions currently asserted by a pad snapshot (buttons + left stick). */
export function padActions(pad: PadSnapshot): RemoteAction[] {
  const out: RemoteAction[] = [];
  pad.buttons?.forEach((b, i) => {
    const action = BUTTON_MAP[i];
    if (b?.pressed && action) out.push(action);
  });
  const [x = 0, y = 0] = pad.axes ?? [];
  if (x <= -AXIS_DEADZONE) out.push('left');
  else if (x >= AXIS_DEADZONE) out.push('right');
  if (y <= -AXIS_DEADZONE) out.push('up');
  else if (y >= AXIS_DEADZONE) out.push('down');
  return out;
}

/** First press fires instantly; holding repeats at a readable cadence. */
export const FIRST_REPEAT_MS = 380;
export const REPEAT_MS = 140;

/**
 * Decide whether an action should fire now.
 * Pure so the timing rules are unit-testable.
 */
export function shouldFire(
  now: number,
  state: { since: number; last: number } | undefined,
): boolean {
  if (!state) return true; // fresh press
  const held = now - state.since;
  const gap = now - state.last;
  return gap >= (held < FIRST_REPEAT_MS ? FIRST_REPEAT_MS : REPEAT_MS);
}

/**
 * Start polling connected gamepads and dispatch actions. Returns a cleanup fn.
 * No-ops in environments without the Gamepad API.
 */
export function startGamepadBridge(dispatch: (action: RemoteAction) => void): () => void {
  if (typeof navigator === 'undefined' || typeof navigator.getGamepads !== 'function') {
    return () => undefined;
  }
  const held = new Map<RemoteAction, { since: number; last: number }>();
  let raf = 0;
  let running = false;

  const tick = () => {
    const pads = Array.from(navigator.getGamepads?.() ?? []).filter(Boolean).slice(0, 4);
    if (!pads.length) {
      running = false;
      held.clear();
      return;
    }
    const now = performance.now();
    const active = new Set<RemoteAction>();
    for (const pad of pads) {
      for (const action of padActions(pad as unknown as PadSnapshot)) active.add(action);
    }
    for (const action of active) {
      const state = held.get(action);
      if (shouldFire(now, state)) {
        dispatch(action);
        held.set(action, { since: state?.since ?? now, last: now });
      }
    }
    for (const action of Array.from(held.keys())) {
      if (!active.has(action)) held.delete(action);
    }
    raf = requestAnimationFrame(tick);
  };

  const start = () => {
    if (running) return;
    running = true;
    raf = requestAnimationFrame(tick);
  };

  const onConnect = () => start();
  window.addEventListener('gamepadconnected', onConnect);
  // A pad may already be attached (page reload on a console).
  if (Array.from(navigator.getGamepads?.() ?? []).some(Boolean)) start();

  return () => {
    window.removeEventListener('gamepadconnected', onConnect);
    cancelAnimationFrame(raf);
    running = false;
    held.clear();
  };
}
