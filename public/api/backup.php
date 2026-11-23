<?php

declare(strict_types=1);

const IS_API = true;
require __DIR__ . '/../../app/bootstrap.php';

require_method('GET');
require_admin();

if (!class_exists(ZipArchive::class)) {
    json_error('This server’s PHP has no zip support. Ask the host to enable the "zip" extension.', 500);
}

@set_time_limit(300);

/** Writes every table as INSERT statements that schema.sql can receive. */
function sql_dump(): string
{
    $pdo = db();
    $out = "-- Completion Report Builder backup, " . date('c') . "\n"
        . "-- Restore: import database/schema.sql into an empty database, then import this file.\n"
        . "SET FOREIGN_KEY_CHECKS = 0;\n";
    foreach (['users', 'templates', 'clients', 'agency_settings', 'reports', 'report_images', 'ai_usage'] as $table) {
        $out .= "\nDELETE FROM `{$table}`;\n";
        $statement = $pdo->query("SELECT * FROM `{$table}`");
        while ($row = $statement->fetch(PDO::FETCH_ASSOC)) {
            $columns = '`' . implode('`, `', array_keys($row)) . '`';
            $values = implode(', ', array_map(
                static fn($value) => $value === null ? 'NULL' : $pdo->quote((string) $value),
                array_values($row)
            ));
            $out .= "INSERT INTO `{$table}` ({$columns}) VALUES ({$values});\n";
        }
    }
    return $out . "\nSET FOREIGN_KEY_CHECKS = 1;\n";
}

$zipPath = tempnam(sys_get_temp_dir(), 'crb');
$zip = new ZipArchive();
if ($zip->open($zipPath, ZipArchive::OVERWRITE) !== true) {
    json_error('Could not create the backup file.', 500);
}
$zip->addFromString('database.sql', sql_dump());

foreach (['uploads' => UPLOAD_PATH, 'templates' => STORAGE_PATH . '/templates'] as $folder => $path) {
    if (!is_dir($path)) {
        continue;
    }
    $files = new RecursiveIteratorIterator(new RecursiveDirectoryIterator($path, FilesystemIterator::SKIP_DOTS));
    foreach ($files as $file) {
        if ($file->isFile() && $file->getFilename() !== '.gitkeep') {
            $zip->addFile($file->getPathname(), $folder . '/' . ltrim(str_replace($path, '', $file->getPathname()), '/\\'));
        }
    }
}
$zip->close();

header('Content-Type: application/zip');
header('Content-Disposition: attachment; filename="completion-reports-backup-' . date('Y-m-d') . '.zip"');
header('Content-Length: ' . filesize($zipPath));
header('Cache-Control: no-store');
readfile($zipPath);
@unlink($zipPath);
