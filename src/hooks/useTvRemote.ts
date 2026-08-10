import { useEffect } from 'react';
import {
  FOCUSABLE_SELECTOR,
  TV_EVENT,
  isTvDevice,
  pickNextFocus,
  remoteAction,
  type RemoteAction,
} from '@/lib/tvRemote';
import { markTvMode } from '@/lib/tvMode';

/** Is the element actually on screen and interactive? */
function visible(el: Element): boolean {
  const r = el.getBoundingClientRect();
  if (r.width < 6 || r.height < 6) return false;
  if (r.bottom < -200 || r.top > window.innerHeight + 800) return false;
  const style = window.getComputedStyle(el);
  return style.visibility !== 'hidden' && style.display !== 'none' && style.pointerEvents !== 'none';
}

/** Prefer candidates inside the topmost overlay (portal/modal) when one is open. */
function scopeRoot(): ParentNode {
  const overlays = Array.from(
    document.querySelectorAll<HTMLElement>('[role="dialog"][data-state="open"], [data-tv-scope]'),
  ).filter(visible);
  return overlays.length ? overlays[overlays.length - 1] : document;
}

function candidates(): { el: HTMLElement; rect: DOMRect }[] {
  const root = scopeRoot();
  const list = Array.from(root.querySelectorAll<HTMLElement>(FOCUSABLE_SELECTOR));
  const pool = list.length ? list : Array.from(document.querySelectorAll<HTMLElement>(FOCUSABLE_SELECTOR));
  return pool.filter(visible).map((el) => ({ el, rect: el.getBoundingClientRect() }));
}

function focus(el: HTMLElement) {
  el.focus({ preventScroll: true });
  el.scrollIntoView({ block: 'nearest', inline: 'nearest', behavior: 'smooth' });
}

function editing(el: Element | null): boolean {
  if (!el) return false;
  const tag = el.tagName;
  return tag === 'INPUT' || tag === 'TEXTAREA' || (el as HTMLElement).isContentEditable;
}

/** Fire a cancelable app-level remote event; returns true when a view handled it. */
function emit(name: string): boolean {
  return !window.dispatchEvent(new CustomEvent(name, { cancelable: true }));
}

/**
 * Global Smart TV remote driver: D-pad spatial focus, OK/Back, channel up/down
 * and media transport keys — all normalised across Tizen, webOS, Android TV and
 * Fire TV. Mount once at the app root.
 */
export function useTvRemote() {
  useEffect(() => {
    if (isTvDevice()) markTvMode();

    const move = (dir: 'up' | 'down' | 'left' | 'right') => {
      const pool = candidates();
      if (!pool.length) return;
      const active = document.activeElement as HTMLElement | null;
      const from = active && pool.some((c) => c.el === active) ? active.getBoundingClientRect() : null;
      if (!from) {
        focus(pool[0].el);
        return;
      }
      const next = pickNextFocus(
        from,
        pool.filter((c) => c.el !== active),
        dir,
      );
      if (next) focus(next);
      else if (dir === 'down' || dir === 'up') window.scrollBy({ top: dir === 'down' ? 320 : -320, behavior: 'smooth' });
    };

    const onKey = (e: KeyboardEvent) => {
      const action: RemoteAction | null = remoteAction(e);
      if (!action) return;

      // Remote-style keys reveal a TV/D-pad user even when the UA is generic.
      if (action === 'channelUp' || action === 'channelDown' || action === 'up' || action === 'down') {
        markTvMode();
      }

      const active = document.activeElement as HTMLElement | null;

      switch (action) {
        case 'up':
        case 'down':
        case 'left':
        case 'right': {
          if (editing(active) && (action === 'left' || action === 'right')) return;
          if (active?.getAttribute('role') === 'slider' || active?.tagName === 'VIDEO') return;
          // Let native listbox/menu/tab widgets keep their own arrow semantics.
          if (active?.closest('[role="listbox"],[role="menu"],[role="tablist"],[cmdk-root]')) return;
          e.preventDefault();
          move(action);
          return;
        }
        case 'ok': {
          if (editing(active)) return;
          if (active && active !== document.body && e.key !== 'Enter' && e.key !== ' ') {
            e.preventDefault();
            active.click();
          }
          return;
        }
        case 'back': {
          if (editing(active) && e.key === 'Backspace') return;
          e.preventDefault();
          if (emit(TV_EVENT.back)) return;
          if (window.history.length > 1) window.history.back();
          return;
        }
        case 'channelUp':
          e.preventDefault();
          emit(TV_EVENT.channelUp);
          return;
        case 'channelDown':
          e.preventDefault();
          emit(TV_EVENT.channelDown);
          return;
        case 'playPause':
        case 'play':
        case 'pause':
          e.preventDefault();
          emit(TV_EVENT.playPause);
          return;
        case 'stop':
          emit(TV_EVENT.stop);
          return;
        case 'rewind':
          emit(TV_EVENT.rewind);
          return;
        case 'forward':
          emit(TV_EVENT.forward);
          return;
        case 'mute':
          emit(TV_EVENT.mute);
          return;
        default:
          return;
      }
    };

    window.addEventListener('keydown', onKey, true);
    return () => window.removeEventListener('keydown', onKey, true);
  }, []);
}

/** Zero-markup mount point for the remote driver. */
export function TvRemoteProvider() {
  useTvRemote();
  return null;
}
