/**
 * A "theme" describes how a report looks: colours, fonts, which layout each
 * page type uses, the logo, and the wording of every heading. Report DATA
 * never changes between themes — only its presentation.
 *
 * DEFAULT_THEME reproduces the client's TOLE August 2026 report exactly.
 * Uploaded templates are themes too (see Templates in the app).
 *
 * Keep the allowed values here in sync with app/templates.php, which
 * validates every theme the server stores.
 */

export const FONT_STACKS = {
    garet: '"Garet", "Montserrat", "Inter", Arial, sans-serif',
    montserrat: '"Montserrat", "Inter", Arial, sans-serif',
    poppins: '"Poppins", "Montserrat", Arial, sans-serif',
    inter: '"Inter", Arial, sans-serif',
    lora: '"Lora", Georgia, "Times New Roman", serif',
    georgia: 'Georgia, "Times New Roman", serif',
    arial: 'Arial, Helvetica, sans-serif',
};

export const FONT_LABELS = {
    garet: 'Garet / Montserrat (TOLE headline)',
    montserrat: 'Montserrat — geometric sans',
    poppins: 'Poppins — rounded geometric sans',
    inter: 'Inter — neutral sans',
    lora: 'Lora — modern serif',
    georgia: 'Georgia — classic serif',
    arial: 'Arial — plain sans',
};

export const LAYOUT_OPTIONS = {
    cover: { tole: 'TOLE — photo band, arcs', band: 'Colour block on top, photo below', centered: 'Centred title, framed photo', split: 'Colour panel left, photo right' },
    header: { tole: 'TOLE — colour band with arcs', band: 'Plain colour band', line: 'Logo with a thin line', none: 'No header' },
    footer: { band: 'Colour band', line: 'Thin line', none: 'No footer' },
    contact: { tole: 'TOLE — full colour page', simple: 'Regular page with details and photo' },
    table: { boxed: 'Boxed — every cell outlined', lined: 'Lines between rows only', striped: 'Striped rows' },
    decoration: { arcs: 'Ring shapes', none: 'None' },
};

export const FOOTER_CONTENT = { company: 'Company name', 'company-page': 'Company name and page number', page: 'Page number only' };

export const COLOR_LABELS = {
    primary: 'Main brand colour',
    accent: 'Accent colour',
    text: 'Body text',
    title: 'Page titles',
    pageBg: 'Page background',
    headerBg: 'Header background',
    headerText: 'Header text & logo',
    footerBg: 'Footer background / line',
    footerText: 'Footer text',
    coverBg: 'Cover background',
    coverText: 'Cover text',
    coverAccent: 'Cover month & year',
    tableHeadBg: 'Table header background',
    tableHeadText: 'Table header text',
    tableBorder: 'Table lines',
    link: 'Links',
};

export const LABEL_FIELDS = {
    coverTitle: 'Cover title',
    preparedFor: '“Prepared for” label',
    preparedBy: '“Prepared by” label',
    summaryTitle: 'Page 2 title',
    contractor: 'Contractor heading',
    projectName: 'Project name heading',
    projectDescription: 'Project description heading',
    startDate: 'Start date label',
    completionDate: 'Completion date label',
    approvedBy: '“Approved by” label',
    calendar: 'Content calendar title',
    content: 'Content for the month title',
    creatives: 'Creatives title',
    shoots: 'Content shoot title',
    shootDate: 'Shoot table: date column',
    shootDescription: 'Shoot table: description column',
    shootLink: 'Shoot table: link column',
    breakdown: 'Breakdown title',
    status: 'Breakdown: status column',
    scope: 'Breakdown: scope column',
    note: 'Breakdown: note column',
    contactTitle: 'Contact page title',
    contactIntro: 'Contact page sentence',
};

export const DEFAULT_THEME = Object.freeze({
    version: 1,
    colors: {
        primary: '#3500ff', accent: '#cdfe64', text: '#111111', title: '#111111', pageBg: '#ffffff',
        headerBg: '#3500ff', headerText: '#ffffff', footerBg: '#ccced0', footerText: '#111111',
        coverBg: '#3500ff', coverText: '#ffffff', coverAccent: '#cdfe64',
        tableHeadBg: '#111111', tableHeadText: '#ffffff', tableBorder: '#111111', link: '#1a4fd6',
    },
    fonts: { display: 'garet', heading: 'montserrat', body: 'montserrat' },
    layout: { cover: 'tole', header: 'tole', footer: 'band', contact: 'tole', table: 'boxed', decoration: 'arcs' },
    title: { align: 'center', uppercase: false, size: 30 },
    footerContent: 'company',
    brand: { logo: 'jt', text: 'DIGITAL\nMARKETING\nSERVICES' },
    labels: {
        coverTitle: 'Completion Report',
        preparedFor: 'Prepared For.',
        preparedBy: 'Prepared By.',
        summaryTitle: 'PROJECT COMPLETION REPORT',
        contractor: 'Contractor information',
        projectName: 'Project name',
        projectDescription: 'Project description',
        startDate: 'Project start date:',
        completionDate: 'Completion date:',
        approvedBy: 'Approved by:',
        calendar: 'CONTENT CALENDAR: {MONTH}',
        content: 'CONTENT FOR {MONTH}',
        creatives: 'CREATIVES/LAYOUTS',
        shoots: 'CONTENT SHOOT',
        shootDate: 'Date',
        shootDescription: 'Content shoot description',
        shootLink: 'GDrive link',
        breakdown: 'BREAKDOWN',
        status: 'Status',
        scope: 'Scope description',
        note: 'Note',
        contactTitle: 'Contact Us',
        contactIntro: 'If you have any questions or need clarification about the report, please contact us.',
    },
});

const HEX = /^#[0-9a-f]{6}$/i;

/** Fills any missing or invalid value from the default theme. */
export function completeTheme(input) {
    const source = input && typeof input === 'object' ? input : {};
    const theme = structuredClone(DEFAULT_THEME);
    for (const key of Object.keys(theme.colors)) {
        const value = source.colors?.[key];
        if (typeof value === 'string' && HEX.test(value)) theme.colors[key] = value.toLowerCase();
    }
    for (const key of Object.keys(theme.fonts)) {
        if (FONT_STACKS[source.fonts?.[key]]) theme.fonts[key] = source.fonts[key];
    }
    for (const key of Object.keys(theme.layout)) {
        if (LAYOUT_OPTIONS[key][source.layout?.[key]]) theme.layout[key] = source.layout[key];
    }
    if (['left', 'center'].includes(source.title?.align)) theme.title.align = source.title.align;
    if (typeof source.title?.uppercase === 'boolean') theme.title.uppercase = source.title.uppercase;
    const size = Number(source.title?.size);
    if (size >= 18 && size <= 40) theme.title.size = Math.round(size);
    if (FOOTER_CONTENT[source.footerContent]) theme.footerContent = source.footerContent;
    if (['jt', 'custom', 'none'].includes(source.brand?.logo)) theme.brand.logo = source.brand.logo;
    if (typeof source.brand?.text === 'string') theme.brand.text = source.brand.text.slice(0, 80);
    for (const key of Object.keys(theme.labels)) {
        const value = source.labels?.[key];
        if (typeof value === 'string' && value.trim() !== '') theme.labels[key] = value.slice(0, 200);
    }
    return theme;
}

/** Vertical positions that depend on the header and footer style. */
export function themeMetrics(theme) {
    const titleTop = { tole: 164, band: 146, line: 134, none: 64 }[theme.layout.header];
    const footerSpace = { band: 48, line: 44, none: 0 }[theme.layout.footer];
    return {
        titleTop,
        contentTop: titleTop + 98,
        tableTop: titleTop + 50,
        summaryTop: titleTop + 1,
        footerSpace,
        imageBottom: footerSpace + 26,
        tableLimit: 1123 - footerSpace - 28,
    };
}

/** CSS custom properties placed on every .report-page. */
export function themeStyle(theme) {
    const c = theme.colors;
    const m = themeMetrics(theme);
    return [
        `--rp-primary:${c.primary}`, `--rp-accent:${c.accent}`, `--rp-text:${c.text}`, `--rp-title:${c.title}`,
        `--rp-page-bg:${c.pageBg}`, `--rp-header-bg:${c.headerBg}`, `--rp-header-text:${c.headerText}`,
        `--rp-footer-bg:${c.footerBg}`, `--rp-footer-text:${c.footerText}`, `--rp-cover-bg:${c.coverBg}`,
        `--rp-cover-text:${c.coverText}`, `--rp-cover-accent:${c.coverAccent}`, `--rp-th-bg:${c.tableHeadBg}`,
        `--rp-th-text:${c.tableHeadText}`, `--rp-border:${c.tableBorder}`, `--rp-link:${c.link}`,
        `--rp-font-display:${FONT_STACKS[theme.fonts.display]}`, `--rp-font-heading:${FONT_STACKS[theme.fonts.heading]}`,
        `--rp-font-body:${FONT_STACKS[theme.fonts.body]}`,
        `--rp-title-top:${m.titleTop}px`, `--rp-table-top:${m.tableTop}px`, `--rp-summary-top:${m.summaryTop}px`,
        `--rp-title-align:${theme.title.align}`, `--rp-links-align:${theme.title.align === 'left' ? 'flex-start' : 'center'}`, `--rp-title-transform:${theme.title.uppercase ? 'uppercase' : 'none'}`,
    ].join(';').replace(/"/g, "'");
}

/** Class names that switch layout variants in report.css. */
export function themeClasses(theme) {
    const l = theme.layout;
    return `rp-h-${l.header} rp-f-${l.footer} rp-t-${l.table} rp-d-${l.decoration}`;
}

/** A label with {MONTH} → AUGUST and {Month} → August filled in. */
export function label(theme, key, monthName = '') {
    return String(theme.labels[key] ?? DEFAULT_THEME.labels[key] ?? '')
        .replaceAll('{MONTH}', monthName.toUpperCase())
        .replaceAll('{Month}', monthName);
}
