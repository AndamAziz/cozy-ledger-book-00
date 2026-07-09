import { describe, it, expect } from "vitest";
import {
  pickRuntime,
  pickReleaseDate,
  initialsFromName,
  type TmdbDetails,
} from "./tmdbDetails";

describe("pickReleaseDate", () => {
  it("uses first_air_date for TV", () => {
    const d: TmdbDetails = { first_air_date: "2016-07-15", release_date: "2020-01-01" };
    expect(pickReleaseDate(true, d)).toBe("2016-07-15");
  });
  it("uses release_date for movies", () => {
    const d: TmdbDetails = { first_air_date: "2016-07-15", release_date: "2020-01-01" };
    expect(pickReleaseDate(false, d)).toBe("2020-01-01");
  });
  it("returns undefined when the field is empty", () => {
    expect(pickReleaseDate(true, { first_air_date: "" })).toBeUndefined();
    expect(pickReleaseDate(false, {})).toBeUndefined();
  });
});

describe("pickRuntime", () => {
  it("uses episode_run_time for TV", () => {
    const d: TmdbDetails = { episode_run_time: [42], runtime: 120 };
    expect(pickRuntime(true, d)).toBe(42);
  });
  it("skips zero episode_run_time and falls back to last aired episode", () => {
    const d: TmdbDetails = { episode_run_time: [0], last_episode_to_air: { runtime: 55 } };
    expect(pickRuntime(true, d)).toBe(55);
  });
  it("returns undefined for TV with no runtime info", () => {
    expect(pickRuntime(true, { episode_run_time: [] })).toBeUndefined();
  });
  it("uses runtime for movies", () => {
    expect(pickRuntime(false, { runtime: 148, episode_run_time: [42] })).toBe(148);
  });
  it("returns undefined for a movie with zero runtime", () => {
    expect(pickRuntime(false, { runtime: 0 })).toBeUndefined();
  });
});

describe("initialsFromName", () => {
  it("builds up to two initials", () => {
    expect(initialsFromName("Millie Bobby Brown")).toBe("MB");
    expect(initialsFromName("Zendaya")).toBe("Z");
  });
  it("falls back to ? for empty input", () => {
    expect(initialsFromName("")).toBe("?");
    expect(initialsFromName("   ")).toBe("?");
  });
});
