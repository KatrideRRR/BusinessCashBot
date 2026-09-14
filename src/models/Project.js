const { DataTypes } = require("sequelize");
const sequelize = require("../config/database");

const Project = sequelize.define(
    "projects",
    {
        id: {
            type: DataTypes.INTEGER.UNSIGNED,
            autoIncrement: true,
            primaryKey: true,
        },

        name: {
            type: DataTypes.STRING(255),
            allowNull: false,
            unique: true,
        },

        description: {
            type: DataTypes.TEXT,
            allowNull: true,
        },

        isActive: {
            type: DataTypes.BOOLEAN,
            allowNull: false,
            defaultValue: true,
            field: "is_active",
        },

        trackTodayRevenueSource: {
            type: DataTypes.BOOLEAN,
            allowNull: false,
            defaultValue: false,
            field: "track_today_revenue_source",
        },

        purchaseAddress: {
            type: DataTypes.STRING(255),
            allowNull: true,
            field: "purchase_address",
        },

        revenueMode: {
            type: DataTypes.ENUM(
                "daily_close",
                "direct"
            ),
            allowNull: false,
            defaultValue: "daily_close",
            field: "revenue_mode",
        },

        createdBy: {
            type: DataTypes.INTEGER.UNSIGNED,
            allowNull: true,
            field: "created_by",
        },
    },
    {
        tableName: "projects",
    }
);

module.exports = Project;