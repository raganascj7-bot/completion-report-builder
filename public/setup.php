<?php

declare(strict_types=1);

/*
 * One-time setup: creates the first Admin account.
 * It only works while the users table is empty. After that it answers
 * "not found", so it is safe to leave on the server.
 */

require __DIR__ . '/../app/bootstrap.php';

$problems = [];
try {
    $userCount = (int) (db_one('SELECT COUNT(*) AS total FROM users')['total'] ?? 0);
} catch (PDOException $error) {
    log_error('Setup could not reach the database: ' . $error->getMessage());
    $userCount = 0;
    $problems[] = 'Cannot connect to the database, or the tables are missing. Check DB_* in .env and import database/schema.sql.';
}

if ($userCount > 0) {
    abort_page(404);
}

if (!is_writable(UPLOAD_PATH)) {
    $problems[] = 'The folder storage/uploads is not writable. Give the web server write permission.';
}
if (!is_writable(STORAGE_PATH . '/logs')) {
    $problems[] = 'The folder storage/logs is not writable.';
}

$errors = [];
$values = ['name' => '', 'email' => ''];

if (($_SERVER['REQUEST_METHOD'] ?? '') === 'POST' && !$problems) {
    verify_csrf();
    $values['name'] = clean_line($_POST['name'] ?? '', 100);
    $values['email'] = mb_strtolower(clean_line($_POST['email'] ?? '', 150));
    $password = (string) ($_POST['password'] ?? '');

    if ($values['name'] === '') {
        $errors[] = 'Enter a name.';
    }
    if (!valid_email($values['email'])) {
        $errors[] = 'Enter a valid email address.';
    }
    if ($problem = password_problem($password, (string) ($_POST['password_confirm'] ?? ''))) {
        $errors[] = $problem;
    }

    if (!$errors) {
        db_run(
            'INSERT INTO users (name, email, password_hash, role, is_active, must_change_password, created_at, updated_at)
             VALUES (?, ?, ?, ?, 1, 0, ?, ?)',
            [$values['name'], $values['email'], password_hash($password, PASSWORD_DEFAULT), 'admin', now(), now()]
        );
        flash('success', 'Admin account created. Please sign in.');
        redirect('login.php');
    }
}

auth_page_top('First-time setup');
?>
<h2>First-time setup</h2>
<p class="muted">Create the Admin account for Ms. Jeah. This page disappears once an account exists.</p>

<?php foreach ($problems as $problem): ?>
    <div class="alert alert-error"><?= e($problem) ?></div>
<?php endforeach; ?>
<?php foreach ($errors as $error): ?>
    <div class="alert alert-error"><?= e($error) ?></div>
<?php endforeach; ?>

<?php if (!$problems): ?>
<form method="post" class="stack" novalidate>
    <?= csrf_field() ?>
    <label>Full name
        <input type="text" name="name" maxlength="100" required value="<?= e($values['name']) ?>" autocomplete="name">
    </label>
    <label>Email
        <input type="email" name="email" maxlength="150" required value="<?= e($values['email']) ?>" autocomplete="email">
    </label>
    <label>Password <span class="hint">at least <?= MIN_PASSWORD_LENGTH ?> characters</span>
        <input type="password" name="password" minlength="<?= MIN_PASSWORD_LENGTH ?>" required autocomplete="new-password">
    </label>
    <label>Repeat password
        <input type="password" name="password_confirm" required autocomplete="new-password">
    </label>
    <button type="submit" class="btn btn-primary btn-block">Create Admin account</button>
</form>
<?php endif; ?>
<?php
auth_page_bottom();
