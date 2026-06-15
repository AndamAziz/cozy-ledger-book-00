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
    .replace(/&amp;/g, "&")
    .replace(/&lt;/g, "<")
    .replace(/&gt;/g, ">")
    .replace(/&quot;/g, '"')
    .replace(/&#39;/g, "'")
    .replace(/&apos;/g, "'")
    .replace(/&#8217;/g, "\u2019")
    .replace(/&#8216;/g, "\u2018")
    .replace(/&#8211;/g, "\u2013")
    .replace(/&#8212;/g, "\u2014")
    .replace(/&nbsp;/g, " ")
    .replace(/&hellip;/g, "...")
    .trim();
}

function pickTag(block: string, tag: string): string {
  const m = block.match(new RegExp(`<${tag}[^>]*>([\\s\\S]*?)</${tag}>`, "i"));
  return m ? decodeEntities(m[1]) : "";
}

function parseRss(xml: string, source: string, category: string): NewsItem[] {
  const items: NewsItem[] = [];
  const blocks = xml.match(/<item[\s\S]*?<\/item>/gi) ?? [];
  for (const block of blocks) {
    const title = pickTag(block, "title");
    if (!title) continue;
    const link = pickTag(block, "link");
    const pubDate = pickTag(block, "pubDate") || pickTag(block, "dc:date");
    let summary = pickTag(block, "description");
    if (summary.length > 240) summary = summary.slice(0, 237) + "...";
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
      return parseRss(xml, s.source, s.category).slice(0, 12);
    }),
  );
  let all: NewsItem[] = [];
  for (const r of results) if (r.status === "fulfilled") all = all.concat(r.value);
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
