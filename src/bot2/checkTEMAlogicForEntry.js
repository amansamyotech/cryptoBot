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

// === Bollinger Bands ===
function calculateBollingerBands(prices, length) {
  if (prices.length < length) return [null, null];
  const slice = prices.slice(-length);
  const mean = slice.reduce((a, b) => a + b, 0) / length;
  const variance =
    slice.reduce((a, b) => a + Math.pow(b - mean, 2), 0) / length;
  const dev = Math.sqrt(variance) * 2;
  return [mean + dev, mean - dev];
}

// === RSI ===
function calculateRSI(prices, length) {
  if (prices.length < length + 1) return null;

  let gains = 0,
    losses = 0;
  for (let i = 1; i <= length; i++) {
    const diff = prices[prices.length - i] - prices[prices.length - i - 1];
    if (diff >= 0) gains += diff;
    else losses -= diff;
  }
  if (losses === 0) return 100;
  const rs = gains / losses;
  return 100 - 100 / (1 + rs);
}

// === ADX (simplified from DMI) ===
function calculateADX(candles, length) {
  if (candles.length < length + 1) return null;

  let plusDM = [],
    minusDM = [],
    tr = [];
  for (let i = 1; i < candles.length; i++) {
    const high = candles[i].high,
      low = candles[i].low;
    const prevHigh = candles[i - 1].high,
      prevLow = candles[i - 1].low,
      prevClose = candles[i - 1].close;

    const upMove = high - prevHigh;
    const downMove = prevLow - low;

    plusDM.push(upMove > downMove && upMove > 0 ? upMove : 0);
    minusDM.push(downMove > upMove && downMove > 0 ? downMove : 0);

    const trueRange = Math.max(
      high - low,
      Math.abs(high - prevClose),
      Math.abs(low - prevClose)
    );
    tr.push(trueRange);
  }

  const atr = tr.slice(-length).reduce((a, b) => a + b, 0) / length;
  const plusDI = (plusDM.slice(-length).reduce((a, b) => a + b, 0) / atr) * 100;
  const minusDI =
    (minusDM.slice(-length).reduce((a, b) => a + b, 0) / atr) * 100;

  const dx = (Math.abs(plusDI - minusDI) / (plusDI + minusDI)) * 100;
  return dx;
}

// === Sideways Market Detection ===
function isSidewaysMarket(
  candles,
  lookbackPeriod = 30,
  bbThreshold = 1.0,
  adxThreshold = 20.0,
  rangeThreshold = 1.0
) {
  const closes = candles.map((c) => c.close);
  const [bbUpper, bbLower] = calculateBollingerBands(closes, 20);
  if (!bbUpper || !bbLower) return false;

  const bbWidth = ((bbUpper - bbLower) / closes[closes.length - 1]) * 100;
  const adx = calculateADX(candles, 14);
  const highestHigh = Math.max(
    ...candles.slice(-lookbackPeriod).map((c) => c.high)
  );
  const lowestLow = Math.min(
    ...candles.slice(-lookbackPeriod).map((c) => c.low)
  );
  const priceRange =
    ((highestHigh - lowestLow) / closes[closes.length - 1]) * 100;

  return (
    bbWidth < bbThreshold && adx < adxThreshold && priceRange < rangeThreshold
  );
}

// === Final Entry Function ===
async function checkTEMAEntry2(symbol) {
  try {
    const candles = await getCandles(symbol, "3m", 1000);
    const closes = candles.map((c) => c.close);

    const tema15 = calculateTEMA(closes, 15);

    const tema21 = calculateTEMA(closes, 21);

    if (tema15.length < 2 || tema21.length < 2) return "HOLD";

    const currTEMA15 = tema15[tema15.length - 1];
    const currTEMA21 = tema21[tema21.length - 1];

    const sideways = isSidewaysMarket(candles);

    if (!sideways && currTEMA15 > currTEMA21) {
      return "LONG"; // crossover up
    }
    if (!sideways && currTEMA15 < currTEMA21) {
      return "SHORT"; // crossover down
    }

    return "HOLD";
  } catch (err) {
    console.error(`Error in checkTEMAEntry for ${symbol}:`, err.message);
    return "HOLD";
  }
}

module.exports = { checkTEMAEntry2 };
