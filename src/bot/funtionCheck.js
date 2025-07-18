const axios = require("axios");
const crypto = require("crypto");

const apiKey =
  "6bd1UA2kXR2lgLPv1pt9bNEOJE70h1MbXMvmoH1SceWUNw0kvXAQEdigQUgfNprI";
const apiSecret =
  "4zHQjwWb8AopnJx0yPjTKBNpW3ntoLaNK7PnbJjxwoB8ZSeaAaGTRLdIKLsixmPR";

const FUTURES_API_BASE = "https://fapi.binance.com";

const params = {
  symbol: "1000BONKUSDT",
  orderId: "11568109200",
  timestamp: Date.now(),
};

const sign = (params) => {
  const query = new URLSearchParams(params).toString();
  return crypto.createHmac("sha256", apiSecret).update(query).digest("hex");
};

// const signature = sign(params);
// console.log("signature", signature);

const getTradeDetailsAndPrint = async (apiKey, apiSecret, symbol, orderId) => {
  try {
    const timestamp = Date.now();

    const params = {
      symbol,
      orderId,
      timestamp,
    };

    const query = new URLSearchParams(params).toString();

    const signature = crypto
      .createHmac("sha256", apiSecret)
      .update(query)
      .digest("hex");

    const url = `${FUTURES_API_BASE}/fapi/v1/userTrades?${query}&signature=${signature}`;

    const res = await axios.get(url, {
      headers: {
        "X-MBX-APIKEY": apiKey,
      },
    });

    const trades = res.data;

    console.log(`✅ Trade details for order ${orderId}:`);
    console.log(trades);

    const totalFee = trades.reduce(
      (sum, trade) => sum + parseFloat(trade.commission),
      0
    );
    const feeAsset = trades[0]?.commissionAsset || "N/A";

    console.log(`💰 Total Fee: ${totalFee} ${feeAsset}`);
  } catch (error) {
    console.error("❌ Failed to fetch trade details:");
    console.error(error.response?.data || error.message);
  }
};

const checkOrderStatus = async (symbol, orderId) => {
  try {
    const params = {
      symbol,
      orderId,
      timestamp: Date.now(),
    };
    const sig = sign(params);
    const res = await axios.get(`${FUTURES_API_BASE}/fapi/v1/order`, {
      params: { ...params, signature: sig },
      headers: { "X-MBX-APIKEY": apiKey },
    });
    console.log(res.data);
    
    return res.data;
  } catch (e) {
    log(`❌ Order status check error: ${e.response?.data?.msg || e.message}`);
    throw e;
  }
};

// getTradeDetailsAndPrint(apiKey, apiSecret, "1000BONKUSDT", "11568109200");
checkOrderStatus("1000BONKUSDT", "11568109200");
