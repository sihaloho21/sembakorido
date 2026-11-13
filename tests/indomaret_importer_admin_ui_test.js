const assert = require('node:assert/strict');
const fs = require('node:fs');

const markup = fs.readFileSync('admin/index.html', 'utf8');
const script = fs.readFileSync('admin/js/indomaret-importer.js', 'utf8');
const adminScript = fs.readFileSync('admin/js/admin-script.js', 'utf8');

assert.match(markup, /id="nav-indomaret-import"/);
assert.match(markup, /id="section-indomaret-import"/);
assert.match(markup, /id="indomaret-source-url"/);
assert.match(markup, /id="indomaret-preview-card"/);
assert.match(markup, /id="indomaret-draft-form"/);
assert.match(markup, /id="indomaret-import-queue"/);
assert.match(markup, /Simpan sebagai Draft/);
assert.match(markup, /Approval wajib/);
assert.match(script, /indomaret_import_preview/);
assert.match(script, /indomaret_import_draft/);
assert.match(script, /indomaret_reimport_preview/);
assert.match(script, /indomaret_approve_product/);
assert.match(script, /indomaret_reject_product/);
assert.match(script, /Harga jual internal wajib diisi sebelum approval/);
assert.match(script, /source_reference_price/);
assert.match(adminScript, /'indomaret-import': 'Import KlikIndomaret'/);
assert.doesNotMatch(script, /type=["']file["']/);

console.log('Indomaret Admin UI tests passed.');
