const mongoose = require("mongoose");

const ProductoSchema = new mongoose.Schema(
  {
    // CAMBIO IMPORTANTE: Usamos 'Mixed' para que acepte Números Y Textos sin forzar conversión
    BARCODE: { type: mongoose.Schema.Types.Mixed, default: "" },
    SKU: { type: mongoose.Schema.Types.Mixed, default: "" },

    MARCA: { type: String, default: "" },
    PRODUCTO: { type: String, required: true },
    STOCK: { type: Number, default: 0 },
    PRECIO_UNIDAD: { type: Number, required: true },
    PRECIO_DOCENA: { type: Number, default: 0 },
    PRECIO_CENTENA: { type: Number, default: 0 },
    PRECIO_MILLAR: { type: Number, default: 0 },
  },
  { timestamps: true, strict: false },
);

// Creamos un índice de texto para que las búsquedas sean instantáneas
ProductoSchema.index({ PRODUCTO: "text", SKU: "text", BARCODE: "text" });

module.exports = mongoose.model("Producto", ProductoSchema);
