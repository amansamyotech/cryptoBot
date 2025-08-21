const Binance = require("node-binance-api");
const axios = require("axios");
const { TEMA } = require("technicalindicators");
const { checkOrders } = require("./orderCheckFun");
const { decide25TEMA, calculateTEMA } = require("./decide25TEMAFullworking.js");
const isProcessing = {};

const API_ENDPOINT = "http://localhost:3001/api/buySell/";

const binance = new Binance().options({
  APIKEY: "whfiekZqKdkwa9fEeUupVdLZTNxBqP1OCEuH2pjyImaWt51FdpouPPrCawxbsupK",
  APISECRET: "E4IcteWOQ6r9qKrBZJoBy4R47nNPBDepVXMnS3Lf2Bz76dlu0QZCNh82beG2rHq4",
  useServerTime: true,
  test: false,
});

const symbols = ["SOLUSDT", "INJUSDT", "XRPUSDT", "ADAUSDT", "DOGEUSDT"];

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

const interval = "1m";
const LEVERAGE = 3;
const STOP_LOSS_ROI = -1.5;
const PROFIT_LOCK_ROI = 1.5;

async function getTEMAValues(symbol) {
  try {
    // Fetch historical klines (3-minute intervals)
    const klines = await binance.futuresCandles(symbol, "3m", { limit: 50 });

    // Extract closing prices
    const closes = klines.map((k) => parseFloat(k[4])); // k[4] = close price

    // Calculate TEMA 15 and TEMA 21 using your own function
    const tema15 = calculateTEMA(closes, 15);
    const tema21 = calculateTEMA(closes, 21);

    if (tema15.length === 0 || tema21.length === 0) {
      console.warn(`[${symbol}] Not enough data to calculate TEMA`);
      return null;
    }

    // Get the latest TEMA values
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

// Function to check for TEMA crossover
async function checkTEMACrossover(symbol, side) {
  try {
    const temaValues = await getTEMAValues(symbol);
    if (!temaValues) return false;

    const { tema15, tema21 } = temaValues;

    // For LONG positions: exit when TEMA15 crosses below TEMA21
    // For SHORT positions: exit when TEMA15 crosses above TEMA21
    if (side === "LONG") {
      return tema15 < tema21; // TEMA15 below TEMA21 - bearish crossover
    } else if (side === "SHORT") {
      return tema15 > tema21; // TEMA15 above TEMA21 - bullish crossover
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

// Function to close position manually (market order)
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
      // Close long position with market sell
      closeOrder = await binance.futuresMarketSell(symbol, qtyFixed, {
        reduceOnly: true,
      });
    } else if (side === "SHORT") {
      // Close short position with market buy
      closeOrder = await binance.futuresMarketBuy(symbol, qtyFixed, {
        reduceOnly: true,
      });
    }

    console.log(
      `[${symbol}] Position closed via TEMA crossover: ${closeOrder.orderId}`
    );

    // Update database to mark trade as closed
    await axios.put(`${API_ENDPOINT}${objectId}`, {
      data: {
        isClosed: true,
        closeReason: "TEMA_CROSSOVER",
        closeOrderId: closeOrder.orderId,
      },
    });

    return true;
  } catch (error) {
    console.error(`Error closing position for ${symbol}:`, error.message);
    return false;
  }
}

// Modified function to handle profit locking and TEMA crossover monitoring
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

    console.log(`[${symbol}] ${side} ROI: ${roi.toFixed(2)}%`);

    // Check if ROI > 1% and profits haven't been locked yet
    if (roi > PROFIT_LOCK_ROI && !isProfit) {
      await lockProfitsAtROI(symbol, tradeDetails, entryPrice, currentPrice);
      return;
    }

    // If profits are already locked (isProfit = true), monitor for TEMA crossover
    if (isProfit) {
      const shouldExit = await checkTEMACrossover(symbol, side);
      if (shouldExit) {
        console.log(`[${symbol}] TEMA crossover detected - closing position`);

        // Cancel existing stop loss orders first
        const data = await cancelExistingStopOrders(symbol);
        console.log("cancelExistingStopOrders", data);

        // Close position with market order
        const data2 = await closePosition(symbol, tradeDetails);
        console.log("cancelExistingStopOrders", data2);
      }
    }
  } catch (err) {
    console.error(`[${symbol}] Error in manageProfitAndExit:`, err.message);
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
    // const targetPnL = (PROFIT_LOCK_ROI / 100) * margin;
    const targetPnL = (1 / 100) * margin;
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
    await axios.put(`${API_ENDPOINT}${objectId}`, {
      data: {
        stopLossPrice: newStopPrice,
        stopLossOrderId: stopLossOrder.orderId,
        isProfit: true,
        profitLockROI: PROFIT_LOCK_ROI,
      },
    });
  } catch (error) {
    console.error(`[${symbol}] Error locking profits:`, error.message);
  }
}

// Helper function to cancel existing stop orders
async function cancelExistingStopOrders(symbol) {
  try {
    const openOrders = await binance.futuresOpenOrders(symbol);

    for (const order of openOrders) {
      if (order.type === "STOP_MARKET" && order.reduceOnly) {
        try {
          await binance.futuresCancel(symbol, order.orderId);
          console.log(`[${symbol}] Canceled stop order: ${order.orderId}`);
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
  } catch (error) {
    console.warn(
      `[${symbol}] Failed to fetch/cancel stop orders: ${error.message}`
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
      isProfit: false, // Initially false until +1% ROI is reached
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
      isProfit: false, // Initially false until +1% ROI is reached
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

  if (decision === "LONG") {
    await placeBuyOrder(symbol, maxSpendPerTrade);
  } else if (decision === "SHORT") {
    await placeShortOrder(symbol, maxSpendPerTrade);
  } else {
    console.log(`No trade signal for ${symbol}`);
  }
}

// Main trading interval
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
}, 4500);

// Order checking interval
setInterval(async () => {
  for (const sym of symbols) {
    await checkOrders(sym);
  }
}, 2000);

// Profit management and exit monitoring interval
setInterval(async () => {
  for (const sym of symbols) {
    try {
      const response = await axios.post(`${API_ENDPOINT}check-symbols`, {
        symbols: sym,
      });

      let status = response?.data?.data.status;

      if (status === false) {
        // Trade is open
        if (isProcessing[sym]) {
          console.log(
            `[${sym}] Skipping profit management — already processing.`
          );
          continue;
        }
        isProcessing[sym] = true;

        // Confirm position is still open
        const positions = await binance.futuresPositionRisk({ symbol: sym });
        const pos = positions.find((p) => p.symbol === sym);
        if (Math.abs(parseFloat(pos.positionAmt)) === 0) {
          console.log(`[${sym}] Position already closed. Skipping.`);
          continue;
        }

        // Get current price and trade details
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
}, 1000);
