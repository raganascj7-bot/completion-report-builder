/**
 * Exact copy of an uploaded report, read in the browser with pdf.js.
 *
 * Every page is drawn three times at 2× size:
 *   A  the full page
 *   B  the page without its text            (text calls are skipped)
 *   C  the page without text and photos     (text and photo calls skipped)
 *
 * From those:
 *   background = C            exact shapes, bands and colours, nothing to edit
 *   each photo = B − C        its exact visible pixels (crops, rounded corners)
 *   each text  = A − B        its exact colour; position, size and font come
 *                             straight from the PDF's text
 *
 * Nothing is estimated from pictures, so no element moves. The AI (if a key
 * is set) only labels what each element is — see app/openai.php.
 */
import { measureFont, FONT_KEYS_BY_NAME } from '../builder/layout-render.js';

export const PAGE_WIDTH = 794;          // every page is converted to this width (A4 at 96 dpi)
export const MAX_LAYOUT_PAGES = 30;
const SCALE = 2;                        // pictures are made at 2× for sharp PDFs

let pdfjs = null;
async function loadPdfJs() {
    if (!pdfjs) {
        pdfjs = await import('../../vendor/pdfjs/pdf.min.mjs');
        pdfjs.GlobalWorkerOptions.workerSrc = new URL('../../vendor/pdfjs/pdf.worker.min.mjs', import.meta.url).href;
    }
    return pdfjs;
}

/* ---------- Drawing a page with parts switched off ---------- */

const contexts = [globalThis.CanvasRenderingContext2D, globalThis.OffscreenCanvasRenderingContext2D].filter(Boolean);
const isPhoto = (source) => (typeof ImageBitmap !== 'undefined' && source instanceof ImageBitmap)
    || (typeof VideoFrame !== 'undefined' && source instanceof VideoFrame)
    || (typeof HTMLImageElement !== 'undefined' && source instanceof HTMLImageElement);

async function renderPage(page, viewport, { text = true, photos = true } = {}) {
    const canvas = document.createElement('canvas');
    canvas.width = Math.round(viewport.width);
    canvas.height = Math.round(viewport.height);
    const context = canvas.getContext('2d', { willReadFrequently: true });
    context.fillStyle = '#ffffff';
    context.fillRect(0, 0, canvas.width, canvas.height);

    const saved = contexts.map((type) => ({ type, fillText: type.prototype.fillText, strokeText: type.prototype.strokeText, drawImage: type.prototype.drawImage }));
    try {
        saved.forEach(({ type, drawImage }) => {
            if (!text) {
                type.prototype.fillText = function skipText() {};
                type.prototype.strokeText = function skipText() {};
            }
            if (!photos) {
                type.prototype.drawImage = function maybeDraw(source, ...rest) {
                    if (isPhoto(source)) return undefined;
                    return drawImage.call(this, source, ...rest);
                };
            }
        });
        await page.render({ canvasContext: context, viewport, background: 'rgba(255,255,255,1)' }).promise;
    } finally {
        saved.forEach(({ type, fillText, strokeText, drawImage }) => {
            type.prototype.fillText = fillText;
            type.prototype.strokeText = strokeText;
            type.prototype.drawImage = drawImage;
        });
    }
    return { canvas, data: context.getImageData(0, 0, canvas.width, canvas.height).data };
}

const toBlob = (canvas, type, quality) => new Promise((resolve, reject) =>
    canvas.toBlob((blob) => (blob ? resolve(blob) : reject(new Error('A page picture could not be made.'))), type, quality));

/** PNG for flat graphics; JPEG when PNG would be heavy (photos). */
async function compact(canvas, { alpha = false } = {}) {
    const png = await toBlob(canvas, 'image/png');
    if (alpha || png.size < 350 * 1024) return png;
    const jpeg = await toBlob(canvas, 'image/jpeg', 0.9);
    return jpeg.size < png.size ? jpeg : png;
}

function scaled(canvas, width) {
    const out = document.createElement('canvas');
    out.width = width;
    out.height = Math.round((canvas.height / canvas.width) * width);
    const context = out.getContext('2d');
    context.imageSmoothingQuality = 'high';
    context.drawImage(canvas, 0, 0, out.width, out.height);
    return out;
}

/* ---------- Photos: where each one is drawn ---------- */

const multiply = (m, n) => [
    m[0] * n[0] + m[2] * n[1], m[1] * n[0] + m[3] * n[1],
    m[0] * n[2] + m[2] * n[3], m[1] * n[2] + m[3] * n[3],
    m[0] * n[4] + m[2] * n[5] + m[4], m[1] * n[4] + m[3] * n[5] + m[5],
];

/** Rectangles (in canvas pixels) of every photo drawn on the page, in drawing order. */
async function photoRects(page, viewport, OPS) {
    const list = await page.getOperatorList();
    const paints = new Set([OPS.paintImageXObject, OPS.paintInlineImageXObject, OPS.paintImageXObjectRepeat].filter((op) => op !== undefined));
    let ctm = viewport.transform.slice();
    const stack = [];
    const rects = [];
    list.fnArray.forEach((fn, index) => {
        const args = list.argsArray[index];
        if (fn === OPS.save) stack.push(ctm);
        else if (fn === OPS.restore) ctm = stack.pop() ?? ctm;
        else if (fn === OPS.transform) ctm = multiply(ctm, args);
        else if (fn === OPS.paintFormXObjectBegin) {
            stack.push(ctm);
            if (Array.isArray(args?.[0]) || ArrayBuffer.isView(args?.[0])) ctm = multiply(ctm, Array.from(args[0]));
        } else if (fn === OPS.paintFormXObjectEnd) ctm = stack.pop() ?? ctm;
        else if (paints.has(fn)) {
            const corners = [[0, 0], [1, 0], [0, 1], [1, 1]].map(([x, y]) => [ctm[0] * x + ctm[2] * y + ctm[4], ctm[1] * x + ctm[3] * y + ctm[5]]);
            const xs = corners.map((c) => c[0]);
            const ys = corners.map((c) => c[1]);
            rects.push({ x0: Math.min(...xs), y0: Math.min(...ys), x1: Math.max(...xs), y1: Math.max(...ys) });
        }
    });
    return rects;
}

const differs = (a, b, i, limit) => Math.abs(a[i] - b[i]) + Math.abs(a[i + 1] - b[i + 1]) + Math.abs(a[i + 2] - b[i + 2]) > limit;

/**
 * Cuts one photo out of B where it differs from C. Rows are filled between
 * their first and last differing pixel, so frames like rounded corners or
 * circles become an exact mask.
 */
async function cutPhoto(rect, B, C, width, height) {
    const x0 = Math.max(0, Math.floor(rect.x0));
    const y0 = Math.max(0, Math.floor(rect.y0));
    const x1 = Math.min(width, Math.ceil(rect.x1));
    const y1 = Math.min(height, Math.ceil(rect.y1));
    if (x1 - x0 < 4 || y1 - y0 < 4) return null;

    const rows = [];
    let top = -1; let bottom = -1; let left = width; let right = -1;
    for (let y = y0; y < y1; y += 1) {
        let first = -1; let last = -1;
        for (let x = x0; x < x1; x += 1) {
            if (differs(B.data, C.data, (y * width + x) * 4, 18)) {
                if (first < 0) first = x;
                last = x;
            }
        }
        rows.push([first, last]);
        if (first >= 0) {
            if (top < 0) top = y;
            bottom = y;
            left = Math.min(left, first);
            right = Math.max(right, last);
        }
    }
    if (top < 0 || right - left < 3 || bottom - top < 3) return null;

    const w = right - left + 1;
    const h = bottom - top + 1;
    const crop = document.createElement('canvas');
    crop.width = w;
    crop.height = h;
    crop.getContext('2d').drawImage(B.canvas, left, top, w, h, 0, 0, w, h);

    // Mask: which pixels of the box belong to the photo (frames, rounded corners).
    const maskCanvas = document.createElement('canvas');
    maskCanvas.width = w;
    maskCanvas.height = h;
    const maskContext = maskCanvas.getContext('2d');
    const mask = maskContext.createImageData(w, h);
    let filled = 0;
    for (let y = top; y <= bottom; y += 1) {
        const [first, last] = rows[y - y0];
        if (first < 0) continue;
        for (let x = first; x <= last; x += 1) {
            const i = ((y - top) * w + (x - left)) * 4;
            mask.data[i] = 255; mask.data[i + 1] = 255; mask.data[i + 2] = 255; mask.data[i + 3] = 255;
            filled += 1;
        }
    }
    const shaped = filled < w * h * 0.985;
    let maskBlob = null;
    if (shaped) {
        maskContext.putImageData(mask, 0, 0);
        maskBlob = await toBlob(maskCanvas, 'image/png');
    }
    return {
        box: { x: left / SCALE, y: top / SCALE, w: w / SCALE, h: h / SCALE },
        blob: await compact(crop),
        mask: maskBlob,
    };
}

/* ---------- Text ---------- */

const WEIGHTS = [[/thin|hairline/i, 100], [/extralight|ultralight/i, 200], [/light/i, 300], [/medium/i, 500],
    [/semibold|demibold|demi/i, 600], [/extrabold|ultrabold/i, 800], [/black|heavy/i, 900], [/bold/i, 700]];

function fontFacts(rawName, style) {
    const name = String(rawName || '').replace(/^[A-Z]{6}\+/, '');
    const weight = WEIGHTS.find(([pattern]) => pattern.test(name))?.[1] ?? 400;
    const italic = /italic|oblique/i.test(name);
    const lower = name.toLowerCase().replace(/[^a-z]/g, '');
    let key = Object.entries(FONT_KEYS_BY_NAME).find(([part]) => lower.includes(part))?.[1];
    if (!key) key = style?.fontFamily === 'serif' ? 'serif' : style?.fontFamily === 'monospace' ? 'mono' : 'sans';
    return { name, key, weight, italic };
}

const hex = (r, g, b) => `#${[r, g, b].map((v) => Math.round(v).toString(16).padStart(2, '0')).join('')}`;

/** The colour of a piece of text: the pixels A has and B doesn't. */
function inkColour(box, A, B, width, height) {
    const x0 = Math.max(0, Math.floor(box.x * SCALE));
    const y0 = Math.max(0, Math.floor(box.y * SCALE));
    const x1 = Math.min(width, Math.ceil((box.x + box.w) * SCALE));
    const y1 = Math.min(height, Math.ceil((box.y + box.h) * SCALE));
    let best = 0;
    const samples = [];
    for (let y = y0; y < y1; y += 1) {
        for (let x = x0; x < x1; x += 1) {
            const i = (y * width + x) * 4;
            const d = Math.abs(A.data[i] - B.data[i]) + Math.abs(A.data[i + 1] - B.data[i + 1]) + Math.abs(A.data[i + 2] - B.data[i + 2]);
            if (d > 60) {
                samples.push([d, A.data[i], A.data[i + 1], A.data[i + 2]]);
                if (d > best) best = d;
            }
        }
    }
    if (!samples.length) return null;
    // The strongest pixels are the solid middle of each letter, not its soft edge.
    const core = samples.filter(([d]) => d >= best * 0.8);
    const sum = core.reduce((acc, [, r, g, b]) => [acc[0] + r, acc[1] + g, acc[2] + b], [0, 0, 0]);
    return hex(sum[0] / core.length, sum[1] / core.length, sum[2] / core.length);
}

/** Pieces of text on one baseline in the same style become one line. */
function buildLines(runs) {
    const sorted = runs.slice().sort((a, b) => a.baseline - b.baseline || a.x - b.x);
    const lines = [];
    sorted.forEach((run) => {
        const line = lines.find((l) => l.styleKey === run.styleKey
            && Math.abs(l.baseline - run.baseline) < run.size * 0.25
            && run.x >= l.right - run.size * 0.4
            && run.x - l.right < run.size * 1.2);
        if (line) {
            const gap = run.x - line.right;
            const joiner = gap > run.size * 0.15 && !line.text.endsWith(' ') && !run.text.startsWith(' ') ? ' ' : '';
            line.text += joiner + run.text;
            line.right = Math.max(line.right, run.x + run.width);
            line.links.push(...run.links);
        } else {
            lines.push({ ...run, right: run.x + run.width, links: [...run.links] });
        }
    });
    lines.forEach((line) => {
        line.text = line.text.replace(/\s+$/, '');
        line.left = line.x;
        line.width = line.right - line.left;
        line.center = line.left + line.width / 2;
    });
    return lines.filter((line) => line.text.trim() !== '');
}

/** Lines in the same style, evenly spaced and aligned, become one paragraph. */
function buildParagraphs(lines) {
    const sorted = lines.slice().sort((a, b) => a.baseline - b.baseline || a.left - b.left);
    const paragraphs = [];
    const placed = [];
    // Another line sitting between two lines (and overlapping them sideways) keeps them apart.
    const blocked = (upper, lower) => placed.some((other) => other !== upper
        && other.baseline > upper.baseline + 0.5 && other.baseline < lower.baseline - 0.5
        && Math.min(other.right, Math.max(upper.right, lower.right)) > Math.max(other.left, Math.min(upper.left, lower.left)));
    sorted.forEach((line) => {
        const tolerance = Math.max(2.5, line.size * 0.12);
        const fits = paragraphs.find((p) => {
            const last = p.lines.at(-1);
            if (p.styleKey !== line.styleKey) return false;
            if (blocked(last, line)) return false;
            const gap = line.baseline - last.baseline;
            if (gap < line.size * 0.95 || gap > line.size * 2.1) return false;
            if (p.lines.length > 1 && Math.abs(gap - p.spacing) > p.spacing * 0.12) return false;
            const sameLeft = Math.abs(line.left - last.left) < tolerance;
            const sameCenter = Math.abs(line.center - last.center) < tolerance + 0.5;
            const sameRight = Math.abs(line.right - last.right) < tolerance;
            if (p.lines.length > 1) {
                if (p.align === 'left' && !sameLeft) return false;
                if (p.align === 'center' && !sameCenter) return false;
                if (p.align === 'right' && !sameRight) return false;
            }
            return sameLeft || sameCenter || sameRight;
        });
        if (fits) {
            const last = fits.lines.at(-1);
            if (fits.lines.length === 1) {
                fits.spacing = line.baseline - last.baseline;
                fits.align = Math.abs(line.left - last.left) < tolerance ? 'left' : Math.abs(line.center - last.center) < tolerance + 0.5 ? 'center' : 'right';
            }
            fits.lines.push(line);
        } else {
            paragraphs.push({ styleKey: line.styleKey, lines: [line], spacing: 0, align: null });
        }
        placed.push(line);
    });
    return paragraphs;
}

/* ---------- Links ---------- */

async function pageLinks(page, viewport) {
    const annotations = await page.getAnnotations();
    return annotations
        .filter((a) => a.subtype === 'Link' && typeof a.url === 'string' && /^https?:\/\//i.test(a.url))
        .map((a) => {
            const m = viewport.transform;
            const point = (x, y) => [m[0] * x + m[2] * y + m[4], m[1] * x + m[3] * y + m[5]];
            const [x0, y0] = point(a.rect[0], a.rect[1]);
            const [x1, y1] = point(a.rect[2], a.rect[3]);
            return { url: a.url, x: Math.min(x0, x1), y: Math.min(y0, y1), w: Math.abs(x1 - x0), h: Math.abs(y1 - y0) };
        });
}

const overlap = (a, b) => Math.max(0, Math.min(a.x + a.w, b.x + b.w) - Math.max(a.x, b.x)) * Math.max(0, Math.min(a.y + a.h, b.y + b.h) - Math.max(a.y, b.y));

/* ---------- One page ---------- */

async function readPage(doc, number, lib, counters) {
    const page = await doc.getPage(number);
    const base = page.getViewport({ scale: 1 });
    const k = PAGE_WIDTH / base.width;
    const view1 = page.getViewport({ scale: k });
    const view2 = page.getViewport({ scale: k * SCALE });
    const pageHeight = Math.round(view1.height);

    const A = await renderPage(page, view2);
    const B = await renderPage(page, view2, { text: false });
    const C = await renderPage(page, view2, { text: false, photos: false });
    const width = A.canvas.width;
    const height = A.canvas.height;

    // Photos, in drawing order.
    const images = [];
    for (const rect of await photoRects(page, view2, lib.OPS)) {
        const cut = await cutPhoto(rect, B, C, width, height);
        if (!cut) continue;
        counters.image += 1;
        images.push({ id: `i${counters.image}`, ...cut.box, blob: cut.blob, mask: cut.mask });
    }

    // Text pieces with exact position, size, font and colour.
    const content = await page.getTextContent();
    const links = await pageLinks(page, view1);
    const runs = [];
    let baked = 0;
    for (const item of content.items) {
        if (typeof item.str !== 'string' || item.str.trim() === '') continue;
        const t = lib.Util.transform(view1.transform, item.transform);
        if (Math.abs(t[1]) > 0.01 || Math.abs(t[2]) > 0.01) continue;   // rotated text stays as it is drawn
        const size = Math.hypot(t[2], t[3]);
        if (size < 3) continue;
        let fontObject = null;
        try { fontObject = page.commonObjs.get(item.fontName); } catch { /* not loaded */ }
        const font = fontFacts(fontObject?.name ?? item.fontName, content.styles[item.fontName]);
        const ascent = (content.styles[item.fontName]?.ascent ?? 0.9) * size;
        const box = { x: t[4], y: t[5] - ascent, w: item.width * k, h: size * 1.15 };
        const color = inkColour(box, A, B, width, height);
        if (!color) { baked += 1; continue; }   // drawn as shapes: it stays in the background
        const runLinks = links.filter((link) => overlap(link, box) > box.w * box.h * 0.3).map((link) => link.url);
        runs.push({
            text: item.str, x: t[4], baseline: t[5], width: item.width * k, size,
            font, color, links: runLinks,
            // Colour is rounded for grouping: anti-aliasing makes the same ink differ by a few units.
            styleKey: `${font.key}|${font.weight}|${font.italic}|${size.toFixed(1)}|${color.slice(1).match(/../g).map((v) => Math.round(parseInt(v, 16) / 24)).join('.')}`,
        });
    }

    const texts = [];
    for (const paragraph of buildParagraphs(buildLines(runs))) {
        const first = paragraph.lines[0];
        const metrics = await measureFont(first.font.key, first.font.weight, first.font.italic, first.size);
        const lineHeight = paragraph.lines.length > 1 ? paragraph.spacing : Math.round(first.size * 1.2 * 100) / 100;
        const left = Math.min(...paragraph.lines.map((l) => l.left));
        const right = Math.max(...paragraph.lines.map((l) => l.right));
        // Letter spacing that makes our font as wide as the PDF's.
        // Measured on the longest line: short last lines of a paragraph are less reliable.
        const longest = paragraph.lines.reduce((best, l) => (l.text.length > best.text.length ? l : best), paragraph.lines[0]);
        let letterSpacing = longest.text.length >= 4 ? (longest.width - metrics.width(longest.text)) / longest.text.length : 0;
        letterSpacing = Math.max(-first.size * 0.15, Math.min(first.size * 0.3, letterSpacing));
        if (Math.abs(letterSpacing) < 0.05) letterSpacing = 0;

        const align = paragraph.align ?? (Math.abs(first.center - PAGE_WIDTH / 2) < 4 && first.width < PAGE_WIDTH * 0.8 ? 'center' : 'left');
        const top = first.baseline - metrics.ascent - (lineHeight - metrics.ascent - metrics.descent) / 2;
        const linkUrls = [...new Set(paragraph.lines.flatMap((l) => l.links))];
        counters.text += 1;
        texts.push({
            id: `t${counters.text}`,
            x: round(left), y: round(top), w: round(right - left), h: round(lineHeight * paragraph.lines.length),
            lines: paragraph.lines.map((l) => l.text),
            font: first.font.key, fontName: first.font.name, weight: first.font.weight, italic: first.font.italic,
            size: round(first.size), color: first.color, lineHeight: round(lineHeight),
            letterSpacing: round(letterSpacing), align,
            link: linkUrls.length === 1 ? linkUrls[0] : null,
        });
    }

    // Links that don't sit on a text become clickable areas of their own.
    const areas = links
        .filter((link) => !texts.some((text) => text.link === link.url && overlap(link, text) > 0))
        .map((link) => {
            counters.link += 1;
            return { id: `l${counters.link}`, x: round(link.x), y: round(link.y), w: round(link.w), h: round(link.h), url: link.url };
        });

    const background = await compact(C.canvas);
    const picture = await toBlob(scaled(A.canvas, 1240), 'image/jpeg', 0.86);
    const thumb = await toBlob(scaled(A.canvas, 360), 'image/jpeg', 0.8);
    [A, B, C].forEach((layer) => { layer.canvas.width = 0; layer.canvas.height = 0; });
    page.cleanup();

    return {
        number, width: PAGE_WIDTH, height: pageHeight,
        background, picture, thumb, images, texts, links: areas, baked,
        name: '',
    };
}

const round = (value) => Math.round(value * 100) / 100;

/**
 * Reads a PDF into an exact, editable layout.
 * onStep(step, detail) reports progress: 'read' page n of total.
 */
export async function readLayout(file, onStep = () => {}) {
    if (!file || !/pdf$/i.test(file.type || file.name)) {
        throw new Error('An exact copy needs the report as a PDF file.');
    }
    const lib = await loadPdfJs();
    const fontsReady = document.fonts?.ready;
    if (fontsReady) await fontsReady;

    const task = lib.getDocument({ data: new Uint8Array(await file.arrayBuffer()), isEvalSupported: false });
    try {
        let doc;
        try {
            doc = await task.promise;
        } catch (error) {
            if (error?.name === 'PasswordException') throw new Error('This PDF is password-protected. Save a copy without a password and try again.');
            throw new Error('This file could not be read as a PDF.');
        }
        if (doc.numPages < 1) throw new Error('This PDF has no pages.');
        const total = Math.min(doc.numPages, MAX_LAYOUT_PAGES);
        const counters = { text: 0, image: 0, link: 0 };
        const pages = [];
        for (let number = 1; number <= total; number += 1) {
            onStep('read', `page ${number} of ${total}`);
            pages.push(await readPage(doc, number, lib, counters));
        }

        const notes = [];
        const textCount = pages.reduce((sum, p) => sum + p.texts.length, 0);
        if (doc.numPages > MAX_LAYOUT_PAGES) notes.push(`Only the first ${MAX_LAYOUT_PAGES} of ${doc.numPages} pages were copied.`);
        if (textCount === 0) notes.push('No text was found in this PDF (it may be a scan), so the pages are kept as pictures. Text can’t be edited.');
        if (pages.some((p) => p.baked > 0)) notes.push('Some text is drawn as shapes in the PDF; it stays part of the page and can’t be edited.');
        return { pages, totalPages: doc.numPages, source: file, notes };
    } finally {
        await task.destroy();
    }
}

/** The JSON part of a read layout (what the server stores), without picture files. */
export function layoutJson(read) {
    return {
        version: 1,
        pages: read.pages.map((page) => ({
            width: page.width,
            height: page.height,
            name: page.name,
            texts: page.texts,
            images: page.images.map(({ blob, mask, ...image }) => ({
                ...image, ext: blob.type === 'image/png' ? 'png' : 'jpg', mask: Boolean(mask), role: image.role ?? 'keep',
            })),
            links: page.links,
            bg: page.background.type === 'image/png' ? 'png' : 'jpg',
        })),
    };
}
