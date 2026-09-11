const { DataTypes } = require("sequelize");
const sequelize = require("../config/database");

const ProjectUser = sequelize.define(
    "project_users",
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

        userId: {
            type: DataTypes.INTEGER.UNSIGNED,
            allowNull: false,
            field: "user_id",
        },

        role: {
            type: DataTypes.ENUM(
                "manager",
                "employee"
            ),
            allowNull: false,
            defaultValue: "employee",
        },
    },
    {
        tableName: "project_users",

        indexes: [
            {
                unique: true,
                fields: ["project_id", "user_id"],
            },
        ],
    }
);

module.exports = ProjectUser;