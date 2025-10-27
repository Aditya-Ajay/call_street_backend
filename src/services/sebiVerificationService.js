/**
 * SEBI Registration Verification Service
 *
 * Verifies SEBI registration numbers by scraping the official SEBI website
 * This ensures analyst credentials are authentic and currently valid
 *
 * SECURITY:
 * - No hardcoded registration numbers
 * - Real-time verification against SEBI database
 * - Timeout protection (10 seconds max)
 * - Error handling for network issues
 */

const axios = require('axios');
const cheerio = require('cheerio');
const { AppError } = require('../middleware/errorHandler');

/**
 * SEBI website URLs for different registration types
 */
const SEBI_URLS = {
  // Investment Advisors (Individual) - INA
  INA: 'https://www.sebi.gov.in/sebiweb/other/OtherAction.do?doRecognisedFpi=yes&intmId=13',

  // Investment Advisors (Non-Individual) - INH
  INH: 'https://www.sebi.gov.in/sebiweb/other/OtherAction.do?doRecognisedFpi=yes&intmId=13',

  // Portfolio Managers - INM/INP
  INM: 'https://www.sebi.gov.in/sebiweb/other/OtherAction.do?doRecognisedFpi=yes&intmId=10',
  INP: 'https://www.sebi.gov.in/sebiweb/other/OtherAction.do?doRecognisedFpi=yes&intmId=10'
};

/**
 * Verify SEBI registration number against official SEBI website
 *
 * @param {string} regNumber - SEBI registration number (e.g., INA000017523)
 * @returns {Promise<Object>} - Verification result
 * @throws {AppError} - If verification fails or network error
 */
const verifySEBIRegistration = async (regNumber) => {
  try {
    if (!regNumber || typeof regNumber !== 'string') {
      throw new AppError('Invalid SEBI registration number', 400);
    }

    // Normalize registration number (uppercase, trim)
    const normalizedRegNo = regNumber.trim().toUpperCase();

    // Validate format (INA/INH/INM/INP + 9 digits)
    const sebiRegex = /^IN[AHMNP]\d{9}$/;
    if (!sebiRegex.test(normalizedRegNo)) {
      return {
        isValid: false,
        registrationNumber: normalizedRegNo,
        reason: 'Invalid SEBI registration number format. Expected format: INA/INH/INM/INP followed by 9 digits'
      };
    }

    // Determine registration type from prefix
    const prefix = normalizedRegNo.substring(0, 3);
    const sebiUrl = SEBI_URLS[prefix];

    if (!sebiUrl) {
      return {
        isValid: false,
        registrationNumber: normalizedRegNo,
        reason: `Unsupported SEBI registration type: ${prefix}`
      };
    }

    console.log(`[SEBI Verification] Checking registration: ${normalizedRegNo}`);
    console.log(`[SEBI Verification] Fetching from: ${sebiUrl}`);

    // Fetch SEBI website with timeout
    const response = await axios.get(sebiUrl, {
      timeout: 10000, // 10 second timeout
      headers: {
        'User-Agent': 'Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/91.0.4472.124 Safari/537.36'
      }
    });

    // Parse HTML response
    const $ = cheerio.load(response.data);
    const pageText = $('body').text();

    // Check if registration number exists in page
    const exists = pageText.includes(normalizedRegNo);

    if (exists) {
      console.log(`[SEBI Verification] ✅ Registration ${normalizedRegNo} VERIFIED on SEBI website`);
      return {
        isValid: true,
        registrationNumber: normalizedRegNo,
        verifiedAt: new Date().toISOString(),
        source: 'SEBI Official Website',
        registrationType: getRegistrationType(prefix)
      };
    } else {
      console.log(`[SEBI Verification] ❌ Registration ${normalizedRegNo} NOT FOUND on SEBI website`);
      return {
        isValid: false,
        registrationNumber: normalizedRegNo,
        reason: 'Registration number not found in SEBI database'
      };
    }

  } catch (error) {
    // Handle network errors gracefully
    if (error.code === 'ENOTFOUND' || error.code === 'ECONNREFUSED') {
      console.error('[SEBI Verification] Network error:', error.message);
      throw new AppError('Unable to connect to SEBI website. Please try again later.', 503);
    }

    if (error.code === 'ETIMEDOUT') {
      console.error('[SEBI Verification] Timeout error');
      throw new AppError('SEBI verification timeout. Please try again.', 504);
    }

    // Log unexpected errors
    console.error('[SEBI Verification] Verification failed:', error.message);
    throw error;
  }
};

/**
 * Get human-readable registration type
 *
 * @param {string} prefix - Registration prefix (INA, INH, INM, INP)
 * @returns {string} - Registration type description
 */
const getRegistrationType = (prefix) => {
  const types = {
    INA: 'Investment Adviser (Individual)',
    INH: 'Investment Adviser (Non-Individual)',
    INM: 'Portfolio Manager',
    INP: 'Portfolio Manager'
  };

  return types[prefix] || 'Unknown';
};

/**
 * Batch verify multiple SEBI registration numbers
 * Useful for admin verification queue
 *
 * @param {Array<string>} regNumbers - Array of SEBI registration numbers
 * @returns {Promise<Array<Object>>} - Array of verification results
 */
const batchVerifySEBIRegistrations = async (regNumbers) => {
  try {
    if (!Array.isArray(regNumbers) || regNumbers.length === 0) {
      throw new AppError('Invalid registration numbers array', 400);
    }

    console.log(`[SEBI Verification] Batch verifying ${regNumbers.length} registrations`);

    // Verify each registration (with delay to avoid rate limiting)
    const results = [];
    for (const regNo of regNumbers) {
      try {
        const result = await verifySEBIRegistration(regNo);
        results.push(result);

        // Add 1 second delay between requests to avoid overwhelming SEBI servers
        if (regNumbers.indexOf(regNo) < regNumbers.length - 1) {
          await new Promise(resolve => setTimeout(resolve, 1000));
        }
      } catch (error) {
        results.push({
          isValid: false,
          registrationNumber: regNo,
          reason: `Verification error: ${error.message}`
        });
      }
    }

    return results;
  } catch (error) {
    console.error('[SEBI Verification] Batch verification failed:', error.message);
    throw error;
  }
};

/**
 * Check if SEBI verification service is available
 * Health check endpoint
 *
 * @returns {Promise<Object>} - Service health status
 */
const checkServiceHealth = async () => {
  try {
    const testUrl = SEBI_URLS.INA;
    const response = await axios.get(testUrl, {
      timeout: 5000,
      headers: {
        'User-Agent': 'Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36'
      }
    });

    return {
      status: 'healthy',
      message: 'SEBI verification service is operational',
      responseTime: response.headers['x-response-time'] || 'N/A'
    };
  } catch (error) {
    return {
      status: 'unhealthy',
      message: `SEBI website unreachable: ${error.message}`,
      error: error.code
    };
  }
};

module.exports = {
  verifySEBIRegistration,
  batchVerifySEBIRegistrations,
  checkServiceHealth,
  getRegistrationType
};
