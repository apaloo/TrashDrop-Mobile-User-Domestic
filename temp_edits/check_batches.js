// Load environment variables from .env.development
require('dotenv').config({ path: '.env.development' });

const { createClient } = require('@supabase/supabase-js');

const supabase = createClient(
  process.env.REACT_APP_SUPABASE_URL,
  process.env.REACT_APP_SUPABASE_ANON_KEY
);

async function checkBatches() {
  try {
    console.log('Checking batches table...');
    
    // Get all batches
    const { data, error, count } = await supabase
      .from('batches')
      .select('*', { count: 'exact' })
      .order('created_at', { ascending: false });

    if (error) {
      console.error('Error querying batches:', error);
      return;
    }

    console.log(`Total batches found: ${count}`);
    
    if (data && data.length > 0) {
      console.log('\nRecent batches:');
      data.slice(0, 5).forEach((batch, i) => {
        console.log(`${i + 1}. Batch: ${batch.batch_number}, ID: ${batch.id}, Status: ${batch.status}, Created: ${batch.created_at}`);
      });
    } else {
      console.log('No batches found in the table.');
    }

  } catch (err) {
    console.error('Error:', err);
  }
}

checkBatches();
