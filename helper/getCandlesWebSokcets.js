const axios = require("axios");
const WebSocket = require("ws");
const candleCache = {};
const wsConnections = new Set(); // Track active connections

async function getCandles(symbol, interval, limit = 150) {
  // Reduced from 1000
  const cacheKey = `${symbol}_${interval}`;

  // Always ensure we have enough reliable data
  if (candleCache[cacheKey] && candleCache[cacheKey].length >= limit) {
    console.log(
      `📡 Using WebSocket data for ${symbol} (${candleCache[cacheKey].length} candles)`
    );
    return candleCache[cacheKey].slice(-limit);
  }

  try {
    console.log(
      `📊 Fetching from API for ${symbol} (need ${limit}, have ${
        candleCache[cacheKey]?.length || 0
      })`
    );

    const res = await axios.get(
      `https://fapi.binance.com/fapi/v1/klines?symbol=${symbol}&interval=${interval}&limit=${
        limit + 50
      }` // Get extra for buffer
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

    // Initialize cache with API data
    if (!candleCache[cacheKey]) {
      candleCache[cacheKey] = candles;
    } else {
      // Merge API data with existing cache, avoid duplicates
      const lastCacheTime =
        candleCache[cacheKey][candleCache[cacheKey].length - 1]?.openTime;
      const newCandles = candles.filter((c) => c.openTime > lastCacheTime);
      candleCache[cacheKey] = [...candleCache[cacheKey], ...newCandles].slice(
        -200
      ); // Keep max 200
    }

    // Start WebSocket only once
    startWebSocketInBackground(symbol, interval);

    return candleCache[cacheKey].slice(-limit);
  } catch (err) {
    console.error(
      `❌ Error fetching candles for ${symbol} (${interval}):`,
      err.message
    );

    // Fallback to cache if API fails
    if (candleCache[cacheKey] && candleCache[cacheKey].length > 50) {
      console.log(`🔄 Using cached data as fallback for ${symbol}`);
      return candleCache[cacheKey].slice(-limit);
    }

    return [];
  }
}

function startWebSocketInBackground(symbol, interval) {
  const cacheKey = `${symbol}_${interval}`;

  // Check if WebSocket already exists and is active
  if (
    candleCache[cacheKey]?.ws &&
    candleCache[cacheKey].ws.readyState === WebSocket.OPEN
  ) {
    return; // Already connected
  }

  const wsUrl = `wss://fstream.binance.com/ws/${symbol.toLowerCase()}@kline_${interval}`;
  const ws = new WebSocket(wsUrl);

  if (!candleCache[cacheKey]) {
    candleCache[cacheKey] = [];
  }
  candleCache[cacheKey].ws = ws;
  wsConnections.add(ws);

  ws.on("open", () => {
    console.log(`🚀 WebSocket connected for ${symbol} ${interval}`);
  });

  ws.on("message", (data) => {
    try {
      const parsed = JSON.parse(data);
      const kline = parsed.k;

      // Only process closed candles for accuracy
      if (!kline.x) return; // Skip if candle is not closed

      const candle = {
        openTime: kline.t,
        open: parseFloat(kline.o),
        high: parseFloat(kline.h),
        low: parseFloat(kline.l),
        close: parseFloat(kline.c),
        volume: parseFloat(kline.v),
      };

      // Avoid duplicate candles
      const existingIndex = candleCache[cacheKey].findIndex(
        (c) => c.openTime === candle.openTime
      );
      if (existingIndex !== -1) {
        candleCache[cacheKey][existingIndex] = candle; // Update existing
      } else {
        candleCache[cacheKey].push(candle); // Add new
      }

      // Keep cache size reasonable
      if (candleCache[cacheKey].length > 200) {
        candleCache[cacheKey] = candleCache[cacheKey].slice(-200);
      }

      console.log(
        `📈 Updated ${symbol} cache: ${candleCache[cacheKey].length} candles`
      );
    } catch (parseError) {
      console.error(
        `❌ WebSocket parse error for ${symbol}:`,
        parseError.message
      );
    }
  });

  ws.on("error", (error) => {
    console.error(`❌ WebSocket error for ${symbol}:`, error.message);
    wsConnections.delete(ws);
  });

  ws.on("close", (code, reason) => {
    console.log(
      `📡 WebSocket closed for ${symbol} ${interval} (${code}: ${reason})`
    );
    wsConnections.delete(ws);

    if (candleCache[cacheKey]) {
      delete candleCache[cacheKey].ws;
    }

    // Auto-reconnect after 5 seconds if not intentionally closed
    if (code !== 1000) {
      setTimeout(() => {
        console.log(`🔄 Reconnecting WebSocket for ${symbol}...`);
        startWebSocketInBackground(symbol, interval);
      }, 5000);
    }
  });
}

// Cleanup function for graceful shutdown
function closeAllWebSockets() {
  console.log(`🛑 Closing ${wsConnections.size} WebSocket connections...`);
  wsConnections.forEach((ws) => {
    if (ws.readyState === WebSocket.OPEN) {
      ws.close(1000, "Shutdown");
    }
  });
  wsConnections.clear();
}

// Handle process termination
process.on("SIGINT", closeAllWebSockets);
process.on("SIGTERM", closeAllWebSockets);

module.exports = {
  getCandles,
  closeAllWebSockets,
};
