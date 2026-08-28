const express = require('express');
const cors = require('cors');
const fetch = require('node-fetch');

const app = express();
const PORT = process.env.PORT || 8090;

app.use(cors());

app.get('/proxy', async (req, res) => {
    const targetUrl = req.query.url;
    if (!targetUrl) {
        return res.status(400).json({ error: 'Missing url parameter' });
    }

    try {
        const parsedTarget = new URL(targetUrl);
        
        const upstreamHeaders = {
            'User-Agent': 'Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/120.0.0.0 Safari/537.36',
            'Accept': 'text/html,application/xhtml+xml,application/xml;q=0.9,image/avif,image/webp,image/apng,*/*;q=0.8',
            'Accept-Language': 'en-US,en;q=0.9',
            'Referer': `${parsedTarget.protocol}//${parsedTarget.host}/`,
            'Connection': 'keep-alive',
            'Host': parsedTarget.host
        };

        if (req.headers['range']) upstreamHeaders['Range'] = req.headers['range'];

        const upstream = await fetch(parsedTarget.toString(), {
            headers: upstreamHeaders
        });

        res.setHeader('X-Final-URL', upstream.url);
        res.status(upstream.status);

        const forwardHeaders = [
            'content-type',
            'content-length',
            'content-range',
            'accept-ranges',
            'etag',
            'last-modified',
            'cache-control'
        ];

        for (const h of forwardHeaders) {
            const v = upstream.headers.get(h);
            if (v) res.setHeader(h, v);
        }

        if (upstream.headers.has('accept-ranges')) {
            res.setHeader('Accept-Ranges', 'bytes');
        }

        upstream.body.on('error', (err) => {
            if (!res.destroyed) res.end();
        });

        res.on('close', () => {
            upstream.body.destroy();
        });

        upstream.body.pipe(res);

    } catch (err) {
        if (!res.headersSent) {
            res.status(502).json({ error: 'Relay fetch failed', detail: err.message });
        }
    }
});

app.listen(PORT, () => console.log(`IPTV relay listening on port ${PORT}`));
