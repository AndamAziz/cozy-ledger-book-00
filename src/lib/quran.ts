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
// NOTE: Kurdish translation intentionally NOT bundled yet — the
// Tanzil "Tafsiri Asan" translation is licensed for non-commercial
// use only and is pending an explicit licensing decision.

const API_BASE = 'https://api.alquran.cloud/v1';
const AUDIO_CDN = 'https://cdn.islamic.network/quran/audio/128';

// Available audio reciters (alquran.cloud audio editions, served from the
// Islamic Network CDN). Audio URLs are derived per-ayah from the global ayah
// number, so switching reciter never requires a refetch and keeps position.
export interface Reciter {
  id: string; // edition identifier
  name: string; // English / transliterated name
  arabicName: string;
}

export const RECITERS: Reciter[] = [
  { id: 'ar.alafasy', name: 'Mishary Rashid Alafasy', arabicName: 'مشاري راشد العفاسي' },
  { id: 'ar.abdurrahmaansudais', name: 'Abdul Rahman As-Sudais', arabicName: 'عبد الرحمن السديس' },
  { id: 'ar.abdulbasitmurattal', name: 'Abdul Basit (Murattal)', arabicName: 'عبد الباسط عبد الصمد' },
  { id: 'ar.husary', name: 'Mahmoud Khalil Al-Husary', arabicName: 'محمود خليل الحصري' },
  { id: 'ar.minshawi', name: 'Mohamed Siddiq Al-Minshawi', arabicName: 'محمد صديق المنشاوي' },
  { id: 'ar.muhammadayyoub', name: 'Muhammad Ayyoub', arabicName: 'محمد أيوب' },
  { id: 'ar.hudhaify', name: 'Ali Al-Hudhaify', arabicName: 'علي الحذيفي' },
];

export const DEFAULT_RECITER = 'ar.alafasy';
// Text edition used to fetch the Arabic Uthmani script (audio is derived separately).
export const TEXT_EDITION = 'quran-uthmani';

export function getReciterName(id: string): string {
  return RECITERS.find((r) => r.id === id)?.name ?? RECITERS[0].name;
}

// Derive the audio URL for an ayah (by its global ayah number) for any reciter.
export function ayahAudioUrl(reciter: string, globalAyahNumber: number): string {
  return `${AUDIO_CDN}/${reciter}/${globalAyahNumber}.mp3`;
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
  }>(`/surah/${surahNumber}/${RECITER_EDITION}`, signal);

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
      audio: a.audio,
      juz: a.juz,
      page: a.page,
      sajda: typeof a.sajda === 'object' ? true : Boolean(a.sajda),
    })),
  };
}

// ---- Local persistence (bookmarks, last read, font size) ----

const FONT_SIZE_KEY = 'quran-arabic-font-size';
const LAST_READ_KEY = 'quran-last-read';
const BOOKMARKS_KEY = 'quran-bookmarks';

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
