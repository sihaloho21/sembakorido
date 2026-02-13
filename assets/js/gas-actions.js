/**
 * GASActions - Helper for Google Apps Script Web App API calls
 * Uses FormData with 'json' key to avoid CORS preflight
 * 
 * All write operations (create/update/delete) use POST with FormData
 * to avoid triggering CORS preflight OPTIONS requests.
 */

const GASActions = {
    readStorageValue(keys) {
        for (let i = 0; i < keys.length; i++) {
            const key = keys[i];
            const sessionValue = String(sessionStorage.getItem(key) || '').trim();
            if (sessionValue) return sessionValue;
            const localValue = String(localStorage.getItem(key) || '').trim();
            if (localValue) return localValue;
        }
        return '';
    },

    /**
     * Resolve admin role from storage/input.
     * Priority:
     * 1) session/local storage sembako_admin_role / admin_role
     * 2) settings input (#settings-admin-role)
     * @returns {string}
     */
    getAdminRole() {
        const storageKeys = ['sembako_admin_role', 'admin_role', 'sembako_role'];
        const storedRole = String(this.readStorageValue(storageKeys) || '').trim().toLowerCase();
        if (storedRole) return storedRole;

        const roleInput = document.getElementById('settings-admin-role');
        if (roleInput) {
            const value = String(roleInput.value || '').trim().toLowerCase();
            if (value) {
                sessionStorage.setItem('sembako_admin_role', value);
                localStorage.setItem('sembako_admin_role', value);
                return value;
            }
        }

        return '';
    },

    /**
     * Resolve admin token from storage/input.
     * Priority:
     * 1) session/local storage
     * 2) token input in admin settings page
     * @returns {string}
     */
    getAdminToken() {
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

        const storedToken = this.readStorageValue(storageKeys);
        if (storedToken) return storedToken;

        // Fallback: read from token input in admin settings page if available.
        const tokenInputIds = ['settings-admin-token', 'admin-token-input', 'admin-token'];
        for (let i = 0; i < tokenInputIds.length; i++) {
            const el = document.getElementById(tokenInputIds[i]);
            if (!el) continue;
            const value = String(el.value || '').trim();
            if (value) {
                sessionStorage.setItem('sembako_admin_write_token', value);
                localStorage.removeItem('sembako_admin_write_token');
                localStorage.removeItem('sembako_admin_api_token');
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
        const apiUrl = CONFIG.getAdminApiUrl();
        const token = this.getAdminToken();
        const adminRole = this.getAdminRole();

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
    },

    /**
     * Run due reminder notification for paylater invoices (H-1/overdue).
     * @param {object} data
     * @returns {Promise<object>}
     */
    async runPaylaterDueNotifications(data) {
        return this.post({
            action: 'run_paylater_due_notifications',
            data: data || {}
        });
    },

    /**
     * Install scheduler for due reminder notification (daily/hourly).
     * @param {object} data
     * @returns {Promise<object>}
     */
    async installPaylaterDueNotificationScheduler(data) {
        return this.post({
            action: 'install_paylater_due_notification_scheduler',
            data: data || {}
        });
    },

    /**
     * Remove scheduler for due reminder notification.
     * @returns {Promise<object>}
     */
    async removePaylaterDueNotificationScheduler() {
        return this.post({
            action: 'remove_paylater_due_notification_scheduler',
            data: {}
        });
    },

    /**
     * Get scheduler info for due reminder notification.
     * @returns {Promise<object>}
     */
    async getPaylaterDueNotificationScheduler() {
        return this.post({
            action: 'get_paylater_due_notification_scheduler',
            data: {}
        });
    },

    /**
     * Run paylater post-mortem (default 14 days) and generate rule tuning recommendations.
     * @param {object} data
     * @returns {Promise<object>}
     */
    async runPaylaterPostmortemTwoWeeks(data) {
        return this.post({
            action: 'run_paylater_postmortem_two_weeks',
            data: data || {}
        });
    },

    /**
     * Get paylater postmortem snapshots.
     * @param {object} data
     * @returns {Promise<object>}
     */
    async getPaylaterPostmortemLogs(data) {
        return this.post({
            action: 'get_paylater_postmortem_logs',
            data: data || {}
        });
    }
};
