/**
 * PDF export, done in the browser:
 * 1. render every page at full size off-screen
 * 2. wait for fonts and images
 * 3. html2canvas turns each page into a sharp image (scale 2 ≈ 190 dpi)
 * 4. jsPDF places it on an A4 page and re-adds every link as a clickable area
 *
 * Libraries load from public/assets/vendor/ first (works offline), then
 * from the cdnjs CDN as a fallback.
 */
import { buildPages, PAGE_WIDTH, PAGE_HEIGHT } from './preview.js';
import { fitTexts, bakeMasks } from './layout-render.js';
import { monthName } from './format.js';

const LIBRARIES = [
    { test: () => window.html2canvas, local: 'assets/vendor/html2canvas.min.js', cdn: 'https://cdnjs.cloudflare.com/ajax/libs/html2canvas/1.4.1/html2canvas.min.js' },
    { test: () => window.jspdf?.jsPDF, local: 'assets/vendor/jspdf.umd.min.js', cdn: 'https://cdnjs.cloudflare.com/ajax/libs/jspdf/2.5.1/jspdf.umd.min.js' },
];

const A4_WIDTH_PT = 595.28;
const A4_HEIGHT_PT = 841.89;

function loadScript(src) {
    return new Promise((resolve, reject) => {
        const script = document.createElement('script');
        script.src = src;
        script.onload = resolve;
        script.onerror = () => { script.remove(); reject(new Error(src)); };
        document.head.append(script);
    });
}

async function loadLibraries() {
    for (const library of LIBRARIES) {
        if (library.test()) continue;
        try {
            await loadScript(library.local);
        } catch {
            try {
                await loadScript(library.cdn);
            } catch {
                throw new Error('The PDF tools could not load. Check your internet connection, or add the files to assets/vendor (see README).');
            }
        }
        if (!library.test()) throw new Error('The PDF tools did not start correctly. Refresh and try again.');
    }
}

async function waitForImages(container) {
    await Promise.all(Array.from(container.querySelectorAll('img'), async (image) => {
        if (!image.complete) {
            await new Promise((resolve) => { image.onload = resolve; image.onerror = resolve; });
        }
        try { await image.decode(); } catch { /* broken image: html2canvas skips it */ }
    }));
}

function safeFileName(text) {
    return text.replace(/[\\/:*?"<>|]+/g, '').replace(/\s+/g, ' ').trim() || 'Completion Report';
}

export function exportFileName(state) {
    const { meta } = state;
    return `${safeFileName(`${meta.clientName} - Completion Report - ${monthName(meta.month)} ${meta.year}`)}.pdf`;
}

/**
 * Creates and downloads the PDF. onProgress(done, total) reports progress.
 * Returns the number of pages.
 */
export async function exportPdf(state, onProgress = () => {}) {
    await loadLibraries();
    if (document.fonts?.ready) await document.fonts.ready;

    const stage = document.createElement('div');
    stage.className = 'export-stage';
    stage.innerHTML = buildPages(state).join('');
    // Placeholders guide editing in the preview but never print (TOLE pages stay clean).
    stage.querySelectorAll('.rp-empty, .rp-placeholder').forEach((element) => element.remove());
    document.body.append(stage);

    try {
        await waitForImages(stage);
        // Exact-copy pages: shrink texts that grew, and turn shaped photos into plain pictures.
        fitTexts(stage);
        await bakeMasks(stage);
        const pages = Array.from(stage.querySelectorAll('.report-page'));
        const { jsPDF } = window.jspdf;
        const pdf = new jsPDF({ unit: 'pt', format: 'a4', orientation: 'portrait', compress: true });
        const ratio = A4_WIDTH_PT / PAGE_WIDTH;

        for (let index = 0; index < pages.length; index += 1) {
            onProgress(index, pages.length);
            const pageElement = pages[index];

            // Read link positions before rendering, relative to the page.
            const pageBox = pageElement.getBoundingClientRect();
            const links = Array.from(pageElement.querySelectorAll('a[href]'), (anchor) => {
                const box = anchor.getBoundingClientRect();
                return { url: anchor.href, x: box.left - pageBox.left, y: box.top - pageBox.top, w: box.width, h: box.height };
            }).filter((link) => /^https?:/i.test(link.url) && link.w > 0 && link.h > 0);

            // Copied pages keep their own height (most are A4: 1123 px).
            const height = pageElement.offsetHeight || PAGE_HEIGHT;
            const canvas = await window.html2canvas(pageElement, {
                scale: 2,
                useCORS: true,
                backgroundColor: '#ffffff',
                logging: false,
                width: PAGE_WIDTH,
                height,
                windowWidth: PAGE_WIDTH,
            });

            const isA4 = Math.abs(height - PAGE_HEIGHT) <= 2;
            const pageHeightPt = isA4 ? A4_HEIGHT_PT : height * ratio;
            const format = isA4 ? 'a4' : [A4_WIDTH_PT, pageHeightPt];
            if (index === 0 && !isA4) {
                pdf.deletePage(1);
                pdf.addPage(format, 'portrait');
            } else if (index > 0) {
                pdf.addPage(format, 'portrait');
            }
            pdf.addImage(canvas.toDataURL('image/jpeg', 0.92), 'JPEG', 0, 0, A4_WIDTH_PT, pageHeightPt, undefined, 'FAST');
            links.forEach((link) => pdf.link(link.x * ratio, link.y * ratio, link.w * ratio, link.h * ratio, { url: link.url }));
            canvas.width = 0; // free memory before the next page
            canvas.height = 0;
        }

        onProgress(pages.length, pages.length);
        pdf.save(exportFileName(state));
        return pages.length;
    } finally {
        stage.remove();
    }
}
