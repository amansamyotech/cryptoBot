const { EMA, RSI, MACD, ADX } = require("technicalindicators");
const { getCandles } = require("./getCandlesWebSokcets"); 

// --- Strategy Inputs ---
const PINE_INPUTS = {
  emaLength: 9,
  rsiLength: 14,
  rsiOverbought: 40,
  rsiOversold: 60,
  macdFast: 12,
  macdSlow: 26,
  macdSignal: 14,
  adxLength: 13,
  adxThreshold: 17,
};

async function checkEntrySignal(symbol) {
  try {
    console.log(`\n[${symbol}] Checking entry signal...`);
    const candles = await getCandles(symbol, "5m", 200);
    console.log(`[${symbol}] Fetched ${candles.length} candles.`);

    if (candles.length < 50) {
      console.log(
        `[${symbol}] Not enough candle data to calculate indicators.`
      );
      return "HOLD";
    }

    const closePrices = candles.map((c) => c.close);
    const highPrices = candles.map((c) => c.high);
    const lowPrices = candles.map((c) => c.low);
    console.log(`[${symbol}] Sample close prices:`, closePrices.slice(-5));
    const ema = EMA.calculate({
      period: PINE_INPUTS.emaLength,
      values: closePrices,
    });
    console.log(`[${symbol}] EMA (last):`, ema[ema.length - 1]);

    const rsi = RSI.calculate({
      period: PINE_INPUTS.rsiLength,
      values: closePrices,
    });
    console.log(`[${symbol}] RSI (last):`, rsi[rsi.length - 1]);

    const macd = MACD.calculate({
      values: closePrices,
      fastPeriod: PINE_INPUTS.macdFast,
      slowPeriod: PINE_INPUTS.macdSlow,
      signalPeriod: PINE_INPUTS.macdSignal,
      SimpleMAOscillator: false,
      SimpleMASignal: false,
    });
    console.log(`[${symbol}] MACD (last):`, macd[macd.length - 1]);

    const adx = ADX.calculate({
      close: closePrices,
      high: highPrices,
      low: lowPrices,
      period: PINE_INPUTS.adxLength,
    });
    console.log(`[${symbol}] ADX (last):`, adx[adx.length - 1]);

    const currentPrice = closePrices[closePrices.length - 1];
    const currentEma = ema[ema.length - 1];
    const currentRsi = rsi[rsi.length - 1];
    const currentMacd = macd[macd.length - 1];
    const currentAdx = adx[adx.length - 1];

    console.log(`[${symbol}] Current Price: ${currentPrice}`);
    if (!currentEma || !currentRsi || !currentMacd || !currentAdx) {
      console.log(`[${symbol}] One or more indicators returned null.`);
      return "HOLD";
    }

    const longCondition =
      currentPrice > currentEma &&
      currentRsi < PINE_INPUTS.rsiOversold &&
      currentMacd.MACD > currentMacd.signal &&
      currentAdx.adx > PINE_INPUTS.adxThreshold &&
      currentAdx.pdi > currentAdx.mdi;

    console.log(`[${symbol}] Long Condition Details:`);
    console.log(
      `  Price > EMA: ${currentPrice} > ${currentEma} => ${
        currentPrice > currentEma
      }`
    );
    console.log(
      `RSI < Oversold (${PINE_INPUTS.rsiOversold}): ${currentRsi} => ${
        currentRsi < PINE_INPUTS.rsiOversold
      }`
    );
    console.log(
      `  MACD > Signal: ${currentMacd.MACD} > ${currentMacd.signal} => ${
        currentMacd.MACD > currentMacd.signal
      }`
    );
    console.log(
      `  ADX > Threshold (${PINE_INPUTS.adxThreshold}): ${currentAdx.adx} => ${
        currentAdx.adx > PINE_INPUTS.adxThreshold
      }`
    );
    console.log(
      `  PDI > NDI: ${currentAdx.pdi} > ${currentAdx.mdi} => ${
        currentAdx.pdi > currentAdx.mdi
      }`
    );

    const shortCondition =
      currentPrice < currentEma &&
      currentRsi > PINE_INPUTS.rsiOverbought &&
      currentMacd.MACD < currentMacd.signal &&
      currentAdx.adx > PINE_INPUTS.adxThreshold &&
      currentAdx.mdi > currentAdx.pdi;

    console.log(`[${symbol}] Short Condition Details:`);
    console.log(
      `  Price < EMA: ${currentPrice} < ${currentEma} => ${
        currentPrice < currentEma
      }`
    );
    console.log(
      `RSI > Overbought (${PINE_INPUTS.rsiOverbought}): ${currentRsi} => ${
        currentRsi > PINE_INPUTS.rsiOverbought
      }`
    );
    console.log(
      `  MACD < Signal: ${currentMacd.MACD} < ${currentMacd.signal} => ${
        currentMacd.MACD < currentMacd.signal
      }`
    );
    console.log(
      `  ADX > Threshold (${PINE_INPUTS.adxThreshold}): ${currentAdx.adx} => ${
        currentAdx.adx > PINE_INPUTS.adxThreshold
      }`
    );
    console.log(
      `  NDI > PDI: ${currentAdx.mdi} > ${currentAdx.pdi} => ${
        currentAdx.mdi > currentAdx.pdi
      }`
    );

    // --- 4. Return Decision ---
    if (longCondition) {
      console.log(`[${symbol}] ✅ LONG signal detected.`);
      return "LONG";
    } else if (shortCondition) {
      console.log(`[${symbol}] ✅ SHORT signal detected.`);
      return "SHORT";
    }

    console.log(`[${symbol}] ❌ No valid entry condition met. HOLD.`);
    return "HOLD";
  } catch (err) {
    console.error(`[${symbol}] ❗ Error in entry signal check:`, err.message);
    return "HOLD";
  }
}

module.exports = { checkEntrySignal };
