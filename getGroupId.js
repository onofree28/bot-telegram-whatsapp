const { TelegramClient } = require("telegram");
const { StringSession } = require("telegram/sessions");
const { Client, LocalAuth, MessageMedia } = require("whatsapp-web.js");
const fs = require("fs");
require("dotenv").config();
const axios = require("axios");

// 🔹 Configurações do Telegram
const apiId = parseInt(process.env.TELEGRAM_API_ID);
const apiHash = process.env.TELEGRAM_API_HASH;
const sessionFile = "session.json";
let stringSession = new StringSession("");

if (fs.existsSync(sessionFile)) {
    stringSession = new StringSession(fs.readFileSync(sessionFile, "utf-8"));
}

const client = new TelegramClient(stringSession, apiId, apiHash, { connectionRetries: 5 });

// 🔹 Configurações do WhatsApp
const whatsappClient = new Client({
    authStrategy: new LocalAuth(),
    puppeteer: { headless: false }
});

whatsappClient.on("qr", qr => console.log("⚡ Escaneie o QR Code no WhatsApp!"));
whatsappClient.on("ready", () => {
    console.log("✅ Bot do WhatsApp conectado!");
});
whatsappClient.initialize();

// 🔹 Enviar mensagens para o WhatsApp
async function sendMessageToWhatsApp(message) {
    const chatId = process.env.WHATSAPP_GROUP_ID;
    if (!chatId) {
        console.error("⚠️ ID do grupo do WhatsApp não definido!");
        return;
    }
    try {
        await whatsappClient.sendMessage(chatId, message);
    } catch (err) {
        console.error("❌ Erro ao enviar para WhatsApp:", err);
    }
}

// 🔹 Baixar e enviar mídia
async function sendMediaToWhatsApp(mediaUrl, caption = "") {
    try {
        const response = await axios.get(mediaUrl, { responseType: "arraybuffer" });
        const media = new MessageMedia("image/jpeg", response.data.toString("base64"));
        const chatId = process.env.WHATSAPP_GROUP_ID;
        await whatsappClient.sendMessage(chatId, media, { caption });
    } catch (error) {
        console.error("❌ Erro ao enviar mídia para WhatsApp:", error);
    }
}

// 🔹 Escutar mensagens no Telegram
async function listenToGroupMessages(groupId) {
    await client.connect();
    console.log(`🎧 Escutando mensagens do Telegram no grupo ${groupId}...`);

    client.addEventHandler(async (update) => {
        if (update.className !== "UpdateNewMessage" || !update.message) return;
        const message = update.message;
        const sender = await client.getEntity(message.senderId);
        const messageText = message.message || "";

        if (message.media && message.media.photo) {
            // Se a mensagem contém uma imagem
            const photo = await client.downloadMedia(message);
            const mediaUrl = `data:image/jpeg;base64,${photo.toString("base64")}`;
            sendMediaToWhatsApp(mediaUrl, `📸 *${sender.firstName}:* ${messageText}`);
        } else if (messageText) {
            // Se a mensagem contém um link ou texto
            sendMessageToWhatsApp(`📨 *${sender.firstName}:* ${messageText}`);
        }
    });
}

// 🔹 Iniciar bot
async function startBot() {
    if (!fs.existsSync(sessionFile)) {
        await client.start({
            phoneNumber: async () => process.env.TELEGRAM_PHONE,
            password: async () => process.env.TELEGRAM_PASSWORD,
            phoneCode: async () => {
                console.log("Digite o código do Telegram:");
                return new Promise(resolve => process.stdin.once("data", data => resolve(data.toString().trim())));
            },
            onError: (err) => console.error("❌ Erro de autenticação:", err),
        });
        fs.writeFileSync(sessionFile, client.session.save());
    } else {
        await client.connect();
    }

    const groupId = process.env.TELEGRAM_GROUP_ID;
    if (!groupId) {
        console.error("⚠️ ID do grupo do Telegram não definido!");
        return;
    }

    listenToGroupMessages(groupId);
}

startBot();
