/** The nine sections of a completion report and when each counts as done. */

export const SECTIONS = [
    { id: 'cover', label: 'Cover' },
    { id: 'summary', label: 'Project Completion Report' },
    { id: 'calendar', label: 'Content Calendar' },
    { id: 'content', label: 'Content for the Month' },
    { id: 'posted', label: 'Content Posted' },
    { id: 'creatives', label: 'Creatives / Layouts' },
    { id: 'shoots', label: 'Content Shoot' },
    { id: 'breakdown', label: 'Breakdown' },
    { id: 'contact', label: 'Contact Us' },
];

const filled = (...values) => values.every((value) => String(value ?? '').trim() !== '');

export function isSectionComplete(id, data) {
    switch (id) {
        case 'cover':
            return filled(data.cover.clientDisplay, data.cover.preparedByName);
        case 'summary': {
            const s = data.summary;
            return filled(s.reportDate, s.contractorName, s.projectNames, s.projectDescription,
                s.startDate, s.completionDate, s.preparerName, s.approverName);
        }
        case 'calendar':
            return data.calendar.images.length > 0;
        case 'content':
            return data.content.images.length > 0;
        case 'posted':
            return data.posted.length > 0 && data.posted.every((page) => page.images.length > 0);
        case 'creatives':
            return data.creatives.length > 0
                && data.creatives.every((group) => filled(group.title) && (group.images.length > 0 || group.links.length > 0));
        case 'shoots':
            return data.shoots.some((row) => filled(row.date, row.description));
        case 'breakdown':
            return data.breakdown.some((row) => filled(row.title));
        case 'contact':
            return filled(data.contact.email, data.contact.website, data.contact.location, data.contact.viberNumber);
        default:
            return false;
    }
}
