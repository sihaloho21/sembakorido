/**
 * API Helper untuk GoSembako
 * Menggunakan URLSearchParams untuk menghindari CORS preflight
 * 
 * application/x-www-form-urlencoded adalah "simple content-type"
 * yang TIDAK trigger preflight OPTIONS request
 */

/**
 * Helper function untuk POST request tanpa trigger preflight
 * @param {string} url - API URL
 * @param {object} payload - Data yang akan dikirim (akan di-convert ke JSON)
 * @returns {Promise<object>} Response JSON
 */
async function apiPost(url, payload) {
    // Encode payload sebagai form data dengan key 'json'
    // GAS akan membaca dari e.parameter.json
    const formData = new URLSearchParams();
    formData.append('json', JSON.stringify(payload));
    
    const response = await fetch(url, {
        method: 'POST',
        headers: {
            'Content-Type': 'application/x-www-form-urlencoded'
        },
        body: formData.toString()
    });
    
    if (!response.ok) {
        throw new Error(`HTTP error! status: ${response.status}`);
    }
    
    return response.json();
}

/**
 * Helper function untuk GET request
 * @param {string} url - API URL
 * @param {object} params - Query parameters
 * @returns {Promise<object>} Response JSON
 */
async function apiGet(url, params = {}) {
    const queryString = new URLSearchParams(params).toString();
    const fullUrl = queryString ? `${url}?${queryString}` : url;
    
    const response = await fetch(fullUrl);
    
    if (!response.ok) {
        throw new Error(`HTTP error! status: ${response.status}`);
    }
    
    return response.json();
}
