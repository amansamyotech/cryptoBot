require("dotenv").config();
const axios = require("axios");
const crypto = require("crypto");

const FUTURES_API_BASE = process.env.FUTURES_API_BASE;
const apiKey = process.env.BINANCE_API_KEY;
const apiSecret = process.env.BINANCE_API_SECRET;
const SYMBOLS = ["DOGEUSDT"];
const MIN_BALANCE = 6;
const TRADE_AMOUNT = 6;
const API_ENDPOINT = "http://localhost:3000/api/trades";

const log = (msg) => console.log(`[${new Date().toISOString()}] ${msg}`);

const sign = (params) => {
  const query = new URLSearchParams(params).toString();
  return crypto.createHmac("sha256", apiSecret).update(query).digest("hex");
};
const getBalance = async () => {
  const params = { timestamp: Date.now() };
  const sig = sign(params);
  const res = await axios.get(`${FUTURES_API_BASE}/fapi/v2/account`, {
    params: { ...params, signature: sig },
    headers: { "X-MBX-APIKEY": apiKey },
  });
  return parseFloat(
    res.data.assets.find((a) => a.asset === "USDT").availableBalance
  );
};
const getPrecisionMap = async () => {
  const res = await axios.get(`${FUTURES_API_BASE}/fapi/v1/exchangeInfo`);
  const precisionMap = {};
  SYMBOLS.forEach((symbol) => {
    const info = res.data.symbols.find((s) => s.symbol === symbol);
    const stepSize = info.filters.find(
      (f) => f.filterType === "LOT_SIZE"
    ).stepSize;
    const precision = Math.max(0, stepSize.indexOf("1") - 1);
    precisionMap[symbol] = precision;
  });
  return precisionMap;
};
const getCurrentPrice = async (symbol) => {
  try {
    const res = await axios.get(`${FUTURES_API_BASE}/fapi/v1/ticker/price`, {
      params: { symbol },
    });
    return parseFloat(res.data.price);
  } catch (err) {
    log(`❌ Price fetch failed for ${symbol}: ${err.message}`);
    throw err;
  }
};
const placeOrder = async (symbol, side, quantity) => {
  try {
    const params = {
      symbol,
      side,
      type: "MARKET",
      quantity,
      timestamp: Date.now(),
    };
    const sig = sign(params);
    const res = await axios.post(`${FUTURES_API_BASE}/fapi/v1/order`, null, {
      params: { ...params, signature: sig },
      headers: { "X-MBX-APIKEY": apiKey },
    });
    return res.data;
  } catch (e) {
    log(`❌ Order error for ${symbol}: ${e.response?.data?.msg || e.message}`);
    throw e;
  }
};
const checkOrderStatus = async (symbol, orderId) => {
  try {
    const params = {
      symbol,
      orderId,
      timestamp: Date.now(),
    };
    const sig = sign(params);
    const res = await axios.get(`${FUTURES_API_BASE}/fapi/v1/order`, {
      params: { ...params, signature: sig },
      headers: { "X-MBX-APIKEY": apiKey },
    });
    return res.data;
  } catch (e) {
    log(`❌ Order status check error: ${e.response?.data?.msg || e.message}`);
    throw e;
  }
};
const waitForOrderFill = async (symbol, orderId, maxWaitTime = 30000) => {
  const startTime = Date.now();

  while (Date.now() - startTime < maxWaitTime) {
    const orderStatus = await checkOrderStatus(symbol, orderId);

    if (orderStatus.status === "FILLED") {
      return orderStatus;
    }

    if (
      orderStatus.status === "CANCELED" ||
      orderStatus.status === "REJECTED"
    ) {
      log(`❌ Order ${orderStatus.status} for ${symbol}`);
      throw new Error(`Order ${orderStatus.status}`);
    }

    log(
      `⏳ Waiting for ${symbol} order to fill... Status: ${orderStatus.status}`
    );
    await new Promise((res) => setTimeout(res, 2000));
  }

  log(`⏰ Order fill timeout for ${symbol}`);
  throw new Error("Order fill timeout");
};
const saveTradeRecord = async (tradeData) => {
  try {
    const response = await axios.post(API_ENDPOINT, tradeData, {
      headers: {
        "Content-Type": "application/json",
      },
    });
    log(`✅ Trade record saved successfully: ${JSON.stringify(response.data)}`);
    return response.data;
  } catch (error) {
    log(
      `❌ Failed to save trade record: ${
        error.response?.data?.message || error.message
      }`
    );
    throw error;
  }
};
const executeSingleTrade = async () => {
  try {
    log("🚀 Starting Trading Bot...");
    log(
      `📋 Settings: Min Balance Required: $${MIN_BALANCE}, Trade Amount: $${TRADE_AMOUNT}`
    );
    const balance = await getBalance();
    log(`💰 Current Balance: $${balance.toFixed(2)}`);

    if (balance < MIN_BALANCE) {
      log(
        `❗ Balance too low for trading. Need minimum $${MIN_BALANCE}, but have $${balance.toFixed(
          2
        )}. Stopping bot...`
      );
      process.exit(1);
    }

    log(
      `✅ Balance check passed! Have $${balance.toFixed(2)} >= $${MIN_BALANCE}`
    );

    const precisionMap = await getPrecisionMap();

    const symbol = SYMBOLS[0];
    const precision = precisionMap[symbol];

    log(`📊 Getting current price for ${symbol}...`);
    const currentPrice = await getCurrentPrice(symbol);
    log(`💲 Current price for ${symbol}: $${currentPrice.toFixed(6)}`);

    const quantity = parseFloat(
      (TRADE_AMOUNT / currentPrice).toFixed(precision)
    );
    log(
      `🛒 Placing buy order for ${quantity} ${symbol} (worth $${TRADE_AMOUNT}) at current market price...`
    );

    const buyOrder = await placeOrder(symbol, "BUY", quantity);

    let finalBuyPrice;
    let finalQuantity;

    if (buyOrder.status === "FILLED") {
      finalBuyPrice = parseFloat(buyOrder.fills[0].price);
      finalQuantity = parseFloat(buyOrder.executedQty);
      log(
        `✅ BOUGHT ${finalQuantity} ${symbol} @ $${finalBuyPrice.toFixed(6)}`
      );
    } else {
      log(
        `⏳ Order placed but not filled immediately. OrderID: ${buyOrder.orderId}`
      );

      const filledOrder = await waitForOrderFill(symbol, buyOrder.orderId);
      finalBuyPrice = parseFloat(filledOrder.avgPrice);
      finalQuantity = parseFloat(filledOrder.executedQty);
      log(
        `✅ CONFIRMED FILLED ${finalQuantity} ${symbol} @ $${finalBuyPrice.toFixed(
          6
        )}`
      );
    }

    const purchaseAmount = finalBuyPrice * finalQuantity;
    log(`💵 Total purchase amount: $${purchaseAmount.toFixed(2)}`);

    const tradeRecord = {
      symbol: symbol,
      buyPrice: finalBuyPrice,
      quantity: finalQuantity,
      purchaseAmount: purchaseAmount,
      isBuy: true,
    };

    log(`📝 Preparing trade record: ${JSON.stringify(tradeRecord)}`);

    await saveTradeRecord(tradeRecord);

    const finalBalance = await getBalance();
    log(`💰 Final Balance: $${finalBalance.toFixed(2)}`);

    log("🎯 Trade completed successfully! Stopping bot...");
    process.exit(0);
  } catch (error) {
    log(`💥 Bot error: ${error.message}`);
    process.exit(1);
  }
};

executeSingleTrade();
