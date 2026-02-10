#!/usr/bin/env node
/**
 * Xona Agent — Colosseum Registration Script
 * 
 * Run: npm run register
 * 
 * This registers the agent with the Colosseum Agent Hackathon.
 * The API key is shown ONLY ONCE — save it immediately.
 */
require('dotenv').config();

const { ColosseumAgent } = require('../agent/colosseum');

async function main() {
  console.log('');
  console.log('🔑 Xona Agent — Colosseum Registration');
  console.log('═══════════════════════════════════════');
  console.log('');

  if (process.env.COLOSSEUM_API_KEY) {
    console.log('✅ Already registered! COLOSSEUM_API_KEY is set.');
    console.log('');
    console.log('To check status, run: npm start');
    process.exit(0);
  }

  const agent = new ColosseumAgent();

  try {
    const result = await agent.register();

    if (result.alreadyRegistered) {
      process.exit(0);
    }

    console.log('');
    console.log('📋 Next steps:');
    console.log('   1. Copy the API Key above');
    console.log('   2. Add to your .env file: COLOSSEUM_API_KEY=<your-key>');
    console.log('   3. Visit the Claim URL to link your account');
    console.log('   4. Run: npm start');
    console.log('');
  } catch (error) {
    console.error('');
    console.error('Registration failed. Check your network connection and try again.');
    process.exit(1);
  }
}

main();
