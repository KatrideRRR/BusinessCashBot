const { Sequelize } = require("sequelize");

const sequelize = new Sequelize(
    process.env.DB_NAME,
    process.env.DB_USER,
    process.env.DB_PASSWORD,
    {
        host: process.env.DB_HOST,
        port: Number(process.env.DB_PORT || 3306),
        dialect: "mysql",

        logging: false,

        define: {
            timestamps: true,
            underscored: true,
            freezeTableName: true,
        },

        timezone: "+03:00",
    }
);

module.exports = sequelize;