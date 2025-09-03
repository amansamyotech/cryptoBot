const axios = require("axios");
const WebSocket = require("ws");
const candleCache = {};
async function getCandles(symbol, interval, limit = 1000) {
  const cacheKey = `${symbol}_${interval}`;

  if (candleCache[cacheKey] && candleCache[cacheKey].length > 0) {
    console.log(`📡 Using WebSocket data for ${symbol}`);
    return candleCache[cacheKey].slice(-limit);
  }
  try {
    console.log(`📊 Fetching from API for ${symbol}`);
    const res = await axios.get(
      `https://fapi.binance.com/fapi/v1/klines?symbol=${symbol}&interval=${interval}&limit=${limit}`
    );

    const candles = res.data
      .map((c) => ({
        openTime: c[0],
        open: parseFloat(c[1]),
        high: parseFloat(c[2]),
        low: parseFloat(c[3]),
        close: parseFloat(c[4]),
        volume: parseFloat(c[5]),
      }))
      .filter((c) => !isNaN(c.close));
    startWebSocketInBackground(symbol, interval);

    return candles;
  } catch (err) {
    console.error(
      `❌ Error fetching candles for ${symbol} (${interval}):`,
      err.message
    );
    return [];
  }
}
function startWebSocketInBackground(symbol, interval) {
  const cacheKey = `${symbol}_${interval}`;
  if (candleCache[cacheKey] && candleCache[cacheKey].ws) return;

  const wsUrl = `wss://fstream.binance.com/ws/${symbol.toLowerCase()}@kline_${interval}`;
  const ws = new WebSocket(wsUrl);
  if (!candleCache[cacheKey]) {
    candleCache[cacheKey] = [];
  }
  candleCache[cacheKey].ws = ws;

  ws.on("open", () => {
    console.log(`🚀 WebSocket started for ${symbol} ${interval}`);
  });

  ws.on("message", (data) => {
    const parsed = JSON.parse(data);
    const kline = parsed.k;

    const candle = {
      openTime: kline.t,
      open: parseFloat(kline.o),
      high: parseFloat(kline.h),
      low: parseFloat(kline.l),
      close: parseFloat(kline.c),
      volume: parseFloat(kline.v),
    };
    candleCache[cacheKey].push(candle);
    if (candleCache[cacheKey].length > 1000) {
      candleCache[cacheKey].shift();
    }
  });

  ws.on("error", (error) => {
    console.error(`❌ WebSocket error for ${symbol}:`, error.message);
  });

  ws.on("close", () => {
    console.log(`📡 WebSocket closed for ${symbol} ${interval}`);
    if (candleCache[cacheKey]) {
      delete candleCache[cacheKey].ws;
    }
  });
}

module.exports = {
  getCandles, 
};
