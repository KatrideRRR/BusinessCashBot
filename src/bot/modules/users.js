const {
    Markup,
} = require("telegraf");

const {
    User,
    Project,
    ProjectUser,
} = require("../../models");

function displayName(user) {
    const fullName = [
        user.firstName,
        user.lastName,
    ]
        .filter(Boolean)
        .join(" ")
        .trim();

    if (fullName) {
        return fullName;
    }

    if (user.username) {
        return `@${user.username}`;
    }

    return `Telegram ${user.telegramId}`;
}

async function ensureOwner(ctx) {
    if (
        ctx.state.user?.role !==
        "owner"
    ) {
        await ctx.reply(
            "⛔ Этот раздел доступен только владельцу."
        );

        return false;
    }

    return true;
}

async function showUsers(
    ctx,
    edit = false
) {
    if (
        !(await ensureOwner(ctx))
    ) {
        return;
    }

    const users =
        await User.findAll({
            order: [
                ["isActive", "ASC"],
                ["id", "ASC"],
            ],
        });

    const pending =
        users.filter(
            (user) =>
                !user.isActive
        );

    const active =
        users.filter(
            (user) =>
                user.isActive &&
                user.role !==
                "owner"
        );

    let text =
        "👥 Пользователи\n\n";

    text +=
        `⏳ Ожидают доступа: ${pending.length}\n` +
        `✅ Активные: ${active.length}\n\n`;

    if (
        pending.length > 0
    ) {
        text +=
            "ОЖИДАЮТ ДОСТУПА:\n";

        pending.forEach(
            (user) => {
                text +=
                    `• ${displayName(
                        user
                    )}\n`;
            }
        );

        text += "\n";
    }

    if (
        active.length > 0
    ) {
        text +=
            "АКТИВНЫЕ:\n";

        active.forEach(
            (user) => {
                text +=
                    `• ${displayName(
                        user
                    )} — ${user.role}\n`;
            }
        );
    }

    const buttons = [];

    pending.forEach(
        (user) => {
            buttons.push([
                Markup.button.callback(
                    `⏳ ${displayName(
                        user
                    )}`,
                    `user_${user.id}`
                ),
            ]);
        }
    );

    active.forEach(
        (user) => {
            buttons.push([
                Markup.button.callback(
                    `✅ ${displayName(
                        user
                    )}`,
                    `user_${user.id}`
                ),
            ]);
        }
    );

    const keyboard =
        Markup.inlineKeyboard(
            buttons
        );

    if (edit) {
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

async function showUserCard(
    ctx,
    userId
) {
    if (
        !(await ensureOwner(ctx))
    ) {
        return;
    }

    const user =
        await User.findByPk(
            userId
        );

    if (!user) {
        await ctx.reply(
            "Пользователь не найден."
        );

        return;
    }

    const accesses =
        await ProjectUser.findAll({
            where: {
                userId:
                user.id,
            },

            include: [
                {
                    model:
                    Project,
                    as: "project",
                },
            ],
        });

    let text =
        `👤 ${displayName(
            user
        )}\n\n`;

    text +=
        `Telegram ID: ${user.telegramId}\n`;

    if (user.username) {
        text +=
            `Username: @${user.username}\n`;
    }

    text +=
        `Статус: ${
            user.isActive
                ? "✅ Активен"
                : "⛔ Нет доступа"
        }\n`;

    text +=
        `Роль: ${user.role}\n`;

    text +=
        "\nДоступ к проектам:\n";

    if (
        accesses.length === 0
    ) {
        text += "Нет";
    } else {
        for (
            const access
            of accesses
            ) {
            text +=
                `• ${
                    access.project
                        ?.name ||
                    "Неизвестный проект"
                }\n`;
        }
    }

    const buttons = [];

    if (
        !user.isActive
    ) {
        buttons.push([
            Markup.button.callback(
                "✅ Разрешить доступ",
                `user_activate_${user.id}`
            ),
        ]);
    } else if (
        user.role !== "owner"
    ) {
        buttons.push([
            Markup.button.callback(
                "🏢 Настроить проекты",
                `user_projects_${user.id}`
            ),
        ]);

        buttons.push([
            Markup.button.callback(
                "⛔ Отключить доступ",
                `user_disable_ask_${user.id}`
            ),
        ]);
    }

    buttons.push([
        Markup.button.callback(
            "⬅️ Пользователи",
            "users_list"
        ),
    ]);

    await ctx.editMessageText(
        text,
        Markup.inlineKeyboard(
            buttons
        )
    );
}

function registerUserHandlers(
    bot
) {
    bot.hears(
        "👥 Пользователи",
        async (ctx) => {
            await showUsers(ctx);
        }
    );

    bot.action(
        "users_list",
        async (ctx) => {
            await ctx.answerCbQuery();

            await showUsers(
                ctx,
                true
            );
        }
    );

    bot.action(
        /^user_(\d+)$/,
        async (ctx) => {
            await ctx.answerCbQuery();

            await showUserCard(
                ctx,
                Number(
                    ctx.match[1]
                )
            );
        }
    );

    /*
     * Активация пользователя
     */

    bot.action(
        /^user_activate_(\d+)$/,
        async (ctx) => {
            await ctx.answerCbQuery();

            if (
                !(await ensureOwner(
                    ctx
                ))
            ) {
                return;
            }

            const user =
                await User.findByPk(
                    Number(
                        ctx.match[1]
                    )
                );

            if (!user) {
                return;
            }

            await user.update({
                isActive: true,
                role: "employee",
            });

            await showUserCard(
                ctx,
                user.id
            );
        }
    );

    /*
     * Список проектов пользователя
     */

    bot.action(
        /^user_projects_(\d+)$/,
        async (ctx) => {
            await ctx.answerCbQuery();

            if (
                !(await ensureOwner(
                    ctx
                ))
            ) {
                return;
            }

            const user =
                await User.findByPk(
                    Number(
                        ctx.match[1]
                    )
                );

            if (
                !user ||
                user.role ===
                "owner"
            ) {
                return;
            }

            const projects =
                await Project.findAll({
                    where: {
                        isActive: true,
                    },

                    order: [
                        [
                            "name",
                            "ASC",
                        ],
                    ],
                });

            const accesses =
                await ProjectUser.findAll({
                    where: {
                        userId:
                        user.id,
                    },
                });

            const accessIds =
                new Set(
                    accesses.map(
                        (item) =>
                            Number(
                                item.projectId
                            )
                    )
                );

            const buttons =
                projects.map(
                    (project) => [
                        Markup.button.callback(
                            `${
                                accessIds.has(
                                    Number(
                                        project.id
                                    )
                                )
                                    ? "✅"
                                    : "⬜️"
                            } ${project.name}`,
                            `toggle_user_project_${user.id}_${project.id}`
                        ),
                    ]
                );

            buttons.push([
                Markup.button.callback(
                    "⬅️ К пользователю",
                    `user_${user.id}`
                ),
            ]);

            await ctx.editMessageText(
                `🏢 Доступ к проектам\n\n` +
                `👤 ${displayName(
                    user
                )}\n\n` +
                `Нажимайте на проекты, чтобы включать или отключать доступ.`,
                Markup.inlineKeyboard(
                    buttons
                )
            );
        }
    );

    /*
     * Включить / выключить проект
     */

    bot.action(
        /^toggle_user_project_(\d+)_(\d+)$/,
        async (ctx) => {
            await ctx.answerCbQuery();

            if (
                !(await ensureOwner(
                    ctx
                ))
            ) {
                return;
            }

            const userId =
                Number(
                    ctx.match[1]
                );

            const projectId =
                Number(
                    ctx.match[2]
                );

            const existing =
                await ProjectUser.findOne({
                    where: {
                        userId,
                        projectId,
                    },
                });

            if (existing) {
                await existing.destroy();
            } else {
                await ProjectUser.create({
                    userId,
                    projectId,
                    role: "employee",
                });
            }

            /*
             * Повторно открываем
             * тот же экран.
             */
            const user =
                await User.findByPk(
                    userId
                );

            const projects =
                await Project.findAll({
                    where: {
                        isActive: true,
                    },

                    order: [
                        [
                            "name",
                            "ASC",
                        ],
                    ],
                });

            const accesses =
                await ProjectUser.findAll({
                    where: {
                        userId,
                    },
                });

            const accessIds =
                new Set(
                    accesses.map(
                        (item) =>
                            Number(
                                item.projectId
                            )
                    )
                );

            const buttons =
                projects.map(
                    (project) => [
                        Markup.button.callback(
                            `${
                                accessIds.has(
                                    Number(
                                        project.id
                                    )
                                )
                                    ? "✅"
                                    : "⬜️"
                            } ${project.name}`,
                            `toggle_user_project_${user.id}_${project.id}`
                        ),
                    ]
                );

            buttons.push([
                Markup.button.callback(
                    "⬅️ К пользователю",
                    `user_${user.id}`
                ),
            ]);

            await ctx.editMessageText(
                `🏢 Доступ к проектам\n\n` +
                `👤 ${displayName(
                    user
                )}\n\n` +
                `Нажимайте на проекты, чтобы включать или отключать доступ.`,
                Markup.inlineKeyboard(
                    buttons
                )
            );
        }
    );

    /*
     * Отключение
     */

    bot.action(
        /^user_disable_ask_(\d+)$/,
        async (ctx) => {
            await ctx.answerCbQuery();

            if (
                !(await ensureOwner(
                    ctx
                ))
            ) {
                return;
            }

            const user =
                await User.findByPk(
                    Number(
                        ctx.match[1]
                    )
                );

            if (
                !user ||
                user.role ===
                "owner"
            ) {
                return;
            }

            await ctx.editMessageText(
                `⛔ Отключить доступ для ${displayName(
                    user
                )}?`,
                Markup.inlineKeyboard([
                    [
                        Markup.button.callback(
                            "✅ Да, отключить",
                            `user_disable_confirm_${user.id}`
                        ),
                    ],
                    [
                        Markup.button.callback(
                            "❌ Отмена",
                            `user_${user.id}`
                        ),
                    ],
                ])
            );
        }
    );

    bot.action(
        /^user_disable_confirm_(\d+)$/,
        async (ctx) => {
            await ctx.answerCbQuery();

            if (
                !(await ensureOwner(
                    ctx
                ))
            ) {
                return;
            }

            const user =
                await User.findByPk(
                    Number(
                        ctx.match[1]
                    )
                );

            if (
                !user ||
                user.role ===
                "owner"
            ) {
                return;
            }

            await user.update({
                isActive: false,
            });

            await showUserCard(
                ctx,
                user.id
            );
        }
    );
}

module.exports = {
    registerUserHandlers,
};