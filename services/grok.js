/**
 * Grok (xAI) API Service — Standalone for Xona Agent
 * Handles communication with xAI's Grok API for agent capabilities
 */
const axios = require('axios');

const DEFAULT_MODEL = 'grok-4-1-fast-non-reasoning';
const XAI_API_BASE = 'https://api.x.ai/v1';

function getApiKey() {
  if (!process.env.XAI_API_KEY) {
    throw new Error('XAI_API_KEY is not set.');
  }
  return process.env.XAI_API_KEY;
}

/**
 * Make a non-streaming Grok API call (responses endpoint)
 */
async function callGrokApi({
  message,
  conversationHistory = [],
  tools = [],
  systemInstruction,
  model = DEFAULT_MODEL
}) {
  const apiKey = getApiKey();

  const input = [];

  if (systemInstruction) {
    input.push({ role: 'system', content: systemInstruction });
  }

  for (const entry of conversationHistory) {
    input.push({
      role: entry.role === 'assistant' ? 'assistant' : 'user',
      content: entry.content
    });
  }

  input.push({ role: 'user', content: message });

  const requestBody = {
    model,
    input,
    tools: tools.length > 0 ? tools : undefined
  };

  console.log('[Grok] Request with model:', model, '| tools:', tools.length);

  const response = await axios.post(
    `${XAI_API_BASE}/responses`,
    requestBody,
    {
      headers: {
        'Content-Type': 'application/json',
        'Authorization': `Bearer ${apiKey}`
      },
      timeout: 120000
    }
  );

  return response.data;
}

/**
 * Grok Chat Completions (for vision / image analysis)
 */
async function callGrokChat({ messages, model = 'grok-4-1-fast-reasoning' }) {
  const apiKey = getApiKey();

  const response = await axios.post(
    `${XAI_API_BASE}/chat/completions`,
    { model, messages },
    {
      headers: {
        'Content-Type': 'application/json',
        'Authorization': `Bearer ${apiKey}`
      },
      timeout: 60000
    }
  );

  return response.data;
}

/**
 * Generate image via Grok Imagine
 */
async function generateGrokImage(prompt, referenceImageUrl = null) {
  const apiKey = getApiKey();
  const model = 'grok-2-image';

  let endpoint, requestBody;

  if (referenceImageUrl) {
    endpoint = `${XAI_API_BASE}/images/edits`;
    requestBody = {
      model,
      prompt: prompt.trim(),
      image: referenceImageUrl
    };
  } else {
    endpoint = `${XAI_API_BASE}/images/generations`;
    requestBody = {
      model,
      prompt: prompt.trim()
    };
  }

  console.log('[Grok Image] Generating...', referenceImageUrl ? '(with ref)' : '(text-to-image)');

  const response = await axios.post(endpoint, requestBody, {
    headers: {
      'Content-Type': 'application/json',
      'Authorization': `Bearer ${apiKey}`
    },
    timeout: 120000
  });

  // Extract URL from response
  let imageUrl = null;
  if (response.data?.data && Array.isArray(response.data.data) && response.data.data.length > 0) {
    imageUrl = response.data.data[0].url || response.data.data[0].b64_json;
  } else if (response.data?.url) {
    imageUrl = response.data.url;
  }

  if (!imageUrl) {
    throw new Error('No image URL returned from Grok API');
  }

  return imageUrl;
}

/**
 * Generate video via Grok Video (polling-based)
 */
async function generateGrokVideo(prompt, options = {}) {
  const apiKey = getApiKey();
  const model = 'grok-imagine-video';
  const { duration = 10, aspectRatio, imageUrl } = options;

  const requestBody = { prompt: prompt.trim(), model, duration };
  if (aspectRatio) requestBody.aspect_ratio = aspectRatio;
  if (imageUrl) requestBody.image = imageUrl;

  console.log('[Grok Video] Creating generation request...');

  const createResponse = await axios.post(
    `${XAI_API_BASE}/videos/generations`,
    requestBody,
    {
      headers: {
        'Content-Type': 'application/json',
        'Authorization': `Bearer ${apiKey}`
      },
      timeout: 30000
    }
  );

  if (!createResponse.data?.request_id) {
    throw new Error('Video generation failed: no request_id');
  }

  const requestId = createResponse.data.request_id;
  console.log('[Grok Video] request_id:', requestId, '| Polling...');

  // Poll for completion (max 5 minutes)
  const maxAttempts = 300;
  for (let attempt = 1; attempt <= maxAttempts; attempt++) {
    await new Promise(resolve => setTimeout(resolve, 1000));

    try {
      const statusResponse = await axios.get(
        `${XAI_API_BASE}/videos/${requestId}`,
        {
          headers: {
            'Content-Type': 'application/json',
            'Authorization': `Bearer ${apiKey}`
          },
          timeout: 15000
        }
      );

      if (statusResponse.data?.video?.url) {
        console.log('[Grok Video] Generation complete!');
        return statusResponse.data.video.url;
      }

      if (attempt % 10 === 0) {
        console.log(`[Grok Video] Still processing... (attempt ${attempt}/${maxAttempts})`);
      }
    } catch (pollError) {
      if (pollError.response?.status === 404) continue;
      // Other errors — log but continue
      if (attempt % 30 === 0) {
        console.warn('[Grok Video] Polling error:', pollError.message);
      }
    }
  }

  throw new Error('Video generation timed out');
}

/**
 * Build system instruction for Solana trending agent
 */
function buildTrendingSystemInstruction() {
  return `You are a trending analysis agent specialized in Solana ecosystem trends.

Your role is to:
1. Search for trending Solana-related topics, tokens, and launches on X (Twitter) using x_search tool
2. Filter out noise and focus on high-signal posts with meaningful engagement
3. Extract and structure information from search results
4. Return structured data with required fields

Focus specifically on:
- Solana ecosystem projects, tokens, and developments
- SOL-related news, updates, and community discussions
- Trending Solana DeFi protocols, NFTs, gaming projects, and memecoins
- Upcoming launches on Solana blockchain

For each item, provide:
- x_profile: The X profile URL or username
- x_username: The @username
- tweet_content: The tweet text content
- creation_date: The date when the post was created
- post_url: The URL to the specific X post

Be concise, filter for quality posts, and focus on the most relevant Solana trending information.`;
}

/**
 * Extract text content from Grok response
 */
function extractTextFromResponse(response) {
  if (!response) return null;

  if (response.output && Array.isArray(response.output)) {
    for (const item of response.output) {
      if (item.type === 'message' && item.content && Array.isArray(item.content)) {
        for (const contentItem of item.content) {
          if (contentItem.type === 'output_text' && contentItem.text) {
            return contentItem.text.trim();
          }
        }
      }
    }
  }

  if (response.content) {
    return typeof response.content === 'string' ? response.content : JSON.stringify(response.content);
  }
  if (response.text) return response.text;

  return null;
}

/**
 * Parse JSON from Grok response output
 */
function parseJsonFromResponse(response) {
  const text = extractTextFromResponse(response);
  if (!text) return null;

  try {
    return JSON.parse(text);
  } catch {
    // Try to find JSON in text
    const jsonMatch = text.match(/(\[[\s\S]*\]|\{[\s\S]*\})/);
    if (jsonMatch) {
      try {
        return JSON.parse(jsonMatch[1]);
      } catch {
        return null;
      }
    }
  }

  return null;
}

module.exports = {
  callGrokApi,
  callGrokChat,
  generateGrokImage,
  generateGrokVideo,
  buildTrendingSystemInstruction,
  extractTextFromResponse,
  parseJsonFromResponse
};
