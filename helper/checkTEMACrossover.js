const { calculateTEMA } = require("./calculateTEMA");
const { getCandles } = require("./getCandles");

async function checkTEMACrossover(symbol, side) {
  try {
    const candles = await getCandles(symbol, "1m", 1000);
    const closes = candles.map((k) => parseFloat(k.close));
    const tema15 = calculateTEMA(closes, 15);
    const tema21 = calculateTEMA(closes, 21);

    if (tema15.length < 2 || tema21.length < 2) {
      console.warn(`[${symbol}] Not enough data to calculate TEMA crossover`);
      return false;
    }
    const currentTEMA15 = tema15[tema15.length - 1];
    const currentTEMA21 = tema21[tema21.length - 1];
    const prevTEMA15 = tema15[tema15.length - 2];
    const prevTEMA21 = tema21[tema21.length - 2];

    console.log(
      `[${symbol}] Current TEMA15: ${currentTEMA15.toFixed(
        4
      )}, TEMA21: ${currentTEMA21.toFixed(4)}`
    );
    console.log(
      `[${symbol}] Previous TEMA15: ${prevTEMA15.toFixed(
        4
      )}, TEMA21: ${prevTEMA21.toFixed(4)}`
    );

    if (side === "LONG") {
      const bearishCrossover = currentTEMA15 < currentTEMA21;
      console.log(
        `[${symbol}] LONG - Checking bearish crossover: ${bearishCrossover}`
      );
      return bearishCrossover;
    } else if (side === "SHORT") {
      const bullishCrossover = currentTEMA15 > currentTEMA21;
      console.log(
        `[${symbol}] SHORT - Checking bullish crossover: ${bullishCrossover}`
      );
      return bullishCrossover;
    }

    return false;
  } catch (error) {
    console.error(
      `Error checking TEMA crossover for ${symbol}:`,
      error.message
    );
    return false;
  }
}
module.exports = { checkTEMACrossover };