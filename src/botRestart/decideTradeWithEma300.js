const Binance = require("node-binance-api");
const axios = require("axios");

const binance = new Binance().options({
  APIKEY: "tPCOyhkpaVUj6it6BiKQje0WxcJjUOV30EQ7dY2FMcqXunm9DwC8xmuiCkgsyfdG",
  APISECRET: "UpK4CPfKywFrAJDInCAXPmWVSiSs5xVVL2nDes8igCONl3cVgowDjMbQg64fm5pr",
  useServerTime: true,
  test: false,
});

const TIMEFRAME_MAIN = "3m";
const TIMEFRAME_TREND = "15m";

async function getCandles(symbol, interval, limit = 1000) {
  try {
    const res = await axios.get(
      `https://fapi.binance.com/fapi/v1/klines?symbol=${symbol}&interval=${interval}&limit=${limit}`
    );
    if (!res.data || !Array.isArray(res.data)) {
      console.error(
        `❌ Invalid response from axios for ${symbol} - ${interval}`
      );
      return [];
    }
    return res.data
      .map((c) => ({
        openTime: c[0],
        open: parseFloat(c[1]),
        high: parseFloat(c[2]),
        low: parseFloat(c[3]),
        close: parseFloat(c[4]),
        volume: parseFloat(c[5]),
      }))
      .filter((c) => !isNaN(c.close));
  } catch (err) {
    console.error(
      `❌ Error fetching candles for ${symbol} (${interval}):`,
      err.message
    );
    return [];
  }
}

function calculateEMA(prices, period) {
  const k = 2 / (period + 1); // Smoothing factor
  let ema = prices[0]; // Start with the first price
  const emaArray = [ema];

  for (let i = 1; i < prices.length; i++) {
    ema = prices[i] * k + ema * (1 - k);
    emaArray.push(ema);
  }

  return emaArray;
}

function calculateTEMA(prices, period) {
  // First EMA
  const k = 2 / (period + 1);
  let ema1 = [prices[0]];
  for (let i = 1; i < prices.length; i++) {
    ema1.push(prices[i] * k + ema1[i - 1] * (1 - k));
  }

  // Second EMA (EMA of EMA)
  let ema2 = [ema1[0]];
  for (let i = 1; i < ema1.length; i++) {
    ema2.push(ema1[i] * k + ema2[i - 1] * (1 - k));
  }

  // Third EMA (EMA of EMA of EMA)
  let ema3 = [ema2[0]];
  for (let i = 1; i < ema2.length; i++) {
    ema3.push(ema2[i] * k + ema3[i - 1] * (1 - k));
  }

  // TEMA = (3*EMA1 - 3*EMA2 + EMA3)
  const tema = [];
  for (let i = 0; i < prices.length; i++) {
    tema.push(3 * ema1[i] - 3 * ema2[i] + ema3[i]);
  }

  return tema;
}

// function getCandleAngle(candle, timeSpan = 300) {
//   const delta = ((candle.close - candle.open) / candle.open) * 100000;
//   const rawAngleRad = Math.atan(delta / timeSpan);
//   let angle = rawAngleRad * (180 / Math.PI);

//   if (candle.close > candle.open) {
//     angle = 90 + (Math.abs(delta) / (Math.abs(delta) + 100)) * 60;
//   } else if (candle.close < candle.open) {
//     angle = 210 + (Math.abs(delta) / (Math.abs(delta) + 100)) * 60;
//   } else {
//     angle = 180;
//   }

//   return angle;
// }

function calculateRSI(prices, period = 14) {
  const gains = [],
    losses = [];
  for (let i = 1; i < prices.length; i++) {
    const diff = prices[i] - prices[i - 1];
    gains.push(diff > 0 ? diff : 0);
    losses.push(diff < 0 ? -diff : 0);
  }
  let avgGain = gains.slice(0, period).reduce((a, b) => a + b) / period;
  let avgLoss = losses.slice(0, period).reduce((a, b) => a + b) / period;
  const rsi = [100 - 100 / (1 + (avgGain / avgLoss || 1))]; // Handle div by 0

  for (let i = period; i < gains.length; i++) {
    avgGain = (avgGain * (period - 1) + gains[i]) / period;
    avgLoss = (avgLoss * (period - 1) + losses[i]) / period;
    rsi.push(100 - 100 / (1 + (avgGain / avgLoss || 1)));
  }
  return rsi;
}

function calculateBollingerBands(prices, period = 20, stdDev = 2) {
  const sma = [];
  const std = [];
  const upperBand = [];
  const lowerBand = [];

  for (let i = period - 1; i < prices.length; i++) {
    const slice = prices.slice(i - period + 1, i + 1);
    const mean = slice.reduce((sum, p) => sum + p, 0) / period;
    sma.push(mean);

    const variance =
      slice.reduce((sum, p) => sum + Math.pow(p - mean, 2), 0) / period;
    const standardDeviation = Math.sqrt(variance);
    std.push(standardDeviation);

    upperBand.push(mean + stdDev * standardDeviation);
    lowerBand.push(mean - stdDev * standardDeviation);
  }

  return { sma, upperBand, lowerBand };
}

function calculateADX(candles, period = 14) {
  let plusDM = [];
  let minusDM = [];
  let tr = [];

  for (let i = 1; i < candles.length; i++) {
    const high = candles[i].high;
    const low = candles[i].low;
    const prevHigh = candles[i - 1].high;
    const prevLow = candles[i - 1].low;
    const prevClose = candles[i - 1].close;

    const upMove = high - prevHigh;
    const downMove = prevLow - low;

    const dmPlus = upMove > downMove && upMove > 0 ? upMove : 0;
    const dmMinus = downMove > upMove && downMove > 0 ? downMove : 0;

    const trValue = Math.max(
      high - low,
      Math.abs(high - prevClose),
      Math.abs(low - prevClose)
    );

    plusDM.push(dmPlus);
    minusDM.push(dmMinus);
    tr.push(trValue);
  }

  // Smooth the values
  const smoothPeriod = period;
  let smoothedPlusDM = [];
  let smoothedMinusDM = [];
  let smoothedTR = [];

  for (let i = smoothPeriod - 1; i < plusDM.length; i++) {
    if (i === smoothPeriod - 1) {
      smoothedPlusDM.push(
        plusDM
          .slice(i - smoothPeriod + 1, i + 1)
          .reduce((sum, val) => sum + val, 0)
      );
      smoothedMinusDM.push(
        minusDM
          .slice(i - smoothPeriod + 1, i + 1)
          .reduce((sum, val) => sum + val, 0)
      );
      smoothedTR.push(
        tr.slice(i - smoothPeriod + 1, i + 1).reduce((sum, val) => sum + val, 0)
      );
    } else {
      smoothedPlusDM.push(
        (smoothedPlusDM[smoothedPlusDM.length - 1] * (smoothPeriod - 1) +
          plusDM[i]) /
          smoothPeriod
      );
      smoothedMinusDM.push(
        (smoothedMinusDM[smoothedMinusDM.length - 1] * (smoothPeriod - 1) +
          minusDM[i]) /
          smoothPeriod
      );
      smoothedTR.push(
        (smoothedTR[smoothedTR.length - 1] * (smoothPeriod - 1) + tr[i]) /
          smoothPeriod
      );
    }
  }

  // Calculate DI+ and DI-
  const plusDI = smoothedPlusDM.map((dm, i) => (dm / smoothedTR[i]) * 100);
  const minusDI = smoothedMinusDM.map((dm, i) => (dm / smoothedTR[i]) * 100);

  // Calculate DX and ADX
  const dx = plusDI.map(
    (pdi, i) => (Math.abs(pdi - minusDI[i]) / (pdi + minusDI[i])) * 100
  );
  const adx = [];
  for (let i = smoothPeriod - 1; i < dx.length; i++) {
    if (i === smoothPeriod - 1) {
      adx.push(
        dx
          .slice(i - smoothPeriod + 1, i + 1)
          .reduce((sum, val) => sum + val, 0) / smoothPeriod
      );
    } else {
      adx.push(
        (adx[adx.length - 1] * (smoothPeriod - 1) + dx[i]) / smoothPeriod
      );
    }
  }

  return adx;
}

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
  const currentPrice = candles.at(-1).close;

  // Price Range %
  const priceRange =
    ((Math.max(...highs) - Math.min(...lows)) / currentPrice) * 100;

  // Recent Volatility (last 10 candles)
  const recentVolatility =
    recent
      .slice(-10)
      .reduce((sum, c) => sum + Math.abs((c.high - c.low) / c.close) * 100, 0) /
    10;

  // TEMA Instead of EMA (better for sideways detection)
  const tema15 = calculateTEMA(closePrices, 15);
  const tema25 = calculateTEMA(closePrices, 25);
  const lastTema15 = tema15.at(-1);
  const lastTema25 = tema25.at(-1);
  const emaConvergence =
    Math.abs((lastTema15 - lastTema25) / currentPrice) * 100;

  // Oscillation check
  const avgEma = (lastTema15 + lastTema25) / 2;
  const osc = recent.slice(-12).reduce((count, c) => {
    return c.close > avgEma ? count + 1 : count;
  }, 0);
  const oscillationRatio = Math.min(osc, 12 - osc) / 12;

  // Bollinger Bands
  const bb = calculateBollingerBands(closePrices, 20);
  const lastUpper = bb.upperBand.at(-1);
  const lastLower = bb.lowerBand.at(-1);
  const bbWidth = ((lastUpper - lastLower) / currentPrice) * 100;

  // ADX
  const adx = calculateADX(recent, 14);
  const lastAdx = adx.at(-1);

  // Doji Check
  const dojiCount = recent.slice(-8).filter((c) => {
    const body = Math.abs(c.close - c.open) / c.open;
    const range = (c.high - c.low) / c.open;
    return body <= 0.002 && range >= 0.004;
  }).length;

  // RSI
  const rsi = calculateRSI(closePrices, 14);
  const lastRsi = rsi.at(-1);

  return (
    priceRange <= thresholdPercent && // narrow range
    emaConvergence <= 0.15 && // TEMA almost flat
    recentVolatility <= 0.25 && // very low volatility
    oscillationRatio >= 0.45 && // ping-pong behaviour
    bbWidth <= 0.8 && // tight bands
    candles.at(-1).close <= lastUpper &&
    candles.at(-1).close >= lastLower &&
    lastAdx <= 18 && // very weak trend
    dojiCount >= 2 &&
    lastRsi >= 45 &&
    lastRsi <= 55
  );
}

function getTEMAangle(temaArray) {
  const len = temaArray.length;
  if (len < 2) return 0;

  const y2 = temaArray[len - 1]; // most recent TEMA
  const y1 = temaArray[len - 2]; // previous TEMA

  const dx = 1; // one candle difference
  const dy = y2 - y1;
  const slope = dy / dx;

  const angle = Math.atan(slope) * (180 / Math.PI);
  return angle;
}

async function decideTradeDirection300(symbol) {
  try {
    const pastCandles5m = await getCandles(symbol, TIMEFRAME_MAIN, 1000);
    if (pastCandles5m.length < 50) {
      console.log("❌ Insufficient candles for analysis");
      return "HOLD";
    }

    if (isSidewaysMarket(pastCandles5m)) {
      console.log(`⚖️ Market is sideways for ${symbol}. Decision: HOLD`);
      return "HOLD";
    }

    // --- Get recent 3m candles (need at least 20 for safe TEMA)
    const pastCandles3m = await getCandles(symbol, "3m", 20);
    if (pastCandles3m.length < 16) {
      console.log("❌ Not enough 3m candles for TEMA angle check");
      return "HOLD";
    }

    // Extract close prices from 3m candles
    const closePrices = pastCandles3m.map(c => c.close);
    const tema15 = calculateTEMA(closePrices, 15); // Use 15-period TEMA

    // Function to calculate angle between two points
    function getAngleFromPoints(y1, y2) {
      const slope = y2 - y1;
      return (Math.atan(slope) * (180 / Math.PI))*1000;
    }

    // Use 4th-last and 2nd-last TEMA values to calculate angles
    const angleA = getAngleFromPoints(tema15[tema15.length - 4], tema15[tema15.length - 3]); // 4th-last
    const angleB = getAngleFromPoints(tema15[tema15.length - 2], tema15[tema15.length - 1]); // 2nd-last

    console.log(`📉 TEMA Angles - 4th-last: ${angleA.toFixed(2)}°, 2nd-last: ${angleB.toFixed(2)}°`);

    const isBullish = (angle) => angle >= 90 && angle <= 135;
    const isBearish = (angle) => angle >= 225 && angle <= 280;

    if (isBearish(angleA) && isBullish(angleB)) {
      console.log(`✅ LONG signal from TEMA angle cross`);
      return "LONG";
    }

    if (isBullish(angleA) && isBearish(angleB)) {
      console.log(`✅ SHORT signal from TEMA angle cross`);
      return "SHORT";
    }

    console.log(`ℹ️ No valid signal from TEMA angle logic. Holding.`);
    return "HOLD";
  } catch (err) {
    console.error(`❌ Decision error for ${symbol}:`, err.message);
    return "HOLD";
  }
}

module.exports = { decideTradeDirection300 };
