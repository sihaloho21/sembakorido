/**
 * Configuration Manager
 * Mengelola konfigurasi API URL melalui localStorage
 * Memungkinkan perubahan URL tanpa mengedit kode
 */

const CONFIG = {
    // Default API URLs (Fallback)
    DEFAULTS: {
        MAIN_API: 'https://script.google.com/macros/s/AKfycbwDmh_cc-J9c0cuzcSThFQBdiZ7lpy3oUjDENZhHW-4UszuKwPB20g6OeRccVsgvp79hw/exec',
        ADMIN_API: 'https://script.google.com/macros/s/AKfycbwDmh_cc-J9c0cuzcSThFQBdiZ7lpy3oUjDENZhHW-4UszuKwPB20g6OeRccVsgvp79hw/exec',
        VERSION: '4.2.0' // Updated: GAS v4.2 with form-data support (no CORS preflight)
    },
    
    // Storage keys
    STORAGE_KEYS: {
        MAIN_API: 'sembako_main_api_url',
        ADMIN_API: 'sembako_admin_api_url',
        GAJIAN_CONFIG: 'sembako_gajian_config',
        REWARD_CONFIG: 'sembako_reward_config',
        STORE_CLOSED: 'sembako_store_closed'
    },
    

    
    /**
     * Mendapatkan URL API untuk halaman utama
     * Priority: localStorage (manual) > default
     * @returns {string} URL API
     */
    getMainApiUrl() {
        // Priority 1: Manual dari localStorage
        const manual = localStorage.getItem(this.STORAGE_KEYS.MAIN_API);
        if (manual) return manual;
        
        // Priority 2: Default (Fallback)
        return this.DEFAULTS.MAIN_API;
    },
    
    /**
     * Mendapatkan URL API untuk halaman admin
     * Priority: localStorage (manual) > default
     * @returns {string} URL API
     */
    getAdminApiUrl() {
        // Priority 1: Manual dari localStorage
        const manual = localStorage.getItem(this.STORAGE_KEYS.ADMIN_API);
        if (manual) return manual;
        
        // Priority 2: Default (Fallback)
        return this.DEFAULTS.ADMIN_API;
    },
    
    /**
     * Menyimpan URL API untuk halaman utama
     * @param {string} url - URL API baru
     */
    setMainApiUrl(url) {
        if (url && url.trim()) {
            localStorage.setItem(this.STORAGE_KEYS.MAIN_API, url.trim());
            // ✅ Clear cache saat API berubah
            if (typeof ApiService !== 'undefined') {
                ApiService.clearCache();
            }

            return true;
        }
        return false;
    },
    
    /**
     * Menyimpan URL API untuk halaman admin
     * @param {string} url - URL API baru
     */
    setAdminApiUrl(url) {
        if (url && url.trim()) {
            localStorage.setItem(this.STORAGE_KEYS.ADMIN_API, url.trim());
            // ✅ Clear cache saat API berubah
            if (typeof ApiService !== 'undefined') {
                ApiService.clearCache();
            }

            return true;
        }
        return false;
    },
    
    /**
     * Mereset URL API ke default
     * @param {string} type - 'main' atau 'admin'
     */
    resetToDefault(type = 'main') {
        if (type === 'main') {
            localStorage.removeItem(this.STORAGE_KEYS.MAIN_API);
        } else if (type === 'admin') {
            localStorage.removeItem(this.STORAGE_KEYS.ADMIN_API);
        }
        // ✅ Clear cache saat reset
        if (typeof ApiService !== 'undefined') {
            ApiService.clearCache();
        }
    },
    
    /**
     * Mendapatkan konfigurasi Bayar Gajian
     * @returns {object} Konfigurasi gajian
     */
    getGajianConfig() {
        const saved = localStorage.getItem(this.STORAGE_KEYS.GAJIAN_CONFIG);
        if (saved) {
            try {
                return JSON.parse(saved);
            } catch (e) {
                console.error('Error parsing gajian config', e);
            }
        }
        return {
            targetDay: 7,
            markups: [
                { minDays: 29, rate: 0.20 },
                { minDays: 26, rate: 0.18 },
                { minDays: 23, rate: 0.16 },
                { minDays: 20, rate: 0.14 },
                { minDays: 17, rate: 0.12 },
                { minDays: 14, rate: 0.10 },
                { minDays: 11, rate: 0.08 },
                { minDays: 8, rate: 0.06 },
                { minDays: 3, rate: 0.04 },
                { minDays: 0, rate: 0.02 }
            ],
            defaultMarkup: 0.25
        };
    },

    /**
     * Menyimpan konfigurasi Bayar Gajian
     * @param {object} config - Konfigurasi baru
     */
    setGajianConfig(config) {
        localStorage.setItem(this.STORAGE_KEYS.GAJIAN_CONFIG, JSON.stringify(config));
    },

    /**
     * Mendapatkan konfigurasi Reward Poin
     * @returns {object} Konfigurasi reward
     */
    getRewardConfig() {
        const saved = localStorage.getItem(this.STORAGE_KEYS.REWARD_CONFIG);
        if (saved) {
            try {
                return JSON.parse(saved);
            } catch (e) {
                console.error('Error parsing reward config', e);
            }
        }
        return {
            pointValue: 10000, // 10.000 IDR = 1 point
            minPoint: 0.1,
            manualOverrides: {} // { productName: points }
        };
    },

    /**
     * Menyimpan konfigurasi Reward Poin
     * @param {object} config - Konfigurasi baru
     */
    setRewardConfig(config) {
        localStorage.setItem(this.STORAGE_KEYS.REWARD_CONFIG, JSON.stringify(config));
    },

    /**
     * Mendapatkan status toko (tutup/buka)
     * @returns {boolean} true jika toko tutup
     */
    isStoreClosed() {
        return localStorage.getItem(this.STORAGE_KEYS.STORE_CLOSED) === 'true';
    },

    /**
     * Mengatur status toko
     * @param {boolean} closed - true untuk menutup toko
     */
    setStoreClosed(closed) {
        localStorage.setItem(this.STORAGE_KEYS.STORE_CLOSED, closed ? 'true' : 'false');
    },


    
    /**
     * Mendapatkan semua konfigurasi saat ini
     * @returns {object} Objek berisi semua konfigurasi
     */
    getAllConfig() {
        return {
            mainApi: this.getMainApiUrl(),
            adminApi: this.getAdminApiUrl(),
            gajian: this.getGajianConfig(),
            reward: this.getRewardConfig(),
            storeClosed: this.isStoreClosed()
        };
    }
};
