<?php

declare(strict_types=1);

/* Serves a template's pictures to signed-in users. ?id=3&file=page-1 | thumb-1 | p1-bg | p1-i4 | p1-i4-mask | logo */

const IS_API = true;
require __DIR__ . '/../../app/bootstrap.php';

require_method('GET');
require_login();
session_write_close();

$id = filter_var($_GET['id'] ?? null, FILTER_VALIDATE_INT);
$template = $id ? template_by_id($id) : null;
$file = (string) ($_GET['file'] ?? '');
$path = null;

if ($template && preg_match('/^(page|thumb)-[1-9]\d?$/', $file)) {
    $path = template_dir((int) $template['id']) . '/' . $file . '.jpg';
} elseif ($template && preg_match('/^p[1-9]\d?-(bg|i\d{1,6}(-mask)?)$/', $file)) {
    // Exact-copy files: the extension depends on the picture (png or jpg).
    foreach (['png', 'jpg'] as $extension) {
        if (is_file(template_dir((int) $template['id']) . '/' . $file . '.' . $extension)) {
            $path = template_dir((int) $template['id']) . '/' . $file . '.' . $extension;
            break;
        }
    }
} elseif ($template && $file === 'logo' && ($logo = template_logo_file($template))) {
    $path = template_dir((int) $template['id']) . '/' . $logo;
}

if (!$path || !is_file($path)) {
    http_response_code(404);
    exit;
}
$mime = (new finfo(FILEINFO_MIME_TYPE))->file($path) ?: '';
if (!isset(IMAGE_TYPES[$mime])) {
    http_response_code(404);
    exit;
}

$etag = '"' . md5($path . filemtime($path) . filesize($path)) . '"';
header('Cache-Control: private, max-age=86400');
header('ETag: ' . $etag);
if (trim((string) ($_SERVER['HTTP_IF_NONE_MATCH'] ?? '')) === $etag) {
    http_response_code(304);
    exit;
}
header('Content-Type: ' . $mime);
header('Content-Length: ' . filesize($path));
readfile($path);
