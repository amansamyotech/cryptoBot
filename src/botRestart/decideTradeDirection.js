const technicalIndicators = require("technicalindicators");
const Binance = require("node-binance-api");

const binance = new Binance().options({
  APIKEY: "whfiekZqKdkwa9fEeUupVdLZTNxBqP1OCEuH2pjyImaWt51FdpouPPrCawxbsupK",
  APISECRET: "E4IcteWOQ6r9qKrBZJoBy4R47nNPBDepVXMnS3Lf2Bz76dlu0QZCNh82beG2rHq4",
  useServerTime: true,
  test: false,
});

const EMA_PERIODS = [9, 15];
const TIMEFRAME_MAIN = "5m";
const TIMEFRAME_TREND = "15m";
const EMA_ANGLE_THRESHOLD = 30;

const symbols = [
  "1000PEPEUSDT",
  "1000BONKUSDT",
  "DOGEUSDT",
  "CKBUSDT",
  "1000FLOKIUSDT",
];

async function getCandles(symbol, interval, limit = 50) {
  const candles = await binance.futuresCandles(symbol, interval, { limit });

  return candles.map((c) => ({
    openTime: c[0],
    open: parseFloat(c[1]),
    high: parseFloat(c[2]),
    low: parseFloat(c[3]),
    close: parseFloat(c[4]),
    volume: parseFloat(c[5]),
  }));
}

// Fixed EMA calculation function
function calculateEMA(period, candles) {
  if (!candles || candles.length === 0) return NaN;
  if (candles.length < period) return NaN;

  const k = 2 / (period + 1);
  let ema = candles[0].close; // Start with first close price

  // Calculate EMA for all candles
  for (let i = 1; i < candles.length; i++) {
    ema = candles[i].close * k + ema * (1 - k);
  }

  return ema;
}

// Alternative: Using technical indicators library (more accurate)
function calculateEMAWithLibrary(period, candles) {
  if (!candles || candles.length === 0) return NaN;
  if (candles.length < period) return NaN;

  const closePrices = candles.map((c) => c.close);
  const emaValues = technicalIndicators.EMA.calculate({
    period: period,
    values: closePrices,
  });

  return emaValues.length > 0 ? emaValues[emaValues.length - 1] : NaN;
}

function detectCandleType(candle) {
  if (!candle || typeof candle.close === "undefined") return "none";

  const body = Math.abs(candle.close - candle.open);
  const upperWick = candle.high - Math.max(candle.close, candle.open);
  const lowerWick = Math.min(candle.close, candle.open) - candle.low;
  const range = candle.high - candle.low;

  if (range === 0) return "none";

  if (lowerWick > 2 * body || upperWick > 2 * body) return "pinbar";
  if (range > 1.5 * body && body / range > 0.7) return "bigbar";
  if (body / range > 0.85) return "fullbody";
  return "none";
}

function getEMAangle(emaShort, emaLong, timeSpan = 5) {
  if (isNaN(emaShort) || isNaN(emaLong)) return NaN;

  const delta = emaShort - emaLong;
  const angleRad = Math.atan(delta / timeSpan);
  return angleRad * (180 / Math.PI);
}

function calculateRSI(candles, period = 14) {
  if (!candles || candles.length < period + 1) return NaN;

  const closePrices = candles.map((c) => c.close);
  const rsiValues = technicalIndicators.RSI.calculate({
    period: period,
    values: closePrices,
  });

  return rsiValues.length > 0 ? rsiValues[rsiValues.length - 1] : NaN;
}

function calculateMACD(candles, fast = 12, slow = 26, signal = 9) {
  if (!candles || candles.length < slow)
    return { macdLine: NaN, signalLine: NaN };

  const closePrices = candles.map((c) => c.close);
  const macdValues = technicalIndicators.MACD.calculate({
    fastPeriod: fast,
    slowPeriod: slow,
    signalPeriod: signal,
    values: closePrices,
  });

  if (macdValues.length === 0) return { macdLine: NaN, signalLine: NaN };

  const lastMACD = macdValues[macdValues.length - 1];
  return {
    macdLine: lastMACD.MACD || NaN,
    signalLine: lastMACD.signal || NaN,
  };
}

function checkVolumeSpike(candles, lookback = 10) {
  if (!candles || candles.length < lookback + 1) return false;

  const avgVol =
    candles.slice(-lookback - 1, -1).reduce((sum, c) => sum + c.volume, 0) /
    lookback;
  const lastVol = candles[candles.length - 1].volume;
  return lastVol > avgVol * 1.2;
}

async function decideTradeDirection(symbol) {
  try {
    console.log(`🔍 Checking ${symbol}...`);

    const candles5m = await getCandles(symbol, TIMEFRAME_MAIN, 50);
    const candles15m = await getCandles(symbol, TIMEFRAME_TREND, 50);

    // Debug: Check if we got valid candle data
    if (!candles5m || candles5m.length === 0) {
      console.log(`❌ No 5m candle data for ${symbol}`);
      return "HOLD";
    }

    if (!candles15m || candles15m.length === 0) {
      console.log(`❌ No 15m candle data for ${symbol}`);
      return "HOLD";
    }

    // Use the library version for more accurate calculations
    const ema9 = calculateEMAWithLibrary(9, candles5m);
    const ema15 = calculateEMAWithLibrary(15, candles5m);
    const emaAngle = getEMAangle(ema9, ema15);

    console.log(`📈 EMA(9): ${ema9.toFixed(6)} | EMA(15): ${ema15.toFixed(6)}`);
    console.log(`📐 EMA Angle: ${emaAngle.toFixed(2)}°`);

    if (isNaN(emaAngle) || Math.abs(emaAngle) < 10) {
      console.log(`⚠️ EMA angle too flat or invalid (<10°). Decision: HOLD`);
      return "HOLD";
    }

    const lastCandle = candles5m[candles5m.length - 1];
    const candleType = detectCandleType(lastCandle);

    console.log(`🕯️ Last Candle Type: ${candleType}`);
    if (candleType === "none") {
      console.log(`⚠️ No candle signal detected. Decision: HOLD`);
      return "HOLD";
    }

    const rsi15m = calculateRSI(candles15m);
    console.log(`💪 RSI (15m): ${rsi15m.toFixed(2)}`);

    const { macdLine, signalLine } = calculateMACD(candles5m);
    console.log(
      `📊 MACD Line: ${macdLine.toFixed(6)} | Signal Line: ${signalLine.toFixed(
        6
      )}`
    );

    const volumeSpike = checkVolumeSpike(candles5m);
    console.log(
      `📢 Volume Spike Detected: ${volumeSpike ? "✅ YES" : "❌ NO"}`
    );

    // Check for valid values before making decisions
    if (isNaN(rsi15m) || isNaN(macdLine) || isNaN(signalLine)) {
      console.log(`⚠️ Invalid indicator values. Decision: HOLD`);
      return "HOLD";
    }

    if (
      ema9 > ema15 &&
      emaAngle > EMA_ANGLE_THRESHOLD &&
      rsi15m > 50 &&
      macdLine > signalLine &&
      volumeSpike
    ) {
      console.log(`✅ Conditions met for LONG`);
      return "LONG";
    }

    if (
      ema15 > ema9 &&
      emaAngle < -EMA_ANGLE_THRESHOLD &&
      rsi15m < 50 &&
      macdLine < signalLine &&
      volumeSpike
    ) {
      console.log(`✅ Conditions met for SHORT`);
      return "SHORT";
    }

    console.log(`⚖️ Conditions not fully met. Decision: HOLD`);
    return "HOLD";
  } catch (err) {
    console.error("❌ Decision error:", err.message);
    return "HOLD";
  }
}

setInterval(async () => {
  for (const sym of symbols) {
    const result = await decideTradeDirection(sym);
    console.log("Signal:", result);
    console.log("---"); // Add separator for readability
  }
}, 5000);

// module.exports = { decideTradeDirection };
