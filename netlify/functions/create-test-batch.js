const { createClient } = require('@supabase/supabase-js');

const supabase = createClient(
  process.env.SUPABASE_URL,
  process.env.SUPABASE_SERVICE_ROLE
);

exports.handler = async (event, context) => {
  if (event.httpMethod !== 'POST') {
    return { statusCode: 405, body: 'Method Not Allowed' };
  }

  try {
    console.log('=== CREATE TEST BATCH FUNCTION ===');
    console.log('Environment check:');
    console.log('SUPABASE_URL:', process.env.SUPABASE_URL ? 'SET' : 'NOT SET');
    console.log('SUPABASE_SERVICE_ROLE:', process.env.SUPABASE_SERVICE_ROLE ? 'SET (length: ' + process.env.SUPABASE_SERVICE_ROLE?.length + ')' : 'NOT SET');
    
    const { batch_number, bag_count = 10, status = 'active' } = JSON.parse(event.body);
    console.log('Request body:', { batch_number, bag_count, status });

    // First, check if we can create a batch without created_by field
    console.log('Attempting batch creation without created_by field...');
    
    // Insert batch without created_by field to test schema
    const { data, error } = await supabase
      .from('batches')
      .insert([{
        batch_number: batch_number || `BATCH-${Date.now()}`,
        bag_count,
        status
        // Omitting created_by to see if it's optional or has a default
      }])
      .select()
      .single();

    if (error) {
      console.error('Error creating batch:', error);
      throw error;
    }

    // Create associated bags with QR codes
    console.log('Creating bags with QR codes...');
    const bags = Array(bag_count).fill(null).map((_, i) => ({
      batch_id: data.id,
      status: 'available',
      qr_code: `${data.batch_number}-BAG-${i + 1}` // Generate simple QR code
    }));

    const { error: bagsError } = await supabase
      .from('bags')
      .insert(bags);

    if (bagsError) {
      console.error('Error creating bags:', bagsError);
      // Try to clean up the batch if bags creation fails
      await supabase.from('batches').delete().eq('id', data.id);
      throw bagsError;
    }

    return {
      statusCode: 200,
      body: JSON.stringify({ 
        message: 'Test batch created successfully',
        batch: data,
        bags_count: bag_count
      })
    };
  } catch (error) {
    console.error('Error creating test batch:', error);
    return {
      statusCode: 500,
      body: JSON.stringify({ 
        error: 'Failed to create test batch',
        details: error.message 
      })
    };
  }
};
