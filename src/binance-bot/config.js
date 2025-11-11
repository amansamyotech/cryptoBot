// config.js - UPDATED FOR TEMA 200
require("dotenv").config();

const config = {
  // ========== API CREDENTIALS ==========
  apiKey: "kKygBQ6HTqxhNscBEUbvoCmhy7kqNchUQZXkz4cvWRC7jahxxueUu6UYpWkQkVlE",
  secret: "ZvfoTcMpX0yqvc4E4NyH0psQkviJF5LROthqgihXPydAENl55L5MHnDQEYJiwRpX",

  // ========== TRADING PAIRS ==========
  symbols: ["DOGE/USDT", "SOL/USDT", "BNB/USDT", "XRP/USDT", "ADA/USDT"],

  // ========== TIMEFRAMES ==========
  timeframe: "5m",
  scanInterval: 60000,

  // ========== POSITION SIZING ==========
  leverage: 3,
  positionSizeUSDT: 20,

  // ========== RISK MANAGEMENT ==========
  riskRewardRatio: 1.5,
  maxDailyLoss: 0.05,
  trailingStopPercent: 0.015,
  maxLossPerTrade: -8,
  maxProfitPerTrade: 15,

  // ========== TECHNICAL INDICATORS ==========
  tema: {
    fast: 9,
    medium: 15,
    slow: 200, // ✅ TEMA 200
  },

  macd: {
    fast: 12,
    slow: 26,
    signal: 9,
  },

  adx: 14,
  atr: 14,
  volumeSma: 20,
  supportResistancePeriod: 20,

  // ========== SIGNAL THRESHOLDS ==========
  minSignalScore: 3,
  adxThreshold: 20,
  volumeMultiplier: 1.2,

  // ========== ORDER MANAGEMENT ==========
  orderCooldownMs: 45000,
  sttpCheckInterval: 120000,
  maxOrderRetries: 3,

  // ========== CANDLES REQUIRED ==========
  minCandlesRequired: 300, // ✅ Increased for TEMA 200
  candleFetchLimit: 1000, // ✅ 600 से बढ़ाकर 1000 करें
};

// Validation
if (!config.apiKey || !config.secret) {
  throw new Error(
    "❌ BINANCE_API_KEY and BINANCE_SECRET must be set in .env file"
  );
}

console.log("📋 Configuration Loaded:");
console.log(`   Pairs: ${config.symbols.length}`);
console.log(`   Timeframe: ${config.timeframe}`);
console.log(`   Leverage: ${config.leverage}x`);
console.log(`   Position Size: $${config.positionSizeUSDT}`);
console.log(
  `   TEMA Periods: ${config.tema.fast}/${config.tema.medium}/${config.tema.slow}`
);
console.log(`   Candles Fetch: ${config.candleFetchLimit} (for TEMA 200)`);

module.exports = config;
