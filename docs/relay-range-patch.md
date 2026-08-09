# Relay Range/206 Patch

Paste this route handler into your Express relay app (e.g. `server.js` / `app.js`), replacing the existing `/proxy` route.

**Requirements:** Node.js 18+ (uses global `fetch`), or any Node + `node-fetch`. The handler auto-detects Web vs Node streams.

```javascript
app.all('/proxy', async (req, res) => {
  const token = req.headers['x-relay-token'];
  if (token !== process.env.RELAY_TOKEN) {
    return res.status(403).json({ error: 'Invalid relay token' });
  }

  const target = req.query.url;
  if (!target || typeof target !== 'string') {
    return res.status(400).json({ error: 'Missing url query param' });
  }

  const upstreamHeaders = {
    'User-Agent': req.headers['user-agent'] || 'Mozilla/5.0',
    'Accept': req.headers['accept'] || '*/*',
    'Accept-Encoding': req.headers['accept-encoding'] || 'identity',
  };
  if (req.headers['range']) upstreamHeaders['Range'] = req.headers['range'];
  if (req.headers['if-range']) upstreamHeaders['If-Range'] = req.headers['if-range'];
  if (req.headers['referer']) upstreamHeaders['Referer'] = req.headers['referer'];
  if (req.headers['origin']) upstreamHeaders['Origin'] = req.headers['origin'];
  if (req.headers['cookie']) upstreamHeaders['Cookie'] = req.headers['cookie'];

  try {
    const upstream = await fetch(target, {
      method: req.method === 'HEAD' ? 'HEAD' : 'GET',
      headers: upstreamHeaders,
      redirect: 'follow',
    });

    res.status(upstream.status);
    const forward = ['content-type', 'content-length', 'content-range', 'accept-ranges', 'content-encoding', 'etag', 'last-modified', 'cache-control'];
    for (const h of forward) {
      const v = upstream.headers.get(h);
      if (v) res.setHeader(h, v);
    }
    if (!res.hasHeader('accept-ranges')) res.setHeader('Accept-Ranges', 'bytes');
    res.setHeader('x-final-url', upstream.url);
    res.setHeader('Access-Control-Allow-Origin', '*');

    if (req.method === 'HEAD' || !upstream.body) {
      return res.end();
    }

    const body = upstream.body;

    // Web stream (Node 18+ global fetch)
    if (typeof body.getReader === 'function') {
      const reader = body.getReader();
      let closed = false;
      res.on('close', () => {
        closed = true;
        reader.cancel().catch(() => {});
      });
      while (!closed) {
        const { done, value } = await reader.read();
        if (done) break;
        res.write(Buffer.from(value));
      }
      return res.end();
    }

    // Node stream (node-fetch v2)
    body.pipe(res);
    body.on('error', (err) => {
      console.error('[relay stream error]', err);
      if (!res.destroyed) res.end();
    });
  } catch (err) {
    console.error('[relay /proxy error]', err);
    if (!res.headersSent) {
      res.status(502).json({ error: 'Proxy fetch failed', detail: err.message });
    }
  }
});
```

## What this fixes

1. **Forwards `Range` / `If-Range`** from the client to the upstream provider.
2. **Returns the upstream status code verbatim** — so `206 Partial Content` reaches the browser instead of being downgraded to `200`.
3. **Forwards `Content-Range`, `Content-Length`, `Accept-Ranges`** — required for VOD seeking and for reading the `moov` atom at the end of non-faststart MP4 files.
4. **Adds `x-final-url`** — lets the Edge Function rewrite HLS segment URLs using the real upstream base after redirects.
5. **Streams the body** instead of buffering the whole file in memory.

## Restart

After replacing the handler, restart the relay process:

```bash
pm2 restart relay   # or whatever your process is called
```

Then verify a Range request actually returns 206:

```bash
curl -I -r 0-1023 "https://relay.andam.uk:8443/proxy?url=https%3A%2F%2Fexample.com%2Fsome-range-capable.mp4" \
  -H "X-Relay-Token: $RELAY_TOKEN"
```

You should see `HTTP/2 206` and a `content-range:` header.
