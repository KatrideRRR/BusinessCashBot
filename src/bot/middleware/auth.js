const {
    getOrCreateTelegramUser,
} = require("../../services/userService");

async function authMiddleware(ctx, next) {
    try {
        const user =
            await getOrCreateTelegramUser(ctx);

        if (!user) {
            return;
        }

        ctx.state.user = user;

        if (!user.isActive) {
            await ctx.reply(
                "⛔ У вас нет доступа к этому боту."
            );

            return;
        }

        return next();
    } catch (error) {
        console.error(
            "Ошибка авторизации:",
            error
        );

        await ctx.reply(
            "Произошла ошибка авторизации."
        );
    }
}

module.exports = authMiddleware;