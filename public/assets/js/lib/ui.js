/** Toasts, modals and busy buttons shared by every page. */
import { $, $$, esc } from './dom.js';

let toastTimer;

export function toast(message, { error = false, duration = 3200 } = {}) {
    const box = $('#toast');
    if (!box) return;
    box.textContent = message;
    box.classList.toggle('error', error);
    box.classList.add('show');
    clearTimeout(toastTimer);
    toastTimer = setTimeout(() => box.classList.remove('show'), duration);
}

export function openModal(id) {
    const dialog = document.getElementById(id);
    if (dialog && !dialog.open) dialog.showModal();
    return dialog;
}

export function closeModal(dialogOrId) {
    const dialog = typeof dialogOrId === 'string' ? document.getElementById(dialogOrId) : dialogOrId;
    if (dialog?.open) dialog.close();
}

/** Buttons with data-open-modal="id" open it; data-close-modal closes the nearest dialog. */
export function wireModals(root = document) {
    $$('[data-open-modal]', root).forEach((button) =>
        button.addEventListener('click', () => openModal(button.dataset.openModal)));
    $$('[data-close-modal]', root).forEach((button) =>
        button.addEventListener('click', () => closeModal(button.closest('dialog'))));
    // Clicking the dark backdrop closes a dialog.
    $$('dialog.modal', root).forEach((dialog) =>
        dialog.addEventListener('click', (event) => { if (event.target === dialog) dialog.close(); }));
}

/** A promise-based replacement for window.confirm(). Resolves true or false. */
export function confirmDialog({ title, message, confirmLabel = 'Confirm', danger = false }) {
    return new Promise((resolve) => {
        const dialog = document.createElement('dialog');
        dialog.className = 'modal';
        dialog.innerHTML = `
            <div class="stack">
                <h2>${esc(title)}</h2>
                <p>${esc(message)}</p>
                <div class="modal-actions">
                    <button type="button" class="btn btn-ghost" data-answer="no">Cancel</button>
                    <button type="button" class="btn ${danger ? 'btn-danger' : 'btn-primary'}" data-answer="yes">${esc(confirmLabel)}</button>
                </div>
            </div>`;
        document.body.append(dialog);
        const finish = (answer) => {
            dialog.close();
            dialog.remove();
            resolve(answer);
        };
        dialog.addEventListener('click', (event) => {
            const answer = event.target.closest('[data-answer]')?.dataset.answer;
            if (answer) finish(answer === 'yes');
            else if (event.target === dialog) finish(false);
        });
        dialog.addEventListener('cancel', (event) => { event.preventDefault(); finish(false); });
        dialog.showModal();
        $('[data-answer="yes"]', dialog).focus();
    });
}

export function setBusy(button, busy) {
    if (!button) return;
    button.disabled = busy;
    button.classList.toggle('is-busy', busy);
    button.setAttribute('aria-busy', String(busy));
}

/** Shows a form-level error inside a dialog form (or hides it). */
export function showFormError(form, message) {
    const box = $('[data-form-error]', form);
    if (!box) {
        if (message) toast(message, { error: true });
        return;
    }
    box.textContent = message ?? '';
    box.hidden = !message;
}
