/**
 * Builds the report pages as HTML strings, in the TOLE order:
 * cover · summary · calendar · content · posted pages · creatives groups ·
 * content shoot · breakdown · contact.
 *
 * The same HTML is used for the live preview, the template editor and the
 * PDF export. The look comes from a theme (see theme.js); the default theme
 * is the TOLE design.
 *
 * Image sizes are computed here in pixels (no CSS object-fit) because the
 * PDF renderer, html2canvas, does not support object-fit.
 */
import { layoutPageHtml, prepareLayout, emptySlots } from './layout-render.js';
import { esc, safeUrl } from '../lib/dom.js';
import { dateUpper, dateLong, dateShort, monthName } from './format.js';
import { completeTheme, themeMetrics, themeStyle, themeClasses, label } from './theme.js';

export const PAGE_WIDTH = 794;
export const PAGE_HEIGHT = 1123;
const IMAGE_SIDE = 40;          // left/right margin of image grids
const GRID_GAP = 12;
const CAPACITY = { 2: 4, 3: 9, 4: 16, 5: 25 };

/** The JT mark, drawn in a solid colour (html2canvas needs a real colour, not currentColor). */
const mark = (color) => '<svg class="rp-mark" viewBox="180 66 225 172" aria-hidden="true">'
    + `<g fill="${color}"><rect x="184" y="71" width="215" height="37"/><circle cx="208" cy="209" r="24"/>`
    + '<path d="M240 121h42v67c0 25-18 42-42 45z"/><rect x="311" y="121" width="42" height="64"/>'
    + '<circle cx="332" cy="209" r="24"/></g></svg>';

const icons = (color, cutout) => ({
    viber: `<svg viewBox="0 0 24 24" aria-hidden="true"><path fill="${color}" d="M6.6 10.8a15.1 15.1 0 0 0 6.6 6.6l2.2-2.2a1 1 0 0 1 1-.25c1.1.37 2.3.57 3.6.57a1 1 0 0 1 1 1V20a1 1 0 0 1-1 1A17 17 0 0 1 3 4a1 1 0 0 1 1-1h3.5a1 1 0 0 1 1 1c0 1.25.2 2.45.57 3.57a1 1 0 0 1-.25 1z"/></svg>`,
    email: `<svg viewBox="0 0 24 24" aria-hidden="true"><rect x="2.5" y="4.5" width="19" height="15" rx="2.5" fill="${color}"/><path d="m5 8 7 5 7-5" fill="none" stroke="${cutout}" stroke-width="2"/></svg>`,
    website: `<svg viewBox="0 0 24 24" aria-hidden="true"><g fill="none" stroke="${color}" stroke-width="2.2"><circle cx="12" cy="12" r="9"/><path d="M3.5 12h17M12 3c-3 3.2-3 14.8 0 18M12 3c3 3.2 3 14.8 0 18"/></g></svg>`,
    location: `<svg viewBox="0 0 24 24" aria-hidden="true"><path fill="${color}" d="M5 2.5h2.2v19H5zM8.2 3.5H19l-2.8 4.3L19 12H8.2z"/></svg>`,
});

/* ---------- Image sizing ---------- */

function imageMeta(ref, images) {
    if (!ref) return null;
    const meta = images[String(ref.imageId)];
    return meta ? { ...meta, caption: ref.caption ?? '' } : null;
}

/** Fit inside a box, keeping proportions. */
function contain(meta, boxWidth, boxHeight) {
    const scale = Math.min(boxWidth / meta.width, boxHeight / meta.height, 3);
    return { width: Math.floor(meta.width * scale), height: Math.floor(meta.height * scale) };
}

/** Fill a box completely, cropping the overflow (like object-fit: cover). */
function coverImage(meta, boxWidth, boxHeight, alt) {
    const scale = Math.max(boxWidth / meta.width, boxHeight / meta.height);
    const width = Math.ceil(meta.width * scale);
    const height = Math.ceil(meta.height * scale);
    const left = Math.round((boxWidth - width) / 2);
    const top = Math.round((boxHeight - height) / 2);
    return `<img src="${esc(meta.url)}" alt="${esc(alt)}" style="position:absolute;left:${left}px;top:${top}px;width:${width}px;height:${height}px;max-width:none">`;
}

const lines = (text) => esc(text).replace(/\n/g, '<br>');

/* ---------- Render context ---------- */

/** Everything a page builder needs, prepared once per render. */
function context(state) {
    const theme = completeTheme(state.theme);
    return {
        data: state.data,
        meta: state.meta,
        images: state.images,
        theme,
        metrics: themeMetrics(theme),
        month: monthName(state.meta.month),
        logoUrl: state.logoUrl ?? '',
        style: themeStyle(theme),
        classes: themeClasses(theme),
    };
}

function page(ctx, section, className, inner) {
    return `<div class="report-page ${className} ${ctx.classes}" style="${ctx.style}" data-section="${section}">${inner}</div>`;
}

/** Logo + brand words. tone = the colour the logo is drawn in. */
function logo(ctx, tone, className) {
    const { brand } = ctx.theme;
    let picture = '';
    if (brand.logo === 'jt') picture = mark(tone);
    if (brand.logo === 'custom' && ctx.logoUrl) picture = `<img class="rp-logo-img" src="${esc(ctx.logoUrl)}" alt="">`;
    const words = brand.text.trim() ? `<span>${lines(brand.text)}</span>` : '';
    if (!picture && !words) return '';
    return `<div class="${className}">${picture}${words}</div>`;
}

function header(ctx) {
    const { layout, colors } = ctx.theme;
    switch (layout.header) {
        case 'tole':
            return `<div class="rp-band"><div class="rp-clip rp-band-white"><div class="rp-ring"></div></div><div class="rp-ring rp-ring-lime"></div>`
                + `${logo(ctx, colors.headerText, 'rp-band-logo')}</div>`;
        case 'band':
            return `<div class="rp-band rp-band-plain">${layout.decoration === 'arcs' ? '<div class="rp-ring rp-ring-corner"></div>' : ''}`
                + `${logo(ctx, colors.headerText, 'rp-band-logo')}</div>`;
        case 'line':
            return `<div class="rp-hline">${logo(ctx, colors.primary, 'rp-hline-logo')}<div class="rp-hline-rule"></div></div>`;
        default:
            return '';
    }
}

function footer(ctx) {
    const { layout, footerContent } = ctx.theme;
    if (layout.footer === 'none') return '';
    const company = esc(ctx.data.summary.contractorName || 'JT Digital Marketing Services');
    const content = {
        company,
        'company-page': `${company}<span class="rp-page-no">{{PAGE}}</span>`,
        page: '{{PAGE}}',
    }[footerContent];
    return `<div class="rp-footer">${content}</div>`;
}

/* ---------- 1. Cover ---------- */

function coverPhoto(ctx, width, height) {
    const photo = imageMeta(ctx.data.cover.image, ctx.images);
    return photo ? coverImage(photo, width, height, 'Cover photo') : '<span class="rp-placeholder">Cover photo</span>';
}

/** Cover title size that keeps the longest word on one line and the title within ~3 lines. */
function coverTitleSize(title, width) {
    const text = String(title);
    // One line when it still reads as a headline (≥ 34px); otherwise break between words.
    const oneLine = width / (text.length * 0.56);
    if (oneLine >= 34) return Math.round(Math.min(62, oneLine));
    const longest = Math.max(...text.split(/\s+/).map((word) => word.length), 1);
    return Math.round(Math.max(30, Math.min(62, width / (longest * 0.62))));
}

function coverPage(ctx) {
    const { data, meta, theme } = ctx;
    const cover = data.cover;
    const colors = theme.colors;
    const coverTitle = label(theme, 'coverTitle');
    // TOLE: two big lines ("Completion / Report", "AUGUST / 2026"). Other layouts: the title
    // sized to fit its column, with the month and year on one smaller line.
    const width = { band: 640, centered: 674, split: 320 }[theme.layout.cover] ?? 0;
    const headline = theme.layout.cover === 'tole'
        ? `<h1 class="rp-headline">${esc(coverTitle).replace(/\s+/, '<br>')}<span class="lime">${esc(ctx.month.toUpperCase())}<br>${esc(meta.year)}</span></h1>`
        : `<h1 class="rp-headline" style="font-size:${coverTitleSize(coverTitle, width)}px">${esc(coverTitle)}`
            + `<span class="lime rp-cover-month">${esc(ctx.month.toUpperCase())} ${esc(meta.year)}</span></h1>`;
    const prepared = `
        <div class="rp-prepared rp-prepared-for">${esc(label(theme, 'preparedFor'))}<b>${lines(cover.clientDisplay || meta.clientName)}</b></div>
        <div class="rp-prepared rp-prepared-by">${esc(label(theme, 'preparedBy'))}<b>${esc(cover.preparedByName)}</b>${esc(cover.preparedByCompany)}</div>`;
    const arcs = theme.layout.decoration === 'arcs';

    switch (theme.layout.cover) {
        case 'band':
            return page(ctx, 'cover', 'rp-cover rp-cover-band', `
                <div class="rp-cover-block">${arcs ? '<div class="rp-clip rp-corner"><div class="rp-ring"></div></div>' : ''}
                    ${logo(ctx, colors.coverText, 'rp-cover-logo')}${headline}</div>
                <div class="rp-cover-photo">${coverPhoto(ctx, 794, 340)}</div>${prepared}`);
        case 'centered':
            return page(ctx, 'cover', 'rp-cover rp-cover-centered', `
                ${arcs ? '<div class="rp-clip rp-corner"><div class="rp-ring"></div></div>' : ''}
                ${logo(ctx, colors.coverText, 'rp-cover-logo')}${headline}
                <div class="rp-cover-photo">${coverPhoto(ctx, 634, 300)}</div>${prepared}`);
        case 'split':
            return page(ctx, 'cover', 'rp-cover rp-cover-split', `
                <div class="rp-cover-panel">${logo(ctx, colors.coverText, 'rp-cover-logo')}${headline}${prepared}</div>
                <div class="rp-cover-photo">${coverPhoto(ctx, 397, 1123)}</div>`);
        default:
            return page(ctx, 'cover', 'rp-cover', `
                <div class="rp-clip rp-corner"><div class="rp-ring"></div></div>
                ${logo(ctx, colors.coverText, 'rp-cover-logo')}
                <div class="rp-cover-rule"></div>
                ${headline}
                <div class="rp-clip rp-half-ring"><div class="rp-ring"></div></div>
                <div class="rp-cover-photo">${coverPhoto(ctx, 714, 270)}</div>${prepared}`);
    }
}

/* ---------- 2. Project completion report ---------- */

function summaryPage(ctx) {
    const { data, theme } = ctx;
    const s = data.summary;
    const approverLines = [s.approverPosition, s.approverDepartment].filter(Boolean).map(esc).join('<br>');
    return page(ctx, 'summary', 'rp-summary', `${header(ctx)}
        <div class="rp-summary-body">
            <p class="rp-date">${esc(dateUpper(s.reportDate) || 'REPORT DATE')}</p>
            <p class="rp-doc-title">${esc(label(theme, 'summaryTitle'))}</p>
            <div class="rp-block"><h4>${esc(label(theme, 'contractor'))}</h4>${lines([s.contractorName, s.contractorAddress].filter(Boolean).join('\n'))}</div>
            <div class="rp-block"><h4>${esc(label(theme, 'projectName'))}</h4>${lines(s.projectNames)}</div>
            <div class="rp-block"><h4>${esc(label(theme, 'projectDescription'))}</h4>${lines(s.projectDescription)}</div>
            <div class="rp-block rp-dates">${esc(label(theme, 'startDate'))} ${esc(dateLong(s.startDate))}<br>${esc(label(theme, 'completionDate'))} ${esc(dateLong(s.completionDate))}</div>
            <p class="rp-closing">${lines(s.closingNote)}</p>
            <div class="rp-sign"><b>${esc(s.preparerName)}</b>${esc(s.preparerCompany)}</div>
            <p class="rp-approved">${esc(label(theme, 'approvedBy'))}</p>
            <div class="rp-sign"><b>${esc(s.approverName)}</b>${approverLines}</div>
        </div>
        ${footer(ctx)}`);
}

/* ---------- Image pages ---------- */

/** Long titles get smaller so they stay on one line, as in the TOLE report. */
function titleSize(title, maxSize) {
    const length = Math.max(1, String(title).length);
    return Math.max(18, Math.min(maxSize, Math.floor((PAGE_WIDTH - 80) / (length * 0.7))));
}

function resolveColumns(columns, count) {
    if (columns !== 'auto') return Math.min(5, Math.max(1, Number(columns) || 1));
    if (count <= 1) return 1;
    if (count <= 4) return 2;
    if (count <= 9) return 3;
    return 4;
}

function imageGrid(refs, images, columns, top, bottom) {
    const cols = Math.min(columns, Math.max(1, refs.length));
    const rowCount = Math.ceil(refs.length / cols);
    const areaWidth = PAGE_WIDTH - IMAGE_SIDE * 2;
    const areaHeight = PAGE_HEIGHT - bottom - top;
    const cellWidth = Math.floor((areaWidth - GRID_GAP * (cols - 1)) / cols);
    const maxCellHeight = Math.floor((areaHeight - GRID_GAP * (rowCount - 1)) / rowCount);
    const captionSpace = refs.some((ref) => ref.caption) ? 22 : 0;

    // Size every image, then make each row as tall as its tallest image.
    const sized = refs.map((ref) => {
        const meta = imageMeta(ref, images);
        return { ref, meta, size: meta ? contain(meta, cellWidth, maxCellHeight - captionSpace) : { width: 0, height: 0 } };
    });
    const rowHeights = [];
    for (let row = 0; row < rowCount; row += 1) {
        const items = sized.slice(row * cols, row * cols + cols);
        rowHeights.push(Math.max(...items.map((item) => item.size.height)) + captionSpace);
    }

    const cells = sized.map(({ ref, meta, size }, index) => {
        const height = rowHeights[Math.floor(index / cols)];
        if (!meta) return `<div class="rp-cell" style="width:${cellWidth}px;height:${height}px"></div>`;
        return `<div class="rp-cell" style="width:${cellWidth}px;height:${height}px">`
            + `<img src="${esc(meta.url)}" alt="" style="width:${size.width}px;height:${size.height}px">`
            + (ref.caption ? `<p class="rp-cap">${esc(ref.caption)}</p>` : '')
            + '</div>';
    }).join('');

    return `<div class="rp-images" style="top:${top}px;bottom:${bottom}px;grid-template-columns:repeat(${cols},${cellWidth}px);`
        + `grid-template-rows:${rowHeights.map((height) => `${height}px`).join(' ')}">${cells}</div>`;
}

/** Natural display height of an image at full content width (single column). */
function stackHeight(ref, images, width) {
    const meta = imageMeta(ref, images);
    const caption = ref.caption ? 22 : 0;
    if (!meta) return 120 + caption;
    return Math.floor(meta.height * Math.min(width / meta.width, 3)) + caption;
}

/** Single column: images stack on a page while they fit (TOLE pages 5 and 7). */
function stackChunks(refs, images, top, bottom) {
    const width = PAGE_WIDTH - IMAGE_SIDE * 2;
    const area = PAGE_HEIGHT - bottom - top;
    const chunks = [];
    let current = [];
    let used = 0;
    refs.forEach((ref) => {
        const height = stackHeight(ref, images, width);
        const extra = current.length ? GRID_GAP + height : height;
        if (current.length && used + extra > area * 1.3) {
            chunks.push(current);
            current = [];
            used = 0;
        }
        used += current.length ? GRID_GAP + height : height;
        current.push(ref);
    });
    if (current.length) chunks.push(current);
    return chunks;
}

function stackGrid(refs, images, top, bottom) {
    const width = PAGE_WIDTH - IMAGE_SIDE * 2;
    const area = PAGE_HEIGHT - bottom - top;
    const heights = refs.map((ref) => stackHeight(ref, images, width));
    const total = heights.reduce((sum, height) => sum + height, 0);
    const scale = Math.min(1, (area - GRID_GAP * (refs.length - 1)) / total);
    const rows = heights.map((height) => `${Math.floor(height * scale)}px`).join(' ');

    const cells = refs.map((ref, index) => {
        const meta = imageMeta(ref, images);
        const cellHeight = Math.floor(heights[index] * scale);
        if (!meta) return `<div class="rp-cell" style="width:${width}px;height:${cellHeight}px"></div>`;
        const size = contain(meta, width, cellHeight - (ref.caption ? 22 : 0));
        return `<div class="rp-cell" style="width:${width}px;height:${cellHeight}px">`
            + `<img src="${esc(meta.url)}" alt="" style="width:${size.width}px;height:${size.height}px">`
            + (ref.caption ? `<p class="rp-cap">${esc(ref.caption)}</p>` : '')
            + '</div>';
    }).join('');

    return `<div class="rp-images" style="top:${top}px;bottom:${bottom}px;grid-template-columns:${width}px;grid-template-rows:${rows}">${cells}</div>`;
}

/**
 * One section of images, split over as many pages as needed.
 * header = HTML under the title (creatives); headerHeight = its height in px.
 */
function imagePages(ctx, { section, title, header: extra = '', headerHeight = 0, refs, columns, emptyText }) {
    const { images, metrics, theme } = ctx;
    const top = metrics.contentTop + headerHeight;
    const bottom = metrics.imageBottom;
    const titleBlock = (continued) => `<div class="rp-title"><span class="rp-title-text" style="font-size:${titleSize(title, theme.title.size)}px">${esc(title)}</span>`
        + `${continued ? '<span class="rp-continued">(continued)</span>' : ''}${extra}</div>`;

    if (!refs.length) {
        return [page(ctx, section, 'rp-image-page', `${header(ctx)}${titleBlock(false)}
            <div class="rp-empty" style="top:${top + 10}px;bottom:${bottom + 16}px">${esc(emptyText)}</div>${footer(ctx)}`)];
    }

    const cols = resolveColumns(columns, refs.length);
    const chunks = [];
    if (cols === 1) {
        chunks.push(...stackChunks(refs, images, top, bottom));
    } else {
        for (let start = 0; start < refs.length; start += CAPACITY[cols]) chunks.push(refs.slice(start, start + CAPACITY[cols]));
    }
    return chunks.map((chunk, index) => page(ctx, section, 'rp-image-page', `${header(ctx)}${titleBlock(index > 0)}`
        + `${cols === 1 ? stackGrid(chunk, images, top, bottom) : imageGrid(chunk, images, cols, top, bottom)}${footer(ctx)}`));
}

function creativeHeader(group) {
    let html = '';
    let height = 0;
    if (group.title || group.subtitle) {
        html += `<div class="rp-subtitle">${esc(group.title)}${group.subtitle ? `<small>${esc(group.subtitle)}</small>` : ''}</div>`;
        height += 42 + (group.subtitle ? 25 : 0);
    }
    const links = group.links.filter((link) => safeUrl(link.url));
    if (links.length) {
        html += `<div class="rp-links">${links.map((link) =>
            `<a href="${esc(safeUrl(link.url))}" data-pdf-link>${esc(link.label || 'Link')}</a>`).join('')}</div>`;
        height += 14 + links.length * 23;
    }
    return { html, height: height ? height + 6 : 0 };
}

/* ---------- Tables (paginated by measuring real row heights) ---------- */

let measureRoot = null;

function getMeasureRoot() {
    if (!measureRoot) {
        measureRoot = document.createElement('div');
        measureRoot.setAttribute('aria-hidden', 'true');
        measureRoot.style.cssText = 'position:absolute;left:-20000px;top:0;visibility:hidden;pointer-events:none';
        document.body.append(measureRoot);
    }
    return measureRoot;
}

/** Splits rows across pages so none runs into the footer. */
function paginateRows(ctx, buildPage, rows) {
    if (!rows.length) return [buildPage(null, 0)];
    const root = getMeasureRoot();
    root.innerHTML = buildPage(rows, 0);
    const pageElement = root.firstElementChild;
    const body = pageElement.querySelector('tbody');
    const pageTop = pageElement.getBoundingClientRect().top;
    const start = body.getBoundingClientRect().top - pageTop;
    const limit = ctx.metrics.tableLimit;
    const heights = Array.from(body.rows, (row) => row.getBoundingClientRect().height);
    root.innerHTML = '';

    const chunks = [];
    let current = [];
    let used = start;
    rows.forEach((row, index) => {
        if (current.length && used + heights[index] > limit) {
            chunks.push(current);
            current = [];
            used = start;
        }
        current.push(row);
        used += heights[index];
    });
    if (current.length) chunks.push(current);
    return chunks.map((chunk, index) => buildPage(chunk, index));
}

function tablePageTitle(ctx, text, index) {
    return `<div class="rp-title"><span class="rp-title-text" style="font-size:${titleSize(text, ctx.theme.title.size)}px">${esc(text)}</span>`
        + `${index > 0 ? '<span class="rp-continued">(continued)</span>' : ''}</div>`;
}

function shootPages(ctx) {
    const { data, theme } = ctx;
    const rows = data.shoots
        .filter((row) => row.date || row.description || row.link)
        .map((row) => {
            const url = safeUrl(row.link);
            return `<tr><td class="rp-center">${esc(dateShort(row.date))}</td>`
                + `<td class="rp-desc">${esc(row.description)}</td>`
                + `<td class="rp-link">${url ? `<a href="${esc(url)}" data-pdf-link>${esc(url)}</a>` : ''}</td></tr>`;
        });
    const build = (chunk, index) => page(ctx, 'shoots', 'rp-table-page', `${header(ctx)}
        ${tablePageTitle(ctx, label(theme, 'shoots', ctx.month), index)}
        <div class="rp-table-wrap"><table class="rp-table">
            <colgroup><col style="width:17%"><col style="width:50%"><col style="width:33%"></colgroup>
            <thead><tr><th>${esc(label(theme, 'shootDate'))}</th><th>${esc(label(theme, 'shootDescription'))}</th><th>${esc(label(theme, 'shootLink'))}</th></tr></thead>
            <tbody>${chunk ? chunk.join('') : '<tr><td colspan="3" class="rp-center">No content shoots recorded this month.</td></tr>'}</tbody>
        </table></div>${footer(ctx)}`);
    return paginateRows(ctx, build, rows);
}

function breakdownPages(ctx) {
    const { data, theme } = ctx;
    const rows = data.breakdown
        .filter((row) => row.title || row.note || row.bullets.length)
        .map((row) => `<tr><td class="rp-status">${esc(row.status)}</td>`
            + `<td class="rp-scope"><b>${esc(row.title)}</b>${row.bullets.length ? `<ul>${row.bullets.map((b) => `<li>${esc(b)}</li>`).join('')}</ul>` : ''}</td>`
            + `<td class="rp-note">${esc(row.note)}</td></tr>`);
    const build = (chunk, index) => page(ctx, 'breakdown', 'rp-table-page', `${header(ctx)}
        ${tablePageTitle(ctx, label(theme, 'breakdown', ctx.month), index)}
        <div class="rp-table-wrap"><table class="rp-table">
            <colgroup><col style="width:16%"><col style="width:44%"><col style="width:40%"></colgroup>
            <thead><tr><th>${esc(label(theme, 'status'))}</th><th>${esc(label(theme, 'scope'))}</th><th>${esc(label(theme, 'note'))}</th></tr></thead>
            <tbody>${chunk ? chunk.join('') : '<tr><td colspan="3" class="rp-center">No scope items yet.</td></tr>'}</tbody>
        </table></div>${footer(ctx)}`);
    return paginateRows(ctx, build, rows);
}

/* ---------- 9. Contact ---------- */

function contactItems(ctx, iconColor, cutout) {
    const c = ctx.data.contact;
    const set = icons(iconColor, cutout);
    const item = (icon, text, value) => (value
        ? `<div class="rp-c-item"><div class="rp-c-label">${set[icon]}${esc(text)}</div>${esc(value)}</div>` : '');
    return item('viber', 'Viber', [c.viberName, c.viberNumber].filter(Boolean).join('\n'))
        + item('email', 'Email', c.email)
        + item('website', 'Website', c.website)
        + item('location', 'Location', c.location);
}

function contactPage(ctx) {
    const { data, images, theme } = ctx;
    const photo = imageMeta(data.contact.image, images);
    const title = esc(label(theme, 'contactTitle'));
    const intro = esc(label(theme, 'contactIntro'));

    if (theme.layout.contact === 'simple') {
        return page(ctx, 'contact', 'rp-contact-simple', `${header(ctx)}
            <div class="rp-title"><span class="rp-title-text" style="font-size:${theme.title.size}px">${title}</span></div>
            <p class="rp-cs-intro">${intro}</p>
            <div class="rp-cs-list">${contactItems(ctx, theme.colors.primary, theme.colors.pageBg)}</div>
            <div class="rp-cs-photo">${photo ? coverImage(photo, 300, 420, 'Office photo') : '<span class="rp-placeholder">Office photo</span>'}</div>
            ${footer(ctx)}`);
    }

    return page(ctx, 'contact', 'rp-contact', `
        <div class="rp-clip rp-c-ring"><div class="rp-ring"></div></div>
        <div class="rp-c-head"><h1>${title}</h1><p>${intro}</p></div>
        <div class="rp-c-list">${contactItems(ctx, theme.colors.coverText, theme.colors.coverBg)}</div>
        <div class="rp-c-lime"></div>
        <div class="rp-c-photo">${photo ? coverImage(photo, 306, 463, 'Office photo') : '<span class="rp-placeholder">Office photo</span>'}</div>
        <div class="rp-c-rule"></div>
        <div class="rp-clip rp-corner"><div class="rp-ring"></div></div>`);
}

/* ---------- All pages ---------- */

/**
 * state = { data, meta, images, theme?, logoUrl? }
 * Returns one HTML string per A4 page.
 */
export function buildPages(state, { editing = false } = {}) {
    if (state.design?.kind === 'layout' && state.design.layout && state.data?.layout) {
        return layoutPages(state, { editing });
    }
    const ctx = context(state);
    const { data, theme, month } = ctx;
    const pages = [coverPage(ctx), summaryPage(ctx)];

    pages.push(...imagePages(ctx, {
        section: 'calendar', title: label(theme, 'calendar', month), refs: data.calendar.images,
        columns: data.calendar.columns, emptyText: '[Add the content calendar screenshot]',
    }));
    pages.push(...imagePages(ctx, {
        section: 'content', title: label(theme, 'content', month), refs: data.content.images,
        columns: data.content.columns, emptyText: '[Add the screenshot of all content created or edited]',
    }));
    data.posted.forEach((posted) => pages.push(...imagePages(ctx, {
        section: 'posted', title: posted.title || 'CONTENT POSTED', refs: posted.images, columns: posted.columns,
        emptyText: '[Add the screenshot of the content posted]',
    })));
    data.creatives.forEach((group) => {
        const extra = creativeHeader(group);
        pages.push(...imagePages(ctx, {
            section: 'creatives', title: label(theme, 'creatives', month), header: extra.html, headerHeight: extra.height,
            refs: group.images, columns: group.columns, emptyText: '[Add the designs for this campaign]',
        }));
    });
    pages.push(...shootPages(ctx), ...breakdownPages(ctx), contactPage(ctx));
    return pages.map((html, index) => html.replaceAll('{{PAGE}}', String(index + 1)));
}

/** Sections that would print a placeholder instead of real content. */
/** Exact-copy reports: one page per report page, drawn from its template page. */
export function layoutPages(state, { editing = false } = {}) {
    const layout = prepareLayout(state.design.layout);
    const fieldState = { data: state.data, meta: state.meta, images: state.images };
    return state.data.layout.pages.map((page, index) => {
        const template = layout.pages[page.src];
        if (!template) return '';
        return layoutPageHtml(template, page, fieldState, {
            asset: (name) => `${state.design.assetBase}p${page.src + 1}-${name}`,
            editing, pageId: page.id, label: `Page ${index + 1}: ${template.name || ''}`,
        });
    }).filter(Boolean);
}

export function emptySections(data, state = null) {
    if (state?.design?.kind === 'layout' && state.design.layout && data.layout) {
        const layout = prepareLayout(state.design.layout);
        return emptySlots(layout, data.layout, (index) => {
            const page = data.layout.pages[index];
            return `page ${index + 1}${layout.pages[page.src]?.name ? ` (${layout.pages[page.src].name})` : ''}`;
        });
    }
    const empty = [];
    if (!data.calendar.images.length) empty.push('Content Calendar');
    if (!data.content.images.length) empty.push('Content for the Month');
    data.posted.forEach((p) => { if (!p.images.length) empty.push(p.title || 'a Content Posted page'); });
    data.creatives.forEach((g) => { if (!g.images.length && !g.links.length) empty.push(`Creatives: ${g.title || 'untitled campaign'}`); });
    if (!data.cover.image) empty.push('Cover photo');
    if (!data.contact.image) empty.push('Office photo');
    return empty;
}
