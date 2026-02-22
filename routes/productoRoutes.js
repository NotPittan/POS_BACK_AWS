const express = require("express");
const router = express.Router();
const productoController = require("../controllers/productoController");

router.get("/buscar", productoController.buscarProductos);
router.get("/", productoController.obtenerTodos); // Para cargar la tabla
router.post("/", productoController.crearProducto); // Para agregar un nuevo producto desde el formulario
router.put("/masivo", productoController.operacionMasiva); // Para cambios a todo el inventario
router.put("/:id", productoController.actualizarProducto); // Para editar una fila

module.exports = router;
