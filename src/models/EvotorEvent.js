const { DataTypes } = require("sequelize");
const sequelize = require("../config/database");

const EvotorEvent = sequelize.define(
    "evotor_events",
    {
        id: {
            type: DataTypes.INTEGER.UNSIGNED,
            autoIncrement: true,
            primaryKey: true,
        },

        /*
         * Уникальный ключ события.
         *
         * Например:
         * SELL:<documentId>:<paymentId>
         */
        eventKey: {
            type: DataTypes.STRING(255),
            allowNull: false,
            unique: true,
            field: "event_key",
        },

        /*
         * Transaction создаётся для обычной
         * продажи ELECTRON.
         *
         * Для PAYBACK пока может быть null —
         * возвраты обработаем отдельным следующим блоком.
         */
        transactionId: {
            type: DataTypes.INTEGER.UNSIGNED,
            allowNull: true,
            unique: true,
            field: "transaction_id",
        },

        projectId: {
            type: DataTypes.INTEGER.UNSIGNED,
            allowNull: false,
            field: "project_id",
        },

        storeId: {
            type: DataTypes.STRING(64),
            allowNull: false,
            field: "store_id",
        },

        deviceId: {
            type: DataTypes.STRING(64),
            allowNull: true,
            field: "device_id",
        },

        documentId: {
            type: DataTypes.STRING(100),
            allowNull: false,
            field: "document_id",
        },

        paymentId: {
            type: DataTypes.STRING(100),
            allowNull: false,
            field: "payment_id",
        },

        documentType: {
            type: DataTypes.ENUM(
                "SELL",
                "PAYBACK"
            ),
            allowNull: false,
            field: "document_type",
        },

        paymentType: {
            type: DataTypes.STRING(50),
            allowNull: false,
            field: "payment_type",
        },

        amountKopecks: {
            type: DataTypes.BIGINT.UNSIGNED,
            allowNull: false,
            field: "amount_kopecks",
        },

        occurredAt: {
            type: DataTypes.DATE,
            allowNull: false,
            field: "occurred_at",
        },

        /*
         * applied
         *   — операция уже отражена в BusinessCashBot
         *
         * ignored
         *   — событие намеренно не учитываем
         *
         * pending_refund
         *   — возврат сохранён, но ещё не применён
         */
        status: {
            type: DataTypes.ENUM(
                "applied",
                "ignored",
                "pending_refund"
            ),
            allowNull: false,
            defaultValue: "applied",
        },
    },
    {
        tableName: "evotor_events",

        indexes: [
            {
                fields: [
                    "project_id",
                    "occurred_at",
                ],
            },
            {
                fields: [
                    "store_id",
                    "document_id",
                ],
            },
            {
                fields: [
                    "document_type",
                    "status",
                ],
            },
        ],
    }
);

module.exports = EvotorEvent;