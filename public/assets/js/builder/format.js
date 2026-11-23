/** Fixed date formats used in the TOLE report (never the browser's locale). */

export const MONTHS = ['January', 'February', 'March', 'April', 'May', 'June', 'July', 'August',
    'September', 'October', 'November', 'December'];

function parts(iso) {
    const match = /^(\d{4})-(\d{2})-(\d{2})$/.exec(iso ?? '');
    if (!match) return null;
    return { year: Number(match[1]), month: Number(match[2]), day: Number(match[3]) };
}

/** "August 1, 2026" */
export function dateLong(iso) {
    const p = parts(iso);
    return p ? `${MONTHS[p.month - 1]} ${p.day}, ${p.year}` : '';
}

/** "AUGUST 30, 2026" */
export function dateUpper(iso) {
    return dateLong(iso).toUpperCase();
}

/** "Aug 1, 2026" */
export function dateShort(iso) {
    const p = parts(iso);
    return p ? `${MONTHS[p.month - 1].slice(0, 3)} ${p.day}, ${p.year}` : '';
}

export function monthName(month) {
    return MONTHS[(Number(month) || 1) - 1];
}
