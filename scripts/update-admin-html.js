/**
 * Update admin/index.html dengan mobile CSS dan JS
 */

const fs = require('fs');
const path = require('path');

const adminHtmlPath = path.join(__dirname, '../admin/index.html');

// Read the file
let content = fs.readFileSync(adminHtmlPath, 'utf8');

// Check if CSS links already exist
if (!content.includes('admin-mobile.min.css')) {
    // Find the admin-style.css link and add mobile CSS after it
    const adminStyleLink = '<link rel="stylesheet" href="css/admin-style.css">';
    const mobileStyleLink = '<link rel="stylesheet" href="css/admin-mobile.min.css">\n    <link rel="stylesheet" href="css/hamburger.min.css">';
    
    if (content.includes(adminStyleLink)) {
        content = content.replace(adminStyleLink, adminStyleLink + '\n    ' + mobileStyleLink);
        console.log('✅ Added mobile CSS links');
    }
}

// Check if mobile menu script already exists
if (!content.includes('mobile-menu.min.js')) {
    // Find the closing </body> tag and add script before it
    const closingBody = '</body>';
    const mobileMenuScript = '<script src="js/mobile-menu.min.js"></script>\n';
    
    if (content.includes(closingBody)) {
        content = content.replace(closingBody, mobileMenuScript + closingBody);
        console.log('✅ Added mobile menu script');
    }
}

// Write the updated content back
fs.writeFileSync(adminHtmlPath, content, 'utf8');
console.log('✅ admin/index.html updated successfully');
