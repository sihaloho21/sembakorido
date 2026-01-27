/**
 * Image Slider Module
 * Mengelola slider gambar di modal produk
 * Fitur: navigasi, dots, keyboard support, touch swipe
 */

let currentSlideIndex = 0;
let totalSlides = 0;
let sliderImages = [];

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
        imgEl.src = imgUrl;
        imgEl.alt = `Slide ${index + 1}`;
        imgEl.className = `absolute inset-0 w-full h-full object-cover transition-opacity duration-500 ${index === 0 ? 'opacity-100' : 'opacity-0'}`;
        imgEl.onerror = function() {
            this.src = 'https://placehold.co/300x200?text=Gambar+Error';
        };
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

/**
 * Fallback for slider initialization if images not provided
 * Used when initializeSlider is called but no images available
 */
function initializeSliderFallback() {
    const sliderContainer = document.getElementById('modal-slider');
    const imageEl = document.querySelector('#modal-slider img');

    if (sliderContainer && !imageEl) {
        sliderContainer.innerHTML = `
            <img 
                src="https://placehold.co/300x200?text=Produk" 
                alt="Produk" 
                class="w-full h-full object-cover"
                onerror="this.src='https://placehold.co/300x200?text=Produk'"
            >
        `;
    }

    const counter = document.getElementById('slider-counter');
    if (counter) {
        counter.textContent = '1 / 1';
    }
}

console.log('✅ Image Slider Module Loaded');
