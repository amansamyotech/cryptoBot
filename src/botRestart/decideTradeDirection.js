const technicalIndicators = require("technicalindicators");
const Binance = require("node-binance-api");

const binance = new Binance().options({
  APIKEY: "whfiekZqKdkwa9fEeUupVdLZTNxBqP1OCEuH2pjyImaWt51FdpouPPrCawxbsupK",
  APISECRET: "E4IcteWOQ6r9qKrBZJoBy4R47nNPBDepVXMnS3Lf2Bz76dlu0QZCNh82beG2rHq4",
  useServerTime: true,
  test: false,
});

const TIMEFRAME_MAIN = "1m";
const TIMEFRAME_TREND = "5m";
const EMA_ANGLE_THRESHOLD = 15;
const MIN_ANGLE_THRESHOLD = 9;
const VOLATILITY_MULTIPLIER = 10000;

const symbols = [
  "1000PEPEUSDT",
  "1000BONKUSDT",
  "DOGEUSDT",
  "CKBUSDT",
  "1000FLOKIUSDT",
];

async function getCandles(symbol, interval, limit = 100) {
  const candles = await binance.futuresCandles(symbol, interval, { limit });

  if (!Array.isArray(candles) || !candles.length) {
    console.error(`❌ Invalid candle data for ${symbol} - ${interval}`);
    return [];
  }

  return candles.map((c, idx) => {
    const isObjectFormat = typeof c === "object" && !Array.isArray(c);

    if (isObjectFormat) {
      return {
        openTime: c.openTime,
        open: parseFloat(c.open),
        high: parseFloat(c.high),
        low: parseFloat(c.low),
        close: parseFloat(c.close),
        volume: parseFloat(c.volume),
      };
    }

    if (Array.isArray(c) && c.length >= 6) {
      return {
        openTime: c[0],
        open: parseFloat(c[1]),
        high: parseFloat(c[2]),
        low: parseFloat(c[3]),
        close: parseFloat(c[4]),
        volume: parseFloat(c[5]),
      };
    }

    console.warn(`⚠️ Malformed candle at index ${idx}:`, c);
    return {
      openTime: 0,
      open: NaN,
      high: NaN,
      low: NaN,
      close: NaN,
      volume: NaN,
    };
  });
}

function calculateEMAseries(period, closes) {
  return technicalIndicators.EMA.calculate({
    period,
    values: closes,
  });
}

function getEMAAngleFromSeries(emaSeries, lookback = 3) {
  if (emaSeries.length < lookback + 1) return 0;

  const recent = emaSeries[emaSeries.length - 1];
  const past = emaSeries[emaSeries.length - 1 - lookback];
  const percentChange = ((recent - past) / past) * 100;
  const delta = percentChange * VOLATILITY_MULTIPLIER;
  const angleRad = Math.atan(delta / lookback);

  return angleRad * (180 / Math.PI);
}

function calculateVolatility(candles, period = 10) {
  const returns = [];
  for (let i = 1; i < Math.min(candles.length, period + 1); i++) {
    const ret =
      (candles[i].close - candles[i - 1].close) / candles[i - 1].close;
    returns.push(ret);
  }

  const mean = returns.reduce((sum, ret) => sum + ret, 0) / returns.length;
  const variance =
    returns.reduce((sum, ret) => sum + Math.pow(ret - mean, 2), 0) /
    returns.length;

  return Math.sqrt(variance) * 100;
}

function detectCandleType(candle) {
  const body = Math.abs(candle.close - candle.open);
  const upperWick = candle.high - Math.max(candle.close, candle.open);
  const lowerWick = Math.min(candle.close, candle.open) - candle.low;
  const range = candle.high - candle.low;

  if (lowerWick > 1.5 * body || upperWick > 1.5 * body) return "pinbar";
  if (range > 1.2 * body && body / range > 0.6) return "bigbar";
  if (body / range > 0.8) return "fullbody";

  return "none";
}

function calculateRSI(candles, period = 7) {
  if (candles.length < period + 1) return 50;

  let gains = 0,
    losses = 0;
  for (let i = 1; i <= period; i++) {
    const change = candles[i].close - candles[i - 1].close;
    if (change >= 0) gains += change;
    else losses -= change;
  }

  const avgGain = gains / period;
  const avgLoss = losses / period;
  const rs = avgGain / (avgLoss || 1);

  return 100 - 100 / (1 + rs);
}

function calculateMACD(candles, fast = 8, slow = 21, signal = 5) {
  const closes = candles.map((c) => c.close);
  const macd = technicalIndicators.MACD.calculate({
    fastPeriod: fast,
    slowPeriod: slow,
    signalPeriod: signal,
    SimpleMAOscillator: false,
    SimpleMASignal: false,
    values: closes,
  });

  if (!macd.length) return { macdLine: 0, signalLine: 0, histogram: 0 };

  const last = macd[macd.length - 1];
  return {
    macdLine: last.MACD || 0,
    signalLine: last.signal || 0,
    histogram: (last.MACD || 0) - (last.signal || 0),
  };
}

function checkVolumeSpike(candles, lookback = 5) {
  if (candles.length < lookback + 1) return false;

  const avgVol =
    candles.slice(-lookback - 1, -1).reduce((sum, c) => sum + c.volume, 0) /
    lookback;
  const lastVol = candles[candles.length - 1].volume;

  return lastVol > avgVol * 1.15;
}

function calculateMomentum(candles, period = 5) {
  if (candles.length < period + 1) return 0;

  const current = candles[candles.length - 1].close;
  const past = candles[candles.length - 1 - period].close;

  return ((current - past) / past) * 100;
}

async function decideTradeDirection(symbol) {
  try {
    console.log(`🔍 Analyzing ${symbol} for scalping...`);

    const candles1m = await getCandles(symbol, TIMEFRAME_MAIN, 100);
    const candles5m = await getCandles(symbol, TIMEFRAME_TREND, 50);

    if (candles1m.length < 50 || candles5m.length < 20) {
      console.log(`⚠️ Insufficient data for ${symbol}`);
      return "HOLD";
    }

    const closes1m = candles1m.map((c) => c.close);
    const ema5Series = calculateEMAseries(5, closes1m);
    const ema9Series = calculateEMAseries(9, closes1m);
    const ema21Series = calculateEMAseries(21, closes1m);

    const ema5 = ema5Series[ema5Series.length - 1];
    const ema9 = ema9Series[ema9Series.length - 1];
    const ema21 = ema21Series[ema21Series.length - 1];

    const ema5Angle = getEMAAngleFromSeries(ema5Series, 3);
    const ema9Angle = getEMAAngleFromSeries(ema9Series, 3);

    console.log(
      `📈 EMA(5): ${ema5.toFixed(6)} | EMA(9): ${ema9.toFixed(
        6
      )} | EMA(21): ${ema21.toFixed(6)}`
    );
    console.log(
      `📐 EMA5 Angle: ${ema5Angle.toFixed(
        2
      )}° | EMA9 Angle: ${ema9Angle.toFixed(2)}°`
    );

    const volatility = calculateVolatility(candles1m, 20);
    console.log(`🌊 Market Volatility: ${volatility.toFixed(2)}%`);
    if (volatility < 0.1) {
      console.log(`⚠️ Market too flat (volatility < 0.1%). Decision: HOLD`);
      return "HOLD";
    }

    if (
      Math.abs(ema5Angle) < MIN_ANGLE_THRESHOLD &&
      Math.abs(ema9Angle) < MIN_ANGLE_THRESHOLD
    ) {
      console.log(
        `⚠️ EMA angles too flat (<${MIN_ANGLE_THRESHOLD}°). Decision: HOLD`
      );
      return "HOLD";
    }

    const lastCandle = candles1m[candles1m.length - 1];
    const candleType = detectCandleType(lastCandle);
    console.log(`🕯️ Last Candle Type: ${candleType}`);

    const rsi1m = calculateRSI(candles1m, 7);
    const rsi5m = calculateRSI(candles5m, 14);
    console.log(
      `💪 RSI (1m): ${rsi1m.toFixed(2)} | RSI (5m): ${rsi5m.toFixed(2)}`
    );

    const { macdLine, signalLine, histogram } = calculateMACD(candles1m);
    console.log(
      `📊 MACD: ${macdLine.toFixed(6)} | Signal: ${signalLine.toFixed(
        6
      )} | Histogram: ${histogram.toFixed(6)}`
    );

    const volumeSpike = checkVolumeSpike(candles1m);
    const momentum = calculateMomentum(candles1m, 5);
    console.log(
      `📢 Volume Spike: ${
        volumeSpike ? "✅ YES" : "❌ NO"
      } | Momentum: ${momentum.toFixed(2)}%`
    );

    const longConditions = [
      ema5 > ema9,
      ema9 > ema21,
      ema5Angle > EMA_ANGLE_THRESHOLD || ema9Angle > EMA_ANGLE_THRESHOLD, 
      rsi1m > 45 && rsi1m < 80, 
      macdLine > signalLine, 
      histogram > 0, 
      momentum > 0.1,
      volumeSpike || candleType !== "none",
    ];

    const longScore = longConditions.filter(Boolean).length;
    console.log(`🟢 LONG Score: ${longScore}/8`);

    const shortConditions = [
      ema5 < ema9,
      ema9 < ema21,
      ema5Angle < -EMA_ANGLE_THRESHOLD || ema9Angle < -EMA_ANGLE_THRESHOLD, 
      rsi1m < 55 && rsi1m > 20, 
      macdLine < signalLine, 
      histogram < 0, 
      momentum < -0.1,
      volumeSpike || candleType !== "none",
    ];

    const shortScore = shortConditions.filter(Boolean).length;
    console.log(`🔴 SHORT Score: ${shortScore}/8`);

    if (longScore >= 6) {
      console.log(`✅ Strong LONG signal (Score: ${longScore}/8)`);
      return "LONG";
    }

    if (shortScore >= 6) {
      console.log(`✅ Strong SHORT signal (Score: ${shortScore}/8)`);
      return "SHORT";
    }

    // if (longScore >= 4 && longScore > shortScore) {
    //   console.log(`🟡 Weak LONG signal (Score: ${longScore}/8)`);
    //   return "WEAK_LONG";
    // }

    // if (shortScore >= 4 && shortScore > longScore) {
    //   console.log(`🟡 Weak SHORT signal (Score: ${shortScore}/8)`);
    //   return "WEAK_SHORT";
    // }

    console.log(`⚖️ No clear signal. Decision: HOLD`);
    return "HOLD";
  } catch (err) {
    console.error("❌ Decision error:", err.message);
    return "HOLD";
  }
}

console.log("🚀 Starting Enhanced Scalping Bot for Volatile Markets...");
console.log(
  `📊 Settings: EMA Angle Threshold: ${EMA_ANGLE_THRESHOLD}°, Min Angle: ${MIN_ANGLE_THRESHOLD}°`
);

setInterval(async () => {
  console.log("\n" + "=".repeat(60));
  console.log(`📅 ${new Date().toLocaleString()} - Market Scan`);
  console.log("=".repeat(60));

  for (const sym of symbols) {
    const result = await decideTradeDirection(sym);
    const emoji =
      result === "LONG"
        ? "🟢"
        : result === "SHORT"
        ? "🔴"
        : result.includes("WEAK")
        ? "🟡"
        : "⚪";
    console.log(`${emoji} Signal for ${sym}: ${result}`);
    console.log("-".repeat(40));
  }
}, 5000);

// module.exports = { decideTradeDirection };
