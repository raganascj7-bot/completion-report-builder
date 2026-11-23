<?php

declare(strict_types=1);

const IS_API = true;
require __DIR__ . '/../../app/bootstrap.php';

require_method('GET');
require_login();

$report = report_by_uid((string) ($_GET['uid'] ?? ''));
if (!$report) {
    json_error('Report not found.', 404);
}

$data = json_decode((string) $report['data'], true);
$data = normalize_report_data(is_array($data) ? $data : [], report_image_ids((int) $report['id']));
$updatedBy = db_one('SELECT name FROM users WHERE id = ?', [$report['updated_by']]);

json_ok([
    'report' => report_summary_row($report) + ['updatedByName' => $updatedBy['name'] ?? ''],
    'data' => $data,
    'images' => (object) report_images_meta((int) $report['id']),
    'design' => report_design($report['template_id'] !== null ? (int) $report['template_id'] : null),
    'designs' => ready_templates(),
]);
