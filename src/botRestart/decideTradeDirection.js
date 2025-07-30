const technicalIndicators = require("technicalindicators");
const Binance = require("node-binance-api");

const binance = new Binance().options({
  APIKEY: "whfiekZqKdkwa9fEeUupVdLZTNxBqP1OCEuH2pjyImaWt51FdpouPPrCawxbsupK",
  APISECRET: "E4IcteWOQ6r9qKrBZJoBy4R47nNPBDepVXMnS3Lf2Bz76dlu0QZCNh82beG2rHq4",
  useServerTime: true,
  test: false,
});

const TIMEFRAME_MAIN = "1m";
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

function getEMAAngleFromSeries(emaSeries, lookback = 5) {
  if (emaSeries.length < lookback + 1) return 0;

  const recent = emaSeries[emaSeries.length - 1];
  const past = emaSeries[emaSeries.length - 1 - lookback];
  const delta = (recent - past) * 1000;
  const angleRad = Math.atan(delta / lookback);
  return angleRad * (180 / Math.PI);
}

function detectCandleType(candle) {
  const body = Math.abs(candle.close - candle.open);
  const upperWick = candle.high - Math.max(candle.close, candle.open);
  const lowerWick = Math.min(candle.close, candle.open) - candle.low;
  const range = candle.high - candle.low;
  if (lowerWick > 2 * body || upperWick > 2 * body) return "pinbar";
  if (range > 1.5 * body && body / range > 0.7) return "bigbar";
  if (body / range > 0.85) return "fullbody";
  return "none";
}

function calculateRSI(candles, period = 14) {
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

function calculateMACD(candles, fast = 12, slow = 26, signal = 9) {
  const closes = candles.map((c) => c.close);
  const macd = technicalIndicators.MACD.calculate({
    fastPeriod: fast,
    slowPeriod: slow,
    signalPeriod: signal,
    SimpleMAOscillator: false,
    SimpleMASignal: false,
    values: closes,
  });

  if (!macd.length) return { macdLine: 0, signalLine: 0 };

  const last = macd[macd.length - 1];
  return { macdLine: last.MACD, signalLine: last.signal };
}

function checkVolumeSpike(candles, lookback = 10) {
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

    const closes5m = candles5m.map((c) => c.close);
    const ema9Series = calculateEMAseries(9, closes5m);
    const ema15Series = calculateEMAseries(15, closes5m);

    const ema9 = ema9Series[ema9Series.length - 1];
    const ema15 = ema15Series[ema15Series.length - 1];
    const emaAngle = getEMAAngleFromSeries(ema9Series, 5);

    console.log(`📈 EMA(9): ${ema9.toFixed(6)} | EMA(15): ${ema15.toFixed(6)}`);
    console.log(`📐 EMA Angle: ${emaAngle.toFixed(2)}°`);

    if (Math.abs(emaAngle) < 10) {
      console.log(`⚠️ EMA angle too flat (<10°). Decision: HOLD`);
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
    console.log(`📢 Signal for ${sym}:`, result);
  }
}, 10000);
// module.exports = { decideTradeDirection };
