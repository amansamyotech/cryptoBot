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
    const candles = await getCandles(symbol, interval, 500); // fetch enough data

    const closes = candles.map((c) => c.close);
    const highs = candles.map((c) => c.high);
    const lows = candles.map((c) => c.low);

    const keyValue = 1;
    const priceUp = closes[closes.length - 1] > closes[closes.length - 2];

    // Option A: Use realistic UT Bot ATR periods
    const atrPeriod = priceUp ? 21 : 5;

    // Option B: Use your original 300/1 (but this gives low ATR values, not recommended)
    // const atrPeriod = priceUp ? 300 : 1;

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

    console.log(`🔍 Symbol: ${symbol}`);
    console.log(`ATR Period: ${atrPeriod}`);
    console.log(`Candles Slice Length: ${highsSlice.length}`);
    console.log(`ATR Output Length: ${atr.length}`);

    if (atr.length < 3) {
      console.log("⚠️ Not enough ATR data");
      return "HOLD";
    }

    const currentClose = closes[closes.length - 1];
    const prevClose = closes[closes.length - 2];
    const currentATR = atr[atr.length - 1];
    const prevATR = atr[atr.length - 2];

    const nLoss = keyValue * currentATR;
    const prevNLoss = keyValue * prevATR;

    let trailingStop, prevTrailingStop;

    trailingStop =
      currentClose > prevClose ? currentClose - nLoss : currentClose + nLoss;

    prevTrailingStop =
      prevClose > closes[closes.length - 3]
        ? prevClose - prevNLoss
        : prevClose + prevNLoss;

    const longSignal =
      prevClose <= prevTrailingStop && currentClose > trailingStop;

    const shortSignal =
      prevClose >= prevTrailingStop && currentClose < trailingStop;

    console.log(`📈 Current Close: ${currentClose}`);
    console.log(`Trailing Stop: ${trailingStop}`);
    console.log(`Prev Trailing Stop: ${prevTrailingStop}`);
    console.log(`Long: ${longSignal} | Short: ${shortSignal}`);

    if (longSignal) {
      console.log("✅ LONG SIGNAL");
      return "LONG";
    }

    if (shortSignal) {
      console.log("⛔ SHORT SIGNAL");
      return "SHORT";
    }

    console.log("🔸 HOLD - No trade signal");
    return "HOLD";
  } catch (err) {
    console.error(`❌ Error in UT Bot for ${symbol}:`, err.message);
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
