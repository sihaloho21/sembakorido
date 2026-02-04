const fs = require('fs');
const path = require('path');

const root = process.cwd();
const skipDirs = new Set(['node_modules', '.git', 'docs', 'demo']);
const htmlAllowlist = new Set([
  path.join(root, 'index.html'),
  path.join(root, 'akun.html'),
  path.join(root, 'promo.html'),
  path.join(root, 'promo_katalog.html'),
  path.join(root, 'admin/index.html'),
  path.join(root, 'admin/login.html'),
]);
const jsAllowlist = new Set([
  path.join(root, 'assets/js/script.js'),
  path.join(root, 'assets/js/akun.js'),
  path.join(root, 'admin/js/admin-script.js'),
  path.join(root, 'admin/js/banner-management.js'),
  path.join(root, 'admin/js/tiered-pricing.js'),
  path.join(root, 'admin/js/api-helper.js'),
  path.join(root, 'admin/js/login-script.js'),
  path.join(root, 'admin/js/mobile-menu.js'),
]);
let issues = 0;

function walk(dir) {
  const entries = fs.readdirSync(dir, { withFileTypes: true });
  for (const entry of entries) {
    if (entry.isDirectory()) {
      if (skipDirs.has(entry.name)) continue;
      walk(path.join(dir, entry.name));
    } else if (entry.isFile()) {
      const fullPath = path.join(dir, entry.name);
      if (entry.name.endsWith('.html') && htmlAllowlist.has(fullPath)) {
        lintHtml(fullPath);
      }
      if (entry.name.endsWith('.js') && !entry.name.endsWith('.min.js') && jsAllowlist.has(fullPath)) {
        lintJs(fullPath);
      }
    }
  }
}

function report(file, line, msg) {
  issues += 1;
  console.log(`${file}:${line} - ${msg}`);
}

function lintHtml(file) {
  const lines = fs.readFileSync(file, 'utf8').split('\n');
  const idCounts = new Map();
  const isAdminPage = file.includes(`${path.sep}admin${path.sep}`) && file.endsWith('.html');
  const isFrontendPage = !isAdminPage && file.endsWith('.html');
  let hasAdminSanitizeScript = false;
  let hasFrontendSanitizeScript = false;
  let hasFrontendBundle = false;
  lines.forEach((line, idx) => {
    const lineNo = idx + 1;
    const onclickMatch = line.match(/\sonclick=/);
    if (onclickMatch) {
      report(file, lineNo, 'Inline onclick found');
    }
    if (isAdminPage && /assets\/js\/sanitize\.min\.js/.test(line)) {
      hasAdminSanitizeScript = true;
    }
    if (isFrontendPage && /assets\/js\/sanitize\.min\.js/.test(line)) {
      hasFrontendSanitizeScript = true;
    }
    if (isFrontendPage && /assets\/js\/index\.bundle\.min\.js/.test(line)) {
      hasFrontendBundle = true;
    }
    const hrefVoid = line.match(/href="javascript:void\(0\)"/);
    if (hrefVoid) {
      report(file, lineNo, 'javascript:void(0) link found');
    }
    const idMatches = line.match(/\bid="([^"]+)"/g) || [];
    idMatches.forEach((m) => {
      const id = m.slice(4, -1);
      idCounts.set(id, (idCounts.get(id) || 0) + 1);
    });
  });
  for (let i = 0; i < lines.length; i++) {
    const line = lines[i];
    const lineNo = i + 1;
    if (!line.includes('<img')) continue;
    let block = line;
    let j = i + 1;
    while (!block.includes('>') && j < lines.length) {
      block += lines[j];
      j += 1;
    }
    if (/<img[^>]*\sonerror=/i.test(block)) {
      report(file, lineNo, 'Inline onerror on <img> found');
    }
    if (/<img[^>]*\sstyle=/i.test(block)) {
      report(file, lineNo, 'Inline style on <img> found');
    }
    if (!/data-fallback-src=/.test(block)) {
      report(file, lineNo, '<img> missing data-fallback-src');
    }
  }
  for (const [id, count] of idCounts) {
    if (count > 1) {
      report(file, 1, `Duplicate id="${id}" found ${count} times`);
    }
  }
  if (isAdminPage && !hasAdminSanitizeScript) {
    report(file, 1, 'Admin page missing assets/js/sanitize.min.js');
  }
  if (isFrontendPage && !hasFrontendSanitizeScript && !hasFrontendBundle) {
    report(file, 1, 'Frontend page missing assets/js/sanitize.min.js (or index.bundle.min.js)');
  }
}

function lintJs(file) {
  const lines = fs.readFileSync(file, 'utf8').split('\n');
  for (let i = 0; i < lines.length; i++) {
    const line = lines[i];
    const lineNo = i + 1;
    if (!line.includes('innerHTML')) continue;
    if (line.includes('textContent')) continue;

    // Capture a small block until semicolon for template strings
    let block = line;
    let j = i + 1;
    while (!block.includes(';') && j < lines.length) {
      block += lines[j];
      j += 1;
    }

    // Only flag dynamic templates without escapeHtml
    if (block.includes('${') && !block.includes('escapeHtml(')) {
      report(file, lineNo, 'innerHTML template without escapeHtml');
    }

    // Disallow inline handlers/styles on <img> in templates
    if (block.includes('<img') && /onerror=/.test(block)) {
      report(file, lineNo, 'Inline onerror on <img> found');
    }
    if (block.includes('<img') && /style=/.test(block)) {
      report(file, lineNo, 'Inline style on <img> found');
    }
    if (block.includes('<img') && !/data-fallback-src=/.test(block)) {
      report(file, lineNo, '<img> missing data-fallback-src');
    }

    // Stricter image URL rule for JS templates
    if (block.includes('<img') && block.includes('${')) {
      const hasSanitize = block.includes('sanitizeUrl(');
      const hasSafeImage = block.includes('safeImage') || block.includes('safeImg') || block.includes('safeUrl');
      if (!hasSanitize && !hasSafeImage) {
        report(file, lineNo, 'img src in template should use sanitizeUrl/safeImage');
      }
    }
  }
}

walk(root);

if (issues > 0) {
  console.error(`\nFound ${issues} issue(s).`);
  process.exit(1);
} else {
  console.log('No issues found.');
}
