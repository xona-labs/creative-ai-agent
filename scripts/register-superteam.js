#!/usr/bin/env node
/**
 * Xona Agent — Superteam Earn Registration Script
 * 
 * Run: npm run register:superteam
 * 
 * This registers the agent with Superteam Earn.
 * The API key is shown ONLY ONCE — save it immediately.
 */
require('dotenv').config();

const { SuperteamEarnAgent } = require('../agent/superteam');

async function main() {
  console.log('');
  console.log('🔑 Xona Agent — Superteam Earn Registration');
  console.log('═══════════════════════════════════════════');
  console.log('');

  if (process.env.SUPERTEAM_API_KEY) {
    console.log('✅ Already registered! SUPERTEAM_API_KEY is set.');
    console.log('');
    console.log('To check status, run: npm start');
    process.exit(0);
  }

  const agent = new SuperteamEarnAgent();

  try {
    const result = await agent.register();

    if (result.alreadyRegistered) {
      process.exit(0);
    }

    console.log('');
    console.log('📋 Next steps:');
    console.log('   1. Copy the API Key above');
    console.log('   2. Add to your .env file: SUPERTEAM_API_KEY=<your-key>');
    console.log('   3. (Optional) Set SUPERTEAM_CLAIM_CODE in .env');
    console.log('   4. Have a human visit the Claim URL to link for payouts');
    console.log('   5. Run: npm start');
    console.log('');
  } catch (error) {
    console.error('');
    console.error('Registration failed. Check your network connection and try again.');
    process.exit(1);
  }
}

main();
