const {
    Telegraf,
    Scenes,
    session,
    Markup,
} = require("telegraf");

const transactionScene =
    require("./bot/scenes/transactionScene");

const {
    Project,
    Category,
    Transaction,
} = require("./models");

const {
    fn,
    col,
} = require("sequelize");

const {
    SocksProxyAgent,
} = require("socks-proxy-agent");

const editTransactionScene =
    require("./bot/scenes/editTransactionScene");

const {
    registerOperationHandlers,
} = require("./bot/modules/operations");

const {
    getBusinessDate,
} = require("./utils/businessDate");

const {
    registerReportHandlers,
} = require(
    "./bot/modules/reports"
);

const closeDayScene =
    require("./bot/scenes/closeDayScene");

const {
    formatKopecks,
} = require("./utils/money");

const {
    getMainMenu,
} = require("./bot/keyboards/mainMenu");

const authMiddleware =
    require("./bot/middleware/auth");

const {
    getProjectsForUser,
    getProjectForUser,
} = require("./services/projectService");

if (!process.env.BOT_TOKEN) {
    throw new Error(
        "BOT_TOKEN не указан в .env"
    );
}

/*
 * Helpers
 */

function getCategoryTypeTitle(type) {
    return type === "income"
        ? "Статьи доходов"
        : "Статьи расходов";
}

function getCategoryEmoji(type) {
    return type === "income"
        ? "💰"
        : "➖";
}

/*
 * Scene: создание проекта
 */

const createProjectScene =
    new Scenes.WizardScene(
        "create-project",

        async (ctx) => {
            await ctx.reply(
                "🏢 Создание проекта\n\n" +
                "Введите название проекта:",
                Markup.keyboard([
                    ["❌ Отмена"],
                ]).resize()
            );

            return ctx.wizard.next();
        },

        async (ctx) => {
            if (
                ctx.message?.text ===
                "❌ Отмена"
            ) {
                await ctx.reply(
                    "Создание проекта отменено.",
                    getMainMenu()
                );

                return ctx.scene.leave();
            }

            const name =
                ctx.message?.text?.trim();

            if (!name) {
                await ctx.reply(
                    "Введите название проекта."
                );

                return;
            }

            if (name.length > 255) {
                await ctx.reply(
                    "Название слишком длинное."
                );

                return;
            }

            const existing =
                await Project.findOne({
                    where: {
                        name,
                        isActive: true,
                    },
                });

            if (existing) {
                await ctx.reply(
                    "Проект с таким названием уже существует.\n\n" +
                    "Введите другое название:"
                );

                return;
            }

            ctx.wizard.state.projectName =
                name;

            await ctx.reply(
                `Создать проект:\n\n🏢 ${name}?`,
                Markup.inlineKeyboard([
                    [
                        Markup.button.callback(
                            "✅ Создать",
                            "confirm_create_project"
                        ),
                    ],
                    [
                        Markup.button.callback(
                            "❌ Отмена",
                            "cancel_create_project"
                        ),
                    ],
                ])
            );

            return ctx.wizard.next();
        },

        async () => {}
    );

createProjectScene.action(
    "confirm_create_project",
    async (ctx) => {
        const name =
            ctx.wizard.state.projectName;

        const project =
            await Project.create({
                name,
                createdBy:
                ctx.state.user.id,
            });

        await ctx.answerCbQuery();

        await ctx.editMessageText(
            `✅ Проект «${name}» создан.`
        );

        await ctx.reply(
            `🏢 ${project.name}`,
            Markup.inlineKeyboard([
                [
                    Markup.button.callback(
                        "💰 Статьи доходов",
                        `categories_income_${project.id}`
                    ),
                ],
                [
                    Markup.button.callback(
                        "➖ Статьи расходов",
                        `categories_expense_${project.id}`
                    ),
                ],
                [
                    Markup.button.callback(
                        "⬅️ Все проекты",
                        "projects_list"
                    ),
                ],
            ])
        );

        await ctx.reply(
            "Главное меню:",
            getMainMenu()
        );

        return ctx.scene.leave();
    }
);

createProjectScene.action(
    "cancel_create_project",
    async (ctx) => {
        await ctx.answerCbQuery();

        await ctx.editMessageText(
            "Создание проекта отменено."
        );

        await ctx.reply(
            "Главное меню:",
            getMainMenu()
        );

        return ctx.scene.leave();
    }
);

/*
 * Scene: создание статьи
 */

const createCategoryScene =
    new Scenes.WizardScene(
        "create-category",

        async (ctx) => {
            const projectId =
                ctx.wizard.state.projectId;

            const categoryType =
                ctx.wizard.state.categoryType;

            const project =
                await getProjectForUser(
                    projectId,
                    ctx.state.user
                );

            if (!project) {
                await ctx.reply(
                    "Проект не найден."
                );

                return ctx.scene.leave();
            }

            const title =
                getCategoryTypeTitle(
                    categoryType
                );

            await ctx.reply(
                `${getCategoryEmoji(
                    categoryType
                )} ${title}\n\n` +
                `Проект: ${project.name}\n\n` +
                `Введите название новой статьи:`,
                Markup.keyboard([
                    ["❌ Отмена"],
                ]).resize()
            );

            return ctx.wizard.next();
        },

        async (ctx) => {
            if (
                ctx.message?.text ===
                "❌ Отмена"
            ) {
                await ctx.reply(
                    "Создание статьи отменено.",
                    getMainMenu()
                );

                return ctx.scene.leave();
            }

            const name =
                ctx.message?.text?.trim();

            if (!name) {
                await ctx.reply(
                    "Введите название статьи."
                );

                return;
            }

            if (name.length > 255) {
                await ctx.reply(
                    "Название слишком длинное."
                );

                return;
            }

            const {
                projectId,
                categoryType,
            } = ctx.wizard.state;

            const existing =
                await Category.findOne({
                    where: {
                        projectId,
                        type: categoryType,
                        name,
                        isActive: true,
                    },
                });

            if (existing) {
                await ctx.reply(
                    "Такая статья уже существует.\n\n" +
                    "Введите другое название:"
                );

                return;
            }

            ctx.wizard.state.categoryName =
                name;

            const typeText =
                categoryType === "income"
                    ? "дохода"
                    : "расхода";

            await ctx.reply(
                `Добавить статью ${typeText}:\n\n` +
                `${getCategoryEmoji(
                    categoryType
                )} ${name}?`,
                Markup.inlineKeyboard([
                    [
                        Markup.button.callback(
                            "✅ Добавить",
                            "confirm_create_category"
                        ),
                    ],
                    [
                        Markup.button.callback(
                            "❌ Отмена",
                            "cancel_create_category"
                        ),
                    ],
                ])
            );

            return ctx.wizard.next();
        },

        async () => {}
    );

createCategoryScene.action(
    "confirm_create_category",
    async (ctx) => {
        const {
            projectId,
            categoryType,
            categoryName,
        } = ctx.wizard.state;

        const category =
            await Category.create({
                projectId,
                type: categoryType,
                name: categoryName,
                createdBy:
                ctx.state.user.id,
            });

        await ctx.answerCbQuery();

        await ctx.editMessageText(
            `✅ Статья «${category.name}» добавлена.`
        );

        await ctx.reply(
            "Продолжить:",
            Markup.inlineKeyboard([
                [
                    Markup.button.callback(
                        `⬅️ ${getCategoryTypeTitle(
                            categoryType
                        )}`,
                        `categories_${categoryType}_${projectId}`
                    ),
                ],
                [
                    Markup.button.callback(
                        "🏢 К проекту",
                        `project_${projectId}`
                    ),
                ],
            ])
        );

        await ctx.reply(
            "Главное меню:",
            getMainMenu()
        );

        return ctx.scene.leave();
    }
);

createCategoryScene.action(
    "cancel_create_category",
    async (ctx) => {
        const {
            projectId,
            categoryType,
        } = ctx.wizard.state;

        await ctx.answerCbQuery();

        await ctx.editMessageText(
            "Создание статьи отменено."
        );

        await ctx.reply(
            "Продолжить:",
            Markup.inlineKeyboard([
                [
                    Markup.button.callback(
                        `⬅️ ${getCategoryTypeTitle(
                            categoryType
                        )}`,
                        `categories_${categoryType}_${projectId}`
                    ),
                ],
            ])
        );

        await ctx.reply(
            "Главное меню:",
            getMainMenu()
        );

        return ctx.scene.leave();
    }
);

/*
 * Telegram
 */

const stage =
    new Scenes.Stage([
        createProjectScene,
        createCategoryScene,
        transactionScene,
        closeDayScene,
        editTransactionScene,
    ]);

const telegramProxyUrl =
    process.env.TELEGRAM_PROXY_URL;

const telegramAgent =
    telegramProxyUrl
        ? new SocksProxyAgent(
            telegramProxyUrl
        )
        : undefined;

const bot =
    new Telegraf(
        process.env.BOT_TOKEN,
        {
            telegram: {
                ...(telegramAgent
                    ? {
                        agent:
                        telegramAgent,
                    }
                    : {}),
            },
        }
    );

bot.use(session());

bot.use(authMiddleware);

bot.use(stage.middleware());

/*
 * /start
 */

bot.start(async (ctx) => {
    const user =
        ctx.state.user;

    await ctx.reply(
        `💰 Business Cash\n\n` +
        `Привет, ${
            user.firstName ||
            "пользователь"
        }!\n\n` +
        `Здесь мы учитываем доходы и расходы по проектам.`,
        getMainMenu()
    );
});

/*
 * Показ списка проектов
 */

async function showProjects(
    ctx,
    editMessage = false
) {
    const projects =
        await getProjectsForUser(
            ctx.state.user
        );

    const buttons =
        projects.map(
            (project) => [
                Markup.button.callback(
                    `🏢 ${project.name}`,
                    `project_${project.id}`
                ),
            ]
        );

    if (
        ctx.state.user.role ===
        "owner"
    ) {
        buttons.push([
            Markup.button.callback(
                "➕ Добавить проект",
                "add_project"
            ),
        ]);
    }

    const text =
        projects.length === 0
            ? "🏢 Проектов пока нет."
            : `🏢 Ваши проекты: ${projects.length}`;

    const keyboard =
        Markup.inlineKeyboard(
            buttons
        );

    if (editMessage) {
        await ctx.editMessageText(
            text,
            keyboard
        );

        return;
    }

    await ctx.reply(
        text,
        keyboard
    );
}

bot.hears(
    "🏢 Проекты",
    async (ctx) => {
        await showProjects(ctx);
    }
);

bot.action(
    "projects_list",
    async (ctx) => {
        await ctx.answerCbQuery();

        await showProjects(
            ctx,
            true
        );
    }
);

/*
 * Создание проекта
 */

bot.action(
    "add_project",
    async (ctx) => {
        await ctx.answerCbQuery();

        if (
            ctx.state.user.role !==
            "owner"
        ) {
            await ctx.reply(
                "⛔ Добавлять проекты может только владелец."
            );

            return;
        }

        return ctx.scene.enter(
            "create-project"
        );
    }
);

/*
 * Карточка проекта
 */

bot.action(
    /^project_(\d+)$/,
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
                "⛔ Проект не найден или у вас нет доступа."
            );

            return;
        }

        const buttons = [];

        if (
            project.revenueMode ===
            "direct"
        ) {
            buttons.push([
                Markup.button.callback(
                    "➕ Добавить доход",
                    `direct_income_${project.id}`
                ),
            ]);
        }


        buttons.push([
            Markup.button.callback(
                "💰 Статьи доходов",
                `categories_income_${project.id}`
            ),
        ]);

        buttons.push([
            Markup.button.callback(
                "➖ Статьи расходов",
                `categories_expense_${project.id}`
            ),
        ]);

        buttons.push([
            Markup.button.callback(
                "🧾 Операции сегодня",
                `operations_today_${project.id}`
            ),
        ]);

        buttons.push([
            Markup.button.callback(
                "⬅️ Все проекты",
                "projects_list"
            ),
        ]);

        await ctx.editMessageText(
            `🏢 ${project.name}\n\n` +
            `Выберите раздел:`,
            Markup.inlineKeyboard(buttons)
        );

        bot.action(
            /^direct_income_(\d+)$/,
            async (ctx) => {
                await ctx.answerCbQuery();

                const project =
                    await getProjectForUser(
                        Number(ctx.match[1]),
                        ctx.state.user
                    );

                if (
                    !project ||
                    project.revenueMode !==
                    "direct"
                ) {
                    await ctx.reply(
                        "Прямое внесение дохода для этого проекта недоступно."
                    );

                    return;
                }

                return ctx.scene.enter(
                    "transaction",
                    {
                        operationType:
                            "income",
                    }
                );
            }
        );
    }
);

/*
 * Список статей
 */

bot.action(
    /^categories_(income|expense)_(\d+)$/,
    async (ctx) => {
        await ctx.answerCbQuery();

        const categoryType =
            ctx.match[1];

        const projectId =
            Number(ctx.match[2]);

        const project =
            await getProjectForUser(
                projectId,
                ctx.state.user
            );

        if (!project) {
            await ctx.reply(
                "⛔ Нет доступа к проекту."
            );

            return;
        }

        const categories =
            await Category.findAll({
                where: {
                    projectId,
                    type: categoryType,
                    isActive: true,
                },

                order: [
                    ["name", "ASC"],
                ],
            });

        const today =
            getBusinessDate();

        const totals =
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
                        "totalKopecks",
                    ],
                ],

                where: {
                    projectId,
                    type: categoryType,
                    businessDate: today,
                },

                group: [
                    "categoryId",
                ],

                raw: true,
            });

        const totalsMap =
            new Map();

        for (const row of totals) {
            totalsMap.set(
                Number(row.categoryId),
                row.totalKopecks || "0"
            );
        }

        let totalToday = 0n;

        for (const category of categories) {
            const value =
                totalsMap.get(
                    Number(category.id)
                ) || "0";

            totalToday +=
                BigInt(value);
        }

        let text =
            `${getCategoryEmoji(
                categoryType
            )} ${getCategoryTypeTitle(
                categoryType
            )}\n\n` +
            `🏢 ${project.name}\n\n`;

        if (
            categories.length === 0
        ) {
            text +=
                "Пока ни одной статьи нет.";
        } else {
            text +=
                categories
                    .map(
                        (
                            category,
                            index
                        ) => {
                            const total =
                                totalsMap.get(
                                    Number(
                                        category.id
                                    )
                                ) || "0";

                            return (
                                `${index + 1}. ` +
                                `${category.name} — ` +
                                `${formatKopecks(
                                    total
                                )}`
                            );
                        }
                    )
                    .join("\n");

            text +=
                `\n\n────────────\n` +
                `Сегодня всего: ` +
                `${formatKopecks(
                    totalToday
                )}`;
        }

        const buttons =
            categories.map(
                (category) => {
                    const total =
                        totalsMap.get(
                            Number(
                                category.id
                            )
                        ) || "0";

                    return [
                        Markup.button.callback(
                            `${category.name} — ${formatKopecks(
                                total
                            )}`,
                            `category_${category.id}`
                        ),
                    ];
                }
            );

        if (
            ctx.state.user.role ===
            "owner"
        ) {
            buttons.push([
                Markup.button.callback(
                    "➕ Добавить статью",
                    `add_category_${categoryType}_${projectId}`
                ),
            ]);
        }

        buttons.push([
            Markup.button.callback(
                "⬅️ К проекту",
                `project_${projectId}`
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
 * Создание статьи
 */

bot.action(
    /^add_category_(income|expense)_(\d+)$/,
    async (ctx) => {
        await ctx.answerCbQuery();

        if (
            ctx.state.user.role !==
            "owner"
        ) {
            await ctx.reply(
                "⛔ Добавлять статьи может только владелец."
            );

            return;
        }

        const categoryType =
            ctx.match[1];

        const projectId =
            Number(ctx.match[2]);

        const project =
            await getProjectForUser(
                projectId,
                ctx.state.user
            );

        if (!project) {
            await ctx.reply(
                "Проект не найден."
            );

            return;
        }

        return ctx.scene.enter(
            "create-category",
            {
                projectId,
                categoryType,
            }
        );
    }
);

/*
 * Карточка статьи
 */

bot.action(
    /^category_(\d+)$/,
    async (ctx) => {
        await ctx.answerCbQuery();

        const category =
            await Category.findByPk(
                Number(ctx.match[1])
            );

        if (!category) {
            await ctx.reply(
                "Статья не найдена."
            );

            return;
        }

        const project =
            await getProjectForUser(
                category.projectId,
                ctx.state.user
            );

        if (!project) {
            await ctx.reply(
                "⛔ Нет доступа."
            );

            return;
        }

        const typeText =
            category.type ===
            "income"
                ? "Доход"
                : "Расход";

        const buttons = [];

        if (
            ctx.state.user.role ===
            "owner"
        ) {
            buttons.push([
                Markup.button.callback(
                    "🗄 Архивировать",
                    `archive_category_ask_${category.id}`
                ),
            ]);
        }

        buttons.push([
            Markup.button.callback(
                "⬅️ Назад",
                `categories_${category.type}_${category.projectId}`
            ),
        ]);

        await ctx.editMessageText(
            `${getCategoryEmoji(
                category.type
            )} ${category.name}\n\n` +
            `🏢 Проект: ${project.name}\n` +
            `Тип: ${typeText}`,
            Markup.inlineKeyboard(
                buttons
            )
        );
    }
);

/*
 * Архивирование статьи
 */

bot.action(
    /^archive_category_ask_(\d+)$/,
    async (ctx) => {
        await ctx.answerCbQuery();

        if (
            ctx.state.user.role !==
            "owner"
        ) {
            return;
        }

        const category =
            await Category.findByPk(
                Number(ctx.match[1])
            );

        if (!category) {
            return;
        }

        await ctx.editMessageText(
            `Архивировать статью «${category.name}»?\n\n` +
            `Старые операции по ней в будущем сохранятся.`,
            Markup.inlineKeyboard([
                [
                    Markup.button.callback(
                        "✅ Архивировать",
                        `archive_category_confirm_${category.id}`
                    ),
                ],
                [
                    Markup.button.callback(
                        "❌ Отмена",
                        `category_${category.id}`
                    ),
                ],
            ])
        );
    }
);

bot.action(
    /^archive_category_confirm_(\d+)$/,
    async (ctx) => {
        await ctx.answerCbQuery();

        if (
            ctx.state.user.role !==
            "owner"
        ) {
            return;
        }

        const category =
            await Category.findByPk(
                Number(ctx.match[1])
            );

        if (!category) {
            return;
        }

        await category.update({
            isActive: false,
        });

        await ctx.editMessageText(
            `✅ Статья «${category.name}» отправлена в архив.`,
            Markup.inlineKeyboard([
                [
                    Markup.button.callback(
                        "⬅️ Вернуться к статьям",
                        `categories_${category.type}_${category.projectId}`
                    ),
                ],
            ])
        );
    }
);

/*
 * Заглушки следующих модулей
 */

bot.hears(
    "➕ Доход",
    async (ctx) => {
        return ctx.scene.enter(
            "transaction",
            {
                operationType:
                    "income",
            }
        );
    }
);

bot.hears(
    "➖ Расход",
    async (ctx) => {
        return ctx.scene.enter(
            "transaction",
            {
                operationType:
                    "expense",
            }
        );
    }
);

bot.hears(
    "✅ Закрыть день",
    async (ctx) => {
        return ctx.scene.enter(
            "close-day"
        );
    }
);

registerReportHandlers(
    bot
);

registerReportHandlers(bot);
registerOperationHandlers(bot);

bot.catch(
    (error, ctx) => {
        console.error(
            `Ошибка Telegram update ${
                ctx.update
                    ?.update_id
            }:`,
            error
        );
    }
);

module.exports = bot;