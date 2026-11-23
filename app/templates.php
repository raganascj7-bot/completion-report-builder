<?php

declare(strict_types=1);

/*
 * Report templates ("designs").
 *
 * A template is a THEME: colours, fonts, which layout each page type uses,
 * the logo and the wording of headings. It never changes report data, so
 * any report can switch design at any time and every month still fits.
 *
 * Files live outside the public folder:
 *   storage/templates/<id>/source.pdf   the uploaded example (optional)
 *   storage/templates/<id>/page-N.jpg   its pages as pictures (for review + AI)
 *   storage/templates/<id>/logo.<ext>   optional custom logo
 *
 * Keep the allowed values below in sync with assets/js/builder/theme.js.
 */

const THEME_FONTS = ['garet', 'montserrat', 'poppins', 'inter', 'lora', 'georgia', 'arial'];
const THEME_LAYOUTS = [
    'cover' => ['tole', 'band', 'centered', 'split'],
    'header' => ['tole', 'band', 'line', 'none'],
    'footer' => ['band', 'line', 'none'],
    'contact' => ['tole', 'simple'],
    'table' => ['boxed', 'lined', 'striped'],
    'decoration' => ['arcs', 'none'],
];
const THEME_FOOTER_CONTENT = ['company', 'company-page', 'page'];
const TEMPLATE_MAX_PAGES = 8;

function default_theme(): array
{
    return [
        'version' => 1,
        'colors' => [
            'primary' => '#3500ff', 'accent' => '#cdfe64', 'text' => '#111111', 'title' => '#111111', 'pageBg' => '#ffffff',
            'headerBg' => '#3500ff', 'headerText' => '#ffffff', 'footerBg' => '#ccced0', 'footerText' => '#111111',
            'coverBg' => '#3500ff', 'coverText' => '#ffffff', 'coverAccent' => '#cdfe64',
            'tableHeadBg' => '#111111', 'tableHeadText' => '#ffffff', 'tableBorder' => '#111111', 'link' => '#1a4fd6',
        ],
        'fonts' => ['display' => 'garet', 'heading' => 'montserrat', 'body' => 'montserrat'],
        'layout' => ['cover' => 'tole', 'header' => 'tole', 'footer' => 'band', 'contact' => 'tole', 'table' => 'boxed', 'decoration' => 'arcs'],
        'title' => ['align' => 'center', 'uppercase' => false, 'size' => 30],
        'footerContent' => 'company',
        'brand' => ['logo' => 'jt', 'text' => "DIGITAL\nMARKETING\nSERVICES"],
        'labels' => [
            'coverTitle' => 'Completion Report',
            'preparedFor' => 'Prepared For.',
            'preparedBy' => 'Prepared By.',
            'summaryTitle' => 'PROJECT COMPLETION REPORT',
            'contractor' => 'Contractor information',
            'projectName' => 'Project name',
            'projectDescription' => 'Project description',
            'startDate' => 'Project start date:',
            'completionDate' => 'Completion date:',
            'approvedBy' => 'Approved by:',
            'calendar' => 'CONTENT CALENDAR: {MONTH}',
            'content' => 'CONTENT FOR {MONTH}',
            'creatives' => 'CREATIVES/LAYOUTS',
            'shoots' => 'CONTENT SHOOT',
            'shootDate' => 'Date',
            'shootDescription' => 'Content shoot description',
            'shootLink' => 'GDrive link',
            'breakdown' => 'BREAKDOWN',
            'status' => 'Status',
            'scope' => 'Scope description',
            'note' => 'Note',
            'contactTitle' => 'Contact Us',
            'contactIntro' => 'If you have any questions or need clarification about the report, please contact us.',
        ],
    ];
}

/** Rebuilds a theme from untrusted input; anything missing or invalid falls back to TOLE. */
function normalize_theme(mixed $input): array
{
    $in = is_array($input) ? $input : [];
    $theme = default_theme();

    foreach ($theme['colors'] as $key => $default) {
        $value = $in['colors'][$key] ?? null;
        if (is_string($value) && preg_match('/^#[0-9a-fA-F]{6}$/', $value)) {
            $theme['colors'][$key] = strtolower($value);
        }
    }
    foreach ($theme['fonts'] as $key => $default) {
        $value = $in['fonts'][$key] ?? null;
        if (is_string($value) && in_array($value, THEME_FONTS, true)) {
            $theme['fonts'][$key] = $value;
        }
    }
    foreach (THEME_LAYOUTS as $key => $allowed) {
        $value = $in['layout'][$key] ?? null;
        if (is_string($value) && in_array($value, $allowed, true)) {
            $theme['layout'][$key] = $value;
        }
    }
    if (in_array($in['title']['align'] ?? null, ['left', 'center'], true)) {
        $theme['title']['align'] = $in['title']['align'];
    }
    if (is_bool($in['title']['uppercase'] ?? null)) {
        $theme['title']['uppercase'] = $in['title']['uppercase'];
    }
    $size = filter_var($in['title']['size'] ?? null, FILTER_VALIDATE_INT, ['options' => ['min_range' => 18, 'max_range' => 40]]);
    if ($size !== false) {
        $theme['title']['size'] = $size;
    }
    if (in_array($in['footerContent'] ?? null, THEME_FOOTER_CONTENT, true)) {
        $theme['footerContent'] = $in['footerContent'];
    }
    if (in_array($in['brand']['logo'] ?? null, ['jt', 'custom', 'none'], true)) {
        $theme['brand']['logo'] = $in['brand']['logo'];
    }
    if (isset($in['brand']['text']) && is_string($in['brand']['text'])) {
        $theme['brand']['text'] = clean_text($in['brand']['text'], 80);
    }
    foreach ($theme['labels'] as $key => $default) {
        $value = $in['labels'][$key] ?? null;
        if (is_string($value) && trim($value) !== '') {
            $theme['labels'][$key] = clean_line($value, 200);
        }
    }
    return $theme;
}

function template_dir(int $id): string
{
    return STORAGE_PATH . '/templates/' . $id;
}

function template_by_id(int $id): ?array
{
    return db_one('SELECT * FROM templates WHERE id = ?', [$id]);
}

function template_page_files(int $id): array
{
    $files = glob(template_dir($id) . '/page-*.jpg') ?: [];
    natsort($files);
    return array_values(array_map('basename', $files));
}

function template_logo_file(array $template): ?string
{
    $file = $template['logo_file'] ?? null;
    return $file && is_file(template_dir((int) $template['id']) . '/' . basename((string) $file)) ? (string) $file : null;
}

function template_logo_url(array $template): string
{
    return template_logo_file($template)
        ? 'api/template-file.php?id=' . (int) $template['id'] . '&file=logo&v=' . strtotime((string) $template['updated_at'])
        : '';
}

/** What the browser needs to render or edit a template. */
function template_payload(array $template, bool $withPages = false): array
{
    $payload = [
        'id' => (int) $template['id'],
        'name' => $template['name'],
        'status' => $template['status'],
        'theme' => normalize_theme(json_decode((string) $template['theme'], true)),
        'logoUrl' => template_logo_url($template),
        'analyzedBy' => $template['analyzed_by'],
        'notes' => array_values(array_filter(explode("\n", (string) $template['analysis_notes']))),
        'sourceName' => $template['source_name'],
        'updatedAt' => $template['updated_at'],
        'kind' => $template['kind'] ?? 'theme',
    ];
    if (($template['kind'] ?? 'theme') === 'layout') {
        $payload['layout'] = template_layout($template);
        $payload['assetBase'] = layout_asset_base($template);
    }
    if ($withPages) {
        $payload['pages'] = array_map(
            static fn(string $file) => 'api/template-file.php?id=' . (int) $template['id'] . '&file=' . rawurlencode(pathinfo($file, PATHINFO_FILENAME)),
            template_page_files((int) $template['id'])
        );
    }
    return $payload;
}

/** Templates a report may use (the built-in TOLE design is "null"). */
function ready_templates(): array
{
    return array_map(
        static fn(array $row) => ['id' => (int) $row['id'], 'name' => $row['name'], 'kind' => $row['kind']],
        db_all("SELECT id, name, kind FROM templates WHERE status = 'ready' ORDER BY name")
    );
}

function default_template_id(): ?int
{
    $row = db_one('SELECT default_template_id FROM agency_settings WHERE id = 1');
    $id = $row['default_template_id'] ?? null;
    if ($id === null) {
        return null;
    }
    $template = template_by_id((int) $id);
    return $template && $template['status'] === 'ready' ? (int) $id : null;
}

/** Template for a new report: the client's choice, else the agency default, else TOLE (null). */
function template_for_new_report(?array $client): ?int
{
    if ($client && !empty($client['template_id'])) {
        $template = template_by_id((int) $client['template_id']);
        if ($template && $template['status'] === 'ready') {
            return (int) $template['id'];
        }
    }
    return default_template_id();
}

/** Theme + logo for a report; null template = built-in TOLE design. */
function report_design(?int $templateId): array
{
    if ($templateId) {
        $template = template_by_id($templateId);
        if ($template) {
            $design = ['templateId' => (int) $template['id'], 'templateName' => $template['name'], 'kind' => $template['kind'] ?? 'theme',
                'theme' => normalize_theme(json_decode((string) $template['theme'], true)), 'logoUrl' => template_logo_url($template)];
            if ($design['kind'] === 'layout') {
                $design['layout'] = template_layout($template);
                $design['assetBase'] = layout_asset_base($template);
            }
            return $design;
        }
    }
    return ['templateId' => null, 'templateName' => 'JT Default (TOLE)', 'kind' => 'theme', 'theme' => default_theme(), 'logoUrl' => ''];
}

function delete_template_files(int $id): void
{
    $dir = template_dir($id);
    foreach (glob($dir . '/*') ?: [] as $file) {
        @unlink($file);
    }
    @rmdir($dir);
}

/**
 * The parts of a design that the PDF text reader gets exactly right:
 * headings and labels that differ from the TOLE wording, fonts, title style, footer and brand words.
 */
function pdf_read_facts(array $theme): array
{
    $defaults = default_theme()['labels'];
    return [
        'labels' => array_filter($theme['labels'], static fn($value, $key) => ($defaults[$key] ?? null) !== $value, ARRAY_FILTER_USE_BOTH),
        'fonts' => $theme['fonts'],
        'title' => $theme['title'],
        'footerContent' => $theme['footerContent'],
        'brandText' => $theme['brand']['text'],
    ];
}

/** Lays the facts read from the PDF over an AI-analysed theme. */
function apply_pdf_read_facts(array $theme, array $read): array
{
    foreach ((array) ($read['labels'] ?? []) as $key => $value) {
        $theme['labels'][$key] = $value;
    }
    foreach (['fonts', 'title'] as $part) {
        if (isset($read[$part]) && is_array($read[$part])) {
            $theme[$part] = array_merge($theme[$part], $read[$part]);
        }
    }
    if (isset($read['footerContent'])) {
        $theme['footerContent'] = $read['footerContent'];
    }
    if (isset($read['brandText'])) {
        $theme['brand']['text'] = $read['brandText'];
    }
    return normalize_theme($theme);
}
