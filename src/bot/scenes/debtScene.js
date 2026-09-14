const {
    Scenes,
    Markup,
} = require("telegraf");

const {
    Op,
} = require("sequelize");

const sequelize =
    require("../../config/database");

const {
    Debtor,
    DebtEntry,
} = require("../../models");

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

const debtScene =
    new Scenes.BaseScene(
        "debts"
    );

/*
 * =========================
 * HELPERS
 * =========================
 */

async function showHome(ctx) {
    ctx.scene.state.awaiting =
        null;

    await ctx.reply(
        "🧾 Долги\n\n" +
        "Что нужно сделать?",
        Markup.inlineKeyboard([
            [
                Markup.button.callback(
                    "➕ Записать долг",
                    "debt_add"
                ),
            ],
            [
                Markup.button.callback(
                    "💵 Погасить долг",
                    "debt_payment"
                ),
            ],
            [
                Markup.button.callback(
                    "👥 Должники",
                    "debt_list"
                ),
            ],
            [
                Markup.button.callback(
                    "⬅️ Главное меню",
                    "debt_exit"
                ),
            ],
        ])
    );
}

async function getDebtor(
    debtorId
) {
    return Debtor.findOne({
        where: {
            id: debtorId,
            isActive: true,
        },
    });
}

async function saveDebt(
    ctx
) {
    if (
        ctx.scene.state.processing
    ) {
        return;
    }

    ctx.scene.state.processing =
        true;

    try {
        const amount =
            BigInt(
                ctx.scene.state
                    .amountKopecks
            );

        let finalDebtor;

        await sequelize.transaction(
            async (
                dbTransaction
            ) => {
                let debtor;

                if (
                    ctx.scene.state
                        .debtorId
                ) {
                    debtor =
                        await Debtor.findByPk(
                            ctx.scene.state
                                .debtorId,
                            {
                                transaction:
                                dbTransaction,

                                lock:
                                dbTransaction
                                    .LOCK
                                    .UPDATE,
                            }
                        );
                } else {
                    debtor =
                        await Debtor.create(
                            {

                                name:
                                ctx.scene.state
                                    .debtorName,

                                balanceKopecks:
                                    "0",

                                createdBy:
                                ctx.state
                                    .user.id,
                            },
                            {
                                transaction:
                                dbTransaction,
                            }
                        );
                }

                if (!debtor) {
                    throw new Error(
                        "Debtor not found"
                    );
                }

                const oldBalance =
                    BigInt(
                        debtor
                            .balanceKopecks ||
                        0
                    );

                const newBalance =
                    oldBalance +
                    amount;

                await debtor.update(
                    {
                        balanceKopecks:
                            newBalance
                                .toString(),

                        isActive:
                            true,
                    },
                    {
                        transaction:
                        dbTransaction,
                    }
                );

                await DebtEntry.create(
                    {
                        debtorId:
                        debtor.id,

                        type:
                            "debt",

                        amountKopecks:
                            amount.toString(),

                        balanceAfterKopecks:
                            newBalance
                                .toString(),

                        businessDate:
                            getBusinessDate(),

                        createdBy:
                        ctx.state
                            .user.id,
                    },
                    {
                        transaction:
                        dbTransaction,
                    }
                );

                finalDebtor =
                    debtor;
            }
        );

        await ctx.editMessageText(
            `✅ Долг записан\n\n` +
            `👤 ${finalDebtor.name}\n` +
            `➕ ${formatKopecks(
                amount
            )}\n\n` +
            `Общий долг: ${formatKopecks(
                finalDebtor
                    .balanceKopecks
            )}`
        );

        ctx.scene.state.processing =
            false;

        await showHome(ctx);
    } catch (error) {
        ctx.scene.state.processing =
            false;

        console.error(
            "Ошибка записи долга:",
            error
        );

        await ctx.reply(
            "❌ Не удалось записать долг."
        );
    }
}

async function savePayment(
    ctx,
    debtorId,
    amountKopecks
) {
    if (
        ctx.scene.state.processing
    ) {
        return;
    }

    ctx.scene.state.processing =
        true;

    try {
        const amount =
            BigInt(
                amountKopecks
            );

        let finalDebtor;
        let newBalance = 0n;

        await sequelize.transaction(
            async (
                dbTransaction
            ) => {
                const debtor =
                    await Debtor.findByPk(
                        debtorId,
                        {
                            transaction:
                            dbTransaction,

                            lock:
                            dbTransaction
                                .LOCK
                                .UPDATE,
                        }
                    );

                if (!debtor) {
                    throw new Error(
                        "Debtor not found"
                    );
                }

                const oldBalance =
                    BigInt(
                        debtor
                            .balanceKopecks ||
                        0
                    );

                if (
                    amount <= 0n ||
                    amount >
                    oldBalance
                ) {
                    throw new Error(
                        "Invalid payment amount"
                    );
                }

                newBalance =
                    oldBalance -
                    amount;

                await debtor.update(
                    {
                        balanceKopecks:
                            newBalance
                                .toString(),
                    },
                    {
                        transaction:
                        dbTransaction,
                    }
                );

                await DebtEntry.create(
                    {
                        debtorId:
                        debtor.id,

                        type:
                            "payment",

                        amountKopecks:
                            amount.toString(),

                        balanceAfterKopecks:
                            newBalance
                                .toString(),

                        businessDate:
                            getBusinessDate(),

                        createdBy:
                        ctx.state
                            .user.id,
                    },
                    {
                        transaction:
                        dbTransaction,
                    }
                );

                finalDebtor =
                    debtor;
            }
        );

        await ctx.editMessageText(
            `✅ Погашение записано\n\n` +
            `👤 ${finalDebtor.name}\n` +
            `➖ ${formatKopecks(
                amount
            )}\n\n` +
            `Осталось: ${formatKopecks(
                newBalance
            )}`
        );

        ctx.scene.state.processing =
            false;

        await showHome(ctx);
    } catch (error) {
        ctx.scene.state.processing =
            false;

        console.error(
            "Ошибка погашения долга:",
            error
        );

        await ctx.reply(
            "❌ Не удалось записать погашение."
        );
    }
}

/*
 * =========================
 * ENTER
 * =========================
 */

debtScene.enter(
    async (ctx) => {
        await showHome(ctx);
    }
);

/*
 * =========================
 * HOME
 * =========================
 */

debtScene.action(
    "debt_home",
    async (ctx) => {
        await ctx.answerCbQuery();

        await showHome(ctx);
    }
);

debtScene.action(
    "debt_exit",
    async (ctx) => {
        await ctx.answerCbQuery();

        await ctx.reply(
            "Главное меню:",
            getMainMenu()
        );

        return ctx.scene.leave();
    }
);

/*
 * =========================
 * ADD DEBT
 * =========================
 */

debtScene.action(
    "debt_add",
    async (ctx) => {
        await ctx.answerCbQuery();

        const debtors =
            await Debtor.findAll({
                where: {
                    isActive:
                        true,
                },

                order: [
                    ["name", "ASC"],
                ],
            });

        const buttons =
            debtors.map(
                (debtor) => [
                    Markup.button.callback(
                        `${debtor.name} — ${formatKopecks(
                            debtor
                                .balanceKopecks
                        )}`,
                        `debt_add_existing_${debtor.id}`
                    ),
                ]
            );

        buttons.push([
            Markup.button.callback(
                "➕ Новый человек",
                "debt_add_new"
            ),
        ]);

        buttons.push([
            Markup.button.callback(
                "⬅️ Назад",
                "debt_home"
            ),
        ]);

        await ctx.reply(
            "Кому записать долг?",
            Markup.inlineKeyboard(
                buttons
            )
        );
    }
);

debtScene.action(
    /^debt_add_existing_(\d+)$/,
    async (ctx) => {
        await ctx.answerCbQuery();

        const debtor =
            await getDebtor(
                debtorId
            );

        if (!debtor) {
            await ctx.reply(
                "Должник не найден."
            );

            return;
        }

        ctx.scene.state.debtorId =
            debtor.id;

        ctx.scene.state.debtorName =
            debtor.name;

        ctx.scene.state.awaiting =
            "add_amount";

        await ctx.reply(
            `👤 ${debtor.name}\n` +
            `Сейчас должен: ${formatKopecks(
                debtor.balanceKopecks
            )}\n\n` +
            `Введите сумму нового долга:`,
            Markup.keyboard([
                ["❌ Отмена"],
            ]).resize()
        );
    }
);

debtScene.action(
    "debt_add_new",
    async (ctx) => {
        await ctx.answerCbQuery();

        ctx.scene.state.debtorId =
            null;

        ctx.scene.state.awaiting =
            "new_debtor_name";

        await ctx.reply(
            "Введите имя человека:",
            Markup.keyboard([
                ["❌ Отмена"],
            ]).resize()
        );
    }
);

/*
 * =========================
 * PAYMENT
 * =========================
 */

debtScene.action(
    "debt_payment",
    async (ctx) => {
        await ctx.answerCbQuery();

        const debtors =
            await Debtor.findAll({
                where: {
                    isActive:
                        true,

                    balanceKopecks: {
                        [Op.gt]:
                            0,
                    },
                },

                order: [
                    ["name", "ASC"],
                ],
            });

        if (
            debtors.length === 0
        ) {
            await ctx.reply(
                "✅ Долгов нет."
            );

            return;
        }

        const buttons =
            debtors.map(
                (debtor) => [
                    Markup.button.callback(
                        `${debtor.name} — ${formatKopecks(
                            debtor
                                .balanceKopecks
                        )}`,
                        `debt_pay_debtor_${debtor.id}`
                    ),
                ]
            );

        buttons.push([
            Markup.button.callback(
                "⬅️ Назад",
                "debt_home"
            ),
        ]);

        await ctx.reply(
            "Кто погасил долг?",
            Markup.inlineKeyboard(
                buttons
            )
        );
    }
);

debtScene.action(
    /^debt_pay_debtor_(\d+)$/,
    async (ctx) => {
        await ctx.answerCbQuery();

        const debtor =
            await getDebtor(
                debtorId
            );

        if (!debtor) {
            return;
        }

        ctx.scene.state.debtorId =
            debtor.id;

        await ctx.reply(
            `👤 ${debtor.name}\n\n` +
            `Долг: ${formatKopecks(
                debtor.balanceKopecks
            )}`,
            Markup.inlineKeyboard([
                [
                    Markup.button.callback(
                        "✅ Погасить полностью",
                        `debt_pay_full_${debtor.id}`
                    ),
                ],
                [
                    Markup.button.callback(
                        "💵 Ввести сумму",
                        `debt_pay_partial_${debtor.id}`
                    ),
                ],
                [
                    Markup.button.callback(
                        "⬅️ Назад",
                        "debt_payment"
                    ),
                ],
            ])
        );
    }
);

debtScene.action(
    /^debt_pay_full_(\d+)$/,
    async (ctx) => {
        await ctx.answerCbQuery();

        const debtor =
            await getDebtor(
                debtorId
            );

        if (!debtor) {
            return;
        }

        await ctx.reply(
            `Погасить долг полностью?\n\n` +
            `👤 ${debtor.name}\n` +
            `💵 ${formatKopecks(
                debtor.balanceKopecks
            )}`,
            Markup.inlineKeyboard([
                [
                    Markup.button.callback(
                        "✅ Да, погасить",
                        `debt_pay_full_confirm_${debtor.id}`
                    ),
                ],
                [
                    Markup.button.callback(
                        "❌ Отмена",
                        "debt_home"
                    ),
                ],
            ])
        );
    }
);

debtScene.action(
    /^debt_pay_full_confirm_(\d+)$/,
    async (ctx) => {
        await ctx.answerCbQuery();

        const debtor =
            await getDebtor(
                debtorId
            );

        if (!debtor) {
            return;
        }

        return savePayment(
            ctx,
            debtor.id,
            debtor.balanceKopecks
        );
    }
);

debtScene.action(
    /^debt_pay_partial_(\d+)$/,
    async (ctx) => {
        await ctx.answerCbQuery();

        const debtor =
            await getDebtor(
                debtorId
            );

        if (!debtor) {
            return;
        }

        ctx.scene.state.debtorId =
            debtor.id;

        ctx.scene.state.awaiting =
            "payment_amount";

        await ctx.reply(
            `👤 ${debtor.name}\n` +
            `Долг: ${formatKopecks(
                debtor.balanceKopecks
            )}\n\n` +
            `Введите сумму погашения:`,
            Markup.keyboard([
                ["❌ Отмена"],
            ]).resize()
        );
    }
);

/*
 * =========================
 * LIST
 * =========================
 */

debtScene.action(
    "debt_list",
    async (ctx) => {
        await ctx.answerCbQuery();

        const debtors =
            await Debtor.findAll({
                where: {
                    isActive:
                        true,

                    balanceKopecks: {
                        [Op.gt]:
                            0,
                    },
                },

                order: [
                    [
                        "balanceKopecks",
                        "DESC",
                    ],
                ],
            });

        if (
            debtors.length === 0
        ) {
            await ctx.reply(
                "✅ Долгов нет."
            );

            return;
        }

        let total = 0n;

        const buttons = [];

        for (
            const debtor
            of debtors
            ) {
            total +=
                BigInt(
                    debtor
                        .balanceKopecks
                );

            buttons.push([
                Markup.button.callback(
                    `${debtor.name} — ${formatKopecks(
                        debtor
                            .balanceKopecks
                    )}`,
                    `debt_view_${debtor.id}`
                ),
            ]);
        }

        buttons.push([
            Markup.button.callback(
                "⬅️ Назад",
                "debt_home"
            ),
        ]);

        await ctx.reply(
            `👥 Должников: ${debtors.length}\n` +
            `💰 Всего должны: ${formatKopecks(
                total
            )}`,
            Markup.inlineKeyboard(
                buttons
            )
        );
    }
);

debtScene.action(
    /^debt_view_(\d+)$/,
    async (ctx) => {
        await ctx.answerCbQuery();

        const debtor =
            await getDebtor(
                debtorId
            );

        if (!debtor) {
            return;
        }

        const entries =
            await DebtEntry.findAll({
                where: {
                    debtorId:
                    debtor.id,
                },

                order: [
                    ["id", "DESC"],
                ],

                limit:
                    15,
            });

        let text =
            `👤 ${debtor.name}\n\n` +
            `Текущий долг: ${formatKopecks(
                debtor.balanceKopecks
            )}\n\n` +
            `📜 Последние операции:\n`;

        if (
            entries.length === 0
        ) {
            text +=
                "История пуста.";
        } else {
            for (
                const entry
                of entries
                ) {
                const sign =
                    entry.type ===
                    "debt"
                        ? "+"
                        : "−";

                text +=
                    `${entry.businessDate} ` +
                    `${sign}${formatKopecks(
                        entry.amountKopecks
                    )}\n`;
            }
        }

        await ctx.reply(
            text,
            Markup.inlineKeyboard([
                [
                    Markup.button.callback(
                        "⬅️ Назад",
                        "debt_home"
                    ),
                ],
            ])
        );
    }
);

/*
 * =========================
 * TEXT INPUT
 * =========================
 */

debtScene.on(
    "text",
    async (ctx) => {
        const text =
            ctx.message.text?.trim();

        if (
            text ===
            "❌ Отмена"
        ) {
            await ctx.reply(
                "Операция отменена.",
                getMainMenu()
            );

            return ctx.scene.leave();
        }

        const awaiting =
            ctx.scene.state.awaiting;

        if (
            awaiting ===
            "new_debtor_name"
        ) {
            if (!text) {
                await ctx.reply(
                    "Введите имя."
                );

                return;
            }

            ctx.scene.state.debtorName =
                text;

            ctx.scene.state.awaiting =
                "add_amount";

            await ctx.reply(
                `👤 ${text}\n\n` +
                `Введите сумму долга:`
            );

            return;
        }

        if (
            awaiting ===
            "add_amount"
        ) {
            const amount =
                parseMoneyToKopecks(
                    text
                );

            if (!amount) {
                await ctx.reply(
                    "Введите корректную сумму."
                );

                return;
            }

            ctx.scene.state.amountKopecks =
                amount.toString();

            ctx.scene.state.awaiting =
                null;

            await ctx.reply(
                `Записать долг?\n\n` +
                `👤 ${ctx.scene.state.debtorName}\n` +
                `➕ ${formatKopecks(
                    amount
                )}`,
                Markup.inlineKeyboard([
                    [
                        Markup.button.callback(
                            "✅ Записать",
                            "debt_add_confirm"
                        ),
                    ],
                    [
                        Markup.button.callback(
                            "❌ Отмена",
                            "debt_home"
                        ),
                    ],
                ])
            );

            return;
        }

        if (
            awaiting ===
            "payment_amount"
        ) {
            const amount =
                parseMoneyToKopecks(
                    text
                );

            if (!amount) {
                await ctx.reply(
                    "Введите корректную сумму."
                );

                return;
            }

            const debtor =
                await getDebtor(
                    debtorId
                );

            if (!debtor) {
                return;
            }

            const balance =
                BigInt(
                    debtor.balanceKopecks
                );

            if (
                amount >
                balance
            ) {
                await ctx.reply(
                    `Сумма больше текущего долга.\n\n` +
                    `Сейчас должен: ${formatKopecks(
                        balance
                    )}`
                );

                return;
            }

            ctx.scene.state.amountKopecks =
                amount.toString();

            ctx.scene.state.awaiting =
                null;

            await ctx.reply(
                `Записать погашение?\n\n` +
                `👤 ${debtor.name}\n` +
                `➖ ${formatKopecks(
                    amount
                )}`,
                Markup.inlineKeyboard([
                    [
                        Markup.button.callback(
                            "✅ Погасить",
                            "debt_payment_confirm"
                        ),
                    ],
                    [
                        Markup.button.callback(
                            "❌ Отмена",
                            "debt_home"
                        ),
                    ],
                ])
            );

            return;
        }
    }
);

/*
 * =========================
 * CONFIRMATIONS
 * =========================
 */

debtScene.action(
    "debt_add_confirm",
    async (ctx) => {
        await ctx.answerCbQuery();

        return saveDebt(ctx);
    }
);

debtScene.action(
    "debt_payment_confirm",
    async (ctx) => {
        await ctx.answerCbQuery();

        return savePayment(
            ctx,
            ctx.scene.state
                .debtorId,
            ctx.scene.state
                .amountKopecks
        );
    }
);

module.exports =
    debtScene;