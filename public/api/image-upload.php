<?php

declare(strict_types=1);

const IS_API = true;
require __DIR__ . '/../../app/bootstrap.php';

require_method('POST');
$user = require_login();

// A file bigger than post_max_size arrives as an empty request.
if (empty($_POST) && empty($_FILES) && (int) ($_SERVER['CONTENT_LENGTH'] ?? 0) > 0) {
    json_error('That image is larger than ' . config_int('UPLOAD_MAX_MB', 10) . ' MB.', 413);
}
verify_csrf();

$report = report_by_uid((string) ($_POST['uid'] ?? ''));
if (!$report) {
    json_error('This report no longer exists.', 404);
}
$count = (int) (db_one('SELECT COUNT(*) AS total FROM report_images WHERE report_id = ?', [$report['id']])['total'] ?? 0);
if ($count >= 400) {
    json_error('This report already has 400 images, which is the limit.', 422);
}

try {
    $image = validate_image_upload($_FILES['image'] ?? null);
} catch (InvalidArgumentException $error) {
    json_error($error->getMessage(), 422);
}

json_ok(store_report_image($image, (int) $report['id'], $user['id']), 201);
