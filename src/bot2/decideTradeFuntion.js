const axios = require("axios");
const TIMEFRAME_MAIN = "3m";

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
  const k = 2 / (period + 1);
  let ema = prices[0];
  const emaArray = [ema];

  for (let i = 1; i < prices.length; i++) {
    ema = prices[i] * k + ema * (1 - k);
    emaArray.push(ema);
  }

  return emaArray;
}

function calculateTEMA(prices, period) {
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

function getCandleAngle(candle, timeSpanSeconds = 300) {
  if (!candle || isNaN(candle.close) || isNaN(candle.open)) {
    console.error("Invalid candle data for angle calculation:", candle);
    return 0;
  }
  const currentPrice = candle.close;
  const priceChange = candle.close - candle.open;
  const normalizedPriceChange = (priceChange / currentPrice) * 100;
  const slope = normalizedPriceChange / timeSpanSeconds;
  const angleRadians = Math.atan(slope);
  const angleDegrees = angleRadians * (180 / Math.PI) * 1000;
  console.log(
    `Angle calculated: ${angleDegrees.toFixed(
      2
    )}° for priceChange: ${priceChange}, normalized: ${normalizedPriceChange}%`
  );
  return angleDegrees;
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
async function decideTradeDirection(symbol) {
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

    const closePrices = pastCandles5m.map((c) => c.close);

    // Using TEMA instead of EMA
    const tema9 = calculateTEMA(closePrices, 15);
    const tema15 = calculateTEMA(closePrices, 21);

    const lastTema9 = tema9[tema9.length - 1];
    const lastTema15 = tema15[tema15.length - 1];
    const prevTema9 = tema9[tema9.length - 2];
    const prevTema15 = tema15[tema15.length - 2];

    let temaSignal = "HOLD";
    // let crossoverCandle = null;
    let crossoverCandle = pastCandles5m[pastCandles5m.length - 1];

    if (prevTema9 <= prevTema15 && lastTema9 > lastTema15) {
      temaSignal = "LONG";
      crossoverCandle = pastCandles5m[pastCandles5m.length - 1];
    } else if (prevTema9 >= prevTema15 && lastTema9 < lastTema15) {
      temaSignal = "SHORT";
      crossoverCandle = pastCandles5m[pastCandles5m.length - 1];
    }

    console.log(`temaSignal`,temaSignal);
    
    if (!crossoverCandle) return "HOLD";
    console.log(`crossoverCandle`, crossoverCandle);

    const angle = getCandleAngle(crossoverCandle);
    console.log(`angle`, angle);

    if (angle == 20 && temaSignal === "LONG") {
      return "LONG";
    } else if (angle === -20 && temaSignal === "SHORT") {
      return "SHORT";
    } else {
      return "HOLD";
    }
  } catch (err) {
    console.error(`❌ Decision error for ${symbol}:`, err.message);
    return "HOLD";
  }
}
module.exports = { decideTradeDirection };
