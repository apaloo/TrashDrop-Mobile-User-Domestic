const { exec } = require('child_process');
const fs = require('fs');
require('dotenv').config();

async function applyMigration() {
  try {
    console.log('🚀 Applying dashboard RPC migration...');
    
    const supabaseUrl = process.env.REACT_APP_SUPABASE_URL;
    const supabaseKey = process.env.SUPABASE_SERVICE_ROLE_KEY || process.env.REACT_APP_SUPABASE_ANON_KEY;
    
    if (!supabaseUrl || !supabaseKey) {
      throw new Error('Missing Supabase configuration. Please check environment variables.');
    }
    
    // Read the migration file
    const migrationSQL = fs.readFileSync('./migrations/06_dashboard_rpc_functions_ultimate_fix.sql', 'utf8');
    
    // Extract project URL for REST API
    const projectUrl = supabaseUrl.replace('/rest/v1', '');
    const rpcUrl = `${projectUrl}/rest/v1/rpc/get_dashboard_data_optimized`;
    
    console.log('📝 Testing RPC function availability...');
    
    // First, let's test if the RPC function exists by calling it
    const testCmd = `curl -s -X POST "${rpcUrl}" \\
      -H "Authorization: Bearer ${supabaseKey}" \\
      -H "apikey: ${supabaseKey}" \\
      -H "Content-Type: application/json" \\
      -d '{"user_id_param":"00000000-0000-0000-0000-000000000000","activity_limit":1}'`;
    
    exec(testCmd, (error, stdout, stderr) => {
      if (error) {
        console.log('❌ RPC function not found (expected):', error.message);
        console.log('📝 Migration needs to be applied.');
        
        // Since we can't directly execute SQL via REST API without existing functions,
        // let's provide instructions for manual application
        console.log('\n🔧 MANUAL MIGRATION INSTRUCTIONS:');
        console.log('1. Open your Supabase dashboard');
        console.log('2. Go to SQL Editor');
        console.log('3. Copy and paste the contents of: migrations/06_dashboard_rpc_functions_ultimate_fix.sql');
        console.log('4. Execute the SQL');
        console.log('5. Refresh your app to test the dashboard');
        console.log('\n📄 Migration file path: ./migrations/06_dashboard_rpc_functions_ultimate_fix.sql');
        
      } else {
        try {
          const result = JSON.parse(stdout);
          if (result.code === 'PGRST202') {
            console.log('❌ RPC function not found, migration needed');
            console.log('\n🔧 MANUAL MIGRATION INSTRUCTIONS:');
            console.log('1. Open your Supabase dashboard');
            console.log('2. Go to SQL Editor');
            console.log('3. Copy and paste the contents of: migrations/06_dashboard_rpc_functions_ultimate_fix.sql');
            console.log('4. Execute the SQL');
            console.log('5. Refresh your app to test the dashboard');
          } else {
            console.log('✅ RPC function appears to be working!');
          }
        } catch (parseError) {
          console.log('❓ Unexpected response:', stdout);
        }
      }
    });
    
  } catch (error) {
    console.error('❌ Error:', error.message);
  }
}

applyMigration();
