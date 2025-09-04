const { calculateTEMA } = require("./calculateTEMA");
const { getCandles } = require("./getCandlesWebSokcets");

const lastProcessedCandleEntry = {};
const lastProcessedCandleExit = {};


async function hasNewCandleFormed(symbol, type = "entry") {
  try {
    const candles = await getCandles(symbol, "3m", 5);
    if (candles.length < 2) return false;

    const latestCandleTime = candles[candles.length - 1].openTime;
    const trackingObject =
      type === "entry" ? lastProcessedCandleEntry : lastProcessedCandleExit;
    const lastProcessed = trackingObject[symbol];

    // If this is the first check or we have a new candle
    if (!lastProcessed || latestCandleTime > lastProcessed) {
      console.log(
        `[${symbol}] New candle detected for ${type} at ${new Date(
          latestCandleTime
        ).toISOString()}`
      );
      trackingObject[symbol] = latestCandleTime;
      return true;
    }

    return false;
  } catch (error) {
    console.error(`Error checking new candle for ${symbol}:`, error.message);
    return false;
  }
}


async function getTEMA(symbol, length) {
  try {
    const candles = await getCandles(symbol, "3m", length * 3 + 10);
    const closes = candles.map((c) => c.close);
    return calculateTEMA(closes, length);
  } catch (err) {
    console.error(`Error calculating TEMA for ${symbol}:`, err.message);
    return null;
  }
}


module.exports = { hasNewCandleFormed , getTEMA };