const {
    Scenes,
    Markup,
} = require("telegraf");

const {
    Op,
} = require("sequelize");

const dayjs =
    require("dayjs");

const sequelize =
    require("../../config/database");

const {
    Supplier,
    PurchaseItem,
    PurchaseOrder,
    PurchaseOrderItem,
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

function resetState(ctx) {
    ctx.scene.state.awaiting =
        null;

    ctx.scene.state.order = {
        items: [],
    };

    ctx.scene.state.pendingItem =
        null;

    ctx.scene.state.pendingSupplierId =
        null;

    ctx.scene.state.returnAfterSupplierCreate =
        null;

    ctx.scene.state.returnAfterItemCreate =
        null;

    ctx.scene.state.manageSupplierId =
        null;

    ctx.scene.state.processing =
        false;
}

function normalizeQuantity(
    value
) {
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

function formatQuantity(
    value
) {
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

function normalizePhone(
    value
) {
    let digits =
        String(value || "")
            .replace(/\D/g, "");

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

function parseRuDate(
    value
) {
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

function getSelectedItem(
    order,
    itemId
) {
    return (
        order.items || []
    ).find(
        (item) =>
            Number(item.itemId) ===
            Number(itemId)
    );
}

function upsertSelectedItem(
    order,
    item,
    quantity
) {
    if (!order.items) {
        order.items = [];
    }

    const existing =
        getSelectedItem(
            order,
            item.id
        );

    if (existing) {
        existing.quantity =
            quantity;

        existing.itemName =
            item.name;

        existing.unit =
            item.unit;

        return;
    }

    order.items.push({
        itemId:
        item.id,

        itemName:
        item.name,

        unit:
        item.unit,

        quantity,
    });
}

function buildOrderMessage(
    order
) {
    let text =
        "Здравствуйте!\n\n";

    if (order.dateLabel) {
        text +=
            `Можно заказать ${order.dateLabel}:\n\n`;
    } else {
        text +=
            "Можно заказать:\n\n";
    }

    for (
        const item
        of order.items
        ) {
        text +=
            `${item.itemName} — ` +
            `${formatQuantity(
                item.quantity
            )} ${item.unit}\n`;
    }

    text +=
        `\nАдрес доставки:\n` +
        `${order.deliveryAddress}\n\n` +
        `Спасибо!`;

    return text;
}

function getOrderItemsText(
    order
) {
    return (
        order.items || []
    )
        .map(
            (item) =>
                `• ${item.itemName} — ` +
                `${formatQuantity(
                    item.quantity
                )} ${item.unit}`
        )
        .join("\n");
}

/*
 * =========================
 * HOME
 * =========================
 */

async function showHome(ctx) {
    resetState(ctx);

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
                    "👥 Поставщики и товары",
                    "purchase_suppliers"
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

/*
 * =========================
 * DESTINATION
 * =========================
 */

async function showDestinations(
    ctx
) {
    const projects =
        await getProjectsForUser(
            ctx.state.user
        );

    /*
     * В закупках показываем только
     * точки, у которых указан адрес.
     */
    const destinations =
        projects.filter(
            (project) =>
                project.purchaseAddress &&
                String(
                    project.purchaseAddress
                ).trim()
        );

    if (
        destinations.length === 0
    ) {
        await ctx.reply(
            "Нет точек с настроенным адресом доставки."
        );

        return;
    }

    const buttons =
        destinations.map(
            (project) => [
                Markup.button.callback(
                    `📍 ${project.name}`,
                    `purchase_destination_${project.id}`
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
        "📍 Куда заказать?",
        Markup.inlineKeyboard(
            buttons
        )
    );
}

/*
 * =========================
 * SUPPLIERS FOR ORDER
 * =========================
 */

async function showOrderSuppliers(
    ctx
) {
    const suppliers =
        await Supplier.findAll({
            where: {
                isActive: true,
            },

            order: [
                ["name", "ASC"],
            ],
        });

    const buttons =
        suppliers.map(
            (supplier) => [
                Markup.button.callback(
                    `👤 ${supplier.name}`,
                    `purchase_order_supplier_${supplier.id}`
                ),
            ]
        );

    buttons.push([
        Markup.button.callback(
            "➕ Новый поставщик",
            "purchase_supplier_new_order"
        ),
    ]);

    buttons.push([
        Markup.button.callback(
            "⬅️ Другая точка",
            "purchase_new"
        ),
    ]);

    await ctx.reply(
        "👤 У кого заказываем?",
        Markup.inlineKeyboard(
            buttons
        )
    );
}

/*
 * =========================
 * ITEMS FOR ORDER
 * =========================
 */

async function showOrderItems(
    ctx
) {
    const order =
        ctx.scene.state.order;

    const items =
        await PurchaseItem.findAll({
            where: {
                supplierId:
                order.supplierId,

                isActive:
                    true,
            },

            order: [
                ["name", "ASC"],
            ],
        });

    const buttons = [];

    for (
        const item
        of items
        ) {
        const selected =
            getSelectedItem(
                order,
                item.id
            );

        const label =
            selected
                ? (
                    `✅ ${item.name} — ` +
                    `${formatQuantity(
                        selected.quantity
                    )} ${item.unit}`
                )
                : `▫️ ${item.name}`;

        buttons.push([
            Markup.button.callback(
                label,
                `purchase_order_item_${item.id}`
            ),
        ]);
    }

    buttons.push([
        Markup.button.callback(
            "➕ Добавить товар",
            "purchase_item_new_order"
        ),
    ]);

    if (
        order.items &&
        order.items.length > 0
    ) {
        buttons.push([
            Markup.button.callback(
                `✅ Сформировать заказ (${order.items.length})`,
                "purchase_finish_items"
            ),
        ]);
    }

    buttons.push([
        Markup.button.callback(
            "⬅️ Другой поставщик",
            "purchase_change_supplier"
        ),
    ]);

    let text =
        `👤 ${order.supplierName}\n\n`;

    if (
        items.length === 0
    ) {
        text +=
            "У поставщика пока нет товаров.\n\n" +
            "Добавь первый товар.";
    } else {
        text +=
            "Выбери товар и укажи количество.\n\n" +
            "Можно выбрать несколько товаров.";
    }

    await ctx.reply(
        text,
        Markup.inlineKeyboard(
            buttons
        )
    );
}

async function askItemQuantity(
    ctx,
    item
) {
    ctx.scene.state.pendingItem = {
        id:
        item.id,

        name:
        item.name,

        unit:
        item.unit,
    };

    ctx.scene.state.awaiting =
        "order_item_quantity";

    await ctx.reply(
        `📦 ${item.name}\n` +
        `Единица: ${item.unit}\n\n` +
        `Введите количество:`,
        Markup.keyboard([
            ["❌ Отмена"],
        ]).resize()
    );
}

/*
 * =========================
 * DATE
 * =========================
 */

async function showDateSelection(
    ctx
) {
    await ctx.reply(
        "📅 На когда заказ?",
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

            [
                Markup.button.callback(
                    "⬅️ К товарам",
                    "purchase_back_to_items"
                ),
            ],
        ])
    );
}

/*
 * =========================
 * CONFIRMATION
 * =========================
 */

async function showConfirmation(
    ctx
) {
    const order =
        ctx.scene.state.order;

    order.messageText =
        buildOrderMessage(
            order
        );

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

    await ctx.reply(
        `🛒 Заказ\n\n` +
        `📍 ${order.projectName}\n` +
        `🏠 ${order.deliveryAddress}\n` +
        `👤 ${order.supplierName}\n` +
        `📅 ${dateText}\n\n` +

        `📦 Товары:\n` +
        `${getOrderItemsText(
            order
        )}\n\n` +

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
                    "⬅️ Изменить товары",
                    "purchase_back_to_items"
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
 * SUPPLIER MANAGEMENT
 * =========================
 */

async function showSupplierManagement(
    ctx
) {
    const suppliers =
        await Supplier.findAll({
            where: {
                isActive: true,
            },

            order: [
                ["name", "ASC"],
            ],
        });

    const buttons =
        suppliers.map(
            (supplier) => [
                Markup.button.callback(
                    `👤 ${supplier.name}`,
                    `purchase_manage_supplier_${supplier.id}`
                ),
            ]
        );

    buttons.push([
        Markup.button.callback(
            "➕ Новый поставщик",
            "purchase_supplier_new_manage"
        ),
    ]);

    buttons.push([
        Markup.button.callback(
            "⬅️ Назад",
            "purchase_home"
        ),
    ]);

    await ctx.reply(
        "👥 Поставщики и товары",
        Markup.inlineKeyboard(
            buttons
        )
    );
}

async function showSupplierCard(
    ctx,
    supplierId
) {
    const supplier =
        await Supplier.findOne({
            where: {
                id:
                supplierId,

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

    ctx.scene.state.manageSupplierId =
        supplier.id;

    const items =
        await PurchaseItem.findAll({
            where: {
                supplierId:
                supplier.id,

                isActive:
                    true,
            },

            order: [
                ["name", "ASC"],
            ],
        });

    let text =
        `👤 ${supplier.name}\n` +
        `📞 ${supplier.phone}\n\n` +
        `📦 Товары:\n`;

    if (
        items.length === 0
    ) {
        text +=
            "Товаров пока нет.";
    } else {
        for (
            const item
            of items
            ) {
            text +=
                `• ${item.name} (${item.unit})\n`;
        }
    }

    await ctx.reply(
        text,
        Markup.inlineKeyboard([
            [
                Markup.button.callback(
                    "➕ Добавить товар",
                    "purchase_item_new_manage"
                ),
            ],

            [
                Markup.button.callback(
                    "⬅️ К поставщикам",
                    "purchase_suppliers"
                ),
            ],
        ])
    );
}

/*
 * =========================
 * CREATE SUPPLIER
 * =========================
 */

async function beginSupplierCreate(
    ctx,
    returnTo
) {
    ctx.scene.state.returnAfterSupplierCreate =
        returnTo;

    ctx.scene.state.awaiting =
        "new_supplier_name";

    await ctx.reply(
        "👤 Введите имя или название поставщика:",
        Markup.keyboard([
            ["❌ Отмена"],
        ]).resize()
    );
}

/*
 * =========================
 * CREATE ITEM
 * =========================
 */

async function beginItemCreate(
    ctx,
    supplierId,
    returnTo
) {
    ctx.scene.state.pendingSupplierId =
        supplierId;

    ctx.scene.state.returnAfterItemCreate =
        returnTo;

    ctx.scene.state.awaiting =
        "new_item_name";

    await ctx.reply(
        "📦 Введите название товара:",
        Markup.keyboard([
            ["❌ Отмена"],
        ]).resize()
    );
}

/*
 * =========================
 * ENTER
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

        resetState(ctx);

        await showDestinations(
            ctx
        );
    }
);

purchaseScene.action(
    /^purchase_destination_(\d+)$/,
    async (ctx) => {
        await ctx.answerCbQuery();

        const project =
            await getProjectForUser(
                Number(
                    ctx.match[1]
                ),
                ctx.state.user
            );

        if (
            !project ||
            !project.purchaseAddress
        ) {
            await ctx.reply(
                "⛔ Эта точка недоступна для заказа."
            );

            return;
        }

        ctx.scene.state.order = {
            projectId:
            project.id,

            projectName:
            project.name,

            deliveryAddress:
            project.purchaseAddress,

            supplierId:
                null,

            supplierName:
                null,

            supplierPhone:
                null,

            items:
                [],
        };

        await showOrderSuppliers(
            ctx
        );
    }
);

/*
 * =========================
 * SELECT SUPPLIER
 * =========================
 */

purchaseScene.action(
    /^purchase_order_supplier_(\d+)$/,
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

        order.items = [];

        await showOrderItems(
            ctx
        );
    }
);

purchaseScene.action(
    "purchase_change_supplier",
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

        order.items = [];

        await showOrderSuppliers(
            ctx
        );
    }
);

/*
 * =========================
 * SELECT ITEM
 * =========================
 */

purchaseScene.action(
    /^purchase_order_item_(\d+)$/,
    async (ctx) => {
        await ctx.answerCbQuery();

        const order =
            ctx.scene.state.order;

        const item =
            await PurchaseItem.findOne({
                where: {
                    id:
                        Number(
                            ctx.match[1]
                        ),

                    supplierId:
                    order.supplierId,

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

        await askItemQuantity(
            ctx,
            item
        );
    }
);

purchaseScene.action(
    "purchase_finish_items",
    async (ctx) => {
        await ctx.answerCbQuery();

        const order =
            ctx.scene.state.order;

        if (
            !order.items ||
            order.items.length === 0
        ) {
            await ctx.reply(
                "Сначала выбери хотя бы один товар."
            );

            return;
        }

        await showDateSelection(
            ctx
        );
    }
);

purchaseScene.action(
    "purchase_back_to_items",
    async (ctx) => {
        await ctx.answerCbQuery();

        await showOrderItems(
            ctx
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

        const order =
            ctx.scene.state.order;

        order.orderForDate =
            getBusinessDate();

        order.dateLabel =
            "на сегодня";

        await showConfirmation(
            ctx
        );
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

        const order =
            ctx.scene.state.order;

        order.orderForDate =
            tomorrow;

        order.dateLabel =
            "на завтра";

        await showConfirmation(
            ctx
        );
    }
);

purchaseScene.action(
    "purchase_date_none",
    async (ctx) => {
        await ctx.answerCbQuery();

        const order =
            ctx.scene.state.order;

        order.orderForDate =
            null;

        order.dateLabel =
            null;

        await showConfirmation(
            ctx
        );
    }
);

purchaseScene.action(
    "purchase_date_custom",
    async (ctx) => {
        await ctx.answerCbQuery();

        ctx.scene.state.awaiting =
            "custom_date";

        await ctx.reply(
            "Введите дату:\n\n" +
            "Например: 16.09.2026",
            Markup.keyboard([
                ["❌ Отмена"],
            ]).resize()
        );
    }
);

/*
 * =========================
 * SAVE ORDER
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

        /*
         * Убираем кнопку подтверждения,
         * чтобы случайно не создать
         * один заказ дважды.
         */
        try {
            await ctx
                .editMessageReplyMarkup({
                    inline_keyboard: [],
                });
        } catch (_) {
            // Не критично.
        }

        try {
            const order =
                ctx.scene.state.order;

            if (
                !order.projectId ||
                !order.supplierId ||
                !order.deliveryAddress ||
                !order.items ||
                order.items.length === 0
            ) {
                throw new Error(
                    "Заказ заполнен не полностью"
                );
            }

            order.messageText =
                buildOrderMessage(
                    order
                );

            const createdOrder =
                await sequelize.transaction(
                    async (
                        dbTransaction
                    ) => {
                        const newOrder =
                            await PurchaseOrder.create(
                                {
                                    projectId:
                                    order.projectId,

                                    supplierId:
                                    order.supplierId,

                                    deliveryAddress:
                                    order.deliveryAddress,

                                    orderForDate:
                                        order.orderForDate ||
                                        null,

                                    messageText:
                                    order.messageText,

                                    createdBy:
                                    ctx.state.user.id,
                                },
                                {
                                    transaction:
                                    dbTransaction,
                                }
                            );

                        await PurchaseOrderItem.bulkCreate(
                            order.items.map(
                                (item) => ({
                                    orderId:
                                    newOrder.id,

                                    itemId:
                                    item.itemId,

                                    itemName:
                                    item.itemName,

                                    unit:
                                    item.unit,

                                    quantity:
                                    item.quantity,
                                })
                            ),
                            {
                                transaction:
                                dbTransaction,
                            }
                        );

                        return newOrder;
                    }
                );

            const smsUrl =
                buildSmsComposeUrl(
                    createdOrder.id
                );

            ctx.scene.state.processing =
                false;

            await ctx.reply(
                `✅ Заказ сохранён\n\n` +
                `📍 ${order.projectName}\n` +
                `🏠 ${order.deliveryAddress}\n` +
                `👤 ${order.supplierName}\n\n` +
                `${getOrderItemsText(
                    order
                )}`
            );

            await ctx.reply(
                "Заказ готов:",
                Markup.inlineKeyboard([
                    [
                        Markup.button.url(
                            "📱 Открыть SMS",
                            smsUrl
                        ),
                    ],

                    [
                        Markup.button.callback(
                            "➕ Ещё заказ",
                            "purchase_new"
                        ),
                    ],

                    [
                        Markup.button.callback(
                            "🕓 История",
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

        } catch (error) {
            ctx.scene.state.processing =
                false;

            console.error(
                "[PURCHASE CREATE]",
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
 * SUPPLIER MANAGEMENT
 * =========================
 */

purchaseScene.action(
    "purchase_suppliers",
    async (ctx) => {
        await ctx.answerCbQuery();

        await showSupplierManagement(
            ctx
        );
    }
);

purchaseScene.action(
    /^purchase_manage_supplier_(\d+)$/,
    async (ctx) => {
        await ctx.answerCbQuery();

        await showSupplierCard(
            ctx,
            Number(
                ctx.match[1]
            )
        );
    }
);

/*
 * =========================
 * CREATE SUPPLIER
 * =========================
 */

purchaseScene.action(
    "purchase_supplier_new_order",
    async (ctx) => {
        await ctx.answerCbQuery();

        await beginSupplierCreate(
            ctx,
            "order"
        );
    }
);

purchaseScene.action(
    "purchase_supplier_new_manage",
    async (ctx) => {
        await ctx.answerCbQuery();

        await beginSupplierCreate(
            ctx,
            "manage"
        );
    }
);

/*
 * =========================
 * CREATE ITEM
 * =========================
 */

purchaseScene.action(
    "purchase_item_new_order",
    async (ctx) => {
        await ctx.answerCbQuery();

        const supplierId =
            ctx.scene.state
                .order.supplierId;

        if (!supplierId) {
            await ctx.reply(
                "Сначала выбери поставщика."
            );

            return;
        }

        await beginItemCreate(
            ctx,
            supplierId,
            "order"
        );
    }
);

purchaseScene.action(
    "purchase_item_new_manage",
    async (ctx) => {
        await ctx.answerCbQuery();

        const supplierId =
            ctx.scene.state
                .manageSupplierId;

        if (!supplierId) {
            await ctx.reply(
                "Поставщик не выбран."
            );

            return;
        }

        await beginItemCreate(
            ctx,
            supplierId,
            "manage"
        );
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

        const projects =
            await getProjectsForUser(
                ctx.state.user
            );

        const projectIds =
            projects.map(
                (project) =>
                    project.id
            );

        if (
            projectIds.length === 0
        ) {
            await ctx.reply(
                "История заказов пуста."
            );

            return;
        }

        const orders =
            await PurchaseOrder.findAll({
                where: {
                    projectId: {
                        [Op.in]:
                        projectIds,
                    },
                },

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
                        Supplier,

                        as:
                            "supplier",

                        attributes: [
                            "name",
                        ],
                    },

                    {
                        model:
                        PurchaseOrderItem,

                        as:
                            "items",
                    },
                ],

                order: [
                    ["id", "DESC"],
                ],

                limit:
                    10,
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
            text +=
                `──────────────\n` +
                `${dayjs(
                    order.createdAt
                ).format(
                    "DD.MM.YYYY HH:mm"
                )}\n` +

                `📍 ${order.project?.name || "—"}\n` +
                `👤 ${order.supplier?.name || "—"}\n` +
                `🏠 ${order.deliveryAddress}\n\n`;

            for (
                const item
                of order.items || []
                ) {
                text +=
                    `• ${item.itemName} — ` +
                    `${formatQuantity(
                        item.quantity
                    )} ${item.unit}\n`;
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
            ctx.message.text
                ?.trim();

        /*
         * Если нажали отмену во время
         * текстового ввода.
         */
        if (
            text ===
            "❌ Отмена"
        ) {
            await ctx.reply(
                "Действие отменено.",
                getMainMenu()
            );

            return ctx.scene.leave();
        }

        const awaiting =
            ctx.scene.state
                .awaiting;

        /*
         * =========================
         * SUPPLIER NAME
         * =========================
         */

        if (
            awaiting ===
            "new_supplier_name"
        ) {
            if (
                !text ||
                text.length > 255
            ) {
                await ctx.reply(
                    "Введите корректное имя поставщика."
                );

                return;
            }

            ctx.scene.state
                .newSupplierName =
                text;

            ctx.scene.state.awaiting =
                "new_supplier_phone";

            await ctx.reply(
                `👤 ${text}\n\n` +
                `Введите номер телефона:`,
                Markup.keyboard([
                    ["❌ Отмена"],
                ]).resize()
            );

            return;
        }

        /*
         * =========================
         * SUPPLIER PHONE
         * =========================
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
                    "Введите корректный номер.\n\n" +
                    "Например: +79781234567"
                );

                return;
            }

            const supplier =
                await Supplier.create({
                    name:
                    ctx.scene.state
                        .newSupplierName,

                    phone,

                    createdBy:
                    ctx.state.user.id,
                });

            const returnTo =
                ctx.scene.state
                    .returnAfterSupplierCreate;

            ctx.scene.state.awaiting =
                null;

            await ctx.reply(
                `✅ Поставщик «${supplier.name}» создан.`,
                Markup.removeKeyboard()
            );

            if (
                returnTo ===
                "order"
            ) {
                const order =
                    ctx.scene.state.order;

                order.supplierId =
                    supplier.id;

                order.supplierName =
                    supplier.name;

                order.supplierPhone =
                    supplier.phone;

                order.items = [];

                await showOrderItems(
                    ctx
                );

                return;
            }

            ctx.scene.state
                .manageSupplierId =
                supplier.id;

            await showSupplierCard(
                ctx,
                supplier.id
            );

            return;
        }

        /*
         * =========================
         * ITEM NAME
         * =========================
         */

        if (
            awaiting ===
            "new_item_name"
        ) {
            if (
                !text ||
                text.length > 255
            ) {
                await ctx.reply(
                    "Введите корректное название товара."
                );

                return;
            }

            ctx.scene.state
                .newItemName =
                text;

            ctx.scene.state.awaiting =
                "new_item_unit";

            await ctx.reply(
                `📦 ${text}\n\n` +
                `Единица измерения:`,
                Markup.keyboard([
                    ["шт.", "кг"],
                    ["уп.", "ящик"],
                    ["л", "бут."],
                    ["❌ Отмена"],
                ]).resize()
            );

            return;
        }

        /*
         * =========================
         * ITEM UNIT
         * =========================
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
                    "Введите корректную единицу измерения."
                );

                return;
            }

            const supplierId =
                ctx.scene.state
                    .pendingSupplierId;

            if (!supplierId) {
                await ctx.reply(
                    "Не удалось определить поставщика."
                );

                return;
            }

            const item =
                await PurchaseItem.create({
                    supplierId,

                    name:
                    ctx.scene.state
                        .newItemName,

                    unit:
                    text,

                    createdBy:
                    ctx.state.user.id,
                });

            const returnTo =
                ctx.scene.state
                    .returnAfterItemCreate;

            ctx.scene.state.awaiting =
                null;

            await ctx.reply(
                `✅ Товар «${item.name}» добавлен.`,
                Markup.removeKeyboard()
            );

            /*
             * Если товар создавали прямо
             * во время заказа —
             * сразу спрашиваем количество.
             */
            if (
                returnTo ===
                "order"
            ) {
                await askItemQuantity(
                    ctx,
                    item
                );

                return;
            }

            await showSupplierCard(
                ctx,
                supplierId
            );

            return;
        }

        /*
         * =========================
         * QUANTITY
         * =========================
         */

        if (
            awaiting ===
            "order_item_quantity"
        ) {
            const quantity =
                normalizeQuantity(
                    text
                );

            if (!quantity) {
                await ctx.reply(
                    "Введите корректное количество.\n\n" +
                    "Например:\n" +
                    "50\n" +
                    "12,5"
                );

                return;
            }

            const pendingItem =
                ctx.scene.state
                    .pendingItem;

            if (!pendingItem) {
                await ctx.reply(
                    "Товар не найден."
                );

                return;
            }

            upsertSelectedItem(
                ctx.scene.state.order,
                pendingItem,
                quantity
            );

            ctx.scene.state.awaiting =
                null;

            ctx.scene.state.pendingItem =
                null;

            await ctx.reply(
                `✅ ${pendingItem.name} — ` +
                `${formatQuantity(
                    quantity
                )} ${pendingItem.unit}`,
                Markup.removeKeyboard()
            );

            await showOrderItems(
                ctx
            );

            return;
        }

        /*
         * =========================
         * CUSTOM DATE
         * =========================
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
                    "Пример: 16.09.2026"
                );

                return;
            }

            const order =
                ctx.scene.state.order;

            order.orderForDate =
                date;

            order.dateLabel =
                `на ${dayjs(
                    date
                ).format(
                    "DD.MM.YYYY"
                )}`;

            ctx.scene.state.awaiting =
                null;

            await ctx.reply(
                "✅ Дата выбрана.",
                Markup.removeKeyboard()
            );

            await showConfirmation(
                ctx
            );
        }
    }
);

module.exports =
    purchaseScene;