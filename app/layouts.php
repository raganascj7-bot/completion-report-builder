<?php

declare(strict_types=1);

/*
 * Exact-copy templates ("layout" templates) and the report pages made from them.
 *
 * Template files: storage/templates/<id>/
 *   layout.json            texts, photos, links and page sizes (see normalize_layout)
 *   page-N.jpg             picture of page N (review screen, AI)
 *   thumb-N.jpg            small picture for page lists
 *   pN-bg.png|jpg          page N without text and photos
 *   pN-iK.png|jpg          photo K as it appears on page N
 *   pN-iK-mask.png         its shape (rounded corners, circles), when not a rectangle
 *
 * Report data keeps only what changed: data.layout.pages[] (see normalize_report_layout).
 * The browser side is assets/js/builder/layout-render.js; keep both in sync.
 */

const LAYOUT_MAX_PAGES = 30;
const LAYOUT_FONTS = ['garet', 'montserrat', 'inter', 'poppins', 'lora', 'georgia', 'arial', 'roboto', 'opensans', 'sans', 'serif', 'mono'];
const LAYOUT_FIELDS = [
    'month', 'year', 'monthYear', 'clientName', 'preparedByName', 'preparedByCompany', 'reportDate', 'startDate',
    'completionDate', 'contractorName', 'contractorAddress', 'projectNames', 'projectDescription', 'closingNote',
    'preparerName', 'preparerCompany', 'approverName', 'approverPosition', 'approverDepartment', 'contactName',
    'contactNumber', 'contactEmail', 'website', 'location',
];
const LAYOUT_IMAGE_ROLES = ['fixed', 'keep', 'slot'];
const LAYOUT_TOKEN = '/\{([a-zA-Z]+)(?::(?:upper|lower|title))?(?:@(?:long|short|numeric))?\}/';

function layout_number(mixed $value, float $min, float $max, float $default = 0.0): float
{
    $number = is_numeric($value) ? (float) $value : $default;
    return round(max($min, min($max, $number)), 2);
}

function layout_color(mixed $value): string
{
    return is_string($value) && preg_match('/^#[0-9a-f]{6}$/i', $value) ? strtolower($value) : '#111111';
}

/** Text as typed, keeping spaces inside lines; control characters removed. */
function layout_line(mixed $value, int $max): string
{
    $text = is_scalar($value) ? (string) $value : '';
    $text = preg_replace('/[\x00-\x1F\x7F]/u', '', $text) ?? '';
    return mb_substr($text, 0, $max);
}

/**
 * A pattern may only swap parts of the original text for known fields:
 * every field must be known and the fixed words must appear in the original, in order.
 */
function layout_pattern_fits(string $pattern, string $original): bool
{
    if (!preg_match_all(LAYOUT_TOKEN, $pattern, $matches)) {
        return false;
    }
    foreach ($matches[1] as $field) {
        if (!in_array($field, LAYOUT_FIELDS, true)) {
            return false;
        }
    }
    $flat = static fn(string $text) => mb_strtolower(trim(preg_replace('/\s+/u', ' ', $text) ?? ''));
    $source = $flat($original);
    $at = 0;
    foreach (preg_split(LAYOUT_TOKEN, $pattern) ?: [] as $part) {
        $part = $flat($part);
        if ($part === '') {
            continue;
        }
        $found = mb_strpos($source, $part, $at);
        if ($found === false) {
            return false;
        }
        $at = $found + mb_strlen($part);
    }
    return true;
}

/** Rebuilds a template layout from untrusted input (the upload, the review screen, the AI). */
function normalize_layout(mixed $in): array
{
    $pages = [];
    foreach (array_slice(is_array($in['pages'] ?? null) ? $in['pages'] : [], 0, LAYOUT_MAX_PAGES) as $page) {
        if (!is_array($page)) {
            continue;
        }
        $height = (int) layout_number($page['height'] ?? 1123, 200, 2400, 1123);
        $seen = [];
        $texts = [];
        foreach (array_slice(is_array($page['texts'] ?? null) ? $page['texts'] : [], 0, 400) as $text) {
            $id = is_string($text['id'] ?? null) ? $text['id'] : '';
            if (!preg_match('/^t\d{1,6}$/', $id) || isset($seen[$id])) {
                continue;
            }
            $lines = [];
            foreach (array_slice(is_array($text['lines'] ?? null) ? $text['lines'] : [], 0, 60) as $line) {
                $lines[] = layout_line($line, 500);
            }
            if (!$lines || trim(implode('', $lines)) === '') {
                continue;
            }
            $seen[$id] = true;
            $weight = (int) round(layout_number($text['weight'] ?? 400, 100, 900, 400) / 100) * 100;
            $pattern = is_string($text['pattern'] ?? null) ? mb_substr($text['pattern'], 0, 3000) : null;
            if ($pattern !== null && !layout_pattern_fits($pattern, implode("\n", $lines))) {
                $pattern = null;
            }
            $link = clean_url($text['link'] ?? '');
            $texts[] = [
                'id' => $id,
                'x' => layout_number($text['x'] ?? 0, -100, 1000),
                'y' => layout_number($text['y'] ?? 0, -100, 2500),
                'w' => layout_number($text['w'] ?? 10, 1, 1000, 10),
                'h' => layout_number($text['h'] ?? 10, 1, 2500, 10),
                'lines' => $lines,
                'font' => in_array($text['font'] ?? '', LAYOUT_FONTS, true) ? $text['font'] : 'sans',
                'fontName' => clean_line($text['fontName'] ?? '', 80),
                'weight' => $weight,
                'italic' => ($text['italic'] ?? false) === true,
                'size' => layout_number($text['size'] ?? 12, 3, 200, 12),
                'color' => layout_color($text['color'] ?? null),
                'lineHeight' => layout_number($text['lineHeight'] ?? 14, 1, 400, 14),
                'letterSpacing' => layout_number($text['letterSpacing'] ?? 0, -20, 60),
                'align' => in_array($text['align'] ?? '', ['left', 'center', 'right'], true) ? $text['align'] : 'left',
                'link' => $link !== '' ? $link : null,
                'pattern' => $pattern,
            ];
        }
        $images = [];
        foreach (array_slice(is_array($page['images'] ?? null) ? $page['images'] : [], 0, 120) as $image) {
            $id = is_string($image['id'] ?? null) ? $image['id'] : '';
            if (!preg_match('/^i\d{1,6}$/', $id) || isset($seen[$id])) {
                continue;
            }
            $seen[$id] = true;
            $images[] = [
                'id' => $id,
                'x' => layout_number($image['x'] ?? 0, -100, 1000),
                'y' => layout_number($image['y'] ?? 0, -100, 2500),
                'w' => layout_number($image['w'] ?? 10, 1, 1100, 10),
                'h' => layout_number($image['h'] ?? 10, 1, 2600, 10),
                'ext' => ($image['ext'] ?? '') === 'png' ? 'png' : 'jpg',
                'mask' => ($image['mask'] ?? false) === true,
                'role' => in_array($image['role'] ?? '', LAYOUT_IMAGE_ROLES, true) ? $image['role'] : 'keep',
            ];
        }
        $links = [];
        foreach (array_slice(is_array($page['links'] ?? null) ? $page['links'] : [], 0, 60) as $link) {
            $id = is_string($link['id'] ?? null) ? $link['id'] : '';
            $url = clean_url($link['url'] ?? '');
            if (!preg_match('/^l\d{1,6}$/', $id) || isset($seen[$id]) || $url === '') {
                continue;
            }
            $seen[$id] = true;
            $links[] = [
                'id' => $id,
                'x' => layout_number($link['x'] ?? 0, -100, 1000),
                'y' => layout_number($link['y'] ?? 0, -100, 2500),
                'w' => layout_number($link['w'] ?? 10, 1, 1000, 10),
                'h' => layout_number($link['h'] ?? 10, 1, 2500, 10),
                'url' => $url,
            ];
        }
        $pages[] = [
            'width' => 794,
            'height' => $height,
            'name' => clean_line($page['name'] ?? '', 80),
            'bg' => ($page['bg'] ?? '') === 'jpg' ? 'jpg' : 'png',
            'texts' => $texts,
            'images' => $images,
            'links' => $links,
        ];
    }
    return ['version' => 1, 'pages' => $pages];
}

function template_layout(array $template): ?array
{
    if (($template['kind'] ?? 'theme') !== 'layout') {
        return null;
    }
    $json = json_decode((string) @file_get_contents(template_dir((int) $template['id']) . '/layout.json'), true);
    return is_array($json) ? normalize_layout($json) : null;
}

function save_template_layout(int $templateId, array $layout): void
{
    $dir = template_dir($templateId);
    ensure_dir($dir);
    file_put_contents($dir . '/layout.json', json_encode($layout, JSON_UNESCAPED_UNICODE | JSON_UNESCAPED_SLASHES), LOCK_EX);
}

/** Every file a layout needs, as name → true, for checking uploads and completeness. */
function layout_expected_files(array $layout): array
{
    $files = [];
    foreach ($layout['pages'] as $index => $page) {
        $n = $index + 1;
        $files["page-{$n}.jpg"] = true;
        $files["thumb-{$n}.jpg"] = true;
        $files["p{$n}-bg.{$page['bg']}"] = true;
        foreach ($page['images'] as $image) {
            $files["p{$n}-{$image['id']}.{$image['ext']}"] = true;
            if ($image['mask']) {
                $files["p{$n}-{$image['id']}-mask.png"] = true;
            }
        }
    }
    return $files;
}

function layout_missing_files(int $templateId, array $layout): array
{
    $dir = template_dir($templateId);
    return array_values(array_filter(array_keys(layout_expected_files($layout)), static fn(string $file) => !is_file($dir . '/' . $file)));
}

/**
 * The report side: which template pages the report uses and what changed on each.
 * $pageCount = pages in the template (null when unknown: indexes are only range-checked).
 */
function normalize_report_layout(mixed $in, array $allowedImageIds, ?int $pageCount = null): ?array
{
    if (!is_array($in) || !is_array($in['pages'] ?? null)) {
        return null;
    }
    $pages = [];
    $ids = [];
    foreach (array_slice($in['pages'], 0, 60) as $page) {
        $page = is_object($page) ? (array) $page : $page;
        if (!is_array($page)) {
            continue;
        }
        foreach (['texts', 'images', 'links'] as $part) {
            if (isset($page[$part]) && is_object($page[$part])) {
                $page[$part] = (array) $page[$part];
            }
        }
        $id = is_string($page['id'] ?? null) && preg_match('/^p[a-z0-9]{1,24}$/', $page['id']) ? $page['id'] : 'p' . random_token(5);
        if (isset($ids[$id])) {
            $id = 'p' . random_token(5);
        }
        $ids[$id] = true;
        $src = filter_var($page['src'] ?? null, FILTER_VALIDATE_INT);
        if ($src === false || $src < 0 || $src >= ($pageCount ?? LAYOUT_MAX_PAGES)) {
            continue;
        }
        $texts = [];
        foreach (array_slice(is_array($page['texts'] ?? null) ? $page['texts'] : [], 0, 400, true) as $key => $value) {
            if (is_string($key) && preg_match('/^t\d{1,6}$/', $key) && is_string($value)) {
                $texts[$key] = clean_text($value, 5000);
            }
        }
        $images = [];
        foreach (array_slice(is_array($page['images'] ?? null) ? $page['images'] : [], 0, 120, true) as $key => $value) {
            $value = is_object($value) ? (array) $value : $value;
            $imageId = is_array($value) ? filter_var($value['imageId'] ?? null, FILTER_VALIDATE_INT) : false;
            if (is_string($key) && preg_match('/^i\d{1,6}$/', $key) && $imageId !== false && in_array($imageId, $allowedImageIds, true)) {
                $images[$key] = ['imageId' => $imageId, 'fit' => ($value['fit'] ?? '') === 'contain' ? 'contain' : 'cover'];
            }
        }
        $links = [];
        foreach (array_slice(is_array($page['links'] ?? null) ? $page['links'] : [], 0, 120, true) as $key => $value) {
            if (is_string($key) && preg_match('/^[tl]\d{1,6}$/', $key)) {
                $links[$key] = clean_url($value);
            }
        }
        $hidden = [];
        foreach (array_slice(is_array($page['hidden'] ?? null) ? $page['hidden'] : [], 0, 500) as $value) {
            if (is_string($value) && preg_match('/^[til]\d{1,6}$/', $value)) {
                $hidden[] = $value;
            }
        }
        // JSON objects, even when empty, so the browser always gets {} rather than [].
        $pages[] = [
            'id' => $id, 'src' => $src,
            'texts' => (object) $texts, 'images' => (object) $images, 'links' => (object) $links,
            'hidden' => array_values(array_unique($hidden)),
        ];
    }
    $templateId = filter_var($in['templateId'] ?? null, FILTER_VALIDATE_INT);
    return ['templateId' => $templateId === false ? null : $templateId, 'pages' => $pages];
}

/** Report pages for a new report: one per template page, nothing changed yet. */
function fresh_report_layout(array $templateLayout, ?int $templateId = null): array
{
    $pages = [];
    foreach (array_keys($templateLayout['pages']) as $index) {
        $pages[] = ['id' => 'p' . random_token(5), 'src' => $index, 'texts' => (object) [], 'images' => (object) [], 'links' => (object) [], 'hidden' => []];
    }
    return ['templateId' => $templateId, 'pages' => $pages];
}

/** Where the browser loads a layout template's files: append the file name. */
function layout_asset_base(array $template): string
{
    return 'api/template-file.php?id=' . (int) $template['id'] . '&v=' . strtotime((string) $template['updated_at']) . '&file=';
}

/** A report layout for the next month: same pages and texts, monthly pictures cleared. */
function duplicate_report_layout(?array $layout, ?array $template): ?array
{
    if (!$layout) {
        return null;
    }
    $roles = [];
    foreach ($template['pages'] ?? [] as $index => $page) {
        foreach ($page['images'] as $image) {
            $roles[$index][$image['id']] = $image['role'];
        }
    }
    foreach ($layout['pages'] as &$page) {
        $page['id'] = 'p' . random_token(5);
        $kept = [];
        foreach ((array) $page['images'] as $key => $value) {
            if (($roles[$page['src']][$key] ?? 'slot') !== 'slot') {
                $kept[$key] = $value;
            }
        }
        $page['images'] = (object) $kept;
        $page['texts'] = (object) (array) $page['texts'];
        $page['links'] = (object) (array) $page['links'];
    }
    unset($page);
    return $layout;
}

/**
 * Applies labels (from the review screen or the AI) to a stored layout.
 * Only names, text patterns and photo roles change; positions never do.
 * $labels = { pages: { index: { name?, texts?: {id: pattern|null}, images?: {id: role} } } }
 * Returns [layout, number of changes accepted].
 */
function apply_layout_labels(array $layout, mixed $labels): array
{
    $changes = 0;
    foreach (is_array($labels['pages'] ?? null) ? $labels['pages'] : [] as $index => $entry) {
        if (!is_array($entry) || !isset($layout['pages'][$index])) {
            continue;
        }
        $page = &$layout['pages'][$index];
        if (is_string($entry['name'] ?? null) && trim($entry['name']) !== '') {
            $page['name'] = clean_line($entry['name'], 80);
        }
        $texts = is_array($entry['texts'] ?? null) ? $entry['texts'] : [];
        foreach ($page['texts'] as &$text) {
            if (!array_key_exists($text['id'], $texts)) {
                continue;
            }
            $pattern = $texts[$text['id']];
            if ($pattern === null || $pattern === '') {
                $changes += $text['pattern'] !== null ? 1 : 0;
                $text['pattern'] = null;
            } elseif (is_string($pattern) && layout_pattern_fits($pattern, implode("\n", $text['lines']))) {
                $changes += $text['pattern'] !== $pattern ? 1 : 0;
                $text['pattern'] = mb_substr($pattern, 0, 3000);
            }
        }
        unset($text);
        $images = is_array($entry['images'] ?? null) ? $entry['images'] : [];
        foreach ($page['images'] as &$image) {
            $role = $images[$image['id']] ?? null;
            if (in_array($role, LAYOUT_IMAGE_ROLES, true)) {
                $changes += $image['role'] !== $role ? 1 : 0;
                $image['role'] = $role;
            }
        }
        unset($image, $page);
    }
    return [$layout, $changes];
}
