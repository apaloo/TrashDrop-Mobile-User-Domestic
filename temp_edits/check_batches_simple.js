// Simple batch check with service role
const { createClient } = require('@supabase/supabase-js');

// Load environment variables
require('dotenv').config({ path: '.env.development' });

console.log('SUPABASE_URL:', process.env.SUPABASE_URL ? 'SET' : 'NOT SET');
console.log('SUPABASE_SERVICE_ROLE:', process.env.SUPABASE_SERVICE_ROLE ? 'SET' : 'NOT SET');

const supabase = createClient(
  process.env.SUPABASE_URL,
  process.env.SUPABASE_SERVICE_ROLE
);

(async () => {
  try {
    console.log('\n=== CHECKING BATCHES WITH SERVICE ROLE ===');
    const { data, error, count } = await supabase
      .from('batches')
      .select('*', { count: 'exact' });

    if (error) {
      console.error('Error:', error);
      return;
    }

    console.log(`Found ${count} batches total`);
    if (data && data.length > 0) {
      console.log('Sample batches:');
      data.slice(0, 3).forEach(b => {
        console.log(`- ID: ${b.id}, Number: ${b.batch_number}, Status: ${b.status}`);
      });
    }
    
    // Test the specific batch ID from the QR scanner error
    const testId = '4308f3eb-55b9-45f6-8ad3-bd017665347b';
    console.log(`\n=== CHECKING SPECIFIC BATCH: ${testId} ===`);
    const { data: specificBatch } = await supabase
      .from('batches')
      .select('*')
      .eq('id', testId)
      .single();
      
    if (specificBatch) {
      console.log('✅ Found specific batch:', specificBatch.batch_number);
    } else {
      console.log('❌ Specific batch not found');
    }

  } catch (err) {
    console.error('Caught error:', err.message);
  }
})();
