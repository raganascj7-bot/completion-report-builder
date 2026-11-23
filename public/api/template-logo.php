<?php

declare(strict_types=1);

/* Uploads a design's own logo (multipart: id, image). Admin, or an Editor the template was shared with. */

const IS_API = true;
require __DIR__ . '/../../app/bootstrap.php';

require_method('POST');
$admin = require_login();
verify_csrf();

$id = filter_var($_POST['id'] ?? null, FILTER_VALIDATE_INT);
$template = $id ? template_by_id($id) : null;
if (!$template) {
    json_error('Design not found.', 404);
}
if (!can_edit_template($admin, (int) $template['id'])) {
    json_error('Only an Admin, or someone this template was shared with, can change it.', 403);
}
try {
    $image = validate_image_upload($_FILES['image'] ?? null);
} catch (InvalidArgumentException $error) {
    json_error($error->getMessage(), 422);
}
if ($image['bytes'] > 2 * 1024 * 1024) {
    json_error('Use a logo under 2 MB.', 422);
}

$dir = template_dir((int) $template['id']);
ensure_dir($dir);
if ($old = template_logo_file($template)) {
    @unlink($dir . '/' . $old);
}
$fileName = 'logo-' . random_token(4) . '.' . $image['ext'];
if (!move_uploaded_file($image['tmp'], $dir . '/' . $fileName)) {
    json_error('Could not save the logo.', 500);
}

$theme = normalize_theme(json_decode((string) $template['theme'], true));
$theme['brand']['logo'] = 'custom';
db_run(
    'UPDATE templates SET logo_file = ?, theme = ?, updated_by = ?, updated_at = ? WHERE id = ?',
    [$fileName, json_encode($theme, JSON_UNESCAPED_UNICODE | JSON_UNESCAPED_SLASHES), $admin['id'], now(), $template['id']]
);

json_ok(template_payload(template_by_id((int) $template['id'])));
