const Binance = require("node-binance-api");
const axios = require("axios");
const { checkOrders } = require("./orderCheck2Fun");
const { hasNewCandleFormed } = require("./indexCrossTema");
const { checkTEMAEntry } = require("./checkTEMAlogicForEntry");
const { getCandles } = require("./helper/getCandles");
const { isSidewaysMarket } = require("./decide25TEMAFullworking");
const isProcessing = {};
const lastTradeSide = {};

const API_ENDPOINT = "http://localhost:3001/api/buySell/";

const binance = new Binance().options({
  APIKEY: "0kB82SnxRkon7oDJqmCPykl4ar0afRYrScffMnRA3kTR8Qfq986IBwjqNA7fIauI",
  APISECRET: "6TWxLtkLDaCfDh4j4YcLa2WLS99zkZtaQjJnsAeGAtixHIDXjPdJAta5BJxNWrZV",
  useServerTime: true,
  test: false,
});

const symbols = ["DOGEUSDT", "SOLUSDT"];

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

const LEVERAGE = 3;
const STOP_LOSS_ROI = -3; // Changed from -2 to -3
const TRAILING_START_ROI = 1; // Changed from 3 to 1
const INITIAL_TRAILING_ROI = 1;
const ROI_STEP = 1;

async function checkTEMAExit(symbol, tradeDetails) {
  try {
    const { side } = tradeDetails;

    // Get current TEMA signal (opposite of entry)
    const currentSignal = await checkTEMAEntry(symbol);

    // For LONG position - exit if TEMA gives SHORT signal
    if (side === "LONG" && currentSignal === "SHORT") {
      console.log(
        `[${symbol}] LONG Exit: TEMA crossed down. Closing position before stop loss.`
      );
      return true;
    }

    // For SHORT position - exit if TEMA gives LONG signal
    if (side === "SHORT" && currentSignal === "LONG") {
      console.log(
        `[${symbol}] SHORT Exit: TEMA crossed up. Closing position before stop loss.`
      );
      return true;
    }

    return false;
  } catch (err) {
    console.error(`[${symbol}] Error checking TEMA exit:`, err.message);
    return false;
  }
}

async function executeTEMAExit(symbol, tradeDetails) {
  try {
    const { quantity, objectId, stopLossOrderId } = tradeDetails;
    const side = tradeDetails.side;

    // Cancel existing stop loss order first
    if (stopLossOrderId) {
      try {
        await binance.futuresCancel(symbol, stopLossOrderId);
        console.log(`[${symbol}] Canceled stop loss order: ${stopLossOrderId}`);
      } catch (err) {
        if (err.code !== -2011 && err.code !== -1102) {
          console.warn(
            `[${symbol}] Failed to cancel stop loss: ${err.message}`
          );
        }
      }
    }

    // Close position with market order
    const exchangeInfo = await binance.futuresExchangeInfo();
    const symbolInfo = exchangeInfo.symbols.find((s) => s.symbol === symbol);
    const quantityPrecision = symbolInfo.quantityPrecision;
    const qtyFixed = parseFloat(quantity).toFixed(quantityPrecision);

    let exitOrder;
    if (side === "LONG") {
      exitOrder = await binance.futuresMarketSell(symbol, qtyFixed, {
        reduceOnly: true,
      });
    } else {
      exitOrder = await binance.futuresMarketBuy(symbol, qtyFixed, {
        reduceOnly: true,
      });
    }

    console.log(
      `[${symbol}] TEMA Exit executed - Order ID: ${exitOrder.orderId}`
    );

    // Update database to mark trade as closed
    await axios.put(`${API_ENDPOINT}${objectId}`, {
      data: { status: "1" },
    });

    return true;
  } catch (err) {
    console.error(`[${symbol}] Error executing TEMA exit:`, err.message);
    return false;
  }
}

async function trailStopLossForLong(symbol, tradeDetails, currentPrice) {
  try {
    const {
      stopLossOrderId,
      objectId,
      LongTimeCoinPrice: { $numberDecimal: longTimePrice },
      quantity,
      stopLossPrice: oldStopLoss,
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

    if (roi >= TRAILING_START_ROI) {
      // Calculate new stop loss with 3% buffer from current price
      const bufferPnL = (3 / 100) * margin; // 3% buffer
      const newStop = parseFloat(
        (currentPrice - bufferPnL / qty).toFixed(pricePrecision)
      );

      const roundedCurrent = parseFloat(currentPrice.toFixed(pricePrecision));
      if (newStop >= roundedCurrent) {
        console.warn(
          `[${symbol}] Skipping SL update — newStop (${newStop}) >= currentPrice (${roundedCurrent})`
        );
        return;
      }

      console.log(`oldStop: ${oldStop}`);
      console.log(`roundedCurrent: ${roundedCurrent}`);
      console.log(`newStop: ${newStop}`);
      console.log(`bufferPnL: ${bufferPnL}`);
      console.log(`roi: ${roi}`);

      if (newStop > oldStop) {
        console.log(
          `[${symbol}] LONG ROI ${roi.toFixed(
            2
          )}% → Updating SL from ${oldStop} to ${newStop} (3% buffer from current price)`
        );

        // Cleanup existing STOP_MARKET SELL orders
        let openOrders;
        try {
          openOrders = await binance.futuresOpenOrders(symbol);
          console.log(
            `[${symbol}] Open orders before cleanup: ${openOrders.length}`
          );
          for (const order of openOrders) {
            if (
              order.type === "STOP_MARKET" &&
              order.side === "SELL" &&
              order.reduceOnly
            ) {
              console.log(
                `[${symbol}] Attempting to clean up order ${order.orderId}`
              );
              try {
                await binance.futuresCancel(symbol, order.orderId);
                console.log(
                  `[${symbol}] Cleaned up orphan STOP_MARKET order ${order.orderId}`
                );
              } catch (cancelErr) {
                if (cancelErr.code === -2011 || cancelErr.code === -1102) {
                  console.log(
                    `[${symbol}] Order ${order.orderId} already gone (${cancelErr.code}). Skipping.`
                  );
                } else {
                  console.warn(
                    `[${symbol}] Failed to clean up ${order.orderId}: ${cancelErr.message}`
                  );
                }
              }
            }
          }
        } catch (err) {
          console.warn(
            `[${symbol}] Failed to fetch open orders: ${err.message}`
          );
        }

        // Cancel old stop loss (if it exists)
        let orderExists = false;
        if (stopLossOrderId) {
          console.log(
            `[${symbol}] Checking status of old stop order ${stopLossOrderId}`
          );
          try {
            const order = await binance.futuresOrderStatus(symbol, {
              orderId: stopLossOrderId,
            });
            orderExists =
              order && order.status !== "CANCELED" && order.status !== "FILLED";
          } catch (err) {
            if (err.code === -2011 || err.code === -1102) {
              console.log(
                `[${symbol}] Old stop ${stopLossOrderId} already gone (${err.code}). Proceeding.`
              );
            } else {
              console.warn(
                `[${symbol}] Failed to fetch order ${stopLossOrderId}: ${err.message}`
              );
            }
          }

          if (orderExists) {
            console.log(
              `[${symbol}] Attempting to cancel old stop order ${stopLossOrderId}`
            );
            try {
              await binance.futuresCancel(symbol, stopLossOrderId);
              console.log(
                `[${symbol}] Canceled old stop order ${stopLossOrderId}`
              );
            } catch (err) {
              if (err.code === -2011 || err.code === -1102) {
                console.log(
                  `[${symbol}] Old stop ${stopLossOrderId} already gone (${err.code}). Proceeding.`
                );
              } else {
                console.warn(
                  `[${symbol}] Failed to cancel order ${stopLossOrderId}: ${err.message}`
                );
              }
            }
          }
        } else {
          console.warn(
            `[${symbol}] No stopLossOrderId provided. Skipping cancellation.`
          );
        }

        // Place new stop loss
        const tickSize = Math.pow(10, -pricePrecision);
        const buffer = tickSize * 5;
        const adjustedStop = parseFloat(
          (newStop - buffer).toFixed(pricePrecision)
        );
        console.log(`adjustedStop: ${adjustedStop}`);

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
          console.log(
            `[${symbol}] New stop order placed: ${stopLossOrder.orderId}`
          );
        } catch (placeErr) {
          if (placeErr.code === -4045) {
            console.warn(
              `[${symbol}] Hit max stop limit (-4045). Canceling all and retrying.`
            );
            await binance.futuresCancelAll(symbol);
            stopLossOrder = await binance.futuresOrder(
              "STOP_MARKET",
              "SELL",
              symbol,
              qtyFixed,
              null,
              { stopPrice: adjustedStop, reduceOnly: true, timeInForce: "GTC" }
            );
            console.log(
              `[${symbol}] Retry succeeded: New stop order ${stopLossOrder.orderId}`
            );
          } else if (placeErr.code === -2011 || placeErr.code === -1102) {
            console.warn(
              `[${symbol}] Place failed (${placeErr.code}). Skipping this update.`
            );
            return; // Don't update DB
          } else {
            throw placeErr; // Other errors bubble up
          }
        }

        // Update DB only if successful
        await axios.put(`${API_ENDPOINT}${objectId}`, {
          data: {
            stopLossPrice: newStop,
            stopLossOrderId: stopLossOrder.orderId,
            isProfit: true,
          },
        });
        console.log(`[${symbol}] LONG Stop Loss updated successfully.`);
      } else {
        console.log(
          `[${symbol}] LONG ROI ${roi.toFixed(2)}% — SL unchanged (${oldStop}).`
        );
      }
    } else {
      console.log(
        `[${symbol}] LONG ROI ${roi.toFixed(
          2
        )}% — Below ${TRAILING_START_ROI}%, no trailing yet.`
      );
    }
  } catch (err) {
    console.error(`[${symbol}] Error trailing LONG stop-loss:`, err.message);
  }
}

async function trailStopLossForShort(symbol, tradeDetails, currentPrice) {
  try {
    const {
      stopLossOrderId,
      objectId,
      ShortTimeCurrentPrice: { $numberDecimal: shortTimeCurrentPrice },
      quantity,
      stopLossPrice: oldStopLoss,
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

    if (roi >= TRAILING_START_ROI) {
      // Calculate new stop loss with 3% buffer from current price
      const bufferPnL = (3 / 100) * margin; // 3% buffer
      const newStop = parseFloat(
        (currentPrice + bufferPnL / qty).toFixed(pricePrecision)
      );

      const roundedStop = parseFloat(newStop.toFixed(pricePrecision));
      const roundedCurrent = parseFloat(currentPrice.toFixed(pricePrecision));

      if (roundedStop <= roundedCurrent) {
        console.warn(
          `[${symbol}] Skipping SL update — newStop (${roundedStop}) <= currentPrice (${roundedCurrent})`
        );
        return;
      }

      console.log(`oldStop: ${oldStop}`);
      console.log(`roundedStop: ${roundedStop}`);
      console.log(`roundedCurrent: ${roundedCurrent}`);
      console.log(`newStop: ${newStop}`);
      console.log(`bufferPnL: ${bufferPnL}`);
      console.log(`roi: ${roi}`);

      if (roundedStop < oldStop) {
        console.log(
          `[${symbol}] SHORT ROI ${roi.toFixed(
            2
          )}% → Updating SL from ${oldStop} to ${roundedStop} (3% buffer from current price)`
        );

        // Cleanup existing STOP_MARKET BUY orders
        let openOrders;
        try {
          openOrders = await binance.futuresOpenOrders(symbol);
          console.log(
            `[${symbol}] Open orders before cleanup: ${openOrders.length}`
          );
          for (const order of openOrders) {
            if (
              order.type === "STOP_MARKET" &&
              order.side === "BUY" &&
              order.reduceOnly
            ) {
              console.log(
                `[${symbol}] Attempting to clean up order ${order.orderId}`
              );
              try {
                await binance.futuresCancel(symbol, order.orderId);
                console.log(
                  `[${symbol}] Cleaned up orphan STOP_MARKET order ${order.orderId}`
                );
              } catch (cancelErr) {
                if (cancelErr.code === -2011 || cancelErr.code === -1102) {
                  console.log(
                    `[${symbol}] Order ${order.orderId} already gone (${cancelErr.code}). Skipping.`
                  );
                } else {
                  console.warn(
                    `[${symbol}] Failed to clean up ${order.orderId}: ${cancelErr.message}`
                  );
                }
              }
            }
          }
        } catch (err) {
          console.warn(
            `[${symbol}] Failed to fetch open orders: ${err.message}`
          );
        }

        // Cancel old stop loss (if it exists)
        let orderExists = false;
        if (stopLossOrderId) {
          console.log(
            `[${symbol}] Checking status of old stop order ${stopLossOrderId}`
          );
          try {
            const order = await binance.futuresOrderStatus(symbol, {
              orderId: stopLossOrderId,
            });
            orderExists =
              order && order.status !== "CANCELED" && order.status !== "FILLED";
          } catch (err) {
            if (err.code === -2011 || err.code === -1102) {
              console.log(
                `[${symbol}] Old stop ${stopLossOrderId} already gone (${err.code}). Proceeding.`
              );
            } else {
              console.warn(
                `[${symbol}] Failed to fetch order ${stopLossOrderId}: ${err.message}`
              );
            }
          }

          if (orderExists) {
            console.log(
              `[${symbol}] Attempting to cancel old stop order ${stopLossOrderId}`
            );
            try {
              await binance.futuresCancel(symbol, stopLossOrderId);
              console.log(
                `[${symbol}] Canceled old stop order ${stopLossOrderId}`
              );
            } catch (err) {
              if (err.code === -2011 || err.code === -1102) {
                console.log(
                  `[${symbol}] Old stop ${stopLossOrderId} already gone (${err.code}). Proceeding.`
                );
              } else {
                console.warn(
                  `[${symbol}] Failed to cancel order ${stopLossOrderId}: ${err.message}`
                );
              }
            }
          }
        } else {
          console.warn(
            `[${symbol}] No stopLossOrderId provided. Skipping cancellation.`
          );
        }

        // Place new stop loss
        const tickSize = Math.pow(10, -pricePrecision);
        const buffer = tickSize * 5;
        const adjustedStop = parseFloat(
          (roundedStop + buffer).toFixed(pricePrecision)
        );
        console.log(`adjustedStop: ${adjustedStop}`);

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
          console.log(
            `[${symbol}] New stop order placed: ${stopLossOrder.orderId}`
          );
        } catch (placeErr) {
          if (placeErr.code === -4045) {
            console.warn(
              `[${symbol}] Hit max stop limit (-4045). Canceling all and retrying.`
            );
            await binance.futuresCancelAll(symbol);
            stopLossOrder = await binance.futuresOrder(
              "STOP_MARKET",
              "BUY",
              symbol,
              qtyFixed,
              null,
              { stopPrice: adjustedStop, reduceOnly: true, timeInForce: "GTC" }
            );
            console.log(
              `[${symbol}] Retry succeeded: New stop order ${stopLossOrder.orderId}`
            );
          } else if (placeErr.code === -2011 || placeErr.code === -1102) {
            console.warn(
              `[${symbol}] Place failed (${placeErr.code}). Skipping this update.`
            );
            return; // Don't update DB
          } else {
            throw placeErr; // Other errors bubble up
          }
        }

        // Update DB only if successful
        await axios.put(`${API_ENDPOINT}${objectId}`, {
          data: {
            stopLossPrice: roundedStop,
            stopLossOrderId: stopLossOrder.orderId,
            isProfit: true,
          },
        });
        console.log(`[${symbol}] SHORT Stop Loss updated successfully.`);
      } else {
        console.log(
          `[${symbol}] SHORT ROI ${roi.toFixed(
            2
          )}% — SL unchanged (${oldStop}). New stop ${roundedStop} is not better than current.`
        );
      }
    } else {
      console.log(
        `[${symbol}] SHORT ROI ${roi.toFixed(
          2
        )}% — Below ${TRAILING_START_ROI}%, no trailing yet.`
      );
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
    console.error(
      `[${symbol}] Error in main trailing stop-loss function:`,
      err.message
    );
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

    lastTradeSide[symbol] = "LONG";
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

    lastTradeSide[symbol] = "SHORT";
  } catch (error) {
    console.error(`Error placing SHORT order for ${symbol}:`, error);
  }
}

async function processSymbol(symbol, maxSpendPerTrade) {
  const hasNewCandle = await hasNewCandleFormed(symbol, "entry");

  if (!hasNewCandle) {
    console.log(`[${symbol}] No new candle formed yet, skipping entry check`);
    return;
  }

  const candles = await getCandles(symbol, "3m", 1000);

  const decision = await checkTEMAEntry(symbol);
  console.log("decision", decision);

  const lastSide = lastTradeSide[symbol] || null;
  if (lastSide) {
    console.log(`[${symbol}] Last trade was: ${lastSide}`);

    if (lastSide === "LONG" && decision === "LONG") {
      console.log(`[${symbol}] Last trade was LONG, skipping LONG signal`);
      return;
    }

    if (lastSide === "SHORT" && decision === "SHORT") {
      console.log(`[${symbol}] Last trade was SHORT, skipping SHORT signal`);
      return;
    }
  } else {
    console.log(`[${symbol}] No previous trades, allowing any trade`);
  }

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
  const usableBalance = totalBalance - 6;
  const maxSpendPerTrade = usableBalance / symbols.length;

  console.log(`Total Balance: ${totalBalance} USDT`);
  console.log(`Usable Balance: ${usableBalance} USDT`);
  console.log(`Max Spend Per Trade: ${maxSpendPerTrade} USDT`);
  if (maxSpendPerTrade >= 1) {
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
}, 7000);

setInterval(async () => {
  for (const sym of symbols) {
    await checkOrders(sym);
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
        // Trade open (your logic: false means open trade)
        if (isProcessing[sym]) {
          console.log(`[${sym}] Skipping trailing — already processing.`);
          continue;
        }
        isProcessing[sym] = true;

        // Confirm position is open (sync with DB)
        const positions = await binance.futuresPositionRisk({ symbol: sym });
        const pos = positions.find((p) => p.symbol === sym);
        if (!pos || Math.abs(parseFloat(pos.positionAmt || 0)) === 0) {
          console.log(
            `[${sym}] Position already closed or doesn't exist. Updating DB to close trade.`
          );

          const tradeResponse = await axios.get(
            `${API_ENDPOINT}find-treads/${sym}`
          );
          const { found, tradeDetails } = tradeResponse.data?.data;

          if (found) {
            await axios.put(`${API_ENDPOINT}${tradeDetails._id}`, {
              data: { status: "1" },
            });
            console.log(`[${sym}] DB updated: Trade marked as closed.`);
          }
          continue;
        }

        const tradeResponse = await axios.get(
          `${API_ENDPOINT}find-treads/${sym}`
        );
        const { found, tradeDetails } = tradeResponse.data?.data;

        if (found) {
          const priceMap = await binance.futuresPrices();
          const currentPrice = parseFloat(priceMap[sym]);
          let roi = 0;

          if (tradeDetails.side === "LONG") {
            const entryPrice = parseFloat(
              tradeDetails.LongTimeCoinPrice.$numberDecimal
            );
            const qty = parseFloat(tradeDetails.quantity);
            const margin = parseFloat(tradeDetails.marginUsed);
            const pnl = (currentPrice - entryPrice) * qty;
            roi = (pnl / margin) * 100;
          } else if (tradeDetails.side === "SHORT") {
            const entryPrice = parseFloat(
              tradeDetails.ShortTimeCurrentPrice.$numberDecimal
            );
            const qty = parseFloat(tradeDetails.quantity);
            const margin = parseFloat(tradeDetails.marginUsed);
            const pnl = (entryPrice - currentPrice) * qty;
            roi = (pnl / margin) * 100;
          }

          // TEMA exit check sirf tab karo jab ROI 1% positive ho ya 1% negative ho
          if (roi >= 0.5 || roi <= -0.5) {
            const shouldExit = await checkTEMAExit(sym, tradeDetails);
            if (shouldExit) {
              const exitSuccess = await executeTEMAExit(sym, tradeDetails);
              if (exitSuccess) {
                console.log(
                  `[${sym}] Position closed due to TEMA exit signal at ROI: ${roi.toFixed(
                    2
                  )}%`
                );
                continue;
              }
            }
          }
          // **NAYA CODE KHATAM**
        }

        await trailStopLoss(sym);
      }
    } catch (err) {
      console.error(`Error with ${sym}:`, err.message);
    } finally {
      isProcessing[sym] = false;
    }
  }
}, 5000);
