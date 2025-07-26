// 📦 Dependencies
const Binance = require("node-binance-api");
const technicalIndicators = require("technicalindicators");
const axios = require("axios");
const { sendTelegram } = require("../../../helper/teleMassage.js");
const { decideTradeDirection } = require("./decideTradeDirection.js");

const API_ENDPOINT = "http://localhost:3000/api/buySell/";

// 🔐 Configure your Binance Futures API keys
const binance = new Binance().options({
  APIKEY: "whfiekZqKdkwa9fEeUupVdLZTNxBqP1OCEuH2pjyImaWt51FdpouPPrCawxbsupK",
  APISECRET: "E4IcteWOQ6r9qKrBZJoBy4R47nNPBDepVXMnS3Lf2Bz76dlu0QZCNh82beG2rHq4",
  useServerTime: true,
  test: false, // Set to true for testnet
});

// ⚙️ Bot Config
const symbols = [
  "1000PEPEUSDT",
  "1000SHIBUSDT",
  "1000BONKUSDT",
  "1000FLOKIUSDT",
  //   "1000SATSUSDT",
  //   "DOGEUSDT",
];
const interval = "3m";
const leverage = 3; // Leverage
const STOP_LOSS_ROI = -1; // -1% ROI for stop loss
const TAKE_PROFIT_ROI = 2; // +2% ROI for take profit

// 💰 Get wallet balance
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

// Set leverage before trading
async function setLeverage(symbol) {
  try {
    await binance.futuresLeverage(symbol, leverage);
    console.log(`Leverage set to ${leverage}x for ${symbol}`);
  } catch (err) {
    console.error(`Failed to set leverage for ${symbol}:`, err.body);
  }
}

// 📊 Calculate ROI-based prices for stop loss and take profit
function calculateROIPrices(entryPrice, marginUsed, quantity, side) {
  // For futures trading, ROI = PnL / Margin Used × 100
  // PnL = (Exit Price - Entry Price) × Quantity × (1 for LONG, -1 for SHORT)

  const stopLossPnL = (marginUsed * STOP_LOSS_ROI) / 100; // Negative value
  const takeProfitPnL = (marginUsed * TAKE_PROFIT_ROI) / 100; // Positive value

  let stopLossPrice, takeProfitPrice;

  if (side === "LONG") {
    // For LONG: PnL = (Exit Price - Entry Price) × Quantity
    // Stop Loss: Exit Price = Entry Price + (PnL / Quantity)
    stopLossPrice = entryPrice + stopLossPnL / quantity;
    takeProfitPrice = entryPrice + takeProfitPnL / quantity;
  } else {
    // For SHORT: PnL = (Entry Price - Exit Price) × Quantity
    // Stop Loss: Exit Price = Entry Price - (PnL / Quantity)
    stopLossPrice = entryPrice - stopLossPnL / quantity;
    takeProfitPrice = entryPrice - takeProfitPnL / quantity;
  }

  return { stopLossPrice, takeProfitPrice };
}

// 📊 Calculate current ROI for a position
function calculateCurrentROI(
  entryPrice,
  currentPrice,
  marginUsed,
  quantity,
  side
) {
  let pnl;
  if (side === "LONG") {
    pnl = (currentPrice - entryPrice) * quantity;
  } else {
    pnl = (entryPrice - currentPrice) * quantity;
  }

  const roi = (pnl / marginUsed) * 100;
  return { pnl, roi };
}

// 📈 Buy/Short Logic
async function processSymbol(symbol, maxSpendPerTrade) {
  const decision = await decideTradeDirection(symbol);

  if (decision === "LONG") {
    sendTelegram(`✨ LONG SIGNAL for ${symbol}`);
    await placeBuyOrder(symbol, maxSpendPerTrade);
  } else if (decision === "SHORT") {
    sendTelegram(`✨ SHORT SIGNAL for ${symbol}`);
    await placeShortOrder(symbol, maxSpendPerTrade);
  } else {
    sendTelegram(`No trade signal for ${symbol}`);
    console.log(`No trade signal for ${symbol}`);
  }
}

// 💰 Place Buy Order + Stop Loss (LONG Position)
async function placeBuyOrder(symbol, marginAmount) {
  try {
    await setLeverage(symbol);

    const price = (await binance.futuresPrices())[symbol];
    const entryPrice = parseFloat(price);

    // Calculate position size with leverage
    const positionValue = marginAmount * leverage;
    const quantity = parseFloat((positionValue / entryPrice).toFixed(6));

    const exchangeInfo = await binance.futuresExchangeInfo();
    const symbolInfo = exchangeInfo.symbols.find((s) => s.symbol === symbol);
    const pricePrecision = symbolInfo.pricePrecision;
    const quantityPrecision = symbolInfo.quantityPrecision;

    const qtyFixed = quantity.toFixed(quantityPrecision);

    // Calculate ROI-based stop loss and take profit prices
    const { stopLossPrice, takeProfitPrice } = calculateROIPrices(
      entryPrice,
      marginAmount,
      quantity,
      "LONG"
    );

    const stopLossFixed = stopLossPrice.toFixed(pricePrecision);
    const takeProfitFixed = takeProfitPrice.toFixed(pricePrecision);

    console.log(`LONG Order Details for ${symbol}:`);
    console.log(`Entry Price: ${entryPrice}`);
    console.log(`Quantity: ${qtyFixed}`);
    console.log(`Margin Used: ${marginAmount}`);
    console.log(`Position Value: ${positionValue} (${leverage}x leverage)`);
    console.log(`Stop Loss Price: ${stopLossFixed} (${STOP_LOSS_ROI}% ROI)`);
    console.log(
      `Take Profit Price: ${takeProfitFixed} (${TAKE_PROFIT_ROI}% ROI)`
    );

    // Place market buy order
    const buyOrder = await binance.futuresMarketBuy(symbol, qtyFixed);
    sendTelegram(
      `🟢 LONG ${symbol} at ${entryPrice} | Qty: ${qtyFixed} | Leverage: ${leverage}x`
    );
    console.log(`Bought ${symbol} at ${entryPrice}`);

    const buyOrderDetails = {
      side: "LONG",
      symbol,
      quantity: qtyFixed,
      LongTimeCoinPrice: entryPrice,
      placeOrderId: buyOrder.orderId,
      marginUsed: marginAmount,
      leverage: leverage,
      positionValue: positionValue,
    };

    const tradeResponse = await axios.post(API_ENDPOINT, {
      data: buyOrderDetails,
    });
    console.log(`Trade Response:`, tradeResponse?.data);

    const tradeId = tradeResponse.data._id;

    // Place stop loss order
    const stopLossOrder = await binance.futuresOrder(
      "STOP_MARKET",
      "SELL",
      symbol,
      qtyFixed,
      null,
      {
        stopPrice: stopLossFixed,
        reduceOnly: true,
        timeInForce: "GTC",
      }
    );
    console.log(
      `Stop Loss set at ${stopLossFixed} for ${symbol} (${STOP_LOSS_ROI}% ROI)`
    );

    // Place take profit order
    const takeProfitOrder = await binance.futuresOrder(
      "TAKE_PROFIT_MARKET",
      "SELL",
      symbol,
      qtyFixed,
      null,
      {
        stopPrice: takeProfitFixed,
        reduceOnly: true,
        timeInForce: "GTC",
      }
    );
    console.log(
      `Take Profit set at ${takeProfitFixed} for ${symbol} (${TAKE_PROFIT_ROI}% ROI)`
    );

    const details = {
      takeProfitPrice: takeProfitFixed,
      profitOrderId: takeProfitOrder.orderId,
      stopLossPrice: stopLossFixed,
      stopLossOrderId: stopLossOrder.orderId,
    };

    await axios.put(`${API_ENDPOINT}${tradeId}`, {
      data: details,
    });
  } catch (error) {
    console.error(`Error placing LONG order for ${symbol}:`, error);
    sendTelegram(`❌ Error placing LONG order for ${symbol}: ${error.message}`);
  }
}

// 📉 Place Short Order + Stop Loss (SHORT Position)
async function placeShortOrder(symbol, marginAmount) {
  try {
    await setLeverage(symbol);

    const price = (await binance.futuresPrices())[symbol];
    const entryPrice = parseFloat(price);

    // Calculate position size with leverage
    const positionValue = marginAmount * leverage;
    const quantity = parseFloat((positionValue / entryPrice).toFixed(6));

    const exchangeInfo = await binance.futuresExchangeInfo();
    const symbolInfo = exchangeInfo.symbols.find((s) => s.symbol === symbol);
    const pricePrecision = symbolInfo.pricePrecision;
    const quantityPrecision = symbolInfo.quantityPrecision;

    const qtyFixed = quantity.toFixed(quantityPrecision);

    // Calculate ROI-based stop loss and take profit prices
    const { stopLossPrice, takeProfitPrice } = calculateROIPrices(
      entryPrice,
      marginAmount,
      quantity,
      "SHORT"
    );

    const stopLossFixed = stopLossPrice.toFixed(pricePrecision);
    const takeProfitFixed = takeProfitPrice.toFixed(pricePrecision);

    console.log(`SHORT Order Details for ${symbol}:`);
    console.log(`Entry Price: ${entryPrice}`);
    console.log(`Quantity: ${qtyFixed}`);
    console.log(`Margin Used: ${marginAmount}`);
    console.log(`Position Value: ${positionValue} (${leverage}x leverage)`);
    console.log(`Stop Loss Price: ${stopLossFixed} (${STOP_LOSS_ROI}% ROI)`);
    console.log(
      `Take Profit Price: ${takeProfitFixed} (${TAKE_PROFIT_ROI}% ROI)`
    );

    // Place market sell order
    const shortOrder = await binance.futuresMarketSell(symbol, qtyFixed);
    sendTelegram(
      `🔴 SHORT ${symbol} at ${entryPrice} | Qty: ${qtyFixed} | Leverage: ${leverage}x`
    );
    console.log(`Shorted ${symbol} at ${entryPrice}`);

    const shortOrderDetails = {
      side: "SHORT",
      symbol,
      quantity: qtyFixed,
      ShortTimeCurrentPrice: entryPrice,
      placeOrderId: shortOrder.orderId,
      marginUsed: marginAmount,
      leverage: leverage,
      positionValue: positionValue,
    };

    const tradeResponse = await axios.post(API_ENDPOINT, {
      data: shortOrderDetails,
    });
    console.log(`Trade Response:`, tradeResponse?.data);

    const tradeId = tradeResponse.data._id;

    // Place stop loss order
    const stopLossOrder = await binance.futuresOrder(
      "STOP_MARKET",
      "BUY",
      symbol,
      qtyFixed,
      null,
      {
        stopPrice: stopLossFixed,
        reduceOnly: true,
        timeInForce: "GTC",
      }
    );
    console.log(
      `Stop Loss set at ${stopLossFixed} for ${symbol} (${STOP_LOSS_ROI}% ROI)`
    );

    // Place take profit order
    const takeProfitOrder = await binance.futuresOrder(
      "TAKE_PROFIT_MARKET",
      "BUY",
      symbol,
      qtyFixed,
      null,
      {
        stopPrice: takeProfitFixed,
        reduceOnly: true,
        timeInForce: "GTC",
      }
    );
    console.log(
      `Take Profit set at ${takeProfitFixed} for ${symbol} (${TAKE_PROFIT_ROI}% ROI)`
    );

    const details = {
      takeProfitPrice: takeProfitFixed,
      profitOrderId: takeProfitOrder.orderId,
      stopLossPrice: stopLossFixed,
      stopLossOrderId: stopLossOrder.orderId,
    };

    await axios.put(`${API_ENDPOINT}${tradeId}`, {
      data: details,
    });
  } catch (error) {
    console.error(`Error placing SHORT order for ${symbol}:`, error);
    sendTelegram(
      `❌ Error placing SHORT order for ${symbol}: ${error.message}`
    );
  }
}

// 🔁 Main Loop
setInterval(async () => {
  const totalBalance = await getUsdtBalance();
  const usableBalance = totalBalance - 6; // Keep $5.1 reserve
  const maxSpendPerTrade = usableBalance / symbols.length;

  if (usableBalance <= 6) {
    console.log("Not enough balance to trade.");
    return;
  }

  console.log(`Total Balance: ${totalBalance} USDT`);
  console.log(`Usable Balance: ${usableBalance} USDT`);
  console.log(`Max Spend Per Trade: ${maxSpendPerTrade} USDT`);

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
}, 60 * 1000); // Run every 1 minute
