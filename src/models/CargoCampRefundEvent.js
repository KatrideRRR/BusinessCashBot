const {
    DataTypes,
} = require("sequelize");

const sequelize =
    require("../config/database");

const CargoCampRefundEvent =
    sequelize.define(
        "cargocamp_refund_events",
        {
            id: {
                type:
                DataTypes.INTEGER.UNSIGNED,
                autoIncrement: true,
                primaryKey: true,
            },

            eventId: {
                type:
                    DataTypes.STRING(180),
                allowNull: false,
                unique: true,
                field:
                    "event_id",
            },

            transactionId: {
                type:
                DataTypes.INTEGER.UNSIGNED,
                allowNull: false,
                unique: true,
                field:
                    "transaction_id",
            },

            originalPaymentEventId: {
                type:
                DataTypes.INTEGER.UNSIGNED,
                allowNull: false,
                field:
                    "original_payment_event_id",
            },

            projectId: {
                type:
                DataTypes.INTEGER.UNSIGNED,
                allowNull: false,
                field:
                    "project_id",
            },

            provider: {
                type:
                    DataTypes.ENUM(
                        "yookassa",
                        "tbank"
                    ),
                allowNull: false,
            },

            providerPaymentId: {
                type:
                    DataTypes.STRING(120),
                allowNull: false,
                field:
                    "provider_payment_id",
            },

            providerRefundId: {
                type:
                    DataTypes.STRING(160),
                allowNull: false,
                field:
                    "provider_refund_id",
            },

            amountKopecks: {
                type:
                DataTypes.BIGINT.UNSIGNED,
                allowNull: false,
                field:
                    "amount_kopecks",
            },

            occurredAt: {
                type:
                DataTypes.DATE,
                allowNull: false,
                field:
                    "occurred_at",
            },
        },
        {
            tableName:
                "cargocamp_refund_events",

            indexes: [
                {
                    unique: true,
                    fields: [
                        "provider",
                        "provider_refund_id",
                    ],
                },
                {
                    fields: [
                        "original_payment_event_id",
                    ],
                },
            ],
        }
    );

module.exports =
    CargoCampRefundEvent;