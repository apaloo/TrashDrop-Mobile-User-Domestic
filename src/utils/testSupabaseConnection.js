/**
 * Utility to test Supabase connection and authentication
 */

/**
 * Test Supabase REST API connection
 * @returns {Promise<{success: boolean, status: number, data: any, error: Error|null}>}
 */
export const testSupabaseConnection = async () => {
  const supabaseUrl = process.env.REACT_APP_SUPABASE_URL;
  const supabaseKey = process.env.REACT_APP_SUPABASE_ANON_KEY;

  if (!supabaseUrl || !supabaseKey) {
    return {
      success: false,
      status: 0,
      data: null,
      error: new Error('Missing Supabase URL or Anon Key in environment variables')
    };
  }

  const testEndpoint = `${supabaseUrl}/rest/v1/`;
  
  try {
    console.log('[Supabase Test] Testing connection to:', testEndpoint);
    
    const response = await fetch(testEndpoint, {
      method: 'GET',
      headers: {
        'apikey': supabaseKey,
        'Authorization': `Bearer ${supabaseKey}`,
        'Content-Type': 'application/json',
        'Accept': 'application/json',
      },
      // Don't throw on HTTP error status codes
      credentials: 'omit',
    });

    // Clone the response so we can read it multiple times if needed
    const responseClone = response.clone();
    
    try {
      // Try to parse as JSON first
      const data = await response.json();
      // Any HTTP response indicates reachability; treat 4xx/5xx as connected but report status in data
      return {
        success: true,
        status: response.status,
        data,
        error: null
      };
    } catch (e) {
      // If JSON parsing fails, try to get the response as text
      const text = await responseClone.text();
      return {
        success: true,
        status: response.status,
        data: text,
        error: null
      };
    }
  } catch (error) {
    console.error('[Supabase Test] Connection test failed:', error);
    return {
      success: false,
      status: 0,
      data: null,
      error: error instanceof Error ? error : new Error(String(error))
    };
  }
};

/**
 * Run connection test and log results to console
 */
export const runConnectionTest = async () => {
  console.group('[Supabase Connection Test]');
  console.log('Environment:', process.env.NODE_ENV);
  console.log('Supabase URL:', process.env.REACT_APP_SUPABASE_URL);
  
  const result = await testSupabaseConnection();
  
  console.log('Test Result:', {
    success: result.success,
    status: result.status,
    error: result.error?.message || 'None',
    data: result.data
  });
  
  if (result.error) {
    console.error('Error details:', result.error);
  }
  
  console.groupEnd();
  return result;
};

// Run the test automatically when this module is imported in development
if (process.env.NODE_ENV === 'development') {
  runConnectionTest().catch(console.error);
}
