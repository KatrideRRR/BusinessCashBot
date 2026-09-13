const dayjs = require("dayjs");
const utc = require("dayjs/plugin/utc");
const timezone = require("dayjs/plugin/timezone");

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
    CampCardEvent,
} = require("../models");

function getProjectName(locationCode) {
    const map = {
        adalet:
            process.env
                .CAMP_CARD_PROJECT_ADALET_NAME ||
            "Адалет",

        balaklavskaya:
            process.env
                .CAMP_CARD_PROJECT_BALAKLAVSKAYA_NAME ||
            "Балаклавская",
    };

    return map[locationCode] || null;
}

function getBusinessDate(occurredAt) {
    const tz =
        process.env.APP_TIMEZONE ||
        "Europe/Moscow";

    return dayjs(occurredAt)
        .tz(tz)
        .format("YYYY-MM-DD");
}

async function recordCampCardRedemption(data) {
    const {
        eventId,
        locationCode,
        amountKopecks,
        paidAmountKopecks,
        bonusAmountKopecks,
        occurredAt,
    } = data;

    const amount =
        BigInt(amountKopecks);

    const paid =
        BigInt(paidAmountKopecks);

    const bonus =
        BigInt(bonusAmountKopecks);

    if (
        !eventId ||
        !locationCode ||
        amount <= 0n ||
        paid < 0n ||
        bonus < 0n ||
        paid + bonus !== amount
    ) {
        throw new Error(
            "INVALID_CAMP_CARD_EVENT"
        );
    }

    const projectName =
        getProjectName(locationCode);

    if (!projectName) {
        throw new Error(
            "UNKNOWN_LOCATION"
        );
    }

    try {
        return await sequelize.transaction(
            async (dbTransaction) => {

                /*
                 * Идемпотентность.
                 */

                const existing =
                    await CampCardEvent.findOne({
                        where: {
                            eventId,
                        },

                        transaction:
                        dbTransaction,
                    });

                if (existing) {
                    return {
                        duplicate: true,
                        event: existing,
                    };
                }

                const project =
                    await Project.findOne({
                        where: {
                            name: projectName,
                            isActive: true,
                        },

                        transaction:
                        dbTransaction,
                    });

                if (!project) {
                    throw new Error(
                        `PROJECT_NOT_FOUND:${projectName}`
                    );
                }

                /*
                 * Все автоматические записи
                 * записываем от владельца.
                 */

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

                /*
                 * Статья дохода.
                 */

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

                /*
                 * Способ оплаты Camp Card.
                 */

                let paymentMethod =
                    await PaymentMethod.findOne({
                        where: {
                            projectId:
                            project.id,

                            name:
                                "Camp Card",
                        },

                        transaction:
                        dbTransaction,
                    });

                if (!paymentMethod) {
                    paymentMethod =
                        await PaymentMethod.create(
                            {
                                projectId:
                                project.id,

                                name:
                                    "Camp Card",

                                type:
                                    "other",

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
                            isActive: true,
                        },
                        {
                            transaction:
                            dbTransaction,
                        }
                    );
                }

                const eventDate =
                    occurredAt
                        ? new Date(
                            occurredAt
                        )
                        : new Date();

                if (
                    Number.isNaN(
                        eventDate.getTime()
                    )
                ) {
                    throw new Error(
                        "INVALID_OCCURRED_AT"
                    );
                }

                const businessDate =
                    getBusinessDate(
                        eventDate
                    );

                /*
                 * Создаём обычную Transaction.
                 *
                 * Именно поэтому старые отчёты
                 * BusinessCashBot уже смогут
                 * видеть Camp Card.
                 */

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
                                `Camp Card ${eventId}`,

                            createdBy:
                            owner.id,
                        },
                        {
                            transaction:
                            dbTransaction,
                        }
                    );

                const event =
                    await CampCardEvent.create(
                        {
                            eventId,

                            transactionId:
                            cashTransaction.id,

                            projectId:
                            project.id,

                            locationCode,

                            amountKopecks:
                                amount.toString(),

                            paidAmountKopecks:
                                paid.toString(),

                            bonusAmountKopecks:
                                bonus.toString(),

                            occurredAt:
                            eventDate,
                        },
                        {
                            transaction:
                            dbTransaction,
                        }
                    );

                /*
                 * Если день уже закрыли,
                 * а потом прошла Camp Card
                 * продажа — не теряем её.
                 *
                 * Автоматически увеличиваем
                 * закрытие дня.
                 */

                const closure =
                    await DailyClosure.findOne({
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
                    duplicate: false,
                    event,
                    transaction:
                    cashTransaction,
                    project,
                    businessDate,
                };
            }
        );

    } catch (error) {
        /*
         * Если два одинаковых eventId
         * прилетели одновременно, UNIQUE
         * всё равно не даст задвоить кассу.
         */

        if (
            error.name ===
            "SequelizeUniqueConstraintError"
        ) {
            return {
                duplicate: true,
            };
        }

        throw error;
    }
}

module.exports = {
    recordCampCardRedemption,
};