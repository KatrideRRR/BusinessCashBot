const crypto = require("crypto");
const express = require("express");

const {
    recordCampCardRedemption,
} = require("./services/campCardService");

const {
    getSmsOrderData,
} = require(
    "./services/purchaseSmsService"
);

function secretsEqual(a, b) {
    if (!a || !b) {
        return false;
    }

    const aBuffer =
        Buffer.from(String(a));

    const bBuffer =
        Buffer.from(String(b));

    if (
        aBuffer.length !==
        bBuffer.length
    ) {
        return false;
    }

    return crypto.timingSafeEqual(
        aBuffer,
        bBuffer
    );
}

function startIntegrationServer() {
    const app = express();

    app.use(
        express.json({
            limit: "32kb",
        })
    );

    app.get(
        "/health",
        (req, res) => {
            res.json({
                ok: true,
                service:
                    "business-cash-integration",
            });
        }
    );

    app.post(
        "/camp-card/redemptions",
        async (req, res) => {
            try {
                const secret =
                    req.get(
                        "x-camp-card-secret"
                    );

                if (
                    !secretsEqual(
                        secret,
                        process.env
                            .CAMP_CARD_API_SECRET
                    )
                ) {
                    return res
                        .status(401)
                        .json({
                            ok: false,
                            error:
                                "UNAUTHORIZED",
                        });
                }

                const result =
                    await recordCampCardRedemption(
                        req.body
                    );

                return res.json({
                    ok: true,
                    duplicate:
                        Boolean(
                            result
                                .duplicate
                        ),
                });

            } catch (error) {
                console.error(
                    "[CAMP CARD API]",
                    error
                );

                return res
                    .status(400)
                    .json({
                        ok: false,
                        error:
                        error.message,
                    });
            }
        }
    );

    app.get(
        "/purchase-sms/:orderId",
        async (req, res) => {
            try {
                const orderId =
                    Number(
                        req.params
                            .orderId
                    );

                const token =
                    req.query.token;

                if (
                    !Number.isInteger(
                        orderId
                    ) ||
                    orderId <= 0
                ) {
                    return res
                        .status(400)
                        .send(
                            "Некорректный заказ."
                        );
                }

                const data =
                    await getSmsOrderData(
                        orderId,
                        token
                    );

                if (!data) {
                    return res
                        .status(404)
                        .send(
                            "Заказ не найден или ссылка недействительна."
                        );
                }

                /*
                 * Не кэшируем страницу,
                 * потому что здесь номер
                 * поставщика и текст заказа.
                 */
                res.set(
                    "Cache-Control",
                    "no-store, private"
                );

                /*
                 * Экранируем данные перед
                 * вставкой в HTML.
                 */
                const escapeHtml =
                    (value) =>
                        String(
                            value || ""
                        )
                            .replace(
                                /&/g,
                                "&amp;"
                            )
                            .replace(
                                /</g,
                                "&lt;"
                            )
                            .replace(
                                />/g,
                                "&gt;"
                            )
                            .replace(
                                /"/g,
                                "&quot;"
                            )
                            .replace(
                                /'/g,
                                "&#039;"
                            );

                const phone =
                    escapeHtml(
                        data.phone
                    );

                const supplierName =
                    escapeHtml(
                        data
                            .supplierName
                    );

                const message =
                    escapeHtml(
                        data.message
                    );

                /*
                 * Эти значения отдельно
                 * передаём в JS безопасно
                 * через JSON.stringify.
                 */
                const jsPhone =
                    JSON.stringify(
                        String(
                            data.phone
                        )
                    );

                const jsMessage =
                    JSON.stringify(
                        String(
                            data.message
                        )
                    );

                return res
                    .type("html")
                    .send(`
<!doctype html>
<html lang="ru">
<head>
    <meta charset="utf-8">

    <meta
        name="viewport"
        content="width=device-width, initial-scale=1"
    >

    <title>Business Cash — SMS</title>

    <style>
        * {
            box-sizing: border-box;
        }

        body {
            margin: 0;
            padding: 24px;
            background: #f4f4f4;
            font-family:
                -apple-system,
                BlinkMacSystemFont,
                "Segoe UI",
                sans-serif;
            color: #111;
        }

        .card {
            max-width: 520px;
            margin: 0 auto;
            background: #fff;
            border-radius: 18px;
            padding: 22px;
            box-shadow:
                0 4px 20px
                rgba(0, 0, 0, 0.08);
        }

        h1 {
            margin-top: 0;
            font-size: 24px;
        }

        .label {
            margin-top: 18px;
            font-size: 13px;
            color: #777;
        }

        .value {
            margin-top: 5px;
            font-size: 17px;
            line-height: 1.45;
        }

        .message {
            white-space: pre-wrap;
            background: #f7f7f7;
            border-radius: 12px;
            padding: 14px;
            margin-top: 6px;
        }

        button {
            width: 100%;
            border: 0;
            border-radius: 12px;
            padding: 15px;
            margin-top: 16px;
            font-size: 17px;
            font-weight: 600;
            cursor: pointer;
        }

        .primary {
            background: #111;
            color: white;
        }

        .secondary {
            background: #e9e9e9;
            color: #111;
        }

        .hint {
            margin-top: 16px;
            color: #777;
            font-size: 13px;
            line-height: 1.4;
        }
    </style>
</head>

<body>
<div class="card">

    <h1>📱 SMS поставщику</h1>

    <div class="label">
        Поставщик
    </div>

    <div class="value">
        ${supplierName}
    </div>

    <div class="label">
        Телефон
    </div>

    <div class="value">
        ${phone}
    </div>

    <div class="label">
        Сообщение
    </div>

    <div class="value message">
        ${message}
    </div>

    <button
        class="primary"
        onclick="openSms()"
    >
        📱 Открыть SMS
    </button>

    <button
        class="secondary"
        onclick="copyText()"
    >
        📋 Скопировать текст
    </button>

    <div
        id="copy-status"
        class="hint"
    >
        После открытия останется только
        проверить сообщение и нажать
        «Отправить».
    </div>

</div>

<script>
    const phone =
        ${jsPhone};

    const message =
        ${jsMessage};

    function openSms() {
        const encoded =
            encodeURIComponent(
                message
            );

        const isIOS =
            /iPad|iPhone|iPod/i
                .test(
                    navigator.userAgent
                );

        /*
         * Android обычно понимает ?body=
         *
         * На iPhone используется
         * разделитель &body=.
         *
         * Если конкретная версия iOS
         * не подставит текст,
         * ниже остаётся кнопка
         * копирования.
         */
        const url =
            isIOS
                ? (
                    "sms:" +
                    phone +
                    "&body=" +
                    encoded
                )
                : (
                    "sms:" +
                    phone +
                    "?body=" +
                    encoded
                );

        window.location.href =
            url;
    }

    async function copyText() {
        const status =
            document.getElementById(
                "copy-status"
            );

        try {
            await navigator
                .clipboard
                .writeText(
                    message
                );

            status.textContent =
                "✅ Текст скопирован.";
        } catch (error) {
            status.textContent =
                "Не удалось скопировать автоматически.";
        }
    }
</script>

</body>
</html>
                `);

            } catch (error) {
                console.error(
                    "[PURCHASE SMS]",
                    error
                );

                return res
                    .status(500)
                    .send(
                        "Не удалось открыть заказ."
                    );
            }
        }
    );

    const port =
        Number(
            process.env
                .INTEGRATION_PORT ||
            3001
        );

    app.listen(
        port,
        "127.0.0.1",
        () => {
            console.log(
                `🔗 BusinessCash integration API: 127.0.0.1:${port}`
            );
        }
    );
}

module.exports = {
    startIntegrationServer,
};