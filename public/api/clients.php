<?php

declare(strict_types=1);

const IS_API = true;
require __DIR__ . '/../../app/bootstrap.php';

require_method('POST');
require_admin();
verify_csrf();
$body = read_json_body();
$action = (string) ($body['action'] ?? '');

function find_client(mixed $id): array
{
    $id = filter_var($id, FILTER_VALIDATE_INT);
    $client = $id ? client_by_id($id) : null;
    if (!$client) {
        json_error('Client not found.', 404);
    }
    return $client;
}

function client_fields(array $body, ?int $exceptId = null): array
{
    $name = clean_line($body['name'] ?? '', 150);
    if ($name === '') {
        json_error('Enter the client’s name.', 422, ['field' => 'name']);
    }
    $taken = db_one('SELECT id FROM clients WHERE name = ?' . ($exceptId ? ' AND id <> ?' : ''), $exceptId ? [$name, $exceptId] : [$name]);
    if ($taken) {
        json_error('A client with that name already exists.', 422, ['field' => 'name']);
    }
    $templateId = null;
    if (!empty($body['templateId'])) {
        $templateId = filter_var($body['templateId'], FILTER_VALIDATE_INT) ?: null;
        $template = $templateId ? template_by_id($templateId) : null;
        if (!$template || $template['status'] !== 'ready') {
            json_error('That design is not available.', 422, ['field' => 'templateId']);
        }
    }
    return [
        'name' => $name,
        'cover_display' => clean_text($body['coverDisplay'] ?? '', 200),
        'approver_name' => clean_line($body['approverName'] ?? '', 150),
        'approver_position' => clean_line($body['approverPosition'] ?? '', 200),
        'approver_department' => clean_line($body['approverDepartment'] ?? '', 200),
        'project_names' => clean_text($body['projectNames'] ?? '', 1000),
        'project_description' => clean_text($body['projectDescription'] ?? '', 3000),
        'template_id' => $templateId,
    ];
}

switch ($action) {
    case 'create':
        $fields = client_fields($body);
        db_run(
            'INSERT INTO clients (name, cover_display, approver_name, approver_position, approver_department, project_names, project_description, template_id, is_active, created_at, updated_at)
             VALUES (?, ?, ?, ?, ?, ?, ?, ?, 1, ?, ?)',
            [...array_values($fields), now(), now()]
        );
        json_ok(['id' => (int) db()->lastInsertId()], 201);

    case 'update':
        $client = find_client($body['id'] ?? null);
        $fields = client_fields($body, (int) $client['id']);
        db_run(
            'UPDATE clients SET name = ?, cover_display = ?, approver_name = ?, approver_position = ?, approver_department = ?,
                    project_names = ?, project_description = ?, template_id = ?, updated_at = ? WHERE id = ?',
            [...array_values($fields), now(), $client['id']]
        );
        if (!empty($body['resetPreset'])) {
            db_run('UPDATE clients SET breakdown_preset = NULL WHERE id = ?', [$client['id']]);
        }
        // Keep the name shown in report lists in step with the client.
        db_run('UPDATE reports SET client_name = ? WHERE client_id = ?', [$fields['name'], $client['id']]);
        json_ok(['updated' => true]);

    case 'save_preset':
        // Called from the builder: "Save as this client's default rows".
        $client = find_client($body['id'] ?? null);
        $rows = normalize_report_data(['breakdown' => $body['breakdown'] ?? []], [])['breakdown'];
        foreach ($rows as &$row) {
            $row['status'] = 'IN PROGRESS';
            $row['note'] = '';
        }
        unset($row);
        db_run(
            'UPDATE clients SET breakdown_preset = ?, updated_at = ? WHERE id = ?',
            [json_encode($rows, JSON_UNESCAPED_UNICODE | JSON_UNESCAPED_SLASHES), now(), $client['id']]
        );
        json_ok(['rows' => count($rows)]);

    case 'archive':
    case 'restore':
        $client = find_client($body['id'] ?? null);
        db_run('UPDATE clients SET is_active = ?, updated_at = ? WHERE id = ?', [$action === 'restore' ? 1 : 0, now(), $client['id']]);
        json_ok(['updated' => true]);

    case 'delete':
        $client = find_client($body['id'] ?? null);
        $used = (int) (db_one('SELECT COUNT(*) AS total FROM reports WHERE client_id = ?', [$client['id']])['total'] ?? 0);
        if ($used > 0) {
            json_error('This client has reports. Archive it instead, so the reports stay intact.', 422);
        }
        db_run('DELETE FROM clients WHERE id = ?', [$client['id']]);
        json_ok(['deleted' => true]);

    default:
        json_error('Unknown action.', 400);
}
