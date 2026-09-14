const {
    Scenes,
    Markup,
} = require("telegraf");

const dayjs =
    require("dayjs");

const {
    Supplier,
    PurchaseItem,
    PurchaseOrder,
    Project,
} = require("../../models");

const {
    getProjectsForUser,
    getProjectForUser,
} = require(
    "../../services/projectService"
);

const {
    getBusinessDate,
} = require(
    "../../utils/businessDate"
);

const {
    buildSmsComposeUrl,
} = require(
    "../../services/purchaseSmsService"
);

const {
    getMainMenu,
} = require(
    "../keyboards/mainMenu"
);

const purchaseScene =
    new Scenes.BaseScene(
        "purchase"
    );

/*
 * =========================
 * HELPERS
 * =========================
 */

function resetOrderState(ctx) {
    ctx.scene.state.awaiting =
        null;

    ctx.scene.state.order = {};
}

function normalizeQuantity(value) {
    const normalized =
        String(value || "")
            .trim()
            .replace(",", ".");

    if (
        !/^\d+(?:\.\d{1,3})?$/.test(
            normalized
        )
    ) {
        return null;
    }

    const number =
        Number(normalized);

    if (
        !Number.isFinite(number) ||
        number <= 0
    ) {
        return null;
    }

    return normalized;
}

function formatQuantity(value) {
    const stringValue =
        String(value);

    if (
        !stringValue.includes(".")
    ) {
        return stringValue;
    }

    return stringValue
        .replace(/0+$/, "")
        .replace(/\.$/, "");
}

function normalizePhone(value) {
    let digits =
        String(value || "")
            .replace(/\D/g, "");

    /*
     * Российский номер:
     * 8 978... -> 7 978...
     */
    if (
        digits.length === 11 &&
        digits.startsWith("8")
    ) {
        digits =
            "7" +
            digits.slice(1);
    }

    if (
        digits.length < 10 ||
        digits.length > 15
    ) {
        return null;
    }

    return `+${digits}`;
}

function parseRuDate(value) {
    const match =
        String(value || "")
            .trim()
            .match(
                /^(\d{2})\.(\d{2})\.(\d{4})$/
            );

    if (!match) {
        return null;
    }

    const [
        ,
        day,
        month,
        year,
    ] = match;

    const iso =
        `${year}-${month}-${day}`;

    const parsed =
        dayjs(iso);

    if (
        !parsed.isValid() ||
        parsed.format(
            "YYYY-MM-DD"
        ) !== iso
    ) {
        return null;
    }

    return iso;
}

function buildMessage(
    item,
    quantity,
    dateLabel
) {
    let text =
        `Здравствуйте! ` +
        `Можно заказать ` +
        `${item.name} — ` +
        `${formatQuantity(
            quantity
        )} ${item.unit}`;

    if (dateLabel) {
        text +=
            ` ${dateLabel}`;
    }

    text +=
        `? Спасибо.`;

    return text;
}

async function showHome(ctx) {
    resetOrderState(ctx);

    await ctx.reply(
        "🛒 Заказать\n\n" +
        "Что нужно сделать?",
        Markup.inlineKeyboard([
            [
                Markup.button.callback(
                    "➕ Новый заказ",
                    "purchase_new"
                ),
            ],
            [
                Markup.button.callback(
                    "🕓 История заказов",
                    "purchase_history"
                ),
            ],
            [
                Markup.button.callback(
                    "⬅️ Главное меню",
                    "purchase_exit"
                ),
            ],
        ])
    );
}

async function showProjects(
    ctx
) {
    const projects =
        await getProjectsForUser(
            ctx.state.user
        );

    if (
        !projects ||
        projects.length === 0
    ) {
        await ctx.reply(
            "Нет доступных проектов."
        );

        return;
    }

    const buttons =
        projects.map(
            (project) => [
                Markup.button.callback(
                    `🏢 ${project.name}`,
                    `purchase_project_${project.id}`
                ),
            ]
        );

    buttons.push([
        Markup.button.callback(
            "⬅️ Назад",
            "purchase_home"
        ),
    ]);

    await ctx.reply(
        "🏢 Для какого проекта заказ?",
        Markup.inlineKeyboard(
            buttons
        )
    );
}

async function showItems(
    ctx
) {
    const order =
        ctx.scene.state.order;

    const items =
        await PurchaseItem.findAll({
            where: {
                projectId:
                order.projectId,

                isActive:
                    true,
            },

            order: [
                ["name", "ASC"],
            ],
        });

    const buttons =
        items.map(
            (item) => [
                Markup.button.callback(
                    `📦 ${item.name}`,
                    `purchase_item_${item.id}`
                ),
            ]
        );

    buttons.push([
        Markup.button.callback(
            "➕ Новый товар",
            "purchase_item_new"
        ),
    ]);

    buttons.push([
        Markup.button.callback(
            "⬅️ Назад",
            "purchase_new"
        ),
    ]);

    await ctx.reply(
        `🏢 ${order.projectName}\n\n` +
        `Что заказываем?`,
        Markup.inlineKeyboard(
            buttons
        )
    );
}

async function askQuantity(
    ctx,
    item
) {
    const order =
        ctx.scene.state.order;

    order.itemId =
        item.id;

    order.itemName =
        item.name;

    order.unit =
        item.unit;

    order.defaultSupplierId =
        item.defaultSupplierId;

    ctx.scene.state.awaiting =
        "quantity";

    await ctx.reply(
        `📦 ${item.name}\n` +
        `Единица: ${item.unit}\n\n` +
        `Введите количество:`,
        Markup.keyboard([
            ["❌ Отмена"],
        ]).resize()
    );
}

async function showDateSelection(
    ctx
) {
    await ctx.reply(
        "📅 На когда заказать?",
        Markup.inlineKeyboard([
            [
                Markup.button.callback(
                    "Завтра",
                    "purchase_date_tomorrow"
                ),

                Markup.button.callback(
                    "Сегодня",
                    "purchase_date_today"
                ),
            ],

            [
                Markup.button.callback(
                    "✏️ Другая дата",
                    "purchase_date_custom"
                ),
            ],

            [
                Markup.button.callback(
                    "Без даты",
                    "purchase_date_none"
                ),
            ],
        ])
    );
}

async function showSuppliers(
    ctx
) {
    const order =
        ctx.scene.state.order;

    const suppliers =
        await Supplier.findAll({
            where: {
                isActive:
                    true,
            },

            order: [
                ["name", "ASC"],
            ],
        });

    const buttons = [];

    /*
     * Сначала показываем
     * поставщика по умолчанию.
     */
    if (
        order.defaultSupplierId
    ) {
        const defaultSupplier =
            suppliers.find(
                (supplier) =>
                    supplier.id ===
                    order.defaultSupplierId
            );

        if (defaultSupplier) {
            buttons.push([
                Markup.button.callback(
                    `⭐ ${defaultSupplier.name}`,
                    `purchase_supplier_${defaultSupplier.id}`
                ),
            ]);
        }
    }

    for (
        const supplier
        of suppliers
        ) {
        if (
            supplier.id ===
            order.defaultSupplierId
        ) {
            continue;
        }

        buttons.push([
            Markup.button.callback(
                `👤 ${supplier.name}`,
                `purchase_supplier_${supplier.id}`
            ),
        ]);
    }

    buttons.push([
        Markup.button.callback(
            "➕ Новый поставщик",
            "purchase_supplier_new"
        ),
    ]);

    buttons.push([
        Markup.button.callback(
            "Без поставщика",
            "purchase_supplier_none"
        ),
    ]);

    await ctx.reply(
        "👤 У кого заказать?",
        Markup.inlineKeyboard(
            buttons
        )
    );
}

async function showConfirmation(
    ctx
) {
    const order =
        ctx.scene.state.order;

    const supplierText =
        order.supplierName ||
        "Не выбран";

    let dateText =
        "Не указана";

    if (
        order.orderForDate
    ) {
        dateText =
            dayjs(
                order.orderForDate
            ).format(
                "DD.MM.YYYY"
            );
    }

    const item =
        await PurchaseItem.findByPk(
            order.itemId
        );

    if (!item) {
        await ctx.reply(
            "Товар не найден."
        );

        return;
    }

    order.messageText =
        buildMessage(
            item,
            order.quantity,
            order.dateLabel
        );

    await ctx.reply(
        `🛒 Заказ\n\n` +
        `🏢 ${order.projectName}\n` +
        `📦 ${order.itemName}\n` +
        `🔢 ${formatQuantity(
            order.quantity
        )} ${order.unit}\n` +
        `📅 ${dateText}\n` +
        `👤 ${supplierText}\n\n` +
        `💬 Сообщение:\n\n` +
        `${order.messageText}`,
        Markup.inlineKeyboard([
            [
                Markup.button.callback(
                    "✅ Сохранить заказ",
                    "purchase_confirm"
                ),
            ],
            [
                Markup.button.callback(
                    "❌ Отмена",
                    "purchase_home"
                ),
            ],
        ])
    );
}

/*
 * =========================
 * ENTER / HOME
 * =========================
 */

purchaseScene.enter(
    async (ctx) => {
        await showHome(ctx);
    }
);

purchaseScene.action(
    "purchase_home",
    async (ctx) => {
        await ctx.answerCbQuery();

        await showHome(ctx);
    }
);

purchaseScene.action(
    "purchase_exit",
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
 * NEW ORDER
 * =========================
 */

purchaseScene.action(
    "purchase_new",
    async (ctx) => {
        await ctx.answerCbQuery();

        resetOrderState(ctx);

        await showProjects(ctx);
    }
);

purchaseScene.action(
    /^purchase_project_(\d+)$/,
    async (ctx) => {
        await ctx.answerCbQuery();

        const project =
            await getProjectForUser(
                Number(
                    ctx.match[1]
                ),
                ctx.state.user
            );

        if (!project) {
            await ctx.reply(
                "⛔ Проект недоступен."
            );

            return;
        }

        ctx.scene.state.order = {
            projectId:
            project.id,

            projectName:
            project.name,
        };

        await showItems(ctx);
    }
);

/*
 * =========================
 * ITEM
 * =========================
 */

purchaseScene.action(
    /^purchase_item_(\d+)$/,
    async (ctx) => {
        await ctx.answerCbQuery();

        const item =
            await PurchaseItem.findOne({
                where: {
                    id:
                        Number(
                            ctx.match[1]
                        ),

                    projectId:
                    ctx.scene.state
                        .order.projectId,

                    isActive:
                        true,
                },
            });

        if (!item) {
            await ctx.reply(
                "Товар не найден."
            );

            return;
        }

        await askQuantity(
            ctx,
            item
        );
    }
);

purchaseScene.action(
    "purchase_item_new",
    async (ctx) => {
        await ctx.answerCbQuery();

        ctx.scene.state.awaiting =
            "new_item_name";

        await ctx.reply(
            "📦 Введите название товара:",
            Markup.keyboard([
                ["❌ Отмена"],
            ]).resize()
        );
    }
);

/*
 * =========================
 * DATE
 * =========================
 */

purchaseScene.action(
    "purchase_date_today",
    async (ctx) => {
        await ctx.answerCbQuery();

        const today =
            getBusinessDate();

        ctx.scene.state.order
            .orderForDate =
            today;

        ctx.scene.state.order
            .dateLabel =
            "на сегодня";

        await showSuppliers(ctx);
    }
);

purchaseScene.action(
    "purchase_date_tomorrow",
    async (ctx) => {
        await ctx.answerCbQuery();

        const tomorrow =
            dayjs(
                getBusinessDate()
            )
                .add(
                    1,
                    "day"
                )
                .format(
                    "YYYY-MM-DD"
                );

        ctx.scene.state.order
            .orderForDate =
            tomorrow;

        ctx.scene.state.order
            .dateLabel =
            "на завтра";

        await showSuppliers(ctx);
    }
);

purchaseScene.action(
    "purchase_date_none",
    async (ctx) => {
        await ctx.answerCbQuery();

        ctx.scene.state.order
            .orderForDate =
            null;

        ctx.scene.state.order
            .dateLabel =
            null;

        await showSuppliers(ctx);
    }
);

purchaseScene.action(
    "purchase_date_custom",
    async (ctx) => {
        await ctx.answerCbQuery();

        ctx.scene.state.awaiting =
            "custom_date";

        await ctx.reply(
            "Введите дату в формате:\n\n" +
            "15.09.2026",
            Markup.keyboard([
                ["❌ Отмена"],
            ]).resize()
        );
    }
);

/*
 * =========================
 * SUPPLIER
 * =========================
 */

purchaseScene.action(
    /^purchase_supplier_(\d+)$/,
    async (ctx) => {
        await ctx.answerCbQuery();

        const supplier =
            await Supplier.findOne({
                where: {
                    id:
                        Number(
                            ctx.match[1]
                        ),

                    isActive:
                        true,
                },
            });

        if (!supplier) {
            await ctx.reply(
                "Поставщик не найден."
            );

            return;
        }

        const order =
            ctx.scene.state.order;

        order.supplierId =
            supplier.id;

        order.supplierName =
            supplier.name;

        order.supplierPhone =
            supplier.phone;

        /*
         * Если у товара ещё нет
         * поставщика по умолчанию,
         * запоминаем первого выбранного.
         */
        if (
            !order.defaultSupplierId
        ) {
            await PurchaseItem.update(
                {
                    defaultSupplierId:
                    supplier.id,
                },
                {
                    where: {
                        id:
                        order.itemId,
                    },
                }
            );

            order.defaultSupplierId =
                supplier.id;
        }

        await showConfirmation(
            ctx
        );
    }
);

purchaseScene.action(
    "purchase_supplier_none",
    async (ctx) => {
        await ctx.answerCbQuery();

        const order =
            ctx.scene.state.order;

        order.supplierId =
            null;

        order.supplierName =
            null;

        order.supplierPhone =
            null;

        await showConfirmation(
            ctx
        );
    }
);

purchaseScene.action(
    "purchase_supplier_new",
    async (ctx) => {
        await ctx.answerCbQuery();

        ctx.scene.state.awaiting =
            "new_supplier_name";

        await ctx.reply(
            "👤 Введите название поставщика:",
            Markup.keyboard([
                ["❌ Отмена"],
            ]).resize()
        );
    }
);

/*
 * =========================
 * CONFIRM
 * =========================
 */

purchaseScene.action(
    "purchase_confirm",
    async (ctx) => {
        await ctx.answerCbQuery();

        if (
            ctx.scene.state.processing
        ) {
            return;
        }

        ctx.scene.state.processing =
            true;

        try {
            const order =
                ctx.scene.state.order;

            const createdOrder =
                await PurchaseOrder.create({
                    projectId:
                    order.projectId,

                    itemId:
                    order.itemId,

                    supplierId:
                        order.supplierId ||
                        null,

                    quantity:
                    order.quantity,

                    orderForDate:
                        order.orderForDate ||
                        null,

                    messageText:
                    order.messageText,

                    createdBy:
                    ctx.state.user.id,
                });

            ctx.scene.state.processing =
                false;

            await ctx.reply(
                `✅ Заказ сохранён\n\n` +
                `📦 ${order.itemName}\n` +
                `🔢 ${formatQuantity(
                    order.quantity
                )} ${order.unit}\n` +
                (
                    order.supplierName
                        ? `👤 ${order.supplierName}\n`
                        : ""
                ) +
                `\n💬 ${order.messageText}`
            );

            let smsUrl =
                null;

            if (
                order.supplierId &&
                order.supplierPhone
            ) {
                smsUrl =
                    buildSmsComposeUrl(
                        createdOrder.id
                    );
            }

            /*
             * SMS-кнопку добавим
             * следующим шагом.
             */
            const buttons = [];

            if (smsUrl) {
                buttons.push([
                    Markup.button.url(
                        "📱 Открыть SMS",
                        smsUrl
                    ),
                ]);
            }

            buttons.push([
                Markup.button.callback(
                    "➕ Ещё заказ",
                    "purchase_new"
                ),
            ]);

            buttons.push([
                Markup.button.callback(
                    "🕓 История",
                    "purchase_history"
                ),
            ]);

            buttons.push([
                Markup.button.callback(
                    "⬅️ Главное меню",
                    "purchase_exit"
                ),
            ]);

            await ctx.reply(
                smsUrl
                    ? "Заказ готов. Можно открыть SMS:"
                    : "Заказ сохранён без поставщика.",
                Markup.inlineKeyboard(
                    buttons
                )
            );

            console.log(
                `[PURCHASE] order=${createdOrder.id}`
            );
        } catch (error) {
            ctx.scene.state.processing =
                false;

            console.error(
                "Ошибка создания заказа:",
                error
            );

            await ctx.reply(
                "❌ Не удалось сохранить заказ."
            );
        }
    }
);

/*
 * =========================
 * HISTORY
 * =========================
 */

purchaseScene.action(
    "purchase_history",
    async (ctx) => {
        await ctx.answerCbQuery();

        const orders =
            await PurchaseOrder.findAll({
                include: [
                    {
                        model:
                        Project,

                        as:
                            "project",

                        attributes: [
                            "name",
                        ],
                    },

                    {
                        model:
                        PurchaseItem,

                        as:
                            "item",

                        attributes: [
                            "name",
                            "unit",
                        ],
                    },

                    {
                        model:
                        Supplier,

                        as:
                            "supplier",

                        attributes: [
                            "name",
                        ],

                        required:
                            false,
                    },
                ],

                order: [
                    ["id", "DESC"],
                ],

                limit:
                    15,
            });

        if (
            orders.length === 0
        ) {
            await ctx.reply(
                "🕓 История заказов пуста."
            );

            return;
        }

        let text =
            "🕓 Последние заказы\n\n";

        for (
            const order
            of orders
            ) {
            const createdDate =
                dayjs(
                    order.createdAt
                ).format(
                    "DD.MM.YYYY"
                );

            text +=
                `${createdDate}\n` +
                `🏢 ${order.project?.name || "—"}\n` +
                `📦 ${order.item?.name || "—"} — ` +
                `${formatQuantity(
                    order.quantity
                )} ` +
                `${order.item?.unit || ""}\n`;

            if (
                order.supplier
            ) {
                text +=
                    `👤 ${order.supplier.name}\n`;
            }

            text += "\n";
        }

        await ctx.reply(
            text,
            Markup.inlineKeyboard([
                [
                    Markup.button.callback(
                        "⬅️ Назад",
                        "purchase_home"
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

purchaseScene.on(
    "text",
    async (ctx) => {
        const text =
            ctx.message.text?.trim();

        if (
            text ===
            "❌ Отмена"
        ) {
            await ctx.reply(
                "Заказ отменён.",
                getMainMenu()
            );

            return ctx.scene.leave();
        }

        const awaiting =
            ctx.scene.state.awaiting;

        /*
         * Новый товар
         */
        if (
            awaiting ===
            "new_item_name"
        ) {
            if (!text) {
                await ctx.reply(
                    "Введите название товара."
                );

                return;
            }

            ctx.scene.state.order
                .newItemName =
                text;

            ctx.scene.state.awaiting =
                "new_item_unit";

            await ctx.reply(
                `📦 ${text}\n\n` +
                `Введите единицу измерения.\n\n` +
                `Например:\n` +
                `шт.\nкг\nл\nуп.`,
                Markup.keyboard([
                    ["шт.", "кг"],
                    ["л", "уп."],
                    ["❌ Отмена"],
                ]).resize()
            );

            return;
        }

        /*
         * Единица нового товара
         */
        if (
            awaiting ===
            "new_item_unit"
        ) {
            if (
                !text ||
                text.length > 50
            ) {
                await ctx.reply(
                    "Введите корректную единицу."
                );

                return;
            }

            const item =
                await PurchaseItem.create({
                    projectId:
                    ctx.scene.state
                        .order.projectId,

                    name:
                    ctx.scene.state
                        .order.newItemName,

                    unit:
                    text,

                    createdBy:
                    ctx.state.user.id,
                });

            ctx.scene.state.awaiting =
                null;

            await askQuantity(
                ctx,
                item
            );

            return;
        }

        /*
         * Количество
         */
        if (
            awaiting ===
            "quantity"
        ) {
            const quantity =
                normalizeQuantity(
                    text
                );

            if (!quantity) {
                await ctx.reply(
                    "Введите корректное количество.\n\n" +
                    "Например: 50 или 12,5"
                );

                return;
            }

            ctx.scene.state.order
                .quantity =
                quantity;

            ctx.scene.state.awaiting =
                null;

            await showDateSelection(
                ctx
            );

            return;
        }

        /*
         * Своя дата
         */
        if (
            awaiting ===
            "custom_date"
        ) {
            const date =
                parseRuDate(
                    text
                );

            if (!date) {
                await ctx.reply(
                    "Некорректная дата.\n\n" +
                    "Пример: 15.09.2026"
                );

                return;
            }

            ctx.scene.state.order
                .orderForDate =
                date;

            ctx.scene.state.order
                .dateLabel =
                `на ${dayjs(
                    date
                ).format(
                    "DD.MM.YYYY"
                )}`;

            ctx.scene.state.awaiting =
                null;

            await showSuppliers(
                ctx
            );

            return;
        }

        /*
         * Новый поставщик
         */
        if (
            awaiting ===
            "new_supplier_name"
        ) {
            if (!text) {
                await ctx.reply(
                    "Введите название поставщика."
                );

                return;
            }

            ctx.scene.state.order
                .newSupplierName =
                text;

            ctx.scene.state.awaiting =
                "new_supplier_phone";

            await ctx.reply(
                `👤 ${text}\n\n` +
                `Введите номер телефона поставщика:`,
                Markup.keyboard([
                    ["❌ Отмена"],
                ]).resize()
            );

            return;
        }

        /*
         * Телефон нового поставщика
         */
        if (
            awaiting ===
            "new_supplier_phone"
        ) {
            const phone =
                normalizePhone(
                    text
                );

            if (!phone) {
                await ctx.reply(
                    "Введите корректный номер телефона.\n\n" +
                    "Например: +79781234567"
                );

                return;
            }

            const supplier =
                await Supplier.create({
                    name:
                    ctx.scene.state
                        .order
                        .newSupplierName,

                    phone,

                    createdBy:
                    ctx.state.user.id,
                });

            const order =
                ctx.scene.state.order;

            order.supplierId =
                supplier.id;

            order.supplierName =
                supplier.name;

            order.supplierPhone =
                supplier.phone;

            if (
                !order.defaultSupplierId
            ) {
                await PurchaseItem.update(
                    {
                        defaultSupplierId:
                        supplier.id,
                    },
                    {
                        where: {
                            id:
                            order.itemId,
                        },
                    }
                );

                order.defaultSupplierId =
                    supplier.id;
            }

            ctx.scene.state.awaiting =
                null;

            await showConfirmation(
                ctx
            );

            return;
        }
    }
);

module.exports =
    purchaseScene;