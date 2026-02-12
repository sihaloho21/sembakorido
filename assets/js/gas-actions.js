/**
 * GASActions - Helper for Google Apps Script Web App API calls
 * Uses FormData with 'json' key to avoid CORS preflight
 * 
 * All write operations (create/update/delete) use POST with FormData
 * to avoid triggering CORS preflight OPTIONS requests.
 */

const GASActions = {
    /**
     * Resolve admin role from URL/localStorage/input.
     * Priority:
     * 1) current URL query (?admin_role=...|role=...)
     * 2) admin API URL query
     * 3) localStorage sembako_admin_role / admin_role
     * 4) settings input (#settings-admin-role)
     * @returns {string}
     */
    getAdminRole() {
        const queryKeys = ['admin_role', 'role', 'ar'];

        try {
            const currentUrl = new URL(window.location.href);
            for (let i = 0; i < queryKeys.length; i++) {
                const value = String(currentUrl.searchParams.get(queryKeys[i]) || '').trim().toLowerCase();
                if (value) {
                    localStorage.setItem('sembako_admin_role', value);
                    return value;
                }
            }
        } catch (error) {
            // Ignore parse issues and continue fallback chain
        }

        try {
            const apiUrl = CONFIG.getAdminApiUrl();
            const url = new URL(apiUrl, window.location.origin);
            for (let i = 0; i < queryKeys.length; i++) {
                const roleFromUrl = String(url.searchParams.get(queryKeys[i]) || '').trim().toLowerCase();
                if (roleFromUrl) return roleFromUrl;
            }
        } catch (error) {
            // Ignore URL parse issues and fallback to localStorage
        }

        const storageKeys = ['sembako_admin_role', 'admin_role', 'sembako_role'];
        for (let i = 0; i < storageKeys.length; i++) {
            const value = String(localStorage.getItem(storageKeys[i]) || '').trim().toLowerCase();
            if (value) return value;
        }

        const roleInput = document.getElementById('settings-admin-role');
        if (roleInput) {
            const value = String(roleInput.value || '').trim().toLowerCase();
            if (value) {
                localStorage.setItem('sembako_admin_role', value);
                return value;
            }
        }

        return '';
    },

    /**
     * Resolve admin token from API URL query or localStorage.
     * Priority:
     * 1) token in admin API URL (?token=...)
     * 2) localStorage sembako_admin_api_token
     * 3) localStorage sembako_admin_token
     * 4) localStorage admin_token
     * @returns {string}
     */
    getAdminToken() {
        const queryKeys = ['token', 'admin_token', 'auth_token'];

        // Priority 0: token from current page URL (useful when admin opens /admin/?token=...)
        try {
            const currentUrl = new URL(window.location.href);
            for (let i = 0; i < queryKeys.length; i++) {
                const value = String(currentUrl.searchParams.get(queryKeys[i]) || '').trim();
                if (value) {
                    localStorage.setItem('sembako_admin_api_token', value);
                    return value;
                }
            }
        } catch (error) {
            // Ignore parse issues and continue fallback chain
        }

        try {
            const apiUrl = CONFIG.getAdminApiUrl();
            const url = new URL(apiUrl, window.location.origin);
            for (let i = 0; i < queryKeys.length; i++) {
                const tokenFromUrl = String(url.searchParams.get(queryKeys[i]) || '').trim();
                if (tokenFromUrl) return tokenFromUrl;
            }
        } catch (error) {
            // Ignore URL parse issues and fallback to localStorage
        }

        const storageKeys = [
            'sembako_admin_api_token',
            'sembako_admin_write_token',
            'sembako_admin_token',
            'admin_token',
            'api_token',
            'sembako_api_token',
            'gos_admin_token',
            'gos_api_token'
        ];

        for (let i = 0; i < storageKeys.length; i++) {
            const key = storageKeys[i];
            const value = String(localStorage.getItem(key) || '').trim();
            if (value) return value;
        }

        // Fallback: read from token input in admin settings page if available.
        const tokenInputIds = ['settings-admin-token', 'admin-token-input', 'admin-token'];
        for (let i = 0; i < tokenInputIds.length; i++) {
            const el = document.getElementById(tokenInputIds[i]);
            if (!el) continue;
            const value = String(el.value || '').trim();
            if (value) {
                localStorage.setItem('sembako_admin_write_token', value);
                return value;
            }
        }

        return '';
    },

    /**
     * Generic POST request using FormData
     * @param {object} payload - Data to send (will be stringified and put in 'json' field)
     * @returns {Promise<object>} Response JSON
     */
    async post(payload) {
        let apiUrl = CONFIG.getAdminApiUrl();
        const token = this.getAdminToken();
        const adminRole = this.getAdminRole();

        // Mirror token into query param to guarantee Apps Script sees it in e.parameter.
        if (token) {
            try {
                const urlObj = new URL(apiUrl, window.location.origin);
                if (!urlObj.searchParams.get('token')) {
                    urlObj.searchParams.set('token', token);
                }
                apiUrl = urlObj.toString();
            } catch (error) {
                // Keep original URL if parsing fails.
            }
        }

        // Duplicate token in payload for backend compatibility.
        const payloadWithToken = {
            ...payload,
            token: token || (payload && payload.token) || '',
            admin_token: token || (payload && payload.admin_token) || '',
            role: adminRole || (payload && payload.role) || '',
            admin_role: adminRole || (payload && payload.admin_role) || ''
        };
        if (payloadWithToken.data && typeof payloadWithToken.data === 'object') {
            payloadWithToken.data = {
                ...payloadWithToken.data,
                token: payloadWithToken.data.token || token || '',
                admin_token: payloadWithToken.data.admin_token || token || '',
                role: payloadWithToken.data.role || adminRole || '',
                admin_role: payloadWithToken.data.admin_role || adminRole || ''
            };
        }
        
        // Create FormData and append JSON payload
        const formData = new FormData();
        formData.append('json', JSON.stringify(payloadWithToken));
        if (token) {
            formData.append('token', token);
            formData.append('admin_token', token);
        }
        if (adminRole) {
            formData.append('role', adminRole);
            formData.append('admin_role', adminRole);
        }
        
        // POST with FormData - no Content-Type header (browser sets multipart/form-data)
        const response = await fetch(apiUrl, {
            method: 'POST',
            body: formData
        });
        
        if (!response.ok) {
            const errorText = await response.text();
            throw new Error(`HTTP ${response.status}: ${errorText}`);
        }
        
        const result = await response.json();
        
        // Check for error in response
        if (result.error) {
            throw new Error(result.error);
        }
        
        return result;
    },
    
    /**
     * Create a new record
     * @param {string} sheet - Sheet name (e.g., 'products', 'banners')
     * @param {object} data - Data to create (must include 'id' if required)
     * @returns {Promise<object>} Response JSON
     */
    async create(sheet, data) {
        return this.post({
            action: 'create',
            sheet: sheet,
            data: data
        });
    },
    
    /**
     * Update an existing record
     * @param {string} sheet - Sheet name (e.g., 'products', 'orders')
     * @param {string} id - Record ID to update
     * @param {object} data - Data to update
     * @returns {Promise<object>} Response JSON
     */
    async update(sheet, id, data) {
        return this.post({
            action: 'update',
            sheet: sheet,
            id: id,
            data: data
        });
    },
    
    /**
     * Delete a record
     * @param {string} sheet - Sheet name (e.g., 'products', 'banners')
     * @param {string} id - Record ID to delete
     * @returns {Promise<object>} Response JSON
     */
    async delete(sheet, id) {
        return this.post({
            action: 'delete',
            sheet: sheet,
            id: id
        });
    },

    /**
     * Upsert one setting key/value in sheet `settings`
     * Requires GAS support: action=upsert_setting
     * @param {string} key - Setting key
     * @param {string|number|boolean} value - Setting value
     * @returns {Promise<object>} Response JSON
     */
    async upsertSetting(key, value) {
        return this.post({
            action: 'upsert_setting',
            sheet: 'settings',
            data: {
                key: String(key),
                value: String(value)
            }
        });
    },

    // ===========================
    // PayLater Actions
    // ===========================

    /**
     * Get credit account by phone.
     * @param {string} phone
     * @returns {Promise<object>}
     */
    async getCreditAccount(phone) {
        return this.post({
            action: 'credit_account_get',
            data: { phone }
        });
    },

    /**
     * Create/update credit account.
     * @param {object} data
     * @returns {Promise<object>}
     */
    async upsertCreditAccount(data) {
        return this.post({
            action: 'credit_account_upsert',
            data: data || {}
        });
    },

    /**
     * Create credit invoice.
     * @param {object} data
     * @returns {Promise<object>}
     */
    async createCreditInvoice(data) {
        return this.post({
            action: 'credit_invoice_create',
            data: data || {}
        });
    },

    /**
     * Apply credit invoice payment.
     * @param {object} data
     * @returns {Promise<object>}
     */
    async payCreditInvoice(data) {
        return this.post({
            action: 'credit_invoice_pay',
            data: data || {}
        });
    },

    /**
     * Apply overdue penalty to one invoice or all overdue invoices.
     * @param {object} data
     * @returns {Promise<object>}
     */
    async applyCreditInvoicePenalty(data) {
        return this.post({
            action: 'credit_invoice_apply_penalty',
            data: data || {}
        });
    },

    /**
     * Set credit account status (active/frozen/locked).
     * @param {object} data
     * @returns {Promise<object>}
     */
    async setCreditAccountStatus(data) {
        return this.post({
            action: 'credit_account_set_status',
            data: data || {}
        });
    },

    /**
     * Increase limit from order profit (idempotent by order_id).
     * @param {object} data
     * @returns {Promise<object>}
     */
    async increaseCreditLimitFromProfit(data) {
        return this.post({
            action: 'credit_limit_from_profit',
            data: data || {}
        });
    },

    /**
     * Process credit limit increase from eligible final orders.
     * @param {object} data
     * @returns {Promise<object>}
     */
    async processPaylaterLimitFromOrders(data) {
        return this.post({
            action: 'process_paylater_limit_from_orders',
            data: data || {}
        });
    },

    /**
     * Install scheduler for automatic paylater limit processing.
     * @param {object} data
     * @returns {Promise<object>}
     */
    async installPaylaterLimitScheduler(data) {
        return this.post({
            action: 'install_paylater_limit_scheduler',
            data: data || {}
        });
    },

    /**
     * Remove scheduler for automatic paylater limit processing.
     * @returns {Promise<object>}
     */
    async removePaylaterLimitScheduler() {
        return this.post({
            action: 'remove_paylater_limit_scheduler',
            data: {}
        });
    },

    /**
     * Get scheduler info for paylater limit processing.
     * @returns {Promise<object>}
     */
    async getPaylaterLimitScheduler() {
        return this.post({
            action: 'get_paylater_limit_scheduler',
            data: {}
        });
    }
};
