const {
    DataTypes,
} = require("sequelize");

const sequelize =
    require("../config/database");

const Debtor = sequelize.define(
    "debtors",
    {
        id: {
            type:
            DataTypes.INTEGER
                .UNSIGNED,

            autoIncrement:
                true,

            primaryKey:
                true,
        },

        name: {
            type:
                DataTypes.STRING(
                    255
                ),

            allowNull:
                false,
        },

        phone: {
            type:
                DataTypes.STRING(
                    50
                ),

            allowNull:
                true,
        },

        balanceKopecks: {
            type:
            DataTypes.BIGINT
                .UNSIGNED,

            allowNull:
                false,

            defaultValue:
                0,

            field:
                "balance_kopecks",
        },

        isActive: {
            type:
            DataTypes.BOOLEAN,

            allowNull:
                false,

            defaultValue:
                true,

            field:
                "is_active",
        },

        createdBy: {
            type:
            DataTypes.INTEGER
                .UNSIGNED,

            allowNull:
                false,

            field:
                "created_by",
        },
    },
    {
        tableName:
            "debtors",

        indexes: [
            {
                fields: [
                    "is_active",
                ],
            },

            {
                fields: [
                    "name",
                ],
            },
        ],
    }
);

module.exports =
    Debtor;