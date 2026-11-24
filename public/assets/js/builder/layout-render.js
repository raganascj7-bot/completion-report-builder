/**
 * Draws "exact copy" pages: a report page that reproduces an uploaded PDF
 * page element by element, with the report's own words and pictures.
 *
 * A template page (from the upload) holds:
 *   bg       the page without text and photos (picture)
 *   texts[]  every paragraph: position, font, size, colour, spacing, the
 *            original lines, and optionally a pattern such as
 *            "Period start: {startDate}" that fills in report values
 *   images[] every photo: position, its original pixels, an optional shape
 *            mask, and a role: fixed (logo) · keep (until replaced) · slot
 *            (new each month, starts empty)
 *   links[]  clickable areas that don't sit on a text
 *
 * A report page (in report data, data.layout.pages[]) says which template
 * page it copies (src) and what changed on it: texts{}, images{}, links{},
 * hidden[]. Pages can be duplicated, removed and reordered.
 */
import { esc, safeUrl } from '../lib/dom.js';
import { MONTHS } from './format.js';

export const PAGE_WIDTH = 794;

/* ---------- Fonts ---------- */

export const LAYOUT_FONT_STACKS = {
    garet: '"Garet", "Montserrat", "Inter", Arial, sans-serif',
    montserrat: '"Montserrat", "Inter", Arial, sans-serif',
    inter: '"Inter", Arial, sans-serif',
    poppins: '"Poppins", "Montserrat", Arial, sans-serif',
    lora: '"Lora", Georgia, "Times New Roman", serif',
    georgia: 'Georgia, "Times New Roman", serif',
    arial: 'Arial, Helvetica, sans-serif',
    roboto: '"Roboto", "Inter", Arial, sans-serif',
    opensans: '"Open Sans", "Inter", Arial, sans-serif',
    sans: '"Inter", Arial, sans-serif',
    serif: 'Georgia, "Times New Roman", serif',
    mono: '"Courier New", Courier, monospace',
};

/** Parts of a PDF font name → our font. Longer names first. */
export const FONT_KEYS_BY_NAME = {
    montserrat: 'montserrat', poppins: 'poppins', garet: 'garet', inter: 'inter', lora: 'lora',
    georgia: 'georgia', roboto: 'roboto', opensans: 'opensans', helvetica: 'arial', arial: 'arial',
    timesnewroman: 'serif', times: 'serif', garamond: 'serif', playfair: 'serif', merriweather: 'serif',
    courier: 'mono',
};

export const fontCss = (key, weight, italic, size) =>
    `${italic ? 'italic ' : ''}${weight} ${size}px ${LAYOUT_FONT_STACKS[key] ?? LAYOUT_FONT_STACKS.sans}`;

const fontCache = new Map();
let measureContext = null;

/** Ascent, descent and a width function for one font at one size, as the browser will draw it. */
export async function measureFont(key, weight, italic, size) {
    const id = `${key}|${weight}|${italic}`;
    if (!fontCache.has(id)) {
        try { await document.fonts?.load(fontCss(key, weight, italic, 100)); } catch { /* fallback font */ }
        measureContext ??= document.createElement('canvas').getContext('2d');
        measureContext.font = fontCss(key, weight, italic, 100);
        const m = measureContext.measureText('Hg');
        fontCache.set(id, {
            ascent: (m.fontBoundingBoxAscent ?? 92) / 100,
            descent: (m.fontBoundingBoxDescent ?? 24) / 100,
        });
    }
    const base = fontCache.get(id);
    return {
        ascent: base.ascent * size,
        descent: base.descent * size,
        width(text) {
            measureContext.font = fontCss(key, weight, italic, size);
            return measureContext.measureText(text).width;
        },
    };
}

/* ---------- Report values that fill in a text ---------- */

export const LAYOUT_FIELDS = {
    month: { label: 'Report month' },
    year: { label: 'Report year' },
    monthYear: { label: 'Report month and year' },
    clientName: { label: 'Client name (as on the cover)', path: 'cover.clientDisplay' },
    preparedByName: { label: 'Prepared by — name', path: 'cover.preparedByName' },
    preparedByCompany: { label: 'Prepared by — company', path: 'cover.preparedByCompany' },
    reportDate: { label: 'Report date', path: 'summary.reportDate', date: true },
    startDate: { label: 'Start date', path: 'summary.startDate', date: true },
    completionDate: { label: 'Completion date', path: 'summary.completionDate', date: true },
    contractorName: { label: 'Agency name', path: 'summary.contractorName' },
    contractorAddress: { label: 'Agency address', path: 'summary.contractorAddress' },
    projectNames: { label: 'Project names', path: 'summary.projectNames' },
    projectDescription: { label: 'Project description', path: 'summary.projectDescription' },
    closingNote: { label: 'Closing note', path: 'summary.closingNote' },
    preparerName: { label: 'Prepared by (summary)', path: 'summary.preparerName' },
    preparerCompany: { label: 'Preparer’s company', path: 'summary.preparerCompany' },
    approverName: { label: 'Approver name', path: 'summary.approverName' },
    approverPosition: { label: 'Approver position', path: 'summary.approverPosition' },
    approverDepartment: { label: 'Approver department / company', path: 'summary.approverDepartment' },
    contactName: { label: 'Contact name', path: 'contact.viberName' },
    contactNumber: { label: 'Contact number', path: 'contact.viberNumber' },
    contactEmail: { label: 'Contact email', path: 'contact.email' },
    website: { label: 'Website', path: 'contact.website' },
    location: { label: 'Location', path: 'contact.location' },
};

export const TOKEN_PATTERN = /\{([a-zA-Z]+)(?::(upper|lower|title))?(?:@(long|short|numeric))?\}/g;

const getPath = (object, path) => path.split('.').reduce((value, key) => (value == null ? undefined : value[key]), object);

function formatDate(iso, style) {
    const m = /^(\d{4})-(\d{2})-(\d{2})$/.exec(iso ?? '');
    if (!m) return '';
    const [year, month, day] = [Number(m[1]), Number(m[2]), Number(m[3])];
    if (style === 'numeric') return `${String(month).padStart(2, '0')}/${String(day).padStart(2, '0')}/${year}`;
    const name = MONTHS[month - 1];
    return style === 'short' ? `${name.slice(0, 3)} ${day}, ${year}` : `${name} ${day}, ${year}`;
}

function applyCase(text, mode) {
    if (mode === 'upper') return text.toUpperCase();
    if (mode === 'lower') return text.toLowerCase();
    if (mode === 'title') return text.replace(/\S+/g, (word) => word.charAt(0).toUpperCase() + word.slice(1).toLowerCase());
    return text;
}

/** The value of one field for a report. state = { data, meta: { month, year } } */
export function fieldValue(field, state, { mode = '', format = 'long' } = {}) {
    const info = LAYOUT_FIELDS[field];
    if (!info || !state) return '';
    let value = '';
    const monthName = MONTHS[(Number(state.meta?.month) || 1) - 1];
    if (field === 'month') value = monthName;
    else if (field === 'year') value = String(state.meta?.year ?? '');
    else if (field === 'monthYear') value = `${monthName} ${state.meta?.year ?? ''}`;
    else if (info.date) value = formatDate(getPath(state.data, info.path), format);
    else value = String(getPath(state.data, info.path) ?? '');
    return applyCase(value, mode);
}

export function fillPattern(pattern, state) {
    return String(pattern).replace(TOKEN_PATTERN, (_, field, mode, format) => fieldValue(field, state, { mode, format }));
}

/** A pattern made of exactly one field that maps to report data: editing the text edits that field. */
export function soleField(pattern) {
    const match = /^\{([a-zA-Z]+)(?::(upper|lower|title))?(?:@(long|short|numeric))?\}$/.exec(String(pattern ?? ''));
    if (!match || !LAYOUT_FIELDS[match[1]]?.path || LAYOUT_FIELDS[match[1]].date) return null;
    return { field: match[1], path: LAYOUT_FIELDS[match[1]].path, mode: match[2] ?? '' };
}

/**
 * True when a pattern only replaces parts of the original text with fields
 * (the fixed words stay the same and in order). Guards against bad labels.
 */
export function patternFits(pattern, original) {
    if (typeof pattern !== 'string' || pattern === '') return false;
    const tokens = [...pattern.matchAll(TOKEN_PATTERN)];
    if (!tokens.length || tokens.some((token) => !LAYOUT_FIELDS[token[1]])) return false;
    const fixed = pattern.split(/\{[a-zA-Z]+(?::(?:upper|lower|title))?(?:@(?:long|short|numeric))?\}/);
    const flat = (text) => text.replace(/\s+/g, ' ').trim().toLowerCase();
    const source = flat(original);
    let at = 0;
    for (const part of fixed.map(flat)) {
        if (!part) continue;
        const found = source.indexOf(part, at);
        if (found < 0) return false;
        at = found + part.length;
    }
    return true;
}

/* ---------- Template preparation ---------- */

/**
 * Adds what rendering needs and the upload doesn't store:
 * box width with a little room, and how far each text may grow downwards.
 */
export function prepareLayout(layout) {
    if (!layout || layout.prepared) return layout;
    layout.pages.forEach((page) => {
        const blocks = [...page.texts, ...page.images];
        page.texts.forEach((text) => {
            const room = Math.max(2, text.w * 0.03);
            text.boxW = text.w + room;
            text.boxX = text.align === 'center' ? text.x - room / 2 : text.align === 'right' ? text.x - room : text.x;
            // A text may grow sideways into free space (a longer month, a longer name), but never
            // over another text, a photo, or a shape in the background (roomLeft/roomRight, see measureRoom).
            text.freeW = text.boxW;
            text.freeX = text.boxX;
            {
                const beside = blocks.filter((other) => other !== text
                    && other.y < text.y + text.h && other.y + other.h > text.y
                    && (other.x >= text.x + text.w - 1 || other.x + other.w <= text.x + 1));
                const right = Math.min(page.width - 30, text.roomRight ?? Infinity,
                    ...beside.filter((o) => o.x >= text.x + text.w - 1).map((o) => o.x - 8));
                const left = Math.max(30, text.roomLeft ?? -Infinity,
                    ...beside.filter((o) => o.x + o.w <= text.x + 1).map((o) => o.x + o.w + 8));
                if (text.align === 'left') {
                    text.freeW = Math.max(text.boxW, right - text.x);
                } else if (text.align === 'right') {
                    text.freeW = Math.max(text.boxW, text.x + text.w - left);
                    text.freeX = text.x + text.w - text.freeW;
                } else {
                    const center = text.x + text.w / 2;
                    text.freeW = Math.max(text.boxW, 2 * Math.min(center - left, right - center));
                    text.freeX = center - text.freeW / 2;
                }
            }
            const below = blocks
                .filter((other) => other !== text && other.y > text.y + text.h * 0.6
                    && Math.min(other.x + other.w, text.x + text.w) > Math.max(other.x, text.x))
                .map((other) => other.y);
            const limit = below.length ? Math.min(...below) - 4 : page.height - 24;
            text.maxH = Math.max(text.h, limit - text.y);
        });
    });
    layout.prepared = true;
    return layout;
}

/**
 * Measures, in each page's background picture, how far every text can grow
 * left and right before it meets a shape (an arc, a band, a frame). Works for
 * templates uploaded before this check existed. Runs once per template.
 * assetFor(pageIndex) → (name) → URL of that page's file.
 */
export async function measureRoom(layout, assetFor) {
    if (!layout || layout.roomMeasured) return layout;
    const load = (src) => new Promise((resolve, reject) => {
        const image = new Image();
        image.onload = () => resolve(image);
        image.onerror = reject;
        image.src = src;
    });
    const near = (a, b) => Math.abs(a[0] - b[0]) + Math.abs(a[1] - b[1]) + Math.abs(a[2] - b[2]) <= 45;
    await Promise.all(layout.pages.map(async (page, index) => {
        let picture;
        try {
            picture = await load(assetFor(index)('bg'));
        } catch {
            return;   // no background: fall back to the other checks
        }
        const scale = picture.naturalWidth / page.width;
        const canvas = document.createElement('canvas');
        canvas.width = picture.naturalWidth;
        canvas.height = picture.naturalHeight;
        const context = canvas.getContext('2d', { willReadFrequently: true });
        context.drawImage(picture, 0, 0);
        const pixels = context.getImageData(0, 0, canvas.width, canvas.height).data;
        const at = (x, y) => {
            const i = (Math.round(y * scale) * canvas.width + Math.round(x * scale)) * 4;
            return [pixels[i], pixels[i + 1], pixels[i + 2]];
        };
        page.texts.forEach((text) => {
            // Three rows through the text; the colour behind the text is the colour to stay on.
            const rows = [0.3, 0.55, 0.8].map((f) => Math.min(page.height - 1, Math.max(0, text.y + text.h * f / Math.max(1, text.lines.length))));
            let right = page.width - 24;
            let left = 24;
            rows.forEach((y) => {
                const base = at(Math.min(page.width - 1, Math.max(0, text.x + Math.min(4, text.w / 2))), y);
                for (let x = text.x + text.w; x < page.width - 24; x += 2) {
                    if (!near(at(x, y), base)) { right = Math.min(right, x - 10); break; }
                }
                for (let x = text.x; x > 24; x -= 2) {
                    if (!near(at(x, y), base)) { left = Math.max(left, x + 10); break; }
                }
            });
            text.roomRight = right;
            text.roomLeft = left;
        });
    }));
    layout.roomMeasured = true;
    layout.prepared = false;   // free space changed: work it out again
    return prepareLayout(layout);
}

/* ---------- Rendering ---------- */

/** What one text shows on a report page. exact = the original lines, unchanged. */
export function textContent(text, reportPage, state) {
    const override = reportPage?.texts?.[text.id];
    if (typeof override === 'string') return { value: override, exact: false, source: 'edited' };
    if (state && text.pattern) {
        const sole = soleField(text.pattern);
        const value = fillPattern(text.pattern, state);
        const flat = (t) => t.replace(/\s+/g, ' ').trim();
        // Same words as the original: keep the original's exact lines.
        if (flat(value) === flat(text.lines.join(' '))) return { value: text.lines.join('\n'), exact: true, source: sole ? 'field' : 'pattern' };
        return { value, exact: false, source: sole ? 'field' : 'pattern' };
    }
    return { value: text.lines.join('\n'), exact: true, source: 'template' };
}

function textHtml(text, reportPage, state, options) {
    const { value, exact, source } = textContent(text, reportPage, state);
    const link = reportPage?.links?.[text.id] ?? text.link;
    const href = link ? safeUrl(link) : '';
    const tag = href ? 'a' : 'div';
    const wide = !exact;   // changed text may use the free space beside it
    const style = [
        `left:${wide ? text.freeX : text.boxX}px`, `top:${text.y}px`, `width:${wide ? text.freeW : text.boxW}px`,
        `font:${fontCss(text.font, text.weight, text.italic, text.size)}`, `line-height:${text.lineHeight}px`,
        `color:${text.color}`, `text-align:${text.align}`,
        text.letterSpacing ? `letter-spacing:${text.letterSpacing}px` : '',
        // Mixed texts keep the original's line breaks ("Completion date: …" stays one line).
        `white-space:${exact || source === 'pattern' ? 'pre' : 'pre-wrap'}`,
        // Report values (a month, a name) never break inside a word; typed text may (long links).
        `overflow-wrap:${source === 'edited' ? 'break-word' : 'normal'}`,
    ].filter(Boolean).join(';');
    const empty = !exact && value.trim() === '' && options.editing;
    return `<${tag} class="lt-text${empty ? ' is-empty' : ''}" data-el="${text.id}" data-maxh="${Math.round(text.maxH)}" style="${esc(style)}"${href ? ` href="${esc(href)}" target="_blank" rel="noopener"` : ''}>${esc(empty ? '(empty)' : value)}</${tag}>`;
}

function imageHtml(image, reportPage, state, options) {
    const box = `left:${image.x}px;top:${image.y}px;width:${image.w}px;height:${image.h}px`;   // numbers only: safe in an attribute
    const set = reportPage?.images?.[image.id];
    const meta = set?.imageId ? state?.images?.[String(set.imageId)] : null;
    const maskUrl = image.mask ? options.asset(`${image.id}-mask`) : '';
    if (meta) {
        const mask = maskUrl ? `;-webkit-mask-image:url('${maskUrl}');mask-image:url('${maskUrl}');-webkit-mask-size:100% 100%;mask-size:100% 100%` : '';
        return `<div class="lt-img is-replaced" data-el="${image.id}" style="${esc(box + mask)}"${maskUrl ? ` data-mask="${esc(maskUrl)}"` : ''}>`
            + `<img src="${esc(meta.url)}" alt="" style="object-fit:${set.fit === 'contain' ? 'contain' : 'cover'}"></div>`;
    }
    if (image.role === 'slot') {
        return options.editing
            ? `<div class="lt-img lt-slot rp-placeholder" data-el="${image.id}" style="${box}"><span>Add picture</span></div>`
            : '';
    }
    return `<img class="lt-img" data-el="${image.id}" src="${esc(options.asset(image.id))}" alt="" style="${box}">`;
}

/**
 * HTML of one report page.
 * options: { asset(name) → URL for this template page's files, editing, pageId, label }
 */
export function layoutPageHtml(templatePage, reportPage, state, options) {
    const hidden = new Set(reportPage?.hidden ?? []);
    const images = templatePage.images.filter((image) => !hidden.has(image.id)).map((image) => imageHtml(image, reportPage, state, options)).join('');
    const texts = templatePage.texts.filter((text) => !hidden.has(text.id)).map((text) => textHtml(text, reportPage, state, options)).join('');
    const links = templatePage.links.filter((link) => !hidden.has(link.id)).map((link) => {
        const url = safeUrl(reportPage?.links?.[link.id] ?? link.url);
        return url ? `<a class="lt-link" data-el="${link.id}" href="${esc(url)}" target="_blank" rel="noopener" style="left:${link.x}px;top:${link.y}px;width:${link.w}px;height:${link.h}px"></a>` : '';
    }).join('');
    return `<div class="report-page lt-page${options.editing ? ' lt-editing' : ''}" data-lt-page="${esc(options.pageId ?? '')}" style="height:${templatePage.height}px" aria-label="${esc(options.label ?? 'Page')}">`
        + `<img class="lt-bg" src="${esc(options.asset('bg'))}" alt="">${images}${texts}${links}</div>`;
}

/**
 * Shrinks texts that no longer fit their space — too tall for the room below
 * them, or a line too wide for the free space beside them — down to 60%, and
 * flags what still doesn't fit (red outline in the editor only).
 */
export function fitTexts(root) {
    root.querySelectorAll('.lt-text[data-maxh]').forEach((element) => {
        const max = Number(element.dataset.maxh);
        element.classList.remove('is-overflowing');
        const fits = () => element.scrollHeight <= max + 1 && element.scrollWidth <= element.clientWidth + 1;
        if (!max || fits()) return;
        const size = parseFloat(element.style.fontSize || getComputedStyle(element).fontSize);
        const line = parseFloat(element.style.lineHeight || getComputedStyle(element).lineHeight);
        const spacing = parseFloat(element.style.letterSpacing) || 0;
        for (let factor = 0.95; factor >= 0.6; factor -= 0.05) {
            element.style.fontSize = `${size * factor}px`;
            element.style.lineHeight = `${line * factor}px`;
            if (spacing) element.style.letterSpacing = `${spacing * factor}px`;
            if (fits()) return;
        }
        element.classList.add('is-overflowing');
    });
}

/** Turns masked, replaced photos into plain pictures (html2canvas ignores CSS masks). */
export async function bakeMasks(root) {
    const load = (src) => new Promise((resolve, reject) => {
        const image = new Image();
        image.onload = () => resolve(image);
        image.onerror = reject;
        image.src = src;
    });
    for (const box of root.querySelectorAll('.lt-img.is-replaced[data-mask]')) {
        const picture = box.querySelector('img');
        try {
            const [photo, mask] = await Promise.all([load(picture.src), load(box.dataset.mask)]);
            const w = Math.round(box.offsetWidth * 2);
            const h = Math.round(box.offsetHeight * 2);
            const canvas = document.createElement('canvas');
            canvas.width = w;
            canvas.height = h;
            const context = canvas.getContext('2d');
            const contain = picture.style.objectFit === 'contain';
            const scale = contain ? Math.min(w / photo.naturalWidth, h / photo.naturalHeight) : Math.max(w / photo.naturalWidth, h / photo.naturalHeight);
            const dw = photo.naturalWidth * scale;
            const dh = photo.naturalHeight * scale;
            context.drawImage(photo, (w - dw) / 2, (h - dh) / 2, dw, dh);
            context.globalCompositeOperation = 'destination-in';
            context.drawImage(mask, 0, 0, w, h);
            picture.src = canvas.toDataURL('image/png');
            picture.style.objectFit = 'fill';
            box.style.webkitMaskImage = 'none';
            box.style.maskImage = 'none';
            await picture.decode().catch(() => {});
        } catch {
            // Keep the unmasked picture rather than nothing.
        }
    }
}

/* ---------- Report layout data ---------- */

let seq = 0;
export const newPageId = () => `p${Date.now().toString(36)}${(seq += 1).toString(36)}`;

/** A fresh report layout: one page per template page, nothing changed yet. */
export function freshReportLayout(layout, templateId = null) {
    return { templateId, pages: layout.pages.map((_, index) => ({ id: newPageId(), src: index, texts: {}, images: {}, links: {}, hidden: [] })) };
}

/** Template pages whose picture slots are still empty, as names for a warning. */
export function emptySlots(layout, reportLayout, names) {
    const missing = [];
    (reportLayout?.pages ?? []).forEach((page, index) => {
        const template = layout.pages[page.src];
        if (!template) return;
        const hidden = new Set(page.hidden ?? []);
        const empty = template.images.filter((image) => image.role === 'slot' && !hidden.has(image.id) && !page.images?.[image.id]?.imageId);
        if (empty.length) missing.push(`${names(index)} (${empty.length} picture${empty.length === 1 ? '' : 's'})`);
    });
    return missing;
}
