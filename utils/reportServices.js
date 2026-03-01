const { jsPDF } = require("jspdf");
const autoTable = require("jspdf-autotable");
const nodemailer = require("nodemailer");
const { Client, LocalAuth, MessageMedia } = require("whatsapp-web.js");
const qrcode = require("qrcode-terminal");

// --- INICIALIZACIÓN SIMPLE (La que funcionó) ---
const client = new Client({
  authStrategy: new LocalAuth(),
  puppeteer: {
    args: ["--no-sandbox", "--disable-setuid-sandbox"],
  },
});

client.on("qr", (qr) => qrcode.generate(qr, { small: true }));
client.on("ready", () => console.log("✅ WhatsApp: Cliente listo"));
client.initialize();

exports.generarYEnviarReporte = async (data, emailDestino) => {
  try {
    const doc = new jsPDF();
    const ahora = new Date();
    const fechaStr = ahora.toLocaleDateString("es-PE");
    const renderTable = autoTable.default || autoTable;

    // --- DISEÑO PRO (Colores y Resumen) ---
    doc.setFontSize(22);
    doc.setTextColor(30, 41, 59);
    doc.text("LIBRERÍA LEO", 105, 20, { align: "center" });
    doc.setFontSize(10);
    doc.text(`REPORTE DE CAJA - ${fechaStr}`, 105, 27, { align: "center" });
    doc.line(20, 30, 190, 30);

    let yPos = 38;

    const crearSeccion = (titulo, items, colorRGB) => {
      if (items.length === 0) return;
      doc.setFontSize(13);
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

    crearSeccion("Ventas del Día", ventas, [16, 185, 129]);
    crearSeccion("Gastos Operativos", gastos, [239, 68, 68]);
    crearSeccion("Pagos a Proveedores", proveedores, [139, 92, 246]);

    // Resumen Final
    const totalVentas = ventas.reduce((acc, r) => acc + r.amount, 0);
    const totalEgresos =
      gastos.reduce((acc, r) => acc + r.amount, 0) +
      proveedores.reduce((acc, r) => acc + r.amount, 0);
    const balance = totalVentas - totalEgresos;
    const porMetodo = data.reduce((acc, r) => {
      if (r.type === "VENTA")
        acc[r.paymentMethod] = (acc[r.paymentMethod] || 0) + r.amount;
      return acc;
    }, {});

    if (yPos > 240) {
      doc.addPage();
      yPos = 20;
    }
    doc.setFontSize(15);
    doc.setTextColor(30, 41, 59);
    doc.text("RESUMEN FINAL", 20, yPos);

    renderTable(doc, {
      startY: yPos + 4,
      body: [
        ["Ventas Brutas", `S/ ${totalVentas.toFixed(2)}`],
        ["Total Egresos", `S/ ${totalEgresos.toFixed(2)}`],
        ["Efectivo", `S/ ${(porMetodo["EFECTIVO"] || 0).toFixed(2)}`],
        ["Yape / Plin", `S/ ${(porMetodo["YAPE / PLIN"] || 0).toFixed(2)}`],
        ["Tarjeta", `S/ ${(porMetodo["TARJETA"] || 0).toFixed(2)}`],
        [
          { content: "BALANCE NETO", styles: { fontStyle: "bold" } },
          {
            content: `S/ ${balance.toFixed(2)}`,
            styles: { fontStyle: "bold" },
          },
        ],
      ],
      theme: "grid",
      styles: { fontSize: 9 },
    });

    const pdfBuffer = Buffer.from(doc.output("arraybuffer"));
    const pdfBase64 = pdfBuffer.toString("base64");

    // --- ENVÍO EMAIL ---
    const transporter = nodemailer.createTransport({
      service: "gmail",
      auth: { user: "pedroenocgb1245@gmail.com", pass: "nodvdokaqfziibce" },
    });
    await transporter.sendMail({
      from: '"POS Librería Leo" <pedroenocgb1245@gmail.com>',
      to: emailDestino,
      subject: `📊 Reporte - ${fechaStr}`,
      attachments: [
        { filename: `Reporte_${fechaStr}.pdf`, content: pdfBuffer },
      ],
    });

    // --- ENVÍO WHATSAPP (Solo a ti, directo) ---
    const chatId = "51963977020@c.us";
    const media = new MessageMedia(
      "application/pdf",
      pdfBase64,
      `Reporte_${fechaStr}.pdf`,
    );

    await client.sendMessage(
      chatId,
      `📊 *Librería Leo: Reporte del ${fechaStr}*\nBalance: S/ ${balance.toFixed(2)}`,
    );
    await client.sendMessage(chatId, media);

    console.log("✅ Reporte enviado con éxito.");
    return true;
  } catch (error) {
    console.error("Error Report Service:", error);
    return false;
  }
};
