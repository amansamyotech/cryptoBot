// config.js - COMPLETE CONFIGURATION WITH DUAL TEMA FILTER
require("dotenv").config({ path: "../.env" });

const config = {
  // ========== API CREDENTIALS ==========
  // apiKey: process.env.BINANCE_APIKEY,
  apiKey: "9JZjlcfPqSnQIk4rq6Fm1VSxKIl66g0MYoklFOaVeAWwlPZFrGpG21JuhVzu4KtK",
  secret: "qCrYHNPjRb8ZE6SL11R4AQNQswfoDET3Qwnv6lLXLffFd5wjd6vrgitoKiMRNOid",
  
  // ========== TRADING PAIRS ==========
  symbols: [
  'DOGE/USDT',
    'XRP/USDT'
    //'ADA/USDT'
  ],
  
  // ========== TIMEFRAMES ==========
  timeframe: '5m',              // Primary timeframe for trading
  timeframe15m: '15m',          // Secondary timeframe for TEMA 100
  scanInterval: 60000,          // 60 seconds
  
  // ========== POSITION SIZING ==========
  leverage: 3,
  positionSizeUSDT: 20,
  
  // ========== POSITION LIMITS (ONE POSITION PER TOKEN) ==========
  maxOpenPositions: 1,         // Max 1 position per token
  onePositionPerToken: true,   // Strict: ONE position per token only
  allowMultipleTokens: false,  // Don't allow multiple token positions simultaneously
  
  // ========== RISK MANAGEMENT ==========
  riskRewardRatio: 1.5,        // TP:SL ratio
  maxDailyLoss: 0.05,          // 5% daily loss limit
  trailingStopPercent: 0.015,  // 1.5% trailing stop
  maxLossPerTrade: -5,         // -5% max loss per trade
  maxProfitPerTrade: 8,        // 8% max profit per trade
  
  // ========== TECHNICAL INDICATORS ==========
  tema: {
    fast: 9,       // TEMA 9 (5m)
    medium: 15,    // TEMA 15 (5m)
    slow: 200,     // TEMA 200 (5m) - Primary trend filter
    tema100: 100   // TEMA 100 (15m) - Secondary trend filter
  },
  
  macd: {
    fast: 12,
    slow: 26, 
    signal: 9
  },
  
  adx: 14,                     // ADX period
  atr: 14,                     // ATR period for SL/TP
  volumeSma: 20,               // Volume SMA period
  supportResistancePeriod: 20, // S/R lookback period
  
  // ========== ATR-BASED SL/TP ==========
  ATR_LENGTH: 14,              // ATR calculation period
  
  // ========== SIGNAL THRESHOLDS ==========
  minSignalScore: 5,           // Minimum conditions (out of 8 with DMI)
  adxThreshold: 20,            // ADX strength threshold
  volumeMultiplier: 1.2,       // Volume confirmation (1.2x average)
  
  // ========== ORDER MANAGEMENT ==========
  orderCooldownMs: 45000,      // 45 seconds between orders
  sttpCheckInterval: 120000,   // 2 minutes SL/TP check interval
  maxOrderRetries: 3,          // Max order placement retries
  
  // ========== CANDLES REQUIRED ==========
  minCandlesRequired: 300,     // Minimum candles for TEMA 200 (5m)
  candleFetchLimit: 1000       // Fetch 1000 candles from exchange
};

// ========== VALIDATION ==========
if (!config.apiKey || !config.secret) {
  throw new Error('❌ BINANCE_API_KEY and BINANCE_SECRET must be set in .env file');
}

if (config.symbols.length === 0) {
  throw new Error('❌ At least one trading symbol must be configured');
}

// ========== DISPLAY CONFIGURATION ==========
console.log('📋 Configuration Loaded:');
console.log(`   Trading Pairs: ${config.symbols.length} (${config.symbols.join(', ')})`);
console.log(`   Primary Timeframe: ${config.timeframe} | Secondary: ${config.timeframe15m}`);
console.log(`   Leverage: ${config.leverage}x`);
console.log(`   Position Size: $${config.positionSizeUSDT}`);
console.log(`   TEMA Periods (5m): ${config.tema.fast}/${config.tema.medium}/${config.tema.slow}`);
console.log(`   TEMA 100 (15m): ${config.tema.tema100} - Secondary trend filter`);
console.log(`   Min Signal Score: ${config.minSignalScore}/8 (with DMI)`);
console.log(`   Candles Required: ${config.minCandlesRequired} (fetching ${config.candleFetchLimit})`);
console.log(`   🔒 Position Mode: ONE POSITION PER TOKEN ONLY`);
console.log(`   Risk/Reward: 1:${config.riskRewardRatio}`);
console.log(`   🎯 DUAL TEMA FILTER: 5m TEMA 200 + 15m TEMA 100`);

module.exports = config;