const mongoose = require("mongoose");

const RegistroSchema = new mongoose.Schema({
  tipo: { type: String, enum: ["VENTA", "GASTO", "PROVEEDOR"], required: true },
  entidad: { type: String, required: true },
  monto: { type: Number, required: true },
  metodo: { type: String, required: true },
  timestamp: { type: Date, required: true },
  creadoEn: { type: Date, default: Date.now },
});

// El primer argumento es el nombre de la COLECCIÓN en la base de datos
module.exports = mongoose.model("Registro", RegistroSchema);
