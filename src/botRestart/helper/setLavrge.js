const Binance = require("node-binance-api");
const axios = require("axios");
const { decideTradeDirection } = require("./decideTradeDirection.js");
const { checkOrders } = require("./orderCheckFun.js");
const { getUsdtBalance } = require("./helper/getBalance.js");
const { calculateROIPrices } = require("./helper/calculateRoi.js");

const API_ENDPOINT = "http://localhost:3000/api/buySell/";

const binance = new Binance().options({
  APIKEY: "whfiekZqKdkwa9fEeUupVdLZTNxBqP1OCEuH2pjyImaWt51FdpouPPrCawxbsupK",
  APISECRET: "E4IcteWOQ6r9qKrBZJoBy4R47nNPBDepVXMnS3Lf2Bz76dlu0QZCNh82beG2rHq4",
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