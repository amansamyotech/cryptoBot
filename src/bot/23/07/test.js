// 📦 Dependencies
const Binance = require("node-binance-api");
const technicalIndicators = require("technicalindicators");
const axios = require("axios");
const { sendTelegram } = require("../helper/teleMassage.js");

const API_ENDPOINT = "http://localhost:3000/api/buySell/";

// 🔐 Configure your Binance Futures API keys
const binance = new Binance().options({
  APIKEY: process.env.BINANCE_API_KEY,
  APISECRET: process.env.BINANCE_API_SECRET,
  useServerTime: true,
  test: false, // Set to true for testnet
});

// ⚙️ Bot Config
const symbols = [
  "1000PEPEUSDT",
  "1000SHIBUSDT",
  "1000BONKUSDT",
  "1000FLOKIUSDT",
  "DOGEUSDT",
];
const interval = "5m";
const leverage = 1;

// 💰 Get wallet balance
async function getUsdtBalance() {
  try {
    const account = await binance.futuresBalance();
    return parseFloat(
      account.find(asset => asset.asset === 'USDT')?.balance || 0
    );
  } catch (err) {
    console.error('Error fetching balance:', err);
    return 0;
  }
}

// Set leverage before trading
async function setLeverage(symbol) {
  try {
    await binance.futuresLeverage(symbol, leverage);
    console.log(Leverage set to ${leverage}x for ${symbol});
  } catch (err) {
    console.error(Failed to set leverage for ${symbol}:, err.body || err);
  }
}

// ⏳ Fetch candlestick data
async function getCandles(symbol, interval, limit = 100) {
  const raw = await binance.futuresCandles(symbol, interval, { limit });
  return raw.map(c => ({
    open: parseFloat(c.open),
    high: parseFloat(c.high),
    low: parseFloat(c.low),
    close: parseFloat(c.close),
    volume: parseFloat(c.volume),
  }));
}

// 📊 Calculate indicators
async function getIndicators(symbol) {
  const candles = await getCandles(symbol, interval, 100);
  const closes = candles.map(c => c.close);
  const highs = candles.map(c => c.high);
  const lows = candles.map(c => c.low);
  const volumes = candles.map(c => c.volume);

  // EMA
  const ema20Arr = technicalIndicators.EMA.calculate({ period: 20, values: closes });
  const ema50Arr = technicalIndicators.EMA.calculate({ period: 50, values: closes });
  const ema20 = ema20Arr.length ? ema20Arr.pop() : null;
  const ema50 = ema50Arr.length ? ema50Arr.pop() : null;

  // RSI
  const rsiArr = technicalIndicators.RSI.calculate({ period: 14, values: closes });
  const rsi14 = rsiArr.length ? rsiArr.pop() : null;

  // MACD
  const macdArr = technicalIndicators.MACD.calculate({
    values: closes,
    fastPeriod: 12,
    slowPeriod: 26,
    signalPeriod: 9,
    SimpleMAOscillator: false,
    SimpleMASignal: false
  });
  const macdData = macdArr.length ? macdArr.pop() : {};
  const macdLine = macdData.MACD ?? null;
  const macdSignal = macdData.signal ?? null;

  // Bollinger Bands
  const bbArr = technicalIndicators.BollingerBands.calculate({ period: 20, stdDev: 2, values: closes });
  const bbData = bbArr.length ? bbArr.pop() : {};
  const bbUpper = bbData.upper ?? null;
  const bbLower = bbData.lower ?? null;

  // ADX
  const adxArr = technicalIndicators.ADX.calculate({ period: 14, high: highs, low: lows, close: closes });
  const adxData = adxArr.length ? adxArr.pop() : {};
  const adx = adxData.adx ?? null;

  // VWMA manual calculation (20-period)
  let vwma = null;
  if (closes.length >= 20 && volumes.length >= 20) {
    const sliceCloses = closes.slice(-20);
    const sliceVolumes = volumes.slice(-20);
    const totalVol = sliceVolumes.reduce((a, b) => a + b, 0);
    const weightedSum = sliceCloses.reduce((sum, c, i) => sum + c * sliceVolumes[i], 0);
    vwma = totalVol ? weightedSum / totalVol : null;
  }

  // Volume
  const latestVolume = volumes.length ? volumes.pop() : null;
  const avgVolume = volumes.length >= 20
    ? volumes.slice(-20).reduce((sum, v) => sum + v, 0) / 20
    : null;

  return { ema20, ema50, rsi14, macdLine, macdSignal, bbUpper, bbLower, adx, vwma, latestVolume, avgVolume };
}

// Candlestick pattern detection
function isBullishEngulf(prev, curr) {
  return prev && curr && curr.open < prev.close && curr.close > prev.open;
}
function isBearishEngulf(prev, curr) {
  return prev && curr && curr.open > prev.close && curr.close < prev.open;
}

// 🧠 Decide Trade Direction using composite scoring
async function decideTradeDirection(symbol) {
  const ind = await getIndicators(symbol);
  const candles = await getCandles(symbol, interval, 2);
  const [prev, curr] = candles;

  let score = 0;
  if (ind.ema20 !== null && ind.ema50 !== null) score += ind.ema20 > ind.ema50 ? 1 : -1;
  if (ind.rsi14 !== null) score += ind.rsi14 > 55 ? 1 : ind.rsi14 < 45 ? -1 : 0;
  if (ind.macdLine !== null && ind.macdSignal !== null) score += ind.macdLine > ind.macdSignal ? 1 : -1;
  if (ind.latestVolume !== null && ind.avgVolume !== null && ind.latestVolume > ind.avgVolume * 1.5) score += 1;
  if (curr) {
    const lastClose = curr.close;
    if (bbLower !== null && ind.rsi14 < 35 && lastClose < ind.bbLower) score += 2;
    if (ind.bbUpper !== null && ind.rsi14 > 65 && lastClose > ind.bbUpper) score += 2;
  }
  if (ind.adx !== null && ind.adx > 25) score += 1;
  if (isBullishEngulf(prev, curr)) score += 2;
  if (isBearishEngulf(prev, curr)) score += 2;

  if (score >= 6) return 'LONG';
  if (score <= -6) return 'SHORT';
  return 'HOLD';
}

// 📈 Buy/Short Logic (unchanged)
async function processSymbol(symbol, maxSpend) {
  const decision = await decideTradeDirection(symbol);
  if (decision === 'LONG') { sendTelegram(✨ LONG SIGNAL for ${symbol}); await placeBuyOrder(symbol, maxSpend); }
  else if (decision === 'SHORT') { sendTelegram(✨ SHORT SIGNAL for ${symbol}); await placeShortOrder(symbol, maxSpend); }
  else console.log(No signal for ${symbol});
}

// 🔁 Main Loop and Order Checker (unchanged)