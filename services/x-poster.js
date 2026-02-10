/**
 * X (Twitter) Poster Service — Standalone for Xona Agent
 * Posts tweets using OAuth 1.0a app-level credentials
 */
const { TwitterApi } = require('twitter-api-v2');
const axios = require('axios');

/**
 * Get X API client using app-level OAuth 1.0a credentials
 */
function getClient() {
  const appKey = process.env.X_API_KEY;
  const appSecret = process.env.X_API_SECRET;
  const accessToken = process.env.X_ACCESS_TOKEN;
  const accessSecret = process.env.X_ACCESS_SECRET;

  if (!appKey || !appSecret || !accessToken || !accessSecret) {
    throw new Error('X API credentials not configured. Set X_API_KEY, X_API_SECRET, X_ACCESS_TOKEN, X_ACCESS_SECRET.');
  }

  return new TwitterApi({
    appKey,
    appSecret,
    accessToken,
    accessSecret
  });
}

/**
 * Download image from URL and return as buffer
 */
async function downloadImage(imageUrl) {
  const response = await axios.get(imageUrl, {
    responseType: 'arraybuffer',
    timeout: 30000
  });
  return Buffer.from(response.data);
}

/**
 * Determine media type from URL
 */
function getMediaType(url) {
  if (url.includes('.png')) return 'image/png';
  if (url.includes('.webp')) return 'image/webp';
  if (url.includes('.gif')) return 'image/gif';
  return 'image/jpeg';
}

/**
 * Post a tweet with optional image
 * @param {string} text - Tweet text
 * @param {string|null} imageUrl - Optional image URL to attach
 * @returns {Promise<Object>} { tweetId, tweetUrl, text }
 */
async function postTweet(text, imageUrl = null) {
  if (!text || text.trim().length === 0) {
    throw new Error('Tweet text cannot be empty');
  }

  const client = getClient();
  const rwClient = client.readWrite;

  // Get username for URL construction
  let username = null;
  try {
    const me = await rwClient.v2.me({ 'user.fields': ['username'] });
    username = me.data.username;
    console.log('[X Poster] Posting as @' + username);
  } catch (err) {
    console.warn('[X Poster] Could not fetch username:', err.message);
  }

  // Upload media if image provided
  let mediaId = null;
  if (imageUrl) {
    try {
      console.log('[X Poster] Uploading media...');
      const imageBuffer = await downloadImage(imageUrl);
      const mediaType = getMediaType(imageUrl);
      mediaId = await rwClient.v1.uploadMedia(imageBuffer, { mimeType: mediaType });
      console.log('[X Poster] Media uploaded:', mediaId);
    } catch (err) {
      console.error('[X Poster] Media upload failed, posting without image:', err.message);
    }
  }

  // Build tweet data
  const tweetData = { text: text.trim() };
  if (mediaId) {
    tweetData.media = { media_ids: [mediaId] };
  }

  console.log('[X Poster] Posting tweet (', text.length, 'chars)...');
  const tweet = await rwClient.v2.tweet(tweetData);

  const tweetId = tweet.data.id;
  const tweetUrl = username
    ? `https://x.com/${username}/status/${tweetId}`
    : `https://x.com/i/web/status/${tweetId}`;

  console.log('[X Poster] Tweet posted:', tweetUrl);

  return {
    tweetId,
    tweetUrl,
    text: tweet.data.text
  };
}

/**
 * Verify X credentials
 */
async function verifyCredentials() {
  const client = getClient();
  const me = await client.readWrite.v2.me({
    'user.fields': ['id', 'name', 'username', 'profile_image_url']
  });
  return {
    userId: me.data.id,
    username: me.data.username,
    name: me.data.name,
    profileImageUrl: me.data.profile_image_url
  };
}

module.exports = {
  postTweet,
  verifyCredentials
};
