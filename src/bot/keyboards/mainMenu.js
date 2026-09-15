const { Markup } = require("telegraf");

function getMainMenu() {
    return Markup.keyboard([
        ["➖ Расход"],
        ["🛒 Заказать"],
        ["✅ Закрыть день"],
        ["📊 Отчёты"],
        ["🧾 Долги"],
        ["👥 Пользователи"],
        ["🏢 Проекты"],
    ]).resize();
}

module.exports = {
    getMainMenu,
};