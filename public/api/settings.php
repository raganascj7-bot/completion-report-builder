<?php

declare(strict_types=1);

const IS_API = true;
require __DIR__ . '/../../app/bootstrap.php';

require_method('POST');
$admin = require_admin();

// Photo upload (multipart form) — kind = cover | office
if (isset($_POST['kind']) || !empty($_FILES)) {
    verify_csrf();
    $kind = ($_POST['kind'] ?? '') === 'office' ? 'office' : 'cover';
    try {
        $image = validate_image_upload($_FILES['image'] ?? null);
    } catch (InvalidArgumentException $error) {
        json_error($error->getMessage(), 422);
    }
    ensure_dir(agency_upload_dir());
    $fileName = $kind . '-' . random_token(8) . '.' . $image['ext'];
    if (!move_uploaded_file($image['tmp'], agency_upload_dir() . '/' . $fileName)) {
        json_error('Could not save the image.', 500);
    }
    $column = $kind . '_image_file';
    $old = agency_settings()[$column] ?? null;
    db_run("UPDATE agency_settings SET {$column} = ?, updated_by = ?, updated_at = ? WHERE id = 1", [$fileName, $admin['id'], now()]);
    if ($old) {
        @unlink(agency_upload_dir() . '/' . basename((string) $old));
    }
    json_ok(['url' => 'api/image.php?agency=' . $kind . '&v=' . time()]);
}

verify_csrf();
$body = read_json_body();

$limits = [
    'contractor_name' => 150, 'contractor_address' => 300, 'prepared_by_name' => 150, 'prepared_by_company' => 150,
    'closing_note' => 500, 'viber_name' => 100, 'viber_number' => 50, 'email' => 150, 'website' => 150, 'location' => 200,
];
$values = [];
foreach ($limits as $field => $max) {
    $values[$field] = clean_text($body[$field] ?? '', $max);
}
if ($values['email'] !== '' && !valid_email($values['email'])) {
    json_error('Enter a valid email address.', 422, ['field' => 'email']);
}

$assignments = implode(', ', array_map(static fn($field) => "{$field} = ?", array_keys($values)));
db_run(
    "UPDATE agency_settings SET {$assignments}, updated_by = ?, updated_at = ? WHERE id = 1",
    [...array_values($values), $admin['id'], now()]
);

json_ok(['saved' => true]);
