<?php

declare(strict_types=1);

const IS_API = true;
require __DIR__ . '/../../app/bootstrap.php';

require_method('POST');
require_admin();
verify_csrf();
$body = read_json_body();

$report = report_by_uid((string) ($body['uid'] ?? ''));
if (!$report) {
    json_error('Report not found.', 404);
}

// report_images rows go with the report (ON DELETE CASCADE); remove the files too.
db_run('DELETE FROM report_images WHERE report_id = ?', [$report['id']]);
delete_shares('report', (int) $report['id']);
db_run('DELETE FROM reports WHERE id = ?', [$report['id']]);
delete_report_folder((int) $report['id']);

json_ok(['deleted' => true]);
