const Binance = require("node-binance-api");

const binance = new Binance().options({
  APIKEY: "YOUR_API_KEY",
  APISECRET: "YOUR_API_SECRET",
  useServerTime: true,
  test: false,
});

// Store latest candlesticks in memory
const candlesStore = {};

// Subscribe to a symbol + interval
function subscribeCandles(symbol, interval = "3m") {
  binance.websockets.candlesticks([symbol], interval, (candlesticks) => {
    let { k: tick } = candlesticks;

    const candle = {
      openTime: tick.t,
      open: parseFloat(tick.o),
      high: parseFloat(tick.h),
      low: parseFloat(tick.l),
      close: parseFloat(tick.c),
      volume: parseFloat(tick.v),
    };

    if (!candlesStore[symbol]) candlesStore[symbol] = [];
    const arr = candlesStore[symbol];

    // Keep last 1000 candles
    if (arr.length >= 1000) arr.shift();
    arr.push(candle);
  });
}

// Function to get latest candles from memory
function getCandles(symbol, limit = 1000) {
  if (!candlesStore[symbol]) return [];
  return candlesStore[symbol].slice(-limit);
}

module.exports = {
  subscribeCandles,
  getCandles,
};

// Subscribe at the start
subscribeCandles("DOGEUSDT", "3m");
subscribeCandles("SOLUSDT", "3m");

// Later, in your bot logic
const latestCandles = getCandles("DOGEUSDT", 50);

console.log(`latestCandles`, latestCandles);
