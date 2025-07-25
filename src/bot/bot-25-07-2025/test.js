const Binance = require("node-binance-api");
const technicalIndicators = require("technicalindicators");
const axios = require("axios");
const { sendTelegram } = require("../../../helper/teleMassage.js");

const API_ENDPOINT = "http://localhost:3000/signal";
const binance = new Binance().options({});

const interval = "1m";
const quantity = 0.1;

let openPositions = {};

async function getCandles(symbol, interval = "1m", limit = 100) {
  try {
    const candles = await binance.candlesticks(symbol, interval, null, {
      limit,
    });
    return candles.map((candle) => ({
      open: parseFloat(candle[1]),
      high: parseFloat(candle[2]),
      low: parseFloat(candle[3]),
      close: parseFloat(candle[4]),
      volume: parseFloat(candle[5]),
    }));
  } catch (error) {
    console.error("Error fetching candles:", error);
    return [];
  }
}

async function getIndicators(symbol) {
  const candles = await getCandles(symbol, interval, 100);
  if (candles.length < 100) return {};

  const close = candles.map((c) => c.close);
  const high = candles.map((c) => c.high);
  const low = candles.map((c) => c.low);
  const volume = candles.map((c) => c.volume);

  const ema20 = technicalIndicators.EMA.calculate({ period: 20, values: close }).slice(-1)[0];
  const ema50 = technicalIndicators.EMA.calculate({ period: 50, values: close }).slice(-1)[0];
  const rsi14 = technicalIndicators.RSI.calculate({ period: 14, values: close }).slice(-1)[0];
  const macd = technicalIndicators.MACD.calculate({
    values: close,
    fastPeriod: 12,
    slowPeriod: 26,
    signalPeriod: 9,
    SimpleMAOscillator: false,
    SimpleMASignal: false,
  }).slice(-1)[0];
  const bb = technicalIndicators.BollingerBands.calculate({
    period: 20,
    stdDev: 2,
    values: close,
  }).slice(-1)[0];
  const adx = technicalIndicators.ADX.calculate({
    period: 14,
    close,
    high,
    low,
  }).slice(-1)[0];

  return {
    ema20,
    ema50,
    rsi14,
    macdLine: macd?.MACD,
    macdSignal: macd?.signal,
    bbUpper: bb?.upper,
    bbLower: bb?.lower,
    adx: adx?.adx,
    latestVolume: volume[volume.length - 1],
    avgVolume:
      volume.slice(-20).reduce((acc, v) => acc + v, 0) / 20,
  };
}

function isBullishEngulf(prev, curr) {
  return (
    prev.open > prev.close &&
    curr.open < curr.close &&
    curr.open < prev.close &&
    curr.close > prev.open
  );
}

function isBearishEngulf(prev, curr) {
  return (
    prev.open < prev.close &&
    curr.open > curr.close &&
    curr.open > prev.close &&
    curr.close < prev.open
  );
}

async function decideTradeDirection(symbol) {
  const ind = await getIndicators(symbol);
  const candles = await getCandles(symbol, interval, 2);
  const [prev, curr] = candles;

  let score = 0;
  let signalCount = 0;

  if (ind.ema20 !== null && ind.ema50 !== null) {
    const val = ind.ema20 > ind.ema50 ? 1 : -1;
    score += val;
    signalCount++;
  }

  if (ind.rsi14 !== null) {
    const val = ind.rsi14 > 55 ? 1 : ind.rsi14 < 45 ? -1 : 0;
    if (val !== 0) signalCount++;
    score += val;
  }

  if (ind.macdLine !== null && ind.macdSignal !== null) {
    const val = ind.macdLine > ind.macdSignal ? 1 : -1;
    score += val;
    signalCount++;
  }

  if (
    ind.latestVolume !== null &&
    ind.avgVolume !== null &&
    ind.latestVolume > ind.avgVolume * 1.5
  ) {
    score += 1;
    signalCount++;
  }

  if (curr) {
    const lastClose = curr.close;
    if (ind.bbLower !== null && ind.rsi14 < 35 && lastClose < ind.bbLower) {
      score += 2;
      signalCount++;
    }
    if (ind.bbUpper !== null && ind.rsi14 > 65 && lastClose > ind.bbUpper) {
      score += 2;
      signalCount++;
    }
  }

  if (ind.adx !== null && ind.adx > 25) {
    score += 1;
    signalCount++;
  }

  if (isBullishEngulf(prev, curr)) {
    score += 2;
    signalCount++;
  }

  if (isBearishEngulf(prev, curr)) {
    score -= 2;
    signalCount++;
  }

  console.log(Trade Decision Score for ${symbol}:, score, "| Signals:", signalCount);

  if (score >= 3 && signalCount >= 3) return "LONG";
  if (score <= -3 && signalCount >= 3) return "SHORT";
  return "HOLD";
}

async function executeTrade(symbol, signal) {
  if (openPositions[symbol]) return;

  const price = (await binance.futuresPrices())[symbol];
  const entryPrice = parseFloat(price);
  const stopLoss =
    signal === "LONG"
      ? entryPrice * 0.99
      : entryPrice * 1.01;
  const takeProfit =
    signal === "LONG"
      ? entryPrice * 1.02
      : entryPrice * 0.98;

  if (signal === "LONG") {
    console.log(Executing LONG on ${symbol});
    sendTelegram(🟢 LONG: ${symbol}\nEntry: ${entryPrice});
  } else if (signal === "SHORT") {
    console.log(Executing SHORT on ${symbol});
    sendTelegram(🔴 SHORT: ${symbol}\nEntry: ${entryPrice});
  }

  openPositions[symbol] = {
    side: signal,
    entryPrice,
    stopLoss,
    takeProfit,
  };
}

async function monitorTrade(symbol) {
  const price = (await binance.futuresPrices())[symbol];
  const currentPrice = parseFloat(price);
  const position = openPositions[symbol];
  if (!position) return;

  if (
    (position.side === "LONG" &&
      (currentPrice <= position.stopLoss ||
        currentPrice >= position.takeProfit)) ||
    (position.side === "SHORT" &&
      (currentPrice >= position.stopLoss ||
        currentPrice <= position.takeProfit))
  ) {
    console.log(
      Closing ${position.side} on ${symbol} at ${currentPrice}
    );
    sendTelegram(
      ❌ Exit ${position.side}: ${symbol}\nExit: ${currentPrice}
    );
    delete openPositions[symbol];
  }
}

async function runBot() {
  const symbols = ["BTCUSDT", "ETHUSDT"];
  for (const symbol of symbols) {
    const signal = await decideTradeDirection(symbol);
    if (signal !== "HOLD") await executeTrade(symbol, signal);
    await monitorTrade(symbol);
  }
}

setInterval(runBot, 60 * 1000);