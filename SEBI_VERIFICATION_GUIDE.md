# SEBI Verification Implementation Guide

## Overview

The SEBI verification service validates analyst registration numbers against the official SEBI (Securities and Exchange Board of India) website in real-time. This ensures all analysts on the platform have authentic, currently active SEBI credentials.

## Features

✅ **Real-time verification** - Scrapes SEBI website to verify registration numbers
✅ **No hardcoded data** - All verification done against live SEBI database
✅ **Format validation** - Validates INA/INH/INM/INP format before web scraping
✅ **Error handling** - Graceful handling of network timeouts and errors
✅ **Batch support** - Can verify multiple registrations (for admin queue)
✅ **Health check** - Monitor SEBI service availability

## Supported Registration Types

| Prefix | Type                                  | Description                          |
|--------|---------------------------------------|--------------------------------------|
| `INA`  | Investment Adviser (Individual)       | Individual investment advisors       |
| `INH`  | Investment Adviser (Non-Individual)   | Corporate/firm investment advisors   |
| `INM`  | Portfolio Manager                     | Portfolio management services        |
| `INP`  | Portfolio Manager                     | Portfolio management services        |

## Installation

The required dependencies are already installed:

```bash
npm install axios cheerio
```

## Usage

### 1. Basic Verification

```javascript
const sebiVerificationService = require('./src/services/sebiVerificationService');

async function verifyAnalyst() {
  const regNumber = 'INA000017523';

  try {
    const result = await sebiVerificationService.verifySEBIRegistration(regNumber);

    if (result.isValid) {
      console.log('✅ Valid SEBI registration!');
      console.log('Type:', result.registrationType);
      console.log('Verified at:', result.verifiedAt);
    } else {
      console.log('❌ Invalid registration');
      console.log('Reason:', result.reason);
    }
  } catch (error) {
    console.error('Verification error:', error.message);
  }
}
```

### 2. Integrated in Profile Setup

The verification is automatically triggered during analyst profile setup:

```javascript
// From analystController.js - completeProfileSetup()
const verificationResult = await sebiVerificationService.verifySEBIRegistration(sebi_number);

if (!verificationResult.isValid) {
  throw new AppError(
    `SEBI verification failed: ${verificationResult.reason}`,
    400
  );
}
```

### 3. Batch Verification (Admin)

```javascript
const regNumbers = ['INA000017523', 'INH000001234', 'INM000005678'];

const results = await sebiVerificationService.batchVerifySEBIRegistrations(regNumbers);

results.forEach(result => {
  console.log(`${result.registrationNumber}: ${result.isValid ? '✅' : '❌'}`);
});
```

### 4. Health Check

```javascript
const health = await sebiVerificationService.checkServiceHealth();

if (health.status === 'healthy') {
  console.log('SEBI service is operational');
} else {
  console.log('SEBI service unavailable:', health.message);
}
```

## API Reference

### `verifySEBIRegistration(regNumber)`

Verify a single SEBI registration number.

**Parameters:**
- `regNumber` (string) - SEBI registration number (e.g., 'INA000017523')

**Returns:**
```javascript
{
  isValid: true,
  registrationNumber: 'INA000017523',
  verifiedAt: '2025-01-24T10:30:00.000Z',
  source: 'SEBI Official Website',
  registrationType: 'Investment Adviser (Individual)'
}
```

**Or if invalid:**
```javascript
{
  isValid: false,
  registrationNumber: 'INA999999999',
  reason: 'Registration number not found in SEBI database'
}
```

### `batchVerifySEBIRegistrations(regNumbers)`

Verify multiple SEBI registration numbers.

**Parameters:**
- `regNumbers` (Array<string>) - Array of registration numbers

**Returns:** Array of verification results

**Note:** Includes 1 second delay between requests to avoid rate limiting

### `checkServiceHealth()`

Check if SEBI verification service is available.

**Returns:**
```javascript
{
  status: 'healthy',
  message: 'SEBI verification service is operational',
  responseTime: 'N/A'
}
```

## Error Handling

The service handles various error scenarios:

### Format Validation Error
```javascript
{
  isValid: false,
  registrationNumber: 'INVALID123',
  reason: 'Invalid SEBI registration number format. Expected format: INA/INH/INM/INP followed by 9 digits'
}
```

### Network Timeout (10 seconds)
```javascript
throw new AppError('SEBI verification timeout. Please try again.', 504);
```

### Connection Error
```javascript
throw new AppError('Unable to connect to SEBI website. Please try again later.', 503);
```

## Testing

Run the test script to verify the service:

```bash
node test-sebi-verification.js
```

Expected output:
```
========================================
SEBI Verification Service Test
========================================

Test: Valid INA number
Registration Number: INA000017523
---
Result: {
  "isValid": true,
  "registrationNumber": "INA000017523",
  "verifiedAt": "2025-01-24T10:30:00.000Z",
  "source": "SEBI Official Website",
  "registrationType": "Investment Adviser (Individual)"
}
✅ Test PASSED

...
```

## Flow Diagram

```
Analyst Signup
      ↓
Enter SEBI Number
      ↓
Format Validation (Frontend)
      ↓
Submit to Backend
      ↓
Format Validation (Backend) ──→ Invalid? Return Error
      ↓
SEBI Website Verification ──→ Network Error? Return 503
      ↓                   ╰──→ Not Found? Return 400
      ↓
✅ Verified Successfully
      ↓
Create Analyst Profile
```

## Performance

- **Format validation**: < 1ms (regex check)
- **SEBI website verification**: 2-5 seconds (network dependent)
- **Timeout limit**: 10 seconds
- **Rate limiting**: 1 request per second (batch mode)

## Best Practices

1. **Always validate format first** - Avoid unnecessary network requests
2. **Handle timeouts gracefully** - Provide retry options to users
3. **Log verification attempts** - Track success/failure rates
4. **Cache results (optional)** - Consider caching valid registrations for 24 hours
5. **Monitor SEBI availability** - Use health check endpoint

## Security Considerations

✅ No hardcoded or dummy registration numbers
✅ Real-time verification against official source
✅ Cannot bypass verification with fake numbers
✅ Timeout protection prevents hanging requests
✅ Proper error messages without exposing system details

## Troubleshooting

### Issue: SEBI website is slow
**Solution:** Increase timeout in `sebiVerificationService.js`:
```javascript
timeout: 15000 // Increase to 15 seconds
```

### Issue: Verification always fails
**Solution:** Check SEBI website URL is accessible:
```bash
curl https://www.sebi.gov.in/sebiweb/other/OtherAction.do?doRecognisedFpi=yes&intmId=13
```

### Issue: Rate limiting errors
**Solution:** Increase delay between batch requests:
```javascript
await new Promise(resolve => setTimeout(resolve, 2000)); // 2 seconds
```

## Future Enhancements

- [ ] Cache verified registrations for 24 hours
- [ ] Support RIA (Registered Investment Advisor) verification
- [ ] Add verification status webhook for async processing
- [ ] Implement retry logic with exponential backoff
- [ ] Add metrics/analytics for verification success rates

## Support

For issues or questions:
- Check logs: `console.log('[SEBI Verification]')`
- Review test script: `node test-sebi-verification.js`
- Contact: backend team

---

**Last Updated:** January 2025
**Version:** 1.0.0
