const User = require("./User");
const Project = require("./Project");
const ProjectUser = require("./ProjectUser");
const Category = require("./Category");
const PaymentMethod = require("./PaymentMethod");
const Transaction = require("./Transaction");
const DailyClosure = require("./DailyClosure");
const CampCardEvent = require("./CampCardEvent");
const Debtor = require("./Debtor");
const DebtEntry = require("./DebtEntry");
const Supplier = require("./Supplier");
const PurchaseItem = require("./PurchaseItem");
const PurchaseOrder = require("./PurchaseOrder");

/*
 * User ↔ ProjectUser
 */

User.hasMany(ProjectUser, {
    foreignKey: "userId",
    as: "projectAccess",
});

ProjectUser.belongsTo(User, {
    foreignKey: "userId",
    as: "user",
});

/*
 * Project ↔ ProjectUser
 */

Project.hasMany(ProjectUser, {
    foreignKey: "projectId",
    as: "users",
});

ProjectUser.belongsTo(Project, {
    foreignKey: "projectId",
    as: "project",
});

/*
 * Project ↔ Category
 */

Project.hasMany(Category, {
    foreignKey: "projectId",
    as: "categories",
});

Category.belongsTo(Project, {
    foreignKey: "projectId",
    as: "project",
});

/*
 * Project ↔ PaymentMethod
 */

Project.hasMany(PaymentMethod, {
    foreignKey: "projectId",
    as: "paymentMethods",
});

PaymentMethod.belongsTo(Project, {
    foreignKey: "projectId",
    as: "project",
});

/*
 * Project ↔ Transaction
 */

Project.hasMany(Transaction, {
    foreignKey: "projectId",
    as: "transactions",
});

Transaction.belongsTo(Project, {
    foreignKey: "projectId",
    as: "project",
});

/*
 * Category ↔ Transaction
 */

Category.hasMany(Transaction, {
    foreignKey: "categoryId",
    as: "transactions",
});

Transaction.belongsTo(Category, {
    foreignKey: "categoryId",
    as: "category",
});

/*
 * PaymentMethod ↔ Transaction
 */

PaymentMethod.hasMany(Transaction, {
    foreignKey: "paymentMethodId",
    as: "transactions",
});

Transaction.belongsTo(PaymentMethod, {
    foreignKey: "paymentMethodId",
    as: "paymentMethod",
});

/*
 * Project ↔ DailyClosure
 */

Project.hasMany(DailyClosure, {
    foreignKey: "projectId",
    as: "dailyClosures",
});

DailyClosure.belongsTo(Project, {
    foreignKey: "projectId",
    as: "project",
});

/*
 * DailyClosure ↔ Transaction
 */

DailyClosure.hasMany(Transaction, {
    foreignKey: "closureId",
    as: "incomeTransactions",
});

Transaction.belongsTo(DailyClosure, {
    foreignKey: "closureId",
    as: "closure",
});

/*
 * User ↔ DailyClosure
 */

User.hasMany(DailyClosure, {
    foreignKey: "closedBy",
    as: "closedDays",
});

DailyClosure.belongsTo(User, {
    foreignKey: "closedBy",
    as: "closedByUser",
});

/*
 * Debtor ↔ DebtEntry
 */

Debtor.hasMany(DebtEntry, {
    foreignKey: "debtorId",
    as: "entries",
});

DebtEntry.belongsTo(Debtor, {
    foreignKey: "debtorId",
    as: "debtor",
});

/*
 * User ↔ debts
 */

User.hasMany(Debtor, {
    foreignKey: "createdBy",
    as: "createdDebtors",
});

Debtor.belongsTo(User, {
    foreignKey: "createdBy",
    as: "createdByUser",
});

User.hasMany(DebtEntry, {
    foreignKey: "createdBy",
    as: "createdDebtEntries",
});

DebtEntry.belongsTo(User, {
    foreignKey: "createdBy",
    as: "createdByUser",
});

Project.hasMany(
    PurchaseItem,
    {
        foreignKey: "projectId",
        as: "purchaseItems",
    }
);

PurchaseItem.belongsTo(
    Project,
    {
        foreignKey: "projectId",
        as: "project",
    }
);

Supplier.hasMany(
    PurchaseItem,
    {
        foreignKey:
            "defaultSupplierId",

        as:
            "defaultItems",
    }
);

PurchaseItem.belongsTo(
    Supplier,
    {
        foreignKey:
            "defaultSupplierId",

        as:
            "defaultSupplier",
    }
);

Project.hasMany(
    PurchaseOrder,
    {
        foreignKey: "projectId",
        as: "purchaseOrders",
    }
);

PurchaseOrder.belongsTo(
    Project,
    {
        foreignKey: "projectId",
        as: "project",
    }
);

PurchaseItem.hasMany(
    PurchaseOrder,
    {
        foreignKey: "itemId",
        as: "orders",
    }
);

PurchaseOrder.belongsTo(
    PurchaseItem,
    {
        foreignKey: "itemId",
        as: "item",
    }
);

Supplier.hasMany(
    PurchaseOrder,
    {
        foreignKey: "supplierId",
        as: "orders",
    }
);

PurchaseOrder.belongsTo(
    Supplier,
    {
        foreignKey: "supplierId",
        as: "supplier",
    }
);

module.exports = {
    User,
    Project,
    ProjectUser,
    Category,
    PaymentMethod,
    Transaction,
    DailyClosure,
    CampCardEvent,
    Debtor,
    DebtEntry,
    Supplier,
    PurchaseItem,
    PurchaseOrder,
};