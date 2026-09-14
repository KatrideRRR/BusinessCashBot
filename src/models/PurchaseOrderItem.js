const { DataTypes } = require("sequelize");
const sequelize = require("../config/database");

const PurchaseOrderItem = sequelize.define(
    "purchase_order_items",
    {
        id: {
            type: DataTypes.INTEGER.UNSIGNED,
            autoIncrement: true,
            primaryKey: true,
        },

        orderId: {
            type: DataTypes.INTEGER.UNSIGNED,
            allowNull: false,
            field: "order_id",
        },

        itemId: {
            type: DataTypes.INTEGER.UNSIGNED,
            allowNull: false,
            field: "item_id",
        },

        /*
         * Снимок названия и единицы.
         *
         * Даже если потом товар
         * переименуем, старая история
         * останется неизменной.
         */
        itemName: {
            type: DataTypes.STRING(255),
            allowNull: false,
            field: "item_name",
        },

        unit: {
            type: DataTypes.STRING(50),
            allowNull: false,
        },

        quantity: {
            type: DataTypes.DECIMAL(
                12,
                3
            ),
            allowNull: false,
        },
    },
    {
        tableName: "purchase_order_items",

        indexes: [
            {
                fields: [
                    "order_id",
                ],
            },

            {
                fields: [
                    "item_id",
                ],
            },
        ],
    }
);

module.exports = PurchaseOrderItem;