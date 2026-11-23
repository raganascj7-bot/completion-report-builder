<?php

declare(strict_types=1);

require __DIR__ . '/../app/bootstrap.php';

$user = require_login();
$errors = [];

if (($_SERVER['REQUEST_METHOD'] ?? '') === 'POST') {
    verify_csrf();
    $current = (string) ($_POST['current_password'] ?? '');
    $new = (string) ($_POST['new_password'] ?? '');
    $confirm = (string) ($_POST['new_password_confirm'] ?? '');

    $row = db_one('SELECT password_hash FROM users WHERE id = ?', [$user['id']]);
    if (!$row || !password_verify($current, (string) $row['password_hash'])) {
        $errors[] = 'Your current password is not correct.';
    } elseif ($problem = password_problem($new, $confirm)) {
        $errors[] = $problem;
    } elseif (hash_equals($current, $new)) {
        $errors[] = 'Choose a password that is different from the current one.';
    }

    if (!$errors) {
        db_run(
            'UPDATE users SET password_hash = ?, must_change_password = 0, updated_at = ? WHERE id = ?',
            [password_hash($new, PASSWORD_DEFAULT), now(), $user['id']]
        );
        session_regenerate_id(true);
        flash('success', 'Your password has been changed.');
        redirect('reports.php');
    }
}

page_top('My account', 'account');
?>
<main class="page narrow" id="main">
    <h1>My account</h1>
    <?php if ($user['must_change_password']): ?>
        <div class="alert alert-info">Welcome! Please replace the temporary password you were given before you continue.</div>
    <?php endif; ?>
    <?php foreach ($errors as $error): ?>
        <div class="alert alert-error" role="alert"><?= e($error) ?></div>
    <?php endforeach; ?>

    <section class="card">
        <dl class="details">
            <dt>Name</dt><dd><?= e($user['name']) ?></dd>
            <dt>Email</dt><dd><?= e($user['email']) ?></dd>
            <dt>Role</dt><dd><?= $user['role'] === 'admin' ? 'Admin' : 'Editor' ?></dd>
        </dl>
    </section>

    <section class="card">
        <h2>Change password</h2>
        <form method="post" class="stack" novalidate>
            <?= csrf_field() ?>
            <label><?= $user['must_change_password'] ? 'Temporary password' : 'Current password' ?>
                <input type="password" name="current_password" required autocomplete="current-password">
            </label>
            <label>New password <span class="hint">at least <?= MIN_PASSWORD_LENGTH ?> characters</span>
                <input type="password" name="new_password" minlength="<?= MIN_PASSWORD_LENGTH ?>" required autocomplete="new-password">
            </label>
            <label>Repeat new password
                <input type="password" name="new_password_confirm" required autocomplete="new-password">
            </label>
            <div><button type="submit" class="btn btn-primary">Save new password</button></div>
        </form>
    </section>
</main>
<?php
page_bottom();
