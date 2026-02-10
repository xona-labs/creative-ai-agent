/**
 * Xona Agent — Main Entry Point
 * 
 * Autonomous creative AI agent on Solana for the Colosseum Agent Hackathon.
 * 
 * What it does:
 * 1. Registers with Colosseum hackathon (heartbeat, project, forum intro)
 * 2. Starts Express API server (free image/video generation + PumpFun intelligence)
 * 3. Starts autonomous cron that posts to the Colosseum forum:
 *    - X News from 5 accounts (4x/day)
 *    - AI Image Showcase with rotating models (2x/day)
 *    - PumpFun trending/movers intel (2x/day)
 */
require('dotenv').config();

const { createServer } = require('./server');
const { ColosseumAgent } = require('./agent/colosseum');
const { startCron, stopCron } = require('./services/daily-news');

const PORT = process.env.PORT || 3002;

async function main() {
  console.log('');
  console.log('🤖 ═══════════════════════════════════════════════');
  console.log('   Xona Agent — Autonomous Creative AI on Solana');
  console.log('═══════════════════════════════════════════════════');
  console.log('');

  // ==========================================
  // 1. Initialize Colosseum Agent
  // ==========================================
  const colosseum = new ColosseumAgent();
  let agentReady = false;

  if (process.env.COLOSSEUM_API_KEY) {
    try {
      await colosseum.run();
      agentReady = true;
    } catch (error) {
      console.error('⚠️  Colosseum agent error:', error.message);
      console.log('   Agent will continue running with API server. Forum posting may be limited.');
    }
  } else {
    console.log('');
    console.log('ℹ️  COLOSSEUM_API_KEY not set. Run `npm run register` to register.');
    console.log('   The API server will start, but autonomous forum posting will be disabled.');
    console.log('   Test endpoints (preview) will still work.');
    console.log('');
  }

  // ==========================================
  // 2. Start Express API Server (pass agent for live triggers)
  // ==========================================
  const app = createServer(agentReady ? colosseum : null);

  const server = app.listen(PORT, () => {
    console.log(`🌐 API Server running on port ${PORT}`);
    console.log('');
    console.log('   Free Endpoints:');
    console.log(`   - POST http://localhost:${PORT}/generate-image`);
    console.log(`   - POST http://localhost:${PORT}/generate-video`);
    console.log(`   - GET  http://localhost:${PORT}/pumpfun/trending`);
    console.log(`   - GET  http://localhost:${PORT}/pumpfun/movers`);
    console.log(`   - GET  http://localhost:${PORT}/solana/trending-topics`);
    console.log(`   - GET  http://localhost:${PORT}/solana/trending-tokens`);
    console.log('');
    console.log('   Test Endpoints (preview, no forum posting):');
    console.log(`   - GET  http://localhost:${PORT}/test/x-news?account=solana`);
    console.log(`   - GET  http://localhost:${PORT}/test/image-showcase?model=nano-banana`);
    console.log(`   - GET  http://localhost:${PORT}/test/pumpfun?type=trending`);
    console.log('');
    console.log('   Live Triggers (posts to Colosseum forum):');
    console.log(`   - POST http://localhost:${PORT}/trigger/x-news`);
    console.log(`   - POST http://localhost:${PORT}/trigger/image-showcase`);
    console.log(`   - POST http://localhost:${PORT}/trigger/pumpfun`);
    console.log('');
  });

  // ==========================================
  // 3. Start Autonomous Forum Posting Cron
  // ==========================================
  try {
    if (agentReady && process.env.XAI_API_KEY) {
      startCron(colosseum);
    } else if (!agentReady) {
      console.log('⏭️  Autonomous forum posting skipped (COLOSSEUM_API_KEY not set)');
      console.log('   Preview endpoints still available: GET /test/x-news, /test/image-showcase, /test/pumpfun');
    } else if (!process.env.XAI_API_KEY) {
      console.log('⏭️  Autonomous forum posting skipped (XAI_API_KEY not set)');
    }
  } catch (error) {
    console.error('⚠️  Autonomous cron failed to start:', error.message);
  }

  // ==========================================
  // Graceful Shutdown
  // ==========================================
  const shutdown = () => {
    console.log('\n🛑 Shutting down Xona Agent...');
    colosseum.stopHeartbeat();
    stopCron();
    server.close(() => {
      console.log('👋 Goodbye!');
      process.exit(0);
    });
    setTimeout(() => process.exit(1), 5000);
  };

  process.on('SIGINT', shutdown);
  process.on('SIGTERM', shutdown);
}

main().catch(err => {
  console.error('❌ Fatal error:', err);
  process.exit(1);
});
