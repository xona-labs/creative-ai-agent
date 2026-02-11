/**
 * Autonomous Forum Posting Service — Xona Agent
 * 
 * Three autonomous pipelines, all posting to the Colosseum hackathon forum:
 * 
 *   1. X News: Fetch latest news from 5 Solana ecosystem accounts,
 *      generate title + body + banner, post to forum
 * 
 *   2. Image Showcase: Generate creative AI images with rotating models,
 *      write model quality review, post to forum with image
 * 
 *   3. PumpFun Intel: Fetch trending/movers tokens, format analysis,
 *      post to forum with market data
 * 
 * Cron schedule:
 *   X News:        02:00, 08:00, 14:00, 20:00 UTC  (4x/day, rotating 5 accounts)
 *   Image Showcase: 05:00, 17:00 UTC                (2x/day, rotating 3 models)
 *   PumpFun Intel:  03:00, 15:00 UTC                (2x/day, alternating trending/movers)
 */
const cron = require('node-cron');
const { callGrokApi, extractTextFromResponse, parseJsonFromResponse } = require('./grok');
const { generateImage, getModels } = require('./image-gen');
const { getTrending, getMovers } = require('./pumpfun');

// ==========================================
// Configuration
// ==========================================

/** X accounts to fetch news from (rotated each run) */
const X_NEWS_ACCOUNTS = [
  'solana',
  'dexteraisol',
  'zauthx402',
  'payainetwork',
  'relayaisolana'
];

/** Image models to showcase (rotated each run) */
const IMAGE_MODELS = ['nano-banana', 'seedream', 'grok-imagine'];

/** Rotation indexes (persist in memory across cron runs) */
let xNewsIndex = 0;
let modelIndex = 0;
let pumpfunType = 'trending'; // alternates between 'trending' and 'movers'

/** Agent references for forum posting / Superteam Earn */
let _agent = null;
let _superteamAgent = null;

/** Recent news URLs to avoid duplicate posts */
const recentNewsUrls = [];
const MAX_RECENT = 30;

function trackNewsUrl(url) {
  if (url) {
    recentNewsUrls.push(url);
    if (recentNewsUrls.length > MAX_RECENT) recentNewsUrls.shift();
  }
}

// ==========================================
// Helper: Post to forum
// ==========================================

async function postToForum(agent, title, body) {
  if (!agent) {
    console.warn('[Forum] No agent instance — skipping forum post');
    return null;
  }
  return agent.createForumPost(title, body);
}

// ==========================================
// Pipeline 1: X News
// ==========================================

/**
 * Fetch latest news/announcements from an X account via Grok x_search
 */
async function fetchLatestNews(username) {
  console.log(`[X News] Fetching latest news from @${username}...`);

  const avoidText = recentNewsUrls.length > 0
    ? `\n\nDO NOT select posts with these URLs (already posted):\n${recentNewsUrls.slice(-10).join('\n')}`
    : '';

  const systemInstruction = `You are a news research assistant. Use x_search to find news-related posts from @${username}.

CRITICAL: Filter for posts that contain NEWS, ANNOUNCEMENTS, or UPDATES:
- News announcements or updates
- Product launches or releases
- Major announcements or developments
- Significant updates or changes

EXCLUDE: Casual conversation, replies, personal updates, simple retweets.

Search query: "from:${username} -filter:retweets"
${avoidText}

For each news result, extract:
- news_url: Direct Twitter status link
- title: Concise title (max 100 chars)
- text: Full tweet text
- source_name: "${username}"
- date: ISO format date
- sentiment: "Positive", "Negative", or "Neutral"

Also extract the profile_image_url.

Return as JSON:
{
  "news": [{ "news_url": "...", "title": "...", "text": "...", "source_name": "${username}", "date": "...", "sentiment": "..." }],
  "profile_image_url": "https://pbs.twimg.com/..."
}`;

  const response = await callGrokApi({
    message: `Search for latest news/updates/announcements from @${username} using x_search. Focus ONLY on main posts with news value. Extract profile image URL.`,
    tools: [{ type: 'x_search' }],
    systemInstruction
  });

  let newsItems = [];
  let profileImageUrl = null;

  const parsed = parseJsonFromResponse(response);
  if (parsed) {
    if (parsed.profile_image_url) profileImageUrl = parsed.profile_image_url;

    const newsArray = Array.isArray(parsed.news) ? parsed.news : (Array.isArray(parsed) ? parsed : []);
    newsItems = newsArray.map(item => ({
      news_url: item.news_url || item.post_url || item.url || null,
      title: item.title || (item.text || '').substring(0, 100),
      text: item.text || item.tweet_content || item.content || '',
      source_name: username,
      date: item.date || item.created_at || new Date().toISOString(),
      sentiment: item.sentiment || 'Neutral'
    })).filter(item => item.text.length > 0);
  }

  // Filter out already-posted URLs
  newsItems = newsItems.filter(item => !recentNewsUrls.includes(item.news_url));

  console.log(`[X News] Found ${newsItems.length} news items from @${username}`);
  return { newsItems, profileImageUrl };
}

/**
 * Generate a catchy 4-word title
 */
async function generateNewsTitle(topNews, username) {
  try {
    const response = await callGrokApi({
      message: `Based on this X post from @${username}, create a simple, catchy title (MAX 4 words):\n\n${JSON.stringify(topNews, null, 2)}\n\nReturn ONLY JSON: { "title": "Your catchy title" }`,
      tools: [],
      systemInstruction: 'You are a news formatting assistant. Return only valid JSON with a title field (max 4 words).'
    });
    const result = parseJsonFromResponse(response);
    if (result?.title) return result.title;
  } catch (e) {
    console.warn('[X News] Title fallback:', e.message);
  }
  return (topNews.title || topNews.text || 'News Update').split(' ').slice(0, 4).join(' ');
}

/**
 * Generate a news banner image
 */
async function generateNewsBanner(title, username, profileImageUrl) {
  const bannerPrompt = `Create a dark, modern news banner image. Clean minimal background with subtle gradient glow. Display headline "${title}" prominently with smaller text "Latest from @${username}" above it. Bottom-right: "Made with Xona." Style: clean, high-contrast, futuristic, crypto-native editorial banner.`;

  try {
    const result = await generateImage(bannerPrompt, {
      model: 'nano-banana',
      aspectRatio: '16:9',
      referenceImage: profileImageUrl || null
    });
    return result.image_url;
  } catch (e) {
    console.warn('[X News] Banner generation failed:', e.message);
    return null;
  }
}

/**
 * Full X News pipeline → post to Colosseum forum
 * @param {Object} agent - ColosseumAgent instance (null for preview)
 * @param {string} [forceAccount] - Force specific account
 */
async function runXNewsPost(agent, forceAccount = null) {
  const username = forceAccount || X_NEWS_ACCOUNTS[xNewsIndex % X_NEWS_ACCOUNTS.length];
  if (!forceAccount) xNewsIndex++;

  console.log(`\n[X News] ═══════════════════════════════════════`);
  console.log(`[X News] Pipeline for @${username}`);
  console.log(`[X News] ═══════════════════════════════════════\n`);

  // Step 1: Fetch latest news
  console.log('[X News] Step 1: Fetching latest news...');
  const { newsItems, profileImageUrl } = await fetchLatestNews(username);

  if (newsItems.length === 0) {
    return { success: false, message: `No news found for @${username}`, username };
  }

  const topNews = newsItems.sort((a, b) => new Date(b.date) - new Date(a.date))[0];
  console.log(`[X News] Top: ${topNews.title?.substring(0, 80)}`);

  // Step 2: Generate title
  console.log('[X News] Step 2: Generating title...');
  const title = await generateNewsTitle(topNews, username);

  // Step 3: Generate banner
  console.log('[X News] Step 3: Generating banner...');
  const bannerUrl = await generateNewsBanner(title, username, profileImageUrl);

  // Step 4: Build forum post body
  const forumTitle = `📡 Latest from @${username}: ${title}`;
  const forumBody = [
    `## ${title}`,
    '',
    topNews.text,
    '',
    bannerUrl ? `![News Banner](${bannerUrl})` : '',
    '',
    `**Source:** ${topNews.news_url || `https://x.com/${username}`}`,
    `**Sentiment:** ${topNews.sentiment}`,
    '',
    '---',
    '*Autonomously curated by Xona Agent — fetching latest Solana ecosystem news from X*',
  ].filter(Boolean).join('\n');

  // Step 5: Post to forum
  console.log('[X News] Step 4: Posting to Colosseum forum...');
  const forumResult = await postToForum(agent, forumTitle, forumBody);

  trackNewsUrl(topNews.news_url);

  return {
    success: true,
    type: 'x_news',
    username,
    title: forumTitle,
    body: forumBody,
    bannerUrl,
    newsSource: topNews.news_url,
    forumPostId: forumResult?.post?.id || null
  };
}

// ==========================================
// Pipeline 2: Image Showcase
// ==========================================

/**
 * Generate a creative prompt themed around Solana/AI/crypto
 */
async function generateCreativePrompt() {
  const themes = [
    'Solana ecosystem', 'DeFi innovation', 'blockchain technology',
    'AI and crypto convergence', 'meme culture in crypto', 'digital art',
    'futuristic finance', 'web3 identity', 'on-chain creativity',
    'token launch energy', 'Solana speed', 'decentralized future'
  ];
  const theme = themes[Math.floor(Math.random() * themes.length)];

  try {
    const response = await callGrokApi({
      message: `Generate a creative, vivid AI image generation prompt themed around "${theme}". Visually striking and artistic, 1-2 sentences, max 50 words. Include specific visual details.\n\nReturn ONLY JSON: { "prompt": "..." }`,
      tools: []
    });
    const result = parseJsonFromResponse(response);
    if (result?.prompt) return { prompt: result.prompt, theme };
  } catch (e) {
    console.warn('[Showcase] Prompt fallback:', e.message);
  }

  return {
    prompt: `A breathtaking visualization of ${theme} with neon gradients, glowing particles, and futuristic elements in a cinematic 4K style`,
    theme
  };
}

/**
 * Generate a model quality review for the forum post
 */
async function generateModelReview(modelKey, prompt, imageUrl, theme) {
  const modelNames = {
    'nano-banana': 'Google Nano Banana',
    'seedream': 'ByteDance Seedream 4.5',
    'grok-imagine': 'xAI Grok Imagine'
  };
  const modelName = modelNames[modelKey] || modelKey;

  try {
    const response = await callGrokApi({
      message: `Write a forum post body reviewing an AI-generated image.

Model: ${modelName}
Prompt: "${prompt}"
Theme: ${theme}

Requirements:
- Comment on the quality, detail, style, and vibe
- Mention strengths and any limitations
- Compare briefly with what you'd expect from other models
- Be genuine and technical, not salesy
- 3-5 sentences

Return ONLY JSON: { "review": "..." }`,
      tools: []
    });
    const result = parseJsonFromResponse(response);
    if (result?.review) return result.review;
  } catch (e) {
    console.warn('[Showcase] Review fallback:', e.message);
  }

  return `Generated with ${modelName}. The model handles the "${theme}" theme well, producing vivid colors and coherent composition. Detail level is solid for the prompt complexity. Overall a strong showing of current AI image generation capabilities.`;
}

/**
 * Full Image Showcase pipeline → post to Colosseum forum
 * @param {Object} agent - ColosseumAgent instance (null for preview)
 * @param {string} [forceModel] - Force specific model
 */
async function runImageShowcase(agent, forceModel = null) {
  const modelKey = forceModel || IMAGE_MODELS[modelIndex % IMAGE_MODELS.length];
  if (!forceModel) modelIndex++;

  const modelNames = {
    'nano-banana': 'Google Nano Banana',
    'seedream': 'ByteDance Seedream 4.5',
    'grok-imagine': 'xAI Grok Imagine'
  };
  const modelName = modelNames[modelKey] || modelKey;

  console.log(`\n[Showcase] ═══════════════════════════════════════`);
  console.log(`[Showcase] Pipeline with model: ${modelName}`);
  console.log(`[Showcase] ═══════════════════════════════════════\n`);

  // Step 1: Generate creative prompt
  console.log('[Showcase] Step 1: Generating creative prompt...');
  const { prompt, theme } = await generateCreativePrompt();
  console.log(`[Showcase] Prompt: ${prompt.substring(0, 80)}...`);

  // Step 2: Generate image
  console.log(`[Showcase] Step 2: Generating image with ${modelKey}...`);
  const imageResult = await generateImage(prompt, { model: modelKey, aspectRatio: '1:1' });
  console.log(`[Showcase] Image: ${imageResult.image_url}`);

  // Step 3: Generate review
  console.log('[Showcase] Step 3: Writing model review...');
  const review = await generateModelReview(modelKey, prompt, imageResult.image_url, theme);

  // Step 4: Build forum post
  const forumTitle = `🎨 AI Image Showcase: ${modelName} — "${theme}"`;
  const forumBody = [
    `## ${modelName} — Image Generation Review`,
    '',
    `![Generated Image](${imageResult.image_url})`,
    '',
    `**Prompt:** "${prompt}"`,
    '',
    `**Model:** ${modelName}`,
    `**Theme:** ${theme}`,
    '',
    '### Review',
    '',
    review,
    '',
    '---',
    `Want to generate your own? Use our free API:`,
    '```',
    'POST /generate-image',
    `{ "prompt": "${prompt.substring(0, 80)}...", "model": "${modelKey}" }`,
    '```',
    '',
    '*Autonomously generated by Xona Agent — showcasing AI model capabilities*',
  ].join('\n');

  // Step 5: Post to forum
  console.log('[Showcase] Step 4: Posting to Colosseum forum...');
  const forumResult = await postToForum(agent, forumTitle, forumBody);

  return {
    success: true,
    type: 'image_showcase',
    model: modelKey,
    modelName,
    theme,
    prompt,
    imageUrl: imageResult.image_url,
    review,
    title: forumTitle,
    body: forumBody,
    forumPostId: forumResult?.post?.id || null
  };
}

// ==========================================
// Pipeline 3: PumpFun Intel
// ==========================================

/**
 * Format a token for markdown display
 */
function formatTokenMarkdown(token, index) {
  const priceChanges = [];
  if (token['5mpricechange'] != null) priceChanges.push(`5m: ${token['5mpricechange']}%`);
  if (token['1hpricechange'] != null) priceChanges.push(`1h: ${token['1hpricechange']}%`);
  if (token['6hpricechange'] != null) priceChanges.push(`6h: ${token['6hpricechange']}%`);
  if (token['24hpricechange'] != null) priceChanges.push(`24h: ${token['24hpricechange']}%`);

  const lines = [
    `### ${index + 1}. ${token.name || 'Unknown'} ($${token.ticker || '???'})`,
    '',
    `- **Market Cap:** ${token.mc || 'N/A'}`,
    priceChanges.length > 0 ? `- **Price Changes:** ${priceChanges.join(' | ')}` : null,
    token.ca ? `- **CA:** \`${token.ca}\`` : null,
    token.icon ? `- **Icon:** ![${token.ticker}](${token.icon})` : null,
    token.icon_description ? `- **Icon Description:** ${token.icon_description}` : null,
    token.social?.twitter ? `- **Twitter:** ${token.social.twitter}` : null,
    token.social?.website ? `- **Website:** ${token.social.website}` : null,
  ];

  return lines.filter(Boolean).join('\n');
}

/**
 * Full PumpFun Intel pipeline → post to Colosseum forum
 * @param {Object} agent - ColosseumAgent instance (null for preview)
 * @param {string} [forceType] - Force 'trending' or 'movers'
 */
async function runPumpFunPost(agent, forceType = null) {
  const type = forceType || pumpfunType;
  // Alternate for next run
  if (!forceType) pumpfunType = pumpfunType === 'trending' ? 'movers' : 'trending';

  const isTrending = type === 'trending';
  const label = isTrending ? 'Trending Tokens' : 'Top Movers';

  console.log(`\n[PumpFun] ═══════════════════════════════════════`);
  console.log(`[PumpFun] Pipeline: ${label}`);
  console.log(`[PumpFun] ═══════════════════════════════════════\n`);

  // Step 1: Fetch data
  console.log(`[PumpFun] Step 1: Fetching ${label}...`);
  const data = isTrending ? await getTrending(10) : await getMovers(10);
  const tokens = isTrending ? data.trending_tokens : data.movers_tokens;

  if (!tokens || tokens.length === 0) {
    return { success: false, message: `No ${label} data available`, type };
  }

  console.log(`[PumpFun] Got ${tokens.length} tokens`);

  // Step 2: Build forum post
  const emoji = isTrending ? '🚀' : '📈';
  const now = new Date().toISOString().split('T')[0];
  const forumTitle = `${emoji} PumpFun ${label} — ${now}`;

  const tokensList = tokens.map((t, i) => formatTokenMarkdown(t, i)).join('\n\n');

  const forumBody = [
    `## ${emoji} PumpFun ${label}`,
    `*Updated: ${new Date().toISOString()}*`,
    '',
    '### AI Analysis',
    '',
    data.summary || 'No summary available.',
    '',
    data.suggestions?.length > 0 ? '### Suggestions\n\n' + data.suggestions.map(s => `- ${s}`).join('\n') : '',
    '',
    `### Token List (${tokens.length})`,
    '',
    tokensList,
    '',
    '---',
    `*Data sourced from PumpFun + DexScreener, enriched with AI analysis by Xona Agent*`,
    '',
    `Want real-time data? Use our free API:`,
    '```',
    `GET /pumpfun/${type}?limit=10`,
    '```',
  ].filter(Boolean).join('\n');

  // Step 3: Post to forum
  console.log('[PumpFun] Step 2: Posting to Colosseum forum...');
  const forumResult = await postToForum(agent, forumTitle, forumBody);

  return {
    success: true,
    type: `pumpfun_${type}`,
    label,
    title: forumTitle,
    body: forumBody,
    summary: data.summary,
    suggestions: data.suggestions,
    tokenCount: tokens.length,
    forumPostId: forumResult?.post?.id || null
  };
}

// ==========================================
// Preview (dry-run — no forum posting)
// ==========================================

/**
 * Preview X News (no posting)
 */
async function previewXNews(forceAccount = null) {
  return runXNewsPost(null, forceAccount);
}

/**
 * Preview Image Showcase (no posting)
 */
async function previewImageShowcase(forceModel = null) {
  return runImageShowcase(null, forceModel);
}

/**
 * Preview PumpFun Intel (no posting)
 */
async function previewPumpFun(forceType = null) {
  return runPumpFunPost(null, forceType);
}

// ==========================================
// Cron Jobs
// ==========================================

let xNewsCron = null;
let showcaseCron = null;
let pumpfunCron = null;

/**
 * Start all autonomous forum posting cron jobs
 * @param {Object} agent - ColosseumAgent instance
 * @param {Object} [superteamAgent] - SuperteamEarnAgent instance (optional)
 */
function startCron(agent, superteamAgent = null) {
  stopCron();
  _agent = agent;
  _superteamAgent = superteamAgent;

  console.log('[Cron] Starting autonomous forum posting cron jobs...');

  // X News: 02:00, 08:00, 14:00, 20:00 UTC (rotating 5 accounts)
  xNewsCron = cron.schedule('0 2,8,14,20 * * *', async () => {
    console.log(`[Cron] X News triggered at ${new Date().toISOString()}`);
    try {
      await runXNewsPost(_agent);
    } catch (error) {
      console.error('[Cron] X News error:', error.message);
    }
  }, { scheduled: true, timezone: 'UTC' });

  // Image Showcase: 05:00, 17:00 UTC (rotating 3 models)
  showcaseCron = cron.schedule('0 5,17 * * *', async () => {
    console.log(`[Cron] Image Showcase triggered at ${new Date().toISOString()}`);
    try {
      await runImageShowcase(_agent);
    } catch (error) {
      console.error('[Cron] Image Showcase error:', error.message);
    }
  }, { scheduled: true, timezone: 'UTC' });

  // PumpFun Intel: 03:00, 15:00 UTC (alternating trending/movers)
  pumpfunCron = cron.schedule('0 3,15 * * *', async () => {
    console.log(`[Cron] PumpFun Intel triggered at ${new Date().toISOString()}`);
    try {
      await runPumpFunPost(_agent);
    } catch (error) {
      console.error('[Cron] PumpFun Intel error:', error.message);
    }
  }, { scheduled: true, timezone: 'UTC' });

  console.log('[Cron] Cron jobs started:');
  console.log('  📡 X News:        02:00, 08:00, 14:00, 20:00 UTC → rotating: ' + X_NEWS_ACCOUNTS.join(', '));
  console.log('  🎨 Image Showcase: 05:00, 17:00 UTC → rotating: ' + IMAGE_MODELS.join(', '));
  console.log('  📊 PumpFun Intel:  03:00, 15:00 UTC → alternating: trending / movers');
}

/**
 * Stop all cron jobs
 */
function stopCron() {
  if (xNewsCron) { xNewsCron.stop(); xNewsCron = null; }
  if (showcaseCron) { showcaseCron.stop(); showcaseCron = null; }
  if (pumpfunCron) { pumpfunCron.stop(); pumpfunCron = null; }
}

module.exports = {
  startCron,
  stopCron,
  // Live posting (requires agent)
  runXNewsPost,
  runImageShowcase,
  runPumpFunPost,
  // Preview (no posting)
  previewXNews,
  previewImageShowcase,
  previewPumpFun,
  // Config
  X_NEWS_ACCOUNTS,
  IMAGE_MODELS
};
