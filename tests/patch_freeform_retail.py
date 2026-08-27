from pathlib import Path

p = Path('/home/ubuntu/sembakorido/admin/js/catalog-promo-pop.js')
s = p.read_text()

s = s.replace("tileSizes: {},\n        layoutClipboard", "tileSizes: {},\n        tileAnchors: {},\n        layoutClipboard", 1)
s = s.replace("function tileSizeForProduct(productId) {\n        const scale = Number(state.tileSizes[String(productId)]?.scale);\n        return { scale: Math.min(1.8, Math.max(.65, Number.isFinite(scale) && scale > 0 ? scale : 1)) };\n    }", """function tileSizeForProduct(productId) {
        const scale = Number(state.tileSizes[String(productId)]?.scale);
        return { scale: Math.min(1.8, Math.max(.65, Number.isFinite(scale) && scale > 0 ? scale : 1)) };
    }
    function normalizeTileAnchors(value) {
        const source = value && typeof value === 'object' ? value : {};
        return Object.fromEntries(Object.entries(source).map(([productId, anchor]) => [String(productId), {
            x: Math.min(45, Math.max(-45, Number(anchor?.x) || 0)),
            y: Math.min(45, Math.max(-45, Number(anchor?.y) || 0))
        }]));
    }
    function tileAnchorForProduct(productId) {
        const anchor = state.tileAnchors[String(productId)] || {};
        return { x: Number(anchor.x) || 0, y: Number(anchor.y) || 0 };
    }
    function tileAnchorStyle(productId) {
        const anchor = tileAnchorForProduct(productId);
        return `--retail-tile-offset-x:${anchor.x}%;--retail-tile-offset-y:${anchor.y}%;`;
    }
    function elementResizeHandles(field, label) {
        return ['nw','n','ne','e','se','s','sw','w'].map(direction => `<span class=\"flyer-element-resize-handle flyer-element-resize-${direction}\" data-element-resize=\"${field}\" data-resize-direction=\"${direction}\" aria-label=\"Ubah ukuran ${label} dari arah ${direction}\"></span>`).join('');
    }""", 1)
s = s.replace("return `left:${position.x}%;top:${position.y}%;transform:translate(-50%,-50%) scale(${position.scale || 1});${extra || ''}`;", "return `left:${position.x}%;top:${position.y}%;transform:translate(-50%,-50%) scale(${position.scale || 1});${extra || ''}`;", 1)
# Replace resize block's overlap rejection with canvas-only bounds.
s = s.replace("""                    const overlaps = Array.from(bounds.querySelectorAll('.flyer-retail-tile')).some((other) => {
                        if (other === tile) return false;
                        const rect = other.getBoundingClientRect();
                        return tileRect.left < rect.right - 1 && tileRect.right > rect.left + 1 && tileRect.top < rect.bottom - 1 && tileRect.bottom > rect.top + 1;
                    });
                    if (!inside || overlaps) {""", """                    if (!inside) {""", 1)
# Add tile movement listeners before element query.
needle = "        preview.querySelectorAll('[data-tile-position]').forEach((element) => {"
insert = """        preview.querySelectorAll('[data-position-surface]').forEach((tile) => {
            tile.addEventListener('pointerdown', (event) => {
                if (event.target.closest('[data-tile-position], [data-tile-resize], [data-element-resize]')) return;
                event.preventDefault();
                event.stopPropagation();
                const productId = tile.dataset.positionSurface;
                const bounds = tile.closest('.flyer-preview-items');
                if (!productId || !bounds) return;
                const initial = tileAnchorForProduct(productId);
                const startX = event.clientX;
                const startY = event.clientY;
                const tileRect = tile.getBoundingClientRect();
                const boundsRect = bounds.getBoundingClientRect();
                const startScale = tileSizeForProduct(productId).scale;
                let lastValid = { ...initial };
                const applyAnchor = (x, y) => {
                    tile.style.setProperty('--retail-tile-offset-x', `${x}%`);
                    tile.style.setProperty('--retail-tile-offset-y', `${y}%`);
                    const rect = tile.getBoundingClientRect();
                    const inside = rect.left >= boundsRect.left - 1 && rect.top >= boundsRect.top - 1 && rect.right <= boundsRect.right + 1 && rect.bottom <= boundsRect.bottom + 1;
                    if (!inside) { tile.style.setProperty('--retail-tile-offset-x', `${lastValid.x}%`); tile.style.setProperty('--retail-tile-offset-y', `${lastValid.y}%`); return; }
                    lastValid = { x, y };
                };
                const move = (moveEvent) => {
                    const x = Math.min(45, Math.max(-45, initial.x + ((moveEvent.clientX - startX) / Math.max(boundsRect.width, 1)) * 100));
                    const y = Math.min(45, Math.max(-45, initial.y + ((moveEvent.clientY - startY) / Math.max(boundsRect.height, 1)) * 100));
                    applyAnchor(x, y);
                };
                const finish = () => {
                    tile.classList.remove('is-retail-moving');
                    tile.removeEventListener('pointermove', move); tile.removeEventListener('pointerup', finish); tile.removeEventListener('pointercancel', finish);
                    state.tileAnchors[productId] = { x: Number(lastValid.x.toFixed(3)), y: Number(lastValid.y.toFixed(3)) };
                    renderPreview();
                };
                tile.classList.add('is-retail-moving');
                tile.addEventListener('pointermove', move); tile.addEventListener('pointerup', finish); tile.addEventListener('pointercancel', finish);
                if (tile.setPointerCapture) tile.setPointerCapture(event.pointerId);
            });
        });
""" + needle
s = s.replace(needle, insert, 1)
# Add element resize handlers before existing element pointerdown.
needle2 = "            element.addEventListener('pointerdown', (event) => {"
insert2 = """            element.querySelectorAll('[data-element-resize]').forEach((handle) => {
                handle.addEventListener('pointerdown', (event) => {
                    event.preventDefault(); event.stopPropagation();
                    const field = handle.dataset.elementResize;
                    const productId = element.dataset.productId;
                    const surface = element.closest('[data-position-surface]');
                    const bounds = preview.querySelector('.flyer-preview-items');
                    if (!field || !productId || !surface || !bounds) return;
                    const current = tilePositionsForProduct(productId)[field] || { x: 50, y: 50, scale: 1 };
                    const initial = Number(current.scale) || 1;
                    const startX = event.clientX, startY = event.clientY;
                    const startRect = element.getBoundingClientRect();
                    const boundsRect = bounds.getBoundingClientRect();
                    let lastValid = initial;
                    const direction = handle.dataset.resizeDirection || 'se';
                    const applyScale = (scale) => {
                        element.style.transform = `translate(-50%,-50%) scale(${scale})`;
                        const rect = element.getBoundingClientRect();
                        const inside = rect.left >= boundsRect.left - 1 && rect.top >= boundsRect.top - 1 && rect.right <= boundsRect.right + 1 && rect.bottom <= boundsRect.bottom + 1;
                        if (!inside) { element.style.transform = `translate(-50%,-50%) scale(${lastValid})`; return; }
                        lastValid = scale;
                    };
                    const move = (moveEvent) => {
                        const dx = moveEvent.clientX - startX, dy = moveEvent.clientY - startY;
                        const horizontal = direction.includes('e') ? dx : direction.includes('w') ? -dx : 0;
                        const vertical = direction.includes('s') ? dy : direction.includes('n') ? -dy : 0;
                        const delta = direction === 'e' || direction === 'w' ? horizontal : direction === 'n' || direction === 's' ? vertical : (horizontal + vertical) / 2;
                        const scale = Math.min(2.8, Math.max(.35, Number((initial + delta / Math.max(startRect.width, startRect.height, 1)).toFixed(3))));
                        applyScale(scale);
                    };
                    const finish = () => {
                        document.body.classList.remove('is-element-resizing');
                        handle.removeEventListener('pointermove', move); handle.removeEventListener('pointerup', finish); handle.removeEventListener('pointercancel', finish);
                        const productPositions = tilePositionsForProduct(productId);
                        state.tilePositions[productId] = { ...productPositions, [field]: { ...productPositions[field], scale: Number(lastValid.toFixed(3)) } };
                        renderPreview();
                    };
                    document.body.classList.add('is-element-resizing');
                    handle.addEventListener('pointermove', move); handle.addEventListener('pointerup', finish); handle.addEventListener('pointercancel', finish);
                    if (handle.setPointerCapture) handle.setPointerCapture(event.pointerId);
                });
            });
            element.addEventListener('pointerdown', (event) => {"""
s = s.replace(needle2, insert2, 1)
# Let retail element drag use brochure bounds and permit outside tile; preserve legacy behavior otherwise.
s = s.replace("""                const surface = element.closest('[data-position-surface]');
                if (!surface || !field || !productId) return;
                const rect = surface.getBoundingClientRect();
                const move = (moveEvent) => {
                    const x = Math.min(96, Math.max(4, ((moveEvent.clientX - rect.left) / rect.width) * 100));
                    const y = Math.min(96, Math.max(4, ((moveEvent.clientY - rect.top) / rect.height) * 100));""", """                const surface = element.closest('[data-position-surface]');
                const retail = surface?.classList.contains('flyer-retail-tile');
                const coordinateSurface = retail ? preview.querySelector('.flyer-preview-items') : surface;
                if (!surface || !coordinateSurface || !field || !productId) return;
                const rect = coordinateSurface.getBoundingClientRect();
                const move = (moveEvent) => {
                    const x = Math.min(retail ? 135 : 96, Math.max(retail ? -35 : 4, ((moveEvent.clientX - rect.left) / rect.width) * 100));
                    const y = Math.min(retail ? 135 : 96, Math.max(retail ? -35 : 4, ((moveEvent.clientY - rect.top) / rect.height) * 100));""", 1)
# Markup: append handles to each element, add tile anchor style and tile move cursor marker.
s = s.replace("const draggableAttrs = (field, label) => `data-tile-position=\"${field}\" data-product-id=\"${productId}\" style=\"${tilePositionStyle(item.id, field)}\"", "const draggableAttrs = (field, label) => `data-tile-position=\"${field}\" data-product-id=\"${productId}\" style=\"${tilePositionStyle(item.id, field)}\"", 1)
s = s.replace("""const resizeHandle = isRetail ? `<button type=\"button\" class=\"flyer-tile-resize-handle\" data-tile-resize=\"${productId}\" aria-label=\"Ubah ukuran tile ${escapeHtml(brochureName(item))}\" title=\"Tarik untuk mengubah ukuran tile\"></button>` : '';
            return `<article class=\"${itemClass}\" data-position-surface=\"${productId}\" style=\"${isRetail ? tileSizeStyle(item.id) : ''}\">""", """const resizeHandle = isRetail ? `<button type=\"button\" class=\"flyer-tile-resize-handle\" data-tile-resize=\"${productId}\" aria-label=\"Ubah ukuran tile ${escapeHtml(brochureName(item))}\" title=\"Tarik untuk mengubah ukuran tile\"></button>` : '';
            const elementHandles = isRetail ? (field, label) => elementResizeHandles(field, label) : () => '';
            return `<article class=\"${itemClass}\" data-position-surface=\"${productId}\" style=\"${isRetail ? tileSizeStyle(item.id) + tileAnchorStyle(item.id) : ''}\">""", 1)
s = s.replace("${item.badge ? `<span class=\"${badgeClass}\">${escapeHtml(item.badge)}</span>` : ''}</div>", "${item.badge ? `<span class=\"${badgeClass}\">${escapeHtml(item.badge)}</span>` : ''}${elementHandles('image', 'gambar produk')}</div>", 1)
s = s.replace("${escapeHtml(brochureName(item))}</div>", "${escapeHtml(brochureName(item))}${elementHandles('name', 'nama produk')}</div>", 1)
s = s.replace("${formatStrikePrice(brochureNormalPrice(item))}</div>", "${formatStrikePrice(brochureNormalPrice(item))}${elementHandles('normal', 'harga coret')}</div>", 1)
s = s.replace("${formatCurrencyMarkup(brochurePromoPrice(item))}</div>", "${formatCurrencyMarkup(brochurePromoPrice(item))}${elementHandles('promo', 'harga promo')}</div>", 1)
s = s.replace("${escapeHtml(brochureOffer(item))}</div>", "${escapeHtml(brochureOffer(item))}${elementHandles('offer', 'teks promo')}</div>", 1)
# Persistence/restore/reset/copy.
s = s.replace("tile_sizes: normalizeTileSizes(state.tileSizes) }),", "tile_sizes: normalizeTileSizes(state.tileSizes), tile_anchors: normalizeTileAnchors(state.tileAnchors) }),", 1)
s = s.replace("state.tileSizes = normalizeTileSizes(gridConfig.tile_sizes);", "state.tileSizes = normalizeTileSizes(gridConfig.tile_sizes);\n        state.tileAnchors = normalizeTileAnchors(gridConfig.tile_anchors);", 1)
s = s.replace("state.tileSizes = {};\n        state.layoutClipboard", "state.tileSizes = {};\n        state.tileAnchors = {};\n        state.layoutClipboard", 1)
s = s.replace("state.tileSizes[targetId] = { ...tileSizeForProduct(sourceId) };", "state.tileSizes[targetId] = { ...tileSizeForProduct(sourceId) };\n                state.tileAnchors[targetId] = { ...tileAnchorForProduct(sourceId) };", 1)
p.write_text(s)

# Admin CSS
p = Path('/home/ubuntu/sembakorido/admin/catalog-promo-pop.html')
s = p.read_text()
s = s.replace(".flyer-retail-tile { position:relative;", ".flyer-retail-tile { position:relative; transform:translate(var(--retail-tile-offset-x,0%),var(--retail-tile-offset-y,0%)) scale(var(--retail-tile-scale,1)); transform-origin:center center;", 1)
s = s.replace(".flyer-tile-resize-handle", ".flyer-tile-resize-handle", 1)
marker = "        .flyer-tile-resize-handle"
idx = s.find(marker)
if idx >= 0:
    end = s.find('\n', idx)
    s = s[:end+1] + "        .flyer-element-resize-handle { position:absolute; z-index:20; width:8px; height:8px; border:1px solid #fff; border-radius:2px; background:#f97316; box-shadow:0 0 0 1px rgba(124,45,18,.55); display:none; }\n        .flyer-positioned-element:hover .flyer-element-resize-handle, body.is-element-resizing .flyer-element-resize-handle { display:block; }\n        .flyer-element-resize-nw { left:-4px; top:-4px; cursor:nwse-resize; } .flyer-element-resize-n { left:calc(50% - 4px); top:-4px; cursor:ns-resize; } .flyer-element-resize-ne { right:-4px; top:-4px; cursor:nesw-resize; }\n        .flyer-element-resize-e { right:-4px; top:calc(50% - 4px); cursor:ew-resize; } .flyer-element-resize-se { right:-4px; bottom:-4px; cursor:nwse-resize; } .flyer-element-resize-s { left:calc(50% - 4px); bottom:-4px; cursor:ns-resize; } .flyer-element-resize-sw { left:-4px; bottom:-4px; cursor:nesw-resize; } .flyer-element-resize-w { left:-4px; top:calc(50% - 4px); cursor:ew-resize; }\n        .flyer-retail-tile.is-retail-moving { cursor:grabbing; }\n" + s[end+1:]
# Export safety: hide handles under capture/print.
s += "\n<style>\n@media print { .flyer-element-resize-handle, .flyer-tile-resize-handle { display:none !important; } }\n.flyer-preview.is-exporting .flyer-element-resize-handle, .flyer-preview.is-exporting .flyer-tile-resize-handle { display:none !important; }\n</style>\n"
p.write_text(s)

# Public renderer
p = Path('/home/ubuntu/sembakorido/promo_katalog.html')
s = p.read_text()
s = s.replace("tileSizes: normalizeTileSizes(gridConfig.tile_sizes),", "tileSizes: normalizeTileSizes(gridConfig.tile_sizes),\n                tileAnchors: normalizeTileAnchors(gridConfig.tile_anchors),", 1)
needle = "        function normalizeTilePositions(value) {"
insert = """        function normalizeTileAnchors(value) {
            var source = value && typeof value === 'object' ? value : {};
            var result = {};
            Object.keys(source).forEach(function(id) { var a = source[id] || {}; result[String(id)] = { x: Math.min(45, Math.max(-45, Number(a.x) || 0)), y: Math.min(45, Math.max(-45, Number(a.y) || 0)) }; });
            return result;
        }
        function tileAnchorStyle(anchors, productId) {
            var a = anchors && anchors[String(productId)] || {x:0,y:0};
            return '--pk-pop-retail-tile-offset-x:' + (Number(a.x) || 0) + '%;--pk-pop-retail-tile-offset-y:' + (Number(a.y) || 0) + '%;';
        }
""" + needle
s = s.replace(needle, insert, 1)
s = s.replace("var tileScale = isRetail ? tileSizeStyle(c.tileSizes, item.id) : '';", "var tileScale = isRetail ? tileSizeStyle(c.tileSizes, item.id) + tileAnchorStyle(c.tileAnchors, item.id) : '';")
# public CSS
s = s.replace(".pk-pop-preview-item.pk-pop-retail-tile { transform:scale(var(--pk-pop-retail-tile-scale,1));", ".pk-pop-preview-item.pk-pop-retail-tile { transform:translate(var(--pk-pop-retail-tile-offset-x,0%),var(--pk-pop-retail-tile-offset-y,0%)) scale(var(--pk-pop-retail-tile-scale,1));", 1)
p.write_text(s)

# Regression assertions
p = Path('/home/ubuntu/sembakorido/tests/catalog_promo_pop_governance_regression.js')
s = p.read_text()
if 'data-element-resize' not in s:
    s += "\nassert(adminJs.includes('data-element-resize') || adminHtml.includes('flyer-element-resize-handle'), 'freeform element resize controls present');\nassert(adminJs.includes('normalizeTileAnchors') && adminJs.includes('tile_anchors'), 'tile anchors persist');\nassert(adminJs.includes('is-element-resizing') && adminHtml.includes('flyer-element-resize-nw'), 'multi-direction element resize states present');\nassert(adminJs.includes('if (!inside)') && !adminJs.includes('const overlaps = Array.from(bounds.querySelectorAll(\'.flyer-retail-tile\'))'), 'freeform resize allows overlap while enforcing canvas bounds');\nassert(publicHtml.includes('normalizeTileAnchors') && publicHtml.includes('pk-pop-retail-tile-offset-x'), 'public renderer receives tile anchors');\n"
p.write_text(s)
