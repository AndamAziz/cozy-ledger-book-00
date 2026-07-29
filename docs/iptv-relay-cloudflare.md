# IPTV Relay — Cloudflare TLS-fingerprint bypass (VPS 213.171.212.110)

The edge function can send perfect Chrome headers, cookies and client hints, but it
**cannot change the TLS/HTTP2 fingerprint** (JA3/JA4 + H2 SETTINGS). Cloudflare
fingerprints the handshake, sees "Deno/BoringSSL", and throttles or challenges us.

Fix: the relay stops using Node's `fetch`/`http` and instead proxies every upstream
request through **curl-impersonate**, which reproduces Chrome's exact TLS ClientHello,
cipher order, extension order and HTTP/2 settings.

The relay keeps its existing contract with the edge function:

```
GET https://relay.andam.uk:8443/?url=<urlencoded target>
X-Relay-Token: <IPTV_EGRESS_PROXY_TOKEN>
→ streams the body back, sets X-Final-URL to the resolved URL
```

Nothing in the Lovable app changes.

---

## 1. Install curl-impersonate (Chrome build)

```bash
ssh root@213.171.212.110
cd /opt
CI_VER=1.0.1
curl -L -o ci.tar.gz \
  "https://github.com/lwthiker/curl-impersonate/releases/download/v${CI_VER}/curl-impersonate-v${CI_VER}.x86_64-linux-gnu.tar.gz"
mkdir -p /opt/curl-impersonate && tar -xzf ci.tar.gz -C /opt/curl-impersonate
chmod +x /opt/curl-impersonate/*

# sanity check — should print the Chrome JA3 hash, not curl's
/opt/curl-impersonate/curl_chrome116 -s https://tls.browserleaks.com/json | head -c 400
```

> If the GitHub asset 404s, use the maintained fork:
> `https://github.com/lexiforest/curl-impersonate/releases` (binaries named `curl_chrome131`).
> Any `curl_chrome*` wrapper works — just change `IMPERSONATE_BIN` below.

## 2. Replace the relay handler

`/root/iptv-relay/server.js` — full drop-in file:

```js
'use strict';
const express = require('express');
const { spawn } = require('child_process');
const fs = require('fs');
const https = require('https');

const PORT          = Number(process.env.PORT || 8443);
const TOKEN         = process.env.RELAY_TOKEN || '';
const IMPERSONATE   = process.env.IMPERSONATE_BIN || '/opt/curl-impersonate/curl_chrome116';
const COOKIE_DIR    = '/var/lib/iptv-relay/cookies';
const CONNECT_TMO   = 15;   // seconds for the handshake
const MAX_TMO       = 0;    // 0 = no total limit (long-lived .ts streams)

fs.mkdirSync(COOKIE_DIR, { recursive: true });

const app = express();
app.disable('x-powered-by');

app.use((req, res, next) => {
  res.set('Access-Control-Allow-Origin', '*');
  res.set('Access-Control-Allow-Headers', 'Content-Type, X-Relay-Token, Range');
  res.set('Access-Control-Expose-Headers', 'X-Final-URL, Content-Range, Accept-Ranges');
  if (req.method === 'OPTIONS') return res.status(204).end();
  next();
});

// Per-host cookie jar: Cloudflare hands out cf_clearance / __cf_bm on the first
// request and expects them on every following segment request.
const jarFor = (host) =>
  `${COOKIE_DIR}/${host.replace(/[^a-z0-9.:_-]/gi, '_')}.txt`;

app.get('/', (req, res) => {
  if (TOKEN && req.get('X-Relay-Token') !== TOKEN) return res.status(403).send('forbidden');

  const target = req.query.url;
  if (!target || !/^https?:\/\//i.test(target)) return res.status(400).send('bad url');

  let host;
  try { host = new URL(target).host; } catch { return res.status(400).send('bad url'); }

  const jar = jarFor(host);
  const args = [
    '-sS',
    '-L',                       // follow redirects (panels redirect to CDN edges)
    '--max-redirs', '5',
    '-D', '-',                  // response headers to stdout before the body
    '--connect-timeout', String(CONNECT_TMO),
    '--no-buffer',              // stream, do not buffer the segment
    '-c', jar, '-b', jar,       // persistent cookie jar per provider host
    '--compressed-no-gzip' in {} ? '' : '--no-alpn-noop',
  ].filter(Boolean);

  // curl-impersonate already sets the full Chrome header set + client hints;
  // only forward what is request-specific.
  if (req.get('range')) { args.push('-H', `Range: ${req.get('range')}`); }
  if (MAX_TMO) args.push('--max-time', String(MAX_TMO));
  args.push(target);

  const child = spawn(IMPERSONATE, args, { stdio: ['ignore', 'pipe', 'pipe'] });

  let headerBuf = Buffer.alloc(0);
  let headersDone = false;
  let finalUrl = target;

  child.stdout.on('data', (chunk) => {
    if (headersDone) { res.write(chunk); return; }

    headerBuf = Buffer.concat([headerBuf, chunk]);
    // With -L, curl prints one header block per hop; the LAST block is the real one.
    const text = headerBuf.toString('latin1');
    const sep = text.lastIndexOf('\r\n\r\n');
    if (sep === -1) return;

    const blocks = text.slice(0, sep).split(/\r\n\r\n/);
    const last = blocks[blocks.length - 1].split(/\r\n/);
    const statusLine = last.shift() || 'HTTP/1.1 502';
    const status = Number(statusLine.split(' ')[1]) || 502;

    // Track redirects so the edge function can resolve relative m3u8 paths.
    for (const b of blocks) {
      const loc = /^location:\s*(.+)$/im.exec(b);
      if (loc) { try { finalUrl = new URL(loc[1].trim(), finalUrl).toString(); } catch {} }
    }

    for (const line of last) {
      const i = line.indexOf(':');
      if (i < 1) continue;
      const k = line.slice(0, i).trim().toLowerCase();
      const v = line.slice(i + 1).trim();
      if (['transfer-encoding', 'connection', 'content-encoding',
           'access-control-allow-origin', 'access-control-allow-headers'].includes(k)) continue;
      res.set(k, v);
    }
    res.set('X-Final-URL', finalUrl);
    res.status(status);
    headersDone = true;

    const bodyStart = Buffer.byteLength(text.slice(0, sep + 4), 'latin1');
    if (headerBuf.length > bodyStart) res.write(headerBuf.subarray(bodyStart));
  });

  child.stderr.on('data', (d) => console.error('[curl]', d.toString().trim()));
  child.on('close', () => { try { res.end(); } catch {} });
  child.on('error', (e) => { if (!headersDone) res.status(502).send(String(e)); else res.end(); });

  // Client (edge function) gave up → kill the upstream so the provider's single
  // viewing slot is released immediately.
  const kill = () => { try { child.kill('SIGKILL'); } catch {} };
  req.on('aborted', kill);
  res.on('close', kill);
});

const opts = {
  key: fs.readFileSync(process.env.TLS_KEY || '/etc/letsencrypt/live/relay.andam.uk/privkey.pem'),
  cert: fs.readFileSync(process.env.TLS_CERT || '/etc/letsencrypt/live/relay.andam.uk/fullchain.pem'),
};
https.createServer(opts, app).listen(PORT, () => console.log('relay on :' + PORT));
```

Remove the stray ternary line if your linter complains — it is a no-op guard:
delete `'--compressed-no-gzip' in {} ? '' : '--no-alpn-noop',` and the `.filter(Boolean)`
if you prefer a clean array.

## 3. Service + env

`/etc/systemd/system/iptv-relay.service`:

```ini
[Unit]
Description=IPTV egress relay (curl-impersonate)
After=network-online.target

[Service]
WorkingDirectory=/root/iptv-relay
Environment=PORT=8443
Environment=RELAY_TOKEN=<same value as IPTV_EGRESS_PROXY_TOKEN>
Environment=IMPERSONATE_BIN=/opt/curl-impersonate/curl_chrome116
Environment=LD_LIBRARY_PATH=/opt/curl-impersonate
ExecStart=/usr/bin/node server.js
Restart=always
RestartSec=2
LimitNOFILE=65535

[Install]
WantedBy=multi-user.target
```

```bash
systemctl daemon-reload && systemctl enable --now iptv-relay
systemctl status iptv-relay --no-pager
```

## 4. Verify the bypass

```bash
# 1) fingerprint check — ja3_hash must match Chrome, not curl/Deno
curl -sk -H "X-Relay-Token: $RELAY_TOKEN" \
  "https://relay.andam.uk:8443/?url=$(printf %s 'https://tls.browserleaks.com/json' | jq -sRr @uri)" | head -c 400

# 2) provider handshake through the relay
curl -sk -D- -o /dev/null -H "X-Relay-Token: $RELAY_TOKEN" \
  "https://relay.andam.uk:8443/?url=http%3A%2F%2Fmyrestreamer.com%3A8080%2Fplayer_api.php%3Fusername%3D...%26password%3D..."

# 3) THE decisive test — segment throughput must be >= 150 KB/s
curl -sk -o /dev/null -w "speed=%{speed_download} B/s time=%{time_total}s\n" \
  -H "X-Relay-Token: $RELAY_TOKEN" \
  "https://relay.andam.uk:8443/?url=<urlencoded .ts segment url>"
```

Before: ~27 KB/s (unplayable). Target after: **≥ 150 KB/s** for a 1.1 Mbps channel.

## 5. If throughput is still ~27 KB/s

Then Cloudflare was never the limiter — it is the provider's own per-account
bandwidth cap (that account also reports `max_connections: "1"`). Confirm with:

```bash
# same segment, straight from the VPS, no relay, no impersonation
curl -o /dev/null -s -w "%{speed_download} B/s\n" "<raw .ts segment url>"
```

If the raw number is also ~27 KB/s the account is throttled at source and only a
faster provider plan fixes it.

## 6. Notes

- Cookie jars live in `/var/lib/iptv-relay/cookies`; clear them if a host starts
  returning 403 after a long idle period (`rm -f /var/lib/iptv-relay/cookies/*`).
- Keep one `curl_chrome*` version pinned — bumping it changes the JA3 and forces
  Cloudflare to re-evaluate the IP's reputation.
- The relay must stay on a residential/ISP-reputable IP; a flagged datacentre range
  gets challenged regardless of fingerprint.
