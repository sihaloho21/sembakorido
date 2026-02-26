'use strict';

const fs = require('fs');
const http = require('http');
const path = require('path');
const zlib = require('zlib');
const { pipeline } = require('stream');

const ROOT_DIR = path.resolve(__dirname);
const PORT = Number(process.env.PORT) || 8080;
const ONE_HOUR_SECONDS = 60 * 60;
const THIRTY_DAYS_SECONDS = 30 * 24 * 60 * 60;

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
        return `public, max-age=${ONE_HOUR_SECONDS}, must-revalidate`;
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
    if (pathname === '/admin') pathname = '/admin/index.html';
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

const server = http.createServer(async (req, res) => {
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
