/**
 * Image Slider Module
 * Mengelola slider gambar di modal produk
 * Fitur: navigasi, dots, keyboard support, touch swipe
 */

var sanitizeUrl = (window.FrontendSanitize && window.FrontendSanitize.sanitizeUrl) || ((url) => String(url || ''));

let currentSlideIndex = 0;
let totalSlides = 0;
let sliderImages = [];
let sliderKeyHandler = null;

/**
 * Initialize image slider dengan array gambar
 * @param {Array<string>} images - Array URL gambar
 */
function initializeSlider(images) {
    if (!images || images.length === 0) {
        console.warn('⚠️ No images provided to slider');
        return;
    }

    sliderImages = images.filter(img => img && img.trim() !== '');
    totalSlides = sliderImages.length;
    currentSlideIndex = 0;

    const sliderContainer = document.getElementById('modal-slider');
    const dotsContainer = document.getElementById('slider-dots');
    const skeletonLoader = document.getElementById('slider-skeleton');

    if (!sliderContainer || !dotsContainer) {
        console.error('❌ Slider containers not found');
        return;
    }

    // Clear previous content
    sliderContainer.innerHTML = '';
    dotsContainer.innerHTML = '';

    // Create image elements
    sliderImages.forEach((imgUrl, index) => {
        const imgEl = document.createElement('img');
        imgEl.src = sanitizeUrl(imgUrl, 'https://placehold.co/300x200?text=Produk');
        imgEl.setAttribute('data-fallback-src', 'https://placehold.co/300x200?text=Produk');
        imgEl.alt = `Slide ${index + 1}`;
        imgEl.className = `absolute inset-0 w-full h-full object-contain object-center bg-white transition-opacity duration-500 ${index === 0 ? 'opacity-100' : 'opacity-0'}`;
        imgEl.style.objectFit = 'contain';
        imgEl.style.objectPosition = 'center';
        imgEl.style.backgroundColor = '#ffffff';
        imgEl.style.padding = '12px';
        imgEl.style.boxSizing = 'border-box';
        imgEl.onload = function() {
            if (skeletonLoader) {
                skeletonLoader.classList.add('hidden');
            }
        };
        sliderContainer.appendChild(imgEl);
    });

    // Create dots
    sliderImages.forEach((_, index) => {
        const dot = document.createElement('button');
        dot.className = `w-2 h-2 rounded-full transition-all ${index === 0 ? 'bg-white w-6' : 'bg-white/50 hover:bg-white/75'}`;
        dot.onclick = () => goToSlide(index);
        dot.title = `Go to slide ${index + 1}`;
        dotsContainer.appendChild(dot);
    });

    // Update counter
    updateSliderCounter();

    // Setup keyboard navigation
    setupKeyboardNavigation();

    // Setup touch/swipe
    setupTouchNavigation();

    console.log(`✅ Slider initialized with ${totalSlides} images`);
}

/**
 * Update slide counter display
 */
function updateSliderCounter() {
    const counter = document.getElementById('slider-counter');
    if (counter) {
        counter.textContent = `${currentSlideIndex + 1} / ${totalSlides}`;
    }
}

/**
 * Go to specific slide
 * @param {number} index - Slide index
 */
function goToSlide(index) {
    if (index < 0 || index >= totalSlides) return;

    const images = document.querySelectorAll('#modal-slider img');
    const dots = document.querySelectorAll('#slider-dots button');

    // Update image visibility
    images.forEach((img, i) => {
        img.classList.toggle('opacity-100', i === index);
        img.classList.toggle('opacity-0', i !== index);
    });

    // Update dot styles
    dots.forEach((dot, i) => {
        if (i === index) {
            dot.classList.add('bg-white', 'w-6');
            dot.classList.remove('bg-white/50', 'hover:bg-white/75');
        } else {
            dot.classList.remove('bg-white', 'w-6');
            dot.classList.add('bg-white/50', 'hover:bg-white/75');
        }
    });

    currentSlideIndex = index;
    updateSliderCounter();
}

/**
 * Navigate to next slide
 */
function nextSlide() {
    if (totalSlides === 0) return;
    const nextIndex = (currentSlideIndex + 1) % totalSlides;
    goToSlide(nextIndex);
}

/**
 * Navigate to previous slide
 */
function prevSlide() {
    if (totalSlides === 0) return;
    const prevIndex = (currentSlideIndex - 1 + totalSlides) % totalSlides;
    goToSlide(prevIndex);
}

/**
 * Setup keyboard navigation (Arrow keys)
 */
function setupKeyboardNavigation() {
    const handleKeyPress = (e) => {
        if (e.key === 'ArrowLeft') {
            prevSlide();
        } else if (e.key === 'ArrowRight') {
            nextSlide();
        }
    };

    // Remove previous listener if exists
    document.removeEventListener('keydown', handleKeyPress);
    document.addEventListener('keydown', handleKeyPress);
}

/**
 * Setup touch/swipe navigation
 */
function setupTouchNavigation() {
    const sliderContainer = document.getElementById('modal-slider');
    if (!sliderContainer) return;

    let startX = 0;
    let endX = 0;

    sliderContainer.addEventListener('touchstart', (e) => {
        startX = e.changedTouches[0].clientX;
    });

    sliderContainer.addEventListener('touchend', (e) => {
        endX = e.changedTouches[0].clientX;
        handleSwipe();
    });

    function handleSwipe() {
        const diff = startX - endX;
        const threshold = 50; // Minimum swipe distance

        if (Math.abs(diff) > threshold) {
            if (diff > 0) {
                // Swipe left → next slide
                nextSlide();
            } else {
                // Swipe right → previous slide
                prevSlide();
            }
        }
    }
}

function setSliderSkeletonVisibility(isVisible) {
    const skeletonLoader = document.getElementById('slider-skeleton');
    if (!skeletonLoader) return;
    skeletonLoader.classList.toggle('hidden', !isVisible);
}

function initializeSlider(images) {
    sliderImages = Array.isArray(images)
        ? images.filter((img) => img && img.trim() !== '')
        : [];
    if (sliderImages.length === 0) {
        sliderImages = ['https://placehold.co/600x600?text=Produk'];
    }

    totalSlides = sliderImages.length;
    currentSlideIndex = 0;

    const sliderContainer = document.getElementById('modal-slider');
    const dotsContainer = document.getElementById('slider-dots');
    const thumbsContainer = document.getElementById('modal-slider-thumbs');
    const prevButton = document.querySelector('#detail-modal [data-action="prev-slide"]');
    const nextButton = document.querySelector('#detail-modal [data-action="next-slide"]');

    if (!sliderContainer || !dotsContainer) {
        console.error('Slider containers not found');
        return;
    }

    sliderContainer.innerHTML = '';
    dotsContainer.innerHTML = '';
    if (thumbsContainer) thumbsContainer.innerHTML = '';
    setSliderSkeletonVisibility(true);

    sliderImages.forEach((imgUrl, index) => {
        const imgEl = document.createElement('img');
        const fallbackSrc = 'https://placehold.co/300x200?text=Produk';
        const safeImgUrl = typeof optimizeImageUrl === 'function'
            ? optimizeImageUrl(sanitizeUrl(imgUrl, fallbackSrc), 900, 900)
            : sanitizeUrl(imgUrl, fallbackSrc);
        imgEl.alt = `Slide ${index + 1}`;
        imgEl.className = `absolute inset-0 w-full h-full object-contain object-center bg-white transition-opacity duration-500 ${index === 0 ? 'opacity-100' : 'opacity-0'}`;
        imgEl.style.objectFit = 'contain';
        imgEl.style.objectPosition = 'center';
        imgEl.style.backgroundColor = '#ffffff';
        imgEl.style.padding = '12px';
        imgEl.style.boxSizing = 'border-box';
        imgEl.style.display = 'block';
        imgEl.setAttribute('data-fallback-src', fallbackSrc);
        imgEl.onload = function () {
            if (index === currentSlideIndex) {
                setSliderSkeletonVisibility(false);
            }
        };
        imgEl.onerror = function () {
            const fallbackUrl = imgEl.getAttribute('data-fallback-src') || fallbackSrc;
            if (imgEl.src !== fallbackUrl) {
                imgEl.src = fallbackUrl;
                return;
            }
            if (index === currentSlideIndex) {
                setSliderSkeletonVisibility(false);
            }
        };
        imgEl.src = safeImgUrl;
        sliderContainer.appendChild(imgEl);

        if (imgEl.complete && index === currentSlideIndex) {
            if (imgEl.naturalWidth > 0) {
                requestAnimationFrame(() => setSliderSkeletonVisibility(false));
            } else if (safeImgUrl !== fallbackSrc) {
                imgEl.src = fallbackSrc;
            }
        }
    });

    sliderImages.forEach((_, index) => {
        const dot = document.createElement('button');
        dot.className = `w-2 h-2 rounded-full transition-all ${index === 0 ? 'bg-white w-6' : 'bg-white/50 hover:bg-white/75'}`;
        dot.onclick = () => goToSlide(index);
        dot.title = `Go to slide ${index + 1}`;
        dotsContainer.appendChild(dot);
    });

    if (thumbsContainer) {
        sliderImages.forEach((imgUrl, index) => {
            const thumb = document.createElement('button');
            thumb.type = 'button';
            thumb.className = `detail-modal-thumb${index === 0 ? ' is-active' : ''}`;
            thumb.setAttribute('aria-label', `Pilih gambar ${index + 1}`);
            thumb.setAttribute('title', `Gambar ${index + 1}`);
            thumb.innerHTML = `
                <img src="${sanitizeUrl(imgUrl, 'https://placehold.co/120x120?text=Produk')}" alt="Thumbnail ${index + 1}" data-fallback-src="https://placehold.co/120x120?text=Produk">
            `;
            thumb.addEventListener('click', () => goToSlide(index));
            thumbsContainer.appendChild(thumb);
        });
    }

    if (prevButton) prevButton.style.display = totalSlides > 1 ? '' : 'none';
    if (nextButton) nextButton.style.display = totalSlides > 1 ? '' : 'none';

    updateSliderCounter();
    setupKeyboardNavigation();
    setupTouchNavigation();
}

function goToSlide(index) {
    if (index < 0 || index >= totalSlides) return;

    const images = document.querySelectorAll('#modal-slider img');
    const dots = document.querySelectorAll('#slider-dots button');
    const thumbs = document.querySelectorAll('#modal-slider-thumbs .detail-modal-thumb');

    images.forEach((img, imageIndex) => {
        img.classList.toggle('opacity-100', imageIndex === index);
        img.classList.toggle('opacity-0', imageIndex !== index);
    });

    dots.forEach((dot, dotIndex) => {
        if (dotIndex === index) {
            dot.classList.add('bg-white', 'w-6');
            dot.classList.remove('bg-white/50', 'hover:bg-white/75');
        } else {
            dot.classList.remove('bg-white', 'w-6');
            dot.classList.add('bg-white/50', 'hover:bg-white/75');
        }
    });

    thumbs.forEach((thumb, thumbIndex) => {
        thumb.classList.toggle('is-active', thumbIndex === index);
    });

    currentSlideIndex = index;
    updateSliderCounter();
}

function setupKeyboardNavigation() {
    if (sliderKeyHandler) {
        document.removeEventListener('keydown', sliderKeyHandler);
    }

    sliderKeyHandler = (event) => {
        if (event.key === 'ArrowLeft') {
            prevSlide();
        } else if (event.key === 'ArrowRight') {
            nextSlide();
        }
    };

    document.addEventListener('keydown', sliderKeyHandler);
}

function setupTouchNavigation() {
    const sliderContainer = document.getElementById('modal-slider');
    if (!sliderContainer) return;
    if (sliderContainer.dataset.touchBound === 'true') return;
    sliderContainer.dataset.touchBound = 'true';

    let startX = 0;
    let endX = 0;

    sliderContainer.addEventListener('touchstart', (event) => {
        startX = event.changedTouches[0].clientX;
    });

    sliderContainer.addEventListener('touchend', (event) => {
        endX = event.changedTouches[0].clientX;
        const diff = startX - endX;
        const threshold = 50;

        if (Math.abs(diff) <= threshold) return;

        if (diff > 0) {
            nextSlide();
        } else {
            prevSlide();
        }
    });
}

function initializeSliderFallback() {
    const sliderContainer = document.getElementById('modal-slider');
    const imageEl = document.querySelector('#modal-slider img');

    if (sliderContainer && !imageEl) {
        sliderContainer.innerHTML = `
            <img 
                src="https://placehold.co/300x200?text=Produk" 
                alt="Produk" 
                class="w-full h-full object-contain object-center bg-white"
                style="object-fit: contain; object-position: center; background: #fff; padding: 12px; box-sizing: border-box;"
                data-fallback-src="https://placehold.co/300x200?text=Produk"
            >
        `;
    }

    setSliderSkeletonVisibility(false);

    const counter = document.getElementById('slider-counter');
    if (counter) {
        counter.textContent = '1 / 1';
    }
}

console.log('✅ Image Slider Module Loaded');
