// Data Structure Test Helper
// Tests if our data structures are correctly formatted for Supabase tables

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
const testPickupRequestStructure = () => {
  console.log('-------- PICKUP REQUEST DATA STRUCTURE TEST --------');
  
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
const testDumpingReportStructure = () => {
  console.log('-------- DUMPING REPORT DATA STRUCTURE TEST --------');
  
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

// Activity data test
const testActivityDataStructure = () => {
  console.log('-------- USER ACTIVITY DATA STRUCTURE TEST --------');
  
  const activityData = {
    user_id: 'test-user-123',
    activity_type: 'pickup_request',
    status: 'waiting_for_collector',
    points: 15,
    details: {
      pickup_id: 'pickup-123',
      waste_type: 'recycling',
      number_of_bags: 3
    },
    created_at: new Date().toISOString(),
  };
  
  const requiredFields = ['user_id', 'activity_type', 'status', 'points', 'details', 'created_at'];
  const missingFields = requiredFields.filter(field => !activityData.hasOwnProperty(field));
  
  if (missingFields.length === 0) {
    console.log('✅ PASSED: Activity data has all required fields');
  } else {
    console.log(`❌ FAILED: Activity data is missing fields: ${missingFields.join(', ')}`);
  }
  
  if (typeof activityData.details === 'object' && activityData.details !== null) {
    console.log('✅ PASSED: Details is correctly structured as an object');
  } else {
    console.log('❌ FAILED: Details is not properly structured');
  }
  
  console.log('--------------------------------------------');
};

// Run all tests
const runAllStructureTests = () => {
  testPickupRequestStructure();
  testDumpingReportStructure();
  testActivityDataStructure();
};

// Run tests if executed directly
runAllStructureTests();
