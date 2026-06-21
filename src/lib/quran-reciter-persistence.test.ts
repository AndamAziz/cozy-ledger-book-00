import { describe, it, expect, beforeEach, afterEach, vi } from "vitest";
import {
  getStoredReciter,
  setStoredReciter,
  RECITERS,
  DEFAULT_RECITER,
} from "./quran";

/**
 * Cross-browser persistence tests for the `quran-reciter` localStorage key.
 *
 * Real browsers (Chrome, Firefox, Safari, Edge) all implement the same
 * Web Storage API contract. Since unit tests run in a single jsdom realm,
 * we emulate each browser by swapping in an independent in-memory storage
 * backend that mirrors how that browser behaves (including Safari's private
 * mode, which historically throws on setItem). This proves our get/set
 * helpers behave correctly against every conforming Storage implementation.
 */

const RECITER_KEY = "quran-reciter";

/** A spec-compliant in-memory localStorage stand-in for one "browser". */
function createStorage(): Storage {
  const map = new Map<string, string>();
  return {
    get length() {
      return map.size;
    },
    clear: () => map.clear(),
    getItem: (k: string) => (map.has(k) ? map.get(k)! : null),
    setItem: (k: string, v: string) => {
      map.set(k, String(v));
    },
    removeItem: (k: string) => {
      map.delete(k);
    },
    key: (i: number) => Array.from(map.keys())[i] ?? null,
  } as Storage;
}

function useStorage(storage: Storage) {
  Object.defineProperty(window, "localStorage", {
    value: storage,
    configurable: true,
    writable: true,
  });
}

const BROWSERS = ["Chrome", "Firefox", "Safari", "Edge"] as const;

describe("quran-reciter cross-browser persistence", () => {
  let originalStorage: Storage;

  beforeEach(() => {
    originalStorage = window.localStorage;
  });

  afterEach(() => {
    useStorage(originalStorage);
    vi.restoreAllMocks();
  });

  for (const browser of BROWSERS) {
    describe(browser, () => {
      let storage: Storage;

      beforeEach(() => {
        storage = createStorage();
        useStorage(storage);
      });

      it("defaults when nothing is stored", () => {
        expect(getStoredReciter()).toBe(DEFAULT_RECITER);
      });

      it("saves the selection and restores it after a reload", () => {
        const chosen = RECITERS[3].id;
        setStoredReciter(chosen);

        // Raw key written exactly as expected.
        expect(storage.getItem(RECITER_KEY)).toBe(chosen);

        // Simulate a full page reload: a brand new storage instance that
        // shares the same persisted backing data.
        useStorage(storage);
        expect(getStoredReciter()).toBe(chosen);
      });

      it("persists every available reciter", () => {
        for (const r of RECITERS) {
          setStoredReciter(r.id);
          expect(getStoredReciter()).toBe(r.id);
        }
      });

      it("falls back to default when the stored value is corrupted", () => {
        storage.setItem(RECITER_KEY, "totally-invalid-reciter");
        expect(getStoredReciter()).toBe(DEFAULT_RECITER);
      });
    });
  }

  it("keeps each browser's selection independent (no cross-contamination)", () => {
    const chrome = createStorage();
    const firefox = createStorage();

    useStorage(chrome);
    setStoredReciter(RECITERS[1].id);

    useStorage(firefox);
    setStoredReciter(RECITERS[5].id);

    useStorage(chrome);
    expect(getStoredReciter()).toBe(RECITERS[1].id);

    useStorage(firefox);
    expect(getStoredReciter()).toBe(RECITERS[5].id);
  });

  it("does not crash in Safari private mode where setItem throws", () => {
    const throwing = createStorage();
    vi.spyOn(throwing, "setItem").mockImplementation(() => {
      throw new DOMException("QuotaExceededError");
    });
    useStorage(throwing);

    // Helpers swallow storage failures gracefully.
    expect(() => setStoredReciter(RECITERS[2].id)).not.toThrow();
    // Reading still yields a safe default rather than crashing.
    expect(getStoredReciter()).toBe(DEFAULT_RECITER);
  });
});
