/**
 * The Share window, used on Reports, in the builder and on Templates.
 * Any button with data-share-type ("report" | "template"), data-share-id and
 * data-share-title opens it. People get an email (when email is set up) and
 * see the item under "Shared with me".
 */
import { $, esc } from './dom.js';
import { apiPost } from './api.js';
import { toast, setBusy } from './ui.js';

function dialogHtml(title, type) {
    return `<div class="stack">
        <h2>Share ${type === 'template' ? 'template' : 'report'}</h2>
        <p class="muted small">“${esc(title)}”. ${type === 'template'
            ? 'The people you choose can open and edit this template.'
            : 'It appears under “Shared with me” for the people you choose, with your note.'}</p>
        <div data-share-body><p class="muted small">Loading…</p></div>
    </div>`;
}

function bodyHtml(state, type) {
    const shared = new Set(state.shares.map((share) => share.userId));
    const people = state.people.filter((person) => !shared.has(person.id));
    const current = state.shares.length
        ? `<p class="design-subhead">Shared with</p><ul class="share-list">${state.shares.map((share) => `
            <li><span><strong>${esc(share.name)}</strong> <span class="muted small">${esc(share.email)}</span>
                <span class="muted small">· by ${esc(share.sharedBy)}${share.seen ? ' · opened' : ''}</span>
                ${share.note ? `<span class="share-note">${esc(share.note)}</span>` : ''}</span>
                <button type="button" class="btn btn-ghost btn-sm" data-share-remove="${share.userId}">Remove</button></li>`).join('')}</ul>`
        : '';
    const choose = people.length
        ? `<fieldset class="share-people"><legend>Share with</legend>${people.map((person) => `
            <label class="checkbox"><input type="checkbox" value="${person.id}" data-share-person> ${esc(person.name)}
                <span class="muted small">${esc(person.email)}${person.role === 'admin' ? ' · Admin' : ''}</span></label>`).join('')}</fieldset>
            <label>Note <span class="muted small">(optional)</span>
                <textarea rows="3" maxlength="500" data-share-note placeholder="e.g. Please add the TikTok screenshots by Friday."></textarea></label>
            <p class="hint">${state.mailEnabled ? 'They also get an email with a link.' : 'Email is not set up, so they will see it when they sign in.'}</p>`
        : `<p class="muted small">${type === 'template' ? 'There are no Editors to share with (Admins can already edit every template).' : 'Everyone on the team already has it.'}</p>`;
    return `${current}${choose}
        <p class="form-error" data-form-error hidden></p>
        <div class="modal-actions">
            <button type="button" class="btn btn-ghost" data-share-close>Close</button>
            ${people.length ? '<button type="button" class="btn btn-primary" data-share-send>Share</button>' : ''}
        </div>`;
}

export async function openShareDialog({ type, id, title }) {
    const dialog = document.createElement('dialog');
    dialog.className = 'modal';
    dialog.innerHTML = dialogHtml(title, type);
    document.body.append(dialog);
    dialog.addEventListener('close', () => dialog.remove());
    dialog.showModal();

    const body = $('[data-share-body]', dialog);
    const show = (state) => { body.innerHTML = bodyHtml(state, type); };
    try {
        show(await apiPost('api/shares.php', { action: 'list', type, id }));
    } catch (error) {
        body.innerHTML = `<div class="alert alert-error">${esc(error.message)}</div>`;
        return;
    }

    dialog.addEventListener('click', async (event) => {
        if (event.target.closest('[data-share-close]')) {
            dialog.close();
            return;
        }
        const remove = event.target.closest('[data-share-remove]');
        if (remove) {
            setBusy(remove, true);
            try {
                show(await apiPost('api/shares.php', { action: 'remove', type, id, userId: Number(remove.dataset.shareRemove) }));
            } catch (error) {
                toast(error.message, { error: true });
                setBusy(remove, false);
            }
            return;
        }
        const send = event.target.closest('[data-share-send]');
        if (send) {
            const userIds = [...dialog.querySelectorAll('[data-share-person]:checked')].map((box) => Number(box.value));
            const error = $('[data-form-error]', dialog);
            if (!userIds.length) {
                error.hidden = false;
                error.textContent = 'Choose at least one person.';
                return;
            }
            setBusy(send, true);
            try {
                const state = await apiPost('api/shares.php', { action: 'add', type, id, userIds, note: $('[data-share-note]', dialog).value });
                show(state);
                toast(state.emailed ? `Shared and emailed (${state.emailed}).` : 'Shared. They will see it under “Shared with me”.');
            } catch (failure) {
                error.hidden = false;
                error.textContent = failure.message;
                setBusy(send, false);
            }
        }
    });
}

/** Opens the Share window from any [data-share-type] button on the page. */
export function wireShareButtons(root = document) {
    root.addEventListener('click', (event) => {
        const button = event.target.closest('[data-share-type]');
        if (!button) return;
        openShareDialog({ type: button.dataset.shareType, id: button.dataset.shareId, title: button.dataset.shareTitle });
    });
}
