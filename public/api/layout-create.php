<?php

declare(strict_types=1);

/*
 * Creates a draft exact-copy template from the browser's reading of a PDF.
 * The page pictures follow one page at a time (api/layout-assets.php), so no
 * single request gets large.
 *
 * multipart: name, layout (JSON, see normalize_layout), notes (JSON list), source (the PDF)
 */

const IS_API = true;
require __DIR__ . '/../../app/bootstrap.php';

require_method('POST');
$admin = require_admin();
if (empty($_POST) && empty($_FILES) && (int) ($_SERVER['CONTENT_LENGTH'] ?? 0) > 0) {
    json_error('The upload is too large. Use a PDF under ' . config_int('UPLOAD_MAX_MB', 10) . ' MB.', 413);
}
verify_csrf();

$name = clean_line($_POST['name'] ?? '', 120);
if ($name === '') {
    json_error('Give the template a name.', 422, ['field' => 'name']);
}
$layout = normalize_layout(json_decode((string) ($_POST['layout'] ?? ''), true));
if (!$layout['pages']) {
    json_error('No pages were read from the PDF. Choose the file again.', 422);
}

$source = $_FILES['source'] ?? null;
if (!is_array($source) || ($source['error'] ?? UPLOAD_ERR_NO_FILE) !== UPLOAD_ERR_OK || !is_uploaded_file((string) $source['tmp_name'])) {
    json_error('The PDF did not arrive. Choose it again.', 422);
}
if ((new finfo(FILEINFO_MIME_TYPE))->file((string) $source['tmp_name']) !== 'application/pdf') {
    json_error('The file must be a PDF.', 422);
}
if ((int) $source['size'] > upload_limit_bytes()) {
    json_error('The PDF is larger than ' . config_int('UPLOAD_MAX_MB', 10) . ' MB.', 413);
}

$notes = [];
foreach (array_slice(json_decode((string) ($_POST['notes'] ?? '[]'), true) ?: [], 0, 8) as $note) {
    $text = clean_line($note, 300);
    if ($text !== '') {
        $notes[] = $text;
    }
}

$pdo = db();
$pdo->beginTransaction();
try {
    db_run(
        'INSERT INTO templates (name, status, kind, theme, source_name, analyzed_by, analysis_notes, created_by, updated_by, created_at, updated_at)
         VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)',
        [$name, 'draft', 'layout', json_encode(default_theme(), JSON_UNESCAPED_UNICODE | JSON_UNESCAPED_SLASHES),
            clean_line(basename((string) $source['name']), 255), 'pdf', implode("\n", $notes), $admin['id'], $admin['id'], now(), now()]
    );
    $id = (int) $pdo->lastInsertId();
    save_template_layout($id, $layout);
    if (!move_uploaded_file((string) $source['tmp_name'], template_dir($id) . '/source.pdf')) {
        throw new RuntimeException('Could not save the PDF.');
    }
    $pdo->commit();
} catch (Throwable $error) {
    $pdo->rollBack();
    if (isset($id)) {
        delete_template_files($id);
    }
    throw $error;
}

json_ok(['id' => $id, 'pages' => count($layout['pages']), 'aiEnabled' => ai_enabled()], 201);
