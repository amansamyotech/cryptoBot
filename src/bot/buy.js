require("dotenv").config();
const axios = require("axios");
const crypto = require("crypto");
const fs = require("fs");
const path = require("path");

const { sendTelegram } = require("../helper/teleMassage.js");

const FUTURES_API_BASE = "https://fapi.binance.com";
const apiKey =
  "6bd1UA2kXR2lgLPv1pt9bNEOJE70h1MbXMvmoH1SceWUNw0kvXAQEdigQUgfNprI";
const apiSecret =
  "4zHQjwWb8AopnJx0yPjTKBNpW3ntoLaNK7PnbJjxwoB8ZSeaAaGTRLdIKLsixmPR";
const SYMBOLS = [
  "1000PEPEUSDT",
  "1000SHIBUSDT",
  "1000BONKUSDT",
  "1000FLOKIUSDT",
  "DOGEUSDT",
];
const MIN_BALANCE = 6.5;
const API_ENDPOINT = "http://localhost:3000/api/trades/";
const log = (msg) => console.log(`[${new Date().toISOString()}] ${msg}`);

const params = {
  symbol: "1000BONKUSDT",
  orderId: "11568109200",
  timestamp: Date.now(),
};
const sign = (params) => {
  const query = new URLSearchParams(params).toString();
  return crypto.createHmac("sha256", apiSecret).update(query).digest("hex");
};

const signature = sign(params);
console.log("signature", signature);

const getTradeDetailsAndPrint = async (apiKey, apiSecret, symbol, orderId) => {
  try {
    const timestamp = Date.now();

    const params = {
      symbol,
      orderId,
      timestamp,
    };

    const query = new URLSearchParams(params).toString();

    const signature = crypto
      .createHmac("sha256", apiSecret)
      .update(query)
      .digest("hex");

    const url = `${FUTURES_API_BASE}/fapi/v1/userTrades?${query}&signature=${signature}`;

    const res = await axios.get(url, {
      headers: {
        "X-MBX-APIKEY": apiKey,
      },
    });

    const trades = res.data;

    console.log(`✅ Trade details for order ${orderId}:`);
    console.log(trades);

    const totalFee = trades.reduce(
      (sum, trade) => sum + parseFloat(trade.commission),
      0
    );
    const feeAsset = trades[0]?.commissionAsset || "N/A";

    console.log(`💰 Total Fee: ${totalFee} ${feeAsset}`);
  } catch (error) {
    console.error("❌ Failed to fetch trade details:");
    console.error(error.response?.data || error.message);
  }
};

getTradeDetailsAndPrint(apiKey, apiSecret, "1000BONKUSDT", "11568109200");

//get total balance of user
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

const getPrecision = async (symbol) => {
  const res = await axios.get(`${FUTURES_API_BASE}/fapi/v1/exchangeInfo`);
  const symbolInfo = res.data.symbols.find((s) => s.symbol === symbol);
  if (!symbolInfo) {
    console.error(`❌ Symbol not found: ${symbol}`);
    return 0;
  }
  const stepFilter = symbolInfo.filters.find(
    (f) => f.filterType === "LOT_SIZE"
  );
  if (!stepFilter) {
    console.error(`❌ LOT_SIZE filter not found for symbol: ${symbol}`);
    return 0;
  }
  const stepSize = stepFilter.stepSize;
  const precision = Math.max(0, stepSize.indexOf("1") - 1);
  console.log(`${symbol} → stepSize: ${stepSize}, precision: ${precision}`);
  return precision;
};

// GET symbol details for sell coin
const getSymbolDetailsForSellCoin = async (symbol) => {
  console.log("Input symbols:", symbol);

  const response = await axios.post(`${API_ENDPOINT}check-symbols`, {
    symbols: symbol,
  });

  let status = response?.data?.data.status;
  let object = {};
  try {
    // false means status 0 --- means  sold krna hai
    if (status == false) {
      let symbol = response?.data?.data.symbol;
      let orderId = response?.data?.data.trades?.[0]?.orderId;
      let Objectid = response?.data?.data.trades?.[0]?._id;
      let buyingTimeCoinPrice =
        response?.data?.data.trades?.[0]?.buyingTimeCoinPrice?.$numberDecimal;
      let buyingAmount =
        response?.data?.data?.trades?.[0]?.buyingAmount?.$numberDecimal;
      let quantity = parseFloat(
        response?.data?.data.trades?.[0]?.quantity?.$numberDecimal
      );

      //call api for current price of symbol
      const res = await axios.get(`${FUTURES_API_BASE}/fapi/v1/ticker/price`, {
        params: { symbol },
      });
      let currentMarketprice = res.data.price;
      object = {
        symbol,
        quantity,
        Objectid,
        buyingTimeCoinPrice,
        currentMarketprice,
        status,
        orderId,
        buyingAmount,
      };
      return object;
    } else {
      object = {
        symbol,
        status,
      };
      return object;
    }
  } catch (err) {
    log(`❌ Price fetch failed for ${symbolName}: ${err.message}`);
    return object;
  }
};

// GET symbol details for BUY coin
const getSymboldetailsForBuyingcoin = async (symbol) => {
  console.log("Input symbols:", symbol);

  const response = await axios.post(`${API_ENDPOINT}check-symbols`, {
    symbols: symbol,
  });

  let status = response?.data?.data.status;
  let object = {};
  try {
    // true means status 1 means already sold
    if (status == true) {
      let symbol = response?.data?.data.symbol;
      console.log(`symbol`, symbol);

      // get current price of coin
      const res = await axios.get(`${FUTURES_API_BASE}/fapi/v1/ticker/price`, {
        params: { symbol },
      });
      let price = res.data.price;
      object = {
        symbol,
        price,
        status,
      };
      return object;
    } else {
      object = {
        symbol,
        status,
      };
      return object;
    }
  } catch (err) {
    log(`❌ Price fetch failed for ${symbolName}: ${err.message}`);
    return object;
  }
};

// place order for buy or sell done ke liye
const placeOrder = async (symbol, side, quantity) => {
  try {
    let params = {
      symbol,
      side,
      type: "MARKET",
      quantity,
      timestamp: Date.now(),
    };
    console.log(`params`, params);

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

const errorLogs = (error, type) => {
  const errorLog = `
========== ERROR ==========
Time: ${new Date().toISOString()}
Message: ${error.message}
Stack: ${error.stack}
Type : ${type}
===========================
`;

  // Define file path
  const logFilePath = path.join(__dirname, "error-log.txt");

  // Append the error log to the file
  fs.appendFile(logFilePath, errorLog, (err) => {
    if (err) {
      console.error("Failed to write error to file:", err);
    } else {
      console.log("Error logged to error-log.txt");
    }
  });
};

// const placeSellOrder = async (symbol, orderId, side, quantity) => {
//   try {
//     let params = {
//       symbol,
//       orderId,
//       side,
//       type: "MARKET",
//       quantity,
//       timestamp: Date.now(),
//     };
//     console.log(`params`, params);

//     const sig = sign(params);

//     let res = await axios.put(`${FUTURES_API_BASE}/fapi/v1/order`, null, {
//       params: { ...params, signature: sig },
//       headers: { "X-MBX-APIKEY": apiKey },
//     });

//     return res.data;
//   } catch (e) {
//     log(`❌ Order error for ${symbol}: ${e.response?.data?.msg || e.message}`);
//     throw e;
//   }
// };

// check the order status
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

// wait krna hai order fill hua ya nahi db me entry krne se phle
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

//start bot for buy
const startBotForBuy = async () => {
  let index = 0;
  const precision = await getPrecision();
  sendTelegram("---------Buy Bot Started---------");
  while (true) {
    try {
      if (index == 5) {
        index = 0;
      }
      const response = await axios.get(`${API_ENDPOINT}treadCount`);
      console.log(`treadCount`, response?.data);
      let treadCount = response?.data;

      if (treadCount == SYMBOLS.length) {
        treadCount = 0;
      }
      console.log(`=========== start for buy ============> `);
      const totalBalance = await getBalance();
      let minimumBlanceCheck = totalBalance - MIN_BALANCE;
      console.log(`total amount for buy `, minimumBlanceCheck);
      if (minimumBlanceCheck > MIN_BALANCE) {
        const buyingAmount = minimumBlanceCheck / (SYMBOLS.length - treadCount);
        console.log(`single coin buyingAmount `, buyingAmount);
        try {
          // symbol ke sath sath current price lake deta hai
          const symbolObject = await getSymboldetailsForBuyingcoin(
            SYMBOLS[index]
          );
          console.log(
            `coin current currentPrice -------> ${symbolObject?.symbol} ||||`,
            symbolObject?.price
          );

          if (symbolObject?.status == true) {
            const quantity = parseFloat(
              buyingAmount / symbolObject?.price
            ).toFixed(precision);

            const order = await placeOrder(
              symbolObject?.symbol,
              "BUY",
              quantity
            );

            console.log(`order during the buy coin`, order);

            const orderStatus = await waitForOrderFill(
              symbolObject?.symbol,
              order.orderId
            );

            if (orderStatus && orderStatus.status === "FILLED") {
              const data = {
                symbol: symbolObject?.symbol,
                orderId: order.orderId,
                buyingTimeCoinPrice: symbolObject?.price,
                quantity,
                buyingAmount: buyingAmount,
                sellingTimeCurrentPrice: "1234",
                profitAmount: "1223",
                status: "0",
              };

              sendTelegram(
                `🟢COIN NAME - ${symbolObject?.symbol} ,
             COIN CURRENT MARKET PRICE - ${symbolObject?.price},
            MY BUYING AMOUNT - ${buyingAmount},
            QUANTITY - ${quantity}`
              );
              // data base me save karane ke liye
              const saveIntoDb = await axios.post(`${API_ENDPOINT}`, {
                data: data,
              });

              console.log(
                `order placed   quantity : ${quantity} symbol:  ${symbolObject?.symbol} @ ${symbolObject?.price} buyingAmount : ${buyingAmount}`
              );
            } else if (order === null) {
              log(`❌ Buy order failed`);
            }
          } else {
            console.log("dont buy  ", symbolObject?.symbol);
          }
        } catch (e) {
          log(`❌ Error: ${e.message}`);
        } finally {
          index++;
        }
      } else {
        console.log("dont have sufficient balance ");
      }
    } catch (error) {
      console.log(`error`, error);
      errorLogs(error, "BUY");
    }

    console.log(`============= end  ==========`);
    await new Promise((resolve) => setTimeout(resolve, 1000)); // 1 second delay
  }
};

//start bot for sell
const startBotForSell = async () => {
  sendTelegram("---------SELL Bot Started---------");
  log("🚀 Starting Bot...");
  let index = 0;
  while (true) {
    try {
      if (index == 5) {
        index = 0;
      }
      console.log(`=========== start sell ============> `, index);

      const totalBalance = await getBalance();
      let minimumBlanceCheck = totalBalance - MIN_BALANCE;
      console.log(`my balance without mini balance `, minimumBlanceCheck);

      if (minimumBlanceCheck > MIN_BALANCE) {
        try {
          // symbol lake dega sell ke liye
          const symbolObject = await getSymbolDetailsForSellCoin(
            SYMBOLS[index]
          );
          console.log(
            `coin current Market price from api -------> ${symbolObject?.symbol} ||||`,
            symbolObject?.currentMarketprice
          );
          console.log(
            `buy time price -------> ${symbolObject?.symbol} ---`,
            symbolObject?.buyingTimeCoinPrice
          );

          // false meens 0 hum isko bech skte hai ----
          if (symbolObject?.status == false) {
            console.log(
              "my selling conditon -->>>",
              symbolObject?.currentMarketprice >
                parseFloat(symbolObject?.buyingTimeCoinPrice) * 1.02
            );

            if (
              symbolObject?.currentMarketprice >
              parseFloat(symbolObject?.buyingTimeCoinPrice) * 1.02
            ) {
              let mainAmount =
                symbolObject?.currentMarketprice * symbolObject?.quantity;
              let profitAmount = mainAmount - symbolObject?.buyingAmount;

              const order = await placeOrder(
                symbolObject?.symbol,
                "SELL",
                symbolObject?.quantity
              );
              console.log("order data during to sell coin ", order);

              const orderStatus = await waitForOrderFill(
                symbolObject?.symbol,
                symbolObject?.orderId
              );
              if (orderStatus && orderStatus.status === "FILLED") {
                const data = {
                  id: symbolObject?.Objectid,
                  sellingTimeCurrentPrice: symbolObject?.currentMarketprice,
                  profitAmount,
                  status: 1,
                };

                sendTelegram(
                  `🔴COIN NAME - ${symbolObject?.symbol} ,
             COIN CURRENT MARKET PRICE - ${symbolObject?.currentMarketprice},
            MY BUYING TIME PRICE - ${symbolObject?.buyingTimeCoinPrice},
            QUANTITY - ${quantity}
            PROFIT AMOUNT - ${profitAmount}`
                );
                const response = await axios.put(
                  `${API_ENDPOINT}${symbolObject?.Objectid}`,
                  {
                    data,
                  }
                );
              }
            }
          } else {
            console.log("dont sell  ", symbolObject?.symbol);
          }

          index++;
        } catch (e) {
          log(`❌ Error: ${e.message}`);
        }
      } else {
        console.log("dont have sufficient balance ");
      }
    } catch (error) {
      console.log(`error`, error);

      errorLogs(error, "SELL");
    }

    console.log(`============= end  ==========`);

    await new Promise((resolve) => setTimeout(resolve, 1000));
  }
};

// startBotForBuy();
// startBotForSell();
