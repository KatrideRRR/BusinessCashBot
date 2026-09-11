require("dotenv").config();

const sequelize = require("./config/database");
const bot = require("./bot");

async function startApp() {
    try {
        console.log("Проверяем MySQL...");

        await sequelize.authenticate();

        console.log("✅ MySQL подключён");

        await sequelize.sync();

        console.log("✅ Таблицы синхронизированы");

        bot.launch(
            {
                dropPendingUpdates: true,
            },
            () => {
                console.log("🤖 Telegram-бот запущен");
            }
        );
    } catch (error) {
        console.error("❌ Ошибка запуска приложения:");
        console.error(error);

        process.exit(1);
    }
}

startApp();

process.once("SIGINT", () => {
    bot.stop("SIGINT");
});

process.once("SIGTERM", () => {
    bot.stop("SIGTERM");
});