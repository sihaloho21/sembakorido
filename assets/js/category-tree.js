(function (root) {
    'use strict';

    function text(value) {
        return String(value == null ? '' : value).replace(/\s+/g, ' ').trim();
    }

    function key(value) {
        return text(value).toLocaleLowerCase('id');
    }

    function slug(value) {
        return text(value).toLocaleLowerCase('id')
            .normalize('NFKD').replace(/[\u0300-\u036f]/g, '')
            .replace(/[^a-z0-9\s-]/g, '').replace(/[-\s]+/g, '-');
    }

    function bool(value) {
        if (value === false || value === 0) return false;
        const normalized = key(value);
        return !['false', '0', 'no', 'tidak', 'inactive', 'nonaktif'].includes(normalized);
    }

    function field(row, names) {
        for (const name of names) {
            if (row && row[name] != null && text(row[name])) return text(row[name]);
        }
        return '';
    }

    function normalizeCategories(rows) {
        const source = Array.isArray(rows) ? rows : [];
        const records = source.map((rawRow, index) => {
            const row = typeof rawRow === 'string' ? { name: rawRow } : rawRow;
            const name = field(row, ['nama', 'name', 'kategori', 'category', 'judul', 'title']);
            const id = field(row, ['id', 'category_id', 'kategori_id', 'ID']);
            const parentId = field(row, ['parent_id', 'parentId', 'id_induk', 'kategori_induk_id']);
            const orderValue = field(row, ['sort_order', 'urutan', 'order', 'sort', 'no']);
            const order = Number.isFinite(Number(orderValue)) ? Number(orderValue) : index;
            return {
                id: id || `legacy:${key(name)}`,
                parentId,
                name,
                order,
                active: bool(row && (row.is_active ?? row.active ?? true)),
                source: row || {}
            };
        }).filter((item) => item.name);
        const ids = new Set(records.map((item) => item.id));
        records.forEach((item) => {
            if (!ids.has(item.parentId)) item.parentId = '';
        });
        const byId = new Map(records.map((item) => [item.id, item]));
        const visiting = new Set();
        function decorate(item) {
            if (item.path) return item;
            if (visiting.has(item.id)) {
                item.parentId = '';
                item.depth = 1;
                item.path = item.name;
                item.pathNames = [item.name];
                return item;
            }
            visiting.add(item.id);
            const parent = item.parentId ? byId.get(item.parentId) : null;
            if (parent) {
                decorate(parent);
                item.depth = (parent.depth || 1) + 1;
                item.pathNames = [...(parent.pathNames || [parent.name]), item.name];
            } else {
                item.depth = 1;
                item.pathNames = [item.name];
            }
            item.path = item.pathNames.join(' › ');
            visiting.delete(item.id);
            return item;
        }
        records.forEach(decorate);
        return records.sort((a, b) => a.order - b.order || a.path.localeCompare(b.path, 'id'));
    }

    function childrenOf(categories, parentId) {
        return (Array.isArray(categories) ? categories : []).filter((item) => item.parentId === parentId && item.active);
    }

    function findCategory(categories, requestedSlug, requestedName, requestedId) {
        const list = Array.isArray(categories) ? categories : [];
        if (requestedId) return list.find((item) => item.id === requestedId && item.active) || null;
        const wantedName = key(requestedName);
        const wantedSlug = key(requestedSlug);
        const matches = list.filter((item) => slug(item.name) === wantedSlug || slug(item.path) === wantedSlug);
        if (wantedName) {
            return matches.find((item) => key(item.name) === wantedName || key(item.path) === wantedName) ||
                list.find((item) => (key(item.name) === wantedName || key(item.path) === wantedName) && item.active) || null;
        }
        return matches.length === 1 && matches[0].active ? matches[0] : null;
    }

    function scopeIds(categories, category) {
        if (!category) return new Set();
        const result = new Set(category.active ? [category.id] : []);
        let changed = true;
        while (changed) {
            changed = false;
            (Array.isArray(categories) ? categories : []).forEach((item) => {
                if (item.active && item.parentId && result.has(item.parentId) && !result.has(item.id)) {
                    result.add(item.id);
                    changed = true;
                }
            });
        }
        return result;
    }

    function productKey(product, index) {
        return text(product && (product.productId || product.id || product.sku || product.slug)) || `row:${index}`;
    }

    function productsInScope(products, categories, category) {
        const ids = scopeIds(categories, category);
        const names = new Set((Array.isArray(categories) ? categories : [])
            .filter((item) => ids.has(item.id)).map((item) => key(item.name)));
        const seen = new Set();
        return (Array.isArray(products) ? products : []).filter((product, index) => {
            if (!product) return false;
            const relationId = field(product, ['kategori_id', 'category_id', 'categoryId']);
            const legacyName = key(product.category || product.kategori);
            const inScope = (relationId && ids.has(relationId)) || (!relationId && names.has(legacyName));
            if (!inScope) return false;
            const uniqueKey = productKey(product, index);
            if (seen.has(uniqueKey)) return false;
            seen.add(uniqueKey);
            return true;
        });
    }

    root.CategoryTree = {
        normalizeCategories,
        childrenOf,
        findCategory,
        scopeIds,
        productsInScope,
        slug,
        key
    };
}(typeof window !== 'undefined' ? window : globalThis));
