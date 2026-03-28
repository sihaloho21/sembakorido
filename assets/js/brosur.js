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

const TEMPLATE_SLOTS = { featured: 1, grid4: 4, grid6: 6, lottemart: 4, story: 3, banner: 3 };
const CANVAS_SIZE_LOTTEMART = { w: 1080, h: 1527 }; // A4 portrait ratio
const CANVAS_SIZE_STORY  = { w: 1080, h: 1920 }; // Instagram Story / Reels
const CANVAS_SIZE_BANNER = { w: 1200, h: 628  }; // Facebook / WA Status landscape

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
    ctaText: 'Pesan Sekarang! Stok Terbatas \uD83D\uDD25',
    waNumber: '0899-3370-200',
    showWatermark: true,
    watermarkPos: 'br',
    activeStickers: [],    // array of { presetId, pos }
    // ── Fitur Baru ──
    logoDataUrl: null,     // base64 logo custom
    bgType: 'gradient',    // 'gradient' | 'solid' | 'pattern' | 'custom'
    bgPattern: 'none',     // preset pattern id
    bgDataUrl: null,       // base64 background custom
    fontFamily: 'default', // 'default' | 'elegant' | 'modern' | 'casual'
    priceEffect: 'none',   // 'none' | 'burst' | 'circle'
    previewSize: 'auto',   // 'auto' | 'mobile' | 'desktop'
    undoStack: [],
    redoStack: [],
    generatedDataUrl: null,
    previewTimer: null,
    // ── Posisi elemen (x,y dalam 0–1 relatif terhadap canvas) ──
    elementPositions: {
        logo:      { x: 0.05, y: 0.05 },
        cta:       { x: 0.5,  y: 0.94 },
        wa:        { x: 0.88, y: 0.05 },
        watermark: { x: 0.92, y: 0.94 },
        // stiker: { [presetId]: { x, y } }
        stickers: {}
    }
};

/* Font mapping untuk canvas */
const FONT_MAP = {
    default: { family: '-apple-system, Arial, sans-serif',  gfont: null,                  label: 'Default (System)' },
    elegant: { family: 'Playfair Display, Georgia, serif',  gfont: 'Playfair+Display:wght@700',  label: 'Elegant (Serif)' },
    modern:  { family: 'Poppins, Helvetica, sans-serif',    gfont: 'Poppins:wght@400;600;700',   label: 'Modern (Poppins)' },
    casual:  { family: 'Nunito, Verdana, sans-serif',       gfont: 'Nunito:wght@400;700;800',    label: 'Casual (Nunito)' },
    bold:    { family: 'Oswald, Impact, sans-serif',        gfont: 'Oswald:wght@500;700',        label: 'Bold (Oswald)' },
};

/* Background pattern presets */
const BG_PATTERNS = [
    { id: 'none',    label: 'Tidak Ada',   icon: '\u2715' },
    { id: 'dots',    label: 'Titik-Titik', icon: '\u25CF' },
    { id: 'grid',    label: 'Grid',        icon: '\u229E' },
    { id: 'wave',    label: 'Gelombang',   icon: '\u223F' },
    { id: 'diamond', label: 'Berlian',     icon: '\u25C6' },
    { id: 'stripe',  label: 'Garis Miring',icon: '\u2571' },
];

let currentStep = 1;

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
    loadGoogleFonts();
    setTimeout(() => {
        updateDraftBadge();
        renderStickerUI();
        renderBgPatternUI();
        updateLogoPreview();
        updateBgPreview();
        updateUndoRedoButtons();
    }, 100);
    // Keyboard shortcuts
    document.addEventListener('keydown', e => {
        if (!state.authed) return;
        if ((e.ctrlKey || e.metaKey) && e.key === 'z' && !e.shiftKey) { e.preventDefault(); undo(); }
        if ((e.ctrlKey || e.metaKey) && (e.key === 'y' || (e.key === 'z' && e.shiftKey))) { e.preventDefault(); redo(); }
    });
}

/** Load semua Google Fonts yang dipakai */
function loadGoogleFonts() {
    Object.values(FONT_MAP).forEach(f => {
        if (!f.gfont) return;
        const id = 'gfont-' + f.gfont.split(':')[0].replace(/\+/g, '-').toLowerCase();
        if (document.getElementById(id)) return;
        const link = document.createElement('link');
        link.id = id;
        link.rel = 'stylesheet';
        link.href = `https://fonts.googleapis.com/css2?family=${f.gfont}&display=swap`;
        document.head.appendChild(link);
    });
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
        <div class="selected-product-card" draggable="true"
             ondragstart="onDragStart(event,${i})"
             ondragover="onDragOver(event)"
             ondrop="onDrop(event,${i})"
             ondragend="onDragEnd(event)">
            <div class="prod-header">
                <span style="cursor:grab;color:#94a3b8;font-size:1rem;padding-right:0.25rem;" title="Drag untuk ubah urutan">☰</span>
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
    // Update preview size label & preview-wrap class
    const sizeLabel  = document.getElementById('preview-size-label');
    const previewWrap = document.getElementById('preview-wrap');
    const sizeMap = {
        featured:  '1080×1080 px',
        grid4:     '1080×1080 px',
        grid6:     '1080×1350 px',
        lottemart: '1080×1527 px',
        story:     '1080×1920 px',
        banner:    '1200×628 px',
    };
    if (sizeLabel) sizeLabel.textContent = sizeMap[t] || '1080×1080 px';
    if (previewWrap) {
        previewWrap.classList.remove('portrait', 'lottemart', 'story', 'banner');
        if (t === 'grid6')     previewWrap.classList.add('portrait');
        if (t === 'lottemart') { previewWrap.classList.add('portrait'); previewWrap.classList.add('lottemart'); }
        if (t === 'story')     previewWrap.classList.add('story');
        if (t === 'banner')    previewWrap.classList.add('banner');
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
    updateDragOverlay();
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
    const isStory     = state.template === 'story';
    const isBanner    = state.template === 'banner';
    const isPortrait  = state.template === 'grid6';
    if (isLottemart) { await drawLotteMart(canvas, highRes); return; }
    if (isStory)     { await drawStory(canvas, highRes);     return; }
    if (isBanner)    { await drawBanner(canvas, highRes);    return; }
    const size = isPortrait ? CANVAS_SIZE_PORTRAIT : CANVAS_SIZE;
    const scale = highRes ? 1 : 0.4; // preview at 40%

    canvas.width = size.w * scale;
    canvas.height = size.h * scale;

    const ctx = canvas.getContext('2d');
    ctx.scale(scale, scale);

    const theme = THEMES[state.theme] || THEMES['green-blue'];
    const W = size.w, H = size.h;

    // ── Background (gradient / solid / pattern / custom) ──
    await drawBackground(ctx, W, H, theme);

    // ── Header bar ──
    const headerH = isPortrait ? 120 : 110;
    ctx.save();
    ctx.globalAlpha = 0.18;
    ctx.fillStyle = '#000000';
    roundRect(ctx, 0, 0, W, headerH, 0);
    ctx.fill();
    ctx.restore();

    // Logo (custom atau teks)
    const ff = (FONT_MAP[state.fontFamily] || FONT_MAP.default).family;
    const logoPos = state.elementPositions.logo || { x: 0.05, y: 0.05 };
    await drawLogoHeaderAt(ctx, W, H, headerH, ff, isPortrait, logoPos);

    // WA number — posisi dari drag
    const waPos = state.elementPositions.wa || { x: 0.88, y: 0.05 };
    ctx.font = `600 ${isPortrait ? 26 : 24}px ${ff}`;
    ctx.textAlign = 'center';
    ctx.fillStyle = 'rgba(255,255,255,0.85)';
    ctx.fillText(`\uD83D\uDCF1 ${state.waNumber}`, waPos.x * W, waPos.y * H + 12);

    // ── Promo date strip ──
    const dateY = headerH;
    const dateH = 52;
    ctx.save();
    ctx.globalAlpha = 0.22;
    ctx.fillStyle = '#000000';
    ctx.fillRect(0, dateY, W, dateH);
    ctx.restore();

    ctx.fillStyle = '#ffffff';
    ctx.font = `700 ${isPortrait ? 26 : 24}px ${ff}`;
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

    // CTA text — posisi dari drag
    const ctaPos = state.elementPositions.cta || { x: 0.5, y: 0.94 };
    ctx.fillStyle = '#ffffff';
    ctx.font = `bold ${isPortrait ? 34 : 32}px ${ff}`;
    ctx.textAlign = 'center';
    ctx.textBaseline = 'middle';
    ctx.fillText(state.ctaText, ctaPos.x * W, ctaPos.y * H);

    // ── Stiker overlay ──
    drawStickers(ctx, W, H);

    // ── Watermark ── posisi dari drag
    if (state.showWatermark) {
        const wmPos = state.elementPositions.watermark || { x: 0.92, y: 0.94 };
        drawWatermarkAt(ctx, W, H, wmPos, theme);
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
   STORY INSTAGRAM TEMPLATE (1080×1920)
══════════════════════════════════════════ */
async function drawStory(canvas, highRes) {
    const W = CANVAS_SIZE_STORY.w, H = CANVAS_SIZE_STORY.h;
    const scale = highRes ? 1 : 0.28; // preview kecil agar muat
    canvas.width  = W * scale;
    canvas.height = H * scale;
    const ctx = canvas.getContext('2d');
    ctx.scale(scale, scale);
    const theme = THEMES[state.theme] || THEMES['green-blue'];

    // ── Background gradient diagonal ──
    const bg = ctx.createLinearGradient(0, 0, W, H);
    bg.addColorStop(0, theme.from);
    bg.addColorStop(0.55, theme.to);
    bg.addColorStop(1, theme.from);
    ctx.fillStyle = bg;
    ctx.fillRect(0, 0, W, H);

    // ── Dekorasi lingkaran besar ──
    ctx.save();
    ctx.globalAlpha = 0.07;
    ctx.fillStyle = '#ffffff';
    ctx.beginPath(); ctx.arc(W * 0.85, H * 0.08, 280, 0, Math.PI * 2); ctx.fill();
    ctx.beginPath(); ctx.arc(W * 0.1,  H * 0.92, 220, 0, Math.PI * 2); ctx.fill();
    ctx.beginPath(); ctx.arc(W * 0.5,  H * 0.5,  480, 0, Math.PI * 2); ctx.fill();
    ctx.restore();

    // ── Header ──
    const hdrH = 130;
    ctx.save(); ctx.globalAlpha = 0.2; ctx.fillStyle = '#000';
    ctx.fillRect(0, 0, W, hdrH); ctx.restore();
    ctx.fillStyle = '#fff';
    ctx.font = 'bold 44px -apple-system, Arial, sans-serif';
    ctx.textAlign = 'left'; ctx.textBaseline = 'middle';
    ctx.fillText('\uD83D\uDED2 GoSembako', 56, hdrH / 2);
    ctx.font = '600 30px -apple-system, Arial, sans-serif';
    ctx.textAlign = 'right'; ctx.fillStyle = 'rgba(255,255,255,0.85)';
    ctx.fillText(`\uD83D\uDCF1 ${state.waNumber}`, W - 56, hdrH / 2);

    // ── Tanggal promo ──
    const dateH = 60;
    ctx.save(); ctx.globalAlpha = 0.22; ctx.fillStyle = '#000';
    ctx.fillRect(0, hdrH, W, dateH); ctx.restore();
    ctx.fillStyle = '#fff';
    ctx.font = '700 28px -apple-system, Arial, sans-serif';
    ctx.textAlign = 'center'; ctx.textBaseline = 'middle';
    ctx.fillText(`\uD83D\uDCC5 Promo: ${formatDateRange(state.promoStart, state.promoEnd)}`, W / 2, hdrH + dateH / 2);

    // ── Judul CTA besar di tengah ──
    const ctaY = hdrH + dateH + 40;
    ctx.fillStyle = '#fff';
    ctx.font = 'bold 68px -apple-system, Arial, sans-serif';
    ctx.textAlign = 'center'; ctx.textBaseline = 'top';
    const ctaLines = wrapTextLines(ctx, state.ctaText, W - 120, 68);
    let ctaDrawY = ctaY;
    ctaLines.slice(0, 2).forEach(line => {
        ctx.fillText(line, W / 2, ctaDrawY);
        ctaDrawY += 80;
    });

    // ── Produk cards (vertikal stack, max 3) ──
    const prods = state.selected.slice(0, 3);
    const cardAreaY = ctaDrawY + 40;
    const cardAreaH = H - cardAreaY - 160;
    const cardH = Math.floor(cardAreaH / prods.length) - 20;
    const cardW = W - 80;
    const cardX = 40;

    for (let i = 0; i < prods.length; i++) {
        const cardY = cardAreaY + i * (cardH + 20);
        await drawStoryCard(ctx, prods[i], cardX, cardY, cardW, cardH, theme);
    }

    // ── Footer CTA bar ──
    const ftY = H - 140;
    const ftGrad = ctx.createLinearGradient(0, ftY, W, ftY + 140);
    ftGrad.addColorStop(0, 'rgba(0,0,0,0.4)');
    ftGrad.addColorStop(1, 'rgba(0,0,0,0.65)');
    ctx.fillStyle = ftGrad;
    ctx.fillRect(0, ftY, W, 140);
    // Tombol order
    const btnW = 480, btnH = 80, btnX = (W - btnW) / 2, btnY = ftY + 30;
    const btnGrad = ctx.createLinearGradient(btnX, btnY, btnX + btnW, btnY);
    btnGrad.addColorStop(0, theme.from);
    btnGrad.addColorStop(1, theme.to);
    roundRect(ctx, btnX, btnY, btnW, btnH, btnH / 2);
    ctx.fillStyle = btnGrad; ctx.fill();
    ctx.strokeStyle = 'rgba(255,255,255,0.4)'; ctx.lineWidth = 2; ctx.stroke();
    ctx.fillStyle = '#fff';
    ctx.font = 'bold 32px -apple-system, Arial, sans-serif';
    ctx.textAlign = 'center'; ctx.textBaseline = 'middle';
    ctx.fillText('\uD83D\uDED2 Pesan via WhatsApp', W / 2, btnY + btnH / 2);

    drawStickers(ctx, W, H);
    if (state.showWatermark) drawWatermark(ctx, W, H, state.watermarkPos, theme);
}

async function drawStoryCard(ctx, prod, x, y, w, h, theme) {
    if (!prod) return;
    const eff = effectiveProd(prod);
    // Card bg
    ctx.save();
    ctx.shadowColor = 'rgba(0,0,0,0.2)'; ctx.shadowBlur = 20; ctx.shadowOffsetY = 6;
    ctx.fillStyle = 'rgba(255,255,255,0.14)';
    roundRect(ctx, x, y, w, h, 24); ctx.fill();
    ctx.strokeStyle = 'rgba(255,255,255,0.3)'; ctx.lineWidth = 1.5; ctx.stroke();
    ctx.restore();

    const imgW = Math.round(h * 0.9);
    const imgX = x + 16, imgY = y + (h - imgW) / 2;
    await drawProductImage(ctx, eff.gambar, imgX, imgY, imgW, imgW, 18);

    // Info kanan
    const infoX = imgX + imgW + 24;
    const infoW = w - imgW - 56;
    let cy = y + 22;
    if (eff.badge) {
        ctx.fillStyle = theme.accent || '#22c55e';
        ctx.font = 'bold 22px -apple-system, Arial, sans-serif';
        ctx.textAlign = 'left'; ctx.textBaseline = 'top';
        ctx.fillText(eff.badge.toUpperCase(), infoX, cy); cy += 30;
    }
    ctx.fillStyle = '#fff';
    ctx.font = 'bold 30px -apple-system, Arial, sans-serif';
    cy = drawWrappedText(ctx, eff.nama, infoX, cy, infoW, 36, 2); cy += 8;
    if (eff.hargaCoret > 0) {
        ctx.fillStyle = 'rgba(255,255,255,0.55)';
        ctx.font = '500 22px -apple-system, Arial, sans-serif';
        const coretTxt = `Rp ${eff.hargaCoret.toLocaleString('id-ID')}`;
        const coretW = ctx.measureText(coretTxt).width;
        ctx.fillText(coretTxt, infoX, cy);
        ctx.strokeStyle = 'rgba(255,255,255,0.55)'; ctx.lineWidth = 1.5;
        ctx.beginPath(); ctx.moveTo(infoX, cy + 11); ctx.lineTo(infoX + coretW, cy + 11); ctx.stroke();
        cy += 28;
    }
    ctx.fillStyle = '#fff';
    ctx.font = 'bold 38px -apple-system, Arial, sans-serif';
    ctx.fillText(`Rp ${eff.harga.toLocaleString('id-ID')}`, infoX, cy); cy += 46;
    if (eff.rewardPoin > 0 || eff.minOrder > 1) {
        ctx.fillStyle = 'rgba(255,255,255,0.7)';
        ctx.font = '500 20px -apple-system, Arial, sans-serif';
        const info = [];
        if (eff.rewardPoin > 0) info.push(`\u2B50 +${eff.rewardPoin} Poin`);
        if (eff.minOrder > 1)   info.push(`\uD83D\uDCE6 Min. ${eff.minOrder}`);
        ctx.fillText(info.join('  '), infoX, cy);
    }
}

/* ══════════════════════════════════════════
   BANNER HORIZONTAL TEMPLATE (1200×628)
══════════════════════════════════════════ */
async function drawBanner(canvas, highRes) {
    const W = CANVAS_SIZE_BANNER.w, H = CANVAS_SIZE_BANNER.h;
    const scale = highRes ? 1 : 0.45;
    canvas.width  = W * scale;
    canvas.height = H * scale;
    const ctx = canvas.getContext('2d');
    ctx.scale(scale, scale);
    const theme = THEMES[state.theme] || THEMES['green-blue'];

    // ── Background gradient ──
    const bg = ctx.createLinearGradient(0, 0, W, H);
    bg.addColorStop(0, theme.from);
    bg.addColorStop(1, theme.to);
    ctx.fillStyle = bg; ctx.fillRect(0, 0, W, H);

    // ── Dekorasi ──
    ctx.save(); ctx.globalAlpha = 0.06; ctx.fillStyle = '#fff';
    ctx.beginPath(); ctx.arc(W * 0.92, H * 0.15, 180, 0, Math.PI * 2); ctx.fill();
    ctx.beginPath(); ctx.arc(W * 0.05, H * 0.85, 140, 0, Math.PI * 2); ctx.fill();
    ctx.restore();

    // ── Header strip ──
    const hdrH = 72;
    ctx.save(); ctx.globalAlpha = 0.2; ctx.fillStyle = '#000';
    ctx.fillRect(0, 0, W, hdrH); ctx.restore();
    ctx.fillStyle = '#fff';
    ctx.font = 'bold 30px -apple-system, Arial, sans-serif';
    ctx.textAlign = 'left'; ctx.textBaseline = 'middle';
    ctx.fillText('\uD83D\uDED2 GoSembako', 40, hdrH / 2);
    ctx.font = '600 22px -apple-system, Arial, sans-serif';
    ctx.textAlign = 'center';
    ctx.fillText(`\uD83D\uDCC5 ${formatDateRange(state.promoStart, state.promoEnd)}`, W / 2, hdrH / 2);
    ctx.textAlign = 'right'; ctx.fillStyle = 'rgba(255,255,255,0.85)';
    ctx.fillText(`\uD83D\uDCF1 ${state.waNumber}`, W - 40, hdrH / 2);

    // ── Layout: kiri = teks CTA besar, kanan = produk cards ──
    const prods = state.selected.slice(0, 3);
    const contentY = hdrH + 20;
    const contentH = H - contentY - 80;

    // Kolom kiri: CTA
    const leftW = Math.round(W * 0.32);
    ctx.fillStyle = '#fff';
    ctx.font = 'bold 52px -apple-system, Arial, sans-serif';
    ctx.textAlign = 'left'; ctx.textBaseline = 'top';
    const ctaLines = wrapTextLines(ctx, state.ctaText, leftW - 40, 52);
    let ctaY = contentY + 20;
    ctaLines.slice(0, 3).forEach(line => {
        ctx.fillText(line, 40, ctaY);
        ctaY += 62;
    });
    // Garis dekorasi
    const lineGrad = ctx.createLinearGradient(40, 0, 40 + leftW - 60, 0);
    lineGrad.addColorStop(0, 'rgba(255,255,255,0.8)');
    lineGrad.addColorStop(1, 'rgba(255,255,255,0)');
    ctx.strokeStyle = lineGrad; ctx.lineWidth = 3;
    ctx.beginPath(); ctx.moveTo(40, ctaY + 10); ctx.lineTo(leftW - 20, ctaY + 10); ctx.stroke();

    // Kolom kanan: produk cards horizontal
    const rightX = leftW + 20;
    const rightW = W - rightX - 20;
    const cardW = Math.floor(rightW / prods.length) - 16;
    const cardH = contentH;

    for (let i = 0; i < prods.length; i++) {
        const cx = rightX + i * (cardW + 16);
        await drawBannerCard(ctx, prods[i], cx, contentY, cardW, cardH, theme);
    }

    // ── Footer CTA bar ──
    const ftY = H - 72;
    ctx.save(); ctx.globalAlpha = 0.25; ctx.fillStyle = '#000';
    ctx.fillRect(0, ftY, W, 72); ctx.restore();
    ctx.fillStyle = '#fff';
    ctx.font = 'bold 28px -apple-system, Arial, sans-serif';
    ctx.textAlign = 'center'; ctx.textBaseline = 'middle';
    ctx.fillText(state.ctaText, W / 2, ftY + 36);

    drawStickers(ctx, W, H);
    if (state.showWatermark) drawWatermark(ctx, W, H, state.watermarkPos, theme);
}

async function drawBannerCard(ctx, prod, x, y, w, h, theme) {
    // Card bg
    ctx.save();
    ctx.shadowColor = 'rgba(0,0,0,0.18)'; ctx.shadowBlur = 16; ctx.shadowOffsetY = 4;
    ctx.fillStyle = 'rgba(255,255,255,0.13)';
    roundRect(ctx, x, y, w, h, 20); ctx.fill();
    ctx.strokeStyle = 'rgba(255,255,255,0.28)'; ctx.lineWidth = 1.5; ctx.stroke();
    ctx.restore();

    if (!prod) {
        ctx.fillStyle = 'rgba(255,255,255,0.4)';
        ctx.font = '500 22px -apple-system, Arial, sans-serif';
        ctx.textAlign = 'center'; ctx.textBaseline = 'middle';
        ctx.fillText('Slot Kosong', x + w / 2, y + h / 2);
        return;
    }

    const eff = effectiveProd(prod);
    const imgH = Math.round(h * 0.52);
    const pad = 14;

    await drawProductImage(ctx, eff.gambar, x + pad, y + pad, w - pad * 2, imgH - pad, 14);
    if (eff.badge) drawBadge(ctx, eff.badge, x + pad + 8, y + pad + 8, theme, true);

    let cy = y + imgH + 14;
    ctx.fillStyle = '#fff';
    ctx.font = 'bold 22px -apple-system, Arial, sans-serif';
    ctx.textAlign = 'left'; ctx.textBaseline = 'top';
    cy = drawWrappedText(ctx, eff.nama, x + pad, cy, w - pad * 2, 26, 2); cy += 6;
    if (eff.hargaCoret > 0) {
        ctx.fillStyle = 'rgba(255,255,255,0.55)';
        ctx.font = '500 18px -apple-system, Arial, sans-serif';
        const coretTxt = `Rp ${eff.hargaCoret.toLocaleString('id-ID')}`;
        const cw = ctx.measureText(coretTxt).width;
        ctx.fillText(coretTxt, x + pad, cy);
        ctx.strokeStyle = 'rgba(255,255,255,0.55)'; ctx.lineWidth = 1.5;
        ctx.beginPath(); ctx.moveTo(x + pad, cy + 9); ctx.lineTo(x + pad + cw, cy + 9); ctx.stroke();
        cy += 24;
    }
    ctx.fillStyle = '#fff';
    ctx.font = 'bold 28px -apple-system, Arial, sans-serif';
    ctx.fillText(`Rp ${eff.harga.toLocaleString('id-ID')}`, x + pad, cy); cy += 36;
    if (eff.rewardPoin > 0) {
        ctx.fillStyle = 'rgba(255,255,255,0.7)';
        ctx.font = '500 18px -apple-system, Arial, sans-serif';
        ctx.fillText(`\u2B50 +${eff.rewardPoin} Poin`, x + pad, cy);
    }
}

/** Helper: wrap teks jadi array baris */
function wrapTextLines(ctx, text, maxW, fontSize) {
    const words = text.split(' ');
    const lines = [];
    let cur = '';
    for (const w of words) {
        const test = cur ? cur + ' ' + w : w;
        if (ctx.measureText(test).width > maxW && cur) {
            lines.push(cur); cur = w;
        } else { cur = test; }
    }
    if (cur) lines.push(cur);
    return lines;
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

/** Versi drawWatermark yang menggunakan posisi dari drag (pos.x, pos.y dalam 0-1) */
function drawWatermarkAt(ctx, W, H, pos, theme) {
    const text = 'paketsembako.com';
    ctx.save();
    ctx.globalAlpha = 0.35;
    ctx.fillStyle = '#ffffff';
    ctx.font = 'bold 28px -apple-system, Arial, sans-serif';
    ctx.textAlign = 'center';
    ctx.textBaseline = 'middle';
    ctx.fillText(text, pos.x * W, pos.y * H);
    ctx.restore();
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

/* ══════════════════════════════════════════
   DRAW BACKGROUND
══════════════════════════════════════════ */
async function drawBackground(ctx, W, H, theme) {
    if (state.bgType === 'custom' && state.bgDataUrl) {
        try {
            const img = await loadImage(state.bgDataUrl);
            ctx.drawImage(img, 0, 0, W, H);
        } catch { drawGradientBg(ctx, W, H, theme); }
    } else if (state.bgType === 'solid') {
        ctx.fillStyle = theme.from;
        ctx.fillRect(0, 0, W, H);
    } else {
        drawGradientBg(ctx, W, H, theme);
    }
    if (state.bgPattern && state.bgPattern !== 'none') {
        drawBgPattern(ctx, W, H, state.bgPattern);
    } else if (state.bgType !== 'custom') {
        ctx.save(); ctx.globalAlpha = 0.06; ctx.fillStyle = '#ffffff';
        ctx.beginPath(); ctx.arc(W*0.85, H*0.12, 180, 0, Math.PI*2); ctx.fill();
        ctx.beginPath(); ctx.arc(W*0.1,  H*0.88, 140, 0, Math.PI*2); ctx.fill();
        ctx.beginPath(); ctx.arc(W*0.5,  H*0.5,  320, 0, Math.PI*2); ctx.fill();
        ctx.restore();
    }
}

function drawGradientBg(ctx, W, H, theme) {
    const g = ctx.createLinearGradient(0, 0, W, H);
    g.addColorStop(0, theme.from); g.addColorStop(1, theme.to);
    ctx.fillStyle = g; ctx.fillRect(0, 0, W, H);
}

function drawBgPattern(ctx, W, H, pattern) {
    ctx.save(); ctx.globalAlpha = 0.08;
    ctx.strokeStyle = '#ffffff'; ctx.fillStyle = '#ffffff';
    const step = 48;
    switch (pattern) {
        case 'dots':
            for (let x = step; x < W; x += step)
                for (let y = step; y < H; y += step) {
                    ctx.beginPath(); ctx.arc(x, y, 3, 0, Math.PI*2); ctx.fill();
                }
            break;
        case 'grid':
            ctx.lineWidth = 1;
            for (let x = 0; x <= W; x += step) { ctx.beginPath(); ctx.moveTo(x,0); ctx.lineTo(x,H); ctx.stroke(); }
            for (let y = 0; y <= H; y += step) { ctx.beginPath(); ctx.moveTo(0,y); ctx.lineTo(W,y); ctx.stroke(); }
            break;
        case 'wave':
            ctx.lineWidth = 2;
            for (let y = step; y < H; y += step*1.5) {
                ctx.beginPath();
                for (let x = 0; x <= W; x += 4) {
                    const wy = y + Math.sin((x/W)*Math.PI*6)*18;
                    x===0 ? ctx.moveTo(x,wy) : ctx.lineTo(x,wy);
                }
                ctx.stroke();
            }
            break;
        case 'diamond':
            ctx.lineWidth = 1;
            for (let x = 0; x < W+step; x += step)
                for (let y = 0; y < H+step; y += step) {
                    ctx.beginPath();
                    ctx.moveTo(x, y-step/2); ctx.lineTo(x+step/2, y);
                    ctx.lineTo(x, y+step/2); ctx.lineTo(x-step/2, y);
                    ctx.closePath(); ctx.stroke();
                }
            break;
        case 'stripe':
            ctx.lineWidth = 2;
            for (let i = -H; i < W+H; i += step) {
                ctx.beginPath(); ctx.moveTo(i,0); ctx.lineTo(i+H,H); ctx.stroke();
            }
            break;
    }
    ctx.restore();
}

async function drawLogoHeader(ctx, W, headerH, ff, isPortrait) {
    if (state.logoDataUrl) {
        try {
            const img = await loadImage(state.logoDataUrl);
            const maxH = headerH - 24;
            const lh = Math.min(maxH, 80);
            const lw = lh * (img.width / img.height);
            ctx.drawImage(img, 40, (headerH - lh) / 2, lw, lh);
            return;
        } catch { /* fallback */ }
    }
    ctx.fillStyle = '#ffffff';
    ctx.font = `bold ${isPortrait ? 38 : 36}px ${ff}`;
    ctx.textAlign = 'left';
    ctx.textBaseline = 'middle';
    ctx.fillText('\uD83D\uDED2 GoSembako', 48, headerH / 2);
}

/** Versi drawLogoHeader yang menggunakan posisi dari drag (pos.x, pos.y dalam 0-1) */
async function drawLogoHeaderAt(ctx, W, H, headerH, ff, isPortrait, pos) {
    const lx = pos.x * W;
    const ly = pos.y * H;
    if (state.logoDataUrl) {
        try {
            const img = await loadImage(state.logoDataUrl);
            const maxH = headerH - 24;
            const lh = Math.min(maxH, 80);
            const lw = lh * (img.width / img.height);
            ctx.drawImage(img, lx, ly - lh/2, lw, lh);
            return;
        } catch { /* fallback */ }
    }
    ctx.fillStyle = '#ffffff';
    ctx.font = `bold ${isPortrait ? 38 : 36}px ${ff}`;
    ctx.textAlign = 'left';
    ctx.textBaseline = 'middle';
    ctx.fillText('\uD83D\uDED2 GoSembako', lx, ly + 12);
}

function loadImage(src) {
    return new Promise((resolve, reject) => {
        const img = new Image();
        img.crossOrigin = 'anonymous';
        img.onload = () => resolve(img);
        img.onerror = reject;
        img.src = src;
    });
}

/* ══════════════════════════════════════════
   PRICE EFFECT
══════════════════════════════════════════ */
function drawPriceEffect(ctx, priceStr, x, y, theme, effect) {
    if (!effect || effect === 'none') {
        ctx.fillStyle = theme.accent;
        ctx.fillText(priceStr, x, y);
        return;
    }
    const tw = ctx.measureText(priceStr).width;
    const fontSize = parseInt(ctx.font) || 64;
    if (effect === 'circle') {
        const cx = x + tw/2, cy = y - fontSize/2;
        const r = Math.max(tw, fontSize*1.2)/2 + 24;
        ctx.save();
        ctx.fillStyle = '#dc2626'; ctx.beginPath(); ctx.arc(cx,cy,r,0,Math.PI*2); ctx.fill();
        ctx.fillStyle = '#ffffff'; ctx.textAlign = 'center'; ctx.textBaseline = 'middle';
        ctx.fillText(priceStr, cx, cy); ctx.restore();
    } else if (effect === 'burst') {
        const cx = x + tw/2, cy = y - fontSize/2;
        const outerR = Math.max(tw, fontSize*1.2)/2 + 36;
        const innerR = outerR * 0.55;
        const spikes = 12;
        ctx.save();
        ctx.fillStyle = '#dc2626'; ctx.beginPath();
        for (let i = 0; i < spikes*2; i++) {
            const angle = (i*Math.PI)/spikes - Math.PI/2;
            const r = i%2===0 ? outerR : innerR;
            const px = cx + Math.cos(angle)*r, py = cy + Math.sin(angle)*r;
            i===0 ? ctx.moveTo(px,py) : ctx.lineTo(px,py);
        }
        ctx.closePath(); ctx.fill();
        ctx.fillStyle = '#ffffff'; ctx.textAlign = 'center'; ctx.textBaseline = 'middle';
        ctx.fillText(priceStr, cx, cy); ctx.restore();
    }
}

/* ══════════════════════════════════════════
   UNDO / REDO
══════════════════════════════════════════ */
function snapshotState() {
    return JSON.stringify({
        template: state.template, theme: state.theme,
        promoStart: state.promoStart, promoEnd: state.promoEnd,
        ctaText: state.ctaText, waNumber: state.waNumber,
        showWatermark: state.showWatermark, watermarkPos: state.watermarkPos,
        activeStickers: state.activeStickers,
        logoDataUrl: state.logoDataUrl,
        bgType: state.bgType, bgPattern: state.bgPattern, bgDataUrl: state.bgDataUrl,
        fontFamily: state.fontFamily, priceEffect: state.priceEffect,
        selected: state.selected.map(p => ({ ...p, _gambarDataUrl: p._gambarDataUrl || '' }))
    });
}

function pushUndo() {
    const snap = snapshotState();
    if (state.undoStack.length && state.undoStack[state.undoStack.length-1] === snap) return;
    state.undoStack.push(snap);
    if (state.undoStack.length > 30) state.undoStack.shift();
    state.redoStack = [];
    updateUndoRedoButtons();
}

function applySnapshot(snap) {
    const s = JSON.parse(snap);
    Object.assign(state, s);
    const setVal = (id, val) => { const el = document.getElementById(id); if (el) el.value = val; };
    setVal('promo-date-start', state.promoStart);
    setVal('promo-date-end',   state.promoEnd);
    setVal('cta-text',         state.ctaText);
    setVal('wa-number',        state.waNumber);
    const wmEl = document.getElementById('show-watermark');
    if (wmEl) wmEl.checked = state.showWatermark;
    const wmPos = document.getElementById('watermark-pos');
    if (wmPos) wmPos.value = state.watermarkPos;
    const fontSel = document.getElementById('font-family-select');
    if (fontSel) fontSel.value = state.fontFamily;
    const priceSel = document.getElementById('price-effect-select');
    if (priceSel) priceSel.value = state.priceEffect;
    document.querySelectorAll('.template-card').forEach(c => c.classList.toggle('selected', c.dataset.tpl === state.template));
    document.querySelectorAll('.color-swatch').forEach(s => s.classList.toggle('selected', s.dataset.theme === state.theme));
    updateSlotCounter(); renderSelectedProducts(); renderStickerUI(); renderBgPatternUI();
    updateLogoPreview(); updateBgPreview(); schedulePreview(); updateUndoRedoButtons();
}

function undo() {
    if (!state.undoStack.length) return;
    state.redoStack.push(snapshotState());
    applySnapshot(state.undoStack.pop());
    showToast('Dibatalkan \u21A9');
}

function redo() {
    if (!state.redoStack.length) return;
    state.undoStack.push(snapshotState());
    applySnapshot(state.redoStack.pop());
    showToast('Diulangi \u21AA');
}

function updateUndoRedoButtons() {
    const u = document.getElementById('btn-undo');
    const r = document.getElementById('btn-redo');
    if (u) u.disabled = state.undoStack.length === 0;
    if (r) r.disabled = state.redoStack.length === 0;
}

/* ══════════════════════════════════════════
   DRAG & DROP URUTAN PRODUK
══════════════════════════════════════════ */
let dragSrcIdx = null;

function onDragStart(e, idx) {
    dragSrcIdx = idx;
    e.dataTransfer.effectAllowed = 'move';
    e.currentTarget.classList.add('dragging');
}

function onDragOver(e) { e.preventDefault(); e.dataTransfer.dropEffect = 'move'; }

function onDrop(e, idx) {
    e.preventDefault();
    if (dragSrcIdx === null || dragSrcIdx === idx) return;
    pushUndo();
    const moved = state.selected.splice(dragSrcIdx, 1)[0];
    state.selected.splice(idx, 0, moved);
    dragSrcIdx = null;
    renderSelectedProducts(); schedulePreview();
    showToast('Urutan produk diperbarui!');
}

function onDragEnd(e) {
    dragSrcIdx = null;
    document.querySelectorAll('.selected-product-card').forEach(c => c.classList.remove('dragging'));
}

/* ══════════════════════════════════════════
   SHARE KE SOSMED
══════════════════════════════════════════ */
function shareToSosmed(platform) {
    const shareText = encodeURIComponent(`${state.ctaText}\n\nBelanja sembako berkualitas di paketsembako.com\nWA: ${state.waNumber}`);
    const pageUrl = encodeURIComponent('https://paketsembako.com');
    let url = '';
    switch (platform) {
        case 'whatsapp':  url = `https://wa.me/?text=${shareText}%20${pageUrl}`; break;
        case 'facebook':  url = `https://www.facebook.com/sharer/sharer.php?u=${pageUrl}&quote=${shareText}`; break;
        case 'telegram':  url = `https://t.me/share/url?url=${pageUrl}&text=${shareText}`; break;
        case 'twitter':   url = `https://twitter.com/intent/tweet?text=${shareText}&url=${pageUrl}`; break;
        case 'instagram': showToast('Untuk Instagram: download gambar lalu upload manual ke IG Story/Feed. \uD83D\uDCF8'); return;
    }
    if (url) window.open(url, '_blank', 'noopener');
}

/* ══════════════════════════════════════════
   LOGO CUSTOM & BG CUSTOM
══════════════════════════════════════════ */
function handleLogoUpload(input) {
    const file = input.files[0];
    if (!file) return;
    if (file.size > 2*1024*1024) { showToast('Logo maksimal 2MB.'); return; }
    const reader = new FileReader();
    reader.onload = e => {
        pushUndo(); state.logoDataUrl = e.target.result;
        updateLogoPreview(); schedulePreview();
        showToast('Logo berhasil diupload! \uD83C\uDFE2');
    };
    reader.readAsDataURL(file);
}

function removeLogo() {
    pushUndo(); state.logoDataUrl = null;
    updateLogoPreview(); schedulePreview();
    showToast('Logo dihapus.');
}

function updateLogoPreview() {
    const prev = document.getElementById('logo-preview');
    const btn  = document.getElementById('btn-remove-logo');
    if (!prev) return;
    if (state.logoDataUrl) {
        prev.innerHTML = `<img src="${state.logoDataUrl}" style="max-height:56px;max-width:180px;object-fit:contain;border-radius:8px;">`;
        if (btn) btn.style.display = 'inline-flex';
    } else {
        prev.innerHTML = '<span style="color:#94a3b8;font-size:0.8rem;">Belum ada logo custom</span>';
        if (btn) btn.style.display = 'none';
    }
}

function handleBgUpload(input) {
    const file = input.files[0];
    if (!file) return;
    if (file.size > 5*1024*1024) { showToast('Background maksimal 5MB.'); return; }
    const reader = new FileReader();
    reader.onload = e => {
        pushUndo(); state.bgDataUrl = e.target.result; state.bgType = 'custom';
        updateBgPreview(); schedulePreview();
        showToast('Background berhasil diupload! \uD83C\uDF04');
    };
    reader.readAsDataURL(file);
}

function removeBgCustom() {
    pushUndo(); state.bgDataUrl = null; state.bgType = 'gradient';
    updateBgPreview(); schedulePreview();
    showToast('Background dikembalikan ke gradient.');
}

function updateBgPreview() {
    const prev = document.getElementById('bg-preview');
    const btn  = document.getElementById('btn-remove-bg');
    if (!prev) return;
    if (state.bgDataUrl) {
        prev.innerHTML = `<img src="${state.bgDataUrl}" style="max-height:56px;max-width:180px;object-fit:cover;border-radius:8px;">`;
        if (btn) btn.style.display = 'inline-flex';
    } else {
        prev.innerHTML = '<span style="color:#94a3b8;font-size:0.8rem;">Belum ada background custom</span>';
        if (btn) btn.style.display = 'none';
    }
}

function renderBgPatternUI() {
    const wrap = document.getElementById('bg-pattern-wrap');
    if (!wrap) return;
    wrap.innerHTML = BG_PATTERNS.map(p =>
        `<button class="bg-pattern-chip ${state.bgPattern===p.id?'active':''}" data-pattern="${p.id}" onclick="setBgPattern('${p.id}')" title="${p.label}">${p.icon} ${p.label}</button>`
    ).join('');
}

function setBgPattern(id) {
    pushUndo(); state.bgPattern = id;
    renderBgPatternUI(); schedulePreview();
}

function setBgType(type) {
    pushUndo(); state.bgType = type;
    if (type !== 'custom') state.bgDataUrl = null;
    updateBgPreview(); schedulePreview();
}

/* ══════════════════════════════════════════
   PREVIEW SIZE TOGGLE
══════════════════════════════════════════ */
function setPreviewSize(size) {
    state.previewSize = size;
    const wrap = document.getElementById('preview-wrap');
    if (!wrap) return;
    document.querySelectorAll('.preview-size-btn').forEach(b => b.classList.toggle('active', b.dataset.size === size));
    if (size === 'mobile')       { wrap.style.maxWidth = '375px'; wrap.style.margin = '0 auto'; }
    else if (size === 'desktop') { wrap.style.maxWidth = '100%';  wrap.style.margin = ''; }
    else                         { wrap.style.maxWidth = '';       wrap.style.margin = ''; }
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

        // Gunakan posisi dari drag jika ada, fallback ke pos string
        const dragPos = (state.elementPositions.stickers || {})[presetId];
        let x, y;
        if (dragPos) {
            x = dragPos.x * W;
            y = dragPos.y * H;
        } else {
            const p = stickerPosition(pos, W, H, preset);
            x = p.x; y = p.y;
        }

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

/* ══════════════════════════════════════════════════════════════
   DRAG & DROP OVERLAY — Posisi elemen di atas canvas preview
══════════════════════════════════════════════════════════════ */

/**
 * Definisi semua elemen yang bisa di-drag di atas preview.
 * Setiap elemen punya: id, label, icon, warna handle.
 * Posisi disimpan di state.elementPositions.
 */
function getDraggableElements() {
    const els = [
        { id: 'logo',      label: 'Logo',      icon: '🏢', color: '#128052' },
        { id: 'cta',       label: 'CTA',        icon: '📣', color: '#d97706' },
        { id: 'wa',        label: 'WA',         icon: '📱', color: '#16a34a' },
        { id: 'watermark', label: 'Watermark',  icon: '💧', color: '#64748b' },
    ];
    // Tambahkan stiker aktif
    (state.activeStickers || []).forEach(({ presetId }) => {
        const preset = STICKER_PRESETS.find(s => s.id === presetId);
        if (!preset) return;
        els.push({
            id: `sticker_${presetId}`,
            label: preset.label.replace(/\n/g, ' ').substring(0, 12),
            icon: preset.type === 'badge-circle' ? '🔴' :
                  preset.type === 'banner'       ? '🏷️' :
                  preset.type === 'stamp'        ? '🔵' : '🎀',
            color: preset.bg || '#ef4444',
            isSicker: true,
            presetId
        });
    });
    return els;
}

/**
 * Buat atau update overlay layer di atas canvas preview.
 * Setiap elemen ditampilkan sebagai handle kecil yang bisa di-drag.
 */
function updateDragOverlay() {
    const canvas = document.getElementById('brosur-canvas');
    if (!canvas || canvas.style.display === 'none') return;

    const wrap = document.getElementById('preview-wrap');
    if (!wrap) return;

    // Buat container overlay jika belum ada
    let overlay = document.getElementById('drag-overlay');
    if (!overlay) {
        overlay = document.createElement('div');
        overlay.id = 'drag-overlay';
        overlay.style.cssText = `
            position: absolute; top: 0; left: 0;
            width: 100%; height: 100%;
            pointer-events: none;
            z-index: 10;
        `;
        // Pastikan wrap punya position relative
        wrap.style.position = 'relative';
        wrap.appendChild(overlay);
    }

    // Bersihkan handle lama
    overlay.innerHTML = '';

    const canvasRect = canvas.getBoundingClientRect();
    const wrapRect   = wrap.getBoundingClientRect();

    // Offset canvas dalam wrap
    const offX = canvasRect.left - wrapRect.left;
    const offY = canvasRect.top  - wrapRect.top;
    const cW   = canvasRect.width;
    const cH   = canvasRect.height;

    const elements = getDraggableElements();

    elements.forEach(el => {
        // Ambil posisi dari state
        let pos;
        if (el.isSicker) {
            pos = (state.elementPositions.stickers || {})[el.presetId];
            if (!pos) {
                // Default: posisi dari pos string stiker lama
                const s = state.activeStickers.find(s => s.presetId === el.presetId);
                const posStr = (s && s.pos) || 'tr';
                const map = { tl:[0.05,0.05], tc:[0.5,0.05], tr:[0.88,0.05],
                               ml:[0.05,0.5],  mc:[0.5,0.5],  mr:[0.88,0.5],
                               bl:[0.05,0.92], bc:[0.5,0.92], br:[0.88,0.92] };
                const def = map[posStr] || [0.88, 0.05];
                pos = { x: def[0], y: def[1] };
                if (!state.elementPositions.stickers) state.elementPositions.stickers = {};
                state.elementPositions.stickers[el.presetId] = pos;
            }
        } else {
            pos = state.elementPositions[el.id] || { x: 0.5, y: 0.5 };
        }

        // Hitung pixel position dalam overlay
        const px = offX + pos.x * cW;
        const py = offY + pos.y * cH;

        // Buat handle element
        const handle = document.createElement('div');
        handle.className = 'drag-el-handle';
        handle.dataset.elId = el.id;
        handle.title = `Drag untuk pindahkan: ${el.label}`;
        handle.style.cssText = `
            position: absolute;
            left: ${px}px; top: ${py}px;
            transform: translate(-50%, -50%);
            background: ${el.color};
            color: #fff;
            border: 2px solid rgba(255,255,255,0.8);
            border-radius: 20px;
            padding: 3px 8px;
            font-size: 11px;
            font-weight: 700;
            white-space: nowrap;
            cursor: grab;
            pointer-events: auto;
            user-select: none;
            box-shadow: 0 2px 8px rgba(0,0,0,0.35);
            display: flex; align-items: center; gap: 4px;
            transition: box-shadow 0.15s, transform 0.1s;
            z-index: 20;
            line-height: 1.4;
        `;
        handle.innerHTML = `<span>${el.icon}</span><span>${el.label}</span>`;

        // Hover effect
        handle.addEventListener('mouseenter', () => {
            handle.style.boxShadow = '0 4px 16px rgba(0,0,0,0.5)';
            handle.style.transform = 'translate(-50%, -50%) scale(1.08)';
        });
        handle.addEventListener('mouseleave', () => {
            if (!handle._dragging) {
                handle.style.boxShadow = '0 2px 8px rgba(0,0,0,0.35)';
                handle.style.transform = 'translate(-50%, -50%) scale(1)';
            }
        });

        // ── Mouse drag ──
        handle.addEventListener('mousedown', (e) => {
            e.preventDefault();
            handle._dragging = true;
            handle.style.cursor = 'grabbing';
            handle.style.boxShadow = '0 6px 24px rgba(0,0,0,0.55)';
            handle.style.transform = 'translate(-50%, -50%) scale(1.12)';

            const onMove = (ev) => {
                const wRect = wrap.getBoundingClientRect();
                const cRect = canvas.getBoundingClientRect();
                const offXn = cRect.left - wRect.left;
                const offYn = cRect.top  - wRect.top;
                // Posisi relatif terhadap canvas
                let nx = (ev.clientX - cRect.left) / cRect.width;
                let ny = (ev.clientY - cRect.top)  / cRect.height;
                nx = Math.max(0.02, Math.min(0.98, nx));
                ny = Math.max(0.02, Math.min(0.98, ny));
                // Update handle position
                handle.style.left = (offXn + nx * cRect.width)  + 'px';
                handle.style.top  = (offYn + ny * cRect.height) + 'px';
                // Simpan ke state
                saveElPosition(el, nx, ny);
            };

            const onUp = () => {
                handle._dragging = false;
                handle.style.cursor = 'grab';
                handle.style.boxShadow = '0 2px 8px rgba(0,0,0,0.35)';
                handle.style.transform = 'translate(-50%, -50%) scale(1)';
                document.removeEventListener('mousemove', onMove);
                document.removeEventListener('mouseup', onUp);
                // Re-render canvas dengan posisi baru
                schedulePreview();
            };

            document.addEventListener('mousemove', onMove);
            document.addEventListener('mouseup', onUp);
        });

        // ── Touch drag (mobile) ──
        handle.addEventListener('touchstart', (e) => {
            e.preventDefault();
            handle._dragging = true;
            handle.style.cursor = 'grabbing';

            const onMove = (ev) => {
                const touch = ev.touches[0];
                const cRect = canvas.getBoundingClientRect();
                const wRect = wrap.getBoundingClientRect();
                const offXn = cRect.left - wRect.left;
                const offYn = cRect.top  - wRect.top;
                let nx = (touch.clientX - cRect.left) / cRect.width;
                let ny = (touch.clientY - cRect.top)  / cRect.height;
                nx = Math.max(0.02, Math.min(0.98, nx));
                ny = Math.max(0.02, Math.min(0.98, ny));
                handle.style.left = (offXn + nx * cRect.width)  + 'px';
                handle.style.top  = (offYn + ny * cRect.height) + 'px';
                saveElPosition(el, nx, ny);
            };

            const onEnd = () => {
                handle._dragging = false;
                handle.style.cursor = 'grab';
                document.removeEventListener('touchmove', onMove);
                document.removeEventListener('touchend', onEnd);
                schedulePreview();
            };

            document.addEventListener('touchmove', onMove, { passive: false });
            document.addEventListener('touchend', onEnd);
        }, { passive: false });

        overlay.appendChild(handle);
    });

    // Tombol Reset Posisi
    const resetBtn = document.createElement('button');
    resetBtn.title = 'Reset semua posisi ke default';
    resetBtn.style.cssText = `
        position: absolute;
        bottom: 6px; right: 6px;
        background: rgba(0,0,0,0.55);
        color: #fff;
        border: none;
        border-radius: 6px;
        padding: 3px 8px;
        font-size: 10px;
        cursor: pointer;
        pointer-events: auto;
        z-index: 20;
    `;
    resetBtn.textContent = '↺ Reset Posisi';
    resetBtn.addEventListener('click', () => {
        state.elementPositions = {
            logo:      { x: 0.05, y: 0.05 },
            cta:       { x: 0.5,  y: 0.94 },
            wa:        { x: 0.88, y: 0.05 },
            watermark: { x: 0.92, y: 0.94 },
            stickers:  {}
        };
        schedulePreview();
        showToast('Posisi elemen direset ke default.');
    });
    overlay.appendChild(resetBtn);
}

/** Simpan posisi elemen ke state */
function saveElPosition(el, nx, ny) {
    if (el.isSicker) {
        if (!state.elementPositions.stickers) state.elementPositions.stickers = {};
        state.elementPositions.stickers[el.presetId] = { x: nx, y: ny };
    } else {
        state.elementPositions[el.id] = { x: nx, y: ny };
    }
}

/** Sembunyikan overlay (saat generate / step lain) */
function hideDragOverlay() {
    const overlay = document.getElementById('drag-overlay');
    if (overlay) overlay.style.display = 'none';
}

/** Tampilkan kembali overlay */
function showDragOverlay() {
    const overlay = document.getElementById('drag-overlay');
    if (overlay) overlay.style.display = '';
}
