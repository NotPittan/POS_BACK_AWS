const { jsPDF } = require("jspdf");
const autoTable = require("jspdf-autotable");
const nodemailer = require("nodemailer");
const { Client, LocalAuth, MessageMedia } = require("whatsapp-web.js");
const qrcode = require("qrcode-terminal");

// 1. Configuración del cliente de WhatsApp Web
const client = new Client({
  authStrategy: new LocalAuth(),
  qrMaxRetries: 10, // Reintenta más veces el QR
  authTimeoutMs: 60000, // Espera 1 minuto a que cargue la sesión
  puppeteer: {
    headless: true,
    args: [
      "--no-sandbox",
      "--disable-setuid-sandbox",
      "--disable-dev-shm-usage",
      "--disable-gpu",
      "--single-process", // Ayuda a que no consuma tanta RAM
      "--no-zygote",
    ],
  },
});

// Evento para mostrar el QR en la consola de la EC2
client.on("qr", (qr) => {
  console.log("--- NUEVO QR GENERADO ---");
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

    // --- DISEÑO DEL PDF ---
    doc.setFontSize(20);
    doc.setTextColor(37, 99, 235);
    doc.text("LIBRERÍA LEO - REPORTE DIARIO", 105, 20, { align: "center" });
    doc.setFontSize(10);
    doc.setTextColor(100);
    doc.text(
      `Generado el: ${fechaStr} a las ${ahora.toLocaleTimeString()}`,
      105,
      28,
      { align: "center" },
    );

    // Tabla de registros
    const rows = data.map((r) => [
      r.type,
      r.entity,
      `S/ ${r.amount.toFixed(2)}`,
      r.paymentMethod,
      r.displayTime || "N/A",
    ]);

    (autoTable.default || autoTable)(doc, {
      startY: 40,
      head: [["TIPO", "CONCEPTO", "MONTO", "MÉTODO", "HORA"]],
      body: rows,
      theme: "striped",
      headStyles: { fillColor: [37, 99, 235] },
      styles: { fontSize: 9 },
    });

    const pdfArray = doc.output(); // Genera el string binario
    const pdfBuffer = Buffer.from(pdfArray, "binary"); // Lo convierte correctamente a Buffer
    const pdfBase64 = pdfBuffer.toString("base64"); // Para WhatsApp

    // --- 2. ENVÍO POR CORREO ---
    const transporter = nodemailer.createTransport({
      service: "gmail",
      auth: {
        user: "pedroenocgb1245@gmail.com",
        pass: "nodvdokaqfziibce",
      },
    });

    await transporter.sendMail({
      from: '"Sistema POS Librería Leo" <pedroenocgb1245@gmail.com>',
      to: emailDestino,
      subject: `📊 Cierre de Caja - ${fechaStr}`,
      text: `Hola, se ha realizado el cierre de caja automático.\nAdjunto encontrarás el reporte detallado.`,
      attachments: [{ filename: `Cierre_${fechaStr}.pdf`, content: pdfBuffer }],
    });

    // --- 3. ENVÍO POR WHATSAPP (Número actualizado) ---
    if (!client.info || !client.info.wid) {
      console.error(
        "❌ WhatsApp no está listo todavía. Escanea el QR primero.",
      );
      // No lanzamos error para que al menos el Gmail sí se envíe
    } else {
      const numeroCelular = "51963977020";
      const chatId = `${numeroCelular}@c.us`;
      const media = new MessageMedia(
        "application/pdf",
        pdfBase64,
        `Cierre_${fechaStr}.pdf`,
      );

      await client.sendMessage(
        chatId,
        `📊 *Librería Leo - Cierre Diario*\nFecha: ${fechaStr}`,
      );

      // Pausa de 2 segundos para no saturar la subida del archivo
      await new Promise((resolve) => setTimeout(resolve, 2000));

      await client.sendMessage(chatId, media);
      console.log("✅ WhatsApp enviado con éxito");
    }
    return true;
  } catch (error) {
    console.error("Error Report Service:", error);
    return false;
  }
};
