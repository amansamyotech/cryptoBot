const Binance = require("node-binance-api");
const axios = require("axios");

const binance = new Binance().options({
  APIKEY: "tPCOyhkpaVUj6it6BiKQje0WxcJjUOV30EQ7dY2FMcqXunm9DwC8xmuiCkgsyfdG",
  APISECRET: "UpK4CPfKywFrAJDInCAXPmWVSiSs5xVVL2nDes8igCONl3cVgowDjMbQg64fm5pr",
  useServerTime: true,
  test: false,
});

const TIMEFRAME_MAIN = "5m";
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

function getCandleAngle(candle, timeSpan = 300) {
  const delta = ((candle.close - candle.open) / candle.open) * 100000;
  const rawAngleRad = Math.atan(delta / timeSpan);
  let angle = rawAngleRad * (180 / Math.PI);

  if (candle.close > candle.open) {
    angle = 90 + (Math.abs(delta) / (Math.abs(delta) + 100)) * 60;
  } else if (candle.close < candle.open) {
    angle = 210 + (Math.abs(delta) / (Math.abs(delta) + 100)) * 60;
  } else {
    angle = 180;
  }

  return angle;
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
  lookbackPeriod = 20,
  thresholdPercent = 0.6 // Tighter for 5m scalping
) {
  if (candles.length < lookbackPeriod) {
    console.log("❌ Insufficient candles for sideways analysis");
    return false;
  }

  // Get recent candles
  const recentCandles = candles.slice(-lookbackPeriod);
  const closePrices = recentCandles.map((c) => c.close);

  // 1. Price Range Check
  const highs = recentCandles.map((c) => c.high);
  const lows = recentCandles.map((c) => c.low);
  const highestHigh = Math.max(...highs);
  const lowestLow = Math.min(...lows);
  const currentPrice = candles[candles.length - 1].close;
  const priceRange = ((highestHigh - lowestLow) / currentPrice) * 100;

  // 2. Volatility Check (tighter for 5m)
  const recentVolatility =
    recentCandles.slice(-5).reduce((sum, candle) => {
      return sum + Math.abs((candle.high - candle.low) / candle.close) * 100;
    }, 0) / 5;

  // 3. EMA Convergence Check
  const ema5 = calculateEMA(closePrices, 5);
  const ema15 = calculateEMA(closePrices, 15);
  const lastEma5 = ema5[ema5.length - 1];
  const lastEma15 = ema15[ema15.length - 1];
  const emaConvergence = Math.abs((lastEma5 - lastEma15) / currentPrice) * 100;

  // 4. Oscillation Check
  const avgEma = (lastEma5 + lastEma15) / 2;
  let priceAboveEma = 0;
  let priceBelowEma = 0;
  recentCandles.slice(-10).forEach((candle) => {
    if (candle.close > avgEma) priceAboveEma++;
    else priceBelowEma++;
  });
  const oscillationRatio = Math.min(priceAboveEma, priceBelowEma) / 10;

  // 5. Bollinger Bands Check
  const bb = calculateBollingerBands(closePrices, 20, 2);
  const lastPrice = closePrices[closePrices.length - 1];
  const lastUpperBand = bb.upperBand[bb.upperBand.length - 1];
  const lastLowerBand = bb.lowerBand[bb.lowerBand.length - 1];
  const bbWidth = ((lastUpperBand - lastLowerBand) / lastPrice) * 100;
  const priceWithinBands =
    lastPrice <= lastUpperBand && lastPrice >= lastLowerBand;

  // 6. ADX Check (low ADX indicates no trend)
  const adx = calculateADX(recentCandles, 14);
  const lastAdx = adx[adx.length - 1];

  // 7. Consolidation Pattern Check (doji-like candles)
  const recentCandlesShort = recentCandles.slice(-5);
  const dojiCount = recentCandlesShort.filter((c) => {
    const bodySize = Math.abs(c.close - c.open) / c.open;
    const totalRange = (c.high - c.low) / c.open;
    return bodySize <= 0.001 && totalRange >= 0.002; // Small body, reasonable range
  }).length;

  // Enhanced Sideways Criteria
  const isSideways =
    priceRange <= thresholdPercent && // Tighter range
    emaConvergence <= 0.25 && // Tighter EMA convergence
    recentVolatility <= 0.3 && // Lower volatility for 5m
    oscillationRatio >= 0.4 && // Stronger oscillation
    bbWidth <= 1.0 && // Narrow Bollinger Bands
    priceWithinBands && // Price within bands
    lastAdx <= 20 && // Low ADX (no trend)
    dojiCount >= 2; // At least 2 doji-like candles

  if (isSideways) {
    console.log(
      `📊 Sideways market detected for 5m timeframe: ` +
        `Range=${priceRange.toFixed(2)}%, ` +
        `EMA convergence=${emaConvergence.toFixed(3)}%, ` +
        `Volatility=${recentVolatility.toFixed(2)}%, ` +
        `BB Width=${bbWidth.toFixed(2)}%, ` +
        `ADX=${lastAdx.toFixed(2)}, ` +
        `Doji Count=${dojiCount}`
    );
  }

  return isSideways;
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

    const closePrices = pastCandles5m.map((c) => c.close);

    // ✅ Use only TEMA(25)
    const tema12 = calculateTEMA(closePrices, 25);
    const lastCandle = pastCandles5m[pastCandles5m.length - 2]; // Confirmed candle
    const currentCandle = pastCandles5m[pastCandles5m.length - 1]; // Unconfirmed

    const lastTema12 = tema12[tema12.length - 2]; // For the previous candle
    const currentTema12 = tema12[tema12.length - 1]; // For the current candle

    // ✅ Angle of the last confirmed candle
    const angle = getCandleAngle(lastCandle);

    // ✅ First check if price is above TEMA
    if (currentCandle.close > currentTema12) {
      if (angle >= 90 && angle <= 135) {
        console.log(`✅ LONG signal for ${symbol}: Angle=${angle.toFixed(2)}°`);
        return "LONG";
      }
    }

    // ✅ Then check if price is below TEMA
    if (currentCandle.close < currentTema12) {
      if (angle >= 225 && angle <= 280) {
        console.log(`✅ SHORT signal for ${symbol}: Angle=${angle.toFixed(2)}°`);
        return "SHORT";
      }
    }

    // ✅ If none of the conditions are satisfied
    console.log(
      `ℹ️ No valid entry signal for ${symbol}: Angle=${angle.toFixed(2)}°, Close=${currentCandle.close}, TEMA=${currentTema12}`
    );
    return "HOLD";

  } catch (err) {
    console.error(`❌ Decision error for ${symbol}:`, err.message);
    return "HOLD";
  }
}

module.exports = { decideTradeDirection300 };
