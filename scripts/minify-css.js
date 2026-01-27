#!/usr/bin/env node

const fs = require('fs');
const path = require('path');
const cssnano = require('cssnano');
const postcss = require('postcss');

const cssDir = path.join(__dirname, '../assets/css');
const files = fs.readdirSync(cssDir).filter(f => f.endsWith('.css') && !f.endsWith('.min.css'));

console.log('🔨 Minifying CSS files...\n');

let totalSizeBefore = 0;
let totalSizeAfter = 0;

const processor = postcss([cssnano()]);

files.forEach(async (file) => {
    const filePath = path.join(cssDir, file);
    const minFilePath = path.join(cssDir, file.replace('.css', '.min.css'));
    
    const code = fs.readFileSync(filePath, 'utf8');
    const sizeBefore = Buffer.byteLength(code, 'utf8');
    
    try {
        const result = await processor.process(code, { from: filePath, to: minFilePath });
        const minCode = result.css;
        const sizeAfter = Buffer.byteLength(minCode, 'utf8');
        const reduction = ((1 - sizeAfter / sizeBefore) * 100).toFixed(2);
        
        fs.writeFileSync(minFilePath, minCode);
        
        totalSizeBefore += sizeBefore;
        totalSizeAfter += sizeAfter;
        
        console.log(`✅ ${file}`);
        console.log(`   Before: ${(sizeBefore / 1024).toFixed(2)} KB`);
        console.log(`   After:  ${(sizeAfter / 1024).toFixed(2)} KB`);
        console.log(`   Reduction: ${reduction}%\n`);
    } catch (error) {
        console.error(`❌ Error processing ${file}:`, error.message);
    }
});

// Summary
setTimeout(() => {
    const totalReduction = ((1 - totalSizeAfter / totalSizeBefore) * 100).toFixed(2);
    console.log('📊 Summary:');
    console.log(`   Total Before: ${(totalSizeBefore / 1024).toFixed(2)} KB`);
    console.log(`   Total After:  ${(totalSizeAfter / 1024).toFixed(2)} KB`);
    console.log(`   Total Reduction: ${totalReduction}%\n`);
    console.log('✅ CSS Minification complete!');
}, 1000);
