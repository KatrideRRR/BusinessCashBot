const dayjs =
    require("dayjs");

const utc =
    require("dayjs/plugin/utc");

const timezone =
    require("dayjs/plugin/timezone");

dayjs.extend(utc);
dayjs.extend(timezone);

const sequelize =
    require("../config/database");

const {
    User,
    Category,
    PaymentMethod,
    Transaction,
    DailyClosure,
    CargoCampPaymentEvent,
    CargoCampRefundEvent,
} = require("../models");

function getBusinessDate(
    occurredAt
) {
    const tz =
        process.env.APP_TIMEZONE ||
        "Europe/Moscow";

    return dayjs(
        occurredAt
    )
        .tz(tz)
        .format("YYYY-MM-DD");
}

function getProviderName(
    provider
) {
    if (provider === "yookassa") {
        return "ЮKassa";
    }

    if (provider === "tbank") {
        return "Т-Банк";
    }

    return null;
}

async function recordCargoCampRefund(
    data
) {
    const provider =
        String(
            data.provider || ""
        ).toLowerCase();

    const providerName =
        getProviderName(provider);

    const paymentId =
        String(
            data.paymentId || ""
        ).trim();

    const refundId =
        String(
            data.refundId || ""
        ).trim();

    const fullRefund =
        data.fullRefund === true;

    const occurredAt =
        data.occurredAt
            ? new Date(
                data.occurredAt
            )
            : new Date();

    if (
        !providerName ||
        !paymentId ||
        !refundId ||
        Number.isNaN(
            occurredAt.getTime()
        )
    ) {
        throw new Error(
            "INVALID_CARGOCAMP_REFUND"
        );
    }

    return sequelize.transaction(
        async (
            dbTransaction
        ) => {
            const eventId =
                `${provider}:refund:${refundId}`;

            const existing =
                await CargoCampRefundEvent.findOne({
                    where: {
                        eventId,
                    },

                    transaction:
                    dbTransaction,
                });

            if (existing) {
                return {
                    duplicate: true,
                };
            }

            /*
             * Ищем именно первоначальную
             * выручку CargoCamp.
             *
             * Если её нет, значит это,
             * например, возврат гарантии,
             * привязки карты и т.п.
             */
            const original =
                await CargoCampPaymentEvent.findOne({
                    where: {
                        provider,

                        providerPaymentId:
                        paymentId,
                    },

                    transaction:
                    dbTransaction,

                    lock:
                    dbTransaction
                        .LOCK.UPDATE,
                });

            if (!original) {
                return {
                    ignored: true,
                };
            }

            const previousRefunds =
                await CargoCampRefundEvent.findAll({
                    where: {
                        originalPaymentEventId:
                        original.id,
                    },

                    attributes: [
                        "amountKopecks",
                    ],

                    transaction:
                    dbTransaction,
                });

            let alreadyRefunded =
                0n;

            for (
                const refund of
                previousRefunds
                ) {
                alreadyRefunded +=
                    BigInt(
                        refund.amountKopecks ||
                        0
                    );
            }

            const originalAmount =
                BigInt(
                    original.amountKopecks
                );

            const remaining =
                originalAmount -
                alreadyRefunded;

            let amount;

            if (fullRefund) {
                amount =
                    remaining;
            } else {
                try {
                    amount =
                        BigInt(
                            data.amountKopecks
                        );
                } catch {
                    amount =
                        0n;
                }
            }

            if (amount <= 0n) {
                return {
                    duplicate: true,
                };
            }

            if (amount > remaining) {
                throw new Error(
                    "REFUND_EXCEEDS_PAYMENT"
                );
            }

            const owner =
                await User.findOne({
                    where: {
                        telegramId:
                        process.env
                            .OWNER_TELEGRAM_ID,
                    },

                    transaction:
                    dbTransaction,
                });

            if (!owner) {
                throw new Error(
                    "OWNER_NOT_FOUND"
                );
            }

            let category =
                await Category.findOne({
                    where: {
                        projectId:
                        original.projectId,

                        type:
                            "expense",

                        name:
                            "Возврат клиенту",
                    },

                    transaction:
                    dbTransaction,
                });

            if (!category) {
                category =
                    await Category.create(
                        {
                            projectId:
                            original.projectId,

                            type:
                                "expense",

                            name:
                                "Возврат клиенту",

                            isActive:
                                true,

                            createdBy:
                            owner.id,
                        },
                        {
                            transaction:
                            dbTransaction,
                        }
                    );
            } else if (
                !category.isActive
            ) {
                await category.update(
                    {
                        isActive:
                            true,
                    },
                    {
                        transaction:
                        dbTransaction,
                    }
                );
            }

            let paymentMethod =
                await PaymentMethod.findOne({
                    where: {
                        projectId:
                        original.projectId,

                        name:
                        providerName,
                    },

                    transaction:
                    dbTransaction,
                });

            if (!paymentMethod) {
                paymentMethod =
                    await PaymentMethod.create(
                        {
                            projectId:
                            original.projectId,

                            name:
                            providerName,

                            type:
                                "bank_account",

                            isActive:
                                true,
                        },
                        {
                            transaction:
                            dbTransaction,
                        }
                    );
            }

            const businessDate =
                getBusinessDate(
                    occurredAt
                );

            const cashTransaction =
                await Transaction.create(
                    {
                        projectId:
                        original.projectId,

                        type:
                            "expense",

                        categoryId:
                        category.id,

                        paymentMethodId:
                        paymentMethod.id,

                        amountKopecks:
                            amount.toString(),

                        businessDate,

                        closureId:
                            null,

                        /*
                         * У CargoCamp никакого
                         * источника "сегодняшняя
                         * выручка" нет.
                         */
                        fundSource:
                            null,

                        comment:
                            `CargoCamp refund ${provider} ${paymentId} ${refundId}`,

                        createdBy:
                        owner.id,
                    },
                    {
                        transaction:
                        dbTransaction,
                    }
                );

            await CargoCampRefundEvent.create(
                {
                    eventId,

                    transactionId:
                    cashTransaction.id,

                    originalPaymentEventId:
                    original.id,

                    projectId:
                    original.projectId,

                    provider,

                    providerPaymentId:
                    paymentId,

                    providerRefundId:
                    refundId,

                    amountKopecks:
                        amount.toString(),

                    occurredAt,
                },
                {
                    transaction:
                    dbTransaction,
                }
            );

            /*
             * На будущее:
             * если финансовый день уже
             * закрыт, поздний возврат
             * корректирует его дату.
             */
            const closure =
                await DailyClosure.findOne({
                    where: {
                        projectId:
                        original.projectId,

                        businessDate,

                        status:
                            "closed",
                    },

                    transaction:
                    dbTransaction,

                    lock:
                    dbTransaction
                        .LOCK.UPDATE,
                });

            if (closure) {
                const oldExpense =
                    BigInt(
                        closure
                            .totalExpenseKopecks ||
                        0
                    );

                const oldResult =
                    BigInt(
                        closure
                            .resultKopecks ||
                        0
                    );

                await closure.update(
                    {
                        totalExpenseKopecks:
                            (
                                oldExpense +
                                amount
                            ).toString(),

                        resultKopecks:
                            (
                                oldResult -
                                amount
                            ).toString(),
                    },
                    {
                        transaction:
                        dbTransaction,
                    }
                );
            }

            console.log(
                `↩️ CargoCamp refund: ` +
                `${provider} ` +
                `${amount.toString()} коп.`
            );

            return {
                duplicate: false,
                ignored: false,
            };
        }
    );
}

module.exports = {
    recordCargoCampRefund,
};