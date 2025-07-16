const axios = require("axios");
const BASE_URL = "http://localhost:3000/api/trades";

async function getCurrentPrice(symbol) {
  try {
    const response = await axios.get(
      `https://api.binance.com/api/v3/ticker/price?symbol=${symbol}`
    );
    return parseFloat(response.data.price);
  } catch (error) {
    console.error(`Error fetching price for ${symbol}:`, error.message);
    throw error;
  }
}
async function fetchTrades() {
  try {
    const response = await axios.get(BASE_URL);
    return response.data;
  } catch (error) {
    console.error("Error fetching trades:", error.message);
    throw error;
  }
}
async function updateTradeWithSell(tradeId, sellData) {
  try {
    const response = await axios.post(`${BASE_URL}/${tradeId}`, sellData);
    return response.data;
  } catch (error) {
    console.error(`Error updating trade ${tradeId}:`, error.message);
    throw error;
  }
}

function calculateProfit(buyPrice, sellPrice, quantity) {
  const buyAmount = parseFloat(buyPrice) * parseFloat(quantity);
  const sellAmount = parseFloat(sellPrice) * parseFloat(quantity);
  return sellAmount - buyAmount;
}

async function processUnsoldTrades() {
  try {
    console.log("Fetching trades...");
    const trades = await fetchTrades();

    if (!Array.isArray(trades)) {
      console.error("Expected trades to be an array");
      return;
    }

    console.log(`Found ${trades.length} trades`);

    const unsoldTrades = trades.filter((trade) => trade.isSell === false);
    console.log(`Found ${unsoldTrades.length} unsold trades`);

    for (const trade of unsoldTrades) {
      try {
        console.log(`Processing trade: ${trade._id} - ${trade.symbol}`);

        const currentPrice = await getCurrentPrice(trade.symbol);
        console.log(`Current price for ${trade.symbol}: ${currentPrice}`);
        const buyPrice = parseFloat(trade.buyPrice.$numberDecimal);
        const quantity = parseFloat(trade.quantity.$numberDecimal);
        const profit = calculateProfit(buyPrice, currentPrice, quantity);
        const sellData = {
          isSell: true,
          sellingPrice: currentPrice.toString(),
          sellQuantity: quantity.toString(),
          profit: profit.toString(),
        };

        console.log(
          `Selling ${quantity} ${trade.symbol} at ${currentPrice} (Profit: ${profit})`
        );

        await updateTradeWithSell(trade._id, sellData);
        console.log(`Successfully updated trade ${trade._id}`);
        await new Promise((resolve) => setTimeout(resolve, 1000));
      } catch (error) {
        console.error(`Error processing trade ${trade._id}:`, error.message);
        continue;
      }
    }

    console.log("Finished processing all unsold trades");
  } catch (error) {
    console.error("Error in processUnsoldTrades:", error.message);
  }
}

(async () => {
  console.log("Starting auto trade seller...");
  await processUnsoldTrades();
  console.log("Script completed");
})().catch(console.error);
