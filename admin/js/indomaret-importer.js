/* Admin UI for the server-side KlikIndomaret importer. */
(function () {
    'use strict';

    const PREVIEW_ACTION = 'indomaret_import_preview';
    const DRAFT_ACTION = 'indomaret_import_draft';
    const REIMPORT_ACTION = 'indomaret_reimport_preview';
    const APPROVE_ACTION = 'indomaret_approve_product';
    const REJECT_ACTION = 'indomaret_reject_product';
    let latestPreview = null;
    let busy = false;

    const byId = (id) => document.getElementById(id);
    const text = (value) => String(value == null ? '' : value);
    const escape = (value) => text(value).replace(/&/g, '&amp;').replace(/</g, '&lt;').replace(/>/g, '&gt;').replace(/"/g, '&quot;').replace(/'/g, '&#39;');
    const validHttpUrl = (value) => /^https?:\/\//i.test(text(value).trim());
    const money = (value) => {
        const number = Number(String(value == null ? '' : value).replace(/[^0-9-]/g, ''));
        return Number.isFinite(number) && number > 0 ? `Rp ${Math.round(number).toLocaleString('id-ID')}` : '-';
    };
    const statusLabel = (status) => ({ draft_import: 'Draft import', needs_review: 'Perlu ditinjau', approved: 'Approved', rejected: 'Rejected' }[text(status).toLowerCase()] || text(status) || '-');
    const statusClass = (status) => ({ draft_import: 'bg-blue-50 text-blue-700', needs_review: 'bg-amber-50 text-amber-700', approved: 'bg-green-50 text-green-700', rejected: 'bg-red-50 text-red-700' }[text(status).toLowerCase()] || 'bg-gray-100 text-gray-600');

    function notify(message, type) {
        if (typeof window.showAdminToast === 'function') window.showAdminToast(message, type || 'info');
        else console[type === 'error' ? 'error' : 'log'](message);
    }

    function setMessage(message, type) {
        const element = byId('indomaret-import-message');
        if (!element) return;
        element.textContent = message || '';
        element.className = `mt-4 rounded-xl px-4 py-3 text-sm ${message ? '' : 'hidden'} ${type === 'error' ? 'bg-red-50 text-red-700 border border-red-200' : type === 'success' ? 'bg-green-50 text-green-700 border border-green-200' : 'bg-blue-50 text-blue-700 border border-blue-200'}`;
    }

    function setBusy(value) {
        busy = value;
        const buttons = document.querySelectorAll('#indomaret-import-form button, #indomaret-draft-form button');
        buttons.forEach((button) => { button.disabled = value; button.classList.toggle('opacity-60', value); });
    }

    function clearPreview() {
        latestPreview = null;
        const card = byId('indomaret-preview-card');
        if (card) card.classList.add('hidden');
        const form = byId('indomaret-draft-form');
        if (form) form.reset();
        const image = byId('indomaret-preview-image');
        if (image) image.src = 'assets/img/product-placeholder.svg';
        const link = byId('indomaret-source-link');
        if (link) { link.href = '#'; link.textContent = 'Buka halaman sumber'; }
        setMessage('', 'info');
    }

    function fillPreview(response) {
        latestPreview = response;
        const product = response.product || {};
        const card = byId('indomaret-preview-card');
        if (!card) return;
        card.classList.remove('hidden');
        byId('indomaret-draft-name').value = product.nama || '';
        byId('indomaret-reference-price').value = product.harga_referensi ? `${money(product.harga_referensi)} ${product.mata_uang || 'IDR'}` : 'Tidak tersedia';
        byId('indomaret-sale-price').value = product.harga || '';
        byId('indomaret-draft-category').value = product.kategori || '';
        byId('indomaret-draft-stock').value = product.stok || 0;
        byId('indomaret-draft-image').value = product.gambar || product.source_image_url || '';
        byId('indomaret-draft-description').value = product.deskripsi || '';
        const image = byId('indomaret-preview-image');
        const imageUrl = validHttpUrl(product.gambar || product.source_image_url) ? (product.gambar || product.source_image_url) : 'assets/img/product-placeholder.svg';
        image.src = imageUrl;
        image.onerror = () => { image.src = 'assets/img/product-placeholder.svg'; };
        const link = byId('indomaret-source-link');
        link.href = response.source_url || '#';
        link.textContent = response.source_url || 'URL sumber tidak tersedia';
        const meta = byId('indomaret-preview-meta');
        meta.textContent = `${response.source_domain || 'klikindomaret.com'} · Diambil ${response.fetched_at || '-'} · HTTP ${response.source_http_status || '-'}`;
        const status = byId('indomaret-preview-status');
        status.textContent = response.needs_review ? 'Perlu ditinjau' : 'Data lengkap';
        status.className = `px-3 py-1 rounded-full text-xs font-bold ${response.needs_review ? 'bg-amber-50 text-amber-700' : 'bg-green-50 text-green-700'}`;
        const warnings = byId('indomaret-preview-warnings');
        const list = Array.isArray(response.warnings) ? response.warnings : [];
        warnings.textContent = list.length ? `Catatan parser: ${list.join(' · ')}` : '';
        warnings.classList.toggle('hidden', list.length === 0);
        if (response.current_product) {
            warnings.textContent += `${list.length ? ' ' : ''}Import ulang: data ini akan dibandingkan dengan produk saat ini sebelum disimpan.`;
            warnings.classList.remove('hidden');
        }
    }

    async function preview(url, productId) {
        const sourceUrl = text(url || byId('indomaret-source-url')?.value).trim();
        if (!sourceUrl) return setMessage('Masukkan URL produk KlikIndomaret.', 'error');
        if (!/^https:\/\//i.test(sourceUrl)) return setMessage('URL harus menggunakan HTTPS.', 'error');
        if (busy) return;
        setBusy(true);
        setMessage(productId ? 'Mengambil data terbaru untuk import ulang…' : 'Mengambil dan mem-parsing halaman sumber…', 'info');
        try {
            const result = await GASActions.post({ action: productId ? REIMPORT_ACTION : PREVIEW_ACTION, data: productId ? { product_id: productId, url: sourceUrl } : { url: sourceUrl } });
            if (!result || result.success === false) throw new Error(result?.message || result?.error || 'Preview importer gagal.');
            fillPreview(result);
            setMessage('Preview berhasil dibuat. Periksa dan lengkapi field sebelum menyimpan draft.', 'success');
        } catch (error) {
            setMessage(error.message || 'Gagal mengambil data dari KlikIndomaret.', 'error');
        } finally { setBusy(false); }
    }

    async function saveDraft(event) {
        event.preventDefault();
        if (!latestPreview || busy) return;
        const payload = {
            url: latestPreview.source_url,
            nama: byId('indomaret-draft-name').value.trim(),
            deskripsi: byId('indomaret-draft-description').value.trim(),
            gambar: byId('indomaret-draft-image').value.trim(),
            harga: byId('indomaret-sale-price').value,
            kategori: byId('indomaret-draft-category').value.trim(),
            stok: byId('indomaret-draft-stock').value
        };
        if (!payload.nama) return setMessage('Nama produk wajib diisi.', 'error');
        setBusy(true);
        try {
            const result = await GASActions.post({ action: DRAFT_ACTION, data: payload });
            if (!result || result.success === false) throw new Error(result?.message || result?.error || 'Draft gagal disimpan.');
            setMessage(`Draft ${result.product_id || ''} berhasil disimpan dengan status ${statusLabel(result.import_status)}.`, 'success');
            clearPreview();
            await refreshQueue();
        } catch (error) { setMessage(error.message || 'Gagal menyimpan draft.', 'error'); }
        finally { setBusy(false); }
    }

    function renderQueue(products) {
        const body = byId('indomaret-import-queue');
        if (!body) return;
        const imported = (Array.isArray(products) ? products : []).filter((product) => text(product.source_url).trim() && text(product.import_status).trim());
        if (!imported.length) { body.innerHTML = '<tr><td colspan="6" class="px-6 py-8 text-center text-gray-500">Belum ada hasil import.</td></tr>'; return; }
        body.innerHTML = imported.sort((a, b) => text(b.source_fetched_at).localeCompare(text(a.source_fetched_at))).map((product) => {
            const id = escape(product.id);
            const status = text(product.import_status).toLowerCase();
            const canDecide = status === 'draft_import' || status === 'needs_review';
            const source = escape(product.source_url);
            return `<tr class="border-t border-gray-100 align-top"><td class="px-6 py-4"><div class="flex items-center gap-3"><img src="${escape(validHttpUrl(product.gambar) ? product.gambar : 'assets/img/product-placeholder.svg')}" onerror="this.src='assets/img/product-placeholder.svg'" class="w-12 h-12 rounded-lg object-cover bg-gray-50" alt=""><div><p class="font-bold text-gray-800">${escape(product.nama || '(tanpa nama)')}</p><p class="text-xs text-gray-500">${escape(product.id)}</p></div></div></td><td class="px-6 py-4 text-sm">${money(product.source_reference_price)}<p class="text-xs text-gray-500">${escape(product.source_reference_currency || 'IDR')}</p></td><td class="px-6 py-4"><input data-import-queue-price="${id}" type="number" min="1" value="${escape(product.harga || '')}" class="w-32 p-2 border border-gray-200 rounded-lg text-sm" ${canDecide ? '' : 'disabled'}></td><td class="px-6 py-4"><span class="px-2 py-1 rounded-full text-xs font-bold ${statusClass(status)}">${escape(statusLabel(status))}</span><p class="text-xs text-gray-500 mt-2 max-w-xs">${escape(product.import_notes || '')}</p></td><td class="px-6 py-4 max-w-xs"><a href="${source}" target="_blank" rel="noopener noreferrer" class="text-xs text-blue-700 break-all">${source}</a><p class="text-xs text-gray-500 mt-1">${escape(product.source_fetched_at || '')}</p></td><td class="px-6 py-4 text-right whitespace-nowrap">${canDecide ? `<button type="button" data-import-action="approve" data-product-id="${id}" class="px-3 py-2 rounded-lg bg-green-600 hover:bg-green-700 text-white text-xs font-bold">Approve</button><button type="button" data-import-action="reject" data-product-id="${id}" class="ml-2 px-3 py-2 rounded-lg bg-red-50 hover:bg-red-100 text-red-700 text-xs font-bold">Reject</button>` : ''}<button type="button" data-import-action="reimport" data-product-id="${id}" data-source-url="${source}" class="block ml-auto mt-2 text-xs font-bold text-blue-700 hover:underline">Import ulang</button></td></tr>`;
        }).join('');
    }

    async function refreshQueue() {
        if (typeof window.fetchAdminProducts === 'function') {
            await window.fetchAdminProducts();
            renderQueue(window.allProducts || []);
        } else renderQueue([]);
    }

    async function decide(action, productId) {
        if (busy) return;
        const priceInput = Array.from(document.querySelectorAll('[data-import-queue-price]')).find((input) => input.getAttribute('data-import-queue-price') === productId);
        const data = { product_id: productId };
        if (action === APPROVE_ACTION) {
            data.harga = priceInput?.value || '';
            if (!data.harga || Number(data.harga) <= 0) return notify('Harga jual internal wajib diisi sebelum approval.', 'error');
        } else {
            data.reason = window.prompt('Alasan penolakan (opsional):', 'Data sumber tidak lengkap') || 'Ditolak admin';
        }
        setBusy(true);
        try {
            const result = await GASActions.post({ action, data });
            if (!result || result.success === false) throw new Error(result?.message || result?.error || 'Aksi importer gagal.');
            notify(result.message || 'Perubahan berhasil disimpan.', 'success');
            await refreshQueue();
        } catch (error) { notify(error.message || 'Aksi importer gagal.', 'error'); }
        finally { setBusy(false); }
    }

    function bind() {
        byId('indomaret-import-form')?.addEventListener('submit', (event) => { event.preventDefault(); preview(); });
        byId('indomaret-draft-form')?.addEventListener('submit', saveDraft);
        document.addEventListener('click', (event) => {
            const trigger = event.target.closest('[data-import-action], [data-action="indomaret-clear-preview"], [data-action="indomaret-refresh-queue"]');
            if (!trigger) return;
            if (trigger.dataset.action === 'indomaret-clear-preview') return clearPreview();
            if (trigger.dataset.action === 'indomaret-refresh-queue') return refreshQueue();
            const productId = trigger.dataset.productId;
            if (trigger.dataset.importAction === 'approve') return decide(APPROVE_ACTION, productId);
            if (trigger.dataset.importAction === 'reject') return decide(REJECT_ACTION, productId);
            if (trigger.dataset.importAction === 'reimport') return preview(trigger.dataset.sourceUrl, productId);
        });
    }

    window.IndomaretImporter = { refreshQueue, preview };
    if (document.readyState === 'loading') document.addEventListener('DOMContentLoaded', bind); else bind();
})();
