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

const MIN_BALANCE = 6.5;
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
const getSymbollDetails = async (symbol) => {
  console.log("Input symbols:", symbol);

  const response = await axios.post(
    "http://localhost:3000/api/trades/check-symbols",
    {
      symbols: symbol,
    }
  );

  // console.log("Response data:", response?.data?.data);

  let status = response?.data?.data.status;
  let object = {};
  try {
    if (status == false) {
      let symbol = response?.data?.data.symbol;
      let trades = response?.data?.data.trades;
      let quantity = parseFloat(
        response?.data?.data.trades?.[0]?.quantity?.$numberDecimal
      );
      console.log(`quantity`,quantity);
      
      let totalBuyingAmount =
        parseFloat(
          response?.data?.data.trades?.[0]?.currentPrice?.$numberDecimal
        ) * quantity;
      console.log(`symbol`, symbol);

      const res = await axios.get(`${FUTURES_API_BASE}/fapi/v1/ticker/price`, {
        params: { symbol },
      });
      let price = res.data.price;
      object = {
        symbol,
        quantity,
        totalBuyingAmount,
        price,
        status,
        trades,
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
const getCurrentPrice = async (symbol) => {
  console.log("Input symbols:", symbol);

  const response = await axios.post(
    "http://localhost:3000/api/trades/check-symbols",
    {
      symbols: symbol,
    }
  );

  console.log("Response data:", response?.data?.data);

  let status = response?.data?.data.status;
  let object = {};
  try {
    if (status == true) {
      let symbol = response?.data?.data.symbol;
      console.log(`symbol`, symbol);

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

//start bot for buy
const startBotForBuy = async () => {
  log("🚀 Starting Bot...");
  let index = 0;
  while (true) {
    if (index == 5) {
      index = 0;
      break;
    }
    console.log(`=========== start buy ============> `, index);

    const totalBalance = await getBalance();
    let minimumBlanceCheck = totalBalance - MIN_BALANCE;
    console.log(`total amount for buying amount `, minimumBlanceCheck);

    if (minimumBlanceCheck > MIN_BALANCE) {
      try {
        const symbolObject = await getSymbollDetails(SYMBOLS[index]);
        console.log(
          `coin current currentPrice -------> ${symbolObject?.symbol} ||||`,
          symbolObject?.price
        );

        console.log(`symbolObject?.price`, symbolObject?.price);

        if (symbolObject?.status == false) {
          console.log(
            "contion to sell coin -----",
            symbolObject?.price >
              parseFloat(
                symbolObject?.trades?.[0]?.buyingAmount?.$numberDecimal
              )
          );

          let totalSellingAmount = symbolObject?.quantity * symbolObject?.price;
          let profitAmount =
            totalSellingAmount - symbolObject?.totalBuyingAmount;
          console.log(
            `order sell   
            quantity : ${symbolObject?.apiKeyquantity}
            symbol:  : ${symbolObject?.symbol}
            sellingTimeCurrentPrice :${symbolObject?.price} 
            totalSellingAmount :${totalSellingAmount}
            profitAmount : ${profitAmount}
            status: 1,
            `
          );

          // const order = await placeOrderBuy(
          //   symbolObject?.symbol,
          //   "BUY",
          //   quantity
          // );
          // const data = {
          //   symbol: symbolObject?.symbol,
          //   orderId: "1234",
          //   currentPrice: symbolObject?.price,
          //   quantity,
          //   buyingAmount: buyingAmount,

          //   sellingTimeCurrentPrice: "1234",
          //   profitAmount: "1223",
          //   status: "0",
          // };
          // console.log(`data`, data);

          // const saveIntoDb = await axios.post(
          //   "http://localhost:3000/api/trades/",
          //   {
          //     data: data,
          //   }
          // );

          // console.log(`saveIntoDb`, saveIntoDb);

          // console.log(
          //   `order placed   quantity : ${quantity} symbol:  ${symbolObject?.symbol} @ ${symbolObject?.price} buyingAmount : ${buyingAmount}`
          // );

          // if (order && order.status === "FILLED") {
          //   log(
          //     `✅ BOUGHT ${quantity} ${symbolObject?.symbol} @ ${symbolObject?.price} buyingAmount : ${buyingAmount}`
          //   );
          // } else if (order === null) {
          //   log(`❌ Buy order failed`);
          // }
        } else {
          console.log("dont buy  ", symbolObject?.symbol);
        }

        index++;
      } catch (e) {
        log(`❌ Error: ${e.message}`);
      }
    } else {
      console.log("dont have sufficient balance ");
    }

    console.log(`============= end  ==========`);

    await new Promise((resolve) => setTimeout(resolve, 1000)); // 1 second delay
  }

  // while (true) {
  //   if (index == 5) {
  //     index = 0;
  //     break;
  //   }
  //   console.log(`=========== start ============> `, index);

  //   const totalBalance = await getBalance();
  //   let minimumBlanceCheck = totalBalance - MIN_BALANCE;
  //   console.log(`total amount for buying amount `, minimumBlanceCheck);

  //   if (minimumBlanceCheck > MIN_BALANCE) {
  //     const buyingAmount = minimumBlanceCheck / SYMBOLS.length;
  //     console.log(`single coint buyingAmount `, buyingAmount);

  //     try {
  //       const symbolObject = await getCurrentPrice(SYMBOLS[index]);
  //       console.log(
  //         `coin current currentPrice -------> ${symbolObject?.symbol} ||||`,
  //         symbolObject?.price
  //       );
  //       if (symbolObject?.status == true) {
  //         quantity = parseFloat(buyingAmount / symbolObject?.price);

  //         // const order = await placeOrderBuy(
  //         //   symbolObject?.symbol,
  //         //   "BUY",
  //         //   quantity
  //         // );
  //         const data = {
  //           symbol: symbolObject?.symbol,
  //           orderId: "1234",
  //           currentPrice: symbolObject?.price,
  //           quantity,
  //           buyingAmount: buyingAmount,

  //           sellingTimeCurrentPrice: "1234",
  //           profitAmount: "1223",
  //           status: "0",
  //         };
  //         console.log(`data`, data);

  //         const saveIntoDb = await axios.post(
  //           "http://localhost:3000/api/trades/",
  //           {
  //             data: data,
  //           }
  //         );

  //         console.log(`saveIntoDb`, saveIntoDb);

  //         console.log(
  //           `order placed   quantity : ${quantity} symbol:  ${symbolObject?.symbol} @ ${symbolObject?.price} buyingAmount : ${buyingAmount}`
  //         );

  //         // if (order && order.status === "FILLED") {
  //         //   log(
  //         //     `✅ BOUGHT ${quantity} ${symbolObject?.symbol} @ ${symbolObject?.price} buyingAmount : ${buyingAmount}`
  //         //   );
  //         // } else if (order === null) {
  //         //   log(`❌ Buy order failed`);
  //         // }
  //       } else {
  //         console.log("dont buy  ", symbolObject?.symbol);
  //       }

  //       index++;
  //     } catch (e) {
  //       log(`❌ Error: ${e.message}`);
  //     }
  //   } else {
  //     console.log("dont have sufficient balance ");
  //   }

  //   console.log(`============= end  ==========`);

  //   await new Promise((resolve) => setTimeout(resolve, 1000)); // 1 second delay
  // }
};
startBotForBuy();
