// 📦 Dependencies
const Binance = require("node-binance-api");
const technicalIndicators = require("technicalindicators");
const axios = require("axios");
const { sendTelegram } = require("../helper/teleMassage.js");

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
  "DOGEUSDT",
];
const interval = "5m";
const leverage = 1; // Leverage

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
    console.error(`Failed to set leverage for ${symbol}:, err.body`);
  }
}

// ⏳ Fetch candlestick data
async function getCandles(symbol, interval, limit = 100) {
  const candles = await binance.futuresCandles(symbol, interval, { limit });
  return candles.map((c) => ({
    close: parseFloat(c.close),
    volume: parseFloat(c.volume),
  }));
}

// 📊 Calculate indicators
async function getIndicators(symbol) {
  const candles = await getCandles(symbol, interval);
  const closes = candles.map((c) => c.close);
  const volumes = candles.map((c) => c.volume);

  const ema20 = technicalIndicators.EMA.calculate({
    period: 20,
    values: closes,
  });
  const ema50 = technicalIndicators.EMA.calculate({
    period: 50,
    values: closes,
  });

  const rsi = technicalIndicators.RSI.calculate({ period: 14, values: closes });
  const macd = technicalIndicators.MACD.calculate({
    values: closes,
    fastPeriod: 12,
    slowPeriod: 26,
    signalPeriod: 9,
    SimpleMAOscillator: false,
    SimpleMASignal: false,
  });

  const avgVolume = volumes.slice(-20).reduce((a, b) => a + b, 0) / 20;
  console.log(`avgVolume`, {
    ema20: ema20.at(-1),
    ema50: ema50.at(-1),
    rsi: rsi.at(-1),
    macdLine: macd.at(-1)?.MACD,
    macdSignal: macd.at(-1)?.signal,
    volume: volumes.at(-1),
    avgVolume,
  });

  return {
    ema20: ema20.at(-1),
    ema50: ema50.at(-1),
    rsi: rsi.at(-1),
    macdLine: macd.at(-1)?.MACD,
    macdSignal: macd.at(-1)?.signal,
    volume: volumes.at(-1),
    avgVolume,
  };
}

// 🧠 Decide Trade Direction
async function decideTradeDirection(symbol) {
  console.log(`decideTradeDirection(symbol)`, symbol);

  const ind = await getIndicators(symbol);

  const trendScore = [
    ind.ema20 > ind.ema50 ? 1 : -1,
    ind.rsi > 55 ? 1 : ind.rsi < 45 ? -1 : 0,
    ind.macdLine > ind.macdSignal ? 1 : -1,
    ind.volume > ind.avgVolume * 1.5 ? 1 : 0,
  ].reduce((a, b) => a + b, 0);
  console.log(`trendScore`, trendScore);

  if (trendScore >= 3) return "LONG";
  if (trendScore <= -2) return "SHORT";

  return "HOLD";
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

// 💰 Place Buy Order + Stop Loss
async function placeBuyOrder(symbol, maxSpend) {
  await setLeverage(symbol);
  const price = (await binance.futuresPrices())[symbol];
  const entryPrice = parseFloat(price);
  const qty = parseFloat((maxSpend / entryPrice).toFixed(0));
  const adjustedEntryPrice = maxSpend / qty;
  const exchangeInfo = await binance.futuresExchangeInfo();
  const symbolInfo = exchangeInfo.symbols.find((s) => s.symbol === symbol);
  const pricePrecision = symbolInfo.pricePrecision;
  const quantityPrecision = symbolInfo.quantityPrecision;
  const investedAmount = qty * adjustedEntryPrice;
  const lossAmount = investedAmount * 0.02; // 2%
  const profitAmount = investedAmount * 0.01; // 1%

  const stopLoss = (adjustedEntryPrice - lossAmount / qty).toFixed(
    pricePrecision
  );
  const takeProfit = (adjustedEntryPrice + profitAmount / qty).toFixed(
    pricePrecision
  );
  const qtyFixed = qty.toFixed(quantityPrecision);

  const currentPrice = parseFloat((await binance.futuresPrices())[symbol]);

  if (parseFloat(stopLoss) < currentPrice) {
    const buyOrder = await binance.futuresMarketBuy(symbol, qtyFixed);
    sendTelegram(`🟢Bought ${symbol} at ${entryPrice}`);
    console.log(`Bought ${symbol} at ${entryPrice}`);
    const buyOrderDetails = {
      side: "LONG",
      symbol,
      quantity: qtyFixed,
      LongTimeCoinPrice: entryPrice,
      placeOrderId: buyOrder.orderId,
    };

    const tradeResponse = await axios.post(API_ENDPOINT, {
      data: buyOrderDetails,
    });
    console.log(`tradeResponse`, tradeResponse?.data);

    const tradeId = tradeResponse.data._id;

    const stopLossOrder = await binance.futuresOrder(
      "STOP_MARKET",
      "SELL",
      symbol,
      qtyFixed,
      null,
      {
        stopPrice: stopLoss,
        reduceOnly: true,
        timeInForce: "GTC",
      }
    );
    console.log(`Stop loss set at ${stopLoss} for ${symbol}`);

    const takeProfitOrder = await binance.futuresOrder(
      "TAKE_PROFIT_MARKET",
      "SELL",
      symbol,
      qtyFixed,
      null,
      {
        stopPrice: takeProfit,
        reduceOnly: true,
        timeInForce: "GTC",
      }
    );

    console.log(`Take profit set at ${takeProfit} for ${symbol}`);
    const Details = {
      takeProfitPrice: takeProfit,
      profitOrderId: takeProfitOrder.orderId,
      stopLossPrice: stopLoss,
      stopLossOrderId: stopLossOrder.orderId,
    };

    await axios.put(`${API_ENDPOINT}${tradeId}`, {
      data: Details,
    });
  }
}

// 📉 Place Short Order + Stop Loss
async function placeShortOrder(symbol, maxSpend) {
  await setLeverage(symbol);
  const price = (await binance.futuresPrices())[symbol];
  const entryPrice = parseFloat(price);
  const qty = parseFloat((maxSpend / entryPrice).toFixed(0));
  const adjustedEntryPrice = maxSpend / qty;

  const exchangeInfo = await binance.futuresExchangeInfo();
  const symbolInfo = exchangeInfo.symbols.find((s) => s.symbol === symbol);
  const pricePrecision = symbolInfo.pricePrecision;
  const quantityPrecision = symbolInfo.quantityPrecision;
  const investedAmount = qty * adjustedEntryPrice;
  const lossAmount = investedAmount * 0.02; // 2%
  const profitAmount = investedAmount * 0.01; // 1%

  const stopLoss = (adjustedEntryPrice + lossAmount / qty).toFixed(
    pricePrecision
  );
  const takeProfit = (adjustedEntryPrice - profitAmount / qty).toFixed(
    pricePrecision
  );
  const qtyFixed = qty.toFixed(quantityPrecision);

  const currentPrice = parseFloat((await binance.futuresPrices())[symbol]);

  if (parseFloat(stopLoss) > currentPrice) {
    const shortOrder = await binance.futuresMarketSell(symbol, qtyFixed);
    sendTelegram(`🔴Shorted ${symbol} at ${entryPrice}`);
    console.log(`Shorted ${symbol} at ${entryPrice}`);
    const shortOrderDetails = {
      side: "SHORT",
      symbol,
      quantity: qtyFixed,
      ShortTimeCurrentPrice: entryPrice,
      placeOrderId: shortOrder.orderId,
    };

    const tradeResponse = await axios.post(API_ENDPOINT, {
      data: shortOrderDetails,
    });

    console.log(`tradeResponse`, tradeResponse?.data);

    const tradeId = tradeResponse.data._id;

    const stopLossOrder = await binance.futuresOrder(
      "STOP_MARKET",
      "BUY",
      symbol,
      qtyFixed,
      null,
      {
        stopPrice: stopLoss,
        reduceOnly: true,
        timeInForce: "GTC",
      }
    );
    console.log(`Stop loss (short) set at ${stopLoss} for ${symbol}`);

    const takeProfitOrder = await binance.futuresOrder(
      "TAKE_PROFIT_MARKET",
      "BUY",
      symbol,
      qtyFixed,
      null,
      {
        stopPrice: takeProfit,
        reduceOnly: true,
        timeInForce: "GTC",
      }
    );
    console.log(`Take profit (short) set at ${takeProfit} for ${symbol}`);
    const Details = {
      takeProfitPrice: takeProfit,
      profitOrderId: takeProfitOrder.orderId,
      stopLossPrice: stopLoss,
      stopLossOrderId: stopLossOrder.orderId,
    };

    await axios.put(`${API_ENDPOINT}${tradeId}`, {
      data: Details,
    });
  }
}

// 🔁 Main Loop
setInterval(async () => {
  const totalBalance = await getUsdtBalance();
  const usableBalance = totalBalance - 6; // Keep $6 reserve
  const maxSpendPerTrade = usableBalance / symbols.length;

  if (usableBalance <= 6) {
    console.log("Not enough balance to trade.");
    return;
  }

  for (const sym of symbols) {
    try {
      const response = await axios.post(`${API_ENDPOINT}check-symbols`, {
        symbols: sym,
      });

      let status = response?.data?.data.status;

      if (status == true) {
        await processSymbol(sym, maxSpendPerTrade);
      } else {
        console.log(`TREAD ALREADY OPEN FOR THAT SYMBOL : ${sym} `);
      }
    } catch (err) {
      console.error(`Error with ${sym}:`, err);
    }
  }
}, 60 * 5000); // Run every 5 minute

async function checkOrders(symbol) {
  try {
    const response = await axios.get(`${API_ENDPOINT}find-treads/${symbol}`);
    console.log(`response.data?.data`, response.data?.data);

    const { found } = response.data?.data;

    if (!found) return;

    const { tradeDetails } = response.data?.data;
    const { stopLossOrderId, takeProfitOrderId, objectId } = tradeDetails;
    console.log(
      ` stopLossOrderId, takeProfitOrderId,`,
      stopLossOrderId,
      takeProfitOrderId
    );

    console.log(`objectId:`, objectId);

    if (!stopLossOrderId || !takeProfitOrderId) {
      console.log(`No order IDs found for ${symbol}`);
      return;
    }

    // Get initial order statuses
    const stopLossStatus = await binance.futuresOrderStatus(symbol, {
      orderId: stopLossOrderId,
    });

    const takeProfitStatus = await binance.futuresOrderStatus(symbol, {
      orderId: takeProfitOrderId,
    });

    const stopLossOrderStatus = stopLossStatus?.status;
    const takeProfitOrderStatus = takeProfitStatus?.status;

    console.log(`Stop Loss Status for ${symbol}:`, stopLossOrderStatus);
    console.log(`Take Profit Status for ${symbol}:`, takeProfitOrderStatus);

    const isStopLossFilled = stopLossOrderStatus === "FILLED";
    const isTakeProfitFilled = takeProfitOrderStatus === "FILLED";

    if (isStopLossFilled || isTakeProfitFilled) {
      console.log(`One of the orders is filled for ${symbol}`);

      // If Stop Loss is NOT filled, check again before canceling
      if (!isStopLossFilled) {
        const recheckStopLoss = await binance.futuresOrderStatus(symbol, {
          orderId: stopLossOrderId,
        });
        if (
          recheckStopLoss?.status !== "CANCELED" &&
          recheckStopLoss?.status !== "FILLED"
        ) {
          await binance.futuresCancel(symbol, stopLossOrderId);
          console.log(`Stop Loss order canceled`);
        } else {
          console.log(`Stop Loss already canceled or filled`);
        }
      }

      // If Take Profit is NOT filled, check again before canceling
      if (!isTakeProfitFilled) {
        const recheckTakeProfit = await binance.futuresOrderStatus(symbol, {
          orderId: takeProfitOrderId,
        });
        if (
          recheckTakeProfit?.status !== "CANCELED" &&
          recheckTakeProfit?.status !== "FILLED"
        ) {
          await binance.futuresCancel(symbol, takeProfitOrderId);
          console.log(`Take Profit order canceled`);
        } else {
          console.log(`Take Profit already canceled or filled`);
        }
      }

      // Mark trade as closed
      const data = await axios.put(`${API_ENDPOINT}${objectId}`, {
        data: { status: "1" },
      });
      console.log(`Trade marked as closed in DB for ${symbol}`, data?.data);
    } else {
      console.log(
        `Neither order is filled yet for ${symbol}. No action taken.`
      );
    }
  } catch (error) {
    console.error("Error checking or canceling orders:", error);
  }
}

setInterval(async () => {
  for (const sym of symbols) {
    await checkOrders(sym);
  }
}, 30000);
