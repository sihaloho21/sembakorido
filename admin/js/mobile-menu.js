/**
 * Mobile Menu Handler
 * Manages hamburger menu and sidebar toggle for mobile devices
 */

class MobileMenuHandler {
    constructor() {
        this.sidebarOpen = false;
        this.init();
    }

    /**
     * Initialize mobile menu
     */
    init() {
        this.createHamburgerButton();
        this.createSidebarOverlay();
        this.attachEventListeners();
        this.handleResize();
    }

    /**
     * Create hamburger menu button
     */
    createHamburgerButton() {
        const header = document.querySelector('header') || document.querySelector('nav');
        if (!header) return;

        // Check if hamburger already exists
        if (document.querySelector('.hamburger-menu')) return;

        const hamburger = document.createElement('button');
        hamburger.className = 'hamburger-menu show-mobile';
        hamburger.setAttribute('aria-label', 'Toggle menu');
        hamburger.setAttribute('aria-expanded', 'false');
        hamburger.innerHTML = `
            <svg class="hamburger-icon" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                <path stroke-linecap="round" stroke-linejoin="round" stroke-width="2" d="M4 6h16M4 12h16M4 18h16"></path>
            </svg>
            <svg class="close-icon hidden" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                <path stroke-linecap="round" stroke-linejoin="round" stroke-width="2" d="M6 18L18 6M6 6l12 12"></path>
            </svg>
        `;

        hamburger.addEventListener('click', () => this.toggleSidebar());

        // Insert at the beginning of header
        header.insertBefore(hamburger, header.firstChild);
    }

    /**
     * Create sidebar overlay for mobile
     */
    createSidebarOverlay() {
        if (document.querySelector('.sidebar-overlay')) return;

        const overlay = document.createElement('div');
        overlay.className = 'sidebar-overlay';
        overlay.addEventListener('click', () => this.closeSidebar());

        document.body.appendChild(overlay);
    }

    /**
     * Toggle sidebar visibility
     */
    toggleSidebar() {
        if (this.sidebarOpen) {
            this.closeSidebar();
        } else {
            this.openSidebar();
        }
    }

    /**
     * Open sidebar
     */
    openSidebar() {
        const sidebar = document.querySelector('aside');
        const overlay = document.querySelector('.sidebar-overlay');
        const hamburger = document.querySelector('.hamburger-menu');

        if (sidebar) {
            sidebar.classList.add('active');
            this.sidebarOpen = true;
        }

        if (overlay) {
            overlay.classList.add('active');
        }

        if (hamburger) {
            hamburger.setAttribute('aria-expanded', 'true');
            hamburger.querySelector('.hamburger-icon').classList.add('hidden');
            hamburger.querySelector('.close-icon').classList.remove('hidden');
        }

        // Prevent body scroll
        document.body.style.overflow = 'hidden';
    }

    /**
     * Close sidebar
     */
    closeSidebar() {
        const sidebar = document.querySelector('aside');
        const overlay = document.querySelector('.sidebar-overlay');
        const hamburger = document.querySelector('.hamburger-menu');

        if (sidebar) {
            sidebar.classList.remove('active');
            this.sidebarOpen = false;
        }

        if (overlay) {
            overlay.classList.remove('active');
        }

        if (hamburger) {
            hamburger.setAttribute('aria-expanded', 'false');
            hamburger.querySelector('.hamburger-icon').classList.remove('hidden');
            hamburger.querySelector('.close-icon').classList.add('hidden');
        }

        // Restore body scroll
        document.body.style.overflow = '';
    }

    /**
     * Close sidebar when sidebar item is clicked
     */
    attachEventListeners() {
        // Close sidebar when clicking on a sidebar item
        const sidebarItems = document.querySelectorAll('aside a, aside button');
        sidebarItems.forEach(item => {
            item.addEventListener('click', () => {
                // Close sidebar on mobile
                if (window.innerWidth <= 768) {
                    this.closeSidebar();
                }
            });
        });

        // Close sidebar on escape key
        document.addEventListener('keydown', (e) => {
            if (e.key === 'Escape' && this.sidebarOpen) {
                this.closeSidebar();
            }
        });

        // Handle window resize
        window.addEventListener('resize', () => this.handleResize());
    }

    /**
     * Handle window resize
     */
    handleResize() {
        const hamburger = document.querySelector('.hamburger-menu');
        const sidebar = document.querySelector('aside');

        if (window.innerWidth > 768) {
            // Desktop view
            if (hamburger) {
                hamburger.style.display = 'none';
            }
            if (sidebar) {
                sidebar.classList.remove('active');
            }
            const overlay = document.querySelector('.sidebar-overlay');
            if (overlay) {
                overlay.classList.remove('active');
            }
            document.body.style.overflow = '';
        } else {
            // Mobile view
            if (hamburger) {
                hamburger.style.display = 'block';
            }
        }
    }
}

// Initialize when DOM is ready
if (document.readyState === 'loading') {
    document.addEventListener('DOMContentLoaded', () => {
        new MobileMenuHandler();
    });
} else {
    new MobileMenuHandler();
}
