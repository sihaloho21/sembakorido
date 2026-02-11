/**
 * GASActions - Helper for Google Apps Script Web App API calls
 * Uses FormData with 'json' key to avoid CORS preflight
 * 
 * All write operations (create/update/delete) use POST with FormData
 * to avoid triggering CORS preflight OPTIONS requests.
 */

const GASActions = {
    /**
     * Generic POST request using FormData
     * @param {object} payload - Data to send (will be stringified and put in 'json' field)
     * @returns {Promise<object>} Response JSON
     */
    async post(payload) {
        const apiUrl = CONFIG.getAdminApiUrl();
        
        // Create FormData and append JSON payload
        const formData = new FormData();
        formData.append('json', JSON.stringify(payload));
        
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
    }
};
