const {
    Markup,
} = require("telegraf");

const {
    getProjectsForUser,
    getProjectForUser,
} = require(
    "../../services/projectService"
);

const {
    getProjectTotals,
    getIncomeByPaymentMethod,
    getIncomeByCategory,
    getExpenseByCategory,
    getClosureStatus,
} = require(
    "../../services/reportService"
);

const {
    getReportPeriod,
    formatDateRange,
} = require(
    "../../utils/businessDate"
);

const {
    formatKopecks,
} = require(
    "../../utils/money"
);

/*
 * Главное меню отчётов
 */

async function showReportsMenu(
    ctx,
    edit = false
) {
    const keyboard =
        Markup.inlineKeyboard([
            [
                Markup.button.callback(
                    "📅 Сегодня",
                    "report_today"
                ),

                Markup.button.callback(
                    "◀️ Вчера",
                    "report_yesterday"
                ),
            ],

            [
                Markup.button.callback(
                    "7️⃣ 7 дней",
                    "report_7d"
                ),

                Markup.button.callback(
                    "🗓 Этот месяц",
                    "report_month"
                ),
            ],

            [
                Markup.button.callback(
                    "♾ За всё время",
                    "report_all"
                ),
            ],
        ]);

    const text =
        "📊 Отчёты\n\n" +
        "Выберите период:";

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

/*
 * Общий отчёт
 */

async function showPeriodReport(
    ctx,
    periodKey,
    edit = true
) {
    const period =
        getReportPeriod(
            periodKey
        );

    const projects =
        await getProjectsForUser(
            ctx.state.user
        );

    let totalIncome = 0n;
    let totalExpense = 0n;

    let text =
        `📊 ${period.title}\n`;

    if (!period.isAll) {
        text +=
            `📅 ${formatDateRange(
                period.startDate,
                period.endDate
            )}\n`;
    }

    text += "\n";

    const buttons = [];

    buttons.push([
        Markup.button.callback(
            "💸 Все расходы",
            `report_expenses_${periodKey}`
        ),
    ]);

    if (
        projects.length === 0
    ) {
        text +=
            "Проектов пока нет.";
    }

    for (
        const project
        of projects
        ) {
        const totals =
            await getProjectTotals(
                project.id,
                period.startDate,
                period.endDate,
                project.revenueMode
            );

        totalIncome +=
            totals.income;

        totalExpense +=
            totals.expense;

        text +=
            `🏢 ${project.name}\n` +
            `Доход: ${formatKopecks(
                totals.income
            )}\n` +
            `Расходы: ${formatKopecks(
                totals.expense
            )}\n` +
            `Результат: ${formatKopecks(
                totals.result
            )}`;

        /*
         * Статус закрытия показываем
         * только для одного дня.
         */
        if (
            period.startDate ===
            period.endDate &&
            project.revenueMode ===
            "daily_close"
        ) {
            const closure =
                await getClosureStatus(
                    project.id,
                    period.startDate
                );

            text += closure
                ? "\n✅ День закрыт"
                : "\n🔴 День не закрыт";
        }

        text += "\n\n";

        buttons.push([
            Markup.button.callback(
                `📊 ${project.name}`,
                `report_project_${periodKey}_${project.id}`
            ),
        ]);
    }

    const totalResult =
        totalIncome -
        totalExpense;

    text +=
        `──────────────\n` +
        `ВСЕ ПРОЕКТЫ\n\n` +
        `💰 Доход: ${formatKopecks(
            totalIncome
        )}\n` +
        `➖ Расходы: ${formatKopecks(
            totalExpense
        )}\n` +
        `📈 Результат: ${formatKopecks(
            totalResult
        )}`;

    buttons.push([
        Markup.button.callback(
            "⬅️ Другой период",
            "reports_menu"
        ),
    ]);

    if (edit) {
        await ctx.editMessageText(
            text,
            Markup.inlineKeyboard(
                buttons
            )
        );

        return;
    }

    await ctx.reply(
        text,
        Markup.inlineKeyboard(
            buttons
        )
    );
}

async function showAllExpenses(
    ctx,
    periodKey
) {
    const period =
        getReportPeriod(
            periodKey
        );

    const projects =
        await getProjectsForUser(
            ctx.state.user
        );

    const categoriesMap =
        new Map();

    const projectRows = [];

    let grandTotal = 0n;

    for (
        const project
        of projects
        ) {
        const rows =
            await getExpenseByCategory(
                project.id,
                period.startDate,
                period.endDate
            );

        let projectTotal = 0n;

        for (
            const row
            of rows
            ) {
            const amount =
                BigInt(
                    row.amount
                );

            projectTotal +=
                amount;

            grandTotal +=
                amount;

            /*
             * Одинаковые названия статей
             * объединяем даже между
             * разными проектами.
             */
            const normalizedName =
                String(
                    row.name
                )
                    .trim()
                    .toLocaleLowerCase(
                        "ru-RU"
                    );

            const existing =
                categoriesMap.get(
                    normalizedName
                );

            if (existing) {
                existing.amount +=
                    amount;
            } else {
                categoriesMap.set(
                    normalizedName,
                    {
                        name:
                        row.name,

                        amount,
                    }
                );
            }
        }

        if (
            projectTotal > 0n
        ) {
            projectRows.push({
                name:
                project.name,

                amount:
                projectTotal,
            });
        }
    }

    const categoryRows =
        Array.from(
            categoriesMap.values()
        ).sort(
            (a, b) =>
                a.amount >
                b.amount
                    ? -1
                    : a.amount <
                    b.amount
                        ? 1
                        : 0
        );

    projectRows.sort(
        (a, b) =>
            a.amount >
            b.amount
                ? -1
                : a.amount <
                b.amount
                    ? 1
                    : 0
    );

    let text =
        `💸 ВСЕ РАСХОДЫ\n` +
        `📅 ${period.title}\n`;

    if (!period.isAll) {
        text +=
            `${formatDateRange(
                period.startDate,
                period.endDate
            )}\n`;
    }

    text += "\n";

    if (
        categoryRows.length ===
        0
    ) {
        text +=
            `Расходов за этот период нет.`;
    } else {
        text +=
            `📦 ПО СТАТЬЯМ\n`;

        for (
            const row
            of categoryRows
            ) {
            text +=
                `${row.name} — ` +
                `${formatKopecks(
                    row.amount
                )}\n`;
        }

        text +=
            `\n🏢 ПО ПРОЕКТАМ\n`;

        for (
            const row
            of projectRows
            ) {
            text +=
                `${row.name} — ` +
                `${formatKopecks(
                    row.amount
                )}\n`;
        }

        text +=
            `\n──────────────\n` +
            `💸 Всего расходов: ` +
            `${formatKopecks(
                grandTotal
            )}`;
    }

    await ctx.editMessageText(
        text,
        Markup.inlineKeyboard([
            [
                Markup.button.callback(
                    "⬅️ К отчёту",
                    `report_${periodKey}`
                ),
            ],
            [
                Markup.button.callback(
                    "📅 Другой период",
                    "reports_menu"
                ),
            ],
        ])
    );
}

/*
 * Детальный отчёт проекта
 */

async function showProjectReport(
    ctx,
    periodKey,
    projectId
) {
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

    const period =
        getReportPeriod(
            periodKey
        );

    const [
        totals,
        paymentMethods,
        incomeCategories,
        expenseCategories,
    ] =
        await Promise.all([
            getProjectTotals(
                project.id,
                period.startDate,
                period.endDate,
                project.revenueMode
            ),

            getIncomeByPaymentMethod(
                project.id,
                period.startDate,
                period.endDate
            ),

            getIncomeByCategory(
                project.id,
                period.startDate,
                period.endDate
            ),

            getExpenseByCategory(
                project.id,
                period.startDate,
                period.endDate
            ),
        ]);

    let text =
        `📊 ${project.name}\n` +
        `📅 ${period.title}\n`;

    if (!period.isAll) {
        text +=
            `${formatDateRange(
                period.startDate,
                period.endDate
            )}\n`;
    }

    text += "\n";

    /*
 * Доход / выручка
 *
 * daily_close:
 * показываем именно ВЫРУЧКУ
 * и разбивку по каналам.
 *
 * direct:
 * показываем ДОХОДЫ
 * по статьям.
 *
 * Если поступлений нет —
 * пустой блок вообще не выводим.
 */

    if (totals.income > 0n) {
        if (
            project.revenueMode ===
            "daily_close"
        ) {
            text +=
                `💰 ВЫРУЧКА\n`;

            if (
                paymentMethods.length >
                0
            ) {
                for (
                    const row
                    of paymentMethods
                    ) {
                    text +=
                        `${row.name} — ` +
                        `${formatKopecks(
                            row.amount
                        )}\n`;
                }
            }

            if (
                totals
                    .revenueSpentFromClosedDays >
                0n
            ) {
                text +=
                    `+ Потрачено из выручки — ` +
                    `${formatKopecks(
                        totals
                            .revenueSpentFromClosedDays
                    )}\n`;
            }

            text +=
                `\nВсего выручка: ` +
                `${formatKopecks(
                    totals.income
                )}\n`;
        } else {
            text +=
                `💰 ДОХОДЫ\n`;

            for (
                const row
                of incomeCategories
                ) {
                text +=
                    `${row.name} — ` +
                    `${formatKopecks(
                        row.amount
                    )}\n`;
            }

            text +=
                `\nВсего доход: ` +
                `${formatKopecks(
                    totals.income
                )}\n`;

            if (
                paymentMethods.length >
                0
            ) {
                text +=
                    `\n💳 ПО КАНАЛАМ\n`;

                for (
                    const row
                    of paymentMethods
                    ) {
                    text +=
                        `${row.name} — ` +
                        `${formatKopecks(
                            row.amount
                        )}\n`;
                }
            }
        }

        text += "\n";
    }
    /*
 * Расходы
 */

    text +=
        "\n➖ РАСХОДЫ\n";

    if (
        expenseCategories.length ===
        0
    ) {
        text +=
            "Расходов нет.\n";
    } else if (
        project
            .trackTodayRevenueSource
    ) {
        const todayRevenueExpenses =
            expenseCategories.filter(
                (row) =>
                    row.source ===
                    "today_revenue"
            );

        const otherExpenses =
            expenseCategories.filter(
                (row) =>
                    row.source ===
                    "other"
            );

        const unknownExpenses =
            expenseCategories.filter(
                (row) =>
                    row.source ===
                    "unknown"
            );

        text +=
            "\n➖ РАСХОДЫ\n";

        if (
            expenseCategories.length === 0
        ) {
            text +=
                "Расходов нет.\n";
        } else {
            /*
             * Дополнительно объединяем статьи
             * с одинаковыми названиями.
             *
             * Это защитит даже от ситуации,
             * если в БД случайно существуют
             * две категории "Сметана"
             * с разными id.
             */
            const expenseMap =
                new Map();

            for (
                const row
                of expenseCategories
                ) {
                const normalizedName =
                    String(
                        row.name ||
                        "Без статьи"
                    )
                        .trim()
                        .toLocaleLowerCase(
                            "ru-RU"
                        );

                const existing =
                    expenseMap.get(
                        normalizedName
                    );

                if (existing) {
                    existing.amount +=
                        BigInt(
                            row.amount
                        );
                } else {
                    expenseMap.set(
                        normalizedName,
                        {
                            name:
                                row.name ||
                                "Без статьи",

                            amount:
                                BigInt(
                                    row.amount
                                ),
                        }
                    );
                }
            }

            const mergedExpenses =
                Array.from(
                    expenseMap.values()
                ).sort(
                    (a, b) =>
                        a.amount >
                        b.amount
                            ? -1
                            : a.amount <
                            b.amount
                                ? 1
                                : 0
                );

            for (
                const row
                of mergedExpenses
                ) {
                text +=
                    `${row.name} — ` +
                    `${formatKopecks(
                        row.amount
                    )}\n`;
            }
        }

        text +=
            `\nВсего расходов: ` +
            `${formatKopecks(
                totals.expense
            )}`;

    if (
        totals.income > 0n ||
        totals.expense > 0n
    ) {
        text +=
            `\n\n──────────────\n` +
            `📈 Финансовый результат: ` +
            `${formatKopecks(
                totals.result
            )}`;
    }

    /*
     * Статус дня
     */

    if (
        period.startDate ===
        period.endDate &&
        project.revenueMode ===
        "daily_close"
    ) {
        const closure =
            await getClosureStatus(
                project.id,
                period.startDate
            );

        text += closure
            ? "\n\n✅ День закрыт"
            : "\n\n🔴 День не закрыт";
    }

    await ctx.editMessageText(
        text,
        Markup.inlineKeyboard([
            [
                Markup.button.callback(
                    "⬅️ Все проекты",
                    `report_${periodKey}`
                ),
            ],
            [
                Markup.button.callback(
                    "📅 Другой период",
                    "reports_menu"
                ),
            ],
        ])
    );
}

/*
 * Регистрация обработчиков
 */

function registerReportHandlers(
    bot
) {
    bot.hears(
        "📊 Отчёты",
        async (ctx) => {
            await showReportsMenu(
                ctx
            );
        }
    );

    bot.action(
        "reports_menu",
        async (ctx) => {
            await ctx.answerCbQuery();

            await showReportsMenu(
                ctx,
                true
            );
        }
    );

    bot.action(
        /^report_(today|yesterday|7d|month|all)$/,
        async (ctx) => {
            await ctx.answerCbQuery();

            await showPeriodReport(
                ctx,
                ctx.match[1],
                true
            );
        }
    );

    bot.action(
        /^report_expenses_(today|yesterday|7d|month|all)$/,
        async (ctx) => {
            await ctx.answerCbQuery();

            await showAllExpenses(
                ctx,
                ctx.match[1]
            );
        }
    );

    bot.action(
        /^report_project_(today|yesterday|7d|month|all)_(\d+)$/,
        async (ctx) => {
            await ctx.answerCbQuery();

            await showProjectReport(
                ctx,
                ctx.match[1],
                Number(
                    ctx.match[2]
                )
            );
        }
    );
}

module.exports = {
    registerReportHandlers,
};