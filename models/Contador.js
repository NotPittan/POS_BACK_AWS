const mongoose = require("mongoose");

const ContadorSchema = new mongoose.Schema({
  // El ID será "BOLETA", "FACTURA" o "PROFORMA"
  id: { type: String, required: true, unique: true },
  // El número correlativo actual
  seq: { type: Number, default: 0 },
});

module.exports = mongoose.model("Contador", ContadorSchema);
