/**
 * Custom Validators
 *
 * Additional validation functions beyond express-validator
 * For business logic validation
 */

const { SPECIALIZATIONS, SUBSCRIPTION_TIERS, USER_ROLES } = require('./constants');

/**
 * Validate SEBI registration number format
 * @param {string} sebiNumber - SEBI registration number
 * @returns {boolean} - True if valid format
 */
const isValidSebiNumber = (sebiNumber) => {
  // SEBI format: INH/INA/INM/INP + 9 digits
  // INH = Investment Adviser (Non-Individual)
  // INA = Investment Adviser (Individual)
  // INM = Portfolio Manager
  // INP = Portfolio Manager
  const sebiRegex = /^IN[AHMNP]\d{9}$/;
  return sebiRegex.test(sebiNumber.toUpperCase());
};

/**
 * Validate PAN card number format
 * @param {string} panNumber - PAN card number
 * @returns {boolean} - True if valid format
 */
const isValidPanNumber = (panNumber) => {
  // PAN format: ABCDE1234F (5 letters + 4 digits + 1 letter)
  const panRegex = /^[A-Z]{5}\d{4}[A-Z]$/;
  return panRegex.test(panNumber);
};

/**
 * Validate Aadhaar number format
 * @param {string} aadhaarNumber - Aadhaar number
 * @returns {boolean} - True if valid format
 */
const isValidAadhaarNumber = (aadhaarNumber) => {
  // Aadhaar format: 12 digits
  const aadhaarRegex = /^\d{12}$/;
  return aadhaarRegex.test(aadhaarNumber.replace(/\s/g, ''));
};

/**
 * Validate specialization
 * @param {string} specialization - Analyst specialization
 * @returns {boolean} - True if valid
 */
const isValidSpecialization = (specialization) => {
  return Object.values(SPECIALIZATIONS).includes(specialization);
};

/**
 * Validate subscription tier
 * @param {string} tier - Subscription tier
 * @returns {boolean} - True if valid
 */
const isValidSubscriptionTier = (tier) => {
  return Object.values(SUBSCRIPTION_TIERS).includes(tier);
};

/**
 * Validate user role
 * @param {string} role - User role
 * @returns {boolean} - True if valid
 */
const isValidUserRole = (role) => {
  return Object.values(USER_ROLES).includes(role);
};

/**
 * Validate rating value
 * @param {number} rating - Rating value
 * @returns {boolean} - True if valid (1-5)
 */
const isValidRating = (rating) => {
  return Number.isInteger(rating) && rating >= 1 && rating <= 5;
};

/**
 * Validate experience years
 * @param {number} years - Experience years
 * @returns {boolean} - True if valid (0-50)
 */
const isValidExperience = (years) => {
  return Number.isInteger(years) && years >= 0 && years <= 50;
};

/**
 * Validate price amount
 * @param {number} amount - Price amount
 * @returns {boolean} - True if valid (positive number)
 */
const isValidPrice = (amount) => {
  return typeof amount === 'number' && amount > 0 && Number.isFinite(amount);
};

/**
 * Validate URL format
 * @param {string} url - URL to validate
 * @returns {boolean} - True if valid URL
 */
const isValidUrl = (url) => {
  try {
    new URL(url);
    return true;
  } catch (error) {
    return false;
  }
};

/**
 * Validate date is in the past
 * @param {Date|string} date - Date to validate
 * @returns {boolean} - True if date is in the past
 */
const isDateInPast = (date) => {
  return new Date(date) < new Date();
};

/**
 * Validate date is in the future
 * @param {Date|string} date - Date to validate
 * @returns {boolean} - True if date is in the future
 */
const isDateInFuture = (date) => {
  return new Date(date) > new Date();
};

/**
 * Validate file extension
 * @param {string} filename - File name
 * @param {Array<string>} allowedExtensions - Allowed extensions
 * @returns {boolean} - True if valid extension
 */
const hasValidExtension = (filename, allowedExtensions) => {
  const extension = filename.split('.').pop().toLowerCase();
  return allowedExtensions.includes(`.${extension}`) || allowedExtensions.includes(extension);
};

/**
 * Validate file size
 * @param {number} size - File size in bytes
 * @param {number} maxSize - Maximum size in bytes
 * @returns {boolean} - True if size is within limit
 */
const isValidFileSize = (size, maxSize) => {
  return size > 0 && size <= maxSize;
};

/**
 * Validate image dimensions
 * @param {Object} dimensions - Image dimensions {width, height}
 * @param {Object} requirements - Requirements {minWidth, minHeight, maxWidth, maxHeight}
 * @returns {boolean} - True if dimensions are valid
 */
const hasValidDimensions = (dimensions, requirements) => {
  const { width, height } = dimensions;
  const { minWidth = 0, minHeight = 0, maxWidth = Infinity, maxHeight = Infinity } = requirements;

  return (
    width >= minWidth &&
    width <= maxWidth &&
    height >= minHeight &&
    height <= maxHeight
  );
};

/**
 * Validate JSON string
 * @param {string} str - String to validate
 * @returns {boolean} - True if valid JSON
 */
const isValidJSON = (str) => {
  try {
    JSON.parse(str);
    return true;
  } catch (error) {
    return false;
  }
};

/**
 * Validate array has unique values
 * @param {Array} arr - Array to validate
 * @returns {boolean} - True if all values are unique
 */
const hasUniqueValues = (arr) => {
  return arr.length === new Set(arr).size;
};

/**
 * Validate string contains only alphanumeric characters
 * @param {string} str - String to validate
 * @returns {boolean} - True if alphanumeric
 */
const isAlphanumeric = (str) => {
  return /^[a-zA-Z0-9]+$/.test(str);
};

/**
 * Validate string contains only letters
 * @param {string} str - String to validate
 * @returns {boolean} - True if only letters
 */
const isOnlyLetters = (str) => {
  return /^[a-zA-Z\s]+$/.test(str);
};

/**
 * Validate string contains only numbers
 * @param {string} str - String to validate
 * @returns {boolean} - True if only numbers
 */
const isOnlyNumbers = (str) => {
  return /^\d+$/.test(str);
};

/**
 * Validate minimum age
 * @param {Date|string} birthDate - Birth date
 * @param {number} minAge - Minimum age required
 * @returns {boolean} - True if meets minimum age
 */
const meetsMinimumAge = (birthDate, minAge = 18) => {
  const today = new Date();
  const birth = new Date(birthDate);
  const age = today.getFullYear() - birth.getFullYear();
  const monthDiff = today.getMonth() - birth.getMonth();

  if (monthDiff < 0 || (monthDiff === 0 && today.getDate() < birth.getDate())) {
    return age - 1 >= minAge;
  }

  return age >= minAge;
};

/**
 * Validate password strength
 * @param {string} password - Password to validate
 * @returns {Object} - Validation result with score and feedback
 */
const validatePasswordStrength = (password) => {
  const result = {
    isValid: false,
    score: 0,
    feedback: []
  };

  if (password.length < 8) {
    result.feedback.push('Password must be at least 8 characters');
  } else {
    result.score += 1;
  }

  if (!/[a-z]/.test(password)) {
    result.feedback.push('Password must contain lowercase letters');
  } else {
    result.score += 1;
  }

  if (!/[A-Z]/.test(password)) {
    result.feedback.push('Password must contain uppercase letters');
  } else {
    result.score += 1;
  }

  if (!/\d/.test(password)) {
    result.feedback.push('Password must contain numbers');
  } else {
    result.score += 1;
  }

  if (!/[@$!%*?&]/.test(password)) {
    result.feedback.push('Password must contain special characters (@$!%*?&)');
  } else {
    result.score += 1;
  }

  result.isValid = result.score === 5;

  return result;
};

/**
 * Validate tier access (user can access content)
 * @param {string} userTier - User's subscription tier
 * @param {string} contentTier - Content's required tier
 * @returns {boolean} - True if user can access content
 */
const canAccessTierContent = (userTier, contentTier) => {
  const tierHierarchy = {
    basic: 1,
    premium: 2,
    pro: 3
  };

  return tierHierarchy[userTier] >= tierHierarchy[contentTier];
};

module.exports = {
  isValidSebiNumber,
  isValidPanNumber,
  isValidAadhaarNumber,
  isValidSpecialization,
  isValidSubscriptionTier,
  isValidUserRole,
  isValidRating,
  isValidExperience,
  isValidPrice,
  isValidUrl,
  isDateInPast,
  isDateInFuture,
  hasValidExtension,
  isValidFileSize,
  hasValidDimensions,
  isValidJSON,
  hasUniqueValues,
  isAlphanumeric,
  isOnlyLetters,
  isOnlyNumbers,
  meetsMinimumAge,
  validatePasswordStrength,
  canAccessTierContent
};
