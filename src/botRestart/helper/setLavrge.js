const Binance = require("node-binance-api");
const axios = require("axios");
const { decideTradeDirection } = require("../decideTradeFuntion.js")
const { checkOrders } = require("../orderCheckFun.js");
const { getUsdtBalance } = require("./getBalance.js");
const { calculateROIPrices } = require("./calculateRoi.js");

const API_ENDPOINT = "http://localhost:3000/api/buySell/";

const binance = new Binance().options({
  APIKEY: "tPCOyhkpaVUj6it6BiKQje0WxcJjUOV30EQ7dY2FMcqXunm9DwC8xmuiCkgsyfdG",
  APISECRET: "UpK4CPfKywFrAJDInCAXPmWVSiSs5xVVL2nDes8igCONl3cVgowDjMbQg64fm5pr",
  useServerTime: true,
  test: false,
});

const symbols = [
  "1000PEPEUSDT",
  "1000BONKUSDT",
  "DOGEUSDT",
  "CKBUSDT",
  "1000FLOKIUSDT",
];
const interval = "1m";
const leverage = 3;
const STOP_LOSS_ROI = -1;
const TAKE_PROFIT_ROI = 2;



 async function setLeverage(symbol) {
  try {
    await binance.futuresLeverage(symbol, leverage);
    console.log(`Leverage set to ${leverage}x for ${symbol}`);
  } catch (err) {
    console.error(`Failed to set leverage for ${symbol}:`, err.body);
  }
}

module.exports = { setLeverage };