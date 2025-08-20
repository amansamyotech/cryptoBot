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

const LEVERAGE = 3;
const ROI_PERCENT = 1.5; // Simple 1.5% ROI for both stop loss and take profit

function roundToTickSize(price, tickSize) {
  if (!tickSize || tickSize <= 0) return price;
  return Math.round(price / tickSize) * tickSize;
}

async function getSymbolInfo(symbol) {
  const exchangeInfo = await binance.futuresExchangeInfo();
  const symbolInfo = exchangeInfo.symbols.find((s) => s.symbol === symbol);

  const priceFilter = symbolInfo.filters.find(
    (f) => f.filterType === "PRICE_FILTER"
  );

  return {
    pricePrecision: symbolInfo.pricePrecision,
    quantityPrecision: symbolInfo.quantityPrecision,
    tickSize: parseFloat(priceFilter.tickSize),
  };
}

async function placeBuyOrder(symbol, marginAmount) {
  try {
    // Set margin type and leverage
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
          `[${symbol}] Margin type already ISOLATED or cannot be changed.`
        );
      }
    }
    await binance.futuresLeverage(symbol, LEVERAGE);

    // Get current price and calculate quantity
    const price = (await binance.futuresPrices())[symbol];
    const entryPrice = parseFloat(price);
    const positionValue = marginAmount * LEVERAGE;
    const quantity = positionValue / entryPrice;

    // Get symbol info
    const symbolInfo = await getSymbolInfo(symbol);
    const qtyFixed = quantity.toFixed(symbolInfo.quantityPrecision);

    // Calculate stop loss and take profit (simple 1.5% from entry price)
    let stopLossPrice = entryPrice * (1 - ROI_PERCENT / 100); // -1.5%
    let takeProfitPrice = entryPrice * (1 + ROI_PERCENT / 100); // +1.5%

    // Round to tick size
    stopLossPrice = roundToTickSize(stopLossPrice, symbolInfo.tickSize);
    takeProfitPrice = roundToTickSize(takeProfitPrice, symbolInfo.tickSize);

    // Fix precision
    stopLossPrice = parseFloat(
      stopLossPrice.toFixed(symbolInfo.pricePrecision)
    );
    takeProfitPrice = parseFloat(
      takeProfitPrice.toFixed(symbolInfo.pricePrecision)
    );

    console.log(`LONG Order for ${symbol}:`);
    console.log(
      `Entry: ${entryPrice} | Stop Loss: ${stopLossPrice} | Take Profit: ${takeProfitPrice}`
    );
    console.log(`Quantity: ${qtyFixed} | Margin: ${marginAmount} USDT`);

    // Place market buy order
    const buyOrder = await binance.futuresMarketBuy(symbol, qtyFixed);
    console.log(`✅ Bought ${symbol} at ${entryPrice}`);

    // Save to database
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

    const tradeResponse = await axios.post(API_ENDPOINT, {
      data: buyOrderDetails,
    });
    const tradeId = tradeResponse.data._id;

    // Place Stop Loss Order
    const stopLossOrder = await binance.futuresOrder(
      "STOP_MARKET",
      "SELL",
      symbol,
      qtyFixed,
      null,
      { stopPrice: stopLossPrice, reduceOnly: true, timeInForce: "GTC" }
    );
    console.log(`🛑 Stop Loss set at ${stopLossPrice} (-${ROI_PERCENT}%)`);

    // Place Take Profit Order
    const takeProfitOrder = await binance.futuresOrder(
      "LIMIT",
      "SELL",
      symbol,
      qtyFixed,
      takeProfitPrice,
      { reduceOnly: true, timeInForce: "GTC" }
    );
    console.log(`🎯 Take Profit set at ${takeProfitPrice} (+${ROI_PERCENT}%)`);

    // Update database with SL/TP details
    await axios.put(`${API_ENDPOINT}${tradeId}`, {
      data: {
        stopLossPrice: stopLossPrice,
        stopLossOrderId: stopLossOrder.orderId,
        takeProfitPrice: takeProfitPrice,
        takeProfitOrderId: takeProfitOrder.orderId,
      },
    });
  } catch (error) {
    console.error(`❌ Error placing LONG order for ${symbol}:`, error.message);
  }
}

async function placeShortOrder(symbol, marginAmount) {
  try {
    // Set margin type and leverage
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
          `[${symbol}] Margin type already ISOLATED or cannot be changed.`
        );
      }
    }
    await binance.futuresLeverage(symbol, LEVERAGE);

    // Get current price and calculate quantity
    const price = (await binance.futuresPrices())[symbol];
    const entryPrice = parseFloat(price);
    const positionValue = marginAmount * LEVERAGE;
    const quantity = positionValue / entryPrice;

    // Get symbol info
    const symbolInfo = await getSymbolInfo(symbol);
    const qtyFixed = quantity.toFixed(symbolInfo.quantityPrecision);

    // Calculate stop loss and take profit (simple 1.5% from entry price)
    let stopLossPrice = entryPrice * (1 + ROI_PERCENT / 100); // +1.5% (higher price for short)
    let takeProfitPrice = entryPrice * (1 - ROI_PERCENT / 100); // -1.5% (lower price for short)

    // Round to tick size
    stopLossPrice = roundToTickSize(stopLossPrice, symbolInfo.tickSize);
    takeProfitPrice = roundToTickSize(takeProfitPrice, symbolInfo.tickSize);

    // Fix precision
    stopLossPrice = parseFloat(
      stopLossPrice.toFixed(symbolInfo.pricePrecision)
    );
    takeProfitPrice = parseFloat(
      takeProfitPrice.toFixed(symbolInfo.pricePrecision)
    );

    console.log(`SHORT Order for ${symbol}:`);
    console.log(
      `Entry: ${entryPrice} | Stop Loss: ${stopLossPrice} | Take Profit: ${takeProfitPrice}`
    );
    console.log(`Quantity: ${qtyFixed} | Margin: ${marginAmount} USDT`);

    // Place market sell order
    const shortOrder = await binance.futuresMarketSell(symbol, qtyFixed);
    console.log(`✅ Shorted ${symbol} at ${entryPrice}`);

    // Save to database
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
    const tradeId = tradeResponse.data._id;

    // Place Stop Loss Order
    const stopLossOrder = await binance.futuresOrder(
      "STOP_MARKET",
      "BUY",
      symbol,
      qtyFixed,
      null,
      { stopPrice: stopLossPrice, reduceOnly: true, timeInForce: "GTC" }
    );
    console.log(`🛑 Stop Loss set at ${stopLossPrice} (-${ROI_PERCENT}%)`);

    // Place Take Profit Order
    const takeProfitOrder = await binance.futuresOrder(
      "LIMIT",
      "BUY",
      symbol,
      qtyFixed,
      takeProfitPrice,
      { reduceOnly: true, timeInForce: "GTC" }
    );
    console.log(`🎯 Take Profit set at ${takeProfitPrice} (+${ROI_PERCENT}%)`);

    // Update database with SL/TP details
    await axios.put(`${API_ENDPOINT}${tradeId}`, {
      data: {
        stopLossPrice: stopLossPrice,
        stopLossOrderId: stopLossOrder.orderId,
        takeProfitPrice: takeProfitPrice,
        takeProfitOrderId: takeProfitOrder.orderId,
      },
    });
  } catch (error) {
    console.error(`❌ Error placing SHORT order for ${symbol}:`, error.message);
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

// Main trading loop
setInterval(async () => {
  try {
    const totalBalance = await getUsdtBalance();
    const usableBalance = totalBalance - 5; // Reserve 5 USDT
    console.log(
      `💰 Total Balance: ${totalBalance} USDT | Usable: ${usableBalance} USDT`
    );

    // Get available symbols
    const availableSymbols = await getAvailableSymbols(symbols);
    if (availableSymbols.length === 0) {
      console.log("No symbols available for trading (all have open trades).");
      return;
    }

    // Calculate max spend per trade
    const maxSpendPerTrade = usableBalance / availableSymbols.length;
    console.log(`💵 Max Spend Per Trade: ${maxSpendPerTrade.toFixed(2)} USDT`);

    if (maxSpendPerTrade < 1.3) {
      console.log(`❌ Insufficient balance. Need at least 1.3 USDT per trade`);
      return;
    }

    // Process each symbol
    for (const sym of availableSymbols) {
      try {
        // Recheck balance
        const currentBalance = await getUsdtBalance();
        const currentUsableBalance = currentBalance - 5;
        if (currentUsableBalance < maxSpendPerTrade) {
          console.log(`❌ Insufficient balance for ${sym}`);
          continue;
        }

        // Recheck trade status
        const response = await axios.post(`${API_ENDPOINT}check-symbols`, {
          symbols: sym,
        });
        if (response?.data?.data.status === true) {
          await processSymbol(sym, maxSpendPerTrade);
        } else {
          console.log(`⏭️ ${sym} already has open trade, skipping`);
        }
      } catch (err) {
        console.error(`❌ Error processing ${sym}:`, err.message);
      }
    }
  } catch (err) {
    console.error("❌ Error in main trading loop:", err.message);
  }
}, 4000);

// Order check interval
setInterval(async () => {
  for (const sym of symbols) {
    await orderCheckFunForFix(sym);
  }
}, 6000);
