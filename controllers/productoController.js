const Producto = require("../models/Producto");

exports.buscarProductos = async (req, res) => {
  try {
    const { q } = req.query;
    if (!q) return res.json([]);

    const termino = q.trim();

    // --- NUEVO: LÓGICA DE BÚSQUEDA POR PALABRAS PARA EL NOMBRE ---
    // Esto permite que "lapicero azul" encuentre "LAPICERO FABER AZUL"
    const palabras = termino.split(/\s+/).filter((p) => p.length > 0);
    const condicionNombreCerebral = {
      $and: palabras.map((p) => ({
        PRODUCTO: { $regex: `\\b${p}`, $options: "i" },
      })),
    };

    // 1. CONDICIONES BÁSICAS (Actualizado)
    let condiciones = [
      { BARCODE: termino },
      { SKU: termino },
      condicionNombreCerebral, // CAMBIO: Usamos la lógica de palabras en vez del regex simple
    ];

    // 2. LÓGICA DE SKU FLEXIBLE (Para 'VB0001' encontrando 'VB-0001')
    const terminoSafe = termino.replace(/[.*+?^${}()|[\]\\]/g, "\\$&");
    const patronFlexible = terminoSafe.split("").join("[\\W_]*");
    condiciones.push({ SKU: { $regex: `^${patronFlexible}$`, $options: "i" } });

    // 3. LÓGICA "DESORDENADA" (NUEVO: Para '0001vb' o '0001')
    // Separa los números y las letras del término de búsqueda
    // Ejemplo: "0001vb" se convierte en ["0001", "vb"]
    const gruposNumeros = termino.match(/\d+/g);
    const gruposLetras = termino.match(/[a-zA-Z]+/g);

    if (gruposNumeros || gruposLetras) {
      const partes = [];
      if (gruposNumeros) partes.push(...gruposNumeros);
      if (gruposLetras) partes.push(...gruposLetras);

      if (partes.length > 0) {
        // Le decimos a la base de datos:
        // "Dame el producto cuyo SKU contenga '0001' Y TAMBIÉN contenga 'vb'"
        // No importa si está al principio, al final o en medio.
        const condicionesPartes = partes.map((part) => ({
          SKU: { $regex: part, $options: "i" },
        }));

        condiciones.push({ $and: condicionesPartes });
      }
    }

    // 4. BÚSQUEDA NUMÉRICA (Por si acaso se guardó como número)
    if (!isNaN(termino)) {
      const valorNumerico = Number(termino);
      condiciones.push({ BARCODE: valorNumerico });
      condiciones.push({ SKU: valorNumerico });
    }

    const productos = await Producto.find({
      $or: condiciones,
    }).limit(20);

    res.json(productos);
  } catch (error) {
    console.error("Error búsqueda:", error);
    res.status(500).json({ mensaje: "Error", error: error.message });
  }
};

// 1. Obtener todos los productos
exports.obtenerTodos = async (req, res) => {
  try {
    const productos = await Producto.find().sort({ updatedAt: -1 });
    res.json(productos);
  } catch (error) {
    res.status(500).json({ mensaje: "Error al obtener inventario" });
  }
};

// 2. Actualizar un producto
exports.actualizarProducto = async (req, res) => {
  try {
    const producto = await Producto.findByIdAndUpdate(
      req.params.id,
      { $set: req.body },
      { new: true, runValidators: true },
    );
    res.json(producto);
  } catch (error) {
    res.status(500).json({ mensaje: "Error al actualizar producto" });
  }
};

// 3. Operación Masiva
exports.operacionMasiva = async (req, res) => {
  try {
    const { campo, valor, operacion } = req.body;
    let updateQuery = {};
    if (operacion === "SET") updateQuery = { $set: { [campo]: valor } };
    if (operacion === "UNSET") updateQuery = { $unset: { [campo]: "" } };
    if (operacion === "INC") updateQuery = { $inc: { [campo]: valor } };

    const resultado = await Producto.updateMany({}, updateQuery);
    res.json({ mensaje: "Operación masiva completada", detalles: resultado });
  } catch (error) {
    res.status(500).json({ mensaje: "Error en operación masiva" });
  }
};

// 4. Crear un nuevo producto

exports.crearProducto = async (req, res) => {
  try {
    // Recibimos el objeto dinámico del front
    const nuevoProducto = new Producto(req.body);

    // Guardamos en MongoDB
    const productoGuardado = await nuevoProducto.save();

    res.status(201).json(productoGuardado);
  } catch (error) {
    console.error("Error al crear producto:", error);
    res.status(500).json({
      mensaje: "Error al registrar el producto",
      error: error.message,
    });
  }
};
