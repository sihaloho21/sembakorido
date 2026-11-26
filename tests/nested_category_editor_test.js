const assert = require('node:assert/strict');
const fs = require('node:fs');
const vm = require('node:vm');
const context = { globalThis: {} };
vm.runInNewContext(fs.readFileSync('assets/js/nested-category-editor.js', 'utf8'), context, { filename: 'nested-category-editor.js' });
const editor = context.globalThis.NestedCategoryEditor;
const source = [
    { id: 'root', nama: 'Dapur', parent_id: '', sort_order: 1, is_active: true },
    { id: 'oil', nama: 'Minyak', parent_id: '', sort_order: 2, is_active: true },
    { id: 'palm', nama: 'Sawit', parent_id: 'oil', sort_order: 1, is_active: true }
];
assert.equal(editor.validate(source).valid, true);
assert.equal(editor.validate(source).maxDepth, 2);

const staged = editor.applyParents(source, [{ id: 'oil', parent_id: 'root' }]);
assert.equal(source[1].parent_id, '', 'staging tidak boleh memutasi state sumber');
assert.equal(staged[1].parent_id, 'root');
assert.equal(editor.validate(staged).valid, true);
assert.match(editor.validate(editor.applyParents(source, [
    { id: 'root', parent_id: 'palm' },
    { id: 'oil', parent_id: 'root' }
])).errors.join('; '), /circular reference/);
assert.equal(editor.validate([
    { id: 'a', nama: 'A', parent_id: '' },
    { id: 'b', nama: 'B', parent_id: 'a' },
    { id: 'c', nama: 'C', parent_id: 'b' },
    { id: 'd', nama: 'D', parent_id: 'c' }
]).valid, false, 'tree lebih dari tiga level harus ditolak');
assert.equal(editor.validate([{ id: 'x', nama: 'X' }, { id: 'x', nama: 'Y' }]).valid, false, 'ID duplikat harus ditolak');

const before = editor.snapshotFingerprint(source);
assert.equal(editor.snapshotFingerprint(staged) === before, false, 'fingerprint berubah saat parent lokal berubah');
const report = editor.analyzeCutover(
    [{ id: 'root', nama: 'Dapur', parent_id: '', sort_order: 1, is_active: true }],
    [{ id: 'p1', kategori: 'Dapur' }]
);
assert.equal(report.cutover.ready_for_apply, false, 'cutover diblokir bila header schema belum lengkap');
assert.equal(report.cutover.writes_performed, false);
assert.equal(report.mapping.products_legacy_only, 1);
console.log('nested category editor tests: PASS');
