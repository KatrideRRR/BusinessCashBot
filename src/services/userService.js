const { User } = require("../models");

async function getOrCreateTelegramUser(ctx) {
    const telegramUser = ctx.from;

    if (!telegramUser) {
        return null;
    }

    const telegramId = String(telegramUser.id);

    const ownerTelegramId =
        String(process.env.OWNER_TELEGRAM_ID || "");

    const isOwner =
        telegramId === ownerTelegramId;

    let user = await User.findOne({
        where: {
            telegramId,
        },
    });

    if (!user) {
        user = await User.create({
            telegramId,
            username: telegramUser.username || null,
            firstName: telegramUser.first_name || null,
            lastName: telegramUser.last_name || null,

            role: isOwner
                ? "owner"
                : "employee",

            isActive: isOwner,

            lastSeenAt: new Date(),
        });
    } else {
        await user.update({
            username: telegramUser.username || null,
            firstName: telegramUser.first_name || null,
            lastName: telegramUser.last_name || null,

            role: isOwner
                ? "owner"
                : user.role,

            isActive: isOwner
                ? true
                : user.isActive,

            lastSeenAt: new Date(),
        });
    }

    return user;
}

module.exports = {
    getOrCreateTelegramUser,
};