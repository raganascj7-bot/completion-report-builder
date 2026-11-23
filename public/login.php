<?php

declare(strict_types=1);

require __DIR__ . '/../app/bootstrap.php';

$next = safe_next($_GET['next'] ?? $_POST['next'] ?? null);

if (current_user()) {
    redirect($next);
}

$error = null;
$email = '';

if (($_SERVER['REQUEST_METHOD'] ?? '') === 'POST') {
    verify_csrf();
    $email = mb_strtolower(trim((string) ($_POST['email'] ?? '')));
    $password = (string) ($_POST['password'] ?? '');

    if ($email === '' || $password === '') {
        $error = 'Please enter your email and password.';
    } else {
        $result = attempt_login(mb_substr($email, 0, 150), mb_substr($password, 0, 200));
        if ($result['user']) {
            login_user($result['user']);
            redirect((int) $result['user']['must_change_password'] === 1 ? 'account.php' : $next);
        }
        $error = $result['error'];
    }
}

auth_page_top('Sign in');
?>
<h2>Welcome back</h2>
<p class="muted">Sign in to build and export your client completion reports.</p>

<?php foreach (take_flashes() as $flash): ?>
    <div class="alert alert-<?= e($flash['type']) ?>"><?= e($flash['message']) ?></div>
<?php endforeach; ?>
<?php if (isset($_GET['bye'])): ?>
    <div class="alert alert-success">You have been logged out.</div>
<?php endif; ?>
<?php if ($error): ?>
    <div class="alert alert-error" role="alert"><?= e($error) ?></div>
<?php endif; ?>

<form method="post" class="stack" novalidate>
    <?= csrf_field() ?>
    <input type="hidden" name="next" value="<?= e($next) ?>">
    <label>Work email
        <input type="email" name="email" maxlength="150" value="<?= e($email) ?>" autocomplete="username" required autofocus>
    </label>
    <label>Password
        <span class="password-field">
            <input type="password" name="password" id="password" maxlength="200" autocomplete="current-password" required>
            <button type="button" class="btn btn-ghost btn-sm" data-toggle-password="password" aria-controls="password" aria-pressed="false">Show</button>
        </span>
    </label>
    <button type="submit" class="btn btn-primary btn-block">Sign in</button>
</form>
<p class="muted small">No account yet? Ask the Admin to add you.</p>
<script src="<?= e(asset('js/pages/password-toggle.js')) ?>" defer></script>
<?php
auth_page_bottom();
