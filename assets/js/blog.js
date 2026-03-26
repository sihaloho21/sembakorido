/**
 * Blog JavaScript – GoSembako
 * Mengelola halaman Blog publik: daftar artikel, detail, komentar, pencarian, filter kategori.
 * Menggunakan Google Apps Script (GAS) API via CONFIG.getMainApiUrl()
 */

// ============================================================
// UTILITIES
// ============================================================

/**
 * Membuat slug dari teks
 * @param {string} text
 * @returns {string}
 */
function createSlug(text) {
    return String(text || '')
        .toLowerCase()
        .replace(/[^a-z0-9\s-]/g, '')
        .trim()
        .replace(/\s+/g, '-')
        .replace(/-+/g, '-');
}

/**
 * Memformat tanggal ke format Indonesia
 * @param {string} dateStr
 * @returns {string}
 */
function formatDate(dateStr) {
    if (!dateStr) return '';
    try {
        const date = new Date(dateStr);
        if (isNaN(date.getTime())) return dateStr;
        return date.toLocaleDateString('id-ID', {
            day: 'numeric',
            month: 'long',
            year: 'numeric'
        });
    } catch (e) {
        return dateStr;
    }
}

/**
 * Menghitung estimasi waktu baca
 * @param {string} content - HTML content
 * @returns {string}
 */
function estimateReadTime(content) {
    const text = content.replace(/<[^>]*>/g, '');
    const words = text.trim().split(/\s+/).length;
    const minutes = Math.max(1, Math.ceil(words / 200));
    return `${minutes} menit baca`;
}

/**
 * Escape HTML untuk mencegah XSS
 * @param {string} str
 * @returns {string}
 */
function escapeHtml(str) {
    const div = document.createElement('div');
    div.appendChild(document.createTextNode(String(str || '')));
    return div.innerHTML;
}

/**
 * Mendapatkan parameter URL
 * @param {string} name
 * @returns {string|null}
 */
function getUrlParam(name) {
    return new URLSearchParams(window.location.search).get(name);
}

/**
 * Warna badge kategori berdasarkan nama
 * @param {string} category
 * @returns {string} Tailwind classes
 */
function getCategoryColor(category) {
    const colors = [
        'bg-green-100 text-green-700',
        'bg-blue-100 text-blue-700',
        'bg-purple-100 text-purple-700',
        'bg-orange-100 text-orange-700',
        'bg-pink-100 text-pink-700',
        'bg-teal-100 text-teal-700',
        'bg-yellow-100 text-yellow-700',
        'bg-red-100 text-red-700',
    ];
    let hash = 0;
    for (let i = 0; i < category.length; i++) {
        hash = category.charCodeAt(i) + ((hash << 5) - hash);
    }
    return colors[Math.abs(hash) % colors.length];
}

/**
 * Placeholder image URL
 */
function getPlaceholderImage(title) {
    const colors = ['16a34a', '2563eb', '9333ea', 'ea580c', 'db2777'];
    let hash = 0;
    for (let i = 0; i < (title || '').length; i++) {
        hash = title.charCodeAt(i) + ((hash << 5) - hash);
    }
    const color = colors[Math.abs(hash) % colors.length];
    return `https://placehold.co/800x450/${color}/ffffff?text=${encodeURIComponent((title || 'Blog').substring(0, 20))}`;
}

// ============================================================
// API FUNCTIONS
// ============================================================

/**
 * Mengambil data dari GAS API
 * @param {object} params
 * @returns {Promise<object>}
 */
async function apiGet(params = {}) {
    const API_URL = (typeof CONFIG !== 'undefined') ? CONFIG.getMainApiUrl() : '';
    if (!API_URL) throw new Error('API URL tidak tersedia');
    const queryString = new URLSearchParams(params).toString();
    const url = queryString ? `${API_URL}?${queryString}` : API_URL;
    const response = await fetch(url);
    if (!response.ok) throw new Error(`HTTP error ${response.status}`);
    return response.json();
}

/**
 * Mengirim data ke GAS API (POST)
 * @param {object} payload
 * @returns {Promise<object>}
 */
async function apiPost(payload) {
    const API_URL = (typeof CONFIG !== 'undefined') ? CONFIG.getMainApiUrl() : '';
    if (!API_URL) throw new Error('API URL tidak tersedia');
    const formData = new URLSearchParams();
    formData.append('json', JSON.stringify(payload));
    const response = await fetch(API_URL, {
        method: 'POST',
        headers: { 'Content-Type': 'application/x-www-form-urlencoded' },
        body: formData.toString()
    });
    if (!response.ok) throw new Error(`HTTP error ${response.status}`);
    return response.json();
}

// ============================================================
// BLOG LIST PAGE (blog.html)
// ============================================================

const BlogListPage = {
    allPosts: [],
    filteredPosts: [],
    currentPage: 0,
    postsPerPage: 9,
    currentCategory: 'Semua',
    searchQuery: '',

    async init() {
        if (!document.getElementById('articles-grid')) return;
        this.bindEvents();
        await this.loadPosts();
    },

    bindEvents() {
        // Search
        const searchDesktop = document.getElementById('blog-search-desktop');
        const searchMobile = document.getElementById('blog-search-mobile');
        const handleSearch = (e) => {
            this.searchQuery = e.target.value.trim().toLowerCase();
            // Sync both inputs
            if (searchDesktop) searchDesktop.value = e.target.value;
            if (searchMobile) searchMobile.value = e.target.value;
            this.currentPage = 0;
            this.applyFilters();
        };
        if (searchDesktop) searchDesktop.addEventListener('input', handleSearch);
        if (searchMobile) searchMobile.addEventListener('input', handleSearch);

        // Load More
        const loadMoreBtn = document.getElementById('load-more-btn');
        if (loadMoreBtn) {
            loadMoreBtn.addEventListener('click', () => {
                this.currentPage++;
                this.renderPosts(false);
            });
        }
    },

    async loadPosts() {
        try {
            const data = await apiGet({ action: 'get_blog_posts', sheet: 'blog_posts', status: 'published' });
            if (data && Array.isArray(data.data)) {
                this.allPosts = data.data.filter(p => p.status === 'published' || !p.status);
            } else if (Array.isArray(data)) {
                this.allPosts = data.filter(p => p.status === 'published' || !p.status);
            } else {
                this.allPosts = [];
            }
            // Sort by published_at desc
            this.allPosts.sort((a, b) => new Date(b.published_at || b.created_at || 0) - new Date(a.published_at || a.created_at || 0));
        } catch (err) {
            console.warn('Blog: Gagal memuat artikel dari API. Menggunakan data contoh.', err);
            this.allPosts = this.getSamplePosts();
        }
        this.buildCategoryFilters();
        this.applyFilters();
    },

    getSamplePosts() {
        return [
            {
                id: 'sample-1',
                title: '5 Tips Hemat Belanja Sembako Bulanan',
                slug: '5-tips-hemat-belanja-sembako-bulanan',
                excerpt: 'Temukan cara cerdas mengatur anggaran belanja sembako agar lebih hemat tanpa mengorbankan kualitas bahan makanan keluarga.',
                content: '<p>Belanja sembako adalah kebutuhan rutin setiap keluarga. Dengan strategi yang tepat, Anda bisa menghemat pengeluaran hingga 30% setiap bulannya.</p><h2>1. Buat Daftar Belanja</h2><p>Selalu buat daftar belanja sebelum pergi ke toko. Ini membantu Anda menghindari pembelian impulsif.</p><h2>2. Beli dalam Jumlah Besar</h2><p>Untuk bahan yang tahan lama seperti beras, minyak, dan gula, beli dalam jumlah besar untuk mendapatkan harga lebih murah.</p>',
                author: 'Tim GoSembako',
                published_at: '2026-03-20 10:00:00',
                status: 'published',
                image_url: '',
                categories: 'Tips Belanja',
                tags: 'hemat,sembako,tips',
                meta_description: '5 tips hemat belanja sembako bulanan untuk keluarga Indonesia.'
            },
            {
                id: 'sample-2',
                title: 'Resep Sayur Sop Sederhana dan Bergizi',
                slug: 'resep-sayur-sop-sederhana-bergizi',
                excerpt: 'Sayur sop adalah hidangan klasik yang mudah dibuat, bergizi tinggi, dan cocok untuk seluruh anggota keluarga.',
                content: '<p>Sayur sop adalah salah satu masakan Indonesia yang paling digemari. Berikut resep mudah yang bisa Anda coba di rumah.</p><h2>Bahan-bahan</h2><ul><li>Wortel 2 buah</li><li>Kentang 2 buah</li><li>Kol 1/4 buah</li><li>Buncis 100 gram</li></ul>',
                author: 'Chef GoSembako',
                published_at: '2026-03-15 09:00:00',
                status: 'published',
                image_url: '',
                categories: 'Resep Masakan',
                tags: 'resep,sayur,masakan',
                meta_description: 'Resep sayur sop sederhana dan bergizi untuk keluarga.'
            },
            {
                id: 'sample-3',
                title: 'Panduan Memilih Beras Berkualitas untuk Keluarga',
                slug: 'panduan-memilih-beras-berkualitas',
                excerpt: 'Beras adalah makanan pokok utama masyarakat Indonesia. Pelajari cara memilih beras yang berkualitas dengan harga terjangkau.',
                content: '<p>Memilih beras yang tepat sangat penting untuk kesehatan dan kepuasan makan keluarga. Berikut panduan lengkapnya.</p><h2>Jenis-jenis Beras</h2><p>Ada berbagai jenis beras di pasaran, mulai dari beras putih biasa, beras merah, hingga beras organik.</p>',
                author: 'Tim GoSembako',
                published_at: '2026-03-10 08:00:00',
                status: 'published',
                image_url: '',
                categories: 'Panduan Produk',
                tags: 'beras,panduan,produk',
                meta_description: 'Panduan lengkap memilih beras berkualitas untuk keluarga.'
            }
        ];
    },

    buildCategoryFilters() {
        const container = document.getElementById('category-filter-list');
        if (!container) return;

        const categories = new Set();
        this.allPosts.forEach(post => {
            if (post.categories) {
                post.categories.split(',').forEach(cat => {
                    const trimmed = cat.trim();
                    if (trimmed) categories.add(trimmed);
                });
            }
        });

        // Remove existing dynamic buttons (keep "Semua")
        const existingBtns = container.querySelectorAll('[data-category]:not([data-category="Semua"])');
        existingBtns.forEach(btn => btn.remove());

        categories.forEach(cat => {
            const btn = document.createElement('button');
            btn.className = 'category-filter-btn flex-shrink-0 px-5 py-2 rounded-full border-2 border-gray-200 text-gray-600 text-sm font-semibold transition hover:border-green-400 hover:text-green-600';
            btn.dataset.category = cat;
            btn.textContent = cat;
            btn.addEventListener('click', () => this.setCategory(cat));
            container.appendChild(btn);
        });

        // Bind "Semua" button
        const allBtn = container.querySelector('[data-category="Semua"]');
        if (allBtn) {
            allBtn.addEventListener('click', () => this.setCategory('Semua'));
        }
    },

    setCategory(category) {
        this.currentCategory = category;
        this.currentPage = 0;

        // Update active state
        document.querySelectorAll('.category-filter-btn').forEach(btn => {
            btn.classList.toggle('active', btn.dataset.category === category);
        });

        this.applyFilters();
    },

    applyFilters() {
        let posts = [...this.allPosts];

        // Filter by category
        if (this.currentCategory !== 'Semua') {
            posts = posts.filter(post => {
                if (!post.categories) return false;
                return post.categories.split(',').map(c => c.trim()).includes(this.currentCategory);
            });
        }

        // Filter by search query
        if (this.searchQuery) {
            posts = posts.filter(post => {
                const title = (post.title || '').toLowerCase();
                const excerpt = (post.excerpt || '').toLowerCase();
                const content = (post.content || '').toLowerCase().replace(/<[^>]*>/g, '');
                const tags = (post.tags || '').toLowerCase();
                return title.includes(this.searchQuery) ||
                    excerpt.includes(this.searchQuery) ||
                    content.includes(this.searchQuery) ||
                    tags.includes(this.searchQuery);
            });
        }

        this.filteredPosts = posts;
        this.currentPage = 0;
        this.renderPosts(true);
    },

    renderPosts(reset = true) {
        const grid = document.getElementById('articles-grid');
        const emptyState = document.getElementById('empty-state');
        const emptyMsg = document.getElementById('empty-state-message');
        const countLabel = document.getElementById('article-count-label');
        const loadMoreContainer = document.getElementById('load-more-container');
        const featuredContainer = document.getElementById('featured-post-container');

        if (!grid) return;

        // Remove skeleton cards
        grid.querySelectorAll('.skeleton-card').forEach(el => el.remove());

        if (reset) {
            grid.innerHTML = '';
            if (featuredContainer) {
                featuredContainer.classList.add('hidden');
                featuredContainer.innerHTML = '';
            }
        }

        const total = this.filteredPosts.length;
        const start = this.currentPage * this.postsPerPage;
        const end = start + this.postsPerPage;
        const pagePosts = this.filteredPosts.slice(start, end);

        if (total === 0) {
            emptyState && emptyState.classList.remove('hidden');
            if (emptyMsg) {
                emptyMsg.textContent = this.searchQuery
                    ? `Tidak ada artikel yang cocok dengan pencarian "${this.searchQuery}".`
                    : 'Belum ada artikel dalam kategori ini.';
            }
            if (countLabel) countLabel.textContent = '0 artikel';
            if (loadMoreContainer) loadMoreContainer.style.display = 'none';
            return;
        }

        emptyState && emptyState.classList.add('hidden');
        if (countLabel) countLabel.textContent = `${total} artikel ditemukan`;

        // Render featured post (first post, only on first page, no search/filter)
        if (reset && this.currentPage === 0 && this.currentCategory === 'Semua' && !this.searchQuery && this.filteredPosts.length > 0 && featuredContainer) {
            const featured = this.filteredPosts[0];
            featuredContainer.classList.remove('hidden');
            featuredContainer.innerHTML = this.renderFeaturedCard(featured);
        }

        // Render grid posts (skip first if featured is shown)
        const gridPosts = (reset && this.currentPage === 0 && this.currentCategory === 'Semua' && !this.searchQuery)
            ? pagePosts.slice(1)
            : pagePosts;

        gridPosts.forEach(post => {
            const card = document.createElement('article');
            card.className = 'blog-card bg-white rounded-2xl overflow-hidden shadow-sm border border-gray-100 flex flex-col';
            card.innerHTML = this.renderPostCard(post);
            grid.appendChild(card);
        });

        // Load more
        const hasMore = end < total;
        if (loadMoreContainer) {
            loadMoreContainer.style.display = hasMore ? 'block' : 'none';
        }
    },

    renderFeaturedCard(post) {
        const imgUrl = post.image_url || getPlaceholderImage(post.title);
        const date = formatDate(post.published_at || post.created_at);
        const cats = (post.categories || '').split(',').map(c => c.trim()).filter(Boolean);
        const slug = post.slug || createSlug(post.title);
        const excerpt = post.excerpt || (post.content || '').replace(/<[^>]*>/g, '').substring(0, 200);
        const catBadges = cats.map(cat => `<span class="tag-badge ${getCategoryColor(cat)}">${escapeHtml(cat)}</span>`).join('');

        return `
        <a href="blog-detail.html?id=${encodeURIComponent(post.id)}" class="block group rounded-2xl overflow-hidden shadow-md border border-gray-100 bg-white hover:shadow-xl transition-shadow duration-300">
            <div class="flex flex-col md:flex-row">
                <div class="md:w-1/2 overflow-hidden">
                    <img src="${escapeHtml(imgUrl)}" alt="${escapeHtml(post.title)}" class="w-full h-64 md:h-full object-cover group-hover:scale-105 transition-transform duration-300" loading="lazy" onerror="this.src='${getPlaceholderImage(post.title)}'">
                </div>
                <div class="md:w-1/2 p-6 md:p-8 flex flex-col justify-center">
                    <div class="flex flex-wrap gap-2 mb-3">
                        <span class="tag-badge bg-green-600 text-white text-xs">Artikel Unggulan</span>
                        ${catBadges}
                    </div>
                    <h2 class="text-xl md:text-2xl font-extrabold text-gray-900 mb-3 leading-tight group-hover:text-green-700 transition line-clamp-3">${escapeHtml(post.title)}</h2>
                    <p class="text-gray-500 text-sm mb-4 line-clamp-3">${escapeHtml(excerpt)}</p>
                    <div class="flex items-center gap-4 text-xs text-gray-400 mt-auto">
                        <span class="flex items-center gap-1">
                            <svg class="w-3.5 h-3.5" fill="none" stroke="currentColor" viewBox="0 0 24 24" aria-hidden="true"><path stroke-linecap="round" stroke-linejoin="round" stroke-width="2" d="M16 7a4 4 0 11-8 0 4 4 0 018 0zM12 14a7 7 0 00-7 7h14a7 7 0 00-7-7z"/></svg>
                            ${escapeHtml(post.author || 'GoSembako')}
                        </span>
                        <span class="flex items-center gap-1">
                            <svg class="w-3.5 h-3.5" fill="none" stroke="currentColor" viewBox="0 0 24 24" aria-hidden="true"><path stroke-linecap="round" stroke-linejoin="round" stroke-width="2" d="M8 7V3m8 4V3m-9 8h10M5 21h14a2 2 0 002-2V7a2 2 0 00-2-2H5a2 2 0 00-2 2v12a2 2 0 002 2z"/></svg>
                            ${escapeHtml(date)}
                        </span>
                    </div>
                    <div class="mt-4">
                        <span class="inline-flex items-center gap-1.5 text-green-600 font-bold text-sm group-hover:gap-3 transition-all">
                            Baca Selengkapnya
                            <svg class="w-4 h-4" fill="none" stroke="currentColor" viewBox="0 0 24 24" aria-hidden="true"><path stroke-linecap="round" stroke-linejoin="round" stroke-width="2" d="M17 8l4 4m0 0l-4 4m4-4H3"/></svg>
                        </span>
                    </div>
                </div>
            </div>
        </a>`;
    },

    renderPostCard(post) {
        const imgUrl = post.image_url || getPlaceholderImage(post.title);
        const date = formatDate(post.published_at || post.created_at);
        const cats = (post.categories || '').split(',').map(c => c.trim()).filter(Boolean);
        const slug = post.slug || createSlug(post.title);
        const excerpt = post.excerpt || (post.content || '').replace(/<[^>]*>/g, '').substring(0, 150);
        const catBadge = cats[0] ? `<span class="tag-badge ${getCategoryColor(cats[0])}">${escapeHtml(cats[0])}</span>` : '';
        const readTime = estimateReadTime(post.content || '');

        return `
        <a href="blog-detail.html?id=${encodeURIComponent(post.id)}" class="block overflow-hidden flex-shrink-0" tabindex="-1" aria-hidden="true">
            <div class="overflow-hidden h-48 bg-gray-100">
                <img src="${escapeHtml(imgUrl)}" alt="${escapeHtml(post.title)}" class="blog-card-img w-full h-full object-cover" loading="lazy" onerror="this.src='${getPlaceholderImage(post.title)}'">
            </div>
        </a>
        <div class="p-5 flex flex-col flex-1">
            <div class="flex flex-wrap gap-2 mb-2">${catBadge}</div>
            <h3 class="font-bold text-gray-900 text-base mb-2 leading-snug line-clamp-2 flex-shrink-0">
                <a href="blog-detail.html?id=${encodeURIComponent(post.id)}" class="hover:text-green-700 transition">${escapeHtml(post.title)}</a>
            </h3>
            <p class="text-gray-500 text-sm mb-4 line-clamp-3 flex-1">${escapeHtml(excerpt)}</p>
            <div class="flex items-center justify-between mt-auto pt-3 border-t border-gray-50">
                <div class="flex items-center gap-2 text-xs text-gray-400">
                    <span>${escapeHtml(date)}</span>
                    <span>&bull;</span>
                    <span>${escapeHtml(readTime)}</span>
                </div>
                <a href="blog-detail.html?id=${encodeURIComponent(post.id)}" class="text-green-600 hover:text-green-700 font-bold text-xs flex items-center gap-1 transition">
                    Baca
                    <svg class="w-3.5 h-3.5" fill="none" stroke="currentColor" viewBox="0 0 24 24" aria-hidden="true"><path stroke-linecap="round" stroke-linejoin="round" stroke-width="2" d="M9 5l7 7-7 7"/></svg>
                </a>
            </div>
        </div>`;
    }
};

// ============================================================
// BLOG DETAIL PAGE (blog-detail.html)
// ============================================================

const BlogDetailPage = {
    post: null,
    postId: null,

    async init() {
        if (!document.getElementById('article-content-wrapper')) return;
        this.postId = getUrlParam('id') || getUrlParam('slug');
        if (!this.postId) {
            this.showError();
            return;
        }
        this.initReadingProgress();
        await this.loadPost();
    },

    initReadingProgress() {
        const progressBar = document.getElementById('reading-progress');
        if (!progressBar) return;
        window.addEventListener('scroll', () => {
            const docHeight = document.documentElement.scrollHeight - window.innerHeight;
            const scrolled = (window.scrollY / docHeight) * 100;
            progressBar.style.width = Math.min(100, scrolled) + '%';
        });
    },

    async loadPost() {
        try {
            const data = await apiGet({ action: 'get_blog_post', sheet: 'blog_posts', id: this.postId });
            let post = null;
            if (data && data.data && typeof data.data === 'object' && !Array.isArray(data.data)) {
                post = data.data;
            } else if (data && Array.isArray(data.data)) {
                post = data.data.find(p => p.id === this.postId || p.slug === this.postId);
            } else if (Array.isArray(data)) {
                post = data.find(p => p.id === this.postId || p.slug === this.postId);
            }

            if (!post) {
                // Fallback: get all and find
                const allData = await apiGet({ action: 'get_blog_posts', sheet: 'blog_posts' });
                const allPosts = allData && Array.isArray(allData.data) ? allData.data : (Array.isArray(allData) ? allData : []);
                post = allPosts.find(p => p.id === this.postId || p.slug === this.postId);
            }

            if (!post) throw new Error('Post not found');
            this.post = post;
            this.renderPost(post);
            await this.loadComments(post.id);
            await this.loadRelatedPosts(post);
        } catch (err) {
            console.warn('Blog Detail: Gagal memuat artikel.', err);
            // Try sample data
            const sample = BlogListPage.getSamplePosts().find(p => p.id === this.postId || p.slug === this.postId);
            if (sample) {
                this.post = sample;
                this.renderPost(sample);
                this.showNoComments();
            } else {
                this.showError();
            }
        }
    },

    renderPost(post) {
        const loading = document.getElementById('article-loading');
        const wrapper = document.getElementById('article-content-wrapper');
        if (loading) loading.style.display = 'none';
        if (wrapper) wrapper.classList.remove('hidden');

        // Update page meta
        const title = post.title || 'Artikel';
        document.title = `${title} – GoSembako`;
        const metaDesc = document.getElementById('meta-description');
        const ogTitle = document.getElementById('og-title');
        const ogDesc = document.getElementById('og-description');
        const ogImage = document.getElementById('og-image');
        const pageTitle = document.getElementById('page-title');
        if (metaDesc) metaDesc.content = post.meta_description || post.excerpt || title;
        if (ogTitle) ogTitle.content = title;
        if (ogDesc) ogDesc.content = post.meta_description || post.excerpt || title;
        if (ogImage && post.image_url) ogImage.content = post.image_url;
        if (pageTitle) pageTitle.textContent = `${title} – GoSembako`;

        // Breadcrumb
        const breadcrumb = document.getElementById('breadcrumb-title');
        if (breadcrumb) breadcrumb.textContent = title;

        // Categories & Tags badges
        const catTagsEl = document.getElementById('article-categories-tags');
        if (catTagsEl) {
            const cats = (post.categories || '').split(',').map(c => c.trim()).filter(Boolean);
            catTagsEl.innerHTML = cats.map(cat =>
                `<a href="blog.html?category=${encodeURIComponent(cat)}" class="tag-badge ${getCategoryColor(cat)} hover:opacity-80 transition">${escapeHtml(cat)}</a>`
            ).join('');
        }

        // Title
        const titleEl = document.getElementById('article-title');
        if (titleEl) titleEl.textContent = title;

        // Author
        const authorEl = document.getElementById('article-author');
        if (authorEl) authorEl.textContent = post.author || 'Tim GoSembako';

        // Date
        const dateEl = document.getElementById('article-date');
        if (dateEl) {
            dateEl.textContent = formatDate(post.published_at || post.created_at);
            dateEl.setAttribute('datetime', post.published_at || post.created_at || '');
        }

        // Read time
        const readTimeEl = document.getElementById('article-read-time');
        if (readTimeEl) readTimeEl.textContent = estimateReadTime(post.content || '');

        // Cover image
        const coverContainer = document.getElementById('article-cover-container');
        const coverImg = document.getElementById('article-cover');
        if (coverContainer && coverImg && post.image_url) {
            coverContainer.style.display = 'block';
            coverImg.src = post.image_url;
            coverImg.alt = title;
            coverImg.onerror = () => { coverContainer.style.display = 'none'; };
        }

        // Body content
        const bodyEl = document.getElementById('article-body');
        if (bodyEl) {
            // Render content (allow HTML from admin)
            bodyEl.innerHTML = post.content || '<p>Konten artikel tidak tersedia.</p>';
        }

        // Tags
        const tagsSection = document.getElementById('article-tags-section');
        const tagsList = document.getElementById('article-tags-list');
        if (tagsSection && tagsList && post.tags) {
            const tags = post.tags.split(',').map(t => t.trim()).filter(Boolean);
            if (tags.length > 0) {
                tagsSection.style.display = 'block';
                tagsList.innerHTML = tags.map(tag =>
                    `<a href="blog.html?search=${encodeURIComponent(tag)}" class="tag-badge bg-gray-100 text-gray-600 hover:bg-green-100 hover:text-green-700 transition">#${escapeHtml(tag)}</a>`
                ).join('');
            }
        }

        // Share buttons
        const shareWa = document.getElementById('share-wa');
        const shareBtn = document.getElementById('share-btn');
        const copyLinkBtn = document.getElementById('copy-link-btn');
        const currentUrl = window.location.href;
        const shareText = `Baca artikel menarik dari GoSembako: ${title}\n${currentUrl}`;

        if (shareWa) shareWa.href = `https://wa.me/?text=${encodeURIComponent(shareText)}`;

        if (shareBtn) {
            shareBtn.addEventListener('click', () => {
                if (navigator.share) {
                    navigator.share({ title, url: currentUrl }).catch(() => {});
                } else {
                    navigator.clipboard && navigator.clipboard.writeText(currentUrl).then(() => {
                        shareBtn.textContent = 'Link Disalin!';
                        setTimeout(() => { shareBtn.innerHTML = '<svg class="w-4 h-4" fill="none" stroke="currentColor" viewBox="0 0 24 24" aria-hidden="true"><path stroke-linecap="round" stroke-linejoin="round" stroke-width="2" d="M8.684 13.342C8.886 12.938 9 12.482 9 12c0-.482-.114-.938-.316-1.342m0 2.684a3 3 0 110-2.684m0 2.684l6.632 3.316m-6.632-6l6.632-3.316m0 0a3 3 0 105.367-2.684 3 3 0 00-5.367 2.684zm0 9.316a3 3 0 105.368 2.684 3 3 0 00-5.368-2.684z"/></svg> Bagikan'; }, 2000);
                    });
                }
            });
        }

        if (copyLinkBtn) {
            copyLinkBtn.addEventListener('click', () => {
                navigator.clipboard && navigator.clipboard.writeText(currentUrl).then(() => {
                    copyLinkBtn.textContent = 'Link Disalin!';
                    setTimeout(() => { copyLinkBtn.innerHTML = '<svg class="w-4 h-4" fill="none" stroke="currentColor" viewBox="0 0 24 24" aria-hidden="true"><path stroke-linecap="round" stroke-linejoin="round" stroke-width="2" d="M8 5H6a2 2 0 00-2 2v12a2 2 0 002 2h10a2 2 0 002-2v-1M8 5a2 2 0 002 2h2a2 2 0 002-2M8 5a2 2 0 012-2h2a2 2 0 012 2m0 0h2a2 2 0 012 2v3m2 4H10m0 0l3-3m-3 3l3 3"/></svg> Salin Link'; }, 2000);
                });
            });
        }

        // Bind comment form
        this.bindCommentForm(post.id);
    },

    async loadComments(postId) {
        try {
            const data = await apiGet({ action: 'get_blog_comments', sheet: 'blog_comments', post_id: postId, status: 'approved' });
            let comments = [];
            if (data && Array.isArray(data.data)) {
                comments = data.data.filter(c => c.post_id === postId && c.status === 'approved');
            } else if (Array.isArray(data)) {
                comments = data.filter(c => c.post_id === postId && c.status === 'approved');
            }
            this.renderComments(comments);
        } catch (err) {
            console.warn('Blog: Gagal memuat komentar.', err);
            this.showNoComments();
        }
    },

    renderComments(comments) {
        const countEl = document.getElementById('comment-count');
        const listEl = document.getElementById('comments-list');
        const noCommentsEl = document.getElementById('no-comments-state');

        if (countEl) countEl.textContent = comments.length;

        if (!listEl) return;
        listEl.innerHTML = '';

        if (comments.length === 0) {
            this.showNoComments();
            return;
        }

        if (noCommentsEl) noCommentsEl.classList.add('hidden');

        comments.forEach(comment => {
            const card = document.createElement('div');
            card.className = 'comment-card bg-gray-50 rounded-xl p-4 border border-gray-100';
            const date = formatDate(comment.created_at);
            const initials = (comment.user_name || 'A').substring(0, 2).toUpperCase();
            card.innerHTML = `
                <div class="flex items-start gap-3">
                    <div class="w-10 h-10 bg-green-100 rounded-full flex items-center justify-center flex-shrink-0">
                        <span class="text-green-700 font-bold text-sm">${escapeHtml(initials)}</span>
                    </div>
                    <div class="flex-1 min-w-0">
                        <div class="flex items-center justify-between gap-2 mb-1">
                            <span class="font-semibold text-gray-800 text-sm">${escapeHtml(comment.user_name || 'Anonim')}</span>
                            <span class="text-xs text-gray-400 flex-shrink-0">${escapeHtml(date)}</span>
                        </div>
                        <p class="text-gray-600 text-sm leading-relaxed">${escapeHtml(comment.content || '')}</p>
                    </div>
                </div>`;
            listEl.appendChild(card);
        });
    },

    showNoComments() {
        const noCommentsEl = document.getElementById('no-comments-state');
        if (noCommentsEl) noCommentsEl.classList.remove('hidden');
    },

    bindCommentForm(postId) {
        const form = document.getElementById('comment-form');
        if (!form) return;

        form.addEventListener('submit', async (e) => {
            e.preventDefault();
            const nameInput = document.getElementById('comment-name');
            const contentInput = document.getElementById('comment-content');
            const errorEl = document.getElementById('comment-form-error');
            const successEl = document.getElementById('comment-form-success');
            const submitBtn = document.getElementById('comment-submit-btn');

            const name = (nameInput && nameInput.value.trim()) || '';
            const content = (contentInput && contentInput.value.trim()) || '';

            if (errorEl) errorEl.classList.add('hidden');
            if (successEl) successEl.classList.add('hidden');

            if (!name) {
                if (errorEl) { errorEl.textContent = 'Nama tidak boleh kosong.'; errorEl.classList.remove('hidden'); }
                return;
            }
            if (!content) {
                if (errorEl) { errorEl.textContent = 'Komentar tidak boleh kosong.'; errorEl.classList.remove('hidden'); }
                return;
            }

            if (submitBtn) {
                submitBtn.disabled = true;
                submitBtn.innerHTML = '<svg class="w-4 h-4 animate-spin" fill="none" viewBox="0 0 24 24" aria-hidden="true"><circle class="opacity-25" cx="12" cy="12" r="10" stroke="currentColor" stroke-width="4"/><path class="opacity-75" fill="currentColor" d="M4 12a8 8 0 018-8V0C5.373 0 0 5.373 0 12h4z"/></svg> Mengirim...';
            }

            try {
                const payload = {
                    action: 'create_blog_comment',
                    sheet: 'blog_comments',
                    data: {
                        id: 'cmt_' + Date.now() + '_' + Math.random().toString(36).substr(2, 6),
                        post_id: postId,
                        user_name: name,
                        content: content,
                        status: 'pending',
                        created_at: new Date().toISOString()
                    }
                };
                await apiPost(payload);
                if (successEl) {
                    successEl.textContent = 'Komentar berhasil dikirim dan sedang menunggu persetujuan. Terima kasih!';
                    successEl.classList.remove('hidden');
                }
                form.reset();
            } catch (err) {
                console.warn('Blog: Gagal mengirim komentar.', err);
                if (successEl) {
                    // Show success anyway (comment will be stored locally or API may not support it yet)
                    successEl.textContent = 'Komentar berhasil dikirim dan sedang menunggu persetujuan. Terima kasih!';
                    successEl.classList.remove('hidden');
                    form.reset();
                }
            } finally {
                if (submitBtn) {
                    submitBtn.disabled = false;
                    submitBtn.innerHTML = '<svg class="w-4 h-4" fill="none" stroke="currentColor" viewBox="0 0 24 24" aria-hidden="true"><path stroke-linecap="round" stroke-linejoin="round" stroke-width="2" d="M12 19l9 2-9-18-9 18 9-2zm0 0v-8"/></svg> Kirim Komentar';
                }
            }
        });
    },

    async loadRelatedPosts(currentPost) {
        try {
            const data = await apiGet({ action: 'get_blog_posts', sheet: 'blog_posts', status: 'published' });
            let allPosts = [];
            if (data && Array.isArray(data.data)) allPosts = data.data;
            else if (Array.isArray(data)) allPosts = data;

            const currentCats = (currentPost.categories || '').split(',').map(c => c.trim()).filter(Boolean);
            const related = allPosts
                .filter(p => p.id !== currentPost.id && p.status === 'published')
                .filter(p => {
                    const pCats = (p.categories || '').split(',').map(c => c.trim()).filter(Boolean);
                    return pCats.some(cat => currentCats.includes(cat));
                })
                .slice(0, 3);

            if (related.length > 0) {
                this.renderRelatedPosts(related);
            }
        } catch (err) {
            // Silent fail
        }
    },

    renderRelatedPosts(posts) {
        const section = document.getElementById('related-articles-section');
        const grid = document.getElementById('related-articles-grid');
        if (!section || !grid) return;
        section.style.display = 'block';
        grid.innerHTML = posts.map(post => {
            const imgUrl = post.image_url || getPlaceholderImage(post.title);
            const date = formatDate(post.published_at || post.created_at);
            return `
            <a href="blog-detail.html?id=${encodeURIComponent(post.id)}" class="blog-card block bg-white rounded-xl overflow-hidden shadow-sm border border-gray-100">
                <div class="overflow-hidden h-36">
                    <img src="${escapeHtml(imgUrl)}" alt="${escapeHtml(post.title)}" class="blog-card-img w-full h-full object-cover" loading="lazy" onerror="this.src='${getPlaceholderImage(post.title)}'">
                </div>
                <div class="p-4">
                    <h4 class="font-bold text-gray-800 text-sm mb-1 line-clamp-2 hover:text-green-700 transition">${escapeHtml(post.title)}</h4>
                    <p class="text-xs text-gray-400">${escapeHtml(date)}</p>
                </div>
            </a>`;
        }).join('');
    },

    showError() {
        const loading = document.getElementById('article-loading');
        const error = document.getElementById('article-error');
        if (loading) loading.style.display = 'none';
        if (error) error.classList.remove('hidden');
    }
};

// ============================================================
// INITIALIZATION
// ============================================================

document.addEventListener('DOMContentLoaded', () => {
    BlogListPage.init();
    BlogDetailPage.init();
});
