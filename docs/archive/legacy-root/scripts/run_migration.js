const { createClient } = require('@supabase/supabase-js');
const fs = require('fs');
require('dotenv').config();

// Read the migration file
const migrationSQL = fs.readFileSync('./migrations/06_dashboard_rpc_functions.sql', 'utf8');

async function runMigration() {
  try {
    console.log('🚀 Running dashboard RPC migration...');
    
    // Create Supabase client with service role key (if available)
    const supabaseUrl = process.env.REACT_APP_SUPABASE_URL;
    const supabaseKey = process.env.SUPABASE_SERVICE_ROLE_KEY || process.env.REACT_APP_SUPABASE_ANON_KEY;
    
    if (!supabaseUrl || !supabaseKey) {
      throw new Error('Missing Supabase configuration. Please check environment variables.');
    }
    
    const supabase = createClient(supabaseUrl, supabaseKey);
    
    console.log('📝 Executing SQL migration...');
    
    // Execute the SQL using the Supabase client
    const { data, error } = await supabase.rpc('exec_sql', { sql: migrationSQL });
    
    if (error) {
      console.error('❌ Migration failed:', error);
      throw error;
    }
    
    console.log('✅ Migration completed successfully!');
    console.log('🎯 Dashboard RPC functions are now available');
    
  } catch (error) {
    console.error('❌ Error running migration:', error.message);
    process.exit(1);
  }
}

runMigration();
