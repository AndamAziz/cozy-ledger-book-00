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

Deno.serve(async (req) => {
  if (req.method === "OPTIONS") {
    return new Response("ok", { headers: corsHeaders });
  }

  try {
    const [news, events] = await Promise.all([fetchNews(), fetchCalendar()]);
    return new Response(
      JSON.stringify({ news, events, generatedAt: new Date().toISOString() }),
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
