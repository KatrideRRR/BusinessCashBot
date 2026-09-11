const { DataTypes } = require("sequelize");
const sequelize = require("../config/database");

const Category = sequelize.define(
    "categories",
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

        type: {
            type: DataTypes.ENUM(
                "income",
                "expense"
            ),
            allowNull: false,
        },

        name: {
            type: DataTypes.STRING(255),
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
            allowNull: true,
            field: "created_by",
        },
    },
    {
        tableName: "categories",
    }
);

module.exports = Category;