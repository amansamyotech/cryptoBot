const Binance = require("node-binance-api");
const axios = require("axios");
const { decideTradeDirection } = require("./decideTradeFuntion");
const { checkOrders } = require("./orderCheckFun");
const { getUsdtBalance } = require("./helper/getBalance");

const API_ENDPOINT = "http://localhost:3000/api/buySell/";

const binance = new Binance().options({
  APIKEY: "whfiekZqKdkwa9fEeUupVdLZTNxBqP1OCEuH2pjyImaWt51FdpouPPrCawxbsupK",
  APISECRET: "E4IcteWOQ6r9qKrBZJoBy4R47nNPBDepVXMnS3Lf2Bz76dlu0QZCNh82beG2rHq4",
  useServerTime: true,
  test: false,
});

const symbols = [
  "1000PEPEUSDT",
  //   "WIFUSDT",
  //   "NEARUSDT",
  //   "DOGEUSDT",
  //   "SOLUSDT",
  //   "INJUSDT",
  //   "XRPUSDT",
  //   "SUIUSDT",
  //   "TRXUSDT",
  //   "CKBUSDT",
];

const interval = "1m";
const LEVERAGE = 3;
const STOP_LOSS_ROI = -1;
const TRAILING_START_ROI = 1;

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
    const roi = ((currentPrice - entryPrice) / entryPrice) * 100 * LEVERAGE;

    const exchangeInfo = await binance.futuresExchangeInfo();
    const symbolInfo = exchangeInfo.symbols.find((s) => s.symbol === symbol);
    const pricePrecision = symbolInfo.pricePrecision;
    const quantityPrecision = symbolInfo.quantityPrecision;
    const qty = parseFloat(quantity);
    const qtyFixed = qty.toFixed(quantityPrecision);

    if (roi >= TRAILING_START_ROI) {
      const roiStepsAboveTrailing = Math.floor(
        (roi - TRAILING_START_ROI) / 0.5
      );
      const newStop = parseFloat(
        (
          entryPrice *
          (1 + (TRAILING_START_ROI + roiStepsAboveTrailing * 0.5) / 100)
        ).toFixed(pricePrecision)
      );

      if (newStop > oldStop) {
        console.log(
          `[${symbol}] LONG ROI ${roi.toFixed(
            2
          )}% → Updating SL from ${oldStop} to ${newStop}`
        );
        await binance.futuresCancel(symbol, { stopLossOrderId });
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
    } = tradeDetails;

    const entryPrice = parseFloat(shortTimeCurrentPrice);
    const oldStop = parseFloat(oldStopLoss);
    const roi = ((entryPrice - currentPrice) / entryPrice) * 100 * LEVERAGE;

    const exchangeInfo = await binance.futuresExchangeInfo();
    const symbolInfo = exchangeInfo.symbols.find((s) => s.symbol === symbol);
    const pricePrecision = symbolInfo.pricePrecision;
    const quantityPrecision = symbolInfo.quantityPrecision;
    const qty = parseFloat(quantity);
    const qtyFixed = qty.toFixed(quantityPrecision);

    if (roi >= TRAILING_START_ROI) {
      const roiStepsAboveTrailing = Math.floor(
        (roi - TRAILING_START_ROI) / 0.5
      );
      const newStop = parseFloat(
        (
          entryPrice *
          (1 - (TRAILING_START_ROI + roiStepsAboveTrailing * 0.5) / 100)
        ).toFixed(pricePrecision)
      );

      if (newStop < oldStop) {
        console.log(
          `[${symbol}] SHORT ROI ${roi.toFixed(
            2
          )}% → Updating SL from ${oldStop} to ${newStop}`
        );

        await binance.futuresCancel(symbol, { stopLossOrderId });

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

    const stopLossPrice = parseFloat(
      (entryPrice * (1 + STOP_LOSS_ROI / 100)).toFixed(pricePrecision)
    );
    const takeProfitPrice = parseFloat(
      (entryPrice * (1 + TRAILING_START_ROI / 100)).toFixed(pricePrecision)
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

    await axios.put(`${API_ENDPOINT}${tradeId}`, {
      data: details,
    });
  } catch (error) {
    console.error(`Error placing LONG order for ${symbol}:`, error);
  }
}

async function placeShortOrder(symbol, marginAmount) {
  try {
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
    const stopLossPrice = parseFloat(
      (entryPrice * (1 - STOP_LOSS_ROI / 100)).toFixed(pricePrecision)
    );
    const takeProfitPrice = parseFloat(
      (entryPrice * (1 - TRAILING_START_ROI / 100)).toFixed(pricePrecision)
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

    await axios.put(`${API_ENDPOINT}${tradeId}`, {
      data: details,
    });
  } catch (error) {
    console.error(`Error placing SHORT order for ${symbol}:`, error);
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
      }
    } catch (err) {
      console.error(`Error with ${sym}:`, err.message);
    }
  }
}, 5000);
