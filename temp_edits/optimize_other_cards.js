#!/usr/bin/env node

const fs = require('fs');
const path = require('path');

// Path to Dashboard.js file
const dashboardPath = path.join(__dirname, '..', 'trashdrop', 'src', 'pages', 'Dashboard.js');

// Read the current Dashboard.js file
let dashboardContent = fs.readFileSync(dashboardPath, 'utf8');

// Create optimized versions of each card
const cardOptimizations = [
  // Points Card Optimization
  {
    findPattern: /{\/\* Points Card - Consistent with Original Dark Theme \*\/}[\s\S]+?(?={\/* Pickups Card)/,
    replacement: `{/* Points Card - Consistent with Original Dark Theme - Optimized Size */}
            <div className="bg-gray-800 rounded-lg shadow-lg p-4 min-w-[240px] flex-shrink-0 snap-center border border-yellow-700 relative overflow-hidden">
              {/* Background Pattern */}
              <div className="absolute top-0 right-0 w-12 h-12 bg-yellow-500 rounded-full opacity-10 transform translate-x-6 -translate-y-6"></div>
              
              {/* Header with Level Badge */}
              <div className="flex items-center justify-between mb-3">
                <div className="flex items-center space-x-2">
                  <div className="w-10 h-10 bg-gradient-to-br from-yellow-400 to-amber-500 rounded-lg flex items-center justify-center shadow-lg">
                    <svg className="w-6 h-6 text-white" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                      <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M12 8c-1.657 0-3 .895-3 2s1.343 2 3 2 3 .895 3 2-1.343 2-3 2m0-8c1.11 0 2.08.402 2.599 1M12 8V7m0 1v8m0 0v1m0-1c-1.11 0-2.08-.402-2.599-1" />
                    </svg>
                  </div>
                  <div>
                    <h3 className="text-base font-bold text-white">Points</h3>
                    <p className="text-xs text-gray-300">Reward Credits</p>
                  </div>
                </div>
                <div className="bg-yellow-500 text-white px-2 py-0.5 rounded-full text-xs font-bold">
                  Lv {Math.floor(stats.points / 100) + 1}
                </div>
              </div>
              
              {/* Main Points Display */}
              <div className="text-center mb-3">
                <div className="text-3xl font-black text-yellow-400">
                  {stats.points}
                </div>
                <p className="text-xs text-gray-300 mt-0.5">Total Points</p>
              </div>
              
              {/* Progress Bar */}
              <div className="space-y-1">
                <div className="flex justify-between text-xs font-medium">
                  <span className="text-gray-300">Level Progress</span>
                  <span className="text-yellow-400">{100 - (stats.points % 100)} more to level up</span>
                </div>
                <div className="w-full bg-gray-700 rounded-full h-2 relative overflow-hidden">
                  <div 
                    className="bg-gradient-to-r from-yellow-400 to-amber-500 h-2 rounded-full transition-all duration-500 ease-out"
                    style={{ width: \`\${stats.points % 100}%\` }}
                  ></div>
                </div>
              </div>
            </div>

            `
  },
  // Pickups Card Optimization
  {
    findPattern: /{\/\* Pickups Card - Consistent with Original Dark Theme \*\/}[\s\S]+?(?={\/* Reports Card)/,
    replacement: `{/* Pickups Card - Consistent with Original Dark Theme - Optimized Size */}
            <div className="bg-gray-800 rounded-lg shadow-lg p-4 min-w-[240px] flex-shrink-0 snap-center border border-teal-700 relative overflow-hidden">
              {/* Background Pattern */}
              <div className="absolute top-0 right-0 w-12 h-12 bg-teal-500 rounded-full opacity-10 transform translate-x-6 -translate-y-6"></div>
              
              {/* Header with Level Badge */}
              <div className="flex items-center justify-between mb-3">
                <div className="flex items-center space-x-2">
                  <div className="w-10 h-10 bg-gradient-to-br from-teal-400 to-teal-600 rounded-lg flex items-center justify-center shadow-lg">
                    <svg className="w-6 h-6 text-white" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                      <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M5 8h14M5 8a2 2 0 110-4h14a2 2 0 110 4M5 8v10a2 2 0 002 2h10a2 2 0 002-2V8m-9 4h4" />
                    </svg>
                  </div>
                  <div>
                    <h3 className="text-base font-bold text-white">Pickups</h3>
                    <p className="text-xs text-gray-300">Completed Collections</p>
                  </div>
                </div>
                <div className="bg-teal-500 text-white px-2 py-0.5 rounded-full text-xs font-bold">
                  Lv {Math.floor(stats.pickups / 5) + 1}
                </div>
              </div>
              
              {/* Main Pickups Display */}
              <div className="text-center mb-3">
                <div className="text-3xl font-black text-teal-400">
                  {stats.pickups}
                </div>
                <p className="text-xs text-gray-300 mt-0.5">Successful Pickups</p>
              </div>
              
              {/* Progress Bar */}
              <div className="space-y-1">
                <div className="flex justify-between text-xs font-medium">
                  <span className="text-gray-300">Level Progress</span>
                  <span className="text-teal-400">{5 - (stats.pickups % 5)} more to level up</span>
                </div>
                <div className="w-full bg-gray-700 rounded-full h-2 relative overflow-hidden">
                  <div 
                    className="bg-gradient-to-r from-teal-400 to-teal-600 h-2 rounded-full transition-all duration-500 ease-out"
                    style={{ width: \`\${(stats.pickups % 5) * 20}%\` }}
                  ></div>
                </div>
              </div>
            </div>

            `
  },
  // Reports Card Optimization
  {
    findPattern: /{\/\* Reports Card - Consistent with Original Dark Theme \*\/}[\s\S]+?(?={\/* Total Bags)/,
    replacement: `{/* Reports Card - Consistent with Original Dark Theme - Optimized Size */}
            <div className="bg-gray-800 rounded-lg shadow-lg p-4 min-w-[240px] flex-shrink-0 snap-center border border-orange-700 relative overflow-hidden">
              {/* Background Pattern */}
              <div className="absolute top-0 right-0 w-12 h-12 bg-orange-500 rounded-full opacity-10 transform translate-x-6 -translate-y-6"></div>
              
              {/* Header with Level Badge */}
              <div className="flex items-center justify-between mb-3">
                <div className="flex items-center space-x-2">
                  <div className="w-10 h-10 bg-gradient-to-br from-orange-400 to-orange-600 rounded-lg flex items-center justify-center shadow-lg">
                    <svg className="w-6 h-6 text-white" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                      <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M12 9v2m0 4h.01m-6.938 4h13.856c1.54 0 2.502-1.667 1.732-3L13.732 4c-.77-1.333-2.694-1.333-3.464 0L3.34 16c-.77 1.333.192 3 1.732 3z" />
                    </svg>
                  </div>
                  <div>
                    <h3 className="text-base font-bold text-white">Reports</h3>
                    <p className="text-xs text-gray-300">Filed Incidents</p>
                  </div>
                </div>
                <div className="bg-orange-500 text-white px-2 py-0.5 rounded-full text-xs font-bold">
                  {stats.reports > 0 ? '✓' : ''}
                </div>
              </div>
              
              {/* Main Reports Display */}
              <div className="text-center mb-3">
                <div className="text-3xl font-black text-orange-400">
                  {stats.reports}
                </div>
                <p className="text-xs text-gray-300 mt-0.5">Dumping Reports</p>
              </div>
              
              {/* Rewards Section */}
              <div className="flex items-center justify-center bg-gray-700/40 rounded-lg p-2">
                <svg className="w-4 h-4 text-orange-400 mr-1.5" fill="currentColor" viewBox="0 0 20 20">
                  <path fillRule="evenodd" d="M6.267 3.455a3.066 3.066 0 001.745-.723 3.066 3.066 0 013.976 0 3.066 3.066 0 001.745.723 3.066 3.066 0 012.812 2.812c.051.643.304 1.254.723 1.745a3.066 3.066 0 010 3.976 3.066 3.066 0 00-.723 1.745 3.066 3.066 0 01-2.812 2.812 3.066 3.066 0 00-1.745.723 3.066 3.066 0 01-3.976 0 3.066 3.066 0 00-1.745-.723 3.066 3.066 0 01-2.812-2.812 3.066 3.066 0 00-.723-1.745 3.066 3.066 0 010-3.976 3.066 3.066 0 00.723-1.745 3.066 3.066 0 012.812-2.812zm7.44 5.252a1 1 0 00-1.414-1.414L9 10.586 7.707 9.293a1 1 0 00-1.414 1.414l2 2a1 1 0 001.414 0l4-4z" clipRule="evenodd" />
                </svg>
                <span className="text-xs text-white">Each report earns 25 points</span>
              </div>
            </div>

            `
  },
  // Total Bags Card Optimization
  {
    findPattern: /{\/\* Total Bags Card - Consistent with Original Dark Theme \*\/}[\s\S]+?<\/div>\s*<\/div>\s*<\/div>\s*<\/div>/,
    replacement: `{/* Total Bags Card - Consistent with Original Dark Theme - Optimized Size */}
            <div className="bg-gray-800 rounded-lg shadow-lg p-4 min-w-[240px] flex-shrink-0 snap-center border border-rose-700 relative overflow-hidden">
              {/* Background Pattern */}
              <div className="absolute top-0 right-0 w-12 h-12 bg-rose-500 rounded-full opacity-10 transform translate-x-6 -translate-y-6"></div>
              
              {/* Header with Badge */}
              <div className="flex items-center justify-between mb-3">
                <div className="flex items-center space-x-2">
                  <div className="w-10 h-10 bg-gradient-to-br from-rose-400 to-rose-600 rounded-lg flex items-center justify-center shadow-lg">
                    <svg className="w-6 h-6 text-white" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                      <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M16 11V7a4 4 0 00-8 0v4M5 9h14l1 12H4L5 9z" />
                    </svg>
                  </div>
                  <div>
                    <h3 className="text-base font-bold text-white">Total Bags</h3>
                    <p className="text-xs text-gray-300">Collected Waste</p>
                  </div>
                </div>
                <div className="bg-rose-500 text-white px-2 py-0.5 rounded-full text-xs font-bold">
                  {stats.totalBags >= 10 ? '🏆' : ''}
                </div>
              </div>
              
              {/* Main Total Bags Display */}
              <div className="text-center mb-3">
                <div className="text-3xl font-black text-rose-400">
                  {stats.totalBags}
                </div>
                <p className="text-xs text-gray-300 mt-0.5">Bags Processed</p>
              </div>
              
              {/* Achievement Section */}
              <div className="flex items-center justify-center bg-gray-700/40 rounded-lg p-2">
                <svg className="w-4 h-4 text-rose-400 mr-1.5" fill="currentColor" viewBox="0 0 20 20">
                  <path d="M9.049 2.927c.3-.921 1.603-.921 1.902 0l1.07 3.292a1 1 0 00.95.69h3.462c.969 0 1.371 1.24.588 1.81l-2.8 2.034a1 1 0 00-.364 1.118l1.07 3.292c.3.921-.755 1.688-1.54 1.118l-2.8-2.034a1 1 0 00-1.175 0l-2.8 2.034c-.784.57-1.838-.197-1.539-1.118l1.07-3.292a1 1 0 00-.364-1.118L2.98 8.72c-.783-.57-.38-1.81.588-1.81h3.461a1 1 0 00.951-.69l1.07-3.292z" />
                </svg>
                <span className="text-xs text-white">Each 5 bags earns bonus points</span>
              </div>
            </div>`
  }
];

// Create a backup of the original file
fs.writeFileSync(`${dashboardPath}.cards.bak`, dashboardContent);

// Apply each optimization
cardOptimizations.forEach(optimization => {
  const { findPattern, replacement } = optimization;
  dashboardContent = dashboardContent.replace(new RegExp(findPattern), replacement);
});

// Write the updated content to the file
fs.writeFileSync(dashboardPath, dashboardContent);

console.log('Successfully optimized all stats cards in the Dashboard.js file.');
