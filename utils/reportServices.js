const { jsPDF } = require("jspdf");
const autoTable = require("jspdf-autotable");
const nodemailer = require("nodemailer");
const { Client, LocalAuth, MessageMedia } = require("whatsapp-web.js");
const qrcode = require("qrcode-terminal");

// --- INICIALIZACIÓN WHATSAPP ---
const client = new Client({
  authStrategy: new LocalAuth(),
  webVersionCache: {
    type: "remote",
    remotePath:
      "https://raw.githubusercontent.com/wppconnect-team/wa-version/main/html/2.2412.54.html",
  },
  puppeteer: {
    args: [
      "--no-sandbox",
      "--disable-setuid-sandbox",
      "--disable-dev-shm-usage",
      "--disable-accelerated-2d-canvas",
      "--no-first-run",
      "--no-zygote",
      "--disable-gpu",
    ],
    executablePath: "/usr/bin/google-chrome-stable", // Fuerza a usar Chrome instalado
    headless: true,
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

    // --- ENCABEZADO PRINCIPAL ---
    doc.setFontSize(22);
    doc.setTextColor(30, 41, 59);
    doc.text("LIBRERÍA LEO", 105, 20, { align: "center" });
    doc.setFontSize(12);
    doc.text(`REPORTE DETALLADO DE CAJA - ${fechaStr}`, 105, 28, {
      align: "center",
    });
    doc.setDrawColor(200);
    doc.line(20, 32, 190, 32);

    let yPos = 40;

    // --- FUNCIÓN PARA CREAR TABLAS POR CATEGORÍA ---
    const crearSeccion = (titulo, items, colorRGB) => {
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
        startY: yPos + 5,
        head: [["CONCEPTO", "MONTO", "MÉTODO", "HORA"]],
        body: rows,
        theme: "striped",
        headStyles: { fillColor: colorRGB },
        styles: { fontSize: 9 },
      });
      yPos = doc.lastAutoTable.finalY + 15;
    };

    // Filtrar datos
    const ventas = data.filter((r) => r.type === "VENTA");
    const gastos = data.filter((r) => r.type === "GASTO");
    const proveedores = data.filter((r) => r.type === "PROVEEDOR");

    // Dibujar secciones
    crearSeccion("Ventas del Día", ventas, [16, 185, 129]); // Verde
    crearSeccion("Gastos Operativos", gastos, [239, 68, 68]); // Rojo
    crearSeccion("Pagos a Proveedores", proveedores, [139, 92, 246]); // Morado

    // --- RESUMEN FINAL ---
    if (yPos > 230) {
      doc.addPage();
      yPos = 20;
    } // Nueva página si no hay espacio

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

    doc.setFontSize(16);
    doc.setTextColor(30, 41, 59);
    doc.text("RESUMEN DE CAJA", 20, yPos);

    const resumenRows = [
      ["Total Ventas Brutas", `S/ ${totalVentas.toFixed(2)}`],
      ["Total Egresos (Gastos + Prov)", `S/ ${totalEgresos.toFixed(2)}`],
      ["Efectivo recaudado", `S/ ${(porMetodo["EFECTIVO"] || 0).toFixed(2)}`],
      [
        "Yape / Plin recaudado",
        `S/ ${(porMetodo["YAPE / PLIN"] || 0).toFixed(2)}`,
      ],
      ["Tarjeta recaudado", `S/ ${(porMetodo["TARJETA"] || 0).toFixed(2)}`],
      [
        { content: "BALANCE NETO (GANANCIA)", styles: { fontStyle: "bold" } },
        {
          content: `S/ ${balance.toFixed(2)}`,
          styles: {
            fontStyle: "bold",
            textColor: balance >= 0 ? [0, 128, 0] : [255, 0, 0],
          },
        },
      ],
    ];

    renderTable(doc, {
      startY: yPos + 5,
      body: resumenRows,
      theme: "grid",
      styles: { fontSize: 10, cellPadding: 3 },
      columnStyles: { 0: { cellWidth: 100 }, 1: { halign: "right" } },
    });

    // --- ENVÍO ---
    const pdfBuffer = Buffer.from(doc.output("arraybuffer"));
    const pdfBase64 = pdfBuffer.toString("base64");

    // Correo
    const transporter = nodemailer.createTransport({
      service: "gmail",
      auth: { user: "pedroenocgb1245@gmail.com", pass: "nodvdokaqfziibce" },
    });
    await transporter.sendMail({
      from: '"POS Librería Leo" <pedroenocgb1245@gmail.com>',
      to: emailDestino,
      subject: `📊 Reporte Librería Leo - ${fechaStr}`,
      attachments: [
        { filename: `Reporte_${fechaStr}.pdf`, content: pdfBuffer },
      ],
    });

    // WhatsApp
    const numeros = ["51963977020", "51924657078"];
    const media = new MessageMedia(
      "application/pdf",
      pdfBase64,
      `Reporte_${fechaStr}.pdf`,
    );

    const delay = (ms) => new Promise((res) => setTimeout(res, ms));

    for (const num of numeros) {
      try {
        const chatId = `${num}@c.us`;

        // Verificación de salud del cliente antes de enviar
        if (!client.pupPage || client.pupPage.isClosed()) {
          throw new Error("El navegador de WhatsApp se cerró inesperadamente.");
        }

        // 1. Enviar el texto
        await client.sendMessage(
          chatId,
          `📊 *Librería Leo: Reporte del ${fechaStr}*\nBalance Neto: S/ ${balance.toFixed(2)}`,
        );

        await delay(5000); // Aumentamos a 5 segundos el respiro

        // 2. Enviar el PDF
        await client.sendMessage(chatId, media);

        await delay(5000);

        console.log(`✅ WhatsApp enviado a: ${num}`);
      } catch (wsError) {
        console.error(`❌ Error enviando a ${num}:`, wsError.message);
        // Si detectamos que el frame se soltó, intentamos re-inicializar el cliente
        if (wsError.message.includes("detached Frame")) {
          console.log(
            "🔄 Reiniciando cliente de WhatsApp por error de frame...",
          );
          client.initialize();
        }
      }
    }

    console.log("✅ Reporte completo enviado.");
    return true;
  } catch (error) {
    console.error("Error Report Service:", error);
    return false;
  }
};
