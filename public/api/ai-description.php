<?php

declare(strict_types=1);

const IS_API = true;
require __DIR__ . '/../../app/bootstrap.php';

require_method('POST');
$user = require_login();
verify_csrf();
$body = read_json_body();

$friendly = 'AI is unavailable right now. Please write the description yourself.';

if (!ai_enabled()) {
    json_error('AI drafting is turned off on this server.', 503);
}
$report = report_by_uid((string) ($body['uid'] ?? ''));
if (!$report) {
    json_error('Report not found.', 404);
}
$limit = config_int('AI_DAILY_LIMIT_PER_USER', 20);
if (ai_requests_today($user['id']) >= $limit) {
    json_error("You’ve used today’s {$limit} AI drafts. Please write it yourself or try again tomorrow.", 429);
}

// Use what is on screen now (it may not be saved yet), cleaned like a save.
$data = normalize_report_data(is_array($body['data'] ?? null) ? $body['data'] : [], report_image_ids((int) $report['id']));
$facts = ai_report_facts($data, (string) $report['client_name'], (int) $report['month'], (int) $report['year']);

try {
    $result = ai_draft_description($facts);
} catch (RuntimeException $error) {
    log_error('AI draft failed: ' . $error->getMessage(), ['report' => $report['report_uid']]);
    ai_log_usage($user['id'], (int) $report['id'], 0, 0, false);
    json_error($friendly, 502);
}

ai_log_usage($user['id'], (int) $report['id'], $result['input_tokens'], $result['output_tokens'], true);
json_ok(['text' => $result['text']]);
