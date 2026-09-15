const {
    DataTypes,
} = require("sequelize");

const sequelize =
    require("../config/database");

const CargoCampPaymentEvent =
    sequelize.define(
        "cargocamp_payment_events",
        {
            id: {
                type:
                DataTypes.INTEGER.UNSIGNED,
                autoIncrement: true,
                primaryKey: true,
            },

            eventId: {
                type:
                    DataTypes.STRING(160),
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

            paymentKind: {
                type:
                    DataTypes.ENUM(
                        "premium",
                        "debt",
                        "promotion"
                    ),
                allowNull: false,
                field:
                    "payment_kind",
            },

            amountKopecks: {
                type:
                DataTypes.BIGINT.UNSIGNED,
                allowNull: false,
                field:
                    "amount_kopecks",
            },

            sourceUserId: {
                type:
                DataTypes.INTEGER.UNSIGNED,
                allowNull: true,
                field:
                    "source_user_id",
            },

            sourceOrderId: {
                type:
                DataTypes.INTEGER.UNSIGNED,
                allowNull: true,
                field:
                    "source_order_id",
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
                "cargocamp_payment_events",

            indexes: [
                {
                    unique: true,
                    fields: [
                        "provider",
                        "provider_payment_id",
                    ],
                },
            ],
        }
    );

module.exports =
    CargoCampPaymentEvent;