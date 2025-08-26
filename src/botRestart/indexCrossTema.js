const Binance = require("node-binance-api");
const axios = require("axios");
const { getUsdtBalance } = require("./helper/getBalance");
const { getCandles } = require("./helper/getCandles");
const isProcessing = {};
const BUFFER_PERCENTAGE = 0.00025;

// Track last processed candle timestamp for each symbol (separate for entry and exit)
const lastProcessedCandleEntry = {};
const lastProcessedCandleExit = {};

const API_ENDPOINT = "http://localhost:3000/api/buySell/";

const binance = new Binance().options({
  APIKEY: "tPCOyhkpaVUj6it6BiKQje0WxcJjUOV30EQ7dY2FMcqXunm9DwC8xmuiCkgsyfdG",
  APISECRET: "UpK4CPfKywFrAJDInCAXPmWVSiSs5xVVL2nDes8igCONl3cVgowDjMbQg64fm5pr",
  useServerTime: true,
  test: false,
});

const symbols = ["SOLUSDT", "INJUSDT", "XRPUSDT", "DOGEUSDT"];

function getTEMApercentage(tema15, tema21) {
  const total = tema15 + tema21;

  const percent15 = (tema15 / total) * 100;
  const percent21 = (tema21 / total) * 100;

  return {
    percent15,
    percent21,
  };
}

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

const LEVERAGE = 3;

// Function to check if a new candle has formed
async function hasNewCandleFormed(symbol, type = "entry") {
  try {
    const candles = await getCandles(symbol, "3m", 2);
    if (candles.length < 2) return false;

    const latestCandleTime = candles[candles.length - 1].openTime;
    const trackingObject =
      type === "entry" ? lastProcessedCandleEntry : lastProcessedCandleExit;
    const lastProcessed = trackingObject[symbol];

    // If this is the first check or we have a new candle
    if (!lastProcessed || latestCandleTime > lastProcessed) {
      console.log(
        `[${symbol}] New candle detected for ${type} at ${new Date(
          latestCandleTime
        ).toISOString()}`
      );
      trackingObject[symbol] = latestCandleTime;
      return true;
    }

    return false;
  } catch (error) {
    console.error(`Error checking new candle for ${symbol}:`, error.message);
    return false;
  }
}

// Function to check TEMA conditions for entry
async function checkTEMAEntry(symbol) {
  try {
    const candles = await getCandles(symbol, "3m", 1000);
    const closes = candles.map((k) => parseFloat(k.close));
    const tema15 = calculateTEMA(closes, 15);
    const tema21 = calculateTEMA(closes, 21);

    if (tema15.length < 1 || tema21.length < 1) {
      console.warn(`[${symbol}] Not enough data to calculate TEMA`);
      return "HOLD";
    }

    const currentTEMA15 = tema15[tema15.length - 1];
    const currentTEMA21 = tema21[tema21.length - 1];

    const { percent15, percent21 } = getTEMApercentage(
      currentTEMA15,
      currentTEMA21
    );
    console.log(`percent15`, percent15);
    console.log(`percent21 `, percent21);

    console.log(
      `[${symbol}] Current TEMA15: ${percent15.toFixed(
        5
      )}, TEMA21: ${percent21.toFixed(5)}`
    );

    //  Long entry: TEMA15 > TEMA21
    if (percent15 > percent21 + BUFFER_PERCENTAGE) {
      console.log(`[${symbol}] LONG signal - TEMA15 > TEMA21`);
      return "LONG";
    }
    //    Short entry: TEMA21 > TEMA15
    else if (percent21 > percent15 + BUFFER_PERCENTAGE) {
      console.log(`[${symbol}] SHORT signal - TEMA21 > TEMA15`);
      return "SHORT";
    }

    return "HOLD";
  } catch (error) {
    console.error(`Error checking TEMA entry for ${symbol}:`, error.message);
    return "HOLD";
  }
}

// Function to check TEMA conditions for exit
async function checkTEMAExit(symbol, side) {
  try {
    const candles = await getCandles(symbol, "3m", 1000);
    const closes = candles.map((k) => parseFloat(k.close));
    const tema15 = calculateTEMA(closes, 15);
    const tema21 = calculateTEMA(closes, 21);

    if (tema15.length < 1 || tema21.length < 1) {
      console.warn(`[${symbol}] Not enough data to calculate TEMA for exit`);
      return false;
    }

    const currentTEMA15 = tema15[tema15.length - 1];
    const currentTEMA21 = tema21[tema21.length - 1];

    const { percent15, percent21 } = getTEMApercentage(
      currentTEMA15,
      currentTEMA21
    );

    console.log(
      `[${symbol}] Exit check - TEMA15: ${percent15.toFixed(
        4
      )}, TEMA21: ${percent21.toFixed(5)}`
    );

    // Long exit: TEMA21 > TEMA15
    if (side === "LONG" && percent21 > percent15 + BUFFER_PERCENTAGE) {
      console.log(`[${symbol}] LONG exit signal - TEMA21 > TEMA15`);
      return true;
    }
    // Short exit: TEMA15 > TEMA21
    else if (side === "SHORT" && percent15 > percent21 + BUFFER_PERCENTAGE) {
      console.log(`[${symbol}] SHORT exit signal - TEMA15 > TEMA21`);
      return true;
    }

    return false;
  } catch (error) {
    console.error(`Error checking TEMA exit for ${symbol}:`, error.message);
    return false;
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
      return true;
    }

    console.log(
      `[${symbol}] Current position size: ${positionSize}, Trade quantity: ${qty}`
    );

    const exchangeInfo = await binance.futuresExchangeInfo();
    const symbolInfo = exchangeInfo.symbols.find((s) => s.symbol === symbol);
    const quantityPrecision = symbolInfo.quantityPrecision;

    const qtyToClose = Math.min(positionSize, qty).toFixed(quantityPrecision);

    let closeOrder;
    if (side === "LONG") {
      closeOrder = await binance.futuresMarketSell(symbol, qtyToClose, {
        reduceOnly: true,
      });
    } else if (side === "SHORT") {
      closeOrder = await binance.futuresMarketBuy(symbol, qtyToClose, {
        reduceOnly: true,
      });
    }

    console.log(
      `[${symbol}] Position closed via TEMA exit - Order ID: ${closeOrder.orderId}`
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
      return true;
    }
    return false;
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
    const quantityPrecision = symbolInfo.quantityPrecision;
    const qtyFixed = quantity.toFixed(quantityPrecision);

    console.log(`LONG Order Details for ${symbol}:`);
    console.log(`Entry Price: ${entryPrice}`);
    console.log(`Quantity: ${qtyFixed}`);
    console.log(`Margin Used: ${marginAmount}`);
    console.log(`Position Value: ${positionValue} (${LEVERAGE}x leverage)`);

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
    const quantityPrecision = symbolInfo.quantityPrecision;
    const qtyFixed = quantity.toFixed(quantityPrecision);

    console.log(`SHORT Order Details for ${symbol}:`);
    console.log(`Entry Price: ${entryPrice}`);
    console.log(`Quantity: ${qtyFixed}`);
    console.log(`Margin Used: ${marginAmount}`);
    console.log(`Position Value: ${positionValue} (${LEVERAGE}x leverage)`);

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

    console.log(`shortOrderDetails`, shortOrderDetails);

    const tradeResponse = await axios.post(API_ENDPOINT, {
      data: shortOrderDetails,
    });
    console.log(`Trade Response:`, tradeResponse?.data);
  } catch (error) {
    console.error(`Error placing SHORT order for ${symbol}:`, error);
  }
}

async function processSymbol(symbol, maxSpendPerTrade) {
  // Check if a new candle has formed before making entry decision
  const hasNewCandle = await hasNewCandleFormed(symbol, "entry");

  if (!hasNewCandle) {
    console.log(`[${symbol}] No new candle formed yet, skipping entry check`);
    return;
  }

  const decision = await checkTEMAEntry(symbol);

  if (decision === "LONG") {
    console.log(`[${symbol}] 🚀 Executing LONG entry after candle close`);
    await placeBuyOrder(symbol, maxSpendPerTrade);
  } else if (decision === "SHORT") {
    console.log(`[${symbol}] 🔻 Executing SHORT entry after candle close`);
    await placeShortOrder(symbol, maxSpendPerTrade);
  } else {
    console.log(`[${symbol}] No trade signal after candle close`);
  }
}

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

// Exit monitoring interval
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
          console.log(`[${sym}] Skipping exit check — already processing.`);
          continue;
        }
        isProcessing[sym] = true;

        // Check if a new candle has formed before checking exit conditions
        const hasNewCandle = await hasNewCandleFormed(sym);

        if (!hasNewCandle) {
          console.log(`[${sym}] No new candle formed yet, skipping exit check`);
          isProcessing[sym] = false;
          continue;
        }

        // Confirm position is still open
        const positions = await binance.futuresPositionRisk({ symbol: sym });
        const pos = positions.find((p) => p.symbol === sym);
        if (Math.abs(parseFloat(pos.positionAmt)) === 0) {
          console.log(`[${sym}] Position already closed. Skipping.`);
          isProcessing[sym] = false;
          continue;
        }

        // Get trade details
        const tradeResponse = await axios.get(
          `${API_ENDPOINT}find-treads/${sym}`
        );
        const { found, tradeDetails } = tradeResponse.data?.data;

        if (found) {
          // Check TEMA exit condition
          const shouldExit = await checkTEMAExit(sym, tradeDetails.side);

          if (shouldExit) {
            console.log(
              `[${sym}] ⚡ TEMA exit condition met after candle close - CLOSING POSITION ⚡`
            );

            const closeResult = await closePosition(sym, tradeDetails);
            if (closeResult) {
              console.log(
                `[${sym}] ✅ Position successfully closed via TEMA exit`
              );
            } else {
              console.error(`[${sym}] ❌ Failed to close position`);
            }
          } else {
            console.log(
              `[${sym}] TEMA exit condition not met after candle close`
            );
          }
        }
      }
    } catch (err) {
      console.error(`Error with ${sym}:`, err.message);
    } finally {
      isProcessing[sym] = false;
    }
  }
}, 30000);
