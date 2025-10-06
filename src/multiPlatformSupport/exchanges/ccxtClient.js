const ccxt = require("ccxt");

const API_KEYS = {
  binance: {
    apiKey: "0kB82SnxRkon7oDJqmCPykl4ar0afRYrScffMnRA3kTR8Qfq986IBwjqNA7fIauI",
    secret: "6TWxLtkLDaCfDh4j4YcLa2WLS99zkZtaQjJnsAeGAtixHIDXjPdJAta5BJxNWrZV",
  },
  bybit: {
    apiKey: "YOUR_BYBIT_API_KEY",
    secret: "YOUR_BYBIT_SECRET",
  },
  okx: {
    apiKey: "YOUR_OKX_API_KEY",
    secret: "YOUR_OKX_SECRET",
  },
  kucoin: {
    apiKey: "YOUR_KUCOIN_API_KEY",
    secret: "YOUR_KUCOIN_SECRET",
  },
};

const CURRENT_EXCHANGE = "binance";

const exchangeClass = ccxt[CURRENT_EXCHANGE];
const exchange = new exchangeClass({
  apiKey: API_KEYS[CURRENT_EXCHANGE].apiKey,
  secret: API_KEYS[CURRENT_EXCHANGE].secret,
  enableRateLimit: true,
  options: {
    defaultType: "future",
  },
});

async function getBalance() {
  try {
    const balances = await exchange.fetchBalance();
    const usdtBalance = balances.total.USDT || 0;
    return usdtBalance;
  } catch (err) {
    console.error("Error fetching balance:", err.message);
    return 0;
  }
}

async function getCandles(symbol, timeframe = "5m", limit = 100) {
  try {
    const candles = await exchange.fetchOHLCV(
      symbol,
      timeframe,
      undefined,
      limit
    );
    return candles.map(([time, open, high, low, close, volume]) => ({
      time,
      open,
      high,
      low,
      close,
      volume,
    }));
  } catch (err) {
    console.error(`Error fetching candles for ${symbol}:`, err.message);
    return [];
  }
}

async function placeOrder(side, symbol, amount, leverage = 3) {
  try {
    if (exchange.has["setLeverage"]) {
      try {
        await exchange.setLeverage(leverage, symbol);
      } catch (e) {
        console.log(
          `Leverage not supported on ${CURRENT_EXCHANGE}:`,
          e.message
        );
      }
    }

    const orderSide = side.toLowerCase() === "long" ? "buy" : "sell";
    const order = await exchange.createMarketOrder(symbol, orderSide, amount);
    console.log(`${side} order placed for ${symbol} | Qty: ${amount}`);
    return order;
  } catch (err) {
    console.error(`Error placing ${side} order for ${symbol}:`, err.message);
    return null;
  }
}

async function cancelAllOrders(symbol) {
  try {
    const result = await exchange.cancelAllOrders(symbol);
    console.log(`Cancelled all orders for ${symbol}`);
    return result;
  } catch (err) {
    console.error(`Error cancelling orders for ${symbol}:`, err.message);
    return null;
  }
}

async function getPositions(symbol) {
  try {
    if (exchange.has["fetchPositions"]) {
      const positions = await exchange.fetchPositions([symbol]);
      return positions;
    }
    console.warn("fetchPositions not supported by this exchange.");
    return [];
  } catch (err) {
    console.error(`Error fetching positions for ${symbol}:`, err.message);
    return [];
  }
}

async function getPrice(symbol) {
  try {
    const ticker = await exchange.fetchTicker(symbol);
    return ticker.last;
  } catch (err) {
    console.error(`Error fetching price for ${symbol}:`, err.message);
    return null;
  }
}

module.exports = {
  exchange,
  getBalance,
  getCandles,
  placeOrder,
  cancelAllOrders,
  getPositions,
  getPrice,
};
