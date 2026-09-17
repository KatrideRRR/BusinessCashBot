const {
    DataTypes,
} = require("sequelize");

const sequelize =
    require("../config/database");

const CampFoodExpenseAllocation =
    sequelize.define(
        "campfood_expense_allocations",
        {
            id: {
                type:
                DataTypes.INTEGER.UNSIGNED,
                autoIncrement: true,
                primaryKey: true,
            },

            sharedExpenseId: {
                type:
                DataTypes.INTEGER.UNSIGNED,
                allowNull: false,
                field:
                    "shared_expense_id",
            },

            projectId: {
                type:
                DataTypes.INTEGER.UNSIGNED,
                allowNull: false,
                field:
                    "project_id",
            },

            amountKopecks: {
                type:
                DataTypes.BIGINT.UNSIGNED,
                allowNull: false,
                field:
                    "amount_kopecks",
            },

            /*
             * Какая выручка точки
             * использовалась при расчёте.
             */
            revenueKopecks: {
                type:
                DataTypes.BIGINT.UNSIGNED,
                allowNull: false,
                field:
                    "revenue_kopecks",
            },

            totalRevenueKopecks: {
                type:
                DataTypes.BIGINT.UNSIGNED,
                allowNull: false,
                field:
                    "total_revenue_kopecks",
            },
        },
        {
            tableName:
                "campfood_expense_allocations",

            indexes: [
                {
                    unique: true,
                    fields: [
                        "shared_expense_id",
                        "project_id",
                    ],
                },
                {
                    fields: [
                        "project_id",
                    ],
                },
            ],
        }
    );

module.exports =
    CampFoodExpenseAllocation;