const Binance = require("node-binance-api");
const axios = require("axios");
const { orderOnlyForLong } = require("./orderOnlyForLong");

const API_ENDPOINT = "http://localhost:3001/api/buySell/";

const binance = new Binance().options({
  APIKEY: "0kB82SnxRkon7oDJqmCPykl4ar0afRYrScffMnRA3kTR8Qfq986IBwjqNA7fIauI",
  APISECRET: "6TWxLtkLDaCfDh4j4YcLa2WLS99zkZtaQjJnsAeGAtixHIDXjPdJAta5BJxNWrZV",
  useServerTime: true,
  test: false,
});

const symbols = ["USDEUSDT"];
const LEVERAGE = 3;
const TARGET_ROI = 10;

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

async function placeLongOrder(symbol, marginAmount) {
  try {
    try {
      await binance.futuresMarginType(symbol, "ISOLATED");
    } catch (err) {
      console.log(err);
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

    // Calculate 10% ROI target price
    const takeProfitPrice = parseFloat(
      (entryPrice * (1 + (TARGET_ROI * LEVERAGE) / 100)).toFixed(pricePrecision)
    );

    console.log(`LONG Order Details for ${symbol}:`);
    console.log(`Entry Price: ${entryPrice}`);
    console.log(`Take Profit Price: ${takeProfitPrice} (${TARGET_ROI}% ROI)`);
    console.log(`Quantity: ${qtyFixed}`);
    console.log(`Margin Used: ${marginAmount}`);

    // Place market buy order
    const buyOrder = await binance.futuresMarketBuy(symbol, qtyFixed);
    console.log(`Bought ${symbol} at ${entryPrice}`);

    // Save trade details to database
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

    // Place take profit order
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

    console.log(
      `Take Profit set at ${takeProfitPrice} for ${symbol} (${TARGET_ROI}% ROI target)`
    );

    // Update trade with TP details
    const details = {
      takeProfitPrice: takeProfitPrice,
      takeProfitOrderId: takeProfitOrder.orderId,
    };

    await axios.put(`${API_ENDPOINT}${tradeId}`, {
      data: details,
    });
  } catch (error) {
    console.error(`Error placing LONG order for ${symbol}:`, error);
  }
}

async function processSymbol(symbol, maxSpendPerTrade) {
  const shouldGoLong = true;

  if (shouldGoLong) {
    await placeLongOrder(symbol, maxSpendPerTrade);
  } else {
    console.log(`No LONG signal for ${symbol}`);
  }
}

// Main trading loop
setInterval(async () => {
  const totalBalance = await getUsdtBalance();
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
    console.log("Not enough balance for trading");
  }
}, 7000);

setInterval(async () => {
  for (const sym of symbols) {
    await orderOnlyForLong(sym);
  }
}, 5000);
