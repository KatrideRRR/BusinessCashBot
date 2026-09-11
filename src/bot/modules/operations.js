const {
    Markup,
} = require("telegraf");

const {
    Transaction,
    Category,
    PaymentMethod,
    DailyClosure,
} = require("../../models");

const {
    getProjectForUser,
} = require("../../services/projectService");

const {
    getBusinessDate,
} = require("../../utils/businessDate");

const {
    formatKopecks,
} = require("../../utils/money");

async function getClosedDay(
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

async function showTodayOperations(
    ctx,
    projectId,
    edit = true
) {
    const project =
        await getProjectForUser(
            projectId,
            ctx.state.user
        );

    if (!project) {
        await ctx.reply(
            "⛔ Нет доступа."
        );

        return;
    }

    const businessDate =
        getBusinessDate();

    const transactions =
        await Transaction.findAll({
            where: {
                projectId,
                businessDate,
            },

            include: [
                {
                    model: Category,
                    as: "category",
                    attributes: [
                        "name",
                    ],
                },
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

            order: [
                ["id", "ASC"],
            ],
        });

    const closedDay =
        project.revenueMode ===
        "daily_close"
            ? await getClosedDay(
                projectId,
                businessDate
            )
            : null;

    let text =
        `🧾 Операции сегодня\n\n` +
        `🏢 ${project.name}\n` +
        `📅 ${businessDate}\n\n`;

    if (closedDay) {
        text +=
            "🔒 День закрыт\n\n";
    }

    if (
        transactions.length ===
        0
    ) {
        text +=
            "Операций пока нет.";
    } else {
        transactions.forEach(
            (
                transaction,
                index
            ) => {
                const sign =
                    transaction.type ===
                    "income"
                        ? "+"
                        : "−";

                text +=
                    `${index + 1}. ` +
                    `${sign}${formatKopecks(
                        transaction.amountKopecks
                    )} — ` +
                    `${
                        transaction
                            .category
                            ?.name ||
                        "Без статьи"
                    }\n`;
            }
        );
    }

    const buttons =
        transactions.map(
            (transaction) => {
                const sign =
                    transaction.type ===
                    "income"
                        ? "+"
                        : "−";

                return [
                    Markup.button.callback(
                        `${sign}${formatKopecks(
                            transaction.amountKopecks
                        )} • ${
                            transaction
                                .category
                                ?.name ||
                            "Без статьи"
                        }`,
                        `operation_${transaction.id}`
                    ),
                ];
            }
        );

    if (
        closedDay &&
        ctx.state.user.role ===
        "owner"
    ) {
        buttons.push([
            Markup.button.callback(
                "🔓 Переоткрыть день",
                `reopen_day_ask_${project.id}`
            ),
        ]);
    }

    buttons.push([
        Markup.button.callback(
            "⬅️ К проекту",
            `project_${project.id}`
        ),
    ]);

    const keyboard =
        Markup.inlineKeyboard(
            buttons
        );

    if (edit) {
        await ctx.editMessageText(
            text,
            keyboard
        );
    } else {
        await ctx.reply(
            text,
            keyboard
        );
    }
}

function registerOperationHandlers(
    bot
) {
    bot.action(
        /^operations_today_(\d+)$/,
        async (ctx) => {
            await ctx.answerCbQuery();

            await showTodayOperations(
                ctx,
                Number(
                    ctx.match[1]
                ),
                true
            );
        }
    );

    /*
     * Карточка операции
     */

    bot.action(
        /^operation_(\d+)$/,
        async (ctx) => {
            await ctx.answerCbQuery();

            const transaction =
                await Transaction.findByPk(
                    Number(
                        ctx.match[1]
                    ),
                    {
                        include: [
                            {
                                model:
                                Category,
                                as:
                                    "category",
                            },
                            {
                                model:
                                PaymentMethod,
                                as:
                                    "paymentMethod",
                            },
                        ],
                    }
                );

            if (!transaction) {
                await ctx.reply(
                    "Операция не найдена."
                );

                return;
            }

            const project =
                await getProjectForUser(
                    transaction.projectId,
                    ctx.state.user
                );

            if (!project) {
                await ctx.reply(
                    "⛔ Нет доступа."
                );

                return;
            }

            const closedDay =
                project.revenueMode ===
                "daily_close"
                    ? await getClosedDay(
                        project.id,
                        transaction.businessDate
                    )
                    : null;

            const sign =
                transaction.type ===
                "income"
                    ? "+"
                    : "−";

            let text =
                `🧾 Операция #${transaction.id}\n\n` +
                `🏢 ${project.name}\n` +
                `📌 ${
                    transaction.category
                        ?.name ||
                    "Без статьи"
                }\n` +
                `💰 ${sign}${formatKopecks(
                    transaction.amountKopecks
                )}\n` +
                `💳 ${
                    transaction
                        .paymentMethod
                        ?.name ||
                    "Не указано"
                }\n` +
                `📅 ${transaction.businessDate}`;

            if (
                transaction.comment
            ) {
                text +=
                    `\n💬 ${transaction.comment}`;
            }

            if (closedDay) {
                text +=
                    "\n\n🔒 День закрыт. Для изменения сначала переоткройте его.";
            }

            const buttons = [];

            if (
                ctx.state.user.role ===
                "owner" &&
                !closedDay
            ) {
                buttons.push([
                    Markup.button.callback(
                        "✏️ Изменить сумму",
                        `edit_operation_amount_${transaction.id}`
                    ),
                ]);

                buttons.push([
                    Markup.button.callback(
                        "🗑 Удалить",
                        `delete_operation_ask_${transaction.id}`
                    ),
                ]);
            }

            buttons.push([
                Markup.button.callback(
                    "⬅️ Операции сегодня",
                    `operations_today_${project.id}`
                ),
            ]);

            await ctx.editMessageText(
                text,
                Markup.inlineKeyboard(
                    buttons
                )
            );
        }
    );

    /*
     * Редактирование
     */

    bot.action(
        /^edit_operation_amount_(\d+)$/,
        async (ctx) => {
            await ctx.answerCbQuery();

            return ctx.scene.enter(
                "edit-transaction",
                {
                    transactionId:
                        Number(
                            ctx.match[1]
                        ),
                }
            );
        }
    );

    /*
     * Удаление
     */

    bot.action(
        /^delete_operation_ask_(\d+)$/,
        async (ctx) => {
            await ctx.answerCbQuery();

            if (
                ctx.state.user.role !==
                "owner"
            ) {
                return;
            }

            const transaction =
                await Transaction.findByPk(
                    Number(
                        ctx.match[1]
                    )
                );

            if (!transaction) {
                return;
            }

            const project =
                await getProjectForUser(
                    transaction.projectId,
                    ctx.state.user
                );

            if (!project) {
                return;
            }

            const closedDay =
                await getClosedDay(
                    project.id,
                    transaction.businessDate
                );

            if (closedDay) {
                await ctx.reply(
                    "🔒 Сначала переоткройте день."
                );

                return;
            }

            await ctx.editMessageText(
                `Удалить операцию на ${formatKopecks(
                    transaction.amountKopecks
                )}?`,
                Markup.inlineKeyboard([
                    [
                        Markup.button.callback(
                            "🗑 Да, удалить",
                            `delete_operation_confirm_${transaction.id}`
                        ),
                    ],
                    [
                        Markup.button.callback(
                            "❌ Отмена",
                            `operation_${transaction.id}`
                        ),
                    ],
                ])
            );
        }
    );

    bot.action(
        /^delete_operation_confirm_(\d+)$/,
        async (ctx) => {
            await ctx.answerCbQuery();

            if (
                ctx.state.user.role !==
                "owner"
            ) {
                return;
            }

            const transaction =
                await Transaction.findByPk(
                    Number(
                        ctx.match[1]
                    )
                );

            if (!transaction) {
                return;
            }

            const projectId =
                transaction.projectId;

            const closedDay =
                await getClosedDay(
                    projectId,
                    transaction.businessDate
                );

            if (closedDay) {
                await ctx.reply(
                    "🔒 Сначала переоткройте день."
                );

                return;
            }

            await transaction.destroy();

            await showTodayOperations(
                ctx,
                projectId,
                true
            );
        }
    );

    /*
     * Переоткрытие дня
     */

    bot.action(
        /^reopen_day_ask_(\d+)$/,
        async (ctx) => {
            await ctx.answerCbQuery();

            if (
                ctx.state.user.role !==
                "owner"
            ) {
                return;
            }

            const projectId =
                Number(
                    ctx.match[1]
                );

            const project =
                await getProjectForUser(
                    projectId,
                    ctx.state.user
                );

            if (!project) {
                return;
            }

            await ctx.editMessageText(
                `🔓 Переоткрыть сегодняшний день для «${project.name}»?\n\n` +
                `После этого можно будет исправить расходы и выручку, а затем закрыть день повторно.`,
                Markup.inlineKeyboard([
                    [
                        Markup.button.callback(
                            "✅ Переоткрыть",
                            `reopen_day_confirm_${project.id}`
                        ),
                    ],
                    [
                        Markup.button.callback(
                            "❌ Отмена",
                            `operations_today_${project.id}`
                        ),
                    ],
                ])
            );
        }
    );

    bot.action(
        /^reopen_day_confirm_(\d+)$/,
        async (ctx) => {
            await ctx.answerCbQuery();

            if (
                ctx.state.user.role !==
                "owner"
            ) {
                return;
            }

            const projectId =
                Number(
                    ctx.match[1]
                );

            const closure =
                await getClosedDay(
                    projectId,
                    getBusinessDate()
                );

            if (!closure) {
                await ctx.reply(
                    "Закрытый день не найден."
                );

                return;
            }

            await closure.update({
                status:
                    "reopened",
            });

            await showTodayOperations(
                ctx,
                projectId,
                true
            );
        }
    );
}

module.exports = {
    registerOperationHandlers,
};