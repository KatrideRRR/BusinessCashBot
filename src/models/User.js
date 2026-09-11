const { DataTypes } = require("sequelize");
const sequelize = require("../config/database");

const User = sequelize.define(
    "users",
    {
        id: {
            type: DataTypes.INTEGER.UNSIGNED,
            autoIncrement: true,
            primaryKey: true,
        },

        telegramId: {
            type: DataTypes.BIGINT.UNSIGNED,
            allowNull: false,
            unique: true,
            field: "telegram_id",
        },

        username: {
            type: DataTypes.STRING(255),
            allowNull: true,
        },

        firstName: {
            type: DataTypes.STRING(255),
            allowNull: true,
            field: "first_name",
        },

        lastName: {
            type: DataTypes.STRING(255),
            allowNull: true,
            field: "last_name",
        },

        role: {
            type: DataTypes.ENUM(
                "owner",
                "manager",
                "employee"
            ),
            allowNull: false,
            defaultValue: "employee",
        },

        isActive: {
            type: DataTypes.BOOLEAN,
            allowNull: false,
            defaultValue: true,
            field: "is_active",
        },

        lastSeenAt: {
            type: DataTypes.DATE,
            allowNull: true,
            field: "last_seen_at",
        },
    },
    {
        tableName: "users",
    }
);

module.exports = User;