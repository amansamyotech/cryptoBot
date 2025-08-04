const axios = require("axios");
const crypto = require("crypto");

const accessKey = "460e56f22bedb4cbb9908603dcd6f7b1";
const secretKey = "31e4c0d4d894de2250c4e0c152cb8158";

function signParams(params, secretKey) {
  const queryString = Object.keys(params)
    .sort()
    .map((key) => `${key}=${params[key]}`)
    .join("&");

  return crypto
    .createHmac("sha256", secretKey)
    .update(queryString)
    .digest("hex");
}

async function getUsdtBalance() {
  const baseURL = "https://api.coinstore.com";
  const path = "/api/v1/account";
  const timestamp = Date.now();

  const params = {
    accessKey,
    timestamp,
  };

  params.sign = signParams(params, secretKey);

  try {
    const response = await axios.get(`${baseURL}${path}`, { params });
    const balances = response.data?.data || [];

    const usdt = balances.find((asset) => asset.asset === "USDT");
    const usdtBalance = parseFloat(usdt?.free || "0");
    return usdtBalance;
  } catch (error) {
    console.error(
      "Error fetching Coinstore balance:",
      error.response?.data || error.message
    );
    return 0;
  }
}

setTimeout(async () => {
  const balance = await getUsdtBalance();
  console.log(`balance`, balance);
}, 1000);
module.exports = { getUsdtBalance };
