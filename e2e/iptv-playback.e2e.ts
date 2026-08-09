/**
 * IPTV end-to-end playback coverage: Live TV, Movies and Series.
 *
 * Every case is verified on TWO independent levels, because neither one alone
 * can prove "it plays" in a CI sandbox:
 *
 *  1. Real browser (Chromium, authenticated app origin) — the stream is mounted
 *     the exact way the app mounts it and we read the live <video> state
 *     (readyState / videoWidth / videoHeight / MediaError) plus a screenshot.
 *     Live TV is exercised through the app's own /iptv player UI (hls.js).
 *
 *  2. Decoder truth (ffprobe/ffmpeg over the same iptv-stream URL) — the
 *     sandbox Chromium build ships WITHOUT proprietary codecs, so an H.264
 *     stream reports MEDIA_ERR_SRC_NOT_SUPPORTED there even when the stream is
 *     perfectly fine on real devices. ffmpeg decodes a real frame and tells us
 *     the actual codecs, resolution and whether seeking (HTTP Range) works.
 *
 * Screenshots + decoded frames land in test-results/iptv-playback/ and are
 * attached to the Playwright report.
 *
 * Requires an injected preview session (LOVABLE_BROWSER_SUPABASE_* env vars).
 * Without one the spec skips instead of failing, since the catalogue is
 * per-account.
 */
import { test, expect, type Page } from '@playwright/test';
import { execFile } from 'node:child_process';
import { promisify } from 'node:util';
import { mkdir, readFile, writeFile } from 'node:fs/promises';
import path from 'node:path';

const run = promisify(execFile);

const OUT_DIR = path.resolve('test-results/iptv-playback');

/* ------------------------------------------------------------------ env ---- */

async function readDotEnv(): Promise<Record<string, string>> {
  try {
    const raw = await readFile(path.resolve('.env'), 'utf8');
    return Object.fromEntries(
      raw
        .split('\n')
        .map((l) => l.trim())
        .filter((l) => l && !l.startsWith('#') && l.includes('='))
        .map((l) => {
          const i = l.indexOf('=');
          return [l.slice(0, i).trim(), l.slice(i + 1).trim().replace(/^["']|["']$/g, '')];
        }),
    );
  } catch {
    return {};
  }
}

type Ctx = {
  fnBase: string;
  anon: string;
  token: string;
  storageKey: string | null;
  sessionJson: string | null;
  source: string | null;
};

let ctxPromise: Promise<Ctx | null> | null = null;

function loadCtx(): Promise<Ctx | null> {
  ctxPromise ??= (async () => {
    const env = { ...(await readDotEnv()), ...process.env } as Record<string, string>;
    const url = env.VITE_SUPABASE_URL;
    const anon = env.VITE_SUPABASE_PUBLISHABLE_KEY;
    const token = env.LOVABLE_BROWSER_SUPABASE_ACCESS_TOKEN;
    if (!url || !anon || !token) return null;
    return {
      fnBase: `${url}/functions/v1`,
      anon,
      token,
      storageKey: env.LOVABLE_BROWSER_SUPABASE_STORAGE_KEY ?? null,
      sessionJson: env.LOVABLE_BROWSER_SUPABASE_SESSION_JSON ?? null,
      source: env.IPTV_SOURCE_ID ?? null,
    };
  })();
  return ctxPromise;
}

/* ------------------------------------------------------------ catalogue ---- */

type Kind = 'live' | 'vod' | 'series';

async function catalogue<T>(ctx: Ctx, query: string): Promise<T> {
  const src = ctx.source ? `&source=${encodeURIComponent(ctx.source)}` : '';
  const res = await fetch(`${ctx.fnBase}/iptv-playlist?${query}${src}`, {
    headers: { apikey: ctx.anon, Authorization: `Bearer ${ctx.token}` },
  });
  const json = (await res.json().catch(() => null)) as T & { error?: string };
  if (!res.ok) throw new Error(`iptv-playlist ${query} -> HTTP ${res.status} ${json?.error ?? ''}`);
  return json;
}

type Target = { kind: Kind; id: string; name: string; ext?: string };

type Index = { categories: { id: string; name: string; kind: string }[] };
type Channels = { total: number; channels: { id: string; name: string; ext?: string }[] };
type SeriesInfo = {
  name: string;
  seasons: { season: number; episodes: { id: string; season: number; episode: number; ext?: string }[] }[];
};

/** First playable item of a section, preferring an env-provided search term. */
async function discover(ctx: Ctx, kind: Kind): Promise<Target> {
  const wanted = process.env[`IPTV_${kind.toUpperCase()}_QUERY`];
  if (wanted && wanted.length >= 2) {
    const hit = await catalogue<Channels>(ctx, `q=${encodeURIComponent(wanted)}&kind=${kind}&limit=20`);
    const first = hit.channels?.[0];
    if (first) return finish(ctx, kind, first);
  }

  const index = await catalogue<Index>(ctx, 'v=1');
  const cats = index.categories.filter((c) => c.kind === kind);
  for (const cat of cats.slice(0, 6)) {
    const page = await catalogue<Channels>(ctx, `category=${encodeURIComponent(cat.id)}&limit=20`);
    const first = page.channels?.[0];
    if (first) return finish(ctx, kind, first);
  }
  throw new Error(`no ${kind} item found in catalogue`);
}

/** Series need one more hop: the catalogue id is a show, not a playable stream. */
async function finish(ctx: Ctx, kind: Kind, item: { id: string; name: string; ext?: string }): Promise<Target> {
  if (kind !== 'series') return { kind, id: item.id, name: item.name, ext: item.ext };
  const info = await catalogue<SeriesInfo>(ctx, `series=${encodeURIComponent(item.id)}`);
  const ep = info.seasons?.flatMap((s) => s.episodes ?? [])[0];
  if (!ep) throw new Error(`series "${item.name}" has no episodes`);
  return {
    kind: 'series',
    id: ep.id,
    name: `${item.name} · S${ep.season}E${ep.episode}`,
    ext: ep.ext ?? 'mp4',
  };
}

function streamUrl(ctx: Ctx, t: Target) {
  const ext = t.ext ? `&ext=${encodeURIComponent(t.ext)}` : '';
  const src = ctx.source ? `&source=${encodeURIComponent(ctx.source)}` : '';
  return `${ctx.fnBase}/iptv-stream?id=${encodeURIComponent(t.id)}&kind=${t.kind}${ext}${src}&apikey=${ctx.anon}&token=${encodeURIComponent(ctx.token)}`;
}

/* --------------------------------------------------------------- browser --- */

async function restoreSession(page: Page, ctx: Ctx) {
  await page.goto('/', { waitUntil: 'domcontentloaded' });
  if (ctx.storageKey && ctx.sessionJson) {
    await page.evaluate(
      ([k, v]) => localStorage.setItem(k, v),
      [ctx.storageKey, ctx.sessionJson] as const,
    );
  }
}

/**
 * canPlayType() probes per codec the providers actually serve. Used to tell a
 * genuine app/stream failure apart from "this browser build simply has no
 * decoder for that codec" — which is also exactly what real users hit when a
 * title is HEVC or E-AC-3 in Chrome/Firefox.
 */
const CODEC_PROBES: Record<string, string> = {
  h264: 'video/mp4; codecs="avc1.42E01E"',
  hevc: 'video/mp4; codecs="hvc1.1.6.L93.B0"',
  h265: 'video/mp4; codecs="hvc1.1.6.L93.B0"',
  vp9: 'video/webm; codecs="vp9"',
  av1: 'video/mp4; codecs="av01.0.05M.08"',
  mpeg2video: 'video/mp2t; codecs="mp2v"',
  aac: 'audio/mp4; codecs="mp4a.40.2"',
  ac3: 'audio/mp4; codecs="ac-3"',
  eac3: 'audio/mp4; codecs="ec-3"',
  mp2: 'audio/mpeg',
  mp3: 'audio/mpeg',
  opus: 'audio/webm; codecs="opus"',
};

type VideoState = {
  readyState: number;
  videoWidth: number;
  videoHeight: number;
  currentTime: number;
  paused: boolean;
  errorCode: number | null;
  codecSupport: Record<string, string>;
};

const EMPTY_STATE: VideoState = {
  readyState: 0,
  videoWidth: 0,
  videoHeight: 0,
  currentTime: 0,
  paused: true,
  errorCode: null,
  codecSupport: {},
};

/** Mounts the URL in a <video> on the app origin, exactly like the VOD player. */
async function probeDirect(page: Page, url: string, seconds = 20): Promise<VideoState> {
  await page.evaluate((src) => {
    document.body.innerHTML =
      '<video id="probe" playsinline muted autoplay style="width:100%;height:100vh;background:#000"></video>';
    const v = document.getElementById('probe') as HTMLVideoElement;
    v.src = src;
    v.play().catch(() => {});
  }, url);

  const deadline = Date.now() + seconds * 1000;
  let state = EMPTY_STATE;
  while (Date.now() < deadline) {
    state = await readVideo(page, '#probe');
    if (state.readyState >= 2 || state.errorCode !== null) break;
    await page.waitForTimeout(1000);
  }
  return state;
}

async function readVideo(page: Page, selector: string): Promise<VideoState> {
  return page.evaluate(
    ([sel, probes]) => {
      const probe = document.createElement('video');
      const v = document.querySelector(sel) as HTMLVideoElement | null;
      const codecSupport: Record<string, string> = {};
      for (const [name, type] of Object.entries(probes)) codecSupport[name] = probe.canPlayType(type);
      return {
        readyState: v?.readyState ?? 0,
        videoWidth: v?.videoWidth ?? 0,
        videoHeight: v?.videoHeight ?? 0,
        currentTime: v?.currentTime ?? 0,
        paused: v?.paused ?? true,
        errorCode: v?.error?.code ?? null,
        codecSupport,
      };
    },
    [selector, CODEC_PROBES] as const,
  );
}

/** Live TV goes through the app's real /iptv player (hls.js + proxy failover). */
async function probeLiveUi(page: Page, seconds = 35): Promise<VideoState> {
  await page.goto('/iptv', { waitUntil: 'domcontentloaded' });
  const deadline = Date.now() + seconds * 1000;
  let state = EMPTY_STATE;
  while (Date.now() < deadline) {
    state = await readVideo(page, 'video');
    if (state.readyState >= 2 || state.videoWidth > 0) break;
    await page.waitForTimeout(1500);
  }
  return state;
}

/* ---------------------------------------------------------------- decode --- */

type Decode = {
  ok: boolean;
  video: string | null;
  audio: string | null;
  width: number;
  height: number;
  duration: number | null;
  seekOk: boolean;
  frame: string | null;
  detail?: string;
};

const FF_HLS = ['-allowed_extensions', 'ALL', '-extension_picky', '0'];

async function decodeProbe(url: string, kind: Kind, slug: string): Promise<Decode> {
  const hls = kind === 'live' ? FF_HLS : [];
  const out: Decode = {
    ok: false,
    video: null,
    audio: null,
    width: 0,
    height: 0,
    duration: null,
    seekOk: false,
    frame: null,
  };
  try {
    const { stdout } = await run(
      'ffprobe',
      [
        '-v', 'error',
        ...hls,
        '-show_entries', 'stream=codec_name,codec_type,width,height',
        '-show_entries', 'format=duration',
        '-of', 'json',
        url,
      ],
      { timeout: 180_000, maxBuffer: 8 << 20 },
    );
    const meta = JSON.parse(stdout) as {
      streams?: { codec_name?: string; codec_type?: string; width?: number; height?: number }[];
      format?: { duration?: string };
    };
    const v = meta.streams?.find((s) => s.codec_type === 'video' && (s.width ?? 0) > 0);
    const a = meta.streams?.find((s) => s.codec_type === 'audio');
    out.video = v?.codec_name ?? null;
    out.audio = a?.codec_name ?? null;
    out.width = v?.width ?? 0;
    out.height = v?.height ?? 0;
    out.duration = meta.format?.duration ? Number(meta.format.duration) : null;
  } catch (e) {
    out.detail = `ffprobe: ${(e as Error).message.split('\n')[0]}`;
    return out;
  }

  // VOD gets a mid-file frame: that only works if HTTP Range / seeking works
  // end-to-end (provider -> relay -> edge function -> client).
  const seekTo = kind !== 'live' && (out.duration ?? 0) > 120 ? Math.floor((out.duration ?? 0) / 3) : 0;
  const frame = path.join(OUT_DIR, `${slug}-frame.jpg`);
  try {
    await run(
      'ffmpeg',
      [
        '-v', 'error',
        ...hls,
        ...(seekTo ? ['-ss', String(seekTo)] : []),
        '-i', url,
        '-frames:v', '1',
        '-y', frame,
      ],
      { timeout: 240_000, maxBuffer: 8 << 20 },
    );
    out.frame = frame;
    out.seekOk = seekTo > 0;
    out.ok = true;
  } catch (e) {
    out.detail = `ffmpeg: ${(e as Error).message.split('\n')[0]}`;
  }
  return out;
}

/* ------------------------------------------------------------------ spec --- */

const CASES: { kind: Kind; label: string }[] = [
  { kind: 'live', label: 'Live TV' },
  { kind: 'vod', label: 'Movies' },
  { kind: 'series', label: 'Series' },
];

test.describe('IPTV playback (Live / Movies / Series)', () => {
  test.describe.configure({ mode: 'serial', timeout: 480_000 });

  test.beforeAll(async () => {
    await mkdir(OUT_DIR, { recursive: true });
  });

  for (const { kind, label } of CASES) {
    test(`${label} plays and reports healthy playback state`, async ({ page }, testInfo) => {
      const ctx = await loadCtx();
      test.skip(!ctx, 'No preview session injected — sign in via the Lovable preview first.');
      if (!ctx) return;

      const target = await discover(ctx, kind);
      const url = streamUrl(ctx, target);
      const slug = `${kind}-${target.id}`;
      testInfo.annotations.push({ type: 'target', description: `${label}: ${target.name} (#${target.id})` });

      // --- transport: status + range/content-type headers -----------------
      const head = await fetch(url, { headers: { Range: 'bytes=0-1023' } });
      const transport = {
        status: head.status,
        contentType: head.headers.get('content-type'),
        contentRange: head.headers.get('content-range'),
        acceptRanges: head.headers.get('accept-ranges'),
      };
      await head.body?.cancel();
      expect(
        [200, 206].includes(transport.status),
        `iptv-stream returned HTTP ${transport.status} for ${label}`,
      ).toBeTruthy();

      // --- real browser ----------------------------------------------------
      await restoreSession(page, ctx);
      const state = kind === 'live' ? await probeLiveUi(page) : await probeDirect(page, url);
      const shot = path.join(OUT_DIR, `${slug}-browser.png`);
      await page.screenshot({ path: shot });
      await testInfo.attach(`${label} browser`, { path: shot, contentType: 'image/png' });

      // --- decoder truth ---------------------------------------------------
      const decode = await decodeProbe(url, kind, slug);
      if (decode.frame) {
        await testInfo.attach(`${label} decoded frame`, { path: decode.frame, contentType: 'image/jpeg' });
      }

      const rendersInBrowser = state.readyState >= 2 && state.videoWidth > 0;
      // "" from canPlayType means this browser build has no decoder for the
      // codec the provider actually served — not an app bug.
      const videoCodecSupport = decode.video ? (state.codecSupport[decode.video] ?? '') : 'maybe';
      const audioCodecSupport = decode.audio ? (state.codecSupport[decode.audio] ?? '') : 'maybe';
      const codecMissing = !!decode.video && videoCodecSupport === '';
      const report = {
        case: label,
        target: `${target.name} (#${target.id})`,
        transport,
        browser: { ...state, renders: rendersInBrowser },
        decode: { ...decode, frame: decode.frame ? path.basename(decode.frame) : null },
        codecs: {
          video: `${decode.video ?? '?'} → browser "${videoCodecSupport}"`,
          audio: `${decode.audio ?? '?'} → browser "${audioCodecSupport}"`,
        },
        verdict: rendersInBrowser ? 'PLAYS_IN_BROWSER' : decode.ok ? 'PLAYS_DECODER_ONLY' : 'FAILED',
        note: rendersInBrowser
          ? audioCodecSupport === ''
            ? `Video plays, but "${decode.audio}" audio is unsupported here — Chrome/Firefox users will get silence.`
            : undefined
          : codecMissing
            ? `This browser build has no "${decode.video}" decoder (canPlayType ""), so rendering cannot be asserted here. The stream itself decodes fine.`
            : decode.detail,
      };
      console.log(`[iptv-e2e] ${JSON.stringify(report, null, 2)}`);
      await writeFile(path.join(OUT_DIR, `${slug}-report.json`), JSON.stringify(report, null, 2));
      await testInfo.attach(`${label} status`, {
        body: JSON.stringify(report, null, 2),
        contentType: 'application/json',
      });

      // The stream MUST decode: real codecs, real resolution, a real frame.
      expect(decode.ok, `no frame decoded for ${label}: ${decode.detail ?? ''}`).toBeTruthy();
      expect(decode.width, `${label} has no video resolution`).toBeGreaterThan(0);

      // Browser rendering is only asserted when the browser can actually decode
      // the codec the provider serves — otherwise it is a sandbox limitation.
      if (!codecMissing) {
        expect(
          state.errorCode,
          `browser MediaError ${state.errorCode} while playing ${label}`,
        ).toBeNull();
        expect(rendersInBrowser, `${label} never reached readyState>=2 in the browser`).toBeTruthy();
      }
    });
  }
});
