const { AsyncResource } = require("async_hooks");
const Trade = require("../models/Trade");

const createTrade = async (data) => {
  const trade = new Trade(data);
  return await trade.save();
};

const getAllTrades = async () => {
  return await Trade.find().sort({ createdAt: -1 });
};

const updateTrade = async (id, updateData) => {
  return await Trade.findByIdAndUpdate(id, updateData, {
    new: true,
    runValidators: true,
  });
};
const checkSymbols = async (symbol) => {
  // const results = [];

  try {
    const trades = await Trade.find({ symbol, status: "0" });

    if (trades.length > 0) {
      //dont buy becouse status 0 meens tread already open
      console.log(`No trades found for symbol: ${symbol}`);

      return { symbol, status: false };
      // results.push({ symbol, status: false });
    } else {
      //condition for buy this symbols
      console.log(`Found trades for symbol: ${symbol}`);
      return { symbol, status: true };
    }
  } catch (error) {
    console.error(`Error finding symbol ${symbol}:`, error);
    return { symbol, status: false };
  }

  // for (const symbol of symbols) {
  //   try {
  //     const trades = await Trade.find({ symbol, status: "0" });
  //     if (trades.length > 0) {
  //       //dont buy becouse status 0 meens tread already open
  //       console.log(`Found trades for symbol: ${symbol}`);
  //       results.push({ symbol, status: false });
  //     } else {
  //       //condition for buy this symbols
  //       results.push({ symbol, status: true });
  //       console.log(`No trades found for symbol: ${symbol}`);
  //     }
  //   } catch (error) {
  //     results = [];
  //     console.error(`Error finding symbol ${symbol}:`, error);
  //   }
  // }

  return results;
};
module.exports = {
  createTrade,
  getAllTrades,
  updateTrade,
  checkSymbols,
};
