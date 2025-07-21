// 📦 Dependencies
const Binance = require("node-binance-api");
const technicalIndicators = require("technicalindicators");
const axios = require("axios");

// 🔐 Configure your Binance Futures API keys
const binance = new Binance().options({
  APIKEY: "uMAxmpJSfdoVCCI76lGqWiM7om17Jue6CZHUVMaAPEPAu36egK6Pzk8QTfoeq4RP",
  APISECRET: "VIaeb6MxIvLCTczm2ju74rvFifSY2BA1Fwkisx0B76jeMB0tmppCZtIRqV9MgnOE",
  useServerTime: true,
  test: false, // Set to true for testnet
});

// ⚙️ Bot Config
const symbols = [
  "PEPEUSDT",
  "DOGEUSDT",
  "ETHUSDT",
  "SOLUSDT",
  "LINKUSDT",
  "XRPUSDT",
  "ADAUSDT",
];
const quantity = 0.001; // Adjust your trade size
const interval = "5m";
const leverage = 1; // Leverage

const openPositions = {}; // Track open positions

// Set leverage before trading
async function setLeverage(symbol) {
  try {
    await binance.futuresLeverage(symbol, leverage);
    console.log(`Leverage set to ${leverage}x for ${symbol}`);
  } catch (err) {
    console.error(`Failed to set leverage for ${symbol}:`, err.body);
  }
}

// ⏳ Fetch candlestick data
async function getCandles(symbol, interval, limit = 100) {
  const candles = await binance.futuresCandles(symbol, interval, { limit });
  return candles.map((c) => ({
    close: parseFloat(c[4]),
    volume: parseFloat(c[5]),
  }));
}

// 📊 Calculate indicators
async function getIndicators(symbol) {
  const candles = await getCandles(symbol, interval);
  const closes = candles.map((c) => c.close);
  const volumes = candles.map((c) => c.volume);

  const ema9 = technicalIndicators.EMA.calculate({ period: 9, values: closes });
  const ema21 = technicalIndicators.EMA.calculate({
    period: 21,
    values: closes,
  });
  const rsi = technicalIndicators.RSI.calculate({ period: 14, values: closes });
  const macd = technicalIndicators.MACD.calculate({
    values: closes,
    fastPeriod: 12,
    slowPeriod: 26,
    signalPeriod: 9,
    SimpleMAOscillator: false,
    SimpleMASignal: false,
  });

  const avgVolume = volumes.slice(-20).reduce((a, b) => a + b, 0) / 20;

  return {
    ema9: ema9.at(-1),
    ema21: ema21.at(-1),
    rsi: rsi.at(-1),
    macdLine: macd.at(-1)?.MACD,
    macdSignal: macd.at(-1)?.signal,
    volume: volumes.at(-1),
    avgVolume,
  };
}

// 📈 Buy Logic
async function checkBuy(symbol) {
  if (openPositions[symbol]) {
    console.log(`Skipping BUY for ${symbol}: Position already open.`);
    return;
  }
  const ind = await getIndicators(symbol);
  if (
    ind.ema9 > ind.ema21 &&
    ind.rsi > 50 &&
    ind.macdLine > ind.macdSignal &&
    ind.volume > ind.avgVolume * 1.5
  ) {
    console.log(`✨ BUY SIGNAL for ${symbol}`);
    await placeBuyOrder(symbol);
    openPositions[symbol] = true;
  } else {
    console.log(`No Buy Signal for ${symbol}`);
  }
}

// 📉 Sell Logic
async function checkSell(symbol) {
  if (!openPositions[symbol]) {
    console.log(`Skipping SELL for ${symbol}: No open position.`);
    return;
  }
  const ind = await getIndicators(symbol);
  if (
    ind.ema9 < ind.ema21 &&
    ind.rsi < 50 &&
    ind.macdLine < ind.macdSignal &&
    ind.volume > ind.avgVolume * 1.2
  ) {
    console.log(`❌ SELL SIGNAL for ${symbol}`);
    await placeSellOrder(symbol);
    openPositions[symbol] = false;
  } else {
    console.log(`No Sell Signal for ${symbol}`);
  }
}

// 🛒 Place Buy Order + Stop Loss
async function placeBuyOrder(symbol) {
  await setLeverage(symbol);
  const price = (await binance.futuresPrices())[symbol];
  const entryPrice = parseFloat(price);
  const stopLoss = (entryPrice * 0.99).toFixed(2); // 1% Stop Loss

  await binance.futuresMarketBuy(symbol, quantity);
  console.log(`Bought ${symbol} at ${entryPrice}`);

  await binance.futuresOrder("STOP_MARKET", symbol, quantity, null, {
    stopPrice: stopLoss,
    side: "SELL",
    reduceOnly: true,
    timeInForce: "GTC",
  });
  console.log(`Stop loss set at ${stopLoss} for ${symbol}`);
}

// 💰 Place Sell Order + Stop Loss (for shorts)
async function placeSellOrder(symbol) {
  await setLeverage(symbol);
  const price = (await binance.futuresPrices())[symbol];
  const entryPrice = parseFloat(price);
  const stopLoss = (entryPrice * 1.01).toFixed(2); // 1% Stop Loss

  await binance.futuresMarketSell(symbol, quantity);
  console.log(`Sold ${symbol} at ${entryPrice}`);

  await binance.futuresOrder("STOP_MARKET", symbol, quantity, null, {
    stopPrice: stopLoss,
    side: "BUY",
    reduceOnly: true,
    timeInForce: "GTC",
  });
  console.log(`Stop loss (short) set at ${stopLoss} for ${symbol}`);
}

// 🔁 Main Loop
setInterval(async () => {
  for (const sym of symbols) {
    try {
      await checkBuy(sym);
      await checkSell(sym);
    } catch (err) {
      console.error(`Error with ${sym}:`, err);
    }
  }
}, 10000); // Run every 1 minute
