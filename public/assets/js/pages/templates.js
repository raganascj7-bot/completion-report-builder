import { $, $$ } from '../lib/dom.js';
import { apiPost, apiUpload } from '../lib/api.js';
import { toast, wireModals, confirmDialog, setBusy, showFormError } from '../lib/ui.js';
import { readDesign } from '../templates/read-design.js';
import { readLayout, layoutJson } from '../templates/read-layout.js';
import { labelLayout } from '../templates/layout-label.js';
import { wireShareButtons } from '../lib/share.js';

wireModals();
wireShareButtons();

const form = $('#uploadForm');
const progress = $('[data-upload-progress]', form);
const config = JSON.parse($('#templatesConfig')?.textContent || '{}');
const mode = () => form.elements.mode.value;

function showMode() {
    $$('[data-mode-hint]', form).forEach((item) => { item.hidden = item.dataset.modeHint !== mode(); });
    $$('[data-mode-step]', form).forEach((item) => { item.hidden = item.dataset.modeStep !== mode(); });
    form.elements.file.accept = mode() === 'layout' ? 'application/pdf' : 'application/pdf,image/jpeg,image/png,image/webp';
    form.elements.file.multiple = mode() !== 'layout';
}
$$('input[name="mode"]', form).forEach((radio) => radio.addEventListener('change', showMode));
showMode();

/** Exact copy: read the PDF, label it, create the template, then send each page's pictures. */
async function uploadLayout(file, name) {
    const read = await readLayout(file, step);
    const layout = labelLayout(layoutJson(read), config.known);
    step('upload', 'template');
    const create = new FormData();
    create.append('name', name);
    create.append('layout', JSON.stringify(layout));
    create.append('notes', JSON.stringify(read.notes));
    create.append('source', file, file.name);
    const created = await apiUpload('api/layout-create.php', create);

    for (let index = 0; index < read.pages.length; index += 1) {
        step('upload', `page ${index + 1} of ${read.pages.length}`);
        const page = read.pages[index];
        const parts = [
            ['picture', page.picture, 'picture.jpg'],
            ['thumb', page.thumb, 'thumb.jpg'],
            ['bg', page.background, `bg.${page.background.type === 'image/png' ? 'png' : 'jpg'}`],
        ];
        page.images.forEach((image) => {
            parts.push([`image_${image.id}`, image.blob, `${image.id}.${image.blob.type === 'image/png' ? 'png' : 'jpg'}`]);
            if (image.mask) parts.push([`mask_${image.id}`, image.mask, `${image.id}-mask.png`]);
        });
        // PHP accepts 20 files per request by default (max_file_uploads): send them in batches.
        for (let start = 0; start < parts.length; start += 15) {
            const files = new FormData();
            files.append('id', String(created.id));
            files.append('page', String(index + 1));
            parts.slice(start, start + 15).forEach(([field, blob, fileName]) => files.append(field, blob, fileName));
            await apiUpload('api/layout-assets.php', files);
        }
    }

    let note = '';
    if (created.aiEnabled) {
        step('analyze');
        try {
            await apiPost('api/templates.php', { action: 'label', id: created.id });
        } catch (error) {
            note = `&note=${encodeURIComponent(error.message)}`;
        }
    }
    window.location.href = `template-layout.php?id=${created.id}&new=1${note}`;
}

function step(name, detail = '') {
    progress.hidden = false;
    let reached = false;
    $$('[data-step]', progress).forEach((item) => {
        const isCurrent = item.dataset.step === name;
        if (isCurrent) reached = true;
        item.classList.toggle('is-done', !reached);
        item.classList.toggle('is-current', isCurrent);
        item.dataset.detail = isCurrent ? detail : '';
    });
}

// Suggest a name from the file the user picked.
form.elements.file.addEventListener('change', () => {
    const file = form.elements.file.files?.[0];
    if (file && !form.elements.name.value.trim()) {
        form.elements.name.value = file.name.replace(/\.[^.]+$/, '').replace(/[_-]+/g, ' ').slice(0, 120);
    }
});

form.addEventListener('submit', async (event) => {
    event.preventDefault();
    const button = $('[type="submit"]', form);
    const name = form.elements.name.value.trim();
    showFormError(form, null);
    if (!name) {
        showFormError(form, 'Give the template a name.');
        form.elements.name.focus();
        return;
    }
    const files = form.elements.file.files;
    if (!files?.length) {
        showFormError(form, 'Choose the finished report first.');
        return;
    }
    if (mode() === 'layout' && !/pdf$/i.test(files[0].type || files[0].name)) {
        showFormError(form, 'An exact copy needs the report as a PDF. Pictures only work with “Learn the look only”.');
        return;
    }
    setBusy(button, true);
    try {
        if (mode() === 'layout') {
            await uploadLayout(files[0], name);
            return;
        }
        const design = await readDesign(files, step);
        step('upload');
        const upload = new FormData();
        upload.append('name', name);
        upload.append('theme', JSON.stringify(design.theme));
        upload.append('palette', JSON.stringify(design.palette));
        upload.append('notes', JSON.stringify(design.notes));
        upload.append('analyzedBy', design.analyzedBy);
        design.pages.forEach((blob, index) => upload.append('pages[]', blob, `page-${index + 1}.jpg`));
        if (design.source) upload.append('source', design.source, design.source.name);
        const created = await apiUpload('api/template-create.php', upload);

        let note = '';
        if (created.aiEnabled) {
            step('analyze');
            try {
                await apiPost('api/templates.php', { action: 'analyze', id: created.id });
            } catch (error) {
                note = `&note=${encodeURIComponent(error.message)}`;
            }
        }
        const extra = design.totalPages > 8 ? '&pages=more' : '';
        window.location.href = `template-edit.php?id=${created.id}&new=1${extra}${note}`;
    } catch (error) {
        showFormError(form, error.message);
        progress.hidden = true;
        setBusy(button, false);
    }
});

$$('[data-template-default]').forEach((button) => button.addEventListener('click', async () => {
    setBusy(button, true);
    try {
        const id = button.dataset.templateDefault ? Number(button.dataset.templateDefault) : null;
        await apiPost('api/templates.php', { action: 'set_default', id });
        window.location.reload();
    } catch (error) {
        toast(error.message, { error: true });
        setBusy(button, false);
    }
}));

$$('[data-template-delete]').forEach((button) => button.addEventListener('click', async () => {
    const used = Number(button.dataset.used);
    const sure = await confirmDialog({
        title: 'Delete this design?',
        message: `“${button.dataset.name}” will be deleted.${used ? ` ${used} report(s) using it will switch back to the JT Default design — their content is not affected.` : ''}`,
        confirmLabel: 'Delete design',
        danger: true,
    });
    if (!sure) return;
    setBusy(button, true);
    try {
        await apiPost('api/templates.php', { action: 'delete', id: Number(button.dataset.templateDelete) });
        window.location.reload();
    } catch (error) {
        toast(error.message, { error: true });
        setBusy(button, false);
    }
}));
