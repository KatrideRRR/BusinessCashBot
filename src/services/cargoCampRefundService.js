const sequelize =
    require("../config/database");

const {
    Transaction,
    DailyClosure,
    CargoCampPaymentEvent,
    CargoCampRefundEvent,
} = require("../models");

async function recordCargoCampRefund(
    data
) {
    const provider =
        String(
            data.provider || ""
        )
            .trim()
            .toLowerCase();

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
        ![
            "yookassa",
            "tbank",
        ].includes(provider) ||
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

            /*
             * Один и тот же webhook
             * дважды не применяем.
             */
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
             * Ищем исходный платёж,
             * который ранее был записан
             * как выручка CargoCamp.
             */
            const originalPayment =
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

            /*
             * Например, возврат гарантии
             * или другого платежа, который
             * вообще не был выручкой
             * BusinessCash.
             */
            if (!originalPayment) {
                return {
                    ignored: true,
                };
            }

            const originalTransaction =
                await Transaction.findOne({
                    where: {
                        id:
                        originalPayment
                            .transactionId,

                        projectId:
                        originalPayment
                            .projectId,

                        type:
                            "income",
                    },

                    transaction:
                    dbTransaction,

                    lock:
                    dbTransaction
                        .LOCK.UPDATE,
                });

            if (!originalTransaction) {
                throw new Error(
                    "ORIGINAL_TRANSACTION_NOT_FOUND"
                );
            }

            /*
             * Сколько уже возвращали
             * по этому платежу раньше.
             */
            const previousRefunds =
                await CargoCampRefundEvent.findAll({
                    where: {
                        originalPaymentEventId:
                        originalPayment.id,
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

            /*
             * В CargoCampPaymentEvent
             * хранится исходная сумма.
             * Её не меняем — это наша
             * техническая история.
             */
            const originalAmount =
                BigInt(
                    originalPayment
                        .amountKopecks
                );

            const remaining =
                originalAmount -
                alreadyRefunded;

            let refundAmount;

            if (fullRefund) {
                refundAmount =
                    remaining;
            } else {
                try {
                    refundAmount =
                        BigInt(
                            data.amountKopecks
                        );
                } catch {
                    refundAmount =
                        0n;
                }
            }

            if (
                refundAmount <= 0n
            ) {
                return {
                    duplicate: true,
                };
            }

            if (
                refundAmount >
                remaining
            ) {
                throw new Error(
                    "REFUND_EXCEEDS_PAYMENT"
                );
            }

            /*
             * Главное изменение:
             *
             * возврат НЕ расход.
             *
             * Просто уменьшаем исходную
             * выручку.
             */
            const newNetIncome =
                remaining -
                refundAmount;

            await originalTransaction.update(
                {
                    amountKopecks:
                        newNetIncome.toString(),
                },
                {
                    transaction:
                    dbTransaction,
                }
            );

            /*
             * Refund сохраняем отдельно
             * только для истории,
             * идемпотентности и аудита.
             *
             * Новой Transaction здесь
             * больше НЕ создаём.
             */
            await CargoCampRefundEvent.create(
                {
                    eventId,

                    transactionId:
                        null,

                    originalPaymentEventId:
                    originalPayment.id,

                    projectId:
                    originalPayment.projectId,

                    provider,

                    providerPaymentId:
                    paymentId,

                    providerRefundId:
                    refundId,

                    amountKopecks:
                        refundAmount.toString(),

                    occurredAt,
                },
                {
                    transaction:
                    dbTransaction,
                }
            );

            /*
             * Если финансовый день
             * когда-нибудь уже будет
             * закрыт, уменьшаем и его
             * выручку.
             *
             * Возврат относится именно
             * к исходному доходу.
             */
            const closure =
                await DailyClosure.findOne({
                    where: {
                        projectId:
                        originalPayment
                            .projectId,

                        businessDate:
                        originalTransaction
                            .businessDate,

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
                const oldIncome =
                    BigInt(
                        closure
                            .totalIncomeKopecks ||
                        0
                    );

                const oldResult =
                    BigInt(
                        closure
                            .resultKopecks ||
                        0
                    );

                const newIncome =
                    oldIncome >=
                    refundAmount
                        ? oldIncome -
                        refundAmount
                        : 0n;

                await closure.update(
                    {
                        totalIncomeKopecks:
                            newIncome.toString(),

                        resultKopecks:
                            (
                                oldResult -
                                refundAmount
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
                `${refundAmount.toString()} коп. ` +
                `→ остаток ${newNetIncome.toString()} коп.`
            );

            return {
                duplicate: false,
                ignored: false,

                remainingKopecks:
                    newNetIncome.toString(),
            };
        }
    );
}

module.exports = {
    recordCargoCampRefund,
};