const crypto = require("crypto");
const dayjs = require("dayjs");
const utc = require("dayjs/plugin/utc");
const timezone = require("dayjs/plugin/timezone");

const { Markup } = require("telegraf");
const { Op } = require("sequelize");

dayjs.extend(utc);
dayjs.extend(timezone);

const {
    Transaction,
    Category,
    CampFoodSharedExpense,
} = require("../../models");

const {
    getProjectsForUser,
} = require("../../services/projectService");

const {
    getCampFoodProjectIds,
} = require("../../services/campFoodSharedExpenseService");

const {
    getReportPeriod,
    formatDateRange,
} = require("../../utils/businessDate");

const {
    formatKopecks,
} = require("../../utils/money");

const CATEGORIES_PER_PAGE = 8;
const PAYMENTS_PER_PAGE = 10;

const PERIOD_PATTERN =
    "(today|yesterday|7d|month|all|custom)";

/*
 * Названия статей.
 */
function normalizeName(name) {
    return String(name || "Без статьи")
        .trim()
        .toLocaleLowerCase("ru-RU");
}

function categoryCode(name) {
    return crypto
        .createHash("sha256")
        .update(normalizeName(name))
        .digest("hex")
        .slice(0, 12);
}

/*
 * Период отчёта.
 */
function getPeriod(ctx, periodKey) {
    if (periodKey === "custom") {
        const saved =
            ctx.session?.reportCustomPeriod;

        if (
            !saved?.startDate ||
            !saved?.endDate
        ) {
            return null;
        }

        return {
            startDate: saved.startDate,
            endDate: saved.endDate,
        };
    }

    return getReportPeriod(periodKey);
}

function periodLabel(period, periodKey) {
    if (periodKey === "all") {
        return (
            "С начала учёта — " +
            dayjs(period.endDate).format(
                "DD.MM.YYYY"
            )
        );
    }

    return formatDateRange(
        period.startDate,
        period.endDate
    );
}

function formatCreatedAt(date) {
    if (!date) {
        return "—";
    }

    return dayjs(date)
        .tz(
            process.env.APP_TIMEZONE ||
            "Europe/Moscow"
        )
        .format("DD.MM.YYYY HH:mm");
}

/*
 * Загружаем реальные расходы.
 *
 * Используем существующие таблицы.
 * Никаких изменений в БД.
 */
async function loadExpenseRows(ctx, period) {
    const projects =
        await getProjectsForUser(
            ctx.state.user
        );

    const projectIds = projects.map(
        (project) => Number(project.id)
    );

    if (projectIds.length === 0) {
        return [];
    }

    const projectNames = new Map(
        projects.map((project) => [
            Number(project.id),
            project.name,
        ])
    );

    /*
     * Общие расходы CampFood
     * показываем владельцу или
     * пользователю с доступом
     * к обеим точкам.
     */
    const canViewShared =
        getCampFoodProjectIds().every(
            (id) =>
                projectIds.includes(
                    Number(id)
                )
        );

    const [directRows, sharedRows] =
        await Promise.all([
            Transaction.findAll({
                attributes: [
                    "id",
                    "projectId",
                    "businessDate",
                    "createdAt",
                    "amountKopecks",
                    "fundSource",
                ],

                where: {
                    projectId: {
                        [Op.in]: projectIds,
                    },

                    type: "expense",

                    businessDate: {
                        [Op.between]: [
                            period.startDate,
                            period.endDate,
                        ],
                    },
                },

                include: [{
                    model: Category,
                    as: "category",
                    attributes: ["name"],
                    required: false,
                }],
            }),

            canViewShared
                ? CampFoodSharedExpense.findAll({
                    attributes: [
                        "id",
                        "businessDate",
                        "createdAt",
                        "categoryName",
                        "amountKopecks",
                        "fundSource",
                        "paidFromProjectId",
                        "sourceTransactionId",
                    ],

                    where: {
                        businessDate: {
                            [Op.between]: [
                                period.startDate,
                                period.endDate,
                            ],
                        },
                    },
                })
                : [],
        ]);

    /*
     * Защита от повторного учёта
     * старых перенесённых расходов.
     */
    const migratedIds = new Set(
        sharedRows
            .map((row) =>
                Number(
                    row.sourceTransactionId || 0
                )
            )
            .filter(Boolean)
    );

    const direct = directRows
        .filter(
            (row) =>
                !migratedIds.has(
                    Number(row.id)
                )
        )
        .map((row) => ({
            key: normalizeName(
                row.category?.name
            ),

            name:
                row.category?.name ||
                "Без статьи",

            amount: BigInt(
                row.amountKopecks || 0
            ),

            businessDate:
                String(row.businessDate),

            createdAt: row.createdAt,

            fundSource: row.fundSource,

            place:
                projectNames.get(
                    Number(row.projectId)
                ) || "Проект",

            id: `t${row.id}`,
        }));

    const shared = sharedRows.map(
        (row) => {
            const cashPoint =
                row.paidFromProjectId
                    ? projectNames.get(
                        Number(
                            row.paidFromProjectId
                        )
                    )
                    : null;

            return {
                key: normalizeName(
                    row.categoryName
                ),

                name:
                    row.categoryName ||
                    "Без статьи",

                amount: BigInt(
                    row.amountKopecks || 0
                ),

                businessDate:
                    String(row.businessDate),

                createdAt: row.createdAt,

                fundSource: row.fundSource,

                place: cashPoint
                    ? `CampFood, касса: ${cashPoint}`
                    : "CampFood — общий расход",

                id: `s${row.id}`,
            };
        }
    );

    /*
     * Сначала новые платежи.
     */
    return [...direct, ...shared].sort(
        (a, b) =>
            b.businessDate.localeCompare(
                a.businessDate
            ) ||
            new Date(b.createdAt || 0) -
            new Date(a.createdAt || 0) ||
            b.id.localeCompare(a.id)
    );
}

/*
 * Группируем расходы по статьям.
 */
function getCategories(rows) {
    const categories = new Map();

    for (const row of rows) {
        let entry =
            categories.get(row.key);

        if (!entry) {
            entry = {
                name: row.name,
                key: row.key,
                total: 0n,
                count: 0,
            };

            categories.set(
                row.key,
                entry
            );
        }

        entry.total += row.amount;
        entry.count += 1;
    }

    return [...categories.values()].sort(
        (a, b) =>
            a.total === b.total
                ? a.name.localeCompare(
                    b.name,
                    "ru"
                )
                : a.total > b.total
                    ? -1
                    : 1
    );
}

/*
 * Переключение страниц.
 */
function navigation(
    prefix,
    current,
    maxPage
) {
    const buttons = [];

    if (current > 0) {
        buttons.push(
            Markup.button.callback(
                "◀️ Ранее",
                `${prefix}_${current - 1}`
            )
        );
    }

    if (current < maxPage) {
        buttons.push(
            Markup.button.callback(
                "Далее ▶️",
                `${prefix}_${current + 1}`
            )
        );
    }

    return buttons.length
        ? [buttons]
        : [];
}

/*
 * Список статей расходов.
 */
async function showCategories(
    ctx,
    periodKey,
    requestedPage
) {
    const period =
        getPeriod(ctx, periodKey);

    if (!period) {
        await ctx.reply(
            "Период не найден. Откройте отчёты заново."
        );
        return;
    }

    const categories = getCategories(
        await loadExpenseRows(ctx, period)
    );

    const maxPage = Math.max(
        0,
        Math.ceil(
            categories.length /
            CATEGORIES_PER_PAGE
        ) - 1
    );

    const page = Math.min(
        Math.max(
            Number(requestedPage) || 0,
            0
        ),
        maxPage
    );

    const buttons = categories
        .slice(
            page * CATEGORIES_PER_PAGE,
            (page + 1) *
            CATEGORIES_PER_PAGE
        )
        .map((category) => [
            Markup.button.callback(
                `${category.name.slice(0, 30)} — ` +
                formatKopecks(
                    category.total
                ),

                `expense_hist_item_${periodKey}_` +
                `${categoryCode(category.name)}_0`
            ),
        ]);

    buttons.push(
        ...navigation(
            `expense_hist_cats_${periodKey}`,
            page,
            maxPage
        )
    );

    buttons.push([
        Markup.button.callback(
            "⬅️ Все расходы",
            `report_expenses_${periodKey}`
        ),
    ]);

    const text =
        "🧾 ИСТОРИЯ ОПЛАТ\n" +
        `📅 ${periodLabel(
            period,
            periodKey
        )}\n\n` +
        (
            categories.length
                ? "Выберите статью расходов:\n" +
                `Страница ${page + 1} из ${maxPage + 1}`
                : "За этот период расходов нет."
        );

    await ctx.editMessageText(
        text,
        Markup.inlineKeyboard(buttons)
    );
}

/*
 * История конкретной статьи.
 */
async function showPayments(
    ctx,
    periodKey,
    categoryId,
    requestedPage
) {
    const period =
        getPeriod(ctx, periodKey);

    if (!period) {
        await ctx.reply(
            "Период не найден. Откройте отчёты заново."
        );
        return;
    }

    const rows =
        await loadExpenseRows(ctx, period);

    const category =
        getCategories(rows).find(
            (item) =>
                categoryCode(
                    item.name
                ) === categoryId
        );

    if (!category) {
        await ctx.reply(
            "Статья не найдена."
        );
        return;
    }

    const payments = rows.filter(
        (row) =>
            row.key === category.key
    );

    const maxPage = Math.max(
        0,
        Math.ceil(
            payments.length /
            PAYMENTS_PER_PAGE
        ) - 1
    );

    const page = Math.min(
        Math.max(
            Number(requestedPage) || 0,
            0
        ),
        maxPage
    );

    const current = payments.slice(
        page * PAYMENTS_PER_PAGE,
        (page + 1) * PAYMENTS_PER_PAGE
    );

    const lines = current.map(
        (row) => {
            const source =
                row.fundSource ===
                "today_revenue"
                    ? "Из выручки"
                    : row.fundSource ===
                    "other"
                        ? "Из других денег"
                        : "Источник не указан";

            const date = dayjs(
                row.businessDate
            ).format("DD.MM.YYYY");

            return (
                `${date} — ` +
                `${formatKopecks(row.amount)}\n` +
                `📍 ${row.place}\n` +
                `💳 ${source}\n` +
                `🕐 Записано: ` +
                formatCreatedAt(
                    row.createdAt
                )
            );
        }
    );

    const text =
        `🧾 ${category.name.toUpperCase()}\n` +
        `📅 ${periodLabel(
            period,
            periodKey
        )}\n\n` +
        lines.join("\n\n") +
        "\n\n━━━━━━━━━━━━━━\n" +
        `Всего за период: ` +
        `${formatKopecks(category.total)}\n` +
        `Количество оплат: ${category.count}\n` +
        `Страница ${page + 1} из ${maxPage + 1}`;

    const buttons = navigation(
        `expense_hist_item_${periodKey}_${categoryId}`,
        page,
        maxPage
    );

    buttons.push([
        Markup.button.callback(
            "⬅️ К статьям",
            `expense_hist_cats_${periodKey}_0`
        ),
    ]);

    await ctx.editMessageText(
        text,
        Markup.inlineKeyboard(buttons)
    );
}

/*
 * Telegram-обработчики.
 */
function registerExpenseHistoryHandlers(bot) {
    bot.action(
        new RegExp(
            `^expense_hist_cats_${PERIOD_PATTERN}_(\\d+)$`
        ),

        async (ctx) => {
            await ctx.answerCbQuery();

            await showCategories(
                ctx,
                ctx.match[1],
                ctx.match[2]
            );
        }
    );

    bot.action(
        new RegExp(
            `^expense_hist_item_${PERIOD_PATTERN}_([0-9a-f]{12})_(\\d+)$`
        ),

        async (ctx) => {
            await ctx.answerCbQuery();

            await showPayments(
                ctx,
                ctx.match[1],
                ctx.match[2],
                ctx.match[3]
            );
        }
    );
}

module.exports = {
    registerExpenseHistoryHandlers,
};