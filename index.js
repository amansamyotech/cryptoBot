const express = require("express");
const mongoose = require("mongoose");
const tradeRoutes = require("./src/routes/tradeRoutes.js");
const buySellRoutes = require("./src/routes/buySellRoutes.js");
const dotenv = require("dotenv");

dotenv.config();

const app = express();

app.use(express.json());

mongoose
  .connect(process.env.MONGO_URI, {
    useNewUrlParser: true,
    useUnifiedTopology: true,
  })
  .then(() => console.log("✅ MongoDB connected"))
  .catch((err) => {
    console.error("❌ MongoDB connection error:", err);
    process.exit(1);
  });

// app.use("/api/trades", tradeRoutes);
app.use("/api/buySell", buySellRoutes);

app.get("/", (req, res) => {
  res.send("🚀 Trade API is running...");
});

const PORT = process.env.PORT || 3000;
app.listen(PORT, () => {
  console.log(`🚀 Server started on port port ${PORT}`);
});
