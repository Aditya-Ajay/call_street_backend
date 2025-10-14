/**
 * Cloudinary Configuration
 *
 * Manages file upload and storage using Cloudinary service
 * Used for analyst profile images, verification documents, and post media
 */

const cloudinary = require('cloudinary').v2;
const config = require('./env');

// Configure Cloudinary
cloudinary.config({
  cloud_name: config.cloudinary.cloudName,
  api_key: config.cloudinary.apiKey,
  api_secret: config.cloudinary.apiSecret,
  secure: true
});

/**
 * Upload file to Cloudinary
 *
 * @param {string} filePath - Path to file or base64 string
 * @param {Object} options - Upload options
 * @param {string} options.folder - Cloudinary folder name
 * @param {string} options.resourceType - Type of resource (image, video, raw)
 * @param {string} options.publicId - Custom public ID
 * @param {Array<Object>} options.transformation - Image transformations
 * @returns {Promise<Object>} - Upload result
 */
const uploadFile = async (filePath, options = {}) => {
  try {
    const defaultOptions = {
      folder: 'analyst-platform',
      resource_type: 'auto',
      use_filename: true,
      unique_filename: true,
      overwrite: false,
      ...options
    };

    const result = await cloudinary.uploader.upload(filePath, defaultOptions);

    return {
      success: true,
      url: result.secure_url,
      publicId: result.public_id,
      format: result.format,
      width: result.width,
      height: result.height,
      size: result.bytes
    };
  } catch (error) {
    console.error('Cloudinary upload error:', error.message);
    throw new Error(`File upload failed: ${error.message}`);
  }
};

/**
 * Upload profile image with optimization
 *
 * @param {string} filePath - Path to image file
 * @param {string} userId - User ID for folder organization
 * @returns {Promise<Object>} - Upload result
 */
const uploadProfileImage = async (filePath, userId) => {
  return uploadFile(filePath, {
    folder: `analyst-platform/profiles/${userId}`,
    transformation: [
      { width: 400, height: 400, crop: 'fill', gravity: 'face' },
      { quality: 'auto', fetch_format: 'auto' }
    ]
  });
};

/**
 * Upload verification document
 *
 * @param {string} filePath - Path to document file
 * @param {string} analystId - Analyst ID for folder organization
 * @param {string} documentType - Type of document (sebi_certificate, pan_card, etc.)
 * @returns {Promise<Object>} - Upload result
 */
const uploadVerificationDocument = async (filePath, analystId, documentType) => {
  return uploadFile(filePath, {
    folder: `analyst-platform/verifications/${analystId}`,
    public_id: `${analystId}_${documentType}`,
    resource_type: 'auto'
  });
};

/**
 * Upload post media (image/video)
 *
 * @param {string} filePath - Path to media file
 * @param {string} postId - Post ID for folder organization
 * @returns {Promise<Object>} - Upload result
 */
const uploadPostMedia = async (filePath, postId) => {
  return uploadFile(filePath, {
    folder: `analyst-platform/posts/${postId}`,
    transformation: [
      { quality: 'auto', fetch_format: 'auto' }
    ]
  });
};

/**
 * Delete file from Cloudinary
 *
 * @param {string} publicId - Cloudinary public ID
 * @param {string} resourceType - Type of resource (image, video, raw)
 * @returns {Promise<Object>} - Deletion result
 */
const deleteFile = async (publicId, resourceType = 'image') => {
  try {
    const result = await cloudinary.uploader.destroy(publicId, {
      resource_type: resourceType
    });

    return {
      success: result.result === 'ok',
      message: result.result
    };
  } catch (error) {
    console.error('Cloudinary delete error:', error.message);
    throw new Error(`File deletion failed: ${error.message}`);
  }
};

/**
 * Delete multiple files from Cloudinary
 *
 * @param {Array<string>} publicIds - Array of Cloudinary public IDs
 * @param {string} resourceType - Type of resource (image, video, raw)
 * @returns {Promise<Object>} - Deletion result
 */
const deleteMultipleFiles = async (publicIds, resourceType = 'image') => {
  try {
    const result = await cloudinary.api.delete_resources(publicIds, {
      resource_type: resourceType
    });

    return {
      success: true,
      deleted: result.deleted,
      notFound: result.not_found
    };
  } catch (error) {
    console.error('Cloudinary bulk delete error:', error.message);
    throw new Error(`Bulk deletion failed: ${error.message}`);
  }
};

/**
 * Get file details from Cloudinary
 *
 * @param {string} publicId - Cloudinary public ID
 * @returns {Promise<Object>} - File details
 */
const getFileDetails = async (publicId) => {
  try {
    const result = await cloudinary.api.resource(publicId);

    return {
      success: true,
      url: result.secure_url,
      format: result.format,
      width: result.width,
      height: result.height,
      size: result.bytes,
      createdAt: result.created_at
    };
  } catch (error) {
    console.error('Cloudinary get details error:', error.message);
    throw new Error(`Failed to get file details: ${error.message}`);
  }
};

/**
 * Generate optimized image URL with transformations
 *
 * @param {string} publicId - Cloudinary public ID
 * @param {Object} options - Transformation options
 * @returns {string} - Optimized image URL
 */
const getOptimizedUrl = (publicId, options = {}) => {
  const defaultOptions = {
    quality: 'auto',
    fetch_format: 'auto',
    ...options
  };

  return cloudinary.url(publicId, defaultOptions);
};

// Verify Cloudinary configuration on startup
const verifyCloudinaryConfig = () => {
  if (!config.cloudinary.cloudName || !config.cloudinary.apiKey || !config.cloudinary.apiSecret) {
    console.warn('Cloudinary configuration incomplete. File upload features will be disabled.');
    return false;
  }

  console.log('Cloudinary configured successfully');
  console.log(`Cloud Name: ${config.cloudinary.cloudName}`);
  return true;
};

// Verify on module load
verifyCloudinaryConfig();

module.exports = {
  cloudinary,
  uploadFile,
  uploadProfileImage,
  uploadVerificationDocument,
  uploadPostMedia,
  deleteFile,
  deleteMultipleFiles,
  getFileDetails,
  getOptimizedUrl
};
