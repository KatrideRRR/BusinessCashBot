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
    Project,
    Category,
    PaymentMethod,
    Transaction,
    DailyClosure,
    CargoCampPaymentEvent,
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
        .format(
            "YYYY-MM-DD"
        );
}

function normalizeKind(value) {
    if (
        value === "premium"
    ) {
        return "premium";
    }

    if (
        value === "debt"
    ) {
        return "debt";
    }

    if (
        [
            "promo",
            "promotion",
            "order_promotion",
        ].includes(value)
    ) {
        return "promotion";
    }

    return null;
}

function getProviderName(
    provider
) {
    if (
        provider === "yookassa"
    ) {
        return "ЮKassa";
    }

    if (
        provider === "tbank"
    ) {
        return "Т-Банк";
    }

    return null;
}

async function recordCargoCampPayment(
    data
) {
    const provider =
        String(
            data.provider || ""
        ).toLowerCase();

    const paymentId =
        String(
            data.paymentId || ""
        ).trim();

    const kind =
        normalizeKind(
            data.kind
        );

    const providerName =
        getProviderName(
            provider
        );

    let amount;

    try {
        amount =
            BigInt(
                data.amountKopecks
            );
    } catch {
        amount = 0n;
    }

    if (
        !providerName ||
        !paymentId ||
        !kind ||
        amount <= 0n
    ) {
        throw new Error(
            "INVALID_CARGOCAMP_PAYMENT"
        );
    }

    const eventId =
        String(
            data.eventId ||
            `${provider}:${paymentId}`
        );

    const occurredAt =
        data.occurredAt
            ? new Date(
                data.occurredAt
            )
            : new Date();

    if (
        Number.isNaN(
            occurredAt.getTime()
        )
    ) {
        throw new Error(
            "INVALID_OCCURRED_AT"
        );
    }

    const projectId =
        Number(
            process.env
                .CARGOCAMP_PROJECT_ID ||
            7
        );

    try {
        return await sequelize.transaction(
            async (
                dbTransaction
            ) => {
                const existing =
                    await CargoCampPaymentEvent.findOne(
                        {
                            where: {
                                eventId,
                            },

                            transaction:
                            dbTransaction,
                        }
                    );

                if (existing) {
                    return {
                        duplicate:
                            true,
                    };
                }

                const project =
                    await Project.findOne({
                        where: {
                            id:
                            projectId,

                            isActive:
                                true,
                        },

                        transaction:
                        dbTransaction,
                    });

                if (!project) {
                    throw new Error(
                        "CARGOCAMP_PROJECT_NOT_FOUND"
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
                            project.id,

                            type:
                                "income",

                            name:
                                "Выручка",
                        },

                        transaction:
                        dbTransaction,
                    });

                if (!category) {
                    category =
                        await Category.create(
                            {
                                projectId:
                                project.id,

                                type:
                                    "income",

                                name:
                                    "Выручка",

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
                }

                else if (
                    !category.isActive
                ) {
                    await category.update(
                        {
                            isActive: true,
                        },
                        {
                            transaction:
                            dbTransaction,
                        }
                    );
                }

                let paymentMethod =
                    await PaymentMethod.findOne(
                        {
                            where: {
                                projectId:
                                project.id,

                                name:
                                providerName,
                            },

                            transaction:
                            dbTransaction,
                        }
                    );

                if (!paymentMethod) {
                    paymentMethod =
                        await PaymentMethod.create(
                            {
                                projectId:
                                project.id,

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
                } else if (
                    !paymentMethod.isActive
                ) {
                    await paymentMethod.update(
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

                const businessDate =
                    getBusinessDate(
                        occurredAt
                    );

                const cashTransaction =
                    await Transaction.create(
                        {
                            projectId:
                            project.id,

                            type:
                                "income",

                            categoryId:
                            category.id,

                            paymentMethodId:
                            paymentMethod.id,

                            amountKopecks:
                                amount.toString(),

                            businessDate,

                            closureId:
                                null,

                            fundSource:
                                null,

                            comment:
                                `CargoCamp ${provider} ${kind} ${paymentId}`,

                            createdBy:
                            owner.id,
                        },
                        {
                            transaction:
                            dbTransaction,
                        }
                    );

                const event =
                    await CargoCampPaymentEvent.create(
                        {
                            eventId,

                            transactionId:
                            cashTransaction.id,

                            projectId:
                            project.id,

                            provider,

                            providerPaymentId:
                            paymentId,

                            paymentKind:
                            kind,

                            amountKopecks:
                                amount.toString(),

                            sourceUserId:
                                data.userId ||
                                null,

                            sourceOrderId:
                                data.orderId ||
                                null,

                            occurredAt,
                        },
                        {
                            transaction:
                            dbTransaction,
                        }
                    );

                /*
                 * Если день уже закрыт,
                 * поздний платёж всё равно
                 * прибавляем к итоговой
                 * выручке CargoCamp.
                 */
                const closure =
                    await DailyClosure.findOne(
                        {
                            where: {
                                projectId:
                                project.id,

                                businessDate,

                                status:
                                    "closed",
                            },

                            transaction:
                            dbTransaction,

                            lock:
                            dbTransaction
                                .LOCK.UPDATE,
                        }
                    );

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

                    await closure.update(
                        {
                            totalIncomeKopecks:
                                (
                                    oldIncome +
                                    amount
                                ).toString(),

                            resultKopecks:
                                (
                                    oldResult +
                                    amount
                                ).toString(),
                        },
                        {
                            transaction:
                            dbTransaction,
                        }
                    );
                }

                return {
                    duplicate:
                        false,

                    event,

                    transaction:
                    cashTransaction,
                };
            }
        );
    } catch (error) {
        if (
            error.name ===
            "SequelizeUniqueConstraintError"
        ) {
            return {
                duplicate:
                    true,
            };
        }

        throw error;
    }
}

module.exports = {
    recordCargoCampPayment,
};