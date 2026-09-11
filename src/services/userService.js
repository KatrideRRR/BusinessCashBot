const { User } = require("../models");

async function getOrCreateTelegramUser(ctx) {
    const telegramUser = ctx.from;

    if (!telegramUser) {
        return null;
    }

    const telegramId =
        String(telegramUser.id);

    const ownerTelegramId =
        String(
            process.env.OWNER_TELEGRAM_ID ||
            ""
        );

    const isOwner =
        telegramId ===
        ownerTelegramId;

    let user;

    try {
        const [foundUser] =
            await User.findOrCreate({
                where: {
                    telegramId,
                },

                defaults: {
                    telegramId,

                    username:
                        telegramUser.username ||
                        null,

                    firstName:
                        telegramUser.first_name ||
                        null,

                    lastName:
                        telegramUser.last_name ||
                        null,

                    role:
                        isOwner
                            ? "owner"
                            : "employee",

                    isActive:
                    isOwner,

                    lastSeenAt:
                        new Date(),
                },
            });

        user = foundUser;
    } catch (error) {
        /*
         * Защита от ситуации,
         * когда два Telegram update
         * одновременно пытаются
         * создать одного пользователя.
         */
        if (
            error.name ===
            "SequelizeUniqueConstraintError"
        ) {
            user =
                await User.findOne({
                    where: {
                        telegramId,
                    },
                });
        } else {
            throw error;
        }
    }

    if (!user) {
        throw new Error(
            `Не удалось получить пользователя ${telegramId}`
        );
    }

    const updateData = {
        username:
            telegramUser.username ||
            null,

        firstName:
            telegramUser.first_name ||
            null,

        lastName:
            telegramUser.last_name ||
            null,

        lastSeenAt:
            new Date(),
    };

    /*
     * OWNER_TELEGRAM_ID всегда
     * имеет полный доступ.
     */
    if (isOwner) {
        updateData.role =
            "owner";

        updateData.isActive =
            true;
    }

    await user.update(
        updateData
    );

    return user;
}

module.exports = {
    getOrCreateTelegramUser,
};