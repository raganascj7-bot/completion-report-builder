<?php

declare(strict_types=1);

const IS_API = true;
require __DIR__ . '/../../app/bootstrap.php';

require_method('POST');
$user = require_login();
verify_csrf();
$body = read_json_body();

$clientId = filter_var($body['clientId'] ?? null, FILTER_VALIDATE_INT);
$month = filter_var($body['month'] ?? null, FILTER_VALIDATE_INT, ['options' => ['min_range' => 1, 'max_range' => 12]]);
$year = filter_var($body['year'] ?? null, FILTER_VALIDATE_INT, ['options' => ['min_range' => 2020, 'max_range' => 2100]]);

$client = $clientId ? client_by_id($clientId) : null;
if (!$client || (int) $client['is_active'] !== 1) {
    json_error('Choose a client.', 422);
}
if ($month === false || $year === false) {
    json_error('Choose a valid month and year.', 422);
}

$existing = db_one(
    'SELECT report_uid FROM reports WHERE client_id = ? AND month = ? AND year = ?',
    [$clientId, $month, $year]
);
if ($existing && empty($body['allowDuplicate'])) {
    json_error('A report for this client and month already exists.', 409, ['uid' => $existing['report_uid']]);
}

$settings = agency_settings();
$uid = new_report_uid();
$pdo = db();
$pdo->beginTransaction();
try {
    db_run(
        'INSERT INTO reports (report_uid, client_id, client_name, month, year, status, template_id, version, data, created_by, updated_by, created_at, updated_at)
         VALUES (?, ?, ?, ?, ?, ?, ?, 1, ?, ?, ?, ?, ?)',
        [$uid, $clientId, $client['name'], $month, $year, 'draft', template_for_new_report($client), '{}', $user['id'], $user['id'], now(), now()]
    );
    $reportId = (int) $pdo->lastInsertId();

    $data = new_report_data($month, $year, $client, $settings);
    $templateId = template_for_new_report($client);
    $layout = $templateId ? template_layout(template_by_id($templateId)) : null;
    if ($layout) {
        $data['layout'] = fresh_report_layout($layout, $templateId);
    }
    foreach (['cover' => 'cover_image_file', 'contact' => 'office_image_file'] as $section => $column) {
        if (!empty($settings[$column])) {
            $imageId = copy_file_into_report(agency_upload_dir() . '/' . basename((string) $settings[$column]), $reportId, $user['id']);
            $data[$section]['image'] = $imageId ? ['imageId' => $imageId, 'caption' => ''] : null;
        }
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
