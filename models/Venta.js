const mongoose = require("mongoose");

const VentaSchema = new mongoose.Schema({
  codigo: { type: String, required: true, unique: true }, // BL-0001, FT-0001, etc.
  tipo: {
    type: String,
    enum: ["BOLETA", "FACTURA", "PROFORMA"],
    required: true,
  },
  items: [
    {
      nombre: String,
      cantidad: Number,
      precioTier: Number,
      precioUnidad: Number,
      subtotal: Number,
      tier: String,
      // Flags
      esTemporal: { type: Boolean, default: false },
      esPersonalizado: { type: Boolean, default: false },
    },
  ],
  cliente: {
    nombre: { type: String, default: "Cliente General" },
    documento: String, // DNI o RUC
    celular: String, // TELEFONO
  },
  total: { type: Number, required: true },
  descuento: { type: Number, default: 0 },
  pagoConTarjeta: { type: Boolean, default: false },
  metodoPago: {
    type: String,
    enum: ["EFECTIVO", "YAPE/PLIN", "TARJETA", "MIXTO", "PENDIENTE"],
    default: "PENDIENTE",
  },
  desglosePago: {
    efectivo: { type: Number, default: 0 },
    digital: { type: Number, default: 0 }, // Yape/Plin
    tarjeta: { type: Number, default: 0 },
  },
  estadoPago: {
    type: String,
    enum: ["PENDIENTE", "PAGADO", "CANCELADO", "EDITANDO"],
    default: "PENDIENTE",
  },
  estadoEntrega: {
    type: String,
    enum: ["PENDIENTE", "ENTREGADO"],
    default: "PENDIENTE",
  },
  fecha: { type: Date, default: Date.now }, // Filtro para "Hoy" y vendedores
});

module.exports = mongoose.model("Venta", VentaSchema);
