/**
 * Superteam Earn Agent Client
 * Handles registration, heartbeat, listing discovery, submissions, and comments
 * 
 * API Reference: https://superteam.fun/skill.md
 * Heartbeat: https://superteam.fun/heartbeat.md
 */
const axios = require('axios');

const SUPERTEAM_API = 'https://superteam.fun/api/agents';
const SUPERTEAM_BASE = 'https://superteam.fun';

class SuperteamEarnAgent {
  constructor() {
    this.apiKey = process.env.SUPERTEAM_API_KEY || null;
    this.agentName = process.env.SUPERTEAM_AGENT_NAME || 'xona-agent';
    this.claimCode = process.env.SUPERTEAM_CLAIM_CODE || null;
    this.telegram = process.env.SUPERTEAM_TELEGRAM || null;
    this.scanInterval = null;
    this.lastAction = 'initialized';
    this.nextAction = 'scanning for listings';
    this.status = 'ok';
    this.submittedListings = new Set();
  }

  /**
   * Get authorization headers
   */
  headers() {
    if (!this.apiKey) {
      throw new Error('SUPERTEAM_API_KEY is not set. Run `npm run register:superteam` first.');
    }
    return {
      'Content-Type': 'application/json',
      'Authorization': `Bearer ${this.apiKey}`,
    };
  }

  // ==========================================
  // Registration
  // ==========================================

  /**
   * Register agent with Superteam Earn
   * ⚠️ API key is shown ONLY ONCE — save it immediately
   */
  async register() {
    if (this.apiKey) {
      console.log('✅ Already registered with Superteam Earn (SUPERTEAM_API_KEY is set)');
      return { alreadyRegistered: true };
    }

    try {
      const res = await axios.post(`${SUPERTEAM_API}`, {
        name: this.agentName,
      });

      const data = res.data;
      this.apiKey = data.apiKey;
      this.claimCode = data.claimCode;

      console.log('');
      console.log('🎉 ═══════════════════════════════════════════');
      console.log('   Registered with Superteam Earn!');
      console.log('═══════════════════════════════════════════════');
      console.log('');
      console.log(`   Agent Name:  ${data.agent?.name || this.agentName}`);
      console.log(`   Agent ID:    ${data.agentId || 'N/A'}`);
      console.log(`   Username:    ${data.username || 'N/A'}`);
      console.log(`   API Key:     ${data.apiKey}`);
      console.log(`   Claim Code:  ${data.claimCode}`);
      console.log(`   Claim URL:   ${SUPERTEAM_BASE}/earn/claim/${data.claimCode}`);
      console.log('');
      console.log('   ⚠️  SAVE THE API KEY NOW — it is shown ONCE and cannot be recovered.');
      console.log('   Set it as SUPERTEAM_API_KEY in your .env file.');
      console.log('');

      return data;
    } catch (err) {
      const msg = err.response?.data?.message || err.response?.data?.error || err.message;
      console.error('❌ Superteam registration failed:', msg);
      throw new Error(`Superteam registration failed: ${msg}`);
    }
  }

  // ==========================================
  // Heartbeat
  // ==========================================

  /**
   * Build heartbeat JSON payload (per heartbeat.md spec)
   */
  getHeartbeat() {
    return {
      status: this.status,
      agentName: this.agentName,
      time: new Date().toISOString(),
      version: 'earn-agent-mvp',
      capabilities: [
        'register',
        'listings',
        'submit',
        'claim',
        'image-generation',
        'video-generation',
        'pumpfun-intel',
        'x-news'
      ],
      lastAction: this.lastAction,
      nextAction: this.nextAction,
    };
  }

  /**
   * Log heartbeat to console
   */
  reportHeartbeat() {
    const hb = this.getHeartbeat();
    console.log(`[Superteam Heartbeat] ${hb.status} at ${hb.time} — last: ${hb.lastAction}, next: ${hb.nextAction}`);
    return hb;
  }

  // ==========================================
  // Listing Discovery
  // ==========================================

  /**
   * Discover agent-eligible live listings
   * @param {Object} [options]
   * @param {number} [options.take=20] - Number of listings to fetch
   * @param {string} [options.deadline] - Filter by deadline (ISO date)
   */
  async discoverListings(options = {}) {
    const { take = 20, deadline } = options;

    try {
      const params = { take };
      if (deadline) params.deadline = deadline;

      const res = await axios.get(`${SUPERTEAM_API}/listings/live`, {
        params,
        headers: this.headers(),
      });

      this.lastAction = `discovered ${res.data?.listings?.length || 0} listings`;
      console.log(`[Superteam] Found ${res.data?.listings?.length || 0} agent-eligible listings`);
      return res.data;
    } catch (err) {
      const msg = err.response?.data?.message || err.message;
      console.error('[Superteam] Error discovering listings:', msg);
      if (err.response?.status === 401) {
        this.status = 'blocked';
        this.lastAction = 'auth failed — invalid API key';
      }
      return null;
    }
  }

  /**
   * Get details for a specific listing
   * @param {string} slug - Listing slug
   */
  async getListingDetails(slug) {
    try {
      const res = await axios.get(`${SUPERTEAM_API}/listings/details/${slug}`, {
        headers: this.headers(),
      });
      return res.data;
    } catch (err) {
      const msg = err.response?.data?.message || err.message;
      console.error(`[Superteam] Error fetching listing "${slug}":`, msg);
      return null;
    }
  }

  // ==========================================
  // Submissions
  // ==========================================

  /**
   * Submit work to a listing
   * @param {Object} submission
   * @param {string} submission.listingId - Listing ID
   * @param {string} [submission.link] - URL to submitted work
   * @param {string} [submission.tweet] - Tweet URL (if applicable)
   * @param {string} [submission.otherInfo] - Description of what was built
   * @param {Array}  [submission.eligibilityAnswers] - Answers to eligibility questions
   * @param {number} [submission.ask] - Quote amount for variable-pay listings
   * @param {string} [submission.telegram] - Telegram URL for project listings
   */
  async submitWork(submission) {
    try {
      const payload = {
        listingId: submission.listingId,
        link: submission.link || '',
        tweet: submission.tweet || '',
        otherInfo: submission.otherInfo || '',
        eligibilityAnswers: submission.eligibilityAnswers || [],
        ask: submission.ask || null,
        telegram: submission.telegram || this.telegram || null,
      };

      const res = await axios.post(`${SUPERTEAM_API}/submissions/create`, payload, {
        headers: this.headers(),
      });

      this.lastAction = `submitted to listing ${submission.listingId}`;
      this.submittedListings.add(submission.listingId);
      console.log(`[Superteam] ✅ Submitted to listing: ${submission.listingId}`);
      return res.data;
    } catch (err) {
      const msg = err.response?.data?.message || err.response?.data?.error || err.message;
      const status = err.response?.status;

      if (status === 403) {
        console.warn(`[Superteam] Submission blocked: ${msg}`);
      } else if (status === 429) {
        console.warn('[Superteam] Rate limited on submissions — will retry later');
        this.status = 'degraded';
      } else {
        console.error(`[Superteam] Submission error: ${msg}`);
      }
      return null;
    }
  }

  /**
   * Update an existing submission
   * @param {Object} submission - Same fields as submitWork
   */
  async updateSubmission(submission) {
    try {
      const payload = {
        listingId: submission.listingId,
        link: submission.link || '',
        tweet: submission.tweet || '',
        otherInfo: submission.otherInfo || '',
        eligibilityAnswers: submission.eligibilityAnswers || [],
        ask: submission.ask || null,
        telegram: submission.telegram || this.telegram || null,
      };

      const res = await axios.post(`${SUPERTEAM_API}/submissions/update`, payload, {
        headers: this.headers(),
      });

      this.lastAction = `updated submission for listing ${submission.listingId}`;
      console.log(`[Superteam] 📝 Updated submission for listing: ${submission.listingId}`);
      return res.data;
    } catch (err) {
      const msg = err.response?.data?.message || err.response?.data?.error || err.message;
      console.error(`[Superteam] Update error: ${msg}`);
      return null;
    }
  }

  // ==========================================
  // Comments
  // ==========================================

  /**
   * Fetch comments for a listing
   * @param {string} listingId
   * @param {Object} [options]
   * @param {number} [options.skip=0]
   * @param {number} [options.take=20]
   */
  async getComments(listingId, options = {}) {
    const { skip = 0, take = 20 } = options;
    try {
      const res = await axios.get(`${SUPERTEAM_API}/comments/${listingId}`, {
        params: { skip, take },
        headers: this.headers(),
      });
      return res.data;
    } catch (err) {
      console.error('[Superteam] Error fetching comments:', err.response?.data?.message || err.message);
      return null;
    }
  }

  /**
   * Post a comment on a listing
   * @param {Object} comment
   * @param {string} comment.refId - Listing ID
   * @param {string} comment.message - Comment text
   * @param {string} [comment.refType='BOUNTY'] - Listing type
   * @param {string} [comment.pocId] - Point of contact user ID
   */
  async postComment(comment) {
    try {
      const payload = {
        refType: comment.refType || 'BOUNTY',
        refId: comment.refId,
        message: comment.message,
        pocId: comment.pocId || undefined,
      };

      const res = await axios.post(`${SUPERTEAM_API}/comments/create`, payload, {
        headers: this.headers(),
      });

      this.lastAction = `commented on listing ${comment.refId}`;
      console.log(`[Superteam] 💬 Commented on listing: ${comment.refId}`);
      return res.data;
    } catch (err) {
      console.error('[Superteam] Comment error:', err.response?.data?.message || err.message);
      return null;
    }
  }

  /**
   * Reply to a specific comment
   * @param {Object} reply
   * @param {string} reply.refId - Listing ID
   * @param {string} reply.message - Reply text
   * @param {string} reply.replyToId - Comment ID to reply to
   * @param {string} reply.replyToUserId - Author of the comment being replied to
   * @param {string} [reply.pocId] - Point of contact user ID
   */
  async replyToComment(reply) {
    try {
      const payload = {
        refType: reply.refType || 'BOUNTY',
        refId: reply.refId,
        message: reply.message,
        replyToId: reply.replyToId,
        replyToUserId: reply.replyToUserId,
        pocId: reply.pocId || undefined,
      };

      const res = await axios.post(`${SUPERTEAM_API}/comments/create`, payload, {
        headers: this.headers(),
      });

      console.log(`[Superteam] ↩️  Replied to comment ${reply.replyToId}`);
      return res.data;
    } catch (err) {
      console.error('[Superteam] Reply error:', err.response?.data?.message || err.message);
      return null;
    }
  }

  // ==========================================
  // Autonomous Listing Scanner
  // ==========================================

  /**
   * Keywords that match Xona Agent's capabilities
   */
  static CAPABILITY_KEYWORDS = {
    image: ['image', 'design', 'graphic', 'visual', 'banner', 'logo', 'illustration', 'creative', 'art'],
    video: ['video', 'animation', 'motion', 'clip'],
    defi: ['defi', 'token', 'trading', 'analytics', 'pumpfun', 'dex', 'swap', 'market'],
    ai: ['ai', 'artificial intelligence', 'machine learning', 'generate', 'generation'],
    solana: ['solana', 'spl', 'sol', 'blockchain', 'web3', 'on-chain'],
    agent: ['agent', 'autonomous', 'bot', 'automation'],
    content: ['content', 'write', 'article', 'blog', 'newsletter', 'news', 'social media'],
  };

  /**
   * Score a listing based on relevance to Xona Agent's capabilities
   * @param {Object} listing - Listing object
   * @returns {Object} { score, matchedCategories }
   */
  scoreListing(listing) {
    const text = `${listing.title || ''} ${listing.description || ''} ${listing.slug || ''}`.toLowerCase();
    const matchedCategories = [];
    let score = 0;

    for (const [category, keywords] of Object.entries(SuperteamEarnAgent.CAPABILITY_KEYWORDS)) {
      for (const kw of keywords) {
        if (text.includes(kw)) {
          matchedCategories.push(category);
          score += 1;
          break; // one match per category
        }
      }
    }

    return { score, matchedCategories };
  }

  /**
   * Build a submission description based on matched capabilities
   */
  buildSubmissionInfo(listing, matchedCategories) {
    const parts = [
      'Xona Agent — Autonomous Creative AI on Solana',
      '',
    ];

    if (matchedCategories.includes('image')) {
      parts.push('🎨 **Image Generation**: Free AI image generation with 3 models (Google Nano Banana, ByteDance Seedream 4.5, xAI Grok Imagine). Any aspect ratio, reference image support.');
    }
    if (matchedCategories.includes('video')) {
      parts.push('🎬 **Video Generation**: 10-second AI video clips via Grok Video. Free for all users.');
    }
    if (matchedCategories.includes('defi') || matchedCategories.includes('solana')) {
      parts.push('📊 **PumpFun Intelligence**: Real-time trending tokens and top movers with DexScreener data + AI analysis.');
    }
    if (matchedCategories.includes('ai') || matchedCategories.includes('agent')) {
      parts.push('🤖 **Autonomous Agent**: Fully autonomous AI agent on Solana with x402 USDC micropayments, Jupiter API integration, and MCP server for agent-to-agent interactions.');
    }
    if (matchedCategories.includes('content')) {
      parts.push('📡 **Content Pipeline**: Automated news curation from 5 Solana ecosystem X accounts, AI-generated banners, model quality reviews.');
    }

    parts.push('');
    parts.push('All API endpoints are free — no auth, no payment required.');
    parts.push(`Repo: ${process.env.COLOSSEUM_REPO_LINK || 'https://github.com/xona-labs/creative-ai-agent'}`);
    parts.push(`Demo: ${process.env.COLOSSEUM_DEMO_LINK || 'https://xona-agent.com'}`);

    return parts.join('\n');
  }

  /**
   * Scan for agent-eligible listings and auto-submit to relevant ones
   */
  async scanAndSubmit() {
    console.log(`\n[Superteam] ═══════════════════════════════════════`);
    console.log(`[Superteam] Autonomous Listing Scan`);
    console.log(`[Superteam] ═══════════════════════════════════════\n`);

    this.nextAction = 'scanning for listings';
    this.reportHeartbeat();

    // Step 1: Discover listings
    const data = await this.discoverListings({ take: 50 });
    if (!data?.listings || data.listings.length === 0) {
      console.log('[Superteam] No agent-eligible listings found');
      this.nextAction = 'waiting for next scan';
      return { submitted: 0, scanned: 0 };
    }

    const listings = data.listings;
    console.log(`[Superteam] Scanning ${listings.length} listings for relevance...`);

    // Step 2: Score & filter
    let submitted = 0;
    const candidates = listings
      .map(listing => ({
        ...listing,
        ...this.scoreListing(listing),
      }))
      .filter(l => l.score >= 2) // at least 2 capability matches
      .filter(l => !this.submittedListings.has(l.id))
      .sort((a, b) => b.score - a.score);

    console.log(`[Superteam] Found ${candidates.length} relevant listings (score >= 2)`);

    // Step 3: Submit to top candidates (max 3 per scan to respect rate limits)
    const toSubmit = candidates.slice(0, 3);

    for (const listing of toSubmit) {
      console.log(`[Superteam] Submitting to: "${listing.title || listing.slug}" (score: ${listing.score}, categories: ${listing.matchedCategories.join(', ')})`);

      const otherInfo = this.buildSubmissionInfo(listing, listing.matchedCategories);
      const demoLink = process.env.COLOSSEUM_DEMO_LINK || 'https://xona-agent.com';

      const result = await this.submitWork({
        listingId: listing.id,
        link: demoLink,
        otherInfo,
        telegram: this.telegram || undefined,
      });

      if (result) {
        submitted++;
        // Also leave an introductory comment
        await this.postComment({
          refId: listing.id,
          message: `Hey! We're Xona Agent — an autonomous creative AI agent on Solana. We offer free image generation (3 models), video generation, and PumpFun token intelligence. Our API is free and open for all agents. Let us know if you need anything! 🚀`,
          pocId: listing.pocId || undefined,
        });
      }

      // Small delay between submissions to be respectful
      await new Promise(r => setTimeout(r, 2000));
    }

    this.lastAction = `scanned ${listings.length} listings, submitted to ${submitted}`;
    this.nextAction = 'waiting for next scan';

    console.log(`[Superteam] Scan complete: ${submitted} submissions from ${listings.length} listings`);
    return { submitted, scanned: listings.length, candidates: candidates.length };
  }

  // ==========================================
  // Scan Loop
  // ==========================================

  /**
   * Start periodic listing scan
   * @param {number} intervalMs - Scan interval (default: 2 hours)
   */
  startScanner(intervalMs = 2 * 60 * 60 * 1000) {
    // Immediate first scan (delayed 30s to let everything initialize)
    setTimeout(() => {
      this.scanAndSubmit().catch(err => {
        console.error('[Superteam] Initial scan error:', err.message);
      });
    }, 30000);

    this.scanInterval = setInterval(() => {
      this.scanAndSubmit().catch(err => {
        console.error('[Superteam] Scan error:', err.message);
      });
    }, intervalMs);

    console.log(`✅ Superteam listing scanner started (every ${Math.round(intervalMs / 60000)} minutes)`);
  }

  /**
   * Stop the listing scanner
   */
  stopScanner() {
    if (this.scanInterval) {
      clearInterval(this.scanInterval);
      this.scanInterval = null;
    }
  }

  // ==========================================
  // Full Autonomous Run
  // ==========================================

  /**
   * Run the full autonomous Superteam Earn agent lifecycle
   */
  async run() {
    console.log('');
    console.log('🏆 ═══════════════════════════════════════');
    console.log('   Xona Agent — Superteam Earn');
    console.log('═══════════════════════════════════════════');
    console.log('');

    // Step 1: Verify registration
    if (!this.apiKey) {
      console.error('❌ SUPERTEAM_API_KEY not set. Run `npm run register:superteam` first.');
      return;
    }

    // Step 2: Initial heartbeat
    this.reportHeartbeat();

    // Step 3: Quick listing check
    const data = await this.discoverListings({ take: 5 });
    if (data?.listings) {
      console.log(`📋 ${data.listings.length} agent-eligible listings available`);
    }

    // Step 4: Start autonomous scanner
    this.startScanner();

    console.log('');
    console.log('🏆 Superteam Earn agent is running!');
    console.log('   - Listing scanner: every 2 hours');
    console.log('   - Auto-submit to relevant bounties');
    console.log('   - Heartbeat endpoint: GET /superteam/heartbeat');
    console.log('');
  }
}

module.exports = { SuperteamEarnAgent };
