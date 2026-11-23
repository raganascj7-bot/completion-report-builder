import { $, $$, formData } from '../lib/dom.js';
import { apiPost, apiUpload } from '../lib/api.js';
import { toast, setBusy, showFormError } from '../lib/ui.js';
import { prepareImage } from '../builder/image-prep.js';

const form = $('#settingsForm');

form.addEventListener('submit', async (event) => {
    event.preventDefault();
    const button = $('[type="submit"]', form);
    setBusy(button, true);
    showFormError(form, null);
    try {
        await apiPost('api/settings.php', formData(form));
        toast('Settings saved. New reports will use them.');
    } catch (error) {
        showFormError(form, error.message);
    } finally {
        setBusy(button, false);
    }
});

$$('[data-photo-input]').forEach((input) => input.addEventListener('change', async () => {
    const kind = input.dataset.photoInput;
    const file = input.files?.[0];
    input.value = '';
    if (!file) return;
    try {
        const prepared = await prepareImage(file);
        const upload = new FormData();
        upload.append('kind', kind);
        upload.append('image', prepared, prepared.name);
        toast('Uploading…');
        const result = await apiUpload('api/settings.php', upload);
        const img = $(`[data-photo-preview="${kind}"]`);
        img.src = result.url;
        img.hidden = false;
        $(`[data-photo-empty="${kind}"]`).hidden = true;
        toast('Photo saved. New reports will use it.');
    } catch (error) {
        toast(error.message, { error: true });
    }
}));
