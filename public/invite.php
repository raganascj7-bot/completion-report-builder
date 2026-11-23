<?php

declare(strict_types=1);

/* Invitation link from the email: the new member chooses a password and is signed in. */

require __DIR__ . '/../app/bootstrap.php';

$token = (string) ($_GET['token'] ?? $_POST['token'] ?? '');
$member = find_invitation($token);
$error = null;

if ($member && ($_SERVER['REQUEST_METHOD'] ?? '') === 'POST') {
    verify_csrf();
    $password = (string) ($_POST['password'] ?? '');
    $confirm = (string) ($_POST['password_confirm'] ?? '');
    $error = password_problem($password, $confirm);
    if (!$error) {
        accept_invitation($member, $password);
        login_user(db_one('SELECT * FROM users WHERE id = ?', [$member['id']]));
        flash('success', 'Welcome, ' . $member['name'] . '! Your password is set.');
        redirect('reports.php');
    }
}

auth_page_top('Set your password');
if (!$member): ?>
    <h2>This link no longer works</h2>
    <p class="muted">Invitation links work once and for <?= INVITE_HOURS ?> hours. Ask your Admin to send a new invitation from the Team page.</p>
    <p><a class="btn btn-secondary" href="login.php">Go to sign in</a></p>
<?php else: ?>
    <h2>Welcome, <?= e($member['name']) ?></h2>
    <p class="muted">Choose a password for <strong><?= e($member['email']) ?></strong>. You’ll use it to sign in from now on.</p>
    <?php if ($error): ?>
        <div class="alert alert-error" role="alert"><?= e($error) ?></div>
    <?php endif; ?>
    <form method="post" class="stack" novalidate>
        <?= csrf_field() ?>
        <input type="hidden" name="token" value="<?= e($token) ?>">
        <label>New password
            <span class="password-field">
                <input type="password" name="password" id="password" maxlength="200" autocomplete="new-password" required autofocus>
                <button type="button" class="btn btn-ghost btn-sm" data-toggle-password="password" aria-controls="password" aria-pressed="false">Show</button>
            </span>
            <span class="hint">At least 8 characters.</span>
        </label>
        <label>Type it again
            <input type="password" name="password_confirm" maxlength="200" autocomplete="new-password" required>
        </label>
        <button type="submit" class="btn btn-primary btn-block">Set password and sign in</button>
    </form>
    <script src="<?= e(asset('js/pages/password-toggle.js')) ?>" defer></script>
<?php endif;
auth_page_bottom();
