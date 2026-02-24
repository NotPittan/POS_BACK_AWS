const Producto = require("../models/Producto");

exports.buscarProductos = async (req, res) => {
  try {
    const { q } = req.query;
    if (!q) return res.json([]);

    const termino = q.trim();

    // --- CAMBIO 1: BÚSQUEDA POR PALABRAS SUELTAS (AZUL 031) ---
    // Dividimos el texto en palabras para que no importe el orden
    const palabras = termino.split(/\s+/).filter((p) => p.length > 0);

    // Esta condición obliga a que el producto tenga TODAS las palabras escritas
    const condicionNombreCerebral = {
      $and: palabras.map((p) => {
        // Escapamos caracteres especiales por seguridad
        const pSafe = p.replace(/[.*+?^${}()|[\]\\]/g, "\\$&");

        return {
          // Usamos \\b para marcar el inicio de la palabra
          // Esto evita que "cola" coincida con "escolar"
          PRODUCTO: { $regex: `\\b${pSafe}`, $options: "i" },
        };
      }),
    };

    // --- CAMBIO 2: INTEGRACIÓN DE CONDICIONES ---
    let condiciones = [
      { BARCODE: termino },
      { SKU: termino },
      condicionNombreCerebral, // Aquí aplicamos la nueva lógica de nombre
    ];

    // --- CAMBIO 3: SKU FLEXIBLE (VB07 -> VB_0007) ---
    // Esto permite encontrar el SKU aunque falten guiones o ceros
    const terminoSafe = termino.replace(/[.*+?^${}()|[\]\\]/g, "\\$&");
    const patronFlexible = terminoSafe.split("").join("[\\W_]*");
    condiciones.push({ SKU: { $regex: patronFlexible, $options: "i" } });

    // --- CAMBIO 4: LÓGICA DESORDENADA PARA SKU (0001VB) ---
    const gruposNumeros = termino.match(/\d+/g);
    const gruposLetras = termino.match(/[a-zA-Z]+/g);

    if (gruposNumeros && gruposLetras) {
      const partes = [...gruposNumeros, ...gruposLetras];
      const condicionesPartes = partes.map((part) => ({
        SKU: { $regex: part, $options: "i" },
      }));
      condiciones.push({ $and: condicionesPartes });
    }

    // Ejecución final con todas las mejoras
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
