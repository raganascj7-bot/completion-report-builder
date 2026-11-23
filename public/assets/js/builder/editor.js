/**
 * The middle pane: one form per section. All inputs use data-bind="path"
 * (e.g. "posted.0.title"), so a single listener keeps the report data in
 * step with what is typed. Buttons use data-action.
 */
import { $, esc } from '../lib/dom.js';
import { apiPost, apiUpload } from '../lib/api.js';
import { toast, confirmDialog, setBusy } from '../lib/ui.js';
import { store, getPath, setPath, change } from './store.js';
import { SECTIONS } from './sections.js';
import { prepareImage } from './image-prep.js';
import { monthName } from './format.js';

const STATUSES = ['IN PROGRESS', 'COMPLETE', 'TO BE FOLLOWED'];
const COLUMN_OPTIONS = [
    ['auto', 'Automatic'], ['1', 'Full width, stacked'], ['2', '2 across · up to 4 per page'],
    ['3', '3 across · up to 9 per page'], ['4', '4 across · up to 16 per page'], ['5', '5 across · up to 25 per page'],
];
const HINTS = {
    cover: 'The first page. Month and year come from the report itself.',
    summary: 'Page 2. Contractor details and dates were filled in for you — check them each month.',
    calendar: 'Screenshot of the monthly content calendar.',
    content: 'Screenshot of the content created or edited this month.',
    posted: 'One page per platform screenshot (Meta Business Suite list, IG feed grid, TikTok grid…). Add or rename pages freely.',
    creatives: 'One page per campaign or design request, with optional Drive/Canva links (they stay clickable in the PDF).',
    shoots: 'Every content shoot this month. Long tables continue on the next page automatically.',
    breakdown: 'Scope of work status. Pre-filled from the client’s default rows.',
    contact: 'The last page. Copied from Agency settings when the report was created.',
};

let root = null;
let activeSection = 'cover';
let activeSlot = null;
const uploading = {};

/* ---------- Small HTML builders ---------- */

const value = (path) => getPath(store.data, path) ?? '';

function input(path, label, { type = 'text', placeholder = '', span = false, max = 200, hint = '' } = {}) {
    return `<label class="${span ? 'span2' : ''}">${esc(label)}${hint ? ` <span class="hint">${esc(hint)}</span>` : ''}
        <input type="${type}" data-bind="${path}" value="${esc(value(path))}" placeholder="${esc(placeholder)}" maxlength="${max}"></label>`;
}

function textarea(path, label, { rows = 3, placeholder = '', span = true, max = 3000, hint = '', lines = false } = {}) {
    const current = lines ? (value(path) || []).join('\n') : value(path);
    return `<label class="${span ? 'span2' : ''}">${esc(label)}${hint ? ` <span class="hint">${esc(hint)}</span>` : ''}
        <textarea rows="${rows}" data-bind="${path}"${lines ? ' data-lines' : ''} placeholder="${esc(placeholder)}" maxlength="${max}">${esc(current)}</textarea></label>`;
}

function select(path, label, options) {
    const current = String(value(path));
    return `<label>${esc(label)}<select data-bind="${path}">${options.map(([optionValue, text]) =>
        `<option value="${esc(optionValue)}"${optionValue === current ? ' selected' : ''}>${esc(text)}</option>`).join('')}</select></label>`;
}

const iconButton = (action, label, symbol, extra = '', danger = false) =>
    `<button type="button" class="icon-btn${danger ? ' danger' : ''}" data-action="${action}" ${extra} title="${esc(label)}" aria-label="${esc(label)}">${symbol}</button>`;

function rowTools(list, index, count) {
    return `<div class="row-tools">
        ${index > 0 ? iconButton('move-row', 'Move up', '↑', `data-list="${list}" data-index="${index}" data-dir="-1"`) : ''}
        ${index < count - 1 ? iconButton('move-row', 'Move down', '↓', `data-list="${list}" data-index="${index}" data-dir="1"`) : ''}
        ${iconButton('remove-row', 'Remove', '✕', `data-list="${list}" data-index="${index}"`, true)}
    </div>`;
}

/* ---------- Image slots ---------- */

function imageTile(path, ref, index, count, multi) {
    const meta = store.images[String(ref.imageId)];
    const captionPath = multi ? `${path}.${index}.caption` : `${path}.caption`;
    const data = `data-path="${path}" data-index="${index}"`;
    return `<div class="image-tile">
        ${meta ? `<img src="${esc(meta.url)}" alt="" loading="lazy">` : '<div class="image-tile is-uploading">Missing</div>'}
        <div class="tile-actions">
            ${multi && index > 0 ? `<button type="button" class="tile-btn" data-action="img-move" ${data} data-dir="-1" title="Move earlier" aria-label="Move earlier">↑</button>` : ''}
            ${multi && index < count - 1 ? `<button type="button" class="tile-btn" data-action="img-move" ${data} data-dir="1" title="Move later" aria-label="Move later">↓</button>` : ''}
            <button type="button" class="tile-btn" data-action="img-remove" ${data} title="Remove image" aria-label="Remove image">✕</button>
        </div>
        ${multi ? `<input type="text" class="tile-caption" data-bind="${captionPath}" value="${esc(ref.caption)}" placeholder="Caption (optional)" maxlength="200">` : ''}
    </div>`;
}

function imageSlot(path, { multi = true, label = 'Add screenshots' } = {}) {
    const current = getPath(store.data, path);
    const list = multi ? (current ?? []) : (current ? [current] : []);
    const pending = uploading[path] ?? 0;
    const tiles = list.map((ref, index) => imageTile(path, ref, index, list.length, multi)).join('')
        + '<div class="image-tile is-uploading">Uploading…</div>'.repeat(pending);
    return `<div class="dropzone${activeSlot === path ? ' is-active' : ''}" tabindex="0" role="button" data-slot="${path}" data-multi="${multi}">
            <strong>${esc(multi ? label : (list.length ? 'Replace photo' : label))}</strong>
            <span>Click to browse · drag files here · or click, then paste with Ctrl+V</span>
            <input type="file" accept="image/jpeg,image/png,image/webp" ${multi ? 'multiple' : ''} tabindex="-1">
        </div>
        ${tiles ? `<div class="image-grid">${tiles}</div>` : ''}`;
}

const columnsSelect = (path) => select(path, 'Layout', COLUMN_OPTIONS);

/* ---------- Sections ---------- */

const card = (title, body, extraClass = '') => `<div class="card ${extraClass}">${title ? `<h3>${title}</h3>` : ''}${body}</div>`;

const SECTION_FORMS = {
    cover: () => card('Cover text', `<div class="form-grid">
            ${textarea('cover.clientDisplay', 'Prepared for', { rows: 2, max: 200, hint: 'as shown on the cover; Enter = new line' })}
            ${input('cover.preparedByName', 'Prepared by — name', { max: 150 })}
            ${input('cover.preparedByCompany', 'Prepared by — company', { max: 150 })}
        </div><p class="muted small">Month on the cover: <strong>${esc(monthName(store.meta.month).toUpperCase())} ${esc(store.meta.year)}</strong>. To report a different month, duplicate the report from the Reports list.</p>`)
        + card('Cover photo', imageSlot('cover.image', { multi: false, label: 'Add a cover photo' })),

    summary: () => card('Contractor information', `<div class="form-grid">
            ${input('summary.reportDate', 'Report date', { type: 'date' })}
            ${input('summary.contractorName', 'Company', { max: 150 })}
            ${textarea('summary.contractorAddress', 'Address', { rows: 2, max: 300 })}
        </div>`)
        + card('Project', `<div class="form-grid">
            ${textarea('summary.projectNames', 'Project name(s)', { rows: 2, max: 1000, hint: 'one per line' })}
            ${textarea('summary.projectDescription', 'Project description', { rows: 4, max: 3000 })}
            ${store.config.aiEnabled ? '<div class="span2 field-actions"><button type="button" class="btn btn-secondary btn-sm" data-action="ai-draft">✨ Draft with AI</button></div>' : ''}
            ${input('summary.startDate', 'Project start date', { type: 'date' })}
            ${input('summary.completionDate', 'Completion date', { type: 'date' })}
        </div>`)
        + card('Closing and sign-off', `<div class="form-grid">
            ${textarea('summary.closingNote', 'Closing note', { rows: 2, max: 500 })}
            ${input('summary.preparerName', 'Prepared by — name', { max: 150 })}
            ${input('summary.preparerCompany', 'Prepared by — company', { max: 150 })}
            ${input('summary.approverName', 'Approved by — name', { max: 150 })}
            ${input('summary.approverPosition', 'Approver position', { max: 200 })}
            ${input('summary.approverDepartment', 'Approver department / unit', { span: true, max: 200 })}
        </div>`),

    calendar: () => card('Content calendar screenshot', `${columnsSelect('calendar.columns')}<div class="spacer"></div>${imageSlot('calendar.images', { label: 'Add the content calendar screenshot' })}`),

    content: () => card(`Content for ${esc(monthName(store.meta.month))}`, `${columnsSelect('content.columns')}<div class="spacer"></div>${imageSlot('content.images', { label: 'Add content screenshots' })}`),

    posted: () => store.data.posted.map((posted, index) => card(
        `<span>Page ${index + 1}</span>${rowTools('posted', index, store.data.posted.length)}`,
        `<div class="form-grid">
            ${input(`posted.${index}.title`, 'Page title', { span: true, max: 150 })}
            ${columnsSelect(`posted.${index}.columns`)}
        </div><div class="spacer"></div>
        ${imageSlot(`posted.${index}.images`, { label: 'Add screenshots for this page' })}`,
        'group-card',
    )).join('') + `<button type="button" class="btn btn-secondary" data-action="add-posted">+ Add platform page</button>`,

    creatives: () => (store.data.creatives.length ? '' : '<p class="muted">No campaigns yet. Add one for each design request or campaign this month.</p>')
        + store.data.creatives.map((group, index) => card(
            `<span>${esc(group.title || `Campaign ${index + 1}`)}</span>${rowTools('creatives', index, store.data.creatives.length)}`,
            `<div class="form-grid">
                ${input(`creatives.${index}.title`, 'Campaign / design name', { max: 150, placeholder: 'Field of Rides' })}
                ${input(`creatives.${index}.subtitle`, 'Subtitle', { max: 200, placeholder: '(KV and Print Collaterals)' })}
            </div>
            <p class="small links-label"><strong>Links</strong> <span class="muted">— shown under the title and clickable in the PDF</span></p>
            ${group.links.map((link, linkIndex) => `<div class="link-row">
                <input type="text" data-bind="creatives.${index}.links.${linkIndex}.label" value="${esc(link.label)}" placeholder="Google Drive Link" maxlength="80" aria-label="Link label">
                <input type="url" data-bind="creatives.${index}.links.${linkIndex}.url" value="${esc(link.url)}" placeholder="https://drive.google.com/…" maxlength="2000" aria-label="Link address">
                ${iconButton('remove-row', 'Remove link', '✕', `data-list="creatives.${index}.links" data-index="${linkIndex}"`, true)}
            </div>`).join('')}
            <button type="button" class="btn btn-ghost btn-sm" data-action="add-link" data-index="${index}">+ Add link</button>
            <div class="spacer"></div>
            ${columnsSelect(`creatives.${index}.columns`)}<div class="spacer"></div>
            ${imageSlot(`creatives.${index}.images`, { label: 'Add the designs' })}`,
            'group-card',
        )).join('') + '<button type="button" class="btn btn-secondary" data-action="add-creative">+ Add campaign</button>',

    shoots: () => card('', `<div class="card-row"><span class="small muted">${store.data.shoots.length} row(s)</span>
            <button type="button" class="btn btn-primary btn-sm" data-action="add-shoot">+ Add shoot</button></div>
        <div class="tbl-wrap"><table class="edit-table">
            <thead><tr><th class="col-date">Date</th><th>Content shoot description</th><th class="col-link">GDrive link</th><th class="col-tools"><span class="visually-hidden">Actions</span></th></tr></thead>
            <tbody>${store.data.shoots.map((row, index) => `<tr>
                <td><input type="date" data-bind="shoots.${index}.date" value="${esc(row.date)}" aria-label="Date"></td>
                <td><textarea data-bind="shoots.${index}.description" rows="3" maxlength="1500" aria-label="Description" placeholder="Cafe de Lipa – Capture ambient shots of…">${esc(row.description)}</textarea></td>
                <td><input type="url" data-bind="shoots.${index}.link" value="${esc(row.link)}" placeholder="https://drive.google.com/…" maxlength="2000" aria-label="Google Drive link"></td>
                <td>${rowTools('shoots', index, store.data.shoots.length)}</td>
            </tr>`).join('') || '<tr><td colspan="4" class="muted small empty-cell">No shoots yet — add one per shoot.</td></tr>'}</tbody>
        </table></div>`),

    breakdown: () => `<div class="card-row"><span class="small muted">${store.data.breakdown.length} row(s)</span>
            <span>
                ${store.config.isAdmin && store.meta.clientId ? '<button type="button" class="btn btn-ghost btn-sm" data-action="save-preset">Save as this client’s default rows</button>' : ''}
                <button type="button" class="btn btn-primary btn-sm" data-action="add-breakdown">+ Add row</button>
            </span></div>`
        + store.data.breakdown.map((row, index) => card(
            `<span>${esc(row.title || `Row ${index + 1}`)}</span>${rowTools('breakdown', index, store.data.breakdown.length)}`,
            `<div class="form-grid">
                <label>Status<select data-bind="breakdown.${index}.status">${STATUSES.map((status) =>
                    `<option${status === row.status ? ' selected' : ''}>${status}</option>`).join('')}</select></label>
                ${input(`breakdown.${index}.title`, 'Scope title', { max: 200, placeholder: 'Facebook Content Management:' })}
                ${textarea(`breakdown.${index}.bullets`, 'Scope details', { rows: 3, max: 4000, hint: 'one bullet per line', lines: true })}
                ${textarea(`breakdown.${index}.note`, 'Note', { rows: 3, max: 1500 })}
            </div>`,
            'group-card',
        )).join(''),

    contact: () => card('Contact details', `<div class="form-grid">
            ${input('contact.viberName', 'Viber name', { max: 100 })}
            ${input('contact.viberNumber', 'Viber number', { max: 50 })}
            ${input('contact.email', 'Email', { type: 'email', max: 150 })}
            ${input('contact.website', 'Website', { max: 150 })}
            ${textarea('contact.location', 'Location', { rows: 2, max: 200 })}
        </div>`)
        + card('Office photo', imageSlot('contact.image', { multi: false, label: 'Add an office photo' })),
};

export function renderEditor() {
    if (!root || !store.data) return;
    const index = SECTIONS.findIndex((section) => section.id === activeSection);
    const section = SECTIONS[index];
    const next = SECTIONS[index + 1];
    const scroll = root.scrollTop;
    root.innerHTML = `
        <div class="editor-head"><h2>${index + 1}. ${esc(section.label)}</h2><p>${esc(HINTS[section.id])}</p></div>
        ${SECTION_FORMS[section.id]()}
        ${next ? `<div class="field-actions next-section"><button type="button" class="btn btn-ghost" data-action="jump" data-section="${next.id}">Next: ${esc(next.label)} →</button></div>` : ''}`;
    root.scrollTop = scroll;
}

/** Opens a section; announces it so the sidebar and preview can follow. */
export function setSection(id, { scroll = true } = {}) {
    if (!SECTIONS.some((section) => section.id === id)) return;
    activeSection = id;
    activeSlot = null;
    renderEditor();
    root.scrollTop = 0;
    root.dispatchEvent(new CustomEvent('sectionchange', { detail: { id, scroll } }));
}

export const currentSection = () => activeSection;

/* ---------- Uploads ---------- */

async function uploadFiles(path, multi, fileList) {
    let files = Array.from(fileList ?? []);
    if (!files.length) return;
    if (!multi) files = files.slice(0, 1);
    const limit = store.config.uploadMaxMb * 1024 * 1024;

    uploading[path] = (uploading[path] ?? 0) + files.length;
    renderEditor();
    let added = 0;
    for (const file of files) {
        try {
            const prepared = await prepareImage(file);
            if (prepared.size > limit) throw new Error(`“${file.name}” is larger than ${store.config.uploadMaxMb} MB.`);
            const form = new FormData();
            form.append('uid', store.uid);
            form.append('image', prepared, prepared.name);
            const result = await apiUpload('api/image-upload.php', form);
            store.images[String(result.id)] = { url: result.url, width: result.width, height: result.height };
            const ref = { imageId: result.id, caption: '' };
            if (multi) {
                const list = getPath(store.data, path);
                if (Array.isArray(list)) list.push(ref);
            } else {
                setPath(store.data, path, ref);
            }
            added += 1;
        } catch (error) {
            toast(error.message, { error: true, duration: 5000 });
        } finally {
            uploading[path] -= 1;
        }
    }
    if (added) change({ structural: true });
    else renderEditor();
}

function setActiveSlot(path) {
    activeSlot = path;
    root.querySelectorAll('.dropzone').forEach((zone) => zone.classList.toggle('is-active', zone.dataset.slot === path));
}

/* ---------- Actions ---------- */

function listAt(path) {
    const list = getPath(store.data, path);
    return Array.isArray(list) ? list : null;
}

const newId = () => `x${Math.random().toString(16).slice(2, 12)}`;

const ACTIONS = {
    'add-posted': () => {
        store.data.posted.push({ id: newId(), title: 'CONTENT POSTED: ', columns: 'auto', images: [] });
        change({ structural: true });
    },
    'add-creative': () => {
        store.data.creatives.push({ id: newId(), title: '', subtitle: '', links: [], columns: 'auto', images: [] });
        change({ structural: true });
    },
    'add-link': (button) => {
        store.data.creatives[Number(button.dataset.index)].links.push({ label: 'Google Drive Link', url: '' });
        change({ structural: true });
    },
    'add-shoot': () => {
        const last = store.data.shoots.at(-1);
        store.data.shoots.push({ date: last?.date ?? '', description: '', link: '' });
        change({ structural: true });
    },
    'add-breakdown': () => {
        store.data.breakdown.push({ status: 'IN PROGRESS', title: '', bullets: [], note: '' });
        change({ structural: true });
    },
    'move-row': (button) => {
        const list = listAt(button.dataset.list);
        const from = Number(button.dataset.index);
        const to = from + Number(button.dataset.dir);
        if (!list || to < 0 || to >= list.length) return;
        [list[from], list[to]] = [list[to], list[from]];
        change({ structural: true });
    },
    'remove-row': async (button) => {
        const list = listAt(button.dataset.list);
        const index = Number(button.dataset.index);
        if (!list) return;
        const imageCount = list[index]?.images?.length ?? 0;
        if (imageCount) {
            const sure = await confirmDialog({
                title: 'Remove this page?', message: `It has ${imageCount} image(s), which will be removed from the report too.`,
                confirmLabel: 'Remove', danger: true,
            });
            if (!sure) return;
        }
        list.splice(index, 1);
        change({ structural: true });
    },
    'img-move': (button) => {
        const list = listAt(button.dataset.path);
        const from = Number(button.dataset.index);
        const to = from + Number(button.dataset.dir);
        if (!list || to < 0 || to >= list.length) return;
        [list[from], list[to]] = [list[to], list[from]];
        change({ structural: true });
    },
    'img-remove': (button) => {
        const list = listAt(button.dataset.path);
        if (list) list.splice(Number(button.dataset.index), 1);
        else setPath(store.data, button.dataset.path, null);
        change({ structural: true });
    },
    jump: (button) => setSection(button.dataset.section),
    'ai-draft': async (button) => {
        setBusy(button, true);
        try {
            const { text } = await apiPost('api/ai-description.php', { uid: store.uid, data: store.data });
            const current = store.data.summary.projectDescription.trim();
            const use = !current || await confirmDialog({
                title: 'Use this AI draft?', message: text, confirmLabel: 'Replace my description',
            });
            if (use) {
                store.data.summary.projectDescription = text;
                change({ structural: true });
                toast('AI draft added — please read it and edit as needed.');
            }
        } catch (error) {
            toast(error.message, { error: true, duration: 5000 });
        } finally {
            setBusy($('[data-action="ai-draft"]', root), false);
        }
    },
    'save-preset': async (button) => {
        const sure = await confirmDialog({
            title: 'Save as default rows?',
            message: `New reports for ${store.meta.clientName} will start with these ${store.data.breakdown.length} rows (statuses reset to IN PROGRESS, notes empty).`,
            confirmLabel: 'Save default rows',
        });
        if (!sure) return;
        setBusy(button, true);
        try {
            await apiPost('api/clients.php', { action: 'save_preset', id: store.meta.clientId, breakdown: store.data.breakdown });
            toast('Saved as this client’s default rows');
        } catch (error) {
            toast(error.message, { error: true });
        } finally {
            setBusy(button, false);
        }
    },
};

/* ---------- Wiring (event delegation on the editor pane) ---------- */

export function initEditor(element) {
    root = element;

    root.addEventListener('input', (event) => {
        const field = event.target.closest('[data-bind]');
        if (!field) return;
        const newValue = field.hasAttribute('data-lines')
            ? field.value.split('\n').map((line) => line.trim()).filter(Boolean)
            : field.value;
        setPath(store.data, field.dataset.bind, newValue);
        change();
    });

    root.addEventListener('click', (event) => {
        const button = event.target.closest('[data-action]');
        if (button) {
            ACTIONS[button.dataset.action]?.(button);
            return;
        }
        const zone = event.target.closest('.dropzone');
        if (zone && event.target.tagName !== 'INPUT') {
            setActiveSlot(zone.dataset.slot);
            $('input[type="file"]', zone).click();
        }
    });

    root.addEventListener('keydown', (event) => {
        const zone = event.target.closest('.dropzone');
        if (zone && (event.key === 'Enter' || event.key === ' ')) {
            event.preventDefault();
            setActiveSlot(zone.dataset.slot);
            $('input[type="file"]', zone).click();
        }
    });

    root.addEventListener('focusin', (event) => {
        const zone = event.target.closest('.dropzone');
        if (zone) setActiveSlot(zone.dataset.slot);
    });

    root.addEventListener('change', (event) => {
        if (event.target.type !== 'file') return;
        const zone = event.target.closest('.dropzone');
        if (!zone) return;   // not one of this editor's upload boxes (e.g. the page editor's)
        const files = Array.from(event.target.files ?? []);
        event.target.value = '';
        uploadFiles(zone.dataset.slot, zone.dataset.multi === 'true', files);
    });

    root.addEventListener('dragover', (event) => {
        const zone = event.target.closest('.dropzone');
        if (!zone) return;
        event.preventDefault();
        zone.classList.add('dragover');
    });
    root.addEventListener('dragleave', (event) => event.target.closest('.dropzone')?.classList.remove('dragover'));
    root.addEventListener('drop', (event) => {
        const zone = event.target.closest('.dropzone');
        if (!zone) return;
        event.preventDefault();
        zone.classList.remove('dragover');
        setActiveSlot(zone.dataset.slot);
        uploadFiles(zone.dataset.slot, zone.dataset.multi === 'true', event.dataTransfer.files);
    });

    // Paste goes into the image box that was clicked last — never into a text field.
    window.addEventListener('paste', (event) => {
        const target = event.target;
        if (target instanceof HTMLElement && target.closest('input, textarea, select, [contenteditable]')) return;
        if (!activeSlot || !root.querySelector(`.dropzone[data-slot="${activeSlot}"]`)) return;
        const files = Array.from(event.clipboardData?.items ?? [])
            .filter((item) => item.kind === 'file' && item.type.startsWith('image/'))
            .map((item) => item.getAsFile())
            .filter(Boolean);
        if (!files.length) return;
        event.preventDefault();
        const zone = root.querySelector(`.dropzone[data-slot="${activeSlot}"]`);
        uploadFiles(activeSlot, zone.dataset.multi === 'true', files);
    });
}
