<?php

declare(strict_types=1);

/* A design's theme for the builder or the editor. ?id=3  (no id = the built-in JT design) */

const IS_API = true;
require __DIR__ . '/../../app/bootstrap.php';

require_method('GET');
require_login();

$id = filter_var($_GET['id'] ?? null, FILTER_VALIDATE_INT);
if (!$id) {
    json_ok(['id' => null, 'name' => 'JT Default (TOLE)', 'status' => 'ready', 'theme' => default_theme(), 'logoUrl' => '']);
}
$template = template_by_id($id);
if (!$template) {
    json_error('Design not found.', 404);
}
json_ok(template_payload($template, isset($_GET['pages'])));
