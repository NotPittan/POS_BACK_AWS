const { jsPDF } = require("jspdf");
const autoTable = require("jspdf-autotable");
const nodemailer = require("nodemailer");
const { Client, LocalAuth, MessageMedia } = require("whatsapp-web.js");
const qrcode = require("qrcode-terminal");

// 1. Configuración estable del cliente
const client = new Client({
  authStrategy: new LocalAuth(),
  puppeteer: {
    headless: true,
    args: [
      "--no-sandbox",
      "--disable-setuid-sandbox",
      "--disable-dev-shm-usage",
      "--disable-gpu",
      "--no-zygote",
      "--single-process",
      "--disable-extensions",
    ],
  },
});

client.on("qr", (qr) => {
  console.log("--- ESCANEA ESTE QR CON TU WHATSAPP ---");
  qrcode.generate(qr, { small: true });
});

client.on("ready", () => console.log("✅ WhatsApp: Cliente listo"));
client.initialize();

exports.generarYEnviarReporte = async (data, emailDestino) => {
  try {
    const doc = new jsPDF();
    const ahora = new Date();
    const fechaStr = ahora.toLocaleDateString("es-PE");
    const renderTable = autoTable.default || autoTable;

    // --- ENCABEZADO ---
    doc.setFontSize(22);
    doc.setTextColor(30, 41, 59);
    doc.text("LIBRERÍA LEO", 105, 20, { align: "center" });
    doc.setFontSize(10);
    doc.text(`CIERRE CONTABLE DEFINITIVO - ${fechaStr}`, 105, 27, {
      align: "center",
    });
    doc.line(20, 30, 190, 30);

    let yPos = 38;

    const dibujarTabla = (titulo, items, colorRGB) => {
      if (items.length === 0) return;
      doc.setFontSize(14);
      doc.setTextColor(colorRGB[0], colorRGB[1], colorRGB[2]);
      doc.text(titulo, 20, yPos);
      const rows = items.map((r) => [
        r.entity,
        `S/ ${r.amount.toFixed(2)}`,
        r.paymentMethod,
        r.displayTime || "N/A",
      ]);
      renderTable(doc, {
        startY: yPos + 4,
        head: [["CONCEPTO", "MONTO", "MÉTODO", "HORA"]],
        body: rows,
        theme: "striped",
        headStyles: { fillColor: colorRGB },
        styles: { fontSize: 8 },
      });
      yPos = doc.lastAutoTable.finalY + 12;
    };

    const ventas = data.filter((r) => r.type === "VENTA");
    const gastos = data.filter((r) => r.type === "GASTO");
    const proveedores = data.filter((r) => r.type === "PROVEEDOR");

    dibujarTabla("INGRESOS (VENTAS)", ventas, [16, 185, 129]);
    dibujarTabla("GASTOS OPERATIVOS", gastos, [239, 68, 68]);
    dibujarTabla("PAGOS A PROVEEDORES", proveedores, [139, 92, 246]);

    // --- LÓGICA CONTABLE DETALLADA ---
    const calc = (arr, method) =>
      arr
        .filter((i) => i.paymentMethod === method)
        .reduce((a, r) => a + r.amount, 0);

    // Desglose Ventas
    const vEf = calc(ventas, "EFECTIVO");
    const vYa = calc(ventas, "YAPE / PLIN");
    const vTa = calc(ventas, "TARJETA");
    const totalVentas = vEf + vYa + vTa;

    // Desglose Egresos (Gastos + Prov)
    const egresos = [...gastos, ...proveedores];
    const eEf = calc(egresos, "EFECTIVO");
    const eYa = calc(egresos, "YAPE / PLIN");
    const eTa = calc(egresos, "TARJETA");
    const totalEgresos = eEf + eYa + eTa;

    // Cuadre final
    const efectivoEnCaja = vEf - eEf; // Lo que debería haber físicamente
    const balanceNeto = totalVentas - totalEgresos; // Ganancia total del día

    if (yPos > 210) {
      doc.addPage();
      yPos = 20;
    }
    doc.setFontSize(15);
    doc.setTextColor(30, 41, 59);
    doc.text("RESUMEN DE CUADRE DE CAJA", 20, yPos);

    const resRows = [];

    // Solo agregar filas de ventas si hubo movimiento
    resRows.push([
      {
        content: "FLUJO DE VENTAS",
        colSpan: 2,
        styles: {
          halign: "center",
          fillColor: [241, 245, 249],
          fontStyle: "bold",
        },
      },
    ]);
    if (vEf > 0) resRows.push(["Ventas en Efectivo", `S/ ${vEf.toFixed(2)}`]);
    if (vYa > 0)
      resRows.push(["Ventas por Yape / Plin", `S/ ${vYa.toFixed(2)}`]);
    if (vTa > 0) resRows.push(["Ventas por Tarjeta", `S/ ${vTa.toFixed(2)}`]);
    resRows.push([
      { content: "TOTAL INGRESOS", styles: { fontStyle: "bold" } },
      {
        content: `S/ ${totalVentas.toFixed(2)}`,
        styles: { fontStyle: "bold" },
      },
    ]);

    // Solo agregar filas de egresos si hubo movimiento
    if (totalEgresos > 0) {
      resRows.push([
        {
          content: "FLUJO DE EGRESOS",
          colSpan: 2,
          styles: {
            halign: "center",
            fillColor: [241, 245, 249],
            fontStyle: "bold",
          },
        },
      ]);
      if (eEf > 0)
        resRows.push(["Egresos Pagados en Efectivo", `S/ ${eEf.toFixed(2)}`]);
      if (eYa > 0)
        resRows.push(["Egresos Pagados por Yape", `S/ ${eYa.toFixed(2)}`]);
      if (eTa > 0)
        resRows.push(["Egresos Pagados por Tarjeta", `S/ ${eTa.toFixed(2)}`]);
      resRows.push([
        { content: "TOTAL EGRESOS", styles: { fontStyle: "bold" } },
        {
          content: `S/ ${totalEgresos.toFixed(2)}`,
          styles: { fontStyle: "bold" },
        },
      ]);
    }

    // Cuadre Final (SIEMPRE VISIBLE)
    resRows.push([
      {
        content: "SITUACIÓN FINAL",
        colSpan: 2,
        styles: {
          halign: "center",
          fillColor: [30, 41, 59],
          textColor: [255, 255, 255],
          fontStyle: "bold",
        },
      },
    ]);
    resRows.push([
      "EFECTIVO FÍSICO EN CAJA (Ventas Ef - Gastos Ef)",
      {
        content: `S/ ${efectivoEnCaja.toFixed(2)}`,
        styles: { fontStyle: "bold", textColor: [37, 99, 235] },
      },
    ]);
    resRows.push([
      "BALANCE NETO DEL DÍA (Ganancia Real)",
      {
        content: `S/ ${balanceNeto.toFixed(2)}`,
        styles: {
          fontStyle: "bold",
          textColor: balanceNeto >= 0 ? [16, 128, 0] : [200, 0, 0],
        },
      },
    ]);

    renderTable(doc, {
      startY: yPos + 5,
      body: resRows,
      theme: "grid",
      styles: { fontSize: 9, cellPadding: 2.5 },
      columnStyles: { 0: { cellWidth: 125 }, 1: { halign: "right" } },
    });

    // --- ENVÍO ---
    const pdfBuffer = Buffer.from(doc.output("arraybuffer"));
    const pdfBase64 = pdfBuffer.toString("base64");

    const transporter = nodemailer.createTransport({
      service: "gmail",
      auth: { user: "pedroenocgb1245@gmail.com", pass: "nodvdokaqfziibce" },
    });

    await transporter.sendMail({
      from: '"Librería Leo" <pedroenocgb1245@gmail.com>',
      to: emailDestino,
      subject: `📊 Cierre Caja ${fechaStr}`,
      attachments: [{ filename: `Cierre_${fechaStr}.pdf`, content: pdfBuffer }],
    });

    if (client.info && client.info.wid) {
      const chatId = "51963977020@c.us";
      const media = new MessageMedia(
        "application/pdf",
        pdfBase64,
        `Cierre_${fechaStr}.pdf`,
      );
      await client.sendMessage(
        chatId,
        `📊 *Librería Leo - Cuadre Final*\n\nEfectivo en Caja: *S/ ${efectivoEnCaja.toFixed(2)}*\nGanancia Real: *S/ ${balanceNeto.toFixed(2)}*`,
      );
      await new Promise((r) => setTimeout(r, 2500));
      await client.sendMessage(chatId, media);
    }
    return true;
  } catch (error) {
    console.error("Error Report Service:", error);
    return false;
  }
};
