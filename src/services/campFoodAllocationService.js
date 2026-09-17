const {
    Op,
} = require("sequelize");

const sequelize =
    require("../config/database");

const {
    DailyClosure,
    CampFoodSharedExpense,
    CampFoodExpenseAllocation,
} = require("../models");

const {
    getCampFoodProjectIds,
} = require(
    "./campFoodSharedExpenseService"
);

async function allocateCampFoodExpensesForDate(
    businessDate
) {
    const projectIds =
        getCampFoodProjectIds();

    return sequelize.transaction(
        async (
            dbTransaction
        ) => {
            /*
             * Сначала убеждаемся,
             * что ОБЕ точки закрыты.
             */
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

                    transaction:
                    dbTransaction,

                    lock:
                    dbTransaction
                        .LOCK.UPDATE,
                });

            if (
                closures.length !==
                projectIds.length
            ) {
                return {
                    allocated: false,
                    reason:
                        "WAITING_FOR_BOTH",
                };
            }

            const revenueByProject =
                new Map();

            for (
                const projectId
                of projectIds
                ) {
                revenueByProject.set(
                    projectId,
                    0n
                );
            }

            for (
                const closure
                of closures
                ) {
                revenueByProject.set(
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
                of revenueByProject.values()
                ) {
                totalRevenue +=
                    amount;
            }

            const expenses =
                await CampFoodSharedExpense.findAll({
                    where: {
                        businessDate,
                    },

                    transaction:
                    dbTransaction,

                    lock:
                    dbTransaction
                        .LOCK.UPDATE,
                });

            if (
                expenses.length ===
                0
            ) {
                return {
                    allocated: false,
                    reason:
                        "NO_EXPENSES",
                    totalRevenue,
                };
            }

            const expenseIds =
                expenses.map(
                    (expense) =>
                        expense.id
                );

            /*
             * Расчёт идемпотентный.
             *
             * Если распределение уже
             * существовало, сначала
             * удаляем его и считаем заново.
             */
            await CampFoodExpenseAllocation.destroy({
                where: {
                    sharedExpenseId: {
                        [Op.in]:
                        expenseIds,
                    },
                },

                transaction:
                dbTransaction,
            });

            await CampFoodSharedExpense.update(
                {
                    allocatedAt:
                        null,
                },
                {
                    where: {
                        id: {
                            [Op.in]:
                            expenseIds,
                        },
                    },

                    transaction:
                    dbTransaction,
                }
            );

            /*
             * Если обе точки закрылись
             * с нулевой выручкой,
             * автоматически делить нельзя.
             */
            if (
                totalRevenue <= 0n
            ) {
                return {
                    allocated: false,
                    reason:
                        "ZERO_REVENUE",
                    totalRevenue,
                };
            }

            const allocationRows =
                [];

            const totalsByProject =
                new Map();

            for (
                const projectId
                of projectIds
                ) {
                totalsByProject.set(
                    projectId,
                    0n
                );
            }

            let totalSharedExpense =
                0n;

            for (
                const expense
                of expenses
                ) {
                const expenseAmount =
                    BigInt(
                        expense
                            .amountKopecks
                    );

                totalSharedExpense +=
                    expenseAmount;

                let distributed =
                    0n;

                for (
                    let index = 0;
                    index <
                    projectIds.length;
                    index += 1
                ) {
                    const projectId =
                        projectIds[
                            index
                            ];

                    const revenue =
                        revenueByProject.get(
                            projectId
                        ) || 0n;

                    let amount;

                    /*
                     * Последней точке отдаём
                     * остаток, чтобы ни одна
                     * копейка не потерялась
                     * из-за округления.
                     */
                    if (
                        index ===
                        projectIds.length -
                        1
                    ) {
                        amount =
                            expenseAmount -
                            distributed;
                    } else {
                        amount =
                            (
                                expenseAmount *
                                revenue
                            ) /
                            totalRevenue;

                        distributed +=
                            amount;
                    }

                    allocationRows.push({
                        sharedExpenseId:
                        expense.id,

                        projectId,

                        amountKopecks:
                            amount.toString(),

                        revenueKopecks:
                            revenue.toString(),

                        totalRevenueKopecks:
                            totalRevenue.toString(),
                    });

                    totalsByProject.set(
                        projectId,

                        (
                            totalsByProject.get(
                                projectId
                            ) || 0n
                        ) +
                        amount
                    );
                }
            }

            if (
                allocationRows.length >
                0
            ) {
                await CampFoodExpenseAllocation.bulkCreate(
                    allocationRows,
                    {
                        transaction:
                        dbTransaction,
                    }
                );
            }

            await CampFoodSharedExpense.update(
                {
                    allocatedAt:
                        new Date(),
                },
                {
                    where: {
                        id: {
                            [Op.in]:
                            expenseIds,
                        },
                    },

                    transaction:
                    dbTransaction,
                }
            );

            console.log(
                `🍔 CampFood allocation ${businessDate}: ` +
                `revenue=${totalRevenue.toString()} ` +
                `expense=${totalSharedExpense.toString()}`
            );

            return {
                allocated: true,

                totalRevenue,

                totalSharedExpense,

                totalsByProject,
            };
        }
    );
}

async function invalidateCampFoodAllocationForDate(
    businessDate,
    externalTransaction = null
) {
    const execute =
        async (
            dbTransaction
        ) => {
            const expenses =
                await CampFoodSharedExpense.findAll({
                    where: {
                        businessDate,
                    },

                    attributes: [
                        "id",
                    ],

                    transaction:
                    dbTransaction,

                    lock:
                    dbTransaction
                        .LOCK.UPDATE,
                });

            if (
                expenses.length ===
                0
            ) {
                return {
                    invalidated:
                        false,
                };
            }

            const ids =
                expenses.map(
                    (expense) =>
                        expense.id
                );

            await CampFoodExpenseAllocation.destroy({
                where: {
                    sharedExpenseId: {
                        [Op.in]:
                        ids,
                    },
                },

                transaction:
                dbTransaction,
            });

            await CampFoodSharedExpense.update(
                {
                    allocatedAt:
                        null,
                },
                {
                    where: {
                        id: {
                            [Op.in]:
                            ids,
                        },
                    },

                    transaction:
                    dbTransaction,
                }
            );

            return {
                invalidated:
                    true,
            };
        };

    /*
     * При переоткрытии дня
     * используем ту же транзакцию,
     * что и DailyClosure.
     */
    if (externalTransaction) {
        return execute(
            externalTransaction
        );
    }

    return sequelize.transaction(
        execute
    );
}
module.exports = {
    allocateCampFoodExpensesForDate,
    invalidateCampFoodAllocationForDate,
};