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
    doc.text(`CIERRE DE CAJA - ${fechaStr}`, 105, 27, {
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
    const egresosTotal = [...gastos, ...proveedores];

    dibujarTabla("INGRESOS", ventas, [16, 185, 129]);
    dibujarTabla("GASTOS", gastos, [239, 68, 68]);
    dibujarTabla("PAGOS A PROVEEDORES", proveedores, [139, 92, 246]);

    // --- LÓGICA CONTABLE POR CANAL ---
    const calc = (arr, method) =>
      arr
        .filter((i) => i.paymentMethod === method)
        .reduce((a, r) => a + r.amount, 0);

    // Totales por método
    const vEf = calc(ventas, "EFECTIVO");
    const vYa = calc(ventas, "YAPE / PLIN");
    const vTa = calc(ventas, "TARJETA");

    const eEf = calc(egresosTotal, "EFECTIVO");
    const eYa = calc(egresosTotal, "YAPE / PLIN");
    const eTa = calc(egresosTotal, "TARJETA");

    // Balances individuales (Venta - Egreso del mismo método)
    const balEf = vEf - eEf;
    const balYa = vYa - eYa;
    const balTa = vTa - eTa;

    const totalIngresos = vEf + vYa + vTa;
    const totalEgresos = eEf + eYa + eTa;
    const balanceNetoGeneral = totalIngresos - totalEgresos;

    if (yPos > 200) {
      doc.addPage();
      yPos = 20;
    }
    doc.setFontSize(15);
    doc.setTextColor(30, 41, 59);
    doc.text("RESUMEN DE CAJA", 20, yPos);

    const resRows = [
      // Bloque de Ingresos
      [
        {
          content: "TABLA DE INGRESOS",
          colSpan: 2,
          styles: {
            halign: "center",
            fillColor: [241, 245, 249],
            fontStyle: "bold",
          },
        },
      ],
      ["Total Ventas Efectivo", `S/ ${vEf.toFixed(2)}`],
      ["Total Ventas Yape / Plin", `S/ ${vYa.toFixed(2)}`],
      ["Total Ventas Tarjeta", `S/ ${vTa.toFixed(2)}`],
      [
        { content: "SUMA TOTAL INGRESOS", styles: { fontStyle: "bold" } },
        {
          content: `S/ ${totalIngresos.toFixed(2)}`,
          styles: { fontStyle: "bold" },
        },
      ],

      // Bloque de Egresos
      [
        {
          content: "TABLA DE EGRESOS",
          colSpan: 2,
          styles: {
            halign: "center",
            fillColor: [241, 245, 249],
            fontStyle: "bold",
          },
        },
      ],
      ["Egresos Efectivo", `S/ ${eEf.toFixed(2)}`],
      ["Egresos Yape/Plin", `S/ ${eYa.toFixed(2)}`],
      ["Egresos Tarjeta", `S/ ${eTa.toFixed(2)}`],
      [
        { content: "TOTAL EGRESOS DEL DÍA", styles: { fontStyle: "bold" } },
        {
          content: `S/ ${totalEgresos.toFixed(2)}`,
          styles: { fontStyle: "bold" },
        },
      ],

      // Bloque de Balances por Canal (Lo que pediste)
      [
        {
          content: "BALANCES POR MÉTODO DE PAGO",
          colSpan: 2,
          styles: {
            halign: "center",
            fillColor: [226, 232, 240],
            fontStyle: "bold",
          },
        },
      ],
      [
        "Balance Efectivo (Caja Física)",
        {
          content: `S/ ${balEf.toFixed(2)}`,
          styles: {
            fontStyle: "bold",
            textColor: balEf >= 0 ? [0, 100, 0] : [200, 0, 0],
          },
        },
      ],
      [
        "Balance Yape / Plin (Virtual)",
        {
          content: `S/ ${balYa.toFixed(2)}`,
          styles: {
            fontStyle: "bold",
            textColor: balYa >= 0 ? [0, 100, 0] : [200, 0, 0],
          },
        },
      ],
      [
        "Balance Tarjeta (Banco)",
        {
          content: `S/ ${balTa.toFixed(2)}`,
          styles: {
            fontStyle: "bold",
            textColor: balTa >= 0 ? [0, 100, 0] : [200, 0, 0],
          },
        },
      ],

      // Situación Final
      [
        {
          content: "RESULTADO NETO TOTAL",
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
        "UTILIDAD TOTAL DEL DÍA",
        {
          content: `S/ ${balanceNetoGeneral.toFixed(2)}`,
          styles: {
            fontSize: 12,
            fontStyle: "bold",
            textColor: balanceNetoGeneral >= 0 ? [16, 128, 0] : [200, 0, 0],
          },
        },
      ],
    ];

    renderTable(doc, {
      startY: yPos + 5,
      body: resRows,
      theme: "grid",
      styles: { fontSize: 9, cellPadding: 2.5 },
      columnStyles: { 0: { cellWidth: 125 }, 1: { halign: "right" } },
    });

    // --- PROCESO DE ENVÍO ---
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
        `📊 *Librería Leo - Reporte Final*\n\nEfectivo Neto: *S/ ${balEf.toFixed(2)}*\nBalance Yape: *S/ ${balYa.toFixed(2)}*\nGanancia Real: *S/ ${balanceNetoGeneral.toFixed(2)}*`,
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
