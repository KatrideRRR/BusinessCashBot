const { DataTypes } = require("sequelize");
const sequelize = require("../config/database");

const Transaction = sequelize.define(
    "transactions",
    {
        id: {
            type: DataTypes.INTEGER.UNSIGNED,
            autoIncrement: true,
            primaryKey: true,
        },

        projectId: {
            type: DataTypes.INTEGER.UNSIGNED,
            allowNull: false,
            field: "project_id",
        },

        type: {
            type: DataTypes.ENUM(
                "income",
                "expense"
            ),
            allowNull: false,
        },

        categoryId: {
            type: DataTypes.INTEGER.UNSIGNED,
            allowNull: false,
            field: "category_id",
        },

        paymentMethodId: {
            type: DataTypes.INTEGER.UNSIGNED,
            allowNull: false,
            field: "payment_method_id",
        },

        amountKopecks: {
            type: DataTypes.BIGINT.UNSIGNED,
            allowNull: false,
            field: "amount_kopecks",
        },

        businessDate: {
            type: DataTypes.DATEONLY,
            allowNull: false,
            field: "business_date",
        },

        closureId: {
            type: DataTypes.INTEGER.UNSIGNED,
            allowNull: true,
            field: "closure_id",
        },

        /*
         * Только для расходов.
         *
         * today_revenue — из сегодняшней выручки
         * other — из других денег
         * null — проект эту функцию не использует
         */
        fundSource: {
            type: DataTypes.ENUM(
                "today_revenue",
                "other"
            ),
            allowNull: true,
            field: "fund_source",
        },

        comment: {
            type: DataTypes.TEXT,
            allowNull: true,
        },

        createdBy: {
            type: DataTypes.INTEGER.UNSIGNED,
            allowNull: false,
            field: "created_by",
        },
    },
    {
        tableName: "transactions",

        indexes: [
            {
                fields: [
                    "project_id",
                    "business_date",
                ],
            },
            {
                fields: [
                    "project_id",
                    "type",
                ],
            },
            {
                fields: [
                    "category_id",
                ],
            },
        ],
    }
);

module.exports = Transaction;