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

// Simple UT Bot Alert Logic
// async function getUTBotSignal(symbol) {
//   try {
//     const candles = await getCandles(symbol, interval, 50);

//     if (candles.length < 20) {
//       console.log("⚠️ Not enough data for UT Bot");
//       return "HOLD";
//     }

//     const closes = candles.map((c) => c.close);
//     const highs = candles.map((c) => c.high);
//     const lows = candles.map((c) => c.low);

//     // UT Bot Parameters
//     const keyValue = 1; // Key Value (sensitivity)
//     const atrPeriod = 10; // ATR Period

//     // Calculate ATR
//     const atr = technicalIndicators.ATR.calculate({
//       high: highs,
//       low: lows,
//       close: closes,
//       period: atrPeriod,
//     });

//     if (atr.length < 3) return "HOLD";

//     // Get last few values
//     const currentClose = closes[closes.length - 1];
//     const prevClose = closes[closes.length - 2];
//     const currentATR = atr[atr.length - 1];
//     const prevATR = atr[atr.length - 2];

//     // Calculate nLoss
//     const nLoss = keyValue * currentATR;
//     const prevNLoss = keyValue * prevATR;

//     // Simple trailing stop calculation
//     let trailingStop, prevTrailingStop;

//     // Current trailing stop
//     if (currentClose > prevClose) {
//       trailingStop = currentClose - nLoss; // Long side
//     } else {
//       trailingStop = currentClose + nLoss; // Short side
//     }

//     // Previous trailing stop
//     if (prevClose > closes[closes.length - 3]) {
//       prevTrailingStop = prevClose - prevNLoss;
//     } else {
//       prevTrailingStop = prevClose + prevNLoss;
//     }

//     // Signal generation
//     const longSignal =
//       prevClose <= prevTrailingStop && currentClose > trailingStop;
//     const shortSignal =
//       prevClose >= prevTrailingStop && currentClose < trailingStop;

//     console.log(`📊 UT Bot for ${symbol}:`);
//     console.log(`   Current Price: ${currentClose.toFixed(4)}`);
//     console.log(`   Trailing Stop: ${trailingStop.toFixed(4)}`);
//     console.log(`   Long Signal: ${longSignal}`);
//     console.log(`   Short Signal: ${shortSignal}`);

//     if (longSignal) return "LONG";
//     if (shortSignal) return "SHORT";
//     return "HOLD";
//   } catch (error) {
//     console.error(`❌ UT Bot Error for ${symbol}:`, error.message);
//     return "HOLD";
//   }
// }

async function getUTBotSignal(symbol) {
  try {
    const candles = await getCandles(symbol, interval, 350); // max needed 300+10

    if (candles.length < 300) {
      console.log("⚠️ Not enough data for UT Bot");
      return "HOLD";
    }

    const closes = candles.map((c) => c.close);
    const highs = candles.map((c) => c.high);
    const lows = candles.map((c) => c.low);

    // Dynamic Parameters based on price movement
    const keyValue = 1;

    const priceUp = closes[closes.length - 1] > closes[closes.length - 2];
    const atrPeriod = priceUp ? 300 : 1;

    // Calculate ATR
    const atr = technicalIndicators.ATR.calculate({
      high: highs.slice(-atrPeriod - 1),
      low: lows.slice(-atrPeriod - 1),
      close: closes.slice(-atrPeriod - 1),
      period: atrPeriod,
    });
    console.log(`atr.length`, atr.length);

    if (atr.length < 3) return "HOLD";

    const currentClose = closes[closes.length - 1];
    const prevClose = closes[closes.length - 2];
    const currentATR = atr[atr.length - 1];
    const prevATR = atr[atr.length - 2];

    const nLoss = keyValue * currentATR;
    const prevNLoss = keyValue * prevATR;

    let trailingStop, prevTrailingStop;

    if (currentClose > prevClose) {
      trailingStop = currentClose - nLoss;
    } else {
      trailingStop = currentClose + nLoss;
    }

    if (prevClose > closes[closes.length - 3]) {
      prevTrailingStop = prevClose - prevNLoss;
    } else {
      prevTrailingStop = prevClose + prevNLoss;
    }

    const longSignal =
      prevClose <= prevTrailingStop && currentClose > trailingStop;
    const shortSignal =
      prevClose >= prevTrailingStop && currentClose < trailingStop;

    console.log(`📊 UT Bot for ${symbol}:`);
    console.log(`   Current Price: ${currentClose.toFixed(4)}`);
    console.log(`   Trailing Stop: ${trailingStop.toFixed(4)}`);
    console.log(`   ATR Period Used: ${atrPeriod}`);
    console.log(`   Long Signal: ${longSignal}`);
    console.log(`   Short Signal: ${shortSignal}`);

    if (longSignal) return "LONG";
    if (shortSignal) return "SHORT";
    return "HOLD";
  } catch (error) {
    console.error(`❌ UT Bot Error for ${symbol}:`, error.message);
    return "HOLD";
  }
}

// Main decision function - only uses UT Bot
async function decideTradeDirection(symbol) {
  console.log(`🤖 Analyzing ${symbol} with UT Bot...`);

  const utSignal = await getUTBotSignal(symbol);

  console.log(`🎯 Final Decision for ${symbol}: ${utSignal}`);

  return utSignal;
}

// Export the main function
module.exports = { decideTradeDirection };
