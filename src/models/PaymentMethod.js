const { DataTypes } = require("sequelize");
const sequelize = require("../config/database");

const PaymentMethod = sequelize.define(
    "payment_methods",
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

        name: {
            type: DataTypes.STRING(255),
            allowNull: false,
        },

        type: {
            type: DataTypes.ENUM(
                "cash",
                "terminal",
                "transfer",
                "bank_account",
                "other"
            ),
            allowNull: false,
            defaultValue: "other",
        },

        isActive: {
            type: DataTypes.BOOLEAN,
            allowNull: false,
            defaultValue: true,
            field: "is_active",
        },
    },
    {
        tableName: "payment_methods",

        indexes: [
            {
                unique: true,
                fields: [
                    "project_id",
                    "name",
                ],
            },
        ],
    }
);

module.exports = PaymentMethod;