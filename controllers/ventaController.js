const Venta = require("../models/Venta");
const Contador = require("../models/Contador");

exports.crearVenta = async (req, res) => {
  try {
    const { tipo, items, cliente, total, estado, pagoConTarjeta } = req.body;

    let codigoFormateado;

    // Lógica especial para cancelaciones desde el carrito
    if (estado === "CANCELADA") {
      const contadorCan = await Contador.findOneAndUpdate(
        { id: "CANCELADOS" }, // Un solo contador para todas las cancelaciones
        { $inc: { seq: 1 } },
        { new: true, upsert: true },
      );
      // Resultado: CANC-0001
      codigoFormateado = `CANC-${contadorCan.seq.toString().padStart(4, "0")}`;
    } else {
      // Lógica normal para ventas (BOLETA, FACTURA, PROFORMA)
      let prefijo = "BL";
      if (tipo === "FACTURA") prefijo = "FT";
      if (tipo === "PROFORMA") prefijo = "PF";

      const contador = await Contador.findOneAndUpdate(
        { id: tipo },
        { $inc: { seq: 1 } },
        { new: true, upsert: true },
      );
      codigoFormateado = `${prefijo}-${contador.seq.toString().padStart(4, "0")}`;
    }

    const nuevaVenta = new Venta({
      codigo: codigoFormateado,
      tipo: tipo || "BOLETA", // Valor por defecto si no se eligió tipo
      items,
      cliente: {
        nombre: cliente.nombre,
        documento: cliente.documento,
        celular: cliente.celular || "", // Valor por defecto si no se proporcionó celular
      },
      total,
      pagoConTarjeta: pagoConTarjeta || false, // Valor por defecto si no se proporcionó
      estadoPago: estado || "PENDIENTE",
    });

    await nuevaVenta.save();
    res.status(201).json(nuevaVenta);
  } catch (error) {
    console.error("Error al crear venta:", error);
    res
      .status(500)
      .json({ mensaje: "Error al crear la venta", error: error.message });
  }
};

// 1. Obtener solo pedidos para la Vista de Caja (Pendientes de Pago o Entrega)
exports.obtenerPendientes = async (req, res) => {
  try {
    const pedidos = await Venta.find({
      // Filtro: No mostrar canceladas ni las que están en edición
      estadoPago: { $nin: ["CANCELADO", "EDITANDO"] },
      // Lógica: Mostrar si falta el pago O falta la entrega
      $or: [
        { estadoPago: { $ne: "PAGADO" } },
        { estadoEntrega: { $ne: "ENTREGADO" } },
      ],
    }).sort({ createdAt: -1 });

    res.json(pedidos);
  } catch (error) {
    res
      .status(500)
      .json({ mensaje: "Error al obtener pendientes", error: error.message });
  }
};

// 2. Actualizar estados individualmente (Pago o Entrega)
exports.actualizarEstadosCaja = async (req, res) => {
  try {
    const { id } = req.params;
    const {
      estadoPago,
      desglosePago,
      pagoConTarjeta,
      descuento,
      estadoEntrega,
    } = req.body;

    const ventaActual = await Venta.findById(id);
    if (!ventaActual)
      return res.status(404).json({ mensaje: "Venta no encontrada" });

    // 1. Lógica de Descuento (NUEVO)
    if (descuento !== undefined) {
      ventaActual.descuento = Number(descuento);
    }

    // 2. Lógica de recargo por tarjeta
    if (pagoConTarjeta !== undefined) {
      ventaActual.pagoConTarjeta = pagoConTarjeta;
      ventaActual.desglosePago = { efectivo: 0, digital: 0, tarjeta: 0 };
      ventaActual.estadoPago = "PENDIENTE";
    }

    // 3. Procesar el desglose de pago (Abonos)
    if (desglosePago) {
      ventaActual.desglosePago.efectivo += Number(desglosePago.efectivo || 0);
      ventaActual.desglosePago.digital += Number(desglosePago.digital || 0);
      ventaActual.desglosePago.tarjeta += Number(desglosePago.tarjeta || 0);

      const { efectivo, digital, tarjeta } = ventaActual.desglosePago;
      const totalAcumulado = efectivo + digital + tarjeta;

      // CÁLCULO CRUCIAL: Total Real = (Base * Recargo) - Descuento
      const totalBaseConRecargo = ventaActual.pagoConTarjeta
        ? ventaActual.total * 1.05
        : ventaActual.total;

      const totalFinalADeber = totalBaseConRecargo - ventaActual.descuento;

      // Verificamos si ya completó el pago con el descuento aplicado
      if (totalAcumulado >= totalFinalADeber - 0.01) {
        ventaActual.estadoPago = "PAGADO";
      } else {
        ventaActual.estadoPago = "PENDIENTE";
      }

      // Determinar nombre del método
      let metodosCount = [efectivo, digital, tarjeta].filter(
        (m) => m > 0,
      ).length;
      if (metodosCount > 1) ventaActual.metodoPago = "MIXTO";
      else if (efectivo > 0) ventaActual.metodoPago = "EFECTIVO";
      else if (digital > 0) ventaActual.metodoPago = "YAPE/PLIN";
      else if (tarjeta > 0) ventaActual.metodoPago = "TARJETA";
    }

    // Revertir pago manual
    if (estadoPago === "PENDIENTE") {
      ventaActual.estadoPago = "PENDIENTE";
      ventaActual.desglosePago = { efectivo: 0, digital: 0, tarjeta: 0 };
      ventaActual.descuento = 0; // Opcional: resetear descuento al resetear pago
      ventaActual.metodoPago = "PENDIENTE";
    }

    if (estadoEntrega) {
      ventaActual.estadoEntrega = estadoEntrega;
    }

    await ventaActual.save();
    res.json(ventaActual);
  } catch (error) {
    console.error(error);
    res
      .status(500)
      .json({ mensaje: "Error al actualizar", error: error.message });
  }
};
