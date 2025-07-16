require("dotenv").config();
const axios = require("axios");
const crypto = require("crypto");

const FUTURES_API_BASE = "https://fapi.binance.com";
const apiKey =
  "6bd1UA2kXR2lgLPv1pt9bNEOJE70h1MbXMvmoH1SceWUNw0kvXAQEdigQUgfNprI";
const apiSecret =
  "4zHQjwWb8AopnJx0yPjTKBNpW3ntoLaNK7PnbJjxwoB8ZSeaAaGTRLdIKLsixmPR";
const SYMBOLS = [
  "DOGEUSDT",
  "1000PEPEUSDT",
  "1000SHIBUSDT",
  "1000BONKUSDT",
  "1000FLOKIUSDT",
];

const MIN_BALANCE = 5.5;
const API_ENDPOINT = "http://localhost:3000/api/trades";

const log = (msg) => console.log(`[${new Date().toISOString()}] ${msg}`);

const sign = (params) => {
  const query = new URLSearchParams(params).toString();
  return crypto.createHmac("sha256", apiSecret).update(query).digest("hex");
};
//total balance
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
// place order for buy
const placeOrderBuy = async (symbol, quantity) => {
  try {
    const params = {
      symbol,
      side: "BUY",
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
// const executeSingleTrade = async () => {
//   try {
//     log("🚀 Starting Trading Bot...");
//     log(
//       `📋 Settings: Min Balance Required: $${MIN_BALANCE}, Trade Amount: $${TRADE_AMOUNT}`
//     );
//     const balance = await getBalance();
//     log(`💰 Current Balance: $${balance.toFixed(2)}`);

//     if (balance < MIN_BALANCE) {
//       log(
//         `❗ Balance too low for trading. Need minimum $${MIN_BALANCE}, but have $${balance.toFixed(
//           2
//         )}. Stopping bot...`
//       );
//       process.exit(1);
//     }

//     log(
//       `✅ Balance check passed! Have $${balance.toFixed(2)} >= $${MIN_BALANCE}`
//     );

//     const precisionMap = await getPrecisionMap();

//     const symbol = SYMBOLS[0];
//     const precision = precisionMap[symbol];

//     log(`📊 Getting current price for ${symbol}...`);
//     const currentPrice = await getCurrentPrice(symbol);
//     log(`💲 Current price for ${symbol}: $${currentPrice.toFixed(6)}`);

//     const quantity = parseFloat(
//       (TRADE_AMOUNT / currentPrice).toFixed(precision)
//     );
//     log(
//       `🛒 Placing buy order for ${quantity} ${symbol} (worth $${TRADE_AMOUNT}) at current market price...`
//     );

//     const buyOrder = await placeOrderBuy(symbol, "BUY", quantity);

//     let finalBuyPrice;
//     let finalQuantity;

//     if (buyOrder.status === "FILLED") {
//       finalBuyPrice = parseFloat(buyOrder.fills[0].price);
//       finalQuantity = parseFloat(buyOrder.executedQty);
//       log(
//         `✅ BOUGHT ${finalQuantity} ${symbol} @ $${finalBuyPrice.toFixed(6)}`
//       );
//     } else {
//       log(
//         `⏳ Order placed but not filled immediately. OrderID: ${buyOrder.orderId}`
//       );

//       const filledOrder = await waitForOrderFill(symbol, buyOrder.orderId);
//       finalBuyPrice = parseFloat(filledOrder.avgPrice);
//       finalQuantity = parseFloat(filledOrder.executedQty);
//       log(
//         `✅ CONFIRMED FILLED ${finalQuantity} ${symbol} @ $${finalBuyPrice.toFixed(
//           6
//         )}`
//       );
//     }

//     const purchaseAmount = finalBuyPrice * finalQuantity;
//     log(`💵 Total purchase amount: $${purchaseAmount.toFixed(2)}`);

//     const tradeRecord = {
//       symbol: symbol,
//       buyPrice: finalBuyPrice,
//       quantity: finalQuantity,
//       purchaseAmount: purchaseAmount,
//       isBuy: true,
//     };

//     log(`📝 Preparing trade record: ${JSON.stringify(tradeRecord)}`);

//     await saveTradeRecord(tradeRecord);

//     const finalBalance = await getBalance();
//     log(`💰 Final Balance: $${finalBalance.toFixed(2)}`);

//     log("🎯 Trade completed successfully! Stopping bot...");
//     process.exit(0);
//   } catch (error) {
//     log(`💥 Bot error: ${error.message}`);
//     process.exit(1);
//   }
// };

// executeSingleTrade();

//start bot for buy
const startBotForBuy = async () => {
  log("🚀 Starting Bot...");
  //   const precision = await getPrecision();

  //   while (true) {
  const totalBalance = await getBalance();
  const buyingAmount = (totalBalance - MIN_BALANCE) / SYMBOLS.length;
  console.log(`buyingAmount`, buyingAmount);

  const currentPriceOfSymbols = getCurrentPrice(SYMBOLS);
  console.log("currentPriceOfSymbols", currentPriceOfSymbols);

  // try {
  //   //find the balance

  //   const currentPrice = await getPrice();
  //   //   position = "LONG";
  //   //   quantity = 100
  //   // BUY - if no position

  //   console.log(`currentPrice >=`, currentPrice);
  //   console.log(`targetPrice`, targetPrice);
  //   console.log(`position  -- `, position);
  //   if (!position) {
  //     const balance = await getBalance();
  //     const buyAmount = balance;
  //     quantity = parseFloat((buyAmount / currentPrice).toFixed(precision));

  //     log(
  //       `💰 Balance: ${balance.toFixed(2)} | Buying with ${buyAmount.toFixed(
  //         2
  //       )}`
  //     );

  //     // Check minimum order value (usually $5-10)
  //     if (buyAmount < 5) {
  //       log(`⚠️ Buy amount too small: ${buyAmount.toFixed(2)} (minimum $5)`);
  //       await new Promise((resolve) => setTimeout(resolve, 5000)); // Wait 5 seconds
  //       // send telly message
  //       position = "LONG";
  //       continue;
  //     }

  //     const order = await placeOrder("BUY", quantity);
  //     if (order && order.status === "FILLED") {
  //       position = "LONG";
  //       buyPrice = currentPrice;
  //       targetPrice = currentPrice * (1 + PROFIT_PERCENTAGE / 100);

  //       log(
  //         `✅ BOUGHT ${quantity} ${SYMBOL} @ ${currentPrice} | Target: ${targetPrice.toFixed(
  //           6
  //         )}`
  //       );
  //     } else if (order === null) {
  //       log(`❌ Buy order failed`);
  //     }
  //   }

  //   // SELL - if have position and target reached
  //   else if (position === "LONG" && currentPrice >= targetPrice) {
  //     console.log("enter into sell");

  //     // else if (position === "LONG") {
  //     //const order = await placeOrder("SELL", quantity);
  //     const order = await placeOrder("SELL", 100);

  //     console.log("sell order placed", order);

  //     if (order && order.status === "FILLED") {
  //       const profit = (currentPrice - buyPrice) * quantity;

  //       log(
  //         `🎯 SOLD ${quantity} ${SYMBOL} @ ${currentPrice} | Profit: ${profit.toFixed(
  //           4
  //         )}`
  //       );

  //       // Reset for next cycle
  //       position = null;
  //       buyPrice = 0;
  //       quantity = 0;
  //       targetPrice = 0;
  //     } else if (order === null) {
  //       log(`❌ Sell order failed`);
  //     }
  //   }

  //   // Status update
  //   else if (position === "LONG") {
  //     const currentProfit = (currentPrice - buyPrice) * quantity;
  //     log(
  //       `📊 Holding ${quantity} ${SYMBOL} | Current: $${currentPrice} | Target: $${targetPrice.toFixed(
  //         6
  //       )} | Profit: $${currentProfit.toFixed(4)}`
  //     );
  //   }
  // } catch (e) {
  //   log(`❌ Error: ${e.message}`);
  // }

  // await new Promise((resolve) => setTimeout(resolve, 1000)); // 1 second delay
};
// };
startBotForBuy();
