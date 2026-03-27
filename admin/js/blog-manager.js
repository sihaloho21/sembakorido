/**
 * Blog Manager JavaScript – Admin GoSembako
 * Mengelola CRUD artikel blog dan moderasi komentar.
 * Menggunakan GAS API via CONFIG.getAdminApiUrl() dan api-helper.js
 */

// ============================================================
// KONFIGURASI
// ============================================================

const BLOG_POSTS_SHEET = 'blog_posts';
const BLOG_COMMENTS_SHEET = 'blog_comments';
let ADMIN_API_URL = '';

// ============================================================
// STATE
// ============================================================

const State = {
    posts: [],
    comments: [],
    filteredPosts: [],
    filteredComments: [],
    editingPostId: null,
    deletingItem: null, // { type: 'post'|'comment', id: string }
};

// ============================================================
// UTILITIES
// ============================================================

function escapeHtml(str) {
    const div = document.createElement('div');
    div.appendChild(document.createTextNode(String(str || '')));
    return div.innerHTML;
}

function createSlug(text) {
    return String(text || '')
        .toLowerCase()
        .replace(/[^a-z0-9\s-]/g, '')
        .trim()
        .replace(/\s+/g, '-')
        .replace(/-+/g, '-');
}

function formatDate(dateStr) {
    if (!dateStr) return '-';
    try {
        const date = new Date(dateStr);
        if (isNaN(date.getTime())) return dateStr;
        return date.toLocaleDateString('id-ID', { day: 'numeric', month: 'short', year: 'numeric' });
    } catch (e) { return dateStr; }
}

function generateId(prefix) {
    return `${prefix}_${Date.now()}_${Math.random().toString(36).substr(2, 8)}`;
}

function showToast(message, type = 'success') {
    const toast = document.getElementById('toast');
    if (!toast) return;
    toast.textContent = message;
    toast.className = `toast toast-${type} show`;
    setTimeout(() => { toast.classList.remove('show'); }, 3500);
}

// ============================================================
// API CALLS
// ============================================================

async function fetchPosts() {
    try {
        const url = ADMIN_API_URL || CONFIG.getAdminApiUrl();
        const data = await apiGet(url, { sheet: BLOG_POSTS_SHEET });
        if (data && Array.isArray(data.data)) return data.data;
        if (Array.isArray(data)) return data;
        return [];
    } catch (err) {
        console.warn('BlogManager: Gagal memuat artikel.', err);
        return getSamplePosts();
    }
}

async function fetchComments() {
    try {
        const url = ADMIN_API_URL || CONFIG.getAdminApiUrl();
        const data = await apiGet(url, { sheet: BLOG_COMMENTS_SHEET });
        if (data && Array.isArray(data.data)) return data.data;
        if (Array.isArray(data)) return data;
        return [];
    } catch (err) {
        console.warn('BlogManager: Gagal memuat komentar.', err);
        return [];
    }
}

async function savePost(postData) {
    const isEdit = Boolean(postData.id && State.editingPostId);
    // Gunakan GASActions agar token admin otomatis disertakan
    if (isEdit) {
        return await GASActions.update(BLOG_POSTS_SHEET, postData.id, postData);
    } else {
        return await GASActions.create(BLOG_POSTS_SHEET, postData);
    }
}

async function deletePost(postId) {
    try {
        await GASActions.delete(BLOG_POSTS_SHEET, postId);
    } catch (err) {
        console.warn('BlogManager: Gagal menghapus artikel.', err);
    }
}

async function updateCommentStatus(commentId, status) {
    try {
        await GASActions.update(BLOG_COMMENTS_SHEET, commentId, { status });
    } catch (err) {
        console.warn('BlogManager: Gagal mengubah status komentar.', err);
    }
}

async function deleteComment(commentId) {
    try {
        await GASActions.delete(BLOG_COMMENTS_SHEET, commentId);
    } catch (err) {
        console.warn('BlogManager: Gagal menghapus komentar.', err);
    }
}

// ============================================================
// API HELPER WRAPPER (compatible with api-helper.js)
// ============================================================

async function apiGet(url, params = {}) {
    const queryString = new URLSearchParams(params).toString();
    const fullUrl = queryString ? `${url}?${queryString}` : url;
    const response = await fetch(fullUrl);
    if (!response.ok) throw new Error(`HTTP error ${response.status}`);
    return response.json();
}

async function apiPost(url, payload) {
    const formData = new URLSearchParams();
    formData.append('json', JSON.stringify(payload));
    const response = await fetch(url, {
        method: 'POST',
        headers: { 'Content-Type': 'application/x-www-form-urlencoded' },
        body: formData.toString()
    });
    if (!response.ok) throw new Error(`HTTP error ${response.status}`);
    return response.json();
}

// ============================================================
// SAMPLE DATA (Fallback)
// ============================================================

function getSamplePosts() {
    return [
        {
            id: 'sample-1',
            title: '5 Tips Hemat Belanja Sembako Bulanan',
            slug: '5-tips-hemat-belanja-sembako-bulanan',
            excerpt: 'Temukan cara cerdas mengatur anggaran belanja sembako agar lebih hemat.',
            content: '<p>Belanja sembako adalah kebutuhan rutin setiap keluarga...</p>',
            author: 'Tim GoSembako',
            published_at: '2026-03-20 10:00:00',
            status: 'published',
            image_url: '',
            categories: 'Tips Belanja',
            tags: 'hemat,sembako,tips',
            meta_description: '5 tips hemat belanja sembako bulanan.'
        },
        {
            id: 'sample-2',
            title: 'Resep Sayur Sop Sederhana dan Bergizi',
            slug: 'resep-sayur-sop-sederhana-bergizi',
            excerpt: 'Sayur sop adalah hidangan klasik yang mudah dibuat dan bergizi tinggi.',
            content: '<p>Sayur sop adalah salah satu masakan Indonesia yang paling digemari...</p>',
            author: 'Chef GoSembako',
            published_at: '2026-03-15 09:00:00',
            status: 'published',
            image_url: '',
            categories: 'Resep Masakan',
            tags: 'resep,sayur,masakan',
            meta_description: 'Resep sayur sop sederhana dan bergizi.'
        },
        {
            id: 'sample-3',
            title: 'Panduan Memilih Beras Berkualitas',
            slug: 'panduan-memilih-beras-berkualitas',
            excerpt: 'Pelajari cara memilih beras yang berkualitas dengan harga terjangkau.',
            content: '<p>Memilih beras yang tepat sangat penting untuk kesehatan keluarga...</p>',
            author: 'Tim GoSembako',
            published_at: '2026-03-10 08:00:00',
            status: 'draft',
            image_url: '',
            categories: 'Panduan Produk',
            tags: 'beras,panduan,produk',
            meta_description: 'Panduan lengkap memilih beras berkualitas.'
        }
    ];
}

// ============================================================
// RENDER POSTS TABLE
// ============================================================

function renderPostsTable(posts) {
    const tbody = document.getElementById('posts-table-body');
    const countEl = document.getElementById('posts-count');
    if (!tbody) return;
    if (countEl) countEl.textContent = posts.length;

    if (posts.length === 0) {
        tbody.innerHTML = `<tr><td colspan="6" class="text-center py-12 text-gray-400">
            <div class="flex flex-col items-center gap-2">
                <svg class="w-10 h-10 text-gray-300" fill="none" stroke="currentColor" viewBox="0 0 24 24" aria-hidden="true"><path stroke-linecap="round" stroke-linejoin="round" stroke-width="1.5" d="M9 12h6m-6 4h6m2 5H7a2 2 0 01-2-2V5a2 2 0 012-2h5.586a1 1 0 01.707.293l5.414 5.414a1 1 0 01.293.707V19a2 2 0 01-2 2z"/></svg>
                Belum ada artikel
            </div>
        </td></tr>`;
        return;
    }

    tbody.innerHTML = posts.map(post => {
        const statusClass = post.status === 'published' ? 'status-published' : 'status-draft';
        const statusLabel = post.status === 'published' ? 'Dipublikasikan' : 'Draft';
        const date = formatDate(post.published_at || post.created_at);
        const cats = (post.categories || '-').split(',').map(c => c.trim()).filter(Boolean).join(', ');

        return `<tr>
            <td>
                <div class="font-semibold text-gray-900 line-clamp-1 max-w-xs">${escapeHtml(post.title || '-')}</div>
                <div class="text-xs text-gray-400 mt-0.5 hidden md:block">${escapeHtml((post.excerpt || '').substring(0, 60))}${(post.excerpt || '').length > 60 ? '...' : ''}</div>
            </td>
            <td class="hidden md:table-cell text-gray-500 text-xs">${escapeHtml(cats)}</td>
            <td class="hidden lg:table-cell text-gray-500 text-xs">${escapeHtml(post.author || '-')}</td>
            <td class="hidden md:table-cell text-gray-500 text-xs">${escapeHtml(date)}</td>
            <td><span class="status-badge ${statusClass}">${escapeHtml(statusLabel)}</span></td>
            <td>
                <div class="flex items-center justify-end gap-2">
                    <a href="../blog-detail.html?id=${encodeURIComponent(post.id)}" target="_blank" rel="noopener noreferrer" class="btn-secondary text-xs px-2.5 py-1.5" title="Lihat artikel">
                        <svg class="w-3.5 h-3.5" fill="none" stroke="currentColor" viewBox="0 0 24 24" aria-hidden="true"><path stroke-linecap="round" stroke-linejoin="round" stroke-width="2" d="M15 12a3 3 0 11-6 0 3 3 0 016 0z"/><path stroke-linecap="round" stroke-linejoin="round" stroke-width="2" d="M2.458 12C3.732 7.943 7.523 5 12 5c4.478 0 8.268 2.943 9.542 7-1.274 4.057-5.064 7-9.542 7-4.477 0-8.268-2.943-9.542-7z"/></svg>
                    </a>
                    <button class="btn-edit" data-action="edit-post" data-id="${escapeHtml(post.id)}" title="Edit artikel">
                        <svg class="w-3.5 h-3.5" fill="none" stroke="currentColor" viewBox="0 0 24 24" aria-hidden="true"><path stroke-linecap="round" stroke-linejoin="round" stroke-width="2" d="M11 5H6a2 2 0 00-2 2v11a2 2 0 002 2h11a2 2 0 002-2v-5m-1.414-9.414a2 2 0 112.828 2.828L11.828 15H9v-2.828l8.586-8.586z"/></svg>
                        Edit
                    </button>
                    <button class="btn-danger" data-action="delete-post" data-id="${escapeHtml(post.id)}" data-title="${escapeHtml(post.title || '')}" title="Hapus artikel">
                        <svg class="w-3.5 h-3.5" fill="none" stroke="currentColor" viewBox="0 0 24 24" aria-hidden="true"><path stroke-linecap="round" stroke-linejoin="round" stroke-width="2" d="M19 7l-.867 12.142A2 2 0 0116.138 21H7.862a2 2 0 01-1.995-1.858L5 7m5 4v6m4-6v6m1-10V4a1 1 0 00-1-1h-4a1 1 0 00-1 1v3M4 7h16"/></svg>
                        Hapus
                    </button>
                </div>
            </td>
        </tr>`;
    }).join('');
}

// ============================================================
// RENDER COMMENTS TABLE
// ============================================================

function renderCommentsTable(comments) {
    const tbody = document.getElementById('comments-table-body');
    const countEl = document.getElementById('comments-count');
    if (!tbody) return;
    if (countEl) countEl.textContent = comments.length;

    if (comments.length === 0) {
        tbody.innerHTML = `<tr><td colspan="6" class="text-center py-12 text-gray-400">
            <div class="flex flex-col items-center gap-2">
                <svg class="w-10 h-10 text-gray-300" fill="none" stroke="currentColor" viewBox="0 0 24 24" aria-hidden="true"><path stroke-linecap="round" stroke-linejoin="round" stroke-width="1.5" d="M8 12h.01M12 12h.01M16 12h.01M21 12c0 4.418-4.03 8-9 8a9.863 9.863 0 01-4.255-.949L3 20l1.395-3.72C3.512 15.042 3 13.574 3 12c0-4.418 4.03-8 9-8s9 3.582 9 8z"/></svg>
                Belum ada komentar
            </div>
        </td></tr>`;
        return;
    }

    tbody.innerHTML = comments.map(comment => {
        const statusClass = comment.status === 'approved' ? 'comment-status-approved' : comment.status === 'rejected' ? 'comment-status-rejected' : 'comment-status-pending';
        const statusLabel = comment.status === 'approved' ? 'Disetujui' : comment.status === 'rejected' ? 'Ditolak' : 'Menunggu';
        const date = formatDate(comment.created_at);
        const post = State.posts.find(p => p.id === comment.post_id);
        const postTitle = post ? post.title : (comment.post_id || '-');

        return `<tr>
            <td class="font-semibold text-gray-800 text-sm">${escapeHtml(comment.user_name || 'Anonim')}</td>
            <td class="hidden md:table-cell text-gray-500 text-xs max-w-xs">
                <span class="line-clamp-1">${escapeHtml(postTitle)}</span>
            </td>
            <td class="text-gray-600 text-sm max-w-xs">
                <span class="line-clamp-2">${escapeHtml(comment.content || '')}</span>
            </td>
            <td class="hidden md:table-cell text-gray-500 text-xs">${escapeHtml(date)}</td>
            <td><span class="status-badge ${statusClass}">${escapeHtml(statusLabel)}</span></td>
            <td>
                <div class="flex items-center justify-end gap-2">
                    ${comment.status !== 'approved' ? `<button class="btn-approve" data-action="approve-comment" data-id="${escapeHtml(comment.id)}" title="Setujui komentar">
                        <svg class="w-3.5 h-3.5" fill="none" stroke="currentColor" viewBox="0 0 24 24" aria-hidden="true"><path stroke-linecap="round" stroke-linejoin="round" stroke-width="2" d="M5 13l4 4L19 7"/></svg>
                        Setujui
                    </button>` : ''}
                    ${comment.status !== 'rejected' ? `<button class="btn-danger" data-action="reject-comment" data-id="${escapeHtml(comment.id)}" title="Tolak komentar">
                        <svg class="w-3.5 h-3.5" fill="none" stroke="currentColor" viewBox="0 0 24 24" aria-hidden="true"><path stroke-linecap="round" stroke-linejoin="round" stroke-width="2" d="M6 18L18 6M6 6l12 12"/></svg>
                        Tolak
                    </button>` : ''}
                    <button class="btn-danger" data-action="delete-comment" data-id="${escapeHtml(comment.id)}" title="Hapus komentar">
                        <svg class="w-3.5 h-3.5" fill="none" stroke="currentColor" viewBox="0 0 24 24" aria-hidden="true"><path stroke-linecap="round" stroke-linejoin="round" stroke-width="2" d="M19 7l-.867 12.142A2 2 0 0116.138 21H7.862a2 2 0 01-1.995-1.858L5 7m5 4v6m4-6v6m1-10V4a1 1 0 00-1-1h-4a1 1 0 00-1 1v3M4 7h16"/></svg>
                    </button>
                </div>
            </td>
        </tr>`;
    }).join('');
}

// ============================================================
// MODAL MANAGEMENT
// ============================================================

function openPostModal(post = null) {
    const modal = document.getElementById('post-modal');
    const modalTitle = document.getElementById('modal-title');
    const form = document.getElementById('post-form');
    const editor = document.getElementById('post-content-editor');
    const errorEl = document.getElementById('post-form-error');

    if (!modal || !form) return;

    State.editingPostId = post ? post.id : null;
    if (modalTitle) modalTitle.textContent = post ? 'Edit Artikel' : 'Tambah Artikel Baru';
    if (errorEl) errorEl.classList.add('hidden');

    // Reset form
    form.reset();
    if (editor) editor.innerHTML = '';

    if (post) {
        document.getElementById('post-id').value = post.id || '';
        document.getElementById('post-title').value = post.title || '';
        document.getElementById('post-slug').value = post.slug || '';
        document.getElementById('post-author').value = post.author || 'Tim GoSembako';
        document.getElementById('post-status').value = post.status || 'published';
        document.getElementById('post-categories').value = post.categories || '';
        document.getElementById('post-tags').value = post.tags || '';
        document.getElementById('post-image-url').value = post.image_url || '';
        document.getElementById('post-excerpt').value = post.excerpt || '';
        document.getElementById('post-meta-description').value = post.meta_description || '';
        if (editor) editor.innerHTML = post.content || '';
        updateMetaDescCount();
    }

    modal.classList.remove('hidden');
    document.body.style.overflow = 'hidden';
    setTimeout(() => { document.getElementById('post-title').focus(); }, 100);
}

function closePostModal() {
    const modal = document.getElementById('post-modal');
    if (modal) modal.classList.add('hidden');
    document.body.style.overflow = '';
    State.editingPostId = null;
}

function openDeleteModal(type, id, title) {
    const modal = document.getElementById('delete-modal');
    const desc = document.getElementById('delete-modal-desc');
    const titleEl = document.getElementById('delete-modal-title');
    if (!modal) return;
    State.deletingItem = { type, id };
    if (titleEl) titleEl.textContent = type === 'post' ? 'Hapus Artikel?' : 'Hapus Komentar?';
    if (desc) desc.textContent = `Artikel "${title || id}" akan dihapus permanen. Tindakan ini tidak dapat dibatalkan.`;
    modal.classList.remove('hidden');
    document.body.style.overflow = 'hidden';
}

function closeDeleteModal() {
    const modal = document.getElementById('delete-modal');
    if (modal) modal.classList.add('hidden');
    document.body.style.overflow = '';
    State.deletingItem = null;
}

// ============================================================
// FILTER & SEARCH
// ============================================================

function applyPostsFilter() {
    const search = (document.getElementById('posts-search')?.value || '').toLowerCase().trim();
    const status = document.getElementById('posts-status-filter')?.value || '';

    State.filteredPosts = State.posts.filter(post => {
        const matchSearch = !search ||
            (post.title || '').toLowerCase().includes(search) ||
            (post.author || '').toLowerCase().includes(search) ||
            (post.categories || '').toLowerCase().includes(search);
        const matchStatus = !status || post.status === status;
        return matchSearch && matchStatus;
    });

    renderPostsTable(State.filteredPosts);
}

function applyCommentsFilter() {
    const search = (document.getElementById('comments-search')?.value || '').toLowerCase().trim();
    const status = document.getElementById('comments-status-filter')?.value || '';

    State.filteredComments = State.comments.filter(comment => {
        const matchSearch = !search ||
            (comment.user_name || '').toLowerCase().includes(search) ||
            (comment.content || '').toLowerCase().includes(search);
        const matchStatus = !status || comment.status === status;
        return matchSearch && matchStatus;
    });

    renderCommentsTable(State.filteredComments);
}

// ============================================================
// RICH TEXT EDITOR
// ============================================================

function initRichEditor() {
    const toolbar = document.getElementById('editor-toolbar');
    const editor = document.getElementById('post-content-editor');
    if (!toolbar || !editor) return;

    toolbar.querySelectorAll('[data-cmd]').forEach(btn => {
        btn.addEventListener('click', (e) => {
            e.preventDefault();
            const cmd = btn.dataset.cmd;
            editor.focus();
            if (cmd === 'h2') {
                document.execCommand('formatBlock', false, 'h2');
            } else if (cmd === 'h3') {
                document.execCommand('formatBlock', false, 'h3');
            } else if (cmd === 'p') {
                document.execCommand('formatBlock', false, 'p');
            } else if (cmd === 'blockquote') {
                document.execCommand('formatBlock', false, 'blockquote');
            } else if (cmd === 'createLink') {
                const url = prompt('Masukkan URL link:');
                if (url) document.execCommand('createLink', false, url);
            } else if (cmd === 'insertImage') {
                const url = prompt('Masukkan URL gambar:');
                if (url) document.execCommand('insertImage', false, url);
            } else {
                document.execCommand(cmd, false, null);
            }
        });
    });
}

function updateMetaDescCount() {
    const textarea = document.getElementById('post-meta-description');
    const counter = document.getElementById('meta-desc-count');
    if (textarea && counter) {
        counter.textContent = textarea.value.length;
    }
}

// ============================================================
// FORM SUBMISSION
// ============================================================

async function handlePostFormSubmit(e) {
    e.preventDefault();
    const form = document.getElementById('post-form');
    const editor = document.getElementById('post-content-editor');
    const errorEl = document.getElementById('post-form-error');
    const submitBtn = document.getElementById('post-submit-btn');

    if (errorEl) errorEl.classList.add('hidden');

    const title = document.getElementById('post-title')?.value.trim() || '';
    const author = document.getElementById('post-author')?.value.trim() || '';
    const content = editor ? editor.innerHTML.trim() : '';

    if (!title) {
        if (errorEl) { errorEl.textContent = 'Judul artikel tidak boleh kosong.'; errorEl.classList.remove('hidden'); }
        document.getElementById('post-title')?.focus();
        return;
    }
    if (!content || content === '<br>') {
        if (errorEl) { errorEl.textContent = 'Konten artikel tidak boleh kosong.'; errorEl.classList.remove('hidden'); }
        document.getElementById('post-content-editor')?.focus();
        return;
    }

    const slug = document.getElementById('post-slug')?.value.trim() || createSlug(title);
    const now = new Date().toISOString();
    const isEdit = Boolean(State.editingPostId);

    const postData = {
        id: isEdit ? State.editingPostId : generateId('post'),
        title,
        slug,
        author: author || 'Tim GoSembako',
        status: document.getElementById('post-status')?.value || 'published',
        categories: document.getElementById('post-categories')?.value.trim() || '',
        tags: document.getElementById('post-tags')?.value.trim() || '',
        image_url: document.getElementById('post-image-url')?.value.trim() || '',
        excerpt: document.getElementById('post-excerpt')?.value.trim() || '',
        meta_description: document.getElementById('post-meta-description')?.value.trim() || '',
        content,
        published_at: isEdit ? (State.posts.find(p => p.id === State.editingPostId)?.published_at || now) : now,
        updated_at: now,
        created_at: isEdit ? (State.posts.find(p => p.id === State.editingPostId)?.created_at || now) : now,
    };

    if (submitBtn) {
        submitBtn.disabled = true;
        submitBtn.innerHTML = '<svg class="w-4 h-4 animate-spin" fill="none" viewBox="0 0 24 24" aria-hidden="true"><circle class="opacity-25" cx="12" cy="12" r="10" stroke="currentColor" stroke-width="4"/><path class="opacity-75" fill="currentColor" d="M4 12a8 8 0 018-8V0C5.373 0 0 5.373 0 12h4z"/></svg> Menyimpan...';
    }

    try {
        const result = await savePost(postData);

        // Periksa apakah GAS mengembalikan error
        if (result && result.error) {
            const errMsg = result.message || result.error || 'GAS mengembalikan error.';
            if (errorEl) { errorEl.textContent = 'Gagal menyimpan: ' + errMsg; errorEl.classList.remove('hidden'); }
            return;
        }

        // Update local state
        if (isEdit) {
            const idx = State.posts.findIndex(p => p.id === State.editingPostId);
            if (idx !== -1) State.posts[idx] = postData;
        } else {
            State.posts.unshift(postData);
        }

        applyPostsFilter();
        closePostModal();
        showToast(isEdit ? 'Artikel berhasil diperbarui!' : 'Artikel berhasil ditambahkan!', 'success');
    } catch (err) {
        console.error('BlogManager savePost error:', err);
        if (errorEl) { errorEl.textContent = 'Gagal menyimpan artikel: ' + (err.message || 'Periksa koneksi dan konfigurasi API.'); errorEl.classList.remove('hidden'); }
    } finally {
        if (submitBtn) {
            submitBtn.disabled = false;
            submitBtn.innerHTML = '<svg class="w-4 h-4" fill="none" stroke="currentColor" viewBox="0 0 24 24" aria-hidden="true"><path stroke-linecap="round" stroke-linejoin="round" stroke-width="2" d="M5 13l4 4L19 7"/></svg> Simpan Artikel';
        }
    }
}

// ============================================================
// EVENT DELEGATION
// ============================================================

function bindTableEvents() {
    // Posts table
    document.getElementById('posts-table-body')?.addEventListener('click', (e) => {
        const btn = e.target.closest('[data-action]');
        if (!btn) return;
        const action = btn.dataset.action;
        const id = btn.dataset.id;

        if (action === 'edit-post') {
            const post = State.posts.find(p => p.id === id);
            if (post) openPostModal(post);
        } else if (action === 'delete-post') {
            openDeleteModal('post', id, btn.dataset.title);
        }
    });

    // Comments table
    document.getElementById('comments-table-body')?.addEventListener('click', async (e) => {
        const btn = e.target.closest('[data-action]');
        if (!btn) return;
        const action = btn.dataset.action;
        const id = btn.dataset.id;

        if (action === 'approve-comment') {
            btn.disabled = true;
            await updateCommentStatus(id, 'approved');
            const idx = State.comments.findIndex(c => c.id === id);
            if (idx !== -1) State.comments[idx].status = 'approved';
            applyCommentsFilter();
            showToast('Komentar disetujui!', 'success');
        } else if (action === 'reject-comment') {
            btn.disabled = true;
            await updateCommentStatus(id, 'rejected');
            const idx = State.comments.findIndex(c => c.id === id);
            if (idx !== -1) State.comments[idx].status = 'rejected';
            applyCommentsFilter();
            showToast('Komentar ditolak.', 'success');
        } else if (action === 'delete-comment') {
            const comment = State.comments.find(c => c.id === id);
            openDeleteModal('comment', id, comment?.user_name || id);
        }
    });
}

// ============================================================
// INITIALIZATION
// ============================================================

async function init() {
    // Get API URL from config
    ADMIN_API_URL = (typeof CONFIG !== 'undefined') ? CONFIG.getAdminApiUrl() : '';

    // Mobile menu toggle
    document.getElementById('mobile-menu-btn')?.addEventListener('click', () => {
        document.getElementById('admin-sidebar')?.classList.toggle('open');
    });

    // Tabs
    document.querySelectorAll('.tab-btn').forEach(btn => {
        btn.addEventListener('click', () => {
            const tab = btn.dataset.tab;
            document.querySelectorAll('.tab-btn').forEach(b => b.classList.remove('active'));
            btn.classList.add('active');
            document.getElementById('tab-content-posts')?.classList.toggle('hidden', tab !== 'posts');
            document.getElementById('tab-content-comments')?.classList.toggle('hidden', tab !== 'comments');
        });
    });

    // New post button
    document.getElementById('btn-new-post')?.addEventListener('click', () => openPostModal());

    // Modal close buttons
    document.getElementById('modal-close-btn')?.addEventListener('click', closePostModal);
    document.getElementById('modal-cancel-btn')?.addEventListener('click', closePostModal);
    document.getElementById('post-modal')?.addEventListener('click', (e) => {
        if (e.target === document.getElementById('post-modal')) closePostModal();
    });

    // Delete modal
    document.getElementById('delete-cancel-btn')?.addEventListener('click', closeDeleteModal);
    document.getElementById('delete-confirm-btn')?.addEventListener('click', async () => {
        const item = State.deletingItem;
        if (!item) return;
        const btn = document.getElementById('delete-confirm-btn');
        if (btn) btn.disabled = true;

        if (item.type === 'post') {
            await deletePost(item.id);
            State.posts = State.posts.filter(p => p.id !== item.id);
            applyPostsFilter();
            showToast('Artikel berhasil dihapus.', 'success');
        } else if (item.type === 'comment') {
            await deleteComment(item.id);
            State.comments = State.comments.filter(c => c.id !== item.id);
            applyCommentsFilter();
            showToast('Komentar berhasil dihapus.', 'success');
        }

        closeDeleteModal();
        if (btn) btn.disabled = false;
    });
    document.getElementById('delete-modal')?.addEventListener('click', (e) => {
        if (e.target === document.getElementById('delete-modal')) closeDeleteModal();
    });

    // Post form
    document.getElementById('post-form')?.addEventListener('submit', handlePostFormSubmit);

    // Auto-generate slug
    document.getElementById('btn-generate-slug')?.addEventListener('click', () => {
        const title = document.getElementById('post-title')?.value || '';
        const slugInput = document.getElementById('post-slug');
        if (slugInput) slugInput.value = createSlug(title);
    });
    document.getElementById('post-title')?.addEventListener('input', (e) => {
        const slugInput = document.getElementById('post-slug');
        if (slugInput && !State.editingPostId) {
            slugInput.value = createSlug(e.target.value);
        }
    });

    // Meta description counter
    document.getElementById('post-meta-description')?.addEventListener('input', updateMetaDescCount);

    // Search & filter
    document.getElementById('posts-search')?.addEventListener('input', applyPostsFilter);
    document.getElementById('posts-status-filter')?.addEventListener('change', applyPostsFilter);
    document.getElementById('comments-search')?.addEventListener('input', applyCommentsFilter);
    document.getElementById('comments-status-filter')?.addEventListener('change', applyCommentsFilter);

    // Rich editor
    initRichEditor();

    // Bind table event delegation
    bindTableEvents();

    // Load data
    const [posts, comments] = await Promise.all([fetchPosts(), fetchComments()]);
    State.posts = posts;
    State.comments = comments;
    State.filteredPosts = posts;
    State.filteredComments = comments;
    renderPostsTable(posts);
    renderCommentsTable(comments);
}

document.addEventListener('DOMContentLoaded', init);
