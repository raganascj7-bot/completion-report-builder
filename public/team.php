<?php

declare(strict_types=1);

require __DIR__ . '/../app/bootstrap.php';

$admin = require_admin();
$users = db_all('SELECT id, name, email, role, is_active, must_change_password, last_login_at, invite_token_hash, invite_expires_at, invited_at
                 FROM users ORDER BY is_active DESC, name');
$mailOn = mail_enabled();

page_top('Team', 'team');
?>
<main class="page" id="main">
    <div class="page-head">
        <div>
            <h1>Team</h1>
            <p class="muted">Only the Admin can add people. <?= $mailOn
                ? 'New members get an email with a link to choose their own password.'
                : 'New members get an invitation link to choose their own password — copy it and send it to them (email sending is not set up yet; see the README).' ?></p>
        </div>
        <button type="button" class="btn btn-primary" data-open-modal="userModal" data-user-new>+ Add team member</button>
    </div>

    <div class="table-wrap">
        <table class="data-table">
            <thead><tr><th>Name</th><th>Email</th><th>Role</th><th>Status</th><th>Last sign-in</th><th class="actions-col"><span class="visually-hidden">Actions</span></th></tr></thead>
            <tbody>
            <?php foreach ($users as $member): ?>
                <?php $isSelf = (int) $member['id'] === $admin['id']; ?>
                <tr class="<?= (int) $member['is_active'] === 1 ? '' : 'row-muted' ?>">
                    <td><?= e($member['name']) ?><?= $isSelf ? ' <span class="muted">(you)</span>' : '' ?></td>
                    <td><?= e($member['email']) ?></td>
                    <td><?= $member['role'] === 'admin' ? 'Admin' : 'Editor' ?></td>
                    <td>
                        <?php $invited = $member['invite_token_hash'] !== null; $expired = $invited && strtotime((string) $member['invite_expires_at']) < time(); ?>
                        <?php if ((int) $member['is_active'] !== 1): ?>
                            <span class="pill pill-muted">Deactivated</span>
                        <?php elseif ($invited && $expired): ?>
                            <span class="pill pill-muted">Invitation expired</span>
                        <?php elseif ($invited): ?>
                            <span class="pill pill-draft" title="Invited <?= e(date('M j, g:i A', strtotime((string) $member['invited_at']))) ?>">Invited — waiting</span>
                        <?php elseif ((int) $member['must_change_password'] === 1): ?>
                            <span class="pill pill-draft">Awaiting first sign-in</span>
                        <?php else: ?>
                            <span class="pill pill-final">Active</span>
                        <?php endif; ?>
                    </td>
                    <td><?= $member['last_login_at'] ? e(date('M j, Y g:i A', strtotime((string) $member['last_login_at']))) : '<span class="muted">Never</span>' ?></td>
                    <td class="actions-col">
                        <button type="button" class="btn btn-ghost btn-sm" data-user-edit='<?= e(json_encode([
                            'id' => (int) $member['id'], 'name' => $member['name'], 'email' => $member['email'], 'role' => $member['role'],
                        ])) ?>'>Edit</button>
                        <?php if (!$isSelf): ?>
                            <?php if ($invited && (int) $member['is_active'] === 1): ?>
                                <button type="button" class="btn btn-ghost btn-sm" data-user-action="invite" data-id="<?= (int) $member['id'] ?>" data-name="<?= e($member['name']) ?>">Resend invitation</button>
                            <?php else: ?>
                                <button type="button" class="btn btn-ghost btn-sm" data-user-action="reset" data-id="<?= (int) $member['id'] ?>" data-name="<?= e($member['name']) ?>">Reset password</button>
                            <?php endif; ?>
                            <?php if ((int) $member['is_active'] === 1): ?>
                                <button type="button" class="btn btn-danger-ghost btn-sm" data-user-action="deactivate" data-id="<?= (int) $member['id'] ?>" data-name="<?= e($member['name']) ?>">Deactivate</button>
                            <?php else: ?>
                                <button type="button" class="btn btn-ghost btn-sm" data-user-action="activate" data-id="<?= (int) $member['id'] ?>" data-name="<?= e($member['name']) ?>">Reactivate</button>
                            <?php endif; ?>
                        <?php endif; ?>
                    </td>
                </tr>
            <?php endforeach; ?>
            </tbody>
        </table>
    </div>
</main>

<dialog class="modal" id="userModal" aria-labelledby="userModalTitle">
    <form class="stack" id="userForm" novalidate>
        <h2 id="userModalTitle">Add team member</h2>
        <input type="hidden" name="id">
        <label>Full name
            <input type="text" name="name" maxlength="100" required autocomplete="off">
        </label>
        <label>Email
            <input type="email" name="email" maxlength="150" required autocomplete="off">
        </label>
        <label>Role
            <select name="role">
                <option value="editor">Editor — builds and exports reports</option>
                <option value="admin">Admin — also manages team, clients and settings</option>
            </select>
        </label>
        <p class="form-error" data-form-error hidden></p>
        <div class="modal-actions">
            <button type="button" class="btn btn-ghost" data-close-modal>Cancel</button>
            <button type="submit" class="btn btn-primary">Save</button>
        </div>
    </form>
</dialog>

<dialog class="modal" id="inviteModal" aria-labelledby="inviteModalTitle">
    <div class="stack">
        <h2 id="inviteModalTitle">Invitation ready</h2>
        <div class="alert alert-success" data-invite-sent hidden>We emailed an invitation to <strong data-invite-email></strong>. The link works for 48 hours.</div>
        <div class="alert alert-info" data-invite-manual hidden><span data-invite-reason></span> Copy this link and send it to <strong data-invite-name></strong>
            by private message. It works once, for 48 hours.</div>
        <p class="invite-link" data-invite-link></p>
        <div class="modal-actions">
            <button type="button" class="btn btn-ghost" data-copy-invite>Copy link</button>
            <button type="button" class="btn btn-primary" data-close-modal>Done</button>
        </div>
    </div>
</dialog>

<dialog class="modal" id="passwordModal" aria-labelledby="passwordModalTitle">
    <div class="stack">
        <h2 id="passwordModalTitle">Temporary password</h2>
        <p>Give this password to <strong data-password-name></strong> in person or by private message. It is shown only once.</p>
        <p class="temp-password" data-password-value></p>
        <div class="modal-actions">
            <button type="button" class="btn btn-ghost" data-copy-password>Copy</button>
            <button type="button" class="btn btn-primary" data-close-modal data-reload>Done</button>
        </div>
    </div>
</dialog>
<?php
page_bottom(['js/pages/team.js']);
