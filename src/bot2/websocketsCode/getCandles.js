const axios = require("axios");
const WebSocket = require("ws");

// Cache for storing WebSocket data
const candleCache = {};

// Function to get candles - SAME interface as before
async function getCandles(symbol, interval, limit = 1000) {
  const cacheKey = `${symbol}_${interval}`;

  // If we have WebSocket data, return it
  if (candleCache[cacheKey] && candleCache[cacheKey].length > 0) {
    console.log(`📡 Using WebSocket data for ${symbol}`);
    return candleCache[cacheKey].slice(-limit);
  }

  // Otherwise, fetch from API (your original logic)
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

    // Start WebSocket for future calls
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

// Background WebSocket (internal function)
function startWebSocketInBackground(symbol, interval) {
  const cacheKey = `${symbol}_${interval}`;

  // Don't start if already running
  if (candleCache[cacheKey] && candleCache[cacheKey].ws) return;

  const wsUrl = `wss://fstream.binance.com/ws/${symbol.toLowerCase()}@kline_${interval}`;
  const ws = new WebSocket(wsUrl);

  // Initialize cache
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

    // Store in cache
    candleCache[cacheKey].push(candle);

    // Keep only last 1000 candles
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
  getCandles, // Same function, same usage!
};

const candles = await getCandles("DOGEUSDT", "3m", 100);
console.log(`candles`, candles);
