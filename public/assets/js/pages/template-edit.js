/**
 * Design editor: review and adjust a template learned from an uploaded
 * report, with a real report rendered live in the design and the uploaded
 * example beside it.
 */
import { $, $$, esc, debounce } from '../lib/dom.js';
import { apiGet, apiPost, apiUpload } from '../lib/api.js';
import { toast, confirmDialog, setBusy } from '../lib/ui.js';
import { buildPages, PAGE_WIDTH, PAGE_HEIGHT } from '../builder/preview.js';
import {
    completeTheme, FONT_LABELS, LAYOUT_OPTIONS, FOOTER_CONTENT, COLOR_LABELS, LABEL_FIELDS,
} from '../builder/theme.js';
import { sampleReport } from '../templates/sample-report.js';

const config = JSON.parse($('#designConfig').textContent);
const template = config.template;
let theme = completeTheme(template.theme);
let logoUrl = template.logoUrl;
let preview = sampleReport();
let dirty = false;
let lastColorField = null;

const controls = $('#designControls');
const previewBox = $('#designPreview');

/* ---------- Controls ---------- */

const COLOR_GROUPS = [
    ['Brand', ['primary', 'accent']],
    ['Text', ['text', 'title', 'link']],
    ['Cover', ['coverBg', 'coverText', 'coverAccent']],
    ['Header and footer', ['headerBg', 'headerText', 'footerBg', 'footerText']],
    ['Tables and page', ['tableHeadBg', 'tableHeadText', 'tableBorder', 'pageBg']],
];

const get = (path) => path.split('.').reduce((value, key) => value?.[key], theme);
function set(path, value) {
    const keys = path.split('.');
    const last = keys.pop();
    keys.reduce((value, key) => value[key], theme)[last] = value;
}

const options = (map, current) => Object.entries(map)
    .map(([value, text]) => `<option value="${esc(value)}"${value === current ? ' selected' : ''}>${esc(text)}</option>`).join('');

function colorRow(key) {
    const value = theme.colors[key];
    return `<label class="color-row">
        <span>${esc(COLOR_LABELS[key])}</span>
        <span class="color-inputs">
            <input type="color" value="${esc(value)}" data-theme="colors.${key}" data-color aria-label="${esc(COLOR_LABELS[key])}">
            <input type="text" value="${esc(value)}" data-theme="colors.${key}" data-color-hex maxlength="7" spellcheck="false" aria-label="${esc(COLOR_LABELS[key])} hex code">
        </span>
    </label>`;
}

function layoutSelect(key, labelText) {
    return `<label>${esc(labelText)}<select data-theme="layout.${key}">${options(LAYOUT_OPTIONS[key], theme.layout[key])}</select></label>`;
}

function renderControls() {
    const wasOpen = [...controls.querySelectorAll('details.design-group')].map((group) => [group.querySelector('summary')?.textContent, group.open]);
    paintControls();
    for (const [title, open] of wasOpen) {
        const group = [...controls.querySelectorAll('details.design-group')].find((item) => item.querySelector('summary')?.textContent === title);
        if (group) group.open = open;
    }
}

function paintControls() {
    const notes = [...(config.uploadNote ? [config.uploadNote] : []), ...template.notes];
    const palette = config.palette.length
        ? `<div class="swatches" role="list">${config.palette.map((swatch) =>
            `<button type="button" class="swatch" role="listitem" data-swatch="${esc(swatch.hex)}" style="background:${esc(swatch.hex)}" title="${esc(swatch.hex)} · ${Math.round(swatch.share * 100)}% of the pages" aria-label="Use ${esc(swatch.hex)}"></button>`).join('')}</div>
           <p class="hint">Colours measured from the upload. Click a colour box below, then a swatch to use it.</p>`
        : '';

    controls.innerHTML = `
        ${config.isNew ? `<div class="alert alert-info">${{
            ai: 'The AI has described this design.',
            pdf: 'The design was read from your PDF: colours, fonts, headings and title style.',
        }[template.analyzedBy] ?? 'Colours were measured from your pictures.'} Compare the two columns, adjust anything that’s off, then press <strong>Save — ready to use</strong>.</div>` : ''}
        ${config.morePages ? '<div class="alert alert-info">Only the first 8 pages were read — that is enough to learn a design.</div>' : ''}
        ${notes.length ? `<details class="design-group" open><summary>Notes on this design</summary><ul class="design-notes">${notes.map((note) => `<li>${esc(note)}</li>`).join('')}</ul></details>` : ''}

        <details class="design-group" open><summary>Colours</summary>
            ${palette}
            ${COLOR_GROUPS.map(([title, keys]) => `<p class="design-subhead">${esc(title)}</p>${keys.map(colorRow).join('')}`).join('')}
        </details>

        <details class="design-group" open><summary>Page layouts</summary>
            <div class="stack">
                ${layoutSelect('cover', 'Cover')}
                ${layoutSelect('header', 'Page header')}
                ${layoutSelect('footer', 'Page footer')}
                <label>Footer shows<select data-theme="footerContent">${options(FOOTER_CONTENT, theme.footerContent)}</select></label>
                ${layoutSelect('table', 'Tables')}
                ${layoutSelect('contact', 'Contact page')}
                ${layoutSelect('decoration', 'Decorative shapes')}
            </div>
        </details>

        <details class="design-group"><summary>Fonts and titles</summary>
            <div class="stack">
                <label>Big headings (cover, contact)<select data-theme="fonts.display">${options(FONT_LABELS, theme.fonts.display)}</select></label>
                <label>Page titles and table headers<select data-theme="fonts.heading">${options(FONT_LABELS, theme.fonts.heading)}</select></label>
                <label>Body text<select data-theme="fonts.body">${options(FONT_LABELS, theme.fonts.body)}</select></label>
                <label>Title position<select data-theme="title.align">${options({ center: 'Centred', left: 'Left' }, theme.title.align)}</select></label>
                <label>Title size <span class="hint" data-size-value>${theme.title.size}px</span>
                    <input type="range" min="18" max="40" step="1" value="${theme.title.size}" data-theme="title.size" data-number></label>
                <label class="checkbox"><input type="checkbox" data-theme="title.uppercase"${theme.title.uppercase ? ' checked' : ''}> Always show titles in capitals</label>
            </div>
        </details>

        <details class="design-group"${theme.brand.logo === 'jt' && !logoUrl ? '' : ' open'}><summary>Logo</summary>
            <div class="stack">
                <div class="radio-row" role="radiogroup" aria-label="Logo">
                    ${[['jt', 'JT Digital mark'], ['custom', 'Own logo'], ['none', 'No logo']].map(([value, text]) =>
                        `<label class="checkbox"><input type="radio" name="logoChoice" value="${value}" data-theme="brand.logo"${theme.brand.logo === value ? ' checked' : ''}${value === 'custom' && !logoUrl ? ' disabled' : ''}> ${text}</label>`).join('')}
                </div>
                <div class="logo-row">
                    ${logoUrl ? `<img class="logo-preview" src="${esc(logoUrl)}" alt="Uploaded logo">` : '<span class="muted small">No own logo uploaded</span>'}
                    ${template.pages?.length ? '<button type="button" class="btn btn-secondary btn-sm" data-logo-cut>Cut from an uploaded page</button>' : ''}
                    <label class="btn btn-ghost btn-sm file-button">${logoUrl ? 'Replace with a file' : 'Upload a file'}
                        <input type="file" accept="image/png,image/jpeg,image/webp" data-logo-input></label>
                    ${logoUrl ? '<button type="button" class="btn btn-ghost btn-sm" data-logo-remove>Remove</button>' : ''}
                </div>
                <p class="hint">Easiest: cut the logo out of the uploaded example. A PNG with a transparent background also works.</p>
                <label>Words beside the logo <span class="hint">Enter = new line; leave empty for none</span>
                    <textarea rows="3" maxlength="80" data-theme="brand.text">${esc(theme.brand.text)}</textarea></label>
            </div>
        </details>

        <details class="design-group"><summary>Headings and wording</summary>
            <p class="hint">{MONTH} becomes AUGUST, {Month} becomes August.</p>
            <div class="stack">
                ${Object.entries(LABEL_FIELDS).map(([key, text]) =>
                    `<label>${esc(text)}<input type="text" maxlength="200" value="${esc(theme.labels[key])}" data-theme="labels.${key}"></label>`).join('')}
            </div>
        </details>`;
}

function markDirty() {
    dirty = true;
    $('#designState').textContent = 'Unsaved changes';
    $('#designState').className = 'save-state is-dirty';
}

/* ---------- Preview ---------- */

function renderPreview() {
    const pages = buildPages({ ...preview, theme, logoUrl });
    const zoom = Math.min(0.62, (previewBox.clientWidth - 32) / PAGE_WIDTH);
    previewBox.innerHTML = `<div class="preview-pages">${pages.map((html, index) =>
        `<div class="preview-frame" data-page-number="${index + 1}" style="width:${PAGE_WIDTH * zoom}px;height:${PAGE_HEIGHT * zoom}px">${html}</div>`).join('')}</div>`;
    $$('.preview-frame > .report-page', previewBox).forEach((pageElement) => { pageElement.style.transform = `scale(${zoom})`; });
    $('#previewCount').textContent = `${pages.length} pages`;
}
const renderPreviewSoon = debounce(renderPreview, 150);

function renderSource() {
    const box = $('#designSource');
    box.innerHTML = template.pages?.length
        ? `<div class="source-pages">${template.pages.map((url, index) =>
            `<figure><img src="${esc(url)}" alt="Uploaded page ${index + 1}" loading="lazy"><figcaption>Page ${index + 1}</figcaption></figure>`).join('')}</div>`
        : '<p class="muted small">No pictures of the uploaded example.</p>';
}

async function loadPreview(uid) {
    if (!uid) {
        preview = sampleReport();
        renderPreview();
        return;
    }
    try {
        const result = await apiGet(`api/report-get.php?uid=${encodeURIComponent(uid)}`);
        preview = { data: result.data, images: result.images, meta: result.report };
    } catch (error) {
        toast(error.message, { error: true });
        preview = sampleReport();
    }
    renderPreview();
}

/* ---------- Wiring ---------- */

controls.addEventListener('focusin', (event) => {
    if (event.target.matches('[data-color], [data-color-hex]')) lastColorField = event.target.dataset.theme;
});

controls.addEventListener('input', (event) => {
    const field = event.target.closest('[data-theme]');
    if (!field) return;
    const path = field.dataset.theme;
    let value = field.value;
    if (field.type === 'checkbox') value = field.checked;
    if (field.hasAttribute('data-number')) value = Number(value);
    if (field.hasAttribute('data-color-hex')) {
        if (!/^#[0-9a-f]{6}$/i.test(value)) return; // wait until the code is complete
        value = value.toLowerCase();
    }
    set(path, value);
    // Keep the twin colour field in step.
    if (field.hasAttribute('data-color') || field.hasAttribute('data-color-hex')) {
        $$(`[data-theme="${path}"]`, controls).forEach((other) => { if (other !== field) other.value = value; });
    }
    if (path === 'title.size') $('[data-size-value]', controls).textContent = `${value}px`;
    markDirty();
    renderPreviewSoon();
});

controls.addEventListener('change', (event) => {
    if (event.target.matches('[name="logoChoice"]')) {
        set('brand.logo', event.target.value);
        markDirty();
        renderPreview();
    }
});

controls.addEventListener('click', async (event) => {
    const swatch = event.target.closest('[data-swatch]');
    if (swatch) {
        if (!lastColorField) {
            toast('First click the colour you want to change, then a swatch.');
            return;
        }
        set(lastColorField, swatch.dataset.swatch);
        $$(`[data-theme="${lastColorField}"]`, controls).forEach((field) => { field.value = swatch.dataset.swatch; });
        markDirty();
        renderPreview();
        return;
    }
    if (event.target.closest('[data-logo-cut]')) {
        openLogoCutter();
        return;
    }
    if (event.target.closest('[data-logo-remove]')) {
        try {
            const result = await apiPost('api/templates.php', { action: 'remove_logo', id: template.id });
            logoUrl = result.logoUrl;
            theme.brand.logo = 'jt';
            renderControls();
            renderPreview();
            toast('Logo removed');
        } catch (error) {
            toast(error.message, { error: true });
        }
    }
});

async function uploadLogo(blob, fileName) {
    const upload = new FormData();
    upload.append('id', String(template.id));
    upload.append('image', blob, fileName);
    const result = await apiUpload('api/template-logo.php', upload);
    logoUrl = result.logoUrl;
    theme.brand.logo = 'custom';
    renderControls();
    renderPreview();
}

controls.addEventListener('change', async (event) => {
    if (!event.target.matches('[data-logo-input]')) return;
    const file = event.target.files?.[0];
    event.target.value = '';
    if (!file) return;
    try {
        await uploadLogo(file, file.name);
        toast('Logo uploaded');
    } catch (error) {
        toast(error.message, { error: true });
    }
});

/* ---------- Logo cutter: drag a box around the logo on an uploaded page ---------- */

/** Turns near-white pixels transparent and trims empty margins. */
function cleanLogo(canvas, transparent) {
    const context = canvas.getContext('2d', { willReadFrequently: true });
    const image = context.getImageData(0, 0, canvas.width, canvas.height);
    const px = image.data;
    let minX = canvas.width; let minY = canvas.height; let maxX = -1; let maxY = -1;
    for (let y = 0; y < canvas.height; y += 1) {
        for (let x = 0; x < canvas.width; x += 1) {
            const i = (y * canvas.width + x) * 4;
            const lightest = Math.min(px[i], px[i + 1], px[i + 2]);
            if (transparent) {
                // Soft edge: fully clear above 240, gradually opaque down to 205 (keeps anti-aliasing).
                px[i + 3] = lightest >= 240 ? 0 : lightest > 205 ? Math.round(((240 - lightest) / 35) * 255) : 255;
            }
            const visible = transparent ? px[i + 3] > 24 : lightest < 235;
            if (visible) {
                minX = Math.min(minX, x); minY = Math.min(minY, y); maxX = Math.max(maxX, x); maxY = Math.max(maxY, y);
            }
        }
    }
    context.putImageData(image, 0, 0);
    if (maxX < 0) return null;
    const pad = 2;
    const out = document.createElement('canvas');
    out.width = Math.min(canvas.width, maxX - minX + 1 + pad * 2);
    out.height = Math.min(canvas.height, maxY - minY + 1 + pad * 2);
    out.getContext('2d').drawImage(canvas, Math.max(0, minX - pad), Math.max(0, minY - pad), out.width, out.height, 0, 0, out.width, out.height);
    return out;
}

function openLogoCutter() {
    const dialog = document.createElement('dialog');
    dialog.className = 'modal modal-wide';
    dialog.setAttribute('aria-labelledby', 'cutterTitle');
    dialog.innerHTML = `
        <div class="stack">
            <h2 id="cutterTitle">Cut the logo out of a page</h2>
            <p class="muted small">Choose a page, then drag a box tightly around the logo (include its words if you want them in the logo).</p>
            <div class="cutter-bar">
                <label class="inline-select">Page
                    <select data-cut-page>${template.pages.map((url, index) => `<option value="${index}"${index === 1 ? ' selected' : ''}>Page ${index + 1}</option>`).join('')}</select>
                </label>
                <label class="checkbox"><input type="checkbox" data-cut-clear checked> Make the white background transparent</label>
            </div>
            <div class="cutter-stage" data-cut-stage><img data-cut-image alt="Uploaded page" draggable="false"><div class="cutter-box" data-cut-box hidden></div></div>
            <div class="cutter-result"><span class="muted small">Result:</span><div class="cutter-preview" data-cut-preview><span class="muted small">Drag a box on the page</span></div></div>
            <div class="modal-actions">
                <button type="button" class="btn btn-ghost" data-cut-cancel>Cancel</button>
                <button type="button" class="btn btn-primary" data-cut-use disabled>Use this logo</button>
            </div>
        </div>`;
    document.body.append(dialog);

    const image = $('[data-cut-image]', dialog);
    const stage = $('[data-cut-stage]', dialog);
    const box = $('[data-cut-box]', dialog);
    const useButton = $('[data-cut-use]', dialog);
    let selection = null;
    let start = null;
    let result = null;

    const load = (index) => {
        image.src = template.pages[index];
        box.hidden = true;
        selection = null;
        result = null;
        useButton.disabled = true;
        $('[data-cut-preview]', dialog).innerHTML = '<span class="muted small">Drag a box on the page</span>';
    };

    const point = (event) => {
        const rect = image.getBoundingClientRect();
        return {
            x: Math.min(Math.max(event.clientX - rect.left, 0), rect.width),
            y: Math.min(Math.max(event.clientY - rect.top, 0), rect.height),
        };
    };

    const makeResult = () => {
        if (!selection || selection.w < 6 || selection.h < 6) return;
        const scale = image.naturalWidth / image.getBoundingClientRect().width;
        const canvas = document.createElement('canvas');
        canvas.width = Math.round(selection.w * scale);
        canvas.height = Math.round(selection.h * scale);
        canvas.getContext('2d').drawImage(image, selection.x * scale, selection.y * scale, canvas.width, canvas.height, 0, 0, canvas.width, canvas.height);
        result = cleanLogo(canvas, $('[data-cut-clear]', dialog).checked);
        const preview = $('[data-cut-preview]', dialog);
        preview.innerHTML = '';
        if (result) {
            preview.append(result);
            useButton.disabled = false;
        } else {
            preview.innerHTML = '<span class="muted small">Nothing visible in that box — try again.</span>';
            useButton.disabled = true;
        }
    };

    stage.addEventListener('pointerdown', (event) => {
        if (!image.complete) return;
        start = point(event);
        stage.setPointerCapture(event.pointerId);
        box.hidden = false;
        Object.assign(box.style, { left: `${start.x}px`, top: `${start.y}px`, width: '0px', height: '0px' });
    });
    stage.addEventListener('pointermove', (event) => {
        if (!start) return;
        const now = point(event);
        selection = { x: Math.min(start.x, now.x), y: Math.min(start.y, now.y), w: Math.abs(now.x - start.x), h: Math.abs(now.y - start.y) };
        Object.assign(box.style, { left: `${selection.x}px`, top: `${selection.y}px`, width: `${selection.w}px`, height: `${selection.h}px` });
    });
    stage.addEventListener('pointerup', () => {
        start = null;
        makeResult();
    });
    $('[data-cut-page]', dialog).addEventListener('change', (event) => load(Number(event.target.value)));
    $('[data-cut-clear]', dialog).addEventListener('change', makeResult);
    $('[data-cut-cancel]', dialog).addEventListener('click', () => dialog.close());
    dialog.addEventListener('close', () => dialog.remove());
    useButton.addEventListener('click', () => {
        if (!result) return;
        setBusy(useButton, true);
        result.toBlob(async (blob) => {
            try {
                await uploadLogo(blob, 'logo.png');
                toast('Logo saved — it now appears in the preview.');
                dialog.close();
            } catch (error) {
                toast(error.message, { error: true });
                setBusy(useButton, false);
            }
        }, 'image/png');
    });

    load(Math.min(1, template.pages.length - 1));
    dialog.showModal();
}

$('#designName').addEventListener('input', markDirty);

async function save(status, button) {
    const name = $('#designName').value.trim();
    if (!name) {
        toast('Give the design a name.', { error: true });
        $('#designName').focus();
        return;
    }
    setBusy(button, true);
    try {
        const result = await apiPost('api/templates.php', { action: 'save', id: template.id, name, theme, status });
        template.status = result.status;
        dirty = false;
        $('#designState').textContent = result.status === 'ready' ? 'Ready — in use for reports' : 'Draft — not available to reports yet';
        $('#designState').className = 'save-state is-saved';
        if (status === 'ready') {
            const back = await confirmDialog({
                title: 'Design saved',
                message: `“${name}” can now be chosen in the builder (Design menu) and as a client’s default on the Clients page.`,
                confirmLabel: 'Back to templates',
            });
            if (back) window.location.href = 'templates.php';
        } else {
            toast('Saved as draft');
        }
    } catch (error) {
        toast(error.message, { error: true });
    } finally {
        setBusy(button, false);
    }
}

$('#btnSaveDraft').addEventListener('click', (event) => save('draft', event.currentTarget));
$('#btnSaveReady').addEventListener('click', (event) => save('ready', event.currentTarget));

$('#btnAnalyze')?.addEventListener('click', async (event) => {
    const button = event.currentTarget;
    if (dirty && !(await confirmDialog({
        title: 'Replace your changes?', message: 'The AI will describe the design again and replace the current settings.', confirmLabel: 'Analyse again',
    }))) return;
    setBusy(button, true);
    toast('The AI is studying the design (about 30 seconds)…', { duration: 30000 });
    try {
        const result = await apiPost('api/templates.php', { action: 'analyze', id: template.id });
        theme = completeTheme(result.theme);
        template.notes = result.notes;
        template.analyzedBy = 'ai';
        config.uploadNote = '';
        renderControls();
        renderPreview();
        markDirty();
        toast('Design updated from the AI. Review it and save.');
    } catch (error) {
        toast(error.message, { error: true, duration: 6000 });
    } finally {
        setBusy(button, false);
    }
});

window.addEventListener('beforeunload', (event) => {
    if (dirty) {
        event.preventDefault();
        event.returnValue = '';
    }
});
window.addEventListener('resize', renderPreviewSoon);

/* ---------- Start ---------- */

const reportSelect = $('#previewReport');
reportSelect.innerHTML = `${config.reports.map((report) => `<option value="${esc(report.uid)}">${esc(report.label)}</option>`).join('')}`
    + '<option value="">Sample text (no images)</option>';
reportSelect.addEventListener('change', () => loadPreview(reportSelect.value));

renderControls();
renderSource();
if (document.fonts?.ready) await document.fonts.ready;
loadPreview(reportSelect.value);
