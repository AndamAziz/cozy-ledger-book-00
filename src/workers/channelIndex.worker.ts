/**
 * Channel index worker.
 *
 * All the heavy playlist processing (grouping tens of thousands of channels,
 * lower-casing names for search, filtering by group/query and slicing them into
 * per-category sections) happens here, off the main thread, so typing in the
 * search box or switching category never stalls the UI.
 */

export interface WorkerChannel {
  name: string;
  logo: string | null;
  group: string;
  url: string;
  headers?: unknown;
}

interface IndexRequest {
  type: 'index';
  id: number;
  channels: WorkerChannel[];
}

interface QueryRequest {
  type: 'query';
  id: number;
  group: string;
  query: string;
  /** Max items materialised for the section view. */
  sectionLimit: number;
}

type Request = IndexRequest | QueryRequest;

let channels: WorkerChannel[] = [];
let names: string[] = [];
let groupCounts: Record<string, number> = {};

const isMovieItem = (c?: WorkerChannel) =>
  !!c && (/\.(mp4|mkv|avi|mov)(\?|$)/i.test(c.url) || /movie|film|vod|series|cinema/i.test(c.group));

function buildIndex(list: WorkerChannel[]) {
  channels = list;
  names = new Array(list.length);
  const counts: Record<string, number> = {};
  for (let i = 0; i < list.length; i += 1) {
    const c = list[i];
    names[i] = c.name.toLowerCase();
    const g = c.group || 'Other';
    counts[g] = (counts[g] || 0) + 1;
  }
  groupCounts = counts;
}

function runQuery(req: QueryRequest) {
  const q = req.query.trim().toLowerCase();
  const all = req.group === 'all';
  const filtered: WorkerChannel[] = [];
  for (let i = 0; i < channels.length; i += 1) {
    const c = channels[i];
    if (!all && c.group !== req.group) continue;
    if (q && !names[i].includes(q)) continue;
    filtered.push(c);
  }

  const map = new Map<string, WorkerChannel[]>();
  const capped = filtered.slice(0, req.sectionLimit);
  for (const c of capped) {
    const key = c.group || 'Other';
    const list = map.get(key);
    if (list) list.push(c);
    else map.set(key, [c]);
  }
  const sections = [...map.entries()].map(([name, items]) => ({
    name,
    items,
    movie: isMovieItem(items[0]),
  }));

  return { filtered, sections };
}

self.onmessage = (event: MessageEvent<Request>) => {
  const req = event.data;
  if (req.type === 'index') {
    buildIndex(req.channels);
    (self as unknown as Worker).postMessage({
      type: 'indexed',
      id: req.id,
      total: channels.length,
      groupCounts,
    });
    return;
  }
  if (req.type === 'query') {
    const { filtered, sections } = runQuery(req);
    (self as unknown as Worker).postMessage({
      type: 'result',
      id: req.id,
      filtered,
      sections,
      groupCounts,
    });
  }
};
