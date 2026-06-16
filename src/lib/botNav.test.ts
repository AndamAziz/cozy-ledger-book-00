import { describe, it, expect, beforeEach, vi } from "vitest";
import { goToGold, GOLD_ROUTE, TRACKER_TAB_KEY } from "@/lib/botNav";

describe("Bots navigation (end-to-end back-to-Gold flow)", () => {
  beforeEach(() => {
    localStorage.clear();
    vi.restoreAllMocks();
  });

  it("navigates from Bots to the /crypto route", () => {
    const navigate = vi.fn();
    goToGold(navigate);
    expect(navigate).toHaveBeenCalledTimes(1);
    expect(navigate).toHaveBeenCalledWith("/crypto");
    expect(GOLD_ROUTE).toBe("/crypto");
  });

  it("restores the Gold (metals) tab via localStorage before navigating", () => {
    const navigate = vi.fn();
    goToGold(navigate);
    // The metals tab preference must be persisted so CryptoTracker opens on Gold.
    expect(localStorage.getItem(TRACKER_TAB_KEY)).toBe("metals");
    expect(navigate).toHaveBeenCalledWith("/crypto");
  });

  it("sets the tab BEFORE navigating (order matters for tab restore)", () => {
    const calls: string[] = [];
    const setItemSpy = vi
      .spyOn(Storage.prototype, "setItem")
      .mockImplementation(() => calls.push("setItem"));
    const navigate = vi.fn(() => calls.push("navigate"));
    goToGold(navigate);
    expect(calls).toEqual(["setItem", "navigate"]);
    setItemSpy.mockRestore();
  });

  it("still navigates to Gold even if localStorage throws", () => {
    const setItemSpy = vi
      .spyOn(Storage.prototype, "setItem")
      .mockImplementation(() => {
        throw new Error("storage unavailable");
      });
    const navigate = vi.fn();
    expect(() => goToGold(navigate)).not.toThrow();
    expect(navigate).toHaveBeenCalledWith("/crypto");
    setItemSpy.mockRestore();
  });
});
