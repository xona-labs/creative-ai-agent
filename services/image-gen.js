/**
 * Image Generation Service — Standalone for Xona Agent
 * Supports Replicate models (nano-banana, seedream-4.5) + Grok Imagine
 */
const Replicate = require('replicate');
const { generateGrokImage } = require('./grok');
const uploadService = require('./upload');
const { v4: uuidv4 } = require('uuid');

const replicate = new Replicate({
  auth: process.env.REPLICATE_API_TOKEN
});

// Available models
const MODELS = {
  'nano-banana': {
    replicateId: 'google/nano-banana',
    description: 'Google Nano Banana — fast, creative AI image generation'
  },
  'seedream': {
    replicateId: 'bytedance/seedream-4.5',
    description: 'ByteDance Seedream 4.5 — high-quality photorealistic images'
  },
  'grok-imagine': {
    replicateId: null, // Uses Grok API directly
    description: 'xAI Grok Imagine — creative text-to-image generation'
  }
};

/**
 * Generate image using Replicate model
 */
async function generateWithReplicate(modelId, prompt, options = {}) {
  const { aspectRatio = '1:1', referenceImages = [] } = options;

  const input = { prompt, aspect_ratio: aspectRatio };

  // Add reference images if supported
  if (referenceImages.length > 0) {
    if (modelId === 'google/nano-banana') {
      input.image_input = referenceImages;
    }
  }

  console.log(`[ImageGen] Generating with ${modelId}...`);
  const output = await replicate.run(modelId, { input });

  // Extract URL from output
  let imageUrl = output;
  if (Array.isArray(output) && output.length > 0) {
    const first = output[0];
    if (typeof first === 'string') imageUrl = first;
    else if (first && typeof first.url === 'function') imageUrl = first.url().href;
    else if (first && first.href) imageUrl = first.href;
  } else if (typeof output === 'string') {
    imageUrl = output;
  } else if (output && typeof output.url === 'function') {
    imageUrl = output.url().href;
  } else if (output && output.href) {
    imageUrl = output.href;
  }

  return imageUrl;
}

/**
 * Generate image and upload to CDN
 * @param {string} prompt - Image prompt
 * @param {Object} options
 * @param {string} options.model - Model key: 'nano-banana', 'seedream', 'grok-imagine'
 * @param {string} options.aspectRatio - Aspect ratio
 * @param {string} options.referenceImage - Reference image URL (optional)
 * @returns {Promise<Object>} { image_url, model, prompt, metadata }
 */
async function generateImage(prompt, options = {}) {
  const {
    model = 'nano-banana',
    aspectRatio = '1:1',
    referenceImage = null
  } = options;

  if (!prompt || typeof prompt !== 'string' || prompt.trim().length === 0) {
    throw new Error('Prompt is required');
  }
  if (prompt.length > 5000) {
    throw new Error('Prompt must be 5000 characters or less');
  }

  const modelConfig = MODELS[model];
  if (!modelConfig) {
    throw new Error(`Unknown model: ${model}. Available: ${Object.keys(MODELS).join(', ')}`);
  }

  let rawImageUrl;

  if (model === 'grok-imagine') {
    // Use Grok API
    rawImageUrl = await generateGrokImage(prompt, referenceImage);
  } else {
    // Use Replicate
    rawImageUrl = await generateWithReplicate(
      modelConfig.replicateId,
      prompt,
      {
        aspectRatio,
        referenceImages: referenceImage ? [referenceImage] : []
      }
    );
  }

  if (!rawImageUrl) {
    throw new Error('Image generation completed but no URL was returned');
  }

  console.log('[ImageGen] Raw image URL:', typeof rawImageUrl === 'string' ? rawImageUrl.substring(0, 80) : rawImageUrl);

  // Download from provider and upload to our CDN
  const jobId = uuidv4();
  const uploadResult = await uploadService.downloadAndUploadImage(
    rawImageUrl,
    'generated',
    `${jobId}-${Date.now()}.jpg`
  );

  if (!uploadResult.success) {
    throw new Error('Failed to upload image to CDN: ' + uploadResult.message);
  }

  console.log('[ImageGen] Uploaded to CDN:', uploadResult.url);

  return {
    image_url: uploadResult.url,
    model,
    prompt,
    metadata: {
      model: modelConfig.replicateId || 'grok-2-image',
      aspectRatio,
      generatedAt: new Date().toISOString(),
      cdn_key: uploadResult.key
    }
  };
}

/**
 * Get available models
 */
function getModels() {
  return Object.entries(MODELS).map(([key, config]) => ({
    key,
    description: config.description,
    replicateId: config.replicateId
  }));
}

module.exports = {
  generateImage,
  getModels
};
