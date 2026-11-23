<?php

declare(strict_types=1);

const IS_API = true;
require __DIR__ . '/../../app/bootstrap.php';

require_method('POST');
$user = require_login();
verify_csrf();
$body = read_json_body();

$report = report_by_uid((string) ($body['uid'] ?? ''));
if (!$report) {
    json_error('This report no longer exists.', 404);
}
if (!is_array($body['data'] ?? null)) {
    json_error('The report data is missing.', 422);
}

$reportId = (int) $report['id'];
$version = filter_var($body['version'] ?? null, FILTER_VALIDATE_INT);
$force = ($body['force'] ?? false) === true;
$status = in_array($body['status'] ?? '', ['draft', 'final'], true) ? $body['status'] : $report['status'];

$data = normalize_report_data($body['data'], report_image_ids($reportId));

// Design: keep the current one unless the request names another ready design (null = JT default).
$templateId = $report['template_id'] !== null ? (int) $report['template_id'] : null;
if (array_key_exists('templateId', $body)) {
    $requested = $body['templateId'] === null ? null : filter_var($body['templateId'], FILTER_VALIDATE_INT);
    if ($requested === false) {
        json_error('Unknown design.', 422);
    }
    if ($requested !== null) {
        $template = template_by_id($requested);
        if (!$template || $template['status'] !== 'ready') {
            json_error('That design is not available.', 422);
        }
    }
    $templateId = $requested;
}
$json = json_encode($data, JSON_UNESCAPED_UNICODE | JSON_UNESCAPED_SLASHES);
$time = now();

// Optimistic locking: only save if nobody else saved since this browser loaded.
if ($force) {
    db_run(
        'UPDATE reports SET data = ?, status = ?, template_id = ?, version = version + 1, updated_by = ?, updated_at = ? WHERE id = ?',
        [$json, $status, $templateId, $user['id'], $time, $reportId]
    );
} else {
    if ($version === false) {
        json_error('The report version is missing. Refresh the page.', 422);
    }
    $changed = db_run(
        'UPDATE reports SET data = ?, status = ?, template_id = ?, version = version + 1, updated_by = ?, updated_at = ? WHERE id = ? AND version = ?',
        [$json, $status, $templateId, $user['id'], $time, $reportId, $version]
    );
    if ($changed === 0) {
        $current = db_one(
            'SELECT r.version, r.updated_at, u.name FROM reports r JOIN users u ON u.id = r.updated_by WHERE r.id = ?',
            [$reportId]
        );
        json_error('Someone else saved this report while you were editing.', 409, [
            'currentVersion' => (int) ($current['version'] ?? 0),
            'updatedBy' => $current['name'] ?? '',
            'updatedAt' => $current['updated_at'] ?? '',
        ]);
    }
}

delete_unused_report_images($reportId, referenced_image_ids($data));
$saved = db_one('SELECT version, updated_at FROM reports WHERE id = ?', [$reportId]);

json_ok(['version' => (int) $saved['version'], 'updatedAt' => $saved['updated_at'], 'status' => $status]);
