const express = require("express");
const sqlite3 = require("sqlite3").verbose();
const cors = require("cors");
const TelegramBot = require("node-telegram-bot-api");
const path = require("path");

const app = express();

// CONFIGURACIÓN DINÁMICA DE PUERTO PARA RENDER
const PORT = process.env.PORT || 3000;

app.use(cors());
app.use(express.json());
// Servir archivos estáticos (index.html, admin.html, musica.mp3, etc.)
app.use(express.static(__dirname));

// CONFIGURACIÓN TELEGRAM
const token = "8246946533:AAE-Knt1ZVGpq6uUJCzY7ceGyyhybIq50yY";
const chatId = "8389424991";

// Inicializar Bot con manejo de errores de polling
const bot = new TelegramBot(token, { polling: true });

bot.on("polling_error", (error) => {
  if (error.code === "ETELEGRAM" && error.message.includes("409 Conflict")) {
    console.log(
      "⚠️ Conflicto de conexión: Otra instancia del bot está activa. Reintentando...",
    );
  } else {
    console.log("Error de Telegram Bot:", error.code);
  }
});

// BASE DE DATOS
const db = new sqlite3.Database("./pedidos.db", (err) => {
  if (err) console.error("Error al abrir DB:", err.message);
  else console.log("✅ Base de datos conectada.");
});

// Crear tabla si no existe
db.run(`CREATE TABLE IF NOT EXISTS pedidos (
    id INTEGER PRIMARY KEY AUTOINCREMENT,
    detalle TEXT,
    total REAL,
    ubicacion TEXT,
    fecha DATETIME DEFAULT CURRENT_TIMESTAMP
)`);

// --- RUTA PARA RECIBIR PEDIDOS ---
app.post("/guardar-pedido", (req, res) => {
  const { detalle, total, ubicacion } = req.body;
  const query = `INSERT INTO pedidos (detalle, total, ubicacion) VALUES (?, ?, ?)`;

  db.run(query, [detalle, total, ubicacion], function (err) {
    if (err) return res.status(500).send(err.message);

    const pedidoId = this.lastID;

    // Notificar por Telegram
    const mensaje = `🔔 *NUEVO PEDIDO # : ${pedidoId}*\n\n🥜 *Detalle:* ${detalle}\n💰 *Total:* $${total}\n📍 *Ubicación:* ${ubicacion}`;

    bot.sendMessage(chatId, mensaje, {
      parse_mode: "Markdown",
      reply_markup: {
        inline_keyboard: [
          [
            {
              text: "✅ Marcar como Entregado",
              callback_data: `completar_${pedidoId}`,
            },
          ],
        ],
      },
    });
    res.json({ success: true, id: pedidoId });
  });
});

// --- RUTA PARA EL ADMIN HTML ---
app.get("/api/pedidos", (req, res) => {
  db.all("SELECT * FROM pedidos ORDER BY fecha DESC", [], (err, rows) => {
    if (err) return res.status(500).json({ error: err.message });
    res.json(rows);
  });
});

app.delete("/api/pedidos/:id", (req, res) => {
  const { id } = req.params;
  db.run("DELETE FROM pedidos WHERE id = ?", id, (err) => {
    if (err) return res.status(500).json({ error: err.message });
    res.json({ success: true });
  });
});

// --- LÓGICA DEL BOT PARA EL CELULAR ---
bot.on("callback_query", (query) => {
  const data = query.data;
  if (data.startsWith("completar_")) {
    const id = data.split("_")[1];

    db.run("DELETE FROM pedidos WHERE id = ?", id, (err) => {
      if (err)
        return bot.answerCallbackQuery(query.id, { text: "Error al borrar" });

      bot.answerCallbackQuery(query.id, { text: "Pedido completado ✅" });
      bot.editMessageText(
        `✅ *Pedido #${id} Entregado*\nYa no aparece en la lista.`,
        {
          chat_id: query.message.chat.id,
          message_id: query.message.message_id,
          parse_mode: "Markdown",
        },
      );
    });
  }
});

// INICIAR SERVIDOR
app.listen(PORT, "0.0.0.0", () => {
  console.log(`🚀 Servidor KB HUATES listo en puerto ${PORT}`);
});
