/**
 * Page editor for reports that use an exact-copy template.
 *   left    the report's pages: open, duplicate, move, remove, add from the template
 *   middle  what is selected on the page: its text, picture or link
 *   right   the pages themselves — click a text or picture to select it;
 *           drop or paste a picture onto a picture box to replace it
 * Every change goes through the store, so autosave, conflicts and the
 * browser backup work exactly as for TOLE reports.
 */
import { $, $$, esc, debounce } from '../lib/dom.js';
import { apiUpload } from '../lib/api.js';
import { toast, confirmDialog } from '../lib/ui.js';
import { store, change, setPath } from './store.js';
import { prepareImage } from './image-prep.js';
import {
    prepareLayout, textContent, soleField, LAYOUT_FIELDS, newPageId, fitTexts,
} from './layout-render.js';

let host = null;             // { nav, editor, preview, renderPreview, renderPreviewSoon }
let current = null;          // id of the open report page
let selected = null;         // element id on that page
let uploading = 0;

const layout = () => prepareLayout(store.design.layout);
const pages = () => store.data?.layout?.pages ?? [];
const pageById = (id) => pages().find((page) => page.id === id);
const templateOf = (page) => layout().pages[page.src];
const pageName = (page, index) => templateOf(page)?.name || `Page ${index + 1}`;
const asset = (page, name) => `${store.design.assetBase}p${page.src + 1}-${name}`;

function emptySlotsOn(page) {
    const template = templateOf(page);
    if (!template) return 0;
    const hidden = new Set(page.hidden ?? []);
    return template.images.filter((image) => image.role === 'slot' && !hidden.has(image.id) && !page.images?.[image.id]?.imageId).length;
}

/* ---------- Left: pages ---------- */

export function renderLayoutNav() {
    const list = pages();
    if (!current || !pageById(current)) current = list[0]?.id ?? null;
    const done = list.filter((page) => emptySlotsOn(page) === 0).length;
    host.nav.innerHTML = list.map((page, index) => {
        const empty = emptySlotsOn(page);
        const active = page.id === current;
        return `<li><button type="button" class="section-item${active ? ' active' : ''}${empty ? '' : ' done'}" data-lt-open="${page.id}"${active ? ' aria-current="page"' : ''}>
            <span class="section-dot" aria-hidden="true">${empty ? index + 1 : '✓'}</span>
            <span>${esc(pageName(page, index))}${empty ? `<small class="muted"> · ${empty} picture${empty === 1 ? '' : 's'} to add</small>` : ''}</span>
        </button></li>`;
    }).join('');
    $('#sectionProgress').textContent = `${done} of ${list.length} pages have all their pictures`;
}

/* ---------- Middle: the selected element ---------- */

function pageTools(page, index) {
    const count = pages().length;
    return `<div class="lt-pagebar">
        <div><span class="muted small">Page ${index + 1} of ${count}</span><h2>${esc(pageName(page, index))}</h2></div>
        <div class="lt-pagebar-actions">
            <button type="button" class="btn btn-ghost btn-sm" data-lt-page-action="up"${index === 0 ? ' disabled' : ''} aria-label="Move page up">↑</button>
            <button type="button" class="btn btn-ghost btn-sm" data-lt-page-action="down"${index === count - 1 ? ' disabled' : ''} aria-label="Move page down">↓</button>
            <button type="button" class="btn btn-secondary btn-sm" data-lt-page-action="duplicate">Duplicate page</button>
            <button type="button" class="btn btn-danger-ghost btn-sm" data-lt-page-action="remove"${count === 1 ? ' disabled' : ''}>Remove</button>
        </div>
    </div>`;
}

function itemList(page) {
    const template = templateOf(page);
    const hidden = new Set(page.hidden ?? []);
    const state = { data: store.data, meta: store.meta };
    const texts = template.texts.map((text) => {
        const value = textContent(text, page, state).value.replace(/\s+/g, ' ').trim();
        return `<li><button type="button" class="lt-item${hidden.has(text.id) ? ' is-hidden' : ''}" data-lt-select="${text.id}">
            <span class="lt-item-kind">${text.pattern ? 'Report value' : 'Text'}</span><span>${esc(value.slice(0, 80) || '(empty)')}</span></button></li>`;
    }).join('');
    const pictures = template.images.filter((image) => image.role !== 'fixed').map((image, index) => {
        const set = page.images?.[image.id]?.imageId;
        const status = set ? 'Replaced' : image.role === 'slot' ? 'Empty — add a picture' : 'Original photo';
        return `<li><button type="button" class="lt-item${hidden.has(image.id) ? ' is-hidden' : ''}${!set && image.role === 'slot' ? ' is-empty' : ''}" data-lt-select="${image.id}">
            <span class="lt-item-kind">Picture ${index + 1}</span><span>${status}</span></button></li>`;
    }).join('');
    return `<p class="muted small">Click any text or picture on the page (right) to change it — or pick it here.</p>
        ${pictures ? `<p class="design-subhead">Pictures</p><ul class="lt-items">${pictures}</ul>` : ''}
        ${texts ? `<p class="design-subhead">Texts</p><ul class="lt-items">${texts}</ul>` : ''}`;
}

function textPanel(page, text) {
    const state = { data: store.data, meta: store.meta };
    const content = textContent(text, page, state);
    const sole = text.pattern ? soleField(text.pattern) : null;
    const hidden = (page.hidden ?? []).includes(text.id);
    let note = '';
    if (content.source === 'field' && sole) {
        note = `Filled in from <strong>${esc(LAYOUT_FIELDS[sole.field].label)}</strong>. Changing it here changes it on every page that shows it.`;
    } else if (content.source === 'pattern') {
        note = 'Filled in from this report (month, dates…). Typing here replaces it with your own text on this page only.';
    } else if (content.source === 'edited') {
        note = 'Changed on this page.';
    }
    const link = page.links?.[text.id] ?? text.link;
    return `<div class="stack">
        <label>Text
            <textarea rows="${Math.min(10, Math.max(3, content.value.split('\n').length + 1))}" data-lt-text="${text.id}">${esc(content.value)}</textarea></label>
        ${note ? `<p class="hint">${note}</p>` : ''}
        ${link ? `<label>Link address <input type="url" data-lt-link="${text.id}" value="${esc(link)}" maxlength="2000" placeholder="https://drive.google.com/…"></label>` : ''}
        <div class="lt-panel-actions">
            ${content.source === 'edited' ? `<button type="button" class="btn btn-ghost btn-sm" data-lt-reset="${text.id}">Back to the template text</button>` : ''}
            <button type="button" class="btn btn-ghost btn-sm" data-lt-hide="${text.id}">${hidden ? 'Show this text' : 'Hide this text'}</button>
        </div>
    </div>`;
}

function imagePanel(page, image) {
    const set = page.images?.[image.id];
    const meta = set?.imageId ? store.images[String(set.imageId)] : null;
    const hidden = (page.hidden ?? []).includes(image.id);
    const preview = meta ? meta.url : image.role !== 'slot' ? asset(page, image.id) : '';
    const what = image.role === 'slot' ? 'A picture that is new every month.' : image.role === 'keep' ? 'This photo stays until you replace it.' : 'A logo or icon from the template.';
    return `<div class="stack">
        <p class="hint">${what} Box size ${Math.round(image.w)} × ${Math.round(image.h)} px.</p>
        <div class="lt-drop" data-lt-drop="${image.id}" tabindex="0">
            ${preview ? `<img src="${preview}" alt="">` : '<span>No picture yet</span>'}
            <span class="muted small">${uploading ? 'Uploading…' : 'Click to choose a picture · drag one here · or paste with Ctrl+V'}</span>
        </div>
        <input type="file" accept="image/*" hidden data-lt-file="${image.id}">
        ${meta ? `<label class="inline-select">Fit
            <select data-lt-fit="${image.id}">
                <option value="cover"${set.fit !== 'contain' ? ' selected' : ''}>Fill the box (may crop)</option>
                <option value="contain"${set.fit === 'contain' ? ' selected' : ''}>Show the whole picture</option>
            </select></label>` : ''}
        <div class="lt-panel-actions">
            ${meta ? `<button type="button" class="btn btn-ghost btn-sm" data-lt-unset="${image.id}">${image.role === 'slot' ? 'Remove picture' : 'Back to the original photo'}</button>` : ''}
            <button type="button" class="btn btn-ghost btn-sm" data-lt-hide="${image.id}">${hidden ? 'Show this picture' : 'Hide this picture'}</button>
        </div>
    </div>`;
}

function linkPanel(page, link) {
    const hidden = (page.hidden ?? []).includes(link.id);
    return `<div class="stack">
        <label>Link address <input type="url" data-lt-link="${link.id}" value="${esc(page.links?.[link.id] ?? link.url)}" maxlength="2000"></label>
        <p class="hint">A clickable area in the PDF.</p>
        <div class="lt-panel-actions"><button type="button" class="btn btn-ghost btn-sm" data-lt-hide="${link.id}">${hidden ? 'Turn link on' : 'Turn link off'}</button></div>
    </div>`;
}

export function renderLayoutEditor() {
    const page = pageById(current);
    if (!page) {
        host.editor.innerHTML = '<p class="muted">This report has no pages.</p>';
        return;
    }
    const index = pages().indexOf(page);
    const template = templateOf(page);
    let body = '';
    if (selected) {
        const text = template.texts.find((item) => item.id === selected);
        const image = template.images.find((item) => item.id === selected);
        const link = template.links.find((item) => item.id === selected);
        const title = text ? 'Text' : image ? 'Picture' : 'Link';
        body = `<div class="lt-selected-head"><button type="button" class="btn btn-ghost btn-sm" data-lt-select="">← All items on this page</button>
            <h3>${title}</h3></div>`
            + (text ? textPanel(page, text) : image ? imagePanel(page, image) : link ? linkPanel(page, link) : '');
    } else {
        body = itemList(page);
    }
    const options = layout().pages.map((tpl, i) => `<option value="${i}">${i + 1}. ${esc(tpl.name || `Page ${i + 1}`)}</option>`).join('');
    host.editor.innerHTML = `${pageTools(page, index)}<div class="card lt-panel">${body}</div>
        <div class="lt-addpage">
            <label class="inline-select">Add a page from the template
                <select data-lt-add><option value="">Choose…</option>${options}</select></label>
        </div>`;
}

/* ---------- Selection on the pages ---------- */

export function highlightSelection() {
    $$('.lt-editing .is-selected', host.preview).forEach((element) => element.classList.remove('is-selected'));
    $$('.lt-editing .is-current-page', host.preview).forEach((element) => element.classList.remove('is-current-page'));
    const pageElement = $(`.report-page[data-lt-page="${current}"]`, host.preview);
    pageElement?.parentElement?.classList.add('is-current-page');
    if (selected) $(`[data-el="${selected}"]`, pageElement ?? host.preview)?.classList.add('is-selected');
    if (pageElement) fitTexts(pageElement.closest('.preview-pages') ?? host.preview);
}

function scrollToPage(id) {
    const frame = $(`.report-page[data-lt-page="${id}"]`, host.preview)?.parentElement;
    const pane = $('#previewScroll');
    if (frame && pane) pane.scrollTo({ top: frame.offsetTop - 16, behavior: 'smooth' });
}

function open(id, { element = null, scroll = true } = {}) {
    current = id;
    selected = element;
    renderLayoutNav();
    renderLayoutEditor();
    highlightSelection();
    if (scroll) scrollToPage(id);
}

/* ---------- Changes ---------- */

function setText(page, text, value) {
    const sole = text.pattern ? soleField(text.pattern) : null;
    if (sole && !(page.texts && text.id in page.texts)) {
        setPath(store.data, sole.path, value);        // shared report value: every page follows
    } else {
        page.texts = { ...(page.texts ?? {}), [text.id]: value };
    }
    change();
}

async function uploadTo(page, elementId, fileList) {
    const file = Array.from(fileList ?? []).find((item) => item.type.startsWith('image/'));
    if (!file) {
        toast('That is not a picture. Use JPG, PNG or WebP.', { error: true });
        return;
    }
    uploading += 1;
    renderLayoutEditor();
    try {
        const prepared = await prepareImage(file);
        if (prepared.size > store.config.uploadMaxMb * 1024 * 1024) throw new Error(`“${file.name}” is larger than ${store.config.uploadMaxMb} MB.`);
        const form = new FormData();
        form.append('uid', store.uid);
        form.append('image', prepared, prepared.name);
        const result = await apiUpload('api/image-upload.php', form);
        store.images[String(result.id)] = { url: result.url, width: result.width, height: result.height };
        const previous = page.images?.[elementId];
        page.images = { ...(page.images ?? {}), [elementId]: { imageId: result.id, fit: previous?.fit ?? 'cover' } };
        change({ structural: true });
    } catch (error) {
        toast(error.message, { error: true, duration: 5000 });
    } finally {
        uploading -= 1;
        renderLayoutEditor();
    }
}

async function pageAction(action) {
    const list = pages();
    const index = list.findIndex((page) => page.id === current);
    const page = list[index];
    if (!page) return;
    if (action === 'up' && index > 0) {
        [list[index - 1], list[index]] = [list[index], list[index - 1]];
    } else if (action === 'down' && index < list.length - 1) {
        [list[index + 1], list[index]] = [list[index], list[index + 1]];
    } else if (action === 'duplicate') {
        const template = templateOf(page);
        // Same texts; pictures that change every month start empty on the copy.
        const images = Object.fromEntries(Object.entries(page.images ?? {})
            .filter(([id]) => template.images.find((image) => image.id === id)?.role !== 'slot'));
        const copy = { id: newPageId(), src: page.src, texts: { ...(page.texts ?? {}) }, images, links: { ...(page.links ?? {}) }, hidden: [...(page.hidden ?? [])] };
        list.splice(index + 1, 0, copy);
        current = copy.id;
        selected = null;
        toast('Page duplicated — add the new pictures to the copy.');
    } else if (action === 'remove') {
        const sure = await confirmDialog({
            title: 'Remove this page?',
            message: `“${pageName(page, index)}” and its pictures will be removed from this report. The template is not changed.`,
            confirmLabel: 'Remove page', danger: true,
        });
        if (!sure) return;
        list.splice(index, 1);
        current = list[Math.min(index, list.length - 1)]?.id ?? null;
        selected = null;
    } else {
        return;
    }
    change({ structural: true });
    scrollToPage(current);
}

/* ---------- Wiring ---------- */

export function initLayoutEditor(parts) {
    host = parts;
    current = pages()[0]?.id ?? null;

    host.nav.addEventListener('click', (event) => {
        const button = event.target.closest('[data-lt-open]');
        if (button) open(button.dataset.ltOpen);
    });

    host.preview.addEventListener('click', (event) => {
        if (!isLayoutMode()) return;
        const link = event.target.closest('a[href]');
        if (link) event.preventDefault();
        const pageElement = event.target.closest('.report-page[data-lt-page]');
        if (!pageElement) return;
        const element = event.target.closest('[data-el]');
        open(pageElement.dataset.ltPage, { element: element?.dataset.el ?? null, scroll: false });
        if (element?.matches('.lt-text')) $('[data-lt-text]', host.editor)?.focus();
    });

    // Drop a picture straight onto a picture box on the page.
    host.preview.addEventListener('dragover', (event) => {
        if (isLayoutMode() && event.target.closest('.lt-img')) event.preventDefault();
    });
    host.preview.addEventListener('drop', (event) => {
        const box = event.target.closest('.lt-img');
        const pageElement = event.target.closest('.report-page[data-lt-page]');
        if (!isLayoutMode() || !box || !pageElement) return;
        event.preventDefault();
        open(pageElement.dataset.ltPage, { element: box.dataset.el, scroll: false });
        uploadTo(pageById(pageElement.dataset.ltPage), box.dataset.el, event.dataTransfer.files);
    });

    host.editor.addEventListener('click', (event) => {
        if (!isLayoutMode()) return;
        const page = pageById(current);
        const target = event.target;
        const select = target.closest('[data-lt-select]');
        if (select) {
            open(current, { element: select.dataset.ltSelect || null, scroll: false });
            return;
        }
        const action = target.closest('[data-lt-page-action]');
        if (action) {
            pageAction(action.dataset.ltPageAction);
            return;
        }
        const drop = target.closest('[data-lt-drop]');
        if (drop) {
            $(`[data-lt-file="${drop.dataset.ltDrop}"]`, host.editor)?.click();
            return;
        }
        const hide = target.closest('[data-lt-hide]');
        if (hide && page) {
            const id = hide.dataset.ltHide;
            const hidden = new Set(page.hidden ?? []);
            if (hidden.has(id)) hidden.delete(id); else hidden.add(id);
            page.hidden = [...hidden];
            change({ structural: true });
            return;
        }
        const reset = target.closest('[data-lt-reset]');
        if (reset && page) {
            const texts = { ...(page.texts ?? {}) };
            delete texts[reset.dataset.ltReset];
            page.texts = texts;
            change({ structural: true });
            return;
        }
        const unset = target.closest('[data-lt-unset]');
        if (unset && page) {
            const images = { ...(page.images ?? {}) };
            delete images[unset.dataset.ltUnset];
            page.images = images;
            change({ structural: true });
        }
    });

    host.editor.addEventListener('keydown', (event) => {
        const drop = event.target.closest?.('[data-lt-drop]');
        if (drop && (event.key === 'Enter' || event.key === ' ')) {
            event.preventDefault();
            $(`[data-lt-file="${drop.dataset.ltDrop}"]`, host.editor)?.click();
        }
    });

    host.editor.addEventListener('dragover', (event) => { if (event.target.closest('[data-lt-drop]')) event.preventDefault(); });
    host.editor.addEventListener('drop', (event) => {
        const drop = event.target.closest('[data-lt-drop]');
        if (!drop) return;
        event.preventDefault();
        uploadTo(pageById(current), drop.dataset.ltDrop, event.dataTransfer.files);
    });

    const typed = debounce(() => host.renderPreviewSoon(), 50);
    host.editor.addEventListener('input', (event) => {
        if (!isLayoutMode()) return;
        const page = pageById(current);
        if (!page) return;
        const template = templateOf(page);
        if (event.target.matches('[data-lt-text]')) {
            const text = template.texts.find((item) => item.id === event.target.dataset.ltText);
            if (text) setText(page, text, event.target.value);
            typed();
        } else if (event.target.matches('[data-lt-link]')) {
            page.links = { ...(page.links ?? {}), [event.target.dataset.ltLink]: event.target.value.trim() };
            change();
        }
    });

    host.editor.addEventListener('change', (event) => {
        if (!isLayoutMode()) return;
        const page = pageById(current);
        if (event.target.matches('[data-lt-file]') && page) {
            uploadTo(page, event.target.dataset.ltFile, event.target.files);
            event.target.value = '';
        } else if (event.target.matches('[data-lt-fit]') && page) {
            const id = event.target.dataset.ltFit;
            page.images = { ...(page.images ?? {}), [id]: { ...page.images[id], fit: event.target.value } };
            change({ structural: true });
        } else if (event.target.matches('[data-lt-add]') && event.target.value !== '') {
            const list = pages();
            const index = list.findIndex((item) => item.id === current);
            const added = { id: newPageId(), src: Number(event.target.value), texts: {}, images: {}, links: {}, hidden: [] };
            list.splice(index + 1, 0, added);
            current = added.id;
            selected = null;
            change({ structural: true });
            scrollToPage(added.id);
        }
    });

    // Paste a picture into the selected picture box.
    document.addEventListener('paste', (event) => {
        if (!isLayoutMode() || !selected || !event.clipboardData?.files?.length) return;
        const page = pageById(current);
        if (!templateOf(page)?.images.some((image) => image.id === selected)) return;
        event.preventDefault();
        uploadTo(page, selected, event.clipboardData.files);
    });
}

export function isLayoutMode() {
    return store.design?.kind === 'layout' && Boolean(store.design.layout) && Boolean(store.data?.layout);
}

/** Called after a full re-render (structure changed): keep the open page and selection valid. */
export function refreshLayoutUi() {
    if (!pageById(current)) current = pages()[0]?.id ?? null;
    const page = pageById(current);
    const template = page ? templateOf(page) : null;
    if (selected && !(template && [...template.texts, ...template.images, ...template.links].some((item) => item.id === selected))) selected = null;
    renderLayoutNav();
    renderLayoutEditor();
    highlightSelection();
}
