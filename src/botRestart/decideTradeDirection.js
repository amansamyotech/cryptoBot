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
function calculateEMA(period, candles) {
  const k = 2 / (period + 1);
  let ema = candles[0].close;
  for (let i = 1; i < candles.length; i++) {
    ema = candles[i].close * k + ema * (1 - k);
  }
  return ema;
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

function getEMAangle(emaShort, emaLong, timeSpan = 5) {
  const delta = emaShort - emaLong;
  const angleRad = Math.atan(delta / timeSpan);
  return angleRad * (180 / Math.PI);
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
  const fastEMA = calculateEMA(fast, candles);
  const slowEMA = calculateEMA(slow, candles);
  const macdLine = fastEMA - slowEMA;
  const macdHistory = candles.map((c, i) => {
    if (i < slow) return 0;
    const fastE = calculateEMA(fast, candles.slice(i - fast + 1, i + 1));
    const slowE = calculateEMA(slow, candles.slice(i - slow + 1, i + 1));
    return fastE - slowE;
  });
  const signalLine = calculateEMA(signal, macdHistory.slice(-signal));
  return { macdLine, signalLine };
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

    const ema9 = calculateEMA(9, candles5m);
    const ema15 = calculateEMA(15, candles5m);
    const emaAngle = getEMAangle(ema9, ema15);

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
    console.log(`📊 MACD Line: ${macdLine.toFixed(6)} | Signal Line: ${signalLine.toFixed(6)}`);

    const volumeSpike = checkVolumeSpike(candles5m);
    console.log(`📢 Volume Spike Detected: ${volumeSpike ? "✅ YES" : "❌ NO"}`);

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
  }
}, 5000);

// module.exports = { decideTradeDirection };
