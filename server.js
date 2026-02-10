/**
 * Xona Agent — Express API Server
 * Free endpoints for AI image/video generation, PumpFun intelligence, and trending analysis
 * + Test/trigger endpoints for autonomous forum posting pipelines
 * 
 * All endpoints are free — no auth, no payment.
 * Built for the Colosseum Agent Hackathon.
 */
const express = require('express');
const cors = require('cors');
const cookieParser = require('cookie-parser');

// Services
const { generateImage, getModels } = require('./services/image-gen');
const { generateVideo } = require('./services/video-gen');
const { getTrending, getMovers } = require('./services/pumpfun');
const { callGrokApi, buildTrendingSystemInstruction, parseJsonFromResponse } = require('./services/grok');
const {
  runXNewsPost, runImageShowcase, runPumpFunPost,
  previewXNews, previewImageShowcase, previewPumpFun,
  X_NEWS_ACCOUNTS, IMAGE_MODELS
} = require('./services/daily-news');

/**
 * Create the Express server
 * @param {Object} [agent] - ColosseumAgent instance (for live forum triggers)
 */
function createServer(agent = null) {
  const app = express();

  // Middleware
  app.use(cors());
  app.use(express.json({ limit: '10mb' }));
  app.use(cookieParser());

  // ==========================================
  // Health & Info
  // ==========================================

  app.get('/', (req, res) => {
    res.json({
      name: 'Xona Agent',
      version: '1.0.0',
      description: 'Creative AI agent on Solana — Free image/video generation, PumpFun intelligence, autonomous Colosseum forum posting',
      hackathon: 'Colosseum Agent Hackathon',
      endpoints: {
        'POST /generate-image': 'Generate AI images (nano-banana, seedream, grok-imagine)',
        'POST /generate-video': 'Generate 10-second AI videos (Grok Video)',
        'GET /models': 'List available image generation models',
        'GET /pumpfun/trending': 'PumpFun trending tokens with AI analysis',
        'GET /pumpfun/movers': 'PumpFun top movers with AI analysis',
        'GET /solana/trending-topics': 'Trending Solana topics from X',
        'GET /solana/trending-tokens': 'Trending Solana tokens from X',
        'GET /test/x-news': 'Preview X News forum post (dry-run)',
        'GET /test/image-showcase': 'Preview Image Showcase forum post (dry-run)',
        'GET /test/pumpfun': 'Preview PumpFun Intel forum post (dry-run)',
        'POST /trigger/x-news': 'Live trigger X News → post to Colosseum forum',
        'POST /trigger/image-showcase': 'Live trigger Image Showcase → post to Colosseum forum',
        'POST /trigger/pumpfun': 'Live trigger PumpFun Intel → post to Colosseum forum',
        'GET /health': 'Health check'
      },
      autonomous_schedule: {
        'X News': '02:00, 08:00, 14:00, 20:00 UTC — rotating: ' + X_NEWS_ACCOUNTS.join(', '),
        'Image Showcase': '05:00, 17:00 UTC — rotating: ' + IMAGE_MODELS.join(', '),
        'PumpFun Intel': '03:00, 15:00 UTC — alternating: trending / movers'
      },
      free: true,
      repo: process.env.COLOSSEUM_REPO_LINK || 'https://github.com/xona-labs/creative-ai-agent'
    });
  });

  app.get('/health', (req, res) => {
    res.json({
      status: 'ok',
      timestamp: new Date().toISOString(),
      uptime: process.uptime(),
      colosseumAgent: agent ? 'connected' : 'not configured'
    });
  });

  // ==========================================
  // Image Generation (FREE)
  // ==========================================

  app.post('/generate-image', async (req, res) => {
    try {
      const { prompt, model, aspectRatio, referenceImage } = req.body;

      if (!prompt) {
        return res.status(400).json({ success: false, message: 'prompt is required' });
      }

      const result = await generateImage(prompt, {
        model: model || 'nano-banana',
        aspectRatio: aspectRatio || '1:1',
        referenceImage: referenceImage || null
      });

      return res.json({ success: true, ...result });
    } catch (error) {
      console.error('[API] Image generation error:', error.message);
      return res.status(500).json({ success: false, message: error.message });
    }
  });

  app.get('/models', (req, res) => {
    res.json({ success: true, models: getModels() });
  });

  // ==========================================
  // Video Generation (FREE)
  // ==========================================

  app.post('/generate-video', async (req, res) => {
    try {
      const { prompt, aspectRatio, imageUrl } = req.body;

      if (!prompt) {
        return res.status(400).json({ success: false, message: 'prompt is required' });
      }

      const result = await generateVideo(prompt, {
        aspectRatio: aspectRatio || undefined,
        imageUrl: imageUrl || null
      });

      return res.json({ success: true, ...result });
    } catch (error) {
      console.error('[API] Video generation error:', error.message);
      return res.status(500).json({ success: false, message: error.message });
    }
  });

  // ==========================================
  // PumpFun Token Intelligence (FREE)
  // ==========================================

  app.get('/pumpfun/trending', async (req, res) => {
    try {
      const limit = parseInt(req.query.limit) || 10;
      const result = await getTrending(limit);
      return res.json({ success: true, ...result });
    } catch (error) {
      console.error('[API] PumpFun trending error:', error.message);
      return res.status(500).json({ success: false, message: error.message });
    }
  });

  app.get('/pumpfun/movers', async (req, res) => {
    try {
      const limit = parseInt(req.query.limit) || 10;
      const result = await getMovers(limit);
      return res.json({ success: true, ...result });
    } catch (error) {
      console.error('[API] PumpFun movers error:', error.message);
      return res.status(500).json({ success: false, message: error.message });
    }
  });

  // ==========================================
  // Solana Trending (via Grok x_search)
  // ==========================================

  app.get('/solana/trending-topics', async (req, res) => {
    try {
      const limit = parseInt(req.query.limit) || 10;
      const systemInstruction = buildTrendingSystemInstruction();

      const sevenDaysAgo = new Date();
      sevenDaysAgo.setDate(sevenDaysAgo.getDate() - 7);
      const dateStr = sevenDaysAgo.toISOString().split('T')[0];

      const message = `Search for trending Solana topics on X from the last 7 days.
Use x_search: "Solana since:${dateStr} min_faves:100"
Find top ${limit} trending discussions. Return JSON array:
[{ "topic_name": "...", "category": "DeFi", "x_username": "@...", "tweet_content": "...", "post_url": "..." }]`;

      const response = await callGrokApi({
        message,
        tools: [{ type: 'x_search' }],
        systemInstruction
      });

      const items = parseJsonFromResponse(response);
      const topics = Array.isArray(items) ? items : [];

      return res.json({
        success: true,
        topics: topics.map((item, i) => ({
          id: `topic-${i + 1}`,
          topic: item.topic_name || item.topic || item.title || 'Untitled',
          category: item.category || 'General',
          x_username: item.x_username || null,
          tweet_content: item.tweet_content || item.content || '',
          post_url: item.post_url || null
        })),
        count: topics.length
      });
    } catch (error) {
      console.error('[API] Trending topics error:', error.message);
      return res.status(500).json({ success: false, message: error.message });
    }
  });

  app.get('/solana/trending-tokens', async (req, res) => {
    try {
      const limit = parseInt(req.query.limit) || 10;
      const systemInstruction = buildTrendingSystemInstruction();

      const message = `Use x_search to find top ${limit} trending Solana tokens (SPL tokens) on X.
Search: "Solana token" OR "SPL token" OR "$SOL"
Return JSON array:
[{ "name": "...", "ticker": "...", "x_username": "@...", "tweet_content": "...", "post_url": "..." }]`;

      const response = await callGrokApi({
        message,
        tools: [{ type: 'x_search' }],
        systemInstruction
      });

      const items = parseJsonFromResponse(response);
      const tokens = Array.isArray(items) ? items : [];

      return res.json({
        success: true,
        tokens: tokens.map((item, i) => ({
          id: `token-${i + 1}`,
          name: item.name || item.token_name || null,
          ticker: item.ticker || item.symbol || null,
          x_username: item.x_username || null,
          tweet_content: item.tweet_content || item.content || '',
          post_url: item.post_url || null
        })),
        count: tokens.length
      });
    } catch (error) {
      console.error('[API] Trending tokens error:', error.message);
      return res.status(500).json({ success: false, message: error.message });
    }
  });

  // ==========================================
  // Test Endpoints (preview — NO forum posting)
  // ==========================================

  /**
   * GET /test/x-news?account=solana
   * Preview X News forum post (dry-run, no posting)
   */
  app.get('/test/x-news', async (req, res) => {
    try {
      const account = req.query.account || null;
      if (account && !X_NEWS_ACCOUNTS.includes(account)) {
        return res.status(400).json({
          success: false,
          message: `Invalid account. Available: ${X_NEWS_ACCOUNTS.join(', ')}`
        });
      }
      console.log(`[Test] X News preview for: ${account || 'next in rotation'}`);
      const result = await previewXNews(account);
      return res.json({ ...result, note: 'PREVIEW — nothing was posted to Colosseum forum' });
    } catch (error) {
      console.error('[Test] X News preview error:', error.message);
      return res.status(500).json({ success: false, message: error.message });
    }
  });

  /**
   * GET /test/image-showcase?model=nano-banana
   * Preview Image Showcase forum post (dry-run, no posting)
   */
  app.get('/test/image-showcase', async (req, res) => {
    try {
      const model = req.query.model || null;
      if (model && !IMAGE_MODELS.includes(model)) {
        return res.status(400).json({
          success: false,
          message: `Invalid model. Available: ${IMAGE_MODELS.join(', ')}`
        });
      }
      console.log(`[Test] Image Showcase preview for: ${model || 'next in rotation'}`);
      const result = await previewImageShowcase(model);
      return res.json({ ...result, note: 'PREVIEW — nothing was posted to Colosseum forum' });
    } catch (error) {
      console.error('[Test] Image Showcase preview error:', error.message);
      return res.status(500).json({ success: false, message: error.message });
    }
  });

  /**
   * GET /test/pumpfun?type=trending
   * Preview PumpFun Intel forum post (dry-run, no posting)
   */
  app.get('/test/pumpfun', async (req, res) => {
    try {
      const type = req.query.type || null;
      if (type && !['trending', 'movers'].includes(type)) {
        return res.status(400).json({
          success: false,
          message: 'Invalid type. Available: trending, movers'
        });
      }
      console.log(`[Test] PumpFun Intel preview for: ${type || 'next in rotation'}`);
      const result = await previewPumpFun(type);
      return res.json({ ...result, note: 'PREVIEW — nothing was posted to Colosseum forum' });
    } catch (error) {
      console.error('[Test] PumpFun preview error:', error.message);
      return res.status(500).json({ success: false, message: error.message });
    }
  });

  // ==========================================
  // Live Triggers (posts to Colosseum forum)
  // ==========================================

  /**
   * POST /trigger/x-news
   * Body: { "account": "solana" } (optional)
   */
  app.post('/trigger/x-news', async (req, res) => {
    if (!agent) {
      return res.status(503).json({
        success: false,
        message: 'Colosseum agent not configured. Set COLOSSEUM_API_KEY to enable live forum posting.'
      });
    }
    try {
      const account = req.body.account || null;
      if (account && !X_NEWS_ACCOUNTS.includes(account)) {
        return res.status(400).json({
          success: false,
          message: `Invalid account. Available: ${X_NEWS_ACCOUNTS.join(', ')}`
        });
      }
      console.log(`[Trigger] X News LIVE for: ${account || 'next in rotation'}`);
      const result = await runXNewsPost(agent, account);
      return res.json(result);
    } catch (error) {
      console.error('[Trigger] X News error:', error.message);
      return res.status(500).json({ success: false, message: error.message });
    }
  });

  /**
   * POST /trigger/image-showcase
   * Body: { "model": "nano-banana" } (optional)
   */
  app.post('/trigger/image-showcase', async (req, res) => {
    if (!agent) {
      return res.status(503).json({
        success: false,
        message: 'Colosseum agent not configured. Set COLOSSEUM_API_KEY to enable live forum posting.'
      });
    }
    try {
      const model = req.body.model || null;
      if (model && !IMAGE_MODELS.includes(model)) {
        return res.status(400).json({
          success: false,
          message: `Invalid model. Available: ${IMAGE_MODELS.join(', ')}`
        });
      }
      console.log(`[Trigger] Image Showcase LIVE for: ${model || 'next in rotation'}`);
      const result = await runImageShowcase(agent, model);
      return res.json(result);
    } catch (error) {
      console.error('[Trigger] Image Showcase error:', error.message);
      return res.status(500).json({ success: false, message: error.message });
    }
  });

  /**
   * POST /trigger/pumpfun
   * Body: { "type": "trending" } (optional, or "movers")
   */
  app.post('/trigger/pumpfun', async (req, res) => {
    if (!agent) {
      return res.status(503).json({
        success: false,
        message: 'Colosseum agent not configured. Set COLOSSEUM_API_KEY to enable live forum posting.'
      });
    }
    try {
      const type = req.body.type || null;
      if (type && !['trending', 'movers'].includes(type)) {
        return res.status(400).json({
          success: false,
          message: 'Invalid type. Available: trending, movers'
        });
      }
      console.log(`[Trigger] PumpFun Intel LIVE for: ${type || 'next in rotation'}`);
      const result = await runPumpFunPost(agent, type);
      return res.json(result);
    } catch (error) {
      console.error('[Trigger] PumpFun error:', error.message);
      return res.status(500).json({ success: false, message: error.message });
    }
  });

  // ==========================================
  // Error handling
  // ==========================================

  app.use((err, req, res, next) => {
    console.error('[Server] Unhandled error:', err);
    res.status(500).json({ success: false, message: 'Internal server error' });
  });

  return app;
}

module.exports = { createServer };
