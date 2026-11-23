<?php

declare(strict_types=1);

const IS_API = true;
require __DIR__ . '/../../app/bootstrap.php';

require_method('POST');
$user = require_login();
verify_csrf();
$body = read_json_body();

$source = report_by_uid((string) ($body['uid'] ?? ''));
if (!$source) {
    json_error('The report to copy was not found.', 404);
}
$month = filter_var($body['month'] ?? null, FILTER_VALIDATE_INT, ['options' => ['min_range' => 1, 'max_range' => 12]]);
$year = filter_var($body['year'] ?? null, FILTER_VALIDATE_INT, ['options' => ['min_range' => 2020, 'max_range' => 2100]]);
if ($month === false || $year === false) {
    json_error('Choose a valid month and year.', 422);
}
if ($source['client_id'] !== null) {
    $existing = db_one(
        'SELECT report_uid FROM reports WHERE client_id = ? AND month = ? AND year = ?',
        [$source['client_id'], $month, $year]
    );
    if ($existing) {
        json_error('A report for this client and month already exists.', 409, ['uid' => $existing['report_uid']]);
    }
}

$sourceData = json_decode((string) $source['data'], true);
$sourceData = normalize_report_data(is_array($sourceData) ? $sourceData : [], report_image_ids((int) $source['id']));

$uid = new_report_uid();
$pdo = db();
$pdo->beginTransaction();
try {
    db_run(
        'INSERT INTO reports (report_uid, client_id, client_name, month, year, status, template_id, version, data, created_by, updated_by, created_at, updated_at)
         VALUES (?, ?, ?, ?, ?, ?, ?, 1, ?, ?, ?, ?, ?)',
        [$uid, $source['client_id'], $source['client_name'], $month, $year, 'draft', $source['template_id'], '{}', $user['id'], $user['id'], now(), now()]
    );
    $reportId = (int) $pdo->lastInsertId();

    $data = duplicate_report_data($sourceData, $month, $year);
    // The cover and office photos usually stay the same month to month.
    foreach (['cover', 'contact'] as $section) {
        $ref = $sourceData[$section]['image'] ?? null;
        $data[$section]['image'] = null;
        if ($ref) {
            $row = db_one('SELECT * FROM report_images WHERE id = ? AND report_id = ?', [$ref['imageId'], $source['id']]);
            $newId = $row ? copy_file_into_report(report_image_path($row), $reportId, $user['id']) : null;
            $data[$section]['image'] = $newId ? ['imageId' => $newId, 'caption' => $ref['caption']] : null;
        }
    }
    // Exact-copy pages: same pages and texts; monthly picture slots start empty, kept photos are copied.
    if (isset($data['layout'])) {
        $template = $source['template_id'] !== null ? template_by_id((int) $source['template_id']) : null;
        $data['layout'] = duplicate_report_layout($data['layout'], $template ? template_layout($template) : null);
        foreach ($data['layout']['pages'] as &$page) {
            $images = [];
            foreach ((array) $page['images'] as $key => $ref) {
                $ref = (array) $ref;
                $row = db_one('SELECT * FROM report_images WHERE id = ? AND report_id = ?', [$ref['imageId'], $source['id']]);
                $newId = $row ? copy_file_into_report(report_image_path($row), $reportId, $user['id']) : null;
                if ($newId) {
                    $images[$key] = ['imageId' => $newId, 'fit' => $ref['fit'] ?? 'cover'];
                }
            }
            $page['images'] = $images;
        }
        unset($page);
        $data = json_decode(json_encode($data), true);
    }
    $data = normalize_report_data($data, report_image_ids($reportId));
    db_run('UPDATE reports SET data = ? WHERE id = ?', [json_encode($data, JSON_UNESCAPED_UNICODE | JSON_UNESCAPED_SLASHES), $reportId]);
    $pdo->commit();
} catch (Throwable $error) {
    $pdo->rollBack();
    if (isset($reportId)) {
        delete_report_folder($reportId);
    }
    throw $error;
}

json_ok(['uid' => $uid], 201);
