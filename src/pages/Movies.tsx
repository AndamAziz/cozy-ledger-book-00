import { useState, useEffect, useCallback, useRef } from "react";
import { Helmet } from "react-helmet-async";
import { useNavigate } from "react-router-dom";
import { toast } from "sonner";
import { Bot, Play, X, RotateCcw, MonitorPlay, Maximize, Minimize, Heart } from "lucide-react";
import { supabase } from "@/integrations/supabase/client";
import { useFavorite, useFavoritesList } from "@/lib/movieFavorites";
import {
  pickRuntime,
  pickReleaseDate,
  initialsFromName,
  tvSummary,
  nextEpisode,
  type TmdbDetails,
} from "@/lib/tmdbDetails";
import {
  buildWatchServers,
  nextAvailableServer,
  clampIndex,
} from "@/lib/playerFailover";

// ====== Theme ======
const C = {
  bg: "#0A0A0F",
  panel: "#13131c",
  panel2: "#1b1b27",
  gold: "#F5C518",
  goldDim: "rgba(245,197,24,0.15)",
  text: "#f5f5f7",
  muted: "#9a9aae",
  border: "rgba(255,255,255,0.08)",
};

// Image hosts are public CDN paths (no API key needed).
const TMDB_BACKDROP = "https://image.tmdb.org/t/p/w1280";
const TMDB_PROFILE = "https://image.tmdb.org/t/p/w185";

// All TMDB API calls go through our server-side proxy so the API key is never
// exposed in the browser. The proxy injects the key and allow-lists endpoints.
const TMDB_PROXY = `${import.meta.env.VITE_SUPABASE_URL}/functions/v1/tmdb`;
const TMDB_PROXY_KEY = import.meta.env.VITE_SUPABASE_PUBLISHABLE_KEY;

async function tmdbFetch(
  path: string,
  params: Record<string, string | number | boolean | undefined> = {},
): Promise<Response> {
  const url = new URL(TMDB_PROXY);
  url.searchParams.set("path", path);
  for (const [k, v] of Object.entries(params)) {
    if (v !== undefined && v !== null && v !== "") {
      url.searchParams.set(k, String(v));
    }
  }
  return fetch(url.toString(), {
    headers: {
      apikey: TMDB_PROXY_KEY,
      Authorization: `Bearer ${TMDB_PROXY_KEY}`,
    },
  });
}

// IMDb streaming domains. Use the direct /embed route for the in-app player;
// /title redirects through extra landing/ad frames and is less reliable on
// mobile Safari/Firefox.
const IMDB_DOMAINS: { host: string; label: string; name: string; accent: string }[] = [
  { host: "fastimdb.com", label: "FastIMDb", name: "Fastimdb", accent: "#F97316" },
  { host: "directimdb.com", label: "DirectIMDb", name: "Directimdb", accent: "#22C55E" },
  { host: "streamimdb.com", label: "StreamIMDb", name: "Streamimdb", accent: "#EC4899" },
  { host: "runimdb.com", label: "RunIMDb", name: "Runimdb", accent: "#8B5CF6" },
  { host: "playimdb.com", label: "PlayIMDb ⚡", name: "PlayIMDb", accent: "#00BCD4" },
];

const imdbPlayerUrl = (host: string, imdbId: string, media: "movie" | "tv", season = 1, episode = 1) => {
  const kind = media === "tv" ? "tv" : "movie";
  const path = media === "tv" ? `${kind}/${imdbId}/${season}/${episode}` : `${kind}/${imdbId}`;
  return `https://www.${host}/embed/${path}`;
};

const imdbTitleUrl = (host: string, imdbId: string) => `https://www.${host}/title/${imdbId}/`;

const selectStyle: React.CSSProperties = {
  background: C.panel2,
  color: C.text,
  border: `1px solid ${C.gold}`,
  borderRadius: 10,
  padding: "8px 12px",
  fontSize: 14,
  fontWeight: 700,
  cursor: "pointer",
  outline: "none",
};

type Lang = "ku" | "en";

// ====== i18n ======
const T = {
  ku: {
    title: "فیلم",
    titleSuffix: "ەکان",
    back: "← گەڕانەوە",
    searchPlaceholder: "گەڕان بە ناوی فیلم، سریال، یان ئەکتەر...",
    smartSearch: "گەڕانی زیرەک",
    aiFound: "AI ناوی ڕاستەقینەی دۆزییەوە:",
    noMovies: "هیچ فیلم یان سریالێک نەدۆزرایەوە",
    first: "یەکەم",
    last: "کۆتایی",
    watch: "▶ سەیرکردن",
    trailer: "🎬 تریلەر",
    aiInfo: "🤖 زانیاری AI",
    noTrailer: "تریلەر بەردەست نییە بۆ ئەم فیلمە.",
    tabInfo: "زانیاری",
    tabCast: "ئەکتەرەکان",
    tabAi: "🤖 AI",
    tabDetails: "وردەکاری",
    dOverview: "کورتەی چیرۆک",
    dRuntime: "ماوە",
    dReleaseDate: "بەرواری بڵاوکردنەوە",
    dFirstAir: "یەکەم پەخش",
    dLanguage: "زمانی ڕەسەن",
    dCountry: "وڵاتی بەرهەمهێنان",
    dCastLabel: "سەرەکیترین ئەکتەرەکان",
    dDirector: "دەرهێنەر",
    dCreator: "دروستکەر",
    dMinutes: "خولەک",
    detailsLoading: "بارکردنی وردەکاری...",
    detailsError: "نەتوانرا وردەکاری بهێنرێت. تکایە دووبارە هەوڵبدەرەوە.",
    retry: "دووبارە هەوڵبدەرەوە",
    autoRetrying: "هەوڵی دووبارە بەخۆکاری...",
    dSeriesInfo: "زانیاری زنجیرە",
    dSeasons: "وەرزەکان",
    dEpisodes: "ئەلقەکان",
    dEpisodeRuntime: "ماوەی ئەلقە",
    dStatus: "دۆخ",
    dNextEpisode: "ئەلقەی داهاتوو",
    dNoNext: "هیچ ئەلقەیەکی داهاتوو ڕێکنەخراوە.",
    director: "دەرهێنەر:",
    fTitle: "ناونیشان",
    fYear: "ساڵ",
    fRating: "هەڵسەنگاندن",
    fGenre: "جۆر",
    noCast: "زانیاری ئەکتەران بەردەست نییە.",
    aiWriting: "AI زانیاری دەنووسێت...",
    aiError: "هەڵەیەک ڕوویدا لە وەرگرتنی زانیاری. تکایە دووبارە هەوڵبدەرەوە.",
    noInfo: "زانیاری بەردەست نییە.",
    close: "✕ داخستن",
    subs: "📥 سەبتایتل",
    tabSubs: "📥 سەبتایتل",
    subsLoading: "گەڕان بۆ سەبتایتل...",
    subsNone: "هیچ سەبتایتلێک نەدۆزرایەوە بۆ ئەم فیلمە.",
    subsError: "هەڵەیەک ڕوویدا. تکایە دووبارە هەوڵبدەرەوە.",
    download: "داگرتن",
    downloading: "...",
    subsHint: "زمانەکان: کوردی، ئینگلیزی، عەرەبی و زۆرتر — لە OpenSubtitles بەخۆڕایی",
    allLangs: "هەموو زمانەکان",
    openPlayIMDb: "🌐 کردنەوە لە PlayIMDb",
    copyPlayIMDb: "📋 کۆپی کردنی لینک",
    openOn: "کردنەوە لە",
    copy: "کۆپی",
    linkCopied: "لینکەکە کۆپی کرا ✓",
    searchResultsFor: "ئەنجامەکانی گەڕان بۆ",
    clearSearch: "✕ پاککردنەوەی گەڕان",
    searching: "گەڕان...",
    resultsCount: "ئەنجام",
    seriesBadge: "زنجیرە",
    season: "وەرز",
    episode: "ئەلقە",
    selectEpisode: "وەرز و ئەلقە هەڵبژێرە",
    episodesCount: "ئەلقە",
    play: "▶ سەیرکردن",
    details: "زانیاری",
    featured: "تایبەت",
    server: "سێرڤەر",
    serverHint: "ئەگەر فیلمەکە کار نەکرد، سێرڤەرێکی تر تاقیبکەرەوە 👇",
    movieTag: "فیلم",
    tvTag: "زنجیرە",
    actorTag: "ئەکتەر",
    latest: "نوێترین",
    trendingToday: "ترێندی ئەمڕۆ",
    top10: "تۆپ ١٠",
    tabMovies: "فیلمەکان",
    tabSeries: "زنجیرەکان",
    seeAll: "هەموو ببینە",
    rankToday: "ئەمڕۆ",
    navHome: "سەرەتا",
    navMovie: "فیلم",
    navSeries: "سریال",
    navSearch: "گەڕان",
    navMore: "زیاتر",
    navFav: "دڵخوازەکان",
    favTitle: "دڵخوازەکان",
    noFav: "هێشتا هیچ فیلم یان سریالێکت زیاد نەکردووە بۆ دڵخوازەکان",
    addFav: "زیادکردن بۆ دڵخوازەکان",
    removeFav: "لابردن لە دڵخوازەکان",
    serversTitle: "سێرڤەرەکانی سەیرکردن",
    inAppPlayer: "لێدەری ناوبەرنامە",
    serversLabel: "سێرڤەرەکان",
    autoSwitch: "گۆڕینی خۆکار",
    autoSwitchHint: "ئەگەر سێرڤەرێک کار نەکات، بەخۆکاری دەگۆڕێت",
    serversSubtitle: "سێرڤەرێک هەڵبژێرە و فیلم یان زنجیرەکەی تێدا بگەڕێ 👇",
    serverSearch: "لەم سێرڤەرەدا بگەڕێ...",
    backToServers: "← سێرڤەرەکان",
    watchOn: "سەیرکردن لە",
    chooseSE: "وەرز و ئەلقە هەڵبژێرە",
    playNow: "▶ لێدان",
    serverEmpty: "ناوی فیلم یان زنجیرەیەک بنووسە بۆ گەڕان",
    filters: "فلتەرەکان",
    yearLabel: "ساڵ",
    ratingLabel: "هەڵسەنگاندن",
    sortLabel: "ڕێکخستن",
    anyYear: "هەموو ساڵەکان",
    anyRating: "هەموو",
    sortPopular: "بەناوبانگترین",
    sortTopRated: "باشترین هەڵسەنگاندن",
    sortNewest: "نوێترین",
    sortOldest: "کۆنترین",
    resetFilters: "سڕینەوەی فلتەر",
  },
  en: {
    title: "Mov",
    titleSuffix: "ies",
    back: "← Back",
    searchPlaceholder: "Search by movie, series, or actor name...",
    smartSearch: "Smart Search",
    aiFound: "AI found the real title:",
    noMovies: "No movies or series found",
    first: "First",
    last: "Last",
    watch: "▶ Watch Now",
    trailer: "🎬 Trailer",
    aiInfo: "🤖 AI Info",
    noTrailer: "No trailer available for this movie.",
    tabInfo: "Info",
    tabCast: "Cast",
    tabAi: "🤖 AI",
    tabDetails: "Details",
    dOverview: "Overview",
    dRuntime: "Runtime",
    dReleaseDate: "Release Date",
    dFirstAir: "First Air Date",
    dLanguage: "Original Language",
    dCountry: "Production Country",
    dCastLabel: "Top Billed Cast",
    dDirector: "Director",
    dCreator: "Creator",
    dMinutes: "min",
    detailsLoading: "Loading details...",
    detailsError: "Couldn't load details. Please try again.",
    retry: "Retry",
    autoRetrying: "Auto-retrying...",
    dSeriesInfo: "Series Info",
    dSeasons: "Seasons",
    dEpisodes: "Episodes",
    dEpisodeRuntime: "Episode Runtime",
    dStatus: "Status",
    dNextEpisode: "Next Episode",
    dNoNext: "No upcoming episode scheduled.",
    director: "Director:",
    fTitle: "Title",
    fYear: "Year",
    fRating: "Rating",
    fGenre: "Genre",
    noCast: "No cast information available.",
    aiWriting: "AI is writing...",
    aiError: "Something went wrong fetching info. Please try again.",
    noInfo: "No information available.",
    close: "✕ Close",
    subs: "📥 Subtitles",
    tabSubs: "📥 Subtitles",
    subsLoading: "Searching for subtitles...",
    subsNone: "No subtitles found for this movie.",
    subsError: "Something went wrong. Please try again.",
    download: "Download",
    downloading: "...",
    subsHint: "Languages: Kurdish, English, Arabic & more — free from OpenSubtitles",
    allLangs: "All languages",
    openPlayIMDb: "🌐 Open on PlayIMDb",
    copyPlayIMDb: "📋 Copy PlayIMDb Link",
    openOn: "Open on",
    copy: "Copy",
    linkCopied: "Link copied ✓",
    searchResultsFor: "Search results for",
    clearSearch: "✕ Clear search",
    searching: "Searching...",
    resultsCount: "results",
    seriesBadge: "Series",
    season: "Season",
    episode: "Episode",
    selectEpisode: "Choose season & episode",
    episodesCount: "episodes",
    play: "▶ Watch",
    details: "Details",
    featured: "Featured",
    server: "Server",
    serverHint: "If the movie doesn't load, try another server 👇",
    movieTag: "MOVIE",
    tvTag: "TV",
    actorTag: "ACTOR",
    latest: "Latest",
    trendingToday: "Trending Today",
    top10: "TOP 10",
    tabMovies: "Movies",
    tabSeries: "Series",
    seeAll: "See all",
    rankToday: "Today",
    navHome: "Home",
    navMovie: "Movies",
    navSeries: "Series",
    navSearch: "Search",
    navMore: "More",
    navFav: "Favorites",
    favTitle: "Favorites",
    noFav: "You haven't added any movies or series to favorites yet",
    addFav: "Add to favorites",
    removeFav: "Remove from favorites",
    serversTitle: "Streaming Servers",
    inAppPlayer: "IN-APP PLAYER",
    serversLabel: "Servers",
    autoSwitch: "Auto-switch",
    autoSwitchHint: "If a server fails it switches automatically",
    serversSubtitle: "Pick a server and search for a movie or series inside it 👇",
    serverSearch: "Search inside this server...",
    backToServers: "← Servers",
    watchOn: "Watch on",
    chooseSE: "Choose season & episode",
    playNow: "▶ Play",
    serverEmpty: "Type a movie or series name to search",
    filters: "Filters",
    yearLabel: "Year",
    ratingLabel: "Rating",
    sortLabel: "Sort",
    anyYear: "All Years",
    anyRating: "Any",
    sortPopular: "Most Popular",
    sortTopRated: "Top Rated",
    sortNewest: "Newest",
    sortOldest: "Oldest",
    resetFilters: "Reset",
  },
};

const GENRES: { key: string; ku: string; en: string }[] = [
  { key: "all", ku: "هەموو", en: "All" },
  { key: "Action", ku: "ئاکشن", en: "Action" },
  { key: "Comedy", ku: "کۆمیدی", en: "Comedy" },
  { key: "Drama", ku: "دراما", en: "Drama" },
  { key: "Horror", ku: "ترسناک", en: "Horror" },
  { key: "Science Fiction", ku: "زانستی خەیاڵی", en: "Sci-Fi" },
  { key: "Thriller", ku: "هەستبزوێن", en: "Thriller" },
  { key: "Romance", ku: "ڕۆمانسی", en: "Romance" },
  { key: "Animation", ku: "ئەنیمەیشن", en: "Animation" },
  { key: "Adventure", ku: "سەرکێشی", en: "Adventure" },
  { key: "Crime", ku: "تاوان", en: "Crime" },
  { key: "Fantasy", ku: "فانتازیا", en: "Fantasy" },
];

// TMDB genre id → name (used to label search results & power the genre filter)
const TMDB_GENRES: Record<number, string> = {
  28: "Action", 12: "Adventure", 16: "Animation", 35: "Comedy", 80: "Crime",
  99: "Documentary", 18: "Drama", 10751: "Family", 14: "Fantasy", 36: "History",
  27: "Horror", 10402: "Music", 9648: "Mystery", 10749: "Romance",
  878: "Science Fiction", 10770: "TV Movie", 53: "Thriller", 10752: "War", 37: "Western",
  // TV-specific genres
  10759: "Action", 10765: "Science Fiction", 10768: "War", 10764: "Reality",
  10763: "News", 10762: "Family", 10766: "Drama", 10767: "Talk",
};

// Genre key → TMDB genre id, per media type (used for server-side discover filtering)
const MOVIE_GENRE_IDS: Record<string, number> = {
  Action: 28, Comedy: 35, Drama: 18, Horror: 27,
  "Science Fiction": 878, Thriller: 53, Romance: 10749,
  Animation: 16, Adventure: 12, Crime: 80, Fantasy: 14,
};
const TV_GENRE_IDS: Record<string, number> = {
  Action: 10759, Comedy: 35, Drama: 18, Horror: 9648,
  "Science Fiction": 10765, Thriller: 9648, Romance: 10766,
  Animation: 16, Adventure: 10759, Crime: 80, Fantasy: 10765,
};

// ====== Discovery filters: sort options, years & ratings ======
type SortKey = "popular" | "top" | "new" | "old";

const SORT_OPTIONS: { key: SortKey; ku: string; en: string }[] = [
  { key: "popular", ku: "بەناوبانگترین", en: "Most Popular" },
  { key: "top", ku: "باشترین هەڵسەنگاندن", en: "Top Rated" },
  { key: "new", ku: "نوێترین", en: "Newest" },
  { key: "old", ku: "کۆنترین", en: "Oldest" },
];

const CURRENT_YEAR = new Date().getFullYear();
// Years from the current year down to 1970.
const YEARS: string[] = Array.from(
  { length: CURRENT_YEAR - 1969 },
  (_, i) => String(CURRENT_YEAR - i),
);
const RATING_OPTIONS = ["9", "8", "7", "6", "5"];

// Map a generic sort key → the matching TMDB `sort_by` param for the media type.
function sortByParam(key: SortKey, media: "movie" | "tv"): string {
  switch (key) {
    case "top":
      return "vote_average.desc";
    case "new":
      return media === "tv" ? "first_air_date.desc" : "primary_release_date.desc";
    case "old":
      return media === "tv" ? "first_air_date.asc" : "primary_release_date.asc";
    default:
      return "popularity.desc";
  }
}

// Client-side sort (used on free-text search results).
function sortMovies(arr: Movie[], key: SortKey): Movie[] {
  const a = [...arr];
  if (key === "top") {
    a.sort((x, y) => (parseFloat(y.rating) || 0) - (parseFloat(x.rating) || 0));
  } else if (key === "new") {
    a.sort((x, y) => (parseInt(y.year) || 0) - (parseInt(x.year) || 0));
  } else if (key === "old") {
    a.sort((x, y) => (parseInt(x.year) || 9999) - (parseInt(y.year) || 9999));
  } else {
    a.sort(
      (x, y) => (parseFloat(y.popularity) || 0) - (parseFloat(x.popularity) || 0),
    );
  }
  return a;
}



interface TmdbSearchResult {
  id: number;
  media_type?: string;
  title?: string;
  name?: string;
  original_title?: string;
  original_name?: string;
  release_date?: string;
  first_air_date?: string;
  poster_path?: string | null;
  vote_average?: number;
  genre_ids?: number[];
  popularity?: number;
}

interface Movie {
  tmdb_id: number;
  imdb_id: string;
  media: "movie" | "tv";
  title: string;
  year: string;
  poster_url: string;
  rating: string;
  genre: string;
  popularity: string;
  type: string;
  embed_url: string;
  fromActor?: boolean;
}

interface CastMember {
  id: number;
  name: string;
  character: string;
  profile_path: string | null;
}

// Module-level TMDB result → Movie mapper (used by search + hero)
function mapTmdbResult(r: TmdbSearchResult): Movie {
  const isTv = r.media_type === "tv";
  return {
    tmdb_id: r.id,
    imdb_id: "",
    media: isTv ? "tv" : "movie",
    title: r.title || r.name || r.original_title || r.original_name || "",
    year: (r.release_date || r.first_air_date || "").slice(0, 4),
    poster_url: r.poster_path ? `https://image.tmdb.org/t/p/w500${r.poster_path}` : "",
    rating: r.vote_average ? r.vote_average.toFixed(1) : "",
    genre: (r.genre_ids || []).map((g) => TMDB_GENRES[g]).filter(Boolean).join(", "),
    popularity: String(r.popularity || ""),
    type: isTv ? "tv" : "movie",
    embed_url: "",
  };
}

// ====== Global CSS (animations / scrollbar / skeleton) ======
const GLOBAL_CSS = `
.mv-scroll::-webkit-scrollbar { height: 6px; width: 8px; }
.mv-scroll::-webkit-scrollbar-track { background: transparent; }
.mv-scroll::-webkit-scrollbar-thumb { background: ${C.gold}; border-radius: 8px; opacity:.6; }
.mv-page { scrollbar-color: ${C.gold} transparent; scrollbar-width: thin; }
.mv-card { transition: transform .28s cubic-bezier(.2,.8,.2,1), box-shadow .28s; }
.mv-card:hover { transform: translateY(-8px) scale(1.035); box-shadow: 0 18px 40px rgba(0,0,0,.6); z-index:2; }
.mv-card:hover .mv-play { opacity:1; transform: scale(1); }
.mv-card:hover .mv-poster-img { transform: scale(1.08); filter: brightness(.55); }
.mv-srv-card:hover { transform: translateY(-5px); box-shadow: 0 14px 30px rgba(0,0,0,.5); }
.mv-srv-card:active { transform: translateY(-1px) scale(.98); }
.mv-play { opacity:0; transform: scale(.6); transition: all .28s; }
.mv-poster-img { transition: transform .5s, filter .35s; }
@keyframes mvShimmer { 0%{background-position:-400px 0} 100%{background-position:400px 0} }
.mv-skel { background:linear-gradient(90deg,#16161f 25%,#22222e 50%,#16161f 75%); background-size:800px 100%; animation: mvShimmer 1.3s infinite linear; }
@keyframes mvFade { from{opacity:0; transform: translateY(12px)} to{opacity:1; transform:none} }
.mv-fade { animation: mvFade .35s ease both; }
@keyframes mvSpin { to { transform: rotate(360deg) } }
.mv-spin { animation: mvSpin .8s linear infinite; }
.mv-genre::-webkit-scrollbar { height:0; }
`;

export default function Movies() {
  const navigate = useNavigate();
  const [lang, setLang] = useState<Lang>(() =>
    (localStorage.getItem("moviesLang") as Lang) || "ku",
  );
  const t = T[lang];
  const dir = lang === "ku" ? "rtl" : "ltr";

  const [movies, setMovies] = useState<Movie[]>([]);
  const [loading, setLoading] = useState(true);
  const [loadingMore, setLoadingMore] = useState(false);
  const [page, setPage] = useState(1);
  const [totalPages, setTotalPages] = useState(1);
  const sentinelRef = useRef<HTMLDivElement>(null);
  const [genre, setGenre] = useState("all");
  const [year, setYear] = useState("all");
  const [minRating, setMinRating] = useState("all");
  const [sortKey, setSortKey] = useState<SortKey>("popular");
  const [search, setSearch] = useState("");
  const [aiSearching, setAiSearching] = useState(false);
  const [aiTitle, setAiTitle] = useState<string | null>(null);
  const [selected, setSelected] = useState<Movie | null>(null);
  const [searchResults, setSearchResults] = useState<Movie[] | null>(null);
  const [mediaTab, setMediaTab] = useState<"movie" | "tv">("movie");
  const [view, setView] = useState<"home" | "movie" | "tv" | "search" | "favorites">("home");
  const inputRef = useRef<HTMLInputElement>(null);

  const goView = (v: "home" | "movie" | "tv" | "search" | "favorites") => {
    if (v === "search") {
      setView("search");
      setTimeout(() => inputRef.current?.focus(), 50);
      return;
    }
    /* leaving search → clear it */
    setSearch("");
    setAiTitle(null);
    setSearchResults(null);
    if (v === "favorites") {
      setView("favorites");
      window.scrollTo({ top: 0, behavior: "smooth" });
      return;
    }
    if (v === "tv") setMediaTab("tv");
    else setMediaTab("movie");
    setView(v);
    window.scrollTo({ top: 0, behavior: "smooth" });
  };


  const toggleLang = () => {
    const next: Lang = lang === "ku" ? "en" : "ku";
    setLang(next);
    localStorage.setItem("moviesLang", next);
  };

  const fetchMovies = useCallback(
    async (
      p: number,
      media: "movie" | "tv",
      g: string,
      yr: string,
      rating: string,
      sort: SortKey,
    ) => {
      if (p === 1) setLoading(true);
      else setLoadingMore(true);
      try {
        let r: Response;
        const useDiscover =
          (g && g !== "all") ||
          yr !== "all" ||
          rating !== "all" ||
          sort !== "popular";
        if (useDiscover) {
          const gid =
            media === "tv" ? TV_GENRE_IDS[g] : MOVIE_GENRE_IDS[g];
          r = await tmdbFetch(`discover/${media}`, {
            language: "en-US",
            sort_by: sortByParam(sort, media),
            include_adult: false,
            // Top-rated needs a higher vote threshold to be meaningful.
            "vote_count.gte": sort === "top" ? 300 : 40,
            with_genres: g && g !== "all" && gid ? gid : undefined,
            [media === "tv" ? "first_air_date_year" : "primary_release_year"]:
              yr !== "all" ? yr : undefined,
            "vote_average.gte": rating !== "all" ? rating : undefined,
            page: p,
          });
        } else {
          r = await tmdbFetch(`${media}/popular`, { language: "en-US", page: p });
        }
        const data = await r.json();
        const items: Movie[] = (Array.isArray(data.results) ? data.results : [])
          .filter((x: TmdbSearchResult) => x.poster_path)
          .map((x: TmdbSearchResult) => mapTmdbResult({ ...x, media_type: media }));
        setTotalPages(Math.min(data.total_pages || 1, 200));
        if (p === 1) {
          setMovies(items);
          window.scrollTo({ top: 0, behavior: "smooth" });
        } else {
          /* append, de-duplicating by tmdb_id */
          setMovies((prev) => {
            const seen = new Set(prev.map((m) => m.tmdb_id));
            return [...prev, ...items.filter((m) => !seen.has(m.tmdb_id))];
          });
        }
      } catch {
        if (p === 1) setMovies([]);
      } finally {
        setLoading(false);
        setLoadingMore(false);
      }
    },
    [],
  );

  useEffect(() => {
    fetchMovies(page, mediaTab, genre, year, minRating, sortKey);
  }, [page, mediaTab, genre, year, minRating, sortKey, fetchMovies]);

  /* reset to first page when switching media tab or any filter */
  useEffect(() => {
    setPage(1);
  }, [mediaTab, genre, year, minRating, sortKey]);

  /* infinite scroll — load next page when sentinel scrolls into view */
  useEffect(() => {
    if (view === "search") return;
    const el = sentinelRef.current;
    if (!el) return;
    const io = new IntersectionObserver(
      (entries) => {
        if (
          entries[0].isIntersecting &&
          !loading &&
          !loadingMore &&
          page < totalPages
        ) {
          setPage((p) => p + 1);
        }
      },
      { rootMargin: "600px 0px" },
    );
    io.observe(el);
    return () => io.disconnect();
  }, [view, loading, loadingMore, page, totalPages]);



  const searchByImdbId = useCallback(async (imdbId: string) => {
    try {
      const r = await tmdbFetch(`find/${imdbId}`, {
        external_source: "imdb_id",
      });
      const d = await r.json();
      const tv = d?.tv_results?.[0];
      const mv = d?.movie_results?.[0];
      const result = mv || tv;
      if (result) {
        const isTv = !mv && !!tv;
        const movie: Movie = {
          tmdb_id: result.id,
          imdb_id: imdbId,
          media: isTv ? "tv" : "movie",
          title: result.title || result.name || result.original_title || result.original_name || imdbId,
          year: (result.release_date || result.first_air_date || "").slice(0, 4),
          poster_url: result.poster_path
            ? `https://image.tmdb.org/t/p/w500${result.poster_path}`
            : "",
          rating: result.vote_average ? String(result.vote_average) : "",
          genre: (result.genre_ids || []).map((g: number) => TMDB_GENRES[g]).filter(Boolean).join(", "),
          popularity: String(result.popularity || ""),
          type: isTv ? "tv" : "movie",
          embed_url: "",
        };
        setSelected(movie);
        return true;
      }
    } catch {
      /* ignore */
    }
    return false;
  }, []);

  // ---- POWERFUL CATALOG SEARCH (movies + TV series, full TMDB database) ----


  // Fetch all movies & series an actor/person appeared in (by their TMDB id).
  const searchPersonCredits = useCallback(async (personId: number): Promise<Movie[]> => {
    try {
      const r = await tmdbFetch(`person/${personId}/combined_credits`);
      const d = await r.json();
      const cast: TmdbSearchResult[] = Array.isArray(d.cast) ? d.cast : [];
      const crew: TmdbSearchResult[] = Array.isArray(d.crew) ? d.crew : [];
      const all = [...cast, ...crew];
      const seen = new Set<string>();
      return all
        .filter((m) => (m.media_type === "movie" || m.media_type === "tv") && m.poster_path)
        .filter((m) => {
          const key = `${m.media_type}-${m.id}`;
          if (seen.has(key)) return false;
          seen.add(key);
          return true;
        })
        .sort((a, b) => (b.popularity || 0) - (a.popularity || 0))
        .map((r) => ({ ...mapTmdbResult(r), fromActor: true }));
    } catch {
      return [];
    }
  }, []);

  const searchTmdb = useCallback(async (q: string): Promise<Movie[]> => {
    try {
      const r = await tmdbFetch("search/multi", {
        query: q,
        include_adult: false,
        language: "en-US",
        page: 1,
      });
      const d = await r.json();
      const list: TmdbSearchResult[] = Array.isArray(d.results) ? d.results : [];

      // Direct movie/series title matches.
      const titleMatches = list
        .filter((m) => (m.media_type === "movie" || m.media_type === "tv") && m.poster_path)
        .sort((a, b) => (b.popularity || 0) - (a.popularity || 0))
        .map(mapTmdbResult);

      // Actor / person matches → pull all their movies & series.
      const people = list
        .filter((m) => m.media_type === "person")
        .sort((a, b) => (b.popularity || 0) - (a.popularity || 0))
        .slice(0, 2);

      let personMovies: Movie[] = [];
      if (people.length > 0) {
        const creditLists = await Promise.all(
          people.map((p) => searchPersonCredits(p.id)),
        );
        personMovies = creditLists.flat();
      }

      // Merge, dedupe by media+id, keep title matches first.
      const merged: Movie[] = [];
      const seen = new Set<string>();
      for (const m of [...titleMatches, ...personMovies]) {
        const key = `${m.media}-${m.tmdb_id}`;
        if (seen.has(key)) continue;
        seen.add(key);
        merged.push(m);
      }
      return merged;
    } catch {
      return [];
    }
  }, [searchPersonCredits]);


  const clearSearch = useCallback(() => {
    setSearch("");
    setAiTitle(null);
    setSearchResults(null);
    inputRef.current?.focus();
  }, []);

  const runAiSearch = useCallback(async () => {
    const q = search.trim();
    if (!q) return;

    /* direct IMDB ID search → open the movie instantly */
    if (/^tt\d{6,}$/i.test(q)) {
      setAiSearching(true);
      const found = await searchByImdbId(q.toLowerCase());
      setAiSearching(false);
      if (!found) setAiTitle(lang === "ku" ? "IMDB ID نەدۆزرایەوە" : "IMDB ID not found");
      return;
    }

    setAiSearching(true);
    setAiTitle(null);
    try {
      let results = await searchTmdb(q);

      /* no hits → let AI fix typos / translate, then search again */
      if (results.length === 0) {
        try {
          const { data } = await supabase.functions.invoke("movies-ai", {
            body: { action: "resolve-title", query: q },
          });
          if (data?.title) {
            const fixed = await searchTmdb(data.title);
            if (fixed.length > 0) {
              setAiTitle(data.title);
              results = fixed;
            }
          }
        } catch {
          /* ignore — keep empty */
        }
      }
      setSearchResults(results);
    } finally {
      setAiSearching(false);
    }
  }, [search, searchByImdbId, searchTmdb, lang]);

  /* live (debounced) catalog search as the user types */
  useEffect(() => {
    const q = search.trim();
    if (!q) {
      setSearchResults(null);
      return;
    }
    if (/^tt\d{6,}$/i.test(q)) return; // handled on submit
    let cancelled = false;
    const id = setTimeout(async () => {
      setAiSearching(true);
      let results = await searchTmdb(q);
      /* no hits → auto AI typo-fix / translate, then search again */
      if (results.length === 0 && q.length >= 3) {
        try {
          const { data } = await supabase.functions.invoke("movies-ai", {
            body: { action: "resolve-title", query: q },
          });
          if (!cancelled && data?.title) {
            const fixed = await searchTmdb(data.title);
            if (fixed.length > 0) {
              setAiTitle(data.title);
              results = fixed;
            }
          }
        } catch {
          /* ignore — keep empty */
        }
      }
      if (!cancelled) {
        setSearchResults(results);
        setAiSearching(false);
      }
    }, 450);
    return () => {
      cancelled = true;
      clearTimeout(id);
    };
  }, [search, searchTmdb]);


  const searching = searchResults !== null;
  const baseList = searching ? searchResults! : movies;
  // The catalog is already filtered + sorted server-side via TMDB discover.
  // Free-text search results are filtered & sorted client-side here.
  const filtered = searching
    ? sortMovies(
        baseList.filter(
          (m) =>
            (genre === "all" ||
              (m.genre || "").toLowerCase().includes(genre.toLowerCase())) &&
            (year === "all" || m.year === year) &&
            (minRating === "all" ||
              (parseFloat(m.rating) || 0) >= parseFloat(minRating)),
        ),
        sortKey,
      )
    : baseList;


  return (
    <div
      dir={dir}
      className="mv-page"
      style={{
        minHeight: "100dvh",
        background: C.bg,
        color: C.text,
        fontFamily:
          "'Segoe UI', system-ui, 'Noto Sans Arabic', Tahoma, sans-serif",
      }}
    >
      <style>{GLOBAL_CSS}</style>
      <Helmet>
        <title>{lang === "ku" ? "فیلمەکان 🎬 - CENTRAL TECH PLATFORM" : "Movies 🎬 - CENTRAL TECH PLATFORM"}</title>
        <meta
          name="description"
          content={
            lang === "ku"
              ? "تازەترین فیلمەکان بە کوردی — گەڕان و سەیرکردنی فیلم."
              : "Latest movies — search and watch."
          }
        />
      </Helmet>

      {/* Slim Header */}
      <header
        style={{
          position: "sticky",
          top: 0,
          zIndex: 20,
          background: "rgba(10,10,15,0.9)",
          backdropFilter: "blur(14px)",
          borderBottom: `1px solid ${C.border}`,
          padding: "12px 16px",
        }}
      >
        <div
          style={{
            maxWidth: 1200,
            margin: "0 auto",
            display: "flex",
            alignItems: "center",
            gap: 12,
          }}
        >
          <button
            onClick={() => navigate("/")}
            style={{
              background: C.panel2,
              color: C.text,
              border: `1px solid ${C.border}`,
              borderRadius: 12,
              padding: "8px 14px",
              cursor: "pointer",
              fontSize: 14,
              fontWeight: 600,
            }}
          >
            {t.back}
          </button>
          <h1 style={{ fontSize: 23, fontWeight: 800, margin: 0, letterSpacing: ".5px" }}>
            <span style={{ color: C.gold }}>{t.title}</span>
            {t.titleSuffix} 🎬
          </h1>
          <button
            onClick={toggleLang}
            style={{
              marginInlineStart: "auto",
              background: C.panel2,
              color: C.gold,
              border: `1px solid ${C.gold}`,
              borderRadius: 999,
              padding: "7px 16px",
              cursor: "pointer",
              fontSize: 13.5,
              fontWeight: 800,
            }}
          >
            {lang === "ku" ? "English" : "کوردی"}
          </button>
        </div>
      </header>

      {/* Content */}
      <main style={{ maxWidth: 1200, margin: "0 auto", padding: "18px 10px 120px" }}>
        {/* ===== SEARCH VIEW ===== */}
        {view === "search" && (
          <>
            <div style={{ display: "flex", gap: 8, marginBottom: 16 }}>
              <div style={{ position: "relative", flex: 1 }}>
                <input
                  ref={inputRef}
                  value={search}
                  onChange={(e) => {
                    setSearch(e.target.value);
                    setAiTitle(null);
                  }}
                  onKeyDown={(e) => e.key === "Enter" && runAiSearch()}
                  placeholder={t.searchPlaceholder}
                  style={{
                    width: "100%",
                    background: C.panel,
                    border: `1px solid ${C.border}`,
                    borderRadius: 14,
                    padding: dir === "rtl" ? "12px 44px 12px 16px" : "12px 16px 12px 44px",
                    color: C.text,
                    fontSize: 15,
                    outline: "none",
                    boxSizing: "border-box",
                  }}
                />
                <span
                  style={{
                    position: "absolute",
                    insetInlineStart: 14,
                    top: "50%",
                    transform: "translateY(-50%)",
                    color: C.muted,
                    fontSize: 16,
                  }}
                >
                  🔍
                </span>
              </div>
              <button
                onClick={runAiSearch}
                disabled={aiSearching || !search.trim()}
                title={t.smartSearch}
                style={{
                  background: !search.trim()
                    ? "#1b1b27"
                    : "linear-gradient(135deg, #00E5FF 0%, #00BCD4 50%, #2979FF 100%)",
                  color: !search.trim() ? "#5a5a6e" : "#fff",
                  border: "none",
                  borderRadius: 14,
                  padding: "0 16px",
                  cursor: aiSearching ? "wait" : "pointer",
                  fontWeight: 800,
                  fontSize: 14,
                  whiteSpace: "nowrap",
                  display: "flex",
                  alignItems: "center",
                  gap: 8,
                  boxShadow: !search.trim()
                    ? "none"
                    : "0 0 16px rgba(0, 188, 212, 0.35), 0 4px 12px rgba(0, 0, 0, 0.25)",
                  transition: "all .25s ease",
                }}
              >
                {aiSearching ? (
                  <span
                    className="mv-spin"
                    style={{
                      width: 18,
                      height: 18,
                      border: "2.5px solid rgba(255,255,255,.3)",
                      borderTopColor: "#fff",
                      borderRadius: "50%",
                      display: "inline-block",
                    }}
                  />
                ) : (
                  <Bot size={20} strokeWidth={2.2} />
                )}
                <span>{t.smartSearch}</span>
              </button>
            </div>

            {aiTitle && (
              <div
                className="mv-fade"
                style={{
                  marginBottom: 14,
                  background: C.goldDim,
                  border: `1px solid ${C.gold}`,
                  borderRadius: 12,
                  padding: "8px 14px",
                  fontSize: 13.5,
                  color: C.gold,
                }}
              >
                🤖 {t.aiFound} <b>{aiTitle}</b>
              </div>
            )}

            {searching ? (
              <>
                <div
                  className="mv-fade"
                  style={{
                    display: "flex",
                    alignItems: "center",
                    justifyContent: "space-between",
                    gap: 12,
                    flexWrap: "wrap",
                    marginBottom: 16,
                  }}
                >
                  <div style={{ fontSize: 15, color: C.text }}>
                    <span style={{ color: C.muted }}>{t.searchResultsFor} </span>
                    <b style={{ color: C.gold }}>“{search.trim()}”</b>
                    {!aiSearching && (
                      <span style={{ color: C.muted }}>
                        {" "}— {filtered.length} {t.resultsCount}
                      </span>
                    )}
                  </div>
                  <button
                    onClick={clearSearch}
                    style={{
                      background: C.panel2,
                      color: C.text,
                      border: `1px solid ${C.border}`,
                      borderRadius: 999,
                      padding: "6px 14px",
                      fontSize: 13,
                      fontWeight: 700,
                      cursor: "pointer",
                    }}
                  >
                    {t.clearSearch}
                  </button>
                </div>
                <FilterControls
                  lang={lang}
                  t={t}
                  year={year}
                  setYear={setYear}
                  minRating={minRating}
                  setMinRating={setMinRating}
                  sortKey={sortKey}
                  setSortKey={setSortKey}
                />
              </>
            ) : (
              !aiSearching && (
                <div style={{ textAlign: "center", padding: "70px 0", color: C.muted }}>
                  <div style={{ fontSize: 52, marginBottom: 12 }}>🔍</div>
                  <div style={{ fontSize: 15 }}>{t.searchPlaceholder}</div>
                </div>
              )
            )}
          </>
        )}

        {/* ===== HOME VIEW ===== */}
        {view === "home" && (
          <>
            <Hero lang={lang} t={t} dir={dir} onSelect={(m) => setSelected(m)} />
            <TrendingRow lang={lang} t={t} onSelect={(m) => setSelected(m)} />
            <div
              style={{
                display: "flex",
                alignItems: "center",
                gap: 10,
                margin: "26px 0 16px",
              }}
            >
              <span
                style={{
                  display: "inline-block",
                  width: 4,
                  height: 26,
                  background: C.gold,
                  borderRadius: 4,
                }}
              />
              <h2 style={{ fontSize: 21, fontWeight: 900, margin: 0 }}>{t.latest} 🎬</h2>
            </div>
          </>
        )}

        {/* ===== MOVIE / TV VIEW ===== */}
        {(view === "movie" || view === "tv") && (
          <>
            <div
              style={{
                display: "flex",
                alignItems: "center",
                gap: 10,
                margin: "0 0 14px",
              }}
            >
              <span
                style={{
                  display: "inline-block",
                  width: 4,
                  height: 26,
                  background: C.gold,
                  borderRadius: 4,
                }}
              />
              <h2 style={{ fontSize: 21, fontWeight: 900, margin: 0 }}>
                {view === "tv" ? `${t.tabSeries} 📺` : `${t.tabMovies} 🎬`}
              </h2>
            </div>
            {/* Genre pills */}
            <div
              className="mv-genre mv-scroll"
              style={{
                display: "flex",
                gap: 8,
                overflowX: "auto",
                marginBottom: 18,
                paddingBottom: 2,
              }}
            >
              {GENRES.map((g) => {
                const active = genre === g.key;
                return (
                  <button
                    key={g.key}
                    onClick={() => setGenre(g.key)}
                    style={{
                      flexShrink: 0,
                      background: active ? C.gold : C.panel,
                      color: active ? "#0A0A0F" : C.muted,
                      border: `1px solid ${active ? C.gold : C.border}`,
                      borderRadius: 999,
                      padding: "7px 16px",
                      fontSize: 13.5,
                      fontWeight: 700,
                      cursor: "pointer",
                      transition: "all .2s",
                    }}
                  >
                    {lang === "ku" ? g.ku : g.en}
                  </button>
                );
              })}
            </div>
            {/* Year / rating / sort filters */}
            <FilterControls
              lang={lang}
              t={t}
              year={year}
              setYear={setYear}
              minRating={minRating}
              setMinRating={setMinRating}
              sortKey={sortKey}
              setSortKey={setSortKey}
            />
          </>
        )}




        {/* ===== FAVORITES VIEW ===== */}
        {view === "favorites" && (
          <FavoritesView t={t} onSelect={(m) => setSelected(m)} />
        )}

        {/* ===== SHARED GRID (home / movie / tv / search results) ===== */}
        {((view !== "search" && view !== "favorites") || searching) &&
          (loading || (aiSearching && filtered.length === 0) ? (
            <Grid>
              {Array.from({ length: 18 }).map((_, i) => (
                <div key={i}>
                  <div
                    className="mv-skel"
                    style={{ width: "100%", aspectRatio: "2/3", borderRadius: 14 }}
                  />
                  <div
                    className="mv-skel"
                    style={{ height: 12, borderRadius: 6, marginTop: 8, width: "80%" }}
                  />
                </div>
              ))}
            </Grid>
          ) : filtered.length === 0 ? (
            <div style={{ textAlign: "center", padding: "60px 0", color: C.muted }}>
              <div style={{ fontSize: 48, marginBottom: 10 }}>🎬</div>
              {t.noMovies}
            </div>
          ) : (
            <Grid>
              {filtered.map((m, i) => (
                    <MovieCard key={`${m.tmdb_id}-${i}`} movie={m} t={t} onClick={() => setSelected(m)} />
              ))}
            </Grid>
          ))}

        {/* Infinite scroll sentinel + loader (catalog views only) */}
        {view !== "search" && view !== "favorites" && !loading && filtered.length > 0 && (
          <>
            {loadingMore && (
              <Grid>
                {Array.from({ length: 6 }).map((_, i) => (
                  <div key={`more-${i}`}>
                    <div
                      className="mv-skel"
                      style={{ width: "100%", aspectRatio: "2/3", borderRadius: 14 }}
                    />
                    <div
                      className="mv-skel"
                      style={{ height: 12, borderRadius: 6, marginTop: 8, width: "80%" }}
                    />
                  </div>
                ))}
              </Grid>
            )}
            <div ref={sentinelRef} style={{ height: 1 }} aria-hidden />
            {page >= totalPages && (
              <div style={{ textAlign: "center", padding: "24px 0", color: C.muted, fontSize: 13 }}>
                ✦
              </div>
            )}
          </>
        )}
      </main>

      {/* ===== Bottom Navigation Bar ===== */}
      <nav
        style={{
          position: "fixed",
          bottom: 0,
          insetInlineStart: 0,
          insetInlineEnd: 0,
          zIndex: 30,
          background: "rgba(10,10,15,0.94)",
          backdropFilter: "blur(18px)",
          borderTop: `1px solid ${C.border}`,
          boxShadow: "0 -8px 24px rgba(0,0,0,.45)",
          paddingBottom: "env(safe-area-inset-bottom, 0px)",
        }}
      >
        <div
          style={{
            maxWidth: 600,
            margin: "0 auto",
            display: "flex",
            alignItems: "stretch",
            justifyContent: "space-around",
            padding: "8px 6px",
          }}
        >
          {([
            { key: "home", icon: "🏠", label: t.navHome },
            { key: "movie", icon: "🎬", label: t.navMovie },
            { key: "tv", icon: "📺", label: t.navSeries },
            { key: "favorites", icon: "❤️", label: t.navFav },
            { key: "search", icon: "🔍", label: t.navSearch },
          ] as const).map((item) => {
            const active = view === item.key;
            return (
              <button
                key={item.key}
                onClick={() => goView(item.key)}
                style={{
                  flex: 1,
                  display: "flex",
                  flexDirection: "column",
                  alignItems: "center",
                  gap: 4,
                  background: "transparent",
                  border: "none",
                  cursor: "pointer",
                  padding: "4px 2px",
                  transition: "all .2s",
                }}
              >
                <span
                  style={{
                    fontSize: 22,
                    lineHeight: 1,
                    filter: active ? "none" : "grayscale(.4)",
                    transform: active ? "translateY(-2px) scale(1.12)" : "none",
                    transition: "all .2s",
                  }}
                >
                  {item.icon}
                </span>
                <span
                  style={{
                    fontSize: 11.5,
                    fontWeight: active ? 900 : 600,
                    color: active ? C.gold : C.muted,
                  }}
                >
                  {item.label}
                </span>
              </button>
            );
          })}
        </div>
      </nav>


      {selected && (
        <MovieModal movie={selected} onClose={() => setSelected(null)} lang={lang} t={t} dir={dir} />
      )}
    </div>
  );
}

function Grid({ children }: { children: React.ReactNode }) {
  return (
    <div className="grid grid-cols-3 sm:grid-cols-4 lg:grid-cols-5 xl:grid-cols-6 gap-2 sm:gap-4">
      {children}
    </div>
  );
}

// ====== Discovery filter bar (year / rating / sort) ======
function FilterControls({
  lang,
  t,
  year,
  setYear,
  minRating,
  setMinRating,
  sortKey,
  setSortKey,
}: {
  lang: Lang;
  t: (typeof T)["ku"];
  year: string;
  setYear: (v: string) => void;
  minRating: string;
  setMinRating: (v: string) => void;
  sortKey: SortKey;
  setSortKey: (v: SortKey) => void;
}) {
  const active = year !== "all" || minRating !== "all" || sortKey !== "popular";
  return (
    <div
      className="mv-genre mv-scroll"
      style={{
        display: "flex",
        gap: 8,
        overflowX: "auto",
        marginBottom: 18,
        paddingBottom: 2,
        alignItems: "center",
      }}
    >
      <select
        value={sortKey}
        onChange={(e) => setSortKey(e.target.value as SortKey)}
        style={{ ...selectStyle, flexShrink: 0 }}
        aria-label={t.sortLabel}
      >
        {SORT_OPTIONS.map((o) => (
          <option key={o.key} value={o.key}>
            ⇅ {lang === "ku" ? o.ku : o.en}
          </option>
        ))}
      </select>
      <select
        value={year}
        onChange={(e) => setYear(e.target.value)}
        style={{ ...selectStyle, flexShrink: 0 }}
        aria-label={t.yearLabel}
      >
        <option value="all">📅 {t.anyYear}</option>
        {YEARS.map((y) => (
          <option key={y} value={y}>
            {y}
          </option>
        ))}
      </select>
      <select
        value={minRating}
        onChange={(e) => setMinRating(e.target.value)}
        style={{ ...selectStyle, flexShrink: 0 }}
        aria-label={t.ratingLabel}
      >
        <option value="all">★ {t.anyRating}</option>
        {RATING_OPTIONS.map((r) => (
          <option key={r} value={r}>
            ★ {r}+
          </option>
        ))}
      </select>
      {active && (
        <button
          onClick={() => {
            setYear("all");
            setMinRating("all");
            setSortKey("popular");
          }}
          style={{
            flexShrink: 0,
            background: C.panel2,
            color: C.muted,
            border: `1px solid ${C.border}`,
            borderRadius: 10,
            padding: "8px 14px",
            fontSize: 13,
            fontWeight: 700,
            cursor: "pointer",
            whiteSpace: "nowrap",
          }}
        >
          ✕ {t.resetFilters}
        </button>
      )}
    </div>
  );
}

function TrendingRow({
  lang,
  t,
  onSelect,
}: {
  lang: Lang;
  t: (typeof T)["ku"];
  onSelect: (m: Movie) => void;
}) {
  const [items, setItems] = useState<Movie[]>([]);

  useEffect(() => {
    let alive = true;
    (async () => {
      try {
        const r = await tmdbFetch("trending/all/day", { language: "en-US" });
        const d = await r.json();
        if (!alive) return;
        const list: Movie[] = (Array.isArray(d.results) ? d.results : [])
          .filter(
            (x: TmdbSearchResult) =>
              x.poster_path && (x.media_type === "movie" || x.media_type === "tv"),
          )
          .slice(0, 10)
          .map(mapTmdbResult);
        setItems(list);
      } catch {
        /* ignore */
      }
    })();
    return () => {
      alive = false;
    };
  }, []);

  if (items.length === 0) return null;

  return (
    <section style={{ marginBottom: 26 }}>
      <div
        style={{
          display: "flex",
          alignItems: "center",
          gap: 10,
          marginBottom: 14,
        }}
      >
        <span style={{ fontSize: 22 }}>🔥</span>
        <h2 style={{ fontSize: 21, fontWeight: 900, margin: 0 }}>
          {t.top10} · <span style={{ color: C.gold }}>{t.trendingToday}</span>
        </h2>
      </div>
      <div
        className="mv-scroll"
        style={{
          display: "flex",
          gap: 18,
          overflowX: "auto",
          paddingBottom: 10,
          paddingTop: 6,
          paddingInlineStart: 4,
        }}
      >
        {items.map((m, i) => {
          const isTv = m.media === "tv";
          return (
            <div
              key={`${m.tmdb_id}-${i}`}
              className="mv-card"
              onClick={() => onSelect(m)}
              style={{
                position: "relative",
                flexShrink: 0,
                width: 130,
                cursor: "pointer",
                display: "flex",
                alignItems: "flex-end",
              }}
            >
              {/* big rank number */}
              <span
                style={{
                  fontSize: 78,
                  fontWeight: 900,
                  lineHeight: 0.8,
                  color: "transparent",
                  WebkitTextStroke: `2.5px ${C.gold}`,
                  marginInlineEnd: -22,
                  marginInlineStart: -6,
                  zIndex: 1,
                  textShadow: "0 4px 18px rgba(0,0,0,.6)",
                  userSelect: "none",
                  fontFamily: "'Arial Black', system-ui, sans-serif",
                }}
              >
                {i + 1}
              </span>
              <div
                style={{
                  position: "relative",
                  width: 100,
                  aspectRatio: "2/3",
                  borderRadius: 12,
                  overflow: "hidden",
                  background: C.panel,
                  border: `1px solid ${C.border}`,
                  zIndex: 2,
                }}
              >
                <img
                  className="mv-poster-img"
                  src={m.poster_url}
                  alt={m.title}
                  loading="lazy"
                  style={{ width: "100%", height: "100%", objectFit: "cover" }}
                />
                <div
                  style={{
                    position: "absolute",
                    top: 6,
                    insetInlineStart: 6,
                    background: isTv ? "#2563eb" : "#e11d2a",
                    color: "#fff",
                    fontSize: 9.5,
                    fontWeight: 900,
                    padding: "2px 7px",
                    borderRadius: 6,
                    letterSpacing: ".5px",
                  }}
                >
                  {isTv ? "TV" : "MOVIE"}
                </div>
              </div>
            </div>
          );
        })}
      </div>
    </section>
  );
}


// ====== Featured Hero Carousel ======
interface HeroItem extends Movie {
  backdrop: string;
  overview: string;
}

function Hero({
  lang,
  t,
  dir,
  onSelect,
}: {
  lang: Lang;
  t: (typeof T)["ku"];
  dir: "rtl" | "ltr";
  onSelect: (m: Movie) => void;
}) {
  const [items, setItems] = useState<HeroItem[]>([]);
  const [idx, setIdx] = useState(0);

  useEffect(() => {
    let alive = true;
    (async () => {
      try {
        const r = await tmdbFetch("trending/all/week", { language: "en-US" });
        const d = await r.json();
        if (!alive) return;
        const list: HeroItem[] = (Array.isArray(d.results) ? d.results : [])
          .filter(
            (x: TmdbSearchResult & { backdrop_path?: string; overview?: string }) =>
              x.backdrop_path && (x.media_type === "movie" || x.media_type === "tv"),
          )
          .slice(0, 6)
          .map((x: TmdbSearchResult & { backdrop_path?: string; overview?: string }) => ({
            ...mapTmdbResult(x),
            backdrop: TMDB_BACKDROP + x.backdrop_path,
            overview: x.overview || "",
          }));
        setItems(list);
      } catch {
        /* ignore */
      }
    })();
    return () => {
      alive = false;
    };
  }, []);

  useEffect(() => {
    if (items.length < 2) return;
    const id = setInterval(() => setIdx((i) => (i + 1) % items.length), 5500);
    return () => clearInterval(id);
  }, [items.length]);

  if (items.length === 0) {
    return (
      <div
        className="mv-skel"
        style={{ width: "100%", aspectRatio: "16/8", borderRadius: 20, marginBottom: 22 }}
      />
    );
  }

  const cur = items[idx];

  return (
    <div
      style={{
        position: "relative",
        width: "100%",
        aspectRatio: "16/11",
        maxHeight: 360,
        borderRadius: 18,
        overflow: "hidden",
        marginBottom: 18,
        background: C.panel,
        border: `1px solid ${C.border}`,
      }}
    >
      {items.map((it, i) => (
        <img
          key={it.tmdb_id}
          src={it.backdrop}
          alt={it.title}
          style={{
            position: "absolute",
            inset: 0,
            width: "100%",
            height: "100%",
            objectFit: "cover",
            opacity: i === idx ? 1 : 0,
            transition: "opacity .8s ease",
          }}
        />
      ))}
      {/* Bottom-weighted gradient: strong only in the lower third so poster art stays visible */}
      <div
        style={{
          position: "absolute",
          inset: 0,
          background: `linear-gradient(to top, ${C.bg} 0%, rgba(10,10,15,.92) 22%, rgba(10,10,15,.45) 42%, rgba(10,10,15,.05) 62%, transparent 78%)`,
        }}
      />

      <div
        className="mv-fade"
        key={cur.tmdb_id}
        style={{
          position: "absolute",
          bottom: 0,
          insetInlineStart: 0,
          insetInlineEnd: 0,
          padding: "0 16px 14px",
          maxWidth: 560,
        }}
      >
        <div
          style={{
            display: "inline-flex",
            alignItems: "center",
            gap: 5,
            background: C.gold,
            color: "#0A0A0F",
            fontSize: 10,
            fontWeight: 900,
            padding: "3px 8px",
            borderRadius: 999,
            marginBottom: 8,
            letterSpacing: ".5px",
          }}
        >
          🔥 {t.featured}
        </div>
        <h2
          style={{
            margin: 0,
            fontSize: "clamp(17px, 4.6vw, 30px)",
            fontWeight: 900,
            lineHeight: 1.1,
            textShadow: "0 4px 24px rgba(0,0,0,.7)",
            display: "-webkit-box",
            WebkitLineClamp: 2,
            WebkitBoxOrient: "vertical",
            overflow: "hidden",
          }}
        >
          {cur.title}
        </h2>
        <div
          style={{
            display: "flex",
            gap: 8,
            alignItems: "center",
            marginTop: 6,
            fontSize: 11.5,
            color: C.text,
            flexWrap: "nowrap",
            overflow: "hidden",
            whiteSpace: "nowrap",
          }}
        >
          {cur.media === "tv" && (
            <span
              style={{
                background: "#2563eb",
                color: "#fff",
                fontSize: 10,
                fontWeight: 800,
                padding: "1px 6px",
                borderRadius: 5,
                flexShrink: 0,
              }}
            >
              📺 {t.tvTag}
            </span>
          )}
          {parseFloat(cur.rating) > 0 && (
            <span style={{ color: C.gold, fontWeight: 800, flexShrink: 0 }}>★ {parseFloat(cur.rating).toFixed(1)}</span>
          )}
          {cur.year && <span style={{ color: C.muted, flexShrink: 0 }}>{cur.year}</span>}
          {cur.genre && (
            <span style={{ color: C.muted, overflow: "hidden", textOverflow: "ellipsis" }}>
              {cur.genre.split(",")[0]}
            </span>
          )}
        </div>
        {cur.overview && (
          <p
            style={{
              margin: "8px 0 0",
              fontSize: 12,
              lineHeight: 1.45,
              color: C.muted,
              display: "-webkit-box",
              WebkitLineClamp: 2,
              WebkitBoxOrient: "vertical",
              overflow: "hidden",
            }}
          >
            {cur.overview}
          </p>
        )}
        <div style={{ display: "flex", gap: 8, marginTop: 10 }}>
          <button
            onClick={() => onSelect(cur)}
            style={{
              background: C.gold,
              color: "#0A0A0F",
              border: "none",
              borderRadius: 999,
              padding: "7px 18px",
              fontWeight: 900,
              fontSize: 12.5,
              cursor: "pointer",
            }}
          >
            {t.play}
          </button>
          <button
            onClick={() => onSelect(cur)}
            style={{
              background: "rgba(255,255,255,0.12)",
              color: C.text,
              border: `1px solid ${C.border}`,
              borderRadius: 999,
              padding: "7px 16px",
              fontWeight: 800,
              fontSize: 12.5,
              cursor: "pointer",
              backdropFilter: "blur(6px)",
            }}
          >
            ⓘ {t.details}
          </button>
        </div>
      </div>


      {/* dots */}
      <div
        style={{
          position: "absolute",
          bottom: 18,
          insetInlineEnd: 22,
          display: "flex",
          gap: 6,
        }}
      >
        {items.map((_, i) => (
          <button
            key={i}
            onClick={() => setIdx(i)}
            aria-label={`slide ${i + 1}`}
            style={{
              width: i === idx ? 22 : 8,
              height: 8,
              borderRadius: 999,
              border: "none",
              background: i === idx ? C.gold : "rgba(255,255,255,.4)",
              cursor: "pointer",
              transition: "all .3s",
            }}
          />
        ))}
      </div>
    </div>
  );
}



function FavoritesView({
  t,
  onSelect,
}: {
  t: Record<string, string>;
  onSelect: (m: Movie) => void;
}) {
  const favs = useFavoritesList();
  return (
    <>
      <div style={{ display: "flex", alignItems: "center", gap: 10, margin: "0 0 16px" }}>
        <span
          style={{ display: "inline-block", width: 4, height: 26, background: C.gold, borderRadius: 4 }}
        />
        <h2 style={{ fontSize: 21, fontWeight: 900, margin: 0 }}>{t.favTitle} ❤️</h2>
      </div>
      {favs.length === 0 ? (
        <div style={{ textAlign: "center", padding: "60px 0", color: C.muted }}>
          <div style={{ fontSize: 48, marginBottom: 10 }}>💔</div>
          {t.noFav}
        </div>
      ) : (
        <Grid>
          {favs.map((f) => {
            const movie: Movie = {
              tmdb_id: f.tmdb_id,
              imdb_id: f.imdb_id || "",
              media: f.media,
              title: f.title,
              year: f.year || "",
              poster_url: f.poster_url || "",
              rating: f.rating || "",
              genre: f.genre || "",
              popularity: "",
              type: f.media,
              embed_url: "",
            };
            return (
              <MovieCard
                key={`${f.media}-${f.tmdb_id}`}
                movie={movie}
                t={t}
                onClick={() => onSelect(movie)}
              />
            );
          })}
        </Grid>
      )}
    </>
  );
}

function FavButton({
  movie,
  t,
  size = "card",
}: {
  movie: Movie;
  t: Record<string, string>;
  size?: "card" | "modal";
}) {
  const [fav, toggle] = useFavorite({
    tmdb_id: movie.tmdb_id,
    imdb_id: movie.imdb_id,
    media: movie.media,
    title: movie.title,
    year: movie.year,
    poster_url: movie.poster_url,
    rating: movie.rating,
    genre: movie.genre,
  });
  const dim = size === "modal" ? 42 : 34;
  return (
    <button
      onClick={(e) => toggle(e)}
      aria-label={fav ? t.removeFav : t.addFav}
      title={fav ? t.removeFav : t.addFav}
      style={{
        width: dim,
        height: dim,
        borderRadius: "50%",
        background: fav ? C.gold : "rgba(0,0,0,.6)",
        border: `1px solid ${fav ? C.gold : "rgba(255,255,255,.2)"}`,
        display: "flex",
        alignItems: "center",
        justifyContent: "center",
        cursor: "pointer",
        backdropFilter: "blur(4px)",
        flexShrink: 0,
        transition: "all .2s",
      }}
    >
      <Heart
        size={size === "modal" ? 20 : 17}
        color={fav ? "#0A0A0F" : "#fff"}
        fill={fav ? "#0A0A0F" : "none"}
      />
    </button>
  );
}

function MovieCard({ movie, t, onClick }: { movie: Movie; t: Record<string, string>; onClick: () => void }) {
  const rating = parseFloat(movie.rating) || 0;
  const isTv = movie.media === "tv";
  return (
    <div className="mv-card mv-fade" onClick={onClick} style={{ cursor: "pointer" }}>
      <div
        style={{
          position: "relative",
          width: "100%",
          aspectRatio: "2/3",
          borderRadius: 14,
          overflow: "hidden",
          background: C.panel,
          border: `1px solid ${C.border}`,
        }}
      >
        <img
          className="mv-poster-img"
          src={movie.poster_url}
          alt={movie.title}
          loading="lazy"
          onError={(e) => {
            (e.target as HTMLImageElement).src =
              "data:image/svg+xml,%3Csvg xmlns='http://www.w3.org/2000/svg' width='200' height='300'%3E%3Crect width='100%25' height='100%25' fill='%2313131c'/%3E%3C/svg%3E";
          }}
          style={{ width: "100%", height: "100%", objectFit: "cover" }}
        />
        {/* MOVIE / TV tag (top-start) */}
        <div
          style={{
            position: "absolute",
            top: 8,
            insetInlineStart: 8,
            background: isTv ? "#2563eb" : "#e11d2a",
            color: "#fff",
            fontSize: 10.5,
            fontWeight: 900,
            padding: "3px 9px",
            borderRadius: 7,
            letterSpacing: ".6px",
            boxShadow: "0 2px 8px rgba(0,0,0,.45)",
          }}
        >
          {isTv ? "TV" : "MOVIE"}
        </div>
        {/* rating (top-end) */}
        {rating > 0 && (
          <div
            style={{
              position: "absolute",
              top: 8,
              insetInlineEnd: 8,
              background: "rgba(0,0,0,.78)",
              color: C.gold,
              fontSize: 11.5,
              fontWeight: 800,
              padding: "3px 8px",
              borderRadius: 8,
            }}
          >
            ★ {rating.toFixed(1)}
          </div>
        )}
        {/* Actor credit badge (bottom-start) */}
        {movie.fromActor && (
          <div
            style={{
              position: "absolute",
              bottom: 8,
              insetInlineStart: 8,
              background: "#10b981",
              color: "#fff",
              fontSize: 10.5,
              fontWeight: 900,
              padding: "3px 9px",
              borderRadius: 7,
              letterSpacing: ".6px",
              boxShadow: "0 2px 8px rgba(0,0,0,.45)",
            }}
          >
            {t.actorTag}
          </div>
        )}
        {/* favorite (bottom-end) */}
        <div style={{ position: "absolute", bottom: 8, insetInlineEnd: 8, zIndex: 2 }}>
          <FavButton movie={movie} t={t} />
        </div>
        {/* play overlay */}
        <div
          className="mv-play"
          style={{
            position: "absolute",
            inset: 0,
            display: "flex",
            alignItems: "center",
            justifyContent: "center",
          }}
        >
          <div
            style={{
              width: 54,
              height: 54,
              borderRadius: "50%",
              background: C.gold,
              display: "flex",
              alignItems: "center",
              justifyContent: "center",
              boxShadow: "0 6px 20px rgba(245,197,24,.5)",
            }}
          >
            <span style={{ color: "#0A0A0F", fontSize: 22, marginRight: -3 }}>▶</span>
          </div>
        </div>
      </div>
      <div style={{ marginTop: 9 }}>
        <div
          style={{
            fontSize: 14,
            fontWeight: 800,
            whiteSpace: "nowrap",
            overflow: "hidden",
            textOverflow: "ellipsis",
          }}
        >
          {movie.title}
        </div>
        <div
          style={{
            fontSize: 12,
            color: C.muted,
            marginTop: 2,
            display: "flex",
            gap: 8,
            whiteSpace: "nowrap",
            overflow: "hidden",
            textOverflow: "ellipsis",
          }}
        >
          {movie.year && <span>{movie.year}</span>}
          {(movie.genre || "").split(",")[0] && (
            <span style={{ opacity: 0.85 }}>· {(movie.genre || "").split(",")[0]}</span>
          )}
        </div>
      </div>
    </div>
  );
}



// ====== Modal ======
type Tab = "info" | "details" | "cast" | "ai" | "subs";

// Module-level cache so Details data is reused per TMDB id across modal opens.
const detailsCache = new Map<string, { data: TmdbDetails; ts: number }>();
const DETAILS_TTL = 60 * 60 * 1000; // 1 hour

// Cast photo with graceful fallback: shows initials when TMDB has no profile
// image or when the image fails to load (broken/blocked URL).
function CastAvatar({
  name,
  profilePath,
}: {
  name: string;
  profilePath: string | null;
}) {
  const [broken, setBroken] = useState(false);
  const showImg = !!profilePath && !broken;
  return (
    <div
      style={{
        width: "100%",
        aspectRatio: "2/3",
        borderRadius: 10,
        border: `1px solid ${C.border}`,
        overflow: "hidden",
        background: C.panel2,
        display: "flex",
        alignItems: "center",
        justifyContent: "center",
      }}
    >
      {showImg ? (
        <img
          src={TMDB_PROFILE + profilePath}
          alt={name}
          loading="lazy"
          onError={() => setBroken(true)}
          style={{ width: "100%", height: "100%", objectFit: "cover" }}
        />
      ) : (
        <span style={{ fontSize: 24, fontWeight: 800, color: C.muted, letterSpacing: 1 }}>
          {initialsFromName(name)}
        </span>
      )}
    </div>
  );
}





interface Subtitle {
  id: string;
  lang: string;
  langId: string;
  iso: string;
  name: string;
  format: string;
  rating: number;
  downloads: number;
  release: string;
  hi: boolean;
}

const SUPA_URL = import.meta.env.VITE_SUPABASE_URL;
const SUPA_KEY = import.meta.env.VITE_SUPABASE_PUBLISHABLE_KEY;

function MovieModal({
  movie,
  onClose,
  lang,
  t,
  dir,
}: {
  movie: Movie;
  onClose: () => void;
  lang: Lang;
  t: (typeof T)["ku"];
  dir: "rtl" | "ltr";
}) {
  const [tab, setTab] = useState<Tab>("info");
  const [backdrop, setBackdrop] = useState<string | null>(null);
  const [director, setDirector] = useState<string>("");
  const [cast, setCast] = useState<CastMember[]>([]);
  const [watch, setWatch] = useState(false);
  const [trailer, setTrailer] = useState<string | null>(null);
  const [trailerLoading, setTrailerLoading] = useState(false);
  const [trailerOpen, setTrailerOpen] = useState(false);
  const [aiInfo, setAiInfo] = useState<string>("");
  const [aiLoading, setAiLoading] = useState(false);
  const [aiError, setAiError] = useState<string>("");
  const [details, setDetails] = useState<TmdbDetails | null>(null);
  const [detailsLoading, setDetailsLoading] = useState(false);
  const [detailsError, setDetailsError] = useState<string>("");
  const detailsAutoRetried = useRef(false);
  const [subs, setSubs] = useState<Subtitle[] | null>(null);
  const [subsLoading, setSubsLoading] = useState(false);
  const [subsError, setSubsError] = useState<string>("");
  const [downloadingId, setDownloadingId] = useState<string>("");
  const [imdbId, setImdbId] = useState<string>(movie.imdb_id || "");

  const isTv = movie.media === "tv";
  const mediaPath = isTv ? "tv" : "movie";
  const [seasons, setSeasons] = useState<{ season_number: number; episode_count: number; name: string }[]>([]);
  const [season, setSeason] = useState(1);
  const [episode, setEpisode] = useState(1);

  const rating = parseFloat(movie.rating) || 0;

  useEffect(() => {
    document.body.style.overflow = "hidden";
    return () => {
      document.body.style.overflow = "";
    };
  }, []);

  // fetch TMDB details + credits (+ imdb id, + seasons for TV)
  useEffect(() => {
    let alive = true;
    (async () => {
      try {
        const r = await tmdbFetch(`${mediaPath}/${movie.tmdb_id}`, {
          append_to_response: "credits,external_ids",
        });
        const d = await r.json();
        if (!alive) return;
        if (d.backdrop_path) setBackdrop(TMDB_BACKDROP + d.backdrop_path);
        if (d.external_ids?.imdb_id) setImdbId(d.external_ids.imdb_id);
        else if (d.imdb_id) setImdbId(d.imdb_id);
        const dirCrew = d.credits?.crew?.find((c: { job: string }) => c.job === "Director");
        if (dirCrew) setDirector(dirCrew.name);
        if (!isTv && Array.isArray(d.credits?.cast)) setCast(d.credits.cast.slice(0, 18));
        if (isTv && Array.isArray(d.seasons)) {
          const ss = d.seasons.filter(
            (s: { season_number: number; episode_count: number }) =>
              s.season_number > 0 && s.episode_count > 0,
          );
          setSeasons(ss);
          if (ss.length > 0) setSeason(ss[0].season_number);
        }
      } catch {
        /* ignore */
      }
    })();
    return () => {
      alive = false;
    };
  }, [movie.tmdb_id, mediaPath, isTv]);

  // TV: fetch the cast from the aggregate credits (uses series-level credits)
  useEffect(() => {
    if (!isTv) return;
    let alive = true;
    (async () => {
      try {
        const r = await tmdbFetch(`tv/${movie.tmdb_id}/aggregate_credits`);
        const d = await r.json();
        if (!alive) return;
        if (Array.isArray(d.cast)) {
          setCast(
            d.cast.slice(0, 18).map((c: { id: number; name: string; profile_path: string | null; roles?: { character: string }[] }) => ({
              id: c.id,
              name: c.name,
              character: c.roles?.[0]?.character || "",
              profile_path: c.profile_path,
            })),
          );
        }
      } catch {
        /* ignore */
      }
    })();
    return () => {
      alive = false;
    };
  }, [movie.tmdb_id, isTv]);

  const loadTrailer = async () => {
    if (trailer) {
      setTrailerOpen(true);
      return;
    }
    setTrailerLoading(true);
    try {
      const r = await tmdbFetch(`${mediaPath}/${movie.tmdb_id}/videos`);
      const d = await r.json();
      const yt = (d.results || []).find(
        (v: { site: string; type: string }) =>
          v.site === "YouTube" && v.type === "Trailer",
      ) || (d.results || []).find((v: { site: string }) => v.site === "YouTube");
      if (yt) {
        setTrailer(yt.key);
        setTrailerOpen(true);
      } else {
        setTrailer("none");
      }
    } catch {
      setTrailer("none");
    } finally {
      setTrailerLoading(false);
    }
  };

  const loadAiInfo = async () => {
    setTab("ai");
    if (aiInfo || aiLoading) return;
    setAiLoading(true);
    setAiError("");
    try {
      const { data, error } = await supabase.functions.invoke("movies-ai", {
        body: {
          action: "info",
          title: movie.title,
          year: movie.year,
          genre: movie.genre,
          lang,
        },
      });
      if (error) throw error;
      setAiInfo(data?.info || t.noInfo);
    } catch {
      setAiError(t.aiError);
    } finally {
      setAiLoading(false);
    }
  };

  const loadDetails = useCallback(
    async (force = false) => {
      setTab("details");
      const cacheKey = `${mediaPath}:${movie.tmdb_id}`;
      if (!force) {
        if (detailsLoading) return;
        // Reuse cached details for this TMDB id if still fresh.
        const cached = detailsCache.get(cacheKey);
        if (cached && Date.now() - cached.ts < DETAILS_TTL) {
          setDetails(cached.data);
          setDetailsError("");
          return;
        }
        if (details) return;
      }
      setDetailsLoading(true);
      setDetailsError("");
      try {
        const r = await tmdbFetch(`${mediaPath}/${movie.tmdb_id}`, {
          append_to_response: "credits",
          language: "en-US",
        });
        const d = await r.json();
        if (!r.ok || !d || d.success === false) throw new Error("tmdb");
        detailsCache.set(cacheKey, { data: d as TmdbDetails, ts: Date.now() });
        setDetails(d as TmdbDetails);
        setDetailsError("");
        detailsAutoRetried.current = false;
      } catch {
        setDetailsError(t.detailsError);
      } finally {
        setDetailsLoading(false);
      }
    },
    [details, detailsLoading, mediaPath, movie.tmdb_id, t.detailsError],
  );

  const retryDetails = useCallback(() => {
    detailsAutoRetried.current = false;
    loadDetails(true);
  }, [loadDetails]);

  // Optional auto-retry once, shortly after a failure.
  useEffect(() => {
    if (!detailsError || detailsLoading || detailsAutoRetried.current) return;
    detailsAutoRetried.current = true;
    const id = setTimeout(() => loadDetails(true), 2500);
    return () => clearTimeout(id);
  }, [detailsError, detailsLoading, loadDetails]);




  const loadSubs = async () => {
    setTab("subs");
    if (subs || subsLoading || !imdbId) return;
    setSubsLoading(true);
    setSubsError("");
    try {
      const res = await fetch(
        `${SUPA_URL}/functions/v1/subtitles?action=search&imdb_id=${encodeURIComponent(
          imdbId,
        )}&langs=kur,ara,eng,all`,
        { headers: { apikey: SUPA_KEY, Authorization: `Bearer ${SUPA_KEY}` } },
      );
      const data = await res.json();
      setSubs(Array.isArray(data?.subtitles) ? data.subtitles : []);
    } catch {
      setSubsError(t.subsError);
    } finally {
      setSubsLoading(false);
    }
  };

  const downloadSub = async (s: Subtitle) => {
    setDownloadingId(s.id);
    try {
      const res = await fetch(
        `${SUPA_URL}/functions/v1/subtitles?action=download&id=${encodeURIComponent(
          s.id,
        )}&name=${encodeURIComponent(s.name || `${movie.title}.srt`)}`,
        {
          headers: { apikey: SUPA_KEY, Authorization: `Bearer ${SUPA_KEY}` },
        },
      );
      if (!res.ok) throw new Error("download failed");
      const blob = await res.blob();
      const href = URL.createObjectURL(blob);
      const a = document.createElement("a");
      a.href = href;
      a.download = s.name || `${movie.title}.srt`;
      document.body.appendChild(a);
      a.click();
      a.remove();
      URL.revokeObjectURL(href);
    } catch {
      setSubsError(t.subsError);
    } finally {
      setDownloadingId("");
    }
  };

  const tabs: { key: Tab; label: string }[] = [
    { key: "info", label: t.tabInfo },
    { key: "details", label: t.tabDetails },
    { key: "cast", label: t.tabCast },
    { key: "ai", label: t.tabAi },
    { key: "subs", label: t.tabSubs },
  ];


  return (
    <div
      dir={dir}
      onClick={onClose}
      style={{
        position: "fixed",
        inset: 0,
        zIndex: 100,
        background: "rgba(0,0,0,.8)",
        backdropFilter: "blur(8px)",
        display: "flex",
        alignItems: "flex-start",
        justifyContent: "center",
        overflowY: "auto",
        padding: "20px 12px",
      }}
    >
      <div
        className="mv-fade mv-scroll"
        onClick={(e) => e.stopPropagation()}
        style={{
          width: "100%",
          maxWidth: 760,
          background: C.panel,
          borderRadius: 20,
          overflow: "hidden",
          border: `1px solid ${C.border}`,
          boxShadow: "0 30px 80px rgba(0,0,0,.7)",
        }}
      >
        {/* Backdrop header */}
        <div style={{ position: "relative", width: "100%", aspectRatio: "16/8" }}>
          {backdrop ? (
            <img
              src={backdrop}
              alt={movie.title}
              style={{ width: "100%", height: "100%", objectFit: "cover" }}
            />
          ) : (
            <div className="mv-skel" style={{ width: "100%", height: "100%" }} />
          )}
          <div
            style={{
              position: "absolute",
              inset: 0,
              background: "linear-gradient(165deg, rgba(19,19,28,.10) 0%, rgba(19,19,28,.10) 55%, rgba(10,10,15,.92) 78%, rgba(10,10,15,.98) 100%)",
            }}
          />
          <button
            onClick={onClose}
            aria-label={t.close}
            style={{
              position: "absolute",
              top: 10,
              insetInlineEnd: 10,
              zIndex: 4,
              width: 28,
              height: 28,
              borderRadius: "50%",
              background: "rgba(0,0,0,.65)",
              backdropFilter: "blur(8px)",
              WebkitBackdropFilter: "blur(8px)",
              color: "#fff",
              border: "1px solid rgba(255,255,255,0.25)",
              cursor: "pointer",
              fontSize: 14,
              display: "flex",
              alignItems: "center",
              justifyContent: "center",
              boxShadow: "0 4px 12px rgba(0,0,0,.5)",
              transition: "transform .18s, background .18s, box-shadow .18s",
              lineHeight: 1,
              padding: 0,
            }}
            onMouseEnter={(e) => {
              e.currentTarget.style.background = "rgba(0,0,0,.85)";
              e.currentTarget.style.transform = "scale(1.08)";
              e.currentTarget.style.boxShadow = "0 6px 18px rgba(0,0,0,.6)";
            }}
            onMouseLeave={(e) => {
              e.currentTarget.style.background = "rgba(0,0,0,.65)";
              e.currentTarget.style.transform = "scale(1)";
              e.currentTarget.style.boxShadow = "0 4px 12px rgba(0,0,0,.5)";
            }}
            onMouseDown={(e) => {
              e.currentTarget.style.transform = "scale(0.92)";
            }}
            onMouseUp={(e) => {
              e.currentTarget.style.transform = "scale(1.08)";
            }}
          >
            ✕
          </button>
          <div style={{ position: "absolute", top: 46, insetInlineEnd: 12, zIndex: 4 }}>
            <FavButton movie={movie} t={t} size="modal" />
          </div>



          {/* poster + title */}
          <div
            style={{
              position: "absolute",
              bottom: 10,
              insetInlineEnd: 14,
              insetInlineStart: 14,
              display: "flex",
              gap: 12,
              alignItems: "flex-end",
            }}
          >
            <img
              src={movie.poster_url}
              alt={movie.title}
              style={{
                width: 90,
                borderRadius: 10,
                border: `2px solid ${C.border}`,
                flexShrink: 0,
                boxShadow: "0 8px 20px rgba(0,0,0,.5)",
              }}
            />
            <div style={{ paddingBottom: 2, minWidth: 0 }}>
              <h2
                style={{
                  margin: 0,
                  fontSize: 17,
                  fontWeight: 800,
                  lineHeight: 1.35,
                  display: "-webkit-box",
                  WebkitLineClamp: 2,
                  WebkitBoxOrient: "vertical",
                  overflow: "hidden",
                }}
              >
                {movie.title}
              </h2>
              <div
                style={{
                  display: "flex",
                  gap: 8,
                  flexWrap: "wrap",
                  marginTop: 4,
                  fontSize: 12,
                  color: C.muted,
                  alignItems: "center",
                }}
              >
                <span>{movie.year}</span>
                {rating > 0 && (
                  <span style={{ color: C.gold, fontWeight: 800 }}>★ {rating.toFixed(1)}</span>
                )}
                <span style={{ whiteSpace: "nowrap", overflow: "hidden", textOverflow: "ellipsis", maxWidth: "14ch" }}>
                  {(movie.genre || "").split(",").slice(0, 2).join("، ")}
                </span>
              </div>
              {director && (
                <div style={{ fontSize: 11.5, color: C.muted, marginTop: 2 }}>
                  {t.director} <span style={{ color: C.text }}>{director}</span>
                </div>
              )}
            </div>
          </div>
        </div>

        {/* Action buttons */}
        <div style={{ display: "flex", gap: 8, padding: "14px 16px 0" }}>
          <ActionBtn primary label={t.watch} ariaLabel="watch-now-player" onClick={() => setWatch(true)} />
          <ActionBtn
            label={trailerLoading ? "..." : t.trailer}
            onClick={loadTrailer}
            disabled={trailerLoading || trailer === "none"}
          />
          <ActionBtn label={t.aiInfo} onClick={loadAiInfo} />
          <ActionBtn label={t.subs} onClick={loadSubs} />
        </div>

        {/* TV: season & episode picker */}
        {isTv && seasons.length > 0 && (
          <div
            className="mv-fade"
            style={{
              display: "flex",
              gap: 10,
              flexWrap: "wrap",
              alignItems: "center",
              padding: "12px 16px 0",
            }}
          >
            <span style={{ fontSize: 13, color: C.muted, fontWeight: 700 }}>
              📺 {t.selectEpisode}:
            </span>
            <select
              value={season}
              onChange={(e) => {
                setSeason(Number(e.target.value));
                setEpisode(1);
              }}
              style={selectStyle}
            >
              {seasons.map((s) => (
                <option key={s.season_number} value={s.season_number}>
                  {t.season} {s.season_number}
                  {s.episode_count ? ` (${s.episode_count} ${t.episodesCount})` : ""}
                </option>
              ))}
            </select>
            <select
              value={episode}
              onChange={(e) => setEpisode(Number(e.target.value))}
              style={selectStyle}
            >
              {Array.from(
                { length: seasons.find((s) => s.season_number === season)?.episode_count || 1 },
                (_, i) => i + 1,
              ).map((ep) => (
                <option key={ep} value={ep}>
                  {t.episode} {ep}
                </option>
              ))}
            </select>
          </div>
        )}

        {/* IMDb mirror buttons — one Open + one Copy per server */}
        {imdbId && (
          <div
            style={{
              display: "flex",
              flexDirection: "column",
              gap: 6,
              padding: "10px 16px 0",
            }}
          >
            {IMDB_DOMAINS.map((d) => {
              const url = imdbTitleUrl(d.host, imdbId);
              return (
                <div key={d.host} style={{ display: "flex", gap: 6 }}>
                  <button
                    onClick={() => window.open(url, "_blank")}
                    style={{
                      flex: 1,
                      display: "flex",
                      alignItems: "center",
                      justifyContent: "center",
                      gap: 7,
                      background: `linear-gradient(135deg, ${d.accent}22, ${C.panel2})`,
                      color: C.text,
                      border: `1.5px solid ${d.accent}66`,
                      borderRadius: 10,
                      padding: "9px 10px",
                      cursor: "pointer",
                      fontWeight: 700,
                      fontSize: 13,
                      transition: "transform .15s",
                    }}
                    onMouseDown={(e) => (e.currentTarget.style.transform = "scale(0.97)")}
                    onMouseUp={(e) => (e.currentTarget.style.transform = "scale(1)")}
                  >
                    <Play size={14} color={d.accent} fill={d.accent} style={{ flexShrink: 0 }} />
                    <span>
                      {t.openOn} {d.name}
                    </span>
                  </button>
                  <button
                    onClick={async () => {
                      try {
                        await navigator.clipboard.writeText(url);
                        toast.success(t.linkCopied);
                      } catch {
                        toast.error(
                          lang === "ku" ? "کۆپی کردن سەرکەوتوو نەبوو" : "Copy failed",
                        );
                      }
                    }}
                    title={`${t.copy} ${d.name}`}
                    style={{
                      display: "flex",
                      alignItems: "center",
                      justifyContent: "center",
                      gap: 5,
                      minWidth: 78,
                      background: C.panel2,
                      color: d.accent,
                      border: `1px solid ${d.accent}55`,
                      borderRadius: 10,
                      padding: "9px 8px",
                      cursor: "pointer",
                      fontWeight: 700,
                      fontSize: 12,
                      transition: "transform .15s",
                    }}
                    onMouseDown={(e) => (e.currentTarget.style.transform = "scale(0.97)")}
                    onMouseUp={(e) => (e.currentTarget.style.transform = "scale(1)")}
                  >
                    <span>📋</span>
                    <span>{t.copy}</span>
                  </button>
                </div>
              );
            })}
          </div>

        )}
        {trailer === "none" && (
          <div style={{ padding: "8px 16px 0", fontSize: 12.5, color: C.muted }}>
            {t.noTrailer}
          </div>
        )}

        {/* Tabs */}
        <div
          style={{
            display: "flex",
            gap: 4,
            padding: "14px 16px 0",
            borderBottom: `1px solid ${C.border}`,
          }}
        >
          {tabs.map((tb) => (
            <button
              key={tb.key}
              onClick={() =>
                tb.key === "ai"
                  ? loadAiInfo()
                  : tb.key === "details"
                    ? loadDetails()
                    : setTab(tb.key)
              }
              style={{
                background: "none",
                border: "none",
                color: tab === tb.key ? C.gold : C.muted,
                fontWeight: 800,
                fontSize: 14,
                padding: "8px 12px",
                cursor: "pointer",
                borderBottom: `2px solid ${tab === tb.key ? C.gold : "transparent"}`,
                marginBottom: -1,
              }}
            >
              {tb.label}
            </button>
          ))}
        </div>

        {/* Tab content */}
        <div style={{ padding: 16, minHeight: 160 }}>
          {tab === "info" && (
            <div
              style={{
                display: "grid",
                gridTemplateColumns: "repeat(auto-fit, minmax(140px,1fr))",
                gap: 10,
              }}
            >
              <InfoCell label={t.fTitle} value={movie.title} />
              <InfoCell label={t.fYear} value={movie.year} />
              <InfoCell label={t.fRating} value={rating > 0 ? `★ ${rating.toFixed(1)}` : "—"} />
              <InfoCell label={t.fGenre} value={movie.genre || "—"} />
              <InfoCell label="IMDB ID" value={imdbId || "—"} />
              <InfoCell label="TMDB ID" value={String(movie.tmdb_id)} />
            </div>
          )}

          {tab === "details" && (
            <div>
              {detailsLoading ? (
                <div style={{ display: "flex", flexDirection: "column", gap: 12 }}>
                  <div className="mv-skel" style={{ height: 16, width: "40%", borderRadius: 8 }} />
                  <div className="mv-skel" style={{ height: 70, width: "100%", borderRadius: 10 }} />
                  <div
                    style={{
                      display: "grid",
                      gridTemplateColumns: "repeat(auto-fit, minmax(140px,1fr))",
                      gap: 10,
                    }}
                  >
                    {Array.from({ length: 4 }).map((_, i) => (
                      <div key={i} className="mv-skel" style={{ height: 52, borderRadius: 12 }} />
                    ))}
                  </div>
                  <div
                    style={{
                      display: "grid",
                      gridTemplateColumns: "repeat(auto-fill, minmax(90px,1fr))",
                      gap: 12,
                    }}
                  >
                    {Array.from({ length: 6 }).map((_, i) => (
                      <div key={i} className="mv-skel" style={{ aspectRatio: "2/3", borderRadius: 10 }} />
                    ))}
                  </div>
                </div>
              ) : detailsError ? (
                <div
                  style={{
                    display: "flex",
                    flexDirection: "column",
                    alignItems: "flex-start",
                    gap: 12,
                  }}
                >
                  <div style={{ color: "#ff6b6b", fontSize: 14 }}>{detailsError}</div>
                  <button
                    onClick={retryDetails}
                    disabled={detailsLoading}
                    style={{
                      display: "inline-flex",
                      alignItems: "center",
                      gap: 7,
                      background: C.goldDim,
                      color: C.gold,
                      border: `1px solid ${C.gold}`,
                      borderRadius: 10,
                      padding: "8px 16px",
                      fontSize: 13,
                      fontWeight: 700,
                      cursor: detailsLoading ? "default" : "pointer",
                      opacity: detailsLoading ? 0.6 : 1,
                    }}
                  >
                    <RotateCcw size={14} />
                    {t.retry}
                  </button>
                  {!detailsAutoRetried.current && (
                    <div style={{ color: C.muted, fontSize: 12 }}>{t.autoRetrying}</div>
                  )}
                </div>
              ) : details ? (
                (() => {
                  const runtime = pickRuntime(isTv, details);
                  const releaseDate = pickReleaseDate(isTv, details);
                  const languageName = (() => {
                    const code = details.original_language;
                    if (!code) return "";
                    try {
                      return (
                        new Intl.DisplayNames([lang === "ku" ? "en" : lang], {
                          type: "language",
                        }).of(code) || code.toUpperCase()
                      );
                    } catch {
                      return code.toUpperCase();
                    }
                  })();
                  const country = (details.production_countries || [])
                    .map((c) => c.name)
                    .filter(Boolean)
                    .join(", ");
                  const director = isTv
                    ? ""
                    : details.credits?.crew?.find((c) => c.job === "Director")?.name || "";
                  const creators = isTv
                    ? (details.created_by || []).map((c) => c.name).filter(Boolean).join(", ")
                    : "";
                  const topCast = (details.credits?.cast || []).slice(0, 6);
                  const tvInfo = isTv ? tvSummary(details) : null;
                  const nextEp = isTv ? nextEpisode(details) : null;

                  const cells: { label: string; value: string }[] = [];
                  if (runtime && runtime > 0)
                    cells.push({ label: t.dRuntime, value: `${runtime} ${t.dMinutes}` });
                  if (releaseDate)
                    cells.push({
                      label: isTv ? t.dFirstAir : t.dReleaseDate,
                      value: releaseDate,
                    });
                  if (languageName) cells.push({ label: t.dLanguage, value: languageName });
                  if (country) cells.push({ label: t.dCountry, value: country });
                  if (director) cells.push({ label: t.dDirector, value: director });
                  if (creators) cells.push({ label: t.dCreator, value: creators });

                  return (
                    <div style={{ display: "flex", flexDirection: "column", gap: 16 }}>
                      {details.overview && (
                        <div>
                          <div style={{ fontSize: 11.5, color: C.muted, marginBottom: 5 }}>
                            {t.dOverview}
                          </div>
                          <div
                            style={{
                              fontSize: 14,
                              lineHeight: 1.75,
                              color: C.text,
                              background: C.panel2,
                              border: `1px solid ${C.border}`,
                              borderRadius: 12,
                              padding: "12px 14px",
                            }}
                          >
                            {details.overview}
                          </div>
                        </div>
                      )}

                      {cells.length > 0 && (
                        <div
                          style={{
                            display: "grid",
                            gridTemplateColumns: "repeat(auto-fit, minmax(140px,1fr))",
                            gap: 10,
                          }}
                        >
                          {cells.map((c) => (
                            <InfoCell key={c.label} label={c.label} value={c.value} />
                          ))}
                        </div>
                      )}

                      {tvInfo && (
                        <div>
                          <div style={{ fontSize: 11.5, color: C.muted, marginBottom: 8 }}>
                            {t.dSeriesInfo}
                          </div>
                          <div
                            style={{
                              display: "grid",
                              gridTemplateColumns: "repeat(auto-fit, minmax(120px,1fr))",
                              gap: 10,
                            }}
                          >
                            {tvInfo.seasons > 0 && (
                              <InfoCell label={t.dSeasons} value={String(tvInfo.seasons)} />
                            )}
                            {tvInfo.episodes > 0 && (
                              <InfoCell label={t.dEpisodes} value={String(tvInfo.episodes)} />
                            )}
                            {tvInfo.runtime && tvInfo.runtime > 0 && (
                              <InfoCell
                                label={t.dEpisodeRuntime}
                                value={`${tvInfo.runtime} ${t.dMinutes}`}
                              />
                            )}
                            {tvInfo.status && (
                              <InfoCell label={t.dStatus} value={tvInfo.status} />
                            )}
                          </div>
                        </div>
                      )}

                      {isTv && (
                        <div>
                          <div style={{ fontSize: 11.5, color: C.muted, marginBottom: 8 }}>
                            {t.dNextEpisode}
                          </div>
                          {nextEp ? (
                            <div
                              style={{
                                background: C.panel2,
                                border: `1px solid ${C.border}`,
                                borderRadius: 12,
                                padding: "12px 14px",
                                display: "flex",
                                flexDirection: "column",
                                gap: 4,
                              }}
                            >
                              <div
                                style={{
                                  display: "flex",
                                  alignItems: "center",
                                  gap: 8,
                                  flexWrap: "wrap",
                                }}
                              >
                                {nextEp.code && (
                                  <span
                                    style={{
                                      background: C.goldDim,
                                      color: C.gold,
                                      borderRadius: 8,
                                      padding: "2px 8px",
                                      fontSize: 12,
                                      fontWeight: 800,
                                    }}
                                  >
                                    {nextEp.code}
                                  </span>
                                )}
                                {nextEp.name && (
                                  <span style={{ fontSize: 14, fontWeight: 700, color: C.text }}>
                                    {nextEp.name}
                                  </span>
                                )}
                              </div>
                              {nextEp.airDate && (
                                <div style={{ fontSize: 12.5, color: C.muted }}>
                                  📅 {nextEp.airDate}
                                </div>
                              )}
                            </div>
                          ) : (
                            <div style={{ fontSize: 13, color: C.muted }}>{t.dNoNext}</div>
                          )}
                        </div>
                      )}


                      {topCast.length > 0 && (
                        <div>
                          <div style={{ fontSize: 11.5, color: C.muted, marginBottom: 8 }}>
                            {t.dCastLabel}
                          </div>
                          <div
                            style={{
                              display: "grid",
                              gridTemplateColumns: "repeat(auto-fill, minmax(90px,1fr))",
                              gap: 12,
                            }}
                          >
                            {topCast.map((c) => (
                              <div key={c.id} style={{ textAlign: "center" }}>
                                <CastAvatar name={c.name} profilePath={c.profile_path} />
                                <div style={{ fontSize: 12, fontWeight: 700, marginTop: 5 }}>
                                  {c.name}
                                </div>
                                {c.character && (
                                  <div style={{ fontSize: 11, color: C.muted }}>{c.character}</div>
                                )}
                              </div>
                            ))}
                          </div>
                        </div>
                      )}

                      {!details.overview &&
                        cells.length === 0 &&
                        topCast.length === 0 &&
                        !tvInfo &&
                        !isTv && (
                        <div style={{ color: C.muted, fontSize: 14 }}>{t.noInfo}</div>
                      )}
                    </div>
                  );
                })()
              ) : (
                <div style={{ color: C.muted, fontSize: 14 }}>{t.detailsLoading}</div>
              )}
            </div>
          )}



          {tab === "cast" && (
            <div>
              {cast.length === 0 ? (
                <div style={{ color: C.muted, fontSize: 14 }}>{t.noCast}</div>
              ) : (
                <div
                  style={{
                    display: "grid",
                    gridTemplateColumns: "repeat(auto-fill, minmax(90px,1fr))",
                    gap: 12,
                  }}
                >
                  {cast.map((c) => (
                    <div key={c.id} style={{ textAlign: "center" }}>
                      <img
                        src={
                          c.profile_path
                            ? TMDB_PROFILE + c.profile_path
                            : "data:image/svg+xml,%3Csvg xmlns='http://www.w3.org/2000/svg' width='100' height='150'%3E%3Crect width='100%25' height='100%25' fill='%231b1b27'/%3E%3Ctext x='50%25' y='50%25' font-size='40' fill='%239a9aae' text-anchor='middle' dy='.35em'%3E%3F%3C/text%3E%3C/svg%3E"
                        }
                        alt={c.name}
                        loading="lazy"
                        style={{
                          width: "100%",
                          aspectRatio: "2/3",
                          objectFit: "cover",
                          borderRadius: 10,
                          border: `1px solid ${C.border}`,
                        }}
                      />
                      <div style={{ fontSize: 12, fontWeight: 700, marginTop: 5 }}>{c.name}</div>
                      <div style={{ fontSize: 11, color: C.muted }}>{c.character}</div>
                    </div>
                  ))}
                </div>
              )}
            </div>
          )}

          {tab === "ai" && (
            <div>
              {aiLoading ? (
                <div style={{ textAlign: "center", padding: "30px 0", color: C.muted }}>
                  <span
                    className="mv-spin"
                    style={{
                      width: 30,
                      height: 30,
                      border: `3px solid ${C.border}`,
                      borderTopColor: C.gold,
                      borderRadius: "50%",
                      display: "inline-block",
                      marginBottom: 10,
                    }}
                  />
                  <div>{t.aiWriting}</div>
                </div>
              ) : aiError ? (
                <div style={{ color: "#ff6b6b", fontSize: 14 }}>{aiError}</div>
              ) : (
                <div
                  dir={lang === "ku" ? "rtl" : "ltr"}
                  style={{
                    fontSize: 14.5,
                    lineHeight: 2,
                    color: C.text,
                    whiteSpace: "pre-wrap",
                  }}
                >
                  {aiInfo}
                </div>
              )}
            </div>
          )}

          {tab === "subs" && (
            <div>
              <div style={{ fontSize: 12, color: C.muted, marginBottom: 12 }}>
                {t.subsHint}
              </div>
              {subsLoading ? (
                <div style={{ textAlign: "center", padding: "30px 0", color: C.muted }}>
                  <span
                    className="mv-spin"
                    style={{
                      width: 30,
                      height: 30,
                      border: `3px solid ${C.border}`,
                      borderTopColor: C.gold,
                      borderRadius: "50%",
                      display: "inline-block",
                      marginBottom: 10,
                    }}
                  />
                  <div>{t.subsLoading}</div>
                </div>
              ) : subsError ? (
                <div style={{ color: "#ff6b6b", fontSize: 14 }}>{subsError}</div>
              ) : subs && subs.length === 0 ? (
                <div style={{ color: C.muted, fontSize: 14 }}>{t.subsNone}</div>
              ) : (
                <div style={{ display: "flex", flexDirection: "column", gap: 8 }}>
                  {(subs || []).map((s) => (
                    <div
                      key={s.id}
                      style={{
                        display: "flex",
                        alignItems: "center",
                        gap: 10,
                        background: C.panel2,
                        border: `1px solid ${C.border}`,
                        borderRadius: 12,
                        padding: "10px 12px",
                      }}
                    >
                      <span
                        style={{
                          flexShrink: 0,
                          background: C.gold,
                          color: "#0A0A0F",
                          fontWeight: 800,
                          fontSize: 11,
                          padding: "3px 8px",
                          borderRadius: 999,
                          textTransform: "uppercase",
                        }}
                      >
                        {s.iso || s.langId}
                      </span>
                      <div style={{ minWidth: 0, flex: 1 }}>
                        <div
                          style={{
                            fontSize: 13,
                            fontWeight: 700,
                            whiteSpace: "nowrap",
                            overflow: "hidden",
                            textOverflow: "ellipsis",
                          }}
                          title={s.name}
                        >
                          {s.name}
                        </div>
                        <div style={{ fontSize: 11, color: C.muted, marginTop: 2 }}>
                          {s.lang} · ⬇ {s.downloads.toLocaleString()}
                          {s.rating > 0 ? ` · ★ ${s.rating.toFixed(1)}` : ""}
                          {s.hi ? " · HI" : ""}
                        </div>
                      </div>
                      <button
                        onClick={() => downloadSub(s)}
                        disabled={downloadingId === s.id}
                        style={{
                          flexShrink: 0,
                          background: C.gold,
                          color: "#0A0A0F",
                          border: "none",
                          borderRadius: 10,
                          padding: "8px 14px",
                          fontWeight: 800,
                          fontSize: 12.5,
                          cursor: downloadingId === s.id ? "wait" : "pointer",
                          opacity: downloadingId === s.id ? 0.6 : 1,
                        }}
                      >
                        {downloadingId === s.id ? t.downloading : t.download}
                      </button>
                    </div>
                  ))}
                </div>
              )}
            </div>
          )}
        </div>
      </div>

      {/* Watch player */}
      {watch && (
        <PlayerOverlay
          title={movie.title}
          playerLabel={t.inAppPlayer}
          serversTitleLabel={t.serversLabel}
          autoSwitchLabel={t.autoSwitch}
          servers={[
            // Primary: IMDB embed hosts (/embed/movie|tv/...)
            ...(imdbId
              ? IMDB_DOMAINS.map((d) => ({
                  name: d.name,
                  url: imdbPlayerUrl(d.host, imdbId, movie.media, season, episode),
                  accent: d.accent,
                }))
              : []),
            // Fallback 1: TMDB-based providers (used automatically if /embed/ fails)
            {
              name: "VidAPI",
              url: isTv
                ? `https://vidapi.ru/embed/tv/${movie.tmdb_id}/${season}/${episode}`
                : `https://vidapi.ru/embed/movie/${movie.tmdb_id}`,
              accent: "#00BCD4",
            },
            {
              name: "VidSrc",
              url: isTv
                ? `https://vidsrc.to/embed/tv/${movie.tmdb_id}/${season}/${episode}`
                : `https://vidsrc.to/embed/movie/${movie.tmdb_id}`,
              accent: "#F59E0B",
            },
            {
              name: "2Embed",
              url: isTv
                ? `https://www.2embed.cc/embedtv/${movie.tmdb_id}&s=${season}&e=${episode}`
                : `https://www.2embed.cc/embed/${movie.tmdb_id}`,
              accent: "#A855F7",
            },
            // Fallback 2: IMDB /title/ landing URL (last resort, if embed paths break)
            ...(imdbId
              ? [
                  {
                    name: "IMDb Title",
                    url: imdbTitleUrl(IMDB_DOMAINS[0].host, imdbId),
                    accent: "#EAB308",
                  },
                ]
              : []),
          ]}
          onClose={() => setWatch(false)}
          closeLabel={t.close}
          hint={t.autoSwitchHint}
        />
      )}
      {/* Trailer player */}
      {trailerOpen && trailer && trailer !== "none" && (
        <PlayerOverlay
          title={movie.title}
          playerLabel={t.inAppPlayer}
          src={`https://www.youtube.com/embed/${trailer}?autoplay=1`}
          onClose={() => setTrailerOpen(false)}
          closeLabel={t.close}
        />
      )}
    </div>
  );
}

function PlayerOverlay({
  src,
  servers,
  onClose,
  closeLabel,
  serverLabel,
  hint,
  title,
  playerLabel,
  serversTitleLabel,
  autoSwitchLabel,
}: {
  src?: string;
  servers?: { name: string; url: string; accent?: string }[];
  onClose: () => void;
  closeLabel: string;
  serverLabel?: string;
  hint?: string;
  title?: string;
  playerLabel?: string;
  serversTitleLabel?: string;
  autoSwitchLabel?: string;
}) {
  const [active, setActive] = useState(0);
  const [loaded, setLoaded] = useState(false);
  const [autoTrying, setAutoTrying] = useState(false);
  const [reloadKey, setReloadKey] = useState(0);
  // Indices of servers that failed to load (timeout / error). We skip these
  // during automatic failover so we never get stuck retrying a dead server.
  const [failed, setFailed] = useState<number[]>([]);
  const [allFailed, setAllFailed] = useState(false);
  const [isFullscreen, setIsFullscreen] = useState(false);
  const loadedRef = useRef(false);
  const failedRef = useRef<Set<number>>(new Set());
  const videoRef = useRef<HTMLDivElement>(null);
  const list = servers && servers.length > 0 ? servers : [];
  // Clamp the index defensively so we never read an out-of-range server.
  const safeActive = clampIndex(active, list.length);
  const currentSrc = list.length > 0 ? list[safeActive]?.url ?? "" : src || "";

  // Mark the active server as failed and jump to the next server that hasn't
  // failed yet, searching forward and wrapping around the list. Applies even
  // after a manual pick: if the chosen server dies we still fail over.
  const failover = useCallback(() => {
    if (loadedRef.current || list.length <= 1) return;
    failedRef.current.add(safeActive);
    const next = nextAvailableServer(safeActive, list.length, failedRef.current);
    setFailed(Array.from(failedRef.current));
    if (next >= 0) {
      setAutoTrying(true);
      loadedRef.current = false;
      setLoaded(false);
      setActive(next);
    } else {
      // Every server failed — stop trying and surface the error state.
      setAutoTrying(false);
      setAllFailed(true);
    }
  }, [list.length, safeActive]);

  // Watchdog: if the active server doesn't load within a few seconds (blocked /
  // X-Frame-Options / network stall), trigger automatic failover.
  useEffect(() => {
    if (list.length === 0) return;
    loadedRef.current = false;
    setLoaded(false);
    const timer = setTimeout(() => {
      if (!loadedRef.current) failover();
    }, 8000);
    return () => clearTimeout(timer);
  }, [safeActive, currentSrc, reloadKey, list.length, failover]);

  // User manually selects a server: clear its failed flag so it can be retried,
  // reset load tracking, and keep automatic failover active.
  const pickServer = (i: number) => {
    failedRef.current.delete(i);
    setFailed(Array.from(failedRef.current));
    setAllFailed(false);
    setAutoTrying(false);
    loadedRef.current = false;
    setLoaded(false);
    setActive(i);
  };

  const reload = () => {
    failedRef.current.delete(safeActive);
    setFailed(Array.from(failedRef.current));
    setAllFailed(false);
    loadedRef.current = false;
    setLoaded(false);
    setReloadKey((k) => k + 1);
  };

  const toggleFullscreen = () => {
    const doc = document as Document & {
      webkitFullscreenElement?: Element | null;
      webkitExitFullscreen?: () => void;
    };
    const fsEl = document.fullscreenElement || doc.webkitFullscreenElement;
    if (fsEl) {
      if (document.exitFullscreen) document.exitFullscreen().catch(() => {});
      else if (doc.webkitExitFullscreen) doc.webkitExitFullscreen();
      return;
    }
    const el = videoRef.current as (HTMLDivElement & {
      webkitRequestFullscreen?: () => Promise<void>;
      webkitEnterFullscreen?: () => void;
    }) | null;
    if (!el) return;
    if (el.requestFullscreen) el.requestFullscreen().catch(() => {});
    else if (el.webkitRequestFullscreen) el.webkitRequestFullscreen();
    else if (el.webkitEnterFullscreen) el.webkitEnterFullscreen();
  };

  useEffect(() => {
    const doc = document as Document & { webkitFullscreenElement?: Element | null };
    const onChange = () =>
      setIsFullscreen(!!(document.fullscreenElement || doc.webkitFullscreenElement));
    document.addEventListener("fullscreenchange", onChange);
    document.addEventListener("webkitfullscreenchange", onChange);
    return () => {
      document.removeEventListener("fullscreenchange", onChange);
      document.removeEventListener("webkitfullscreenchange", onChange);
    };
  }, []);


  const circleBtnStyle: React.CSSProperties = {
    width: 42,
    height: 42,
    borderRadius: "50%",
    background: C.panel2,
    border: `1px solid ${C.border}`,
    color: C.text,
    display: "flex",
    alignItems: "center",
    justifyContent: "center",
    cursor: "pointer",
    flexShrink: 0,
  };

  return (
    <div
      onClick={onClose}
      style={{
        position: "fixed",
        inset: 0,
        zIndex: 200,
        background: "rgba(0,0,0,.92)",
        display: "flex",
        alignItems: "center",
        justifyContent: "center",
        padding: 12,
      }}
    >
      <div
        onClick={(e) => e.stopPropagation()}
        style={{
          width: "100%",
          maxWidth: 980,
          maxHeight: "94vh",
          overflowY: "auto",
          background: C.bg,
          borderRadius: 18,
          border: `1px solid ${C.border}`,
          overflowX: "hidden",
        }}
      >
        {/* Header */}
        <div
          style={{
            display: "flex",
            alignItems: "center",
            gap: 12,
            padding: "14px 16px",
            background: C.panel,
            borderBottom: `1px solid ${C.border}`,
          }}
        >
          <div
            style={{
              width: 46,
              height: 46,
              borderRadius: 14,
              background: C.gold,
              display: "flex",
              alignItems: "center",
              justifyContent: "center",
              flexShrink: 0,
              boxShadow: `0 0 18px ${C.goldDim}`,
            }}
          >
            <MonitorPlay size={24} color="#0A0A0F" />
          </div>
          <div style={{ flex: 1, minWidth: 0 }}>
            <div
              style={{
                fontSize: 17,
                fontWeight: 600,
                lineHeight: 1.25,
                color: C.text,
                letterSpacing: 0.2,
                wordBreak: "break-word",
              }}
            >
              {title || ""}
            </div>
          </div>
          <button onClick={toggleFullscreen} aria-label="fullscreen" style={circleBtnStyle}>
            {isFullscreen ? <Minimize size={18} /> : <Maximize size={18} />}
          </button>
          <button onClick={reload} aria-label="reload" style={circleBtnStyle}>
            <RotateCcw size={18} />
          </button>
          <button onClick={onClose} aria-label={closeLabel} style={circleBtnStyle}>
            <X size={18} />
          </button>
        </div>

        {/* Video */}
        <div ref={videoRef} style={{ width: "100%", ...(isFullscreen ? { height: "100%" } : { aspectRatio: "16/9" }), overflow: "hidden", position: "relative", background: "#000" }}>
          <iframe
            key={`${currentSrc}-${reloadKey}`}
            src={currentSrc}
            title="player"
            allowFullScreen
            allow="autoplay; encrypted-media; fullscreen; picture-in-picture"
            referrerPolicy="origin"
            // No `sandbox` attribute: these players (Fastimdb/Streamimdb/…)
            // detect a sandboxed frame and refuse to play ("Playback blocked …
            // use iframe without sandbox attribute"). Modern browsers still block
            // automatic cross-origin top-navigation, so the app is not hijacked
            // by auto-redirect ads while playback works normally.
            onLoad={() => {
              loadedRef.current = true;
              setLoaded(true);
              setAutoTrying(false);
              setAllFailed(false);
              failedRef.current.delete(safeActive);
            }}
            onError={failover}
            style={{ width: "100%", height: "100%", border: "none" }}
          />
          {isFullscreen && (
            <button
              onClick={toggleFullscreen}
              aria-label="exit-fullscreen"
              style={{
                position: "absolute",
                top: 14,
                right: 14,
                zIndex: 5,
                width: 44,
                height: 44,
                borderRadius: "50%",
                background: "rgba(10,10,15,.7)",
                border: `1px solid ${C.border}`,
                color: C.text,
                display: "flex",
                alignItems: "center",
                justifyContent: "center",
                cursor: "pointer",
                backdropFilter: "blur(4px)",
              }}
            >
              <Minimize size={20} />
            </button>
          )}
          {autoTrying && !loaded && (
            <div
              style={{
                position: "absolute",
                inset: 0,
                display: "flex",
                flexDirection: "column",
                alignItems: "center",
                justifyContent: "center",
                gap: 10,
                background: "rgba(10,10,15,.85)",
                color: C.text,
                fontWeight: 700,
                fontSize: 14,
                pointerEvents: "none",
              }}
            >
              <div
                className="mv-spin"
                style={{
                  width: 30,
                  height: 30,
                  borderRadius: "50%",
                  border: `3px solid ${C.border}`,
                  borderTopColor: C.gold,
                }}
              />
              {list.length > 0 ? `Trying ${list[safeActive]?.name ?? ""}…` : "Trying next server…"}
            </div>
          )}
          {allFailed && !loaded && (
            <div
              style={{
                position: "absolute",
                inset: 0,
                display: "flex",
                flexDirection: "column",
                alignItems: "center",
                justifyContent: "center",
                gap: 12,
                background: "rgba(10,10,15,.92)",
                color: C.text,
                textAlign: "center",
                padding: 16,
              }}
            >
              <div style={{ fontWeight: 800, fontSize: 15 }}>
                {hint || "All servers failed — tap a server to retry"}
              </div>
              <button
                onClick={reload}
                style={{
                  display: "flex",
                  alignItems: "center",
                  gap: 8,
                  background: C.gold,
                  color: "#0A0A0F",
                  border: "none",
                  borderRadius: 10,
                  padding: "9px 16px",
                  fontWeight: 800,
                  fontSize: 13,
                  cursor: "pointer",
                }}
              >
                <RotateCcw size={16} />
              </button>
            </div>
          )}
        </div>


        {/* server selector */}
        {servers && servers.length > 1 && (
          <div style={{ padding: "18px 16px 22px" }}>
            <div
              style={{
                display: "flex",
                alignItems: "center",
                justifyContent: "space-between",
                marginBottom: 14,
              }}
            >
              <div
                style={{
                  fontSize: 13,
                  fontWeight: 800,
                  letterSpacing: 3,
                  color: C.muted,
                  textTransform: "uppercase",
                }}
              >
                {serversTitleLabel || "Servers"}
              </div>
              <div style={{ display: "flex", alignItems: "center", gap: 7 }}>
                <span
                  style={{
                    width: 8,
                    height: 8,
                    borderRadius: "50%",
                    background: "#22C55E",
                    boxShadow: "0 0 8px #22C55E",
                  }}
                />
                <span style={{ fontSize: 13, fontWeight: 700, color: "#22C55E" }}>
                  {autoSwitchLabel || "Auto-switch"}
                </span>
              </div>
            </div>

            <div
              style={{
                display: "grid",
                gridTemplateColumns: "repeat(2, 1fr)",
                gap: 9,
              }}
            >
              {servers.map((s, i) => {
                const on = i === safeActive;
                const accent = s.accent || C.gold;
                const isFailed = failed.includes(i) && !on;
                return (
                  <button
                    key={s.name}
                    onClick={() => pickServer(i)}
                    style={{
                      position: "relative",
                      display: "flex",
                      alignItems: "center",
                      gap: 8,
                      background: `linear-gradient(135deg, ${accent}22, ${C.panel2})`,
                      color: C.text,
                      border: `1.5px solid ${on ? accent : `${accent}40`}`,
                      borderRadius: 11,
                      padding: "9px 11px",
                      fontWeight: 700,
                      fontSize: 13,
                      cursor: "pointer",
                      transition: "all .15s",
                      opacity: isFailed ? 0.4 : 1,
                      boxShadow: on ? `0 0 0 1px ${accent}, 0 4px 12px ${accent}33` : "none",
                    }}
                  >

                    <Play size={14} color={accent} fill={accent} style={{ flexShrink: 0 }} />
                    <span
                      style={{
                        flex: 1,
                        textAlign: "center",
                        whiteSpace: "nowrap",
                        overflow: "hidden",
                        textOverflow: "ellipsis",
                      }}
                    >
                      {serverLabel ? `${serverLabel} ${i + 1}` : s.name}
                    </span>
                    {on && (
                      <span
                        style={{
                          position: "absolute",
                          top: -4,
                          insetInlineEnd: -4,
                          width: 11,
                          height: 11,
                          borderRadius: "50%",
                          background: accent,
                          border: `2px solid ${C.bg}`,
                        }}
                      />
                    )}
                  </button>
                );
              })}
            </div>


            {hint && (
              <div style={{ fontSize: 13, color: C.muted, marginTop: 16, textAlign: "center" }}>
                {hint}
              </div>
            )}
          </div>
        )}
      </div>
    </div>
  );
}


function ActionBtn({
  label,
  onClick,
  primary,
  cyan,
  disabled,
  ariaLabel,
}: {
  label: string;
  onClick: () => void;
  primary?: boolean;
  cyan?: boolean;
  disabled?: boolean;
  ariaLabel?: string;
}) {
  let bg: string, color: string, border: string;
  if (cyan) {
    bg = "#00BCD4";
    color = "#0A0A0F";
    border = "#00BCD4";
  } else if (primary) {
    bg = C.gold;
    color = "#0A0A0F";
    border = C.gold;
  } else {
    bg = C.panel2;
    color = C.text;
    border = C.border;
  }
  return (
    <button
      onClick={onClick}
      aria-label={ariaLabel || label}
      disabled={disabled}
      style={{
        flex: 1,
        background: bg,
        color: color,
        border: `1px solid ${border}`,
        borderRadius: 12,
        padding: "11px 8px",
        cursor: disabled ? "not-allowed" : "pointer",
        fontWeight: 800,
        fontSize: 13.5,
        opacity: disabled ? 0.5 : 1,
        transition: "transform .15s",
      }}
    >
      {label}
    </button>
  );
}

function InfoCell({ label, value }: { label: string; value: string }) {
  return (
    <div
      style={{
        background: C.panel2,
        borderRadius: 12,
        padding: "10px 12px",
        border: `1px solid ${C.border}`,
      }}
    >
      <div style={{ fontSize: 11.5, color: C.muted, marginBottom: 3 }}>{label}</div>
      <div style={{ fontSize: 13.5, fontWeight: 700, wordBreak: "break-word" }}>{value}</div>
    </div>
  );
}


