/**
 * Invite Controller
 *
 * Handles all invite link related operations
 * Endpoints for generating, tracking, and analyzing invite links
 *
 * SECURITY:
 * - Only analysts can create/update/delete their own invite links
 * - Public endpoints for tracking clicks and getting invite details
 * - Rate limiting on click tracking to prevent abuse
 */

const InviteLink = require('../models/InviteLink');
const DiscountCode = require('../models/DiscountCode');
const { AppError } = require('../middleware/errorHandler');

/**
 * Generate new invite link
 * POST /api/invites/generate
 *
 * @access Private (Analyst only)
 */
const generateInviteLink = async (req, res, next) => {
  try {
    const analystId = req.user.id;
    const {
      invite_code,
      link_name,
      link_description,
      discount_code_id,
      expires_at,
      max_uses,
      utm_source,
      utm_medium,
      utm_campaign
    } = req.body;

    // Verify user is an analyst
    if (req.user.role !== 'analyst') {
      throw new AppError('Only analysts can generate invite links', 403);
    }

    // If discount_code_id provided, verify it belongs to this analyst
    if (discount_code_id) {
      const discountCode = await DiscountCode.findById(discount_code_id);
      if (!discountCode) {
        throw new AppError('Discount code not found', 404);
      }
      if (discountCode.analyst_id !== analystId) {
        throw new AppError('You can only use your own discount codes', 403);
      }
    }

    // Validate expiry date (must be in future)
    if (expires_at) {
      const expiryDate = new Date(expires_at);
      if (expiryDate <= new Date()) {
        throw new AppError('Expiry date must be in the future', 400);
      }
    }

    // Create invite link
    const inviteLink = await InviteLink.create({
      analystId,
      inviteCode: invite_code,
      linkName: link_name,
      linkDescription: link_description,
      discountCodeId: discount_code_id,
      expiresAt: expires_at,
      maxUses: max_uses,
      utmSource: utm_source,
      utmMedium: utm_medium,
      utmCampaign: utm_campaign
    });

    // Generate full URL
    const baseUrl = process.env.FRONTEND_URL || 'https://platform.com';
    const fullUrl = `${baseUrl}/signup?invite=${inviteLink.invite_code}`;

    res.status(201).json({
      success: true,
      message: 'Invite link generated successfully',
      data: {
        inviteLink,
        fullUrl
      }
    });
  } catch (error) {
    next(error);
  }
};

/**
 * Get invite link details (public)
 * GET /api/invites/:code
 *
 * @access Public
 */
const getInviteDetails = async (req, res, next) => {
  try {
    const { code } = req.params;

    // Validate invite link
    const validation = await InviteLink.validateInviteLink(code);

    if (!validation.isValid) {
      return res.status(400).json({
        success: false,
        message: validation.reason,
        data: {
          isValid: false,
          reason: validation.reason
        }
      });
    }

    const inviteLink = validation.inviteLink;

    // Return invite details (without sensitive analytics data)
    res.status(200).json({
      success: true,
      message: 'Invite link is valid',
      data: {
        isValid: true,
        invite_code: inviteLink.invite_code,
        analyst_name: inviteLink.analyst_name,
        analyst_photo: inviteLink.analyst_photo,
        sebi_registration_number: inviteLink.sebi_registration_number,
        discount_code: inviteLink.discount_code,
        discount_type: inviteLink.discount_type,
        discount_value: inviteLink.discount_value,
        expires_at: inviteLink.expires_at,
        link_name: inviteLink.link_name
      }
    });
  } catch (error) {
    next(error);
  }
};

/**
 * Track click on invite link
 * POST /api/invites/:code/track-click
 *
 * @access Public (with rate limiting)
 */
const trackClick = async (req, res, next) => {
  try {
    const { code } = req.params;
    const { fingerprint } = req.body; // Browser fingerprint for unique visitor tracking

    // Find invite link
    const inviteLink = await InviteLink.findByCode(code);

    if (!inviteLink) {
      throw new AppError('Invite link not found', 404);
    }

    // Check if invite link is active
    if (!inviteLink.is_active) {
      throw new AppError('This invite link has been deactivated', 400);
    }

    // Determine if this is a unique visitor
    // In production, you'd use a more sophisticated method (Redis, session storage, etc.)
    // For now, we'll just check if fingerprint is provided
    const isUniqueVisitor = fingerprint ? true : false;

    // Track click
    const updatedLink = await InviteLink.trackClick(code, isUniqueVisitor);

    res.status(200).json({
      success: true,
      message: 'Click tracked successfully',
      data: {
        invite_code: updatedLink.invite_code,
        total_clicks: updatedLink.total_clicks
      }
    });
  } catch (error) {
    next(error);
  }
};

/**
 * Get analyst's invite links
 * GET /api/invites/my-links
 *
 * @access Private (Analyst only)
 */
const getMyInviteLinks = async (req, res, next) => {
  try {
    const analystId = req.user.id;
    const { page = 1, limit = 20, active_only = 'false' } = req.query;

    // Verify user is an analyst
    if (req.user.role !== 'analyst') {
      throw new AppError('Only analysts can view invite links', 403);
    }

    const result = await InviteLink.findByAnalystId(analystId, {
      page: parseInt(page),
      limit: parseInt(limit),
      activeOnly: active_only === 'true'
    });

    // Add full URLs to each invite link
    const baseUrl = process.env.FRONTEND_URL || 'https://platform.com';
    const inviteLinksWithUrls = result.inviteLinks.map(link => ({
      ...link,
      fullUrl: `${baseUrl}/signup?invite=${link.invite_code}`
    }));

    res.status(200).json({
      success: true,
      message: 'Invite links fetched successfully',
      data: {
        inviteLinks: inviteLinksWithUrls,
        pagination: {
          total: result.total,
          page: result.page,
          limit: result.limit,
          totalPages: result.totalPages
        }
      }
    });
  } catch (error) {
    next(error);
  }
};

/**
 * Get invite link analytics
 * GET /api/invites/:id/analytics
 *
 * @access Private (Analyst only, own links)
 */
const getInviteAnalytics = async (req, res, next) => {
  try {
    const analystId = req.user.id;
    const { id } = req.params;

    // Verify user is an analyst
    if (req.user.role !== 'analyst') {
      throw new AppError('Only analysts can view invite link analytics', 403);
    }

    // Get analytics
    const analytics = await InviteLink.getAnalytics(id, analystId);

    res.status(200).json({
      success: true,
      message: 'Invite link analytics fetched successfully',
      data: analytics
    });
  } catch (error) {
    next(error);
  }
};

/**
 * Update invite link
 * PUT /api/invites/:id
 *
 * @access Private (Analyst only, own links)
 */
const updateInviteLink = async (req, res, next) => {
  try {
    const analystId = req.user.id;
    const { id } = req.params;
    const {
      link_name,
      link_description,
      is_active,
      expires_at,
      max_uses,
      utm_source,
      utm_medium,
      utm_campaign
    } = req.body;

    // Verify user is an analyst
    if (req.user.role !== 'analyst') {
      throw new AppError('Only analysts can update invite links', 403);
    }

    // Validate expiry date if provided
    if (expires_at && new Date(expires_at) <= new Date()) {
      throw new AppError('Expiry date must be in the future', 400);
    }

    // Update invite link
    const updatedLink = await InviteLink.update(id, analystId, {
      link_name,
      link_description,
      is_active,
      expires_at,
      max_uses,
      utm_source,
      utm_medium,
      utm_campaign
    });

    res.status(200).json({
      success: true,
      message: 'Invite link updated successfully',
      data: updatedLink
    });
  } catch (error) {
    next(error);
  }
};

/**
 * Delete invite link
 * DELETE /api/invites/:id
 *
 * @access Private (Analyst only, own links)
 */
const deleteInviteLink = async (req, res, next) => {
  try {
    const analystId = req.user.id;
    const { id } = req.params;

    // Verify user is an analyst
    if (req.user.role !== 'analyst') {
      throw new AppError('Only analysts can delete invite links', 403);
    }

    // Soft delete invite link
    await InviteLink.softDelete(id, analystId);

    res.status(200).json({
      success: true,
      message: 'Invite link deleted successfully'
    });
  } catch (error) {
    next(error);
  }
};

/**
 * Get invite link summary/overview
 * GET /api/invites/summary
 *
 * @access Private (Analyst only)
 */
const getInviteSummary = async (req, res, next) => {
  try {
    const analystId = req.user.id;

    // Verify user is an analyst
    if (req.user.role !== 'analyst') {
      throw new AppError('Only analysts can view invite link summary', 403);
    }

    // Get summary statistics
    const summary = await InviteLink.getSummary(analystId);

    // Get top performing links
    const topLinks = await InviteLink.getTopPerforming(analystId, 5);

    res.status(200).json({
      success: true,
      message: 'Invite link summary fetched successfully',
      data: {
        summary,
        topPerforming: topLinks
      }
    });
  } catch (error) {
    next(error);
  }
};

/**
 * Create discount code
 * POST /api/invites/discount-codes
 *
 * @access Private (Analyst only)
 */
const createDiscountCode = async (req, res, next) => {
  try {
    const analystId = req.user.id;
    const {
      code,
      code_name,
      code_description,
      discount_type,
      discount_value,
      max_discount_amount,
      applicable_tiers,
      billing_cycle_restriction,
      first_time_only,
      usage_limit,
      per_user_limit,
      valid_from,
      valid_until
    } = req.body;

    // Verify user is an analyst
    if (req.user.role !== 'analyst') {
      throw new AppError('Only analysts can create discount codes', 403);
    }

    // Create discount code
    const discountCode = await DiscountCode.create({
      analystId,
      code,
      codeName: code_name,
      codeDescription: code_description,
      discountType: discount_type,
      discountValue: discount_value,
      maxDiscountAmount: max_discount_amount,
      applicableTiers: applicable_tiers,
      billingCycleRestriction: billing_cycle_restriction,
      firstTimeOnly: first_time_only,
      usageLimit: usage_limit,
      perUserLimit: per_user_limit,
      validFrom: valid_from,
      validUntil: valid_until
    });

    res.status(201).json({
      success: true,
      message: 'Discount code created successfully',
      data: discountCode
    });
  } catch (error) {
    next(error);
  }
};

/**
 * Get analyst's discount codes
 * GET /api/invites/discount-codes
 *
 * @access Private (Analyst only)
 */
const getMyDiscountCodes = async (req, res, next) => {
  try {
    const analystId = req.user.id;
    const { page = 1, limit = 20, active_only = 'false' } = req.query;

    // Verify user is an analyst
    if (req.user.role !== 'analyst') {
      throw new AppError('Only analysts can view discount codes', 403);
    }

    const result = await DiscountCode.findByAnalystId(analystId, {
      page: parseInt(page),
      limit: parseInt(limit),
      activeOnly: active_only === 'true'
    });

    res.status(200).json({
      success: true,
      message: 'Discount codes fetched successfully',
      data: {
        discountCodes: result.discountCodes,
        pagination: {
          total: result.total,
          page: result.page,
          limit: result.limit,
          totalPages: result.totalPages
        }
      }
    });
  } catch (error) {
    next(error);
  }
};

/**
 * Validate discount code (public)
 * POST /api/invites/discount-codes/validate
 *
 * @access Public
 */
const validateDiscountCodePublic = async (req, res, next) => {
  try {
    const { code, tier_id, billing_cycle } = req.body;
    const userId = req.user ? req.user.id : null;

    if (!code || !tier_id || !billing_cycle) {
      throw new AppError('Code, tier_id, and billing_cycle are required', 400);
    }

    if (!userId) {
      throw new AppError('User must be authenticated to validate discount code', 401);
    }

    // Validate discount code
    const validation = await DiscountCode.validateDiscountCode(
      code,
      userId,
      tier_id,
      billing_cycle
    );

    res.status(200).json({
      success: true,
      message: validation.reason,
      data: {
        isValid: validation.isValid,
        reason: validation.reason,
        discountCode: validation.isValid ? {
          code: validation.discountCode.code,
          discount_type: validation.discountCode.discount_type,
          discount_value: validation.discountCode.discount_value,
          max_discount_amount: validation.discountCode.max_discount_amount
        } : null
      }
    });
  } catch (error) {
    next(error);
  }
};

/**
 * Get discount code usage statistics
 * GET /api/invites/discount-codes/:id/stats
 *
 * @access Private (Analyst only, own codes)
 */
const getDiscountCodeStats = async (req, res, next) => {
  try {
    const analystId = req.user.id;
    const { id } = req.params;

    // Verify user is an analyst
    if (req.user.role !== 'analyst') {
      throw new AppError('Only analysts can view discount code statistics', 403);
    }

    // Get usage statistics
    const stats = await DiscountCode.getUsageStats(id, analystId);

    res.status(200).json({
      success: true,
      message: 'Discount code statistics fetched successfully',
      data: stats
    });
  } catch (error) {
    next(error);
  }
};

/**
 * Update discount code
 * PUT /api/invites/discount-codes/:id
 *
 * @access Private (Analyst only, own codes)
 */
const updateDiscountCode = async (req, res, next) => {
  try {
    const analystId = req.user.id;
    const { id } = req.params;
    const {
      code_name,
      code_description,
      is_active,
      usage_limit,
      valid_from,
      valid_until
    } = req.body;

    // Verify user is an analyst
    if (req.user.role !== 'analyst') {
      throw new AppError('Only analysts can update discount codes', 403);
    }

    // Update discount code
    const updatedCode = await DiscountCode.update(id, analystId, {
      code_name,
      code_description,
      is_active,
      usage_limit,
      valid_from,
      valid_until
    });

    res.status(200).json({
      success: true,
      message: 'Discount code updated successfully',
      data: updatedCode
    });
  } catch (error) {
    next(error);
  }
};

/**
 * Delete discount code
 * DELETE /api/invites/discount-codes/:id
 *
 * @access Private (Analyst only, own codes)
 */
const deleteDiscountCode = async (req, res, next) => {
  try {
    const analystId = req.user.id;
    const { id } = req.params;

    // Verify user is an analyst
    if (req.user.role !== 'analyst') {
      throw new AppError('Only analysts can delete discount codes', 403);
    }

    // Soft delete discount code
    await DiscountCode.softDelete(id, analystId);

    res.status(200).json({
      success: true,
      message: 'Discount code deleted successfully'
    });
  } catch (error) {
    next(error);
  }
};

module.exports = {
  generateInviteLink,
  getInviteDetails,
  trackClick,
  getMyInviteLinks,
  getInviteAnalytics,
  updateInviteLink,
  deleteInviteLink,
  getInviteSummary,
  createDiscountCode,
  getMyDiscountCodes,
  validateDiscountCodePublic,
  getDiscountCodeStats,
  updateDiscountCode,
  deleteDiscountCode
};
