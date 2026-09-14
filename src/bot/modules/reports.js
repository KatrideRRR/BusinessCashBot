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
    getExpenseByCategoryAndSource,
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
        `📊 ${period.title}\n` +
        `📅 ${formatDateRange(
            period.startDate,
            period.endDate
        )}\n\n`;

    const buttons = [];

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
                period.endDate
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
                period.endDate
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

            project
                .trackTodayRevenueSource
                ? getExpenseByCategoryAndSource(
                    project.id,
                    period.startDate,
                    period.endDate
                )
                : getExpenseByCategory(
                    project.id,
                    period.startDate,
                    period.endDate
                ),
        ]);

    let text =
        `📊 ${project.name}\n` +
        `📅 ${period.title}\n` +
        `${formatDateRange(
            period.startDate,
            period.endDate
        )}\n\n`;

    /*
     * Доходы
     */

    text +=
        `💰 ДОХОДЫ\n`;

    if (
        incomeCategories.length ===
        0
    ) {
        text +=
            "Доходов нет.\n";
    } else {
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
    }

    text +=
        `\nВсего доход: ` +
        `${formatKopecks(
            totals.income
        )}`;

    /*
     * Каналы
     */

    if (
        paymentMethods.length >
        0
    ) {
        text +=
            "\n\n💳 ПО КАНАЛАМ\n";

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
            "\n💰 Из сегодняшней выручки\n";

        if (
            todayRevenueExpenses
                .length === 0
        ) {
            text +=
                "Нет расходов.\n";
        } else {
            for (
                const row
                of todayRevenueExpenses
                ) {
                text +=
                    `${row.name} — ` +
                    `${formatKopecks(
                        row.amount
                    )}\n`;
            }
        }

        text +=
            "\n🏦 Из других денег\n";

        if (
            otherExpenses.length ===
            0
        ) {
            text +=
                "Нет расходов.\n";
        } else {
            for (
                const row
                of otherExpenses
                ) {
                text +=
                    `${row.name} — ` +
                    `${formatKopecks(
                        row.amount
                    )}\n`;
            }
        }

        if (
            unknownExpenses.length >
            0
        ) {
            text +=
                "\n⚪ Источник не указан\n";

            for (
                const row
                of unknownExpenses
                ) {
                text +=
                    `${row.name} — ` +
                    `${formatKopecks(
                        row.amount
                    )}\n`;
            }
        }
    } else {
        for (
            const row
            of expenseCategories
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
        /^report_(today|yesterday|7d|month)$/,
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
        /^report_project_(today|yesterday|7d|month)_(\d+)$/,
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