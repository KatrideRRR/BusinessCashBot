const { DataTypes } = require("sequelize");
const sequelize = require("../config/database");

const PurchaseItem = sequelize.define(
    "purchase_items",
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

        unit: {
            type: DataTypes.STRING(50),
            allowNull: false,
            defaultValue: "шт.",
        },

        defaultSupplierId: {
            type: DataTypes.INTEGER.UNSIGNED,
            allowNull: true,
            field: "default_supplier_id",
        },

        isActive: {
            type: DataTypes.BOOLEAN,
            allowNull: false,
            defaultValue: true,
            field: "is_active",
        },

        createdBy: {
            type: DataTypes.INTEGER.UNSIGNED,
            allowNull: false,
            field: "created_by",
        },
    },
    {
        tableName: "purchase_items",

        indexes: [
            {
                fields: [
                    "project_id",
                    "is_active",
                ],
            },
        ],
    }
);

module.exports = PurchaseItem;