const { createClient } = require('@supabase/supabase-js');
const fs = require('fs');
require('dotenv').config();

// Get the migration file from command line arguments
const migrationFile = process.argv[2];

if (!migrationFile) {
  console.error('❌ Please provide a migration file path');
  console.log('Usage: node run_custom_migration.js <migration-file.sql>');
  process.exit(1);
}

async function runMigration() {
  try {
    console.log(`🚀 Running migration: ${migrationFile}...`);
    
    // Read the migration file
    const migrationSQL = fs.readFileSync(migrationFile, 'utf8');
    
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
    console.log(`🎯 ${migrationFile} has been applied`);
    
  } catch (error) {
    console.error('❌ Error running migration:', error.message);
    process.exit(1);
  }
}

runMigration();
