// const { EMA, RSI, MACD, ADX } = require("technicalindicators");
// const { getCandles } = require("../bot2/websocketsCode/getCandles"); // Adjust path if needed

// // --- Strategy Inputs ---
// const PINE_INPUTS = {
//   emaLength: 9,
//   rsiLength: 14,
//   rsiOverbought: 40,
//   rsiOversold: 60,
//   macdFast: 12,
//   macdSlow: 26,
//   macdSignal: 14,
//   adxLength: 13,
//   adxThreshold: 17,
// };

// async function checkEntrySignal(symbol) {
//   try {
//     console.log(`\n[${symbol}] Checking entry signal...`);

//     // Fetch enough candles for the longest indicator (EMA 50) + ADX requirements
//     const candles = await getCandles(symbol, "5m", 200);
//     console.log(`[${symbol}] Fetched ${candles.length} candles.`);

//     if (candles.length < 50) {
//       console.log(
//         `[${symbol}] Not enough candle data to calculate indicators.`
//       );
//       return "HOLD";
//     }

//     const closePrices = candles.map((c) => c.close);
//     const highPrices = candles.map((c) => c.high);
//     const lowPrices = candles.map((c) => c.low);

//     console.log(`[${symbol}] Sample close prices:`, closePrices.slice(-5));

//     // --- 1. Calculate All Indicators ---
//     const ema = EMA.calculate({
//       period: PINE_INPUTS.emaLength,
//       values: closePrices,
//     });
//     console.log(`[${symbol}] EMA (last):`, ema[ema.length - 1]);

//     const rsi = RSI.calculate({
//       period: PINE_INPUTS.rsiLength,
//       values: closePrices,
//     });
//     console.log(`[${symbol}] RSI (last):`, rsi[rsi.length - 1]);

//     const macd = MACD.calculate({
//       values: closePrices,
//       fastPeriod: PINE_INPUTS.macdFast,
//       slowPeriod: PINE_INPUTS.macdSlow,
//       signalPeriod: PINE_INPUTS.macdSignal,
//       SimpleMAOscillator: false,
//       SimpleMASignal: false,
//     });
//     console.log(`[${symbol}] MACD (last):`, macd[macd.length - 1]);

//     const adx = ADX.calculate({
//       close: closePrices,
//       high: highPrices,
//       low: lowPrices,
//       period: PINE_INPUTS.adxLength,
//     });
//     console.log(`[${symbol}] ADX (last):`, adx[adx.length - 1]);

//     // --- 2. Get the latest values for each indicator ---
//     const currentPrice = closePrices[closePrices.length - 1];
//     const currentEma = ema[ema.length - 1];
//     const currentRsi = rsi[rsi.length - 1];
//     const currentMacd = macd[macd.length - 1];
//     const currentAdx = adx[adx.length - 1];

//     console.log(`[${symbol}] Current Price: ${currentPrice}`);

//     // Check if all indicators have valid data
//     if (!currentEma || !currentRsi || !currentMacd || !currentAdx) {
//       console.log(`[${symbol}] One or more indicators returned null.`);
//       return "HOLD";
//     }

//     // --- 3. Check Entry Conditions from Pine Script ---
//     const longCondition =
//       currentPrice > currentEma &&
//       currentRsi < PINE_INPUTS.rsiOversold &&
//       currentMacd.MACD > currentMacd.signal &&
//       currentAdx.adx > PINE_INPUTS.adxThreshold &&
//       currentAdx.pdi > currentAdx.mdi;

//     console.log(`[${symbol}] Long Condition Details:`);
//     console.log(
//       `  Price > EMA: ${currentPrice} > ${currentEma} => ${
//         currentPrice > currentEma
//       }`
//     );
//     console.log(
//       `RSI < Oversold (${PINE_INPUTS.rsiOversold}): ${currentRsi} => ${
//         currentRsi < PINE_INPUTS.rsiOversold
//       }`
//     );
//     console.log(
//       `  MACD > Signal: ${currentMacd.MACD} > ${currentMacd.signal} => ${
//         currentMacd.MACD > currentMacd.signal
//       }`
//     );
//     console.log(
//       `  ADX > Threshold (${PINE_INPUTS.adxThreshold}): ${currentAdx.adx} => ${
//         currentAdx.adx > PINE_INPUTS.adxThreshold
//       }`
//     );
//     console.log(
//       `  PDI > NDI: ${currentAdx.pdi} > ${currentAdx.mdi} => ${
//         currentAdx.pdi > currentAdx.mdi
//       }`
//     );

//     const shortCondition =
//       currentPrice < currentEma &&
//       currentRsi > PINE_INPUTS.rsiOverbought &&
//       currentMacd.MACD < currentMacd.signal &&
//       currentAdx.adx > PINE_INPUTS.adxThreshold &&
//       currentAdx.mdi > currentAdx.pdi;

//     console.log(`[${symbol}] Short Condition Details:`);
//     console.log(
//       `  Price < EMA: ${currentPrice} < ${currentEma} => ${
//         currentPrice < currentEma
//       }`
//     );
//     console.log(
//       `RSI > Overbought (${PINE_INPUTS.rsiOverbought}): ${currentRsi} => ${
//         currentRsi > PINE_INPUTS.rsiOverbought
//       }`
//     );
//     console.log(
//       `  MACD < Signal: ${currentMacd.MACD} < ${currentMacd.signal} => ${
//         currentMacd.MACD < currentMacd.signal
//       }`
//     );
//     console.log(
//       `  ADX > Threshold (${PINE_INPUTS.adxThreshold}): ${currentAdx.adx} => ${
//         currentAdx.adx > PINE_INPUTS.adxThreshold
//       }`
//     );
//     console.log(
//       `  NDI > PDI: ${currentAdx.mdi} > ${currentAdx.pdi} => ${
//         currentAdx.mdi > currentAdx.pdi
//       }`
//     );

//     // --- 4. Return Decision ---
//     if (longCondition) {
//       console.log(`[${symbol}] ✅ LONG signal detected.`);
//       return "LONG";
//     } else if (shortCondition) {
//       console.log(`[${symbol}] ✅ SHORT signal detected.`);
//       return "SHORT";
//     }

//     console.log(`[${symbol}] ❌ No valid entry condition met. HOLD.`);
//     return "HOLD";
//   } catch (err) {
//     console.error(`[${symbol}] ❗ Error in entry signal check:`, err.message);
//     return "HOLD";
//   }
// }

// module.exports = { checkEntrySignal };



const { EMA, RSI, MACD, ADX,  SMA } = require("technicalindicators");
const { getCandles } = require("../bot2/websocketsCode/getCandles"); // Adjust path if needed

// --- Strategy Inputs (matching Pine Script) ---
const PINE_INPUTS = {
  temaLength: 21,
  macdFast: 12,
  macdSlow: 26,
  macdSignal: 9,
  bbLength: 20,
  bbMult: 2.0,
  adxLength: 13,
  adxThreshold: 20,
};

// Helper function to calculate TEMA (Triple Exponential Moving Average)
function calculateTEMA(closePrices, period) {
  const ema1 = EMA.calculate({ period, values: closePrices });
  const ema2 = EMA.calculate({ period, values: ema1 });
  const ema3 = EMA.calculate({ period, values: ema2 });
  
  // TEMA = 3*EMA1 - 3*EMA2 + EMA3
  const tema = [];
  const minLength = Math.min(ema1.length, ema2.length, ema3.length);
  
  for (let i = 0; i < minLength; i++) {
    const tema_value = 3 * ema1[ema1.length - minLength + i] - 
                      3 * ema2[ema2.length - minLength + i] + 
                      ema3[ema3.length - minLength + i];
    tema.push(tema_value);
  }
  
  return tema;
}

// Helper function to calculate Standard Deviation
function calculateStandardDeviation(values, period) {
  const result = [];
  
  for (let i = period - 1; i < values.length; i++) {
    const slice = values.slice(i - period + 1, i + 1);
    const mean = slice.reduce((sum, val) => sum + val, 0) / period;
    const variance = slice.reduce((sum, val) => sum + Math.pow(val - mean, 2), 0) / period;
    const stdDev = Math.sqrt(variance);
    result.push(stdDev);
  }
  
  return result;
}

// Helper function to calculate Bollinger Bands
function calculateBollingerBands(closePrices, period, multiplier) {
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
  
  return bollingerBands;
}

async function checkEntrySignal(symbol) {
  try {
    console.log(`\n[${symbol}] Checking entry signal...`);

    // Fetch enough candles for the longest indicator + buffer
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

    // --- 1. Calculate All Indicators ---
    
    // TEMA calculation
    const tema = calculateTEMA(closePrices, PINE_INPUTS.temaLength);
    console.log(`[${symbol}] TEMA (last):`, tema[tema.length - 1]);

    // MACD calculation
    const macd = MACD.calculate({
      values: closePrices,
      fastPeriod: PINE_INPUTS.macdFast,
      slowPeriod: PINE_INPUTS.macdSlow,
      signalPeriod: PINE_INPUTS.macdSignal,
      SimpleMAOscillator: false,
      SimpleMASignal: false,
    });
    console.log(`[${symbol}] MACD (last):`, macd[macd.length - 1]);

    // Bollinger Bands calculation
    const bb = calculateBollingerBands(closePrices, PINE_INPUTS.bbLength, PINE_INPUTS.bbMult);
    console.log(`[${symbol}] Bollinger Bands (last):`, bb[bb.length - 1]);

    // ADX calculation
    const adx = ADX.calculate({
      close: closePrices,
      high: highPrices,
      low: lowPrices,
      period: PINE_INPUTS.adxLength,
    });
    console.log(`[${symbol}] ADX (last):`, adx[adx.length - 1]);

    // --- 2. Get the latest values for each indicator ---
    const currentPrice = closePrices[closePrices.length - 1];
    const currentTema = tema[tema.length - 1];
    const currentMacd = macd[macd.length - 1];
    const currentBB = bb[bb.length - 1];
    const currentAdx = adx[adx.length - 1];

    console.log(`[${symbol}] Current Price: ${currentPrice}`);

    // Check if all indicators have valid data
    if (!currentTema || !currentMacd || !currentBB || !currentAdx) {
      console.log(`[${symbol}] One or more indicators returned null.`);
      return { signal: "HOLD", reason: "Invalid indicator data" };
    }

    // --- 3. Check Entry Conditions (matching Pine Script logic) ---
    const longCondition =
      currentPrice > currentTema &&
      currentMacd.MACD > currentMacd.signal &&
      currentAdx.adx > PINE_INPUTS.adxThreshold &&
      currentAdx.pdi > currentAdx.mdi;

    console.log(`[${symbol}] Long Condition Details:`);
    console.log(`  Price > TEMA: ${currentPrice} > ${currentTema} => ${currentPrice > currentTema}`);
    console.log(`  MACD > Signal: ${currentMacd.MACD} > ${currentMacd.signal} => ${currentMacd.MACD > currentMacd.signal}`);
    console.log(`  ADX > Threshold (${PINE_INPUTS.adxThreshold}): ${currentAdx.adx} => ${currentAdx.adx > PINE_INPUTS.adxThreshold}`);
    console.log(`  PDI > MDI: ${currentAdx.pdi} > ${currentAdx.mdi} => ${currentAdx.pdi > currentAdx.mdi}`);

    const shortCondition =
      currentPrice < currentTema &&
      currentMacd.MACD < currentMacd.signal &&
      currentAdx.adx > PINE_INPUTS.adxThreshold &&
      currentAdx.mdi > currentAdx.pdi;

    console.log(`[${symbol}] Short Condition Details:`);
    console.log(`  Price < TEMA: ${currentPrice} < ${currentTema} => ${currentPrice < currentTema}`);
    console.log(`  MACD < Signal: ${currentMacd.MACD} < ${currentMacd.signal} => ${currentMacd.MACD < currentMacd.signal}`);
    console.log(`  ADX > Threshold (${PINE_INPUTS.adxThreshold}): ${currentAdx.adx} => ${currentAdx.adx > PINE_INPUTS.adxThreshold}`);
    console.log(`  MDI > PDI: ${currentAdx.mdi} > ${currentAdx.pdi} => ${currentAdx.mdi > currentAdx.pdi}`);

    // --- 4. Calculate Take Profit and Stop Loss levels ---
    let tradeDetails = null;
    
    if (longCondition) {
      
      tradeDetails = {
        signal: "LONG",
        entryPrice: currentPrice,
        indicators: {
          tema: currentTema,
          macd: currentMacd,
          bb: currentBB,
          adx: currentAdx
        }
      };
      
      console.log(`[${symbol}] ✅ LONG signal detected.`);
    
      
    } else if (shortCondition) {
      
      tradeDetails = {
        signal: "SHORT",
        entryPrice: currentPrice,
        indicators: {
          tema: currentTema,
          macd: currentMacd,
          bb: currentBB,
          adx: currentAdx
        }
      };
      
      console.log(`[${symbol}] ✅ SHORT signal detected.`);
    
      
    } else {
      console.log(`[${symbol}] ❌ No valid entry condition met. HOLD.`);
      return {
        signal: "HOLD",
        reason: "No entry conditions met",
        indicators: {
          tema: currentTema,
          macd: currentMacd,
          bb: currentBB,
          adx: currentAdx
        }
      };
    }

    return tradeDetails.signal;
    
  } catch (err) {
    console.error(`[${symbol}] ❗ Error in entry signal check:`, err.message);
    return { signal: "HOLD", reason: `Error: ${err.message}` };
  }
}

module.exports = { 
  checkEntrySignal
};