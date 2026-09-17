const {
    Op,
    fn,
    col,
} = require("sequelize");

const {
    Transaction,
    Category,
    PaymentMethod,
    DailyClosure,
    CampFoodSharedExpense,
    CampFoodExpenseAllocation,
} = require("../models");

async function getAllocatedExpenseTotal(
    projectId,
    startDate,
    endDate
) {
    const rows =
        await CampFoodExpenseAllocation.findAll({
            attributes: [
                "amountKopecks",
            ],

            where: {
                projectId,
            },

            include: [
                {
                    model:
                    CampFoodSharedExpense,

                    as:
                        "sharedExpense",

                    attributes: [],

                    required: true,

                    where: {
                        businessDate: {
                            [Op.between]: [
                                startDate,
                                endDate,
                            ],
                        },
                    },
                },
            ],
        });

    return rows.reduce(
        (
            sum,
            row
        ) =>
            sum +
            BigInt(
                row.amountKopecks ||
                0
            ),
        0n
    );
}

/*
 * Общие суммы проекта
 */

async function getProjectTotals(
    projectId,
    startDate,
    endDate,
    revenueMode = null
) {
    const rows =
        await Transaction.findAll({
            attributes: [
                "type",
                [
                    fn(
                        "SUM",
                        col(
                            "amount_kopecks"
                        )
                    ),
                    "total",
                ],
            ],

            where: {
                projectId,

                businessDate: {
                    [Op.between]: [
                        startDate,
                        endDate,
                    ],
                },
            },

            group: [
                "type",
            ],

            raw: true,
        });

    let transactionIncome = 0n;
    let expense = 0n;

    const allocatedExpense =
        await getAllocatedExpenseTotal(
            projectId,
            startDate,
            endDate
        );

    expense +=
        allocatedExpense;

    for (const row of rows) {
        const amount =
            BigInt(
                row.total || 0
            );

        if (
            row.type ===
            "income"
        ) {
            transactionIncome =
                amount;
        }

        if (
            row.type ===
            "expense"
        ) {
            expense =
                amount;
        }
    }

    /*
     * Прямые проекты вроде Rancho
     * продолжают работать как раньше.
     */
    if (
        revenueMode !==
        "daily_close"
    ) {
        return {
            income:
            transactionIncome,

            expense,

            result:
                transactionIncome -
                expense,

            revenueSpentFromClosedDays:
                0n,
        };
    }

    /*
     * Для проектов с закрытием дня
     * именно DailyClosure является
     * итогом полной дневной выручки.
     */
    const closures =
        await DailyClosure.findAll({
            attributes: [
                "businessDate",
                "totalIncomeKopecks",
                "totalExpenseKopecks",
            ],

            where: {
                projectId,

                businessDate: {
                    [Op.between]: [
                        startDate,
                        endDate,
                    ],
                },

                status:
                    "closed",
            },

            raw: true,
        });

    const closedDates = [];

    let closedIncome = 0n;

    let revenueSpentFromClosedDays =
        0n;

    for (
        const closure
        of closures
        ) {
        closedDates.push(
            String(
                closure.businessDate
            )
        );

        closedIncome +=
            BigInt(
                closure
                    .totalIncomeKopecks ||
                0
            );

        revenueSpentFromClosedDays +=
            BigInt(
                closure
                    .totalExpenseKopecks ||
                0
            );
    }

    /*
     * Если период включает ещё
     * незакрытый сегодняшний день,
     * его автоматические поступления
     * тоже не теряем.
     */
    const businessDateWhere = {
        [Op.between]: [
            startDate,
            endDate,
        ],
    };

    if (
        closedDates.length > 0
    ) {
        businessDateWhere[
            Op.notIn
            ] = closedDates;
    }

    const openIncomeRows =
        await Transaction.findAll({
            attributes: [
                [
                    fn(
                        "SUM",
                        col(
                            "amount_kopecks"
                        )
                    ),
                    "total",
                ],
            ],

            where: {
                projectId,

                type:
                    "income",

                businessDate:
                businessDateWhere,
            },

            raw: true,
        });

    const openIncome =
        BigInt(
            openIncomeRows[0]
                ?.total ||
            0
        );

    const income =
        closedIncome +
        openIncome;

    return {
        income,

        expense,

        result:
            income -
            expense,

        revenueSpentFromClosedDays,
    };
}

/*
 * Разбивка доходов по способу оплаты
 */

async function getIncomeByPaymentMethod(
    projectId,
    startDate,
    endDate
) {
    const rows =
        await Transaction.findAll({
            attributes: [
                "paymentMethodId",
                [
                    fn(
                        "SUM",
                        col(
                            "amount_kopecks"
                        )
                    ),
                    "total",
                ],
            ],

            where: {
                projectId,
                type: "income",

                businessDate: {
                    [Op.between]: [
                        startDate,
                        endDate,
                    ],
                },
            },

            include: [
                {
                    model:
                    PaymentMethod,

                    as:
                        "paymentMethod",

                    attributes: [
                        "name",
                    ],
                },
            ],

            group: [
                "paymentMethodId",
                "paymentMethod.id",
                "paymentMethod.name",
            ],

            raw: true,
        });

    return rows
        .map(
            (row) => ({
                name:
                    row[
                        "paymentMethod.name"
                        ] ||
                    "Неизвестно",

                amount:
                    BigInt(
                        row.total ||
                        0
                    ),
            })
        )
        .filter(
            (row) =>
                row.amount !== 0n
        )
        .sort(
            (a, b) =>
                a.amount >
                b.amount
                    ? -1
                    : 1
        );
}

/*
 * Доходы по статьям
 */

async function getIncomeByCategory(
    projectId,
    startDate,
    endDate
) {
    return getByCategory(
        projectId,
        "income",
        startDate,
        endDate
    );
}

/*
 * Расходы по статьям
 */

async function getExpenseByCategory(
    projectId,
    startDate,
    endDate
) {
    const directRows =
        await getByCategory(
            projectId,
            "expense",
            startDate,
            endDate
        );

    const allocationRows =
        await CampFoodExpenseAllocation.findAll({
            attributes: [
                "amountKopecks",
            ],

            where: {
                projectId,
            },

            include: [
                {
                    model:
                    CampFoodSharedExpense,

                    as:
                        "sharedExpense",

                    attributes: [
                        "categoryName",
                    ],

                    required: true,

                    where: {
                        businessDate: {
                            [Op.between]: [
                                startDate,
                                endDate,
                            ],
                        },
                    },
                },
            ],
        });

    const map =
        new Map();

    function add(
        name,
        amount
    ) {
        const cleanName =
            String(
                name ||
                "Без статьи"
            ).trim();

        const key =
            cleanName
                .toLocaleLowerCase(
                    "ru-RU"
                );

        const current =
            map.get(key);

        if (current) {
            current.amount +=
                BigInt(amount);
        } else {
            map.set(
                key,
                {
                    name:
                    cleanName,

                    amount:
                        BigInt(amount),
                }
            );
        }
    }

    for (
        const row
        of directRows
        ) {
        add(
            row.name,
            row.amount
        );
    }

    for (
        const row
        of allocationRows
        ) {
        add(
            row.sharedExpense
                ?.categoryName ||
            "Без статьи",

            row.amountKopecks ||
            0
        );
    }

    return Array.from(
        map.values()
    )
        .filter(
            (row) =>
                row.amount !== 0n
        )
        .sort(
            (a, b) =>
                a.amount >
                b.amount
                    ? -1
                    : a.amount <
                    b.amount
                        ? 1
                        : 0
        );
}

async function getExpenseByCategoryAndSource(
    projectId,
    startDate,
    endDate
) {
    const rows =
        await Transaction.findAll({
            attributes: [
                "categoryId",
                "fundSource",
                [
                    fn(
                        "SUM",
                        col(
                            "amount_kopecks"
                        )
                    ),
                    "total",
                ],
            ],

            where: {
                projectId,
                type: "expense",

                businessDate: {
                    [Op.between]: [
                        startDate,
                        endDate,
                    ],
                },
            },

            include: [
                {
                    model:
                    Category,

                    as:
                        "category",

                    attributes: [
                        "name",
                    ],
                },
            ],

            group: [
                "categoryId",
                "fundSource",
                "category.id",
                "category.name",
            ],

            raw: true,
        });

    return rows
        .map(
            (row) => ({
                name:
                    row[
                        "category.name"
                        ] ||
                    "Без статьи",

                source:
                    row.fundSource ||
                    "unknown",

                amount:
                    BigInt(
                        row.total || 0
                    ),
            })
        )
        .sort(
            (a, b) =>
                a.amount >
                b.amount
                    ? -1
                    : 1
        );
}

async function getByCategory(
    projectId,
    type,
    startDate,
    endDate
) {
    const rows =
        await Transaction.findAll({
            attributes: [
                "categoryId",
                [
                    fn(
                        "SUM",
                        col(
                            "amount_kopecks"
                        )
                    ),
                    "total",
                ],
            ],

            where: {
                projectId,
                type,

                businessDate: {
                    [Op.between]: [
                        startDate,
                        endDate,
                    ],
                },
            },

            include: [
                {
                    model:
                    Category,

                    as: "category",

                    attributes: [
                        "name",
                    ],
                },
            ],

            group: [
                "categoryId",
                "category.id",
                "category.name",
            ],

            raw: true,
        });

    return rows
        .map(
            (row) => ({
                name:
                    row[
                        "category.name"
                        ] ||
                    "Без статьи",

                amount:
                    BigInt(
                        row.total ||
                        0
                    ),
            })
        )
        .filter(
            (row) =>
                row.amount !== 0n
        )
        .sort(
            (a, b) =>
                a.amount >
                b.amount
                    ? -1
                    : 1
        );
}

/*
 * Проверка закрытия конкретного дня
 */

async function getClosureStatus(
    projectId,
    businessDate
) {
    return DailyClosure.findOne({
        where: {
            projectId,
            businessDate,
            status: "closed",
        },
    });
}

module.exports = {
    getProjectTotals,
    getIncomeByPaymentMethod,
    getIncomeByCategory,
    getExpenseByCategory,
    getExpenseByCategoryAndSource,
    getClosureStatus,
};