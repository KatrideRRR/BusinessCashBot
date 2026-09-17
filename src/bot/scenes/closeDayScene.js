const {
    Scenes,
    Markup,
} = require("telegraf");

const sequelize =
    require("../../config/database");

const {
    Category,
    PaymentMethod,
    Transaction,
    DailyClosure,
    CampFoodSharedExpense,
} = require("../../models");

const {
    allocateCampFoodExpensesForDate,
} = require(
    "../../services/campFoodAllocationService"
);

const {
    getCampFoodProjectIds,
} = require(
    "../../services/campFoodSharedExpenseService"
);

const {
    getProjectsForUser,
    getProjectForUser,
} = require("../../services/projectService");

const {
    ensureDefaultPaymentMethods,
} = require("../../services/paymentMethodService");

const {
    parseMoneyToKopecks,
    formatKopecks,
} = require("../../utils/money");

const {
    getBusinessDate,
} = require("../../utils/businessDate");

const {
    getMainMenu,
} = require("../keyboards/mainMenu");

const closeDayScene =
    new Scenes.BaseScene(
        "close-day"
    );

/*
 * =========================
 * HELPERS
 * =========================
 */

async function getExpenseSummary(
    projectId,
    trackTodayRevenueSource
) {
    /*
     * Если проект не использует
     * расходы из дневной выручки,
     * его расходы вообще не относятся
     * к закрытию кассы.
     */
    if (!trackTodayRevenueSource) {
        return {
            total: 0n,
            rows: [],
        };
    }

    const rows =
        await Transaction.findAll({
            where: {
                projectId,

                type:
                    "expense",

                businessDate:
                    getBusinessDate(),

                /*
                 * Из кассы смены вычитаем
                 * только то, что реально
                 * взяли из сегодняшней
                 * выручки.
                 */
                fundSource:
                    "today_revenue",
            },

            include: [
                {
                    model:
                    Category,

                    as:
                        "category",

                    attributes: [
                        "id",
                        "name",
                    ],
                },
            ],
        });

    const sharedRows =
        await CampFoodSharedExpense.findAll({
            where: {
                businessDate:
                    getBusinessDate(),

                fundSource:
                    "today_revenue",

                paidFromProjectId:
                projectId,
            },
        });

    const map =
        new Map();

    let total =
        0n;

    for (const row of rows) {
        const amount =
            BigInt(
                row.amountKopecks
            );

        total +=
            amount;

        const categoryName =
            row.category?.name ||
            "Без статьи";

        const current =
            map.get(
                categoryName
            ) || 0n;

        map.set(
            categoryName,
            current + amount
        );
    }

    for (
        const row
        of sharedRows
        ) {
        const amount =
            BigInt(
                row.amountKopecks
            );

        total +=
            amount;

        const categoryName =
            row.categoryName ||
            "Без статьи";

        const current =
            map.get(
                categoryName
            ) || 0n;

        map.set(
            categoryName,
            current + amount
        );
    }

    return {
        total,

        rows:
            Array.from(
                map.entries()
            ).map(
                ([name, amount]) => ({
                    name,
                    amount,
                })
            ),
    };
}

function getDraftIncomeTotal(
    ctx
) {
    const lines =
        ctx.scene.state.lines ||
        [];

    return lines.reduce(
        (sum, line) =>
            sum +
            BigInt(
                line.amountKopecks
            ),
        0n
    );
}

async function getCampCardIncomeSummary(
    projectId,
    dbTransaction = null
) {
    const paymentMethod =
        await PaymentMethod.findOne({
            where: {
                projectId,
                name: "Camp Card",
                isActive: true,
            },

            transaction:
            dbTransaction,
        });

    if (!paymentMethod) {
        return {
            total: 0n,
            paymentMethod: null,
        };
    }

    /*
     * Camp Card создаёт автоматические
     * операции с closureId = null.
     *
     * Поэтому ручные строки закрытия
     * сюда никогда не попадут.
     */
    const rows =
        await Transaction.findAll({
            where: {
                projectId,

                type:
                    "income",

                businessDate:
                    getBusinessDate(),

                paymentMethodId:
                paymentMethod.id,

                closureId:
                    null,
            },

            transaction:
            dbTransaction,
        });

    let total = 0n;

    for (const row of rows) {
        total +=
            BigInt(
                row.amountKopecks
            );
    }

    return {
        total,
        paymentMethod,
    };
}

async function getTerminalIncomeSummary(
    projectId,
    dbTransaction = null
) {
    const paymentMethod =
        await PaymentMethod.findOne({
            where: {
                projectId,
                name: "Терминал",
                isActive: true,
            },

            transaction:
            dbTransaction,
        });

    if (!paymentMethod) {
        return {
            total: 0n,
            paymentMethod: null,
        };
    }

    const rows =
        await Transaction.findAll({
            where: {
                projectId,

                type:
                    "income",

                businessDate:
                    getBusinessDate(),

                paymentMethodId:
                paymentMethod.id,

                /*
                 * Автоматические операции
                 * Evotor имеют closureId = null.
                 */
                closureId:
                    null,
            },

            transaction:
            dbTransaction,
        });

    let total = 0n;

    for (const row of rows) {
        total +=
            BigInt(
                row.amountKopecks
            );
    }

    return {
        total,
        paymentMethod,
    };
}

async function showIncomePaymentMethods(
    ctx
) {
    const state =
        ctx.scene.state;

    /*
     * Для CampFood / физических точек
     * статья дохода всегда "Выручка".
     */
    const category =
        await Category.findOne({
            where: {
                projectId:
                state.projectId,

                type:
                    "income",

                name:
                    "Выручка",

                isActive:
                    true,
            },
        });

    if (!category) {
        await ctx.reply(
            "Не найдена активная статья «Выручка»."
        );

        return;
    }

    state.selectedCategoryId =
        category.id;

    state.selectedCategoryName =
        category.name;

    if (
        state.projectId !== 7
    ) {
        await ensureDefaultPaymentMethods(
            state.projectId
        );
    }

    const methods =
        await PaymentMethod.findAll({
            where: {
                projectId:
                state.projectId,

                isActive:
                    true,
            },

            order: [
                ["id", "ASC"],
            ],
        });

    const visibleMethods =
        methods.filter(
            (method) => {
                if (
                    method.name ===
                    "Camp Card"
                ) {
                    return false;
                }

                if (
                    state.hasEvotor &&
                    method.name ===
                    "Терминал"
                ) {
                    return false;
                }

                return true;
            }
        );

    const buttons =
        visibleMethods.map(
            (method) => [
                Markup.button.callback(
                    method.name,
                    `close_payment_${method.id}`
                ),
            ]
        );

    buttons.push([
        Markup.button.callback(
            "❌ Отмена",
            "close_cancel"
        ),
    ]);

    await ctx.reply(
        "Как получены деньги?",
        Markup.inlineKeyboard(
            buttons
        )
    );
}

async function renderDraft(
    ctx
) {
    const state =
        ctx.scene.state;

    const expenses =
        await getExpenseSummary(
            state.projectId,
            state
                .trackTodayRevenueSource
        );

    const manualIncomeTotal =
        getDraftIncomeTotal(
            ctx
        );

    const campCardIncome =
        await getCampCardIncomeSummary(
            state.projectId
        );

    const terminalIncome =
        state.hasEvotor
            ? await getTerminalIncomeSummary(
                state.projectId
            )
            : {
                total: 0n,
                paymentMethod: null,
            };

    /*
 * manual + terminal + Camp Card —
 * сколько денег осталось/зафиксировано.
 *
 * Расходы из сегодняшней выручки
 * уже были заработаны до того,
 * как их потратили.
 *
 * Поэтому возвращаем их обратно
 * в общую валовую выручку.
 */
    const recordedIncome =
        manualIncomeTotal +
        campCardIncome.total +
        terminalIncome.total;

    const totalRevenue =
        recordedIncome +
        expenses.total;

    let text =
        `✅ Закрытие дня\n\n` +
        `🏢 ${state.projectName}\n` +
        `📅 ${getBusinessDate()}\n\n`;

    /*
     * Расходы
     */

    text +=
        `\n\n➖ РАСХОДЫ\n`;

    if (
        state.trackTodayRevenueSource
    ) {
        text +=
            `\n\n➖ РАСХОДЫ ИЗ СЕГОДНЯШНЕЙ ВЫРУЧКИ\n`;

        if (
            expenses.rows.length === 0
        ) {
            text +=
                `Нет.\n`;
        } else {
            expenses.rows.forEach(
                (row) => {
                    text +=
                        `${row.name} — ` +
                        `${formatKopecks(
                            row.amount
                        )}\n`;
                }
            );
        }

        text +=
            `\nВсего расходов из выручки: ` +
            `${formatKopecks(
                expenses.total
            )}`;
    }

    /*
     * Доходы
     */

    text +=
        `💰 ПОСТУПЛЕНИЯ\n`;

    if (
        (
            !state.lines ||
            state.lines.length === 0
        ) &&
        campCardIncome.total === 0n &&
        terminalIncome.total === 0n
    ) {
        text +=
            `Пока не добавлены.\n`;
    } else {

        if (
            state.lines &&
            state.lines.length > 0
        ) {
            state.lines.forEach(
                (line, index) => {
                    text +=
                        `${index + 1}. ` +
                        `${line.paymentMethodName} — ` +
                        `${formatKopecks(
                            line.amountKopecks
                        )}\n`;
                }
            );
        }

        if (
            campCardIncome.total > 0n
        ) {
            text +=
                `💳 Camp Card — ` +
                `${formatKopecks(
                    campCardIncome.total
                )}\n`;
        }

        if (
            terminalIncome.total > 0n
        ) {
            text +=
                `🏦 Терминал — ` +
                `${formatKopecks(
                    terminalIncome.total
                )}\n`;
        }
    }

    text +=
        `\nОбщая выручка: ` +
        `${formatKopecks(
            totalRevenue
        )}`;

    const buttons = [
        [
            Markup.button.callback(
                "➕ Добавить поступление",
                "close_add_income"
            ),
        ],
    ];

    if (
        state.lines &&
        state.lines.length > 0
    ) {
        buttons.push([
            Markup.button.callback(
                "↩️ Убрать последнее",
                "close_remove_last"
            ),
        ]);
    }

    buttons.push([
        Markup.button.callback(
            "✅ Завершить день",
            "close_finish"
        ),
    ]);

    buttons.push([
        Markup.button.callback(
            "❌ Отмена",
            "close_cancel"
        ),
    ]);

    await ctx.reply(
        text,
        Markup.inlineKeyboard(
            buttons
        )
    );
}

async function finalizeClosure(
    ctx
) {
    if (
        ctx.scene.state.finishing
    ) {
        return;
    }

    ctx.scene.state.finishing =
        true;

    const state =
        ctx.scene.state;

    const businessDate =
        getBusinessDate();

    try {
        const existingClosure =
            await DailyClosure.findOne({
                where: {
                    projectId:
                    state.projectId,

                    businessDate,
                },
            });

        if (
            existingClosure &&
            existingClosure.status ===
            "closed"
        ) {
            await ctx.reply(
                "⚠️ Этот день уже закрыт.",
                getMainMenu()
            );

            return ctx.scene.leave();
        }

        const expenses =
            await getExpenseSummary(
                state.projectId,
                state
                    .trackTodayRevenueSource
            );

        const manualIncomeTotal =
            getDraftIncomeTotal(
                ctx
            );

        let finalTotalIncome = 0n;

        await sequelize.transaction(
            async (
                dbTransaction
            ) => {

                const campCardIncome =
                    await getCampCardIncomeSummary(
                        state.projectId,
                        dbTransaction
                    );

                const terminalIncome =
                    state.hasEvotor
                        ? await getTerminalIncomeSummary(
                            state.projectId,
                            dbTransaction
                        )
                        : {
                            total: 0n,
                            paymentMethod: null,
                        };

                const recordedIncome =
                    manualIncomeTotal +
                    campCardIncome.total +
                    terminalIncome.total;

                const totalIncome =
                    recordedIncome +
                    expenses.total;

                /*
                 * Поле пока оставляем в БД
                 * для совместимости.
                 *
                 * Это сумма, оставшаяся после
                 * расходов из сегодняшней выручки.
                 */
                const result =
                    totalIncome -
                    expenses.total;

                finalTotalIncome =
                    totalIncome;

                let closure;

                if (
                    existingClosure
                ) {
                    await existingClosure.update(
                        {
                            totalIncomeKopecks:
                                totalIncome.toString(),

                            totalExpenseKopecks:
                                expenses.total.toString(),

                            resultKopecks:
                                result.toString(),

                            status:
                                "closed",

                            closedBy:
                            ctx.state.user.id,

                            closedAt:
                                new Date(),
                        },
                        {
                            transaction:
                            dbTransaction,
                        }
                    );

                    closure =
                        existingClosure;

                    /*
                     * Удаляем старые строки
                     * выручки этого закрытия.
                     * Сейчас создадим их
                     * заново из актуального draft.
                     */
                    await Transaction.destroy({
                        where: {
                            projectId:
                            state.projectId,

                            businessDate,

                            type:
                                "income",

                            closureId:
                            closure.id,
                        },

                        transaction:
                        dbTransaction,
                    });
                } else {
                    closure =
                        await DailyClosure.create(
                            {
                                projectId:
                                state.projectId,

                                businessDate,

                                totalIncomeKopecks:
                                    totalIncome.toString(),

                                totalExpenseKopecks:
                                    expenses.total.toString(),

                                resultKopecks:
                                    result.toString(),

                                status:
                                    "closed",

                                closedBy:
                                ctx.state.user.id,

                                closedAt:
                                    new Date(),
                            },
                            {
                                transaction:
                                dbTransaction,
                            }
                        );
                }

                const lines =
                    state.lines || [];

                if (
                    lines.length > 0
                ) {
                    await Transaction.bulkCreate(
                        lines.map(
                            (line) => ({
                                projectId:
                                state.projectId,

                                type:
                                    "income",

                                categoryId:
                                line.categoryId,

                                paymentMethodId:
                                line.paymentMethodId,

                                amountKopecks:
                                line.amountKopecks,

                                businessDate,

                                closureId:
                                closure.id,

                                fundSource:
                                    null,

                                comment:
                                    "Закрытие дня",

                                createdBy:
                                ctx.state.user.id,
                            })
                        ),
                        {
                            transaction:
                            dbTransaction,
                        }
                    );
                }
            }
        );

        let campFoodAllocation =
            null;

        if (
            getCampFoodProjectIds()
                .includes(
                    Number(
                        state.projectId
                    )
                )
        ) {
            campFoodAllocation =
                await allocateCampFoodExpensesForDate(
                    businessDate
                );
        }

        let finalText =
            `✅ День закрыт\n\n` +
            `🏢 ${state.projectName}\n` +
            `📅 ${businessDate}\n\n` +
            `💰 Общая выручка: ${formatKopecks(
                finalTotalIncome
            )}`;

        if (
            state.trackTodayRevenueSource
        ) {
            finalText +=
                `\n➖ Расходы из сегодняшней выручки: ` +
                `${formatKopecks(
                    expenses.total
                )}`;
        }

        if (
            campFoodAllocation
                ?.allocated
        ) {
            finalText +=
                `\n\n🍔 Общие расходы CampFood распределены между обеими точками.`;
        } else if (
            campFoodAllocation
                ?.reason ===
            "WAITING_FOR_BOTH"
        ) {
            finalText +=
                `\n\n🍔 Общие расходы CampFood будут распределены после закрытия второй точки.`;
        } else if (
            campFoodAllocation
                ?.reason ===
            "ZERO_REVENUE"
        ) {
            finalText +=
                `\n\n⚠️ Общие расходы CampFood пока не распределены: выручка обеих точек равна 0 ₽.`;
        }

        await ctx.reply(
            finalText,
            getMainMenu()
        );

        return ctx.scene.leave();
    } catch (error) {
        ctx.scene.state.finishing =
            false;

        console.error(
            "Ошибка закрытия дня:",
            error
        );

        await ctx.reply(
            "❌ Не удалось закрыть день."
        );
    }
}

/*
 * =========================
 * ENTER
 * =========================
 */

closeDayScene.enter(
    async (ctx) => {
        let projects =
            await getProjectsForUser(
                ctx.state.user
            );

        /*
         * Ферму/direct-проекты
         * здесь не показываем.
         */
        const cargoCampProjectId =
            Number(
                process.env
                    .CARGOCAMP_PROJECT_ID ||
                7
            );

        projects =
            projects.filter(
                (project) =>
                    project.revenueMode ===
                    "daily_close" &&
                    Number(project.id) !==
                    cargoCampProjectId
            );

        if (
            projects.length === 0
        ) {
            await ctx.reply(
                "Нет проектов, которые требуют ручного закрытия дня.",
                getMainMenu()
            );

            return ctx.scene.leave();
        }

        const buttons =
            projects.map(
                (project) => [
                    Markup.button.callback(
                        `🏢 ${project.name}`,
                        `close_project_${project.id}`
                    ),
                ]
            );

        buttons.push([
            Markup.button.callback(
                "❌ Отмена",
                "close_cancel"
            ),
        ]);

        await ctx.reply(
            "✅ Закрытие дня\n\n" +
            "Выберите проект:",
            Markup.inlineKeyboard(
                buttons
            )
        );
    }
);

/*
 * =========================
 * PROJECT
 * =========================
 */

closeDayScene.action(
    /^close_project_(\d+)$/,
    async (ctx) => {
        await ctx.answerCbQuery();

        const projectId =
            Number(
                ctx.match[1]
            );

        const project =
            await getProjectForUser(
                projectId,
                ctx.state.user
            );

        const cargoCampProjectId =
            Number(
                process.env
                    .CARGOCAMP_PROJECT_ID ||
                7
            );

        if (
            Number(projectId) ===
            cargoCampProjectId
        ) {
            await ctx.reply(
                "🤖 CargoCamp закрывается автоматически каждый день в 00:05.",
                getMainMenu()
            );

            return ctx.scene.leave();
        }
        if (
            !project ||
            project.revenueMode !==
            "daily_close"
        ) {
            await ctx.reply(
                "Проект недоступен."
            );

            return;
        }

        const businessDate =
            getBusinessDate();

        const existing =
            await DailyClosure.findOne({
                where: {
                    projectId,
                    businessDate,
                    status: "closed",
                },
            });

        if (existing) {
            await ctx.reply(
                `✅ ${project.name}\n\n` +
                `Этот день уже закрыт.\n\n` +
                `Выручка: ${formatKopecks(
                    existing.totalIncomeKopecks
                )}\n` +
                `Расходы: ${formatKopecks(
                    existing.totalExpenseKopecks
                )}\n` +
                `Результат: ${formatKopecks(
                    existing.resultKopecks
                )}`,
                getMainMenu()
            );

            return ctx.scene.leave();
        }

        const incomeCategories =
            await Category.count({
                where: {
                    projectId,
                    type: "income",
                    isActive: true,
                },
            });

        if (
            incomeCategories === 0
        ) {
            await ctx.reply(
                `У проекта «${project.name}» ` +
                `нет ни одной статьи дохода.\n\n` +
                `Сначала добавьте хотя бы одну ` +
                `через Проекты → ${project.name} → Статьи доходов.`,
                getMainMenu()
            );

            return ctx.scene.leave();
        }

        ctx.scene.state.projectId =
            project.id;

        ctx.scene.state.projectName =
            project.name;

        ctx.scene.state.hasEvotor =
            Boolean(
                project.evotorStoreId
            );

        ctx.scene.state.trackTodayRevenueSource =
            Boolean(
                project.trackTodayRevenueSource
            );

        const previousClosure =
            await DailyClosure.findOne({
                where: {
                    projectId,
                    businessDate,
                },
            });

        let existingIncome = [];

        if (
            previousClosure &&
            previousClosure.status ===
            "reopened"
        ) {
            existingIncome =
                await Transaction.findAll({
                    where: {
                        projectId,
                        businessDate,
                        type: "income",
                        closureId:
                        previousClosure.id,
                    },

                    include: [
                        {
                            model: Category,
                            as: "category",
                        },
                        {
                            model:
                            PaymentMethod,
                            as:
                                "paymentMethod",
                        },
                    ],
                });
        }

        ctx.scene.state.projectId =
            project.id;

        ctx.scene.state.projectName =
            project.name;

        ctx.scene.state.lines =
            existingIncome.map(
                (transaction) => ({
                    categoryId:
                    transaction.categoryId,

                    categoryName:
                        transaction.category
                            ?.name ||
                        "Доход",

                    paymentMethodId:
                    transaction
                        .paymentMethodId,

                    paymentMethodName:
                        transaction
                            .paymentMethod
                            ?.name ||
                        "Не указано",

                    amountKopecks:
                        String(
                            transaction
                                .amountKopecks
                        ),
                })
            );

        await renderDraft(ctx);
    }
);

/*
 * =========================
 * ADD INCOME
 * =========================
 */

closeDayScene.action(
    "close_add_income",
    async (ctx) => {
        await ctx.answerCbQuery();

        /*
         * Для физических точек
         * не спрашиваем статью "Выручка".
         */
        if (
            ctx.scene.state
                .trackTodayRevenueSource
        ) {
            return showIncomePaymentMethods(
                ctx
            );
        }

        /*
         * Для остальных проектов
         * старую универсальную схему
         * пока оставляем.
         */
        const categories =
            await Category.findAll({
                where: {
                    projectId:
                    ctx.scene.state
                        .projectId,

                    type:
                        "income",

                    isActive:
                        true,
                },

                order: [
                    ["name", "ASC"],
                ],
            });

        const buttons =
            categories.map(
                (category) => [
                    Markup.button.callback(
                        category.name,
                        `close_category_${category.id}`
                    ),
                ]
            );

        buttons.push([
            Markup.button.callback(
                "❌ Отмена",
                "close_cancel"
            ),
        ]);

        await ctx.reply(
            "Что принесло деньги?",
            Markup.inlineKeyboard(
                buttons
            )
        );
    }
);

/*
 * CATEGORY
 */

closeDayScene.action(
    /^close_category_(\d+)$/,
    async (ctx) => {
        await ctx.answerCbQuery();

        const category =
            await Category.findOne({
                where: {
                    id:
                        Number(
                            ctx.match[1]
                        ),

                    projectId:
                    ctx.scene.state
                        .projectId,

                    type: "income",

                    isActive: true,
                },
            });

        if (!category) {
            await ctx.reply(
                "Статья не найдена."
            );

            return;
        }

        ctx.scene.state
            .selectedCategoryId =
            category.id;

        ctx.scene.state
            .selectedCategoryName =
            category.name;

        if (
            ctx.scene.state.projectId !== 7
        ) {
            await ensureDefaultPaymentMethods(
                ctx.scene.state.projectId
            );
        }

        const methods =
            await PaymentMethod.findAll({
                where: {
                    projectId:
                    ctx.scene.state
                        .projectId,

                    isActive: true,
                },

                order: [
                    ["id", "ASC"],
                ],
            });

        const visibleMethods =
            methods.filter(
                (method) => {
                    if (
                        method.name ===
                        "Camp Card"
                    ) {
                        return false;
                    }

                    /*
                     * Если у проекта подключён Evotor,
                     * терминал приходит автоматически.
                     */
                    if (
                        ctx.scene.state.hasEvotor &&
                        method.name ===
                        "Терминал"
                    ) {
                        return false;
                    }

                    return true;
                }
            );

        const buttons =
            visibleMethods.map(
                (method) => [
                    Markup.button.callback(
                        method.name,
                        `close_payment_${method.id}`
                    ),
                ]
            );

        await ctx.reply(
            `📌 ${category.name}\n\n` +
            `Откуда пришли деньги?`,
            Markup.inlineKeyboard(
                buttons
            )
        );
    }
);

/*
 * PAYMENT
 */

closeDayScene.action(
    /^close_payment_(\d+)$/,
    async (ctx) => {
        await ctx.answerCbQuery();

        const method =
            await PaymentMethod.findOne({
                where: {
                    id:
                        Number(
                            ctx.match[1]
                        ),

                    projectId:
                    ctx.scene.state
                        .projectId,

                    isActive: true,
                },
            });

        if (!method) {
            await ctx.reply(
                "Способ оплаты не найден."
            );

            return;
        }

        ctx.scene.state
            .selectedPaymentMethodId =
            method.id;

        ctx.scene.state
            .selectedPaymentMethodName =
            method.name;

        ctx.scene.state.awaiting =
            "income_amount";

        const prompt =
            ctx.scene.state
                .trackTodayRevenueSource
                ? (
                    `💳 ${method.name}\n\n` +
                    `Введите сумму:`
                )
                : (
                    `💰 ${ctx.scene.state.selectedCategoryName}\n` +
                    `💳 ${method.name}\n\n` +
                    `Введите сумму:`
                );

        await ctx.reply(
            prompt,
            Markup.keyboard([
                ["❌ Отмена"],
            ]).resize()
        );
    }
);

/*
 * TEXT / AMOUNT
 */

closeDayScene.on(
    "text",
    async (ctx) => {
        const text =
            ctx.message.text?.trim();

        if (
            text ===
            "❌ Отмена"
        ) {
            await ctx.reply(
                "Закрытие дня отменено.",
                getMainMenu()
            );

            return ctx.scene.leave();
        }

        if (
            ctx.scene.state.awaiting !==
            "income_amount"
        ) {
            return;
        }

        const amount =
            parseMoneyToKopecks(
                text
            );

        if (!amount) {
            await ctx.reply(
                "Не удалось понять сумму.\n\n" +
                "Например: 15000 или 15000,50"
            );

            return;
        }

        const state =
            ctx.scene.state;

        /*
         * Если такая же связка уже была,
         * просто прибавим к ней сумму.
         */
        const existingLine =
            state.lines.find(
                (line) =>
                    line.categoryId ===
                    state.selectedCategoryId &&
                    line.paymentMethodId ===
                    state.selectedPaymentMethodId
            );

        if (existingLine) {
            existingLine.amountKopecks =
                (
                    BigInt(
                        existingLine.amountKopecks
                    ) +
                    amount
                ).toString();
        } else {
            state.lines.push({
                categoryId:
                state.selectedCategoryId,

                categoryName:
                state.selectedCategoryName,

                paymentMethodId:
                state.selectedPaymentMethodId,

                paymentMethodName:
                state.selectedPaymentMethodName,

                amountKopecks:
                    amount.toString(),
            });
        }

        state.awaiting = null;

        delete state.selectedCategoryId;
        delete state.selectedCategoryName;
        delete state.selectedPaymentMethodId;
        delete state.selectedPaymentMethodName;

        await renderDraft(ctx);
    }
);

/*
 * REMOVE LAST
 */

closeDayScene.action(
    "close_remove_last",
    async (ctx) => {
        await ctx.answerCbQuery();

        const lines =
            ctx.scene.state.lines ||
            [];

        lines.pop();

        await renderDraft(ctx);
    }
);

/*
 * FINISH
 */

closeDayScene.action(
    "close_finish",
    async (ctx) => {
        await ctx.answerCbQuery();

        const lines =
            ctx.scene.state.lines ||
            [];

        /*
         * Нулевая выручка тоже возможна,
         * но попросим подтверждение отдельно.
         */

        const campCardIncome =
            await getCampCardIncomeSummary(
                ctx.scene.state.projectId
            );

        const terminalIncome =
            ctx.scene.state.hasEvotor
                ? await getTerminalIncomeSummary(
                    ctx.scene.state.projectId
                )
                : {
                    total: 0n,
                };

        const expenses =
            await getExpenseSummary(
                ctx.scene.state.projectId,
                ctx.scene.state
                    .trackTodayRevenueSource
            );

        if (
            lines.length === 0 &&
            campCardIncome.total === 0n &&
            terminalIncome.total === 0n &&
            expenses.total === 0n
        ) {
            await ctx.reply(
                "⚠️ Вы не добавили ни одного поступления.\n\n" +
                "Закрыть день с выручкой 0 ₽?",
                Markup.inlineKeyboard([
                    [
                        Markup.button.callback(
                            "✅ Да, закрыть с 0 ₽",
                            "close_finish_zero"
                        ),
                    ],
                    [
                        Markup.button.callback(
                            "⬅️ Вернуться",
                            "close_show_draft"
                        ),
                    ],
                ])
            );

            return;
        }

        await finalizeClosure(
            ctx
        );
    }
);

closeDayScene.action(
    "close_finish_zero",
    async (ctx) => {
        await ctx.answerCbQuery();

        await finalizeClosure(
            ctx
        );
    }
);

closeDayScene.action(
    "close_show_draft",
    async (ctx) => {
        await ctx.answerCbQuery();

        await renderDraft(ctx);
    }
);

/*
 * CANCEL
 */

closeDayScene.action(
    "close_cancel",
    async (ctx) => {
        await ctx.answerCbQuery();

        await ctx.reply(
            "Закрытие дня отменено.",
            getMainMenu()
        );

        return ctx.scene.leave();
    }
);

module.exports =
    closeDayScene;