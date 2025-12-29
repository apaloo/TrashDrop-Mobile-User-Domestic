// QR Scanner Test Helper
// This script tests if the QR code validation logic works properly

// Generate a valid TrashDrops QR code format
const generateValidQRCode = (binId) => {
  const timestamp = Date.now();
  // Simple signature for test purposes (in production this would be cryptographically secure)
  const signature = `${binId}${timestamp}`.split('').reduce((a, b) => a + b.charCodeAt(0), 0).toString(16);
  return `TRASHDROP:${binId}:${timestamp}:${signature}`;
};

// Generate an invalid QR code
const generateInvalidQRCode = () => {
  return `https://somewebsite.com/page?id=123`;
};

// Test both valid and invalid QR codes
const runQRTests = () => {
  const validQR = generateValidQRCode('BIN123');
  const invalidQR = generateInvalidQRCode();
  
  console.log('-------- QR CODE VALIDATION TEST --------');
  console.log('Valid QR Code:', validQR);
  console.log('Testing valid QR code...');
  
  // Regex pattern from our QRScanner.js
  const isValidQR = (code) => {
    const pattern = /^TRASHDROP:[A-Za-z0-9]+:\d+:[a-f0-9]+$/;
    return pattern.test(code);
  };
  
  if (isValidQR(validQR)) {
    console.log('✅ PASSED: Valid QR code was correctly identified');
  } else {
    console.log('❌ FAILED: Valid QR code was incorrectly rejected');
  }
  
  console.log('\nInvalid QR Code:', invalidQR);
  console.log('Testing invalid QR code...');
  
  if (!isValidQR(invalidQR)) {
    console.log('✅ PASSED: Invalid QR code was correctly rejected');
  } else {
    console.log('❌ FAILED: Invalid QR code was incorrectly accepted');
  }
  
  console.log('----------------------------------------');
  
  return {
    validQR: isValidQR(validQR),
    invalidQR: !isValidQR(invalidQR)
  };
};

// Export the test functions
module.exports = {
  generateValidQRCode,
  generateInvalidQRCode,
  runQRTests
};

// Run tests if executed directly
if (require.main === module) {
  runQRTests();
}
