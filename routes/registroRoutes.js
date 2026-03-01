const express = require("express");
const router = express.Router();
const registroController = require("../controllers/registrosController");

// Ruta: POST /api/daily-records/bulk
router.post("/bulk", registroController.procesarCierreDiario);

module.exports = router;
