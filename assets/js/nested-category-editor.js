(function (root) {
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
    function normalize(rows) {
        return (Array.isArray(rows) ? rows : []).map((row, index) => ({
            id: field(row, ['id', 'category_id', 'kategori_id', 'ID']),
            name: field(row, ['nama', 'name', 'kategori', 'category', 'judul', 'title']),
            parentId: field(row, ['parent_id', 'parentId', 'id_induk', 'kategori_induk_id']),
            order: Number(row && (row.sort_order ?? row.urutan ?? row.order ?? row.sort)) || index,
            active: ![false, 0, 'false', '0', 'no', 'tidak', 'inactive', 'nonaktif'].includes(
                typeof (row && (row.is_active ?? row.active)) === 'string'
                    ? key(row.is_active ?? row.active)
                    : (row && (row.is_active ?? row.active))
            ),
            source: row || {}
        })).filter((item) => item.name);
    }
    function validationErrors(result) {
        const errors = [];
        if (result.missingIds.length) errors.push(`${result.missingIds.length} kategori tanpa ID`);
        if (result.duplicateIds.length) errors.push(`${result.duplicateIds.length} ID duplikat`);
        if (result.invalidParents.length) errors.push(`${result.invalidParents.length} parent tidak valid`);
        if (result.cycles.length) errors.push(`${result.cycles.length} circular reference`);
        if (result.maxDepth > 3) errors.push(`kedalaman ${result.maxDepth} melebihi batas 3`);
        return errors;
    }
    function validate(rows) {
        const records = normalize(rows);
        const ids = new Set();
        const missingIds = [];
        const duplicateIds = [];
        records.forEach((item) => {
            if (!item.id) missingIds.push(item.name);
            else if (ids.has(item.id)) duplicateIds.push(item.id);
            else ids.add(item.id);
        });
        const byId = new Map(records.filter((item) => item.id).map((item) => [item.id, item]));
        const invalidParents = records.filter((item) => item.parentId && !byId.has(item.parentId)).map((item) => item.id || item.name);
        const cycles = [];
        let maxDepth = 0;
        records.forEach((item) => {
            const visited = new Set();
            let current = item;
            let depth = 0;
            while (current) {
                if (visited.has(current.id || current.name)) {
                    cycles.push(item.id || item.name);
                    break;
                }
                visited.add(current.id || current.name);
                depth += 1;
                current = current.parentId ? byId.get(current.parentId) : null;
            }
            maxDepth = Math.max(maxDepth, depth);
        });
        const result = { valid: false, records, byId, missingIds, duplicateIds, invalidParents, cycles, maxDepth, errors: [] };
        result.errors = validationErrors(result);
        result.valid = result.errors.length === 0;
        return result;
    }
    function applyParents(rows, changes) {
        const changeMap = new Map((Array.isArray(changes) ? changes : []).map((change) => [text(change.id), text(change.parent_id)]));
        return (Array.isArray(rows) ? rows : []).map((row) => {
            const id = field(row, ['id', 'category_id', 'kategori_id', 'ID']);
            if (!changeMap.has(id)) return { ...row };
            const updated = { ...row };
            if (Object.prototype.hasOwnProperty.call(updated, 'parent_id')) updated.parent_id = changeMap.get(id);
            else updated.parent_id = changeMap.get(id);
            return updated;
        });
    }
    function snapshotFingerprint(rows) {
        const snapshot = normalize(rows).map((item) => ({
            id: item.id,
            name: item.name,
            parent_id: item.parentId,
            sort_order: String(item.source.sort_order ?? item.source.urutan ?? item.source.order ?? item.source.sort ?? ''),
            is_active: String(item.source.is_active ?? item.source.active ?? '')
        })).sort((a, b) => a.id < b.id ? -1 : (a.id > b.id ? 1 : 0));
        return JSON.stringify(snapshot);
    }
    function analyzeCutover(categories, products) {
        const categoryRows = Array.isArray(categories) ? categories : [];
        const productRows = Array.isArray(products) ? products : [];
        const categoryHeaders = [...new Set(categoryRows.flatMap((row) => Object.keys(row || {})))].sort();
        const productHeaders = [...new Set(productRows.flatMap((row) => Object.keys(row || {})))].sort();
        const tree = validate(categoryRows);
        const names = new Map();
        tree.records.forEach((item) => {
            const normalized = key(item.name);
            if (!names.has(normalized)) names.set(normalized, []);
            names.get(normalized).push(item);
        });
        let withId = 0;
        let legacyOnly = 0;
        const unmatched = [];
        const ambiguous = [];
        productRows.forEach((product, index) => {
            const categoryId = field(product, ['kategori_id', 'category_id', 'categoryId']);
            if (categoryId && tree.byId.has(categoryId)) {
                withId += 1;
                return;
            }
            if (categoryId) {
                unmatched.push({ row: index + 2, reason: 'invalid_category_id' });
                return;
            }
            const candidates = (names.get(key(field(product, ['kategori', 'category']))) || []).filter((item) => item.active);
            if (candidates.length === 1) legacyOnly += 1;
            else if (!candidates.length) unmatched.push({ row: index + 2, reason: 'unmatched_name' });
            else ambiguous.push({ row: index + 2, reason: 'ambiguous_name' });
        });
        const missingHeaders = {
            categories: ['id', 'nama', 'parent_id', 'sort_order', 'is_active'].filter((header) => !categoryHeaders.includes(header)),
            products: ['kategori_id'].filter((header) => !productHeaders.includes(header))
        };
        const blocked = [];
        if (missingHeaders.categories.length || missingHeaders.products.length) blocked.push('required_nested_schema_headers_missing');
        if (!tree.valid) blocked.push('category_tree_invalid');
        if (unmatched.length || ambiguous.length) blocked.push('product_mapping_exceptions');
        return {
            mode: 'read-only-preview',
            generated_at: new Date().toISOString(),
            counts: { categories: categoryRows.length, products: productRows.length },
            schema: { missing_required_headers: missingHeaders },
            tree: {
                missing_ids: tree.missingIds.length,
                duplicate_ids: tree.duplicateIds.length,
                invalid_parent_ids: tree.invalidParents.length,
                cycle_count: tree.cycles.length,
                max_depth: tree.maxDepth,
                errors: tree.errors
            },
            mapping: {
                products_with_kategori_id: withId,
                products_legacy_only: legacyOnly,
                products_unmatched: unmatched.length,
                products_ambiguous: ambiguous.length,
                exception_rows: [...unmatched, ...ambiguous]
            },
            cutover: { ready_for_apply: blocked.length === 0, blocked_reasons: blocked, writes_performed: false }
        };
    }

    root.NestedCategoryEditor = { normalize, validate, applyParents, snapshotFingerprint, analyzeCutover };
}(typeof window !== 'undefined' ? window : globalThis));
