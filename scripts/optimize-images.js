#!/usr/bin/env node

const imagemin = require('imagemin');
const imageminWebp = require('imagemin-webp');
const imageminMozjpeg = require('imagemin-mozjpeg');
const imageminPngquant = require('imagemin-pngquant');
const path = require('path');
const fs = require('fs');

const imgDir = path.join(__dirname, '../assets/img');

console.log('🖼️  Optimizing images...\n');

(async () => {
    try {
        // Check if img directory exists
        if (!fs.existsSync(imgDir)) {
            console.log('⚠️  Image directory not found:', imgDir);
            console.log('Creating directory...');
            fs.mkdirSync(imgDir, { recursive: true });
            console.log('✅ Directory created');
            return;
        }

        const files = fs.readdirSync(imgDir);
        if (files.length === 0) {
            console.log('⚠️  No images found in', imgDir);
            return;
        }

        console.log(`Found ${files.length} images to optimize\n`);

        // Optimize JPEG
        console.log('📦 Optimizing JPEG images...');
        const jpegFiles = await imagemin([path.join(imgDir, '*.jpg'), path.join(imgDir, '*.jpeg')], {
            destination: imgDir,
            plugins: [
                imageminMozjpeg({
                    quality: 80,
                    progressive: true
                })
            ]
        });
        console.log(`✅ Optimized ${jpegFiles.length} JPEG files\n`);

        // Optimize PNG
        console.log('📦 Optimizing PNG images...');
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

        // Convert to WebP
        console.log('📦 Converting images to WebP...');
        const webpFiles = await imagemin([path.join(imgDir, '*.{jpg,jpeg,png}')], {
            destination: imgDir,
            plugins: [
                imageminWebp({
                    quality: 75
                })
            ]
        });
        console.log(`✅ Converted ${webpFiles.length} images to WebP\n`);

        // Calculate savings
        let totalBefore = 0;
        let totalAfter = 0;

        files.forEach(file => {
            const filePath = path.join(imgDir, file);
            if (fs.statSync(filePath).isFile()) {
                totalBefore += fs.statSync(filePath).size;
            }
        });

        fs.readdirSync(imgDir).forEach(file => {
            const filePath = path.join(imgDir, file);
            if (fs.statSync(filePath).isFile()) {
                totalAfter += fs.statSync(filePath).size;
            }
        });

        const savings = ((1 - totalAfter / totalBefore) * 100).toFixed(2);
        console.log('📊 Summary:');
        console.log(`   Total Before: ${(totalBefore / 1024 / 1024).toFixed(2)} MB`);
        console.log(`   Total After:  ${(totalAfter / 1024 / 1024).toFixed(2)} MB`);
        console.log(`   Savings: ${savings}%\n`);
        console.log('✅ Image optimization complete!');

    } catch (error) {
        console.error('❌ Error optimizing images:', error.message);
    }
})();
