require("dotenv").config();

const sequelize =
    require("./config/database");

const bot =
    require("./bot");

const {
    startIntegrationServer,
} = require("./integrationServer");

const {
    startCargoCampAutoClose,
} = require(
    "./services/cargoCampAutoCloseService"
);

const {
    startEvotorSync,
} = require("./services/evotorService");

async function startApp() {
    try {
        console.log(
            "Проверяем MySQL..."
        );

        await sequelize.authenticate();

        console.log(
            "✅ MySQL подключён"
        );

        await sequelize.sync();

        console.log(
            "✅ Таблицы синхронизированы"
        );

        startIntegrationServer();

        startEvotorSync();

        startCargoCampAutoClose();

        const webhookEnabled =
            process.env
                .TELEGRAM_WEBHOOK_ENABLED ===
            "true";

        if (webhookEnabled) {
            const domain =
                process.env
                    .TELEGRAM_WEBHOOK_DOMAIN;

            const path =
                process.env
                    .TELEGRAM_WEBHOOK_PATH ||
                "/businesscash-webhook";

            const port =
                Number(
                    process.env
                        .TELEGRAM_WEBHOOK_PORT ||
                    3000
                );

            const secretToken =
                process.env
                    .TELEGRAM_WEBHOOK_SECRET;

            if (!domain) {
                throw new Error(
                    "TELEGRAM_WEBHOOK_DOMAIN не указан"
                );
            }

            if (!secretToken) {
                throw new Error(
                    "TELEGRAM_WEBHOOK_SECRET не указан"
                );
            }

            await bot.launch(
                {
                    webhook: {
                        domain,
                        path,
                        port,
                        secretToken,
                    },
                },
                () => {
                    console.log(
                        "🤖 Telegram-бот запущен в WEBHOOK режиме"
                    );

                    console.log(
                        `🌐 Webhook: https://${domain}${path}`
                    );

                    console.log(
                        `🔌 Local port: ${port}`
                    );
                }
            );

            return;
        }

        bot.launch(
            {
                dropPendingUpdates:
                    false,
            },
            () => {
                console.log(
                    "🤖 Telegram-бот запущен в POLLING режиме"
                );
            }
        );
    } catch (error) {
        console.error(
            "❌ Ошибка запуска приложения:"
        );

        console.error(error);

        process.exit(1);
    }
}

startApp();

process.once(
    "SIGINT",
    () => {
        bot.stop("SIGINT");
    }
);

process.once(
    "SIGTERM",
    () => {
        bot.stop("SIGTERM");
    }
);