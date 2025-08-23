const axios = require("axios");

const CONFIG = {
  TIMEFRAME_MAIN: "3m",
  TIMEFRAME_TREND: "15m",
  TEMA_PERIOD: 25,
  RSI_PERIOD: 14,
  BB_PERIOD: 20,
  ADX_PERIOD: 14,
  ATR_PERIOD: 14,

  // Signal Detection Parameters
  BASE_ANGLE_THRESHOLD: 25, // Lowered from 40 for more signals
  VOLUME_MULTIPLIER: 1.25, // Volume must be 25% above average
  MIN_RR_RATIO: 2.0, // Minimum 1:2 risk-reward
  TARGET_ROI: 0.05, // 5% target
  MAX_RISK_PER_TRADE: 0.02, // 2% max risk per trade

  // Market State Parameters
  SIDEWAYS_THRESHOLD: 0.8,
  ADX_TREND_THRESHOLD: 25,
  RSI_OVERSOLD: 30,
  RSI_OVERBOUGHT: 70,

  // Confirmation Parameters
  CANDLE_LOOKBACK: 20,
  PATTERN_CONFIRMATION: 3,
};

// Utility function for safe API calls with retry logic
async function safeApiCall(apiFunction, maxRetries = 3) {
  for (let attempt = 1; attempt <= maxRetries; attempt++) {
    try {
      return await apiFunction();
    } catch (error) {
      console.error(
        `❌ API call failed (attempt ${attempt}/${maxRetries}):`,
        error.message
      );
      if (attempt === maxRetries) throw error;
      await new Promise((resolve) => setTimeout(resolve, 1000 * attempt)); // Exponential backoff
    }
  }
}

// Enhanced candle fetching with error handling
async function getCandles(symbol, interval, limit = 1000) {
  return safeApiCall(async () => {
    const res = await axios.get(
      `https://fapi.binance.com/fapi/v1/klines?symbol=${symbol}&interval=${interval}&limit=${limit}`
    );

    if (!res.data || !Array.isArray(res.data) || res.data.length === 0) {
      throw new Error(`Invalid response for ${symbol}-${interval}`);
    }

    return res.data
      .map((c) => ({
        openTime: c[0],
        open: parseFloat(c[1]),
        high: parseFloat(c[2]),
        low: parseFloat(c[3]),
        close: parseFloat(c[4]),
        volume: parseFloat(c[5]),
        closeTime: c[6],
        quoteVolume: parseFloat(c[7]),
        trades: parseInt(c[8]),
      }))
      .filter((c) => !isNaN(c.close) && c.volume > 0);
  });
}

// Enhanced EMA calculation
function calculateEMA(prices, period) {
  if (prices.length < period) return [];

  const k = 2 / (period + 1);
  let ema = prices[0];
  const emaArray = [ema];

  for (let i = 1; i < prices.length; i++) {
    ema = prices[i] * k + ema * (1 - k);
    emaArray.push(ema);
  }

  return emaArray;
}

// Enhanced TEMA calculation with validation
function calculateTEMA(prices, period) {
  if (prices.length < period * 3) return [];

  const k = 2 / (period + 1);

  // First EMA
  let ema1 = [prices[0]];
  for (let i = 1; i < prices.length; i++) {
    ema1.push(prices[i] * k + ema1[i - 1] * (1 - k));
  }

  // Second EMA
  let ema2 = [ema1[0]];
  for (let i = 1; i < ema1.length; i++) {
    ema2.push(ema1[i] * k + ema2[i - 1] * (1 - k));
  }

  // Third EMA
  let ema3 = [ema2[0]];
  for (let i = 1; i < ema2.length; i++) {
    ema3.push(ema2[i] * k + ema3[i - 1] * (1 - k));
  }

  // TEMA calculation
  const tema = [];
  for (let i = 0; i < prices.length; i++) {
    if (i < ema3.length) {
      tema.push(3 * ema1[i] - 3 * ema2[i] + ema3[i]);
    }
  }

  return tema;
}

// Enhanced RSI calculation
function calculateRSI(prices, period = 14) {
  if (prices.length < period + 1) return [];

  const gains = [];
  const losses = [];

  for (let i = 1; i < prices.length; i++) {
    const diff = prices[i] - prices[i - 1];
    gains.push(diff > 0 ? diff : 0);
    losses.push(diff < 0 ? -diff : 0);
  }

  if (gains.length < period) return [];

  let avgGain = gains.slice(0, period).reduce((a, b) => a + b) / period;
  let avgLoss = losses.slice(0, period).reduce((a, b) => a + b) / period;

  const rsi = [];
  rsi.push(100 - 100 / (1 + avgGain / (avgLoss || 0.0001)));

  for (let i = period; i < gains.length; i++) {
    avgGain = (avgGain * (period - 1) + gains[i]) / period;
    avgLoss = (avgLoss * (period - 1) + losses[i]) / period;
    rsi.push(100 - 100 / (1 + avgGain / (avgLoss || 0.0001)));
  }

  return rsi;
}

// ATR calculation for dynamic stop losses
function calculateATR(candles, period = 14) {
  if (candles.length < period + 1) return [];

  const trueRanges = [];

  for (let i = 1; i < candles.length; i++) {
    const high = candles[i].high;
    const low = candles[i].low;
    const prevClose = candles[i - 1].close;

    const tr = Math.max(
      high - low,
      Math.abs(high - prevClose),
      Math.abs(low - prevClose)
    );

    trueRanges.push(tr);
  }

  const atr = [];
  let sum = trueRanges.slice(0, period).reduce((a, b) => a + b);
  atr.push(sum / period);

  for (let i = period; i < trueRanges.length; i++) {
    const currentATR =
      (atr[atr.length - 1] * (period - 1) + trueRanges[i]) / period;
    atr.push(currentATR);
  }

  return atr;
}

// Bollinger Bands calculation
function calculateBollingerBands(prices, period = 20, stdDev = 2) {
  if (prices.length < period) return { sma: [], upperBand: [], lowerBand: [] };

  const sma = [];
  const upperBand = [];
  const lowerBand = [];

  for (let i = period - 1; i < prices.length; i++) {
    const slice = prices.slice(i - period + 1, i + 1);
    const mean = slice.reduce((sum, p) => sum + p, 0) / period;
    sma.push(mean);

    const variance =
      slice.reduce((sum, p) => sum + Math.pow(p - mean, 2), 0) / period;
    const standardDeviation = Math.sqrt(variance);

    upperBand.push(mean + stdDev * standardDeviation);
    lowerBand.push(mean - stdDev * standardDeviation);
  }

  return { sma, upperBand, lowerBand };
}

// Enhanced ADX calculation
function calculateADX(candles, period = 14) {
  if (candles.length < period + 2) return [];

  const plusDM = [];
  const minusDM = [];
  const tr = [];

  for (let i = 1; i < candles.length; i++) {
    const high = candles[i].high;
    const low = candles[i].low;
    const prevHigh = candles[i - 1].high;
    const prevLow = candles[i - 1].low;
    const prevClose = candles[i - 1].close;

    const upMove = high - prevHigh;
    const downMove = prevLow - low;

    plusDM.push(upMove > downMove && upMove > 0 ? upMove : 0);
    minusDM.push(downMove > upMove && downMove > 0 ? downMove : 0);

    const trValue = Math.max(
      high - low,
      Math.abs(high - prevClose),
      Math.abs(low - prevClose)
    );
    tr.push(trValue);
  }

  if (plusDM.length < period) return [];

  // Smooth the values using Wilder's smoothing
  const smoothedPlusDM = [];
  const smoothedMinusDM = [];
  const smoothedTR = [];

  // Initial smoothed values
  let sumPlusDM = plusDM.slice(0, period).reduce((a, b) => a + b);
  let sumMinusDM = minusDM.slice(0, period).reduce((a, b) => a + b);
  let sumTR = tr.slice(0, period).reduce((a, b) => a + b);

  smoothedPlusDM.push(sumPlusDM);
  smoothedMinusDM.push(sumMinusDM);
  smoothedTR.push(sumTR);

  for (let i = period; i < plusDM.length; i++) {
    smoothedPlusDM.push(
      smoothedPlusDM[smoothedPlusDM.length - 1] -
        smoothedPlusDM[smoothedPlusDM.length - 1] / period +
        plusDM[i]
    );
    smoothedMinusDM.push(
      smoothedMinusDM[smoothedMinusDM.length - 1] -
        smoothedMinusDM[smoothedMinusDM.length - 1] / period +
        minusDM[i]
    );
    smoothedTR.push(
      smoothedTR[smoothedTR.length - 1] -
        smoothedTR[smoothedTR.length - 1] / period +
        tr[i]
    );
  }

  // Calculate DI+ and DI-
  const plusDI = smoothedPlusDM.map((dm, i) => (dm / smoothedTR[i]) * 100);
  const minusDI = smoothedMinusDM.map((dm, i) => (dm / smoothedTR[i]) * 100);

  // Calculate DX
  const dx = plusDI.map((pdi, i) => {
    const sum = pdi + minusDI[i];
    return sum === 0 ? 0 : (Math.abs(pdi - minusDI[i]) / sum) * 100;
  });

  // Calculate ADX
  if (dx.length < period) return [];

  const adx = [];
  let sumDX = dx.slice(0, period).reduce((a, b) => a + b);
  adx.push(sumDX / period);

  for (let i = period; i < dx.length; i++) {
    adx.push((adx[adx.length - 1] * (period - 1) + dx[i]) / period);
  }

  return adx;
}

// Enhanced volatility calculation
function calculateVolatility(prices, period = 20) {
  if (prices.length < period) return 0;

  const returns = [];
  for (let i = 1; i < prices.length; i++) {
    returns.push((prices[i] - prices[i - 1]) / prices[i - 1]);
  }

  const mean = returns.reduce((a, b) => a + b) / returns.length;
  const variance =
    returns.reduce((sum, r) => sum + Math.pow(r - mean, 2), 0) / returns.length;

  return Math.sqrt(variance) * Math.sqrt(252); // Annualized volatility
}

// Volume confirmation
function hasVolumeConfirmation(candles, lookback = 10) {
  if (candles.length < lookback + 1) return false;

  const recentVolumes = candles.slice(-lookback - 1, -1).map((c) => c.volume);
  const avgVolume =
    recentVolumes.reduce((a, b) => a + b) / recentVolumes.length;
  const currentVolume = candles[candles.length - 1].volume;

  return currentVolume > avgVolume * CONFIG.VOLUME_MULTIPLIER;
}

// Enhanced sideways market detection
function isSidewaysMarket(
  candles,
  lookbackPeriod = 30,
  thresholdPercent = 0.8
) {
  if (candles.length < lookbackPeriod) return false;

  const recent = candles.slice(-lookbackPeriod);
  const closePrices = recent.map((c) => c.close);
  const highs = recent.map((c) => c.high);
  const lows = recent.map((c) => c.low);
  const currentPrice = recent[recent.length - 1].close;

  // Price range analysis
  const priceRange =
    ((Math.max(...highs) - Math.min(...lows)) / currentPrice) * 100;

  // ADX check for trend strength
  const adx = calculateADX(recent, 14);
  const currentADX = adx.length > 0 ? adx[adx.length - 1] : 0;

  // Bollinger Bands width
  const bb = calculateBollingerBands(closePrices, 20);
  if (bb.upperBand.length === 0) return false;

  const bbWidth =
    ((bb.upperBand[bb.upperBand.length - 1] -
      bb.lowerBand[bb.lowerBand.length - 1]) /
      currentPrice) *
    100;

  return (
    priceRange <= thresholdPercent &&
    currentADX < CONFIG.ADX_TREND_THRESHOLD &&
    bbWidth <= 1.0
  );
}

// Enhanced TEMA angle calculation with multiple confirmations
function getTEMA25AngleEnhanced(tema25Array, lookbackPeriods = 3) {
  if (tema25Array.length < lookbackPeriods + 5)
    return { final: 0, strength: "WEAK" };

  const len = tema25Array.length;

  // Short-term angle (2-3 periods)
  const shortTerm = calculateAngle(tema25Array, 2);
  const mediumTerm = calculateAngle(tema25Array, 4);

  // Linear regression approach for smoothness
  const recentData = tema25Array.slice(-6, -1);
  const regressionAngle = calculateLinearRegressionAngle(recentData);

  // Weighted final angle
  const finalAngle = shortTerm * 0.5 + mediumTerm * 0.3 + regressionAngle * 0.2;

  // Determine signal strength
  let strength = "WEAK";
  if (Math.abs(finalAngle) > 50) strength = "VERY_STRONG";
  else if (Math.abs(finalAngle) > 35) strength = "STRONG";
  else if (Math.abs(finalAngle) > 20) strength = "MODERATE";

  return {
    shortTerm,
    mediumTerm,
    regression: regressionAngle,
    final: finalAngle,
    strength,
  };
}

// Helper function for angle calculation
function calculateAngle(array, periods) {
  const len = array.length;
  if (len < periods + 2) return 0;

  const current = array[len - 2];
  const previous = array[len - 2 - periods];

  const percentChange = ((current - previous) / previous) * 100;
  const timeSpan = periods * 3; // 3-minute intervals

  const normalizedSlope = percentChange / Math.sqrt(timeSpan);
  const angle = Math.atan(normalizedSlope) * (180 / Math.PI) * 15;

  return angle;
}

// Linear regression angle calculation
function calculateLinearRegressionAngle(data) {
  if (data.length < 3) return 0;

  const n = data.length;
  const sumX = (n * (n - 1)) / 2;
  const sumY = data.reduce((sum, val) => sum + val, 0);
  const sumXY = data.reduce((sum, val, i) => sum + i * val, 0);
  const sumX2 = (n * (n - 1) * (2 * n - 1)) / 6;

  const slope = (n * sumXY - sumX * sumY) / (n * sumX2 - sumX * sumX);
  const avgPrice = sumY / n;
  const slopePercent = (slope / avgPrice) * 100;

  return Math.atan(slopePercent) * (180 / Math.PI) * 20;
}

// Multi-timeframe bias confirmation
async function getHigherTimeframeBias(symbol) {
  try {
    const candles15m = await getCandles(symbol, CONFIG.TIMEFRAME_TREND, 60);
    if (candles15m.length < 30) return "NEUTRAL";

    const closes15m = candles15m.map((c) => c.close);
    const tema25_15m = calculateTEMA(closes15m, 25);

    if (tema25_15m.length < 5) return "NEUTRAL";

    const angle15m = getTEMA25AngleEnhanced(tema25_15m);

    if (angle15m.final > 20) return "BULLISH";
    if (angle15m.final < -20) return "BEARISH";
    return "NEUTRAL";
  } catch (error) {
    console.error(
      `❌ Error getting higher timeframe bias for ${symbol}:`,
      error.message
    );
    return "NEUTRAL";
  }
}

// Risk-reward calculation for 5% ROI target
function calculateRiskReward(candles, direction, atr) {
  if (candles.length === 0 || !atr || atr.length === 0) return { valid: false };

  const currentPrice = candles[candles.length - 1].close;
  const currentATR = atr[atr.length - 1];

  // Dynamic stop loss based on ATR
  const stopLossMultiplier = 1.5;
  const stopLoss =
    direction === "LONG"
      ? currentPrice - currentATR * stopLossMultiplier
      : currentPrice + currentATR * stopLossMultiplier;

  // 5% target
  const takeProfit =
    direction === "LONG"
      ? currentPrice * (1 + CONFIG.TARGET_ROI)
      : currentPrice * (1 - CONFIG.TARGET_ROI);

  const risk = Math.abs(currentPrice - stopLoss) / currentPrice;
  const reward = Math.abs(takeProfit - currentPrice) / currentPrice;
  const rrRatio = reward / risk;

  return {
    valid: rrRatio >= CONFIG.MIN_RR_RATIO && risk <= CONFIG.MAX_RISK_PER_TRADE,
    entry: currentPrice,
    stopLoss,
    takeProfit,
    risk: risk * 100,
    reward: reward * 100,
    rrRatio,
  };
}

// Pattern recognition for reversal signals
function detectReversalPattern(candles, direction) {
  if (candles.length < 5) return false;

  const recent = candles.slice(-5);

  if (direction === "LONG") {
    // Look for bullish reversal patterns
    // Hammer, Doji at support, higher lows
    const lastCandle = recent[recent.length - 1];
    const bodySize = Math.abs(lastCandle.close - lastCandle.open);
    const totalRange = lastCandle.high - lastCandle.low;
    const lowerShadow =
      Math.min(lastCandle.open, lastCandle.close) - lastCandle.low;

    // Hammer pattern
    if (lowerShadow > bodySize * 2 && bodySize < totalRange * 0.3) {
      return true;
    }

    // Higher lows pattern
    const lows = recent.map((c) => c.low);
    let higherLows = 0;
    for (let i = 1; i < lows.length; i++) {
      if (lows[i] > lows[i - 1]) higherLows++;
    }
    if (higherLows >= 2) return true;
  } else if (direction === "SHORT") {
    // Look for bearish reversal patterns
    const lastCandle = recent[recent.length - 1];
    const bodySize = Math.abs(lastCandle.close - lastCandle.open);
    const totalRange = lastCandle.high - lastCandle.low;
    const upperShadow =
      lastCandle.high - Math.max(lastCandle.open, lastCandle.close);

    // Shooting star pattern
    if (upperShadow > bodySize * 2 && bodySize < totalRange * 0.3) {
      return true;
    }

    // Lower highs pattern
    const highs = recent.map((c) => c.high);
    let lowerHighs = 0;
    for (let i = 1; i < highs.length; i++) {
      if (highs[i] < highs[i - 1]) lowerHighs++;
    }
    if (lowerHighs >= 2) return true;
  }

  return false;
}

// Main enhanced trading decision function
async function decideTradeDirectionEnhanced(symbol) {
  try {
    console.log(`\n🔍 Analyzing ${symbol}...`);

    // Get candle data
    const candles3m = await getCandles(symbol, CONFIG.TIMEFRAME_MAIN, 100);
    if (candles3m.length < 50) {
      console.log(`❌ Insufficient data for ${symbol}`);
      return { decision: "HOLD", reason: "Insufficient data" };
    }

    // Check for sideways market
    if (isSidewaysMarket(candles3m)) {
      console.log(`⚖️ ${symbol} is in sideways market`);
      return { decision: "HOLD", reason: "Sideways market" };
    }

    // Calculate indicators
    const closePrices = candles3m.map((c) => c.close);
    const tema25 = calculateTEMA(closePrices, CONFIG.TEMA_PERIOD);
    const rsi = calculateRSI(closePrices, CONFIG.RSI_PERIOD);
    const atr = calculateATR(candles3m, CONFIG.ATR_PERIOD);
    const adx = calculateADX(candles3m, CONFIG.ADX_PERIOD);

    if (tema25.length < 10 || rsi.length < 5 || atr.length < 5) {
      return { decision: "HOLD", reason: "Insufficient indicator data" };
    }

    // Calculate dynamic thresholds based on volatility
    const volatility = calculateVolatility(closePrices.slice(-20));
    const dynamicThreshold = CONFIG.BASE_ANGLE_THRESHOLD + volatility * 100;

    // Get TEMA angle analysis
    const angleData = getTEMA25AngleEnhanced(tema25);
    const currentRSI = rsi[rsi.length - 1];
    const currentADX = adx[adx.length - 1];

    // Volume confirmation
    const hasVolume = hasVolumeConfirmation(candles3m);

    // Higher timeframe bias
    const htfBias = await getHigherTimeframeBias(symbol);

    // Log analysis
    console.log(`📊 Technical Analysis for ${symbol}:`);
    console.log(
      `   💫 TEMA Angle: ${angleData.final.toFixed(2)}° (${angleData.strength})`
    );
    console.log(`   📈 RSI: ${currentRSI.toFixed(2)}`);
    console.log(`   💪 ADX: ${currentADX.toFixed(2)}`);
    console.log(`   📊 Volume Confirmation: ${hasVolume ? "✅" : "❌"}`);
    console.log(`   ⏰ HTF Bias: ${htfBias}`);
    console.log(`   🎯 Dynamic Threshold: ±${dynamicThreshold.toFixed(2)}°`);

    // Signal detection logic
    let signal = null;
    let reason = "";

    // Long signal conditions
    if (
      angleData.final >= dynamicThreshold &&
      currentRSI < 70 &&
      currentADX > 20 &&
      (htfBias === "BULLISH" || htfBias === "NEUTRAL")
    ) {
      const rrData = calculateRiskReward(candles3m, "LONG", atr);
      const hasPattern = detectReversalPattern(candles3m, "LONG");

      if (rrData.valid && hasVolume) {
        signal = "LONG";
        reason = `Strong bullish angle (${angleData.final.toFixed(
          2
        )}°), Good R:R (${rrData.rrRatio.toFixed(2)}:1)`;

        console.log(`🟢 LONG Signal Detected!`);
        console.log(`   💰 Entry: ${rrData.entry.toFixed(6)}`);
        console.log(`   🛑 Stop Loss: ${rrData.stopLoss.toFixed(6)}`);
        console.log(`   🎯 Take Profit: ${rrData.takeProfit.toFixed(6)}`);
        console.log(`   ⚖️ Risk/Reward: ${rrData.rrRatio.toFixed(2)}:1`);
        console.log(`   🔄 Pattern Confirmation: ${hasPattern ? "✅" : "❌"}`);
      }
    }

    // Short signal conditions
    else if (
      angleData.final <= -dynamicThreshold &&
      currentRSI > 30 &&
      currentADX > 20 &&
      (htfBias === "BEARISH" || htfBias === "NEUTRAL")
    ) {
      const rrData = calculateRiskReward(candles3m, "SHORT", atr);
      const hasPattern = detectReversalPattern(candles3m, "SHORT");

      if (rrData.valid && hasVolume) {
        signal = "SHORT";
        reason = `Strong bearish angle (${angleData.final.toFixed(
          2
        )}°), Good R:R (${rrData.rrRatio.toFixed(2)}:1)`;

        console.log(`🔴 SHORT Signal Detected!`);
        console.log(`   💰 Entry: ${rrData.entry.toFixed(6)}`);
        console.log(`   🛑 Stop Loss: ${rrData.stopLoss.toFixed(6)}`);
        console.log(`   🎯 Take Profit: ${rrData.takeProfit.toFixed(6)}`);
        console.log(`   ⚖️ Risk/Reward: ${rrData.rrRatio.toFixed(2)}:1`);
        console.log(`   🔄 Pattern Confirmation: ${hasPattern ? "✅" : "❌"}`);
      }
    }

    if (!signal) {
      reason = `No valid signal. Angle: ${angleData.final.toFixed(
        2
      )}°, RSI: ${currentRSI.toFixed(2)}, Volume: ${hasVolume ? "OK" : "Low"}`;
      console.log(`ℹ️ ${reason}`);
    }

    return {
      decision: signal || "HOLD",
      reason,
      analysis: {
        angle: angleData.final,
        rsi: currentRSI,
        adx: currentADX,
        volume: hasVolume,
        htfBias,
        strength: angleData.strength,
      },
    };
  } catch (error) {
    console.error(`❌ Analysis error for ${symbol}:`, error.message);
    return {
      decision: "HOLD",
      reason: `Analysis error: ${error.message}`,
      error: true,
    };
  }
}

// Batch analysis for multiple symbols
async function analyzeMultipleSymbols(symbols) {
  const results = [];

  for (const symbol of symbols) {
    try {
      const result = await decideTradeDirectionEnhanced(symbol);
      results.push({ symbol, ...result });

      // Rate limiting
      await new Promise((resolve) => setTimeout(resolve, 500));
    } catch (error) {
      results.push({
        symbol,
        decision: "ERROR",
        reason: error.message,
        error: true,
      });
    }
  }

  return results;
}

// Performance tracking
class PerformanceTracker {
  constructor() {
    this.trades = [];
    this.metrics = {
      totalTrades: 0,
      winners: 0,
      losers: 0,
      winRate: 0,
      avgReturn: 0,
      totalReturn: 0,
      maxDrawdown: 0,
    };
  }

  addTrade(trade) {
    this.trades.push({
      ...trade,
      timestamp: new Date(),
    });
    this.updateMetrics();
  }

  updateMetrics() {
    const completedTrades = this.trades.filter((t) => t.status === "CLOSED");
    this.metrics.totalTrades = completedTrades.length;

    if (this.metrics.totalTrades === 0) return;

    this.metrics.winners = completedTrades.filter((t) => t.pnl > 0).length;
    this.metrics.losers = completedTrades.filter((t) => t.pnl < 0).length;
    this.metrics.winRate =
      (this.metrics.winners / this.metrics.totalTrades) * 100;

    const returns = completedTrades.map((t) => t.pnl);
    this.metrics.totalReturn = returns.reduce((sum, r) => sum + r, 0);
    this.metrics.avgReturn =
      this.metrics.totalReturn / this.metrics.totalTrades;

    // Calculate max drawdown
    let peak = 0;
    let maxDD = 0;
    let runningTotal = 0;

    for (const trade of completedTrades) {
      runningTotal += trade.pnl;
      if (runningTotal > peak) peak = runningTotal;
      const drawdown = peak - runningTotal;
      if (drawdown > maxDD) maxDD = drawdown;
    }

    this.metrics.maxDrawdown = maxDD;
  }

  getReport() {
    return {
      ...this.metrics,
      recentTrades: this.trades.slice(-10),
      profitFactor:
        this.metrics.losers === 0
          ? 0
          : Math.abs(
              this.trades
                .filter((t) => t.pnl > 0)
                .reduce((sum, t) => sum + t.pnl, 0)
            ) /
            Math.abs(
              this.trades
                .filter((t) => t.pnl < 0)
                .reduce((sum, t) => sum + t.pnl, 0)
            ),
    };
  }
}

// Market scanner for finding trading opportunities
async function scanMarket(
  symbols = [
    "BTCUSDT",
    "ETHUSDT",
    "BNBUSDT",
    "ADAUSDT",
    "XRPUSDT",
    "SOLUSDT",
    "DOTUSDT",
    "LINKUSDT",
    "LTCUSDT",
    "BCHUSDT",
  ]
) {
  console.log("\n🔍 Starting Market Scan...");
  console.log("=".repeat(50));

  const results = await analyzeMultipleSymbols(symbols);

  // Filter and sort results
  const signals = results.filter((r) => r.decision !== "HOLD" && !r.error);
  const strongSignals = signals.filter(
    (r) =>
      r.analysis?.strength === "STRONG" ||
      r.analysis?.strength === "VERY_STRONG"
  );

  console.log("\n📊 SCAN RESULTS:");
  console.log("=".repeat(50));

  if (signals.length === 0) {
    console.log("❌ No trading signals found");
  } else {
    console.log(
      `✅ Found ${signals.length} signals (${strongSignals.length} strong)`
    );

    signals.sort(
      (a, b) =>
        Math.abs(b.analysis?.angle || 0) - Math.abs(a.analysis?.angle || 0)
    );

    signals.forEach((result, index) => {
      const strength = result.analysis?.strength || "UNKNOWN";
      const emoji = result.decision === "LONG" ? "🟢" : "🔴";
      const strengthEmoji =
        strength === "VERY_STRONG" ? "🔥" : strength === "STRONG" ? "💪" : "✅";

      console.log(
        `\n${index + 1}. ${emoji} ${result.symbol} - ${
          result.decision
        } ${strengthEmoji}`
      );
      console.log(
        `   Angle: ${result.analysis?.angle?.toFixed(
          2
        )}° | RSI: ${result.analysis?.rsi?.toFixed(
          2
        )} | ADX: ${result.analysis?.adx?.toFixed(2)}`
      );
      console.log(
        `   Volume: ${result.analysis?.volume ? "✅" : "❌"} | HTF: ${
          result.analysis?.htfBias
        }`
      );
      console.log(`   Reason: ${result.reason}`);
    });
  }

  console.log("\n" + "=".repeat(50));
  return { all: results, signals, strongSignals };
}

// Real-time monitoring system
class RealTimeMonitor {
  constructor(symbols, intervalMs = 60000) {
    this.symbols = symbols;
    this.intervalMs = intervalMs;
    this.isRunning = false;
    this.performanceTracker = new PerformanceTracker();
  }

  async start() {
    console.log("🚀 Starting Real-Time Monitor...");
    this.isRunning = true;

    while (this.isRunning) {
      try {
        const scanResults = await scanMarket(this.symbols);

        if (scanResults.strongSignals.length > 0) {
          console.log("\n🚨 STRONG SIGNALS DETECTED!");
          this.sendAlert(scanResults.strongSignals);
        }

        await this.sleep(this.intervalMs);
      } catch (error) {
        console.error("❌ Monitor error:", error.message);
        await this.sleep(5000); // Wait 5 seconds before retry
      }
    }
  }

  stop() {
    this.isRunning = false;
    console.log("⏹️ Monitor stopped");
  }

  sendAlert(signals) {
    // You can integrate with Discord, Telegram, email, etc.
    signals.forEach((signal) => {
      console.log(
        `🚨 ALERT: ${signal.symbol} ${signal.decision} signal detected!`
      );
      // Add your notification logic here
    });
  }

  sleep(ms) {
    return new Promise((resolve) => setTimeout(resolve, ms));
  }
}

// Backtesting functionality
async function backtest(symbol, days = 30, initialBalance = 1000) {
  console.log(`\n🧪 Starting Backtest for ${symbol}`);
  console.log(`Period: ${days} days | Initial Balance: ${initialBalance}`);
  console.log("=".repeat(50));

  try {
    // Get historical data
    const limit = days * 480; // 480 3-minute candles per day
    const candles = await getCandles(
      symbol,
      CONFIG.TIMEFRAME_MAIN,
      Math.min(limit, 1000)
    );

    const trades = [];
    let balance = initialBalance;
    let position = null;
    let maxBalance = initialBalance;
    let maxDrawdown = 0;

    // Simulate trading every 10 candles (30 minutes)
    for (let i = 50; i < candles.length - 10; i += 10) {
      const testCandles = candles.slice(0, i + 1);

      // Skip if we have an open position
      if (position) {
        // Check for exit conditions
        const currentPrice = testCandles[testCandles.length - 1].close;
        const pnlPercent =
          position.direction === "LONG"
            ? ((currentPrice - position.entry) / position.entry) * 100
            : ((position.entry - currentPrice) / position.entry) * 100;

        let shouldClose = false;
        let exitReason = "";

        // Take profit
        if (pnlPercent >= CONFIG.TARGET_ROI * 100) {
          shouldClose = true;
          exitReason = "Take Profit";
        }
        // Stop loss (2% max risk)
        else if (pnlPercent <= -2) {
          shouldClose = true;
          exitReason = "Stop Loss";
        }
        // Time-based exit (hold max 4 hours = 80 candles)
        else if (i - position.entryIndex >= 80) {
          shouldClose = true;
          exitReason = "Time Exit";
        }

        if (shouldClose) {
          const pnlAmount =
            balance * CONFIG.MAX_RISK_PER_TRADE * (pnlPercent / 2); // Assuming 2% risk
          balance += pnlAmount;

          trades.push({
            ...position,
            exit: currentPrice,
            exitIndex: i,
            pnl: pnlAmount,
            pnlPercent,
            exitReason,
            duration: i - position.entryIndex,
          });

          console.log(
            `${position.direction} ${exitReason}: ${pnlPercent.toFixed(
              2
            )}% | Balance: ${balance.toFixed(2)}`
          );

          position = null;

          // Update max balance and drawdown
          if (balance > maxBalance) maxBalance = balance;
          const currentDrawdown = ((maxBalance - balance) / maxBalance) * 100;
          if (currentDrawdown > maxDrawdown) maxDrawdown = currentDrawdown;
        }
        continue;
      }

      // Look for new signals
      const closePrices = testCandles.map((c) => c.close);
      if (closePrices.length < 50) continue;

      const tema25 = calculateTEMA(closePrices, CONFIG.TEMA_PERIOD);
      if (tema25.length < 10) continue;

      const angleData = getTEMA25AngleEnhanced(tema25);
      const rsi = calculateRSI(closePrices, CONFIG.RSI_PERIOD);
      const atr = calculateATR(testCandles, CONFIG.ATR_PERIOD);

      if (rsi.length === 0 || atr.length === 0) continue;

      const currentRSI = rsi[rsi.length - 1];
      const dynamicThreshold = CONFIG.BASE_ANGLE_THRESHOLD;

      // Long signal
      if (angleData.final >= dynamicThreshold && currentRSI < 70) {
        const rrData = calculateRiskReward(testCandles, "LONG", atr);
        if (rrData.valid) {
          position = {
            direction: "LONG",
            entry: rrData.entry,
            entryIndex: i,
            timestamp: new Date(testCandles[testCandles.length - 1].openTime),
          };
        }
      }
      // Short signal
      else if (angleData.final <= -dynamicThreshold && currentRSI > 30) {
        const rrData = calculateRiskReward(testCandles, "SHORT", atr);
        if (rrData.valid) {
          position = {
            direction: "SHORT",
            entry: rrData.entry,
            entryIndex: i,
            timestamp: new Date(testCandles[testCandles.length - 1].openTime),
          };
        }
      }
    }

    // Calculate results
    const winners = trades.filter((t) => t.pnl > 0);
    const losers = trades.filter((t) => t.pnl <= 0);
    const winRate = (winners.length / trades.length) * 100;
    const totalReturn = ((balance - initialBalance) / initialBalance) * 100;
    const avgWin =
      winners.length > 0
        ? winners.reduce((sum, t) => sum + t.pnlPercent, 0) / winners.length
        : 0;
    const avgLoss =
      losers.length > 0
        ? losers.reduce((sum, t) => sum + t.pnlPercent, 0) / losers.length
        : 0;
    const profitFactor =
      losers.length === 0
        ? "Infinite"
        : Math.abs(
            winners.reduce((sum, t) => sum + t.pnl, 0) /
              losers.reduce((sum, t) => sum + t.pnl, 0)
          );

    console.log("\n📈 BACKTEST RESULTS:");
    console.log("=".repeat(50));
    console.log(`Total Trades: ${trades.length}`);
    console.log(
      `Win Rate: ${winRate.toFixed(2)}% (${winners.length}W/${losers.length}L)`
    );
    console.log(`Total Return: ${totalReturn.toFixed(2)}%`);
    console.log(`Final Balance: ${balance.toFixed(2)}`);
    console.log(`Max Drawdown: ${maxDrawdown.toFixed(2)}%`);
    console.log(`Average Win: ${avgWin.toFixed(2)}%`);
    console.log(`Average Loss: ${avgLoss.toFixed(2)}%`);
    console.log(
      `Profit Factor: ${
        typeof profitFactor === "number"
          ? profitFactor.toFixed(2)
          : profitFactor
      }`
    );
    console.log(
      `Average Trade Duration: ${
        trades.length > 0
          ? (
              (trades.reduce((sum, t) => sum + t.duration, 0) / trades.length) *
              3
            ).toFixed(0)
          : 0
      } minutes`
    );

    return {
      trades,
      finalBalance: balance,
      totalReturn,
      winRate,
      maxDrawdown,
      profitFactor,
      metrics: {
        totalTrades: trades.length,
        winners: winners.length,
        losers: losers.length,
        avgWin,
        avgLoss,
      },
    };
  } catch (error) {
    console.error("❌ Backtest error:", error.message);
    return null;
  }
}

// Configuration validation
function validateConfig() {
  const issues = [];

  if (!process.env.BINANCE_API_KEY) {
    issues.push("❌ BINANCE_API_KEY environment variable not set");
  }

  if (!process.env.BINANCE_API_SECRET) {
    issues.push("❌ BINANCE_API_SECRET environment variable not set");
  }

  if (CONFIG.TARGET_ROI <= 0 || CONFIG.TARGET_ROI > 0.2) {
    issues.push("⚠️ TARGET_ROI should be between 0 and 0.2 (20%)");
  }

  if (CONFIG.MAX_RISK_PER_TRADE <= 0 || CONFIG.MAX_RISK_PER_TRADE > 0.1) {
    issues.push("⚠️ MAX_RISK_PER_TRADE should be between 0 and 0.1 (10%)");
  }

  if (issues.length > 0) {
    console.log("\n⚠️ CONFIGURATION ISSUES:");
    issues.forEach((issue) => console.log(`   ${issue}`));
    console.log("");
  }

  return issues.length === 0;
}

// Usage examples and main functions
async function runSingleAnalysis(symbol = "BTCUSDT") {
  console.log("🚀 Single Symbol Analysis");
  const result = await decideTradeDirectionEnhanced(symbol);
  console.log("\nResult:", result);
  return result;
}

async function runMarketScan() {
  console.log("🚀 Market Scan");
  return await scanMarket();
}

async function runBacktest(symbol = "BTCUSDT", days = 7) {
  console.log("🚀 Backtesting");
  return await backtest(symbol, days);
}

// Export functions for use
module.exports = {
  // Main trading functions
  decideTradeDirectionEnhanced,
  scanMarket,
  analyzeMultipleSymbols,

  // Utility functions
  getCandles,
  calculateTEMA,
  calculateRSI,
  calculateATR,
  calculateADX,
  calculateBollingerBands,
  getTEMA25AngleEnhanced,

  // Analysis functions
  isSidewaysMarket,
  hasVolumeConfirmation,
  getHigherTimeframeBias,
  calculateRiskReward,
  detectReversalPattern,

  // System classes
  PerformanceTracker,
  RealTimeMonitor,

  // Testing functions
  backtest,
  runSingleAnalysis,
  runMarketScan,
  runBacktest,

  // Validation
  validateConfig,

  // Configuration
  CONFIG,
};

// Example usage (uncomment to use)
/*
async function main() {
  // Validate configuration first
  if (!validateConfig()) {
    console.log('❌ Please fix configuration issues before running');
    return;
  }
  
  // Single analysis example
  await runSingleAnalysis('BTCUSDT');
  
  // Market scan example
  // await runMarketScan();
  
  // Backtest example
  // await runBacktest('BTCUSDT', 7);
  
  // Real-time monitoring example
  // const monitor = new RealTimeMonitor(['BTCUSDT', 'ETHUSDT'], 30000);
  // monitor.start();
}

// Uncomment to run
// main().catch(console.error);
*/
