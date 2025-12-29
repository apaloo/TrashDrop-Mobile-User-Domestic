#!/usr/bin/env node

const fs = require('fs');
const path = require('path');

// Path to Dashboard.js file
const dashboardPath = path.join(__dirname, '..', 'trashdrop', 'src', 'pages', 'Dashboard.js');

// Read the current Dashboard.js file
let dashboardContent = fs.readFileSync(dashboardPath, 'utf8');

// Create a backup of the original file
fs.writeFileSync(`${dashboardPath}.duplicate.bak`, dashboardContent);

// Find and remove the duplicate Batches card (the emerald-themed one)
const duplicateCardPattern = /{\/\* Duplicate Batches Card - Dark Theme Consistent - Emerald Theme \*\/}[\s\S]+?<\/div>\s*<\/div>\s*<\/div>\s*<\/div>/;

// Remove the duplicate card
dashboardContent = dashboardContent.replace(duplicateCardPattern, '');

// Write the updated content to the file
fs.writeFileSync(dashboardPath, dashboardContent);

console.log('Successfully removed the duplicate Batches card from the Dashboard.js file.');
