const Registro = require("../models/Registro");

exports.procesarCierreDiario = async (req, res) => {
  try {
    const { data } = req.body;

    if (!data || data.length === 0) {
      return res.status(200).json({ mensaje: "Sin datos" }); // 200 para evitar errores innecesarios en el front
    }

    const registrosAdaptados = data.map((r) => ({
      tipo: r.type,
      entidad: r.entity,
      monto: r.amount,
      metodo: r.paymentMethod,
      timestamp: r.timestamp,
    }));

    await Registro.insertMany(registrosAdaptados);

    res.status(201).json({
      mensaje: "Sincronización exitosa",
      cantidad: registrosAdaptados.length,
    });
  } catch (error) {
    console.error("Error en Cierre Diario:", error);
    res.status(500).json({ error: "Error interno del servidor" });
  }
};
