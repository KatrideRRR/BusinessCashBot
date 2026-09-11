const {
    Scenes,
    Markup,
} = require("telegraf");

const {
    Transaction,
    DailyClosure,
} = require("../../models");

const {
    getProjectForUser,
} = require("../../services/projectService");

const {
    parseMoneyToKopecks,
    formatKopecks,
} = require("../../utils/money");

const {
    getBusinessDate,
} = require("../../utils/businessDate");

const {
    getMainMenu,
} = require("../keyboards/mainMenu");

const editTransactionScene =
    new Scenes.BaseScene(
        "edit-transaction"
    );

editTransactionScene.enter(
    async (ctx) => {
        if (
            ctx.state.user.role !==
            "owner"
        ) {
            await ctx.reply(
                "⛔ Изменять операции может только владелец."
            );

            return ctx.scene.leave();
        }

        const transactionId =
            Number(
                ctx.scene.state
                    .transactionId
            );

        const transaction =
            await Transaction.findByPk(
                transactionId
            );

        if (!transaction) {
            await ctx.reply(
                "Операция не найдена."
            );

            return ctx.scene.leave();
        }

        const project =
            await getProjectForUser(
                transaction.projectId,
                ctx.state.user
            );

        if (!project) {
            await ctx.reply(
                "⛔ Нет доступа."
            );

            return ctx.scene.leave();
        }

        if (
            project.revenueMode ===
            "daily_close"
        ) {
            const closure =
                await DailyClosure.findOne({
                    where: {
                        projectId:
                        project.id,

                        businessDate:
                        transaction.businessDate,

                        status:
                            "closed",
                    },
                });

            if (closure) {
                await ctx.reply(
                    "🔒 День закрыт.\n\n" +
                    "Сначала переоткройте день."
                );

                return ctx.scene.leave();
            }
        }

        ctx.scene.state.transactionId =
            transaction.id;

        await ctx.reply(
            `✏️ Изменение суммы\n\n` +
            `Сейчас: ${formatKopecks(
                transaction.amountKopecks
            )}\n\n` +
            `Введите правильную сумму:`,
            Markup.keyboard([
                ["❌ Отмена"],
            ]).resize()
        );
    }
);

editTransactionScene.on(
    "text",
    async (ctx) => {
        const text =
            ctx.message.text?.trim();

        if (
            text ===
            "❌ Отмена"
        ) {
            await ctx.reply(
                "Изменение отменено.",
                getMainMenu()
            );

            return ctx.scene.leave();
        }

        const amount =
            parseMoneyToKopecks(
                text
            );

        if (!amount) {
            await ctx.reply(
                "Не удалось понять сумму.\n\n" +
                "Например: 1500 или 1500,50"
            );

            return;
        }

        const transaction =
            await Transaction.findByPk(
                ctx.scene.state
                    .transactionId
            );

        if (!transaction) {
            await ctx.reply(
                "Операция больше не существует."
            );

            return ctx.scene.leave();
        }

        await transaction.update({
            amountKopecks:
                amount.toString(),
        });

        await ctx.reply(
            `✅ Сумма изменена\n\n` +
            `Новая сумма: ${formatKopecks(
                amount
            )}`,
            getMainMenu()
        );

        return ctx.scene.leave();
    }
);

module.exports =
    editTransactionScene;