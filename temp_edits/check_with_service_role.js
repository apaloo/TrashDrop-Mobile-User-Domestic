// Use service role to bypass RLS and check batches
const { createClient } = require('@supabase/supabase-js');

// Load .env variables
require('dotenv').config({ path: '.env.development' });

const supabase = createClient(
  process.env.SUPABASE_URL,
  process.env.SUPABASE_SERVICE_ROLE
);

async function checkBatches() {
  try {
    console.log('Checking batches with service role...');
    const { data, error, count } = await supabase
      .from('batches')
      .select('*', { count: 'exact' })
      .order('created_at', { ascending: false })
      .limit(5);

    if (error) {
      console.error('Error:', error);
      return;
    }

    console.log(`✅ Total batches found: ${count}`);
    
    if (data && data.length > 0) {
      console.log('\nRecent batches:');
      data.forEach((batch, i) => {
        console.log(`${i + 1}. ${batch.batch_number} - Status: ${batch.status} - ID: ${batch.id.substring(0, 8)}...`);
      });
      
      // Also check bags for the first batch
      if (data[0]) {
        const { data: bags } = await supabase
          .from('bags')
          .select('*')
          .eq('batch_id', data[0].id);
        console.log(`\nBags for batch ${data[0].batch_number}: ${bags ? bags.length : 0} bags`);
      }
    } else {
      console.log('No batches found.');
    }
  } catch (err) {
    console.error('Error:', err.message);
  }
}

checkBatches();
