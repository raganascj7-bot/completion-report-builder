import { $, $$, formData } from '../lib/dom.js';
import { apiPost } from '../lib/api.js';
import { toast, openModal, wireModals, confirmDialog, setBusy } from '../lib/ui.js';
import { wireShareButtons } from '../lib/share.js';

wireModals();
wireShareButtons();

const openBuilder = (uid) => { window.location.href = `builder.php?uid=${encodeURIComponent(uid)}`; };

async function handleExisting(error) {
    if (error.status === 409 && error.body?.uid) {
        const open = await confirmDialog({
            title: 'Report already exists',
            message: 'There is already a report for this client and month. Open it instead?',
            confirmLabel: 'Open existing report',
        });
        if (open) openBuilder(error.body.uid);
        return true;
    }
    return false;
}

$('#newReportForm')?.addEventListener('submit', async (event) => {
    event.preventDefault();
    const form = event.currentTarget;
    const button = $('[type="submit"]', form);
    const values = formData(form);
    setBusy(button, true);
    try {
        const data = await apiPost('api/report-create.php', {
            clientId: Number(values.clientId), month: Number(values.month), year: Number(values.year),
        });
        openBuilder(data.uid);
    } catch (error) {
        if (!(await handleExisting(error))) toast(error.message, { error: true });
        setBusy(button, false);
    }
});

const duplicateForm = $('#duplicateForm');

$$('[data-duplicate]').forEach((button) => button.addEventListener('click', () => {
    // Suggest the month after the source report.
    let month = Number(button.dataset.month) + 1;
    let year = Number(button.dataset.year);
    if (month > 12) { month = 1; year += 1; }
    duplicateForm.elements.uid.value = button.dataset.duplicate;
    duplicateForm.elements.month.value = String(month);
    duplicateForm.elements.year.value = String(year);
    $('[data-duplicate-label]', duplicateForm).textContent = button.dataset.label;
    openModal('duplicateModal');
}));

duplicateForm?.addEventListener('submit', async (event) => {
    event.preventDefault();
    const button = $('[type="submit"]', duplicateForm);
    const values = formData(duplicateForm);
    setBusy(button, true);
    try {
        const data = await apiPost('api/report-duplicate.php', {
            uid: values.uid, month: Number(values.month), year: Number(values.year),
        });
        openBuilder(data.uid);
    } catch (error) {
        if (!(await handleExisting(error))) toast(error.message, { error: true });
        setBusy(button, false);
    }
});

$$('[data-delete]').forEach((button) => button.addEventListener('click', async () => {
    const sure = await confirmDialog({
        title: 'Delete this report?',
        message: `“${button.dataset.label}” and all its images will be deleted permanently. This cannot be undone.`,
        confirmLabel: 'Delete report',
        danger: true,
    });
    if (!sure) return;
    setBusy(button, true);
    try {
        await apiPost('api/report-delete.php', { uid: button.dataset.delete });
        button.closest('tr')?.remove();
        toast('Report deleted');
    } catch (error) {
        toast(error.message, { error: true });
        setBusy(button, false);
    }
}));
