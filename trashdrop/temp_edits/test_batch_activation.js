// Test script for batch activation and dashboard update
import { batchService } from '../services/index.js';
import supabase from '../utils/supabaseClient.js';

/**
 * This function tests batch activation and verifies that the user_stats table is updated correctly
 * and that real-time updates are propagated to the Dashboard component.
 * 
 * How to use:
 * 1. Open the browser console on the Dashboard page
 * 2. Copy and paste this entire function
 * 3. Call testBatchActivation('YOUR_TEST_BATCH_ID') with a valid batch ID
 * 4. Watch the console for logs and verify that Dashboard updates
 */
async function testBatchActivation(batchId) {
  console.log(`=== Starting Test: Batch Activation for ${batchId} ===`);
  
  // Step 1: Get the current user
  const { data: { user } } = await supabase.auth.getUser();
  if (!user) {
    console.error('No authenticated user found. Please login first.');
    return;
  }
  console.log(`Current user: ${user.id}`);
  
  // Step 2: Get current user stats before activation
  const { data: beforeStats } = await supabase
    .from('user_stats')
    .select('*')
    .eq('user_id', user.id)
    .maybeSingle();
  
  console.log('User stats before activation:', beforeStats);
  
  // Step 3: Get batch details before activation
  const { data: beforeBatch } = await supabase
    .from('batches')
    .select('*')
    .eq('id', batchId)
    .maybeSingle();
  
  if (!beforeBatch) {
    console.error(`Batch with ID ${batchId} not found.`);
    return;
  }
  
  console.log('Batch before activation:', beforeBatch);
  
  // Step 4: Activate the batch
  try {
    console.log('Activating batch...');
    const result = await batchService.activateBatchForUser(batchId, user.id);
    console.log('Activation result:', result);
  } catch (error) {
    console.error('Error activating batch:', error);
    return;
  }
  
  // Step 5: Verify batch status update
  setTimeout(async () => {
    const { data: afterBatch } = await supabase
      .from('batches')
      .select('*')
      .eq('id', batchId)
      .maybeSingle();
    
    console.log('Batch after activation:', afterBatch);
    
    // Step 6: Verify user_stats update
    const { data: afterStats } = await supabase
      .from('user_stats')
      .select('*')
      .eq('user_id', user.id)
      .maybeSingle();
    
    console.log('User stats after activation:', afterStats);
    
    // Step 7: Verify changes
    console.log('=== Test Results ===');
    
    if (afterBatch?.status === 'used') {
      console.log('✅ Batch status updated to "used"');
    } else {
      console.error('❌ Batch status not updated correctly');
    }
    
    if (afterStats?.total_batches > beforeStats?.total_batches) {
      console.log('✅ total_batches incremented in user_stats');
    } else {
      console.error('❌ total_batches not incremented in user_stats');
    }
    
    if (afterStats?.available_bags > beforeStats?.available_bags) {
      console.log('✅ available_bags incremented in user_stats');
    } else {
      console.error('❌ available_bags not incremented in user_stats');
    }
    
    console.log('=== Test Complete ===');
    console.log('Check the Dashboard UI to verify that the batch and bag counts have updated!');
  }, 1000); // Wait a second to ensure database updates have completed
}

// Export for use in console
window.testBatchActivation = testBatchActivation;
console.log('Test function ready! Call testBatchActivation("your-batch-id") to test batch activation.');
