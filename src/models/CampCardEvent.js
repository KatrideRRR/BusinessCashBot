const { DataTypes } = require("sequelize");
const sequelize = require("../config/database");

const CampCardEvent = sequelize.define(
    "camp_card_events",
    {
        id: {
            type: DataTypes.INTEGER.UNSIGNED,
            autoIncrement: true,
            primaryKey: true,
        },

        eventId: {
            type: DataTypes.STRING(100),
            allowNull: false,
            unique: true,
            field: "event_id",
        },

        transactionId: {
            type: DataTypes.INTEGER.UNSIGNED,
            allowNull: false,
            unique: true,
            field: "transaction_id",
        },

        projectId: {
            type: DataTypes.INTEGER.UNSIGNED,
            allowNull: false,
            field: "project_id",
        },

        locationCode: {
            type: DataTypes.STRING(50),
            allowNull: false,
            field: "location_code",
        },

        amountKopecks: {
            type: DataTypes.BIGINT.UNSIGNED,
            allowNull: false,
            field: "amount_kopecks",
        },

        paidAmountKopecks: {
            type: DataTypes.BIGINT.UNSIGNED,
            allowNull: false,
            field: "paid_amount_kopecks",
        },

        bonusAmountKopecks: {
            type: DataTypes.BIGINT.UNSIGNED,
            allowNull: false,
            field: "bonus_amount_kopecks",
        },

        occurredAt: {
            type: DataTypes.DATE,
            allowNull: false,
            field: "occurred_at",
        },
    },
    {
        tableName: "camp_card_events",
    }
);

module.exports = CampCardEvent;