<?php

declare(strict_types=1);

/**
 * Reads settings from the project's .env file once and exposes them
 * through config('KEY', default). Real environment variables win, so a
 * host that sets variables in its control panel also works.
 */
function load_env(string $path): array
{
    $values = [];
    if (!is_file($path)) {
        return $values;
    }

    foreach (file($path, FILE_IGNORE_NEW_LINES | FILE_SKIP_EMPTY_LINES) ?: [] as $line) {
        $line = trim($line);
        if ($line === '' || str_starts_with($line, '#') || !str_contains($line, '=')) {
            continue;
        }
        [$key, $value] = array_map('trim', explode('=', $line, 2));
        $length = strlen($value);
        if ($length >= 2 && ($value[0] === '"' || $value[0] === "'") && $value[$length - 1] === $value[0]) {
            $value = substr($value, 1, -1);
        }
        $values[$key] = $value;
    }

    return $values;
}

function config(string $key, mixed $default = null): mixed
{
    static $env = null;
    if ($env === null) {
        $env = load_env(APP_ROOT . '/.env');
    }

    $fromServer = getenv($key);
    if ($fromServer !== false && $fromServer !== '') {
        $value = $fromServer;
    } elseif (array_key_exists($key, $env)) {
        $value = $env[$key];
    } else {
        return $default;
    }

    $lower = strtolower((string) $value);
    if ($lower === 'true') {
        return true;
    }
    if ($lower === 'false') {
        return false;
    }
    return $value;
}

function config_int(string $key, int $default): int
{
    $value = config($key, $default);
    return is_numeric($value) ? (int) $value : $default;
}
