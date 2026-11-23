/** Builder page entry point: loads the report and connects every part. */
import { $, $$, debounce, esc } from '../lib/dom.js';
import { toast, openModal, closeModal, confirmDialog, setBusy } from '../lib/ui.js';
import { store, subscribe, loadReport, save, isDirty, setStatus, setDesign, readBackup, clearBackup, change } from './store.js';
import { apiGet } from '../lib/api.js';
import { SECTIONS, isSectionComplete } from './sections.js';
import { initEditor, renderEditor, setSection, currentSection } from './editor.js';
import { buildPages, emptySections, PAGE_WIDTH, PAGE_HEIGHT } from './preview.js';
import { exportPdf } from './export-pdf.js';
import { initLayoutEditor, isLayoutMode, refreshLayoutUi, renderLayoutNav, highlightSelection } from './layout-editor.js';
import { freshReportLayout, prepareLayout, fitTexts } from './layout-render.js';
import { wireShareButtons } from '../lib/share.js';

const config = JSON.parse($('#builderConfig').textContent);
const ZOOM_KEY = 'crb:zoom';
let zoom = Number(localStorage.getItem(ZOOM_KEY)) || 0.6;

/* ---------- Section navigation ---------- */

function renderNav() {
    $('.sidenav-hint').textContent = isLayoutMode() ? 'Pages' : 'Sections';
    if (isLayoutMode()) {
        renderLayoutNav();
        return;
    }
    const done = SECTIONS.filter((section) => isSectionComplete(section.id, store.data));
    $('#sectionList').innerHTML = SECTIONS.map((section, index) => {
        const complete = isSectionComplete(section.id, store.data);
        const active = section.id === currentSection();
        return `<li><button type="button" class="section-item${active ? ' active' : ''}${complete ? ' done' : ''}" data-section="${section.id}"${active ? ' aria-current="step"' : ''}>
            <span class="section-dot" aria-hidden="true">${complete ? '✓' : index + 1}</span>
            <span>${esc(section.label)}</span>${complete ? '<span class="visually-hidden">(complete)</span>' : ''}
        </button></li>`;
    }).join('');
    $('#sectionProgress').textContent = `${done.length} of ${SECTIONS.length} sections ready`;
}
const renderNavSoon = debounce(renderNav, 300);

/* ---------- Preview ---------- */

function applyZoom() {
    $('#zoomLevel').textContent = `${Math.round(zoom * 100)}%`;
    $$('#previewPages .preview-frame').forEach((frame) => {
        const height = frame.firstElementChild.offsetHeight || PAGE_HEIGHT;   // copied pages may differ from A4
        frame.style.width = `${PAGE_WIDTH * zoom}px`;
        frame.style.height = `${height * zoom}px`;
        frame.firstElementChild.style.transform = `scale(${zoom})`;
    });
}

function renderPreview() {
    const layoutMode = isLayoutMode();
    const pages = buildPages(store, { editing: layoutMode });
    $('#previewPages').innerHTML = pages.map((html, index) =>
        `<div class="preview-frame" data-page-number="${index + 1}">${html}</div>`).join('');
    $('#pageCount').textContent = `· ${pages.length} pages`;
    applyZoom();
    if (layoutMode) {
        fitTexts($('#previewPages'));
        highlightSelection();
    }
}

/** Section editor (TOLE and look-only designs) or page editor (exact copies). */
function renderWorkArea() {
    document.body.classList.toggle('is-layout-mode', isLayoutMode());
    if (isLayoutMode()) refreshLayoutUi();
    else renderEditor();
}
const renderPreviewSoon = debounce(renderPreview, 250);

/** Brings the first page of a section into view in the preview pane. */
function scrollPreviewTo(sectionId) {
    const target = $(`#previewPages .report-page[data-section="${sectionId}"]`)?.parentElement;
    const pane = $('#previewScroll');
    if (target && pane) pane.scrollTo({ top: target.offsetTop - 16, behavior: 'smooth' });
}

/* ---------- Save state ---------- */

function renderSaveState() {
    const label = $('#saveState');
    let text = '';
    let state = '';
    if (store.saving) {
        text = 'Saving…';
    } else if (store.conflict) {
        text = 'Not saved — someone else changed this report';
        state = 'is-error';
    } else if (store.error) {
        text = store.error;
        state = 'is-error';
    } else if (store.offline) {
        text = 'Offline — changes are kept in this browser and will save when you reconnect';
        state = 'is-error';
    } else if (isDirty()) {
        text = 'Unsaved changes';
        state = 'is-dirty';
    } else {
        const time = store.lastSavedAt ? new Date(String(store.lastSavedAt).replace(' ', 'T')) : null;
        text = time && !Number.isNaN(time.getTime())
            ? `All changes saved · ${time.toLocaleTimeString([], { hour: 'numeric', minute: '2-digit' })}`
            : 'All changes saved';
        state = 'is-saved';
    }
    label.textContent = text;
    label.className = `save-state ${state}`;
}

function showConflict() {
    const info = store.conflict ?? {};
    $('[data-conflict-text]').textContent = `${info.updatedBy || 'Another person'} saved a newer version`
        + `${info.updatedAt ? ` at ${info.updatedAt}` : ''} while you were editing. Your changes are still on this screen.`;
    openModal('conflictModal');
}

$('#conflictModal').addEventListener('click', async (event) => {
    const choice = event.target.closest('[data-conflict]')?.dataset.conflict;
    if (!choice) return;
    closeModal('conflictModal');
    if (choice === 'reload') {
        clearBackup();
        window.location.reload();
    } else {
        store.conflict = null;
        const ok = await save({ force: true });
        toast(ok ? 'Your version was saved.' : 'Could not save. Please try again.', { error: !ok });
    }
});

/* ---------- Export ---------- */

async function handleExport() {
    const button = $('#btnExport');
    if (isDirty()) await save();

    const empty = emptySections(store.data, store);
    if (empty.length) {
        const go = await confirmDialog({
            title: 'Some parts are still empty',
            message: `These parts have no images yet and will print as blank space: ${empty.join(', ')}. Generate the PDF anyway?`,
            confirmLabel: 'Generate anyway',
        });
        if (!go) return;
    }

    const overlay = document.createElement('div');
    overlay.className = 'export-overlay';
    overlay.innerHTML = '<div class="export-box"><div data-export-text>Preparing PDF…</div><div class="export-progress"><span></span></div></div>';
    document.body.append(overlay);
    setBusy(button, true);
    try {
        const pages = await exportPdf(store, (done, total) => {
            $('[data-export-text]', overlay).textContent = done < total ? `Rendering page ${done + 1} of ${total}…` : 'Saving file…';
            $('.export-progress span', overlay).style.width = `${Math.round((done / total) * 100)}%`;
        });
        toast(`PDF downloaded · ${pages} pages`);
    } catch (error) {
        console.error(error);
        toast(error.message || 'The PDF could not be created.', { error: true, duration: 6000 });
    } finally {
        overlay.remove();
        setBusy(button, false);
    }
}

/* ---------- Wiring ---------- */

function wire() {
    $('#sectionList').addEventListener('click', (event) => {
        const item = event.target.closest('[data-section]');
        if (!item) return;
        setSection(item.dataset.section);
    });

    $('#editor').addEventListener('sectionchange', (event) => {
        renderNav();
        if (event.detail.scroll) scrollPreviewTo(event.detail.id);
    });

    // Click a page in the preview to edit that section; links open in a new tab.
    $('#previewPages').addEventListener('click', (event) => {
        if (isLayoutMode()) return;   // the page editor handles clicks on copied pages
        const link = event.target.closest('a[href]');
        if (link) {
            event.preventDefault();
            window.open(link.href, '_blank', 'noopener');
            return;
        }
        const pageElement = event.target.closest('.report-page');
        if (pageElement?.dataset.section) setSection(pageElement.dataset.section, { scroll: false });
    });

    $('#zoomIn').addEventListener('click', () => { zoom = Math.min(1.2, Math.round((zoom + 0.1) * 10) / 10); localStorage.setItem(ZOOM_KEY, String(zoom)); applyZoom(); });
    $('#zoomOut').addEventListener('click', () => { zoom = Math.max(0.3, Math.round((zoom - 0.1) * 10) / 10); localStorage.setItem(ZOOM_KEY, String(zoom)); applyZoom(); });

    $('#reportStatus').addEventListener('change', (event) => setStatus(event.target.value));

    $('#reportDesign').addEventListener('change', async (event) => {
        const select = event.target;
        const id = select.value ? Number(select.value) : null;
        select.disabled = true;
        try {
            const design = await apiGet(`api/template-get.php${id ? `?id=${id}` : ''}`);
            if (design.kind === 'layout') {
                // Exact copies keep their own pages; start them fresh if they came from another template.
                if (store.data.layout?.templateId !== id) {
                    const edited = store.data.layout?.pages?.some((page) => Object.keys(page.texts ?? {}).length || Object.keys(page.images ?? {}).length);
                    if (edited && !(await confirmDialog({
                        title: 'Start this template’s pages?',
                        message: 'This report has edited pages from another exact-copy template. They will be replaced by fresh pages of this template. Report details (client, dates, description) stay.',
                        confirmLabel: 'Use this template',
                    }))) {
                        select.value = store.templateId ?? '';
                        return;
                    }
                    store.data.layout = freshReportLayout(prepareLayout(design.layout), id);
                }
            }
            setDesign({ id, theme: design.theme, logoUrl: design.logoUrl, kind: design.kind, layout: design.layout, assetBase: design.assetBase });
            toast(design.kind === 'layout'
                ? `Now using ${design.name}: an exact copy. Click any text or picture on the pages to change it.`
                : `Design changed to ${design.name}. The content stays the same.`);
        } catch (error) {
            select.value = store.templateId ?? '';
            toast(error.message, { error: true });
        } finally {
            select.disabled = false;
        }
    });

    $('#btnSave').addEventListener('click', async (event) => {
        const button = event.currentTarget;
        setBusy(button, true);
        const ok = await save({ force: false });
        setBusy(button, false);
        if (ok && !isDirty()) toast('Saved');
        else if (!store.conflict) toast(store.error || 'Not saved yet — your changes are kept in this browser.', { error: true });
    });

    $('#btnExport').addEventListener('click', handleExport);
    wireShareButtons($('.builder-actions'));

    document.addEventListener('keydown', (event) => {
        if ((event.ctrlKey || event.metaKey) && event.key.toLowerCase() === 's') {
            event.preventDefault();
            $('#btnSave').click();
        }
    });

    window.addEventListener('beforeunload', (event) => {
        if (isDirty() || store.saving) {
            event.preventDefault();
            event.returnValue = '';
        }
    });

    subscribe((kind) => {
        if (kind === 'structure') {
            renderWorkArea();
            renderPreview();
            renderNav();
        } else if (kind === 'data') {
            renderPreviewSoon();
            renderNavSoon();
        } else if (kind === 'conflict') {
            showConflict();
        }
        renderSaveState();
    });
}

function renderDesignSelect() {
    const select = $('#reportDesign');
    const designs = [...store.designs];
    // A report may use a design that was later set back to draft: keep it listed.
    if (store.templateId && !designs.some((design) => design.id === store.templateId)) {
        designs.push({ id: store.templateId, name: 'Current design' });
    }
    select.innerHTML = '<option value="">JT Default (TOLE)</option>'
        + designs.map((design) => `<option value="${design.id}">${esc(design.name)}</option>`).join('');
    select.value = store.templateId ?? '';
    select.closest('label').hidden = designs.length === 0;
}

function offerRestore() {
    const backup = readBackup();
    if (!backup?.data || JSON.stringify(backup.data) === JSON.stringify(store.data)) {
        clearBackup();
        return;
    }
    const dialog = $('#restoreModal');
    $('[data-restore-time]', dialog).textContent = new Date(backup.savedAt).toLocaleString();
    dialog.addEventListener('click', (event) => {
        const choice = event.target.closest('[data-restore]')?.dataset.restore;
        if (!choice) return;
        closeModal(dialog);
        if (choice === 'restore') {
            store.data = backup.data;
            store.status = backup.status ?? store.status;
            $('#reportStatus').value = store.status;
            change({ structural: true });
            toast('Your unsaved changes were restored and are being saved.');
        } else {
            clearBackup();
        }
    });
    openModal('restoreModal');
}

async function init() {
    try {
        await loadReport(config);
    } catch (error) {
        $('#editor').innerHTML = `<div class="alert alert-error">${esc(error.message)}</div>
            <button type="button" class="btn btn-primary" id="btnRetryLoad">Try again</button>`;
        $('#btnRetryLoad').addEventListener('click', () => window.location.reload());
        $('#saveState').textContent = 'Could not load';
        return;
    }
    if (document.fonts?.ready) await document.fonts.ready;

    initEditor($('#editor'));
    initLayoutEditor({ nav: $('#sectionList'), editor: $('#editor'), preview: $('#previewPages'), renderPreview, renderPreviewSoon });
    wire();
    $('#reportStatus').value = store.status;
    renderDesignSelect();
    renderWorkArea();
    renderNav();
    renderPreview();
    renderSaveState();
    offerRestore();
}

init();
