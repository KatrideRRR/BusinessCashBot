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
    EvotorEvent,
} = require("../models");

const {
    ensureDefaultPaymentMethods,
} = require("./paymentMethodService");

const EVOTOR_API_URL =
    "https://api.evotor.ru";

let syncRunning = false;

/*
 * Эвотор передаёт деньги в рублях:
 * 150
 * 150.50
 *
 * BusinessCashBot хранит деньги в копейках.
 */
function rublesToKopecks(value) {
    const raw =
        String(value ?? "")
            .trim()
            .replace(",", ".");

    if (
        !/^\d+(\.\d{1,2})?$/.test(raw)
    ) {
        throw new Error(
            `INVALID_EVOTOR_AMOUNT:${raw}`
        );
    }

    const [
        rubles,
        kopecks = "",
    ] = raw.split(".");

    return (
        BigInt(rubles) * 100n +
        BigInt(
            kopecks.padEnd(2, "0")
        )
    );
}

function getBusinessDate(date) {
    const tz =
        process.env.APP_TIMEZONE ||
        "Europe/Moscow";

    return dayjs(date)
        .tz(tz)
        .format("YYYY-MM-DD");
}

function getSyncFromMs() {
    const value =
        process.env.EVOTOR_SYNC_FROM;

    if (!value) {
        throw new Error(
            "EVOTOR_SYNC_FROM_NOT_SET"
        );
    }

    const date =
        new Date(value);

    if (
        Number.isNaN(
            date.getTime()
        )
    ) {
        throw new Error(
            "INVALID_EVOTOR_SYNC_FROM"
        );
    }

    return date.getTime();
}

async function evotorRequest(
    path
) {
    const token =
        process.env.EVOTOR_TOKEN;

    if (!token) {
        throw new Error(
            "EVOTOR_TOKEN_NOT_SET"
        );
    }

    const response =
        await fetch(
            `${EVOTOR_API_URL}${path}`,
            {
                headers: {
                    Authorization:
                        `Bearer ${token}`,

                    Accept:
                        "application/vnd.evotor.v2+json",
                },
            }
        );

    if (!response.ok) {
        const body =
            await response.text();

        throw new Error(
            `EVOTOR_HTTP_${response.status}: ${body}`
        );
    }

    return response.json();
}

/*
 * Получаем все страницы документов.
 */
async function loadDocuments(
    storeId,
    since
) {
    const documents = [];

    let cursor = null;

    do {
        let path;

        if (!cursor) {
            path =
                `/stores/${encodeURIComponent(
                    storeId
                )}/documents` +
                `?since=${since}` +
                `&type=SELL,PAYBACK`;
        } else {
            path =
                `/stores/${encodeURIComponent(
                    storeId
                )}/documents` +
                `?cursor=${encodeURIComponent(
                    cursor
                )}`;
        }

        const data =
            await evotorRequest(
                path
            );

        documents.push(
            ...(data.items || [])
        );

        cursor =
            data.paging
                ?.next_cursor ||
            null;

    } while (cursor);

    return documents;
}

async function getOwner(
    dbTransaction
) {
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

    return owner;
}

async function getIncomeCategory(
    project,
    owner,
    dbTransaction
) {
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
    } else if (
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

    return category;
}

async function getTerminalMethod(
    project,
    dbTransaction
) {
    await ensureDefaultPaymentMethods(
        project.id
    );

    const method =
        await PaymentMethod.findOne({
            where: {
                projectId:
                project.id,

                name:
                    "Терминал",
            },

            transaction:
            dbTransaction,
        });

    if (!method) {
        throw new Error(
            `TERMINAL_PAYMENT_METHOD_NOT_FOUND:${project.id}`
        );
    }

    if (!method.isActive) {
        await method.update(
            {
                isActive: true,
            },
            {
                transaction:
                dbTransaction,
            }
        );
    }

    return method;
}

/*
 * SELL + ELECTRON
 *
 * Создаём обычный доход BusinessCashBot.
 */
async function applySale(
    project,
    document,
    payment
) {
    const eventKey =
        `SELL:${document.id}:${payment.id}`;

    try {
        return await sequelize.transaction(
            async (
                dbTransaction
            ) => {

                /*
                 * Сначала проверяем,
                 * не обрабатывали ли уже.
                 */
                const existing =
                    await EvotorEvent.findOne({
                        where: {
                            eventKey,
                        },

                        transaction:
                        dbTransaction,
                    });

                if (existing) {
                    return {
                        duplicate: true,
                    };
                }

                const amount =
                    rublesToKopecks(
                        payment.sum
                    );

                if (amount <= 0n) {
                    throw new Error(
                        `INVALID_EVOTOR_PAYMENT_AMOUNT:${eventKey}`
                    );
                }

                const occurredAt =
                    new Date(
                        document.close_date
                    );

                if (
                    Number.isNaN(
                        occurredAt
                            .getTime()
                    )
                ) {
                    throw new Error(
                        `INVALID_EVOTOR_CLOSE_DATE:${document.id}`
                    );
                }

                const businessDate =
                    getBusinessDate(
                        occurredAt
                    );

                const owner =
                    await getOwner(
                        dbTransaction
                    );

                const category =
                    await getIncomeCategory(
                        project,
                        owner,
                        dbTransaction
                    );

                const paymentMethod =
                    await getTerminalMethod(
                        project,
                        dbTransaction
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
                                `Evotor ${document.id} / ${payment.id}`,

                            createdBy:
                            owner.id,
                        },
                        {
                            transaction:
                            dbTransaction,
                        }
                    );

                await EvotorEvent.create(
                    {
                        eventKey,

                        transactionId:
                        cashTransaction.id,

                        projectId:
                        project.id,

                        storeId:
                            document.store_id ||
                            project.evotorStoreId,

                        deviceId:
                            document.device_id ||
                            null,

                        documentId:
                        document.id,

                        paymentId:
                        payment.id,

                        documentType:
                            "SELL",

                        paymentType:
                        payment.type,

                        amountKopecks:
                            amount.toString(),

                        occurredAt,

                        status:
                            "applied",
                    },
                    {
                        transaction:
                        dbTransaction,
                    }
                );

                /*
                 * Если день уже закрыли,
                 * но чек пришёл позже —
                 * добавляем сумму в закрытие.
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
                    duplicate:
                        false,

                    amount,

                    businessDate,
                };
            }
        );
    } catch (error) {
        /*
         * Защита от одновременной
         * обработки одного события.
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

/*
 * PAYBACK пока безопасно сохраняем,
 * но НЕ превращаем в обычный expense.
 *
 * Иначе возвраты будут искажать
 * настоящие расходы бизнеса.
 */
async function storeRefund(
    project,
    document,
    payment
) {
    const eventKey =
        `PAYBACK:${document.id}:${payment.id}`;

    try {
        return await sequelize.transaction(
            async (
                dbTransaction
            ) => {

                const existing =
                    await EvotorEvent.findOne({
                        where: {
                            eventKey,
                        },

                        transaction:
                        dbTransaction,
                    });

                if (existing) {
                    return {
                        duplicate: true,
                    };
                }

                const amount =
                    rublesToKopecks(
                        payment.sum
                    );

                const occurredAt =
                    new Date(
                        document.close_date
                    );

                if (
                    Number.isNaN(
                        occurredAt
                            .getTime()
                    )
                ) {
                    throw new Error(
                        `INVALID_EVOTOR_CLOSE_DATE:${document.id}`
                    );
                }

                await EvotorEvent.create(
                    {
                        eventKey,

                        transactionId:
                            null,

                        projectId:
                        project.id,

                        storeId:
                            document.store_id ||
                            project.evotorStoreId,

                        deviceId:
                            document.device_id ||
                            null,

                        documentId:
                        document.id,

                        paymentId:
                        payment.id,

                        documentType:
                            "PAYBACK",

                        paymentType:
                        payment.type,

                        amountKopecks:
                            amount.toString(),

                        occurredAt,

                        status:
                            "pending_refund",
                    },
                    {
                        transaction:
                        dbTransaction,
                    }
                );

                console.warn(
                    `↩️ Evotor PAYBACK сохранён: ${project.name}, ${payment.sum} ₽`
                );

                return {
                    duplicate:
                        false,
                };
            }
        );
    } catch (error) {
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

async function processDocument(
    project,
    document
) {
    if (
        document.type !== "SELL" &&
        document.type !== "PAYBACK"
    ) {
        return;
    }

    /*
     * Дополнительная защита:
     * документ должен реально
     * относиться к этому магазину.
     */
    if (
        document.store_id &&
        document.store_id !==
        project.evotorStoreId
    ) {
        return;
    }

    const payments =
        document.body
            ?.payments ||
        [];

    for (
        const payment
        of payments
        ) {
        /*
         * Наличные не трогаем.
         *
         * В BusinessCashBot их
         * вводят вручную.
         */
        if (
            payment.type !==
            "ELECTRON"
        ) {
            continue;
        }

        if (
            !payment.id ||
            payment.sum ===
            undefined ||
            payment.sum ===
            null
        ) {
            console.warn(
                `⚠️ Некорректный платёж Evotor в документе ${document.id}`
            );

            continue;
        }

        if (
            document.type ===
            "SELL"
        ) {
            const result =
                await applySale(
                    project,
                    document,
                    payment
                );

            if (
                !result.duplicate
            ) {
                console.log(
                    `💳 Evotor: ${project.name} +${payment.sum} ₽`
                );
            }

            continue;
        }

        await storeRefund(
            project,
            document,
            payment
        );
    }
}

async function syncProject(
    project,
    since
) {
    const documents =
        await loadDocuments(
            project.evotorStoreId,
            since
        );

    for (
        const document
        of documents
        ) {
        await processDocument(
            project,
            document
        );
    }

    return documents.length;
}

async function syncEvotor() {
    if (syncRunning) {
        return;
    }

    syncRunning = true;

    try {
        if (
            !process.env
                .EVOTOR_TOKEN
        ) {
            console.log(
                "ℹ️ Evotor sync отключён: EVOTOR_TOKEN не указан"
            );

            return;
        }

        const since =
            getSyncFromMs();

        const projects =
            await Project.findAll({
                where: {
                    isActive: true,
                },
            });

        const evotorProjects =
            projects.filter(
                (project) =>
                    Boolean(
                        project
                            .evotorStoreId
                    )
            );

        for (
            const project
            of evotorProjects
            ) {
            try {
                const count =
                    await syncProject(
                        project,
                        since
                    );

                console.log(
                    `✅ Evotor sync: ${project.name}, документов: ${count}`
                );
            } catch (error) {
                console.error(
                    `❌ Evotor sync ${project.name}:`,
                    error
                );
            }
        }
    } finally {
        syncRunning = false;
    }
}

function startEvotorSync() {
    const enabled =
        process.env
            .EVOTOR_SYNC_ENABLED ===
        "true";

    if (!enabled) {
        console.log(
            "ℹ️ Evotor sync выключен"
        );

        return;
    }

    /*
     * Первый запрос сразу при запуске.
     */
    syncEvotor()
        .catch((error) => {
            console.error(
                "❌ Ошибка первого Evotor sync:",
                error
            );
        });

    const intervalMs =
        Number(
            process.env
                .EVOTOR_SYNC_INTERVAL_MS ||
            120000
        );

    setInterval(
        () => {
            syncEvotor()
                .catch((error) => {
                    console.error(
                        "❌ Ошибка Evotor sync:",
                        error
                    );
                });
        },
        intervalMs
    );

    console.log(
        `✅ Evotor sync запущен, интервал ${intervalMs / 1000} сек.`
    );
}

module.exports = {
    syncEvotor,
    startEvotorSync,
};