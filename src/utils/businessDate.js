const dayjs = require("dayjs");

const utc =
    require("dayjs/plugin/utc");

const timezone =
    require("dayjs/plugin/timezone");

dayjs.extend(utc);
dayjs.extend(timezone);

function getTimezone() {
    return (
        process.env.APP_TIMEZONE ||
        "Europe/Moscow"
    );
}

function now() {
    return dayjs().tz(
        getTimezone()
    );
}

function getBusinessDate() {
    return now().format(
        "YYYY-MM-DD"
    );
}

function getReportPeriod(
    period
) {
    const current = now();

    switch (period) {
        case "today": {
            const date =
                current.format(
                    "YYYY-MM-DD"
                );

            return {
                startDate: date,
                endDate: date,
                title: "Сегодня",
            };
        }

        case "yesterday": {
            const date =
                current
                    .subtract(
                        1,
                        "day"
                    )
                    .format(
                        "YYYY-MM-DD"
                    );

            return {
                startDate: date,
                endDate: date,
                title: "Вчера",
            };
        }

        case "7d": {
            return {
                startDate:
                    current
                        .subtract(
                            6,
                            "day"
                        )
                        .format(
                            "YYYY-MM-DD"
                        ),

                endDate:
                    current.format(
                        "YYYY-MM-DD"
                    ),

                title:
                    "Последние 7 дней",
            };
        }

        case "month": {
            return {
                startDate:
                    current
                        .startOf(
                            "month"
                        )
                        .format(
                            "YYYY-MM-DD"
                        ),

                endDate:
                    current.format(
                        "YYYY-MM-DD"
                    ),

                title:
                    "Этот месяц",
            };
        }

        default:
            throw new Error(
                `Неизвестный период: ${period}`
            );
    }
}

function formatDateRange(
    startDate,
    endDate
) {
    if (
        startDate === endDate
    ) {
        return dayjs(
            startDate
        ).format(
            "DD.MM.YYYY"
        );
    }

    return (
        `${dayjs(
            startDate
        ).format(
            "DD.MM.YYYY"
        )} — ` +
        `${dayjs(
            endDate
        ).format(
            "DD.MM.YYYY"
        )}`
    );
}

module.exports = {
    getBusinessDate,
    getReportPeriod,
    formatDateRange,
};