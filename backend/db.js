const mongoose = require("mongoose");

mongoose.connect(
  "mongodb+srv://dsamyotech:RshvPx3EyS51nOEr@cluster0.wp1itfp.mongodb.net/nbitAi?retryWrites=true&w=majority&appName=Cluster0",
  {
    useNewUrlParser: true,
    useUnifiedTopology: true,
  }
);

module.exports = mongoose;
