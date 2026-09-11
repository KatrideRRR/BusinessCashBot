const { DataTypes } = require("sequelize");
const sequelize = require("../config/database");

const DailyClosure = sequelize.define(
    "daily_closures",
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

        businessDate: {
            type: DataTypes.DATEONLY,
            allowNull: false,
            field: "business_date",
        },

        totalIncomeKopecks: {
            type: DataTypes.BIGINT.UNSIGNED,
            allowNull: false,
            defaultValue: 0,
            field: "total_income_kopecks",
        },

        totalExpenseKopecks: {
            type: DataTypes.BIGINT.UNSIGNED,
            allowNull: false,
            defaultValue: 0,
            field: "total_expense_kopecks",
        },

        /*
         * Может быть отрицательным.
         */
        resultKopecks: {
            type: DataTypes.BIGINT,
            allowNull: false,
            defaultValue: 0,
            field: "result_kopecks",
        },

        status: {
            type: DataTypes.ENUM(
                "closed",
                "reopened"
            ),
            allowNull: false,
            defaultValue: "closed",
        },

        closedBy: {
            type: DataTypes.INTEGER.UNSIGNED,
            allowNull: false,
            field: "closed_by",
        },

        closedAt: {
            type: DataTypes.DATE,
            allowNull: false,
            field: "closed_at",
        },
    },
    {
        tableName: "daily_closures",

        indexes: [
            {
                unique: true,
                fields: [
                    "project_id",
                    "business_date",
                ],
            },
        ],
    }
);

module.exports = DailyClosure;