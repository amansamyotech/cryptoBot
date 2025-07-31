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
    const pastCandles5m = await getCandles(symbol, TIMEFRAME_MAIN, 100);

    if (pastCandles5m.length < 4) {
      return "HOLD";
    }

    const fourthLastCandle = pastCandles5m[pastCandles5m.length - 4];
    const thirdLastCandle = pastCandles5m[pastCandles5m.length - 3];
    const secondLastCandle = pastCandles5m[pastCandles5m.length - 2];
    const lastCandle = pastCandles5m[pastCandles5m.length - 1];

    const angle = getCandleAngle(fourthLastCandle);
    const baseClose = fourthLastCandle.close;

    const closesAbove = [
      thirdLastCandle.close,
      secondLastCandle.close,
      lastCandle.close,
    ].every((close) => close > baseClose);

    const closesBelow = [
      thirdLastCandle.close,
      secondLastCandle.close,
      lastCandle.close,
    ].every((close) => close < baseClose);

    if (angle >= 90 && angle <= 150 && closesAbove) {
      return "LONG";
    }

    if (angle >= 210 && angle <= 270 && closesBelow) {
      return "SHORT";
    }

    return "HOLD";
  } catch (err) {
    console.error(`❌ Decision error for ${symbol}:`, err.message);
    return "HOLD";
  }
}

module.exports = { decideTradeDirection };
