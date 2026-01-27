/**
 * Load loyalty points from user_points sheet
 */
async function loadLoyaltyPoints(user) {
    try {
        const apiUrl = CONFIG.getMainApiUrl();
        const normalizedPhone = normalizePhoneTo08(user.whatsapp);
        
        if (!normalizedPhone) {
            console.warn('⚠️ Invalid phone number for loyalty points lookup');
            document.getElementById('loyalty-points').textContent = '0';
            return;
        }
        
        console.log(`🔍 Loading loyalty points for phone: ${normalizedPhone}`);
        
        // Fetch all user_points records
        const response = await fetch(`${apiUrl}?sheet=user_points`);
        
        if (!response.ok) {
            console.error('❌ Failed to fetch loyalty points');
            document.getElementById('loyalty-points').textContent = '0';
            return;
        }
        
        const pointsData = await response.json();
        console.log('📥 Points data received:', pointsData);
        
        // Parse response (handle both array and object with result property)
        let allPoints = Array.isArray(pointsData) ? pointsData : (pointsData.result || []);
        
        if (!Array.isArray(allPoints)) {
            console.warn('⚠️ Unexpected points data format');
            document.getElementById('loyalty-points').textContent = '0';
            return;
        }
        
        // Find user by phone with multiple variants
        const variants = phoneLookupVariants(normalizedPhone);
        let userPoints = null;
        
        for (const variant of variants) {
            userPoints = allPoints.find(record => {
                const recordPhone = normalizePhoneTo08(record.phone || record.whatsapp || '');
                return recordPhone === normalizePhoneTo08(variant);
            });
            if (userPoints) {
                console.log(`✅ Found points record for ${variant}:`, userPoints);
                break;
            }
        }
        
        // Update display
        if (userPoints) {
            const points = parseInt(userPoints.points || userPoints.poin || 0);
            console.log(`✅ User points: ${points}`);
            document.getElementById('loyalty-points').textContent = points;
        } else {
            console.log('⚠️ No points record found for user');
            document.getElementById('loyalty-points').textContent = '0';
        }
        
    } catch (error) {
        console.error('❌ Error loading loyalty points:', error);
        document.getElementById('loyalty-points').textContent = '0';
    }
}
