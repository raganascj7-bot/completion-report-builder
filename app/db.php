<?php

declare(strict_types=1);

/**
 * The one database connection for the whole request.
 * Every query in the app goes through db() with prepared statements.
 */
function db(): PDO
{
    static $pdo = null;
    if ($pdo instanceof PDO) {
        return $pdo;
    }

    $options = [
        PDO::ATTR_ERRMODE            => PDO::ERRMODE_EXCEPTION,
        PDO::ATTR_DEFAULT_FETCH_MODE => PDO::FETCH_ASSOC,
        PDO::ATTR_EMULATE_PREPARES   => false,
    ];

    // DB_DSN is optional and only meant for automated tests.
    $dsn = (string) config('DB_DSN', '');
    if ($dsn !== '') {
        $pdo = new PDO($dsn, null, null, $options);
        return $pdo;
    }

    $dsn = sprintf(
        'mysql:host=%s;port=%d;dbname=%s;charset=utf8mb4',
        config('DB_HOST', 'localhost'),
        config_int('DB_PORT', 3306),
        config('DB_NAME', 'jt_reports')
    );
    $pdo = new PDO($dsn, (string) config('DB_USER', 'root'), (string) config('DB_PASS', ''), $options);
    return $pdo;
}

/** Current time as a DATETIME string, so SQL never depends on NOW(). */
function now(): string
{
    return date('Y-m-d H:i:s');
}

function db_one(string $sql, array $params = []): ?array
{
    $statement = db()->prepare($sql);
    $statement->execute($params);
    $row = $statement->fetch();
    return $row === false ? null : $row;
}

function db_all(string $sql, array $params = []): array
{
    $statement = db()->prepare($sql);
    $statement->execute($params);
    return $statement->fetchAll();
}

/** Runs INSERT/UPDATE/DELETE and returns the number of affected rows. */
function db_run(string $sql, array $params = []): int
{
    $statement = db()->prepare($sql);
    $statement->execute($params);
    return $statement->rowCount();
}
