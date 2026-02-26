'use strict';

const fs = require('fs');
const path = require('path');
const zlib = require('zlib');

const ROOT = path.resolve(__dirname, '..');
const targets = [
    'akun.html',
    'assets/css/akun-fallback.css',
    'assets/css/tailwind-fallback.css',
    'assets/css/tailwind.min.css',
    'assets/js/akun.js',
    'assets/js/api-helper.js',
    'assets/js/api-service.min.js',
    'assets/js/config.js',
    'assets/js/gas-actions.js',
    'assets/js/paylater-logic.js',
    'assets/js/sanitize.min.js'
];

function writeCompressedFiles(filePath) {
    const absolute = path.join(ROOT, filePath);
    const input = fs.readFileSync(absolute);

    const gzip = zlib.gzipSync(input, { level: 6 });
    fs.writeFileSync(`${absolute}.gz`, gzip);

    const brotli = zlib.brotliCompressSync(input, {
        params: {
            [zlib.constants.BROTLI_PARAM_QUALITY]: 5
        }
    });
    fs.writeFileSync(`${absolute}.br`, brotli);

    const gzipSavings = ((1 - gzip.length / input.length) * 100).toFixed(1);
    const brotliSavings = ((1 - brotli.length / input.length) * 100).toFixed(1);
    console.log(`${filePath}`);
    console.log(`  raw:    ${input.length} B`);
    console.log(`  gzip:   ${gzip.length} B (${gzipSavings}% smaller)`);
    console.log(`  brotli: ${brotli.length} B (${brotliSavings}% smaller)`);
}

function main() {
    let ok = true;
    for (const target of targets) {
        const absolute = path.join(ROOT, target);
        if (!fs.existsSync(absolute)) {
            ok = false;
            console.error(`Missing file: ${target}`);
            continue;
        }
        writeCompressedFiles(target);
    }

    if (!ok) {
        process.exitCode = 1;
        return;
    }
    console.log('Precompression complete.');
}

main();
