'use strict';

const fs = require('fs');
const http = require('http');
const path = require('path');
const zlib = require('zlib');
const { pipeline } = require('stream');

const ROOT_DIR = path.resolve(__dirname);
const PORT = Number(process.env.PORT) || 8080;
const FEATURE_API_BASE_URL = (process.env.FEATURE_SEMBAKO_API_URL || 'https://paket-sembako-online-943127658752.asia-southeast1.run.app').replace(/\/$/, '');
const ONE_HOUR_SECONDS = 60 * 60;
const CATALOG_PROXY_CACHE_SECONDS = 60;
const CATALOG_PROXY_TIMEOUT_MS = 10000;
let catalogProxyCache = null;
const THIRTY_DAYS_SECONDS = 30 * 24 * 60 * 60;

const SECURITY_HEADERS = {
    'Content-Security-Policy-Report-Only': [
        "default-src 'self'",
        "base-uri 'self'",
        "object-src 'none'",
        "frame-ancestors 'self'",
        "script-src 'self' 'unsafe-inline' https://script.google.com https://script.googleusercontent.com https://cdn.tailwindcss.com https://cdn.jsdelivr.net https://cdnjs.cloudflare.com",
        "style-src 'self' 'unsafe-inline' https://fonts.googleapis.com https://cdnjs.cloudflare.com",
        "img-src 'self' data: https://ik.imagekit.io https://i.ibb.co.com https://placehold.co https://via.placeholder.com",
        "font-src 'self' data: https://fonts.gstatic.com",
        "connect-src 'self' https://script.google.com https://script.googleusercontent.com https://paket-sembako-online-943127658752.asia-southeast1.run.app https://nominatim.openstreetmap.org",
        "frame-src 'self'",
        "form-action 'self' https://wa.me"
    ].join('; '),
    'Permissions-Policy': 'camera=(), microphone=(), geolocation=(self), payment=(), clipboard-read=(self), clipboard-write=(self), fullscreen=(self)',
    'Strict-Transport-Security': 'max-age=31536000',
    'X-Content-Type-Options': 'nosniff',
    'X-Frame-Options': 'SAMEORIGIN',
    'Referrer-Policy': 'strict-origin-when-cross-origin'
};

const MIME_TYPES = {
    '.css': 'text/css; charset=UTF-8',
    '.eot': 'application/vnd.ms-fontobject',
    '.gif': 'image/gif',
    '.html': 'text/html; charset=UTF-8',
    '.ico': 'image/x-icon',
    '.jpg': 'image/jpeg',
    '.jpeg': 'image/jpeg',
    '.js': 'application/javascript; charset=UTF-8',
    '.json': 'application/json; charset=UTF-8',
    '.map': 'application/json; charset=UTF-8',
    '.png': 'image/png',
    '.svg': 'image/svg+xml; charset=UTF-8',
    '.txt': 'text/plain; charset=UTF-8',
    '.ttf': 'font/ttf',
    '.webp': 'image/webp',
    '.woff': 'font/woff',
    '.woff2': 'font/woff2',
    '.xml': 'application/xml; charset=UTF-8'
};

const STATIC_EXTENSIONS = new Set([
    '.css',
    '.eot',
    '.gif',
    '.ico',
    '.jpg',
    '.jpeg',
    '.js',
    '.json',
    '.map',
    '.png',
    '.svg',
    '.ttf',
    '.webp',
    '.woff',
    '.woff2',
    '.xml'
]);

const COMPRESSIBLE_EXTENSIONS = new Set([
    '.css',
    '.html',
    '.js',
    '.json',
    '.map',
    '.svg',
    '.txt',
    '.xml'
]);

function getCacheControl(extname) {
    if (extname === '.html') {
        return 'no-cache, max-age=0, must-revalidate';
    }
    if (STATIC_EXTENSIONS.has(extname)) {
        return `public, max-age=${THIRTY_DAYS_SECONDS}, immutable`;
    }
    return `public, max-age=${ONE_HOUR_SECONDS}`;
}

function getMimeType(extname) {
    return MIME_TYPES[extname] || 'application/octet-stream';
}

function getEncoding(acceptEncodingHeader) {
    const header = (acceptEncodingHeader || '').toLowerCase();
    if (header.includes('br')) return 'br';
    if (header.includes('gzip')) return 'gzip';
    return null;
}

function isPathInsideRoot(filePath) {
    const relative = path.relative(ROOT_DIR, filePath);
    return relative && !relative.startsWith('..') && !path.isAbsolute(relative);
}

async function resolveFilePath(rawPathname) {
    let pathname = rawPathname || '/';
    if (pathname.endsWith('/')) pathname += 'index.html';
    if (pathname === '/') pathname = '/index.html';

    const sanitized = path.normalize(pathname).replace(/^([/\\])+/, '');
    let filePath = path.join(ROOT_DIR, sanitized);

    if (!isPathInsideRoot(filePath)) {
        return null;
    }

    try {
        const stat = await fs.promises.stat(filePath);
        if (stat.isDirectory()) {
            filePath = path.join(filePath, 'index.html');
        }
    } catch (error) {
        if (!path.extname(filePath)) {
            const htmlCandidate = `${filePath}.html`;
            try {
                const htmlStat = await fs.promises.stat(htmlCandidate);
                if (htmlStat.isFile()) {
                    filePath = htmlCandidate;
                }
            } catch (candidateError) {
                return null;
            }
        } else {
            return null;
        }
    }

    if (!isPathInsideRoot(filePath)) {
        return null;
    }

    return filePath;
}

function sendTextResponse(res, statusCode, text, contentType = 'text/plain; charset=UTF-8') {
    const body = Buffer.from(text, 'utf8');
    res.writeHead(statusCode, {
        'Content-Length': body.length,
        'Content-Type': contentType
    });
    res.end(body);
}

function writeCommonHeaders(extname, stat, etag) {
    return {
        'Accept-Ranges': 'bytes',
        'Cache-Control': getCacheControl(extname),
        ETag: etag,
        'Last-Modified': stat.mtime.toUTCString(),
        'Referrer-Policy': 'strict-origin-when-cross-origin',
        Server: 'gos-frontend',
        Vary: 'Accept-Encoding',
        'X-Content-Type-Options': 'nosniff',
        'X-Frame-Options': 'SAMEORIGIN'
    };
}

function pipeWithCompression(res, source, encoding) {
    if (encoding === 'br') {
        const brotli = zlib.createBrotliCompress({
            params: {
                [zlib.constants.BROTLI_PARAM_QUALITY]: 5
            }
        });
        pipeline(source, brotli, res, () => undefined);
        return;
    }

    if (encoding === 'gzip') {
        const gzip = zlib.createGzip({ level: 6 });
        pipeline(source, gzip, res, () => undefined);
        return;
    }

    pipeline(source, res, () => undefined);
}

async function fetchWithTimeout(url, options = {}, timeoutMs = CATALOG_PROXY_TIMEOUT_MS) {
    const controller = new AbortController();
    const timer = setTimeout(() => controller.abort(), timeoutMs);
    try {
        return await fetch(url, { ...options, signal: controller.signal });
    } finally {
        clearTimeout(timer);
    }
}

function sendCatalogProxyError(res, statusCode, code, message) {
    sendTextResponse(res, statusCode, JSON.stringify({
        success: false,
        error: code,
        message
    }), 'application/json; charset=UTF-8');
}

const server = http.createServer(async (req, res) => {
    Object.entries(SECURITY_HEADERS).forEach(([name, value]) => res.setHeader(name, value));
    if (!req.url) {
        sendTextResponse(res, 400, 'Bad Request');
        return;
    }

    if (req.method !== 'GET' && req.method !== 'HEAD') {
        res.setHeader('Allow', 'GET, HEAD');
        sendTextResponse(res, 405, 'Method Not Allowed');
        return;
    }

    const parsedUrl = new URL(req.url, 'http://localhost');

    // Same-origin server-to-server proxy. The browser calls this website only;
    // this server calls the feature API privately, so browser CORS is unnecessary.
    if (parsedUrl.pathname === '/api/products') {
        try {
            const query = parsedUrl.search || '';
            const now = Date.now();
            if (catalogProxyCache && catalogProxyCache.expiresAt > now && catalogProxyCache.query === query) {
                sendTextResponse(res, 200, catalogProxyCache.body, 'application/json; charset=UTF-8');
                return;
            }

            const upstream = await fetchWithTimeout(`${FEATURE_API_BASE_URL}/api/catalog/products${query}`, {
                headers: { Accept: 'application/json' }
            });
            const body = await upstream.text();
            if (!upstream.ok) {
                sendCatalogProxyError(res, upstream.status, 'CATALOG_UPSTREAM_ERROR', 'Catalog upstream request failed');
                return;
            }

            catalogProxyCache = {
                query,
                body,
                expiresAt: now + CATALOG_PROXY_CACHE_SECONDS * 1000
            };
            sendTextResponse(res, 200, body, 'application/json; charset=UTF-8');
        } catch (error) {
            console.error('Catalog proxy error:', error);
            const isTimeout = error && error.name === 'AbortError';
            sendCatalogProxyError(
                res,
                502,
                isTimeout ? 'CATALOG_UPSTREAM_TIMEOUT' : 'CATALOG_API_UNAVAILABLE',
                isTimeout ? 'Catalog upstream request timed out' : 'Catalog API unavailable'
            );
        }
        return;
    }

    if (parsedUrl.pathname === '/admin') {
        const search = parsedUrl.search || '';
        res.writeHead(308, {
            Location: `/admin/${search}`,
            'Cache-Control': 'public, max-age=3600',
            Server: 'gos-frontend'
        });
        res.end();
        return;
    }

    const filePath = await resolveFilePath(parsedUrl.pathname);
    if (!filePath) {
        sendTextResponse(res, 404, 'Not Found');
        return;
    }

    let stat;
    try {
        stat = await fs.promises.stat(filePath);
        if (!stat.isFile()) {
            sendTextResponse(res, 404, 'Not Found');
            return;
        }
    } catch (error) {
        sendTextResponse(res, 404, 'Not Found');
        return;
    }

    const extname = path.extname(filePath).toLowerCase();
    const contentType = getMimeType(extname);
    const etag = `W/"${stat.size.toString(16)}-${Math.floor(stat.mtimeMs).toString(16)}"`;
    if (req.headers['if-none-match'] === etag) {
        res.writeHead(304, writeCommonHeaders(extname, stat, etag));
        res.end();
        return;
    }

    const headers = {
        ...writeCommonHeaders(extname, stat, etag),
        'Content-Type': contentType
    };

    const canCompress = stat.size >= 1024 && COMPRESSIBLE_EXTENSIONS.has(extname);
    const encoding = canCompress ? getEncoding(req.headers['accept-encoding']) : null;

    if (encoding) {
        headers['Content-Encoding'] = encoding;
    } else {
        headers['Content-Length'] = stat.size;
    }

    res.writeHead(200, headers);
    if (req.method === 'HEAD') {
        res.end();
        return;
    }

    const source = fs.createReadStream(filePath);
    source.on('error', () => {
        if (!res.headersSent) {
            sendTextResponse(res, 500, 'Internal Server Error');
        } else {
            res.destroy();
        }
    });

    pipeWithCompression(res, source, encoding);
});

server.listen(PORT, () => {
    console.log(`Static server running on port ${PORT}`);
});
