const { Markup } = require("telegraf");

function getMainMenu() {
    return Markup.keyboard([
        ["🏢 Проекты"],
        ["➖ Расход"],
        ["✅ Закрыть день"],
        ["📊 Отчёты"],
        ["👥 Пользователи"],
    ]).resize();
}

module.exports = {
    getMainMenu,
};