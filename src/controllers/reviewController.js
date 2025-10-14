/**
 * Review Controller
 *
 * Handles all review-related endpoints:
 * - Submit review (with 30+ day subscription eligibility check)
 * - Get analyst's reviews (with sorting and pagination)
 * - Edit own review
 * - Delete own review
 * - Vote review as helpful (toggle support)
 * - Analyst respond to review
 * - Get user's reviews
 * - Report review as spam/fake
 */

const Review = require('../models/Review');
const Subscription = require('../models/Subscription');
const { AppError, asyncHandler } = require('../middleware/errorHandler');
const emailService = require('../services/emailService');
const { formatDate } = require('../utils/helpers');

/**
 * Submit a review for an analyst
 * @route   POST /api/reviews/submit
 * @access  Private (Trader only, requires 30+ day subscription)
 */
const submitReview = asyncHandler(async (req, res) => {
  const { analystId, rating, reviewTitle, reviewText, isAnonymous } = req.body;
  const userId = req.user.id;

  // Validation
  if (!analystId) {
    throw new AppError('Analyst ID is required', 400);
  }

  if (!rating || rating < 1 || rating > 5) {
    throw new AppError('Rating must be between 1 and 5', 400);
  }

  if (reviewText && reviewText.length < 50) {
    throw new AppError('Review text must be at least 50 characters', 400);
  }

  if (reviewText && reviewText.length > 1000) {
    throw new AppError('Review text cannot exceed 1000 characters', 400);
  }

  // Check if user is trying to review themselves
  if (userId === analystId) {
    throw new AppError('You cannot review yourself', 400);
  }

  // Check if user already reviewed this analyst
  const existingReview = await Review.findByUserAndAnalyst(userId, analystId);
  if (existingReview) {
    throw new AppError(
      'You have already reviewed this analyst. Use the edit endpoint to update your review.',
      409
    );
  }

  // Check subscription eligibility (30+ days active subscription)
  const subscription = await Subscription.findActiveByUserAndAnalyst(userId, analystId);

  if (!subscription) {
    throw new AppError(
      'You must have an active subscription to review this analyst',
      403
    );
  }

  // Calculate subscription duration in days
  const subscriptionStartDate = new Date(subscription.start_date);
  const now = new Date();
  const durationMs = now - subscriptionStartDate;
  const durationDays = Math.floor(durationMs / (1000 * 60 * 60 * 24));

  if (durationDays < 30) {
    throw new AppError(
      `You must be subscribed for at least 30 days before leaving a review. Current duration: ${durationDays} days.`,
      403
    );
  }

  // Create review
  const review = await Review.createReview({
    userId,
    analystId,
    rating,
    reviewTitle: reviewTitle || null,
    reviewText: reviewText || null,
    isVerifiedSubscriber: true,
    subscriptionDurationDays: durationDays,
    isAnonymous: isAnonymous || false
  });

  // Update analyst's cached rating
  await Review.updateAnalystCachedRating(analystId);

  // Send email notification to analyst (async, non-blocking)
  const analystUser = await Subscription.findById(subscription.id);
  if (analystUser && analystUser.analyst_email) {
    emailService.sendNewReviewNotification(
      {
        email: analystUser.analyst_email,
        name: analystUser.analyst_name
      },
      {
        rating,
        reviewText: reviewText || 'No written review',
        reviewerName: isAnonymous ? 'Anonymous User' : req.user.name
      }
    ).catch(err => {
      console.error('Failed to send review notification email:', err.message);
    });
  }

  res.status(201).json({
    success: true,
    message: 'Review submitted successfully',
    data: {
      review: {
        id: review.id,
        rating: review.rating,
        reviewTitle: review.review_title,
        reviewText: review.review_text,
        isAnonymous: review.is_anonymous,
        createdAt: review.created_at
      }
    }
  });
});

/**
 * Get all reviews for an analyst
 * @route   GET /api/reviews/analyst/:analystId
 * @access  Public
 */
const getAnalystReviews = asyncHandler(async (req, res) => {
  const { analystId } = req.params;
  const {
    sortBy = 'helpfulness', // helpfulness, recent, highest, lowest
    limit = 20,
    offset = 0
  } = req.query;

  // Validate sort option
  const validSortOptions = ['helpfulness', 'recent', 'highest', 'lowest'];
  if (!validSortOptions.includes(sortBy)) {
    throw new AppError('Invalid sort option', 400);
  }

  // Get reviews with pagination
  const result = await Review.findByAnalystId(analystId, {
    sortBy,
    limit: parseInt(limit, 10),
    offset: parseInt(offset, 10),
    includeUnapproved: false
  });

  // Get rating statistics
  const ratingStats = await Review.getAnalystRatingStats(analystId);

  res.json({
    success: true,
    data: {
      reviews: result.reviews,
      ratingStats,
      pagination: result.pagination
    }
  });
});

/**
 * Get user's own reviews
 * @route   GET /api/reviews/my-reviews
 * @access  Private
 */
const getMyReviews = asyncHandler(async (req, res) => {
  const userId = req.user.id;

  const reviews = await Review.findByUserId(userId);

  res.json({
    success: true,
    data: {
      reviews,
      totalReviews: reviews.length
    }
  });
});

/**
 * Edit own review
 * @route   PUT /api/reviews/:id
 * @access  Private (Review owner only)
 */
const editReview = asyncHandler(async (req, res) => {
  const { id } = req.params;
  const { rating, reviewTitle, reviewText, isAnonymous } = req.body;
  const userId = req.user.id;

  // Validation
  if (rating && (rating < 1 || rating > 5)) {
    throw new AppError('Rating must be between 1 and 5', 400);
  }

  if (reviewText && reviewText.length < 50) {
    throw new AppError('Review text must be at least 50 characters', 400);
  }

  if (reviewText && reviewText.length > 1000) {
    throw new AppError('Review text cannot exceed 1000 characters', 400);
  }

  // Get review
  const review = await Review.findById(id);
  if (!review) {
    throw new AppError('Review not found', 404);
  }

  // Check ownership
  if (review.user_id !== userId) {
    throw new AppError('You can only edit your own reviews', 403);
  }

  // Build updates object
  const updates = {};
  if (rating !== undefined) updates.rating = rating;
  if (reviewTitle !== undefined) updates.review_title = reviewTitle;
  if (reviewText !== undefined) updates.review_text = reviewText;
  if (isAnonymous !== undefined) updates.is_anonymous = isAnonymous;

  // Update review
  const updatedReview = await Review.updateReview(id, updates);

  // Update analyst's cached rating if rating changed
  if (rating !== undefined) {
    await Review.updateAnalystCachedRating(review.analyst_id);
  }

  res.json({
    success: true,
    message: 'Review updated successfully',
    data: {
      review: updatedReview
    }
  });
});

/**
 * Delete own review
 * @route   DELETE /api/reviews/:id
 * @access  Private (Review owner only)
 */
const deleteReview = asyncHandler(async (req, res) => {
  const { id } = req.params;
  const userId = req.user.id;

  // Get review
  const review = await Review.findById(id);
  if (!review) {
    throw new AppError('Review not found', 404);
  }

  // Check ownership (allow admin to delete as well)
  if (review.user_id !== userId && req.user.role !== 'admin') {
    throw new AppError('You can only delete your own reviews', 403);
  }

  // Soft delete review
  await Review.deleteReview(id);

  // Update analyst's cached rating
  await Review.updateAnalystCachedRating(review.analyst_id);

  res.json({
    success: true,
    message: 'Review deleted successfully'
  });
});

/**
 * Vote review as helpful (toggle on/off)
 * @route   POST /api/reviews/:id/helpful
 * @access  Private
 */
const voteHelpful = asyncHandler(async (req, res) => {
  const { id } = req.params;
  const { vote } = req.body; // vote: true = add vote, false = remove vote
  const userId = req.user.id;

  // Get review
  const review = await Review.findById(id);
  if (!review) {
    throw new AppError('Review not found', 404);
  }

  // Cannot vote on own review
  if (review.user_id === userId) {
    throw new AppError('You cannot vote on your own review', 400);
  }

  // Check if user already voted (in real app, use separate helpful_votes table)
  // For MVP, we'll use a simple toggle based on the vote parameter

  let updatedReview;
  if (vote === true) {
    // Add vote
    updatedReview = await Review.incrementHelpfulness(id);
  } else if (vote === false) {
    // Remove vote
    updatedReview = await Review.decrementHelpfulness(id);
  } else {
    throw new AppError('Vote parameter must be true or false', 400);
  }

  res.json({
    success: true,
    message: vote ? 'Review marked as helpful' : 'Helpful vote removed',
    data: {
      helpfulVotes: updatedReview.helpfulness_upvotes
    }
  });
});

/**
 * Analyst responds to a review
 * @route   POST /api/reviews/:id/respond
 * @access  Private (Analyst only)
 */
const respondToReview = asyncHandler(async (req, res) => {
  const { id } = req.params;
  const { response } = req.body;
  const userId = req.user.id;

  // Validation
  if (!response || response.trim().length === 0) {
    throw new AppError('Response text is required', 400);
  }

  if (response.length > 500) {
    throw new AppError('Response cannot exceed 500 characters', 400);
  }

  // Get review
  const review = await Review.findById(id);
  if (!review) {
    throw new AppError('Review not found', 404);
  }

  // Check if user is the analyst being reviewed
  if (review.analyst_id !== userId) {
    throw new AppError('You can only respond to reviews of your own profile', 403);
  }

  // Check if user has analyst role
  if (req.user.role !== 'analyst') {
    throw new AppError('Only analysts can respond to reviews', 403);
  }

  // Add analyst response
  const updatedReview = await Review.addAnalystResponse(id, response.trim());

  // Send email notification to reviewer (async, non-blocking)
  if (review.reviewer_name && !review.is_anonymous) {
    // Get reviewer's email from subscription
    const subscription = await Subscription.findActiveByUserAndAnalyst(
      review.user_id,
      userId
    );

    if (subscription) {
      emailService.sendAnalystResponseNotification(
        {
          email: subscription.user_email,
          name: review.reviewer_name
        },
        {
          analystName: req.user.name || 'The analyst',
          response: response.trim(),
          reviewText: review.review_text || 'Your review'
        }
      ).catch(err => {
        console.error('Failed to send analyst response email:', err.message);
      });
    }
  }

  res.json({
    success: true,
    message: 'Response added successfully',
    data: {
      response: updatedReview.analyst_response,
      respondedAt: updatedReview.analyst_response_at
    }
  });
});

/**
 * Edit analyst response
 * @route   PUT /api/reviews/:id/respond
 * @access  Private (Analyst only)
 */
const editResponse = asyncHandler(async (req, res) => {
  const { id } = req.params;
  const { response } = req.body;
  const userId = req.user.id;

  // Validation
  if (!response || response.trim().length === 0) {
    throw new AppError('Response text is required', 400);
  }

  if (response.length > 500) {
    throw new AppError('Response cannot exceed 500 characters', 400);
  }

  // Get review
  const review = await Review.findById(id);
  if (!review) {
    throw new AppError('Review not found', 404);
  }

  // Check ownership
  if (review.analyst_id !== userId) {
    throw new AppError('You can only edit your own responses', 403);
  }

  // Check if response exists
  if (!review.analyst_response) {
    throw new AppError('No response found to edit', 404);
  }

  // Update response
  const updatedReview = await Review.addAnalystResponse(id, response.trim());

  res.json({
    success: true,
    message: 'Response updated successfully',
    data: {
      response: updatedReview.analyst_response,
      respondedAt: updatedReview.analyst_response_at
    }
  });
});

/**
 * Delete analyst response
 * @route   DELETE /api/reviews/:id/respond
 * @access  Private (Analyst only)
 */
const deleteResponse = asyncHandler(async (req, res) => {
  const { id } = req.params;
  const userId = req.user.id;

  // Get review
  const review = await Review.findById(id);
  if (!review) {
    throw new AppError('Review not found', 404);
  }

  // Check ownership
  if (review.analyst_id !== userId) {
    throw new AppError('You can only delete your own responses', 403);
  }

  // Check if response exists
  if (!review.analyst_response) {
    throw new AppError('No response found to delete', 404);
  }

  // Delete response
  await Review.deleteAnalystResponse(id);

  res.json({
    success: true,
    message: 'Response deleted successfully'
  });
});

/**
 * Report review as spam/fake/abusive
 * @route   POST /api/reviews/:id/report
 * @access  Private
 */
const reportReview = asyncHandler(async (req, res) => {
  const { id } = req.params;
  const { reason } = req.body;

  // Validation
  const validReasons = ['spam', 'fake', 'abusive', 'inappropriate'];
  if (!reason || !validReasons.includes(reason)) {
    throw new AppError(
      `Invalid report reason. Must be one of: ${validReasons.join(', ')}`,
      400
    );
  }

  // Get review
  const review = await Review.findById(id);
  if (!review) {
    throw new AppError('Review not found', 404);
  }

  // Flag review for moderation
  await Review.flagReview(id, reason);

  res.json({
    success: true,
    message: 'Review reported successfully. Our team will review it shortly.'
  });
});

/**
 * Get flagged reviews (Admin only)
 * @route   GET /api/reviews/moderation/flagged
 * @access  Private (Admin only)
 */
const getFlaggedReviews = asyncHandler(async (req, res) => {
  if (req.user.role !== 'admin') {
    throw new AppError('Access denied. Admin only.', 403);
  }

  const flaggedReviews = await Review.getFlaggedReviews();

  res.json({
    success: true,
    data: {
      reviews: flaggedReviews,
      totalFlagged: flaggedReviews.length
    }
  });
});

/**
 * Moderate review (approve or reject) - Admin only
 * @route   POST /api/reviews/:id/moderate
 * @access  Private (Admin only)
 */
const moderateReview = asyncHandler(async (req, res) => {
  const { id } = req.params;
  const { action } = req.body; // action: 'approve' or 'reject'

  if (req.user.role !== 'admin') {
    throw new AppError('Access denied. Admin only.', 403);
  }

  if (!action || !['approve', 'reject'].includes(action)) {
    throw new AppError('Invalid action. Must be "approve" or "reject"', 400);
  }

  const approve = action === 'approve';

  // Moderate review
  const review = await Review.moderateReview(id, req.user.id, approve);

  // If rejected, notify reviewer
  if (!approve) {
    // Send email notification (async)
    // Note: Email implementation depends on having reviewer's email in review object
  }

  res.json({
    success: true,
    message: `Review ${action}d successfully`,
    data: {
      review
    }
  });
});

module.exports = {
  submitReview,
  getAnalystReviews,
  getMyReviews,
  editReview,
  deleteReview,
  voteHelpful,
  respondToReview,
  editResponse,
  deleteResponse,
  reportReview,
  getFlaggedReviews,
  moderateReview
};
