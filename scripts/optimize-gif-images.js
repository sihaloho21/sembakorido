#!/usr/bin/env node

const { imagemin } = require('imagemin');
const imageminGifsicle = require('imagemin-gifsicle');
const imageminWebp = require('imagemin-webp');
const imageminPngquant = require('imagemin-pngquant');
const path = require('path');
const fs = require('fs');

const imgDir = path.join(__dirname, '../assets/images');

console.log('🖼️  Optimizing GIF and PNG images...\n');

(async () => {
    try {
        // Check if img directory exists
        if (!fs.existsSync(imgDir)) {
            console.log('⚠️  Image directory not found:', imgDir);
            return;
        }

        const files = fs.readdirSync(imgDir);
        if (files.length === 0) {
            console.log('⚠️  No images found in', imgDir);
            return;
        }

        console.log(`Found ${files.length} images to optimize\n`);

        // Get initial sizes
        let totalBefore = 0;
        files.forEach(file => {
            const filePath = path.join(imgDir, file);
            if (fs.statSync(filePath).isFile()) {
                totalBefore += fs.statSync(filePath).size;
            }
        });

        console.log(`📊 Initial Size: ${(totalBefore / 1024 / 1024).toFixed(2)} MB\n`);

        // Optimize GIF
        console.log('📦 Optimizing GIF images...');
        try {
            const gifFiles = await imagemin([path.join(imgDir, '*.gif')], {
            destination: imgDir,
            plugins: [
                imageminGifsicle({
                    interlaced: true,
                    optimizationLevel: 3
                })
            ]
            });
            console.log(`✅ Optimized ${gifFiles.length} GIF files\n`);
        } catch (e) {
            console.log('⚠️  No GIF files to optimize\n');
        }

        // Optimize PNG
        console.log('📦 Optimizing PNG images...');
        try {
            const pngFiles = await imagemin([path.join(imgDir, '*.png')], {
            destination: imgDir,
            plugins: [
                imageminPngquant({
                    quality: [0.6, 0.8],
                    speed: 4
                })
            ]
            });
            console.log(`✅ Optimized ${pngFiles.length} PNG files\n`);
        } catch (e) {
            console.log('⚠️  No PNG files to optimize\n');
        }

        // Convert GIF to WebP (optional, for modern browsers)
        console.log('📦 Converting GIF to WebP (for modern browsers)...');
        try {
            const webpFiles = await imagemin([path.join(imgDir, '*.gif')], {
            destination: imgDir,
            plugins: [
                imageminWebp({
                    quality: 75
                })
            ]
            });
            console.log(`✅ Converted ${webpFiles.length} GIF files to WebP\n`);
        } catch (e) {
            console.log('⚠️  Could not convert to WebP\n');
        }

        // Calculate savings
        let totalAfter = 0;
        fs.readdirSync(imgDir).forEach(file => {
            const filePath = path.join(imgDir, file);
            if (fs.statSync(filePath).isFile()) {
                totalAfter += fs.statSync(filePath).size;
            }
        });

        const savings = ((1 - totalAfter / totalBefore) * 100).toFixed(2);
        console.log('📊 Summary:');
        console.log(`   Before: ${(totalBefore / 1024 / 1024).toFixed(2)} MB`);
        console.log(`   After:  ${(totalAfter / 1024 / 1024).toFixed(2)} MB`);
        console.log(`   Savings: ${savings}%\n`);
        console.log('✅ Image optimization complete!');
        console.log('\n💡 Tip: Use WebP images for modern browsers, GIF as fallback');

    } catch (error) {
        console.error('❌ Error optimizing images:', error.message);
    }
})();
