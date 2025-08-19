const Binance = require("node-binance-api");
const axios = require("axios");

const binance = new Binance().options({
  APIKEY: "tPCOyhkpaVUj6it6BiKQje0WxcJjUOV30EQ7dY2FMcqXunm9DwC8xmuiCkgsyfdG",
  APISECRET: "UpK4CPfKywFrAJDInCAXPmWVSiSs5xVVL2nDes8igCONl3cVgowDjMbQg64fm5pr",
  useServerTime: true,
  test: false,
});

const TIMEFRAME_MAIN = "3m";

async function getCandles(symbol, interval, limit = 1000) {
  try {
    const res = await axios.get(
      `https://fapi.binance.com/fapi/v1/klines?symbol=${symbol}&interval=${interval}&limit=${limit}`
    );
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
  const ema1 = [prices[0]];
  const ema2 = [];
  const ema3 = [];

  for (let i = 1; i < prices.length; i++) {
    ema1.push(prices[i] * k + ema1[i - 1] * (1 - k));
  }

  ema2.push(ema1[0]);
  for (let i = 1; i < ema1.length; i++) {
    ema2.push(ema1[i] * k + ema2[i - 1] * (1 - k));
  }

  ema3.push(ema2[0]);
  for (let i = 1; i < ema2.length; i++) {
    ema3.push(ema2[i] * k + ema3[i - 1] * (1 - k));
  }

  const tema = [];
  for (let i = 0; i < prices.length; i++) {
    tema.push(3 * ema1[i] - 3 * ema2[i] + ema3[i]);
  }

  return tema;
}

function calculateADX(candles, period = 14) {
  const plusDM = [],
    minusDM = [],
    tr = [];

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

  const smoothedPlusDM = [],
    smoothedMinusDM = [],
    smoothedTR = [];

  for (let i = period - 1; i < plusDM.length; i++) {
    if (i === period - 1) {
      smoothedPlusDM.push(
        plusDM.slice(i - period + 1, i + 1).reduce((a, b) => a + b)
      );
      smoothedMinusDM.push(
        minusDM.slice(i - period + 1, i + 1).reduce((a, b) => a + b)
      );
      smoothedTR.push(tr.slice(i - period + 1, i + 1).reduce((a, b) => a + b));
    } else {
      smoothedPlusDM.push(
        (smoothedPlusDM.at(-1) * (period - 1) + plusDM[i]) / period
      );
      smoothedMinusDM.push(
        (smoothedMinusDM.at(-1) * (period - 1) + minusDM[i]) / period
      );
      smoothedTR.push((smoothedTR.at(-1) * (period - 1) + tr[i]) / period);
    }
  }

  const plusDI = smoothedPlusDM.map((dm, i) => (dm / smoothedTR[i]) * 100);
  const minusDI = smoothedMinusDM.map((dm, i) => (dm / smoothedTR[i]) * 100);
  const dx = plusDI.map(
    (pdi, i) => (Math.abs(pdi - minusDI[i]) / (pdi + minusDI[i])) * 100
  );

  const adx = [];
  for (let i = period - 1; i < dx.length; i++) {
    if (i === period - 1) {
      adx.push(
        dx.slice(i - period + 1, i + 1).reduce((a, b) => a + b) / period
      );
    } else {
      adx.push((adx.at(-1) * (period - 1) + dx[i]) / period);
    }
  }

  return adx;
}

function calculateBollingerBands(prices, period = 20, stdDev = 2) {
  const sma = [],
    upperBand = [],
    lowerBand = [];

  for (let i = period - 1; i < prices.length; i++) {
    const slice = prices.slice(i - period + 1, i + 1);
    const mean = slice.reduce((a, b) => a + b) / period;
    const variance =
      slice.reduce((a, b) => a + Math.pow(b - mean, 2), 0) / period;
    const sd = Math.sqrt(variance);

    sma.push(mean);
    upperBand.push(mean + stdDev * sd);
    lowerBand.push(mean - stdDev * sd);
  }

  return { sma, upperBand, lowerBand };
}

function calculateATR(candles, period = 14) {
  const tr = [];
  for (let i = 1; i < candles.length; i++) {
    const high = candles[i].high;
    const low = candles[i].low;
    const prevClose = candles[i - 1].close;
    const trValue = Math.max(
      high - low,
      Math.abs(high - prevClose),
      Math.abs(low - prevClose)
    );
    tr.push(trValue);
  }

  const atr = [];
  for (let i = period - 1; i < tr.length; i++) {
    if (i === period - 1) {
      atr.push(
        tr.slice(i - period + 1, i + 1).reduce((a, b) => a + b) / period
      );
    } else {
      atr.push((atr.at(-1) * (period - 1) + tr[i]) / period);
    }
  }
  return atr;
}

function isSidewaysMarket(
  candles,
  lookbackPeriod = 20,
  thresholdPercent = 0.4,
  adxThreshold = 15,
  bbWidthThreshold = 0.7
) {
  if (candles.length < lookbackPeriod) return false;

  // Extract data
  const recent = candles.slice(-lookbackPeriod);
  const closePrices = recent.map((c) => c.close);
  const highs = recent.map((c) => c.high);
  const lows = recent.map((c) => c.low);
  const currentPrice = candles.at(-1).close;

  // 1. Price Range Check
  const priceRange =
    ((Math.max(...highs) - Math.min(...lows)) / currentPrice) * 100;

  // 2. ADX Check
  const adx = calculateADX(recent);
  const lastAdx = adx.at(-1);

  // 3. Bollinger Bands Width Check
  const bb = calculateBollingerBands(closePrices);
  const lastUpper = bb.upperBand.at(-1);
  const lastLower = bb.lowerBand.at(-1);
  const bbWidth = ((lastUpper - lastLower) / currentPrice) * 100;

  // Logging for debugging
  console.log({
    priceRange: priceRange + "%",
    lastAdx: lastAdx,
    bbWidth: bbWidth + "%",
    isSideways:
      priceRange <= thresholdPercent &&
      lastAdx <= adxThreshold &&
      bbWidth <= bbWidthThreshold,
  });

  // Return true if all conditions are met
  return (
    priceRange <= thresholdPercent && // Price range ≤ 0.4%
    lastAdx <= adxThreshold && // ADX ≤ 15
    bbWidth <= bbWidthThreshold // Bollinger Bands width ≤ 0.7%
  );
}
async function decide25TEMA(symbol) {
  try {
    const candles = await getCandles(symbol, TIMEFRAME_MAIN, 1000);
    if (candles.length < 50) {
      console.log("❌ Insufficient candles for analysis");
      return "HOLD";
    }

    if (isSidewaysMarket(candles)) {
      console.log(`⚖️ Market is sideways for ${symbol}. Decision: HOLD`);
      return "HOLD";
    }

    const closes = candles.map((c) => c.close);
    const tema25 = calculateTEMA(closes, 25);

    if (tema25.length < 2) {
      console.log("❌ Insufficient TEMA data");
      return "HOLD";
    }

    const lastPrice = closes.at(-1);
    const lastTEMA25 = tema25.at(-1);
    const prevTEMA25 = tema25.at(-2);

    // Calculate angle of TEMA(25)
    const scaleFactor = 1000; // Sensitivity for angle calculation
    const slope = ((lastTEMA25 - prevTEMA25) / prevTEMA25) * scaleFactor;
    const angleRadians = Math.atan(slope);
    const angleDegrees = angleRadians * (180 / Math.PI);
    console.log(`angleDegrees`, angleDegrees);

    // Decision logic: Based on TEMA(25) position and angle
    let decision = "HOLD";
    let reason = "";

    if (lastTEMA25 < lastPrice && angleDegrees > 30) {
      decision = "LONG";
      reason = `Price (${lastPrice.toFixed(
        2
      )}) > TEMA(25) (${lastTEMA25.toFixed(
        2
      )}) and angle ${angleDegrees.toFixed(2)}° > 35°`;
    } else if (lastTEMA25 > lastPrice && angleDegrees < -30) {
      decision = "SHORT";
      reason = `Price (${lastPrice.toFixed(
        2
      )}) < TEMA(25) (${lastTEMA25.toFixed(
        2
      )}) and angle ${angleDegrees.toFixed(2)}° < -35°`;
    } else {
      decision = "HOLD";
      reason = `Conditions not met. TEMA(25): ${lastTEMA25.toFixed(
        2
      )}, Price: ${lastPrice.toFixed(2)}, Angle: ${angleDegrees.toFixed(2)}°`;
    }

    console.log(
      `📐 TEMA(25) for ${symbol}: ${lastTEMA25.toFixed(
        2
      )}, Angle: ${angleDegrees.toFixed(2)}°, Decision: ${decision} (${reason})`
    );

    return decision;
  } catch (err) {
    console.error(`❌ Error in decide25TEMA for ${symbol}:`, err.message);
    return "HOLD";
  }
}

module.exports = { decide25TEMA , calculateTEMA , calculateATR};
