// Pure data module for the Quran reading section.
// No React hooks / components here so it stays a clean module
// (HMR-safe, importable from anywhere).
//
// Data source: alquran.cloud API (https://api.alquran.cloud/v1)
//  - Free, public, no API key, HTTPS, CORS enabled.
//  - Arabic text: edition "ar.alafasy" returns both the Uthmani text
//    and the per-ayah audio (Mishary Alafasy) in a single request.
//  - The Quran's Arabic text is in the public domain (sourced via
//    Tanzil / GlobalQuran). Audio is served from the Islamic Network CDN.
//
// Kurdish translation: "Tafsîrî Asan" by Burhan Muhammad-Amin, served via
// the quran.com API (resource id 81). Sorani Kurdish, intended for free
// distribution (dawah). Shown alongside the Arabic text as an optional layer.

const API_BASE = 'https://api.alquran.cloud/v1';
const AUDIO_CDN = 'https://cdn.islamic.network/quran/audio';
const QURAN_COM_API = 'https://api.quran.com/api/v4';

// Kurdish translation resource on quran.com.
export const KURDISH_TRANSLATION_ID = 81;
export const KURDISH_TRANSLATION_NAME = 'Tafsîrî Asan';
export const KURDISH_TRANSLATION_AUTHOR = 'Burhan Muhammad-Amin';

// Available audio reciters (alquran.cloud audio editions, served from the
// Islamic Network CDN). Audio URLs are derived per-ayah from the global ayah
// number, so switching reciter never requires a refetch and keeps position.
// `bitrate` reflects the kbps folder actually available for each edition.
export interface Reciter {
  id: string; // edition identifier
  name: string; // English / transliterated name
  shortName: string; // compact label for small UI buttons
  arabicName: string;
  bitrate: number;
}

export const RECITERS: Reciter[] = [
  { id: 'ar.alafasy', name: 'Mishary Rashid Alafasy', arabicName: 'مشاري راشد العفاسي', bitrate: 128 },
  { id: 'ar.abdurrahmaansudais', name: 'Abdul Rahman As-Sudais', arabicName: 'عبد الرحمن السديس', bitrate: 192 },
  { id: 'ar.abdulbasitmurattal', name: 'Abdul Basit (Murattal)', arabicName: 'عبد الباسط عبد الصمد', bitrate: 192 },
  { id: 'ar.husary', name: 'Mahmoud Khalil Al-Husary', arabicName: 'محمود خليل الحصري', bitrate: 128 },
  { id: 'ar.minshawi', name: 'Mohamed Siddiq Al-Minshawi', arabicName: 'محمد صديق المنشاوي', bitrate: 128 },
  { id: 'ar.muhammadayyoub', name: 'Muhammad Ayyoub', arabicName: 'محمد أيوب', bitrate: 128 },
  { id: 'ar.hudhaify', name: 'Ali Al-Hudhaify', arabicName: 'علي الحذيفي', bitrate: 128 },
];

export const DEFAULT_RECITER = 'ar.alafasy';
// Text edition used to fetch the Arabic Uthmani script (audio is derived separately).
export const TEXT_EDITION = 'quran-uthmani';

export function getReciterName(id: string): string {
  return RECITERS.find((r) => r.id === id)?.name ?? RECITERS[0].name;
}

// Derive the audio URL for an ayah (by its global ayah number) for any reciter.
export function ayahAudioUrl(reciter: string, globalAyahNumber: number): string {
  const r = RECITERS.find((x) => x.id === reciter) ?? RECITERS[0];
  return `${AUDIO_CDN}/${r.bitrate}/${r.id}/${globalAyahNumber}.mp3`;
}

// Global ayah number 1 (Al-Fatiha:1) is the standalone Bismillah recitation.
// The per-ayah audio files for ayah 1 of every OTHER surah do NOT contain the
// Bismillah, so we prepend this clip to keep recitation religiously accurate.
const BISMILLAH_GLOBAL_AYAH = 1;

export function bismillahAudioUrl(reciter: string): string {
  return ayahAudioUrl(reciter, BISMILLAH_GLOBAL_AYAH);
}

// Every surah begins with Bismillah recited before ayah 1, EXCEPT:
//  - Surah 1 (Al-Fatiha): Bismillah IS ayah 1, so it plays naturally.
//  - Surah 9 (At-Tawbah): the one surah that does not begin with Bismillah.
export function surahNeedsBismillah(surahNumber: number): boolean {
  return surahNumber !== 1 && surahNumber !== 9;
}

// Backwards-compatible exports.
export const RECITER_EDITION = DEFAULT_RECITER;
export const RECITER_NAME = RECITERS[0].name;

export interface SurahMeta {
  number: number;
  name: string; // Arabic name
  englishName: string; // transliterated name
  englishNameTranslation: string;
  numberOfAyahs: number;
  revelationType: 'Meccan' | 'Medinan' | string;
}

export interface Ayah {
  number: number; // global ayah number
  numberInSurah: number;
  text: string; // Arabic
  audio: string; // mp3 url
  juz: number;
  page: number;
  sajda: boolean;
}

export interface SurahDetail extends SurahMeta {
  ayahs: Ayah[];
}

interface ApiEnvelope<T> {
  code: number;
  status: string;
  data: T;
}

async function apiGet<T>(path: string, signal?: AbortSignal): Promise<T> {
  const res = await fetch(`${API_BASE}${path}`, { signal });
  if (!res.ok) {
    throw new Error(`Quran API error (${res.status})`);
  }
  const json = (await res.json()) as ApiEnvelope<T>;
  if (json.code !== 200) {
    throw new Error(`Quran API returned status ${json.status}`);
  }
  return json.data;
}

export function fetchSurahList(signal?: AbortSignal): Promise<SurahMeta[]> {
  return apiGet<SurahMeta[]>('/surah', signal);
}

export async function fetchSurahDetail(
  surahNumber: number,
  signal?: AbortSignal,
): Promise<SurahDetail> {
  const data = await apiGet<{
    number: number;
    name: string;
    englishName: string;
    englishNameTranslation: string;
    numberOfAyahs: number;
    revelationType: string;
    ayahs: Array<{
      number: number;
      numberInSurah: number;
      text: string;
      audio: string;
      juz: number;
      page: number;
      sajda: boolean | { id: number };
    }>;
  }>(`/surah/${surahNumber}/${TEXT_EDITION}`, signal);

  return {
    number: data.number,
    name: data.name,
    englishName: data.englishName,
    englishNameTranslation: data.englishNameTranslation,
    numberOfAyahs: data.numberOfAyahs,
    revelationType: data.revelationType,
    ayahs: data.ayahs.map((a) => ({
      number: a.number,
      numberInSurah: a.numberInSurah,
      text: a.text,
      // Default audio (Alafasy); the reader derives the URL per selected reciter.
      audio: ayahAudioUrl(DEFAULT_RECITER, a.number),
      juz: a.juz,
      page: a.page,
      sajda: typeof a.sajda === 'object' ? true : Boolean(a.sajda),
    })),
  };
}

// Strip any HTML markup (e.g. footnote <sup> tags) the translation API may
// embed, leaving clean reading text.
function cleanTranslation(html: string): string {
  return html
    .replace(/<sup[^>]*>.*?<\/sup>/gis, '')
    .replace(/<[^>]+>/g, '')
    .replace(/\s+/g, ' ')
    .trim();
}

// Persistent translation cache (localStorage). Surah translations never change,
// so once fetched a surah is stored and reused across reloads/sessions — no
// repeated network calls. Bump CACHE_VERSION if the translation source changes.
const TRANSLATION_CACHE_VERSION = 1;
const translationCacheKey = (surahNumber: number) =>
  `quran-tr-${KURDISH_TRANSLATION_ID}-v${TRANSLATION_CACHE_VERSION}-${surahNumber}`;

function getCachedTranslation(surahNumber: number): string[] | null {
  if (typeof window === 'undefined') return null;
  try {
    const raw = localStorage.getItem(translationCacheKey(surahNumber));
    if (!raw) return null;
    const parsed = JSON.parse(raw);
    return Array.isArray(parsed) && parsed.length > 0 ? (parsed as string[]) : null;
  } catch {
    return null;
  }
}

function setCachedTranslation(surahNumber: number, data: string[]): void {
  if (typeof window === 'undefined' || data.length === 0) return;
  try {
    localStorage.setItem(translationCacheKey(surahNumber), JSON.stringify(data));
  } catch {
    // Storage full / unavailable — ignore; in-memory React Query cache still applies.
  }
}

// Fetch the Kurdish (Tafsîrî Asan) translation for a surah. The returned array
// is indexed by ayah position (index 0 = ayah 1), matching SurahDetail.ayahs.
// Reads from localStorage first to avoid redundant network requests.
export async function fetchSurahTranslation(
  surahNumber: number,
  signal?: AbortSignal,
): Promise<string[]> {
  const cached = getCachedTranslation(surahNumber);
  if (cached) return cached;

  const res = await fetch(
    `${QURAN_COM_API}/quran/translations/${KURDISH_TRANSLATION_ID}?chapter_number=${surahNumber}`,
    { signal },
  );
  if (!res.ok) {
    throw new Error(`Translation API error (${res.status})`);
  }
  const json = (await res.json()) as { translations: Array<{ text: string }> };
  const data = (json.translations ?? []).map((t) => cleanTranslation(t.text));
  setCachedTranslation(surahNumber, data);
  return data;
}


// ---- Local persistence (bookmarks, last read, font size) ----

const FONT_SIZE_KEY = 'quran-arabic-font-size';
const LAST_READ_KEY = 'quran-last-read';
const BOOKMARKS_KEY = 'quran-bookmarks';
const RECITER_KEY = 'quran-reciter';
const SHOW_TRANSLATION_KEY = 'quran-show-translation';

export function getStoredShowTranslation(): boolean {
  if (typeof window === 'undefined') return true;
  const raw = localStorage.getItem(SHOW_TRANSLATION_KEY);
  // Default ON so the newly added Kurdish translation is visible.
  return raw == null ? true : raw === '1';
}

export function setStoredShowTranslation(value: boolean): void {
  if (typeof window === 'undefined') return;
  localStorage.setItem(SHOW_TRANSLATION_KEY, value ? '1' : '0');
}

export function getStoredReciter(): string {
  if (typeof window === 'undefined') return DEFAULT_RECITER;
  const raw = localStorage.getItem(RECITER_KEY);
  if (raw && RECITERS.some((r) => r.id === raw)) return raw;
  return DEFAULT_RECITER;
}

export function setStoredReciter(id: string): void {
  if (typeof window === 'undefined') return;
  localStorage.setItem(RECITER_KEY, id);
}

export const MIN_FONT = 22;
export const MAX_FONT = 56;
export const DEFAULT_FONT = 32;

export function getStoredFontSize(): number {
  if (typeof window === 'undefined') return DEFAULT_FONT;
  const raw = Number(localStorage.getItem(FONT_SIZE_KEY));
  if (!raw || Number.isNaN(raw)) return DEFAULT_FONT;
  return Math.min(MAX_FONT, Math.max(MIN_FONT, raw));
}

export function setStoredFontSize(size: number): void {
  if (typeof window === 'undefined') return;
  localStorage.setItem(FONT_SIZE_KEY, String(size));
}

export interface LastRead {
  surah: number;
  ayah: number;
  surahName: string;
}

export function getLastRead(): LastRead | null {
  if (typeof window === 'undefined') return null;
  try {
    const raw = localStorage.getItem(LAST_READ_KEY);
    return raw ? (JSON.parse(raw) as LastRead) : null;
  } catch {
    return null;
  }
}

export function setLastRead(value: LastRead): void {
  if (typeof window === 'undefined') return;
  localStorage.setItem(LAST_READ_KEY, JSON.stringify(value));
}

// Bookmark key format: "surah:ayah"
export function getBookmarks(): string[] {
  if (typeof window === 'undefined') return [];
  try {
    const raw = localStorage.getItem(BOOKMARKS_KEY);
    return raw ? (JSON.parse(raw) as string[]) : [];
  } catch {
    return [];
  }
}

export function setBookmarks(list: string[]): void {
  if (typeof window === 'undefined') return;
  localStorage.setItem(BOOKMARKS_KEY, JSON.stringify(list));
}

export function bookmarkKey(surah: number, ayah: number): string {
  return `${surah}:${ayah}`;
}
