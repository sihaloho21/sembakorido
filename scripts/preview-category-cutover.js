#!/usr/bin/env node
'use strict';

function text(value) {
    return String(value == null ? '' : value).replace(/\s+/g, ' ').trim();
}
function key(value) {
    return text(value).toLocaleLowerCase('id');
}
function field(row, names) {
    for (const name of names) {
        if (row && row[name] != null && text(row[name])) return text(row[name]);
    }
    return '';
}
function active(row) {
    const value = key(row && (row.is_active ?? row.active ?? true));
    return !['false', '0', 'no', 'tidak', 'inactive', 'nonaktif'].includes(value);
}
function rowsFromPayload(payload) {
    if (Array.isArray(payload)) return payload;
    if (!payload || typeof payload !== 'object') return [];
    for (const fieldName of ['data', 'rows', 'result']) {
        if (Array.isArray(payload[fieldName])) return payload[fieldName];
    }
    return [];
}
function headers(rows) {
    return [...new Set(rows.flatMap((row) => Object.keys(row || {})))].sort();
}
function categoryName(row) {
    return field(row, ['nama', 'name', 'kategori', 'category', 'judul', 'title']);
}
function analyze(categories, products) {
    const categoryRecords = categories.map((row, index) => ({
        id: field(row, ['id', 'category_id', 'kategori_id', 'ID']),
        name: categoryName(row),
        parentId: field(row, ['parent_id', 'parentId', 'id_induk', 'kategori_induk_id']),
        order: Number(field(row, ['sort_order', 'urutan', 'order', 'sort', 'no'])) || index,
        active: active(row)
    }));
    const ids = new Set();
    const duplicateIds = [];
    const missingIds = [];
    categoryRecords.forEach((item) => {
        if (!item.id) missingIds.push(item.name);
        else if (ids.has(item.id)) duplicateIds.push(item.id);
        else ids.add(item.id);
    });
    const byId = new Map(categoryRecords.filter((item) => item.id).map((item) => [item.id, item]));
    const invalidParentIds = categoryRecords.filter((item) => item.parentId && !byId.has(item.parentId)).map((item) => item.id);
    const cycles = [];
    let maxDepth = 0;
    for (const item of categoryRecords) {
        const seen = new Set();
        let current = item;
        let depth = 0;
        while (current) {
            if (seen.has(current.id)) {
                cycles.push(item.id);
                break;
            }
            seen.add(current.id);
            depth += 1;
            current = current.parentId ? byId.get(current.parentId) : null;
        }
        maxDepth = Math.max(maxDepth, depth);
    }
    const names = new Map();
    categoryRecords.forEach((item) => {
        const normalized = key(item.name);
        if (!names.has(normalized)) names.set(normalized, []);
        names.get(normalized).push(item);
    });
    let withId = 0;
    let legacyOnly = 0;
    const unmatched = [];
    const ambiguous = [];
    products.forEach((product, index) => {
        const categoryId = field(product, ['kategori_id', 'category_id', 'categoryId']);
        if (categoryId && byId.has(categoryId)) {
            withId += 1;
            return;
        }
        if (categoryId) {
            unmatched.push({ row: index + 2, reason: 'invalid_category_id' });
            return;
        }
        const candidates = (names.get(key(field(product, ['kategori', 'category']))) || []).filter((item) => item.active);
        if (candidates.length === 1) legacyOnly += 1;
        else if (candidates.length === 0) unmatched.push({ row: index + 2, reason: 'unmatched_name' });
        else ambiguous.push({ row: index + 2, reason: 'ambiguous_name' });
    });
    const categoryHeaders = headers(categories);
    const productHeaders = headers(products);
    const missingSchemaHeaders = {
        categories: ['parent_id', 'sort_order', 'is_active'].filter((header) => !categoryHeaders.includes(header)),
        products: ['kategori_id'].filter((header) => !productHeaders.includes(header))
    };
    const blockedReasons = [];
    if (missingSchemaHeaders.categories.length || missingSchemaHeaders.products.length) blockedReasons.push('required_nested_schema_headers_missing');
    if (missingIds.length || duplicateIds.length) blockedReasons.push('category_ids_invalid');
    if (invalidParentIds.length || cycles.length || maxDepth > 3) blockedReasons.push('category_tree_invalid');
    if (unmatched.length || ambiguous.length) blockedReasons.push('product_mapping_exceptions');
    return {
        mode: 'read-only-preview',
        generated_at: new Date().toISOString(),
        counts: { categories: categories.length, products: products.length },
        schema: { categories_headers: categoryHeaders, products_headers: productHeaders, missing_required_headers: missingSchemaHeaders },
        tree: { missing_ids: missingIds.length, duplicate_ids: duplicateIds.length, invalid_parent_ids: invalidParentIds.length, cycle_count: cycles.length, max_depth: maxDepth },
        mapping: { products_with_kategori_id: withId, products_legacy_only: legacyOnly, products_unmatched: unmatched.length, products_ambiguous: ambiguous.length, exception_rows: [...unmatched, ...ambiguous] },
        cutover: { ready_for_apply: blockedReasons.length === 0, blocked_reasons: blockedReasons, writes_performed: false }
    };
}
async function main() {
    const apiUrl = process.argv[2] || process.env.CATEGORY_CUTOVER_API_URL;
    if (!apiUrl) throw new Error('Usage: node scripts/preview-category-cutover.js <read-only-api-url> [--json]');
    const result = {};
    for (const sheet of ['categories', 'products']) {
        const url = new URL(apiUrl);
        url.searchParams.set('sheet', sheet);
        url.searchParams.set('_preview', 'nested-category-read-only');
        const response = await fetch(url);
        if (!response.ok) throw new Error(`${sheet}: HTTP ${response.status}`);
        result[sheet] = rowsFromPayload(await response.json());
    }
    const report = analyze(result.categories, result.products);
    if (process.argv.includes('--json')) console.log(JSON.stringify(report, null, 2));
    else {
        console.log(`Read-only category cutover preview: ${report.cutover.ready_for_apply ? 'READY' : 'BLOCKED'}`);
        console.log(`Categories: ${report.counts.categories}; products: ${report.counts.products}; max depth: ${report.tree.max_depth}`);
        console.log(`Products with kategori_id: ${report.mapping.products_with_kategori_id}; legacy-only: ${report.mapping.products_legacy_only}; exceptions: ${report.mapping.products_unmatched + report.mapping.products_ambiguous}`);
        if (report.cutover.blocked_reasons.length) console.log(`Blocked reasons: ${report.cutover.blocked_reasons.join(', ')}`);
    }
}
main().catch((error) => { console.error(error.message); process.exitCode = 1; });
