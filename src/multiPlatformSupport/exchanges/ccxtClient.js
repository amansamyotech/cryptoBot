const ccxt = require("ccxt");

const API_KEYS = {
  binance: {
    apiKey: "0kB82SnxRkon7oDJqmCPykl4ar0afRYrScffMnRA3kTR8Qfq986IBwjqNA7fIauI",
    secret: "6TWxLtkLDaCfDh4j4YcLa2WLS99zkZtaQjJnsAeGAtixHIDXjPdJAta5BJxNWrZV",
  },
  bybit: {
    apiKey: "wsmXpRhglTReUWdO3a",
    secret: "DCmhXUXmpwyLigFK5t7qJWci9SOXsMRoBzut",
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

const CURRENT_EXCHANGE = "bybit";

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

async function placeStopLoss(symbol, side, amount, stopPrice) {
  try {
    let orderType;
    let params = { reduceOnly: true };

    if (CURRENT_EXCHANGE === "binance") {
      orderType = "STOP_MARKET";
      params.stopPrice = stopPrice;
    } else if (CURRENT_EXCHANGE === "bybit") {
      orderType = "Market";
      params.stopLoss = stopPrice;
      params.reduceOnly = true;
    } else if (CURRENT_EXCHANGE === "okx") {
      orderType = "trigger";
      params.triggerPrice = stopPrice;
      params.reduceOnly = true;
    } else {
      orderType = "stop_market";
      params.stopPrice = stopPrice;
    }

    const order = await exchange.createOrder(
      symbol,
      orderType,
      side,
      amount,
      null,
      params
    );

    console.log(`Stop Loss order placed for ${symbol} at ${stopPrice}`);
    return order;
  } catch (err) {
    console.error(`Error placing Stop Loss for ${symbol}:`, err.message);
    throw err;
  }
}

async function placeTakeProfit(symbol, side, amount, takeProfitPrice) {
  try {
    let orderType;
    let params = { reduceOnly: true };
    if (CURRENT_EXCHANGE === "binance") {
      orderType = "TAKE_PROFIT_MARKET";
      params.stopPrice = takeProfitPrice;
    } else if (CURRENT_EXCHANGE === "bybit") {
      orderType = "Market";
      params.takeProfit = takeProfitPrice;
      params.reduceOnly = true;
    } else if (CURRENT_EXCHANGE === "okx") {
      orderType = "trigger";
      params.triggerPrice = takeProfitPrice;
      params.reduceOnly = true;
    } else {
      orderType = "take_profit_market";
      params.stopPrice = takeProfitPrice;
    }

    const order = await exchange.createOrder(
      symbol,
      orderType,
      side,
      amount,
      null,
      params
    );

    console.log(`Take Profit order placed for ${symbol} at ${takeProfitPrice}`);
    return order;
  } catch (err) {
    console.error(`Error placing Take Profit for ${symbol}:`, err.message);
    throw err;
  }
}

setTimeout(async () => {
  const balance = await getBalance();
  console.log(`balance`, balance);
}, 2000);

module.exports = {
  exchange,
  getBalance,
  getCandles,
  placeStopLoss,
  placeOrder,
  cancelAllOrders,
  getPositions,
  placeTakeProfit,
  getPrice,
};
