const { AsyncResource } = require("async_hooks");
const Trade = require("../models/Trade");
const BuySell = require("../models/BuySell.js");

const createTrade = async (data) => {
  const trade = new BuySell(data);
  return await trade.save();
};

const getAllTrades = async () => {
  return await BuySell.find().sort({ createdAt: -1 });
};

const updateTrade = async (id, updateData) => {
  return await BuySell.findByIdAndUpdate(id, updateData, {
    new: true,
    runValidators: true,
  });
};
const checkSymbols = async (symbol) => {
  try {
    const trades = await BuySell.find({ symbol, status: "0" });

    if (trades.length > 0) {
      //dont buy becouse status 0 meens tread already open
      console.log(`No trades found for symbol: ${symbol}`);

      return { symbol, trades, status: false };
      // results.push({ symbol, status: false });
    } else {
      //condition for buy this symbols
      console.log(`Found trades for symbol: ${symbol}`);
      return { symbol, trades, status: true };
    }
  } catch (error) {
    console.error(`Error finding symbol ${symbol}:`, error);
    return { symbol, status: false };
  }
};

const getCountOfOpenTread = async () => {
  const treadCount = await BuySell.countDocuments({ status: "0" });

  return treadCount;
};

const getDetailsWithSymbol = async (symbol) => {
  try {
    const trades = await BuySell.find({ symbol, status: "0" });

    if (trades.length > 0) {
      const trade = trades[0];
      const tradeDetails = {
        stopLossOrderId: trade.stopLossOrderId,
        takeProfitOrderId: trade.profitOrderId,
        objectId: trade._id,
      };
      //get open trades
      return { symbol, tradeDetails, found: true };
    } else {
      console.log(`Found trades for symbol: ${symbol}`);
      return { symbol, found: false };
    }
  } catch (error) {
    console.error(`Error finding symbol ${symbol}:`, error);
  }
};
module.exports = {
  createTrade,
  getAllTrades,
  updateTrade,
  checkSymbols,
  getCountOfOpenTread,
  getDetailsWithSymbol,
};
