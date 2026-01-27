#!/bin/bash

echo "🔄 Updating HTML files to use minified assets..."

# Update index.html
sed -i 's|assets/js/config.js|assets/js/config.min.js|g' index.html
sed -i 's|assets/js/api-service.js|assets/js/api-service.min.js|g' index.html
sed -i 's|assets/js/payment-logic.js|assets/js/payment-logic.min.js|g' index.html
sed -i 's|assets/js/tiered-pricing-logic.js|assets/js/tiered-pricing-logic.min.js|g' index.html
sed -i 's|assets/js/image-slider.js|assets/js/image-slider.min.js|g' index.html
sed -i 's|assets/js/promo-banner-carousel.js|assets/js/promo-banner-carousel.min.js|g' index.html
sed -i 's|assets/js/banner-carousel.js|assets/js/banner-carousel.min.js|g' index.html
sed -i 's|assets/js/script.js|assets/js/script.min.js|g' index.html

sed -i 's|assets/css/style.css|assets/css/style.min.css|g' index.html
sed -i 's|assets/css/banner-carousel.css|assets/css/banner-carousel.min.css|g' index.html
sed -i 's|assets/css/promo-banner-carousel.css|assets/css/promo-banner-carousel.min.css|g' index.html
sed -i 's|assets/css/skeleton-loading.css|assets/css/skeleton-loading.min.css|g' index.html

# Update akun.html
sed -i 's|assets/js/config.js|assets/js/config.min.js|g' akun.html
sed -i 's|assets/js/api-service.js|assets/js/api-service.min.js|g' akun.html
sed -i 's|assets/js/script.js|assets/js/script.min.js|g' akun.html
sed -i 's|assets/js/akun.js|assets/js/akun.min.js|g' akun.html

sed -i 's|assets/css/style.css|assets/css/style.min.css|g' akun.html

# Update admin/index.html
sed -i 's|\.\./assets/js/config.js|\.\./assets/js/config.min.js|g' admin/index.html
sed -i 's|\.\./assets/js/api-service.js|\.\./assets/js/api-service.min.js|g' admin/index.html
sed -i 's|js/tiered-pricing.js|js/tiered-pricing.min.js|g' admin/index.html
sed -i 's|js/banner-management.js|js/banner-management.min.js|g' admin/index.html
sed -i 's|js/admin-script.js|js/admin-script.min.js|g' admin/index.html

echo "✅ HTML files updated to use minified assets"
