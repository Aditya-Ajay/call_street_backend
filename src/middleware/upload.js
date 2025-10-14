/**
 * File Upload Middleware (Multer Configuration)
 *
 * Handles file uploads for:
 * - Profile photos
 * - Verification documents (SEBI cert, PAN, bank statement)
 * - Post media (images)
 *
 * SECURITY:
 * - File type validation (MIME type and extension)
 * - File size limits (5MB for images, 10MB for documents)
 * - Temporary storage (files uploaded to /tmp, then moved to Cloudinary)
 */

const multer = require('multer');
const path = require('path');
const { AppError } = require('./errorHandler');

/**
 * Configure multer storage
 * Files are stored temporarily in memory before uploading to Cloudinary
 */
const storage = multer.diskStorage({
  destination: (req, file, cb) => {
    // Store in /tmp directory (will be cleaned up after upload)
    cb(null, '/tmp');
  },
  filename: (req, file, cb) => {
    // Generate unique filename: timestamp-randomstring-originalname
    const uniqueSuffix = `${Date.now()}-${Math.round(Math.random() * 1E9)}`;
    const ext = path.extname(file.originalname);
    const basename = path.basename(file.originalname, ext);
    cb(null, `${basename}-${uniqueSuffix}${ext}`);
  }
});

/**
 * File filter for profile images
 * Only allow JPG, JPEG, PNG
 */
const imageFileFilter = (req, file, cb) => {
  const allowedMimeTypes = ['image/jpeg', 'image/jpg', 'image/png', 'image/webp'];
  const allowedExtensions = ['.jpg', '.jpeg', '.png', '.webp'];

  const ext = path.extname(file.originalname).toLowerCase();

  if (allowedMimeTypes.includes(file.mimetype) && allowedExtensions.includes(ext)) {
    cb(null, true);
  } else {
    cb(new AppError('Invalid file type. Only JPG, PNG, and WebP images are allowed', 400), false);
  }
};

/**
 * File filter for verification documents
 * Allow PDF, JPG, PNG
 */
const documentFileFilter = (req, file, cb) => {
  const allowedMimeTypes = [
    'application/pdf',
    'image/jpeg',
    'image/jpg',
    'image/png'
  ];
  const allowedExtensions = ['.pdf', '.jpg', '.jpeg', '.png'];

  const ext = path.extname(file.originalname).toLowerCase();

  if (allowedMimeTypes.includes(file.mimetype) && allowedExtensions.includes(ext)) {
    cb(null, true);
  } else {
    cb(new AppError('Invalid file type. Only PDF, JPG, and PNG files are allowed', 400), false);
  }
};

/**
 * Multer instance for profile image uploads
 * Max size: 5MB
 */
const uploadProfileImage = multer({
  storage: storage,
  fileFilter: imageFileFilter,
  limits: {
    fileSize: 5 * 1024 * 1024, // 5MB
    files: 1 // Only 1 file at a time
  }
}).single('photo'); // Field name: 'photo'

/**
 * Multer instance for verification document uploads
 * Max size: 5MB (as per PRD requirement)
 */
const uploadDocument = multer({
  storage: storage,
  fileFilter: documentFileFilter,
  limits: {
    fileSize: 5 * 1024 * 1024, // 5MB
    files: 1 // Only 1 file at a time
  }
}).single('file'); // Field name: 'file'

/**
 * Multer instance for post media uploads
 * Max size: 10MB
 */
const uploadPostMedia = multer({
  storage: storage,
  fileFilter: imageFileFilter,
  limits: {
    fileSize: 10 * 1024 * 1024, // 10MB
    files: 1 // Only 1 file at a time
  }
}).single('media'); // Field name: 'media'

/**
 * Error handler for multer errors
 * Wrap multer middleware to catch and format errors
 */
const handleMulterError = (uploadMiddleware) => {
  return (req, res, next) => {
    uploadMiddleware(req, res, (err) => {
      if (err instanceof multer.MulterError) {
        // Multer-specific errors
        if (err.code === 'LIMIT_FILE_SIZE') {
          return next(new AppError('File size exceeds the maximum limit', 400));
        }
        if (err.code === 'LIMIT_UNEXPECTED_FILE') {
          return next(new AppError('Unexpected field in file upload', 400));
        }
        return next(new AppError(`File upload error: ${err.message}`, 400));
      } else if (err) {
        // Other errors (e.g., from fileFilter)
        return next(err);
      }
      // No error, proceed
      next();
    });
  };
};

/**
 * Export wrapped middleware with error handling
 */
module.exports = {
  uploadProfileImage: handleMulterError(uploadProfileImage),
  uploadDocument: handleMulterError(uploadDocument),
  uploadPostMedia: handleMulterError(uploadPostMedia)
};
