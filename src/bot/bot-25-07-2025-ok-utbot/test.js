// // 📦 Dependencies
// const Binance = require("node-binance-api");
// const technicalIndicators = require("technicalindicators");
// const axios = require("axios");
// const { sendTelegram } = require("../../helper/teleMassage.js");

// const API_ENDPOINT = "http://localhost:3000/api/buySell/";

// // 📈 Indicator Settings
// const RSI_PERIOD = 14;
// const MACD_FAST = 12;
// const MACD_SLOW = 26;
// const MACD_SIGNAL = 9;
// const BB_PERIOD = 20;
// const BB_STD_DEV = 2;
// const EMA_FAST = 9;
// const EMA_SLOW = 15;
// const EMA_TREND_SHORT = 20;
// const EMA_TREND_LONG = 50;
// const ADX_PERIOD = 14;
// const VWMA_PERIOD = 20;

// // 📊 Scoring Thresholds
// const LONG_THRESHOLD = 3;
// const SHORT_THRESHOLD = -3;

// // ⚙️ Utility Functions
// function calculateIndicators(data) {
//   const closes = data.map(c => c.close);
//   const highs = data.map(c => c.high);
//   const lows = data.map(c => c.low);
//   const volumes = data.map(c => c.volume);

//   return {
//     rsi: technicalIndicators.RSI.calculate({ period: RSI_PERIOD, values: closes }),
//     macd: technicalIndicators.MACD.calculate({ values: closes, fastPeriod: MACD_FAST, slowPeriod: MACD_SLOW, signalPeriod: MACD_SIGNAL, SimpleMAOscillator: false, SimpleMASignal: false }),
//     bb: technicalIndicators.BollingerBands.calculate({ period: BB_PERIOD, stdDev: BB_STD_DEV, values: closes }),
//     emaFast: technicalIndicators.EMA.calculate({ period: EMA_FAST, values: closes }),
//     emaSlow: technicalIndicators.EMA.calculate({ period: EMA_SLOW, values: closes }),
//     emaTrendShort: technicalIndicators.EMA.calculate({ period: EMA_TREND_SHORT, values: closes }),
//     emaTrendLong: technicalIndicators.EMA.calculate({ period: EMA_TREND_LONG, values: closes }),
//     adx: technicalIndicators.ADX.calculate({ close: closes, high: highs, low: lows, period: ADX_PERIOD }),
//     vwma: technicalIndicators.VWMA.calculate({ period: VWMA_PERIOD, close: closes, volume: volumes })
//   };
// }

// function getMarketCondition(indicators) {
//   const latestRSI = indicators.rsi[indicators.rsi.length - 1];
//   const latestADX = indicators.adx[indicators.adx.length - 1]?.adx;
//   if (!latestRSI || !latestADX) return 'unknown';
//   if (latestADX < 20 || latestRSI > 70 || latestRSI < 30) return 'sideways';
//   return 'trending';
// }

// function determineTradeSignal(indicators) {
//   let score = 0;
//   const latestRSI = indicators.rsi[indicators.rsi.length - 1];
//   const latestMACD = indicators.macd[indicators.macd.length - 1];
//   const latestBB = indicators.bb[indicators.bb.length - 1];
//   const latestClose = indicators.bb[0].value;
//   const emaFast = indicators.emaFast[indicators.emaFast.length - 1];
//   const emaSlow = indicators.emaSlow[indicators.emaSlow.length - 1];
//   const emaShort = indicators.emaTrendShort[indicators.emaTrendShort.length - 1];
//   const emaLong = indicators.emaTrendLong[indicators.emaTrendLong.length - 1];
//   const vwma = indicators.vwma[indicators.vwma.length - 1];

//   if (latestRSI > 50) score++;
//   else if (latestRSI < 50) score--;

//   if (latestMACD.MACD > latestMACD.signal) score++;
//   else score--;

//   if (latestClose < latestBB.lower) score++;
//   else if (latestClose > latestBB.upper) score--;

//   if (emaFast > emaSlow) score++;
//   else score--;

//   if (emaShort > emaLong) score++;
//   else score--;

//   if (latestClose > vwma) score++;
//   else score--;

//   if (score >= LONG_THRESHOLD) return 'LONG';
//   else if (score <= SHORT_THRESHOLD) return 'SHORT';
//   else return 'HOLD';
// }

// function shouldExitTrade(trade, currentPrice, recentCandles) {
//   const entryPrice = trade.entryPrice;
//   const type = trade.type;
//   let roi = ((currentPrice - entryPrice) / entryPrice) * 100;
//   if (type === "SHORT") roi *= -1;

//   if (roi >= 2) {
//     const redCandles = recentCandles.slice(-2).filter(c => c.close < c.open).length;
//     if (redCandles >= 2) return true; // Exit on trailing TP
//     return false; // Hold while in profit
//   }

//   let loss = ((entryPrice - currentPrice) / entryPrice) * 100;
//   if ((type === "LONG" && loss >= 1) || (type === "SHORT" && -loss >= 1)) return true;

//   return false; // No exit yet
// }

// // 📩 Execute Trade (Example Call)
// async function executeTrade(symbol, signal) {
//   try {
//     const response = await axios.post(API_ENDPOINT, { symbol, signal });
//     sendTelegram(🟢 Trade Executed: ${signal} on ${symbol});
//   } catch (error) {
//     sendTelegram(🔴 Trade Error: ${error.message});
//   }
// }

// // 🧠 Final Bot Loop & Checks (To Be Implemented)
// // Use above functions in your bot loop to fetch data, calculate indicators, determine signal, and act accordingly.