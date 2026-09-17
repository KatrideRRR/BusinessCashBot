const {
    DataTypes,
} = require("sequelize");

const sequelize =
    require("../config/database");

const CampFoodSharedExpense =
    sequelize.define(
        "campfood_shared_expenses",
        {
            id: {
                type:
                DataTypes.INTEGER.UNSIGNED,
                autoIncrement: true,
                primaryKey: true,
            },

            businessDate: {
                type:
                DataTypes.DATEONLY,
                allowNull: false,
                field:
                    "business_date",
            },

            categoryName: {
                type:
                    DataTypes.STRING(255),
                allowNull: false,
                field:
                    "category_name",
            },

            amountKopecks: {
                type:
                DataTypes.BIGINT.UNSIGNED,
                allowNull: false,
                field:
                    "amount_kopecks",
            },

            /*
             * today_revenue —
             * деньги физически взяли
             * из кассы одной из точек.
             *
             * other —
             * оплатили из других денег.
             */
            fundSource: {
                type:
                    DataTypes.ENUM(
                        "today_revenue",
                        "other"
                    ),
                allowNull: false,
                field:
                    "fund_source",
            },

            /*
             * Заполняется только если
             * fundSource = today_revenue.
             *
             * Это НЕ точка, на которую
             * относится расход.
             *
             * Это касса, из которой
             * физически взяли деньги.
             */
            paidFromProjectId: {
                type:
                DataTypes.INTEGER.UNSIGNED,
                allowNull: true,
                field:
                    "paid_from_project_id",
            },

            /*
             * Для будущей миграции
             * старых transactions.
             */
            sourceTransactionId: {
                type:
                DataTypes.INTEGER.UNSIGNED,
                allowNull: true,
                unique: true,
                field:
                    "source_transaction_id",
            },

            allocatedAt: {
                type:
                DataTypes.DATE,
                allowNull: true,
                field:
                    "allocated_at",
            },

            createdBy: {
                type:
                DataTypes.INTEGER.UNSIGNED,
                allowNull: false,
                field:
                    "created_by",
            },
        },
        {
            tableName:
                "campfood_shared_expenses",

            indexes: [
                {
                    fields: [
                        "business_date",
                    ],
                },
                {
                    fields: [
                        "paid_from_project_id",
                    ],
                },
            ],
        }
    );

module.exports =
    CampFoodSharedExpense;