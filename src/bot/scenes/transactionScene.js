const {
    Scenes,
    Markup,
} = require("telegraf");

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

const transactionScene =
    new Scenes.BaseScene(
        "transaction"
    );

/*
 * Helpers
 */

function getTypeTitle(type) {
    return type === "income"
        ? "Доход"
        : "Расход";
}

function getTypeEmoji(type) {
    return type === "income"
        ? "➕"
        : "➖";
}

async function cancelOperation(ctx) {
    await ctx.reply(
        "Операция отменена.",
        getMainMenu()
    );

    return ctx.scene.leave();
}

async function askAmount(ctx) {
    ctx.scene.state.awaiting =
        "amount";

    await ctx.reply(
        "Введите сумму в рублях:",
        Markup.keyboard([
            ["❌ Отмена"],
        ]).resize()
    );
}

async function showConfirmation(
    ctx
) {
    const state =
        ctx.scene.state;

    let text =
        `${getTypeEmoji(
            state.operationType
        )} ${getTypeTitle(
            state.operationType
        )}\n\n` +
        `🏢 ${state.projectName}\n` +
        `📌 ${state.categoryName}\n` +
        `💰 ${formatKopecks(
            state.amountKopecks
        )}\n` +
        `💳 ${state.paymentMethodName}`;

    if (
        state.operationType ===
        "expense" &&
        state.fundSource
    ) {
        text +=
            "\n\nИсточник денег: ";

        text +=
            state.fundSource ===
            "today_revenue"
                ? "из сегодняшней выручки"
                : "из других денег";
    }

    text +=
        "\n\nВсё правильно?";

    ctx.scene.state.awaiting =
        null;

    await ctx.reply(
        text,
        Markup.inlineKeyboard([
            [
                Markup.button.callback(
                    "✅ Сохранить",
                    "tx_confirm"
                ),
            ],
            [
                Markup.button.callback(
                    "❌ Отмена",
                    "tx_cancel"
                ),
            ],
        ])
    );
}

/*
 * Вход
 */

transactionScene.enter(
    async (ctx) => {
        const operationType =
            ctx.scene.state
                .operationType;

        if (
            ![
                "income",
                "expense",
            ].includes(operationType)
        ) {
            await ctx.reply(
                "Ошибка типа операции."
            );

            return ctx.scene.leave();
        }

        let projects =
            await getProjectsForUser(
                ctx.state.user
            );

        if (
            operationType === "income"
        ) {
            projects =
                projects.filter(
                    (project) =>
                        project.revenueMode ===
                        "direct"
                );
        }

        if (projects.length === 0) {
            await ctx.reply(
                operationType === "income"
                    ? "Нет проектов с прямым внесением доходов."
                    : "У вас пока нет проектов.",
                getMainMenu()
            );

            return ctx.scene.leave();
        }

        const buttons =
            projects.map(
                (project) => [
                    Markup.button.callback(
                        `🏢 ${project.name}`,
                        `tx_project_${project.id}`
                    ),
                ]
            );

        buttons.push([
            Markup.button.callback(
                "❌ Отмена",
                "tx_cancel"
            ),
        ]);

        await ctx.reply(
            `${getTypeEmoji(
                operationType
            )} Новый ${getTypeTitle(
                operationType
            ).toLowerCase()}\n\n` +
            `Выберите проект:`,
            Markup.inlineKeyboard(
                buttons
            )
        );
    }
);

/*
 * Выбор проекта
 */

transactionScene.action(
    /^tx_project_(\d+)$/,
    async (ctx) => {
        await ctx.answerCbQuery();

        const projectId =
            Number(ctx.match[1]);

        const project =
            await getProjectForUser(
                projectId,
                ctx.state.user
            );

        if (!project) {
            await ctx.reply(
                "Нет доступа к проекту."
            );

            return;
        }

        if (
            project.revenueMode ===
            "daily_close"
        ) {
            const closedDay =
                await DailyClosure.findOne({
                    where: {
                        projectId:
                        project.id,

                        businessDate:
                            getBusinessDate(),

                        status:
                            "closed",
                    },
                });

            if (closedDay) {
                await ctx.reply(
                    `⛔ День по проекту «${project.name}» уже закрыт.\n\n` +
                    `Добавлять новые операции за сегодня нельзя.`,
                    getMainMenu()
                );

                return ctx.scene.leave();
            }
        }

        ctx.scene.state.projectId =
            project.id;

        ctx.scene.state.projectName =
            project.name;

        ctx.scene.state
            .trackTodayRevenueSource =
            Boolean(
                project
                    .trackTodayRevenueSource
            );

        const categories =
            await Category.findAll({
                where: {
                    projectId:
                    project.id,

                    type:
                    ctx.scene.state
                        .operationType,

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
                        `tx_category_${category.id}`
                    ),
                ]
            );

        buttons.push([
            Markup.button.callback(
                "➕ Новая статья",
                "tx_new_category"
            ),
        ]);

        buttons.push([
            Markup.button.callback(
                "❌ Отмена",
                "tx_cancel"
            ),
        ]);

        const title =
            ctx.scene.state
                .operationType ===
            "income"
                ? "статью дохода"
                : "статью расхода";

        await ctx.editMessageText(
            `🏢 ${project.name}\n\n` +
            `Выберите ${title}:`,
            Markup.inlineKeyboard(
                buttons
            )
        );
    }
);

/*
 * Выбор статьи
 */

transactionScene.action(
    /^tx_category_(\d+)$/,
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

                    type:
                    ctx.scene.state
                        .operationType,

                    isActive: true,
                },
            });

        if (!category) {
            await ctx.reply(
                "Статья не найдена."
            );

            return;
        }

        ctx.scene.state.categoryId =
            category.id;

        ctx.scene.state.categoryName =
            category.name;

        await askAmount(ctx);
    }
);

/*
 * Новая статья прямо во время операции
 */

transactionScene.action(
    "tx_new_category",
    async (ctx) => {
        await ctx.answerCbQuery();

        ctx.scene.state.awaiting =
            "new_category";

        await ctx.reply(
            "Введите название новой статьи:",
            Markup.keyboard([
                ["❌ Отмена"],
            ]).resize()
        );
    }
);

/*
 * Выбор способа оплаты
 */

transactionScene.action(
    /^tx_payment_(\d+)$/,
    async (ctx) => {
        await ctx.answerCbQuery();

        const paymentMethod =
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

        if (!paymentMethod) {
            await ctx.reply(
                "Способ оплаты не найден."
            );

            return;
        }

        ctx.scene.state
            .paymentMethodId =
            paymentMethod.id;

        ctx.scene.state
            .paymentMethodName =
            paymentMethod.name;

        const project =
            await getProjectForUser(
                ctx.scene.state
                    .projectId,

                ctx.state.user
            );

        if (
            ctx.scene.state
                .operationType ===
            "expense" &&
            project
                ?.trackTodayRevenueSource
        ) {
            await ctx.reply(
                "Из каких денег оплачен расход?",
                Markup.inlineKeyboard([
                    [
                        Markup.button.callback(
                            "💰 Из сегодняшней выручки",
                            "tx_source_today"
                        ),
                    ],
                    [
                        Markup.button.callback(
                            "🏦 Из других денег",
                            "tx_source_other"
                        ),
                    ],
                    [
                        Markup.button.callback(
                            "❌ Отмена",
                            "tx_cancel"
                        ),
                    ],
                ])
            );

            return;
        }

        ctx.scene.state.comment = null;

        return showConfirmation(ctx);    }
);

/*
 * Создать новый способ оплаты
 */

transactionScene.action(
    "tx_new_payment",
    async (ctx) => {
        await ctx.answerCbQuery();

        ctx.scene.state.awaiting =
            "new_payment";

        await ctx.reply(
            "Введите название нового способа оплаты:",
            Markup.keyboard([
                ["❌ Отмена"],
            ]).resize()
        );
    }
);

/*
 * Источник расхода
 */

transactionScene.action(
    "tx_source_today",
    async (ctx) => {
        await ctx.answerCbQuery();

        ctx.scene.state.fundSource =
            "today_revenue";

        ctx.scene.state.comment =
            null;

        return showConfirmation(ctx);
    }
);

transactionScene.action(
    "tx_source_other",
    async (ctx) => {
        await ctx.answerCbQuery();

        ctx.scene.state.fundSource =
            "other";

        ctx.scene.state.comment =
            null;

        return showConfirmation(ctx);
    }
);

/*
 * Текстовые шаги
 */

transactionScene.on(
    "text",
    async (ctx) => {
        const text =
            ctx.message.text?.trim();

        if (
            text ===
            "❌ Отмена"
        ) {
            return cancelOperation(
                ctx
            );
        }

        const awaiting =
            ctx.scene.state
                .awaiting;

        /*
         * Создание статьи
         */

        if (
            awaiting ===
            "new_category"
        ) {
            if (!text) {
                await ctx.reply(
                    "Введите название."
                );

                return;
            }

            if (
                text.length > 255
            ) {
                await ctx.reply(
                    "Название слишком длинное."
                );

                return;
            }

            let category =
                await Category.findOne({
                    where: {
                        projectId:
                        ctx.scene.state
                            .projectId,

                        type:
                        ctx.scene.state
                            .operationType,

                        name: text,
                    },
                });

            if (category) {
                if (
                    !category.isActive
                ) {
                    await category.update({
                        isActive: true,
                    });
                }
            } else {
                category =
                    await Category.create({
                        projectId:
                        ctx.scene.state
                            .projectId,

                        type:
                        ctx.scene.state
                            .operationType,

                        name: text,

                        createdBy:
                        ctx.state.user.id,
                    });
            }

            ctx.scene.state
                .categoryId =
                category.id;

            ctx.scene.state
                .categoryName =
                category.name;

            await askAmount(ctx);

            return;
        }

        /*
         * Сумма
         */

        if (
            awaiting ===
            "amount"
        ) {
            const amount =
                parseMoneyToKopecks(
                    text
                );

            if (!amount) {
                await ctx.reply(
                    "Не удалось понять сумму.\n\n" +
                    "Например:\n" +
                    "1500\n" +
                    "1 500\n" +
                    "1500,50"
                );

                return;
            }

            ctx.scene.state
                .amountKopecks =
                amount.toString();

            ctx.scene.state.awaiting =
                null;

            await ensureDefaultPaymentMethods(
                ctx.scene.state
                    .projectId
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
                            `tx_payment_${method.id}`
                        ),
                    ]
                );

            buttons.push([
                Markup.button.callback(
                    "➕ Новый способ",
                    "tx_new_payment"
                ),
            ]);

            buttons.push([
                Markup.button.callback(
                    "❌ Отмена",
                    "tx_cancel"
                ),
            ]);

            await ctx.reply(
                ctx.scene.state
                    .operationType ===
                "income"
                    ? "Как получены деньги?"
                    : "Как оплачен расход?",

                Markup.inlineKeyboard(
                    buttons
                )
            );

            return;
        }

        /*
         * Новый способ оплаты
         */

        if (
            awaiting ===
            "new_payment"
        ) {
            if (!text) {
                await ctx.reply(
                    "Введите название."
                );

                return;
            }

            let paymentMethod =
                await PaymentMethod.findOne({
                    where: {
                        projectId:
                        ctx.scene.state
                            .projectId,

                        name: text,
                    },
                });

            if (paymentMethod) {
                if (
                    !paymentMethod
                        .isActive
                ) {
                    await paymentMethod.update({
                        isActive: true,
                    });
                }
            } else {
                paymentMethod =
                    await PaymentMethod.create({
                        projectId:
                        ctx.scene.state
                            .projectId,

                        name: text,

                        type: "other",
                    });
            }

            ctx.scene.state
                .paymentMethodId =
                paymentMethod.id;

            ctx.scene.state
                .paymentMethodName =
                paymentMethod.name;

            ctx.scene.state.awaiting =
                null;

            const project =
                await getProjectForUser(
                    ctx.scene.state
                        .projectId,

                    ctx.state.user
                );

            if (
                ctx.scene.state
                    .operationType ===
                "expense" &&
                project
                    ?.trackTodayRevenueSource
            ) {
                await ctx.reply(
                    "Из каких денег оплачен расход?",
                    Markup.inlineKeyboard([
                        [
                            Markup.button.callback(
                                "💰 Из сегодняшней выручки",
                                "tx_source_today"
                            ),
                        ],
                        [
                            Markup.button.callback(
                                "🏦 Из других денег",
                                "tx_source_other"
                            ),
                        ],
                    ])
                );

                return;
            }

            ctx.scene.state.comment =
                null;

            await showConfirmation(ctx);

            return;
        }


        /*
 * Не оставляем пользователя
 * без ответа, если сцена активна,
 * но сейчас ожидается inline-кнопка.
 */
        await ctx.reply(
            "Выберите один из вариантов кнопками выше " +
            "или нажмите «❌ Отмена»."
        );
    }
);

/*
 * Подтверждение
 */

transactionScene.action(
    "tx_confirm",
    async (ctx) => {
        await ctx.answerCbQuery();

        const state =
            ctx.scene.state;

        const transaction =
            await Transaction.create({
                projectId:
                state.projectId,

                type:
                state.operationType,

                categoryId:
                state.categoryId,

                paymentMethodId:
                state.paymentMethodId,

                amountKopecks:
                state.amountKopecks,

                businessDate:
                    getBusinessDate(),

                fundSource:
                    state.operationType ===
                    "expense"
                        ? (
                            state
                                .trackTodayRevenueSource
                                ? (
                                    state
                                        .fundSource ||
                                    null
                                )
                                : "other"
                        )
                        : null,

                comment: null,

                createdBy:
                ctx.state.user.id,
            });

        const sign =
            state.operationType ===
            "income"
                ? "+"
                : "−";

        await ctx.editMessageText(
            `✅ Операция сохранена\n\n` +
            `${sign} ${formatKopecks(
                transaction.amountKopecks
            )}\n` +
            `🏢 ${state.projectName}\n` +
            `📌 ${state.categoryName}\n` +
            `💳 ${state.paymentMethodName}`
        );

        await ctx.reply(
            "Готово.",
            getMainMenu()
        );

        return ctx.scene.leave();
    }
);

/*
 * Отмена inline
 */

transactionScene.action(
    "tx_cancel",
    async (ctx) => {
        await ctx.answerCbQuery();

        return cancelOperation(
            ctx
        );
    }
);

module.exports =
    transactionScene;