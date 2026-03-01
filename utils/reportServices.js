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

client.on("ready", () => {
  console.log("✅ WhatsApp: Cliente listo y conectado");
});

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
    doc.setFontSize(12);
    doc.text(`REPORTE DETALLADO - ${fechaStr}`, 105, 28, { align: "center" });
    doc.setDrawColor(200);
    doc.line(20, 32, 190, 32);

    let yPos = 40;

    // --- FUNCIÓN PARA TABLAS CATEGORIZADAS ---
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
        styles: { fontSize: 9 },
      });
      yPos = doc.lastAutoTable.finalY + 15;
    };

    // Separar datos
    const ventas = data.filter((r) => r.type === "VENTA");
    const gastos = data.filter((r) => r.type === "GASTO");
    const proveedores = data.filter((r) => r.type === "PROVEEDOR");

    // Dibujar las 3 secciones
    dibujarTabla("VENTAS (INGRESOS)", ventas, [16, 185, 129]); // Verde
    dibujarTabla("GASTOS OPERATIVOS", gastos, [239, 68, 68]); // Rojo
    dibujarTabla("PAGOS A PROVEEDORES", proveedores, [139, 92, 246]); // Morado

    // --- RESUMEN FINAL ---
    if (yPos > 240) {
      doc.addPage();
      yPos = 20;
    }

    const totalVentas = ventas.reduce((acc, r) => acc + r.amount, 0);
    const totalEgresos =
      gastos.reduce((acc, r) => acc + r.amount, 0) +
      proveedores.reduce((acc, r) => acc + r.amount, 0);
    const balance = totalVentas - totalEgresos;

    const porMetodo = data.reduce((acc, r) => {
      if (r.type === "VENTA") {
        acc[r.paymentMethod] = (acc[r.paymentMethod] || 0) + r.amount;
      }
      return acc;
    }, {});

    doc.setFontSize(16);
    doc.setTextColor(30, 41, 59);
    doc.text("RESUMEN DE CAJA", 20, yPos);

    renderTable(doc, {
      startY: yPos + 5,
      body: [
        ["Total Ventas Brutas", `S/ ${totalVentas.toFixed(2)}`],
        ["Total Egresos (Gastos + Prov)", `S/ ${totalEgresos.toFixed(2)}`],
        ["Efectivo en Caja", `S/ ${(porMetodo["EFECTIVO"] || 0).toFixed(2)}`],
        ["Yape / Plin", `S/ ${(porMetodo["YAPE / PLIN"] || 0).toFixed(2)}`],
        ["Tarjeta", `S/ ${(porMetodo["TARJETA"] || 0).toFixed(2)}`],
        [
          { content: "BALANCE NETO (UTILIDAD)", styles: { fontStyle: "bold" } },
          {
            content: `S/ ${balance.toFixed(2)}`,
            styles: {
              fontStyle: "bold",
              textColor: balance >= 0 ? [0, 128, 0] : [210, 0, 0],
            },
          },
        ],
      ],
      theme: "grid",
      styles: { fontSize: 10, cellPadding: 3 },
      columnStyles: { 0: { cellWidth: 100 }, 1: { halign: "right" } },
    });

    const pdfArray = doc.output();
    const pdfBuffer = Buffer.from(pdfArray, "binary");
    const pdfBase64 = pdfBuffer.toString("base64");

    // --- ENVÍO EMAIL ---
    const transporter = nodemailer.createTransport({
      service: "gmail",
      auth: { user: "pedroenocgb1245@gmail.com", pass: "nodvdokaqfziibce" },
    });

    await transporter.sendMail({
      from: '"Sistema POS Librería Leo" <pedroenocgb1245@gmail.com>',
      to: emailDestino,
      subject: `📊 Reporte Consolidado - ${fechaStr}`,
      text: `Hola, adjunto el reporte detallado del día por categorías.`,
      attachments: [
        { filename: `Reporte_${fechaStr}.pdf`, content: pdfBuffer },
      ],
    });

    // --- ENVÍO WHATSAPP ---
    if (client.info && client.info.wid) {
      const chatId = "51963977020@c.us";
      const media = new MessageMedia(
        "application/pdf",
        pdfBase64,
        `Reporte_${fechaStr}.pdf`,
      );

      await client.sendMessage(
        chatId,
        `📊 *Librería Leo - Cierre Consolidado*\nFecha: ${fechaStr}\nBalance Neto: *S/ ${balance.toFixed(2)}*`,
      );

      // Pausa de seguridad
      await new Promise((resolve) => setTimeout(resolve, 3000));

      await client.sendMessage(chatId, media);
      console.log("✅ WhatsApp enviado");
    }

    return true;
  } catch (error) {
    console.error("Error Report Service:", error);
    return false;
  }
};
