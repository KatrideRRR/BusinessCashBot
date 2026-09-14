const { DataTypes } = require("sequelize");
const sequelize = require("../config/database");

const DebtEntry = sequelize.define(
    "debt_entries",
    {
        id: {
            type: DataTypes.INTEGER.UNSIGNED,
            autoIncrement: true,
            primaryKey: true,
        },

        debtorId: {
            type: DataTypes.INTEGER.UNSIGNED,
            allowNull: false,
            field: "debtor_id",
        },

        type: {
            type: DataTypes.ENUM(
                "debt",
                "payment"
            ),
            allowNull: false,
        },

        amountKopecks: {
            type: DataTypes.BIGINT.UNSIGNED,
            allowNull: false,
            field: "amount_kopecks",
        },

        balanceAfterKopecks: {
            type: DataTypes.BIGINT.UNSIGNED,
            allowNull: false,
            field: "balance_after_kopecks",
        },

        businessDate: {
            type: DataTypes.DATEONLY,
            allowNull: false,
            field: "business_date",
        },

        createdBy: {
            type: DataTypes.INTEGER.UNSIGNED,
            allowNull: false,
            field: "created_by",
        },
    },
    {
        tableName: "debt_entries",

        indexes: [
            {
                fields: [
                    "debtor_id",
                    "business_date",
                ],
            },
        ],
    }
);

module.exports = DebtEntry;