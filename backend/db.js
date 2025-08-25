const mongoose = require("mongoose");

mongoose
  .connect(
    "mongodb+srv://dsamyotech:RshvPx3EyS51nOEr@cluster0.wp1itfp.mongodb.net/nbitAi?retryWrites=true&w=majority&appName=Cluster0",
    {
      useNewUrlParser: true,
      useUnifiedTopology: true,
    }
  )
  .then(() => {
    console.log("✅ MongoDB connected successfully.");
  })
  .catch((err) => {
    console.error("❌ MongoDB connection error:", err);
  });

module.exports = mongoose;
