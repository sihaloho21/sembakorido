/**
 * API Service Wrapper
 * Provides caching, retry logic, error handling, and request deduplication
 * Solves rate limit (429) errors and improves performance
 */

const ApiService = {
    // Cache storage
    cache: new Map(),
    
    // Pending requests to prevent duplicates
    pendingRequests: new Map(),
    
    // Default cache duration (5 minutes)
    DEFAULT_CACHE_DURATION: 5 * 60 * 1000,
    
    // Default retry configuration
    MAX_RETRIES: 3,
    INITIAL_RETRY_DELAY: 1000, // 1 second
    
    /**
     * Clear all cached data
     * Call this when API URL changes
     */
    clearCache() {
        this.cache.clear();
        this.pendingRequests.clear();
        console.log('🧹 [ApiService] Cache cleared successfully');
    },
    
    /**
     * Clear cache for specific endpoint
     * @param {string} endpoint - Endpoint to clear (e.g., '?sheet=products')
     */
    clearCacheForEndpoint(endpoint) {
        const baseUrl = CONFIG.getMainApiUrl();
        const url = `${baseUrl}${endpoint}`;
        const cacheKey = this._generateCacheKey(url, {});
        this.cache.delete(cacheKey);
        console.log('🧹 [ApiService] Cache cleared for endpoint:', endpoint);
    },
    
    /**
     * Main fetch method with caching and retry logic
     * @param {string} endpoint - API endpoint (e.g., '?sheet=products')
     * @param {object} options - Fetch options
     * @param {boolean} options.cache - Enable caching (default: true)
     * @param {number} options.cacheDuration - Cache duration in ms (default: 5 minutes)
     * @param {number} options.maxRetries - Max retry attempts (default: 3)
     * @returns {Promise} Response data
     */
    async fetch(endpoint, options = {}) {
        const url = `${CONFIG.getMainApiUrl()}${endpoint}`;
        const cacheKey = this._generateCacheKey(url, options);
        
        // Check if caching is enabled (default: true)
        const cacheEnabled = options.cache !== false;
        
        // Check cache first
        if (cacheEnabled && this.cache.has(cacheKey)) {
            const cached = this.cache.get(cacheKey);
            const cacheDuration = options.cacheDuration || this.DEFAULT_CACHE_DURATION;
            
            if (Date.now() - cached.timestamp < cacheDuration) {
                console.log('📦 [ApiService] Using cached data:', endpoint);
                return cached.data;
            } else {
                // Cache expired, remove it
                console.log('⏰ [ApiService] Cache expired:', endpoint);
                this.cache.delete(cacheKey);
            }
        }
        
        // Check if there's already a pending request for this endpoint
        if (this.pendingRequests.has(cacheKey)) {
            console.log('⏳ [ApiService] Waiting for pending request:', endpoint);
            return this.pendingRequests.get(cacheKey);
        }
        
        // Create new request with retry logic
        const requestPromise = this._fetchWithRetry(url, options);
        this.pendingRequests.set(cacheKey, requestPromise);
        
        try {
            const data = await requestPromise;
            
            // Cache the result if caching is enabled
            if (cacheEnabled) {
                this.cache.set(cacheKey, {
                    data,
                    timestamp: Date.now()
                });
                console.log('💾 [ApiService] Data cached:', endpoint);
            }
            
            return data;
        } catch (error) {
            console.error('❌ [ApiService] Request failed:', endpoint, error);
            throw error;
        } finally {
            // Remove from pending requests
            this.pendingRequests.delete(cacheKey);
        }
    },
    
    /**
     * Fetch with retry logic and exponential backoff
     * @private
     */
    async _fetchWithRetry(url, options) {
        const maxRetries = options.maxRetries || this.MAX_RETRIES;
        let lastError;
        
        for (let attempt = 0; attempt < maxRetries; attempt++) {
            try {
                console.log(`🌐 [ApiService] Request attempt ${attempt + 1}/${maxRetries}:`, url);
                
                const response = await fetch(url, {
                    method: options.method || 'GET',
                    mode: 'cors',
                    headers: options.headers || {},
                    body: options.body
                });
                
                // Handle rate limit (429)
                if (response.status === 429) {
                    if (attempt < maxRetries - 1) {
                        const waitTime = this._calculateBackoff(attempt);
                        console.warn(`⏱️ [ApiService] Rate limited (429), retrying in ${waitTime}ms...`);
                        await this._sleep(waitTime);
                        continue;
                    } else {
                        throw new Error('Rate limit exceeded. Please try again later.');
                    }
                }
                
                // Handle other HTTP errors
                if (!response.ok) {
                    throw new Error(`HTTP ${response.status}: ${response.statusText}`);
                }
                
                // Success
                const data = await response.json();
                console.log('✅ [ApiService] Request successful:', url);
                return data;
                
            } catch (error) {
                lastError = error;
                
                // If it's a network error and we have retries left, try again
                if (attempt < maxRetries - 1 && this._isRetryableError(error)) {
                    const waitTime = this._calculateBackoff(attempt);
                    console.warn(`🔄 [ApiService] Retry ${attempt + 1}/${maxRetries} after ${waitTime}ms:`, error.message);
                    await this._sleep(waitTime);
                    continue;
                }
                
                // No more retries, throw error
                break;
            }
        }
        
        throw lastError;
    },
    
    /**
     * Calculate exponential backoff delay
     * @private
     */
    _calculateBackoff(attempt) {
        // Exponential backoff: 1s, 2s, 4s, 8s, ...
        return this.INITIAL_RETRY_DELAY * Math.pow(2, attempt);
    },
    
    /**
     * Check if error is retryable
     * @private
     */
    _isRetryableError(error) {
        // Retry on network errors, timeouts, etc.
        return error.message.includes('fetch') || 
               error.message.includes('network') ||
               error.message.includes('timeout');
    },
    
    /**
     * Sleep utility
     * @private
     */
    _sleep(ms) {
        return new Promise(resolve => setTimeout(resolve, ms));
    },
    
    /**
     * Generate cache key from URL and options
     * @private
     */
    _generateCacheKey(url, options) {
        const method = options.method || 'GET';
        const body = options.body || '';
        return `${method}:${url}:${body}`;
    },
    
    /**
     * Clear all cache
     */
    clearCache() {
        const size = this.cache.size;
        this.cache.clear();
        console.log(`🗑️ [ApiService] Cache cleared: ${size} entries removed`);
        return size;
    },
    
    /**
     * Clear cache for specific endpoint
     */
    clearCacheForEndpoint(endpoint) {
        const url = `${CONFIG.getMainApiUrl()}${endpoint}`;
        let cleared = 0;
        
        for (const [key, value] of this.cache.entries()) {
            if (key.includes(url)) {
                this.cache.delete(key);
                cleared++;
            }
        }
        
        console.log(`🗑️ [ApiService] Cache cleared for ${endpoint}: ${cleared} entries`);
        return cleared;
    },
    
    /**
     * Get cache statistics
     */
    getCacheStats() {
        const stats = {
            totalEntries: this.cache.size,
            pendingRequests: this.pendingRequests.size,
            entries: []
        };
        
        for (const [key, value] of this.cache.entries()) {
            const age = Date.now() - value.timestamp;
            stats.entries.push({
                key,
                age: Math.round(age / 1000), // in seconds
                size: JSON.stringify(value.data).length
            });
        }
        
        return stats;
    },
    
    /**
     * POST request helper
     */
    async post(endpoint, data, options = {}) {
        return this.fetch(endpoint, {
            ...options,
            method: 'POST',
            headers: {
                'Content-Type': 'application/json',
                ...options.headers
            },
            body: JSON.stringify(data),
            cache: false // Don't cache POST requests by default
        });
    },
    
    /**
     * PATCH request helper
     */
    async patch(endpoint, data, options = {}) {
        return this.fetch(endpoint, {
            ...options,
            method: 'PATCH',
            headers: {
                'Content-Type': 'application/json',
                ...options.headers
            },
            body: JSON.stringify(data),
            cache: false // Don't cache PATCH requests by default
        });
    },
    
    /**
     * GET request helper (with caching)
     */
    async get(endpoint, options = {}) {
        return this.fetch(endpoint, {
            ...options,
            method: 'GET'
        });
    }
};

// Make it globally available
window.ApiService = ApiService;
