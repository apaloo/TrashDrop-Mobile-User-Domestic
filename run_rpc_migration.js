const https = require('https');
const fs = require('fs');
const path = require('path');
require('dotenv').config({ path: path.join(__dirname, 'trashdrop', '.env') });

// Read the migration file
const migrationSQL = fs.readFileSync('./migrations/06_dashboard_rpc_functions_ultimate_fix.sql', 'utf8');

async function runMigration() {
  try {
    console.log('🚀 Running dashboard RPC migration...');
    
    const supabaseUrl = process.env.REACT_APP_SUPABASE_URL;
    const supabaseKey = process.env.SUPABASE_SERVICE_ROLE_KEY || process.env.REACT_APP_SUPABASE_ANON_KEY;
    
    if (!supabaseUrl || !supabaseKey) {
      throw new Error('Missing Supabase configuration. Please check environment variables.');
    }
    
    // Extract the project URL and construct the REST API endpoint
    const projectUrl = supabaseUrl.replace('/rest/v1', '');
    const restUrl = `${projectUrl}/rest/v1/rpc/exec_sql`;
    
    console.log('📝 Executing SQL migration via REST API...');
    
    const postData = JSON.stringify({ sql: migrationSQL });
    
    const options = {
      hostname: new URL(restUrl).hostname,
      path: new URL(restUrl).pathname,
      method: 'POST',
      headers: {
        'Authorization': `Bearer ${supabaseKey}`,
        'apikey': supabaseKey,
        'Content-Type': 'application/json',
        'Content-Length': Buffer.byteLength(postData)
      }
    };
    
    const req = https.request(options, (res) => {
      let data = '';
      
      res.on('data', (chunk) => {
        data += chunk;
      });
      
      res.on('end', () => {
        try {
          const result = JSON.parse(data);
          if (res.statusCode >= 200 && res.statusCode < 300) {
            console.log('✅ Migration completed successfully!');
            console.log('🎯 Dashboard RPC functions are now available');
          } else {
            console.error('❌ Migration failed with status:', res.statusCode);
            console.error('Response:', data);
          }
        } catch (parseError) {
          console.error('❌ Error parsing response:', parseError);
          console.error('Raw response:', data);
        }
      });
    });
    
    req.on('error', (error) => {
      console.error('❌ Request error:', error);
    });
    
    req.write(postData);
    req.end();
    
  } catch (error) {
    console.error('❌ Error running migration:', error.message);
    process.exit(1);
  }
}

runMigration();
