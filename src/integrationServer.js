const crypto = require("crypto");
const express = require("express");

const {
    recordCampCardRedemption,
} = require("./services/campCardService");

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