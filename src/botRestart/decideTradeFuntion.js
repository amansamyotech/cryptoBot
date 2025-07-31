const Binance = require("node-binance-api");
const axios = require("axios");

const binance = new Binance().options({
  APIKEY: "whfiekZqKdkwa9fEeUupVdLZTNxBqP1OCEuH2pjyImaWt51FdpouPPrCawxbsupK",
  APISECRET: "E4IcteWOQ6r9qKrBZJoBy4R47nNPBDepVXMnS3Lf2Bz76dlu0QZCNh82beG2rHq4",
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

async function decideTradeDirection(symbol) {
  try {
    const pastCandles5m = await getCandles(symbol, TIMEFRAME_MAIN, 1000);
    if (pastCandles5m.length < 15) {
      console.log('in the if block');
      
      // Need enough candles for EMA 9 and EMA 15
      // console.log(`⚠️ Insufficient candles for ${symbol} at index ${candleIndex}: 5m=${pastCandles5m.length}`);
      return "HOLD";
    }

    const secondLastCandle = pastCandles5m[pastCandles5m.length - 2]; // 2nd last candle
    const angle = getCandleAngle(secondLastCandle);

    // Calculate EMA 9 and EMA 15
    const closePrices = pastCandles5m.map((candle) => candle.close);
    const ema9 = calculateEMA(closePrices, 9);
    const ema15 = calculateEMA(closePrices, 15);

    const lastEma9 = ema9[ema9.length - 2]; // EMA 9 for second last candle
    const lastEma15 = ema15[ema15.length - 2]; // EMA 15 for second last candle
    const prevEma9 = ema9[ema9.length - 3]; // EMA 9 for third last candle
    const prevEma15 = ema15[ema15.length - 3]; // EMA 15 for third last candle

    let emaSignal = "HOLD";

    if (prevEma9 <= prevEma15 && lastEma9 > lastEma15) {
      emaSignal = "LONG"; // Bullish crossover
    } else if (prevEma9 >= prevEma15 && lastEma9 < lastEma15) {
      emaSignal = "SHORT"; // Bearish crossover
    }

    let finalSignal = "HOLD";

    if (angle >= 90 && angle <= 160 && emaSignal === "LONG") {
      // console.log(`✅ Strong LONG signal for ${symbol} (Angle: ${angle.toFixed(2)}°, EMA9: ${lastEma9.toFixed(6)}, EMA15: ${lastEma15.toFixed(6)})`);
      finalSignal = "LONG";
    } else if (angle >= 220 && angle <= 270 && emaSignal === "SHORT") {
      // console.log(`✅ Strong SHORT signal for ${symbol} (Angle: ${angle.toFixed(2)}°, EMA9: ${lastEma9.toFixed(6)}, EMA15: ${lastEma15.toFixed(6)})`);
      finalSignal = "SHORT";
    } else {
      // console.log(`⚖️ No clear signal for ${symbol}. Decision: HOLD (Angle: ${angle.toFixed(2)}°, EMA9: ${lastEma9.toFixed(6)}, EMA15: ${lastEma15.toFixed(6)})`);
    }

    return emaSignal;
  } catch (err) {
    console.error(`❌ Decision error for ${symbol}:`, err.message);
    return "HOLD";
  }
}
module.exports = { decideTradeDirection };
