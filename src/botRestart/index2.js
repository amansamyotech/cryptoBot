const Binance = require("node-binance-api");
const { decideTradeDirection2 } = require("./decideTradeFuntion2.js");
const axios = require("axios");
const API_ENDPOINT = "http://localhost:3001/api/buySell/";
const binance = new Binance().options({
  APIKEY: "whfiekZqKdkwa9fEeUupVdLZTNxBqP1OCEuH2pjyImaWt51FdpouPPrCawxbsupK",
  APISECRET: "E4IcteWOQ6r9qKrBZJoBy4R47nNPBDepVXMnS3Lf2Bz76dlu0QZCNh82beG2rHq4",
  useServerTime: true,
  test: false,
});
const symbols = [
  "XRPUSDT",
  "SUIUSDT",
  "BNBUSDT",
  "1000BONKUSDT",
  "ADAUSDT",
  "DOGEUSDT",
  "LEVERUSDT",
  "WIFUSDT",
  "1000FLOKIUSDT",
  "CKBUSDT",
];

const interval = "3m";
const leverage = 3; // Leverage
const STOP_LOSS_ROI = -1; // -2% ROI for stop loss
const TAKE_PROFIT_ROI = 2; // +4% ROI for take

async function getUsdtBalance() {
  try {
    const account = await binance.futuresBalance();
    const usdtBalance = parseFloat(
      account.find((asset) => asset.asset === "USDT")?.balance || 0
    );
    return usdtBalance;
  } catch (err) {
    console.error("Error fetching balance:", err);
    return 0;
  }
}
// Set leverage before trading
async function setLeverage(symbol) {
  try {
    await binance.futuresLeverage(symbol, leverage);
    console.log(`Leverage set to ${leverage}x for ${symbol}`);
  } catch (err) {
    console.error(`Failed to set leverage for ${symbol}:`, err.body);
  }
}

function calculateROIPrices(entryPrice, marginUsed, quantity, side) {
  const stopLossPnL = (marginUsed * STOP_LOSS_ROI) / 100;
  const takeProfitPnL = (marginUsed * TAKE_PROFIT_ROI) / 100;

  let stopLossPrice, takeProfitPrice;

  if (side === "LONG") {
    stopLossPrice = entryPrice + stopLossPnL / quantity;
    takeProfitPrice = entryPrice + takeProfitPnL / quantity;
  } else {
    stopLossPrice = entryPrice - stopLossPnL / quantity;
    takeProfitPrice = entryPrice - takeProfitPnL / quantity;
  }

  return { stopLossPrice, takeProfitPrice };
}

async function processSymbol(symbol, maxSpendPerTrade) {
  const decision = decideTradeDirection2(symbol);

  if (decision === "LONG") {
    await placeBuyOrder(symbol, maxSpendPerTrade);
  } else if (decision === "SHORT") {
    await placeShortOrder(symbol, maxSpendPerTrade);
  } else {
    console.log(`No trade signal for ${symbol}`);
  }
}

// 💰 Place Buy Order + Stop Loss (LONG Position)
async function placeBuyOrder(symbol, marginAmount) {
  try {
    await setLeverage(symbol);

    const price = (await binance.futuresPrices())[symbol];
    const entryPrice = parseFloat(price);

    // Calculate position size with leverage
    const positionValue = marginAmount * leverage;
    const quantity = parseFloat((positionValue / entryPrice).toFixed(6));

    const exchangeInfo = await binance.futuresExchangeInfo();
    const symbolInfo = exchangeInfo.symbols.find((s) => s.symbol === symbol);
    const pricePrecision = symbolInfo.pricePrecision;
    const quantityPrecision = symbolInfo.quantityPrecision;

    const qtyFixed = quantity.toFixed(quantityPrecision);

    // Calculate ROI-based stop loss and take profit prices
    const { stopLossPrice, takeProfitPrice } = calculateROIPrices(
      entryPrice,
      marginAmount,
      quantity,
      "LONG"
    );

    const stopLossFixed = stopLossPrice.toFixed(pricePrecision);
    const takeProfitFixed = takeProfitPrice.toFixed(pricePrecision);

    console.log(`LONG Order Details for ${symbol}:`);
    console.log(`Entry Price: ${entryPrice}`);
    console.log(`Quantity: ${qtyFixed}`);
    console.log(`Margin Used: ${marginAmount}`);
    console.log(`Position Value: ${positionValue} (${leverage}x leverage)`);
    console.log(`Stop Loss Price: ${stopLossFixed} (${STOP_LOSS_ROI}% ROI)`);
    console.log(
      `Take Profit Price: ${takeProfitFixed} (${TAKE_PROFIT_ROI}% ROI)`
    );

    // Place market buy order
    const buyOrder = await binance.futuresMarketBuy(symbol, qtyFixed);
    console.log(`Bought ${symbol} at ${entryPrice}`);

    const buyOrderDetails = {
      side: "LONG",
      symbol,
      quantity: qtyFixed,
      LongTimeCoinPrice: entryPrice,
      placeOrderId: buyOrder.orderId,
      marginUsed: marginAmount,
      leverage: leverage,
      positionValue: positionValue,
    };

    const tradeResponse = await axios.post(API_ENDPOINT, {
      data: buyOrderDetails,
    });
    console.log(`Trade Response:`, tradeResponse?.data);

    const tradeId = tradeResponse.data._id;

    // Place stop loss order
    const stopLossOrder = await binance.futuresOrder(
      "STOP_MARKET",
      "SELL",
      symbol,
      qtyFixed,
      null,
      {
        stopPrice: stopLossFixed,
        reduceOnly: true,
        timeInForce: "GTC",
      }
    );
    console.log(
      `Stop Loss set at ${stopLossFixed} for ${symbol} (${STOP_LOSS_ROI}% ROI)`
    );

    // Place take profit order
    const takeProfitOrder = await binance.futuresOrder(
      "TAKE_PROFIT_MARKET",
      "SELL",
      symbol,
      qtyFixed,
      null,
      {
        stopPrice: takeProfitFixed,
        reduceOnly: true,
        timeInForce: "GTC",
      }
    );
    console.log(
      `Take Profit set at ${takeProfitFixed} for ${symbol} (${TAKE_PROFIT_ROI}% ROI)`
    );

    const details = {
      takeProfitPrice: takeProfitFixed,
      profitOrderId: takeProfitOrder.orderId,
      stopLossPrice: stopLossFixed,
      stopLossOrderId: stopLossOrder.orderId,
    };

    await axios.put(`${API_ENDPOINT}${tradeId}`, {
      data: details,
    });
  } catch (error) {
    console.error(`Error placing LONG order for ${symbol}:`, error);
  }
}

// 📉 Place Short Order + Stop Loss (SHORT Position)
async function placeShortOrder(symbol, marginAmount) {
  try {
    await setLeverage(symbol);

    const price = (await binance.futuresPrices())[symbol];
    const entryPrice = parseFloat(price);

    // Calculate position size with leverage
    const positionValue = marginAmount * leverage;
    console.log(`leverage`, leverage);
    console.log(`marginAmount`, marginAmount);

    console.log(`positionValue`, positionValue);

    const quantity = parseFloat((positionValue / entryPrice).toFixed(6));
    console.log(`quantity`, quantity);

    const exchangeInfo = await binance.futuresExchangeInfo();
    const symbolInfo = exchangeInfo.symbols.find((s) => s.symbol === symbol);
    const pricePrecision = symbolInfo.pricePrecision;
    const quantityPrecision = symbolInfo.quantityPrecision;

    const qtyFixed = quantity.toFixed(quantityPrecision);

    // Calculate ROI-based stop loss and take profit prices
    const { stopLossPrice, takeProfitPrice } = calculateROIPrices(
      entryPrice,
      marginAmount,
      quantity,
      "SHORT"
    );

    const stopLossFixed = stopLossPrice.toFixed(pricePrecision);
    const takeProfitFixed = takeProfitPrice.toFixed(pricePrecision);

    console.log(`SHORT Order Details for ${symbol}:`);
    console.log(`Entry Price: ${entryPrice}`);
    console.log(`Quantity: ${qtyFixed}`);
    console.log(`Margin Used: ${marginAmount}`);
    console.log(`Position Value: ${positionValue} (${leverage}x leverage)`);
    console.log(`Stop Loss Price: ${stopLossFixed} (${STOP_LOSS_ROI}% ROI)`);
    console.log(
      `Take Profit Price: ${takeProfitFixed} (${TAKE_PROFIT_ROI}% ROI)`
    );

    // Place market sell order
    const shortOrder = await binance.futuresMarketSell(symbol, qtyFixed);
    console.log(`Shorted ${symbol} at ${entryPrice}`);

    const shortOrderDetails = {
      side: "SHORT",
      symbol,
      quantity: qtyFixed,
      ShortTimeCurrentPrice: entryPrice,
      placeOrderId: shortOrder.orderId,
      marginUsed: marginAmount,
      leverage: leverage,
      positionValue: positionValue,
    };

    const tradeResponse = await axios.post(API_ENDPOINT, {
      data: shortOrderDetails,
    });
    console.log(`Trade Response:`, tradeResponse?.data);

    const tradeId = tradeResponse.data._id;

    // Place stop loss order
    const stopLossOrder = await binance.futuresOrder(
      "STOP_MARKET",
      "BUY",
      symbol,
      qtyFixed,
      null,
      {
        stopPrice: stopLossFixed,
        reduceOnly: true,
        timeInForce: "GTC",
      }
    );
    console.log(
      `Stop Loss set at ${stopLossFixed} for ${symbol} (${STOP_LOSS_ROI}% ROI)`
    );

    // Place take profit order
    const takeProfitOrder = await binance.futuresOrder(
      "TAKE_PROFIT_MARKET",
      "BUY",
      symbol,
      qtyFixed,
      null,
      {
        stopPrice: takeProfitFixed,
        reduceOnly: true,
        timeInForce: "GTC",
      }
    );
    console.log(
      `Take Profit set at ${takeProfitFixed} for ${symbol} (${TAKE_PROFIT_ROI}% ROI)`
    );

    const details = {
      takeProfitPrice: takeProfitFixed,
      profitOrderId: takeProfitOrder.orderId,
      stopLossPrice: stopLossFixed,
      stopLossOrderId: stopLossOrder.orderId,
    };

    await axios.put(`${API_ENDPOINT}${tradeId}`, {
      data: details,
    });
  } catch (error) {
    console.error(`Error placing SHORT order for ${symbol}:`, error);
  }
}

// 🔁 Main Loop
setInterval(async () => {
  const totalBalance = await getUsdtBalance();
  const usableBalance = totalBalance - 1; // Keep $5.1 reserve
  console.log(`usableBalance usableBalance usableBalance`, usableBalance);

  const maxSpendPerTrade = usableBalance / symbols.length;
  console.log(`maxSpendPerTrade`, maxSpendPerTrade);

  console.log(`Total Balance: ${totalBalance} USDT`);
  console.log(`Usable Balance: ${usableBalance} USDT`);
  console.log(`Max Spend Per Trade: ${maxSpendPerTrade} USDT`);

  for (const sym of symbols) {
    try {
      const response = await axios.post(`${API_ENDPOINT}check-symbols`, {
        symbols: sym,
      });

      let status = response?.data?.data.status;

      if (status == true) {
        await processSymbol(sym, maxSpendPerTrade);
      } else {
        console.log(`TRADE ALREADY OPEN FOR SYMBOL: ${sym}`);
      }
    } catch (err) {
      console.error(`Error with ${sym}:`, err.message);
    }
  }
}, 3000); // Run every 1 minute

async function checkOrders(symbol) {
  try {
    const response = await axios.get(`${API_ENDPOINT}find-treads/${symbol}`);
    console.log(`response.data?.data`, response.data?.data);

    const { found } = response.data?.data;

    if (!found) return;

    const { tradeDetails } = response.data?.data;
    const { stopLossOrderId, takeProfitOrderId, objectId } = tradeDetails;
    console.log(
      ` stopLossOrderId, takeProfitOrderId,`,
      stopLossOrderId,
      takeProfitOrderId
    );

    console.log(`objectId:`, objectId);

    if (!stopLossOrderId || !takeProfitOrderId) {
      console.log(`No order IDs found for ${symbol}`);
      return;
    }

    // Get initial order statuses
    const stopLossStatus = await binance.futuresOrderStatus(symbol, {
      orderId: stopLossOrderId,
    });

    const takeProfitStatus = await binance.futuresOrderStatus(symbol, {
      orderId: takeProfitOrderId,
    });

    const stopLossOrderStatus = stopLossStatus?.status;
    const takeProfitOrderStatus = takeProfitStatus?.status;

    console.log(`Stop Loss Status for ${symbol}:`, stopLossOrderStatus);
    console.log(`Take Profit Status for ${symbol}:`, takeProfitOrderStatus);

    const isStopLossFilled = stopLossOrderStatus === "FILLED";
    const isTakeProfitFilled = takeProfitOrderStatus === "FILLED";

    if (isStopLossFilled || isTakeProfitFilled) {
      console.log(`One of the orders is filled for ${symbol}`);

      // If Stop Loss is NOT filled, check again before canceling
      if (!isStopLossFilled) {
        const recheckStopLoss = await binance.futuresOrderStatus(symbol, {
          orderId: stopLossOrderId,
        });
        if (
          recheckStopLoss?.status !== "CANCELED" &&
          recheckStopLoss?.status !== "FILLED"
        ) {
          await binance.futuresCancel(symbol, stopLossOrderId);
          console.log(`Stop Loss order canceled`);
        } else {
          console.log(`Stop Loss already canceled or filled`);
        }
      }

      // If Take Profit is NOT filled, check again before canceling
      if (!isTakeProfitFilled) {
        const recheckTakeProfit = await binance.futuresOrderStatus(symbol, {
          orderId: takeProfitOrderId,
        });
        if (
          recheckTakeProfit?.status !== "CANCELED" &&
          recheckTakeProfit?.status !== "FILLED"
        ) {
          await binance.futuresCancel(symbol, takeProfitOrderId);
          console.log(`Take Profit order canceled`);
        } else {
          console.log(`Take Profit already canceled or filled`);
        }
      }

      // Mark trade as closed
      const data = await axios.put(`${API_ENDPOINT}${objectId}`, {
        data: { status: "1" },
      });
      console.log(`Trade marked as closed in DB for ${symbol}`, data?.data);
    } else {
      console.log(
        `Neither order is filled yet for ${symbol}. No action taken.`
      );
    }
  } catch (error) {
    console.error("Error checking or canceling orders:", error);
  }
}

setInterval(async () => {
  for (const sym of symbols) {
    await checkOrders(sym);
  }
}, 5000);
