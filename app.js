require("dotenv").config();
const express = require("express");
const mongoose = require("mongoose");
const cors = require("cors");
const productoRoutes = require("./routes/productoRoutes");
const app = express();

// --- Middlewares Globales ---
app.use(cors({ origin: "*" }));
app.use(express.json());

// --- Definición de Rutas API ---
app.use("/api/ventas", require("./routes/ventaRoutes"));
app.use("/api/productos", require("./routes/productoRoutes"));

// --- Persistencia de Datos (MongoDB) ---
mongoose
  .connect(process.env.MONGO_URI)
  .then(() => console.log("✅ Database: Conexión establecida exitosamente"))
  .catch((err) =>
    console.error("❌ Database: Error de conexión crítico:", err),
  );

app.get("/", (req, res) => res.send("API POS Service Online 🚀"));

// --- Inicialización del Servidor en Red Local ---
const PORT = process.env.PORT || 5000;
app.listen(PORT, "0.0.0.0", () => {
  console.log(
    `🚀 Gateway: Servidor activo en puerto ${PORT} (Acceso Red Local habilitado)`,
  );
});
