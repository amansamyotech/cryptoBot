const Binance = require("node-binance-api");
const axios = require("axios");
const { decide25TEMA, calculateTEMA } = require("./decide25TEMA");
const { getUsdtBalance } = require("./helper/getBalance");
const { getCandles } = require("./helper/getCandles");
const { checkOrders } = require("./orderCheck2Fun");
const isProcessing = {};

const API_ENDPOINT = "http://localhost:3001/api/buySell/";

const binance = new Binance().options({
  APIKEY: "whfiekZqKdkwa9fEeUupVdLZTNxBqP1OCEuH2pjyImaWt51FdpouPPrCawxbsupK",
  APISECRET: "E4IcteWOQ6r9qKrBZJoBy4R47nNPBDepVXMnS3Lf2Bz76dlu0QZCNh82beG2rHq4",
  useServerTime: true,
  test: false,
});

const symbols = ["SOLUSDT", "BNBUSDT", "XRPUSDT", "ADAUSDT", "DOGEUSDT"];

const LEVERAGE = 3;
const STOP_LOSS_ROI = -1.5;
const STOP_LOSS_CANCEL_ROI = 1.5;

async function getTEMAValues(symbol) {
  try {
    const candles = await getCandles(symbol, "1m", 1000);
    if (candles.length < 50) {
      console.log("❌ Insufficient candles for analysis");
      return "HOLD";
    }

    const closes = candles.map((c) => c.close);

    const tema15 = calculateTEMA(closes, 15);

    const tema21 = calculateTEMA(closes, 21);

    if (tema15.length === 0 || tema21.length === 0) {
      console.warn(`[${symbol}] Not enough data to calculate TEMA`);
      return null;
    }

    const latestTEMA15 = tema15[tema15.length - 1];

    const latestTEMA21 = tema21[tema21.length - 1];

    return {
      tema15: latestTEMA15,
      tema21: latestTEMA21,
    };
  } catch (error) {
    console.error(`Error getting TEMA values for ${symbol}:`, error.message);
    return null;
  }
}

async function checkTEMACrossover(symbol, side) {
  try {
    const temaValues = await getTEMAValues(symbol);
    if (!temaValues) return false;

    const { tema15, tema21 } = temaValues;

    if (side === "LONG") {
      return tema15 < tema21;
    } else if (side === "SHORT") {
      return tema15 > tema21;
    }

    return false;
  } catch (error) {
    console.error(
      `Error checking TEMA crossover for ${symbol}:`,
      error.message
    );
    return false;
  }
}
async function closePosition(symbol, tradeDetails) {
  try {
    const { side, quantity, objectId } = tradeDetails;
    const qty = parseFloat(quantity);

    const exchangeInfo = await binance.futuresExchangeInfo();
    const symbolInfo = exchangeInfo.symbols.find((s) => s.symbol === symbol);
    const quantityPrecision = symbolInfo.quantityPrecision;
    const qtyFixed = qty.toFixed(quantityPrecision);

    let closeOrder;
    if (side === "LONG") {
      closeOrder = await binance.futuresMarketSell(symbol, qtyFixed, {
        reduceOnly: true,
      });
    } else if (side === "SHORT") {
      closeOrder = await binance.futuresMarketBuy(symbol, qtyFixed, {
        reduceOnly: true,
      });
    }

    console.log(
      `[${symbol}] Position closed via TEMA crossover: ${closeOrder.orderId}`
    );
    const data = await axios.put(`${API_ENDPOINT}${objectId}`, {
      data: { status: "1" },
    });
    console.log(`data`, data);

    return true;
  } catch (error) {
    console.error(`Error closing position for ${symbol}:`, error.message);
    return false;
  }
}

async function manageProfitAndExit(symbol, tradeDetails, currentPrice) {
  try {
    const {
      stopLossOrderId,
      objectId,
      side,
      quantity,
      stopLossPrice: oldStopLoss,
      marginUsed,
      leverage,
      stopLossCancelled,
    } = tradeDetails;

    let entryPrice;
    if (side === "LONG") {
      entryPrice = parseFloat(
        tradeDetails.LongTimeCoinPrice?.$numberDecimal ||
          tradeDetails.LongTimeCoinPrice
      );
    } else {
      entryPrice = parseFloat(
        tradeDetails.ShortTimeCurrentPrice?.$numberDecimal ||
          tradeDetails.ShortTimeCurrentPrice
      );
    }

    const margin = parseFloat(marginUsed);
    const qty = parseFloat(quantity);

    let pnl, roi;
    if (side === "LONG") {
      pnl = (currentPrice - entryPrice) * qty;
    } else {
      pnl = (entryPrice - currentPrice) * qty;
    }
    roi = (pnl / margin) * 100;

    console.log(`[${symbol}] ${side} ROI: ${roi.toFixed(2)}%`);

    if (roi > STOP_LOSS_CANCEL_ROI && !stopLossCancelled) {
      await cancelStopLossAtROI(symbol, tradeDetails);
      return;
    }

    if (stopLossCancelled) {
      const shouldExit = await checkTEMACrossover(symbol, side);
      if (shouldExit) {
        console.log(`[${symbol}] TEMA crossover detected - closing position`);

        await closePosition(symbol, tradeDetails);
      }
    }
  } catch (err) {
    console.error(`[${symbol}] Error in manageProfitAndExit:`, err.message);
  }
}

async function cancelStopLossAtROI(symbol, tradeDetails) {
  try {
    const { objectId } = tradeDetails;

    console.log(
      `[${symbol}] ROI crossed +1.5% - Cancelling all stop loss orders`
    );

    const cancelResult = await cancelExistingStopOrders(symbol);
    console.log(`[${symbol}] Stop loss cancellation result:`, cancelResult);

    const cancelOrder = await axios.put(`${API_ENDPOINT}${objectId}`, {
      data: {
        stopLossCancelled: true,
        isProfit: true,
      },
    });
    console.log(`cancelOrder`, cancelOrder);

    console.log(
      `[${symbol}] Database updated - stop losses cancelled, only TEMA crossover will trigger exit`
    );
  } catch (error) {
    console.error(`[${symbol}] Error cancelling stop losses:`, error.message);
  }
}

async function cancelExistingStopOrders(symbol) {
  try {
    const openOrders = await binance.futuresOpenOrders(symbol);
    let cancelledCount = 0;

    for (const order of openOrders) {
      if (order.type === "STOP_MARKET" && order.reduceOnly) {
        try {
          await binance.futuresCancel(symbol, order.orderId);
          console.log(`[${symbol}] Canceled stop order: ${order.orderId}`);
          cancelledCount++;
        } catch (cancelErr) {
          if (cancelErr.code === -2011 || cancelErr.code === -1102) {
            console.log(`[${symbol}] Stop order ${order.orderId} already gone`);
          } else {
            console.warn(
              `[${symbol}] Failed to cancel ${order.orderId}: ${cancelErr.message}`
            );
          }
        }
      }
    }

    return { cancelled: cancelledCount, total: openOrders.length };
  } catch (error) {
    console.warn(
      `[${symbol}] Failed to fetch/cancel stop orders: ${error.message}`
    );
    return { cancelled: 0, total: 0, error: error.message };
  }
}

async function placeBuyOrder(symbol, marginAmount) {
  try {
    try {
      await binance.futuresMarginType(symbol, "ISOLATED");
      console.log(`[${symbol}] Margin type set to ISOLATED.`);
    } catch (err) {
      const msg = err?.body || err?.message || "";
      if (
        msg.includes("No need to change") ||
        msg.includes("margin type cannot be changed")
      ) {
        console.log(
          `[${symbol}] Margin type already ISOLATED or cannot be changed right now.`
        );
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

    const stopLossPnL = (STOP_LOSS_ROI / 100) * marginAmount;
    const stopLossPrice = parseFloat(
      (entryPrice + stopLossPnL / quantity).toFixed(pricePrecision)
    );

    console.log(`LONG Order Details for ${symbol}:`);
    console.log(`Entry Price: ${entryPrice}`);
    console.log(`Quantity: ${qtyFixed}`);
    console.log(`Margin Used: ${marginAmount}`);
    console.log(`Position Value: ${positionValue} (${LEVERAGE}x leverage)`);
    console.log(`Stop Loss Price: ${stopLossPrice} (${STOP_LOSS_ROI}% ROI)`);

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
      stopLossCancelled: false,
    };

    console.log(`buyOrderDetails`, buyOrderDetails);

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
        stopPrice: stopLossPrice,
        reduceOnly: true,
        timeInForce: "GTC",
      }
    );
    console.log(
      `Stop Loss set at ${stopLossPrice} for ${symbol} (${STOP_LOSS_ROI}% ROI)`
    );
    console.log(`stopLossOrder.orderId`, stopLossOrder.orderId);

    const details = {
      stopLossPrice: stopLossPrice,
      stopLossOrderId: stopLossOrder.orderId,
    };
    console.log(`details`, details);
    await axios.put(`${API_ENDPOINT}${tradeId}`, {
      data: details,
    });
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
      if (
        msg.includes("No need to change") ||
        msg.includes("margin type cannot be changed")
      ) {
        console.log(
          `[${symbol}] Margin type already ISOLATED or cannot be changed right now.`
        );
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

    const stopLossPnL = (STOP_LOSS_ROI / 100) * marginAmount;
    const stopLossPrice = parseFloat(
      (entryPrice - stopLossPnL / quantity).toFixed(pricePrecision)
    );

    console.log(`SHORT Order Details for ${symbol}:`);
    console.log(`Entry Price: ${entryPrice}`);
    console.log(`Quantity: ${qtyFixed}`);
    console.log(`Margin Used: ${marginAmount}`);
    console.log(`Position Value: ${positionValue} (${LEVERAGE}x leverage)`);
    console.log(`Stop Loss Price: ${stopLossPrice} (${STOP_LOSS_ROI}% ROI)`);

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
      stopLossCancelled: false,
    };

    console.log(`shortOrderDetails`, shortOrderDetails);

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
        stopPrice: stopLossPrice,
        reduceOnly: true,
        timeInForce: "GTC",
      }
    );
    console.log(
      `Stop Loss set at ${stopLossPrice} for ${symbol} (${STOP_LOSS_ROI}% ROI)`
    );

    const details = {
      stopLossPrice: stopLossPrice,
      stopLossOrderId: stopLossOrder.orderId,
    };

    console.log(`details`, details);

    await axios.put(`${API_ENDPOINT}${tradeId}`, {
      data: details,
    });
  } catch (error) {
    console.error(`Error placing SHORT order for ${symbol}:`, error);
  }
}

async function processSymbol(symbol, maxSpendPerTrade) {
  const decision = await decide25TEMA(symbol);
  console.log(`decision`, decision);

  // if (decision === "LONG") {
  //   await placeBuyOrder(symbol, maxSpendPerTrade);
  // } else if (decision === "SHORT") {
  //   await placeShortOrder(symbol, maxSpendPerTrade);
  // } else {
  //   console.log(`No trade signal for ${symbol}`);
  // }
}

setInterval(async () => {
  const totalBalance = await getUsdtBalance();
  const usableBalance = totalBalance - 1;
  const maxSpendPerTrade = usableBalance / symbols.length;

  console.log(`Total Balance: ${totalBalance} USDT`);
  console.log(`Usable Balance: ${usableBalance} USDT`);
  console.log(`Max Spend Per Trade: ${maxSpendPerTrade} USDT`);
  if (maxSpendPerTrade >= 1.6) {
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
  } else {
    console.log("not enough amount");
  }
}, 10000);

setInterval(async () => {
  for (const sym of symbols) {
    try {
      const response = await axios.post(`${API_ENDPOINT}check-symbols`, {
        symbols: sym,
      });

      let status = response?.data?.data.status;

      if (status === false) {
        if (isProcessing[sym]) {
          console.log(
            `[${sym}] Skipping profit management — already processing.`
          );
          continue;
        }
        isProcessing[sym] = true;

        const positions = await binance.futuresPositionRisk({ symbol: sym });
        const pos = positions.find((p) => p.symbol === sym);
        if (Math.abs(parseFloat(pos.positionAmt)) === 0) {
          console.log(`[${sym}] Position already closed. Skipping.`);
          continue;
        }

        const priceMap = await binance.futuresPrices();
        const currentPrice = parseFloat(priceMap[sym]);

        const tradeResponse = await axios.get(
          `${API_ENDPOINT}find-treads/${sym}`
        );
        const { found, tradeDetails } = tradeResponse.data?.data;

        if (found) {
          await manageProfitAndExit(sym, tradeDetails, currentPrice);
        }
      }
    } catch (err) {
      console.error(`Error with ${sym}:`, err.message);
    } finally {
      isProcessing[sym] = false;
    }
  }
}, 2500);

setInterval(async () => {
  for (const sym of symbols) {
    await checkOrders(sym);
  }
}, 3000);
