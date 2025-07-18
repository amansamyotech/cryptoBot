const tradeService = require("../service/tradeService.js");

const createTrade = async (req, res) => {
  const { data } = req.body;

  try {
    const trade = await tradeService.createTrade(data);
    res.status(201).json(trade);
  } catch (error) {
    console.error("Error creating trade:", error);
    res.status(500).json({ error: "Internal Server Error" });
  }
};

const getAllTrades = async (req, res) => {
  try {
    const trades = await tradeService.getAllTrades();
    res.status(200).json(trades);
  } catch (error) {
    console.error("Error fetching trades:", error);
    res.status(500).json({ error: "Internal Server Error" });
  }
};
const getCountOfOpenTread = async (req, res) => {
  try {
    const trades = await tradeService.getCountOfOpenTread();
    res.status(200).json(trades);
  } catch (error) {
    console.error("Error fetching trades:", error);
    res.status(500).json({ error: "Internal Server Error" });
  }
};
const updateTrade = async (req, res) => {
  try {
    const { id } = req.params;
    const { data } = req.body;
    const updatedTrade = await tradeService.updateTrade(id, data);

    if (!updatedTrade) {
      return res.status(404).json({ error: "Trade not found" });
    }

    res.status(200).json(updatedTrade);
  } catch (error) {
    console.error("Error updating trade:", error);
    res.status(500).json({ error: "Internal Server Error" });
  }
};
const checkSymbols = async (req, res) => {
  try {
    const { symbols } = req.body;

    const foundSymbols = await tradeService.checkSymbols(symbols);

    return res.status(200).json({ data: foundSymbols });
  } catch (error) {
    console.error("Error checking symbols:", error);
    return res.status(500).json({ error: "Internal Server Error" });
  }
};

module.exports = {
  createTrade,
  getAllTrades,
  updateTrade,
  checkSymbols,
  getCountOfOpenTread
};
