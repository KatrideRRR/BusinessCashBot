const {
    Op,
} = require("sequelize");

const {
    Category,
    Project,
} = require("../models");

function getCampFoodProjectIds() {
    return [
        Number(
            process.env
                .CAMPFOOD_BALAKLAVSKAYA_PROJECT_ID ||
            8
        ),

        Number(
            process.env
                .CAMPFOOD_ADALET_PROJECT_ID ||
            9
        ),
    ];
}

async function getCampFoodProjects() {
    const projectIds =
        getCampFoodProjectIds();

    return Project.findAll({
        where: {
            id: {
                [Op.in]:
                projectIds,
            },

            isActive:
                true,
        },

        order: [
            ["id", "ASC"],
        ],
    });
}

async function getSharedExpenseCategories() {
    const rows =
        await Category.findAll({
            where: {
                projectId: {
                    [Op.in]:
                        getCampFoodProjectIds(),
                },

                type:
                    "expense",

                isActive:
                    true,
            },

            order: [
                ["name", "ASC"],
            ],
        });

    /*
     * У двух точек могут существовать
     * одинаковые статьи с разными ID.
     *
     * Пользователю показываем название
     * только один раз.
     */
    const map =
        new Map();

    for (const row of rows) {
        const key =
            String(
                row.name
            )
                .trim()
                .toLowerCase();

        if (
            key &&
            !map.has(key)
        ) {
            map.set(
                key,
                row
            );
        }
    }

    return Array.from(
        map.values()
    );
}

async function ensureSharedExpenseCategory(
    name,
    createdBy
) {
    const projectIds =
        getCampFoodProjectIds();

    let firstCategory =
        null;

    for (
        const projectId
        of projectIds
        ) {
        let category =
            await Category.findOne({
                where: {
                    projectId,
                    type:
                        "expense",
                    name,
                },
            });

        if (category) {
            if (
                !category.isActive
            ) {
                await category.update({
                    isActive:
                        true,
                });
            }
        } else {
            category =
                await Category.create({
                    projectId,
                    type:
                        "expense",
                    name,
                    isActive:
                        true,
                    createdBy,
                });
        }

        if (!firstCategory) {
            firstCategory =
                category;
        }
    }

    return firstCategory;
}

module.exports = {
    getCampFoodProjectIds,
    getCampFoodProjects,
    getSharedExpenseCategories,
    ensureSharedExpenseCategory,
};