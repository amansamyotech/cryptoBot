// const { EMA, RSI, MACD, ADX,  SMA } = require("technicalindicators");
// const { getCandles } = require("../bot2/websocketsCode/getCandles"); // Adjust path if needed

// // --- Strategy Inputs (matching Pine Script) ---
// const PINE_INPUTS = {
//   temaLength: 21,
//   macdFast: 12,
//   macdSlow: 26,
//   macdSignal: 9,
//   bbLength: 50,
//   bbMult: 2.0,
//   adxLength: 13,
//   adxThreshold: 20,
// };

// // Helper function to calculate TEMA (Triple Exponential Moving Average)
// function calculateTEMA(closePrices, period) {
//   const ema1 = EMA.calculate({ period, values: closePrices });
//   const ema2 = EMA.calculate({ period, values: ema1 });
//   const ema3 = EMA.calculate({ period, values: ema2 });

//   // TEMA = 3*EMA1 - 3*EMA2 + EMA3
//   const tema = [];
//   const minLength = Math.min(ema1.length, ema2.length, ema3.length);

//   for (let i = 0; i < minLength; i++) {
//     const tema_value = 3 * ema1[ema1.length - minLength + i] -
//                       3 * ema2[ema2.length - minLength + i] +
//                       ema3[ema3.length - minLength + i];
//     tema.push(tema_value);
//   }

//   return tema;
// }

// // Helper function to calculate Standard Deviation
// function calculateStandardDeviation(values, period) {
//   const result = [];

//   for (let i = period - 1; i < values.length; i++) {
//     const slice = values.slice(i - period + 1, i + 1);
//     const mean = slice.reduce((sum, val) => sum + val, 0) / period;
//     const variance = slice.reduce((sum, val) => sum + Math.pow(val - mean, 2), 0) / period;
//     const stdDev = Math.sqrt(variance);
//     result.push(stdDev);
//   }

//   return result;
// }

// // Helper function to calculate Bollinger Bands
// function calculateBollingerBands(closePrices, period, multiplier) {
//   const sma = SMA.calculate({ period, values: closePrices });
//   const stdDev = calculateStandardDeviation(closePrices, period);

//   const bollingerBands = [];
//   const minLength = Math.min(sma.length, stdDev.length);

//   for (let i = 0; i < minLength; i++) {
//     const basis = sma[sma.length - minLength + i];
//     const deviation = multiplier * stdDev[stdDev.length - minLength + i];

//     bollingerBands.push({
//       upper: basis + deviation,
//       middle: basis,
//       lower: basis - deviation
//     });
//   }

//   return bollingerBands;
// }

// async function checkEntrySignal(symbol) {
//   try {
//     console.log(`\n[${symbol}] Checking entry signal...`);

//     // Fetch enough candles for the longest indicator + buffer
//     const candles = await getCandles(symbol, "5m", 200);
//     console.log(`[${symbol}] Fetched ${candles.length} candles.`);

//     if (candles.length < 100) {
//       console.log(`[${symbol}] Not enough candle data to calculate indicators.`);
//       return { signal: "HOLD", reason: "Insufficient data" };
//     }

//     const closePrices = candles.map((c) => c.close);
//     const highPrices = candles.map((c) => c.high);
//     const lowPrices = candles.map((c) => c.low);

//     console.log(`[${symbol}] Sample close prices:`, closePrices.slice(-5));

//     // --- 1. Calculate All Indicators ---

//     // TEMA calculation
//     const tema = calculateTEMA(closePrices, PINE_INPUTS.temaLength);
//     console.log(`[${symbol}] TEMA (last):`, tema[tema.length - 1]);

//     // MACD calculation
//     const macd = MACD.calculate({
//       values: closePrices,
//       fastPeriod: PINE_INPUTS.macdFast,
//       slowPeriod: PINE_INPUTS.macdSlow,
//       signalPeriod: PINE_INPUTS.macdSignal,
//       SimpleMAOscillator: false,
//       SimpleMASignal: false,
//     });
//     console.log(`[${symbol}] MACD (last):`, macd[macd.length - 1]);

//     // Bollinger Bands calculation
//     const bb = calculateBollingerBands(closePrices, PINE_INPUTS.bbLength, PINE_INPUTS.bbMult);
//     console.log(`[${symbol}] Bollinger Bands (last):`, bb[bb.length - 1]);

//     // ADX calculation
//     const adx = ADX.calculate({
//       close: closePrices,
//       high: highPrices,
//       low: lowPrices,
//       period: PINE_INPUTS.adxLength,
//     });
//     console.log(`[${symbol}] ADX (last):`, adx[adx.length - 1]);

//     // --- 2. Get the latest values for each indicator ---
//     const currentPrice = closePrices[closePrices.length - 1];
//     const currentTema = tema[tema.length - 1];
//     const currentMacd = macd[macd.length - 1];
//     const currentBB = bb[bb.length - 1];
//     const currentAdx = adx[adx.length - 1];

//     console.log(`[${symbol}] Current Price: ${currentPrice}`);

//     // Check if all indicators have valid data
//     if (!currentTema || !currentMacd || !currentBB || !currentAdx) {
//       console.log(`[${symbol}] One or more indicators returned null.`);
//       return { signal: "HOLD", reason: "Invalid indicator data" };
//     }

//     // --- 3. Check Entry Conditions (matching Pine Script logic) ---
//     const longCondition =
//       currentPrice > currentTema &&
//       currentMacd.MACD > currentMacd.signal &&
//       currentAdx.adx > PINE_INPUTS.adxThreshold &&
//       currentAdx.pdi > currentAdx.mdi;

//     console.log(`[${symbol}] Long Condition Details:`);
//     console.log(`  Price > TEMA: ${currentPrice} > ${currentTema} => ${currentPrice > currentTema}`);
//     console.log(`  MACD > Signal: ${currentMacd.MACD} > ${currentMacd.signal} => ${currentMacd.MACD > currentMacd.signal}`);
//     console.log(`  ADX > Threshold (${PINE_INPUTS.adxThreshold}): ${currentAdx.adx} => ${currentAdx.adx > PINE_INPUTS.adxThreshold}`);
//     console.log(`  PDI > MDI: ${currentAdx.pdi} > ${currentAdx.mdi} => ${currentAdx.pdi > currentAdx.mdi}`);

//     const shortCondition =
//       currentPrice < currentTema &&
//       currentMacd.MACD < currentMacd.signal &&
//       currentAdx.adx > PINE_INPUTS.adxThreshold &&
//       currentAdx.mdi > currentAdx.pdi;

//     console.log(`[${symbol}] Short Condition Details:`);
//     console.log(`  Price < TEMA: ${currentPrice} < ${currentTema} => ${currentPrice < currentTema}`);
//     console.log(`  MACD < Signal: ${currentMacd.MACD} < ${currentMacd.signal} => ${currentMacd.MACD < currentMacd.signal}`);
//     console.log(`  ADX > Threshold (${PINE_INPUTS.adxThreshold}): ${currentAdx.adx} => ${currentAdx.adx > PINE_INPUTS.adxThreshold}`);
//     console.log(`  MDI > PDI: ${currentAdx.mdi} > ${currentAdx.pdi} => ${currentAdx.mdi > currentAdx.pdi}`);

//     // --- 4. Calculate Take Profit and Stop Loss levels ---
//     let tradeDetails = null;

//     if (longCondition) {

//       tradeDetails = {
//         signal: "LONG",
//         entryPrice: currentPrice,
//         indicators: {
//           tema: currentTema,
//           macd: currentMacd,
//           bb: currentBB,
//           adx: currentAdx
//         }
//       };

//       console.log(`[${symbol}] ✅ LONG signal detected.`);

//     } else if (shortCondition) {

//       tradeDetails = {
//         signal: "SHORT",
//         entryPrice: currentPrice,
//         indicators: {
//           tema: currentTema,
//           macd: currentMacd,
//           bb: currentBB,
//           adx: currentAdx
//         }
//       };

//       console.log(`[${symbol}] ✅ SHORT signal detected.`);

//     } else {
//       console.log(`[${symbol}] ❌ No valid entry condition met. HOLD.`);
//       return {
//         signal: "HOLD",
//         reason: "No entry conditions met",
//         indicators: {
//           tema: currentTema,
//           macd: currentMacd,
//           bb: currentBB,
//           adx: currentAdx
//         }
//       };
//     }

//     return tradeDetails.signal;

//   } catch (err) {
//     console.error(`[${symbol}] ❗ Error in entry signal check:`, err.message);
//     return { signal: "HOLD", reason: `Error: ${err.message}` };
//   }
// }

// module.exports = {
//   checkEntrySignal
// };

const { EMA, RSI, MACD, ADX, SMA } = require("technicalindicators");
const { getCandles } = require("../bot2/websocketsCode/getCandles"); // Adjust path if needed


// --- Strategy Inputs (matching Pine Script) ---
const PINE_INPUTS = {
  temaLength: 21,
  macdFast: 12,
  macdSlow: 26,
  macdSignal: 9,
  bbLength: 50,
  bbMult: 2.0,
  adxLength: 13,
  adxThreshold: 25, // Increased for stronger trends
};

// Helper function to calculate TEMA (Triple Exponential Moving Average)
function calculateTEMA(closePrices, period) {
  console.log(`[DEBUG] Calculating TEMA for period ${period}`);
  const ema1 = EMA.calculate({ period, values: closePrices });
  console.log(`[DEBUG] EMA1 (${ema1.length}):`, ema1.slice(-3));
  const ema2 = EMA.calculate({ period, values: ema1 });
  console.log(`[DEBUG] EMA2 (${ema2.length}):`, ema2.slice(-3));
  const ema3 = EMA.calculate({ period, values: ema2 });
  console.log(`[DEBUG] EMA3 (${ema3.length}):`, ema3.slice(-3));

  const tema = [];
  const minLength = Math.min(ema1.length, ema2.length, ema3.length);

  for (let i = 0; i < minLength; i++) {
    const tema_value = 3 * ema1[ema1.length - minLength + i] -
      3 * ema2[ema2.length - minLength + i] +
      ema3[ema3.length - minLength + i];
    tema.push(tema_value);
  }

  console.log(`[DEBUG] TEMA (${tema.length}):`, tema.slice(-3));
  return tema;
}

// Helper function to calculate Standard Deviation
function calculateStandardDeviation(values, period) {
  console.log(`[DEBUG] Calculating StdDev for period ${period}`);
  const result = [];

  for (let i = period - 1; i < values.length; i++) {
    const slice = values.slice(i - period + 1, i + 1);
    const mean = slice.reduce((sum, val) => sum + val, 0) / period;
    const variance = slice.reduce((sum, val) => sum + Math.pow(val - mean, 2), 0) / period;
    const stdDev = Math.sqrt(variance);
    result.push(stdDev);
  }

  console.log(`[DEBUG] StdDev (${result.length}):`, result.slice(-3));
  return result;
}

// Helper function to calculate Bollinger Bands
function calculateBollingerBands(closePrices, period, multiplier) {
  console.log(`[DEBUG] Calculating Bollinger Bands: period=${period}, mult=${multiplier}`);
  const sma = SMA.calculate({ period, values: closePrices });
  const stdDev = calculateStandardDeviation(closePrices, period);

  const bollingerBands = [];
  const minLength = Math.min(sma.length, stdDev.length);

  for (let i = 0; i < minLength; i++) {
    const basis = sma[sma.length - minLength + i];
    const deviation = multiplier * stdDev[stdDev.length - minLength + i];

    bollingerBands.push({
      upper: basis + deviation,
      middle: basis,
      lower: basis - deviation
    });
  }

  console.log(`[DEBUG] Bollinger Bands (${bollingerBands.length}):`, bollingerBands.slice(-2));
  return bollingerBands;
}

// NEW: Helper function to detect MACD crossover
function detectMACDCrossover(macd) {
  console.log(`[DEBUG] Checking MACD crossover...`);
  if (macd.length < 2) return { bullishCrossover: false, bearishCrossover: false };

  const current = macd[macd.length - 1];
  const previous = macd[macd.length - 2];

  if (!current || !previous ||
    isNaN(current.MACD) || isNaN(current.signal) ||
    isNaN(previous.MACD) || isNaN(previous.signal)) {
    console.log(`[DEBUG] MACD invalid data`);
    return { bullishCrossover: false, bearishCrossover: false };
  }

  const bullishCrossover = previous.MACD <= previous.signal && current.MACD > current.signal;
  const bearishCrossover = previous.MACD >= previous.signal && current.MACD < current.signal;

  console.log(`[DEBUG] MACD Current:`, current);
  console.log(`[DEBUG] MACD Previous:`, previous);
  console.log(`[DEBUG] Bullish: ${bullishCrossover}, Bearish: ${bearishCrossover}`);

  return { bullishCrossover, bearishCrossover };
}

// NEW: Helper function to detect engulfing patterns
function detectEngulfingPattern(candles) {
  console.log(`[DEBUG] Checking Engulfing Pattern...`);
  if (candles.length < 2) return { bullishEngulfing: false, bearishEngulfing: false };

  const current = candles[candles.length - 1];
  const previous = candles[candles.length - 2];

  if (!current || !previous ||
    isNaN(current.open) || isNaN(current.close) ||
    isNaN(previous.open) || isNaN(previous.close)) {
    console.log(`[DEBUG] Engulfing: Invalid data`);
    return { bullishEngulfing: false, bearishEngulfing: false };
  }

  const bullishEngulfing = previous.close < previous.open &&
    current.close > current.open &&
    current.open < previous.close &&
    current.close > previous.open;

  const bearishEngulfing = previous.close > previous.open &&
    current.close < current.open &&
    current.open > previous.close &&
    current.close < previous.open;

  console.log(`[DEBUG] Bullish Engulfing: ${bullishEngulfing}`);
  console.log(`[DEBUG] Bearish Engulfing: ${bearishEngulfing}`);

  return { bullishEngulfing, bearishEngulfing };
}

async function checkEntrySignal(symbol) {
  try {
    console.log(`\n[${symbol}] Checking entry signal...`);

    const candles = await getCandles(symbol, "5m", 200);
    console.log(`[${symbol}] Fetched ${candles.length} candles.`);

    if (candles.length < 100) {
      console.log(`[${symbol}] Not enough candle data to calculate indicators.`);
      return { signal: "HOLD", reason: "Insufficient data" };
    }

    const closePrices = candles.map((c) => c.close);
    const highPrices = candles.map((c) => c.high);
    const lowPrices = candles.map((c) => c.low);

    console.log(`[${symbol}] Sample close prices:`, closePrices.slice(-5));

    const tema = calculateTEMA(closePrices, PINE_INPUTS.temaLength);
    if (!tema || tema.length === 0) {
      console.log(`[${symbol}] TEMA calculation failed.`);
      return { signal: "HOLD", reason: "TEMA calculation failed" };
    }

    const macd = MACD.calculate({
      values: closePrices,
      fastPeriod: PINE_INPUTS.macdFast,
      slowPeriod: PINE_INPUTS.macdSlow,
      signalPeriod: PINE_INPUTS.macdSignal,
      SimpleMAOscillator: false,
      SimpleMASignal: false,
    });
    console.log(`[DEBUG] MACD (${macd.length}):`, macd.slice(-3));
    if (!macd || macd.length === 0) {
      console.log(`[${symbol}] MACD calculation failed.`);
      return { signal: "HOLD", reason: "MACD calculation failed" };
    }

    const bb = calculateBollingerBands(closePrices, PINE_INPUTS.bbLength, PINE_INPUTS.bbMult);
    if (!bb || bb.length === 0) {
      console.log(`[${symbol}] Bollinger Bands calculation failed.`);
      return { signal: "HOLD", reason: "BB calculation failed" };
    }

    const adx = ADX.calculate({
      close: closePrices,
      high: highPrices,
      low: lowPrices,
      period: PINE_INPUTS.adxLength,
    });
    console.log(`[DEBUG] ADX (${adx.length}):`, adx.slice(-3));
    if (!adx || adx.length === 0) {
      console.log(`[${symbol}] ADX calculation failed.`);
      return { signal: "HOLD", reason: "ADX calculation failed" };
    }

    const currentPrice = closePrices[closePrices.length - 1];
    const previousPrice = closePrices[closePrices.length - 2];

    const currentTema = tema[tema.length - 1];
    const previousTema = tema[tema.length - 2];

    const currentMacd = macd[macd.length - 1];
    const currentBB = bb[bb.length - 1];
    const currentAdx = adx[adx.length - 1];

    console.log(`[${symbol}] Current Price: ${currentPrice}, Previous: ${previousPrice}`);
    console.log(`[${symbol}] Current TEMA: ${currentTema}, Previous: ${previousTema}`);

    if (isNaN(currentPrice) || isNaN(previousPrice) ||
      isNaN(currentTema) || isNaN(previousTema) ||
      !currentMacd || !currentBB || !currentAdx ||
      isNaN(currentMacd.MACD) || isNaN(currentMacd.signal) ||
      isNaN(currentAdx.adx) || isNaN(currentAdx.pdi) || isNaN(currentAdx.mdi)) {
      console.log(`[${symbol}] One or more indicators returned NaN or null.`);
      return { signal: "HOLD", reason: "Invalid indicator data" };
    }

    const macdCrossover = detectMACDCrossover(macd);
    const engulfingPattern = detectEngulfingPattern(candles);

    console.log(`[${symbol}] MACD Crossover:`, macdCrossover);
    console.log(`[${symbol}] Engulfing Pattern:`, engulfingPattern);

    const longCondition =
      macdCrossover.bullishCrossover &&
      previousPrice > previousTema &&
      currentPrice > currentTema &&
      currentAdx.adx > PINE_INPUTS.adxThreshold &&
      currentAdx.pdi > currentAdx.mdi &&
      (engulfingPattern.bullishEngulfing || currentPrice > previousPrice * 1.001);

    console.log(`[${symbol}] Long Condition Details:`);
    console.log(`  MACD Bullish Crossover: ${macdCrossover.bullishCrossover}`);
    console.log(`  Previous Price > TEMA: ${previousPrice} > ${previousTema} => ${previousPrice > previousTema}`);
    console.log(`  Current Price > TEMA: ${currentPrice} > ${currentTema} => ${currentPrice > currentTema}`);
    console.log(`  ADX > Threshold (${PINE_INPUTS.adxThreshold}): ${currentAdx.adx} => ${currentAdx.adx > PINE_INPUTS.adxThreshold}`);
    console.log(`  PDI > MDI: ${currentAdx.pdi} > ${currentAdx.mdi} => ${currentAdx.pdi > currentAdx.mdi}`);
    console.log(`  Price Action: Bullish Engulfing=${engulfingPattern.bullishEngulfing} or Price Up=${currentPrice > previousPrice * 1.001}`);

    const shortCondition =
      macdCrossover.bearishCrossover &&
      previousPrice < previousTema &&
      currentPrice < currentTema &&
      currentAdx.adx > PINE_INPUTS.adxThreshold &&
      currentAdx.mdi > currentAdx.pdi &&
      (engulfingPattern.bearishEngulfing || currentPrice < previousPrice * 0.999);

    console.log(`[${symbol}] Short Condition Details:`);
    console.log(`  MACD Bearish Crossover: ${macdCrossover.bearishCrossover}`);
    console.log(`  Previous Price < TEMA: ${previousPrice} < ${previousTema} => ${previousPrice < previousTema}`);
    console.log(`  Current Price < TEMA: ${currentPrice} < ${currentTema} => ${currentPrice < currentTema}`);
    console.log(`  ADX > Threshold (${PINE_INPUTS.adxThreshold}): ${currentAdx.adx} => ${currentAdx.adx > PINE_INPUTS.adxThreshold}`);
    console.log(`  MDI > PDI: ${currentAdx.mdi} > ${currentAdx.pdi} => ${currentAdx.mdi > currentAdx.pdi}`);
    console.log(`  Price Action: Bearish Engulfing=${engulfingPattern.bearishEngulfing} or Price Down=${currentPrice < previousPrice * 0.999}`);

    if (longCondition) {
      console.log(`[${symbol}] ✅ LONG signal detected (crossover-based).`);
      return "LONG";
    } else if (shortCondition) {
      console.log(`[${symbol}] ✅ SHORT signal detected (crossover-based).`);
      return "SHORT";
    } else {
      console.log(`[${symbol}] ❌ No crossover-based entry condition met. HOLD.`);
      return "HOLD";
    }

  } catch (err) {
    console.error(`[${symbol}] ❗ Error in entry signal check:`, err.message);
    return "HOLD";
  }
}

module.exports = {
  checkEntrySignal
};

