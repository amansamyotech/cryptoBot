const Binance = require("node-binance-api");
const axios = require("axios");

const { checkOrders } = require("./orderCheckFun");
const { getUsdtBalance } = require("./helper/getBalance");
const { symbols } = require("./constent");
const { decide25TEMA } = require("./decide25TEMA");
const isProcessing = {};

const API_ENDPOINT = "http://localhost:3000/api/buySell/";

const binance = new Binance().options({
  APIKEY: "tPCOyhkpaVUj6it6BiKQje0WxcJjUOV30EQ7dY2FMcqXunm9DwC8xmuiCkgsyfdG",
  APISECRET: "UpK4CPfKywFrAJDInCAXPmWVSiSs5xVVL2nDes8igCONl3cVgowDjMbQg64fm5pr",
  useServerTime: true,
  test: false,
});

const interval = "1m";
const LEVERAGE = 3;
const FIXED_STOP_LOSS_ROI = -1; // 1% SL
const FIXED_TAKE_PROFIT_ROI = 2; // 2% TP
const TRAILING_TP_START_ROI = 2; // Start trailing TP after 2% profit
const ATR_PERIOD = 14; // 14-period ATR
const USE_ATR_STOP_LOSS = false; // Toggle for ATR-based SL (set to true to enable)

async function calculateATR(symbol, period = ATR_PERIOD) {
  try {
    const candles = await binance.futuresCandles(symbol, interval, { limit: period + 1 });
    let trSum = 0;
    for (let i = 1; i < candles.length; i++) {
      const high = parseFloat(candles[i][2]);
      const low = parseFloat(candles[i][3]);
      const prevClose = parseFloat(candles[i - 1][4]);
      const tr = Math.max(
        high - low,
        Math.abs(high - prevClose),
        Math.abs(low - prevClose)
      );
      trSum += tr;
    }
    const atr = trSum / period;
    return atr;
  } catch (err) {
    console.error(`[${symbol}] Error calculating ATR:`, err.message);
    return null;
  }
}

async function checkRedCandles(symbol, count = 2) {
  try {
    const candles = await binance.futuresCandles(symbol, interval, { limit: count });
    return candles.every(candle => parseFloat(candle[4]) < parseFloat(candle[1])); // Close < Open
  } catch (err) {
    console.error(`[${symbol}] Error checking red candles:`, err.message);
    return false;
  }
}

async function trailStopLossForLong(symbol, tradeDetails, currentPrice) {
  try {
    const {
      stopLossOrderId,
      takeProfitOrderId,
      objectId,
      LongTimeCoinPrice: { $numberDecimal: longTimePrice },
      quantity,
      stopLossPrice: oldStopLoss,
      takeProfitPrice,
      marginUsed,
      leverage,
    } = tradeDetails;

    const entryPrice = parseFloat(longTimePrice);
    const oldStop = parseFloat(oldStopLoss);
    const margin = parseFloat(marginUsed);
    const lev = parseFloat(leverage);
    const qty = parseFloat(quantity);
    const pnl = (currentPrice - entryPrice) * qty;
    const roi = (pnl / margin) * 100;

    const exchangeInfo = await binance.futuresExchangeInfo();
    const symbolInfo = exchangeInfo.symbols.find((s) => s.symbol === symbol);
    const pricePrecision = symbolInfo.pricePrecision;
    const quantityPrecision = symbolInfo.quantityPrecision;
    const qtyFixed = qty.toFixed(quantityPrecision);

    // Handle Trailing Take-Profit
    if (roi >= TRAILING_TP_START_ROI) {
      const isTwoRedCandles = await checkRedCandles(symbol);
      if (isTwoRedCandles) {
        console.log(`[${symbol}] LONG: 2 red candles detected after ${roi.toFixed(2)}% ROI. Closing position.`);
        await binance.futuresMarketSell(symbol, qtyFixed, { reduceOnly: true });
        await axios.put(`${API_ENDPOINT}${objectId}`, { data: { status: "CLOSED" } });
        console.log(`[${symbol}] LONG position closed due to trailing TP.`);
        return;
      }

      // Optional ATR-based trailing TP
      if (USE_ATR_STOP_LOSS) {
        const atr = await calculateATR(symbol);
        if (atr) {
          const newTakeProfit = parseFloat((currentPrice - atr * 2).toFixed(pricePrecision));
          if (!takeProfitPrice || newTakeProfit > parseFloat(takeProfitPrice)) {
            console.log(`[${symbol}] LONG: Updating ATR-based TP to ${newTakeProfit}`);
            if (takeProfitOrderId) {
              try {
                await binance.futuresCancel(symbol, takeProfitOrderId);
              } catch (err) {
                console.warn(`[${symbol}] Failed to cancel TP order ${takeProfitOrderId}: ${err.message}`);
              }
            }
            const tpOrder = await binance.futuresOrder(
              "TAKE_PROFIT_MARKET",
              "SELL",
              symbol,
              qtyFixed,
              null,
              { stopPrice: newTakeProfit, reduceOnly: true, timeInForce: "GTC" }
            );
            await axios.put(`${API_ENDPOINT}${objectId}`, {
              data: { takeProfitPrice: newTakeProfit, takeProfitOrderId: tpOrder.orderId },
            });
            console.log(`[${symbol}] LONG: New ATR-based TP order placed: ${tpOrder.orderId}`);
          }
        }
      }
    }

    // Handle Stop-Loss (Fixed or ATR-based)
    let newStop;
    if (USE_ATR_STOP_LOSS) {
      const atr = await calculateATR(symbol);
      if (atr) {
        newStop = parseFloat((entryPrice - atr * 2).toFixed(pricePrecision));
      } else {
        newStop = oldStop; // Fallback to old stop if ATR fails
      }
    } else {
      newStop = parseFloat((entryPrice * (1 + FIXED_STOP_LOSS_ROI / 100)).toFixed(pricePrecision));
    }

    if (roi >= TRAILING_TP_START_ROI && newStop > oldStop) {
      const roundedCurrent = parseFloat(currentPrice.toFixed(pricePrecision));
      if (newStop >= roundedCurrent) {
        console.warn(`[${symbol}] Skipping SL update — newStop (${newStop}) >= currentPrice (${roundedCurrent})`);
        return;
      }

      // Cleanup existing STOP_MARKET SELL orders
      let openOrders;
      try {
        openOrders = await binance.futuresOpenOrders(symbol);
        for (const order of openOrders) {
          if (order.type === "STOP_MARKET" && order.side === "SELL" && order.reduceOnly) {
            try {
              await binance.futuresCancel(symbol, order.orderId);
            } catch (cancelErr) {
              if (cancelErr.code === -2011 || cancelErr.code === -1102) {
                console.log(`[${symbol}] Order ${order.orderId} already gone (${cancelErr.code}). Skipping.`);
              } else {
                console.warn(`[${symbol}] Failed to clean up ${order.orderId}: ${cancelErr.message}`);
              }
            }
          }
        }
      } catch (err) {
        console.warn(`[${symbol}] Failed to fetch open orders: ${err.message}`);
      }

      // Cancel old stop loss (if exists)
      if (stopLossOrderId) {
        try {
          await binance.futuresCancel(symbol, stopLossOrderId);
          console.log(`[${symbol}] Canceled old stop order ${stopLossOrderId}`);
        } catch (err) {
          if (err.code === -2011 || err.code === -1102) {
            console.log(`[${symbol}] Old stop ${stopLossOrderId} already gone (${err.code}). Proceeding.`);
          } else {
            console.warn(`[${symbol}] Failed to cancel order ${stopLossOrderId}: ${err.message}`);
          }
        }
      }

      // Place new stop loss
      const tickSize = Math.pow(10, -pricePrecision);
      const buffer = tickSize * 5;
      const adjustedStop = parseFloat((newStop - buffer).toFixed(pricePrecision));
      let stopLossOrder;
      try {
        stopLossOrder = await binance.futuresOrder(
          "STOP_MARKET",
          "SELL",
          symbol,
          qtyFixed,
          null,
          { stopPrice: adjustedStop, reduceOnly: true, timeInForce: "GTC" }
        );
        console.log(`[${symbol}] New stop order placed: ${stopLossOrder.orderId}`);
      } catch (placeErr) {
        if (placeErr.code === -4045) {
          console.warn(`[${symbol}] Hit max stop limit (-4045). Canceling all and retrying.`);
          await binance.futuresCancelAll(symbol);
          stopLossOrder = await binance.futuresOrder(
            "STOP_MARKET",
            "SELL",
            symbol,
            qtyFixed,
            null,
            { stopPrice: adjustedStop, reduceOnly: true, timeInForce: "GTC" }
          );
          console.log(`[${symbol}] Retry succeeded: New stop order ${stopLossOrder.orderId}`);
        } else {
          throw placeErr;
        }
      }

      // Update DB
      await axios.put(`${API_ENDPOINT}${objectId}`, {
        data: {
          stopLossPrice: newStop,
          stopLossOrderId: stopLossOrder.orderId,
          isProfit: roi > 0,
        },
      });
      console.log(`[${symbol}] LONG Stop Loss updated successfully.`);
    } else {
      console.log(`[${symbol}] LONG ROI ${roi.toFixed(2)}% — SL unchanged (${oldStop}).`);
    }
  } catch (err) {
    console.error(`[${symbol}] Error trailing LONG stop-loss:`, err.message);
  }
}

async function trailStopLossForShort(symbol, tradeDetails, currentPrice) {
  try {
    const {
      stopLossOrderId,
      takeProfitOrderId,
      objectId,
      ShortTimeCurrentPrice: { $numberDecimal: shortTimeCurrentPrice },
      quantity,
      stopLossPrice: oldStopLoss,
      takeProfitPrice,
      marginUsed,
      leverage,
    } = tradeDetails;

    const entryPrice = parseFloat(shortTimeCurrentPrice);
    const oldStop = parseFloat(oldStopLoss);
    const margin = parseFloat(marginUsed);
    const lev = parseFloat(leverage);
    const qty = parseFloat(quantity);
    const pnl = (entryPrice - currentPrice) * qty;
    const roi = (pnl / margin) * 100;

    const exchangeInfo = await binance.futuresExchangeInfo();
    const symbolInfo = exchangeInfo.symbols.find((s) => s.symbol === symbol);
    const pricePrecision = symbolInfo.pricePrecision;
    const quantityPrecision = symbolInfo.quantityPrecision;
    const qtyFixed = qty.toFixed(quantityPrecision);

    // Handle Trailing Take-Profit
    if (roi >= TRAILING_TP_START_ROI) {
      const isTwoRedCandles = await checkRedCandles(symbol);
      if (isTwoRedCandles) {
        console.log(`[${symbol}] SHORT: 2 red candles detected after ${roi.toFixed(2)}% ROI. Closing position.`);
        await binance.futuresMarketBuy(symbol, qtyFixed, { reduceOnly: true });
        await axios.put(`${API_ENDPOINT}${objectId}`, { data: { status: "CLOSED" } });
        console.log(`[${symbol}] SHORT position closed due to trailing TP.`);
        return;
      }

      // Optional ATR-based trailing TP
      if (USE_ATR_STOP_LOSS) {
        const atr = await calculateATR(symbol);
        if (atr) {
          const newTakeProfit = parseFloat((currentPrice + atr * 2).toFixed(pricePrecision));
          if (!takeProfitPrice || newTakeProfit < parseFloat(takeProfitPrice)) {
            console.log(`[${symbol}] SHORT: Updating ATR-based TP to ${newTakeProfit}`);
            if (takeProfitOrderId) {
              try {
                await binance.futuresCancel(symbol, takeProfitOrderId);
              } catch (err) {
                console.warn(`[${symbol}] Failed to cancel TP order ${takeProfitOrderId}: ${err.message}`);
              }
            }
            const tpOrder = await binance.futuresOrder(
              "TAKE_PROFIT_MARKET",
              "BUY",
              symbol,
              qtyFixed,
              null,
              { stopPrice: newTakeProfit, reduceOnly: true, timeInForce: "GTC" }
            );
            await axios.put(`${API_ENDPOINT}${objectId}`, {
              data: { takeProfitPrice: newTakeProfit, takeProfitOrderId: tpOrder.orderId },
            });
            console.log(`[${symbol}] SHORT: New ATR-based TP order placed: ${tpOrder.orderId}`);
          }
        }
      }
    }

    // Handle Stop-Loss (Fixed or ATR-based)
    let newStop;
    if (USE_ATR_STOP_LOSS) {
      const atr = await calculateATR(symbol);
      if (atr) {
        newStop = parseFloat((entryPrice + atr * 2).toFixed(pricePrecision));
      } else {
        newStop = oldStop; // Fallback to old stop if ATR fails
      }
    } else {
      newStop = parseFloat((entryPrice * (1 - FIXED_STOP_LOSS_ROI / 100)).toFixed(pricePrecision));
    }

    if (roi >= TRAILING_TP_START_ROI && newStop < oldStop) {
      const roundedCurrent = parseFloat(currentPrice.toFixed(pricePrecision));
      if (newStop <= roundedCurrent) {
        console.warn(`[${symbol}] Skipping SL update — newStop (${newStop}) <= currentPrice (${roundedCurrent})`);
        return;
      }

      // Cleanup existing STOP_MARKET BUY orders
      let openOrders;
      try {
        openOrders = await binance.futuresOpenOrders(symbol);
        for (const order of openOrders) {
          if (order.type === "STOP_MARKET" && order.side === "BUY" && order.reduceOnly) {
            try {
              await binance.futuresCancel(symbol, order.orderId);
            } catch (cancelErr) {
              if (cancelErr.code === -2011 || cancelErr.code === -1102) {
                console.log(`[${symbol}] Order ${order.orderId} already gone (${cancelErr.code}). Skipping.`);
              } else {
                console.warn(`[${symbol}] Failed to clean up ${order.orderId}: ${cancelErr.message}`);
              }
            }
          }
        }
      } catch (err) {
        console.warn(`[${symbol}] Failed to fetch open orders: ${err.message}`);
      }

      // Cancel old stop loss (if exists)
      if (stopLossOrderId) {
        try {
          await binance.futuresCancel(symbol, stopLossOrderId);
          console.log(`[${symbol}] Canceled old stop order ${stopLossOrderId}`);
        } catch (err) {
          if (err.code === -2011 || err.code === -1102) {
            console.log(`[${symbol}] Old stop ${stopLossOrderId} already gone (${err.code}). Proceeding.`);
          } else {
            console.warn(`[${symbol}] Failed to cancel order ${stopLossOrderId}: ${err.message}`);
          }
        }
      }

      // Place new stop loss
      const tickSize = Math.pow(10, -pricePrecision);
      const buffer = tickSize * 5;
      const adjustedStop = parseFloat((newStop + buffer).toFixed(pricePrecision));
      let stopLossOrder;
      try {
        stopLossOrder = await binance.futuresOrder(
          "STOP_MARKET",
          "BUY",
          symbol,
          qtyFixed,
          null,
          { stopPrice: adjustedStop, reduceOnly: true, timeInForce: "GTC" }
        );
        console.log(`[${symbol}] New stop order placed: ${stopLossOrder.orderId}`);
      } catch (placeErr) {
        if (placeErr.code === -4045) {
          console.warn(`[${symbol}] Hit max stop limit (-4045). Canceling all and retrying.`);
          await binance.futuresCancelAll(symbol);
          stopLossOrder = await binance.futuresOrder(
            "STOP_MARKET",
            "BUY",
            symbol,
            qtyFixed,
            null,
            { stopPrice: adjustedStop, reduceOnly: true, timeInForce: "GTC" }
          );
          console.log(`[${symbol}] Retry succeeded: New stop order ${stopLossOrder.orderId}`);
        } else {
          throw placeErr;
        }
      }

      // Update DB
      await axios.put(`${API_ENDPOINT}${objectId}`, {
        data: {
          stopLossPrice: newStop,
          stopLossOrderId: stopLossOrder.orderId,
          isProfit: roi > 0,
        },
      });
      console.log(`[${symbol}] SHORT Stop Loss updated successfully.`);
    } else {
      console.log(`[${symbol}] SHORT ROI ${roi.toFixed(2)}% — SL unchanged (${oldStop}).`);
    }
  } catch (err) {
    console.error(`[${symbol}] Error trailing SHORT stop-loss:`, err.message);
  }
}

async function trailStopLoss(symbol) {
  try {
    const priceMap = await binance.futuresPrices();
    const currentPrice = parseFloat(priceMap[symbol]);
    const response = await axios.get(`${API_ENDPOINT}find-treads/${symbol}`);
    const { found, tradeDetails } = response.data?.data;

    if (!found) {
      console.log(`[${symbol}] No active trade found.`);
      return;
    }

    const { side } = tradeDetails;

    if (side === "LONG") {
      await trailStopLossForLong(symbol, tradeDetails, currentPrice);
    } else if (side === "SHORT") {
      await trailStopLossForShort(symbol, tradeDetails, currentPrice);
    } else {
      console.log(`[${symbol}] Unknown position side: ${side}`);
    }
  } catch (err) {
    console.error(`[${symbol}] Error in main trailing stop-loss function:`, err.message);
  }
}

async function placeBuyOrder(symbol, marginAmount) {
  try {
    try {
      await binance.futuresMarginType(symbol, "ISOLATED");
      console.log(`[${symbol}] Margin type set to ISOLATED.`);
    } catch (err) {
      const msg = err?.body || err?.message || "";
      if (msg.includes("No need to change") || msg.includes("margin type cannot be changed")) {
        console.log(`[${symbol}] Margin type already ISOLATED or cannot be changed right now.`);
      } else {
        console.warn(`[${symbol}] Error setting margin type:`, msg);
      }
    }
    await binance.futuresLeverage(symbol, LEVERAGE);
    console.log(`[${symbol}] Leverage set to ${LEVERAGE}x`);

    const price = (await binance.futuresPrices())[symbol];
    const entryPrice = parseFloat(price);
    const positionValue = marginAmount * LEVERAGE;
    const quantity = parseFloat((positionValue / entryPrice).toFixed(6));

    const exchangeInfo = await binance.futuresExchangeInfo();
    const symbolInfo = exchangeInfo.symbols.find((s) => s.symbol === symbol);
    const pricePrecision = symbolInfo.pricePrecision;
    const quantityPrecision = symbolInfo.quantityPrecision;
    const qtyFixed = quantity.toFixed(quantityPrecision);

    let stopLossPrice, takeProfitPrice;
    if (USE_ATR_STOP_LOSS) {
      const atr = await calculateATR(symbol);
      if (atr) {
        stopLossPrice = parseFloat((entryPrice - atr * 2).toFixed(pricePrecision));
        takeProfitPrice = parseFloat((entryPrice + atr * 4).toFixed(pricePrecision)); // 2:1 risk/reward
      } else {
        stopLossPrice = parseFloat((entryPrice * (1 + FIXED_STOP_LOSS_ROI / 100)).toFixed(pricePrecision));
        takeProfitPrice = parseFloat((entryPrice * (1 + FIXED_TAKE_PROFIT_ROI / 100)).toFixed(pricePrecision));
      }
    } else {
      stopLossPrice = parseFloat((entryPrice * (1 + FIXED_STOP_LOSS_ROI / 100)).toFixed(pricePrecision));
      takeProfitPrice = parseFloat((entryPrice * (1 + FIXED_TAKE_PROFIT_ROI / 100)).toFixed(pricePrecision));
    }

    console.log(`LONG Order Details for ${symbol}:`);
    console.log(`Entry Price: ${entryPrice}`);
    console.log(`Quantity: ${qtyFixed}`);
    console.log(`Margin Used: ${marginAmount}`);
    console.log(`Position Value: ${positionValue} (${LEVERAGE}x leverage)`);
    console.log(`Stop Loss Price: ${stopLossPrice} (${FIXED_STOP_LOSS_ROI}% ROI)`);
    console.log(`Take Profit Price: ${takeProfitPrice} (${FIXED_TAKE_PROFIT_ROI}% ROI)`);

    const buyOrder = await binance.futuresMarketBuy(symbol, qtyFixed);
    console.log(`Bought ${symbol} at ${entryPrice}`);

    const buyOrderDetails = {
      side: "LONG",
      symbol,
      quantity: qtyFixed,
      LongTimeCoinPrice: entryPrice,
      placeOrderId: buyOrder.orderId,
      marginUsed: marginAmount,
      leverage: LEVERAGE,
      positionValue: positionValue,
      stopLossPrice,
      takeProfitPrice,
    };

    console.log(`buyOrderDetails`, buyOrderDetails);

    const tradeResponse = await axios.post(API_ENDPOINT, { data: buyOrderDetails });
    console.log(`Trade Response:`, tradeResponse?.data);

    const tradeId = tradeResponse.data._id;
    const stopLossOrder = await binance.futuresOrder(
      "STOP_MARKET",
      "SELL",
      symbol,
      qtyFixed,
      null,
      { stopPrice: stopLossPrice, reduceOnly: true, timeInForce: "GTC" }
    );
    const takeProfitOrder = await binance.futuresOrder(
      "TAKE_PROFIT_MARKET",
      "SELL",
      symbol,
      qtyFixed,
      null,
      { stopPrice: takeProfitPrice, reduceOnly: true, timeInForce: "GTC" }
    );

    console.log(`Stop Loss set at ${stopLossPrice} for ${symbol} (${FIXED_STOP_LOSS_ROI}% ROI)`);
    console.log(`Take Profit set at ${takeProfitPrice} for ${symbol} (${FIXED_TAKE_PROFIT_ROI}% ROI)`);

    const details = {
      stopLossPrice,
      stopLossOrderId: stopLossOrder.orderId,
      takeProfitPrice,
      takeProfitOrderId: takeProfitOrder.orderId,
    };
    console.log(`details`, details);
    await axios.put(`${API_ENDPOINT}${tradeId}`, { data: details });
  } catch (error) {
    console.error(`Error placing LONG order for ${symbol}:`, error);
  }
}

async function placeShortOrder(symbol, marginAmount) {
  try {
    try {
      await binance.futuresMarginType(symbol, "ISOLATED");
      console.log(`[${symbol}] Margin type set to ISOLATED.`);
    } catch (err) {
      const msg = err?.body || err?.message || "";
      if (msg.includes("No need to change") || msg.includes("margin type cannot be changed")) {
        console.log(`[${symbol}] Margin type already ISOLATED or cannot be changed right now.`);
      } else {
        console.warn(`[${symbol}] Error setting margin type:`, msg);
      }
    }
    await binance.futuresLeverage(symbol, LEVERAGE);
    console.log(`[${symbol}] Leverage set to ${LEVERAGE}x`);

    const price = (await binance.futuresPrices())[symbol];
    const entryPrice = parseFloat(price);
    const positionValue = marginAmount * LEVERAGE;
    const quantity = parseFloat((positionValue / entryPrice).toFixed(6));

    const exchangeInfo = await binance.futuresExchangeInfo();
    const symbolInfo = exchangeInfo.symbols.find((s) => s.symbol === symbol);
    const pricePrecision = symbolInfo.pricePrecision;
    const quantityPrecision = symbolInfo.quantityPrecision;
    const qtyFixed = quantity.toFixed(quantityPrecision);

    let stopLossPrice, takeProfitPrice;
    if (USE_ATR_STOP_LOSS) {
      const atr = await calculateATR(symbol);
      if (atr) {
        stopLossPrice = parseFloat((entryPrice + atr * 2).toFixed(pricePrecision));
        takeProfitPrice = parseFloat((entryPrice - atr * 4).toFixed(pricePrecision)); // 2:1 risk/reward
      } else {
        stopLossPrice = parseFloat((entryPrice * (1 - FIXED_STOP_LOSS_ROI / 100)).toFixed(pricePrecision));
        takeProfitPrice = parseFloat((entryPrice * (1 - FIXED_TAKE_PROFIT_ROI / 100)).toFixed(pricePrecision));
      }
    } else {
      stopLossPrice = parseFloat((entryPrice * (1 - FIXED_STOP_LOSS_ROI / 100)).toFixed(pricePrecision));
      takeProfitPrice = parseFloat((entryPrice * (1 - FIXED_TAKE_PROFIT_ROI / 100)).toFixed(pricePrecision));
    }

    console.log(`SHORT Order Details for ${symbol}:`);
    console.log(`Entry Price: ${entryPrice}`);
    console.log(`Quantity: ${qtyFixed}`);
    console.log(`Margin Used: ${marginAmount}`);
    console.log(`Position Value: ${positionValue} (${LEVERAGE}x leverage)`);
    console.log(`Stop Loss Price: ${stopLossPrice} (${FIXED_STOP_LOSS_ROI}% ROI)`);
    console.log(`Take Profit Price: ${takeProfitPrice} (${FIXED_TAKE_PROFIT_ROI}% ROI)`);

    const shortOrder = await binance.futuresMarketSell(symbol, qtyFixed);
    console.log(`Shorted ${symbol} at ${entryPrice}`);

    const shortOrderDetails = {
      side: "SHORT",
      symbol,
      quantity: qtyFixed,
      ShortTimeCurrentPrice: entryPrice,
      placeOrderId: shortOrder.orderId,
      marginUsed: marginAmount,
      leverage: LEVERAGE,
      positionValue: positionValue,
      stopLossPrice,
      takeProfitPrice,
    };

    console.log(`shortOrderDetails`, shortOrderDetails);

    const tradeResponse = await axios.post(API_ENDPOINT, { data: shortOrderDetails });
    console.log(`Trade Response:`, tradeResponse?.data);

    const tradeId = tradeResponse.data._id;

    const stopLossOrder = await binance.futuresOrder(
      "STOP_MARKET",
      "BUY",
      symbol,
      qtyFixed,
      null,
      { stopPrice: stopLossPrice, reduceOnly: true, timeInForce: "GTC" }
    );
    const takeProfitOrder = await binance.futuresOrder(
      "TAKE_PROFIT_MARKET",
      "BUY",
      symbol,
      qtyFixed,
      null,
      { stopPrice: takeProfitPrice, reduceOnly: true, timeInForce: "GTC" }
    );

    console.log(`Stop Loss set at ${stopLossPrice} for ${symbol} (${FIXED_STOP_LOSS_ROI}% ROI)`);
    console.log(`Take Profit set at ${takeProfitPrice} for ${symbol} (${FIXED_TAKE_PROFIT_ROI}% ROI)`);

    const details = {
      stopLossPrice,
      stopLossOrderId: stopLossOrder.orderId,
      takeProfitPrice,
      takeProfitOrderId: takeProfitOrder.orderId,
    };

    console.log(`details`, details);

    await axios.put(`${API_ENDPOINT}${tradeId}`, { data: details });
  } catch (error) {
    console.error(`Error placing SHORT order for ${symbol}:`, error);
  }
}

async function processSymbol(symbol, maxSpendPerTrade) {
  const decision = await decide25TEMA(symbol);

  if (decision === "LONG") {
    await placeBuyOrder(symbol, maxSpendPerTrade);
  } else if (decision === "SHORT") {
    await placeShortOrder(symbol, maxSpendPerTrade);
  } else {
    console.log(`No trade signal for ${symbol}`);
  }
}

setInterval(async () => {
  const totalBalance = await getUsdtBalance();
  const usableBalance = totalBalance - 10;
  const maxSpendPerTrade = usableBalance / symbols.length;

  console.log(`Total Balance: ${totalBalance} USDT`);
  console.log(`Usable Balance: ${usableBalance} USDT`);
  console.log(`Max Spend Per Trade: ${maxSpendPerTrade} USDT`);
  if (maxSpendPerTrade >= 1.6) {
    for (const sym of symbols) {
      try {
        const response = await axios.post(`${API_ENDPOINT}check-symbols`, { symbols: sym });
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
  } else {
    console.log("not enough amount");
  }
}, 5000);

setInterval(async () => {
  for (const sym of symbols) {
    await checkOrders(sym);
  }
}, 2500);

setInterval(async () => {
  for (const sym of symbols) {
    try {
      const response = await axios.post(`${API_ENDPOINT}check-symbols`, { symbols: sym });
      let status = response?.data?.data.status;

      if (status === false) {
        if (isProcessing[sym]) {
          console.log(`[${sym}] Skipping trailing — already processing.`);
          continue;
        }
        isProcessing[sym] = true;

        const positions = await binance.futuresPositionRisk({ symbol: sym });
        const pos = positions.find((p) => p.symbol === sym);
        if (Math.abs(parseFloat(pos.positionAmt)) === 0) {
          console.log(`[${sym}] Position already closed. Skipping trailing.`);
          continue;
        }

        await trailStopLoss(sym);
      }
    } catch (err) {
      console.error(`Error with ${sym}:`, err.message);
    } finally {
      isProcessing[sym] = false;
    }
  }
}, 1500);