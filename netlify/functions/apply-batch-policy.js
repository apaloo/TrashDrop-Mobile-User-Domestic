// Apply batch scanning RLS policy
const { createClient } = require('@supabase/supabase-js');

exports.handler = async (event) => {
  try {
    // Use service role to apply policy
    const supabase = createClient(
      process.env.SUPABASE_URL,
      process.env.SUPABASE_SERVICE_ROLE
    );

    const policySQL = `
      DO $$ 
      BEGIN
        -- Add policy to allow authenticated users to read active batches for scanning
        IF EXISTS (SELECT 1 FROM information_schema.tables WHERE table_name = 'batches') THEN
          IF NOT EXISTS (SELECT 1 FROM pg_policies WHERE tablename = 'batches' AND policyname = 'Authenticated users can scan active batches') THEN
            CREATE POLICY "Authenticated users can scan active batches" 
            ON batches FOR SELECT 
            USING (
              auth.uid() IS NOT NULL AND 
              status = 'active'
            );
          END IF;
        END IF;
      END $$;
    `;

    const { data, error } = await supabase.rpc('exec_sql', { sql: policySQL });
    
    if (error) {
      console.error('Policy creation error:', error);
      return {
        statusCode: 500,
        body: JSON.stringify({ error: error.message })
      };
    }

    return {
      statusCode: 200,
      body: JSON.stringify({ 
        message: 'Batch scanning policy applied successfully',
        policy: 'Authenticated users can scan active batches'
      })
    };

  } catch (err) {
    console.error('Handler error:', err);
    return {
      statusCode: 500,
      body: JSON.stringify({ error: err.message })
    };
  }
};
