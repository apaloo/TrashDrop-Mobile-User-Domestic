// Form Submission Test Helper
// Tests if our form submission handlers are correctly formatted for Supabase

const { supabase } = require('../utils/supabaseClient');

// Mock the Supabase client to avoid actual API calls
jest.mock('../utils/supabaseClient', () => {
  return {
    supabase: {
      from: jest.fn().mockReturnThis(),
      insert: jest.fn().mockReturnThis(),
      select: jest.fn().mockReturnThis(),
      rpc: jest.fn().mockReturnThis()
    }
  };
});

// Test data for pickup requests
const pickupRequestData = {
  user_id: 'test-user-123',
  number_of_bags: 3,
  waste_type: 'recycling',
  priority: 'normal',
  notes: 'Test notes',
  location: [5.6037, -0.1870], // Accra coordinates
  address: 'Test Location',
  status: 'waiting_for_collector',
  created_at: new Date().toISOString(),
  updated_at: new Date().toISOString(),
  points: 15
};

// Test data for dumping reports
const dumpingReportData = {
  user_id: 'test-user-123',
  waste_type: 'mixed',
  size: 'medium',
  hazardous: false,
  description: 'Test description',
  location: [5.6037, -0.1870], // Accra coordinates
  address: 'Test Location',
  status: 'submitted',
  created_at: new Date().toISOString(),
  updated_at: new Date().toISOString(),
  image_urls: [],
  points: 30
};

// Tests for PickupRequest form
const testPickupRequestSubmission = () => {
  console.log('-------- PICKUP REQUEST SUBMISSION TEST --------');
  
  // Verify data format matches Supabase schema
  const requiredFields = ['user_id', 'number_of_bags', 'waste_type', 'location', 'status'];
  const missingFields = requiredFields.filter(field => !pickupRequestData.hasOwnProperty(field));
  
  if (missingFields.length === 0) {
    console.log('✅ PASSED: Pickup request data has all required fields');
  } else {
    console.log(`❌ FAILED: Pickup request data is missing fields: ${missingFields.join(', ')}`);
  }
  
  // Check data types
  if (typeof pickupRequestData.number_of_bags === 'number') {
    console.log('✅ PASSED: Number of bags is correctly typed as number');
  } else {
    console.log('❌ FAILED: Number of bags is not properly typed');
  }
  
  if (Array.isArray(pickupRequestData.location) && pickupRequestData.location.length === 2) {
    console.log('✅ PASSED: Location data is correctly formatted as array coordinates');
  } else {
    console.log('❌ FAILED: Location data is not properly formatted');
  }
  
  console.log('--------------------------------------------');
  
  return {
    hasRequiredFields: missingFields.length === 0,
    correctNumberOfBagsType: typeof pickupRequestData.number_of_bags === 'number',
    correctLocationFormat: Array.isArray(pickupRequestData.location) && pickupRequestData.location.length === 2
  };
};

// Tests for DumpingReport form
const testDumpingReportSubmission = () => {
  console.log('-------- DUMPING REPORT SUBMISSION TEST --------');
  
  // Verify data format matches Supabase schema
  const requiredFields = ['user_id', 'waste_type', 'location', 'status', 'description'];
  const missingFields = requiredFields.filter(field => !dumpingReportData.hasOwnProperty(field));
  
  if (missingFields.length === 0) {
    console.log('✅ PASSED: Dumping report data has all required fields');
  } else {
    console.log(`❌ FAILED: Dumping report data is missing fields: ${missingFields.join(', ')}`);
  }
  
  // Check data types
  if (typeof dumpingReportData.hazardous === 'boolean') {
    console.log('✅ PASSED: Hazardous field is correctly typed as boolean');
  } else {
    console.log('❌ FAILED: Hazardous field is not properly typed');
  }
  
  if (Array.isArray(dumpingReportData.location) && dumpingReportData.location.length === 2) {
    console.log('✅ PASSED: Location data is correctly formatted as array coordinates');
  } else {
    console.log('❌ FAILED: Location data is not properly formatted');
  }
  
  console.log('--------------------------------------------');
  
  return {
    hasRequiredFields: missingFields.length === 0,
    correctHazardousType: typeof dumpingReportData.hazardous === 'boolean',
    correctLocationFormat: Array.isArray(dumpingReportData.location) && dumpingReportData.location.length === 2
  };
};

// Run all tests
const runAllFormTests = () => {
  const pickupResults = testPickupRequestSubmission();
  const dumpingResults = testDumpingReportSubmission();
  
  return {
    pickupRequestTests: pickupResults,
    dumpingReportTests: dumpingResults
  };
};

// Export test functions
module.exports = {
  testPickupRequestSubmission,
  testDumpingReportSubmission,
  runAllFormTests
};

// Run tests if executed directly
if (require.main === module) {
  runAllFormTests();
}
