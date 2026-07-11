import { describe, it, expect } from "vitest";
import {
  imdbEmbedUrl,
  imdbTitleLandingUrl,
  buildWatchServers,
  nextAvailableServer,
  clampIndex,
  type ImdbDomain,
} from "./playerFailover";

const DOMAINS: ImdbDomain[] = [
  { host: "fastimdb.com", label: "FastIMDb", name: "Fastimdb", accent: "#F97316" },
  { host: "directimdb.com", label: "DirectIMDb", name: "Directimdb", accent: "#22C55E" },
];

describe("imdbEmbedUrl", () => {
  it("builds a movie embed URL", () => {
    expect(imdbEmbedUrl("fastimdb.com", "tt0111161", "movie")).toBe(
      "https://www.fastimdb.com/embed/movie/tt0111161",
    );
  });
  it("builds a tv embed URL with season/episode", () => {
    expect(imdbEmbedUrl("fastimdb.com", "tt0903747", "tv", 2, 5)).toBe(
      "https://www.fastimdb.com/embed/tv/tt0903747/2/5",
    );
  });
});

describe("imdbTitleLandingUrl", () => {
  it("builds a /title/ landing URL", () => {
    expect(imdbTitleLandingUrl("fastimdb.com", "tt0111161")).toBe(
      "https://www.fastimdb.com/title/tt0111161/",
    );
  });
});

describe("buildWatchServers", () => {
  it("puts IMDB embed hosts first then TMDB fallbacks then /title/ last (movie)", () => {
    const servers = buildWatchServers({
      imdbId: "tt0111161",
      tmdbId: 278,
      media: "movie",
      imdbDomains: DOMAINS,
    });
    // 2 embed hosts + VidAPI + IMDb Title = 4
    expect(servers).toHaveLength(4);
    expect(servers[0].url).toContain("/embed/movie/tt0111161");
    expect(servers[1].url).toContain("directimdb.com/embed/movie/tt0111161");
    expect(servers.map((s) => s.name)).toEqual([
      "Fastimdb",
      "Directimdb",
      "VidAPI",
      "IMDb Title",
    ]);
    // TMDB fallbacks use the numeric tmdb id
    expect(servers[2].url).toBe("https://vidapi.ru/embed/movie/278");
    // last resort points at the /title/ landing page
    expect(servers[3].url).toBe("https://www.fastimdb.com/title/tt0111161/");
  });

  it("uses tv paths with season/episode for series", () => {
    const servers = buildWatchServers({
      imdbId: "tt0903747",
      tmdbId: 1396,
      media: "tv",
      season: 3,
      episode: 7,
      imdbDomains: DOMAINS,
    });
    expect(servers[0].url).toContain("/embed/tv/tt0903747/3/7");
    expect(servers[2].url).toBe("https://vidapi.ru/embed/tv/1396/3/7");
    expect(servers[3].url).toBe("https://www.fastimdb.com/title/tt0903747/");
  });

  it("falls back to TMDB-only servers when there is no IMDB id", () => {
    const servers = buildWatchServers({
      imdbId: null,
      tmdbId: 278,
      media: "movie",
      imdbDomains: DOMAINS,
    });
    // Only VidAPI, no IMDb Title (needs an imdb id)
    expect(servers.map((s) => s.name)).toEqual(["VidAPI"]);
  });
});

describe("nextAvailableServer", () => {
  it("moves to the next server when the first fails", () => {
    expect(nextAvailableServer(0, 5, [0])).toBe(1);
  });

  it("skips over multiple failed servers", () => {
    expect(nextAvailableServer(0, 5, [0, 1, 2])).toBe(3);
  });

  it("wraps around past the end to an earlier working server", () => {
    expect(nextAvailableServer(4, 5, [4, 0, 1])).toBe(2);
  });

  it("returns -1 when every server has failed", () => {
    expect(nextAvailableServer(2, 3, [0, 1, 2])).toBe(-1);
  });

  it("returns -1 for an empty list", () => {
    expect(nextAvailableServer(0, 0, [])).toBe(-1);
  });

  it("accepts a Set as the failed collection", () => {
    expect(nextAvailableServer(0, 3, new Set([0, 1]))).toBe(2);
  });

  it("clamps an out-of-range active index before searching", () => {
    expect(nextAvailableServer(99, 3, [])).toBe(0);
  });
});

describe("clampIndex", () => {
  it("clamps to the valid range", () => {
    expect(clampIndex(-5, 4)).toBe(0);
    expect(clampIndex(10, 4)).toBe(3);
    expect(clampIndex(2, 4)).toBe(2);
  });
  it("returns 0 for an empty list", () => {
    expect(clampIndex(3, 0)).toBe(0);
  });
});
