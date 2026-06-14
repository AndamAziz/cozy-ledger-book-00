import { useState, useEffect, useCallback, useRef } from "react";
import { Helmet } from "react-helmet-async";
import { useNavigate } from "react-router-dom";
import { toast } from "sonner";
import { supabase } from "@/integrations/supabase/client";

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

const TMDB_KEY = "4e44d9029b1270a757cddc766a1bcb63";
const TMDB_BACKDROP = "https://image.tmdb.org/t/p/w1280";
const TMDB_PROFILE = "https://image.tmdb.org/t/p/w185";

type Lang = "ku" | "en";

// ====== i18n ======
const T = {
  ku: {
    title: "فیلم",
    titleSuffix: "ەکان",
    back: "← گەڕانەوە",
    searchPlaceholder: "گەڕان بۆ فیلم... (دەتوانیت ناوی ناودار یان وەسف بنووسیت)",
    smartSearch: "گەڕانی زیرەک",
    aiFound: "AI ناوی ڕاستەقینەی دۆزییەوە:",
    noMovies: "هیچ فیلمێک نەدۆزرایەوە",
    first: "یەکەم",
    last: "کۆتایی",
    watch: "▶ سەیرکردن",
    trailer: "🎬 تریلەر",
    aiInfo: "🤖 زانیاری AI",
    noTrailer: "تریلەر بەردەست نییە بۆ ئەم فیلمە.",
    tabInfo: "زانیاری",
    tabCast: "ئەکتەرەکان",
    tabAi: "🤖 AI",
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
    linkCopied: "لینکەکە کۆپی کرا ✓",
    searchResultsFor: "ئەنجامەکانی گەڕان بۆ",
    clearSearch: "✕ پاککردنەوەی گەڕان",
    searching: "گەڕان...",
    resultsCount: "ئەنجام",
  },
  en: {
    title: "Mov",
    titleSuffix: "ies",
    back: "← Back",
    searchPlaceholder: "Search for a movie... (a nickname or a description works too)",
    smartSearch: "Smart Search",
    aiFound: "AI found the real title:",
    noMovies: "No movies found",
    first: "First",
    last: "Last",
    watch: "▶ Watch Now",
    trailer: "🎬 Trailer",
    aiInfo: "🤖 AI Info",
    noTrailer: "No trailer available for this movie.",
    tabInfo: "Info",
    tabCast: "Cast",
    tabAi: "🤖 AI",
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
    linkCopied: "Link copied ✓",
    searchResultsFor: "Search results for",
    clearSearch: "✕ Clear search",
    searching: "Searching...",
    resultsCount: "results",
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

interface Movie {
  tmdb_id: number;
  imdb_id: string;
  title: string;
  year: string;
  poster_url: string;
  rating: string;
  genre: string;
  popularity: string;
  type: string;
  embed_url: string;
}

interface CastMember {
  id: number;
  name: string;
  character: string;
  profile_path: string | null;
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
  const [page, setPage] = useState(1);
  const [totalPages, setTotalPages] = useState(1);
  const [genre, setGenre] = useState("all");
  const [search, setSearch] = useState("");
  const [aiSearching, setAiSearching] = useState(false);
  const [aiTitle, setAiTitle] = useState<string | null>(null);
  const [selected, setSelected] = useState<Movie | null>(null);
  const inputRef = useRef<HTMLInputElement>(null);

  const toggleLang = () => {
    const next: Lang = lang === "ku" ? "en" : "ku";
    setLang(next);
    localStorage.setItem("moviesLang", next);
  };

  const fetchMovies = useCallback(async (p: number) => {
    setLoading(true);
    try {
      const r = await fetch(`https://vidapi.ru/movies/latest/page-${p}.json`);
      const data = await r.json();
      setMovies(Array.isArray(data.items) ? data.items : []);
      setTotalPages(Math.min(data.total_pages || 1, 200));
      window.scrollTo({ top: 0, behavior: "smooth" });
    } catch {
      setMovies([]);
    } finally {
      setLoading(false);
    }
  }, []);

  useEffect(() => {
    fetchMovies(page);
  }, [page, fetchMovies]);

  const searchByImdbId = useCallback(async (imdbId: string) => {
    try {
      const r = await fetch(
        `https://api.themoviedb.org/3/find/${imdbId}?api_key=${TMDB_KEY}&external_source=imdb_id`,
      );
      const d = await r.json();
      const result = d?.movie_results?.[0];
      if (result) {
        const movie: Movie = {
          tmdb_id: result.id,
          imdb_id: imdbId,
          title: result.title || result.original_title || imdbId,
          year: result.release_date ? result.release_date.slice(0, 4) : "",
          poster_url: result.poster_path
            ? `https://image.tmdb.org/t/p/w500${result.poster_path}`
            : "",
          rating: result.vote_average ? String(result.vote_average) : "",
          genre: (result.genre_ids || []).map((g: number) => TMDB_GENRES[g]).filter(Boolean).join(", "),
          popularity: String(result.popularity || ""),
          type: "movie",
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

  // ---- POWERFUL CATALOG SEARCH (full TMDB database) ----
  const mapTmdbResult = (r: TmdbSearchResult): Movie => ({
    tmdb_id: r.id,
    imdb_id: "",
    title: r.title || r.original_title || "",
    year: r.release_date ? r.release_date.slice(0, 4) : "",
    poster_url: r.poster_path ? `https://image.tmdb.org/t/p/w500${r.poster_path}` : "",
    rating: r.vote_average ? r.vote_average.toFixed(1) : "",
    genre: (r.genre_ids || []).map((g) => TMDB_GENRES[g]).filter(Boolean).join(", "),
    popularity: String(r.popularity || ""),
    type: "movie",
    embed_url: "",
  });

  const searchTmdb = useCallback(async (q: string): Promise<Movie[]> => {
    try {
      const r = await fetch(
        `https://api.themoviedb.org/3/search/movie?api_key=${TMDB_KEY}` +
          `&query=${encodeURIComponent(q)}&include_adult=false&language=en-US&page=1`,
      );
      const d = await r.json();
      const list: TmdbSearchResult[] = Array.isArray(d.results) ? d.results : [];
      return list
        .filter((m) => m.poster_path)
        .sort((a, b) => (b.popularity || 0) - (a.popularity || 0))
        .map(mapTmdbResult);
    } catch {
      return [];
    }
  }, []);

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
    const id = setTimeout(async () => {
      setAiSearching(true);
      const results = await searchTmdb(q);
      setSearchResults(results);
      setAiSearching(false);
    }, 450);
    return () => clearTimeout(id);
  }, [search, searchTmdb]);

  const searching = searchResults !== null;
  const baseList = searching ? searchResults! : movies;
  const filtered = baseList.filter((m) =>
    genre === "all" || (m.genre || "").toLowerCase().includes(genre.toLowerCase()),
  );

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
        <title>{lang === "ku" ? "فیلمەکان 🎬 - CITY TAXPERTS" : "Movies 🎬 - CITY TAXPERTS"}</title>
        <meta
          name="description"
          content={
            lang === "ku"
              ? "تازەترین فیلمەکان بە کوردی — گەڕان و سەیرکردنی فیلم."
              : "Latest movies — search and watch."
          }
        />
      </Helmet>

      {/* Header */}
      <header
        style={{
          position: "sticky",
          top: 0,
          zIndex: 20,
          background: "rgba(10,10,15,0.85)",
          backdropFilter: "blur(14px)",
          borderBottom: `1px solid ${C.border}`,
          padding: "14px 16px",
        }}
      >
        <div style={{ maxWidth: 1200, margin: "0 auto" }}>
          <div style={{ display: "flex", alignItems: "center", gap: 12, marginBottom: 14 }}>
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
            <h1
              style={{
                fontSize: 26,
                fontWeight: 800,
                margin: 0,
                letterSpacing: ".5px",
              }}
            >
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

          {/* Search */}
          <div style={{ display: "flex", gap: 8 }}>
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
              style={{
                background: C.gold,
                color: "#0A0A0F",
                border: "none",
                borderRadius: 14,
                padding: "0 18px",
                cursor: aiSearching ? "wait" : "pointer",
                fontWeight: 800,
                fontSize: 14,
                whiteSpace: "nowrap",
                opacity: !search.trim() ? 0.5 : 1,
                display: "flex",
                alignItems: "center",
                gap: 6,
              }}
            >
              {aiSearching ? (
                <span
                  className="mv-spin"
                  style={{
                    width: 16,
                    height: 16,
                    border: "2px solid rgba(0,0,0,.3)",
                    borderTopColor: "#0A0A0F",
                    borderRadius: "50%",
                    display: "inline-block",
                  }}
                />
              ) : (
                "🤖"
              )}
              {t.smartSearch}
            </button>
          </div>

          {aiTitle && (
            <div
              className="mv-fade"
              style={{
                marginTop: 10,
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

          {/* Genre pills */}
          <div
            className="mv-genre mv-scroll"
            style={{
              display: "flex",
              gap: 8,
              overflowX: "auto",
              marginTop: 14,
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
        </div>
      </header>

      {/* Grid */}
      <main style={{ maxWidth: 1200, margin: "0 auto", padding: "20px 16px 40px" }}>
        {loading ? (
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
              <MovieCard key={`${m.tmdb_id}-${i}`} movie={m} onClick={() => setSelected(m)} />
            ))}
          </Grid>
        )}

        {/* Pagination */}
        {!search.trim() && (
          <Pagination page={page} totalPages={totalPages} onChange={setPage} t={t} />
        )}
      </main>

      {selected && (
        <MovieModal movie={selected} onClose={() => setSelected(null)} lang={lang} t={t} dir={dir} />
      )}
    </div>
  );
}

function Grid({ children }: { children: React.ReactNode }) {
  return (
    <div
      style={{
        display: "grid",
        gridTemplateColumns: "repeat(auto-fill, minmax(140px, 1fr))",
        gap: 16,
      }}
    >
      {children}
    </div>
  );
}

function MovieCard({ movie, onClick }: { movie: Movie; onClick: () => void }) {
  const rating = parseFloat(movie.rating) || 0;
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
        {/* badges */}
        {rating > 0 && (
          <div
            style={{
              position: "absolute",
              top: 8,
              insetInlineEnd: 8,
              background: "rgba(0,0,0,.75)",
              color: C.gold,
              fontSize: 12,
              fontWeight: 800,
              padding: "3px 8px",
              borderRadius: 8,
            }}
          >
            ★ {rating.toFixed(1)}
          </div>
        )}
        <div
          style={{
            position: "absolute",
            top: 8,
            insetInlineStart: 8,
            background: "rgba(0,0,0,.75)",
            color: C.text,
            fontSize: 11.5,
            fontWeight: 700,
            padding: "3px 8px",
            borderRadius: 8,
          }}
        >
          {movie.year}
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
      <div style={{ marginTop: 8 }}>
        <div
          style={{
            fontSize: 13.5,
            fontWeight: 700,
            whiteSpace: "nowrap",
            overflow: "hidden",
            textOverflow: "ellipsis",
          }}
        >
          {movie.title}
        </div>
        <div
          style={{
            fontSize: 11.5,
            color: C.muted,
            whiteSpace: "nowrap",
            overflow: "hidden",
            textOverflow: "ellipsis",
          }}
        >
          {(movie.genre || "").split(",")[0]}
        </div>
      </div>
    </div>
  );
}

function Pagination({
  page,
  totalPages,
  onChange,
  t,
}: {
  page: number;
  totalPages: number;
  onChange: (p: number) => void;
  t: (typeof T)["ku"];
}) {
  const btn = (label: string, p: number, disabled: boolean, active = false) => (
    <button
      onClick={() => !disabled && onChange(p)}
      disabled={disabled}
      style={{
        background: active ? C.gold : C.panel,
        color: active ? "#0A0A0F" : disabled ? "#55556a" : C.text,
        border: `1px solid ${active ? C.gold : C.border}`,
        borderRadius: 10,
        padding: "8px 14px",
        minWidth: 42,
        cursor: disabled ? "not-allowed" : "pointer",
        fontWeight: 700,
        fontSize: 14,
      }}
    >
      {label}
    </button>
  );

  const pages: number[] = [];
  const start = Math.max(1, page - 2);
  const end = Math.min(totalPages, start + 4);
  for (let i = start; i <= end; i++) pages.push(i);

  return (
    <div
      style={{
        display: "flex",
        gap: 8,
        justifyContent: "center",
        alignItems: "center",
        marginTop: 30,
        flexWrap: "wrap",
      }}
    >
      {btn(t.first, 1, page === 1)}
      {btn("‹", page - 1, page === 1)}
      {pages.map((p) => btn(String(p), p, false, p === page))}
      {btn("›", page + 1, page === totalPages)}
      {btn(t.last, totalPages, page === totalPages)}
    </div>
  );
}

// ====== Modal ======
type Tab = "info" | "cast" | "ai" | "subs";

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
  const [subs, setSubs] = useState<Subtitle[] | null>(null);
  const [subsLoading, setSubsLoading] = useState(false);
  const [subsError, setSubsError] = useState<string>("");
  const [downloadingId, setDownloadingId] = useState<string>("");

  const rating = parseFloat(movie.rating) || 0;

  useEffect(() => {
    document.body.style.overflow = "hidden";
    return () => {
      document.body.style.overflow = "";
    };
  }, []);

  // fetch TMDB details + credits
  useEffect(() => {
    let alive = true;
    (async () => {
      try {
        const r = await fetch(
          `https://api.themoviedb.org/3/movie/${movie.tmdb_id}?api_key=${TMDB_KEY}&append_to_response=credits`,
        );
        const d = await r.json();
        if (!alive) return;
        if (d.backdrop_path) setBackdrop(TMDB_BACKDROP + d.backdrop_path);
        const dirCrew = d.credits?.crew?.find((c: { job: string }) => c.job === "Director");
        if (dirCrew) setDirector(dirCrew.name);
        if (Array.isArray(d.credits?.cast)) setCast(d.credits.cast.slice(0, 18));
      } catch {
        /* ignore */
      }
    })();
    return () => {
      alive = false;
    };
  }, [movie.tmdb_id]);

  const loadTrailer = async () => {
    if (trailer) {
      setTrailerOpen(true);
      return;
    }
    setTrailerLoading(true);
    try {
      const r = await fetch(
        `https://api.themoviedb.org/3/movie/${movie.tmdb_id}/videos?api_key=${TMDB_KEY}`,
      );
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

  const loadSubs = async () => {
    setTab("subs");
    if (subs || subsLoading || !movie.imdb_id) return;
    setSubsLoading(true);
    setSubsError("");
    try {
      const res = await fetch(
        `${SUPA_URL}/functions/v1/subtitles?action=search&imdb_id=${encodeURIComponent(
          movie.imdb_id,
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
              background: `linear-gradient(to top, ${C.panel} 5%, rgba(19,19,28,.4) 60%, rgba(19,19,28,.1) 100%)`,
            }}
          />
          <button
            onClick={onClose}
            style={{
              position: "absolute",
              top: 12,
              insetInlineStart: 12,
              width: 38,
              height: 38,
              borderRadius: "50%",
              background: "rgba(0,0,0,.6)",
              color: C.text,
              border: "none",
              cursor: "pointer",
              fontSize: 18,
            }}
          >
            ✕
          </button>

          {/* poster + title */}
          <div
            style={{
              position: "absolute",
              bottom: 14,
              insetInlineEnd: 16,
              insetInlineStart: 16,
              display: "flex",
              gap: 14,
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
            <div style={{ paddingBottom: 4 }}>
              <h2 style={{ margin: 0, fontSize: 22, fontWeight: 800 }}>{movie.title}</h2>
              <div
                style={{
                  display: "flex",
                  gap: 10,
                  flexWrap: "wrap",
                  marginTop: 6,
                  fontSize: 13,
                  color: C.muted,
                  alignItems: "center",
                }}
              >
                <span>{movie.year}</span>
                {rating > 0 && (
                  <span style={{ color: C.gold, fontWeight: 800 }}>★ {rating.toFixed(1)}</span>
                )}
                <span>{(movie.genre || "").split(",").slice(0, 2).join("، ")}</span>
              </div>
              {director && (
                <div style={{ fontSize: 12.5, color: C.muted, marginTop: 4 }}>
                  {t.director} <span style={{ color: C.text }}>{director}</span>
                </div>
              )}
            </div>
          </div>
        </div>

        {/* Action buttons */}
        <div style={{ display: "flex", gap: 8, padding: "14px 16px 0" }}>
          <ActionBtn primary label={t.watch} onClick={() => setWatch(true)} />
          <ActionBtn
            label={trailerLoading ? "..." : t.trailer}
            onClick={loadTrailer}
            disabled={trailerLoading || trailer === "none"}
          />
          <ActionBtn label={t.aiInfo} onClick={loadAiInfo} />
          <ActionBtn label={t.subs} onClick={loadSubs} />
        </div>

        {/* PlayIMDb buttons */}
        {movie.imdb_id && (
          <div style={{ display: "flex", gap: 8, padding: "8px 16px 0" }}>
            <ActionBtn
              cyan
              label={t.openPlayIMDb}
              onClick={() => window.open(`https://www.playimdb.com/title/${movie.imdb_id}/`, "_blank")}
            />
            <ActionBtn
              label={t.copyPlayIMDb}
              onClick={async () => {
                const url = `https://www.playimdb.com/title/${movie.imdb_id}/`;
                try {
                  await navigator.clipboard.writeText(url);
                  toast.success(t.linkCopied);
                } catch {
                  toast.error(lang === "ku" ? "کۆپی کردن سەرکەوتوو نەبوو" : "Copy failed");
                }
              }}
            />
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
              onClick={() => (tb.key === "ai" ? loadAiInfo() : setTab(tb.key))}
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
              <InfoCell label="IMDB ID" value={movie.imdb_id} />
              <InfoCell label="TMDB ID" value={String(movie.tmdb_id)} />
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
          src={`https://vaplayer.ru/embed/movie/${movie.imdb_id}`}
          onClose={() => setWatch(false)}
          closeLabel={t.close}
        />
      )}
      {/* Trailer player */}
      {trailerOpen && trailer && trailer !== "none" && (
        <PlayerOverlay
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
  onClose,
  closeLabel,
}: {
  src: string;
  onClose: () => void;
  closeLabel: string;
}) {
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
        style={{ width: "100%", maxWidth: 980, position: "relative" }}
      >
        <button
          onClick={onClose}
          style={{
            position: "absolute",
            top: -44,
            insetInlineStart: 0,
            background: C.panel2,
            color: C.text,
            border: `1px solid ${C.border}`,
            borderRadius: 10,
            padding: "8px 16px",
            cursor: "pointer",
            fontWeight: 700,
          }}
        >
          {closeLabel}
        </button>
        <div style={{ width: "100%", aspectRatio: "16/9", borderRadius: 12, overflow: "hidden" }}>
          <iframe
            src={src}
            title="player"
            allowFullScreen
            allow="autoplay; encrypted-media; fullscreen"
            style={{ width: "100%", height: "100%", border: "none" }}
          />
        </div>
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
}: {
  label: string;
  onClick: () => void;
  primary?: boolean;
  cyan?: boolean;
  disabled?: boolean;
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
