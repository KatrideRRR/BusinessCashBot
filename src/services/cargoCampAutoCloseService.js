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
    Transaction,
    DailyClosure,
} = require("../models");

const CHECK_INTERVAL_MS =
    60 * 1000;

const CLOSE_HOUR = 0;
const CLOSE_MINUTE = 5;

let timer = null;
let running = false;

function getTimezone() {
    return (
        process.env.APP_TIMEZONE ||
        "Europe/Moscow"
    );
}

function now() {
    return dayjs().tz(
        getTimezone()
    );
}

function previousBusinessDate() {
    return now()
        .subtract(1, "day")
        .format("YYYY-MM-DD");
}

function closeTimeReached() {
    const current = now();

    if (current.hour() > CLOSE_HOUR) {
        return true;
    }

    return (
        current.hour() === CLOSE_HOUR &&
        current.minute() >= CLOSE_MINUTE
    );
}

async function closeCargoCampDay(
    businessDate
) {
    const projectId =
        Number(
            process.env
                .CARGOCAMP_PROJECT_ID ||
            7
        );

    return sequelize.transaction(
        async (dbTransaction) => {
            const project =
                await Project.findOne({
                    where: {
                        id: projectId,
                        isActive: true,
                    },

                    transaction:
                    dbTransaction,
                });

            if (!project) {
                throw new Error(
                    "CARGOCAMP_PROJECT_NOT_FOUND"
                );
            }

            const existingClosure =
                await DailyClosure.findOne({
                    where: {
                        projectId,
                        businessDate,
                    },

                    transaction:
                    dbTransaction,

                    lock:
                    dbTransaction
                        .LOCK.UPDATE,
                });

            /*
             * Уже закрыли вручную
             * или предыдущим запуском.
             */
            if (
                existingClosure &&
                existingClosure.status ===
                "closed"
            ) {
                return {
                    alreadyClosed: true,
                    closure:
                    existingClosure,
                };
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

            /*
             * В CargoCamp вся выручка
             * уже приходит автоматически
             * через ЮKassa / Т-Банк.
             */
            const incomeRows =
                await Transaction.findAll({
                    where: {
                        projectId,
                        businessDate,
                        type: "income",
                    },

                    attributes: [
                        "amountKopecks",
                    ],

                    transaction:
                    dbTransaction,
                });

            let totalIncome = 0n;

            for (
                const row of incomeRows
                ) {
                totalIncome +=
                    BigInt(
                        row.amountKopecks ||
                        0
                    );
            }

            /*
             * Для CargoCamp расходы
             * не участвуют в закрытии
             * дневной выручки.
             */
            const values = {
                projectId,
                businessDate,

                totalIncomeKopecks:
                    totalIncome.toString(),

                totalExpenseKopecks:
                    "0",

                resultKopecks:
                    totalIncome.toString(),

                status:
                    "closed",

                closedBy:
                owner.id,

                closedAt:
                    new Date(),
            };

            let closure;

            if (existingClosure) {
                await existingClosure.update(
                    values,
                    {
                        transaction:
                        dbTransaction,
                    }
                );

                closure =
                    existingClosure;
            } else {
                closure =
                    await DailyClosure.create(
                        values,
                        {
                            transaction:
                            dbTransaction,
                        }
                    );
            }

            return {
                alreadyClosed: false,
                closure,
                totalIncome,
            };
        }
    );
}

async function runCargoCampAutoClose() {
    if (running) {
        return;
    }

    if (!closeTimeReached()) {
        return;
    }

    running = true;

    const businessDate =
        previousBusinessDate();

    try {
        const result =
            await closeCargoCampDay(
                businessDate
            );

        if (
            result.alreadyClosed
        ) {
            return;
        }

        console.log(
            `✅ CargoCamp: ${businessDate} ` +
            `закрыт автоматически. ` +
            `Выручка: ` +
            `${result.totalIncome.toString()} коп.`
        );
    } catch (error) {
        console.error(
            "❌ CargoCamp auto close error:",
            error
        );
    } finally {
        running = false;
    }
}

function startCargoCampAutoClose() {
    if (timer) {
        return;
    }

    console.log(
        `🕛 CargoCamp: автозакрытие ` +
        `ежедневно в 00:05 ` +
        `(${getTimezone()})`
    );

    /*
     * Проверяем сразу при запуске.
     * Это позволяет восстановиться
     * после перезапуска сервера.
     */
    void runCargoCampAutoClose();

    timer = setInterval(
        () => {
            void runCargoCampAutoClose();
        },
        CHECK_INTERVAL_MS
    );
}

module.exports = {
    startCargoCampAutoClose,
    runCargoCampAutoClose,
    closeCargoCampDay,
};