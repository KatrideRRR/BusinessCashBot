function parseMoneyToKopecks(value) {
    if (
        value === null ||
        value === undefined
    ) {
        return null;
    }

    const normalized =
        String(value)
            .trim()
            .replace(/\s+/g, "")
            .replace(",", ".");

    if (
        !/^\d+(?:\.\d{1,2})?$/.test(
            normalized
        )
    ) {
        return null;
    }

    const [
        rubles,
        kopecks = "",
    ] = normalized.split(".");

    const paddedKopecks =
        `${kopecks}00`.slice(0, 2);

    const result =
        BigInt(rubles) * 100n +
        BigInt(paddedKopecks);

    if (result <= 0n) {
        return null;
    }

    return result;
}

function formatKopecks(value) {
    let amount =
        BigInt(value || 0);

    const negative =
        amount < 0n;

    if (negative) {
        amount = -amount;
    }

    const rubles =
        amount / 100n;

    const kopecks =
        amount % 100n;

    const formattedRubles =
        rubles
            .toString()
            .replace(
                /\B(?=(\d{3})+(?!\d))/g,
                " "
            );

    let result;

    if (kopecks === 0n) {
        result =
            `${formattedRubles} ₽`;
    } else {
        result =
            `${formattedRubles},` +
            `${kopecks
                .toString()
                .padStart(2, "0")} ₽`;
    }

    return negative
        ? `−${result}`
        : result;
}

module.exports = {
    parseMoneyToKopecks,
    formatKopecks,
};