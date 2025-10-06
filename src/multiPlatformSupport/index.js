const Binance = require("node-binance-api");
const axios = require("axios");
const { checkOrders } = require("../bot2/checkOrderForIndexRebuild");
// const { getRSIStrategySignal } = require("./dualRSI");
const {
  getBalance,
  getPrice,
  placeOrder,
  getPositions,
  cancelAllOrders,
  getCandles,
  exchange,
} = require("./exchanges/ccxtClient");

const binance = new Binance().options({
  APIKEY: "0kB82SnxRkon7oDJqmCPykl4ar0afRYrScffMnRA3kTR8Qfq986IBwjqNA7fIauI",
  APISECRET: "6TWxLtkLDaCfDh4j4YcLa2WLS99zkZtaQjJnsAeGAtixHIDXjPdJAta5BJxNWrZV",
  useServerTime: true,
  test: false,
});

const isProcessing = {};

const API_ENDPOINT = "http://localhost:3001/api/buySell/";

const symbols = ["DOGEUSDT"];

const LEVERAGE = 3;
const ATR_LENGTH = 14;
const ATR_MULTIPLIER_SL = 2.0;
const ATR_MULTIPLIER_TP = 2.5;

function calculateATR(candles, length = ATR_LENGTH) {
  if (candles.length < length + 1) return null;

  const trueRanges = [];

  for (let i = 1; i < candles.length; i++) {
    const high = candles[i].high;
    const low = candles[i].low;
    const prevClose = candles[i - 1].close;

    const tr1 = high - low;
    const tr2 = Math.abs(high - prevClose);
    const tr3 = Math.abs(low - prevClose);

    trueRanges.push(Math.max(tr1, tr2, tr3));
  }

  if (trueRanges.length < length) return null;

  let atr = trueRanges.slice(0, length).reduce((a, b) => a + b, 0) / length;

  const multiplier = 2 / (length + 1);
  for (let i = length; i < trueRanges.length; i++) {
    atr = trueRanges[i] * multiplier + atr * (1 - multiplier);
  }

  return atr;
}

async function getATR(symbol, length = ATR_LENGTH) {
  try {
    const candles = await getCandles(symbol, "5m", length + 20);
    return calculateATR(candles, length);
  } catch (err) {
    console.error(`Error calculating ATR for ${symbol}:`, err.message);
    return null;
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

    const price = await getPrice(symbol);
    const entryPrice = parseFloat(price);
    const positionValue = marginAmount * LEVERAGE;
    const quantity = parseFloat((positionValue / entryPrice).toFixed(6));

    const exchangeInfo = await binance.futuresExchangeInfo();
    const symbolInfo = exchangeInfo.symbols.find((s) => s.symbol === symbol);
    const pricePrecision = symbolInfo.pricePrecision;
    const quantityPrecision = symbolInfo.quantityPrecision;

    const qtyFixed = quantity.toFixed(quantityPrecision);
    const atr = await getATR(symbol, ATR_LENGTH);
    if (!atr) {
      throw new Error(`Could not calculate ATR for ${symbol}`);
    }

    const stopLossPrice = parseFloat(
      (entryPrice - atr * ATR_MULTIPLIER_SL).toFixed(pricePrecision)
    );
    const takeProfitPrice = parseFloat(
      (entryPrice + atr * ATR_MULTIPLIER_TP).toFixed(pricePrecision)
    );

    console.log(
      `SL/TP prices for LONG: SL=${stopLossPrice}, TP=${takeProfitPrice}`
    );
    const buyOrder = await placeOrder("LONG", symbol, qtyFixed, LEVERAGE);
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
    console.log(`stopLossOrder.orderId`, stopLossOrder.orderId);
    const takeProfitOrder = await binance.futuresOrder(
      "TAKE_PROFIT_MARKET",
      "SELL",
      symbol,
      qtyFixed,
      null,
      {
        stopPrice: takeProfitPrice,
        reduceOnly: true,
        timeInForce: "GTC",
      }
    );

    const details = {
      stopLossPrice: stopLossPrice,
      stopLossOrderId: stopLossOrder.orderId,
      takeProfitPrice: takeProfitPrice,
      takeProfitOrderId: takeProfitOrder.orderId,
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

    const price = await getPrice(symbol);
    const entryPrice = parseFloat(price);
    const positionValue = marginAmount * LEVERAGE;
    const quantity = parseFloat((positionValue / entryPrice).toFixed(6));

    const exchangeInfo = await binance.futuresExchangeInfo();
    const symbolInfo = exchangeInfo.symbols.find((s) => s.symbol === symbol);
    const pricePrecision = symbolInfo.pricePrecision;
    const quantityPrecision = symbolInfo.quantityPrecision;

    const qtyFixed = quantity.toFixed(quantityPrecision);

    const atr = await getATR(symbol, ATR_LENGTH);
    if (!atr) {
      throw new Error(`Could not calculate ATR for ${symbol}`);
    }

    const stopLossPrice = parseFloat(
      (entryPrice + atr * ATR_MULTIPLIER_SL).toFixed(pricePrecision)
    );
    const takeProfitPrice = parseFloat(
      (entryPrice - atr * ATR_MULTIPLIER_TP).toFixed(pricePrecision)
    );
    console.log(
      `SL/TP prices for SHORT: SL=${stopLossPrice}, TP=${takeProfitPrice}`
    );

    console.log(`entryPrice`, entryPrice);
    console.log(`stopLossPrice`, stopLossPrice);

    console.log(`SHORT Order Details for ${symbol}:`);
    console.log(`Entry Price: ${entryPrice}`);
    console.log(`Quantity: ${qtyFixed}`);
    console.log(`Margin Used: ${marginAmount}`);
    console.log(`Position Value: ${positionValue} (${LEVERAGE}x leverage)`);

    const shortOrder = await placeOrder("SHORT", symbol, qtyFixed, LEVERAGE);
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
    const takeProfitOrder = await binance.futuresOrder(
      "TAKE_PROFIT_MARKET",
      "BUY",
      symbol,
      qtyFixed,
      null,
      {
        stopPrice: takeProfitPrice,
        reduceOnly: true,
        timeInForce: "GTC",
      }
    );
    console.log(
      `Take Profit set at ${takeProfitPrice} for ${symbol} (ATR-based)`
    );

    const details = {
      stopLossPrice: stopLossPrice,
      stopLossOrderId: stopLossOrder.orderId,
      takeProfitPrice: takeProfitPrice,
      takeProfitOrderId: takeProfitOrder.orderId,
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
  //   const decision = await getRSIStrategySignal(symbol);
  const decision = "LONG";
  console.log("decision", decision);

  if (decision === "LONG") {
    await placeBuyOrder(symbol, maxSpendPerTrade);
  } else if (decision === "SHORT") {
    await placeShortOrder(symbol, maxSpendPerTrade);
  } else {
    console.log(`No trade signal for ${symbol}`);
  }
}

setInterval(async () => {
  const totalBalance = await getBalance();
  const usableBalance = totalBalance - 1;
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
        if (isProcessing[sym]) {
          console.log(`[${sym}] Skipping trailing — already processing.`);
          continue;
        }
        isProcessing[sym] = true;

        const positions = await getPositions(sym);
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
            try {
              const res = await cancelAllOrders(sym);
              console.log(`✅ All open orders cancelled for ${sym}`, res);
            } catch (e) {
              console.log(
                `⚠️ Failed to cancel all orders for ${sym}:`,
                e.body || e.message
              );
            }
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
        }
      }
    } catch (err) {
      console.error(`Error with ${sym}:`, err.message);
    } finally {
      isProcessing[sym] = false;
    }
  }
}, 5000);
