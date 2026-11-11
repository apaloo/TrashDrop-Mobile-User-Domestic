const https = require('https');
require('dotenv').config({ path: './trashdrop/.env' });

const supabaseUrl = process.env.REACT_APP_SUPABASE_URL;
const supabaseKey = process.env.SUPABASE_SERVICE_ROLE_KEY || process.env.REACT_APP_SUPABASE_ANON_KEY;

if (!supabaseUrl || !supabaseKey) {
  console.error('❌ Missing Supabase configuration');
  process.exit(1);
}

console.log('🧪 Testing RPC function...');

// Test the function with a simple query
const testData = JSON.stringify({
  user_id_param: "3e5218d6-7742-4263-bed0-8b35894c2794",
  activity_limit: 1
});

const projectUrl = supabaseUrl.replace('/rest/v1', '');
const rpcUrl = `${projectUrl}/rest/v1/rpc/get_dashboard_data_optimized`;

const options = {
  hostname: new URL(rpcUrl).hostname,
  path: new URL(rpcUrl).pathname,
  method: 'POST',
  headers: {
    'Authorization': `Bearer ${supabaseKey}`,
    'apikey': supabaseKey,
    'Content-Type': 'application/json',
    'Content-Length': Buffer.byteLength(testData)
  }
};

const req = https.request(options, (res) => {
  let data = '';
  
  res.on('data', (chunk) => {
    data += chunk;
  });
  
  res.on('end', () => {
    console.log(`Status: ${res.statusCode}`);
    console.log('Response:', data);
    
    if (res.statusCode >= 400) {
      console.error('❌ RPC function test failed');
      console.log('\n🔧 Suggested fix: Drop and recreate the function');
      console.log('Run this in Supabase SQL Editor:');
      console.log('DROP FUNCTION IF EXISTS get_dashboard_data_optimized(UUID, INT);');
      console.log('Then re-run the migration file.');
    } else {
      console.log('✅ RPC function working correctly');
    }
  });
});

req.on('error', (error) => {
  console.error('❌ Request error:', error);
});

req.write(testData);
req.end();
