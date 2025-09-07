const { EMA, RSI, MACD, ADX } = require("technicalindicators");
const { getCandles } = require("../bot2/websocketsCode/getCandles"); // Adjust path if needed

// --- Strategy Inputs ---
const PINE_INPUTS = {
  emaLength: 50,
  rsiLength: 14,
  rsiOverbought: 60,
  rsiOversold: 40,
  macdFast: 12,
  macdSlow: 26,
  macdSignal: 9,
  adxLength: 14,
  adxThreshold: 20,
};

async function checkEntrySignal(symbol) {
  try {
    // Fetch enough candles for the longest indicator (EMA 50) + ADX requirements
    const candles = await getCandles(symbol, "3m", 150);
    if (candles.length < PINE_INPUTS.emaLength) {
      console.log(`[${symbol}] Not enough candle data to calculate indicators.`);
      return "HOLD";
    }

    const closePrices = candles.map((c) => c.close);
    const highPrices = candles.map((c) => c.high);
    const lowPrices = candles.map((c) => c.low);

    // --- 1. Calculate All Indicators ---
    const ema = EMA.calculate({ period: PINE_INPUTS.emaLength, values: closePrices });
    const rsi = RSI.calculate({ period: PINE_INPUTS.rsiLength, values: closePrices });
    const macd = MACD.calculate({
      values: closePrices,
      fastPeriod: PINE_INPUTS.macdFast,
      slowPeriod: PINE_INPUTS.macdSlow,
      signalPeriod: PINE_INPUTS.macdSignal,
      SimpleMAOscillator: false,
      SimpleMASignal: false,
    });
    const adx = ADX.calculate({
      close: closePrices,
      high: highPrices,
      low: lowPrices,
      period: PINE_INPUTS.adxLength,
    });

    // --- 2. Get the latest values for each indicator ---
    const currentPrice = closePrices[closePrices.length - 1];
    const currentEma = ema[ema.length - 1];
    const currentRsi = rsi[rsi.length - 1];
    const currentMacd = macd[macd.length - 1];
    const currentAdx = adx[adx.length - 1];

    // Check if all indicators have valid data
    if (!currentEma || !currentRsi || !currentMacd || !currentAdx) {
        console.log(`[${symbol}] One or more indicators returned null.`);
        return "HOLD";
    }

    // --- 3. Check Entry Conditions from Pine Script ---
    const longCondition =
      currentPrice > currentEma &&
      currentRsi < PINE_INPUTS.rsiOversold &&
      currentMacd.MACD > currentMacd.signal &&
      currentAdx.adx > PINE_INPUTS.adxThreshold &&
      currentAdx.pdi > currentAdx.ndi;

    const shortCondition =
      currentPrice < currentEma &&
      currentRsi > PINE_INPUTS.rsiOverbought &&
      currentMacd.MACD < currentMacd.signal &&
      currentAdx.adx > PINE_INPUTS.adxThreshold &&
      currentAdx.ndi > currentAdx.pdi;

    // --- 4. Return Decision ---
    if (longCondition) {
      console.log(`[${symbol}] LONG signal detected.`);
      return "LONG";
    } else if (shortCondition) {
      console.log(`[${symbol}] SHORT signal detected.`);
      return "SHORT";
    }

    return "HOLD";
  } catch (err) {
    console.error(`[${symbol}] Error in entry signal check:`, err.message);
    return "HOLD";
  }
}

module.exports = { checkEntrySignal };