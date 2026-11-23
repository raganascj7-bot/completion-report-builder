<?php

declare(strict_types=1);

/** URL of a file in public/assets with a cache-busting version. */
function asset(string $path): string
{
    $file = APP_ROOT . '/public/assets/' . $path;
    $version = is_file($file) ? (string) filemtime($file) : '1';
    return 'assets/' . $path . '?v=' . $version;
}

function logo_mark_svg(string $class = 'logo-mark'): string
{
    return '<svg class="' . e($class) . '" viewBox="180 66 225 172" aria-hidden="true" focusable="false">'
        . '<g fill="currentColor"><rect x="184" y="71" width="215" height="37"/>'
        . '<circle cx="208" cy="209" r="24"/><path d="M240 121h42v67c0 25-18 42-42 45z"/>'
        . '<rect x="311" y="121" width="42" height="64"/><circle cx="332" cy="209" r="24"/></g></svg>';
}

/**
 * Opens an app page: <head>, top bar and navigation.
 * $active is the nav key to highlight; $bodyClass adds a class to <body>.
 */
function page_top(string $title, string $active = '', string $bodyClass = ''): void
{
    $user = current_user();
    $nav = [
        'reports' => ['Reports', 'reports.php', false],
        'clients' => ['Clients', 'clients.php', true],
        'templates' => ['Templates', 'templates.php', true],
        'team' => ['Team', 'team.php', true],
        'settings' => ['Agency settings', 'settings.php', true],
    ];
    ?>
<!DOCTYPE html>
<html lang="en">
<head>
    <meta charset="UTF-8">
    <meta name="viewport" content="width=device-width, initial-scale=1">
    <meta name="csrf-token" content="<?= e(csrf_token()) ?>">
    <title><?= e($title) ?> · <?= e(config('APP_NAME', 'Completion Report Builder')) ?></title>
    <link rel="icon" href="assets/img/favicon.svg" type="image/svg+xml">
    <link rel="stylesheet" href="<?= e(asset('css/base.css')) ?>">
    <link rel="stylesheet" href="<?= e(asset('css/app.css')) ?>">
    <?php if (in_array($bodyClass, ['builder-page', 'design-page'], true)): ?>
    <link rel="stylesheet" href="<?= e(asset('css/report.css')) ?>">
    <?php endif; ?>
</head>
<body class="<?= e($bodyClass) ?>">
<a class="skip-link" href="#main">Skip to content</a>
<header class="topbar">
    <a class="brand" href="reports.php" aria-label="Completion Report Builder home">
        <?= logo_mark_svg() ?>
        <span class="brand-text">Completion Report Builder</span>
    </a>
    <?php if ($user): ?>
    <nav class="mainnav" aria-label="Main">
        <?php foreach ($nav as $key => [$label, $href, $adminOnly]): ?>
            <?php if ($adminOnly && $user['role'] !== 'admin') { continue; } ?>
            <a href="<?= e($href) ?>" class="<?= $active === $key ? 'active' : '' ?>"<?= $active === $key ? ' aria-current="page"' : '' ?>><?= e($label) ?></a>
        <?php endforeach; ?>
    </nav>
    <div class="usermenu">
        <a href="account.php" class="user-chip<?= $active === 'account' ? ' active' : '' ?>" title="My account">
            <span class="user-name"><?= e($user['name']) ?></span>
            <span class="user-role"><?= $user['role'] === 'admin' ? 'Admin' : 'Editor' ?></span>
        </a>
        <form method="post" action="logout.php">
            <?= csrf_field() ?>
            <button type="submit" class="btn btn-ghost btn-sm">Log out</button>
        </form>
    </div>
    <?php endif; ?>
</header>
<?php foreach (take_flashes() as $flash): ?>
    <div class="flash flash-<?= e($flash['type']) ?>" role="status"><?= e($flash['message']) ?></div>
<?php endforeach; ?>
<?php
}

/** Closes the page and loads the given ES module scripts. */
function page_bottom(array $modules = []): void
{
    ?>
<div class="toast" id="toast" role="status" aria-live="polite"></div>
<?php foreach ($modules as $module): ?>
<script type="module" src="<?= e(asset($module)) ?>"></script>
<?php endforeach; ?>
</body>
</html>
<?php
}

/** Minimal layout for the sign-in and setup screens. */
function auth_page_top(string $title): void
{
    ?>
<!DOCTYPE html>
<html lang="en">
<head>
    <meta charset="UTF-8">
    <meta name="viewport" content="width=device-width, initial-scale=1">
    <title><?= e($title) ?> · <?= e(config('APP_NAME', 'Completion Report Builder')) ?></title>
    <link rel="icon" href="assets/img/favicon.svg" type="image/svg+xml">
    <link rel="stylesheet" href="<?= e(asset('css/base.css')) ?>">
    <link rel="stylesheet" href="<?= e(asset('css/app.css')) ?>">
</head>
<body class="auth-body">
<main class="auth-page" id="main">
    <section class="auth-brand" aria-hidden="true">
        <div class="auth-logo"><?= logo_mark_svg('auth-mark') ?><span>DIGITAL<br>MARKETING<br>SERVICES</span></div>
        <h1>Completion<br>Report <span class="lime">Builder</span></h1>
        <p>Monthly client completion reports for JT Digital Marketing Services.</p>
        <div class="auth-arc"></div>
    </section>
    <section class="auth-card">
<?php
}

function auth_page_bottom(): void
{
    ?>
    </section>
</main>
</body>
</html>
<?php
}
