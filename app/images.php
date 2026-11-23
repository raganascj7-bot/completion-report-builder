<?php

declare(strict_types=1);

/*
 * Images are stored as files outside the public folder:
 *   storage/uploads/<report id>/<random>.jpg|png|webp
 *   storage/uploads/agency/<random>.jpg|png|webp   (agency cover & office photo)
 * They are only ever served through public/api/image.php after a login check.
 */

const IMAGE_TYPES = [
    'image/jpeg' => 'jpg',
    'image/png' => 'png',
    'image/webp' => 'webp',
];

function upload_limit_bytes(): int
{
    return max(1, config_int('UPLOAD_MAX_MB', 10)) * 1024 * 1024;
}

function report_upload_dir(int $reportId): string
{
    return UPLOAD_PATH . '/' . $reportId;
}

function agency_upload_dir(): string
{
    return UPLOAD_PATH . '/agency';
}

function ensure_dir(string $dir): void
{
    if (!is_dir($dir) && !mkdir($dir, 0775, true) && !is_dir($dir)) {
        throw new RuntimeException('Could not create upload folder.');
    }
}

/**
 * Validates one entry of $_FILES and returns its facts, or throws an
 * InvalidArgumentException with a message the user can read.
 *
 * @return array{tmp: string, mime: string, ext: string, width: int, height: int, bytes: int}
 */
function validate_image_upload(mixed $file): array
{
    if (!is_array($file) || !isset($file['error']) || is_array($file['error'])) {
        throw new InvalidArgumentException('No image was received.');
    }
    $limitMb = (int) round(upload_limit_bytes() / 1024 / 1024);
    if (in_array($file['error'], [UPLOAD_ERR_INI_SIZE, UPLOAD_ERR_FORM_SIZE], true)) {
        throw new InvalidArgumentException("That image is larger than {$limitMb} MB.");
    }
    if ($file['error'] !== UPLOAD_ERR_OK || !is_uploaded_file((string) $file['tmp_name'])) {
        throw new InvalidArgumentException('The upload did not finish. Please try again.');
    }
    $bytes = (int) $file['size'];
    if ($bytes <= 0 || $bytes > upload_limit_bytes()) {
        throw new InvalidArgumentException("That image is larger than {$limitMb} MB.");
    }

    // Trust the file's real content, never its name or the browser's label.
    $mime = (new finfo(FILEINFO_MIME_TYPE))->file((string) $file['tmp_name']) ?: '';
    if (!isset(IMAGE_TYPES[$mime])) {
        throw new InvalidArgumentException('Only JPG, PNG or WebP images can be uploaded.');
    }
    $size = @getimagesize((string) $file['tmp_name']);
    if ($size === false || $size[0] < 1 || $size[1] < 1) {
        throw new InvalidArgumentException('That file is not a readable image.');
    }
    if ($size[0] > 12000 || $size[1] > 12000) {
        throw new InvalidArgumentException('That image is too large in pixels (max 12000 × 12000).');
    }

    return [
        'tmp' => (string) $file['tmp_name'],
        'mime' => $mime,
        'ext' => IMAGE_TYPES[$mime],
        'width' => (int) $size[0],
        'height' => (int) $size[1],
        'bytes' => $bytes,
    ];
}

/** Moves a validated upload into a report's folder and records it. */
function store_report_image(array $image, int $reportId, int $userId): array
{
    $dir = report_upload_dir($reportId);
    ensure_dir($dir);
    $fileName = random_token(12) . '.' . $image['ext'];
    if (!move_uploaded_file($image['tmp'], $dir . '/' . $fileName)) {
        throw new RuntimeException('Could not save the uploaded image.');
    }

    db_run(
        'INSERT INTO report_images (report_id, file_name, mime, width, height, bytes, uploaded_by, created_at)
         VALUES (?, ?, ?, ?, ?, ?, ?, ?)',
        [$reportId, $fileName, $image['mime'], $image['width'], $image['height'], $image['bytes'], $userId, now()]
    );
    $id = (int) db()->lastInsertId();

    return ['id' => $id, 'url' => 'api/image.php?id=' . $id, 'width' => $image['width'], 'height' => $image['height']];
}

/** Copies an existing file (agency photo or another report's image) into a report. */
function copy_file_into_report(string $sourcePath, int $reportId, int $userId): ?int
{
    if (!is_file($sourcePath)) {
        return null;
    }
    $mime = (new finfo(FILEINFO_MIME_TYPE))->file($sourcePath) ?: '';
    $size = @getimagesize($sourcePath);
    if (!isset(IMAGE_TYPES[$mime]) || $size === false) {
        return null;
    }
    $dir = report_upload_dir($reportId);
    ensure_dir($dir);
    $fileName = random_token(12) . '.' . IMAGE_TYPES[$mime];
    if (!copy($sourcePath, $dir . '/' . $fileName)) {
        return null;
    }
    db_run(
        'INSERT INTO report_images (report_id, file_name, mime, width, height, bytes, uploaded_by, created_at)
         VALUES (?, ?, ?, ?, ?, ?, ?, ?)',
        [$reportId, $fileName, $mime, (int) $size[0], (int) $size[1], (int) filesize($sourcePath), $userId, now()]
    );
    return (int) db()->lastInsertId();
}

function report_image_path(array $imageRow): string
{
    return report_upload_dir((int) $imageRow['report_id']) . '/' . basename((string) $imageRow['file_name']);
}

/** Removes images that a report no longer uses and that are older than an hour. */
function delete_unused_report_images(int $reportId, array $usedIds): void
{
    $cutoff = date('Y-m-d H:i:s', time() - 3600);
    $rows = db_all('SELECT * FROM report_images WHERE report_id = ? AND created_at < ?', [$reportId, $cutoff]);
    foreach ($rows as $row) {
        if (in_array((int) $row['id'], $usedIds, true)) {
            continue;
        }
        @unlink(report_image_path($row));
        db_run('DELETE FROM report_images WHERE id = ?', [$row['id']]);
    }
}

function delete_report_folder(int $reportId): void
{
    $dir = report_upload_dir($reportId);
    if (!is_dir($dir)) {
        return;
    }
    foreach (glob($dir . '/*') ?: [] as $file) {
        @unlink($file);
    }
    @rmdir($dir);
}
