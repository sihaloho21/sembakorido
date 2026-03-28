/**
 * brosur.js – GoSembako Brosur Generator
 * PIN auth · fetch produk dari GAS API · render Canvas (featured/grid4/grid6) · export PNG · share WA
 */

'use strict';

/* ══════════════════════════════════════════
   CONSTANTS & STATE
══════════════════════════════════════════ */
const BROSUR_PIN_KEY = 'gosembako_brosur_pin_ok';
const BROSUR_PIN_CORRECT = '082625'; // PIN default — bisa diganti
const CANVAS_SIZE = { w: 1080, h: 1080 };
const CANVAS_SIZE_PORTRAIT = { w: 1080, h: 1350 };

const THEMES = {
    'green-blue':  { from: '#128052', to: '#1d4ed8', accent: '#22c55e', text: '#ffffff' },
    'red-orange':  { from: '#dc2626', to: '#f97316', accent: '#fbbf24', text: '#ffffff' },
    'purple-pink': { from: '#7c3aed', to: '#ec4899', accent: '#f0abfc', text: '#ffffff' },
    'blue-cyan':   { from: '#0369a1', to: '#06b6d4', accent: '#67e8f9', text: '#ffffff' },
    'amber':       { from: '#d97706', to: '#fbbf24', accent: '#ffffff', text: '#1e293b' },
    'dark':        { from: '#1e293b', to: '#475569', accent: '#22c55e', text: '#ffffff' }
};

const TEMPLATE_SLOTS = { featured: 1, grid4: 4, grid6: 6 };

let state = {
    authed: false,
    template: 'featured',
    theme: 'green-blue',
    products: [],          // all from API
    selected: [],          // selected product objects (with overrides)
    promoStart: '',
    promoEnd: '',
    ctaText: 'Pesan Sekarang! Stok Terbatas 🔥',
    waNumber: '0899-3370-200',
    showWatermark: true,
    watermarkPos: 'br',
    generatedDataUrl: null,
    previewTimer: null
};

/* ══════════════════════════════════════════
   INIT
══════════════════════════════════════════ */
document.addEventListener('DOMContentLoaded', () => {
    // Check session
    if (sessionStorage.getItem(BROSUR_PIN_KEY) === '1') {
        showApp();
    }

    // PIN enter key
    const pinInput = document.getElementById('pin-input');
    if (pinInput) {
        pinInput.addEventListener('keydown', (e) => {
            if (e.key === 'Enter') checkPin();
        });
    }

    // Set default dates
    const today = new Date();
    const nextWeek = new Date(today.getTime() + 7 * 24 * 60 * 60 * 1000);
    const fmt = (d) => d.toISOString().split('T')[0];
    const startEl = document.getElementById('promo-date-start');
    const endEl = document.getElementById('promo-date-end');
    if (startEl) startEl.value = fmt(today);
    if (endEl) endEl.value = fmt(nextWeek);
    state.promoStart = fmt(today);
    state.promoEnd = fmt(nextWeek);
});

/* ══════════════════════════════════════════
   PIN AUTH
══════════════════════════════════════════ */
function checkPin() {
    const input = document.getElementById('pin-input');
    const errEl = document.getElementById('pin-error');
    const btnText = document.getElementById('pin-btn-text');
    if (!input) return;

    const val = input.value.trim();
    if (!val) { errEl.textContent = 'Masukkan PIN terlebih dahulu.'; return; }

    btnText.innerHTML = '<span class="spinner"></span>';
    setTimeout(() => {
        if (val === BROSUR_PIN_CORRECT) {
            sessionStorage.setItem(BROSUR_PIN_KEY, '1');
            showApp();
        } else {
            errEl.textContent = 'PIN salah. Coba lagi.';
            input.value = '';
            input.focus();
            btnText.textContent = 'Masuk';
        }
    }, 400);
}

function showApp() {
    state.authed = true;
    document.getElementById('pin-screen').style.display = 'none';
    document.getElementById('app').style.display = 'block';
    loadProducts();
}

function logout() {
    sessionStorage.removeItem(BROSUR_PIN_KEY);
    location.reload();
}

/* ══════════════════════════════════════════
   FETCH PRODUCTS
══════════════════════════════════════════ */
async function loadProducts() {
    try {
        // Gunakan ApiService dengan endpoint yang sama seperti index.html
        let raw;
        if (typeof ApiService !== 'undefined') {
            raw = await ApiService.get('?sheet=products', {
                cacheDuration: 5 * 60 * 1000
            });
        } else {
            // Fallback langsung ke fetch jika ApiService belum tersedia
            const apiUrl = (typeof CONFIG !== 'undefined' && CONFIG.getMainApiUrl)
                ? CONFIG.getMainApiUrl()
                : 'https://script.google.com/macros/s/AKfycbwDmh_cc-J9c0cuzcSThFQBdiZ7lpy3oUjDENZhHW-4UszuKwPB20g6OeRccVsgvp79hw/exec';
            const resp = await fetch(`${apiUrl}?sheet=products&t=${Date.now()}`);
            raw = await resp.json();
        }
        const arr = Array.isArray(raw) ? raw : (raw.products || raw.result || raw.data || []);
        state.products = arr.map(normalizeProduct).filter(p => p.nama);
        if (state.products.length === 0) {
            document.getElementById('product-loading').innerHTML =
                '<p style="color:#f59e0b;font-size:0.8rem;">Tidak ada produk ditemukan di API. Pastikan sheet "products" tersedia.</p>';
            return;
        }
        renderProductList();
    } catch (err) {
        console.error('loadProducts error:', err);
        document.getElementById('product-loading').innerHTML =
            '<p style="color:#dc2626;font-size:0.8rem;">Gagal memuat produk. <button onclick="loadProducts()" style="color:#128052;font-weight:700;text-decoration:underline;">Coba lagi</button></p>';
    }
}

function normalizeProduct(p) {
    const harga = parseInt(p.harga) || 0;
    const hargaCoret = parseInt(p.harga_coret || p.hargaCoret) || 0;
    const gambarRaw = (p.gambar || p.foto || p.image || '').split(',')[0].trim();
    return {
        id: p.id || p.sku || '',
        nama: (p.nama || p.name || '').trim(),
        harga,
        hargaCoret: hargaCoret > harga ? hargaCoret : 0,
        gambar: gambarRaw,
        deskripsi: (p.deskripsi || p.description || '').trim(),
        kategori: (p.kategori || p.category || 'Produk').trim(),
        stok: parseInt(p.stok) || 0,
        badge: (p.badge || p.label || '').trim(),
        minOrder: parseInt(p.min_order || p.minOrder || p.minimal) || 1,
        rewardPoin: Math.round(harga / 10000) || 0,
        // editable overrides (filled from UI)
        _nama: '',
        _harga: '',
        _hargaCoret: '',
        _deskripsi: '',
        _badge: '',
        _minOrder: '',
        _rewardPoin: ''
    };
}

/* ══════════════════════════════════════════
   PRODUCT LIST UI
══════════════════════════════════════════ */
function renderProductList(filter = '') {
    const wrap = document.getElementById('product-list-wrap');
    const loading = document.getElementById('product-loading');
    if (!wrap) return;

    loading.style.display = 'none';
    wrap.style.display = 'block';

    const maxSlots = TEMPLATE_SLOTS[state.template];
    const filtered = state.products.filter(p =>
        !filter || p.nama.toLowerCase().includes(filter.toLowerCase())
    );

    if (!filtered.length) {
        wrap.innerHTML = '<div class="empty-state"><p>Tidak ada produk ditemukan.</p></div>';
        return;
    }

    wrap.innerHTML = filtered.map(p => {
        const isSelected = state.selected.some(s => s.id === p.id);
        const imgSrc = p.gambar || 'https://placehold.co/80x80/e2e8f0/94a3b8?text=Produk';
        const disabledClass = (!isSelected && state.selected.length >= maxSlots) ? 'opacity-50 pointer-events-none' : '';
        return `
        <div class="product-item ${isSelected ? 'selected' : ''} ${disabledClass}"
             data-id="${escHtml(p.id)}" onclick="toggleProduct('${escHtml(p.id)}')">
            <img src="${escHtml(imgSrc)}" alt="${escHtml(p.nama)}"
                 onerror="this.src='https://placehold.co/80x80/e2e8f0/94a3b8?text=Produk'">
            <div class="product-item-info">
                <div class="product-item-name">${escHtml(p.nama)}</div>
                <div class="product-item-price">Rp ${p.harga.toLocaleString('id-ID')}</div>
            </div>
            <div class="product-item-check">
                ${isSelected ? '<svg width="10" height="10" fill="none" stroke="currentColor" viewBox="0 0 24 24"><path stroke-linecap="round" stroke-linejoin="round" stroke-width="3" d="M5 13l4 4L19 7"/></svg>' : ''}
            </div>
        </div>`;
    }).join('');
}

function filterProductList() {
    const q = document.getElementById('product-search').value;
    renderProductList(q);
}

function toggleProduct(id) {
    const maxSlots = TEMPLATE_SLOTS[state.template];
    const idx = state.selected.findIndex(s => s.id === id);
    if (idx >= 0) {
        state.selected.splice(idx, 1);
    } else {
        if (state.selected.length >= maxSlots) {
            showToast(`Template ini hanya mendukung ${maxSlots} produk.`);
            return;
        }
        const prod = state.products.find(p => p.id === id);
        if (prod) state.selected.push({ ...prod });
    }
    updateSlotCounter();
    renderProductList(document.getElementById('product-search').value);
    renderSelectedProducts();
    schedulePreview();
}

function updateSlotCounter() {
    const maxSlots = TEMPLATE_SLOTS[state.template];
    const counter = document.getElementById('slot-counter');
    const nextBtn = document.getElementById('step2-next-btn');
    if (counter) {
        counter.textContent = `${state.selected.length} / ${maxSlots} slot`;
        counter.className = `limit-badge ${state.selected.length > 0 ? 'ok' : ''}`;
    }
    if (nextBtn) nextBtn.disabled = state.selected.length === 0;
}

/* ══════════════════════════════════════════
   SELECTED PRODUCTS CRUD
══════════════════════════════════════════ */
function renderSelectedProducts() {
    const section = document.getElementById('selected-products-section');
    const list = document.getElementById('selected-products-list');
    if (!section || !list) return;

    if (state.selected.length === 0) {
        section.style.display = 'none';
        return;
    }
    section.style.display = 'block';

    list.innerHTML = state.selected.map((p, i) => {
        const imgSrc = p.gambar || 'https://placehold.co/80x80/e2e8f0/94a3b8?text=Produk';
        const badgePresets = ['TERLARIS', 'BARU', 'PROMO', 'HEMAT', 'LIMITED', 'BEST SELLER'];
        return `
        <div class="selected-product-card">
            <div class="prod-header">
                <img src="${escHtml(imgSrc)}" alt="${escHtml(p.nama)}"
                     onerror="this.src='https://placehold.co/80x80/e2e8f0/94a3b8?text=Produk'">
                <span class="prod-name">${escHtml(p.nama)}</span>
                <button class="btn-remove-prod" onclick="removeProduct(${i})" title="Hapus produk ini">✕</button>
            </div>

            <div class="field-row">
                <div>
                    <div class="field-label">Nama Tampil</div>
                    <input type="text" class="field-input" placeholder="${escHtml(p.nama)}"
                           value="${escHtml(p._nama)}"
                           oninput="updateField(${i},'_nama',this.value)">
                </div>
                <div>
                    <div class="field-label">Badge</div>
                    <input type="text" class="field-input" placeholder="TERLARIS"
                           value="${escHtml(p._badge || p.badge)}"
                           oninput="updateField(${i},'_badge',this.value)">
                </div>
            </div>

            <div class="badge-presets" style="margin-bottom:0.5rem;">
                ${badgePresets.map(b => `
                    <span class="badge-preset" style="background:#f0fdf4;color:#16a34a;border-color:#86efac;"
                          onclick="setBadge(${i},'${b}')">${b}</span>
                `).join('')}
            </div>

            <div class="field-row">
                <div>
                    <div class="field-label">Harga Promo (Rp)</div>
                    <input type="number" class="field-input" placeholder="${p.harga}"
                           value="${p._harga}"
                           oninput="updateField(${i},'_harga',this.value)">
                </div>
                <div>
                    <div class="field-label">Harga Coret (Rp)</div>
                    <input type="number" class="field-input" placeholder="${p.hargaCoret || p.harga}"
                           value="${p._hargaCoret}"
                           oninput="updateField(${i},'_hargaCoret',this.value)">
                </div>
            </div>

            <div class="field-row">
                <div>
                    <div class="field-label">Min. Pembelian</div>
                    <input type="text" class="field-input" placeholder="${p.minOrder} pcs"
                           value="${p._minOrder}"
                           oninput="updateField(${i},'_minOrder',this.value)">
                </div>
                <div>
                    <div class="field-label">Point Reward</div>
                    <input type="number" class="field-input" placeholder="${p.rewardPoin}"
                           value="${p._rewardPoin}"
                           oninput="updateField(${i},'_rewardPoin',this.value)">
                </div>
            </div>

            <div class="field-row full">
                <div>
                    <div class="field-label">Deskripsi Singkat</div>
                    <input type="text" class="field-input" maxlength="80"
                           placeholder="${escHtml(p.deskripsi || 'Kualitas terjamin, stok selalu baru')}"
                           value="${escHtml(p._deskripsi)}"
                           oninput="updateField(${i},'_deskripsi',this.value)">
                </div>
            </div>

            <div class="field-row full">
                <div>
                    <div class="field-label">URL Gambar (opsional override)</div>
                    <input type="text" class="field-input"
                           placeholder="${escHtml(p.gambar || 'https://...')}"
                           value="${escHtml(p._gambar || '')}"
                           oninput="updateField(${i},'_gambar',this.value)">
                </div>
            </div>
        </div>`;
    }).join('');
}

function removeProduct(idx) {
    state.selected.splice(idx, 1);
    updateSlotCounter();
    renderProductList(document.getElementById('product-search').value);
    renderSelectedProducts();
    schedulePreview();
}

function updateField(idx, field, value) {
    if (state.selected[idx]) {
        state.selected[idx][field] = value;
        schedulePreview();
    }
}

function setBadge(idx, badge) {
    if (state.selected[idx]) {
        state.selected[idx]._badge = badge;
        renderSelectedProducts();
        schedulePreview();
    }
}

/* ══════════════════════════════════════════
   STEP NAVIGATION
══════════════════════════════════════════ */
function goToStep(n) {
    [1, 2, 3, 4].forEach(i => {
        const el = document.getElementById(`step-${i}`);
        if (el) el.style.display = i === n ? 'block' : 'none';
    });
    document.querySelectorAll('.step').forEach(el => {
        const sn = parseInt(el.dataset.step);
        el.classList.remove('active', 'done');
        if (sn === n) el.classList.add('active');
        else if (sn < n) el.classList.add('done');
    });
    if (n === 2) updateSlotCounter();
    if (n === 3 || n === 4) schedulePreview();
    window.scrollTo({ top: 0, behavior: 'smooth' });
}

/* ══════════════════════════════════════════
   TEMPLATE & THEME SELECTION
══════════════════════════════════════════ */
function selectTemplate(t) {
    state.template = t;
    document.querySelectorAll('.template-card').forEach(el => {
        el.classList.toggle('selected', el.dataset.template === t);
    });
    // Clear selections if over new slot limit
    const maxSlots = TEMPLATE_SLOTS[t];
    if (state.selected.length > maxSlots) {
        state.selected = state.selected.slice(0, maxSlots);
        renderSelectedProducts();
    }
    updateSlotCounter();
    // Update preview size label
    const sizeLabel = document.getElementById('preview-size-label');
    const previewWrap = document.getElementById('preview-wrap');
    if (t === 'grid6') {
        if (sizeLabel) sizeLabel.textContent = '1080×1350 px';
        if (previewWrap) previewWrap.classList.add('portrait');
    } else {
        if (sizeLabel) sizeLabel.textContent = '1080×1080 px';
        if (previewWrap) previewWrap.classList.remove('portrait');
    }
    schedulePreview();
}

function selectTheme(el, theme) {
    state.theme = theme;
    document.querySelectorAll('.color-swatch').forEach(s => s.classList.remove('selected'));
    el.classList.add('selected');
    schedulePreview();
}

/* ══════════════════════════════════════════
   PREVIEW SCHEDULING
══════════════════════════════════════════ */
function schedulePreview() {
    // Read current form values
    state.promoStart = (document.getElementById('promo-date-start') || {}).value || '';
    state.promoEnd = (document.getElementById('promo-date-end') || {}).value || '';
    state.ctaText = (document.getElementById('cta-text') || {}).value || '';
    state.waNumber = (document.getElementById('wa-number') || {}).value || '';
    state.showWatermark = (document.getElementById('show-watermark') || {}).checked !== false;
    state.watermarkPos = (document.getElementById('watermark-pos') || {}).value || 'br';

    if (state.previewTimer) clearTimeout(state.previewTimer);
    if (state.selected.length === 0) return;
    state.previewTimer = setTimeout(() => renderPreview(), 300);
}

async function renderPreview() {
    if (state.selected.length === 0) return;
    const canvas = document.getElementById('brosur-canvas');
    if (!canvas) return;
    await drawBrosur(canvas, false);
    document.getElementById('preview-placeholder').style.display = 'none';
    canvas.style.display = 'block';
}

/* ══════════════════════════════════════════
   GENERATE (HIGH-RES)
══════════════════════════════════════════ */
async function generateBrosur() {
    if (state.selected.length === 0) {
        showToast('Pilih minimal 1 produk terlebih dahulu.');
        return;
    }
    const indicator = document.getElementById('generating-indicator');
    if (indicator) indicator.style.display = 'block';

    try {
        const exportCanvas = document.getElementById('export-canvas');
        await drawBrosur(exportCanvas, true);
        state.generatedDataUrl = exportCanvas.toDataURL('image/png', 1.0);

        // Also update preview
        const previewCanvas = document.getElementById('brosur-canvas');
        await drawBrosur(previewCanvas, false);
        document.getElementById('preview-placeholder').style.display = 'none';
        previewCanvas.style.display = 'block';

        goToStep(4);
        showToast('Brosur berhasil dibuat! 🎉');
    } catch (err) {
        console.error('generateBrosur error:', err);
        showToast('Gagal membuat brosur. Coba lagi.');
    } finally {
        if (indicator) indicator.style.display = 'none';
    }
}

/* ══════════════════════════════════════════
   CANVAS DRAWING ENGINE
══════════════════════════════════════════ */
async function drawBrosur(canvas, highRes) {
    const isPortrait = state.template === 'grid6';
    const size = isPortrait ? CANVAS_SIZE_PORTRAIT : CANVAS_SIZE;
    const scale = highRes ? 1 : 0.4; // preview at 40%

    canvas.width = size.w * scale;
    canvas.height = size.h * scale;

    const ctx = canvas.getContext('2d');
    ctx.scale(scale, scale);

    const theme = THEMES[state.theme] || THEMES['green-blue'];
    const W = size.w, H = size.h;

    // ── Background gradient ──
    const bgGrad = ctx.createLinearGradient(0, 0, W, H);
    bgGrad.addColorStop(0, theme.from);
    bgGrad.addColorStop(1, theme.to);
    ctx.fillStyle = bgGrad;
    roundRect(ctx, 0, 0, W, H, 0);
    ctx.fill();

    // ── Decorative circles ──
    ctx.save();
    ctx.globalAlpha = 0.06;
    ctx.fillStyle = '#ffffff';
    ctx.beginPath(); ctx.arc(W * 0.85, H * 0.12, 180, 0, Math.PI * 2); ctx.fill();
    ctx.beginPath(); ctx.arc(W * 0.1, H * 0.88, 140, 0, Math.PI * 2); ctx.fill();
    ctx.beginPath(); ctx.arc(W * 0.5, H * 0.5, 320, 0, Math.PI * 2); ctx.fill();
    ctx.restore();

    // ── Header bar ──
    const headerH = isPortrait ? 120 : 110;
    ctx.save();
    ctx.globalAlpha = 0.18;
    ctx.fillStyle = '#000000';
    roundRect(ctx, 0, 0, W, headerH, 0);
    ctx.fill();
    ctx.restore();

    // Logo text (GoSembako)
    ctx.fillStyle = '#ffffff';
    ctx.font = `bold ${isPortrait ? 38 : 36}px -apple-system, Arial, sans-serif`;
    ctx.textAlign = 'left';
    ctx.textBaseline = 'middle';
    ctx.fillText('🛒 GoSembako', 48, headerH / 2);

    // WA number in header
    ctx.font = `600 ${isPortrait ? 26 : 24}px -apple-system, Arial, sans-serif`;
    ctx.textAlign = 'right';
    ctx.fillStyle = 'rgba(255,255,255,0.85)';
    ctx.fillText(`📱 ${state.waNumber}`, W - 48, headerH / 2);

    // ── Promo date strip ──
    const dateY = headerH;
    const dateH = 52;
    ctx.save();
    ctx.globalAlpha = 0.22;
    ctx.fillStyle = '#000000';
    ctx.fillRect(0, dateY, W, dateH);
    ctx.restore();

    ctx.fillStyle = '#ffffff';
    ctx.font = `700 ${isPortrait ? 26 : 24}px -apple-system, Arial, sans-serif`;
    ctx.textAlign = 'center';
    ctx.textBaseline = 'middle';
    const dateStr = formatDateRange(state.promoStart, state.promoEnd);
    ctx.fillText(`📅 Promo Berlaku: ${dateStr}`, W / 2, dateY + dateH / 2);

    // ── Product area ──
    const contentY = headerH + dateH + 24;
    const contentH = H - contentY - 100; // leave footer space

    if (state.template === 'featured') {
        await drawFeatured(ctx, state.selected[0], 48, contentY, W - 96, contentH, theme);
    } else if (state.template === 'grid4') {
        await drawGrid(ctx, state.selected, 2, 2, 48, contentY, W - 96, contentH, theme);
    } else if (state.template === 'grid6') {
        await drawGrid(ctx, state.selected, 2, 3, 48, contentY, W - 96, contentH, theme);
    }

    // ── CTA Footer ──
    const footerY = H - 88;
    const footerH = 88;
    const ctaGrad = ctx.createLinearGradient(0, footerY, W, footerY + footerH);
    ctaGrad.addColorStop(0, 'rgba(0,0,0,0.35)');
    ctaGrad.addColorStop(1, 'rgba(0,0,0,0.55)');
    ctx.fillStyle = ctaGrad;
    ctx.fillRect(0, footerY, W, footerH);

    ctx.fillStyle = '#ffffff';
    ctx.font = `bold ${isPortrait ? 34 : 32}px -apple-system, Arial, sans-serif`;
    ctx.textAlign = 'center';
    ctx.textBaseline = 'middle';
    ctx.fillText(state.ctaText, W / 2, footerY + footerH / 2);

    // ── Watermark ──
    if (state.showWatermark) {
        drawWatermark(ctx, W, H, state.watermarkPos, theme);
    }
}

/* ── Featured Template ── */
async function drawFeatured(ctx, prod, x, y, w, h, theme) {
    if (!prod) return;
    const eff = effectiveProd(prod);

    // Card background
    ctx.save();
    ctx.fillStyle = 'rgba(255,255,255,0.12)';
    roundRect(ctx, x, y, w, h, 32);
    ctx.fill();
    ctx.strokeStyle = 'rgba(255,255,255,0.25)';
    ctx.lineWidth = 2;
    ctx.stroke();
    ctx.restore();

    // Image area (left half)
    const imgW = Math.round(w * 0.48);
    const imgH = h - 32;
    const imgX = x + 16;
    const imgY = y + 16;

    await drawProductImage(ctx, eff.gambar, imgX, imgY, imgW, imgH, 24);

    // Badge
    if (eff.badge) {
        drawBadge(ctx, eff.badge, imgX + 12, imgY + 12, theme);
    }

    // Reward poin badge
    if (eff.rewardPoin > 0) {
        drawRewardBadge(ctx, eff.rewardPoin, imgX + imgW - 12, imgY + 12, theme);
    }

    // Info area (right half)
    const infoX = x + imgW + 32;
    const infoW = w - imgW - 48;
    let curY = y + 40;

    // Category
    ctx.fillStyle = 'rgba(255,255,255,0.6)';
    ctx.font = '600 22px -apple-system, Arial, sans-serif';
    ctx.textAlign = 'left';
    ctx.textBaseline = 'top';
    ctx.fillText(eff.kategori.toUpperCase(), infoX, curY);
    curY += 36;

    // Name
    ctx.fillStyle = '#ffffff';
    ctx.font = 'bold 44px -apple-system, Arial, sans-serif';
    curY = drawWrappedText(ctx, eff.nama, infoX, curY, infoW, 52, 2);
    curY += 20;

    // Description
    ctx.fillStyle = 'rgba(255,255,255,0.78)';
    ctx.font = '400 26px -apple-system, Arial, sans-serif';
    curY = drawWrappedText(ctx, eff.deskripsi, infoX, curY, infoW, 34, 2);
    curY += 28;

    // Harga coret
    if (eff.hargaCoret > eff.harga) {
        const diskon = Math.round(((eff.hargaCoret - eff.harga) / eff.hargaCoret) * 100);
        ctx.fillStyle = 'rgba(255,255,255,0.55)';
        ctx.font = '500 28px -apple-system, Arial, sans-serif';
        const coretStr = `Rp ${eff.hargaCoret.toLocaleString('id-ID')}`;
        ctx.fillText(coretStr, infoX, curY);
        // Strikethrough
        const tw = ctx.measureText(coretStr).width;
        ctx.strokeStyle = 'rgba(255,255,255,0.55)';
        ctx.lineWidth = 2;
        ctx.beginPath();
        ctx.moveTo(infoX, curY + 14);
        ctx.lineTo(infoX + tw, curY + 14);
        ctx.stroke();
        // Diskon badge
        ctx.fillStyle = '#ef4444';
        roundRect(ctx, infoX + tw + 12, curY - 2, 90, 32, 8);
        ctx.fill();
        ctx.fillStyle = '#fff';
        ctx.font = 'bold 20px -apple-system, Arial, sans-serif';
        ctx.textAlign = 'center';
        ctx.fillText(`-${diskon}%`, infoX + tw + 12 + 45, curY + 14);
        ctx.textAlign = 'left';
        curY += 40;
    }

    // Harga promo
    ctx.fillStyle = theme.accent;
    ctx.font = 'bold 64px -apple-system, Arial, sans-serif';
    ctx.fillText(`Rp ${eff.harga.toLocaleString('id-ID')}`, infoX, curY);
    curY += 80;

    // Min order + poin row
    ctx.fillStyle = 'rgba(255,255,255,0.7)';
    ctx.font = '600 24px -apple-system, Arial, sans-serif';
    ctx.fillText(`📦 Min. ${eff.minOrder} pcs   ⭐ +${eff.rewardPoin} Poin`, infoX, curY);
}

/* ── Grid Template ── */
async function drawGrid(ctx, prods, cols, rows, x, y, w, h, theme) {
    const gap = 20;
    const cellW = (w - gap * (cols - 1)) / cols;
    const cellH = (h - gap * (rows - 1)) / rows;

    for (let r = 0; r < rows; r++) {
        for (let c = 0; c < cols; c++) {
            const idx = r * cols + c;
            const prod = prods[idx];
            const cx = x + c * (cellW + gap);
            const cy = y + r * (cellH + gap);
            await drawGridCell(ctx, prod, cx, cy, cellW, cellH, theme);
        }
    }
}

async function drawGridCell(ctx, prod, x, y, w, h, theme) {
    // Card bg
    ctx.save();
    ctx.fillStyle = 'rgba(255,255,255,0.13)';
    roundRect(ctx, x, y, w, h, 24);
    ctx.fill();
    ctx.strokeStyle = 'rgba(255,255,255,0.2)';
    ctx.lineWidth = 1.5;
    ctx.stroke();
    ctx.restore();

    if (!prod) {
        // Empty slot
        ctx.fillStyle = 'rgba(255,255,255,0.2)';
        ctx.font = '500 24px -apple-system, Arial, sans-serif';
        ctx.textAlign = 'center';
        ctx.textBaseline = 'middle';
        ctx.fillText('Slot Kosong', x + w / 2, y + h / 2);
        return;
    }

    const eff = effectiveProd(prod);
    const imgH = Math.round(h * 0.45);
    const pad = 14;

    // Product image
    await drawProductImage(ctx, eff.gambar, x + pad, y + pad, w - pad * 2, imgH, 16);

    // Badge
    if (eff.badge) {
        drawBadge(ctx, eff.badge, x + pad + 6, y + pad + 6, theme, true);
    }

    // Reward poin
    if (eff.rewardPoin > 0) {
        ctx.fillStyle = '#fbbf24';
        ctx.font = `bold ${Math.round(w * 0.038)}px -apple-system, Arial, sans-serif`;
        ctx.textAlign = 'right';
        ctx.textBaseline = 'top';
        ctx.fillText(`+${eff.rewardPoin}⭐`, x + w - pad - 6, y + pad + 6);
    }

    let curY = y + pad + imgH + 12;
    const fs = Math.round(w * 0.048);
    const lineH = fs + 6;

    // Name
    ctx.fillStyle = '#ffffff';
    ctx.font = `bold ${fs}px -apple-system, Arial, sans-serif`;
    ctx.textAlign = 'left';
    ctx.textBaseline = 'top';
    curY = drawWrappedText(ctx, eff.nama, x + pad, curY, w - pad * 2, lineH, 2);
    curY += 6;

    // Harga coret
    if (eff.hargaCoret > eff.harga) {
        const coretStr = `Rp ${eff.hargaCoret.toLocaleString('id-ID')}`;
        ctx.fillStyle = 'rgba(255,255,255,0.5)';
        ctx.font = `500 ${Math.round(fs * 0.72)}px -apple-system, Arial, sans-serif`;
        ctx.fillText(coretStr, x + pad, curY);
        const tw = ctx.measureText(coretStr).width;
        ctx.strokeStyle = 'rgba(255,255,255,0.5)';
        ctx.lineWidth = 1.5;
        ctx.beginPath();
        ctx.moveTo(x + pad, curY + Math.round(fs * 0.36));
        ctx.lineTo(x + pad + tw, curY + Math.round(fs * 0.36));
        ctx.stroke();
        curY += Math.round(fs * 0.85);
    }

    // Harga promo
    ctx.fillStyle = theme.accent;
    ctx.font = `bold ${Math.round(fs * 1.1)}px -apple-system, Arial, sans-serif`;
    ctx.fillText(`Rp ${eff.harga.toLocaleString('id-ID')}`, x + pad, curY);
    curY += Math.round(fs * 1.4);

    // Min order
    ctx.fillStyle = 'rgba(255,255,255,0.65)';
    ctx.font = `500 ${Math.round(fs * 0.65)}px -apple-system, Arial, sans-serif`;
    ctx.fillText(`📦 Min. ${eff.minOrder} pcs`, x + pad, curY);
}

/* ══════════════════════════════════════════
   HELPERS
══════════════════════════════════════════ */
function effectiveProd(p) {
    return {
        nama:       (p._nama || p.nama || '').trim(),
        harga:      parseInt(p._harga) || p.harga || 0,
        hargaCoret: parseInt(p._hargaCoret) || p.hargaCoret || 0,
        gambar:     (p._gambar || p.gambar || '').trim(),
        deskripsi:  (p._deskripsi || p.deskripsi || 'Kualitas terjamin, stok selalu baru').trim(),
        kategori:   p.kategori || 'Produk',
        badge:      (p._badge !== undefined ? p._badge : p.badge) || '',
        minOrder:   parseInt(p._minOrder) || p.minOrder || 1,
        rewardPoin: parseInt(p._rewardPoin) || p.rewardPoin || 0
    };
}

async function drawProductImage(ctx, src, x, y, w, h, radius) {
    return new Promise((resolve) => {
        ctx.save();
        roundRect(ctx, x, y, w, h, radius);
        ctx.clip();

        if (!src) {
            ctx.fillStyle = 'rgba(255,255,255,0.15)';
            ctx.fillRect(x, y, w, h);
            ctx.fillStyle = 'rgba(255,255,255,0.4)';
            ctx.font = `bold ${Math.round(w * 0.12)}px Arial`;
            ctx.textAlign = 'center';
            ctx.textBaseline = 'middle';
            ctx.fillText('📦', x + w / 2, y + h / 2);
            ctx.restore();
            resolve();
            return;
        }

        const img = new Image();
        img.crossOrigin = 'anonymous';
        img.onload = () => {
            // Cover fit
            const scale = Math.max(w / img.width, h / img.height);
            const sw = img.width * scale;
            const sh = img.height * scale;
            const sx = x + (w - sw) / 2;
            const sy = y + (h - sh) / 2;
            ctx.drawImage(img, sx, sy, sw, sh);
            ctx.restore();
            resolve();
        };
        img.onerror = () => {
            ctx.fillStyle = 'rgba(255,255,255,0.15)';
            ctx.fillRect(x, y, w, h);
            ctx.fillStyle = 'rgba(255,255,255,0.4)';
            ctx.font = `bold ${Math.round(w * 0.12)}px Arial`;
            ctx.textAlign = 'center';
            ctx.textBaseline = 'middle';
            ctx.fillText('📦', x + w / 2, y + h / 2);
            ctx.restore();
            resolve();
        };
        img.src = src;
    });
}

function drawBadge(ctx, text, x, y, theme, small = false) {
    const fs = small ? 20 : 24;
    ctx.font = `bold ${fs}px -apple-system, Arial, sans-serif`;
    const tw = ctx.measureText(text).width;
    const pw = 16, ph = 8;
    ctx.fillStyle = theme.accent === '#ffffff' ? theme.from : theme.accent;
    roundRect(ctx, x, y, tw + pw * 2, fs + ph * 2, 8);
    ctx.fill();
    ctx.fillStyle = theme.text === '#ffffff' ? '#1e293b' : '#ffffff';
    ctx.textAlign = 'left';
    ctx.textBaseline = 'top';
    ctx.fillText(text, x + pw, y + ph);
}

function drawRewardBadge(ctx, poin, x, y, theme) {
    const text = `+${poin} Poin`;
    ctx.font = 'bold 20px -apple-system, Arial, sans-serif';
    const tw = ctx.measureText(text).width;
    ctx.fillStyle = '#fbbf24';
    roundRect(ctx, x - tw - 24, y, tw + 24, 32, 8);
    ctx.fill();
    ctx.fillStyle = '#1e293b';
    ctx.textAlign = 'right';
    ctx.textBaseline = 'top';
    ctx.fillText(text, x - 8, y + 6);
}

function drawWatermark(ctx, W, H, pos, theme) {
    const text = 'paketsembako.com';
    ctx.save();
    ctx.globalAlpha = 0.35;
    ctx.fillStyle = '#ffffff';
    ctx.font = 'bold 28px -apple-system, Arial, sans-serif';
    ctx.textBaseline = 'bottom';

    const pad = 40;
    const tw = ctx.measureText(text).width;
    let wx, wy;

    if (pos === 'br') { wx = W - pad; wy = H - pad; ctx.textAlign = 'right'; }
    else if (pos === 'bl') { wx = pad; wy = H - pad; ctx.textAlign = 'left'; }
    else if (pos === 'tr') { wx = W - pad; wy = pad + 28; ctx.textAlign = 'right'; }
    else if (pos === 'tl') { wx = pad; wy = pad + 28; ctx.textAlign = 'left'; }
    else { wx = W / 2; wy = H / 2; ctx.textAlign = 'center'; ctx.globalAlpha = 0.12; }

    ctx.fillText(text, wx, wy);
    ctx.restore();
}

function drawWrappedText(ctx, text, x, y, maxW, lineH, maxLines) {
    if (!text) return y;
    const words = text.split(' ');
    let line = '';
    let lineCount = 0;
    for (const word of words) {
        const test = line ? `${line} ${word}` : word;
        if (ctx.measureText(test).width > maxW && line) {
            ctx.fillText(line, x, y);
            y += lineH;
            line = word;
            lineCount++;
            if (lineCount >= maxLines) { ctx.fillText(line + '…', x, y); y += lineH; return y; }
        } else {
            line = test;
        }
    }
    if (line) { ctx.fillText(line, x, y); y += lineH; }
    return y;
}

function roundRect(ctx, x, y, w, h, r) {
    ctx.beginPath();
    ctx.moveTo(x + r, y);
    ctx.lineTo(x + w - r, y);
    ctx.quadraticCurveTo(x + w, y, x + w, y + r);
    ctx.lineTo(x + w, y + h - r);
    ctx.quadraticCurveTo(x + w, y + h, x + w - r, y + h);
    ctx.lineTo(x + r, y + h);
    ctx.quadraticCurveTo(x, y + h, x, y + h - r);
    ctx.lineTo(x, y + r);
    ctx.quadraticCurveTo(x, y, x + r, y);
    ctx.closePath();
}

function formatDateRange(start, end) {
    const opts = { day: 'numeric', month: 'short', year: 'numeric' };
    const locale = 'id-ID';
    if (!start && !end) return 'Segera';
    if (!end) return new Date(start).toLocaleDateString(locale, opts);
    if (!start) return `s/d ${new Date(end).toLocaleDateString(locale, opts)}`;
    return `${new Date(start).toLocaleDateString(locale, opts)} – ${new Date(end).toLocaleDateString(locale, opts)}`;
}

function escHtml(str) {
    return String(str || '').replace(/&/g,'&amp;').replace(/</g,'&lt;').replace(/>/g,'&gt;').replace(/"/g,'&quot;');
}

/* ══════════════════════════════════════════
   EXPORT & SHARE
══════════════════════════════════════════ */
function downloadBrosur() {
    if (!state.generatedDataUrl) {
        showToast('Generate brosur terlebih dahulu.');
        return;
    }
    const a = document.createElement('a');
    const now = new Date();
    const ts = `${now.getFullYear()}${String(now.getMonth()+1).padStart(2,'0')}${String(now.getDate()).padStart(2,'0')}`;
    a.download = `brosur-gosembako-${state.template}-${ts}.png`;
    a.href = state.generatedDataUrl;
    a.click();
    showToast('Brosur berhasil didownload! 📥');
}

function shareWhatsApp() {
    if (!state.generatedDataUrl) {
        showToast('Generate brosur terlebih dahulu.');
        return;
    }
    // Download first, then open WA
    downloadBrosur();
    const waNum = state.waNumber.replace(/[^0-9]/g, '');
    const msg = encodeURIComponent(
        `🛒 *Promo GoSembako*\n\n` +
        `${state.ctaText}\n\n` +
        `📅 ${formatDateRange(state.promoStart, state.promoEnd)}\n` +
        `📱 ${state.waNumber}\n` +
        `🌐 paketsembako.com`
    );
    setTimeout(() => {
        window.open(`https://wa.me/?text=${msg}`, '_blank');
    }, 600);
}

/* ══════════════════════════════════════════
   TOAST
══════════════════════════════════════════ */
function showToast(msg, duration = 2800) {
    const el = document.getElementById('toast');
    if (!el) return;
    el.textContent = msg;
    el.classList.add('show');
    setTimeout(() => el.classList.remove('show'), duration);
}
