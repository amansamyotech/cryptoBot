const express = require("express");
const router = express.Router();
const tradeController = require("../controller/tradeController.js");

router.post("/", tradeController.createTrade);
router.get("/", tradeController.getAllTrades);
router.get("/treadCount", tradeController.getCountOfOpenTread);
router.put("/:id", tradeController.updateTrade);
router.post('/check-symbols', tradeController.checkSymbols);



module.exports = router;
