// 📦 Dependencies
const Binance = require("node-binance-api");
const technicalIndicators = require("technicalindicators");
const axios = require("axios");
const { sendTelegram } = require("../helper/teleMassage.js");

// 🔐 Configure your Binance Futures API keys
const binance = new Binance().options({
  APIKEY: "whfiekZqKdkwa9fEeUupVdLZTNxBqP1OCEuH2pjyImaWt51FdpouPPrCawxbsupK",
  APISECRET: "E4IcteWOQ6r9qKrBZJoBy4R47nNPBDepVXMnS3Lf2Bz76dlu0QZCNh82beG2rHq4",
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
const leverage = 1; // Leverage

const openPositions = {}; // Track open positions

// 💰 Get wallet balance
async function getUsdtBalance() {
  try {
    const account = await binance.futuresBalance();
    const usdtBalance = parseFloat(
      account.find((asset) => asset.asset === "USDT")?.balance || 0
    );
    return usdtBalance;
  } catch (err) {
    console.error("Error fetching balance:", err);
    return 0;
  }
}

// Set leverage before trading
async function setLeverage(symbol) {
  try {
    await binance.futuresLeverage(symbol, leverage);
    console.log(`Leverage set to ${leverage}x for ${symbol}`);
  } catch (err) {
    console.error(`Failed to set leverage for ${symbol}:, err.body`);
  }
}

// ⏳ Fetch candlestick data
async function getCandles(symbol, interval, limit = 100) {
  const candles = await binance.futuresCandles(symbol, interval, { limit });
  return candles.map((c) => ({
    close: parseFloat(c.close),
    volume: parseFloat(c.volume),
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

  console.log("----------Indicators----------", {
    ema9: ema9.at(-1),
    ema21: ema21.at(-1),
    rsi: rsi.at(-1),
    macdLine: macd.at(-1)?.MACD,
    macdSignal: macd.at(-1)?.signal,
    volume: volumes.at(-1),
    avgVolume,
  });

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

// 🧠 Decide Trade Direction
async function decideTradeDirection(symbol) {
  console.log(`decideTradeDirection(symbol)`, symbol);

  const ind = await getIndicators(symbol);

  if (
    ind.ema9 > ind.ema21 &&
    ind.rsi > 50 &&
    ind.macdLine > ind.macdSignal
    // ind.volume > ind.avgVolume * 1.5
  ) {
    return "LONG";
  }

  if (
    ind.ema9 < ind.ema21 &&
    ind.rsi < 50 &&
    ind.macdLine < ind.macdSignal
    // ind.volume > ind.avgVolume * 1.2
  ) {
    return "SHORT";
  }

  return "HOLD";
}

// 📈 Buy/Short Logic
async function processSymbol(symbol, maxSpendPerTrade) {
  if (openPositions[symbol]) {
    console.log(`Position already open for ${symbol}, skipping.`);
    return;
  }

  const decision = await decideTradeDirection(symbol);

  if (decision === "LONG") {
    sendTelegram(`✨ LONG SIGNAL for ${symbol}`);
    await placeBuyOrder(symbol, maxSpendPerTrade);
    openPositions[symbol] = true;
  } else if (decision === "SHORT") {
    sendTelegram(`✨ SHORT SIGNAL for ${symbol}`);
    await placeShortOrder(symbol, maxSpendPerTrade);
    openPositions[symbol] = true;
  } else {
    sendTelegram(`No trade signal for ${symbol}`);
    console.log(`No trade signal for ${symbol}`);
  }
}

// 💰 Place Buy Order + Stop Loss
async function placeBuyOrder(symbol, maxSpend) {
  await setLeverage(symbol);

  const price = (await binance.futuresPrices())[symbol];
  const entryPrice = parseFloat(price);
  const qty = parseFloat((maxSpend / entryPrice).toFixed(0));

  const stopLoss = (entryPrice * 0.99 - 0.0001).toFixed(6);
  const takeProfit = (entryPrice * 1.01 + 0.0001).toFixed(6);

  await binance.futuresMarketBuy(symbol, qty);
  sendTelegram(`🟢Bought ${symbol} at ${entryPrice}`);
  console.log(`Bought ${symbol} at ${entryPrice}`);

  await binance.futuresOrder("STOP_MARKET", "SELL", symbol, qty, null, {
    stopPrice: stopLoss,
    reduceOnly: true,
    timeInForce: "GTC",
  });
  console.log(`Stop loss set at ${stopLoss} for ${symbol}`);

  await binance.futuresOrder("TAKE_PROFIT_MARKET", "SELL", symbol, qty, null, {
    stopPrice: takeProfit,
    reduceOnly: true,
    timeInForce: "GTC",
  });

  console.log(`Take profit set at ${takeProfit} for ${symbol}`);
}

// 📉 Place Short Order + Stop Loss
async function placeShortOrder(symbol, maxSpend) {
  await setLeverage(symbol);
  const price = (await binance.futuresPrices())[symbol];
  const entryPrice = parseFloat(price);
  const qty = parseFloat((maxSpend / entryPrice).toFixed(0));
  const stopLoss = (entryPrice * 1.01 + 0.0001).toFixed(6);
  const takeProfit = (entryPrice * 0.99 - 0.0001).toFixed(6);

  await binance.futuresMarketSell(symbol, qty);
  sendTelegram(`🔴Shorted ${symbol} at ${entryPrice}`);
  console.log(`Shorted ${symbol} at ${entryPrice}`);

  await binance.futuresOrder("STOP_MARKET", "BUY", symbol, qty, null, {
    stopPrice: stopLoss,
    reduceOnly: true,
    timeInForce: "GTC",
  });
  console.log(`Stop loss (short) set at ${stopLoss} for ${symbol}`);

  await binance.futuresOrder("TAKE_PROFIT_MARKET", "BUY", symbol, qty, null, {
    stopPrice: takeProfit,
    reduceOnly: true,
    timeInForce: "GTC",
  });
  console.log(`Take profit (short) set at ${takeProfit} for ${symbol}`);
}

// 🔁 Main Loop
setInterval(async () => {
  const totalBalance = await getUsdtBalance();
  const usableBalance = totalBalance - 6; // Keep $6 reserve
  const maxSpendPerTrade = usableBalance / symbols.length;

  if (usableBalance <= 0) {
    console.log("Not enough balance to trade.");
    return;
  }

  for (const sym of symbols) {
    try {
      await processSymbol(sym, maxSpendPerTrade);
    } catch (err) {
      console.error(`Error with ${sym}:`, err);
    }
  }
}, 60 * 1000); // Run every 10 sec
