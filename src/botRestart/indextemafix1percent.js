const Binance = require("node-binance-api");
const axios = require("axios");
const { decide25TEMA } = require("./decide25TEMA");
const { getUsdtBalance } = require("./helper/getBalance");
const { checkOrders } = require("./checkOrderFun2");
const { getCandles } = require("./helper/getCandles");
const isProcessing = {};

const API_ENDPOINT = "http://localhost:3000/api/buySell/";

const binance = new Binance().options({
  APIKEY: "tPCOyhkpaVUj6it6BiKQje0WxcJjUOV30EQ7dY2FMcqXunm9DwC8xmuiCkgsyfdG",
  APISECRET: "UpK4CPfKywFrAJDInCAXPmWVSiSs5xVVL2nDes8igCONl3cVgowDjMbQg64fm5pr",
  useServerTime: true,
  test: false,
});

const symbols = ["SOLUSDT", "INJUSDT", "XRPUSDT", "DOGEUSDT"];

function calculateTEMA(prices, period) {
  if (!prices || prices.length < period) {
    console.warn(
      `Not enough data points for TEMA calculation. Need: ${period}, Have: ${prices.length}`
    );
    return [];
  }

  const k = 2 / (period + 1);
  const ema1 = [];
  const ema2 = [];
  const ema3 = [];

  // Calculate first EMA
  ema1[0] = prices[0];
  for (let i = 1; i < prices.length; i++) {
    ema1[i] = prices[i] * k + ema1[i - 1] * (1 - k);
  }

  // Calculate second EMA (EMA of EMA1)
  ema2[0] = ema1[0];
  for (let i = 1; i < ema1.length; i++) {
    ema2[i] = ema1[i] * k + ema2[i - 1] * (1 - k);
  }

  // Calculate third EMA (EMA of EMA2)
  ema3[0] = ema2[0];
  for (let i = 1; i < ema2.length; i++) {
    ema3[i] = ema2[i] * k + ema3[i - 1] * (1 - k);
  }

  // Calculate TEMA
  const tema = [];
  for (let i = 0; i < prices.length; i++) {
    tema[i] = 3 * ema1[i] - 3 * ema2[i] + ema3[i];
  }

  return tema;
}
const interval = "1m";
const LEVERAGE = 3;
const STOP_LOSS_ROI = -1.5;
const PROFIT_TRIGGER_ROI = 2;
const PROFIT_LOCK_ROI = 1.5;

// Function to check for TEMA crossover
async function checkTEMACrossover(symbol, side) {
  try {
    // Get current and previous TEMA values to detect crossover
    const candles = await getCandles(symbol, "1m", 1000);
    const closes = candles.map((k) => parseFloat(k.close));
    const tema15 = calculateTEMA(closes, 15);
    const tema21 = calculateTEMA(closes, 21);

    if (tema15.length < 2 || tema21.length < 2) {
      console.warn(`[${symbol}] Not enough data to calculate TEMA crossover`);
      return false;
    }

    // Current values
    const currentTEMA15 = tema15[tema15.length - 1];
    const currentTEMA21 = tema21[tema21.length - 1];

    // Previous values (to detect crossover)
    const prevTEMA15 = tema15[tema15.length - 2];
    const prevTEMA21 = tema21[tema21.length - 2];

    console.log(
      `[${symbol}] Current TEMA15: ${currentTEMA15.toFixed(
        4
      )}, TEMA21: ${currentTEMA21.toFixed(4)}`
    );
    console.log(
      `[${symbol}] Previous TEMA15: ${prevTEMA15.toFixed(
        4
      )}, TEMA21: ${prevTEMA21.toFixed(4)}`
    );

    // For LONG positions: exit when TEMA15 crosses below TEMA21 (bearish crossover)
    if (side === "LONG") {
      const bearishCrossover = currentTEMA15 < currentTEMA21;
      console.log(
        `[${symbol}] LONG - Checking bearish crossover: ${bearishCrossover}`
      );
      return bearishCrossover;
    }
    // For SHORT positions: exit when TEMA15 crosses above TEMA21 (bullish crossover)
    else if (side === "SHORT") {
      const bullishCrossover = currentTEMA15 > currentTEMA21;
      console.log(
        `[${symbol}] SHORT - Checking bullish crossover: ${bullishCrossover}`
      );
      return bullishCrossover;
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

    // Update database to mark trade as closed
    await axios.put(`${API_ENDPOINT}${objectId}`, {
      data: { status: "1" },
    });

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
      isProfit: false, // Initially false until +1.5% ROI is reached
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
      isProfit: false, // Initially false until +1.5% ROI is reached
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
  const usableBalance = totalBalance - 4;
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
}, 6000);

// Order checking interval
setInterval(async () => {
  for (const sym of symbols) {
    await checkOrders(sym);
  }
}, 4000);

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
}, 3000);
