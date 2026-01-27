#!/usr/bin/env node

const fs = require('fs');
const path = require('path');
const terser = require('terser');

const jsDir = path.join(__dirname, '../assets/js');
const files = fs.readdirSync(jsDir).filter(f => f.endsWith('.js'));

console.log('🔨 Minifying JavaScript files...\n');

let totalSizeBefore = 0;
let totalSizeAfter = 0;

files.forEach(async (file) => {
    const filePath = path.join(jsDir, file);
    const minFilePath = path.join(jsDir, file.replace('.js', '.min.js'));
    
    const code = fs.readFileSync(filePath, 'utf8');
    const sizeBefore = Buffer.byteLength(code, 'utf8');
    
    try {
        const result = await terser.minify(code, {
            compress: {
                drop_console: false,
                passes: 2
            },
            mangle: true,
            output: {
                comments: false
            }
        });
        
        if (result.error) {
            console.error(`❌ Error minifying ${file}:`, result.error);
            return;
        }
        
        const minCode = result.code;
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
    console.log('✅ Minification complete!');
}, 1000);
