const Binance = require("node-binance-api");
const axios = require("axios");
const { decideTradeDirection } = require("./decideTradeDirection");
const { checkOrders } = require("./orderCheckFun");
const { getUsdtBalance } = require("./helper/getBalance");
const { calculateROIPrices } = require("./helper/calculateRoi");
const { setLeverage } = require("./helper/setLavrge");

const API_ENDPOINT = "http://localhost:3000/api/buySell/";

const binance = new Binance().options({
  APIKEY: "tPCOyhkpaVUj6it6BiKQje0WxcJjUOV30EQ7dY2FMcqXunm9DwC8xmuiCkgsyfdG",
  APISECRET: "UpK4CPfKywFrAJDInCAXPmWVSiSs5xVVL2nDes8igCONl3cVgowDjMbQg64fm5pr",
  useServerTime: true,
  test: false,
});

const symbols = [
  "1000PEPEUSDT",
  "WIFUSDT",
  "NEARUSDT",
  "DOGEUSDT",
  "SOLUSDT",
  "INJUSDT",
  "XRPUSDT",
  "SUIUSDT",
  "BNBUSDT",
  "TRXUSDT",
];

const interval = "1m";
const leverage = 3;
const STOP_LOSS_ROI = -1;
const TAKE_PROFIT_ROI = 2;

async function trailStopLossForLong(symbol, tradeDetails, currentPrice) {
  try {
    const {
      stopLossOrderId,
      objectId,
      LongTimeCoinPrice: { $numberDecimal: longTimePrice },
      quantity,
      stopLossPrice: oldStopLoss,
    } = tradeDetails;

    const entryPrice = parseFloat(longTimePrice);
    const oldStop = parseFloat(oldStopLoss);
    const roi = ((currentPrice - entryPrice) / entryPrice) * 100;

    const exchangeInfo = await binance.futuresExchangeInfo();
    const symbolInfo = exchangeInfo.symbols.find((s) => s.symbol === symbol);
    const pricePrecision = symbolInfo.pricePrecision;
    const quantityPrecision = symbolInfo.quantityPrecision;
    const qtyFixed = quantity.toFixed(quantityPrecision);

    if (roi >= 2) {
      const roiStepsAbove2 = Math.floor(roi - 2);
      const newStop = parseFloat(
        (entryPrice * (1 + roiStepsAbove2 * 0.01)).toFixed(pricePrecision)
      );

      if (newStop > oldStop) {
        console.log(
          `[${symbol}] LONG ROI ${roi.toFixed(
            pricePrecision
          )}% → Updating SL from ${oldStop} to ${newStop}`
        );
        await binance.futuresCancel(symbol, stopLossOrderId);
        const stopLossOrder = await binance.futuresOrder(
          "STOP_MARKET",
          "SELL",
          symbol,
          qtyFixed,
          null,
          {
            stopPrice: newStop,
            reduceOnly: true,
            timeInForce: "GTC",
          }
        );

        await axios.put(`${API_ENDPOINT}${objectId}`, {
          data: {
            stopLossPrice: newStop,
            stopLossOrderId: stopLossOrder.orderId,
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
        `[${symbol}] LONG ROI ${roi.toFixed(2)}% — Below 2%, no trailing yet.`
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
    } = tradeDetails;

    const entryPrice = parseFloat(shortTimeCurrentPrice);
    const oldStop = parseFloat(oldStopLoss);

    const exchangeInfo = await binance.futuresExchangeInfo();
    const symbolInfo = exchangeInfo.symbols.find((s) => s.symbol === symbol);
    const pricePrecision = symbolInfo.pricePrecision;
    const quantityPrecision = symbolInfo.quantityPrecision;
    const qtyFixed = quantity.toFixed(quantityPrecision);

    const roi = ((entryPrice - currentPrice) / entryPrice) * 100;

    if (roi >= 2) {
      const roiStepsAbove2 = Math.floor(roi - 2);

      const newStop = parseFloat(
        (entryPrice * (1 - roiStepsAbove2 * 0.01)).toFixed(pricePrecision)
      );

      if (newStop < oldStop) {
        console.log(
          `[${symbol}] SHORT ROI ${roi.toFixed(
            pricePrecision
          )}% → Updating SL from ${oldStop} to ${newStop}`
        );

        await binance.futuresCancel(symbol, { orderId: stopLossOrderId });

        const stopLossOrder = await binance.futuresOrder(
          "STOP_MARKET",
          "BUY",
          symbol,
          qtyFixed,
          null,
          {
            stopPrice: newStop,
            reduceOnly: true,
            timeInForce: "GTC",
          }
        );

        await axios.put(`${API_ENDPOINT}${objectId}`, {
          data: {
            stopLossPrice: newStop,
            stopLossOrderId: stopLossOrder.orderId,
          },
        });

        console.log(`[${symbol}] SHORT Stop Loss updated successfully.`);
      } else {
        console.log(
          `[${symbol}] SHORT ROI ${roi.toFixed(
            2
          )}% — SL unchanged (${oldStop}).`
        );
      }
    } else {
      console.log(
        `[${symbol}] SHORT ROI ${roi.toFixed(2)}% — Below 2%, no trailing yet.`
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

async function processSymbol(symbol, maxSpendPerTrade) {
  const decision = await decideTradeDirection(symbol);
  if (decision === "LONG") {
    await placeBuyOrder(symbol, maxSpendPerTrade);
  } else if (decision === "SHORT") {
    await placeShortOrder(symbol, maxSpendPerTrade);
  } else {
    console.log(`No trade signal for ${symbol}`);
  }
}

async function placeBuyOrder(symbol, marginAmount) {
  try {
    await setLeverage(symbol);
    const price = (await binance.futuresPrices())[symbol];
    const entryPrice = parseFloat(price);
    const positionValue = marginAmount * leverage;
    const quantity = parseFloat((positionValue / entryPrice).toFixed(6));
    const exchangeInfo = await binance.futuresExchangeInfo();
    const symbolInfo = exchangeInfo.symbols.find((s) => s.symbol === symbol);
    const pricePrecision = symbolInfo.pricePrecision;
    const quantityPrecision = symbolInfo.quantityPrecision;
    const qtyFixed = quantity.toFixed(quantityPrecision);
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
    const buyOrder = await binance.futuresMarketBuy(symbol, qtyFixed);
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

    const details = {
      stopLossPrice: stopLossFixed,
      stopLossOrderId: stopLossOrder.orderId,
    };

    await axios.put(`${API_ENDPOINT}${tradeId}`, {
      data: details,
    });
  } catch (error) {
    console.error(`Error placing LONG order for ${symbol}:`, error);
  }
}

// 📉 Place Short Order + Stop Loss (SHORT Position)
async function placeShortOrder(symbol, marginAmount) {
  try {
    await setLeverage(symbol);

    const price = (await binance.futuresPrices())[symbol];
    const entryPrice = parseFloat(price);
    const positionValue = marginAmount * leverage;
    const quantity = parseFloat((positionValue / entryPrice).toFixed(6));

    const exchangeInfo = await binance.futuresExchangeInfo();
    const symbolInfo = exchangeInfo.symbols.find((s) => s.symbol === symbol);
    const pricePrecision = symbolInfo.pricePrecision;
    const quantityPrecision = symbolInfo.quantityPrecision;

    const qtyFixed = quantity.toFixed(quantityPrecision);
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

    const details = {
      stopLossPrice: stopLossFixed,
      stopLossOrderId: stopLossOrder.orderId,
    };

    await axios.put(`${API_ENDPOINT}${tradeId}`, {
      data: details,
    });
  } catch (error) {
    console.error(`Error placing SHORT order for ${symbol}:`, error);
  }
}

setInterval(async () => {
  const totalBalance = await getUsdtBalance();
  const usableBalance = totalBalance - 6;
  const maxSpendPerTrade = usableBalance / symbols.length;

  if (usableBalance < 6) {
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
}, 60 * 1000);

setInterval(async () => {
  for (const sym of symbols) {
    await checkOrders(sym);
  }
}, 30000);

setInterval(async () => {
  for (const sym of symbols) {
    try {
      const response = await axios.post(`${API_ENDPOINT}check-symbols`, {
        symbols: sym,
      });

      let status = response?.data?.data.status;

      if (status == false) {
        await trailStopLoss(sym);
      } else {
        console.log(`TRADE ALREADY OPEN FOR SYMBOL: ${sym}`);
      }
    } catch (err) {
      console.error(`Error with ${sym}:`, err.message);
    }
  }
}, 2000);
