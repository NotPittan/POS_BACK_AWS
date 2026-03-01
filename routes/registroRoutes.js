const express = require("express");
const router = express.Router();
const registroController = require("../controllers/registroController");

// Ruta: POST /api/daily-records/bulk
router.post("/bulk", registroController.procesarCierreDiario);

module.exports = router;
