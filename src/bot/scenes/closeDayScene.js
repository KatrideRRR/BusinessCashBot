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
} = require("../../models");

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
    projectId
) {
    const rows =
        await Transaction.findAll({
            where: {
                projectId,
                type: "expense",
                businessDate:
                    getBusinessDate(),
            },

            include: [
                {
                    model: Category,
                    as: "category",
                    attributes: [
                        "id",
                        "name",
                    ],
                },
            ],
        });

    const map =
        new Map();

    let total = 0n;

    for (const row of rows) {
        const amount =
            BigInt(
                row.amountKopecks
            );

        total += amount;

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

    return {
        total,
        rows: Array.from(
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

async function renderDraft(
    ctx
) {
    const state =
        ctx.scene.state;

    const expenses =
        await getExpenseSummary(
            state.projectId
        );

    const incomeTotal =
        getDraftIncomeTotal(
            ctx
        );

    const result =
        incomeTotal -
        expenses.total;

    let text =
        `✅ Закрытие дня\n\n` +
        `🏢 ${state.projectName}\n` +
        `📅 ${getBusinessDate()}\n\n`;

    /*
     * Доходы
     */

    text +=
        `💰 ПОСТУПЛЕНИЯ\n`;

    if (
        !state.lines ||
        state.lines.length === 0
    ) {
        text +=
            `Пока не добавлены.\n`;
    } else {
        state.lines.forEach(
            (line, index) => {
                text +=
                    `${index + 1}. ` +
                    `${line.categoryName} / ` +
                    `${line.paymentMethodName} — ` +
                    `${formatKopecks(
                        line.amountKopecks
                    )}\n`;
            }
        );
    }

    text +=
        `\nВыручка: ` +
        `${formatKopecks(
            incomeTotal
        )}`;

    /*
     * Расходы
     */

    text +=
        `\n\n➖ РАСХОДЫ\n`;

    if (
        expenses.rows.length ===
        0
    ) {
        text +=
            `Сегодня расходов нет.\n`;
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
        `\nРасходы: ` +
        `${formatKopecks(
            expenses.total
        )}`;

    text +=
        `\n\n──────────────\n` +
        `Результат дня: ` +
        `${formatKopecks(
            result
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
                state.projectId
            );

        const totalIncome =
            getDraftIncomeTotal(
                ctx
            );

        const result =
            totalIncome -
            expenses.total;

        await sequelize.transaction(
            async (
                dbTransaction
            ) => {
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

        await ctx.reply(
            `✅ День закрыт\n\n` +
            `🏢 ${state.projectName}\n` +
            `📅 ${businessDate}\n\n` +
            `💰 Выручка: ${formatKopecks(
                totalIncome
            )}\n` +
            `➖ Расходы: ${formatKopecks(
                expenses.total
            )}\n` +
            `──────────────\n` +
            `📊 Результат: ${formatKopecks(
                result
            )}`,
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
        projects =
            projects.filter(
                (project) =>
                    project.revenueMode ===
                    "daily_close"
            );

        if (
            projects.length === 0
        ) {
            await ctx.reply(
                "Нет проектов, которые требуют закрытия дня.",
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

        const categories =
            await Category.findAll({
                where: {
                    projectId:
                    ctx.scene.state
                        .projectId,

                    type: "income",
                    isActive: true,
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

        await ensureDefaultPaymentMethods(
            ctx.scene.state.projectId
        );

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

        const buttons =
            methods.map(
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

        await ctx.reply(
            `💰 ${ctx.scene.state.selectedCategoryName}\n` +
            `💳 ${method.name}\n\n` +
            `Введите сумму:`,
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
        if (
            lines.length === 0
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