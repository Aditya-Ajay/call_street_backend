/**
 * Analyst Controller
 *
 * Handles all analyst-related API endpoints including:
 * - Analyst application/registration
 * - Profile management (CRUD)
 * - Document upload (SEBI cert, PAN, bank statement)
 * - Profile setup wizard
 * - Discovery page (public listing)
 * - Private dashboard
 *
 * SECURITY:
 * - Only authenticated analysts can manage their own profile
 * - Public endpoints accessible to all (discovery, public profile)
 * - Document uploads validated for type and size
 * - Profile updates require ownership verification
 */

const AnalystProfile = require('../models/AnalystProfile');
const User = require('../models/User');
const { asyncHandler, AppError } = require('../middleware/errorHandler');
const { uploadProfileImage, uploadVerificationDocument } = require('../config/cloudinary');
const { isValidSebiNumber, isValidPanNumber } = require('../utils/validators');
const { sendEmail, getEmailTemplate } = require('../services/emailService');
const config = require('../config/env');

/**
 * POST /api/analysts/apply
 * Submit analyst verification application
 *
 * @access Private (Authenticated users only)
 * @body {string} display_name - Public display name
 * @body {string} sebi_number - SEBI registration number
 * @body {string} ria_number - RIA number (optional, for USA)
 * @body {string} country - Country code (default: IN)
 */
const applyForVerification = asyncHandler(async (req, res) => {
  const { display_name, sebi_number, ria_number, country = 'IN' } = req.body;
  const userId = req.user.id;

  // Validation
  if (!display_name || display_name.trim().length < 3) {
    throw new AppError('Display name must be at least 3 characters', 400);
  }

  if (!sebi_number && !ria_number) {
    throw new AppError('Either SEBI number or RIA number is required', 400);
  }

  // Validate SEBI number format (if provided)
  if (sebi_number && !isValidSebiNumber(sebi_number)) {
    throw new AppError('Invalid SEBI number format. Expected format: INH200001234', 400);
  }

  // Check if user already has an analyst profile
  const existingProfile = await AnalystProfile.findByUserId(userId);
  if (existingProfile) {
    throw new AppError('You already have an analyst profile', 409);
  }

  // Check if SEBI number is already registered
  if (sebi_number) {
    const existingSebi = await AnalystProfile.findBySebiNumber(sebi_number);
    if (existingSebi) {
      throw new AppError('This SEBI number is already registered', 409);
    }
  }

  // Update user role to analyst
  await User.update(userId, { role: 'analyst' });

  // Create analyst profile
  const profile = await AnalystProfile.create({
    user_id: userId,
    display_name: display_name.trim(),
    sebi_number: sebi_number?.toUpperCase() || null,
    ria_number: ria_number?.toUpperCase() || null,
    country,
    specializations: [],
    languages: []
  });

  // Send application received email
  try {
    const user = await User.findById(userId);
    if (user.email) {
      await sendApplicationReceivedEmail(user.email, display_name);
    }
  } catch (emailError) {
    console.error('Failed to send application email:', emailError.message);
    // Don't throw - email failure should not block application
  }

  res.status(201).json({
    success: true,
    message: 'Application submitted successfully. You will be notified once verification is complete.',
    data: {
      profile: {
        id: profile.id,
        display_name: profile.display_name,
        verification_status: profile.verification_status,
        sebi_number: profile.sebi_number,
        created_at: profile.created_at
      }
    }
  });
});

/**
 * POST /api/analysts/documents/upload
 * Upload verification documents (SEBI cert, PAN, bank statement)
 *
 * @access Private (Analysts only)
 * @body {string} document_type - Type: sebi_certificate, pan_card, bank_statement
 * @body {File} file - Document file (PDF/image, max 5MB)
 */
const uploadDocument = asyncHandler(async (req, res) => {
  const { document_type } = req.body;
  const userId = req.user.id;

  // Validation
  if (!document_type) {
    throw new AppError('Document type is required', 400);
  }

  const allowedTypes = ['sebi_certificate', 'pan_card', 'bank_statement'];
  if (!allowedTypes.includes(document_type)) {
    throw new AppError(`Invalid document type. Allowed: ${allowedTypes.join(', ')}`, 400);
  }

  if (!req.file) {
    throw new AppError('No file uploaded', 400);
  }

  // Validate file size (5MB max)
  const maxSize = 5 * 1024 * 1024; // 5MB
  if (req.file.size > maxSize) {
    throw new AppError('File size exceeds 5MB limit', 400);
  }

  // Validate file type
  const allowedMimeTypes = [
    'application/pdf',
    'image/jpeg',
    'image/jpg',
    'image/png'
  ];
  if (!allowedMimeTypes.includes(req.file.mimetype)) {
    throw new AppError('Invalid file type. Allowed: PDF, JPG, PNG', 400);
  }

  // Get analyst profile
  const profile = await AnalystProfile.findByUserId(userId);
  if (!profile) {
    throw new AppError('Analyst profile not found. Please apply for verification first.', 404);
  }

  // Check if already approved
  if (profile.verification_status === 'approved') {
    throw new AppError('Your profile is already verified. Contact support to update documents.', 400);
  }

  try {
    // Upload to Cloudinary
    const uploadResult = await uploadVerificationDocument(
      req.file.path,
      profile.id,
      document_type
    );

    // Update verification documents in profile
    const existingDocs = profile.verification_documents || [];

    // Remove old document of same type (if exists)
    const updatedDocs = existingDocs.filter(doc => doc.type !== document_type);

    // Add new document
    updatedDocs.push({
      type: document_type,
      url: uploadResult.url,
      public_id: uploadResult.publicId,
      uploaded_at: new Date().toISOString(),
      file_size: req.file.size,
      file_format: uploadResult.format
    });

    // Update profile with new documents
    const updatedProfile = await AnalystProfile.updateVerificationStatus(profile.id, {
      status: 'pending', // Keep as pending until all docs uploaded
      documents: updatedDocs
    });

    res.status(200).json({
      success: true,
      message: 'Document uploaded successfully',
      data: {
        document: {
          type: document_type,
          url: uploadResult.url,
          uploaded_at: updatedDocs[updatedDocs.length - 1].uploaded_at
        },
        documents_uploaded: updatedDocs.length,
        verification_status: updatedProfile.verification_status
      }
    });
  } catch (uploadError) {
    console.error('Document upload failed:', uploadError.message);
    throw new AppError('Failed to upload document. Please try again.', 500);
  }
});

/**
 * GET /api/analysts/profile/:id
 * Get public analyst profile
 *
 * @access Public
 * @param {string} id - Analyst profile ID
 */
const getPublicProfile = asyncHandler(async (req, res) => {
  const { id } = req.params;

  const profile = await AnalystProfile.findById(id);

  if (!profile) {
    throw new AppError('Analyst profile not found', 404);
  }

  // Only show approved profiles publicly
  if (profile.verification_status !== 'approved') {
    throw new AppError('This analyst profile is not yet verified', 403);
  }

  // Return public data only (exclude sensitive info)
  res.status(200).json({
    success: true,
    data: {
      profile: {
        id: profile.id,
        user_id: profile.user_id, // Added for posts filtering
        display_name: profile.display_name,
        bio: profile.bio,
        photo_url: profile.photo_url,
        specializations: profile.specializations,
        languages: profile.languages,
        sebi_number: profile.sebi_number,
        avg_rating: parseFloat(profile.avg_rating),
        total_reviews: profile.total_reviews,
        active_subscribers: profile.active_subscribers,
        total_posts: profile.total_posts,
        is_featured: profile.is_featured,
        verified_at: profile.verified_at,
        created_at: profile.created_at,
        last_post_at: profile.last_post_at
      }
    }
  });
});

/**
 * PUT /api/analysts/profile
 * Update own analyst profile
 *
 * @access Private (Analysts only)
 * @body {string} display_name - Display name
 * @body {string} bio - Bio/description (max 500 chars)
 * @body {Array<string>} specializations - Trading specializations
 * @body {Array<string>} languages - Languages spoken
 */
const updateProfile = asyncHandler(async (req, res) => {
  const userId = req.user.id;
  const { display_name, bio, specializations, languages } = req.body;

  // Get analyst profile
  const profile = await AnalystProfile.findByUserId(userId);
  if (!profile) {
    throw new AppError('Analyst profile not found', 404);
  }

  // Validation
  const updateData = {};

  if (display_name !== undefined) {
    if (display_name.trim().length < 3) {
      throw new AppError('Display name must be at least 3 characters', 400);
    }
    updateData.display_name = display_name.trim();
  }

  if (bio !== undefined) {
    if (bio.length > 500) {
      throw new AppError('Bio must be 500 characters or less', 400);
    }
    updateData.bio = bio.trim();
  }

  if (specializations !== undefined) {
    if (!Array.isArray(specializations)) {
      throw new AppError('Specializations must be an array', 400);
    }
    if (specializations.length === 0) {
      throw new AppError('At least one specialization is required', 400);
    }
    const validSpecs = ['Intraday', 'Swing', 'Options', 'Investment', 'Technical', 'Fundamental'];
    const invalidSpecs = specializations.filter(s => !validSpecs.includes(s));
    if (invalidSpecs.length > 0) {
      throw new AppError(`Invalid specializations: ${invalidSpecs.join(', ')}`, 400);
    }
    updateData.specializations = specializations;
  }

  if (languages !== undefined) {
    if (!Array.isArray(languages)) {
      throw new AppError('Languages must be an array', 400);
    }
    if (languages.length === 0) {
      throw new AppError('At least one language is required', 400);
    }
    const validLangs = ['English', 'Hindi', 'Hinglish', 'Tamil', 'Telugu', 'Gujarati', 'Marathi'];
    const invalidLangs = languages.filter(l => !validLangs.includes(l));
    if (invalidLangs.length > 0) {
      throw new AppError(`Invalid languages: ${invalidLangs.join(', ')}`, 400);
    }
    updateData.languages = languages;
  }

  if (Object.keys(updateData).length === 0) {
    throw new AppError('No valid fields provided for update', 400);
  }

  // Update profile
  const updatedProfile = await AnalystProfile.update(profile.id, updateData);

  res.status(200).json({
    success: true,
    message: 'Profile updated successfully',
    data: {
      profile: {
        id: updatedProfile.id,
        display_name: updatedProfile.display_name,
        bio: updatedProfile.bio,
        specializations: updatedProfile.specializations,
        languages: updatedProfile.languages,
        updated_at: updatedProfile.updated_at
      }
    }
  });
});

/**
 * POST /api/analysts/profile/photo
 * Upload profile photo
 *
 * @access Private (Analysts only)
 * @body {File} file - Profile image (JPG/PNG, max 5MB)
 */
const uploadProfilePhoto = asyncHandler(async (req, res) => {
  const userId = req.user.id;

  if (!req.file) {
    throw new AppError('No file uploaded', 400);
  }

  // Validate file type
  const allowedMimeTypes = ['image/jpeg', 'image/jpg', 'image/png'];
  if (!allowedMimeTypes.includes(req.file.mimetype)) {
    throw new AppError('Invalid file type. Only JPG and PNG allowed', 400);
  }

  // Validate file size (5MB max)
  const maxSize = 5 * 1024 * 1024;
  if (req.file.size > maxSize) {
    throw new AppError('File size exceeds 5MB limit', 400);
  }

  // Get analyst profile
  const profile = await AnalystProfile.findByUserId(userId);
  if (!profile) {
    throw new AppError('Analyst profile not found', 404);
  }

  try {
    // Upload to Cloudinary with transformations (circular crop, 400x400)
    const uploadResult = await uploadProfileImage(req.file.path, userId);

    // Update profile with photo URL
    const updatedProfile = await AnalystProfile.update(profile.id, {
      photo_url: uploadResult.url
    });

    res.status(200).json({
      success: true,
      message: 'Profile photo uploaded successfully',
      data: {
        photo_url: uploadResult.url
      }
    });
  } catch (uploadError) {
    console.error('Profile photo upload failed:', uploadError.message);
    throw new AppError('Failed to upload profile photo. Please try again.', 500);
  }
});

/**
 * GET /api/analysts/dashboard
 * Get private analyst dashboard data
 *
 * @access Private (Analysts only)
 */
const getDashboard = asyncHandler(async (req, res) => {
  const userId = req.user.id;

  // Get analyst profile
  const profile = await AnalystProfile.findByUserId(userId);
  if (!profile) {
    throw new AppError('Analyst profile not found', 404);
  }

  // Get comprehensive dashboard data
  const dashboardData = await AnalystProfile.getDashboardData(profile.id);

  res.status(200).json({
    success: true,
    data: dashboardData
  });
});

/**
 * GET /api/analysts/discovery
 * Get analysts for discovery page (with filters)
 *
 * @access Public
 * @query {string} specializations - Comma-separated specializations
 * @query {string} languages - Comma-separated languages
 * @query {number} minRating - Minimum rating (1-5)
 * @query {number} maxPrice - Maximum monthly price
 * @query {string} search - Search by name
 * @query {string} sortBy - Sort option (popular, rating, newest, price)
 * @query {number} page - Page number (default: 1)
 * @query {number} limit - Results per page (default: 20, max: 100)
 */
const getDiscoveryList = asyncHandler(async (req, res) => {
  const {
    specializations,
    languages,
    minRating,
    maxPrice,
    search,
    sortBy = 'popular',
    page = 1,
    limit = 20
  } = req.query;

  // Parse filters
  const filters = {
    specializations: specializations ? specializations.split(',').map(s => s.trim()) : [],
    languages: languages ? languages.split(',').map(l => l.trim()) : [],
    minRating: minRating ? parseFloat(minRating) : 0,
    maxPrice: maxPrice ? parseInt(maxPrice, 10) : null,
    search: search || '',
    sortBy,
    page: parseInt(page, 10),
    limit: Math.min(parseInt(limit, 10), 100) // Cap at 100
  };

  // Validate filters
  if (filters.minRating < 0 || filters.minRating > 5) {
    throw new AppError('Invalid minRating. Must be between 0 and 5', 400);
  }

  const validSortOptions = ['popular', 'rating', 'newest', 'price'];
  if (!validSortOptions.includes(filters.sortBy)) {
    throw new AppError(`Invalid sortBy. Allowed: ${validSortOptions.join(', ')}`, 400);
  }

  // Get filtered analysts
  const result = await AnalystProfile.findForDiscovery(filters);

  res.status(200).json({
    success: true,
    data: {
      analysts: result.analysts,
      pagination: result.pagination,
      filters: {
        specializations: filters.specializations,
        languages: filters.languages,
        minRating: filters.minRating,
        sortBy: filters.sortBy
      }
    }
  });
});

/**
 * POST /api/analysts/profile/setup
 * Complete profile setup wizard (4-screen onboarding)
 *
 * @access Private (Analysts only)
 * @body {string} display_name - Public display name
 * @body {string} bio - Bio/description
 * @body {Array<string>} specializations - Trading specializations
 * @body {number} years_of_experience - Years of experience (0-50)
 * @body {string} sebi_number - SEBI registration number
 * @body {string} sebi_document_url - Uploaded SEBI document URL
 * @body {boolean} allow_free_subscribers - Allow free tier subscribers
 * @body {Object} pricing_tiers - Tier enablement {weekly_enabled, monthly_enabled, yearly_enabled}
 */
const completeProfileSetup = asyncHandler(async (req, res) => {
  const userId = req.user.id;
  const {
    display_name,
    bio,
    specializations,
    languages,
    years_of_experience,
    sebi_number,
    sebi_document_url,
    allow_free_subscribers = true,
    pricing_tiers = [],
    profile_photo_url
  } = req.body;

  const { pool } = require('../config/database');
  const sebiVerificationService = require('../services/sebiVerificationService');
  const client = await pool.connect();

  try {
    // Start transaction
    await client.query('BEGIN');

    // ============================================
    // 1. VALIDATION
    // ============================================
    const errors = [];

    // Validate display_name
    if (!display_name || display_name.trim().length < 3) {
      errors.push('Display name must be at least 3 characters');
    }

    // Validate bio
    if (!bio || bio.trim().length < 10) {
      errors.push('Bio must be at least 10 characters');
    }
    if (bio && bio.length > 500) {
      errors.push('Bio must be 500 characters or less');
    }

    // Validate specializations
    if (!specializations || !Array.isArray(specializations) || specializations.length === 0) {
      errors.push('At least one specialization is required');
    }

    // Validate languages
    if (!languages || !Array.isArray(languages) || languages.length === 0) {
      errors.push('At least one language is required');
    }

    // Validate years_of_experience
    if (years_of_experience === undefined || years_of_experience === null) {
      errors.push('Years of experience is required');
    } else if (!Number.isInteger(years_of_experience) || years_of_experience < 0 || years_of_experience > 50) {
      errors.push('Years of experience must be between 0 and 50');
    }

    // Validate SEBI number format (INH/INA/INM/INP + 9 digits)
    if (!sebi_number) {
      errors.push('SEBI registration number is required');
    } else if (!/^IN[AHMNP]\d{9}$/.test(sebi_number.toUpperCase())) {
      errors.push('Invalid SEBI number format. Expected: INA/INH/INM/INP followed by 9 digits');
    }

    // Validate at least one pricing tier exists
    if (!Array.isArray(pricing_tiers) || pricing_tiers.length === 0) {
      errors.push('At least one subscription tier is required');
    } else {
      // Validate each tier has at least one price
      pricing_tiers.forEach((tier, idx) => {
        if (!tier.weeklyPrice && !tier.monthlyPrice && !tier.yearlyPrice) {
          errors.push(`Tier "${tier.name || idx + 1}" must have at least one price (weekly, monthly, or yearly)`);
        }
      });
    }

    if (errors.length > 0) {
      throw new AppError(errors.join('. '), 400);
    }

    // ============================================
    // 1.5 VERIFY SEBI REGISTRATION (REAL-TIME)
    // ============================================
    console.log(`[Profile Setup] Verifying SEBI registration: ${sebi_number}`);

    try {
      const verificationResult = await sebiVerificationService.verifySEBIRegistration(sebi_number);

      if (!verificationResult.isValid) {
        console.error(`[Profile Setup] SEBI verification failed: ${verificationResult.reason}`);
        throw new AppError(
          `SEBI verification failed: ${verificationResult.reason}. Please ensure your SEBI registration number is correct and currently active.`,
          400
        );
      }

      console.log(`[Profile Setup] ✅ SEBI registration verified successfully: ${verificationResult.registrationType}`);
    } catch (sebiError) {
      // If it's already an AppError (from verification service), re-throw it
      if (sebiError instanceof AppError) {
        throw sebiError;
      }

      // For network/timeout errors, provide helpful message
      console.error('[Profile Setup] SEBI verification error:', sebiError.message);
      throw new AppError(
        'Unable to verify SEBI registration at this time. Please try again later or contact support.',
        503
      );
    }

    // Check if SEBI number already exists
    const sebiCheck = await client.query(
      `SELECT id, user_id FROM analyst_profiles WHERE sebi_number = $1 AND deleted_at IS NULL`,
      [sebi_number.toUpperCase()]
    );
    if (sebiCheck.rows.length > 0 && sebiCheck.rows[0].user_id !== userId) {
      throw new AppError('This SEBI number is already registered by another analyst', 409);
    }

    // ============================================
    // 2. CREATE OR UPDATE ANALYST PROFILE
    // ============================================
    let profile;
    const existingProfile = await AnalystProfile.findByUserId(userId);

    // Prepare verification documents array
    const verificationDocs = sebi_document_url ? [{
      type: 'sebi_certificate',
      url: sebi_document_url,
      uploaded_at: new Date().toISOString()
    }] : [];

    if (existingProfile) {
      // Update existing profile
      profile = await AnalystProfile.update(existingProfile.id, {
        display_name: display_name.trim(),
        bio: bio.trim(),
        specializations,
        languages,
        years_of_experience,
        sebi_number: sebi_number.toUpperCase(),
        allow_free_subscribers,
        photo_url: profile_photo_url || existingProfile.photo_url,
        verification_documents: JSON.stringify(verificationDocs)
      });
    } else {
      // Create new profile with generated invite link code
      const inviteLinkCode = Math.random().toString(36).substring(2, 12).toLowerCase();

      profile = await AnalystProfile.create({
        user_id: userId,
        display_name: display_name.trim(),
        bio: bio.trim(),
        specializations,
        languages,
        years_of_experience,
        sebi_number: sebi_number.toUpperCase(),
        allow_free_subscribers,
        photo_url: profile_photo_url,
        invite_link_code: inviteLinkCode,
        verification_documents: verificationDocs
      });
    }

    // ============================================
    // 3. CREATE SUBSCRIPTION TIERS (CUSTOM FROM FRONTEND)
    // ============================================
    const config = require('../config/env');
    const frontendUrl = config.frontend?.url || 'https://platform.com';

    // Delete existing tiers for this analyst (in case of re-setup)
    await client.query(
      `DELETE FROM subscription_tiers WHERE analyst_id = $1`,
      [userId]
    );

    // Always create FREE tier first
    await client.query(
      `INSERT INTO subscription_tiers (
        analyst_id,
        tier_name,
        tier_description,
        tier_order,
        price_monthly,
        currency,
        chat_access,
        is_active,
        is_free_tier
      ) VALUES ($1, $2, $3, $4, $5, $6, $7, $8, $9)`,
      [
        userId,
        'Free',
        'Access to free content and announcements',
        0,
        0, // Free = 0 price
        'INR',
        false, // No chat access for free tier
        allow_free_subscribers, // Only active if analyst allows free audience
        true // This is the free tier
      ]
    );

    let tierOrder = 1; // Start paid tiers from order 1

    // Create custom tiers from frontend
    for (const tier of pricing_tiers) {
      const tierName = tier.name || 'Subscription';
      const tierFeatures = Array.isArray(tier.features) ? tier.features.join(', ') : '';

      // Create weekly tier if price provided
      if (tier.weeklyPrice && tier.weeklyPrice > 0) {
        await client.query(
          `INSERT INTO subscription_tiers (
            analyst_id,
            tier_name,
            tier_description,
            tier_order,
            price_monthly,
            duration_months,
            currency,
            chat_access,
            is_active,
            is_free_tier
          ) VALUES ($1, $2, $3, $4, $5, $6, $7, $8, $9, $10)`,
          [
            userId,
            `${tierName} - Weekly`,
            tierFeatures || `${tierName} weekly subscription`,
            tierOrder++,
            Math.round(tier.weeklyPrice * 100), // Convert to paise
            0.25, // Weekly = ~0.25 months
            'INR',
            true, // Chat access for paid tiers
            true,
            false
          ]
        );
      }

      // Create monthly tier if price provided
      if (tier.monthlyPrice && tier.monthlyPrice > 0) {
        await client.query(
          `INSERT INTO subscription_tiers (
            analyst_id,
            tier_name,
            tier_description,
            tier_order,
            price_monthly,
            duration_months,
            currency,
            chat_access,
            is_active,
            is_free_tier
          ) VALUES ($1, $2, $3, $4, $5, $6, $7, $8, $9, $10)`,
          [
            userId,
            `${tierName} - Monthly`,
            tierFeatures || `${tierName} monthly subscription`,
            tierOrder++,
            Math.round(tier.monthlyPrice * 100), // Convert to paise
            1, // Monthly
            'INR',
            true, // Chat access for paid tiers
            true,
            false
          ]
        );
      }

      // Create yearly tier if price provided
      if (tier.yearlyPrice && tier.yearlyPrice > 0) {
        await client.query(
          `INSERT INTO subscription_tiers (
            analyst_id,
            tier_name,
            tier_description,
            tier_order,
            price_monthly,
            duration_months,
            currency,
            chat_access,
            is_active,
            is_free_tier
          ) VALUES ($1, $2, $3, $4, $5, $6, $7, $8, $9, $10)`,
          [
            userId,
            `${tierName} - Yearly`,
            tierFeatures || `${tierName} yearly subscription (best value)`,
            tierOrder++,
            Math.round(tier.yearlyPrice * 100), // Convert to paise
            12, // Yearly
            'INR',
            true, // Chat access for paid tiers
            true,
            false
          ]
        );
      }
    }

    // ============================================
    // 4. UPDATE USER TABLE - SET PROFILE_COMPLETED = TRUE
    // ============================================
    await client.query(
      `UPDATE users SET profile_completed = TRUE, updated_at = NOW() WHERE id = $1`,
      [userId]
    );

    // Commit transaction
    await client.query('COMMIT');

    // ============================================
    // 5. SEND EMAIL NOTIFICATION
    // ============================================
    try {
      const user = await User.findUserById(userId);
      if (user.email) {
        await sendProfileSetupCompleteEmail(user.email, profile.display_name);
      }
    } catch (emailError) {
      console.error('Failed to send setup complete email:', emailError.message);
      // Don't throw - email failure shouldn't block onboarding
    }

    // ============================================
    // 6. RETURN SUCCESS RESPONSE
    // ============================================
    const inviteLink = `${frontendUrl}/analyst/${profile.invite_link_code}`;

    res.status(200).json({
      success: true,
      message: 'Profile setup completed successfully. Your application is under review.',
      data: {
        profile: {
          id: profile.id,
          display_name: profile.display_name,
          bio: profile.bio,
          specializations: profile.specializations,
          years_of_experience: profile.years_of_experience,
          verification_status: profile.verification_status,
          invite_link: inviteLink,
          invite_link_code: profile.invite_link_code
        }
      }
    });

  } catch (error) {
    // Rollback transaction on error
    await client.query('ROLLBACK');
    throw error;
  } finally {
    // Release client back to pool
    client.release();
  }
});

/**
 * GET /api/analysts/profile/me
 * Get own analyst profile (private view with all details)
 *
 * @access Private (Analysts only)
 */
const getMyProfile = asyncHandler(async (req, res) => {
  const userId = req.user.id;

  const profile = await AnalystProfile.findByUserId(userId);

  if (!profile) {
    throw new AppError('Analyst profile not found', 404);
  }

  res.status(200).json({
    success: true,
    data: {
      profile: {
        id: profile.id,
        user_id: profile.user_id,
        display_name: profile.display_name,
        bio: profile.bio,
        photo_url: profile.photo_url,
        specializations: profile.specializations,
        languages: profile.languages,
        sebi_number: profile.sebi_number,
        ria_number: profile.ria_number,
        country: profile.country,
        verification_status: profile.verification_status,
        verification_documents: profile.verification_documents,
        verified_at: profile.verified_at,
        rejection_reason: profile.rejection_reason,
        avg_rating: parseFloat(profile.avg_rating),
        total_reviews: profile.total_reviews,
        total_subscribers: profile.total_subscribers,
        active_subscribers: profile.active_subscribers,
        total_posts: profile.total_posts,
        monthly_revenue: profile.monthly_revenue,
        commission_rate: parseFloat(profile.commission_rate),
        is_featured: profile.is_featured,
        created_at: profile.created_at,
        updated_at: profile.updated_at,
        last_post_at: profile.last_post_at
      }
    }
  });
});

/**
 * Helper: Send application received email
 */
const sendApplicationReceivedEmail = async (email, displayName) => {
  const content = `
    <h2>Application Received!</h2>
    <p>Hi ${displayName},</p>
    <div class="success-box">
      Your analyst verification application has been received successfully!
    </div>
    <p><strong>What happens next?</strong></p>
    <ol>
      <li>Upload your verification documents (SEBI certificate, PAN card, bank statement)</li>
      <li>Our team will review your application within 24-48 hours</li>
      <li>You'll receive an email notification once verification is complete</li>
    </ol>
    <p><strong>Required Documents:</strong></p>
    <ul>
      <li>SEBI/RIA Registration Certificate</li>
      <li>PAN Card</li>
      <li>Bank Statement (last 3 months)</li>
    </ul>
    <a href="${config.frontend.url}/analyst/documents" class="button">Upload Documents</a>
    <p>If you have any questions, feel free to contact our support team.</p>
  `;

  const html = getEmailTemplate('Application Received', content);

  return sendEmail({
    to: email,
    subject: 'Analyst Application Received - Next Steps',
    html: html
  });
};

/**
 * Helper: Send profile setup complete email
 */
const sendProfileSetupCompleteEmail = async (email, displayName) => {
  const content = `
    <h2>Profile Setup Complete!</h2>
    <p>Hi ${displayName},</p>
    <div class="success-box">
      Great job! You've completed your profile setup.
    </div>
    <p><strong>Next Steps:</strong></p>
    <ol>
      <li>Ensure all verification documents are uploaded</li>
      <li>Wait for admin approval (24-48 hours)</li>
      <li>Once approved, you can start posting trading calls</li>
    </ol>
    <p>We'll notify you as soon as your verification is complete!</p>
    <a href="${config.frontend.url}/analyst/dashboard" class="button">Go to Dashboard</a>
  `;

  const html = getEmailTemplate('Profile Setup Complete', content);

  return sendEmail({
    to: email,
    subject: 'Profile Setup Complete - Awaiting Verification',
    html: html
  });
};

module.exports = {
  applyForVerification,
  uploadDocument,
  getPublicProfile,
  updateProfile,
  uploadProfilePhoto,
  getDashboard,
  getDiscoveryList,
  completeProfileSetup,
  getMyProfile
};
