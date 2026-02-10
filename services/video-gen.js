/**
 * Video Generation Service — Standalone for Xona Agent
 * Uses Grok Video API for 10-second AI video generation
 */
const { generateGrokVideo } = require('./grok');
const uploadService = require('./upload');
const { v4: uuidv4 } = require('uuid');

/**
 * Generate video and upload to CDN
 * @param {string} prompt - Video prompt
 * @param {Object} options
 * @param {string} options.aspectRatio - Aspect ratio
 * @param {string} options.imageUrl - Input image for image-to-video (optional)
 * @returns {Promise<Object>} { video_url, duration, model, prompt, metadata }
 */
async function generateVideo(prompt, options = {}) {
  const { aspectRatio, imageUrl } = options;

  if (!prompt || typeof prompt !== 'string' || prompt.trim().length === 0) {
    throw new Error('Prompt is required');
  }
  if (prompt.length > 5000) {
    throw new Error('Prompt must be 5000 characters or less');
  }

  // Validate image URL if provided
  let validImage = null;
  if (imageUrl && typeof imageUrl === 'string') {
    if (imageUrl.startsWith('http://') || imageUrl.startsWith('https://')) {
      validImage = imageUrl;
    }
  }

  console.log('[VideoGen] Generating video...');
  console.log('[VideoGen] Prompt:', prompt.substring(0, 100));
  console.log('[VideoGen] Has input image:', !!validImage);

  // Generate video via Grok
  const rawVideoUrl = await generateGrokVideo(prompt, {
    duration: 10,
    aspectRatio,
    imageUrl: validImage
  });

  if (!rawVideoUrl) {
    throw new Error('Video generation completed but no URL was returned');
  }

  console.log('[VideoGen] Raw video URL received');

  // Download and upload to CDN
  const jobId = uuidv4();
  const uploadResult = await uploadService.downloadAndUploadVideo(
    rawVideoUrl,
    'generated',
    `grok-video-${jobId}-${Date.now()}.mp4`
  );

  if (!uploadResult.success) {
    throw new Error('Failed to upload video to CDN: ' + uploadResult.message);
  }

  console.log('[VideoGen] Uploaded to CDN:', uploadResult.url);

  return {
    video_url: uploadResult.url,
    duration: 10,
    model: 'grok-imagine-video',
    prompt,
    metadata: {
      aspect_ratio: aspectRatio || 'default',
      image_url: validImage || undefined,
      generatedAt: new Date().toISOString(),
      cdn_key: uploadResult.key
    }
  };
}

module.exports = {
  generateVideo
};
