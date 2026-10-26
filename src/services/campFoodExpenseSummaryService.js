
const { Op } = require("sequelize");

const {
    Transaction,
    Category,
    CampFoodSharedExpense,
} = require("../models");

const {
    getCampFoodProjectIds,
} = require("./campFoodSharedExpenseService");

async function getCampFoodExpenseSummary(
    startDate,
    endDate
) {
    const projectIds = getCampFoodProjectIds();

    // Расходы конкретных точек:
    // аренда, зарплаты и другие прямые расходы.
    const [directRows, sharedRows] = await Promise.all([
        Transaction.findAll({
            attributes: [
                "amountKopecks",
                "fundSource",
            ],
            where: {
                projectId: {
                    [Op.in]: projectIds,
                },
                type: "expense",
                businessDate: {
                    [Op.between]: [startDate, endDate],
                },
            },
            include: [{
                model: Category,
                as: "category",
                attributes: ["name"],
                required: false,
            }],
        }),

        // Все общие расходы, в том числе
        // уже распределённые между точками.
        CampFoodSharedExpense.findAll({
            attributes: [
                "categoryName",
                "amountKopecks",
                "fundSource",
            ],
            where: {
                businessDate: {
                    [Op.between]: [startDate, endDate],
                },
            },
        }),
    ]);

    const categories = new Map();

    let total = 0n;
    let todayRevenueTotal = 0n;
    let otherTotal = 0n;
    let unknownTotal = 0n;

    function add(name, rawAmount, source) {
        const amount = BigInt(rawAmount || 0);

        const categoryName =
            String(name || "").trim() || "Без статьи";

        const key =
            categoryName.toLocaleLowerCase("ru-RU");

        total += amount;

        if (source === "today_revenue") {
            todayRevenueTotal += amount;
        } else if (source === "other") {
            otherTotal += amount;
        } else {
            unknownTotal += amount;
        }

        const existing = categories.get(key);

        if (existing) {
            existing.amount += amount;
        } else {
            categories.set(key, {
                name: categoryName,
                amount,
            });
        }
    }

    for (const row of directRows) {
        add(
            row.category?.name,
            row.amountKopecks,
            row.fundSource
        );
    }

    for (const row of sharedRows) {
        add(
            row.categoryName,
            row.amountKopecks,
            row.fundSource
        );
    }

    return {
        total,
        todayRevenueTotal,
        otherTotal,
        unknownTotal,
        rows: Array.from(categories.values())
            .sort((a, b) =>
                a.amount > b.amount ? -1 :
                    a.amount < b.amount ? 1 : 0
            ),
    };
}

module.exports = {
    getCampFoodExpenseSummary,
};
