const { getCandles } = require("./helper/getCandles.js");

// === TEMA Calculation ===
function calculateTEMA(prices, period) {
  if (!prices || prices.length < period) return [];
  const k = 2 / (period + 1);

  let ema1 = [prices[0]];
  for (let i = 1; i < prices.length; i++) {
    ema1[i] = prices[i] * k + ema1[i - 1] * (1 - k);
  }

  let ema2 = [ema1[0]];
  for (let i = 1; i < ema1.length; i++) {
    ema2[i] = ema1[i] * k + ema2[i - 1] * (1 - k);
  }

  let ema3 = [ema2[0]];
  for (let i = 1; i < ema2.length; i++) {
    ema3[i] = ema2[i] * k + ema3[i - 1] * (1 - k);
  }

  const tema = [];
  for (let i = 0; i < prices.length; i++) {
    tema[i] = 3 * ema1[i] - 3 * ema2[i] + ema3[i];
  }

  return tema;
}
// === Volume Check ===
function isHighVolume(candles, lookback = 20, multiplier = 1.5) {
  if (candles.length < lookback + 1) return false;

  const volumes = candles.slice(-lookback - 1, -1).map((c) => c.volume);
  const avgVolume = volumes.reduce((a, b) => a + b, 0) / lookback;

  const lastVolume = candles[candles.length - 1].volume;

  return lastVolume > avgVolume * multiplier;
}

async function checkTEMAEntry(symbol) {
  try {
    const candles = await getCandles(symbol, "3m", 1000); // fetch last 1000 candles
    const closes = candles.map((c) => c.close);

    const tema15 = calculateTEMA(closes, 15);
    const tema21 = calculateTEMA(closes, 21);

    if (tema15.length < 2 || tema21.length < 2) return "HOLD";

    const currTEMA15 = tema15[tema15.length - 1];
    const currTEMA21 = tema21[tema21.length - 1];

    const prevTEMA15 = tema15[tema15.length - 2];
    const prevTEMA21 = tema21[tema21.length - 2];

    // Crossover detection
    if (prevTEMA15 <= prevTEMA21 && currTEMA15 > currTEMA21) {
      return "LONG"; // TEMA 15 crossed above TEMA 21
    }
    if (prevTEMA15 >= prevTEMA21 && currTEMA15 < currTEMA21) {
      return "SHORT"; // TEMA 15 crossed below TEMA 21
    }

    return "HOLD"; // no crossover
  } catch (err) {
    console.error(`Error in checkTEMAEntry for ${symbol}:`, err.message);
    return "HOLD";
  }
}

module.exports = { checkTEMAEntry };
