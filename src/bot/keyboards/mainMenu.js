const { Markup } = require("telegraf");

function getMainMenu() {
    return Markup.keyboard([
        ["🏢 Проекты"],
        ["➖ Расход"],
        ["✅ Закрыть день"],
        ["📊 Отчёты"],
    ]).resize();
}

module.exports = {
    getMainMenu,
};