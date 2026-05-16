/**
 * Lightweight cron expression parser, next-run calculator, and timezone-aware
 * scheduler helpers.
 *
 * Supports standard 5-field cron expressions:
 *
 *   ┌────────────── minute (0–59)
 *   │ ┌──────────── hour   (0–23)
 *   │ │ ┌────────── day of month (1–31)
 *   │ │ │ ┌──────── month  (1–12)
 *   │ │ │ │ ┌────── day of week (0–6, Sun=0)
 *   │ │ │ │ │
 *   * * * * *
 *
 * Supported syntax per field:
 *   - `*`        — any value
 *   - `N`        — exact value
 *   - `N-M`      — range (inclusive)
 *   - `N/S`      — start at N, step S (within field bounds)
 *   - `* /S`     — every S (from field min)   [no space — shown to avoid comment termination]
 *   - `N-M/S`    — range with step
 *   - `N,M,...`  — list of values, ranges, or steps
 *
 * @module
 */
const FIELD_SPECS = [
    { min: 0, max: 59, name: "minute" },
    { min: 0, max: 23, name: "hour" },
    { min: 1, max: 31, name: "day of month" },
    { min: 1, max: 12, name: "month" },
    { min: 0, max: 6, name: "day of week" },
];
// ---------------------------------------------------------------------------
// Parsing
// ---------------------------------------------------------------------------
function parseField(token, spec) {
    const values = new Set();
    const parts = token.split(",");
    for (const part of parts) {
        const trimmed = part.trim();
        if (trimmed === "") {
            throw new Error(`Empty element in cron ${spec.name} field`);
        }
        const slashIdx = trimmed.indexOf("/");
        if (slashIdx !== -1) {
            const base = trimmed.slice(0, slashIdx);
            const stepStr = trimmed.slice(slashIdx + 1);
            const step = parseInt(stepStr, 10);
            if (isNaN(step) || step <= 0) {
                throw new Error(`Invalid step "${stepStr}" in cron ${spec.name} field`);
            }
            let rangeStart = spec.min;
            let rangeEnd = spec.max;
            if (base === "*") {
                // */S — every S from field min
            }
            else if (base.includes("-")) {
                const [a, b] = base.split("-").map((s) => parseInt(s, 10));
                if (isNaN(a) || isNaN(b)) {
                    throw new Error(`Invalid range "${base}" in cron ${spec.name} field`);
                }
                rangeStart = a;
                rangeEnd = b;
            }
            else {
                const start = parseInt(base, 10);
                if (isNaN(start)) {
                    throw new Error(`Invalid start "${base}" in cron ${spec.name} field`);
                }
                rangeStart = start;
            }
            validateBounds(rangeStart, spec);
            validateBounds(rangeEnd, spec);
            for (let i = rangeStart; i <= rangeEnd; i += step) {
                values.add(i);
            }
            continue;
        }
        if (trimmed.includes("-")) {
            const [aStr, bStr] = trimmed.split("-");
            const a = parseInt(aStr, 10);
            const b = parseInt(bStr, 10);
            if (isNaN(a) || isNaN(b)) {
                throw new Error(`Invalid range "${trimmed}" in cron ${spec.name} field`);
            }
            validateBounds(a, spec);
            validateBounds(b, spec);
            if (a > b) {
                throw new Error(`Invalid range ${a}-${b} in cron ${spec.name} field (start > end)`);
            }
            for (let i = a; i <= b; i++) {
                values.add(i);
            }
            continue;
        }
        if (trimmed === "*") {
            for (let i = spec.min; i <= spec.max; i++) {
                values.add(i);
            }
            continue;
        }
        const val = parseInt(trimmed, 10);
        if (isNaN(val)) {
            throw new Error(`Invalid value "${trimmed}" in cron ${spec.name} field`);
        }
        validateBounds(val, spec);
        values.add(val);
    }
    if (values.size === 0) {
        throw new Error(`Empty result for cron ${spec.name} field`);
    }
    return [...values].sort((a, b) => a - b);
}
function validateBounds(value, spec) {
    if (value < spec.min || value > spec.max) {
        throw new Error(`Value ${value} out of range [${spec.min}–${spec.max}] for cron ${spec.name} field`);
    }
}
// ---------------------------------------------------------------------------
// Public API — pure cron functions
// ---------------------------------------------------------------------------
/**
 * Parse a cron expression string into a structured {@link ParsedCron}.
 */
export function parseCron(expression) {
    const trimmed = expression.trim();
    if (!trimmed) {
        throw new Error("Cron expression must not be empty");
    }
    const tokens = trimmed.split(/\s+/);
    if (tokens.length !== 5) {
        throw new Error(`Cron expression must have exactly 5 fields, got ${tokens.length}: "${trimmed}"`);
    }
    return {
        minutes: parseField(tokens[0], FIELD_SPECS[0]),
        hours: parseField(tokens[1], FIELD_SPECS[1]),
        daysOfMonth: parseField(tokens[2], FIELD_SPECS[2]),
        months: parseField(tokens[3], FIELD_SPECS[3]),
        daysOfWeek: parseField(tokens[4], FIELD_SPECS[4]),
    };
}
/**
 * Validate a cron expression string. Returns `null` if valid, or an error
 * message string if invalid.
 */
export function validateCron(expression) {
    try {
        parseCron(expression);
        return null;
    }
    catch (err) {
        return err instanceof Error ? err.message : String(err);
    }
}
/**
 * Calculate the next run time after `after` for the given parsed cron schedule.
 */
export function nextCronTick(cron, after) {
    const d = new Date(after.getTime());
    d.setUTCSeconds(0, 0);
    d.setUTCMinutes(d.getUTCMinutes() + 1);
    const MAX_CRON_SEARCH_YEARS = 4;
    const maxIterations = MAX_CRON_SEARCH_YEARS * 366 * 24 * 60;
    for (let i = 0; i < maxIterations; i++) {
        const month = d.getUTCMonth() + 1;
        const dayOfMonth = d.getUTCDate();
        const dayOfWeek = d.getUTCDay();
        const hour = d.getUTCHours();
        const minute = d.getUTCMinutes();
        if (!cron.months.includes(month)) {
            advanceToNextMonth(d, cron.months);
            continue;
        }
        if (!cron.daysOfMonth.includes(dayOfMonth) || !cron.daysOfWeek.includes(dayOfWeek)) {
            d.setUTCDate(d.getUTCDate() + 1);
            d.setUTCHours(0, 0, 0, 0);
            continue;
        }
        if (!cron.hours.includes(hour)) {
            const nextHour = findNext(cron.hours, hour);
            if (nextHour !== null) {
                d.setUTCHours(nextHour, 0, 0, 0);
            }
            else {
                d.setUTCDate(d.getUTCDate() + 1);
                d.setUTCHours(0, 0, 0, 0);
            }
            continue;
        }
        if (!cron.minutes.includes(minute)) {
            const nextMin = findNext(cron.minutes, minute);
            if (nextMin !== null) {
                d.setUTCMinutes(nextMin, 0, 0);
            }
            else {
                d.setUTCHours(d.getUTCHours() + 1, 0, 0, 0);
            }
            continue;
        }
        return new Date(d.getTime());
    }
    return null;
}
/**
 * Convenience: parse a cron expression and compute the next run time.
 */
export function nextCronTickFromExpression(expression, after = new Date()) {
    const cron = parseCron(expression);
    return nextCronTick(cron, after);
}
// ---------------------------------------------------------------------------
// Timezone-aware scheduling helpers
// ---------------------------------------------------------------------------
const WEEKDAY_INDEX = {
    Sun: 0, Mon: 1, Tue: 2, Wed: 3, Thu: 4, Fri: 5, Sat: 6,
};
/**
 * Validate an IANA timezone string. Throws a plain Error if invalid.
 */
export function assertValidTimeZone(timeZone) {
    try {
        new Intl.DateTimeFormat("en-US", { timeZone }).format(new Date());
    }
    catch {
        throw new Error(`Invalid timezone: ${timeZone}`);
    }
}
function floorToMinute(date) {
    const copy = new Date(date.getTime());
    copy.setUTCSeconds(0, 0);
    return copy;
}
function getZonedMinuteParts(date, timeZone) {
    const formatter = new Intl.DateTimeFormat("en-US", {
        timeZone,
        hour12: false,
        year: "numeric",
        month: "numeric",
        day: "numeric",
        hour: "numeric",
        minute: "numeric",
        weekday: "short",
    });
    const parts = formatter.formatToParts(date);
    const map = Object.fromEntries(parts.map((part) => [part.type, part.value]));
    const weekday = WEEKDAY_INDEX[map.weekday ?? ""];
    if (weekday == null) {
        throw new Error(`Unable to resolve weekday for timezone ${timeZone}`);
    }
    return {
        year: Number(map.year),
        month: Number(map.month),
        day: Number(map.day),
        hour: Number(map.hour),
        minute: Number(map.minute),
        weekday,
    };
}
function matchesCronMinute(expression, timeZone, date) {
    const cron = parseCron(expression);
    const parts = getZonedMinuteParts(date, timeZone);
    return (cron.minutes.includes(parts.minute) &&
        cron.hours.includes(parts.hour) &&
        cron.daysOfMonth.includes(parts.day) &&
        cron.months.includes(parts.month) &&
        cron.daysOfWeek.includes(parts.weekday));
}
/**
 * Calculate the next run time for a cron expression in a given IANA timezone.
 * Throws a plain Error on invalid timezone or expression.
 */
export function nextCronTickInTimeZone(expression, timeZone, after) {
    const trimmed = expression.trim();
    assertValidTimeZone(timeZone);
    const error = validateCron(trimmed);
    if (error)
        throw new Error(error);
    const cursor = floorToMinute(after);
    cursor.setUTCMinutes(cursor.getUTCMinutes() + 1);
    const limit = 366 * 24 * 60 * 5;
    for (let i = 0; i < limit; i += 1) {
        if (matchesCronMinute(trimmed, timeZone, cursor)) {
            return new Date(cursor.getTime());
        }
        cursor.setUTCMinutes(cursor.getUTCMinutes() + 1);
    }
    return null;
}
// ---------------------------------------------------------------------------
// Internal helpers
// ---------------------------------------------------------------------------
function findNext(sortedValues, current) {
    for (const v of sortedValues) {
        if (v > current)
            return v;
    }
    return null;
}
function advanceToNextMonth(d, months) {
    let year = d.getUTCFullYear();
    let month = d.getUTCMonth() + 1;
    for (let i = 0; i < 48; i++) {
        month++;
        if (month > 12) {
            month = 1;
            year++;
        }
        if (months.includes(month)) {
            d.setUTCFullYear(year, month - 1, 1);
            d.setUTCHours(0, 0, 0, 0);
            return;
        }
    }
}
//# sourceMappingURL=cron.js.map