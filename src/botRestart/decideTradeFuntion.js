// const Binance = require("node-binance-api");
// const axios = require("axios");

// const binance = new Binance().options({
//   APIKEY: "tPCOyhkpaVUj6it6BiKQje0WxcJjUOV30EQ7dY2FMcqXunm9DwC8xmuiCkgsyfdG",
//   APISECRET: "UpK4CPfKywFrAJDInCAXPmWVSiSs5xVVL2nDes8igCONl3cVgowDjMbQg64fm5pr",
//   useServerTime: true,
//   test: false,
// });

// const TIMEFRAME_MAIN = "5m";
// const TIMEFRAME_TREND = "15m";

// async function getCandles(symbol, interval, limit = 1000) {
//   try {
//     const res = await axios.get(
//       `https://fapi.binance.com/fapi/v1/klines?symbol=${symbol}&interval=${interval}&limit=${limit}`
//     );
//     if (!res.data || !Array.isArray(res.data)) {
//       console.error(
//         `❌ Invalid response from axios for ${symbol} - ${interval}`
//       );
//       return [];
//     }
//     return res.data
//       .map((c) => ({
//         openTime: c[0],
//         open: parseFloat(c[1]),
//         high: parseFloat(c[2]),
//         low: parseFloat(c[3]),
//         close: parseFloat(c[4]),
//         volume: parseFloat(c[5]),
//       }))
//       .filter((c) => !isNaN(c.close));
//   } catch (err) {
//     console.error(
//       `❌ Error fetching candles for ${symbol} (${interval}):`,
//       err.message
//     );
//     return [];
//   }
// }

// function calculateEMA(prices, period) {
//   const k = 2 / (period + 1); // Smoothing factor
//   let ema = prices[0]; // Start with the first price
//   const emaArray = [ema];

//   for (let i = 1; i < prices.length; i++) {
//     ema = prices[i] * k + ema * (1 - k);
//     emaArray.push(ema);
//   }

//   return emaArray;
// }

// function getCandleAngle(candle, timeSpan = 300) {
//   const delta = ((candle.close - candle.open) / candle.open) * 100000;
//   const rawAngleRad = Math.atan(delta / timeSpan);
//   let angle = rawAngleRad * (180 / Math.PI);

//   if (candle.close > candle.open) {
//     angle = 90 + (Math.abs(delta) / (Math.abs(delta) + 100)) * 60;
//   } else if (candle.close < candle.open) {
//     angle = 210 + (Math.abs(delta) / (Math.abs(delta) + 100)) * 60;
//   } else {
//     angle = 180;
//   }

//   return angle;
// }

// async function decideTradeDirection(symbol) {
//   try {
//     const pastCandles5m = await getCandles(symbol, TIMEFRAME_MAIN, 1000);
//     if (pastCandles5m.length < 15) {
//       console.log("in the if block");

//       // Need enough candles for EMA 9 and EMA 15
//       // console.log(`⚠️ Insufficient candles for ${symbol} at index ${candleIndex}: 5m=${pastCandles5m.length}`);
//       return "HOLD";
//     }

//     const secondLastCandle = pastCandles5m[pastCandles5m.length - 2]; // 2nd last candle
//     const angle = getCandleAngle(secondLastCandle);

//     // Calculate EMA 9 and EMA 15
//     const closePrices = pastCandles5m.map((candle) => candle.close);
//     const ema9 = calculateEMA(closePrices, 9);

//     const ema15 = calculateEMA(closePrices, 15);

//     const lastEma9 = ema9[ema9.length - 2]; // EMA 9 for second last candle
//     const lastEma15 = ema15[ema15.length - 2]; // EMA 15 for second last candle
//     const prevEma9 = ema9[ema9.length - 3]; // EMA 9 for third last candle
//     const prevEma15 = ema15[ema15.length - 3]; // EMA 15 for third last candle

//     let emaSignal = "HOLD";

//     if (prevEma9 <= prevEma15 && lastEma9 > lastEma15) {
//       emaSignal = "LONG"; // Bullish crossover
//     } else if (prevEma9 >= prevEma15 && lastEma9 < lastEma15) {
//       emaSignal = "SHORT"; // Bearish crossover
//     }

//     let finalSignal = "HOLD";

//     if (angle >= 90 && angle <= 160 && emaSignal === "LONG") {
//       // console.log(`✅ Strong LONG signal for ${symbol} (Angle: ${angle.toFixed(2)}°, EMA9: ${lastEma9.toFixed(6)}, EMA15: ${lastEma15.toFixed(6)})`);
//       finalSignal = "LONG";
//     } else if (angle >= 220 && angle <= 270 && emaSignal === "SHORT") {
//       // console.log(`✅ Strong SHORT signal for ${symbol} (Angle: ${angle.toFixed(2)}°, EMA9: ${lastEma9.toFixed(6)}, EMA15: ${lastEma15.toFixed(6)})`);
//       finalSignal = "SHORT";
//     } else {
//       // console.log(`⚖️ No clear signal for ${symbol}. Decision: HOLD (Angle: ${angle.toFixed(2)}°, EMA9: ${lastEma9.toFixed(6)}, EMA15: ${lastEma15.toFixed(6)})`);
//     }

//     return emaSignal;
//   } catch (err) {
//     console.error(`❌ Decision error for ${symbol}:`, err.message);
//     return "HOLD";
//   }
// }
// module.exports = { decideTradeDirection };

const Binance = require("node-binance-api");
const axios = require("axios");

const binance = new Binance().options({
  APIKEY: "tPCOyhkpaVUj6it6BiKQje0WxcJjUOV30EQ7dY2FMcqXunm9DwC8xmuiCkgsyfdG",
  APISECRET: "UpK4CPfKywFrAJDInCAXPmWVSiSs5xVVL2nDes8igCONl3cVgowDjMbQg64fm5pr",
  useServerTime: true,
  test: false,
});

const TIMEFRAME_MAIN = "5m";
const TIMEFRAME_TREND = "15m";

async function getCandles(symbol, interval, limit = 1000) {
  try {
    const res = await axios.get(
      `https://fapi.binance.com/fapi/v1/klines?symbol=${symbol}&interval=${interval}&limit=${limit}`
    );
    if (!res.data || !Array.isArray(res.data)) {
      console.error(
        `❌ Invalid response from axios for ${symbol} - ${interval}`
      );
      return [];
    }
    return res.data
      .map((c) => ({
        openTime: c[0],
        open: parseFloat(c[1]),
        high: parseFloat(c[2]),
        low: parseFloat(c[3]),
        close: parseFloat(c[4]),
        volume: parseFloat(c[5]),
      }))
      .filter((c) => !isNaN(c.close));
  } catch (err) {
    console.error(
      `❌ Error fetching candles for ${symbol} (${interval}):`,
      err.message
    );
    return [];
  }
}

function calculateEMA(prices, period) {
  const k = 2 / (period + 1); // Smoothing factor
  let ema = prices[0]; // Start with the first price
  const emaArray = [ema];

  for (let i = 1; i < prices.length; i++) {
    ema = prices[i] * k + ema * (1 - k);
    emaArray.push(ema);
  }

  return emaArray;
}

function calculateTEMA(prices, period) {
  // First EMA
  const k = 2 / (period + 1);
  let ema1 = [prices[0]];
  for (let i = 1; i < prices.length; i++) {
    ema1.push(prices[i] * k + ema1[i - 1] * (1 - k));
  }

  // Second EMA (EMA of EMA)
  let ema2 = [ema1[0]];
  for (let i = 1; i < ema1.length; i++) {
    ema2.push(ema1[i] * k + ema2[i - 1] * (1 - k));
  }

  // Third EMA (EMA of EMA of EMA)
  let ema3 = [ema2[0]];
  for (let i = 1; i < ema2.length; i++) {
    ema3.push(ema2[i] * k + ema3[i - 1] * (1 - k));
  }

  // TEMA = (3*EMA1 - 3*EMA2 + EMA3)
  const tema = [];
  for (let i = 0; i < prices.length; i++) {
    tema.push(3 * ema1[i] - 3 * ema2[i] + ema3[i]);
  }

  return tema;
}

function getCandleAngle(candle, timeSpan = 300) {
  const delta = ((candle.close - candle.open) / candle.open) * 100000;
  const rawAngleRad = Math.atan(delta / timeSpan);
  let angle = rawAngleRad * (180 / Math.PI);

  if (candle.close > candle.open) {
    angle = 90 + (Math.abs(delta) / (Math.abs(delta) + 100)) * 60;
  } else if (candle.close < candle.open) {
    angle = 210 + (Math.abs(delta) / (Math.abs(delta) + 100)) * 60;
  } else {
    angle = 180;
  }

  return angle;
}
function isSidewaysMarket(
  candles,
  lookbackPeriod = 20,
  thresholdPercent = 0.8
) {
  if (candles.length < lookbackPeriod) {
    return false; // Not enough data
  }

  // Get the last 'lookbackPeriod' candles (shorter for scalping)
  const recentCandles = candles.slice(-lookbackPeriod);

  // Find highest high and lowest low in the period
  const highs = recentCandles.map((c) => c.high);
  const lows = recentCandles.map((c) => c.low);

  const highestHigh = Math.max(...highs);
  const lowestLow = Math.min(...lows);

  // Calculate the range as percentage of current price
  const currentPrice = candles[candles.length - 1].close;
  const priceRange = ((highestHigh - lowestLow) / currentPrice) * 100;

  // Check recent volatility - for scalping we want to avoid low volatility periods
  const recentVolatility =
    recentCandles.slice(-5).reduce((sum, candle) => {
      return sum + Math.abs((candle.high - candle.low) / candle.close) * 100;
    }, 0) / 5;

  // EMA convergence check with shorter EMAs for scalping
  const closePrices = recentCandles.map((c) => c.close);
  const ema5 = calculateEMA(closePrices, 5);
  const ema15 = calculateEMA(closePrices, 15);

  const lastEma5 = ema5[ema5.length - 1];
  const lastEma15 = ema15[ema15.length - 1];

  // Calculate EMA divergence as percentage
  const emaConvergence = Math.abs((lastEma5 - lastEma15) / currentPrice) * 100;

  // Check if price is oscillating around EMAs (sideways characteristic)
  let priceAboveEma = 0;
  let priceBelowEma = 0;
  const avgEma = (lastEma5 + lastEma15) / 2;

  recentCandles.slice(-10).forEach((candle) => {
    if (candle.close > avgEma) priceAboveEma++;
    else priceBelowEma++;
  });

  const oscillationRatio = Math.min(priceAboveEma, priceBelowEma) / 10;

  // Market is sideways if:
  // 1. Price range is small (tighter for scalping)
  // 2. EMAs are converging
  // 3. Low recent volatility
  // 4. Price is oscillating around EMAs (not trending)
  const isSideways =
    priceRange <= thresholdPercent &&
    emaConvergence <= 0.3 &&
    recentVolatility <= 0.4 &&
    oscillationRatio >= 0.3; // At least 30% of candles on each side

  if (isSideways) {
    console.log(
      `📊 Sideways market detected for scalping: Range=${priceRange.toFixed(
        2
      )}%, EMA convergence=${emaConvergence.toFixed(
        3
      )}%, Volatility=${recentVolatility.toFixed(2)}%`
    );
  }

  return isSideways;
}

async function decideTradeDirection(symbol) {
  try {
    const pastCandles5m = await getCandles(symbol, TIMEFRAME_MAIN, 1000);
    if (pastCandles5m.length < 50) {
      console.log("❌ Insufficient candles for analysis");
      return "HOLD";
    }

    if (isSidewaysMarket(pastCandles5m)) {
      console.log(`⚖️ Market is sideways for ${symbol}. Decision: HOLD`);
      return "HOLD";
    }

    const closePrices = pastCandles5m.map((c) => c.close);

    // Using TEMA instead of EMA
    const tema9 = calculateTEMA(closePrices, 9);
    const tema15 = calculateTEMA(closePrices, 15);

    const lastTema9 = tema9[tema9.length - 2];
    const lastTema15 = tema15[tema15.length - 2];
    const prevTema9 = tema9[tema9.length - 3];
    const prevTema15 = tema15[tema15.length - 3];

    let temaSignal = "HOLD";
    let crossoverCandle = null;

    if (prevTema9 <= prevTema15 && lastTema9 > lastTema15) {
      temaSignal = "LONG";
      crossoverCandle = pastCandles5m[pastCandles5m.length - 2];
    } else if (prevTema9 >= prevTema15 && lastTema9 < lastTema15) {
      temaSignal = "SHORT";
      crossoverCandle = pastCandles5m[pastCandles5m.length - 2];
    }

    if (!crossoverCandle) return "HOLD";

    const angle = getCandleAngle(crossoverCandle);

    if (angle >= 90 && angle <= 135 && temaSignal === "LONG") {
      return "LONG";
    } else if (angle >= 225 && angle <= 280 && temaSignal === "SHORT") {
      return "SHORT";
    } else {
      return "HOLD";
    }
  } catch (err) {
    console.error(`❌ Decision error for ${symbol}:`, err.message);
    return "HOLD";
  }
}
module.exports = { decideTradeDirection };
