import qrStorage from './qrStorage';
import supabase from './supabaseClient';

// Test function to verify QR code operations
async function testQRCodeOperations() {
  try {
    console.log('Starting QR code tests...');

    // Test 1: Create a new QR code
    const locationId = '123e4567-e89b-12d3-a456-426614174000';
    const userId = (await supabase.auth.getUser()).data.user?.id;
    
    if (!userId) {
      throw new Error('No authenticated user found');
    }

    console.log('Test 1: Creating new QR code...');
    const qrCodeUrl = `https://api.qrserver.com/v1/create-qr-code/?size=200x200&data=trashdrop-location-${locationId}`;
    const storedQR = await qrStorage.storeQRCode({
      userId,
      locationId,
      qrCodeUrl
    });
    console.log('Created QR code:', storedQR);

    // Test 2: Retrieve the QR code
    console.log('\nTest 2: Retrieving QR code...');
    const retrievedQR = await qrStorage.getQRCode(locationId);
    console.log('Retrieved QR code:', retrievedQR);

    // Test 3: Test expired QR code handling
    console.log('\nTest 3: Testing expired QR code handling...');
    if (retrievedQR) {
      await qrStorage.invalidateQRCode(retrievedQR.id);
      const expiredQR = await qrStorage.getQRCode(locationId);
      console.log('Expired QR code result:', expiredQR);
    }

    // Test 4: Cleanup expired codes
    console.log('\nTest 4: Testing cleanup...');
    const cleanedCount = await qrStorage.cleanupExpiredQRCodes();
    console.log('Number of QR codes cleaned up:', cleanedCount);

  } catch (error) {
    console.error('Test failed:', error);
  }
}

// Run tests
testQRCodeOperations();
