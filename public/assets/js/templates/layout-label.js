/**
 * First labelling of an exact-copy layout, done in the browser with no AI:
 * - texts that hold report values become patterns, e.g.
 *   "CONTENT CALENDAR: AUGUST" → "CONTENT CALENDAR: {month:upper}"
 *   "Project start date: August 1, 2026" → "Project start date: {startDate}"
 *   "Jeah Tradio" (the agency's preparer) → "{preparedByName}"
 * - photos get a role: fixed (logos, icons), keep (cover/office photos)
 *   or slot (screenshots that change every month)
 * - pages get a short name for the page list
 * When an OpenAI key is set, the AI checks and improves these labels.
 * Positions are never touched.
 */
import { MONTHS } from '../builder/format.js';

// Month names count only when written as names ("August", "AUGUST"), so the verb "may" stays text.
const MONTH_WORD = [...MONTHS, ...MONTHS.map((m) => m.toUpperCase())].join('|');
const LONG_DATE = new RegExp(`\\b(${MONTH_WORD})\\s+\\d{1,2},\\s*\\d{4}\\b`, 'g');
const MONTH_YEAR = new RegExp(`\\b(${MONTH_WORD})\\s+(20\\d{2})\\b`, 'g');
const MONTH_ONLY = new RegExp(`\\b(${MONTH_WORD})\\b`, 'g');
const HAS_MONTH = new RegExp(`\\b(${MONTH_WORD})\\b`);

const flat = (text) => String(text ?? '').replace(/\s+/g, ' ').trim().toLowerCase();
const caseOf = (text) => (/[A-Za-z]/.test(text) && text === text.toUpperCase() ? ':upper' : '');

/** Known values → field, chosen by the kind of page they appear on. */
function knownValues(known) {
    const agency = known?.agency ?? {};
    const list = [];
    const add = (value, fields) => {
        if (typeof value === 'string' && value.trim().length >= 3) list.push({ value, fields });
    };
    add(agency.prepared_by_name, { cover: 'preparedByName', contact: 'contactName', body: 'preparerName' });
    add(agency.prepared_by_company, { cover: 'preparedByCompany', contact: 'contractorName', body: 'preparerCompany' });
    add(agency.contractor_name, { cover: 'preparedByCompany', contact: 'contractorName', body: 'contractorName' });
    add(agency.contractor_address, { body: 'contractorAddress', contact: 'contractorAddress', cover: 'contractorAddress' });
    add(agency.closing_note, { body: 'closingNote', contact: 'closingNote', cover: 'closingNote' });
    add(agency.email, { contact: 'contactEmail', body: 'contactEmail', cover: 'contactEmail' });
    add(agency.viber_number, { contact: 'contactNumber', body: 'contactNumber', cover: 'contactNumber' });
    add(agency.website, { contact: 'website', body: 'website', cover: 'website' });
    add(agency.location, { contact: 'location', body: 'location', cover: 'location' });
    add(agency.viber_name, { contact: 'contactName', body: 'preparerName', cover: 'preparedByName' });
    (known?.clients ?? []).forEach((client) => {
        add(client.coverDisplay, { cover: 'clientName', body: 'clientName', contact: 'clientName' });
        add(client.name, { cover: 'clientName', body: 'clientName', contact: 'clientName' });
        add(client.projectNames, { body: 'projectNames', cover: 'projectNames', contact: 'projectNames' });
        add(client.projectDescription, { body: 'projectDescription', cover: 'projectDescription', contact: 'projectDescription' });
        add(client.approverName, { body: 'approverName', cover: 'approverName', contact: 'approverName' });
        add(client.approverPosition, { body: 'approverPosition', cover: 'approverPosition', contact: 'approverPosition' });
        add(client.approverDepartment, { body: 'approverDepartment', cover: 'approverDepartment', contact: 'approverDepartment' });
    });
    // Longer values first, so "JT Digital Marketing Services" beats "JT".
    return list.sort((a, b) => b.value.length - a.value.length);
}

/** Month, month+year and long dates inside one line of text. */
function datePattern(line, hasMonthOnPage) {
    let out = line.replace(LONG_DATE, (match, _m, offset) => {
        const before = line.slice(0, offset).toLowerCase();
        const field = /start|from|begin/.test(before) ? 'startDate' : /complet|end|until|to\s*$/.test(before) ? 'completionDate' : 'reportDate';
        return `{${field}${caseOf(match)}}`;
    });
    out = out.replace(MONTH_YEAR, (match) => (match.includes('{') ? match : `{monthYear${caseOf(match)}}`));
    out = out.replace(MONTH_ONLY, (match, _m, offset, whole) => {
        // In running sentences a month may be a date that belongs to the text; only short lines and capitals count.
        if (match !== match.toUpperCase() && whole.length > 40) return match;
        return `{month${caseOf(match)}}`;
    });
    if (hasMonthOnPage && /^\s*20\d{2}\s*$/.test(out)) out = out.replace(/20\d{2}/, '{year}');
    return out;
}

/** Pattern for one paragraph, or null when nothing in it is a report value. */
function patternFor(text, values, pageKind, hasMonthOnPage) {
    const lines = text.lines;
    const out = [];
    let i = 0;
    while (i < lines.length) {
        let matched = null;
        // Longest run of lines that equals one known value (values may wrap differently).
        for (let j = lines.length; j > i && !matched; j -= 1) {
            const run = flat(lines.slice(i, j).join(' '));
            const hit = values.find((item) => flat(item.value) === run);
            if (hit) matched = { end: j, field: hit.fields[pageKind] ?? hit.fields.body };
        }
        if (matched) {
            out.push(`{${matched.field}}`);
            i = matched.end;
        } else {
            out.push(datePattern(lines[i], hasMonthOnPage || HAS_MONTH.test(lines.join(' '))));
            i += 1;
        }
    }
    const pattern = out.join('\n');
    return pattern.includes('{') ? pattern : null;
}

function pageKindOf(page, index, values) {
    if (index === 0) return 'cover';
    const all = flat(page.texts.map((text) => text.lines.join(' ')).join(' '));
    const email = values.find((item) => item.fields.contact === 'contactEmail');
    if (/contact us|get in touch|reach us/.test(all) || (email && all.includes(flat(email.value)))) return 'contact';
    return 'body';
}

function pageName(page, kind) {
    if (kind === 'cover') return 'Cover';
    const titles = page.texts
        .filter((text) => text.y > 90 && text.y < page.height * 0.45 && text.size >= 18)
        .sort((a, b) => b.size - a.size || a.y - b.y);
    const title = titles[0] ? (titles[0].pattern ?? titles[0].lines.join(' ')) : (kind === 'contact' ? 'Contact' : '');
    // Names stay the same every month: drop report values such as the month.
    let clean = title.replace(/\{[^}]*\}/g, '').replace(/\s+/g, ' ').replace(/[\s:–-]+$/, '').trim();
    if (/\b(for|of|in)$/i.test(clean)) clean += /[a-z]/.test(clean) ? ' the month' : ' THE MONTH';
    if (!clean) return '';
    const nice = clean === clean.toUpperCase()
        ? clean.split(' ').map((word) => (word.replace(/[^A-Z]/g, '').length <= 2 ? word : word.charAt(0) + word.slice(1).toLowerCase())).join(' ')
        : clean;
    return nice.slice(0, 60);
}

/** Header and footer bands repeat the agency's name as branding, not as a report value. */
const inMargin = (item, page) => item.y < 110 || item.y + item.h > page.height - 70;

export function labelLayout(layout, known) {
    const values = knownValues(known);
    layout.pages.forEach((page, index) => {
        const kind = pageKindOf(page, index, values);
        const pageText = page.texts.map((text) => text.lines.join(' ')).join(' ');
        const hasMonth = HAS_MONTH.test(pageText);
        page.texts.forEach((text) => {
            text.pattern = kind !== 'cover' && kind !== 'contact' && inMargin(text, page) ? null : patternFor(text, values, kind, hasMonth);
        });
        page.name = pageName(page, kind);
        const area = page.width * page.height;
        page.images.forEach((image) => {
            const share = (image.w * image.h) / area;
            const logo = share < 0.004 || (share < 0.015 && inMargin(image, page));
            image.role = logo ? 'fixed' : kind === 'body' ? 'slot' : 'keep';
        });
    });
    return layout;
}
