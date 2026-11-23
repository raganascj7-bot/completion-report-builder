import { $, $$, formData } from '../lib/dom.js';
import { apiPost } from '../lib/api.js';
import { toast, openModal, closeModal, wireModals, confirmDialog, setBusy, showFormError } from '../lib/ui.js';

wireModals();

const form = $('#userForm');
const title = $('#userModalTitle');

function showInvitation(result) {
    const dialog = $('#inviteModal');
    $('[data-invite-sent]', dialog).hidden = !result.emailSent;
    $('[data-invite-manual]', dialog).hidden = result.emailSent;
    $('[data-invite-email]', dialog).textContent = result.email;
    $('[data-invite-name]', dialog).textContent = result.name;
    $('[data-invite-reason]', dialog).textContent = result.mailEnabled
        ? 'The email could not be sent right now.'
        : 'Email sending is not set up yet.';
    $('[data-invite-link]', dialog).textContent = result.inviteLink;
    openModal('inviteModal');
}

function showTemporaryPassword(name, password) {
    const dialog = $('#passwordModal');
    $('[data-password-name]', dialog).textContent = name;
    $('[data-password-value]', dialog).textContent = password;
    openModal('passwordModal');
}

$('[data-user-new]')?.addEventListener('click', () => {
    form.reset();
    form.elements.id.value = '';
    title.textContent = 'Add team member';
    showFormError(form, null);
});

$$('[data-user-edit]').forEach((button) => button.addEventListener('click', () => {
    const user = JSON.parse(button.dataset.userEdit);
    form.reset();
    form.elements.id.value = String(user.id);
    form.elements.name.value = user.name;
    form.elements.email.value = user.email;
    form.elements.role.value = user.role;
    title.textContent = `Edit ${user.name}`;
    showFormError(form, null);
    openModal('userModal');
}));

form.addEventListener('submit', async (event) => {
    event.preventDefault();
    const values = formData(form);
    const button = $('[type="submit"]', form);
    showFormError(form, null);
    setBusy(button, true);
    try {
        if (values.id) {
            await apiPost('api/users.php', { action: 'update', ...values, id: Number(values.id) });
            window.location.reload();
        } else {
            const result = await apiPost('api/users.php', { action: 'create', ...values });
            closeModal('userModal');
            showInvitation(result);
        }
    } catch (error) {
        showFormError(form, error.message);
        if (error.body?.field) form.elements[error.body.field]?.focus();
    } finally {
        setBusy(button, false);
    }
});

const ACTIONS = {
    invite: { title: 'Send a new invitation?', message: (n) => `${n} gets a new link to set a password. The old link stops working.`, label: 'Send invitation' },
    reset: { title: 'Reset password?', message: (n) => `${n} will get a new temporary password and must change it at the next sign-in.`, label: 'Reset password' },
    deactivate: { title: 'Deactivate account?', message: (n) => `${n} will no longer be able to sign in. Their reports stay.`, label: 'Deactivate', danger: true },
    activate: { title: 'Reactivate account?', message: (n) => `${n} will be able to sign in again.`, label: 'Reactivate' },
};

$$('[data-user-action]').forEach((button) => button.addEventListener('click', async () => {
    const action = button.dataset.userAction;
    const copy = ACTIONS[action];
    const sure = await confirmDialog({
        title: copy.title, message: copy.message(button.dataset.name), confirmLabel: copy.label, danger: copy.danger,
    });
    if (!sure) return;
    setBusy(button, true);
    try {
        const result = await apiPost('api/users.php', { action, id: Number(button.dataset.id) });
        if (action === 'reset') showTemporaryPassword(result.name, result.temporaryPassword);
        else if (action === 'invite') showInvitation(result);
        else window.location.reload();
    } catch (error) {
        toast(error.message, { error: true });
    } finally {
        setBusy(button, false);
    }
}));

$('[data-copy-password]')?.addEventListener('click', async () => {
    try {
        await navigator.clipboard.writeText($('[data-password-value]').textContent);
        toast('Password copied');
    } catch {
        toast('Copy failed — select the password and copy it manually.', { error: true });
    }
});

$('[data-copy-invite]')?.addEventListener('click', async () => {
    try {
        await navigator.clipboard.writeText($('[data-invite-link]').textContent);
        toast('Invitation link copied');
    } catch {
        toast('Copy failed — select the link and copy it manually.', { error: true });
    }
});

$('#passwordModal')?.addEventListener('close', () => window.location.reload());
$('#inviteModal')?.addEventListener('close', () => window.location.reload());
