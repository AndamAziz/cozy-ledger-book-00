# Streaming Player — Mobile Regression Test Checklist

Scope: `PlayerOverlay` and `MovieDetail` in `src/pages/Movies.tsx` (Watch + Trailer flows).
Targets: iOS (Safari/Chrome) and Android (Chrome). Test both portrait and landscape.

## Device matrix
| Platform | Device sizes (CSS px) |
| --- | --- |
| iOS | 375×812 (iPhone X/11/12 mini), 390×844 (iPhone 12/13/14), 414×896 (iPhone 11 Pro Max) |
| Android | 360×800 (Pixel/Galaxy), 412×915 (Pixel 6/7), 820×1180 (tablet) |

## 1. Open / close
- [ ] Tapping ▶ Watch opens the player overlay centered, no horizontal scroll.
- [ ] Tapping ▶ Trailer opens the YouTube embed.
- [ ] Close button is fully visible (not cut off at the top) and tappable.
- [ ] Tapping the dark backdrop closes the overlay.
- [ ] Body scroll is locked while overlay is open and restored after close.

## 2. Player rendering
- [ ] Iframe keeps 16:9 aspect ratio at every width (no overflow / squish).
- [ ] No layout shift when the loading spinner appears/disappears.
- [ ] Poster/title header and action buttons remain readable at 360px width.

## 3. Server fallback (movies/series)
- [ ] If first server fails to load within ~7s, it auto-tries the next.
- [ ] "Trying <server>…" spinner shows during auto-fallback and clears on load.
- [ ] Manual server chips switch the source and reset the spinner.
- [ ] Selecting the last server does not throw (index never out of range).

## 4. Security / stability (root cause of past crashes)
- [ ] iframe has `sandbox` WITHOUT `allow-top-navigation` → embed cannot redirect/hijack the whole app.
- [ ] Playing an ad-heavy embed does NOT navigate the parent page away.
- [ ] No white-screen / app crash when switching servers repeatedly.

## 5. TV series specifics
- [ ] Season + episode pickers render and are tappable on mobile.
- [ ] Changing season resets episode to 1.
- [ ] Episode count matches selected season; empty seasons are filtered out.

## 6. RTL (Kurdish) vs LTR (English)
- [ ] Close button and chips mirror correctly using logical properties.
- [ ] Hint text is centered in both directions.

## 7. Network / edge cases
- [ ] Slow 3G: spinner shows, fallback still triggers, no crash.
- [ ] Blocked embed (X-Frame-Options): auto-advances to next server.
- [ ] Rotating device portrait↔landscape keeps the player sized correctly.

## Results log
| Date | Viewport | Platform | Pass/Fail | Notes |
| --- | --- | --- | --- | --- |
