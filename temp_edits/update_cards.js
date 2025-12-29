#!/usr/bin/env node

const fs = require('fs');
const path = require('path');

// Path to Dashboard.js file
const dashboardPath = path.join(__dirname, '..', 'trashdrop', 'src', 'pages', 'Dashboard.js');

// Read the current Dashboard.js file
let dashboardContent = fs.readFileSync(dashboardPath, 'utf8');

// Define the optimized Batches card and its duplicate
const optimizedBatchesCardContent = `            {/* Batches Card - Dark Theme Consistent - Optimized Size */}
            <div className="bg-gray-800 rounded-lg shadow-lg p-4 min-w-[240px] flex-shrink-0 snap-center border border-indigo-700 relative overflow-hidden">
              {/* Background Pattern */}
              <div className="absolute top-0 right-0 w-12 h-12 bg-indigo-500 rounded-full opacity-10 transform translate-x-6 -translate-y-6"></div>
              
              {/* Header with Level Badge */}
              <div className="flex items-center justify-between mb-3">
                <div className="flex items-center space-x-2">
                  <div className="w-10 h-10 bg-gradient-to-br from-indigo-400 to-indigo-600 rounded-lg flex items-center justify-center shadow-lg">
                    <svg className="w-6 h-6 text-white" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                      <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M19 11H5m14 0a2 2 0 012 2v6a2 2 0 01-2 2H5a2 2 0 01-2-2v-6a2 2 0 012-2m14 0V9a2 2 0 00-2-2M5 11V9a2 2 0 012-2m0 0V5a2 2 0 012-2h6a2 2 0 012 2v2M7 7h10" />
                    </svg>
                  </div>
                  <div>
                    <h3 className="text-base font-bold text-white">Batches</h3>
                    <p className="text-xs text-gray-300">Processing Groups</p>
                  </div>
                </div>
                <div className="bg-indigo-500 text-white px-2 py-0.5 rounded-full text-xs font-bold">
                  Lv {Math.floor(stats.batches / 2) + 1}
                </div>
              </div>
              
              {/* Main Batches Display */}
              <div className="text-center mb-3">
                <div className="text-3xl font-black text-indigo-400">
                  {stats.batches}
                </div>
                <p className="text-xs text-gray-300 mt-0.5">Processing Batches</p>
              </div>
              
              {/* Progress Bar */}
              <div className="space-y-1">
                <div className="flex justify-between text-xs font-medium">
                  <span className="text-gray-300">Level Progress</span>
                  <span className="text-indigo-400">{2 - (stats.batches % 2)} more to level up</span>
                </div>
                <div className="w-full bg-gray-700 rounded-full h-2 relative overflow-hidden">
                  <div 
                    className="bg-gradient-to-r from-indigo-400 to-indigo-600 h-2 rounded-full transition-all duration-500 ease-out"
                    style={{ width: \`\${(stats.batches % 2) * 50}%\` }}
                  ></div>
                </div>
              </div>
            </div>

            {/* Duplicate Batches Card - Dark Theme Consistent - Emerald Theme */}
            <div className="bg-gray-800 rounded-lg shadow-lg p-4 min-w-[240px] flex-shrink-0 snap-center border border-emerald-700 relative overflow-hidden">
              {/* Background Pattern */}
              <div className="absolute top-0 right-0 w-12 h-12 bg-emerald-500 rounded-full opacity-10 transform translate-x-6 -translate-y-6"></div>
              
              {/* Header with Level Badge */}
              <div className="flex items-center justify-between mb-3">
                <div className="flex items-center space-x-2">
                  <div className="w-10 h-10 bg-gradient-to-br from-emerald-400 to-emerald-600 rounded-lg flex items-center justify-center shadow-lg">
                    <svg className="w-6 h-6 text-white" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                      <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M19 11H5m14 0a2 2 0 012 2v6a2 2 0 01-2 2H5a2 2 0 01-2-2v-6a2 2 0 012-2m14 0V9a2 2 0 00-2-2M5 11V9a2 2 0 012-2m0 0V5a2 2 0 012-2h6a2 2 0 012 2v2M7 7h10" />
                    </svg>
                  </div>
                  <div>
                    <h3 className="text-base font-bold text-white">Batches</h3>
                    <p className="text-xs text-gray-300">Processing Groups</p>
                  </div>
                </div>
                <div className="bg-emerald-500 text-white px-2 py-0.5 rounded-full text-xs font-bold">
                  Lv {Math.floor(stats.batches / 2) + 1}
                </div>
              </div>
              
              {/* Main Batches Display */}
              <div className="text-center mb-3">
                <div className="text-3xl font-black text-emerald-400">
                  {stats.batches}
                </div>
                <p className="text-xs text-gray-300 mt-0.5">Processing Batches</p>
              </div>
              
              {/* Progress Bar */}
              <div className="space-y-1">
                <div className="flex justify-between text-xs font-medium">
                  <span className="text-gray-300">Level Progress</span>
                  <span className="text-emerald-400">{2 - (stats.batches % 2)} more to level up</span>
                </div>
                <div className="w-full bg-gray-700 rounded-full h-2 relative overflow-hidden">
                  <div 
                    className="bg-gradient-to-r from-emerald-400 to-emerald-600 h-2 rounded-full transition-all duration-500 ease-out"
                    style={{ width: \`\${(stats.batches % 2) * 50}%\` }}
                  ></div>
                </div>
              </div>
            </div>`;

// Find the existing Batches card section
const batchesCardStartPattern = /{\/\* Batches Card - Dark Theme Consistent \*\/}/;
const batchesCardEndPattern = /style={{ width: `\${\(stats\.batches % 2\) \* 50}%` }}\s*><\/div>\s*<\/div>\s*<\/div>\s*<\/div>/;

// Find the start position
const startIndex = dashboardContent.search(batchesCardStartPattern);
if (startIndex === -1) {
  console.error('Could not find the Batches card section in the Dashboard.js file.');
  process.exit(1);
}

// Find the end position by searching for the pattern starting from the identified start position
const searchFrom = startIndex;
const searchContent = dashboardContent.substring(searchFrom);
const endMatch = searchContent.match(batchesCardEndPattern);

if (!endMatch) {
  console.error('Could not find the end of the Batches card section.');
  process.exit(1);
}

// Calculate the end index in the original string
const endIndex = searchFrom + endMatch.index + endMatch[0].length;

// Replace the content between start and end with our optimized cards
const newDashboardContent = 
  dashboardContent.substring(0, startIndex) + 
  optimizedBatchesCardContent + 
  dashboardContent.substring(endIndex);

// Back up the original file
fs.writeFileSync(`${dashboardPath}.bak`, dashboardContent);

// Write the updated content to the file
fs.writeFileSync(dashboardPath, newDashboardContent);

console.log('Successfully updated the Dashboard.js file with optimized Batches cards.');
