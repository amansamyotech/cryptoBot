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

module.exports = {
  createTrade,
  getAllTrades,
  updateTrade,
};
