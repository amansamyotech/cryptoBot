const { EMA, RSI, MACD, ADX } = require("technicalindicators");
const { getCandles } = require("../bot2/websocketsCode/getCandles"); // Adjust path if needed

// --- Strategy Inputs ---
const PINE_INPUTS = {
  emaLength: 9,
  rsiLength: 14,
  rsiOverbought: 58,
  rsiOversold: 40,
  macdFast: 12,
  macdSlow: 26,
  macdSignal: 14,
  adxLength: 13,
  adxThreshold: 18,
};

async function checkEntrySignal(symbol) {
  try {
    console.log(`\n[${symbol}] Checking entry signal...`);

    // Fetch enough candles for the longest indicator (EMA 50) + ADX requirements
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

    // --- 1. Calculate All Indicators ---
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

    // --- 2. Get the latest values for each indicator ---
    const currentPrice = closePrices[closePrices.length - 1];
    const currentEma = ema[ema.length - 1];
    const currentRsi = rsi[rsi.length - 1];
    const currentMacd = macd[macd.length - 1];
    const currentAdx = adx[adx.length - 1];

    console.log(`[${symbol}] Current Price: ${currentPrice}`);

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

// // // const { EMA, RSI, MACD, ADX } = require("technicalindicators");
// // // const { getCandles } = require("../bot2/websocketsCode/getCandles"); // Adjust path if needed

// // // // --- Strategy Inputs ---
// // // const PINE_INPUTS = {
// // //   emaLength: 21, // Trend filter
// // //   rsiLength: 14, // RSI period
// // //   rsiOverbought: 65, // Bounce zone top
// // //   rsiOversold: 35, // Bounce zone bottom
// // //   macdFast: 12,
// // //   macdSlow: 26,
// // //   macdSignal: 14,
// // //   adxLength: 13,
// // //   adxThreshold: 17,
// // // };

// // // async function checkEntrySignal(symbol) {
// // //   try {
// // //     console.log(`\n[${symbol}] Checking entry signal...`);

// // //     const candles = await getCandles(symbol, "5m", 200);
// // //     console.log(`[${symbol}] Retrieved ${candles.length} candles.`);
// // //     if (candles.length < 50) {
// // //       console.log(`[${symbol}] Not enough candles. Need at least 50.`);
// // //       return "HOLD";
// // //     }

// // //     const closePrices = candles.map((c) => c.close);
// // //     const highPrices = candles.map((c) => c.high);
// // //     const lowPrices = candles.map((c) => c.low);

// // //     console.log(
// // //       `[${symbol}] Calculating EMA with period ${PINE_INPUTS.emaLength}...`
// // //     );
// // //     const ema = EMA.calculate({
// // //       period: PINE_INPUTS.emaLength,
// // //       values: closePrices,
// // //     });
// // //     console.log(`[${symbol}] EMA calculated. Last EMA: ${ema.at(-1)}`);

// // //     console.log(
// // //       `[${symbol}] Calculating RSI with period ${PINE_INPUTS.rsiLength}...`
// // //     );
// // //     const rsi = RSI.calculate({
// // //       period: PINE_INPUTS.rsiLength,
// // //       values: closePrices,
// // //     });
// // //     console.log(`[${symbol}] RSI calculated. Last RSI: ${rsi.at(-1)}`);

// // //     console.log(
// // //       `[${symbol}] Calculating MACD (fast: ${PINE_INPUTS.macdFast}, slow: ${PINE_INPUTS.macdSlow}, signal: ${PINE_INPUTS.macdSignal})...`
// // //     );
// // //     const macd = MACD.calculate({
// // //       values: closePrices,
// // //       fastPeriod: PINE_INPUTS.macdFast,
// // //       slowPeriod: PINE_INPUTS.macdSlow,
// // //       signalPeriod: PINE_INPUTS.macdSignal,
// // //       SimpleMAOscillator: false,
// // //       SimpleMASignal: false,
// // //     });
// // //     console.log(
// // //       `[${symbol}] MACD calculated. Last MACD: ${JSON.stringify(macd.at(-1))}`
// // //     );

// // //     console.log(
// // //       `[${symbol}] Calculating ADX with period ${PINE_INPUTS.adxLength}...`
// // //     );
// // //     const adx = ADX.calculate({
// // //       close: closePrices,
// // //       high: highPrices,
// // //       low: lowPrices,
// // //       period: PINE_INPUTS.adxLength,
// // //     });
// // //     console.log(
// // //       `[${symbol}] ADX calculated. Last ADX: ${JSON.stringify(adx.at(-1))}`
// // //     );

// // //     // --- Latest values ---
// // //     const currentPrice = closePrices.at(-1);
// // //     const currentEma = ema.at(-1);
// // //     const currentRsi = rsi.at(-1);
// // //     const currentMacd = macd.at(-1);
// // //     const currentAdx = adx.at(-1);

// // //     console.log(`[${symbol}] Current Price: ${currentPrice}`);
// // //     console.log(`[${symbol}] Current EMA: ${currentEma}`);
// // //     console.log(`[${symbol}] Current RSI: ${currentRsi}`);
// // //     console.log(
// // //       `[${symbol}] Current MACD: MACD=${currentMacd.MACD}, Signal=${currentMacd.signal}`
// // //     );
// // //     console.log(
// // //       `[${symbol}] Current ADX: adx=${currentAdx.adx}, pdi=${currentAdx.pdi}, mdi=${currentAdx.mdi}`
// // //     );

// // //     if (!currentEma || !currentRsi || !currentMacd || !currentAdx) {
// // //       console.log(`[${symbol}] Missing indicator values. Holding.`);
// // //       return "HOLD";
// // //     }

// // //     // --- RSI Bounce Logic ---
// // //     const rsiValues = rsi.slice(-5); // last 5 RSI values
// // //     console.log(`[${symbol}] Last 5 RSI values for bounce check: ${rsiValues}`);

// // //     const [r1, r2, r3] = rsiValues;

// // //     let rsiBounceLong = false;
// // //     let rsiBounceShort = false;

// // //     //32.80 r1
// // //     //27.77 r2
// // //     //26.60 r3

// // //     // LONG: RSI touched any low (e.g., 35 or below), then started rising
// // //     if (
// // //       r3 <= PINE_INPUTS.rsiOversold && // RSI reached oversold area (can be 35, 30, 25 etc.)
// // //       r2 > r3 && // RSI started bouncing up
// // //       r1 > r2 // RSI continued rising
// // //     ) {
// // //       rsiBounceLong = true;
// // //       console.log(`[${symbol}] RSI Bounce LONG detected.`);
// // //     } else {
// // //       console.log(`[${symbol}] No RSI Bounce LONG.`);
// // //     }

// // //     // SHORT: RSI touched any high (e.g., 65 or above), then started falling
// // //     if (
// // //       r3 >= PINE_INPUTS.rsiOverbought && // RSI reached overbought area (can be 70, 80, 90)
// // //       r2 < r3 && // RSI started falling
// // //       r1 < r2 // RSI continued falling
// // //     ) {
// // //       rsiBounceShort = true;
// // //       console.log(`[${symbol}] RSI Bounce SHORT detected.`);
// // //     } else {
// // //       console.log(`[${symbol}] No RSI Bounce SHORT.`);
// // //     }

// // //     // --- Long Condition ---
// // //     const longCondition = currentPrice > currentEma && rsiBounceLong;
// // //     // currentMacd.MACD > currentMacd.signal &&
// // //     // currentAdx.adx > PINE_INPUTS.adxThreshold &&
// // //     // currentAdx.pdi > currentAdx.mdi;

// // //     console.log(`[${symbol}] Long Condition: ${longCondition}`);

// // //     // --- Short Condition ---
// // //     const shortCondition = currentPrice < currentEma && rsiBounceShort;
// // //     // currentMacd.MACD < currentMacd.signal &&
// // //     // currentAdx.adx > PINE_INPUTS.adxThreshold &&
// // //     // currentAdx.mdi > currentAdx.pdi;

// // //     console.log(`[${symbol}] Short Condition: ${shortCondition}`);

// // //     if (longCondition) {
// // //       console.log(`[${symbol}] ✅ LONG signal (RSI bounce confirmed).`);
// // //       return "LONG";
// // //     } else if (shortCondition) {
// // //       console.log(`[${symbol}] ✅ SHORT signal (RSI bounce confirmed).`);
// // //       return "SHORT";
// // //     }

// // //     console.log(`[${symbol}] ❌ HOLD (no valid entry).`);
// // //     return "HOLD";
// // //   } catch (err) {
// // //     console.error(`[${symbol}] ❗ Error in entry signal check:`, err.message);
// // //     return "HOLD";
// // //   }
// // // }

// // // module.exports = { checkEntrySignal };

// const { EMA, RSI, MACD, ADX } = require("technicalindicators");
// const { getCandles } = require("../bot2/websocketsCode/getCandles"); // Adjust path if needed

// // TEMA calculation function (Triple Exponential Moving Average)
// function calculateTEMA(values, period) {
//   const ema1 = EMA.calculate({ period: period, values: values });
//   const ema2 = EMA.calculate({ period: period, values: ema1 });
//   const ema3 = EMA.calculate({ period: period, values: ema2 });

//   const tema = [];
//   for (let i = 0; i < ema3.length; i++) {
//     const tema_value =
//       3 * ema1[i + (ema1.length - ema3.length)] -
//       3 * ema2[i + (ema2.length - ema3.length)] +
//       ema3[i];
//     tema.push(tema_value);
//   }
//   return tema;
// }

// // --- Strategy Inputs ---
// const PINE_INPUTS = {
//   temaLength: 21, // TEMA trend filter (replaced EMA)
//   rsiLength: 14, // RSI period
//   rsiOverbought: 56, // Bounce zone top
//   rsiOversold: 40, // Bounce zone bottom
//   macdFast: 12,
//   macdSlow: 26,
//   macdSignal: 14,
//   adxLength: 12,
//   adxThreshold: 18,
// };

// async function checkEntrySignal(symbol) {
//   try {
//     console.log(`\n[${symbol}] Checking entry signal...`);

//     const candles = await getCandles(symbol, "5m", 200);
//     console.log(`[${symbol}] Retrieved ${candles.length} candles.`);
//     if (candles.length < 50) {
//       console.log(`[${symbol}] Not enough candles. Need at least 50.`);
//       return "HOLD";
//     }

//     const closePrices = candles.map((c) => c.close);
//     const highPrices = candles.map((c) => c.high);
//     const lowPrices = candles.map((c) => c.low);

//     console.log(
//       `[${symbol}] Calculating TEMA with period ${PINE_INPUTS.temaLength}...`
//     );
//     const tema = calculateTEMA(closePrices, PINE_INPUTS.temaLength);
//     console.log(`[${symbol}] TEMA calculated. Last TEMA: ${tema.at(-1)}`);

//     console.log(
//       `[${symbol}] Calculating RSI with period ${PINE_INPUTS.rsiLength}...`
//     );
//     const rsi = RSI.calculate({
//       period: PINE_INPUTS.rsiLength,
//       values: closePrices,
//     });
//     console.log(`[${symbol}] RSI calculated. Last RSI: ${rsi.at(-1)}`);

//     console.log(
//       `[${symbol}] Calculating MACD (fast: ${PINE_INPUTS.macdFast}, slow: ${PINE_INPUTS.macdSlow}, signal: ${PINE_INPUTS.macdSignal})...`
//     );
//     const macd = MACD.calculate({
//       values: closePrices,
//       fastPeriod: PINE_INPUTS.macdFast,
//       slowPeriod: PINE_INPUTS.macdSlow,
//       signalPeriod: PINE_INPUTS.macdSignal,
//       SimpleMAOscillator: false,
//       SimpleMASignal: false,
//     });
//     console.log(
//       `[${symbol}] MACD calculated. Last MACD: ${JSON.stringify(macd.at(-1))}`
//     );

//     console.log(
//       `[${symbol}] Calculating ADX with period ${PINE_INPUTS.adxLength}...`
//     );
//     const adx = ADX.calculate({
//       close: closePrices,
//       high: highPrices,
//       low: lowPrices,
//       period: PINE_INPUTS.adxLength,
//     });
//     console.log(
//       `[${symbol}] ADX calculated. Last ADX: ${JSON.stringify(adx.at(-1))}`
//     );

//     // --- Latest values ---
//     const currentPrice = closePrices.at(-1);
//     const currentTema = tema.at(-1);
//     const currentRsi = rsi.at(-1);
//     const currentMacd = macd.at(-1);
//     const currentAdx = adx.at(-1);

//     console.log(`[${symbol}] Current Price: ${currentPrice}`);
//     console.log(`[${symbol}] Current TEMA: ${currentTema}`);
//     console.log(`[${symbol}] Current RSI: ${currentRsi}`);
//     console.log(
//       `[${symbol}] Current MACD: MACD=${currentMacd.MACD}, Signal=${currentMacd.signal}`
//     );
//     console.log(
//       `[${symbol}] Current ADX: adx=${currentAdx.adx}, pdi=${currentAdx.pdi}, mdi=${currentAdx.mdi}`
//     );

//     if (!currentTema || !currentRsi || !currentMacd || !currentAdx) {
//       console.log(`[${symbol}] Missing indicator values. Holding.`);
//       return "HOLD";
//     }

//     // --- RSI Bounce Logic ---
//     const rsiValues = rsi.slice(-5); // last 5 RSI values
//     console.log(`[${symbol}] Last 5 RSI values for bounce check: ${rsiValues}`);

//     const [r1, r2, r3] = rsiValues.slice(-3); // Last 3 values

//     let rsiBounceLong = false;
//     let rsiBounceShort = false;

//     // LONG: RSI touched any low (e.g., 35 or below), then started rising
//     if (
//       r3 <= PINE_INPUTS.rsiOversold && // RSI reached oversold area
//       r2 > r3 && // RSI started bouncing up
//       r1 > r2 // RSI continued rising
//     ) {
//       rsiBounceLong = true;
//       console.log(`[${symbol}] RSI Bounce LONG detected.`);
//     } else {
//       console.log(`[${symbol}] No RSI Bounce LONG.`);
//     }

//     // SHORT: RSI touched any high (e.g., 65 or above), then started falling
//     if (
//       r3 >= PINE_INPUTS.rsiOverbought && // RSI reached overbought area
//       r2 < r3 && // RSI started falling
//       r1 < r2 // RSI continued falling
//     ) {
//       rsiBounceShort = true;
//       console.log(`[${symbol}] RSI Bounce SHORT detected.`);
//     } else {
//       console.log(`[${symbol}] No RSI Bounce SHORT.`);
//     }

//     // --- Enhanced Long Condition with TEMA + MACD ---
//     const longCondition =
//       currentPrice > currentTema && // Price above TEMA (uptrend)
//       rsiBounceLong && // RSI bounced from oversold
//       currentMacd.MACD > currentMacd.signal && // MACD bullish crossover
//       currentAdx.adx > PINE_INPUTS.adxThreshold && // Strong trend
//       currentAdx.pdi > currentAdx.mdi; // Bullish directional movement

//     console.log(`[${symbol}] Long Condition Components:`);
//     console.log(`  - Price > TEMA: ${currentPrice > currentTema}`);
//     console.log(`  - RSI Bounce Long: ${rsiBounceLong}`);
//     console.log(`  - MACD > Signal: ${currentMacd.MACD > currentMacd.signal}`);
//     console.log(
//       `  - ADX > Threshold: ${currentAdx.adx > PINE_INPUTS.adxThreshold}`
//     );
//     console.log(`  - PDI > MDI: ${currentAdx.pdi > currentAdx.mdi}`);
//     console.log(`[${symbol}] Long Condition: ${longCondition}`);

//     // --- Enhanced Short Condition with TEMA + MACD ---
//     const shortCondition =
//       currentPrice < currentTema && // Price below TEMA (downtrend)
//       rsiBounceShort && // RSI bounced from overbought
//       currentMacd.MACD < currentMacd.signal && // MACD bearish crossover
//       currentAdx.adx > PINE_INPUTS.adxThreshold && // Strong trend
//       currentAdx.mdi > currentAdx.pdi; // Bearish directional movement

//     console.log(`[${symbol}] Short Condition Components:`);
//     console.log(`  - Price < TEMA: ${currentPrice < currentTema}`);
//     console.log(`  - RSI Bounce Short: ${rsiBounceShort}`);
//     console.log(`  - MACD < Signal: ${currentMacd.MACD < currentMacd.signal}`);
//     console.log(
//       `  - ADX > Threshold: ${currentAdx.adx > PINE_INPUTS.adxThreshold}`
//     );
//     console.log(`  - MDI > PDI: ${currentAdx.mdi > currentAdx.pdi}`);
//     console.log(`[${symbol}] Short Condition: ${shortCondition}`);

//     if (longCondition) {
//       console.log(`[${symbol}] ✅ LONG signal (All conditions met).`);
//       return "LONG";
//     } else if (shortCondition) {
//       console.log(`[${symbol}] ✅ SHORT signal (All conditions met).`);
//       return "SHORT";
//     }

//     console.log(`[${symbol}] ❌ HOLD (conditions not met).`);
//     return "HOLD";
//   } catch (err) {
//     console.error(`[${symbol}] ❗ Error in entry signal check:`, err.message);
//     return "HOLD";
//   }
// }

// module.exports = { checkEntrySignal };
