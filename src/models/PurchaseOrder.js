const { DataTypes } = require("sequelize");
const sequelize = require("../config/database");

const PurchaseOrder = sequelize.define(
    "purchase_orders",
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

        supplierId: {
            type: DataTypes.INTEGER.UNSIGNED,
            allowNull: false,
            field: "supplier_id",
        },

        deliveryAddress: {
            type: DataTypes.STRING(255),
            allowNull: false,
            field: "delivery_address",
        },

        orderForDate: {
            type: DataTypes.DATEONLY,
            allowNull: true,
            field: "order_for_date",
        },

        messageText: {
            type: DataTypes.TEXT,
            allowNull: false,
            field: "message_text",
        },

        createdBy: {
            type: DataTypes.INTEGER.UNSIGNED,
            allowNull: false,
            field: "created_by",
        },
    },
    {
        tableName: "purchase_orders",

        indexes: [
            {
                fields: [
                    "project_id",
                    "created_at",
                ],
            },

            {
                fields: [
                    "supplier_id",
                    "created_at",
                ],
            },
        ],
    }
);

module.exports = PurchaseOrder;