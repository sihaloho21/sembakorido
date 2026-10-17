const assert = require('node:assert/strict');
const fs = require('node:fs');
const vm = require('node:vm');

const source = fs.readFileSync('assets/js/category-showcase.js', 'utf8');
const context = {
    console,
    window: {},
    document: { addEventListener() {} },
    ApiService: { get: async () => ({ success: true, config: {} }) },
    setTimeout,
    clearTimeout
};
vm.runInNewContext(source, context, { filename: 'category-showcase.js' });
const normalize = context.window.CategoryShowcase.normalizeConfig;
const sortProductsByAvailability = context.window.CategoryShowcase.sortProductsByAvailability;

assert.deepEqual(JSON.parse(JSON.stringify(normalize({ enabled: true, categories: [
    { category: ' Minyak   Goreng ', enabled: true, sort_order: 2, max_products: 10 },
    { category: 'minyak goreng', enabled: true, sort_order: 1, max_products: 10 },
    { category: 'Minuman', enabled: true, sort_order: 3, max_products: 51 },
    { category: 'Mie Instan', enabled: false, sort_order: 4, max_products: 5 }
] }))), {
    version: 1,
    enabled: true,
    categories: [
        { category: 'Minyak Goreng', enabled: true, sort_order: 2, max_products: 10 },
        { category: 'Mie Instan', enabled: false, sort_order: 4, max_products: 5 }
    ]
});

assert.deepEqual(JSON.parse(JSON.stringify(normalize({ enabled: 'false', categories: [{ category: 'X', max_products: 0 }] }))), {
    version: 1, enabled: false, categories: []
});

const products = [
    { id: 'available-1', stok: 4, isHidden: false },
    { id: 'hidden', stok: 9, isHidden: true },
    { id: 'available-2', stok: 1, isHidden: false },
    { id: 'out-of-stock', stok: 0, isHidden: false },
    { id: 'hidden-zero-stock', stok: 0, isHidden: true }
];
assert.deepEqual(sortProductsByAvailability(products).map((product) => product.id), [
    'available-1', 'available-2', 'hidden', 'out-of-stock', 'hidden-zero-stock'
]);

assert.match(source, /prioritizeAvailableProductsOnNextFilter/);
assert.match(source, /window\.setCategory\(category\)/);

console.log('category showcase config tests: PASS');
