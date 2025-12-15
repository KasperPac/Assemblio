export default {
    formulas: [
        {
            name: 'dateISO',
            arrity: 0,
            deprecated: true,
        },
        {
            name: 'date',
            arrity: 0,
        },
        {
            name: 'dateRealtime',
            arrity: 0,
        },
        {
            name: 'toDateISO',
            arrity: 1,
        },
        {
            name: 'formatDate',
            arrity: 1,
            parameters: [
                { name: 'Date', type: 'string' },
                { name: 'Format', type: 'string' },
                { name: 'Locale', type: 'string' },
            ],
        },
        {
            name: 'toTime',
            arrity: 1,
            parameters: [
                { name: 'Date', type: 'string' },
                { name: 'WithoutSuffix', type: 'boolean' },
                { name: 'Locale', type: 'string' },
            ],
        },
        {
            name: 'fromTime',
            arrity: 1,
            parameters: [
                { name: 'Date', type: 'string' },
                { name: 'WithoutSuffix', type: 'boolean' },
                { name: 'Locale', type: 'string' },
            ],
        },
        {
            name: 'compareDate',
            arrity: 3,
            parameters: [
                { name: 'Date1', type: 'string' },
                { name: 'Date1', type: 'string' },
                { name: 'Precision', type: 'string' },
                { name: 'Float', type: 'boolean' },
            ],
        },
        {
            name: 'getSecond',
            arrity: 0,
        },
        {
            name: 'getMinute',
            arrity: 0,
        },
        {
            name: 'getHour',
            arrity: 0,
        },
        {
            name: 'getDay',
            arrity: 0,
        },
        {
            name: 'getDayOfWeek',
            arrity: 0,
        },
        {
            name: 'getMonth',
            arrity: 0,
        },
        {
            name: 'getYear',
            arrity: 0,
        },
        {
            name: 'getDayOfYear',
            arrity: 0,
            parameters: [{ name: 'Date', type: 'string' }],
        },
        {
            name: 'getWeekOfYear',
            arrity: 0,
            parameters: [{ name: 'Date', type: 'string' }],
        },
        {
            name: 'addSeconds',
            arrity: 2,
        },
        {
            name: 'addMinutes',
            arrity: 2,
        },
        {
            name: 'addHours',
            arrity: 2,
        },
        {
            name: 'addDays',
            arrity: 2,
        },
        {
            name: 'addMonths',
            arrity: 2,
        },
        {
            name: 'addYears',
            arrity: 2,
        },
        {
            name: 'setSecond',
            arrity: 2,
        },
        {
            name: 'setMinute',
            arrity: 2,
        },
        {
            name: 'setHour',
            arrity: 2,
        },
        {
            name: 'setDay',
            arrity: 2,
        },
        {
            name: 'setDayOfWeek',
            arrity: 2,
        },
        {
            name: 'setMonth',
            arrity: 2,
        },
        {
            name: 'setYear',
            arrity: 2,
        },
        {
            name: 'toTimestamp',
            arrity: 1,
        },
        {
            name: 'getBrowserTimezone',
            arrity: 0,
        },
        {
            name: 'convertDateTimezone',
            arrity: 2,
            parameters: [
                { name: 'Date', type: 'string' },
                { name: 'Timezone', type: 'string' },
                { name: 'Preserve', type: 'boolean' },
            ],
        },
        {
            name: 'formatDateTimezone',
            arrity: 3,
            parameters: [
                { name: 'Date', type: 'string' },
                { name: 'Format', type: 'string' },
                { name: 'Timezone', type: 'string' },
                { name: 'Locale', type: 'string' },
            ],
        },
    ],
};
