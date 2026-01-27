/**
 * Configuration for "Bayar Gajian" payment method.
 * Fetches configuration from CONFIG manager or uses defaults.
 */
function getGajianConfig() {
    if (typeof CONFIG !== 'undefined' && CONFIG.getGajianConfig) {
        return CONFIG.getGajianConfig();
    }
    // Fallback default if CONFIG is not available
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
}

/**
 * Calculates the price for "Bayar Gajian" based on the current date.
 * @param {number} cashPrice - The original cash price of the product.
 * @returns {object} - An object containing the calculated price, days left, and markup percentage.
 */
function calculateGajianPrice(cashPrice) {
    const config = getGajianConfig();
    const now = new Date();
    // Offset for WIB (UTC+7)
    const wibOffset = 7 * 60 * 60 * 1000;
    const nowWIB = new Date(now.getTime() + wibOffset);
    
    // Set target date to the next payday
    let targetDate = new Date(nowWIB.getFullYear(), nowWIB.getMonth(), config.targetDay);
    if (nowWIB.getDate() > config.targetDay) {
        targetDate.setMonth(targetDate.getMonth() + 1);
    }
    
    const diffTime = targetDate - nowWIB;
    const diffDays = Math.ceil(diffTime / (1000 * 60 * 60 * 24));
    
    // Determine markup based on days left
    // The markups are sorted by minDays descending in the UI/Config
    let markup = config.defaultMarkup;
    
    // Sort markups by minDays descending to find the first matching range
    const sortedMarkups = [...config.markups].sort((a, b) => b.minDays - a.minDays);
    
    for (const range of sortedMarkups) {
        if (diffDays >= range.minDays) {
            markup = range.rate;
            break;
        }
    }
    
    return {
        price: Math.round(cashPrice * (1 + markup)),
        daysLeft: diffDays,
        markupPercent: (markup * 100).toFixed(0)
    };
}

/**
 * Calculates reward points based on price and category.
 * Rules:
 * - 1 point = Rp 10,000 (configurable)
 * - Min point = 0.1 (configurable)
 * - Manual overrides supported
 * @param {number} price - The price of the product.
 * @param {string} productName - The name of the product for manual overrides.
 * @returns {number} - Calculated reward points.
 */
function calculateRewardPoints(price, productName) {
    let config = {
        pointValue: 10000,
        minPoint: 0.1,
        manualOverrides: {}
    };

    if (typeof CONFIG !== 'undefined' && CONFIG.getRewardConfig) {
        config = CONFIG.getRewardConfig();
    }

    // Check for manual override
    if (productName && config.manualOverrides && config.manualOverrides[productName] !== undefined) {
        return parseFloat(config.manualOverrides[productName]);
    }

    // Automatic calculation: 1 point per pointValue (default 10,000)
    // Minimal pembelanjaan 10.000 mendapatkan 1 poin, berlaku kelipatannya
    let points = 0;
    if (price >= config.pointValue) {
        points = Math.floor(price / config.pointValue);
    } else if (price > 0) {
        // If price is below pointValue but above 0, check if we should give minPoint
        // However, based on "minimal pembelanjaan 10.000", we might want to return 0
        // But the user also said "desimal poin atau poin paling kecil adalah, 0.1 = Rp 100"
        // So if price is 100, they get 0.1 points.
        points = price / config.pointValue;
    }
    
    // Apply minimum floor for decimal points
    if (points < config.minPoint && points > 0) {
        points = config.minPoint;
    }
    
    // Round to 1 decimal place
    return Math.round(points * 10) / 10;
}

// Exporting for use in other scripts
if (typeof window !== 'undefined') {
    window.calculateGajianPrice = calculateGajianPrice;
    window.calculateRewardPoints = calculateRewardPoints;
}
