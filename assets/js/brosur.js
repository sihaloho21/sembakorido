/**
 * brosur.js – GoSembako Brosur Generator
 * PIN auth · fetch produk dari GAS API · render Canvas (featured/grid4/grid6) · export PNG · share WA
 */

'use strict';

/* ══════════════════════════════════════════
   CONSTANTS & STATE
══════════════════════════════════════════ */
const BROSUR_PIN_KEY = 'gosembako_brosur_pin_ok';
const BROSUR_DRAFTS_KEY = 'gosembako_brosur_drafts'; // localStorage key untuk draft list
const BROSUR_MAX_DRAFTS = 10; // maksimal draft tersimpan
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

const TEMPLATE_SLOTS = { featured: 1, grid4: 4, grid6: 6, lottemart: 4 };
const CANVAS_SIZE_LOTTEMART = { w: 1080, h: 1527 }; // A4 portrait ratio

/* Koleksi stiker preset */
const STICKER_PRESETS = [
    // ─ Badge Diskon ─
    { id: 'disc10',  type: 'badge-circle', label: 'DISKON\n10%',  bg: '#ef4444', fg: '#fff', size: 'md' },
    { id: 'disc20',  type: 'badge-circle', label: 'DISKON\n20%',  bg: '#ef4444', fg: '#fff', size: 'md' },
    { id: 'disc30',  type: 'badge-circle', label: 'DISKON\n30%',  bg: '#ef4444', fg: '#fff', size: 'md' },
    { id: 'disc50',  type: 'badge-circle', label: 'DISKON\n50%',  bg: '#dc2626', fg: '#fff', size: 'lg' },
    { id: 'disc75',  type: 'badge-circle', label: 'DISKON\n75%',  bg: '#b91c1c', fg: '#fff', size: 'lg' },
    // ─ Banner Teks ─
    { id: 'flash',   type: 'banner',       label: '⚡ FLASH SALE!',    bg: '#f97316', fg: '#fff' },
    { id: 'free',    type: 'banner',       label: '🎁 GRATIS ONGKIR',   bg: '#16a34a', fg: '#fff' },
    { id: 'limited', type: 'banner',       label: '⏰ STOK TERBATAS',  bg: '#dc2626', fg: '#fff' },
    { id: 'new',     type: 'banner',       label: '✨ PRODUK BARU',    bg: '#7c3aed', fg: '#fff' },
    { id: 'buy2',    type: 'banner',       label: '📦 BELI 2 GRATIS 1', bg: '#0369a1', fg: '#fff' },
    { id: 'best',    type: 'banner',       label: '🏆 BEST SELLER',    bg: '#d97706', fg: '#fff' },
    { id: 'hot',     type: 'banner',       label: '🔥 HOT PROMO',      bg: '#dc2626', fg: '#fff' },
    // ─ Stempel / Stamp ─
    { id: 'stamp_ori',   type: 'stamp', label: 'ORIGINAL',    bg: '#16a34a', fg: '#fff' },
    { id: 'stamp_fresh', type: 'stamp', label: 'FRESH',       bg: '#0369a1', fg: '#fff' },
    { id: 'stamp_halal', type: 'stamp', label: 'HALAL',       bg: '#16a34a', fg: '#fff' },
    { id: 'stamp_sale',  type: 'stamp', label: 'ON SALE',     bg: '#dc2626', fg: '#fff' },
    // ─ Pita Sudut ─
    { id: 'ribbon_new',  type: 'ribbon', label: 'BARU',   bg: '#7c3aed', fg: '#fff', corner: 'tr' },
    { id: 'ribbon_hot',  type: 'ribbon', label: 'HOT',    bg: '#ef4444', fg: '#fff', corner: 'tr' },
    { id: 'ribbon_sale', type: 'ribbon', label: 'SALE',   bg: '#f97316', fg: '#fff', corner: 'tr' },
];

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
    activeStickers: [],    // array of { presetId, pos } — pos: 'tl','tc','tr','bl','bc','br','c'
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
    document.getElementById('app-screen').style.display = 'block';
    loadProducts();
    // Update badge draft saat app pertama kali tampil
    setTimeout(() => { updateDraftBadge(); renderStickerUI(); }, 100);
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
        state.products = arr.map((p, i) => normalizeProduct(p, i)).filter(p => p.nama);
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

function createSlug(text) {
    if (!text) return '';
    return text.toLowerCase()
        .replace(/[^\w\s-]/g, '')
        .trim()
        .replace(/[-\s]+/g, '-');
}

function normalizeProduct(p, index) {
    const harga = parseInt(p.harga) || 0;
    const hargaCoret = parseInt(p.harga_coret || p.hargaCoret) || 0;
    const gambarRaw = (p.gambar || p.foto || p.image || '').split(',')[0].trim();
    const nama = (p.nama || p.name || '').trim();
    // Generate id yang selalu unik — sama persis dengan ensureProductId di script.js
    const baseId = p.id || p.sku || p.slug || createSlug(nama) || 'product';
    const needsSuffix = !(p.id || p.sku);
    const uid = needsSuffix ? `${baseId}-${index}` : String(baseId);
    return {
        id: uid,
        nama,
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
             data-prod-id="${escHtml(p.id)}">
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

    // Event delegation — aman dari karakter khusus di ID
    wrap.querySelectorAll('.product-item[data-prod-id]').forEach(el => {
        el.addEventListener('click', () => {
            const id = el.dataset.prodId;
            if (id) toggleProduct(id);
        });
    });
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
                    <input type="text" class="field-input" id="img-url-${i}"
                           placeholder="${escHtml(p.gambar || 'https://...')}"
                           value="${escHtml(p._gambar || '')}"
                           oninput="updateField(${i},'_gambar',this.value)">
                </div>
            </div>

            <div class="field-row full">
                <div>
                    <div class="field-label">Upload Gambar Manual</div>
                    <div class="upload-area" id="upload-area-${i}" onclick="document.getElementById('img-upload-${i}').click()">
                        <input type="file" id="img-upload-${i}" accept="image/*" style="display:none"
                               onchange="handleImageUpload(${i}, this)">
                        ${p._gambarDataUrl
                            ? `<img src="${escHtml(p._gambarDataUrl)}" style="max-height:80px;border-radius:8px;object-fit:contain;">`
                            : `<div class="upload-placeholder">
                                <svg width="28" height="28" fill="none" stroke="#94a3b8" viewBox="0 0 24 24"><path stroke-linecap="round" stroke-linejoin="round" stroke-width="1.5" d="M4 16l4.586-4.586a2 2 0 012.828 0L16 16m-2-2l1.586-1.586a2 2 0 012.828 0L20 14m-6-6h.01M6 20h12a2 2 0 002-2V6a2 2 0 00-2-2H6a2 2 0 00-2 2v12a2 2 0 002 2z"/></svg>
                                <span>Klik untuk upload gambar</span>
                                <span style="font-size:0.7rem;color:#94a3b8;">JPG, PNG, WEBP (maks. 5MB)</span>
                               </div>`
                        }
                    </div>
                </div>
            </div>
        </div>`;
    }).join('');
}

function handleImageUpload(idx, input) {
    const file = input.files[0];
    if (!file) return;
    if (file.size > 5 * 1024 * 1024) {
        showToast('Ukuran gambar maksimal 5MB.');
        return;
    }
    const reader = new FileReader();
    reader.onload = (e) => {
        if (state.selected[idx]) {
            state.selected[idx]._gambarDataUrl = e.target.result;
            // Jika tidak ada URL override, gunakan dataUrl sebagai gambar
            if (!state.selected[idx]._gambar) {
                state.selected[idx]._gambar = e.target.result;
            }
            renderSelectedProducts();
            schedulePreview();
            showToast('Gambar berhasil diupload! 📸');
        }
    };
    reader.readAsDataURL(file);
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
    [1,2,3,4].forEach(i => {
        const el = document.getElementById(`step-${i}`);
        if (el) el.style.display = i === n ? 'block' : 'none';
    });
    // Update step indicators
    document.querySelectorAll('.step').forEach(s => {
        const sn = parseInt(s.dataset.step);
        s.classList.toggle('active', sn === n);
        s.classList.toggle('done', sn < n);
    });
    currentStep = n;
    // Render stiker UI saat masuk Step 3
    if (n === 3) renderStickerUI();
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
        if (previewWrap) { previewWrap.classList.add('portrait'); previewWrap.classList.remove('lottemart'); }
    } else if (t === 'lottemart') {
        if (sizeLabel) sizeLabel.textContent = '1080×1527 px';
        if (previewWrap) { previewWrap.classList.add('portrait'); previewWrap.classList.add('lottemart'); }
    } else {
        if (sizeLabel) sizeLabel.textContent = '1080×1080 px';
        if (previewWrap) { previewWrap.classList.remove('portrait'); previewWrap.classList.remove('lottemart'); }
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
    const isLottemart = state.template === 'lottemart';
    const isPortrait = state.template === 'grid6';
    if (isLottemart) {
        await drawLotteMart(canvas, highRes);
        return;
    }
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

    // ── Stiker overlay ──
    drawStickers(ctx, W, H);

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
   LOTTE MART STYLE TEMPLATE
══════════════════════════════════════════ */
async function drawLotteMart(canvas, highRes) {
    const W = CANVAS_SIZE_LOTTEMART.w;
    const H = CANVAS_SIZE_LOTTEMART.h;
    const scale = highRes ? 1 : 0.35;
    canvas.width = W * scale;
    canvas.height = H * scale;
    const ctx = canvas.getContext('2d');
    ctx.scale(scale, scale);

    const theme = THEMES[state.theme] || THEMES['green-blue'];
    const accentColor = theme.from;
    const accentColor2 = theme.to;

    // ── Background: putih/krem seperti Lotte Mart ──
    ctx.fillStyle = '#f5f0e8';
    ctx.fillRect(0, 0, W, H);

    // ── HEADER SECTION ──
    const headerH = 220;
    // Header background gradient
    const hGrad = ctx.createLinearGradient(0, 0, W, headerH);
    hGrad.addColorStop(0, accentColor);
    hGrad.addColorStop(1, accentColor2);
    ctx.fillStyle = hGrad;
    ctx.fillRect(0, 0, W, headerH);

    // Logo GoSembako (kiri)
    ctx.fillStyle = '#ffffff';
    ctx.font = 'bold 52px -apple-system, Arial, sans-serif';
    ctx.textAlign = 'left';
    ctx.textBaseline = 'middle';
    ctx.fillText('🛒 GoSembako', 48, 72);

    // Tagline (kiri bawah logo)
    ctx.font = '400 26px -apple-system, Arial, sans-serif';
    ctx.fillStyle = 'rgba(255,255,255,0.85)';
    ctx.fillText('Belanja Hemat, Kualitas Terjamin', 48, 112);

    // Tanggal promo (kiri)
    ctx.font = '600 24px -apple-system, Arial, sans-serif';
    ctx.fillStyle = 'rgba(255,255,255,0.9)';
    const dateStr = formatDateRange(state.promoStart, state.promoEnd);
    ctx.fillText(`Periode: ${dateStr}`, 48, 150);

    // WA number (kiri)
    ctx.font = '600 24px -apple-system, Arial, sans-serif';
    ctx.fillStyle = 'rgba(255,255,255,0.9)';
    ctx.fillText(`📱 ${state.waNumber}`, 48, 185);

    // Dekorasi kanan atas: teks promo besar miring
    ctx.save();
    ctx.translate(W - 20, 20);
    ctx.rotate(-0.08);
    const promoLines = ['HEMAT', 'LEBIH', 'BANYAK!'];
    const promoColors = ['#ffffff', 'rgba(255,255,255,0.85)', 'rgba(255,255,255,0.7)'];
    const promoSizes = [72, 58, 48];
    let py = 30;
    for (let i = 0; i < promoLines.length; i++) {
        ctx.fillStyle = promoColors[i];
        ctx.font = `900 ${promoSizes[i]}px -apple-system, Arial, sans-serif`;
        ctx.textAlign = 'right';
        ctx.textBaseline = 'top';
        // Background strip
        const tw = ctx.measureText(promoLines[i]).width;
        ctx.fillStyle = 'rgba(0,0,0,0.15)';
        ctx.fillRect(-tw - 20, py - 4, tw + 20, promoSizes[i] + 8);
        ctx.fillStyle = promoColors[i];
        ctx.fillText(promoLines[i], -10, py);
        py += promoSizes[i] + 10;
    }
    ctx.restore();

    // ── PROMO BANNER STRIP ──
    const bannerY = headerH;
    const bannerH = 72;
    ctx.fillStyle = '#1a1a1a';
    ctx.fillRect(0, bannerY, W, bannerH);
    // Ikon kiri
    ctx.fillStyle = accentColor;
    ctx.fillRect(0, bannerY, 120, bannerH);
    ctx.fillStyle = '#ffffff';
    ctx.font = 'bold 32px -apple-system, Arial, sans-serif';
    ctx.textAlign = 'center';
    ctx.textBaseline = 'middle';
    ctx.fillText('🎁', 60, bannerY + bannerH / 2);
    // Teks banner
    ctx.fillStyle = '#ffffff';
    ctx.font = 'bold 28px -apple-system, Arial, sans-serif';
    ctx.textAlign = 'left';
    ctx.fillText('GoSembako Reward Point  •  HEMAT LEBIH BANYAK!', 140, bannerY + bannerH / 2);

    // ── PRODUCT GRID 2×2 ──
    const gridY = bannerY + bannerH + 28;
    const gridPad = 32;
    const gap = 20;
    const cols = 2, rows = 2;
    const cellW = (W - gridPad * 2 - gap * (cols - 1)) / cols;
    const cellH = 480;

    for (let r = 0; r < rows; r++) {
        for (let c = 0; c < cols; c++) {
            const idx = r * cols + c;
            const prod = state.selected[idx];
            const cx = gridPad + c * (cellW + gap);
            const cy = gridY + r * (cellH + gap);
            await drawLotteMartCell(ctx, prod, cx, cy, cellW, cellH, theme);
        }
    }

    // ── CTA FOOTER ──
    const footerY = gridY + rows * (cellH + gap) - gap + 24;
    const footerH = 110;
    const fGrad = ctx.createLinearGradient(0, footerY, W, footerY + footerH);
    fGrad.addColorStop(0, accentColor);
    fGrad.addColorStop(1, accentColor2);
    ctx.fillStyle = fGrad;
    ctx.fillRect(0, footerY, W, footerH);

    // CTA text
    ctx.fillStyle = '#ffffff';
    ctx.font = 'bold 38px -apple-system, Arial, sans-serif';
    ctx.textAlign = 'center';
    ctx.textBaseline = 'middle';
    ctx.fillText(state.ctaText, W / 2, footerY + footerH / 2);

    // Stiker overlay
    drawStickers(ctx, W, H);

    // Watermark
    if (state.showWatermark) {
        drawWatermark(ctx, W, H, state.watermarkPos, theme);
    }
}

async function drawLotteMartCell(ctx, prod, x, y, w, h, theme) {
    // Card background: putih
    ctx.save();
    ctx.shadowColor = 'rgba(0,0,0,0.12)';
    ctx.shadowBlur = 16;
    ctx.shadowOffsetY = 4;
    ctx.fillStyle = '#ffffff';
    roundRect(ctx, x, y, w, h, 20);
    ctx.fill();
    ctx.restore();

    if (!prod) {
        ctx.fillStyle = '#e2e8f0';
        ctx.font = '500 26px -apple-system, Arial, sans-serif';
        ctx.textAlign = 'center';
        ctx.textBaseline = 'middle';
        ctx.fillText('Slot Kosong', x + w / 2, y + h / 2);
        return;
    }

    const eff = effectiveProd(prod);
    const imgH = Math.round(h * 0.52);
    const pad = 18;

    // ── Gambar produk (atas) ──
    await drawProductImage(ctx, eff.gambar, x + pad, y + pad, w - pad * 2, imgH - pad, 14);

    // ── Badge pojok kiri atas ──
    if (eff.badge) {
        const bText = eff.badge.toUpperCase();
        ctx.font = 'bold 20px -apple-system, Arial, sans-serif';
        const bW = ctx.measureText(bText).width + 24;
        ctx.fillStyle = '#ef4444';
        roundRect(ctx, x + pad, y + pad, bW, 34, 8);
        ctx.fill();
        ctx.fillStyle = '#ffffff';
        ctx.textAlign = 'left';
        ctx.textBaseline = 'middle';
        ctx.fillText(bText, x + pad + 12, y + pad + 17);
    }

    // ── Min order badge (pojok kanan atas) — gaya lingkaran Lotte Mart ──
    if (eff.minOrder > 1) {
        const cx2 = x + w - pad - 36;
        const cy2 = y + pad + 36;
        ctx.save();
        ctx.fillStyle = theme.from;
        ctx.beginPath();
        ctx.arc(cx2, cy2, 36, 0, Math.PI * 2);
        ctx.fill();
        ctx.fillStyle = '#ffffff';
        ctx.font = 'bold 14px -apple-system, Arial, sans-serif';
        ctx.textAlign = 'center';
        ctx.textBaseline = 'middle';
        ctx.fillText('Min', cx2, cy2 - 10);
        ctx.font = 'bold 24px -apple-system, Arial, sans-serif';
        ctx.fillText(eff.minOrder, cx2, cy2 + 10);
        ctx.restore();
    }

    // ── Info area (bawah) ──
    let curY = y + imgH + 10;

    // Nama produk
    ctx.fillStyle = '#1e293b';
    ctx.font = 'bold 28px -apple-system, Arial, sans-serif';
    ctx.textAlign = 'left';
    ctx.textBaseline = 'top';
    curY = drawWrappedText(ctx, eff.nama.toUpperCase(), x + pad, curY, w - pad * 2, 34, 2);
    curY += 6;

    // Deskripsi singkat
    if (eff.deskripsi) {
        ctx.fillStyle = '#64748b';
        ctx.font = '400 21px -apple-system, Arial, sans-serif';
        curY = drawWrappedText(ctx, eff.deskripsi, x + pad, curY, w - pad * 2, 27, 1);
        curY += 8;
    }

    // Harga coret
    if (eff.hargaCoret > eff.harga) {
        const coretStr = `Rp ${eff.hargaCoret.toLocaleString('id-ID')}`;
        ctx.fillStyle = '#94a3b8';
        ctx.font = '400 22px -apple-system, Arial, sans-serif';
        ctx.fillText(coretStr, x + pad, curY);
        const tw = ctx.measureText(coretStr).width;
        ctx.strokeStyle = '#94a3b8';
        ctx.lineWidth = 1.5;
        ctx.beginPath();
        ctx.moveTo(x + pad, curY + 11);
        ctx.lineTo(x + pad + tw, curY + 11);
        ctx.stroke();
        curY += 30;
    }

    // Harga promo — besar dan menonjol
    ctx.fillStyle = theme.from;
    ctx.font = 'bold 42px -apple-system, Arial, sans-serif';
    ctx.fillText(`Rp ${eff.harga.toLocaleString('id-ID')}`, x + pad, curY);
    curY += 52;

    // Reward poin + min order row
    ctx.fillStyle = '#64748b';
    ctx.font = '500 20px -apple-system, Arial, sans-serif';
    const infoRow = [];
    if (eff.rewardPoin > 0) infoRow.push(`⭐ +${eff.rewardPoin} Poin`);
    if (eff.minOrder > 0) infoRow.push(`📦 Min. ${eff.minOrder} pcs`);
    if (infoRow.length) ctx.fillText(infoRow.join('   '), x + pad, curY);
}

/* ══════════════════════════════════════════
   HELPERS
══════════════════════════════════════════ */
function effectiveProd(p) {
    return {
        nama:       (p._nama || p.nama || '').trim(),
        harga:      parseInt(p._harga) || p.harga || 0,
        hargaCoret: parseInt(p._hargaCoret) || p.hargaCoret || 0,
        gambar:     (p._gambarDataUrl || p._gambar || p.gambar || '').trim(),
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
   STICKER ENGINE
══════════════════════════════════════════ */

/**
 * Render semua stiker aktif di atas canvas.
 * Dipanggil setelah semua elemen brosur selesai digambar.
 */
function drawStickers(ctx, W, H) {
    if (!state.activeStickers || state.activeStickers.length === 0) return;

    state.activeStickers.forEach(({ presetId, pos }) => {
        const preset = STICKER_PRESETS.find(s => s.id === presetId);
        if (!preset) return;

        // Hitung koordinat berdasarkan pos
        const { x, y } = stickerPosition(pos, W, H, preset);

        ctx.save();
        if (preset.type === 'badge-circle') drawStickerBadgeCircle(ctx, preset, x, y, W);
        else if (preset.type === 'banner')  drawStickerBanner(ctx, preset, x, y, W, H);
        else if (preset.type === 'stamp')   drawStickerStamp(ctx, preset, x, y, W);
        else if (preset.type === 'ribbon')  drawStickerRibbon(ctx, preset, W, H);
        ctx.restore();
    });
}

/** Hitung koordinat stiker berdasarkan posisi kode */
function stickerPosition(pos, W, H, preset) {
    const pad = 40;
    const map = {
        'tl': { x: pad,          y: pad },
        'tc': { x: W / 2,        y: pad },
        'tr': { x: W - pad,      y: pad },
        'ml': { x: pad,          y: H / 2 },
        'mc': { x: W / 2,        y: H / 2 },
        'mr': { x: W - pad,      y: H / 2 },
        'bl': { x: pad,          y: H - pad },
        'bc': { x: W / 2,        y: H - pad },
        'br': { x: W - pad,      y: H - pad },
    };
    return map[pos] || map['tr'];
}

/** Badge lingkaran (gaya diskon) */
function drawStickerBadgeCircle(ctx, preset, cx, cy, W) {
    const r = preset.size === 'lg' ? Math.round(W * 0.1) : Math.round(W * 0.08);
    // Shadow
    ctx.shadowColor = 'rgba(0,0,0,0.3)';
    ctx.shadowBlur = 12;
    ctx.shadowOffsetY = 4;
    // Lingkaran utama
    ctx.beginPath();
    ctx.arc(cx, cy, r, 0, Math.PI * 2);
    ctx.fillStyle = preset.bg;
    ctx.fill();
    // Border putih
    ctx.shadowBlur = 0;
    ctx.strokeStyle = 'rgba(255,255,255,0.7)';
    ctx.lineWidth = 4;
    ctx.stroke();
    // Teks (bisa 2 baris)
    const lines = preset.label.split('\n');
    ctx.fillStyle = preset.fg;
    ctx.textAlign = 'center';
    ctx.textBaseline = 'middle';
    if (lines.length === 2) {
        const fs1 = Math.round(r * 0.42);
        const fs2 = Math.round(r * 0.55);
        ctx.font = `700 ${fs1}px -apple-system, Arial, sans-serif`;
        ctx.fillText(lines[0], cx, cy - r * 0.22);
        ctx.font = `900 ${fs2}px -apple-system, Arial, sans-serif`;
        ctx.fillText(lines[1], cx, cy + r * 0.3);
    } else {
        ctx.font = `900 ${Math.round(r * 0.5)}px -apple-system, Arial, sans-serif`;
        ctx.fillText(preset.label, cx, cy);
    }
}

/** Banner teks horizontal */
function drawStickerBanner(ctx, preset, cx, cy, W, H) {
    const fs = Math.round(W * 0.038);
    ctx.font = `800 ${fs}px -apple-system, Arial, sans-serif`;
    const tw = ctx.measureText(preset.label).width;
    const bw = tw + fs * 2;
    const bh = fs * 1.8;
    const bx = cx - bw / 2;
    const by = cy - bh / 2;
    // Shadow
    ctx.shadowColor = 'rgba(0,0,0,0.3)';
    ctx.shadowBlur = 10;
    ctx.shadowOffsetY = 3;
    // Background pill
    roundRect(ctx, bx, by, bw, bh, bh / 2);
    ctx.fillStyle = preset.bg;
    ctx.fill();
    ctx.shadowBlur = 0;
    // Garis putih atas-bawah
    ctx.strokeStyle = 'rgba(255,255,255,0.5)';
    ctx.lineWidth = 2.5;
    ctx.stroke();
    // Teks
    ctx.fillStyle = preset.fg;
    ctx.textAlign = 'center';
    ctx.textBaseline = 'middle';
    ctx.fillText(preset.label, cx, cy);
}

/** Stempel bulat dengan border dashed */
function drawStickerStamp(ctx, preset, cx, cy, W) {
    const r = Math.round(W * 0.09);
    const fs = Math.round(r * 0.48);
    // Shadow
    ctx.shadowColor = 'rgba(0,0,0,0.25)';
    ctx.shadowBlur = 10;
    // Lingkaran luar (dashed border effect)
    ctx.beginPath();
    ctx.arc(cx, cy, r + 8, 0, Math.PI * 2);
    ctx.strokeStyle = preset.bg;
    ctx.lineWidth = 5;
    ctx.setLineDash([12, 8]);
    ctx.stroke();
    ctx.setLineDash([]);
    // Lingkaran dalam
    ctx.shadowBlur = 0;
    ctx.beginPath();
    ctx.arc(cx, cy, r, 0, Math.PI * 2);
    ctx.fillStyle = preset.bg;
    ctx.fill();
    // Teks
    ctx.fillStyle = preset.fg;
    ctx.font = `900 ${fs}px -apple-system, Arial, sans-serif`;
    ctx.textAlign = 'center';
    ctx.textBaseline = 'middle';
    ctx.fillText(preset.label, cx, cy);
    // Ring dalam
    ctx.beginPath();
    ctx.arc(cx, cy, r - 10, 0, Math.PI * 2);
    ctx.strokeStyle = 'rgba(255,255,255,0.4)';
    ctx.lineWidth = 2;
    ctx.stroke();
}

/** Pita sudut (ribbon) */
function drawStickerRibbon(ctx, preset, W, H) {
    const size = Math.round(W * 0.22);
    ctx.save();
    // Pojok kanan atas
    ctx.translate(W, 0);
    ctx.rotate(Math.PI / 4);
    const bh = Math.round(W * 0.065);
    ctx.fillStyle = preset.bg;
    ctx.fillRect(-size * 0.7, size * 0.28, size * 1.4, bh);
    ctx.fillStyle = preset.fg;
    ctx.font = `800 ${Math.round(bh * 0.65)}px -apple-system, Arial, sans-serif`;
    ctx.textAlign = 'center';
    ctx.textBaseline = 'middle';
    ctx.fillText(preset.label, 0, size * 0.28 + bh / 2);
    ctx.restore();
}

/** Toggle stiker aktif/nonaktif */
function toggleSticker(presetId, pos) {
    const idx = state.activeStickers.findIndex(s => s.presetId === presetId);
    if (idx >= 0) {
        // Sudah aktif — hapus
        state.activeStickers.splice(idx, 1);
    } else {
        // Tambah stiker baru
        state.activeStickers.push({ presetId, pos: pos || 'tr' });
    }
    renderStickerUI();
    schedulePreview();
}

/** Update posisi stiker yang sudah aktif */
function updateStickerPos(presetId, newPos) {
    const s = state.activeStickers.find(s => s.presetId === presetId);
    if (s) { s.pos = newPos; schedulePreview(); }
}

/** Render UI daftar stiker di panel kustomisasi */
function renderStickerUI() {
    const container = document.getElementById('sticker-grid');
    if (!container) return;

    const groups = [
        { label: 'Badge Diskon', types: ['badge-circle'] },
        { label: 'Banner Teks', types: ['banner'] },
        { label: 'Stempel',     types: ['stamp'] },
        { label: 'Pita Sudut',  types: ['ribbon'] },
    ];

    const posOptions = [
        { v: 'tl', l: '↖ Kiri Atas' }, { v: 'tc', l: '↑ Tengah Atas' }, { v: 'tr', l: '↗ Kanan Atas' },
        { v: 'ml', l: '← Kiri Tengah' }, { v: 'mc', l: '⊙ Tengah' }, { v: 'mr', l: '→ Kanan Tengah' },
        { v: 'bl', l: '↙ Kiri Bawah' }, { v: 'bc', l: '↓ Tengah Bawah' }, { v: 'br', l: '↘ Kanan Bawah' },
    ];

    container.innerHTML = groups.map(g => {
        const presets = STICKER_PRESETS.filter(p => g.types.includes(p.type));
        return `
        <div class="sticker-group">
            <div class="sticker-group-label">${g.label}</div>
            <div class="sticker-chips">
                ${presets.map(p => {
                    const active = state.activeStickers.find(s => s.presetId === p.id);
                    const activePos = active ? active.pos : 'tr';
                    return `
                    <div class="sticker-chip ${active ? 'active' : ''}" data-id="${p.id}">
                        <div class="sticker-chip-main" onclick="toggleSticker('${p.id}', '${activePos}')" style="background:${p.bg};">
                            <span style="color:${p.fg};font-size:0.72rem;font-weight:700;text-align:center;line-height:1.2;">${p.label.replace('\n','<br>')}</span>
                        </div>
                        ${active ? `
                        <select class="sticker-pos-select" onchange="updateStickerPos('${p.id}', this.value)" title="Posisi stiker">
                            ${posOptions.map(o => `<option value="${o.v}" ${activePos === o.v ? 'selected' : ''}>${o.l}</option>`).join('')}
                        </select>` : ''}
                    </div>`;
                }).join('')}
            </div>
        </div>`;
    }).join('');
}

/* ══════════════════════════════════════════
   DRAFT MANAGEMENT
══════════════════════════════════════════ */

/** Ambil semua draft dari localStorage */
function getAllDrafts() {
    try {
        return JSON.parse(localStorage.getItem(BROSUR_DRAFTS_KEY) || '[]');
    } catch { return []; }
}

/** Simpan draft baru atau update yang sudah ada */
function saveDraft(customName = '') {
    // Sinkronkan state dari form
    schedulePreview();

    const name = customName.trim() ||
        `Draft ${new Date().toLocaleDateString('id-ID', { day:'2-digit', month:'short', year:'numeric' })} ${new Date().toLocaleTimeString('id-ID', { hour:'2-digit', minute:'2-digit' })}`;

    // Buat snapshot state yang bisa di-serialize
    const snapshot = {
        id: Date.now().toString(),
        name,
        savedAt: new Date().toISOString(),
        template: state.template,
        theme: state.theme,
        promoStart: state.promoStart,
        promoEnd: state.promoEnd,
        ctaText: state.ctaText,
        waNumber: state.waNumber,
        showWatermark: state.showWatermark,
        watermarkPos: state.watermarkPos,
        activeStickers: state.activeStickers || [],
        // Simpan produk terpilih beserta semua override
        // Catatan: _gambarDataUrl (base64) bisa besar, simpan hanya jika ada
        selected: state.selected.map(p => ({
            id: p.id,
            nama: p.nama,
            harga: p.harga,
            hargaCoret: p.hargaCoret,
            gambar: p.gambar,
            deskripsi: p.deskripsi,
            kategori: p.kategori,
            badge: p.badge,
            minOrder: p.minOrder,
            rewardPoin: p.rewardPoin,
            _nama: p._nama || '',
            _harga: p._harga || '',
            _hargaCoret: p._hargaCoret || '',
            _deskripsi: p._deskripsi || '',
            _badge: p._badge || '',
            _minOrder: p._minOrder || '',
            _rewardPoin: p._rewardPoin || '',
            _gambar: p._gambar || '',
            _gambarDataUrl: p._gambarDataUrl || '' // base64 jika ada upload manual
        }))
    };

    const drafts = getAllDrafts();

    // Cek apakah sudah penuh
    if (drafts.length >= BROSUR_MAX_DRAFTS) {
        // Hapus draft terlama
        drafts.sort((a, b) => new Date(a.savedAt) - new Date(b.savedAt));
        drafts.shift();
    }

    drafts.push(snapshot);

    try {
        localStorage.setItem(BROSUR_DRAFTS_KEY, JSON.stringify(drafts));
        showToast(`Draft "${name}" berhasil disimpan! 💾`);
        renderDraftList();
        // Tutup modal setelah simpan
        closeDraftModal();
    } catch (e) {
        // localStorage mungkin penuh karena base64 gambar
        // Coba simpan tanpa gambar upload
        const snapshotNoImg = { ...snapshot, selected: snapshot.selected.map(p => ({ ...p, _gambarDataUrl: '' })) };
        const draftsNoImg = getAllDrafts();
        if (draftsNoImg.length >= BROSUR_MAX_DRAFTS) { draftsNoImg.sort((a,b) => new Date(a.savedAt)-new Date(b.savedAt)); draftsNoImg.shift(); }
        draftsNoImg.push(snapshotNoImg);
        try {
            localStorage.setItem(BROSUR_DRAFTS_KEY, JSON.stringify(draftsNoImg));
            showToast(`Draft disimpan (tanpa gambar upload karena storage penuh). 💾`);
            renderDraftList();
            closeDraftModal();
        } catch {
            showToast('Gagal menyimpan draft. Storage penuh.', 3500);
        }
    }
}

/** Muat draft ke state */
function loadDraft(id) {
    const drafts = getAllDrafts();
    const draft = drafts.find(d => d.id === id);
    if (!draft) { showToast('Draft tidak ditemukan.'); return; }

    // Restore state
    state.template  = draft.template  || 'featured';
    state.theme     = draft.theme     || 'green-blue';
    state.promoStart = draft.promoStart || '';
    state.promoEnd   = draft.promoEnd   || '';
    state.ctaText    = draft.ctaText    || '';
    state.waNumber   = draft.waNumber   || '';
    state.showWatermark  = draft.showWatermark !== false;
    state.watermarkPos   = draft.watermarkPos  || 'br';
    state.activeStickers = draft.activeStickers || [];
    state.selected       = draft.selected  || [];

    // Update UI form
    const setVal = (id, val) => { const el = document.getElementById(id); if (el) el.value = val; };
    setVal('promo-date-start', state.promoStart);
    setVal('promo-date-end',   state.promoEnd);
    setVal('cta-text',         state.ctaText);
    setVal('wa-number',        state.waNumber);
    const wmEl = document.getElementById('show-watermark');
    if (wmEl) wmEl.checked = state.showWatermark;
    const wmPos = document.getElementById('watermark-pos');
    if (wmPos) wmPos.value = state.watermarkPos;

    // Update template selection UI
    selectTemplate(state.template);

    // Update theme selection UI
    document.querySelectorAll('.color-swatch').forEach(s => {
        s.classList.toggle('selected', s.dataset.theme === state.theme);
    });

    // Re-render produk terpilih
    updateSlotCounter();
    renderSelectedProducts();
    renderStickerUI();
    schedulePreview();

    closeDraftModal();
    showToast(`Draft "${draft.name}" berhasil dimuat! 📂`);

    // Navigasi ke step yang sesuai
    if (state.selected.length > 0) {
        goToStep(2);
    } else {
        goToStep(1);
    }
}

/** Hapus draft */
function deleteDraft(id) {
    const drafts = getAllDrafts().filter(d => d.id !== id);
    localStorage.setItem(BROSUR_DRAFTS_KEY, JSON.stringify(drafts));
    renderDraftList();
    showToast('Draft dihapus.');
}

/** Update angka badge di tombol Draft header */
function updateDraftBadge() {
    const badge = document.getElementById('draft-badge');
    if (!badge) return;
    const count = getAllDrafts().length;
    badge.textContent = count;
    badge.dataset.count = count;
    badge.style.display = count > 0 ? 'inline-block' : 'none';
}

/** Render daftar draft di modal */
function renderDraftList() {
    const list = document.getElementById('draft-list');
    const emptyMsg = document.getElementById('draft-empty-msg');
    const countEl = document.getElementById('draft-count');
    if (!list) return;
    updateDraftBadge();

    const drafts = getAllDrafts().sort((a, b) => new Date(b.savedAt) - new Date(a.savedAt));

    if (countEl) countEl.textContent = `${drafts.length}/${BROSUR_MAX_DRAFTS}`;

    if (!drafts.length) {
        list.innerHTML = '';
        if (emptyMsg) emptyMsg.style.display = 'block';
        return;
    }
    if (emptyMsg) emptyMsg.style.display = 'none';

    const templateIcons = { featured: '🌟', grid4: '⊞', grid6: '⊟', lottemart: '📰' };
    const templateNames = { featured: '1 Produk', grid4: 'Grid 4', grid6: 'Grid 6', lottemart: 'Katalog' };
    const themeColors = {
        'green-blue': '#128052', 'red-orange': '#dc2626', 'purple-pink': '#7c3aed',
        'blue-cyan': '#0369a1', 'amber': '#d97706', 'dark': '#1e293b'
    };

    list.innerHTML = drafts.map(d => {
        const savedDate = new Date(d.savedAt).toLocaleDateString('id-ID', { day:'2-digit', month:'short', year:'numeric', hour:'2-digit', minute:'2-digit' });
        const prodCount = (d.selected || []).length;
        const icon = templateIcons[d.template] || '📄';
        const tName = templateNames[d.template] || d.template;
        const color = themeColors[d.theme] || '#128052';
        return `
        <div class="draft-item" data-id="${d.id}">
            <div class="draft-item-left">
                <div class="draft-template-badge" style="background:${color}15;color:${color};border:1px solid ${color}40;">
                    ${icon} ${tName}
                </div>
                <div class="draft-name">${escHtml(d.name)}</div>
                <div class="draft-meta">${savedDate} &bull; ${prodCount} produk</div>
            </div>
            <div class="draft-item-actions">
                <button class="btn-draft-load" onclick="loadDraft('${d.id}')" title="Muat draft ini">
                    <svg width="14" height="14" fill="none" stroke="currentColor" viewBox="0 0 24 24"><path stroke-linecap="round" stroke-linejoin="round" stroke-width="2" d="M4 16v1a3 3 0 003 3h10a3 3 0 003-3v-1m-4-8l-4-4m0 0L8 8m4-4v12"/></svg>
                    Muat
                </button>
                <button class="btn-draft-delete" onclick="deleteDraft('${d.id}')" title="Hapus draft">
                    <svg width="14" height="14" fill="none" stroke="currentColor" viewBox="0 0 24 24"><path stroke-linecap="round" stroke-linejoin="round" stroke-width="2" d="M19 7l-.867 12.142A2 2 0 0116.138 21H7.862a2 2 0 01-1.995-1.858L5 7m5 4v6m4-6v6m1-10V4a1 1 0 00-1-1h-4a1 1 0 00-1 1v3M4 7h16"/></svg>
                </button>
            </div>
        </div>`;
    }).join('');
}

/** Buka modal draft */
function openDraftModal() {
    renderDraftList();
    const modal = document.getElementById('draft-modal');
    if (modal) { modal.style.display = 'flex'; document.body.style.overflow = 'hidden'; }
}

/** Tutup modal draft */
function closeDraftModal() {
    const modal = document.getElementById('draft-modal');
    if (modal) { modal.style.display = 'none'; document.body.style.overflow = ''; }
    // Reset input nama
    const nameInput = document.getElementById('draft-name-input');
    if (nameInput) nameInput.value = '';
}

/** Trigger simpan dengan nama dari input */
function triggerSaveDraft() {
    const nameInput = document.getElementById('draft-name-input');
    const name = nameInput ? nameInput.value.trim() : '';
    saveDraft(name);
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
