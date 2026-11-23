<?php

declare(strict_types=1);

/*
 * Pictures for one page of an exact-copy template (Admin only).
 * multipart: id, page (1-based), picture, thumb, bg, image_<iN>, mask_<iN>
 * Only files the stored layout expects are accepted.
 */

const IS_API = true;
require __DIR__ . '/../../app/bootstrap.php';

require_method('POST');
$admin = require_admin();
if (empty($_POST) && empty($_FILES) && (int) ($_SERVER['CONTENT_LENGTH'] ?? 0) > 0) {
    json_error('This page’s pictures are too large to upload.', 413);
}
verify_csrf();

$id = filter_var($_POST['id'] ?? null, FILTER_VALIDATE_INT);
$template = $id ? template_by_id($id) : null;
$layout = $template ? template_layout($template) : null;
if (!$layout) {
    json_error('Template not found.', 404);
}
$number = filter_var($_POST['page'] ?? null, FILTER_VALIDATE_INT);
if ($number === false || $number < 1 || $number > count($layout['pages'])) {
    json_error('Unknown page.', 422);
}
$page = $layout['pages'][$number - 1];

// field name => [stored file name, allowed mime types]
$wanted = [
    'picture' => ["page-{$number}.jpg", ['image/jpeg']],
    'thumb' => ["thumb-{$number}.jpg", ['image/jpeg']],
    'bg' => ["p{$number}-bg.{$page['bg']}", [$page['bg'] === 'png' ? 'image/png' : 'image/jpeg']],
];
foreach ($page['images'] as $image) {
    $wanted['image_' . $image['id']] = ["p{$number}-{$image['id']}.{$image['ext']}", [$image['ext'] === 'png' ? 'image/png' : 'image/jpeg']];
    if ($image['mask']) {
        $wanted['mask_' . $image['id']] = ["p{$number}-{$image['id']}-mask.png", ['image/png']];
    }
}

$dir = template_dir((int) $template['id']);
ensure_dir($dir);
$saved = 0;
foreach ($wanted as $field => [$fileName, $types]) {
    if (!isset($_FILES[$field])) {
        continue;
    }
    try {
        $file = validate_image_upload($_FILES[$field]);
    } catch (InvalidArgumentException $error) {
        json_error("Page {$number}: " . $error->getMessage(), 422);
    }
    if (!in_array($file['mime'], $types, true)) {
        json_error("Page {$number}: unexpected picture type.", 422);
    }
    if (!move_uploaded_file($file['tmp'], $dir . '/' . $fileName)) {
        json_error("Page {$number}: a picture could not be saved.", 500);
    }
    $saved++;
}

json_ok(['saved' => $saved, 'missing' => count(layout_missing_files((int) $template['id'], $layout))]);
