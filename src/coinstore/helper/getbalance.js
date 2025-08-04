const axios = require("axios");
const crypto = require("crypto");
const tough = require("tough-cookie");
const axiosCookieJarSupport = require("axios-cookiejar-support").default;

const apiKey = "460e56f22bedb4cbb9908603dcd6f7b1"; 
const secretKey = "31e4c0d4d894de2250c4e0c152cb8158";


axiosCookieJarSupport(axios);
const cookieJar = new tough.CookieJar();

async function getUsdtBalance() {
  const url = "https://api.coinstore.com/api/spot/accountList";

  const expires = Date.now();
  const expiresKey = Math.floor(expires / 30000).toString();

  const hashedKey = crypto
    .createHmac("sha256", secretKey)
    .update(expiresKey)
    .digest("hex");

  const payload = JSON.stringify({});
  const signature = crypto
    .createHmac("sha256", Buffer.from(hashedKey, "hex"))
    .update(payload)
    .digest("hex");

  const headers = {
    "X-CS-APIKEY": apiKey,
    "X-CS-SIGN": signature,
    "X-CS-EXPIRES": expires.toString(),
    "Content-Type": "application/json",
    "Accept": "application/json",
    "exch-language": "en_US",
  };

  try {
    const response = await axios.post(url, payload, {
      headers,
      withCredentials: true,
      jar: cookieJar, 
      httpsAgent: new (require("https").Agent)({ rejectUnauthorized: false }),
    });
    const balances = response.data?.data || [];

    const usdtBalance = balances
      .filter((entry) => entry.currency === "USDT")
      .reduce((total, entry) => total + parseFloat(entry.balance || 0), 0);

    console.log(`✅ USDT Balance: ${usdtBalance}`);
    return usdtBalance;
  } catch (error) {
    console.error(
      "❌ Error fetching Coinstore balance:",
      error.response?.data || error.message
    );
    return 0;
  }
}

getUsdtBalance();

module.exports = { getUsdtBalance };