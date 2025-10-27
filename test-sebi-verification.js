/**
 * Test SEBI Verification Service
 *
 * Run with: node test-sebi-verification.js
 */

const sebiVerificationService = require('./src/services/sebiVerificationService');

async function testVerification() {
  console.log('========================================');
  console.log('SEBI Verification Service Test');
  console.log('========================================\n');

  // Test cases
  const testCases = [
    {
      name: 'Valid INA number',
      regNumber: 'INA000017523',
      expectedValid: true
    },
    {
      name: 'Invalid format (too short)',
      regNumber: 'INA12345',
      expectedValid: false
    },
    {
      name: 'Invalid format (wrong prefix)',
      regNumber: 'XYZ000017523',
      expectedValid: false
    },
    {
      name: 'Empty string',
      regNumber: '',
      expectedValid: false
    }
  ];

  for (const testCase of testCases) {
    console.log(`\nTest: ${testCase.name}`);
    console.log(`Registration Number: ${testCase.regNumber}`);
    console.log('---');

    try {
      const result = await sebiVerificationService.verifySEBIRegistration(testCase.regNumber);

      console.log('Result:', JSON.stringify(result, null, 2));

      if (result.isValid === testCase.expectedValid) {
        console.log('✅ Test PASSED');
      } else {
        console.log('❌ Test FAILED - Expected:', testCase.expectedValid, 'Got:', result.isValid);
      }
    } catch (error) {
      console.log('❌ Error:', error.message);
    }

    // Add delay between requests to avoid rate limiting
    await new Promise(resolve => setTimeout(resolve, 2000));
  }

  console.log('\n========================================');
  console.log('Service Health Check');
  console.log('========================================\n');

  try {
    const health = await sebiVerificationService.checkServiceHealth();
    console.log('Health Status:', JSON.stringify(health, null, 2));
  } catch (error) {
    console.error('Health check error:', error.message);
  }

  console.log('\n========================================');
  console.log('Test Complete');
  console.log('========================================');
}

// Run tests
testVerification().catch(console.error);
