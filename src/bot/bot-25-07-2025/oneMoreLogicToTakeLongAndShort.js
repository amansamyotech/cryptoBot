const technicalIndicators = require("technicalindicators");
const Binance = require("node-binance-api");

const binance = new Binance().options({
  APIKEY: "whfiekZqKdkwa9fEeUupVdLZTNxBqP1OCEuH2pjyImaWt51FdpouPPrCawxbsupK",
  APISECRET: "E4IcteWOQ6r9qKrBZJoBy4R47nNPBDepVXMnS3Lf2Bz76dlu0QZCNh82beG2rHq4",
  useServerTime: true,
  test: false,
});

const interval = "3m";

async function getCandles(symbol, interval, limit = 100) {
  const candles = await binance.futuresCandles(symbol, interval, { limit });
  return candles.map((c) => ({
    open: parseFloat(c.open),
    high: parseFloat(c.high),
    low: parseFloat(c.low),
    close: parseFloat(c.close),
    volume: parseFloat(c.volume),
  }));
}

async function getUTBotSignal(symbol, candles) {
  // Your UT Bot signal code, modified to accept candles param to avoid repeated fetch
  const closes = candles.map((c) => c.close);
  const highs = candles.map((c) => c.high);
  const lows = candles.map((c) => c.low);

  const keyValue = 1;
  const priceUp = closes[closes.length - 1] > closes[closes.length - 2];
  const atrPeriod = priceUp ? 21 : 5;

  const sliceStart = -atrPeriod - 5;
  const highsSlice = highs.slice(sliceStart);
  const lowsSlice = lows.slice(sliceStart);
  const closesSlice = closes.slice(sliceStart);

  const atr = technicalIndicators.ATR.calculate({
    high: highsSlice,
    low: lowsSlice,
    close: closesSlice,
    period: atrPeriod,
  });

  if (atr.length < 3) return "HOLD";

  const currentClose = closes[closes.length - 1];
  const prevClose = closes[closes.length - 2];
  const currentATR = atr[atr.length - 1];
  const prevATR = atr[atr.length - 2];

  const nLoss = keyValue * currentATR;
  const prevNLoss = keyValue * prevATR;

  const trailingStop =
    currentClose > prevClose ? currentClose - nLoss : currentClose + nLoss;
  const prevTrailingStop =
    prevClose > closes[closes.length - 3]
      ? prevClose - prevNLoss
      : prevClose + prevNLoss;

  const longSignal =
    prevClose <= prevTrailingStop && currentClose > trailingStop;
  const shortSignal =
    prevClose >= prevTrailingStop && currentClose < trailingStop;

  if (longSignal) return "LONG";
  if (shortSignal) return "SHORT";
  return "HOLD";
}

async function decideTradeDirection(symbol) {
  console.log(`🤖 Analyzing ${symbol} with UT Bot and EMA...`);

  // Fetch candles once for all indicators
  const candles = await getCandles(symbol, interval, 100);

  if (candles.length < 20) {
    console.log("⚠️ Not enough candles data");
    return "HOLD";
  }

  // Get UT Bot signal
  const utSignal = await getUTBotSignal(symbol, candles);

  // Calculate EMA9 and EMA15 on closes
  const closes = candles.map((c) => c.close);

  const ema9 = technicalIndicators.EMA.calculate({ period: 9, values: closes });
  const ema15 = technicalIndicators.EMA.calculate({
    period: 15,
    values: closes,
  });

  if (ema9.length === 0 || ema15.length === 0) {
    console.log("⚠️ Not enough data for EMA");
    return utSignal; // fallback to UT Bot only
  }

  const lastEMA9 = ema9[ema9.length - 1];
  const prevEMA9 = ema9[ema9.length - 2];
  const lastEMA15 = ema15[ema15.length - 1];
  const prevEMA15 = ema15[ema15.length - 2];

  // Check for EMA crossovers
  const bullishCross = prevEMA9 <= prevEMA15 && lastEMA9 > lastEMA15; // EMA9 crossed above EMA15
  const bearishCross = prevEMA9 >= prevEMA15 && lastEMA9 < lastEMA15; // EMA9 crossed below EMA15

  // Combine signals logic
  let finalSignal = "HOLD";

  if (utSignal === "LONG" && (bullishCross || lastEMA9 > lastEMA15)) {
    finalSignal = "LONG";
  } else if (utSignal === "SHORT" && (bearishCross || lastEMA9 < lastEMA15)) {
    finalSignal = "SHORT";
  } else {
    finalSignal = "HOLD";
  }

  console.log(`UT Bot Signal: ${utSignal}`);
  console.log(`EMA9: ${lastEMA9.toFixed(4)}, EMA15: ${lastEMA15.toFixed(4)}`);
  console.log(`Bullish Cross: ${bullishCross}, Bearish Cross: ${bearishCross}`);
  console.log(`🎯 Final Decision for ${symbol}: ${finalSignal}`);

  return finalSignal;
}

module.exports = { decideTradeDirection };
