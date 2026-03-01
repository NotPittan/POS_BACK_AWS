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
    doc.text(`CIERRE DE CAJA DETALLADO - ${fechaStr}`, 105, 28, {
      align: "center",
    });
    doc.line(20, 32, 190, 32);

    let yPos = 40;

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

    const ventas = data.filter((r) => r.type === "VENTA");
    const gastos = data.filter((r) => r.type === "GASTO");
    const proveedores = data.filter((r) => r.type === "PROVEEDOR");

    dibujarTabla("VENTAS (INGRESOS)", ventas, [16, 185, 129]); // Verde
    dibujarTabla("GASTOS OPERATIVOS", gastos, [239, 68, 68]); // Rojo
    dibujarTabla("PAGOS A PROVEEDORES", proveedores, [139, 92, 246]); // Morado

    // --- LÓGICA DE CÁLCULOS ---
    const vEfectivo = ventas
      .filter((v) => v.paymentMethod === "EFECTIVO")
      .reduce((acc, r) => acc + r.amount, 0);
    const vDigital = ventas
      .filter((v) => v.paymentMethod === "YAPE / PLIN")
      .reduce((acc, r) => acc + r.amount, 0);
    const vTarjeta = ventas
      .filter((v) => v.paymentMethod === "TARJETA")
      .reduce((acc, r) => acc + r.amount, 0);

    const totalVentas = vEfectivo + vDigital + vTarjeta;
    const totalGastos = gastos.reduce((acc, r) => acc + r.amount, 0);
    const totalProv = proveedores.reduce((acc, r) => acc + r.amount, 0);
    const totalEgresos = totalGastos + totalProv;

    // El efectivo real que debería haber en caja (Ventas Efectivo - Gastos/Prov pagados en efectivo)
    // Asumimos que los egresos salen del efectivo de caja
    const efectivoEnCaja = vEfectivo - totalEgresos;
    const balanceNeto = totalVentas - totalEgresos;

    if (yPos > 200) {
      doc.addPage();
      yPos = 20;
    }

    doc.setFontSize(16);
    doc.setTextColor(30, 41, 59);
    doc.text("RESUMEN CONSOLIDADO", 20, yPos);

    // --- TABLA DE RESUMEN FINAL ---
    renderTable(doc, {
      startY: yPos + 5,
      body: [
        [
          {
            content: "DESGLOSE DE VENTAS",
            colSpan: 2,
            styles: {
              halign: "center",
              fillColor: [241, 245, 249],
              fontStyle: "bold",
            },
          },
        ],
        ["Ventas (Efectivo)", `S/ ${vEfectivo.toFixed(2)}`],
        ["Ventas (Yape / Plin)", `S/ ${vDigital.toFixed(2)}`],
        ["Ventas (Tarjeta)", `S/ ${vTarjeta.toFixed(2)}`],
        [
          { content: "SUMA TOTAL VENTAS", styles: { fontStyle: "bold" } },
          {
            content: `S/ ${totalVentas.toFixed(2)}`,
            styles: { fontStyle: "bold" },
          },
        ],

        [
          {
            content: "DESGLOSE DE EGRESOS",
            colSpan: 2,
            styles: {
              halign: "center",
              fillColor: [241, 245, 249],
              fontStyle: "bold",
            },
          },
        ],
        ["Total Gastos", `S/ ${totalGastos.toFixed(2)}`],
        ["Total Proveedores", `S/ ${totalProv.toFixed(2)}`],
        [
          {
            content: "TOTAL EGRESOS (Gastos + Prov)",
            styles: { fontStyle: "bold" },
          },
          {
            content: `S/ ${totalEgresos.toFixed(2)}`,
            styles: { fontStyle: "bold" },
          },
        ],

        [
          {
            content: "CUADRE DE CAJA FINAL",
            colSpan: 2,
            styles: {
              halign: "center",
              fillColor: [30, 41, 59],
              textColor: [255, 255, 255],
              fontStyle: "bold",
            },
          },
        ],
        [
          "EFECTIVO QUE DEBE HABER EN CAJA",
          {
            content: `S/ ${efectivoEnCaja.toFixed(2)}`,
            styles: { fontStyle: "bold", textColor: [37, 99, 235] },
          },
        ],
        [
          "BALANCE NETO (GANANCIA REAL)",
          {
            content: `S/ ${balanceNeto.toFixed(2)}`,
            styles: {
              fontStyle: "bold",
              textColor: balanceNeto >= 0 ? [16, 128, 0] : [200, 0, 0],
            },
          },
        ],
      ],
      theme: "grid",
      styles: { fontSize: 10, cellPadding: 3 },
      columnStyles: { 0: { cellWidth: 120 }, 1: { halign: "right" } },
    });

    // --- PROCESO DE ENVÍO (GMAIL Y WHATSAPP) ---
    const pdfArray = doc.output();
    const pdfBuffer = Buffer.from(pdfArray, "binary");
    const pdfBase64 = pdfBuffer.toString("base64");

    const transporter = nodemailer.createTransport({
      service: "gmail",
      auth: { user: "pedroenocgb1245@gmail.com", pass: "nodvdokaqfziibce" },
    });

    await transporter.sendMail({
      from: '"POS Librería Leo" <pedroenocgb1245@gmail.com>',
      to: emailDestino,
      subject: `📊 Cierre de Caja - ${fechaStr}`,
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
        `📊 *Librería Leo - Reporte Final*\nBalance: *S/ ${balanceNeto.toFixed(2)}*\nEfectivo en Caja: *S/ ${efectivoEnCaja.toFixed(2)}*`,
      );
      await new Promise((r) => setTimeout(r, 3000));
      await client.sendMessage(chatId, media);
    }

    return true;
  } catch (error) {
    console.error("Error Report Service:", error);
    return false;
  }
};
