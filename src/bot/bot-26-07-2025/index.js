const Binance = require("node-binance-api");
const technicalIndicators = require("technicalindicators");
const axios = require("axios");
const { sendTelegram } = require("../../helper/teleMassage.js");
const { decideTradeDirection } = require("./decideTradeDirection.js");
const API_ENDPOINT = "http://localhost:3000/api/buySell/";
const binance = new Binance().options({
  APIKEY: "whfiekZqKdkwa9fEeUupVdLZTNxBqP1OCEuH2pjyImaWt51FdpouPPrCawxbsupK",
  APISECRET: "E4IcteWOQ6r9qKrBZJoBy4R47nNPBDepVXMnS3Lf2Bz76dlu0QZCNh82beG2rHq4",
  useServerTime: true,
  test: false,
});
const symbols = [
  "1000PEPEUSDT",
  "1000SHIBUSDT",
  "1000BONKUSDT",
  "1000FLOKIUSDT",
  //   "1000SATSUSDT",
  //   "DOGEUSDT",
];
const interval = "1m";
const leverage = 3;
const MINIMUM_PROFIT_ROI = 2;
const INITIAL_TAKE_PROFIT_ROI = 2; 
const STOP_LOSS_ROI = -1;
const TAKE_PROFIT_ROI = 2;

let activePositions = new Map();
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

async function checkTrailingStop(position) {
  try {
    const { symbol, side, entryPrice, marginUsed, quantity, tradeId } =
      position;
    const currentPrice = parseFloat((await binance.futuresPrices())[symbol]);
    const currentROI = calculateCurrentROI(
      entryPrice,
      currentPrice,
      side,
      marginUsed,
      quantity
    );

    console.log(`${symbol} - Current ROI: ${currentROI.toFixed(2)}%`);

    if (currentROI < MINIMUM_PROFIT_ROI) {
      console.log(
        `${symbol} - Below minimum profit threshold (${MINIMUM_PROFIT_ROI}%)`
      );
      return false;
    }
    const candles = await getCandleData(symbol, 5);
    if (candles.length < 3) {
      console.log(`${symbol} - Not enough candle data`);
      return false;
    }
    const lastCandles = candles.slice(-3);
    let shouldClose = false;

    if (side === "LONG") {
      const candle1Bearish = lastCandles[0].close < lastCandles[0].open;
      const candle2Bearish = lastCandles[1].close < lastCandles[1].open;
      const candle3StartingBearish = lastCandles[2].close < lastCandles[2].open;

      shouldClose = candle1Bearish && candle2Bearish && candle3StartingBearish;

      if (shouldClose) {
        console.log(
          `${symbol} LONG - Bearish reversal detected: 3 consecutive bearish candles`
        );
      }
    } else {
      const candle1Bullish = lastCandles[0].close > lastCandles[0].open;
      const candle2Bullish = lastCandles[1].close > lastCandles[1].open;
      const candle3StartingBullish = lastCandles[2].close > lastCandles[2].open;

      shouldClose = candle1Bullish && candle2Bullish && candle3StartingBullish;

      if (shouldClose) {
        console.log(
          `${symbol} SHORT - Bullish reversal detected: 3 consecutive bullish candles`
        );
      }
    }

    if (shouldClose) {
      await closePositionWithProfit(position, currentPrice, currentROI);
      return true;
    }

    return false;
  } catch (error) {
    console.error(
      `Error checking trailing stop for ${position.symbol}:`,
      error
    );
    return false;
  }
}

async function closePositionWithProfit(position, currentPrice, currentROI) {
  try {
    const { symbol, side, quantity, tradeId, stopLossOrderId, profitOrderId } =
      position;

    console.log(
      `🎯 Closing ${side} position for ${symbol} at ${currentPrice} with ${currentROI.toFixed(
        2
      )}% profit`
    );

    try {
      if (stopLossOrderId) {
        await binance.futuresCancel(symbol, { orderId: stopLossOrderId });
        console.log(`Cancelled stop loss order for ${symbol}`);
      }
      if (profitOrderId) {
        await binance.futuresCancel(symbol, { orderId: profitOrderId });
        console.log(`Cancelled take profit order for ${symbol}`);
      }
    } catch (cancelError) {
      console.log(
        `Note: Some orders may have already been filled or cancelled for ${symbol}`
      );
    }

    let closeOrder;
    if (side === "LONG") {
      closeOrder = await binance.futuresMarketSell(symbol, quantity);
    } else {
      closeOrder = await binance.futuresMarketBuy(symbol, quantity);
    }

    console.log(
      `✅ Position closed for ${symbol} with profit: ${currentROI.toFixed(2)}%`
    );

    sendTelegram(
      `💰 PROFIT BOOKED: ${side} ${symbol} closed at ${currentPrice} with ${currentROI.toFixed(
        2
      )}% ROI`
    );

    await axios.put(`${API_ENDPOINT}${tradeId}`, {
      data: {
        status: "1",
        closePrice: currentPrice,
        closeOrderId: closeOrder.orderId,
        finalROI: currentROI,
      },
    });

    activePositions.delete(symbol);
  } catch (error) {
    console.error(`Error closing position for ${position.symbol}:`, error);
    sendTelegram(
      `❌ Error closing position for ${position.symbol}: ${error.message}`
    );
  }
}
async function processSymbol(symbol, maxSpendPerTrade) {
  const decision = await decideTradeDirection(symbol);

  if (decision === "LONG") {
    sendTelegram(`✨ LONG SIGNAL for ${symbol}`);
    await placeBuyOrder(symbol, maxSpendPerTrade);
  } else if (decision === "SHORT") {
    sendTelegram(`✨ SHORT SIGNAL for ${symbol}`);
    await placeShortOrder(symbol, maxSpendPerTrade);
  } else {
    sendTelegram(`No trade signal for ${symbol}`);
    console.log(`No trade signal for ${symbol}`);
  }
}
async function placeBuyOrder(symbol, marginAmount) {
  try {
    await setLeverage(symbol);

    const price = (await binance.futuresPrices())[symbol];
    const entryPrice = parseFloat(price);
    const positionValue = marginAmount * leverage;
    const quantity = parseFloat((positionValue / entryPrice).toFixed(6));

    const exchangeInfo = await binance.futuresExchangeInfo();
    const symbolInfo = exchangeInfo.symbols.find((s) => s.symbol === symbol);
    const pricePrecision = symbolInfo.pricePrecision;
    const quantityPrecision = symbolInfo.quantityPrecision;

    const qtyFixed = quantity.toFixed(quantityPrecision);
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
    const buyOrder = await binance.futuresMarketBuy(symbol, qtyFixed);
    sendTelegram(
      `🟢 LONG ${symbol} at ${entryPrice} | Qty: ${qtyFixed} | Leverage: ${leverage}x`
    );
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

    activePositions.set(symbol, {
      symbol,
      side: "LONG",
      entryPrice,
      marginUsed: marginAmount,
      quantity: parseFloat(qtyFixed),
      tradeId,
      stopLossOrderId: stopLossOrder.orderId,
      profitOrderId: takeProfitOrder.orderId,
      createdAt: Date.now(),
    });

    console.log(`✅ Added ${symbol} LONG position to trailing stop monitoring`);
  } catch (error) {
    console.error(`Error placing LONG order for ${symbol}:`, error);
    sendTelegram(`❌ Error placing LONG order for ${symbol}: ${error.message}`);
  }
}
async function placeShortOrder(symbol, marginAmount) {
  try {
    await setLeverage(symbol);

    const price = (await binance.futuresPrices())[symbol];
    const entryPrice = parseFloat(price);
    const positionValue = marginAmount * leverage;
    const quantity = parseFloat((positionValue / entryPrice).toFixed(6));
    const exchangeInfo = await binance.futuresExchangeInfo();
    const symbolInfo = exchangeInfo.symbols.find((s) => s.symbol === symbol);
    const pricePrecision = symbolInfo.pricePrecision;
    const quantityPrecision = symbolInfo.quantityPrecision;
    const qtyFixed = quantity.toFixed(quantityPrecision);
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
    const shortOrder = await binance.futuresMarketSell(symbol, qtyFixed);
    sendTelegram(
      `🔴 SHORT ${symbol} at ${entryPrice} | Qty: ${qtyFixed} | Leverage: ${leverage}x`
    );
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

    activePositions.set(symbol, {
      symbol,
      side: "SHORT",
      entryPrice,
      marginUsed: marginAmount,
      quantity: parseFloat(qtyFixed),
      tradeId,
      stopLossOrderId: stopLossOrder.orderId,
      profitOrderId: takeProfitOrder.orderId,
      createdAt: Date.now(),
    });

    console.log(
      `✅ Added ${symbol} SHORT position to trailing stop monitoring`
    );
  } catch (error) {
    console.error(`Error placing SHORT order for ${symbol}:`, error);
    sendTelegram(
      `❌ Error placing SHORT order for ${symbol}: ${error.message}`
    );
  }
}

async function monitorTrailingStops() {
  if (activePositions.size === 0) {
    return;
  }

  console.log(
    `🔍 Monitoring ${activePositions.size} active positions for trailing stops...`
  );

  for (const [symbol, position] of activePositions) {
    try {
      const shouldClose = await checkTrailingStop(position);
      if (shouldClose) {
        console.log(`Position closed for ${symbol} via trailing stop`);
      }
    } catch (error) {
      console.error(`Error monitoring trailing stop for ${symbol}:`, error);
    }
  }
}

// 🔁 Main Loop
setInterval(async () => {
  const totalBalance = await getUsdtBalance();
  const usableBalance = totalBalance - 6; // Keep $5.1 reserve
  const maxSpendPerTrade = usableBalance / symbols.length;

  if (usableBalance <= 6) {
    console.log("Not enough balance to trade.");
    return;
  }

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
}, 60 * 500); // Run every 1 minute

setInterval(async () => {
  await monitorTrailingStops();
}, 30 * 1000); // Run every 30 seconds

console.log("🚀 Enhanced Trading Bot with Trailing Stop Started!");
console.log(`📊 Minimum Profit ROI: ${MINIMUM_PROFIT_ROI}%`);
console.log(`🎯 Initial Take Profit ROI: ${INITIAL_TAKE_PROFIT_ROI}%`);
console.log(`📉 Stop Loss ROI: ${STOP_LOSS_ROI}%`);
console.log(`📈 Leverage: ${leverage}x`);


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
}, 20000);