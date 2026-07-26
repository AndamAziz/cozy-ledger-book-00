import { describe, it, expect } from "vitest";
import { encodeSearchQuery, buildPlusChannelUrl } from "./searchQuery";

describe("encodeSearchQuery", () => {
  it("encodes spaces as +", () => {
    expect(encodeSearchQuery("The Dark Knight")).toBe("The+Dark+Knight");
  });

  it("collapses and trims repeated/odd whitespace", () => {
    expect(encodeSearchQuery("  Spider\u00A0Man\t\tNo   Way\nHome ")).toBe(
      "Spider+Man+No+Way+Home",
    );
  });

  it("percent-encodes reserved and unsafe characters", () => {
    expect(encodeSearchQuery("Fast & Furious 9")).toBe("Fast+%26+Furious+9");
    expect(encodeSearchQuery("Am I Ok?")).toBe("Am+I+Ok%3F");
    expect(encodeSearchQuery("50/50")).toBe("50%2F50");
    expect(encodeSearchQuery("100% Wolf")).toBe("100%25+Wolf");
    expect(encodeSearchQuery("a#b")).toBe("a%23b");
  });

  it("encodes the characters encodeURIComponent skips", () => {
    expect(encodeSearchQuery("Don't! (2007) *star*")).toBe(
      "Don%27t%21+%282007%29+%2Astar%2A",
    );
  });

  it("encodes a literal plus so it is not read as a space", () => {
    expect(encodeSearchQuery("Spider-Man++")).toBe("Spider-Man%2B%2B");
  });

  it("keeps unreserved characters intact", () => {
    expect(encodeSearchQuery("Mission-Impossible_2.0~")).toBe(
      "Mission-Impossible_2.0~",
    );
  });

  it("encodes non-latin titles as UTF-8", () => {
    expect(encodeSearchQuery("ژیان")).toBe("%DA%98%DB%8C%D8%A7%D9%86");
    expect(encodeSearchQuery("千と千尋")).toBe(
      "%E5%8D%83%E3%81%A8%E5%8D%83%E5%B0%8B",
    );
  });

  it("strips zero-width and bidi control characters", () => {
    expect(encodeSearchQuery("Gold\u200Ben\u202AEye")).toBe("GoldenEye");
  });

  it("handles empty/invalid input", () => {
    expect(encodeSearchQuery("")).toBe("");
    expect(encodeSearchQuery("   ")).toBe("");
  });

  it("round-trips back to the cleaned title", () => {
    const title = "Fast & Furious: Hobbs (2019) 100%";
    const q = encodeSearchQuery(title);
    expect(decodeURIComponent(q.replace(/\+/g, " "))).toBe(title);
  });
});

describe("buildPlusChannelUrl", () => {
  it("builds a valid absolute URL", () => {
    const url = buildPlusChannelUrl("Fast & Furious 9");
    expect(url).toBe("https://mv.andam.uk/search?q=Fast+%26+Furious+9");
    const parsed = new URL(url);
    expect(parsed.searchParams.get("q")).toBe("Fast & Furious 9");
  });
});
