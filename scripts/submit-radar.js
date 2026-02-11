#!/usr/bin/env node
/**
 * Xona Agent — Submit XONA Radar to Superteam Earn Bounty
 * 
 * Listing: Solana Radar Agent
 * ID: fd499139-21a9-443d-a0fc-cb418f646f0d
 * 
 * Run: npm run submit:radar
 * 
 * Preview only (dry run): npm run submit:radar -- --dry-run
 */
require('dotenv').config();

const { SuperteamEarnAgent } = require('../agent/superteam');

const LISTING_ID = 'fd499139-21a9-443d-a0fc-cb418f646f0d';

const SUBMISSION_LINK = 'https://github.com/xona-labs/solana-radar-agent';

const SUBMISSION_INFO = `
XONA Radar — Solana Narrative Intelligence Agent

An autonomous AI agent that detects emerging narratives and early signals within the Solana ecosystem by analyzing on-chain, social, developer, and research data — then generates concrete product ideas for each narrative.

━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━

HOW IT WORKS

1. Signal Collection (4 data layers)
   • Social — Monitors 10+ Solana KOLs and trending topics on X via Grok x_search
   • On-Chain — Tracks program activity via Solana RPC, PumpFun trending tokens, DexScreener boosted/new profiles
   • Developer — Scans GitHub for new Solana repos, Anchor projects, and category-specific activity
   • Research — Aggregates insights from crypto research accounts and official Solana sources

2. AI-Powered Analysis
   • Normalizes & deduplicates signals across all sources
   • Clusters signals into coherent narratives using Grok AI
   • Scores each narrative on: cross-source strength (30pts), evidence quality (25pts), velocity (20pts), stage (15pts), AI confidence (10pts), signal count (10pts) = 110 max
   • Ranks narratives by composite score

3. Build Idea Generation
   • For each detected narrative, generates 3-5 concrete Solana product ideas
   • Each idea includes: name, one-liner, description, technical approach, why Solana, target users, difficulty, and monetization strategy

━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━

KEY FEATURES

• Fully autonomous — runs on a cron schedule (daily signals, fortnightly analysis)
• Dashboard UI — black minimalist interface with search, sort, color-coded scores, and live agent status
• API endpoints — GET /api/narratives, /api/signals, /api/stats, POST /api/full-run
• Docker-ready — docker-compose.yml with persistent data volume
• Zero-dependency persistence — JSON file snapshots, no database required
• Works with any Solana RPC — not locked to any specific provider

━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━

TECH STACK

• AI Engine: xAI Grok (x_search + chat completions)
• On-Chain: Solana RPC, PumpFun API, DexScreener API
• Developer Data: GitHub Search API
• Runtime: Node.js + Express
• Scheduling: node-cron
• Frontend: Single-page dashboard (vanilla HTML/CSS/JS)

━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━

Built by Xona Labs — https://xona-agent.com
`.trim();

async function main() {
  const isDryRun = process.argv.includes('--dry-run');

  console.log('');
  console.log('🚀 ═══════════════════════════════════════════');
  console.log('   XONA Radar — Superteam Earn Submission');
  console.log('═══════════════════════════════════════════════');
  console.log('');

  if (!process.env.SUPERTEAM_API_KEY) {
    console.error('❌ SUPERTEAM_API_KEY not set in .env');
    console.error('   Run `npm run register:superteam` first.');
    process.exit(1);
  }

  console.log(`   Listing ID:  ${LISTING_ID}`);
  console.log(`   Link:        ${SUBMISSION_LINK}`);
  console.log(`   Telegram:    ${process.env.SUPERTEAM_TELEGRAM || '(not set)'}`);
  console.log('');
  console.log('   Submission preview:');
  console.log('   ─────────────────────────────────────────');
  SUBMISSION_INFO.split('\n').forEach(line => {
    console.log(`   ${line}`);
  });
  console.log('   ─────────────────────────────────────────');
  console.log('');

  if (isDryRun) {
    console.log('📋 Dry run — no submission sent.');
    console.log('   Remove --dry-run flag to submit for real.');
    process.exit(0);
  }

  const agent = new SuperteamEarnAgent();

  try {
    console.log('📤 Submitting...');
    console.log('');

    const result = await agent.submitWork({
      listingId: LISTING_ID,
      link: SUBMISSION_LINK,
      otherInfo: SUBMISSION_INFO,
      tweet: 'https://x.com/xona_agent/status/2021603939242950914',
      eligibilityAnswers: [],
      ask: null,
      telegram: process.env.SUPERTEAM_TELEGRAM || undefined,
    });

    if (result) {
      console.log('✅ ═══════════════════════════════════════════');
      console.log('   Submission successful!');
      console.log('═══════════════════════════════════════════════');
      console.log('');
      if (result.id) console.log(`   Submission ID: ${result.id}`);
      if (result.url) console.log(`   View at: ${result.url}`);
      console.log('');
      console.log('   You can update this submission later with:');
      console.log('   POST /superteam/submit (via the API server)');
      console.log('');
    } else {
      console.error('❌ Submission returned no data — check logs above for errors.');
      process.exit(1);
    }
  } catch (err) {
    console.error('');
    console.error('❌ Submission failed:', err.message);
    process.exit(1);
  }
}

main();
