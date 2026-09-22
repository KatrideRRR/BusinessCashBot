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
    getPendingCampFoodExpenseSummary,
    getCampFoodCashExpenseSummary,
    getFirstActivityDate,
} = require(
    "../../services/reportService"
);

const {
    getCampFoodProjectIds,
} = require(
    "../../services/campFoodSharedExpenseService"
);
const dayjs =
    require("dayjs");

const {
    getReportPeriod,
    formatDateRange,
    getBusinessDate,
} = require(
    "../../utils/businessDate"
);

const {
    formatKopecks,
} = require(
    "../../utils/money"
);

function parseReportDate(
    value
) {
    const match =
        String(value || "")
            .trim()
            .match(
                /^(\d{2})\.(\d{2})\.(\d{4})$/
            );

    if (!match) {
        return null;
    }

    const [
        ,
        day,
        month,
        year,
    ] = match;

    const iso =
        `${year}-${month}-${day}`;

    const parsed =
        dayjs(iso);

    if (
        !parsed.isValid() ||
        parsed.format(
            "YYYY-MM-DD"
        ) !== iso
    ) {
        return null;
    }

    return iso;
}

function resolveReportPeriod(
    ctx,
    periodKey
) {
    if (
        periodKey !==
        "custom"
    ) {
        return getReportPeriod(
            periodKey
        );
    }

    const period =
        ctx.session
            ?.reportCustomPeriod;

    if (!period) {
        return null;
    }

    return {
        startDate:
        period.startDate,

        endDate:
        period.endDate,

        title:
            "Произвольный период",

        isCustom:
            true,
    };
}

function getPeriodDisplay(
    period
) {
    if (
        period.isAll
    ) {
        return (
            "С начала учёта — " +
            dayjs(
                period.endDate
            ).format(
                "DD.MM.YYYY"
            )
        );
    }

    return formatDateRange(
        period.startDate,
        period.endDate
    );
}

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
                    "🗓 Свой период",
                    "report_custom_start"
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
        resolveReportPeriod(
            ctx,
            periodKey
        );

    if (!period) {
        await ctx.reply(
            "Период больше не выбран. Откройте отчёты заново."
        );

        return;
    }

    const firstActivityDate =
        periodKey === "all"
            ? await getFirstActivityDate(
                projects.map(
                    (project) =>
                        Number(
                            project.id
                        )
                )
            )
            : null;

    const projects =
        await getProjectsForUser(
            ctx.state.user
        );

    const campFoodProjectIds =
        getCampFoodProjectIds();

    const isToday =
        period.startDate ===
        getBusinessDate() &&
        period.endDate ===
        getBusinessDate();

    const hasCampFood =
        projects.some(
            (project) =>
                campFoodProjectIds.includes(
                    Number(
                        project.id
                    )
                )
        );

    const pendingCampFood =
        hasCampFood
            ? await getPendingCampFoodExpenseSummary(
                period.startDate,
                period.endDate
            )
            : {
                total:
                    0n,
                todayRevenueTotal:
                    0n,
                otherTotal:
                    0n,
                rows:
                    [],
                otherRows:
                    [],
            };

    let totalIncome = 0n;
    let totalExpense = 0n;

    let text =
        `📊 ${period.title}\n`;

    if (
        periodKey === "all" &&
        firstActivityDate
    ) {
        text +=
            `📅 ${formatDateRange(
                firstActivityDate,
                period.endDate
            )}\n` +
            `🚀 Первая операция: ` +
            `${dayjs(
                firstActivityDate
            ).format(
                "DD.MM.YYYY"
            )}\n`;
    } else {
        text +=
            `📅 ${getPeriodDisplay(
                period
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

        const isCampFoodProject =
            campFoodProjectIds.includes(
                Number(
                    project.id
                )
            );

        if (
            isToday &&
            isCampFoodProject &&
            pendingCampFood.total > 0n
        ) {
            const cashExpenses =
                await getCampFoodCashExpenseSummary(
                    project.id,
                    period.startDate,
                    period.endDate
                );

            const cashBalance =
                totals.income -
                cashExpenses.total;

            text +=
                `🏢 ${project.name}\n` +
                `💰 Выручка сейчас: ${formatKopecks(
                    totals.income
                )}\n` +
                `💵 Из кассы сегодня: ${formatKopecks(
                    cashExpenses.total
                )}\n` +
                `💳 Остаток кассы: ${formatKopecks(
                    cashBalance
                )}\n` +
                `➖ Расходы точки: ⏳ после закрытия`;
        } else {
            text +=
                `🏢 ${project.name}\n` +
                `${
                    project.revenueMode ===
                    "daily_close"
                        ? "💰 Выручка"
                        : "💰 Доход"
                }: ${formatKopecks(
                    totals.income
                )}\n` +
                `➖ Расходы: ${formatKopecks(
                    totals.expense
                )}\n` +
                `📈 Результат: ${formatKopecks(
                    totals.result
                )}`;
        }

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

    /*
 * Нераспределённые расходы CampFood
 * ещё не входят в расходы конкретных
 * точек, поэтому добавляем их ОДИН раз
 * только в общий итог.
 */
    if (
        pendingCampFood.total > 0n
    ) {
        totalExpense +=
            pendingCampFood.total;

        text +=
            `🍔 ОБЩИЕ РАСХОДЫ CAMPFOOD\n`;

        for (
            const row
            of pendingCampFood.rows
            ) {
            text +=
                `${row.name} — ` +
                `${formatKopecks(
                    row.amount
                )}\n`;
        }

        text +=
            `\n💵 Из дневной выручки: ` +
            `${formatKopecks(
                pendingCampFood
                    .todayRevenueTotal
            )}\n` +

            `🏦 Из других денег: ` +
            `${formatKopecks(
                pendingCampFood
                    .otherTotal
            )}\n` +

            `➖ Всего расходов CampFood: ` +
            `${formatKopecks(
                pendingCampFood.total
            )}\n\n` +

            `⏳ Пока не распределены между точками.\n\n`;
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
        `${
            pendingCampFood.total > 0n
                ? "📊 Предварительный результат"
                : "📈 Результат"
        }: ${formatKopecks(
            totalResult
        )}`

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
        resolveReportPeriod(
            ctx,
            periodKey
        );

    if (!period) {
        await ctx.reply(
            "Период больше не выбран. Откройте отчёты заново."
        );

        return;
    }

    const projects =
        await getProjectsForUser(
            ctx.state.user
        );

    const campFoodProjectIds =
        getCampFoodProjectIds();

    const hasCampFood =
        projects.some(
            (project) =>
                campFoodProjectIds.includes(
                    Number(
                        project.id
                    )
                )
        );

    const pendingCampFood =
        hasCampFood
            ? await getPendingCampFoodExpenseSummary(
                period.startDate,
                period.endDate
            )
            : {
                total:
                    0n,
                todayRevenueTotal:
                    0n,
                otherTotal:
                    0n,
                rows:
                    [],
            };

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

    /*
 * Незакрытые общие расходы CampFood
 * добавляем сюда один раз.
 */
    if (
        pendingCampFood.total > 0n
    ) {
        for (
            const row
            of pendingCampFood.rows
            ) {
            const amount =
                BigInt(
                    row.amount
                );

            grandTotal +=
                amount;

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

        projectRows.push({
            name:
                "CampFood — общие расходы",

            amount:
            pendingCampFood.total,
        });
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
        `📅 ${getPeriodDisplay(
            period
        )}\n`;

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

        if (
            pendingCampFood.total > 0n
        ) {
            text +=
                `\n\n🍔 Текущие расходы CampFood\n` +
                `💵 Из дневной выручки — ` +
                `${formatKopecks(
                    pendingCampFood
                        .todayRevenueTotal
                )}\n` +
                `🏦 Из других денег — ` +
                `${formatKopecks(
                    pendingCampFood
                        .otherTotal
                )}\n` +
                `⏳ Распределение между точками ещё не завершено.`;
        }

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
        resolveReportPeriod(
            ctx,
            periodKey
        );

    if (!period) {
        await ctx.reply(
            "Период больше не выбран. Откройте отчёты заново."
        );

        return;
    }

    const campFoodProjectIds =
        getCampFoodProjectIds();

    const isCampFood =
        campFoodProjectIds.includes(
            Number(
                project.id
            )
        );

    const isToday =
        period.startDate ===
        getBusinessDate() &&
        period.endDate ===
        getBusinessDate();

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

    const pendingCampFood =
        isCampFood && isToday
            ? await getPendingCampFoodExpenseSummary(
                period.startDate,
                period.endDate
            )
            : {
                total:
                    0n,
                todayRevenueTotal:
                    0n,
                otherTotal:
                    0n,
                rows:
                    [],
                otherRows:
                    [],
            };

    const cashExpenses =
        isCampFood && isToday
            ? await getCampFoodCashExpenseSummary(
                project.id,
                period.startDate,
                period.endDate
            )
            : {
                total:
                    0n,
                rows:
                    [],
            };

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
    *
    * В отчётах источник денег не важен.
    * Объединяем одинаковые статьи
    * независимо от fund_source и categoryId.
    */

    if (
        isCampFood &&
        isToday &&
        pendingCampFood.total > 0n
    ) {
        text +=
            `\n➖ РАСХОДЫ СЕГОДНЯ\n`;

        /*
         * Деньги, которые реально
         * вышли из кассы ЭТОЙ точки.
         */
        text +=
            `\n💵 ИЗ СЕГОДНЯШНЕЙ ВЫРУЧКИ\n`;

        if (
            cashExpenses.rows.length ===
            0
        ) {
            text +=
                `Из кассы расходов не было.\n`;
        } else {
            for (
                const row
                of cashExpenses.rows
                ) {
                text +=
                    `${row.name} — ` +
                    `${formatKopecks(
                        row.amount
                    )}\n`;
            }
        }

        text +=
            `Всего из кассы: ` +
            `${formatKopecks(
                cashExpenses.total
            )}\n`;

        /*
         * Общие расходы CampFood,
         * оплаченные не из кассы смены.
         */
        if (
            pendingCampFood.otherTotal >
            0n
        ) {
            text +=
                `\n🏦 ИЗ ДРУГИХ ДЕНЕГ — ОБЩИЕ CAMPFOOD\n`;

            for (
                const row
                of pendingCampFood
                .otherRows
                ) {
                text +=
                    `${row.name} — ` +
                    `${formatKopecks(
                        row.amount
                    )}\n`;
            }

            text +=
                `Всего из других денег: ` +
                `${formatKopecks(
                    pendingCampFood
                        .otherTotal
                )}\n`;
        }

        text +=
            `\nℹ️ Окончательная доля расходов этой точки ` +
            `будет рассчитана после закрытия обеих смен.`;

        const cashBalance =
            totals.income -
            cashExpenses.total;

        text +=
            `\n\n──────────────\n` +
            `💰 Выручка сейчас: ${formatKopecks(
                totals.income
            )}\n` +
            `💵 Потрачено из кассы: ${formatKopecks(
                cashExpenses.total
            )}\n` +
            `💳 Остаток дневной выручки: ${formatKopecks(
                cashBalance
            )}\n\n` +
            `⏳ Финансовый результат точки будет ` +
            `определён после закрытия обеих смен.`;
    } else {

        text +=
            "\n➖ РАСХОДЫ\n";

        if (
            expenseCategories.length === 0
        ) {
            text +=
                "Расходов нет.\n";
        } else {
            const expenseMap =
                new Map();

            for (
                const row
                of expenseCategories
                ) {
                const displayName =
                    String(
                        row.name ||
                        "Без статьи"
                    ).trim();

                const normalizedName =
                    displayName
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
                            displayName,

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
        "report_custom_start",
        async (ctx) => {
            await ctx.answerCbQuery();

            ctx.session
                .reportCustomInput = {
                step:
                    "start",
            };

            await ctx.reply(
                "🗓 Произвольный период\n\n" +
                "Введите дату НАЧАЛА периода:\n\n" +
                "Например: 01.09.2026",
                Markup.inlineKeyboard([
                    [
                        Markup.button.callback(
                            "❌ Отмена",
                            "report_custom_cancel"
                        ),
                    ],
                ])
            );
        }
    );

    bot.action(
        "report_custom_cancel",
        async (ctx) => {
            await ctx.answerCbQuery();

            delete ctx.session
                .reportCustomInput;

            await showReportsMenu(
                ctx,
                true
            );
        }
    );

    bot.action(
        /^report_(today|yesterday|7d|month|all|custom)$/,
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
        /^report_expenses_(today|yesterday|7d|month|all|custom)$/,
        async (ctx) => {
            await ctx.answerCbQuery();

            await showAllExpenses(
                ctx,
                ctx.match[1]
            );
        }
    );

    bot.action(
        /^report_project_(today|yesterday|7d|month|all|custom)_(\d+)$/,
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

    bot.on(
        "text",
        async (
            ctx,
            next
        ) => {
            const input =
                ctx.session
                    ?.reportCustomInput;

            if (!input) {
                return next();
            }

            const value =
                ctx.message
                    ?.text
                    ?.trim();

            const date =
                parseReportDate(
                    value
                );

            if (!date) {
                await ctx.reply(
                    "Не удалось понять дату.\n\n" +
                    "Введите в формате:\n" +
                    "01.09.2026"
                );

                return;
            }

            if (
                input.step ===
                "start"
            ) {
                input.startDate =
                    date;

                input.step =
                    "end";

                await ctx.reply(
                    "Теперь введите дату ОКОНЧАНИЯ периода:\n\n" +
                    "Например: 18.09.2026"
                );

                return;
            }

            if (
                input.step ===
                "end"
            ) {
                if (
                    date <
                    input.startDate
                ) {
                    await ctx.reply(
                        "Дата окончания не может быть раньше даты начала.\n\n" +
                        "Введите дату окончания ещё раз:"
                    );

                    return;
                }

                ctx.session
                    .reportCustomPeriod = {
                    startDate:
                    input.startDate,

                    endDate:
                    date,
                };

                delete ctx.session
                    .reportCustomInput;

                await showPeriodReport(
                    ctx,
                    "custom",
                    false
                );

                return;
            }

            delete ctx.session
                .reportCustomInput;

            return next();
        }
    );

}

module.exports = {
    registerReportHandlers,
};