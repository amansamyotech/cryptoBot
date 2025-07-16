require("dotenv").config();
const axios = require("axios");
const crypto = require("crypto");

const FUTURES_API_BASE = process.env.FUTURES_API_BASE;
const apiKey = process.env.BINANCE_API_KEY;
const apiSecret = process.env.BINANCE_API_SECRET;
const SYMBOLS = ["DOGEUSDT"];

const MIN_BALANCE = 5;
const TRADE_AMOUNT = 6;
const PROFIT_TARGET = 0.01;

let coinStates = {};
let pendingOrders = {};

const log = (msg) => console.log(`[${new Date().toISOString()}] ${msg}`);

const sign = (params) => {
  const query = new URLSearchParams(params).toString();
  return crypto.createHmac("sha256", apiSecret).update(query).digest("hex");
};

const getBalance = async () => {
  const params = { timestamp: Date.now() };
  const sig = sign(params);
  const res = await axios.get(`${FUTURES_API_BASE}/fapi/v2/account`, {
    params: { ...params, signature: sig },
    headers: { "X-MBX-APIKEY": apiKey },
  });
  return parseFloat(
    res.data.assets.find((a) => a.asset === "USDT").availableBalance
  );
};

const getPrecisionMap = async () => {
  const res = await axios.get(`${FUTURES_API_BASE}/fapi/v1/exchangeInfo`);
  const precisionMap = {};
  SYMBOLS.forEach((symbol) => {
    const info = res.data.symbols.find((s) => s.symbol === symbol);
    const stepSize = info.filters.find(
      (f) => f.filterType === "LOT_SIZE"
    ).stepSize;
    const precision = Math.max(0, stepSize.indexOf("1") - 1);
    precisionMap[symbol] = precision;
  });
  return precisionMap;
};

const checkOrderStatus = async (symbol, orderId) => {
  try {
    const params = {
      symbol,
      orderId,
      timestamp: Date.now(),
    };
    const sig = sign(params);
    const res = await axios.get(`${FUTURES_API_BASE}/fapi/v1/order`, {
      params: { ...params, signature: sig },
      headers: { "X-MBX-APIKEY": apiKey },
    });
    return res.data;
  } catch (e) {
    log(`❌ Order status check error: ${e.response?.data?.msg || e.message}`);
    return null;
  }
};

const getCurrentPositions = async () => {
  try {
    const params = { timestamp: Date.now() };
    const sig = sign(params);
    const res = await axios.get(`${FUTURES_API_BASE}/fapi/v2/positionRisk`, {
      params: { ...params, signature: sig },
      headers: { "X-MBX-APIKEY": apiKey },
    });

    const positions = {};
    res.data.forEach((pos) => {
      if (SYMBOLS.includes(pos.symbol) && parseFloat(pos.positionAmt) > 0) {
        positions[pos.symbol] = {
          quantity: parseFloat(pos.positionAmt),
          entryPrice: parseFloat(pos.entryPrice),
          unrealizedPnl: parseFloat(pos.unRealizedProfit),
        };
      }
    });
    return positions;
  } catch (e) {
    log(`❌ Position fetch error: ${e.response?.data?.msg || e.message}`);
    return {};
  }
};

const placeOrder = async (symbol, side, quantity) => {
  try {
    const params = {
      symbol,
      side,
      type: "MARKET",
      quantity,
      timestamp: Date.now(),
    };
    const sig = sign(params);
    const res = await axios.post(`${FUTURES_API_BASE}/fapi/v1/order`, null, {
      params: { ...params, signature: sig },
      headers: { "X-MBX-APIKEY": apiKey },
    });
    return res.data;
  } catch (e) {
    log(`❌ Order error for ${symbol}: ${e.response?.data?.msg || e.message}`);
    return null;
  }
};

const waitForOrderFill = async (symbol, orderId, maxWaitTime = 30000) => {
  const startTime = Date.now();

  while (Date.now() - startTime < maxWaitTime) {
    const orderStatus = await checkOrderStatus(symbol, orderId);

    if (!orderStatus) {
      log(`❌ Failed to check order status for ${symbol}`);
      return null;
    }

    if (orderStatus.status === "FILLED") {
      return orderStatus;
    }

    if (
      orderStatus.status === "CANCELED" ||
      orderStatus.status === "REJECTED"
    ) {
      log(`❌ Order ${orderStatus.status} for ${symbol}`);
      return null;
    }

    log(
      `⏳ Waiting for ${symbol} order to fill... Status: ${orderStatus.status}`
    );
    await new Promise((res) => setTimeout(res, 2000));
  }

  log(`⏰ Order fill timeout for ${symbol}`);
  return null;
};

const tradeBot = async () => {
  const precisionMap = await getPrecisionMap();

  while (true) {
    const balance = await getBalance();
    log(`💰 Current Balance: $${balance.toFixed(2)}`);

    if (balance < MIN_BALANCE) {
      log("❗ Balance too low for trading (< $5). Waiting...");
      await new Promise((res) => setTimeout(res, 5000));
      continue;
    }

    for (const symbol of SYMBOLS) {
      const precision = precisionMap[symbol];
      let currentPrice;

      // Skip if we have a pending order for this symbol
      if (pendingOrders[symbol]) {
        log(`⏸️ Skipping ${symbol} - pending order in progress`);
        continue;
      }

      try {
        const res = await axios.get(
          `${FUTURES_API_BASE}/fapi/v1/ticker/price`,
          {
            params: { symbol },
          }
        );
        currentPrice = parseFloat(res.data.price);
      } catch (err) {
        log(`❌ Price fetch failed for ${symbol}: ${err.message}`);
        continue;
      }

      if (!coinStates[symbol]) {
        // Check balance again right before placing order
        const currentBalance = await getBalance();
        if (currentBalance < TRADE_AMOUNT) {
          log(
            `⚠️ Insufficient balance for ${symbol} (need $${TRADE_AMOUNT}, have $${currentBalance.toFixed(
              2
            )})`
          );
          continue;
        }

        const quantity = parseFloat(
          (TRADE_AMOUNT / currentPrice).toFixed(precision)
        );

        // Mark as pending to prevent duplicate orders
        pendingOrders[symbol] = true;

        const buyOrder = await placeOrder(symbol, "BUY", quantity);

        if (buyOrder) {
          if (buyOrder.status === "FILLED") {
            // Order filled immediately
            coinStates[symbol] = {
              buyPrice: parseFloat(buyOrder.fills[0].price), // Use actual fill price
              quantity: parseFloat(buyOrder.executedQty),
              targetPrice:
                parseFloat(buyOrder.fills[0].price) * (1 + PROFIT_TARGET),
            };
            log(
              `✅ BOUGHT ${buyOrder.executedQty} ${symbol} @ ${
                buyOrder.fills[0].price
              } | Target: ${coinStates[symbol].targetPrice.toFixed(6)}`
            );
          } else {
            // Order placed but not filled immediately
            log(
              `⚠️ Order placed but not filled immediately for ${symbol} | OrderID: ${buyOrder.orderId}`
            );

            // Wait for order to fill
            const filledOrder = await waitForOrderFill(
              symbol,
              buyOrder.orderId
            );

            if (filledOrder) {
              coinStates[symbol] = {
                buyPrice: parseFloat(filledOrder.avgPrice),
                quantity: parseFloat(filledOrder.executedQty),
                targetPrice:
                  parseFloat(filledOrder.avgPrice) * (1 + PROFIT_TARGET),
              };
              log(
                `✅ CONFIRMED FILLED ${filledOrder.executedQty} ${symbol} @ ${
                  filledOrder.avgPrice
                } | Target: ${coinStates[symbol].targetPrice.toFixed(6)}`
              );
            } else {
              log(`❌ Failed to confirm order fill for ${symbol}`);
            }
          }
        }

        // Clear pending flag
        delete pendingOrders[symbol];
      } else {
        // We have a position, check if we should sell
        const state = coinStates[symbol];
        const priceChangePercent = (
          ((currentPrice - state.buyPrice) / state.buyPrice) *
          100
        ).toFixed(2);

        log(
          `📊 ${symbol} | Buy: $${state.buyPrice.toFixed(
            6
          )} | Now: $${currentPrice.toFixed(
            6
          )} | Change: ${priceChangePercent}% | Target: $${state.targetPrice.toFixed(
            6
          )}`
        );

        const profitPercent = (currentPrice - state.buyPrice) / state.buyPrice;
        if (profitPercent >= PROFIT_TARGET) {
          // Mark as pending to prevent issues
          pendingOrders[symbol] = true;

          const sellOrder = await placeOrder(symbol, "SELL", state.quantity);

          if (sellOrder) {
            if (sellOrder.status === "FILLED") {
              const sellPrice = parseFloat(sellOrder.fills[0].price);
              const profit = (sellPrice - state.buyPrice) * state.quantity;
              log(
                `🎯 SOLD ${state.quantity} ${symbol} @ $${sellPrice.toFixed(
                  6
                )} | Profit: $${profit.toFixed(4)}`
              );

              delete coinStates[symbol];
              log(`🔄 ${symbol} cycle completed. Restarting from step 1...`);
            } else {
              // Wait for sell order to fill
              const filledSellOrder = await waitForOrderFill(
                symbol,
                sellOrder.orderId
              );

              if (filledSellOrder) {
                const sellPrice = parseFloat(filledSellOrder.avgPrice);
                const profit = (sellPrice - state.buyPrice) * state.quantity;
                log(
                  `🎯 SOLD ${state.quantity} ${symbol} @ $${sellPrice.toFixed(
                    6
                  )} | Profit: $${profit.toFixed(4)}`
                );

                delete coinStates[symbol];
                log(`🔄 ${symbol} cycle completed. Restarting from step 1...`);
              } else {
                log(`❌ Failed to confirm sell order for ${symbol}`);
              }
            }
          }

          // Clear pending flag
          delete pendingOrders[symbol];
        }
      }
    }

    await new Promise((res) => setTimeout(res, 2000));
  }
};

const initStateFromBinance = async () => {
  const positions = await getCurrentPositions();
  for (const symbol in positions) {
    const pos = positions[symbol];
    coinStates[symbol] = {
      buyPrice: pos.entryPrice,
      quantity: pos.quantity,
      targetPrice: pos.entryPrice * (1 + PROFIT_TARGET),
    };
    log(
      `♻️ Resumed position for ${symbol}: Qty ${pos.quantity}, Entry $${pos.entryPrice}`
    );
  }
};

log("🚀 Starting Trading Bot...");
log(
  `📋 Settings: Min Balance: $${MIN_BALANCE}, Trade Amount: $${TRADE_AMOUNT}, Profit Target: ${
    PROFIT_TARGET * 100
  }%`
);

initStateFromBinance().then(() => {
  tradeBot().catch((err) => {
    log(`💥 Bot crashed: ${err.message}`);
    process.exit(1);
  });
});
