const crypto =
    require("crypto");

const {
    PurchaseOrder,
    Supplier,
} = require("../models");

function getSecret() {
    const secret =
        process.env
            .PURCHASE_SMS_SECRET;

    if (!secret) {
        throw new Error(
            "PURCHASE_SMS_SECRET не указан"
        );
    }

    return secret;
}

function createSmsToken(
    orderId
) {
    return crypto
        .createHmac(
            "sha256",
            getSecret()
        )
        .update(
            String(orderId)
        )
        .digest(
            "hex"
        );
}

function tokenIsValid(
    orderId,
    token
) {
    if (!token) {
        return false;
    }

    const expected =
        createSmsToken(
            orderId
        );

    const a =
        Buffer.from(
            String(expected)
        );

    const b =
        Buffer.from(
            String(token)
        );

    if (
        a.length !==
        b.length
    ) {
        return false;
    }

    return crypto
        .timingSafeEqual(
            a,
            b
        );
}

function buildSmsComposeUrl(
    orderId
) {
    const baseUrl =
        process.env
            .PURCHASE_SMS_PUBLIC_BASE_URL;

    if (!baseUrl) {
        throw new Error(
            "PURCHASE_SMS_PUBLIC_BASE_URL не указан"
        );
    }

    const token =
        createSmsToken(
            orderId
        );

    return (
        `${baseUrl.replace(/\/+$/, "")}` +
        `/purchase-sms/${orderId}` +
        `?token=${token}`
    );
}

async function getSmsOrderData(
    orderId,
    token
) {
    if (
        !tokenIsValid(
            orderId,
            token
        )
    ) {
        return null;
    }

    const order =
        await PurchaseOrder.findByPk(
            orderId,
            {
                include: [
                    {
                        model:
                        Supplier,

                        as:
                            "supplier",

                        attributes: [
                            "id",
                            "name",
                            "phone",
                        ],

                        required:
                            true,
                    },
                ],
            }
        );

    if (
        !order ||
        !order.supplier ||
        !order.supplier.phone
    ) {
        return null;
    }

    return {
        orderId:
        order.id,

        supplierName:
        order.supplier.name,

        phone:
        order.supplier.phone,

        message:
        order.messageText,
    };
}

module.exports = {
    buildSmsComposeUrl,
    getSmsOrderData,
};