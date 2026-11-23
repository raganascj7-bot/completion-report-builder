<?php

declare(strict_types=1);

const IS_API = true;
require __DIR__ . '/../../app/bootstrap.php';

require_method('GET');
require_login();
session_write_close(); // let several images load at the same time

$path = null;
$mime = null;

if (isset($_GET['agency'])) {
    $kind = $_GET['agency'] === 'office' ? 'office' : 'cover';
    $file = agency_settings()[$kind . '_image_file'] ?? null;
    if ($file) {
        $path = agency_upload_dir() . '/' . basename((string) $file);
    }
} else {
    $id = filter_var($_GET['id'] ?? null, FILTER_VALIDATE_INT);
    $row = $id ? db_one('SELECT * FROM report_images WHERE id = ?', [$id]) : null;
    if ($row) {
        $path = report_image_path($row);
        $mime = $row['mime'];
    }
}

if (!$path || !is_file($path)) {
    http_response_code(404);
    exit;
}

$mime ??= (new finfo(FILEINFO_MIME_TYPE))->file($path) ?: 'application/octet-stream';
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
header('Content-Disposition: inline');
readfile($path);
