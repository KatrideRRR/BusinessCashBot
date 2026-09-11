const {
    PaymentMethod,
} = require("../models");

const DEFAULT_PAYMENT_METHODS = [
    {
        name: "Наличные",
        type: "cash",
    },
    {
        name: "Терминал",
        type: "terminal",
    },
    {
        name: "Перевод",
        type: "transfer",
    },
    {
        name: "Расчётный счёт",
        type: "bank_account",
    },
    {
        name: "Другое",
        type: "other",
    },
];

async function ensureDefaultPaymentMethods(
    projectId
) {
    for (
        const item
        of DEFAULT_PAYMENT_METHODS
        ) {
        await PaymentMethod.findOrCreate({
            where: {
                projectId,
                name: item.name,
            },

            defaults: {
                projectId,
                name: item.name,
                type: item.type,
                isActive: true,
            },
        });
    }
}

module.exports = {
    ensureDefaultPaymentMethods,
};