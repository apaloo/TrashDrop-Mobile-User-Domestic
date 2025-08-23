const fs = require('fs');
const path = require('path');
const { exec } = require('child_process');

const certFilePath = path.join(__dirname, 'localhost.pem');
const keyFilePath = path.join(__dirname, 'localhost-key.pem');

// Check if certificate files already exist
if (fs.existsSync(certFilePath) && fs.existsSync(keyFilePath)) {
  console.log('SSL certificates already exist!');
  console.log(`Certificate: ${certFilePath}`);
  console.log(`Key: ${keyFilePath}`);
  console.log('You can now run "npm run start:https" to start the HTTPS server');
  process.exit(0);
}

console.log('Generating self-signed SSL certificate for localhost development...');

// Command to generate self-signed certificate for localhost
const command = 'openssl req -x509 -newkey rsa:2048 -nodes -sha256 -subj "/CN=localhost" -keyout localhost-key.pem -out localhost.pem -days 365';

exec(command, (error, stdout, stderr) => {
  if (error) {
    console.error('Failed to generate certificates:', error);
    return;
  }
  
  console.log('SSL certificates successfully generated!');
  console.log(`Certificate: ${certFilePath}`);
  console.log(`Key: ${keyFilePath}`);
  console.log('');
  console.log('You can now run "npm run start:https" to start the HTTPS server');
  
  if (stderr) {
    console.log('OpenSSL info:', stderr);
  }
});
