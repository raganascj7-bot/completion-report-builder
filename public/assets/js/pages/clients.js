import { $, $$, formData } from '../lib/dom.js';
import { apiPost } from '../lib/api.js';
import { toast, openModal, wireModals, confirmDialog, setBusy, showFormError } from '../lib/ui.js';

wireModals();

const form = $('#clientForm');
const title = $('#clientModalTitle');
const resetPreset = $('[data-reset-preset]', form);

$('[data-client-new]')?.addEventListener('click', () => {
    form.reset();
    form.elements.id.value = '';
    title.textContent = 'Add client';
    resetPreset.hidden = true;
    showFormError(form, null);
    openModal('clientModal');
});

$$('[data-client-edit]').forEach((button) => button.addEventListener('click', () => {
    const client = JSON.parse(button.dataset.clientEdit);
    form.reset();
    form.elements.id.value = String(client.id);
    for (const key of ['name', 'coverDisplay', 'approverName', 'approverPosition', 'approverDepartment', 'projectNames', 'projectDescription']) {
        form.elements[key].value = client[key] ?? '';
    }
    if (form.elements.templateId) form.elements.templateId.value = client.templateId ? String(client.templateId) : '';
    resetPreset.hidden = !client.hasPreset;
    title.textContent = `Edit ${client.name}`;
    showFormError(form, null);
    openModal('clientModal');
}));

form.addEventListener('submit', async (event) => {
    event.preventDefault();
    const values = formData(form);
    const button = $('[type="submit"]', form);
    setBusy(button, true);
    showFormError(form, null);
    try {
        await apiPost('api/clients.php', {
            action: values.id ? 'update' : 'create',
            ...values,
            id: values.id ? Number(values.id) : undefined,
            resetPreset: values.resetPreset === '1',
            templateId: values.templateId ? Number(values.templateId) : null,
        });
        window.location.reload();
    } catch (error) {
        showFormError(form, error.message);
        if (error.body?.field) form.elements[error.body.field]?.focus();
        setBusy(button, false);
    }
});

const ACTIONS = {
    archive: { title: 'Archive client?', message: (n) => `${n} will be hidden from “New report”. Existing reports stay.`, label: 'Archive' },
    restore: { title: 'Restore client?', message: (n) => `${n} will be available for new reports again.`, label: 'Restore' },
    delete: { title: 'Delete client?', message: (n) => `${n} will be deleted permanently.`, label: 'Delete', danger: true },
};

$$('[data-client-action]').forEach((button) => button.addEventListener('click', async () => {
    const action = button.dataset.clientAction;
    const copy = ACTIONS[action];
    const sure = await confirmDialog({
        title: copy.title, message: copy.message(button.dataset.name), confirmLabel: copy.label, danger: copy.danger,
    });
    if (!sure) return;
    setBusy(button, true);
    try {
        await apiPost('api/clients.php', { action, id: Number(button.dataset.id) });
        window.location.reload();
    } catch (error) {
        toast(error.message, { error: true });
        setBusy(button, false);
    }
}));
