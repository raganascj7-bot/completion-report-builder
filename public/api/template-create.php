<?php

declare(strict_types=1);

/*
 * Creates a draft template from an uploaded example report.
 * The browser has already turned the PDF into page pictures (pdf.js), so
 * the server only stores and checks files — no PDF tools are needed here.
 *
 * multipart: name, theme (JSON starter theme), palette (JSON measured colours),
 *            notes (JSON list), analyzedBy (pdf | colors),
 *            pages[] (JPEG page pictures, 1–8), source (optional original PDF)
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
    json_error('Give the design a name.', 422, ['field' => 'name']);
}

// Page pictures (required).
$pages = [];
$files = $_FILES['pages'] ?? null;
$count = is_array($files['tmp_name'] ?? null) ? count($files['tmp_name']) : 0;
if ($count < 1) {
    json_error('No pages were received. Choose the PDF again.', 422);
}
if ($count > TEMPLATE_MAX_PAGES) {
    json_error('Send at most ' . TEMPLATE_MAX_PAGES . ' pages.', 422);
}
for ($i = 0; $i < $count; $i++) {
    $one = [
        'name' => $files['name'][$i] ?? '', 'type' => $files['type'][$i] ?? '', 'tmp_name' => $files['tmp_name'][$i] ?? '',
        'error' => $files['error'][$i] ?? UPLOAD_ERR_NO_FILE, 'size' => $files['size'][$i] ?? 0,
    ];
    try {
        $page = validate_image_upload($one);
    } catch (InvalidArgumentException $error) {
        json_error('Page ' . ($i + 1) . ': ' . $error->getMessage(), 422);
    }
    // The browser converts every page to JPEG before sending it.
    if ($page['mime'] !== 'image/jpeg') {
        json_error('Page ' . ($i + 1) . ' must be a JPEG picture.', 422);
    }
    $pages[] = $page;
}

// Original PDF (optional, kept for reference).
$source = $_FILES['source'] ?? null;
$hasSource = is_array($source) && ($source['error'] ?? UPLOAD_ERR_NO_FILE) === UPLOAD_ERR_OK;
if ($hasSource) {
    $mime = (new finfo(FILEINFO_MIME_TYPE))->file((string) $source['tmp_name']) ?: '';
    if ($mime !== 'application/pdf' || !is_uploaded_file((string) $source['tmp_name'])) {
        json_error('The original file must be a PDF.', 422);
    }
    if ((int) $source['size'] > upload_limit_bytes()) {
        json_error('The PDF is larger than ' . config_int('UPLOAD_MAX_MB', 10) . ' MB.', 413);
    }
}

$theme = normalize_theme(json_decode((string) ($_POST['theme'] ?? ''), true));
$palette = [];
foreach (array_slice(json_decode((string) ($_POST['palette'] ?? '[]'), true) ?: [], 0, 12) as $swatch) {
    if (is_array($swatch) && is_string($swatch['hex'] ?? null) && preg_match('/^#[0-9a-f]{6}$/i', $swatch['hex'])) {
        $palette[] = ['hex' => strtolower($swatch['hex']), 'share' => round((float) ($swatch['share'] ?? 0), 3)];
    }
}

// What the browser learned and how (text read from the PDF, or colours only).
$analyzedBy = ($_POST['analyzedBy'] ?? '') === 'pdf' ? 'pdf' : 'colors';
$notes = [];
foreach (array_slice(json_decode((string) ($_POST['notes'] ?? '[]'), true) ?: [], 0, 8) as $note) {
    $text = clean_line($note, 300);
    if ($text !== '') {
        $notes[] = $text;
    }
}
if (!$notes) {
    $notes[] = 'Colours were measured from the pages. Check the layouts and headings.';
}

$sourceName = $hasSource ? clean_line(basename((string) $source['name']), 255) : clean_line(basename((string) ($files['name'][0] ?? '')), 255);

$pdo = db();
$pdo->beginTransaction();
try {
    db_run(
        'INSERT INTO templates (name, status, theme, source_name, analyzed_by, analysis_notes, created_by, updated_by, created_at, updated_at)
         VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?)',
        [$name, 'draft', json_encode($theme, JSON_UNESCAPED_UNICODE | JSON_UNESCAPED_SLASHES), $sourceName,
            $analyzedBy, implode("\n", $notes), $admin['id'], $admin['id'], now(), now()]
    );
    $id = (int) $pdo->lastInsertId();
    $dir = template_dir($id);
    ensure_dir($dir);

    foreach ($pages as $index => $page) {
        if (!move_uploaded_file($page['tmp'], $dir . '/page-' . ($index + 1) . '.jpg')) {
            throw new RuntimeException('Could not save a page picture.');
        }
    }
    if ($hasSource && !move_uploaded_file((string) $source['tmp_name'], $dir . '/source.pdf')) {
        throw new RuntimeException('Could not save the PDF.');
    }
    file_put_contents($dir . '/palette.json', json_encode($palette));
    if ($analyzedBy === 'pdf') {
        // Text, fonts and title style read straight from the PDF are exact; keep them so a later AI analysis can't override them.
        file_put_contents($dir . '/read.json', json_encode(pdf_read_facts($theme), JSON_UNESCAPED_UNICODE | JSON_UNESCAPED_SLASHES));
    }
    $pdo->commit();
} catch (Throwable $error) {
    $pdo->rollBack();
    if (isset($id)) {
        delete_template_files($id);
    }
    throw $error;
}

json_ok(['id' => $id, 'aiEnabled' => ai_enabled()], 201);
