import { corsHeaders } from "npm:@supabase/supabase-js@2/cors";

// ---- Types ----
interface CalendarEvent {
  title: string;
  country: string;
  impact: string;
  date: string;
  forecast: string;
  previous: string;
  actual: string;
  // Confidence that the released "actual" figure is correctly matched to this
  // event. "high" = strong unambiguous match (or native source), "medium" =
  // matched but a slimmer margin. Absent when no actual has been attached.
  actualConfidence?: "high" | "medium";
}

interface NewsItem {
  title: string;
  link: string;
  source: string;
  category: string;
  pubDate: string;
  summary: string;
}

// ---- RSS sources (reliable, free, market-moving) ----
const NEWS_SOURCES: { url: string; source: string; category: string }[] = [
  { url: "https://www.investing.com/rss/news_1.rss", source: "Investing.com", category: "forex" },
  { url: "https://www.investing.com/rss/news_11.rss", source: "Investing.com", category: "commodities" },
  { url: "https://www.investing.com/rss/news_301.rss", source: "Investing.com", category: "crypto" },
  { url: "https://www.cnbc.com/id/20910258/device/rss/rss.html", source: "CNBC", category: "economy" },
  { url: "https://feeds.content.dowjones.io/public/rss/mw_topstories", source: "MarketWatch", category: "markets" },
];

const CALENDAR_URLS = [
  "https://nfs.faireconomy.media/ff_calendar_thisweek.json",
  "https://nfs.faireconomy.media/ff_calendar_nextweek.json",
];

// ---- Helpers ----
function decodeEntities(s: string): string {
  return s
    .replace(/<!\[CDATA\[(.*?)\]\]>/gs, "$1")
    .replace(/<[^>]+>/g, "")
    // named entities
    .replace(/&amp;/g, "&")
    .replace(/&lt;/g, "<")
    .replace(/&gt;/g, ">")
    .replace(/&quot;/g, '"')
    .replace(/&apos;/g, "'")
    .replace(/&nbsp;/g, " ")
    .replace(/&hellip;/g, "\u2026")
    .replace(/&mdash;/g, "\u2014")
    .replace(/&ndash;/g, "\u2013")
    .replace(/&lsquo;/g, "\u2018")
    .replace(/&rsquo;/g, "\u2019")
    .replace(/&ldquo;/g, "\u201C")
    .replace(/&rdquo;/g, "\u201D")
    // numeric hex entities (e.g. &#x2019;)
    .replace(/&#[xX]([0-9a-fA-F]+);/g, (_, h) => {
      try { return String.fromCodePoint(parseInt(h, 16)); } catch { return ""; }
    })
    // numeric decimal entities (e.g. &#8217;)
    .replace(/&#(\d+);/g, (_, d) => {
      try { return String.fromCodePoint(parseInt(d, 10)); } catch { return ""; }
    })
    .replace(/\s+/g, " ")
    .trim();
}

function pickTag(block: string, tag: string): string {
  const m = block.match(new RegExp(`<${tag}[^>]*>([\\s\\S]*?)</${tag}>`, "i"));
  return m ? decodeEntities(m[1]) : "";
}

// Keep only market-moving news; drop personal-finance / lifestyle stories
const RELEVANT_RE = /\b(gold|silver|xau|bullion|precious metal|oil|crude|brent|wti|opec|natural gas|energy|forex|fx|currency|currencies|dollar|euro|yen|pound|sterling|usd|eur|gbp|jpy|exchange rate|fed|federal reserve|fomc|ecb|boe|boj|central bank|rate cut|rate hike|interest rate|inflation|cpi|ppi|gdp|jobs report|payroll|nonfarm|unemployment|treasury|bond|yield|stock|stocks|equities|market|markets|index|s&p|nasdaq|dow|wall street|commodity|commodities|bitcoin|btc|ethereum|crypto|recession|economy|economic|tariff|trade war|earnings|powell)\b/i;
const IRRELEVANT_RE = /(\bmy plumber\b|should i quit|quit my job|retire(ment| early)|i'?m \d+ (and|with|years)|personal finance|my (husband|wife|mom|dad|son|daughter|kid|family)|dear (penny|abby)|suze orman|dave ramsey|here'?s how (much|i)|how i (saved|retired|paid|built|became)|i regret|side hustle|frugal|coupon|credit card (debt|rewards|points)|net worth at|millionaire next door|budget(ing)? tips|grocery|honeymoon|wedding|inheritance from)/i;

function isRelevant(text: string): boolean {
  if (IRRELEVANT_RE.test(text)) return false;
  return RELEVANT_RE.test(text);
}

// Derive a precise category from the article text (overrides the feed default)
function categorize(text: string): string {
  const t = text.toLowerCase();
  if (/\b(gold|xau|bullion|silver|precious metal)\b/.test(t)) return "gold";
  if (/\b(oil|crude|brent|wti|opec|natural gas)\b/.test(t)) return "oil";
  if (/\b(bitcoin|btc|ethereum|eth|crypto|blockchain|solana|xrp|dogecoin)\b/.test(t)) return "crypto";
  if (/\b(forex|fx|currency|currencies|dollar|euro|yen|pound|sterling|usd|eur|gbp|jpy|exchange rate)\b/.test(t)) return "forex";
  return "markets";
}

function firstSentence(s: string): string {
  if (!s) return "";
  const m = s.match(/^.*?[.!?](\s|$)/);
  let out = (m ? m[0] : s).trim();
  if (out.length > 180) out = out.slice(0, 177) + "...";
  return out;
}

function parseRss(xml: string, source: string, fallbackCategory: string): NewsItem[] {
  const items: NewsItem[] = [];
  const blocks = xml.match(/<item[\s\S]*?<\/item>/gi) ?? [];
  for (const block of blocks) {
    const title = pickTag(block, "title");
    if (!title) continue;
    const link = pickTag(block, "link");
    const pubDate = pickTag(block, "pubDate") || pickTag(block, "dc:date");
    const rawSummary = pickTag(block, "description");
    const combined = `${title} ${rawSummary}`;
    if (!isRelevant(combined)) continue;
    const category = categorize(combined) || fallbackCategory;
    const summary = firstSentence(rawSummary);
    items.push({ title, link, source, category, pubDate, summary });
  }
  return items;
}

async function fetchNews(): Promise<NewsItem[]> {
  const results = await Promise.allSettled(
    NEWS_SOURCES.map(async (s) => {
      const r = await fetch(s.url, { headers: { "User-Agent": "Mozilla/5.0" } });
      if (!r.ok) return [] as NewsItem[];
      const xml = await r.text();
      return parseRss(xml, s.source, s.category).slice(0, 14);
    }),
  );
  let all: NewsItem[] = [];
  for (const r of results) if (r.status === "fulfilled") all = all.concat(r.value);
  // De-duplicate by link/title
  const seen = new Set<string>();
  all = all.filter((n) => {
    const key = (n.link || n.title).toLowerCase();
    if (seen.has(key)) return false;
    seen.add(key);
    return true;
  });
  // Sort newest first
  all.sort((a, b) => {
    const ta = Date.parse(a.pubDate) || 0;
    const tb = Date.parse(b.pubDate) || 0;
    return tb - ta;
  });
  return all.slice(0, 60);
}

async function fetchWithRetry(url: string, attempts = 3): Promise<unknown[]> {
  for (let i = 0; i < attempts; i++) {
    try {
      const r = await fetch(url, { headers: { "User-Agent": "Mozilla/5.0" } });
      if (r.ok) {
        const j = await r.json();
        if (Array.isArray(j)) return j;
      }
    } catch (e) {
      console.error(`calendar fetch failed (attempt ${i + 1}) for ${url}:`, e);
    }
    if (i < attempts - 1) await new Promise((res) => setTimeout(res, 600 * (i + 1)));
  }
  return [];
}

async function fetchCalendar(): Promise<CalendarEvent[]> {
  const results = await Promise.allSettled(CALENDAR_URLS.map((u) => fetchWithRetry(u)));
  let events: CalendarEvent[] = [];
  for (const r of results) {
    if (r.status === "fulfilled" && Array.isArray(r.value)) {
      events = events.concat(
        r.value.map((e: Record<string, string>) => ({
          title: e.title ?? "",
          country: e.country ?? "",
          impact: e.impact ?? "",
          date: e.date ?? "",
          forecast: e.forecast ?? "",
          previous: e.previous ?? "",
          actual: e.actual ?? "",
        })),
      );
    }
  }
  const now = Date.now();
  const DAY = 86400000;
  const filtered = events
    .filter((e) => {
      const imp = (e.impact || "").toLowerCase();
      if (imp !== "high" && imp !== "medium") return false;
      const t = e.date ? Date.parse(e.date) : NaN;
      if (Number.isNaN(t)) return false;
      return t >= now - 4 * DAY && t <= now + 7 * DAY;
    })
    .sort((a, b) => Date.parse(a.date) - Date.parse(b.date));
  return filtered.slice(0, 60);
}

// ---- TradingView economic calendar (provides the "actual" figure once released) ----
interface TVEvent {
  currency: string;
  ts: number;
  title: string;
  actual: number | null;
  forecast: number | null;
  previous: number | null;
  unit: string;
}

const TV_COUNTRIES = "US,EU,GB,JP,CH,CA,AU,NZ,CN";

async function fetchTradingViewEvents(): Promise<TVEvent[]> {
  const now = Date.now();
  const DAY = 86400000;
  const from = new Date(now - 5 * DAY).toISOString().slice(0, 10) + "T00:00:00.000Z";
  const to = new Date(now + 8 * DAY).toISOString().slice(0, 10) + "T00:00:00.000Z";
  const url = `https://economic-calendar.tradingview.com/events?from=${from}&to=${to}&countries=${TV_COUNTRIES}`;
  for (let i = 0; i < 3; i++) {
    try {
      const r = await fetch(url, {
        headers: { "User-Agent": "Mozilla/5.0", Origin: "https://www.tradingview.com" },
      });
      if (r.ok) {
        const j = await r.json();
        const res = Array.isArray(j?.result) ? j.result : [];
        return res.map((e: Record<string, unknown>) => ({
          currency: String(e.currency ?? ""),
          ts: e.date ? Date.parse(String(e.date)) : NaN,
          title: String(e.title ?? ""),
          actual: typeof e.actual === "number" ? e.actual : null,
          forecast: typeof e.forecast === "number" ? e.forecast : null,
          previous: typeof e.previous === "number" ? e.previous : null,
          unit: String(e.unit ?? ""),
        })) as TVEvent[];
      }
    } catch (e) {
      console.error(`TradingView calendar fetch failed (attempt ${i + 1}):`, e);
    }
    if (i < 2) await new Promise((res) => setTimeout(res, 500 * (i + 1)));
  }
  return [];
}

const TOKEN_STOP = new Set(["the", "and", "for", "rate", "index", "final", "flash", "yoy", "mom", "qoq"]);
function titleTokens(s: string): Set<string> {
  return new Set(
    s
      .toLowerCase()
      .replace(/[^a-z0-9\s]/g, " ")
      .split(/\s+/)
      .filter((w) => w.length >= 3 && !TOKEN_STOP.has(w)),
  );
}

// Keep the numeric scale suffix (K/M/B/T/%) that FairEconomy already uses so the
// TradingView figure renders in the same style (e.g. 57 -> "57K").
function scaleSuffix(...samples: string[]): string {
  for (const s of samples) {
    const m = (s || "").match(/([KMBT%])\s*$/i);
    if (m) return m[1].toUpperCase() === "%" ? "%" : m[1].toUpperCase();
  }
  return "";
}

function fmtTV(n: number | null, unit: string, suffix: string): string {
  if (n === null) return "";
  const base = Number.isInteger(n) ? String(n) : String(n);
  if (unit === "%") return `${base}%`;
  return suffix ? `${base}${suffix}` : base;
}

// Attach the released "actual" figure (and matching forecast/previous, same source
// & scale) to FairEconomy events by matching currency + release time + title tokens.
function enrichWithActuals(events: CalendarEvent[], tv: TVEvent[]): CalendarEvent[] {
  if (tv.length === 0) return events;
  const WINDOW = 6 * 60000; // ±6 minutes
  return events.map((ev) => {
    const t = Date.parse(ev.date);
    if (Number.isNaN(t)) return ev;
    const feTokens = titleTokens(ev.title);
    let best: TVEvent | null = null;
    let bestScore = -1;
    let secondScore = -1;
    for (const c of tv) {
      if (c.currency !== ev.country) continue;
      if (Number.isNaN(c.ts) || Math.abs(c.ts - t) > WINDOW) continue;
      let score = 0;
      for (const tok of titleTokens(c.title)) if (feTokens.has(tok)) score++;
      if (score > bestScore) {
        secondScore = bestScore;
        best = c;
        bestScore = score;
      } else if (score > secondScore) {
        secondScore = score;
      }
    }
    // Require an unambiguous winner: reject ties (same-time indicator variants
    // like Unemployment Rate vs U-6, or CPI vs Core CPI) to avoid wrong figures.
    if (!best || best.actual === null || bestScore < 1 || bestScore <= secondScore) return ev;
    const suffix = scaleSuffix(ev.forecast, ev.previous);
    // Sanity guard: a "%" reading above 50 is almost always an index value that
    // was mis-matched to a percentage indicator (e.g. CPI index vs CPI y/y%). Skip it.
    if (suffix === "%" && Math.abs(best.actual) > 50) return ev;
    return {
      ...ev,
      actual: fmtTV(best.actual, best.unit, suffix),
      forecast: best.forecast !== null ? fmtTV(best.forecast, best.unit, suffix) : ev.forecast,
      previous: best.previous !== null ? fmtTV(best.previous, best.unit, suffix) : ev.previous,
    };
  });
}

Deno.serve(async (req) => {
  if (req.method === "OPTIONS") {
    return new Response("ok", { headers: corsHeaders });
  }

  try {
    const [news, events, tv] = await Promise.all([
      fetchNews(),
      fetchCalendar(),
      fetchTradingViewEvents(),
    ]);
    const enriched = enrichWithActuals(events, tv);
    return new Response(
      JSON.stringify({ news, events: enriched, generatedAt: new Date().toISOString() }),
      {
        headers: {
          ...corsHeaders,
          "Content-Type": "application/json",
          "Cache-Control": "public, max-age=120",
        },
      },
    );
  } catch (e) {
    console.error("market-news error:", e);
    return new Response(
      JSON.stringify({ error: e instanceof Error ? e.message : "Unknown error", news: [], events: [] }),
      { status: 500, headers: { ...corsHeaders, "Content-Type": "application/json" } },
    );
  }
});
