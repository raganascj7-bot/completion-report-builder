/**
 * Learns a design from an uploaded example report, in the browser:
 *
 * 1. pdf.js draws each page (max 8) and reads its text WITH positions,
 *    sizes and font names. Page pictures (JPG/PNG) give pixels only.
 * 2. From the text: the report's own headings (month → {MONTH}), table
 *    column names, summary labels, title position/size/capitals, fonts,
 *    footer page numbers and the brand words beside the logo.
 * 3. From the pixels: colours sampled exactly where titles, table headers,
 *    the header/footer and the cover month sit — so photos don't skew them —
 *    plus the table style (boxed, lined or striped).
 *
 * The result is a complete starter theme, so a design is usable even with
 * no AI. When an OpenAI key is set, the AI refines it afterwards.
 */
import { DEFAULT_THEME } from '../builder/theme.js';

const MAX_PAGES = 8;
const RENDER_WIDTH = 1240;   // page pictures: ≈ A4 at 150 dpi
const A4_WIDTH = 794;        // all text positions are converted to this width
const MONTHS = ['january', 'february', 'march', 'april', 'may', 'june', 'july', 'august', 'september', 'october', 'november', 'december'];
const MONTH_PATTERN = new RegExp(`\\b(${MONTHS.join('|')})\\b`, 'i');

/* ---------- Reading files ---------- */

let pdfjs = null;
async function loadPdfJs() {
    if (!pdfjs) {
        pdfjs = await import('../../vendor/pdfjs/pdf.min.mjs');
        pdfjs.GlobalWorkerOptions.workerSrc = new URL('../../vendor/pdfjs/pdf.worker.min.mjs', import.meta.url).href;
    }
    return pdfjs;
}

function whiteCanvas(width, height) {
    const canvas = document.createElement('canvas');
    canvas.width = width;
    canvas.height = height;
    const context = canvas.getContext('2d', { willReadFrequently: true });
    context.fillStyle = '#ffffff';
    context.fillRect(0, 0, width, height);
    return { canvas, context };
}

const toJpeg = (canvas) => new Promise((resolve, reject) =>
    canvas.toBlob((blob) => (blob ? resolve(blob) : reject(new Error('A page could not be converted.'))), 'image/jpeg', 0.86));

/** Text of one PDF page as lines, in A4-pixel coordinates (794 wide). */
async function pageText(pdfPage) {
    const base = pdfPage.getViewport({ scale: 1 });
    const k = A4_WIDTH / base.width;
    const content = await pdfPage.getTextContent();
    const fontName = (id) => {
        try { return pdfPage.commonObjs.get(id)?.name ?? id; } catch { return id; }
    };
    const items = content.items
        .filter((item) => typeof item.str === 'string' && item.str.trim() !== '')
        .map((item) => {
            const size = Math.hypot(item.transform[2], item.transform[3]) * k;
            return {
                str: item.str,
                x: item.transform[4] * k,
                y: (base.height - item.transform[5]) * k,   // baseline, from the top
                width: item.width * k,
                size,
                font: String(fontName(item.fontName)).replace(/^[A-Z]{6}\+/, ''),
            };
        })
        .sort((a, b) => a.y - b.y || a.x - b.x);

    // Join pieces on the same baseline that sit close together; a wide gap
    // starts a new piece (table cells stay separate).
    const lines = [];
    items.forEach((item) => {
        const line = lines.find((l) => Math.abs(l.y - item.y) < Math.max(2, item.size * 0.35)
            && item.x - l.right < item.size * 1.6 && item.x >= l.x - 2);
        if (line) {
            const joiner = item.x - line.right > item.size * 0.15 && !line.text.endsWith(' ') && !item.str.startsWith(' ') ? ' ' : '';
            line.text += joiner + item.str;
            line.right = Math.max(line.right, item.x + item.width);
            line.size = Math.max(line.size, item.size);
            line.fonts[item.font] = (line.fonts[item.font] ?? 0) + item.str.length;
        } else {
            lines.push({ text: item.str, x: item.x, right: item.x + item.width, y: item.y, size: item.size, fonts: { [item.font]: item.str.length } });
        }
    });
    lines.forEach((line) => {
        line.text = line.text.replace(/\s+/g, ' ').trim();
        line.font = Object.entries(line.fonts).sort((a, b) => b[1] - a[1])[0]?.[0] ?? '';
    });
    return { lines: lines.filter((line) => line.text), height: base.height * k };
}

async function readPdf(file, onPage) {
    const lib = await loadPdfJs();
    let task;
    let pdf;
    try {
        task = lib.getDocument({ data: new Uint8Array(await file.arrayBuffer()), isEvalSupported: false });
        pdf = await task.promise;
    } catch {
        throw new Error('This PDF could not be opened. Is it password-protected or damaged?');
    }
    const total = Math.min(pdf.numPages, MAX_PAGES);
    const pages = [];
    try {
        for (let number = 1; number <= total; number += 1) {
            onPage(number, total);
            const pdfPage = await pdf.getPage(number);
            const base = pdfPage.getViewport({ scale: 1 });
            const viewport = pdfPage.getViewport({ scale: RENDER_WIDTH / base.width });
            const { canvas, context } = whiteCanvas(Math.round(viewport.width), Math.round(viewport.height));
            await pdfPage.render({ canvas, canvasContext: context, viewport }).promise;
            pages.push({ canvas, text: await pageText(pdfPage) });
        }
    } finally {
        await task.destroy();
    }
    return { pages, totalPages: pdf.numPages };
}

function loadImage(file) {
    return new Promise((resolve, reject) => {
        const url = URL.createObjectURL(file);
        const image = new Image();
        image.onload = () => { URL.revokeObjectURL(url); resolve(image); };
        image.onerror = () => { URL.revokeObjectURL(url); reject(new Error(`“${file.name}” is not a readable image.`)); };
        image.src = url;
    });
}

async function readImages(files, onPage) {
    const list = files.slice(0, MAX_PAGES);
    const pages = [];
    for (let index = 0; index < list.length; index += 1) {
        onPage(index + 1, list.length);
        const image = await loadImage(list[index]);
        const scale = Math.min(1, RENDER_WIDTH / image.naturalWidth);
        const { canvas, context } = whiteCanvas(Math.round(image.naturalWidth * scale), Math.round(image.naturalHeight * scale));
        context.drawImage(image, 0, 0, canvas.width, canvas.height);
        pages.push({ canvas, text: null });
    }
    return { pages, totalPages: files.length };
}

/* ---------- Colour measurement ---------- */

const hex = ([r, g, b]) => `#${[r, g, b].map((v) => Math.round(v).toString(16).padStart(2, '0')).join('')}`;
const luminance = ([r, g, b]) => (0.2126 * r + 0.7152 * g + 0.0722 * b) / 255;
function saturation([r, g, b]) {
    const max = Math.max(r, g, b);
    const min = Math.min(r, g, b);
    return max === 0 ? 0 : (max - min) / max;
}
const distance = (a, b) => Math.hypot(a[0] - b[0], a[1] - b[1], a[2] - b[2]);
const isWhiteish = (rgb) => luminance(rgb) > 0.93 && saturation(rgb) < 0.08;
const isBlackish = (rgb) => luminance(rgb) < 0.12;
const isColourful = (rgb) => saturation(rgb) > 0.28 && !isWhiteish(rgb) && !isBlackish(rgb);
const readableOn = (rgb) => (luminance(rgb) > 0.6 ? '#111111' : '#ffffff');

/** Colour buckets of a region (fractions of the page). Returns [{ rgb, share }] largest first. */
function measure(canvas, region = { x: 0, y: 0, w: 1, h: 1 }, sampleWidth = 96) {
    const sx = Math.max(0, Math.floor(region.x * canvas.width));
    const sy = Math.max(0, Math.floor(region.y * canvas.height));
    const sw = Math.max(1, Math.min(canvas.width - sx, Math.floor(region.w * canvas.width)));
    const sh = Math.max(1, Math.min(canvas.height - sy, Math.floor(region.h * canvas.height)));
    const height = Math.max(1, Math.round(sampleWidth * (sh / sw)));
    const small = document.createElement('canvas');
    small.width = sampleWidth;
    small.height = height;
    const context = small.getContext('2d', { willReadFrequently: true });
    context.drawImage(canvas, sx, sy, sw, sh, 0, 0, sampleWidth, height);
    const pixels = context.getImageData(0, 0, sampleWidth, height).data;

    const buckets = new Map();
    for (let i = 0; i < pixels.length; i += 4) {
        const key = ((pixels[i] >> 3) << 10) | ((pixels[i + 1] >> 3) << 5) | (pixels[i + 2] >> 3);
        const bucket = buckets.get(key) ?? { r: 0, g: 0, b: 0, n: 0 };
        bucket.r += pixels[i]; bucket.g += pixels[i + 1]; bucket.b += pixels[i + 2]; bucket.n += 1;
        buckets.set(key, bucket);
    }
    const total = pixels.length / 4;
    const merged = [];
    [...buckets.values()].sort((a, b) => b.n - a.n).forEach((bucket) => {
        const rgb = [bucket.r / bucket.n, bucket.g / bucket.n, bucket.b / bucket.n];
        const near = merged.find((item) => distance(item.rgb, rgb) < 28);
        if (near) {
            near.rgb = near.rgb.map((value, k) => (value * near.n + rgb[k] * bucket.n) / (near.n + bucket.n));
            near.n += bucket.n;
        } else {
            merged.push({ rgb, n: bucket.n });
        }
    });
    return merged.sort((a, b) => b.n - a.n).map((item) => ({ rgb: item.rgb, share: item.n / total }));
}

/** The ink colour of a text line: the most common non-background colour in its box. */
function inkColour(page, line) {
    if (!line) return null;
    const { canvas, text } = page;
    const box = {
        x: (line.x - 1) / A4_WIDTH,
        y: (line.y - line.size * 0.85) / text.height,
        w: (line.right - line.x + 2) / A4_WIDTH,
        h: (line.size * 1.05) / text.height,
    };
    const swatches = measure(canvas, box, 160);
    const background = swatches[0]?.rgb;
    const ink = swatches.find((s) => background && distance(s.rgb, background) > 90 && s.share > 0.02);
    return ink?.rgb ?? null;
}

/** Background behind a text line (e.g. a table header). */
function backgroundColour(page, line) {
    if (!line) return null;
    const { canvas, text } = page;
    return measure(canvas, {
        x: (line.x - 4) / A4_WIDTH, y: (line.y - line.size * 1.4) / text.height,
        w: (line.right - line.x + 8) / A4_WIDTH, h: (line.size * 2) / text.height,
    }, 120)[0]?.rgb ?? null;
}

/** Measured palette across all pages (shown in the editor and given to the AI). */
function palette(pages) {
    const all = [];
    pages.forEach(({ canvas }) => measure(canvas).forEach((swatch) => {
        const near = all.find((item) => distance(item.rgb, swatch.rgb) < 30);
        if (near) near.share += swatch.share / pages.length;
        else all.push({ rgb: swatch.rgb, share: swatch.share / pages.length });
    }));
    return all.filter((item) => item.share > 0.004).sort((a, b) => b.share - a.share).slice(0, 12);
}

/* ---------- Reading the text ---------- */

/** Maps a PDF font name to the closest font the app has. */
export function matchFont(name) {
    const n = String(name ?? '').toLowerCase().replace(/[^a-z]/g, '');
    if (!n) return null;
    if (n.includes('garet')) return 'garet';
    if (n.includes('montserrat') || n.includes('gotham') || n.includes('futura')) return 'montserrat';
    if (n.includes('poppins') || n.includes('nunito') || n.includes('quicksand')) return 'poppins';
    if (n.includes('lora') || n.includes('playfair') || n.includes('merriweather') || n.includes('cormorant')) return 'lora';
    if (/roboto|inter|opensans|lato|sourcesans|worksans|dmsans|ptsans|raleway|ubuntu/.test(n)) return 'inter';
    if (/arial|helvetica|liberationsans|calibri|verdana|tahoma|segoe|sans/.test(n)) return 'arial';
    if (/georgia|times|garamond|cambria|baskerville|serif|book|minion/.test(n)) return 'georgia';
    return null;
}

const isUpper = (text) => /[A-Z]/.test(text) && text === text.toUpperCase();
const mostCommon = (values) => {
    const counts = new Map();
    values.filter(Boolean).forEach((value) => counts.set(value, (counts.get(value) ?? 0) + 1));
    return [...counts.entries()].sort((a, b) => b[1] - a[1])[0]?.[0] ?? null;
};

/** "Content Calendar – August 2026" → "Content Calendar – {Month}" */
function withMonthPlaceholder(text) {
    return text.replace(new RegExp(`\\b(${MONTHS.join('|')})\\b(\\s+20\\d\\d)?`, 'gi'),
        (month) => (isUpper(month.replace(/\d/g, '')) ? '{MONTH}' : '{Month}')).trim();
}

/** The largest text in the top part of a page, below any header logo text. */
function pageTitle(text) {
    const candidates = text.lines.filter((line) => line.y < text.height * 0.42 && line.y > text.height * 0.06
        && line.size >= 14 && /[a-z]/i.test(line.text) && line.text.length <= 70);
    return candidates.sort((a, b) => b.size - a.size || a.y - b.y)[0] ?? null;
}

const SECTION_RULES = [
    ['contactTitle', /contact|get in touch|reach us|connect with/i],
    ['calendar', /calendar/i],
    ['shoots', /shoot|production|photo\s*(and|&)\s*video/i],
    ['breakdown', /breakdown|scope|status|deliverables summary/i],
    ['creatives', /creative|layout|artwork|design deliverable/i],
    ['content', /content\s+(for|created|produced|made)|content of the month/i],
    ['posted', /posted|published|uploaded/i],
];

/** Cells of the table header row under a title: the first row with 3 pieces. */
function tableHeader(text, title) {
    const below = text.lines.filter((line) => line.y > (title?.y ?? 0) + 4 && line.y < text.height * 0.6);
    const rows = new Map();
    below.forEach((line) => {
        const key = Math.round(line.y / 4);
        rows.set(key, [...(rows.get(key) ?? []), line]);
    });
    const first = [...rows.entries()].sort((a, b) => a[0] - b[0]).find(([, cells]) => cells.length >= 3);
    return first ? first[1].sort((a, b) => a.x - b.x).slice(0, 3) : null;
}

/** Table style from the pixels just below the header row. */
function tableStyle(page, header) {
    if (!header) return null;
    const { canvas, text } = page;
    const top = header[0].y + header[0].size * 0.6;
    // The table ends at the last line that starts in the first column.
    const firstColumn = text.lines.filter((line) => Math.abs(line.x - header[0].x) < 8 && line.y > header[0].y);
    const lastRow = Math.max(top + 40, ...firstColumn.map((line) => line.y + line.size));
    const rowsHeight = Math.min(text.height * 0.4, lastRow - top);
    if (rowsHeight < 30) return null;
    const between = (header[0].right + header[1].x) / 2;      // gap between column 1 and 2
    const vertical = measure(canvas, { x: (between - 2) / A4_WIDTH, y: top / text.height, w: 4 / A4_WIDTH, h: rowsHeight / text.height }, 8);
    const lineShare = vertical.filter((s) => luminance(s.rgb) < 0.75).reduce((sum, s) => sum + s.share, 0);
    if (lineShare > 0.45) return 'boxed';
    // Sample the cell padding just left of the text: pale row shading shows there, letters don't.
    const strip = measure(canvas, { x: (header[0].x - 6) / A4_WIDTH, y: top / text.height, w: 4 / A4_WIDTH, h: rowsHeight / text.height }, 8);
    const tinted = strip.filter((s) => distance(s.rgb, [255, 255, 255]) > 12 && luminance(s.rgb) > 0.75).reduce((sum, s) => sum + s.share, 0);
    return tinted > 0.18 ? 'striped' : 'lined';
}

/**
 * Reads headings, labels, fonts and title style from the text of the pages.
 * Returns { labels, title, fonts, footerContent, brandText, found, lines } —
 * only values actually found in the PDF are included.
 */
function readText(pages) {
    const result = { labels: {}, title: {}, fonts: {}, found: [], titleLines: [], tableHeaders: {} };
    const texts = pages.map((page) => page.text);
    if (!texts.every(Boolean)) return result;

    // Cover: title words without the month and year, and the "prepared" labels.
    const cover = texts[0];
    const coverLines = cover.lines.filter((line) => /[a-z]/i.test(line.text));
    const biggest = Math.max(0, ...coverLines.map((line) => line.size));
    const headline = coverLines.filter((line) => line.size >= biggest * 0.8)
        .map((line) => line.text.replace(MONTH_PATTERN, '').replace(/\b20\d\d\b/g, '').trim())
        .filter(Boolean).join(' ');
    if (headline && headline.length <= 60) result.labels.coverTitle = headline;
    result.coverTitleLine = coverLines.find((line) => line.size >= biggest * 0.8) ?? null;
    result.coverMonthLine = cover.lines.find((line) => MONTH_PATTERN.test(line.text) && line.size >= 12) ?? null;
    cover.lines.forEach((line) => {
        const forMatch = line.text.match(/^(prepared\s+for\b[\s.:]*)/i);
        const byMatch = line.text.match(/^(prepared\s+by\b[\s.:]*)/i);
        if (forMatch) result.labels.preparedFor = forMatch[1].trim();
        if (byMatch) result.labels.preparedBy = byMatch[1].trim();
    });

    // Every other page: its title decides which section it is.
    texts.slice(1).forEach((text, offset) => {
        const index = offset + 1;
        const title = pageTitle(text);
        if (!title) return;
        result.titleLines.push({ ...title, page: index });
        const rule = SECTION_RULES.find(([, pattern]) => pattern.test(title.text));
        const key = rule ? rule[0] : (index === 1 ? 'summaryTitle' : null);
        if (!key || key === 'posted') return;
        if (!result.labels[key]) {
            result.labels[key] = withMonthPlaceholder(title.text);
            result.found.push(key);
        }
        if (key === 'shoots' || key === 'breakdown') {
            const header = tableHeader(text, title);
            if (header) {
                result.tableHeaders[key] = { page: index, cells: header };
                const names = key === 'shoots' ? ['shootDate', 'shootDescription', 'shootLink'] : ['status', 'scope', 'note'];
                names.forEach((name, i) => { result.labels[name] = header[i].text; });
            }
        }
        if (key === 'contactTitle') {
            const intro = text.lines.filter((line) => line.y > title.y && line.y < title.y + title.size * 5 && line.size < title.size * 0.8)
                .sort((a, b) => a.y - b.y)[0];
            if (intro && intro.text.length > 20) result.labels.contactIntro = intro.text.slice(0, 200);
        }
        if (key === 'summaryTitle') readSummaryLabels(text, title, result);
    });

    // Title style from all page titles.
    const titles = result.titleLines;
    if (titles.length) {
        const centred = titles.filter((t) => Math.abs((t.x + t.right) / 2 - A4_WIDTH / 2) < 40 && t.x > 90).length;
        result.title.align = centred >= titles.length / 2 ? 'center' : 'left';
        const sizes = titles.map((t) => t.size).sort((a, b) => a - b);
        result.title.size = Math.round(Math.min(40, Math.max(18, sizes[Math.floor(sizes.length / 2)])));
        result.title.uppercase = titles.filter((t) => isUpper(t.text)).length / titles.length >= 0.75;
    }

    // Fonts: cover headline, page titles, and the most-used font on the summary page.
    result.fonts.display = matchFont(result.coverTitleLine?.font);
    result.fonts.heading = matchFont(mostCommon(titles.map((t) => t.font)));
    const summary = texts[1];
    if (summary) {
        const weights = {};
        summary.lines.forEach((line) => Object.entries(line.fonts).forEach(([font, count]) => { weights[font] = (weights[font] ?? 0) + count; }));
        result.fonts.body = matchFont(Object.entries(weights).sort((a, b) => b[1] - a[1])[0]?.[0]);
    }

    // Footer: page numbers and/or a company name at the bottom of inner pages.
    const footers = texts.slice(1).map((text) => text.lines.filter((line) => line.y > text.height * 0.93));
    const withNumbers = footers.filter((lines) => lines.some((line) => /^(page\s*)?\d{1,2}$/i.test(line.text))).length;
    const withWords = footers.filter((lines) => lines.some((line) => !/^(page\s*)?\d{1,2}$/i.test(line.text))).length;
    if (footers.length) {
        if (withNumbers >= footers.length / 2) result.footerContent = withWords >= footers.length / 2 ? 'company-page' : 'page';
        else if (withWords >= footers.length / 2) result.footerContent = 'company';
    }

    // Brand words beside the logo, from the header of an inner page.
    // (Very short words such as "BW" are usually letters drawn inside the logo itself.)
    const headerText = texts[1]?.lines.filter((line) => line.y < texts[1].height * 0.1 && line.size < 16 && line.text.length > 3) ?? [];
    if (headerText.length && headerText.length <= 4 && headerText.every((line) => line.text.length <= 30)) {
        result.brandText = headerText.sort((a, b) => a.y - b.y).map((line) => line.text).join('\n');
    }
    return result;
}

/** Summary page: section headings in order, date labels and the sign-off label. */
function readSummaryLabels(text, title, result) {
    const body = text.lines.filter((line) => line.y > title.y + 2 && line.y < text.height * 0.93);
    const headings = body.filter((line) => isUpper(line.text) && line.text.length >= 4 && line.text.length <= 40
        && !MONTH_PATTERN.test(line.text) && !/approved|received|accepted|noted|conforme/i.test(line.text));
    ['contractor', 'projectName', 'projectDescription'].forEach((key, i) => {
        if (headings[i]) result.labels[key] = headings[i].text;
    });
    body.forEach((line) => {
        const start = line.text.match(/^([A-Za-z ]*\bstart(ed)?\b[A-Za-z ]*:)/i);
        const end = line.text.match(/^([A-Za-z ]*\b(end|completion|completed)\b[A-Za-z ]*:)/i);
        const sign = line.text.match(/^((approved|received|accepted|noted|checked)\s+by\s*:?|conforme\s*:?)/i);
        if (start) result.labels.startDate = start[1].trim();
        if (end) result.labels.completionDate = end[1].trim();
        if (sign) result.labels.approvedBy = sign[1].trim();
    });
}

/* ---------- Building the starter theme ---------- */

function starterTheme(pages, swatches, text) {
    const theme = structuredClone(DEFAULT_THEME);
    const notes = [];
    const cover = pages[0];
    const inner = pages[1] ?? pages[0];

    // Layout from where colour sits.
    const coverMain = measure(cover.canvas)[0].rgb;
    const coverIsColour = !isWhiteish(coverMain);
    const top = measure(inner.canvas, { x: 0, y: 0, w: 1, h: 0.08 })[0].rgb;
    const bottom = measure(inner.canvas, { x: 0, y: 0.955, w: 1, h: 0.045 })[0].rgb;
    const headerIsBand = !isWhiteish(top);
    const footerIsBand = !isWhiteish(bottom);

    // Colours measured on the elements themselves (titles, table header, cover month).
    const firstTitle = text.titleLines[0];
    const titleInk = firstTitle ? inkColour(pages[firstTitle.page], firstTitle) : null;
    const tableInfo = text.tableHeaders.shoots ?? text.tableHeaders.breakdown;
    const tableBg = tableInfo ? backgroundColour(pages[tableInfo.page], tableInfo.cells[0]) : null;
    const monthInk = text.coverMonthLine ? inkColour(cover, text.coverMonthLine) : null;
    const coverTitleInk = text.coverTitleLine ? inkColour(cover, text.coverTitleLine) : null;

    const colourful = swatches.filter((item) => isColourful(item.rgb)).map((item) => item.rgb);
    const primary = [titleInk, tableBg, headerIsBand ? top : null, coverIsColour ? coverMain : null, coverTitleInk, colourful[0]]
        .find((rgb) => rgb && isColourful(rgb)) ?? colourful[0] ?? [17, 17, 17];
    const accent = [monthInk, ...colourful].find((rgb) => rgb && isColourful(rgb) && distance(rgb, primary) > 90) ?? primary;
    const dark = swatches.find((item) => isBlackish(item.rgb))?.rgb ?? [17, 17, 17];
    // A thin footer rule measures paler than it is; when it is a tint of the brand colour, use the brand colour.
    let lineColour = footerIsBand ? bottom
        : (measure(inner.canvas, { x: 0.1, y: 0.94, w: 0.8, h: 0.03 }).find((s) => !isWhiteish(s.rgb))?.rgb ?? primary);
    if (!footerIsBand && distance(lineColour, primary) < 150) lineColour = primary;

    Object.assign(theme.colors, {
        primary: hex(primary),
        accent: hex(accent),
        text: hex(dark),
        title: hex(titleInk ?? dark),
        pageBg: '#ffffff',
        headerBg: headerIsBand ? hex(top) : hex(primary),
        headerText: headerIsBand ? readableOn(top) : '#ffffff',
        footerBg: hex(lineColour),
        footerText: footerIsBand ? readableOn(bottom) : hex(lineColour),
        coverBg: coverIsColour ? hex(coverMain) : '#ffffff',
        coverText: coverIsColour ? readableOn(coverMain) : hex(coverTitleInk ?? dark),
        coverAccent: hex(monthInk ?? accent),
        tableHeadBg: hex(tableBg && !isWhiteish(tableBg) ? tableBg : dark),
        tableHeadText: readableOn(tableBg && !isWhiteish(tableBg) ? tableBg : dark),
        tableBorder: hex(tableBg && !isWhiteish(tableBg) ? tableBg : dark),
        link: '#1a4fd6',
    });
    theme.layout = {
        cover: coverIsColour ? 'band' : 'centered',
        header: headerIsBand ? 'band' : 'line',
        footer: footerIsBand ? 'band' : 'line',
        contact: 'simple',
        table: (tableInfo && tableStyle(pages[tableInfo.page], tableInfo.cells)) || 'boxed',
        decoration: 'none',
    };

    // What the text told us.
    Object.assign(theme.labels, text.labels);
    Object.assign(theme.title, text.title);
    Object.entries(text.fonts).forEach(([key, font]) => { if (font) theme.fonts[key] = font; });
    if (text.footerContent) theme.footerContent = text.footerContent;
    if (text.brandText) {
        theme.brand.text = text.brandText;
        if (text.brandText.replace(/\s+/g, ' ').toUpperCase() !== 'DIGITAL MARKETING SERVICES') {
            theme.brand.logo = 'none';
            notes.push(`This report shows its own brand (“${text.brandText.replace(/\n/g, ' ')}”). Cut its logo out of a page under Logo, or switch back to the JT mark.`);
        }
    }

    const headingNames = Object.keys(text.labels).length;
    notes.unshift(headingNames
        ? `${headingNames} headings and labels were copied from your PDF — check them under “Headings and wording”.`
        : 'No text could be read from the upload (pictures only), so headings use the JT wording. Edit them under “Headings and wording”.');
    const fontNotes = Object.entries(text.fonts).filter(([, font]) => font).map(([key, font]) => `${key} → ${font}`);
    if (fontNotes.length) notes.push(`Fonts matched from the PDF: ${fontNotes.join(', ')}.`);
    if (text.footerContent && text.footerContent !== 'company') notes.push('Page numbers were found in the footer, so they are shown too.');
    notes.push('Colours were measured from the titles, table headers and cover. Cover and contact layouts are the closest match — compare the two columns.');
    return { theme, notes };
}

/**
 * files = the user's selection (one PDF, or page pictures in order).
 * onStep(step, detail) reports progress: 'read' | 'measure'.
 * Returns { pages: Blob[], source, totalPages, palette, theme, notes, analyzedBy }.
 */
export async function readDesign(files, onStep = () => {}) {
    const list = Array.from(files ?? []);
    if (!list.length) throw new Error('Choose a PDF or page pictures.');
    const pdf = list.find((file) => file.type === 'application/pdf' || /\.pdf$/i.test(file.name));
    if (pdf && list.length > 1) throw new Error('Choose one PDF, or only pictures — not both.');
    const images = list.filter((file) => /^image\/(jpeg|png|webp)$/.test(file.type));
    if (!pdf && images.length !== list.length) throw new Error('Use a PDF, or JPG / PNG / WebP pictures of the pages.');

    const result = pdf
        ? await readPdf(pdf, (n, total) => onStep('read', `page ${n} of ${total}`))
        : await readImages(images, (n, total) => onStep('read', `picture ${n} of ${total}`));
    if (result.pages.length < 2) throw new Error('Upload at least two pages (the cover and one inside page) so the design can be learned.');

    onStep('measure');
    const swatches = palette(result.pages);
    const text = readText(result.pages);
    const { theme, notes } = starterTheme(result.pages, swatches, text);
    const pictures = [];
    for (const page of result.pages) pictures.push(await toJpeg(page.canvas));

    return {
        pages: pictures,
        source: pdf ?? null,
        totalPages: result.totalPages,
        palette: swatches.map((item) => ({ hex: hex(item.rgb), share: Number(item.share.toFixed(3)) })),
        theme,
        notes,
        analyzedBy: pdf && Object.keys(text.labels).length ? 'pdf' : 'colors',
    };
}

