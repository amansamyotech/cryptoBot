require("dotenv").config({ path: "../../.env" });
const Binance = require("node-binance-api");

const binance = new Binance().options({
  APIKEY: process.env.BINANCE_APIKEY,
  APISECRET: process.env.BINANCE_SECRETKEY,
  useServerTime: true,
  test: false,
});

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

module.exports = { getUsdtBalance };
