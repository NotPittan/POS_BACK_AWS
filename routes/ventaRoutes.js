const express = require("express");
const router = express.Router();
const ventaController = require("../controllers/ventaController");

// Ruta para que el mostrador envíe la venta
router.post("/", ventaController.crearVenta);
router.get("/pendientes", ventaController.obtenerPendientes); // Nueva ruta para Caja
router.patch("/:id/estados", ventaController.actualizarEstadosCaja);

module.exports = router;
