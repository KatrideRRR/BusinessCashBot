const { DataTypes } = require("sequelize");
const sequelize = require("../config/database");

const Supplier = sequelize.define(
    "suppliers",
    {
        id: {
            type: DataTypes.INTEGER.UNSIGNED,
            autoIncrement: true,
            primaryKey: true,
        },

        name: {
            type: DataTypes.STRING(255),
            allowNull: false,
        },

        phone: {
            type: DataTypes.STRING(50),
            allowNull: false,
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
        tableName: "suppliers",
    }
);

module.exports = Supplier;