/**
 * PumpFun Token Intelligence — Standalone for Xona Agent
 * Fetches trending/movers tokens from PumpFun + DexScreener enrichment + AI analysis
 */
const axios = require('axios');
const { callGrokChat, callGrokApi, buildTrendingSystemInstruction } = require('./grok');

const PUMPFUN_API = 'https://frontend-api-v3.pump.fun';
const DEXSCREENER_API = 'https://api.dexscreener.com/latest/dex/tokens';

const BROWSER_HEADERS = {
  'accept': '*/*',
  'accept-language': 'en-US,en;q=0.9',
  'cache-control': 'no-cache',
  'origin': 'https://pump.fun',
  'user-agent': 'Mozilla/5.0 (Macintosh; Intel Mac OS X 10_15_7) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/144.0.0.0 Safari/537.36'
};

/**
 * Format market cap to human-readable
 */
function formatMarketCap(value) {
  if (!value && value !== 0) return null;
  const mc = parseFloat(value);
  if (mc >= 1_000_000) return `$${(mc / 1_000_000).toFixed(2)}M`;
  if (mc >= 1_000) return `$${(mc / 1_000).toFixed(2)}K`;
  return `$${mc.toFixed(2)}`;
}

/**
 * Normalize PumpFun token data
 */
function normalizeToken(item) {
  const coin = item.coin || item;
  return {
    name: coin.name || null,
    ticker: coin.symbol || null,
    mc: formatMarketCap(coin.usd_market_cap),
    ca: coin.mint || null,
    social: {
      twitter: coin.twitter || null,
      website: coin.website || null
    }
  };
}

/**
 * Enrich token with DexScreener data (icon + price changes)
 */
async function enrichWithDexScreener(token) {
  if (!token.ca) return { ...token, icon: null, '5mpricechange': null, '1hpricechange': null, '6hpricechange': null, '24hpricechange': null };

  try {
    const res = await axios.get(`${DEXSCREENER_API}/${token.ca}`, {
      timeout: 10000,
      headers: { 'Accept': 'application/json' }
    });

    if (res.data?.pairs?.length > 0) {
      const pair = res.data.pairs[0];
      return {
        ...token,
        icon: pair.info?.imageUrl || null,
        '5mpricechange': pair.priceChange?.m5 ?? null,
        '1hpricechange': pair.priceChange?.h1 ?? null,
        '6hpricechange': pair.priceChange?.h6 ?? null,
        '24hpricechange': pair.priceChange?.h24 ?? null
      };
    }
  } catch (error) {
    console.warn(`[PumpFun] DexScreener error for ${token.ticker}:`, error.message);
  }

  return { ...token, icon: null, '5mpricechange': null, '1hpricechange': null, '6hpricechange': null, '24hpricechange': null };
}

/**
 * Describe token icon using Grok vision
 */
async function describeIcon(token) {
  if (!token.icon) return { ...token, icon_description: null };

  try {
    const response = await callGrokChat({
      messages: [
        {
          role: 'system',
          content: 'You are an image analysis assistant. Describe token logos concisely (1-2 sentences). Focus on colors, shapes, symbols, and style.'
        },
        {
          role: 'user',
          content: [
            { type: 'text', text: 'Describe this token logo:' },
            { type: 'image_url', image_url: { url: token.icon } }
          ]
        }
      ]
    });

    const desc = response?.choices?.[0]?.message?.content?.trim() || null;
    return { ...token, icon_description: desc };
  } catch (error) {
    console.warn(`[PumpFun] Icon description error for ${token.ticker}:`, error.message);
    return { ...token, icon_description: null };
  }
}

/**
 * Generate AI summary for the batch of tokens
 */
async function generateSummary(tokens, type = 'trending') {
  try {
    const tokenList = tokens.map(t =>
      `${t.ticker || t.name}: MC ${t.mc || 'N/A'}, 1h: ${t['1hpricechange'] || 'N/A'}%, 24h: ${t['24hpricechange'] || 'N/A'}%`
    ).join('\n');

    const response = await callGrokApi({
      message: `Analyze these ${type} PumpFun tokens and provide:
1. A brief summary of the dominant meta/theme (2-3 sentences)
2. Top 2-3 fresh suggestions for agents

Tokens:
${tokenList}

Return JSON: { "summary": "...", "suggestions": ["...", "..."] }`,
      systemInstruction: 'You are a Solana token analyst. Be concise and insightful. Return ONLY valid JSON.'
    });

    // Parse response
    let result = { summary: '', suggestions: [] };
    if (response.output && Array.isArray(response.output)) {
      for (const item of response.output) {
        if (item.type === 'message' && item.content) {
          for (const c of item.content) {
            if (c.type === 'output_text' && c.text) {
              try {
                const parsed = JSON.parse(c.text.trim());
                result = parsed;
              } catch {
                // Try to extract JSON
                const match = c.text.match(/\{[\s\S]*\}/);
                if (match) {
                  try { result = JSON.parse(match[0]); } catch {}
                }
              }
              break;
            }
          }
        }
      }
    }

    return result;
  } catch (error) {
    console.error('[PumpFun] Summary generation error:', error.message);
    return { summary: 'Unable to generate summary', suggestions: [] };
  }
}

/**
 * Get trending PumpFun tokens with full analysis
 */
async function getTrending(limit = 10) {
  console.log('[PumpFun] Fetching trending tokens...');

  const response = await axios.get(`${PUMPFUN_API}/coins/top-runners`, {
    headers: BROWSER_HEADERS
  });

  if (!response.data || !Array.isArray(response.data)) {
    throw new Error('Invalid PumpFun API response');
  }

  console.log(`[PumpFun] Got ${response.data.length} tokens`);

  // Normalize
  let tokens = response.data
    .slice(0, limit)
    .map(normalizeToken)
    .filter(t => t.ticker || t.ca);

  // Enrich with DexScreener
  tokens = await Promise.all(tokens.map(enrichWithDexScreener));

  // Add icon descriptions
  tokens = await Promise.all(tokens.map(describeIcon));

  // Generate AI summary
  const { summary, suggestions } = await generateSummary(tokens, 'trending');

  return {
    summary,
    suggestions,
    trending_tokens: tokens,
    count: tokens.length
  };
}

/**
 * Get PumpFun movers (biggest price changes)
 */
async function getMovers(limit = 10) {
  console.log('[PumpFun] Fetching movers...');

  const response = await axios.get(`${PUMPFUN_API}/coins/top-movers`, {
    headers: BROWSER_HEADERS
  });

  if (!response.data || !Array.isArray(response.data)) {
    throw new Error('Invalid PumpFun API response');
  }

  console.log(`[PumpFun] Got ${response.data.length} movers`);

  let tokens = response.data
    .slice(0, limit)
    .map(normalizeToken)
    .filter(t => t.ticker || t.ca);

  tokens = await Promise.all(tokens.map(enrichWithDexScreener));
  tokens = await Promise.all(tokens.map(describeIcon));

  const { summary, suggestions } = await generateSummary(tokens, 'movers');

  return {
    summary,
    suggestions,
    movers_tokens: tokens,
    count: tokens.length
  };
}

module.exports = {
  getTrending,
  getMovers
};
