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
/**
 * A parsed cron schedule. Each field is a sorted array of valid integer values
 * for that field.
 */
export interface ParsedCron {
    minutes: number[];
    hours: number[];
    daysOfMonth: number[];
    months: number[];
    daysOfWeek: number[];
}
/**
 * Parse a cron expression string into a structured {@link ParsedCron}.
 */
export declare function parseCron(expression: string): ParsedCron;
/**
 * Validate a cron expression string. Returns `null` if valid, or an error
 * message string if invalid.
 */
export declare function validateCron(expression: string): string | null;
/**
 * Calculate the next run time after `after` for the given parsed cron schedule.
 */
export declare function nextCronTick(cron: ParsedCron, after: Date): Date | null;
/**
 * Convenience: parse a cron expression and compute the next run time.
 */
export declare function nextCronTickFromExpression(expression: string, after?: Date): Date | null;
/**
 * Validate an IANA timezone string. Throws a plain Error if invalid.
 */
export declare function assertValidTimeZone(timeZone: string): void;
/**
 * Calculate the next run time for a cron expression in a given IANA timezone.
 * Throws a plain Error on invalid timezone or expression.
 */
export declare function nextCronTickInTimeZone(expression: string, timeZone: string, after: Date): Date | null;
//# sourceMappingURL=cron.d.ts.map