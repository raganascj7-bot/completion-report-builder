<?php
/** @var int $status @var string $title @var string $message */
?>
<!DOCTYPE html>
<html lang="en">
<head>
    <meta charset="UTF-8">
    <meta name="viewport" content="width=device-width, initial-scale=1">
    <title><?= e($title) ?></title>
    <link rel="stylesheet" href="<?= e(asset('css/base.css')) ?>">
    <link rel="stylesheet" href="<?= e(asset('css/app.css')) ?>">
</head>
<body class="error-body">
<main class="error-card">
    <p class="error-code"><?= e((string) $status) ?></p>
    <h1><?= e($title) ?></h1>
    <p><?= e($message) ?></p>
    <a class="btn btn-primary" href="reports.php">Back to reports</a>
</main>
</body>
</html>
