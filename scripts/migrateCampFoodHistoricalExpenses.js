require("dotenv").config();

const {
    Op,
} = require("sequelize");

const sequelize =
    require("../src/config/database");

const {
    Transaction,
    Category,
    DailyClosure,
    CampFoodSharedExpense,
} = require("../src/models");

const {
    getCampFoodProjectIds,
} = require(
    "../src/services/campFoodSharedExpenseService"
);

const {
    allocateCampFoodExpensesForDate,
} = require(
    "../src/services/campFoodAllocationService"
);

/*
 * По умолчанию только просмотр.
 *
 * APPLY=1 действительно меняет БД.
 */
const APPLY =
    process.env.APPLY ===
    "1";

/*
 * Всё ДО этой даты считаем
 * старой системой.
 *
 * Новую систему CampFood
 * начали 17.09.2026.
 */
const CUTOFF_DATE =
    process.env.CUTOFF_DATE ||
    "2026-09-17";

function formatRub(
    kopecks
) {
    return (
        Number(
            BigInt(kopecks)
        ) / 100
    ).toLocaleString(
        "ru-RU",
        {
            minimumFractionDigits:
                2,
            maximumFractionDigits:
                2,
        }
    );
}

function percentage(
    value,
    total
) {
    value =
        BigInt(value);

    total =
        BigInt(total);

    if (
        total === 0n
    ) {
        return "0.00";
    }

    const basisPoints =
        (
            value *
            10000n
        ) /
        total;

    return (
        Number(
            basisPoints
        ) / 100
    ).toFixed(2);
}

async function main() {
    const projectIds =
        getCampFoodProjectIds();

    console.log(
        "\n🍔 MIGRATION CAMPFOOD"
    );

    console.log(
        `Режим: ${
            APPLY
                ? "⚠️ APPLY"
                : "🔎 DRY RUN"
        }`
    );

    console.log(
        `CampFood projects: ${projectIds.join(
            ", "
        )}`
    );

    console.log(
        `Берём расходы ДО ${CUTOFF_DATE}\n`
    );

    await sequelize.authenticate();

    /*
     * Все старые расходы
     * двух точек CampFood.
     */
    const oldExpenses =
        await Transaction.findAll({
            where: {
                projectId: {
                    [Op.in]:
                    projectIds,
                },

                type:
                    "expense",

                businessDate: {
                    [Op.lt]:
                    CUTOFF_DATE,
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

            order: [
                [
                    "businessDate",
                    "ASC",
                ],
                [
                    "id",
                    "ASC",
                ],
            ],
        });

    if (
        oldExpenses.length ===
        0
    ) {
        console.log(
            "Старых расходов CampFood нет."
        );

        return;
    }

    /*
     * Не мигрируем второй раз то,
     * что уже было перенесено.
     */
    const transactionIds =
        oldExpenses.map(
            (row) =>
                row.id
        );

    const existingShared =
        await CampFoodSharedExpense.findAll({
            where: {
                sourceTransactionId: {
                    [Op.in]:
                    transactionIds,
                },
            },

            attributes: [
                "sourceTransactionId",
            ],
        });

    const alreadyMigrated =
        new Set(
            existingShared.map(
                (row) =>
                    Number(
                        row.sourceTransactionId
                    )
            )
        );

    const expenses =
        oldExpenses.filter(
            (row) =>
                !alreadyMigrated.has(
                    Number(
                        row.id
                    )
                )
        );

    const byDate =
        new Map();

    for (
        const expense
        of expenses
        ) {
        const date =
            String(
                expense.businessDate
            );

        if (
            !byDate.has(date)
        ) {
            byDate.set(
                date,
                []
            );
        }

        byDate
            .get(date)
            .push(expense);
    }

    let candidateCount =
        0;

    let candidateTotal =
        0n;

    let skippedCount =
        0;

    let migratedCount =
        0;

    for (
        const [
            businessDate,
            dateExpenses,
        ]
        of byDate
        ) {
        const closures =
            await DailyClosure.findAll({
                where: {
                    projectId: {
                        [Op.in]:
                        projectIds,
                    },

                    businessDate,

                    status:
                        "closed",
                },
            });

        let expensesTotal =
            0n;

        for (
            const expense
            of dateExpenses
            ) {
            expensesTotal +=
                BigInt(
                    expense.amountKopecks
                );
        }

        if (
            closures.length !==
            projectIds.length
        ) {
            console.log(
                `⏭ ${businessDate}: ` +
                `${dateExpenses.length} расходов, ` +
                `${formatRub(
                    expensesTotal
                )} ₽ — ` +
                `пропуск: закрыты не обе точки`
            );

            skippedCount +=
                dateExpenses.length;

            continue;
        }

        const revenueMap =
            new Map();

        for (
            const projectId
            of projectIds
            ) {
            revenueMap.set(
                projectId,
                0n
            );
        }

        for (
            const closure
            of closures
            ) {
            revenueMap.set(
                Number(
                    closure.projectId
                ),

                BigInt(
                    closure
                        .totalIncomeKopecks ||
                    0
                )
            );
        }

        let totalRevenue =
            0n;

        for (
            const amount
            of revenueMap.values()
            ) {
            totalRevenue +=
                amount;
        }

        if (
            totalRevenue <= 0n
        ) {
            console.log(
                `⏭ ${businessDate}: ` +
                `${formatRub(
                    expensesTotal
                )} ₽ — ` +
                `пропуск: общая выручка 0 ₽`
            );

            skippedCount +=
                dateExpenses.length;

            continue;
        }

        candidateCount +=
            dateExpenses.length;

        candidateTotal +=
            expensesTotal;

        console.log(
            `\n✅ ${businessDate}`
        );

        console.log(
            `Расходов: ${dateExpenses.length}`
        );

        console.log(
            `Сумма: ${formatRub(
                expensesTotal
            )} ₽`
        );

        for (
            const projectId
            of projectIds
            ) {
            const revenue =
                revenueMap.get(
                    projectId
                ) || 0n;

            console.log(
                `Проект ${projectId}: ` +
                `выручка ${formatRub(
                    revenue
                )} ₽ ` +
                `(${percentage(
                    revenue,
                    totalRevenue
                )}%)`
            );
        }

        for (
            const expense
            of dateExpenses
            ) {
            console.log(
                `  #${expense.id} ` +
                `[${expense.projectId}] ` +
                `${expense.category?.name ||
                "Без статьи"} — ` +
                `${formatRub(
                    expense.amountKopecks
                )} ₽ ` +
                `(${expense.fundSource ||
                "source неизвестен"})`
            );
        }

        if (!APPLY) {
            continue;
        }

        /*
         * Каждый день мигрируем
         * одной транзакцией.
         */
        await sequelize.transaction(
            async (
                dbTransaction
            ) => {
                const lockedExpenses =
                    await Transaction.findAll({
                        where: {
                            id: {
                                [Op.in]:
                                    dateExpenses.map(
                                        (row) =>
                                            row.id
                                    ),
                            },

                            type:
                                "expense",
                        },

                        transaction:
                        dbTransaction,

                        lock:
                        dbTransaction
                            .LOCK.UPDATE,
                    });

                if (
                    lockedExpenses.length !==
                    dateExpenses.length
                ) {
                    throw new Error(
                        `MIGRATION_SOURCE_CHANGED:${businessDate}`
                    );
                }

                /*
                 * Названия статей уже
                 * получили выше.
                 */
                const byId =
                    new Map(
                        dateExpenses.map(
                            (row) => [
                                Number(
                                    row.id
                                ),
                                row,
                            ]
                        )
                    );

                for (
                    const row
                    of lockedExpenses
                    ) {
                    const source =
                        byId.get(
                            Number(
                                row.id
                            )
                        );

                    const normalizedFundSource =
                        row.fundSource ===
                        "today_revenue"
                            ? "today_revenue"
                            : "other";

                    await CampFoodSharedExpense.create(
                        {
                            businessDate,

                            categoryName:
                                source.category
                                    ?.name ||
                                "Без статьи",

                            amountKopecks:
                            row.amountKopecks,

                            fundSource:
                            normalizedFundSource,

                            /*
                             * Если расход был
                             * из дневной кассы,
                             * сохраняем,
                             * из какой точки
                             * физически взяли деньги.
                             */
                            paidFromProjectId:
                                normalizedFundSource ===
                                "today_revenue"
                                    ? row.projectId
                                    : null,

                            sourceTransactionId:
                            row.id,

                            allocatedAt:
                                null,

                            createdBy:
                            row.createdBy,
                        },
                        {
                            transaction:
                            dbTransaction,
                        }
                    );
                }

                /*
                 * После создания общего
                 * расхода удаляем старые
                 * прямые расходы.
                 *
                 * Иначе отчёт посчитает
                 * их дважды.
                 */
                await Transaction.destroy({
                    where: {
                        id: {
                            [Op.in]:
                                lockedExpenses.map(
                                    (row) =>
                                        row.id
                                ),
                        },
                    },

                    transaction:
                    dbTransaction,
                });
            }
        );

        /*
         * После commit распределяем
         * весь общий расход даты.
         */
        const allocation =
            await allocateCampFoodExpensesForDate(
                businessDate
            );

        if (
            !allocation?.allocated
        ) {
            throw new Error(
                `ALLOCATION_FAILED:${businessDate}:${allocation?.reason}`
            );
        }

        migratedCount +=
            dateExpenses.length;

        console.log(
            `💾 ${businessDate}: мигрировано и распределено`
        );
    }

    console.log(
        "\n──────────────"
    );

    console.log(
        `Подходящих расходов: ${candidateCount}`
    );

    console.log(
        `На сумму: ${formatRub(
            candidateTotal
        )} ₽`
    );

    console.log(
        `Пропущено: ${skippedCount}`
    );

    if (APPLY) {
        console.log(
            `Мигрировано: ${migratedCount}`
        );
    } else {
        console.log(
            "\n🔎 Это был DRY RUN."
        );

        console.log(
            "База данных НЕ изменялась."
        );
    }
}

main()
    .catch(
        (error) => {
            console.error(
                "\n❌ Ошибка миграции:",
                error
            );

            process.exitCode =
                1;
        }
    )
    .finally(
        async () => {
            await sequelize.close();
        }
    );