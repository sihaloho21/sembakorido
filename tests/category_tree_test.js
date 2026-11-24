const assert = require('node:assert/strict');
const fs = require('node:fs');
const vm = require('node:vm');

const context = { globalThis: {} };
vm.runInNewContext(fs.readFileSync('assets/js/category-tree.js', 'utf8'), context, { filename: 'category-tree.js' });
const tree = context.globalThis.CategoryTree;
const categories = tree.normalizeCategories([
    { id: 'root', nama: 'Dapur & Bahan', parent_id: '', sort_order: 1, is_active: true },
    { id: 'oil', nama: 'Minyak', parent_id: 'root', sort_order: 1, is_active: true },
    { id: 'palm', nama: 'Minyak Sawit', parent_id: 'oil', sort_order: 1, is_active: true },
    { id: 'disabled', nama: 'Lama', parent_id: 'root', is_active: false }
]);
assert.equal(categories.find((item) => item.id === 'palm').path, 'Dapur & Bahan › Minyak › Minyak Sawit');
assert.deepEqual(tree.childrenOf(categories, 'root').map((item) => item.id), ['oil']);
assert.deepEqual([...tree.scopeIds(categories, categories.find((item) => item.id === 'oil'))], ['oil', 'palm']);
const products = [
    { id: 'direct', kategori_id: 'oil' },
    { id: 'descendant', kategori_id: 'palm' },
    { id: 'legacy-descendant', kategori: 'Minyak Sawit' },
    { id: 'inactive', kategori_id: 'disabled' },
    { id: 'direct', kategori_id: 'oil' }
];
assert.deepEqual(tree.productsInScope(products, categories, categories.find((item) => item.id === 'oil')).map((item) => item.id), ['direct', 'descendant', 'legacy-descendant']);
assert.equal(tree.findCategory(categories, 'minyak-sawit', 'Dapur & Bahan › Minyak › Minyak Sawit', '').id, 'palm');
console.log('category tree tests: PASS');
