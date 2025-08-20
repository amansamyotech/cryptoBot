const Binance = require("node-binance-api");
const axios = require("axios");

const { orderCheckFunForFix } = require("./orderCheckFunForFix");
const { getUsdtBalance } = require("./helper/getBalance");
const { symbols } = require("./constent");
const { decide25TemaFIx } = require("./decide25TemaFIx");

const API_ENDPOINT = "http://localhost:3000/api/buySell/";

const binance = new Binance().options({
  APIKEY: "tPCOyhkpaVUj6it6BiKQje0WxcJjUOV30EQ7dY2FMcqXunm9DwC8xmuiCkgsyfdG",
  APISECRET: "UpK4CPfKywFrAJDInCAXPmWVSiSs5xVVL2nDes8igCONl3cVgowDjMbQg64fm5pr",
  useServerTime: true,
  test: false,
});

const interval = "1m";
const LEVERAGE = 3;
const STOP_LOSS_ROI = -1.5;
const TAKE_PROFIT_ROI = 2;

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

    const takeProfitPnL = (TAKE_PROFIT_ROI / 100) * marginAmount;
    const takeProfitPrice = parseFloat(
      (entryPrice + takeProfitPnL / quantity).toFixed(pricePrecision)
    );

    console.log(`LONG Order Details for ${symbol}:`);
    console.log(`Entry Price: ${entryPrice}`);
    console.log(`Quantity: ${qtyFixed}`);
    console.log(`Margin Used: ${marginAmount}`);
    console.log(`Position Value: ${positionValue} (${LEVERAGE}x leverage)`);
    console.log(`Stop Loss Price: ${stopLossPrice} (${STOP_LOSS_ROI}% ROI)`);
    console.log(
      `Take Profit Price: ${takeProfitPrice} (+${TAKE_PROFIT_ROI}% ROI)`
    );

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

    // Place Stop Loss Order
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

    // Place Take Profit Order
    const takeProfitOrder = await binance.futuresOrder(
      "LIMIT",
      "SELL",
      symbol,
      qtyFixed,
      takeProfitPrice,
      {
        reduceOnly: true,
        timeInForce: "GTC",
      }
    );
    console.log(
      `Take Profit set at ${takeProfitPrice} for ${symbol} (+${TAKE_PROFIT_ROI}% ROI)`
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

    const price = (await binance.futuresPrices())[symbol];
    const entryPrice = parseFloat(price);
    const positionValue = marginAmount * LEVERAGE;
    const quantity = parseFloat((positionValue / entryPrice).toFixed(6));

    const exchangeInfo = await binance.futuresExchangeInfo();
    const symbolInfo = exchangeInfo.symbols.find((s) => s.symbol === symbol);
    const pricePrecision = symbolInfo.pricePrecision;
    const quantityPrecision = symbolInfo.quantityPrecision;
    const tickSize = parseFloat(
      symbolInfo.filters.find((f) => f.filterType === "PRICE_FILTER").tickSize
    );
    const qtyFixed = quantity.toFixed(quantityPrecision);

    const stopLossPnL = (STOP_LOSS_ROI / 100) * marginAmount;
    let stopLossPrice = entryPrice - stopLossPnL / quantity;
    stopLossPrice = parseFloat(
      roundToTickSize(stopLossPrice, tickSize).toFixed(pricePrecision)
    );

    const takeProfitPnL = (TAKE_PROFIT_ROI / 100) * marginAmount;
    let takeProfitPrice = entryPrice - takeProfitPnL / quantity;
    takeProfitPrice = parseFloat(
      roundToTickSize(takeProfitPrice, tickSize).toFixed(pricePrecision)
    );

    console.log(`SHORT Order Details for ${symbol}:`);
    console.log(`Entry Price: ${entryPrice}`);
    console.log(`Quantity: ${qtyFixed}`);
    console.log(`Margin Used: ${marginAmount}`);
    console.log(`Position Value: ${positionValue} (${LEVERAGE}x leverage)`);
    console.log(`Stop Loss Price: ${stopLossPrice} (${STOP_LOSS_ROI}% ROI)`);
    console.log(
      `Take Profit Price: ${takeProfitPrice} (+${TAKE_PROFIT_ROI}% ROI)`
    );

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

    const tradeResponse = await axios.post(API_ENDPOINT, {
      data: shortOrderDetails,
    });
    console.log(`Trade Response:`, tradeResponse?.data);

    const tradeId = tradeResponse.data._id;

    // Place Stop Loss Order
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

    // Place Take Profit Order
    const takeProfitOrder = await binance.futuresOrder(
      "LIMIT",
      "BUY",
      symbol,
      qtyFixed,
      takeProfitPrice,
      {
        reduceOnly: true,
        timeInForce: "GTC",
      }
    );
    console.log(
      `Take Profit set at ${takeProfitPrice} for ${symbol} (+${TAKE_PROFIT_ROI}% ROI)`
    );

    const details = {
      stopLossPrice: stopLossPrice,
      stopLossOrderId: stopLossOrder.orderId,
      takeProfitPrice: takeProfitPrice,
      takeProfitOrderId: takeProfitOrder.orderId,
    };

    await axios.put(`${API_ENDPOINT}${tradeId}`, {
      data: details,
    });
  } catch (error) {
    console.error(`Error placing SHORT order for ${symbol}:`, error);
  }
}
async function processSymbol(symbol, maxSpendPerTrade) {
  const decision = await decide25TemaFIx(symbol);

  if (decision === "LONG") {
    await placeBuyOrder(symbol, maxSpendPerTrade);
  } else if (decision === "SHORT") {
    await placeShortOrder(symbol, maxSpendPerTrade);
  } else {
    console.log(`No trade signal for ${symbol}`);
  }
}

async function getAvailableSymbols(symbols) {
  const availableSymbols = [];
  for (const sym of symbols) {
    try {
      const response = await axios.post(`${API_ENDPOINT}check-symbols`, {
        symbols: sym,
      });
      const status = response?.data?.data.status;
      if (status === true) {
        availableSymbols.push(sym);
      } else {
        console.log(`TRADE ALREADY OPEN FOR SYMBOL: ${sym}`);
      }
    } catch (err) {
      console.error(`Error checking status for ${sym}:`, err.message);
    }
  }
  return availableSymbols;
}

setInterval(async () => {
  try {
    const totalBalance = await getUsdtBalance();
    const usableBalance = totalBalance - 5; // Reserve 6 USDT
    console.log(`Total Balance: ${totalBalance} USDT`);
    console.log(`Usable Balance: ${usableBalance} USDT`);

    // Get symbols without open trades
    const availableSymbols = await getAvailableSymbols(symbols);
    if (availableSymbols.length === 0) {
      console.log("No symbols available for trading (all have open trades).");
      return;
    }

    // Calculate max spend per trade based on available symbols
    const maxSpendPerTrade = usableBalance / availableSymbols.length;
    console.log(`Max Spend Per Trade: ${maxSpendPerTrade} USDT`);

    if (maxSpendPerTrade < 1.3) {
      console.log(
        `Insufficient balance for trading. Required per trade: ${1.3} USDT`
      );
      return;
    }

    // Process symbols sequentially
    for (const sym of availableSymbols) {
      try {
        // Recheck balance before each trade
        const currentBalance = await getUsdtBalance();
        const currentUsableBalance = currentBalance - 6;
        if (currentUsableBalance < maxSpendPerTrade) {
          console.log(
            `Insufficient balance for ${sym}. Available: ${currentUsableBalance} USDT`
          );
          continue;
        }

        // Recheck trade status to avoid race conditions
        const response = await axios.post(`${API_ENDPOINT}check-symbols`, {
          symbols: sym,
        });
        if (response?.data?.data.status === true) {
          await processSymbol(sym, maxSpendPerTrade);
        } else {
          console.log(`Trade opened for ${sym} during processing. Skipping.`);
        }
      } catch (err) {
        console.error(`Error processing ${sym}:`, err.message);
      }
    }
  } catch (err) {
    console.error("Error in main trading loop:", err.message);
  }
}, 4000); // Increased interval to 10 seconds to reduce overlap

// Keep the order check interval
setInterval(async () => {
  for (const sym of symbols) {
    await orderCheckFunForFix(sym);
  }
}, 6000);
