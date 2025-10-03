const { RSI } = require("technicalindicators");
const { getCandles } = require("./websocketsCode/getCandles");

async function getRSIStrategySignal(symbol) {
  try {
    // Fetch candles for both timeframes
    const candles3m = await getCandles(symbol, "3m", 150);
    const candles1h = await getCandles(symbol, "1h", 150);

    // Validate candle data
    if (!candles3m || candles3m.length < 21) {
      console.log("❌ Not enough 3m candle data");
      return "HOLD";
    }
    if (!candles1h || candles1h.length < 14) {
      console.log("❌ Not enough 1h candle data");
      return "HOLD";
    }

    // Extract close prices
    const closes3m = candles3m.map((c) => c.close);
    const closes1h = candles1h.map((c) => c.close);

    // Calculate RSI #1 (3m, period 21)
    const rsi3m = RSI.calculate({
      values: closes3m,
      period: 21,
    });

    // Calculate RSI #2 (1h, period 14)
    const rsi1h = RSI.calculate({
      values: closes1h,
      period: 14,
    });

    // Get latest RSI values
    const currentRSI3m = rsi3m[rsi3m.length - 1];
    const currentRSI1h = rsi1h[rsi1h.length - 1];

    console.log(`🔍 RSI#1 (3m): ${currentRSI3m.toFixed(2)}`);
    console.log(`📊 RSI#2 (1h): ${currentRSI1h.toFixed(2)}`);

    // Step 1: Check RSI #2 (1h) for initial signal
    let signal1h = "HOLD";
    if (currentRSI1h < 40) {
      signal1h = "SHORT";
    } else if (currentRSI1h > 60) {
      signal1h = "LONG";
    } else {
      console.log("✅ Final Signal: HOLD");
      return "HOLD";
    }

    // Step 2: Check RSI #1 (3m) for confirmation
    let signal3m = "HOLD";
    if (currentRSI3m > 60) {
      signal3m = "SHORT";
    } else if (currentRSI3m < 40) {
      signal3m = "LONG";
    } else {
      console.log("✅ Final Signal: HOLD");
      return "HOLD";
    }

    // Step 3: Match both signals
    if (signal1h === signal3m) {
      console.log(`✅ Final Signal: ${signal1h}`);
      return signal1h;
    } else {
      console.log("✅ Final Signal: HOLD");
      return "HOLD";
    }
  } catch (error) {
    console.error("❌ Error in getRSIStrategySignal:", error.message);
    return "HOLD";
  }
}

module.exports = { getRSIStrategySignal };
