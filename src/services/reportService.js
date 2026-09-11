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
} = require("../models");

/*
 * Общие суммы проекта
 */

async function getProjectTotals(
    projectId,
    startDate,
    endDate
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

    let income = 0n;
    let expense = 0n;

    for (
        const row
        of rows
        ) {
        const amount =
            BigInt(
                row.total || 0
            );

        if (
            row.type ===
            "income"
        ) {
            income = amount;
        }

        if (
            row.type ===
            "expense"
        ) {
            expense = amount;
        }
    }

    return {
        income,
        expense,
        result:
            income - expense,
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
    return getByCategory(
        projectId,
        "expense",
        startDate,
        endDate
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
    getClosureStatus,
};