// Shared navigation helper used by the Bots pages so the "back" button
// reliably returns the user to the Gold (metals) section of the tracker.
//
// There is no dedicated `/gold` route — the Gold section lives inside the
// crypto tracker (`/crypto`) with the "metals" tab active. We persist the
// desired tab in localStorage so CryptoTracker restores it on mount.

export const TRACKER_TAB_KEY = "tracker:lastTab";
export const GOLD_ROUTE = "/crypto";

/**
 * Navigate back to the Gold section.
 * Stores the metals tab preference, then navigates to the tracker route.
 */
export function goToGold(navigate: (path: string) => void): void {
  try {
    localStorage.setItem(TRACKER_TAB_KEY, "metals");
  } catch {
    /* noop — localStorage may be unavailable */
  }
  navigate(GOLD_ROUTE);
}
