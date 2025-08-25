const Binance = require("node-binance-api");
const { checkOrders } = require("./orderUpdate.js");
const { decide25TEMA } = require("./helper/decision.js");
const { getUsdtBalance } = require("./helper/getBalance.js");
const { checkTEMACrossover } = require("./helper/checkTEMACrossover.js");
const TradeDetails = require("../backend/models/tradeDetails.js");

const {
  LEVERAGE,
  STOP_LOSS_ROI,
  PROFIT_TRIGGER_ROI,
  PROFIT_LOCK_ROI,
  symbols,
} = require("./config/const.js");
const { default: mongoose } = require("mongoose");
const isProcessing = {};

const binance = new Binance().options({
  APIKEY: "whfiekZqKdkwa9fEeUupVdLZTNxBqP1OCEuH2pjyImaWt51FdpouPPrCawxbsupK",
  APISECRET: "E4IcteWOQ6r9qKrBZJoBy4R47nNPBDepVXMnS3Lf2Bz76dlu0QZCNh82beG2rHq4",
  useServerTime: true,
  test: false,
});

const ENVUSERID = process.env.USER_ID || "68a5c721b414893e08247236";

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
      isProfit,
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

    console.log(
      `[${symbol}] ${side} ROI: ${roi.toFixed(2)}%, isProfit: ${isProfit}`
    );

    // Check if ROI > 2% and profits haven't been locked yet
    if (roi > PROFIT_TRIGGER_ROI && !isProfit) {
      console.log(
        `[${symbol}] Profit trigger reached at ${roi.toFixed(2)}% ROI`
      );
      await lockProfitsAtROI(symbol, tradeDetails, entryPrice, currentPrice);
      return;
    }

    // If profits are already locked (isProfit = true), monitor for TEMA crossover
    if (isProfit) {
      console.log(
        `[${symbol}] Monitoring for TEMA crossover exit (profits locked)`
      );
      const shouldExit = await checkTEMACrossover(symbol, side);

      if (shouldExit) {
        console.log(
          `[${symbol}] ⚡ TEMA crossover detected - CLOSING POSITION ⚡`
        );

        // Cancel existing stop loss orders first
        const cancelResult = await cancelExistingStopOrders(symbol);
        console.log(`[${symbol}] Cancel result:`, cancelResult);

        // Close position with market order
        const closeResult = await closePosition(symbol, tradeDetails);
        console.log(`[${symbol}] Close result:`, closeResult);

        if (closeResult) {
          console.log(
            `[${symbol}] ✅ Position successfully closed via TEMA crossover`
          );
        } else {
          console.error(`[${symbol}] ❌ Failed to close position`);
        }
      } else {
        console.log(`[${symbol}] No TEMA crossover detected yet`);
      }
    }
  } catch (err) {
    console.error(`[${symbol}] Error in manageProfitAndExit:`, err.message);
  }
}

async function closePosition(symbol, tradeDetails) {
  try {
    const { side, quantity, objectId } = tradeDetails;
    const qty = parseFloat(quantity);

    // Verify we still have an open position
    const positions = await binance.futuresPositionRisk({ symbol: symbol });
    const position = positions.find((p) => p.symbol === symbol);
    const positionSize = Math.abs(parseFloat(position.positionAmt));

    if (positionSize === 0) {
      console.log(`[${symbol}] No open position found - already closed`);
      return true; // Consider it successful if already closed
    }

    console.log(
      `[${symbol}] Current position size: ${positionSize}, Trade quantity: ${qty}`
    );

    const exchangeInfo = await binance.futuresExchangeInfo();
    const symbolInfo = exchangeInfo.symbols.find((s) => s.symbol === symbol);
    const quantityPrecision = symbolInfo.quantityPrecision;

    // Use the actual position size instead of stored quantity (in case of partial fills)
    const qtyToClose = Math.min(positionSize, qty).toFixed(quantityPrecision);

    let closeOrder;
    if (side === "LONG") {
      // Close long position with market sell
      closeOrder = await binance.futuresMarketSell(symbol, qtyToClose, {
        reduceOnly: true,
      });
    } else if (side === "SHORT") {
      // Close short position with market buy
      closeOrder = await binance.futuresMarketBuy(symbol, qtyToClose, {
        reduceOnly: true,
      });
    }

    console.log(
      `[${symbol}] Position closed via TEMA crossover - Order ID: ${closeOrder.orderId}`
    );

    await TradeDetails.findOneAndUpdate(
      { _id: objectId, createdBy: ENVUSERID },
      { status: "1" }
    );

    return true;
  } catch (error) {
    console.error(`[${symbol}] Error closing position:`, error.message);
    if (error.code === -2019) {
      console.log(`[${symbol}] Position already closed (margin insufficient)`);
      return true; // Consider successful if position is already closed
    }
    return false;
  }
}

// 5. IMPROVED CANCEL ORDERS FUNCTION
async function cancelExistingStopOrders(symbol) {
  try {
    const openOrders = await binance.futuresOpenOrders(symbol);
    let canceledCount = 0;

    for (const order of openOrders) {
      if (order.type === "STOP_MARKET" && order.reduceOnly) {
        try {
          await binance.futuresCancel(symbol, order.orderId);
          console.log(`[${symbol}] ✅ Canceled stop order: ${order.orderId}`);
          canceledCount++;
        } catch (cancelErr) {
          if (cancelErr.code === -2011 || cancelErr.code === -1102) {
            console.log(
              `[${symbol}] Stop order ${order.orderId} already executed/canceled`
            );
          } else {
            console.warn(
              `[${symbol}] Failed to cancel ${order.orderId}: ${cancelErr.message}`
            );
          }
        }
      }
    }

    return { success: true, canceledCount };
  } catch (error) {
    console.warn(
      `[${symbol}] Failed to fetch/cancel stop orders: ${error.message}`
    );
    return { success: false, error: error.message };
  }
}

// Function to lock profits at +1% ROI
async function lockProfitsAtROI(
  symbol,
  tradeDetails,
  entryPrice,
  currentPrice
) {
  try {
    const { stopLossOrderId, objectId, side, quantity, marginUsed } =
      tradeDetails;

    const margin = parseFloat(marginUsed);
    const qty = parseFloat(quantity);

    const exchangeInfo = await binance.futuresExchangeInfo();
    const symbolInfo = exchangeInfo.symbols.find((s) => s.symbol === symbol);
    const pricePrecision = symbolInfo.pricePrecision;
    const quantityPrecision = symbolInfo.quantityPrecision;
    const qtyFixed = qty.toFixed(quantityPrecision);

    // Calculate stop loss price for +1% ROI
    const targetPnL = (PROFIT_LOCK_ROI / 100) * margin;
    // const targetPnL = (1 / 100) * margin;
    let newStopPrice;

    if (side === "LONG") {
      newStopPrice = parseFloat(
        (entryPrice + targetPnL / qty).toFixed(pricePrecision)
      );
    } else {
      newStopPrice = parseFloat(
        (entryPrice - targetPnL / qty).toFixed(pricePrecision)
      );
    }

    console.log(
      `[${symbol}] Locking profits at +1% ROI - New stop: ${newStopPrice}`
    );

    // Cancel existing stop loss orders
    await cancelExistingStopOrders(symbol);

    // Place new profit-locking stop order
    const tickSize = Math.pow(10, -pricePrecision);
    const buffer = tickSize * 3;

    let adjustedStop, orderSide;
    if (side === "LONG") {
      adjustedStop = parseFloat(
        (newStopPrice - buffer).toFixed(pricePrecision)
      );
      orderSide = "SELL";
    } else {
      adjustedStop = parseFloat(
        (newStopPrice + buffer).toFixed(pricePrecision)
      );
      orderSide = "BUY";
    }

    const stopLossOrder = await binance.futuresOrder(
      "STOP_MARKET",
      orderSide,
      symbol,
      qtyFixed,
      null,
      { stopPrice: adjustedStop, reduceOnly: true, timeInForce: "GTC" }
    );

    console.log(
      `[${symbol}] Profit-locking stop order placed: ${stopLossOrder.orderId}`
    );

    // Update database
    await TradeDetails.findOneAndUpdate(
      { _id: objectId, createdBy: ENVUSERID },
      {
        stopLossPrice: newStopPrice,
        stopLossOrderId: stopLossOrder.orderId,
        isProfit: true,
        profitLockROI: PROFIT_LOCK_ROI,
      }
    );
  } catch (error) {
    console.error(`[${symbol}] Error locking profits:`, error.message);
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
      isProfit: false,
      createdBy: ENVUSERID,
    };

    console.log(`buyOrderDetails`, buyOrderDetails);

    const createdTrade = await TradeDetails.create(buyOrderDetails);
    console.log(`Trade Created:`, createdTrade);
    const tradeId = createdTrade._id;

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
    await TradeDetails.findOneAndUpdate(
      { _id: tradeId, createdBy: ENVUSERID },
      {
        $set: {
          stopLossPrice: stopLossPrice,
          stopLossOrderId: stopLossOrder.orderId,
        },
      }
    );
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
      isProfit: false,
      createdBy: ENVUSERID,
    };

    console.log(`shortOrderDetails`, shortOrderDetails);

    const createdTrade = await TradeDetails.create(buyOrderDetails);
    console.log(`Trade Created:`, createdTrade);
    const tradeId = createdTrade._id;

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

    await TradeDetails.findOneAndUpdate(
      { _id: tradeId, createdBy: ENVUSERID },
      {
        $set: {
          stopLossPrice: stopLossPrice,
          stopLossOrderId: stopLossOrder.orderId,
        },
      }
    );
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

// setInterval(async () => {
//   const totalBalance = await getUsdtBalance();
//   const usableBalance = totalBalance - 1;
//   const maxSpendPerTrade = usableBalance / symbols.length;

//   console.log(`Total Balance: ${totalBalance} USDT`);
//   console.log(`Usable Balance: ${usableBalance} USDT`);
//   console.log(`Max Spend Per Trade: ${maxSpendPerTrade} USDT`);
//   if (maxSpendPerTrade >= 1.6) {
//     for (const sym of symbols) {
//       try {
//         const trades = await TradeDetails.find({
//           symbol: sym,
//           status: "0",
//           createdBy: ENVUSERID,
//         });
//         console.log(`trades`, trades);

//         let status = trades.length;
//         if (!status) {
//           await processSymbol(sym, maxSpendPerTrade);
//         } else {
//           console.log(`TRADE ALREADY OPEN FOR SYMBOL: ${sym}`);
//         }
//       } catch (err) {
//         console.error(`Error with ${sym}:`, err.message);
//       }
//     }
//   } else {
//     console.log("not enough amount");
//   }
// }, 6000);

// setInterval(async () => {
//   for (const sym of symbols) {
//     await checkOrders(sym);
//   }
// }, 4000);

// setInterval(async () => {
//   for (const sym of symbols) {
//     try {
//       const trades = await TradeDetails.find({
//         symbol: sym,
//         status: "0",
//         createdBy: ENVUSERID,
//       });

//       let status = trades.length;

//       if (status) {
//         // Trade is open
//         if (isProcessing[sym]) {
//           console.log(
//             `[${sym}] Skipping profit management — already processing.`
//           );
//           continue;
//         }
//         isProcessing[sym] = true;

//         // Confirm position is still open
//         const positions = await binance.futuresPositionRisk({ symbol: sym });
//         const pos = positions.find((p) => p.symbol === sym);
//         if (Math.abs(parseFloat(pos.positionAmt)) === 0) {
//           console.log(`[${sym}] Position already closed. Skipping.`);
//           continue;
//         }

//         // Get current price and trade details
//         const priceMap = await binance.futuresPrices();
//         const currentPrice = parseFloat(priceMap[sym]);

//         const tradeResponse = await TradeDetails.find({
//           symbol: sym,
//           status: "0",
//           createdBy: ENVUSERID,
//         });

//         if (tradeResponse.length) {
//           await manageProfitAndExit(sym, tradeResponse, currentPrice);
//         }
//       }
//     } catch (err) {
//       console.error(`Error with ${sym}:`, err.message);
//     } finally {
//       isProcessing[sym] = false;
//     }
//   }
// }, 3000);

async function createTrade() {
  try {
    await TradeDetails.create({
      symbol: "BTCUSDT",
      side: "LONG",
      placeOrderId: "1234567890",
      quantity: "0.01",
      LongTimeCoinPrice: mongoose.Types.Decimal128.fromString("30000.50"),
      stopLossPrice: "29500.00",
      isProfit: false,
      stopLossCancelled: false,
      isBreakevenSet: false,
      stopLossOrderId: "9876543210",
      takeProfitOrderId: "1122334455",
      takeProfitPrice: "31000.00",
      leverage: "10",
      marginUsed: "100",
      profitOrderId: "5566778899",
      ShortTimeCurrentPrice: mongoose.Types.Decimal128.fromString("0"),
      status: "0",
      createdBy: new mongoose.Types.ObjectId("68a5c721b414893e08247236"),
    });
    console.log("Trade inserted successfully!");
  } catch (err) {
    console.error("Insertion error:", err);
  }
}

mongoose.connection.once('open', () => {
    console.log(`hii`);
    
  createTrade();

  console.log(`MongoDB connected!`);
});

