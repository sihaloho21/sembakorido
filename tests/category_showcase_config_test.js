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

console.log('category showcase config tests: PASS');
