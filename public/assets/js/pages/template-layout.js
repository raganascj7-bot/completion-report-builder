/**
 * Review screen of an exact-copy template.
 * Left: notes, pages, and what the selected text or photo is.
 * Middle: the copy (original wording, or filled in from a real report).
 * Right: the uploaded original page, for comparison.
 * Only labels change here — names, which texts fill in from the report,
 * and what each photo is. Positions never change.
 */
import { $, $$, esc, debounce } from '../lib/dom.js';
import { apiGet, apiPost } from '../lib/api.js';
import { toast, setBusy } from '../lib/ui.js';
import {
    PAGE_WIDTH, LAYOUT_FIELDS, layoutPageHtml, prepareLayout, fitTexts, patternFits, soleField, measureRoom,
} from '../builder/layout-render.js';

const config = JSON.parse($('#layoutConfig').textContent);
let template = config.template;
let layout = prepareLayout(template.layout);
let pageIndex = 0;
let selected = null;          // element id on the current page
let sample = null;            // { data, meta, images } of a real report, or null = original wording
let dirty = false;

const controls = $('#layoutControls');
const asset = (index) => (name) => `${template.assetBase}p${index + 1}-${name}`;
const currentPage = () => layout.pages[pageIndex];

function markDirty() {
    dirty = true;
    $('#designState').textContent = 'Unsaved changes';
}

/* ---------- Left panel ---------- */

const ROLE_TEXT = {
    fixed: ['Fixed', 'A logo or icon. Never changes.'],
    keep: ['Keep until replaced', 'A photo that stays each month unless someone replaces it (cover or office photo).'],
    slot: ['New picture each month', 'Starts empty in every new report — for screenshots.'],
};

const TWO_LINE_MONTH = /^\{month(?::\w+)?\}\n\{year\}$/;

function fieldOptions(current) {
    if (TWO_LINE_MONTH.test(current ?? '')) current = '{monthYear}';
    const sole = soleField(current) ?? (/^\{([a-zA-Z]+)(?::\w+)?(?:@\w+)?\}$/.exec(current ?? '') ? { field: /^\{([a-zA-Z]+)/.exec(current)[1] } : null);
    const value = !current ? '' : sole ? `field:${sole.field}` : 'custom';
    return `<option value=""${value === '' ? ' selected' : ''}>Keep this text as it is</option>`
        + Object.entries(LAYOUT_FIELDS).map(([key, info]) =>
            `<option value="field:${key}"${value === `field:${key}` ? ' selected' : ''}>Fill in: ${esc(info.label)}</option>`).join('')
        + `<option value="custom"${value === 'custom' ? ' selected' : ''}>Mix of fixed words and report values…</option>`;
}

function selectionHtml() {
    const page = currentPage();
    if (!selected) {
        return '<p class="muted small">Click a text or a photo on the copy to see what it is and change it.</p>';
    }
    const text = page.texts.find((item) => item.id === selected);
    if (text) {
        const original = text.lines.join('\n');
        const custom = text.pattern && !/^\{[a-zA-Z]+(?::\w+)?(?:@\w+)?\}$/.test(text.pattern) && !TWO_LINE_MONTH.test(text.pattern);
        return `
            <p class="design-subhead">Text</p>
            <pre class="layout-original">${esc(original)}</pre>
            <label>In new reports
                <select data-text-role>${fieldOptions(text.pattern)}</select>
            </label>
            <div data-custom ${custom ? '' : 'hidden'}>
                <label>Pattern
                    <textarea rows="3" data-pattern spellcheck="false">${esc(text.pattern ?? original)}</textarea></label>
                <p class="hint">Write the text with report values in braces, e.g. <code>Period start: {startDate}</code> or
                    <code>CONTENT CALENDAR: {month:upper}</code>. The fixed words must match the original.</p>
                <p class="form-error small" data-pattern-error hidden></p>
            </div>
            <p class="hint">${esc(text.fontName || text.font)} · ${Math.round(text.size)} px${text.link ? ` · link: ${esc(text.link)}` : ''}</p>`;
    }
    const image = page.images.find((item) => item.id === selected);
    if (image) {
        return `
            <p class="design-subhead">Photo</p>
            <img class="layout-thumb" src="${esc(asset(pageIndex)(image.id))}" alt="">
            <div class="stack-sm" role="radiogroup" aria-label="What this photo is">
                ${Object.entries(ROLE_TEXT).map(([role, [label, help]]) => `
                    <label class="choice-card">
                        <input type="radio" name="imageRole" value="${role}"${image.role === role ? ' checked' : ''}>
                        <span><strong>${label}</strong><span class="muted small">${help}</span></span>
                    </label>`).join('')}
            </div>`;
    }
    const link = page.links.find((item) => item.id === selected);
    if (link) {
        return `<p class="design-subhead">Link area</p><p class="small">${esc(link.url)}</p>
            <p class="hint">Clickable in the PDF. Each report can change the address.</p>`;
    }
    return '';
}

function counts() {
    let fields = 0; let slots = 0; let texts = 0;
    layout.pages.forEach((page) => {
        texts += page.texts.length;
        fields += page.texts.filter((text) => text.pattern).length;
        slots += page.images.filter((image) => image.role === 'slot').length;
    });
    return { fields, slots, texts };
}

function renderControls() {
    const notes = [...(config.uploadNote ? [config.uploadNote] : []), ...template.notes];
    const { fields, slots, texts } = counts();
    const intro = config.isNew
        ? `<div class="alert alert-info small">This is an exact copy of <strong>${esc(template.sourceName)}</strong>.
            ${template.analyzedBy === 'ai' ? 'The AI checked what each part is.' : 'Report values were found automatically.'}
            Check the pages, then press <strong>Save — ready to use</strong>.</div>`
        : '';
    controls.innerHTML = `
        ${intro}
        ${notes.length ? `<details class="design-group" open><summary>Notes</summary><ul class="design-notes">${notes.map((note) => `<li>${esc(note)}</li>`).join('')}</ul></details>` : ''}
        <div class="design-group layout-summary">
            <p class="small"><strong>${layout.pages.length}</strong> pages · <strong>${texts}</strong> texts ·
                <span class="tag-field">${fields} fill in from the report</span> ·
                <span class="tag-slot">${slots} new pictures each month</span></p>
        </div>
        <details class="design-group" open><summary>Pages</summary>
            <ol class="layout-pages">${layout.pages.map((page, index) => `
                <li><button type="button" class="layout-page-item${index === pageIndex ? ' active' : ''}" data-page="${index}">
                    <img src="${esc(template.assetBase)}thumb-${index + 1}" alt="" loading="lazy">
                    <span><b>${index + 1}.</b> ${esc(page.name || `Page ${index + 1}`)}</span>
                </button></li>`).join('')}</ol>
        </details>
        <details class="design-group" open><summary>This page</summary>
            <label>Page name <input type="text" maxlength="80" data-page-name value="${esc(currentPage().name)}" placeholder="e.g. Content calendar"></label>
            <div class="layout-selection">${selectionHtml()}</div>
        </details>
        <p class="hint layout-legend"><span class="tag-field">Green</span> texts fill in from each report ·
            <span class="tag-slot">orange</span> pictures are new each month.</p>`;
}

/* ---------- Middle and right ---------- */

function renderPreview() {
    const page = currentPage();
    const html = layoutPageHtml(page, null, sample, { asset: asset(pageIndex), editing: true, label: page.name });
    const column = $('#layoutPreview');
    const width = Math.max(320, column.clientWidth - 32);
    const zoom = Math.min(1, width / PAGE_WIDTH);
    column.innerHTML = `<div class="preview-frame" style="width:${PAGE_WIDTH * zoom}px;height:${page.height * zoom}px">
        <div style="transform:scale(${zoom});transform-origin:0 0;width:${PAGE_WIDTH}px">${html}</div></div>`;
    const pageElement = $('.report-page', column);
    pageElement.classList.add('lt-review');
    page.texts.forEach((text) => { if (text.pattern) $(`[data-el="${text.id}"]`, pageElement)?.classList.add('has-field'); });
    page.images.forEach((image) => { $(`[data-el="${image.id}"]`, pageElement)?.classList.add(`role-${image.role}`); });
    if (selected) $(`[data-el="${selected}"]`, pageElement)?.classList.add('is-selected');
    fitTexts(pageElement);
    $('#pageLabel').textContent = `Page ${pageIndex + 1} of ${layout.pages.length}`;
    $('#layoutSource').innerHTML = `<img class="layout-source-page" src="${esc(template.assetBase)}page-${pageIndex + 1}" alt="Original page ${pageIndex + 1}">`;
}

function render() {
    renderControls();
    renderPreview();
}

/* ---------- Events ---------- */

$('#layoutPreview').addEventListener('click', (event) => {
    if (event.target.closest('a')) event.preventDefault();
    const element = event.target.closest('[data-el]');
    selected = element ? element.dataset.el : null;
    render();
});

controls.addEventListener('click', (event) => {
    const item = event.target.closest('[data-page]');
    if (!item) return;
    pageIndex = Number(item.dataset.page);
    selected = null;
    render();
    $('#layoutPreview').scrollTop = 0;
});

controls.addEventListener('change', (event) => {
    const page = currentPage();
    const text = page.texts.find((item) => item.id === selected);
    if (event.target.matches('[data-text-role]') && text) {
        const value = event.target.value;
        if (value === '') text.pattern = null;
        else if (value.startsWith('field:')) {
            const original = text.lines.join('\n');
            const upper = /[A-Za-z]/.test(original) && original === original.toUpperCase();
            const field = value.slice(6);
            // "AUGUST / 2026" on two lines stays on two lines: month, then year.
            text.pattern = field === 'monthYear' && text.lines.length >= 2
                ? `{month${upper ? ':upper' : ''}}\n{year}`
                : `{${field}${upper ? ':upper' : ''}}`;
        } else {
            $('[data-custom]', controls).hidden = false;
            return;
        }
        markDirty();
        render();
    }
    if (event.target.matches('[name="imageRole"]')) {
        const image = page.images.find((item) => item.id === selected);
        if (image) image.role = event.target.value;
        markDirty();
        render();
    }
});

controls.addEventListener('input', debounce((event) => {
    const page = currentPage();
    if (event.target.matches('[data-page-name]')) {
        page.name = event.target.value;
        markDirty();
        $(`.layout-page-item[data-page="${pageIndex}"] span`, controls).innerHTML = `<b>${pageIndex + 1}.</b> ${esc(page.name || `Page ${pageIndex + 1}`)}`;
    }
    if (event.target.matches('[data-pattern]')) {
        const text = page.texts.find((item) => item.id === selected);
        const error = $('[data-pattern-error]', controls);
        const value = event.target.value;
        if (text && patternFits(value, text.lines.join('\n'))) {
            error.hidden = true;
            text.pattern = value;
            markDirty();
            renderPreview();
        } else {
            error.hidden = false;
            error.textContent = 'Use at least one {field} from the list, and keep the fixed words as in the original.';
        }
    }
}, 250));

/* ---------- Preview with a real report ---------- */

const previewSelect = $('#previewReport');
previewSelect.innerHTML = '<option value="">Original wording</option>'
    + config.reports.map((report) => `<option value="${esc(report.uid)}">Filled in: ${esc(report.label)}</option>`).join('');
previewSelect.addEventListener('change', async () => {
    if (!previewSelect.value) {
        sample = null;
        renderPreview();
        return;
    }
    try {
        const result = await apiGet(`api/report-get.php?uid=${encodeURIComponent(previewSelect.value)}`);
        sample = { data: result.data, meta: result.report, images: {} };
        renderPreview();
    } catch (error) {
        toast(error.message, { error: true });
    }
});

/* ---------- Saving ---------- */

function labels() {
    return {
        pages: layout.pages.map((page) => ({
            name: page.name,
            texts: Object.fromEntries(page.texts.map((text) => [text.id, text.pattern ?? null])),
            images: Object.fromEntries(page.images.map((image) => [image.id, image.role])),
        })),
    };
}

async function saveAs(status, button) {
    const name = $('#designName').value.trim();
    if (!name) {
        toast('Give the template a name.', { error: true });
        $('#designName').focus();
        return;
    }
    setBusy(button, true);
    try {
        template = await apiPost('api/templates.php', { action: 'save_layout', id: template.id, name, status, labels: labels() });
        layout = prepareLayout(template.layout);
        await measure();
        dirty = false;
        $('#designState').textContent = status === 'ready' ? 'Ready — in use for reports' : 'Draft — not available to reports yet';
        toast(status === 'ready' ? 'Saved. This template can now be used for reports.' : 'Saved as draft.');
        render();
    } catch (error) {
        toast(error.message, { error: true, duration: 6000 });
    } finally {
        setBusy(button, false);
    }
}

$('#btnSaveReady').addEventListener('click', (event) => saveAs('ready', event.currentTarget));
$('#btnSaveDraft').addEventListener('click', (event) => saveAs('draft', event.currentTarget));
$('#btnLabel')?.addEventListener('click', async (event) => {
    const button = event.currentTarget;
    if (dirty) await saveAs(template.status, button);
    setBusy(button, true);
    try {
        template = await apiPost('api/templates.php', { action: 'label', id: template.id });
        layout = prepareLayout(template.layout);
        await measure();
        toast('The AI checked the labels.');
        render();
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
window.addEventListener('resize', debounce(renderPreview, 150));

const measure = () => measureRoom(layout, asset);
if (document.fonts?.ready) await document.fonts.ready;
await measure();
render();
