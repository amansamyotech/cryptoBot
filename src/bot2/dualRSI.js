const { RSI, ADX } = require("technicalindicators");
const { getCandles } = require("./websocketsCode/getCandles");

/**
 * Get RSI + ADX based trading signal
 * @param {string} symbol - e.g. "BTCUSDT"
 * @returns {Promise<"LONG" | "SHORT" | "HOLD">}
 */
async function getRSI_ADX_StrategySignal(symbol) {
  try {
    // Fetch candles

    const candles5m = await getCandles(symbol, "5m", 150);
    const candles4h = await getCandles(symbol, "4h", 150);

    if (
      !candles5m ||
      candles5m.length < 30 ||
      !candles4h ||
      candles4h.length < 30
    ) {
      console.log("❌ Not enough candle data");
      return "HOLD";
    }

    // Extract close, high, low prices
    const closes5m = candles5m.map((c) => c.close);
    const closes4h = candles4h.map((c) => c.close);
    const highs5m = candles5m.map((c) => c.high);
    const lows5m = candles5m.map((c) => c.low);

    // RSI(5m) for entry
    const rsi5m = RSI.calculate({ values: closes5m, period: 7 });
    const currentRSI5m = rsi5m[rsi5m.length - 1];
    const prevRSI5m = rsi5m[rsi5m.length - 2]; // for candle close crossover check

    // RSI(4h) for trend
    const rsi4h = RSI.calculate({ values: closes4h, period: 7 });
    const currentRSI4h = rsi4h[rsi4h.length - 1];

    // ADX(14) for trend strength
    const adxValues = ADX.calculate({
      close: closes5m,
      high: highs5m,
      low: lows5m,
      period: 14,
    });
    const currentADX = adxValues[adxValues.length - 1]?.adx || 0;

    console.log(
      `$📊 RSI(4h): ${currentRSI4h.toFixed(
        2
      )} | RSI(5m): ${currentRSI5m.toFixed(2)} | ADX: ${currentADX.toFixed(2)}`
    );

    // Step 1: Check overall trend using RSI(4h)
    let trend = "HOLD";
    if (currentRSI4h > 60) trend = "UP";
    else if (currentRSI4h < 40) trend = "DOWN";
    else return "HOLD"; // sideways market

    // Step 2: Ensure trend is strong enough using ADX
    if (currentADX <= 25) {
      console.log("⚠️ Weak trend (ADX <= 25) → HOLD");
      return "HOLD";
    }

    // // Step 3: Entry signal using RSI(5m) + candle close confirmation
    if (trend === "UP") {
      // Pullback LONG setup
      if (prevRSI5m < 35 && currentRSI5m > 35) {
        console.log(
          "✅ LONG Signal (RSI(5m) recovered from oversold in uptrend)"
        );
        return "LONG";
      }
    } else if (trend === "DOWN") {
      // Pullback SHORT setup
      if (prevRSI5m > 65 && currentRSI5m < 65) {
        console.log(
          "✅ SHORT Signal (RSI(5m) dropped from overbought in downtrend)"
        );
        return "SHORT";
      }
    }

    // Default case
    console.log("⚪ No valid setup → HOLD");
    return "HOLD";
  } catch (error) {
    console.error("❌ Error in getRSI_ADX_StrategySignal:", error.message);
    return "HOLD";
  }
}

module.exports = { getRSI_ADX_StrategySignal };
