const Binance = require("node-binance-api");
const axios = require("axios");

const { orderCheckFunForFix } = require("./orderCheckFunForFix");
const { getUsdtBalance } = require("./helper/getBalance");
const { symbols } = require("./constent");
const { decide25TemaFIx } = require("./decide25TemaFIx");

const API_ENDPOINT = "http://localhost:3000/api/buySell/";

// Use environment variables for API keys
const binance = new Binance().options({
    APIKEY: "tPCOyhkpaVUj6it6BiKQje0WxcJjUOV30EQ7dY2FMcqXunm9DwC8xmuiCkgsyfdG",
  APISECRET: "UpK4CPfKywFrAJDInCAXPmWVSiSs5xVVL2nDes8igCONl3cVgowDjMbQg64fm5pr",
useServerTime: true,
  test: false,
});

const interval = "1m";
const LEVERAGE = 3;
const STOP_LOSS_ROI = -1.5; // -1.5% ROI on margin
const TAKE_PROFIT_ROI = 2; // +2% ROI on margin

function roundToTickSize(price, tickSize) {
  if (!tickSize || tickSize <= 0) return price;
  return Math.round(price / tickSize) * tickSize;
}

function roundToStepSize(quantity, stepSize) {
  if (!stepSize || stepSize <= 0) return quantity;
  return Math.floor(quantity / stepSize) * stepSize;
}

async function getSymbolInfo(symbol) {
  const exchangeInfo = await binance.futuresExchangeInfo();
  const symbolInfo = exchangeInfo.symbols.find((s) => s.symbol === symbol);
  
  if (!symbolInfo) {
    throw new Error(`Symbol ${symbol} not found`);
  }
  
  const priceFilter = symbolInfo.filters.find((f) => f.filterType === "PRICE_FILTER");
  const lotSizeFilter = symbolInfo.filters.find((f) => f.filterType === "LOT_SIZE");
  const minNotionalFilter = symbolInfo.filters.find((f) => f.filterType === "MIN_NOTIONAL");
  
  return {
    pricePrecision: symbolInfo.pricePrecision,
    quantityPrecision: symbolInfo.quantityPrecision,
    tickSize: parseFloat(priceFilter.tickSize),
    stepSize: parseFloat(lotSizeFilter.stepSize),
    minNotional: minNotionalFilter ? parseFloat(minNotionalFilter.notional) : 5,
  };
}

// Correct ROI calculation for margin-based futures trading
function calculateStopLossAndTakeProfit(entryPrice, marginAmount, leverage, isLong) {
  // For ROI based on margin: 
  // PnL = (Exit Price - Entry Price) * Quantity
  // ROI = PnL / Margin * 100
  // Therefore: Exit Price = Entry Price + (ROI * Margin / Quantity / 100)
  
  const positionValue = marginAmount * leverage;
  const quantity = positionValue / entryPrice;
  
  // Calculate PnL needed for target ROI
  const stopLossPnL = (STOP_LOSS_ROI / 100) * marginAmount;
  const takeProfitPnL = (TAKE_PROFIT_ROI / 100) * marginAmount;
  
  let stopLossPrice, takeProfitPrice;
  
  if (isLong) {
    // For LONG positions:
    stopLossPrice = entryPrice + (stopLossPnL / quantity); // Will be lower than entry (negative PnL)
    takeProfitPrice = entryPrice + (takeProfitPnL / quantity); // Will be higher than entry (positive PnL)
  } else {
    // For SHORT positions:
    stopLossPrice = entryPrice - (stopLossPnL / quantity); // Will be higher than entry (negative PnL for short)
    takeProfitPrice = entryPrice - (takeProfitPnL / quantity); // Will be lower than entry (positive PnL for short)
  }
  
  return {
    stopLossPrice,
    takeProfitPrice,
    quantity,
    positionValue
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
      if (msg.includes("No need to change") || msg.includes("margin type cannot be changed")) {
        console.log(`[${symbol}] Margin type already ISOLATED or cannot be changed.`);
      } else {
        console.warn(`[${symbol}] Error setting margin type:`, msg);
      }
    }
    
    await binance.futuresLeverage(symbol, LEVERAGE);
    console.log(`[${symbol}] Leverage set to ${LEVERAGE}x`);

    // Get current price and symbol info
    const price = (await binance.futuresPrices())[symbol];
    const entryPrice = parseFloat(price);
    const symbolInfo = await getSymbolInfo(symbol);
    
    // Calculate position details with correct ROI
    const { stopLossPrice: rawStopLoss, takeProfitPrice: rawTakeProfit, quantity: rawQuantity, positionValue } 
      = calculateStopLossAndTakeProfit(entryPrice, marginAmount, LEVERAGE, true);
    
    // Round to proper precision
    let quantity = roundToStepSize(rawQuantity, symbolInfo.stepSize);
    const qtyFixed = quantity.toFixed(symbolInfo.quantityPrecision);
    
    let stopLossPrice = roundToTickSize(rawStopLoss, symbolInfo.tickSize);
    stopLossPrice = parseFloat(stopLossPrice.toFixed(symbolInfo.pricePrecision));
    
    let takeProfitPrice = roundToTickSize(rawTakeProfit, symbolInfo.tickSize);
    takeProfitPrice = parseFloat(takeProfitPrice.toFixed(symbolInfo.pricePrecision));
    
    // Validate minimum notional
    const notionalValue = parseFloat(qtyFixed) * entryPrice;
    if (notionalValue < symbolInfo.minNotional) {
      throw new Error(`Order size too small. Minimum notional: ${symbolInfo.minNotional}, Current: ${notionalValue}`);
    }
    
    console.log(`LONG Order Details for ${symbol}:`);
    console.log(`Entry Price: ${entryPrice}`);
    console.log(`Quantity: ${qtyFixed}`);
    console.log(`Margin Used: ${marginAmount} USDT`);
    console.log(`Position Value: ${positionValue} USDT (${LEVERAGE}x leverage)`);
    console.log(`Stop Loss Price: ${stopLossPrice} (${STOP_LOSS_ROI}% margin ROI)`);
    console.log(`Take Profit Price: ${takeProfitPrice} (+${TAKE_PROFIT_ROI}% margin ROI)`);
    console.log(`Notional Value: ${notionalValue} USDT`);

    // Place market buy order
    const buyOrder = await binance.futuresMarketBuy(symbol, qtyFixed);
    console.log(`✅ Bought ${symbol} at ${entryPrice}`);

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

    // Save trade to database
    const tradeResponse = await axios.post(API_ENDPOINT, { data: buyOrderDetails });
    const tradeId = tradeResponse.data._id;
    console.log(`Trade saved with ID: ${tradeId}`);

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
    console.log(`✅ Stop Loss set at ${stopLossPrice} (${STOP_LOSS_ROI}% margin ROI)`);

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
    console.log(`✅ Take Profit set at ${takeProfitPrice} (+${TAKE_PROFIT_ROI}% margin ROI)`);

    // Update trade with SL/TP details
    const details = {
      stopLossPrice: stopLossPrice,
      stopLossOrderId: stopLossOrder.orderId,
      takeProfitPrice: takeProfitPrice,
      takeProfitOrderId: takeProfitOrder.orderId,
    };
    
    await axios.put(`${API_ENDPOINT}${tradeId}`, { data: details });
    console.log(`Trade updated with SL/TP orders`);
    
  } catch (error) {
    console.error(`❌ Error placing LONG order for ${symbol}:`, error.message);
    if (error.response) {
      console.error(`API Response:`, error.response.data);
    }
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
      if (msg.includes("No need to change") || msg.includes("margin type cannot be changed")) {
        console.log(`[${symbol}] Margin type already ISOLATED or cannot be changed.`);
      } else {
        console.warn(`[${symbol}] Error setting margin type:`, msg);
      }
    }
    
    await binance.futuresLeverage(symbol, LEVERAGE);
    console.log(`[${symbol}] Leverage set to ${LEVERAGE}x`);

    // Get current price and symbol info
    const price = (await binance.futuresPrices())[symbol];
    const entryPrice = parseFloat(price);
    const symbolInfo = await getSymbolInfo(symbol);
    
    // Calculate position details with correct ROI
    const { stopLossPrice: rawStopLoss, takeProfitPrice: rawTakeProfit, quantity: rawQuantity, positionValue } 
      = calculateStopLossAndTakeProfit(entryPrice, marginAmount, LEVERAGE, false);
    
    // Round to proper precision
    let quantity = roundToStepSize(rawQuantity, symbolInfo.stepSize);
    const qtyFixed = quantity.toFixed(symbolInfo.quantityPrecision);
    
    let stopLossPrice = roundToTickSize(rawStopLoss, symbolInfo.tickSize);
    stopLossPrice = parseFloat(stopLossPrice.toFixed(symbolInfo.pricePrecision));
    
    let takeProfitPrice = roundToTickSize(rawTakeProfit, symbolInfo.tickSize);
    takeProfitPrice = parseFloat(takeProfitPrice.toFixed(symbolInfo.pricePrecision));
    
    // Validate minimum notional
    const notionalValue = parseFloat(qtyFixed) * entryPrice;
    if (notionalValue < symbolInfo.minNotional) {
      throw new Error(`Order size too small. Minimum notional: ${symbolInfo.minNotional}, Current: ${notionalValue}`);
    }

    console.log(`SHORT Order Details for ${symbol}:`);
    console.log(`Entry Price: ${entryPrice}`);
    console.log(`Quantity: ${qtyFixed}`);
    console.log(`Margin Used: ${marginAmount} USDT`);
    console.log(`Position Value: ${positionValue} USDT (${LEVERAGE}x leverage)`);
    console.log(`Stop Loss Price: ${stopLossPrice} (${STOP_LOSS_ROI}% margin ROI)`);
    console.log(`Take Profit Price: ${takeProfitPrice} (+${TAKE_PROFIT_ROI}% margin ROI)`);
    console.log(`Notional Value: ${notionalValue} USDT`);

    // Place market sell order
    const shortOrder = await binance.futuresMarketSell(symbol, qtyFixed);
    console.log(`✅ Shorted ${symbol} at ${entryPrice}`);

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

    // Save trade to database
    const tradeResponse = await axios.post(API_ENDPOINT, { data: shortOrderDetails });
    const tradeId = tradeResponse.data._id;
    console.log(`Trade saved with ID: ${tradeId}`);

    // Place Stop Loss Order (BUY for short position)
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
    console.log(`✅ Stop Loss set at ${stopLossPrice} (${STOP_LOSS_ROI}% margin ROI)`);

    // Place Take Profit Order (BUY for short position)
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
    console.log(`✅ Take Profit set at ${takeProfitPrice} (+${TAKE_PROFIT_ROI}% margin ROI)`);

    // Update trade with SL/TP details
    const details = {
      stopLossPrice: stopLossPrice,
      stopLossOrderId: stopLossOrder.orderId,
      takeProfitPrice: takeProfitPrice,
      takeProfitOrderId: takeProfitOrder.orderId,
    };

    await axios.put(`${API_ENDPOINT}${tradeId}`, { data: details });
    console.log(`Trade updated with SL/TP orders`);
    
  } catch (error) {
    console.error(`❌ Error placing SHORT order for ${symbol}:`, error.message);
    if (error.response) {
      console.error(`API Response:`, error.response.data);
    }
  }
}

async function processSymbol(symbol, maxSpendPerTrade) {
  try {
    const decision = await decide25TemaFIx(symbol);

    if (decision === "LONG") {
      await placeBuyOrder(symbol, maxSpendPerTrade);
    } else if (decision === "SHORT") {
      await placeShortOrder(symbol, maxSpendPerTrade);
    } else {
      console.log(`⏸️ No trade signal for ${symbol}`);
    }
  } catch (error) {
    console.error(`❌ Error processing ${symbol}:`, error.message);
  }
}

async function getAvailableSymbols(symbols) {
  const availableSymbols = [];
  for (const sym of symbols) {
    try {
      const response = await axios.post(`${API_ENDPOINT}check-symbols`, {
        symbols: sym,
      });
      const status = response?.data?.data?.status;
      if (status === true) {
        availableSymbols.push(sym);
      } else {
        console.log(`⚠️ TRADE ALREADY OPEN FOR SYMBOL: ${sym}`);
      }
    } catch (err) {
      console.error(`❌ Error checking status for ${sym}:`, err.message);
    }
  }
  return availableSymbols;
}

// Main trading loop
setInterval(async () => {
  try {
    console.log(`\n🔄 Starting trading cycle at ${new Date().toISOString()}`);
    
    const totalBalance = await getUsdtBalance();
    const usableBalance = totalBalance - 5; // Reserve 5 USDT
    console.log(`💰 Total Balance: ${totalBalance} USDT`);
    console.log(`💰 Usable Balance: ${usableBalance} USDT`);

    if (usableBalance <= 0) {
      console.log(`⚠️ Insufficient balance for trading.`);
      return;
    }

    // Get symbols without open trades
    const availableSymbols = await getAvailableSymbols(symbols);
    if (availableSymbols.length === 0) {
      console.log("⏸️ No symbols available for trading (all have open trades).");
      return;
    }

    // Calculate max spend per trade based on available symbols
    const maxSpendPerTrade = Math.floor((usableBalance / availableSymbols.length) * 100) / 100; // Round down to 2 decimals
    console.log(`📊 Available Symbols: ${availableSymbols.length}`);
    console.log(`💵 Max Spend Per Trade: ${maxSpendPerTrade} USDT`);

    if (maxSpendPerTrade < 1.5) {
      console.log(`⚠️ Insufficient balance per trade. Required: 1.5 USDT, Available: ${maxSpendPerTrade} USDT`);
      return;
    }

    // Process symbols sequentially
    for (const sym of availableSymbols) {
      try {
        console.log(`\n🔍 Processing ${sym}...`);
        
        // Recheck balance before each trade
        const currentBalance = await getUsdtBalance();
        const currentUsableBalance = currentBalance - 6; // More conservative reserve
        if (currentUsableBalance < maxSpendPerTrade) {
          console.log(`⚠️ Insufficient balance for ${sym}. Available: ${currentUsableBalance} USDT`);
          continue;
        }

        // Recheck trade status to avoid race conditions
        const response = await axios.post(`${API_ENDPOINT}check-symbols`, {
          symbols: sym,
        });
        if (response?.data?.data?.status === true) {
          await processSymbol(sym, maxSpendPerTrade);
        } else {
          console.log(`⚠️ Trade opened for ${sym} during processing. Skipping.`);
        }
      } catch (err) {
        console.error(`❌ Error processing ${sym}:`, err.message);
      }
      
      // Small delay between trades to avoid rate limits
      await new Promise(resolve => setTimeout(resolve, 100));
    }
    
    console.log(`✅ Trading cycle completed at ${new Date().toISOString()}`);
  } catch (err) {
    console.error("❌ Error in main trading loop:", err.message);
  }
}, 4000); // 4 second interval

// Keep the order check interval
setInterval(async () => {
  try {
    for (const sym of symbols) {
      await orderCheckFunForFix(sym);
    }
  } catch (err) {
    console.error("❌ Error in order check loop:", err.message);
  }
}, 6000);

console.log("🚀 Trading bot started!");
console.log(`📊 Leverage: ${LEVERAGE}x`);
console.log(`🛑 Stop Loss ROI: ${STOP_LOSS_ROI}%`);
console.log(`🎯 Take Profit ROI: ${TAKE_PROFIT_ROI}%`);
console.log("=" .repeat(50));