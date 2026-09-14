const { Markup } = require("telegraf");

function getMainMenu() {
    return Markup.keyboard([
        ["🏢 Проекты"],
        ["➖ Расход"],
        ["🛒 Заказать"],
        ["✅ Закрыть день"],
        ["📊 Отчёты"],
        ["🧾 Долги"],
        ["👥 Пользователи"],
    ]).resize();
}

module.exports = {
    getMainMenu,
};