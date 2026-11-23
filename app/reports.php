<?php

declare(strict_types=1);

/*
 * Everything about the shape of a report lives here, so the server is the
 * single authority on what a saved report may contain. The browser sends
 * the whole "data" object; normalize_report_data() rebuilds it from
 * scratch, keeping only known fields with safe lengths and types.
 */

const BREAKDOWN_STATUSES = ['IN PROGRESS', 'COMPLETE', 'TO BE FOLLOWED'];
const IMAGE_COLUMNS = ['auto', '1', '2', '3', '4', '5'];

const LIMIT_IMAGES_PER_LIST = 60;
const LIMIT_POSTED_PAGES = 12;
const LIMIT_CREATIVE_GROUPS = 30;
const LIMIT_SHOOT_ROWS = 150;
const LIMIT_BREAKDOWN_ROWS = 40;

function default_breakdown(): array
{
    return [
        ['status' => 'IN PROGRESS', 'title' => 'Photographer/Videographer', 'bullets' => [
            '3x on-site coverage for content shoot (maximum of 6 hours per shoot)',
            'Photographer/Videographer with equipment already',
        ], 'note' => ''],
        ['status' => 'IN PROGRESS', 'title' => 'Creative Requests/Graphics Designer', 'bullets' => [], 'note' => ''],
        ['status' => 'IN PROGRESS', 'title' => 'Facebook Content Management:', 'bullets' => [
            '30–35 feed posts (a mix of static images, carousel posts, and reels)',
            '2 countdown campaigns per month for major events, each consisting of 3 supporting posts and reels',
            '1 event invitation post per featured event',
        ], 'note' => ''],
        ['status' => 'IN PROGRESS', 'title' => 'TikTok Content Management:', 'bullets' => [
            '3 to 5 videos per week, featuring events, promos, tenant highlights, and estate visuals',
        ], 'note' => ''],
        ['status' => 'IN PROGRESS', 'title' => 'Community Management Support:', 'bullets' => [
            'Responding to messages, comments, and inquiries',
        ], 'note' => ''],
        ['status' => 'IN PROGRESS', 'title' => 'Analytics & Performance Reporting:', 'bullets' => [
            'Facebook, Instagram, TikTok',
        ], 'note' => ''],
    ];
}

function default_posted_pages(): array
{
    return [
        ['id' => short_id(), 'title' => 'CONTENT POSTED: FB & IG (with Tenant Requests)', 'columns' => '1', 'images' => []],
        ['id' => short_id(), 'title' => 'CONTENT POSTED: IG FEED PREVIEW', 'columns' => '3', 'images' => []],
        ['id' => short_id(), 'title' => 'CONTENT POSTED: TIKTOK', 'columns' => '1', 'images' => []],
    ];
}

function short_id(): string
{
    return 'x' . random_token(5);
}

function month_bounds(int $month, int $year): array
{
    $first = sprintf('%04d-%02d-01', $year, $month);
    $last = date('Y-m-t', strtotime($first));
    return [$first, $last];
}

function agency_settings(): array
{
    $row = db_one('SELECT * FROM agency_settings WHERE id = 1');
    $defaults = [
        'contractor_name' => '', 'contractor_address' => '', 'prepared_by_name' => '',
        'prepared_by_company' => '', 'closing_note' => '', 'viber_name' => '', 'viber_number' => '',
        'email' => '', 'website' => '', 'location' => '', 'cover_image_file' => null, 'office_image_file' => null,
    ];
    return $row ? array_merge($defaults, $row) : $defaults;
}

/**
 * Builds the starting data for a new report from agency settings and the
 * client's preset. Image ids are filled in later by the caller.
 */
function new_report_data(int $month, int $year, ?array $client, array $settings): array
{
    [$first, $last] = month_bounds($month, $year);
    $breakdown = default_breakdown();
    if ($client && !empty($client['breakdown_preset'])) {
        $preset = json_decode((string) $client['breakdown_preset'], true);
        if (is_array($preset) && $preset) {
            $breakdown = $preset;
        }
    }

    return [
        'cover' => [
            'clientDisplay' => $client ? ($client['cover_display'] ?: $client['name']) : '',
            'preparedByName' => $settings['prepared_by_name'],
            'preparedByCompany' => $settings['prepared_by_company'],
            'image' => null,
        ],
        'summary' => [
            'reportDate' => $last,
            'contractorName' => $settings['contractor_name'],
            'contractorAddress' => $settings['contractor_address'],
            'projectNames' => $client['project_names'] ?? '',
            'projectDescription' => $client['project_description'] ?? '',
            'startDate' => $first,
            'completionDate' => $last,
            'closingNote' => $settings['closing_note'],
            'preparerName' => $settings['prepared_by_name'],
            'preparerCompany' => $settings['prepared_by_company'],
            'approverName' => $client['approver_name'] ?? '',
            'approverPosition' => $client['approver_position'] ?? '',
            'approverDepartment' => $client['approver_department'] ?? '',
        ],
        'calendar' => ['columns' => '1', 'images' => []],
        'content' => ['columns' => '1', 'images' => []],
        'posted' => default_posted_pages(),
        'creatives' => [],
        'shoots' => [],
        'breakdown' => $breakdown,
        'contact' => [
            'viberName' => $settings['viber_name'],
            'viberNumber' => $settings['viber_number'],
            'email' => $settings['email'],
            'website' => $settings['website'],
            'location' => $settings['location'],
            'image' => null,
        ],
    ];
}

/**
 * Data for a duplicated report: keeps the recurring text, clears
 * everything that belongs to one month (images, shoots, notes, dates).
 */
function duplicate_report_data(array $source, int $month, int $year): array
{
    [$first, $last] = month_bounds($month, $year);
    $data = $source;
    $data['summary']['reportDate'] = $last;
    $data['summary']['startDate'] = $first;
    $data['summary']['completionDate'] = $last;
    $data['calendar']['images'] = [];
    $data['content']['images'] = [];
    foreach ($data['posted'] as &$page) {
        $page['id'] = short_id();
        $page['images'] = [];
    }
    unset($page);
    $data['creatives'] = [];
    $data['shoots'] = [];
    foreach ($data['breakdown'] as &$row) {
        $row['status'] = 'IN PROGRESS';
        $row['note'] = '';
    }
    unset($row);
    return $data;
}

function normalize_image_ref(mixed $value, array $allowedIds): ?array
{
    if (!is_array($value)) {
        return null;
    }
    $id = filter_var($value['imageId'] ?? null, FILTER_VALIDATE_INT);
    if ($id === false || !in_array($id, $allowedIds, true)) {
        return null;
    }
    return ['imageId' => $id, 'caption' => clean_line($value['caption'] ?? '', 200)];
}

function normalize_image_list(mixed $value, array $allowedIds): array
{
    $list = [];
    foreach (is_array($value) ? $value : [] as $item) {
        $image = normalize_image_ref($item, $allowedIds);
        if ($image) {
            $list[] = $image;
        }
        if (count($list) >= LIMIT_IMAGES_PER_LIST) {
            break;
        }
    }
    return $list;
}

function normalize_columns(mixed $value): string
{
    $value = is_scalar($value) ? (string) $value : 'auto';
    return in_array($value, IMAGE_COLUMNS, true) ? $value : 'auto';
}

function normalize_id(mixed $value): string
{
    $id = is_string($value) ? $value : '';
    return preg_match('/^[A-Za-z0-9_-]{1,20}$/', $id) ? $id : short_id();
}

/**
 * Rebuilds report data from untrusted input.
 * $allowedImageIds = ids of images that belong to this report.
 */
function normalize_report_data(array $in, array $allowedImageIds): array
{
    $cover = is_array($in['cover'] ?? null) ? $in['cover'] : [];
    $summary = is_array($in['summary'] ?? null) ? $in['summary'] : [];
    $contact = is_array($in['contact'] ?? null) ? $in['contact'] : [];

    $out = [
        'cover' => [
            'clientDisplay' => clean_text($cover['clientDisplay'] ?? '', 200),
            'preparedByName' => clean_line($cover['preparedByName'] ?? '', 150),
            'preparedByCompany' => clean_line($cover['preparedByCompany'] ?? '', 150),
            'image' => normalize_image_ref($cover['image'] ?? null, $allowedImageIds),
        ],
        'summary' => [
            'reportDate' => clean_date($summary['reportDate'] ?? ''),
            'contractorName' => clean_line($summary['contractorName'] ?? '', 150),
            'contractorAddress' => clean_text($summary['contractorAddress'] ?? '', 300),
            'projectNames' => clean_text($summary['projectNames'] ?? '', 1000),
            'projectDescription' => clean_text($summary['projectDescription'] ?? '', 3000),
            'startDate' => clean_date($summary['startDate'] ?? ''),
            'completionDate' => clean_date($summary['completionDate'] ?? ''),
            'closingNote' => clean_text($summary['closingNote'] ?? '', 500),
            'preparerName' => clean_line($summary['preparerName'] ?? '', 150),
            'preparerCompany' => clean_line($summary['preparerCompany'] ?? '', 150),
            'approverName' => clean_line($summary['approverName'] ?? '', 150),
            'approverPosition' => clean_line($summary['approverPosition'] ?? '', 200),
            'approverDepartment' => clean_line($summary['approverDepartment'] ?? '', 200),
        ],
        'calendar' => [
            'columns' => normalize_columns($in['calendar']['columns'] ?? 'auto'),
            'images' => normalize_image_list($in['calendar']['images'] ?? [], $allowedImageIds),
        ],
        'content' => [
            'columns' => normalize_columns($in['content']['columns'] ?? 'auto'),
            'images' => normalize_image_list($in['content']['images'] ?? [], $allowedImageIds),
        ],
        'posted' => [],
        'creatives' => [],
        'shoots' => [],
        'breakdown' => [],
        'contact' => [
            'viberName' => clean_line($contact['viberName'] ?? '', 100),
            'viberNumber' => clean_line($contact['viberNumber'] ?? '', 50),
            'email' => clean_line($contact['email'] ?? '', 150),
            'website' => clean_line($contact['website'] ?? '', 150),
            'location' => clean_text($contact['location'] ?? '', 200),
            'image' => normalize_image_ref($contact['image'] ?? null, $allowedImageIds),
        ],
    ];

    foreach (array_slice(is_array($in['posted'] ?? null) ? $in['posted'] : [], 0, LIMIT_POSTED_PAGES) as $page) {
        if (!is_array($page)) {
            continue;
        }
        $out['posted'][] = [
            'id' => normalize_id($page['id'] ?? ''),
            'title' => clean_line($page['title'] ?? '', 150),
            'columns' => normalize_columns($page['columns'] ?? 'auto'),
            'images' => normalize_image_list($page['images'] ?? [], $allowedImageIds),
        ];
    }

    foreach (array_slice(is_array($in['creatives'] ?? null) ? $in['creatives'] : [], 0, LIMIT_CREATIVE_GROUPS) as $group) {
        if (!is_array($group)) {
            continue;
        }
        $links = [];
        foreach (array_slice(is_array($group['links'] ?? null) ? $group['links'] : [], 0, 6) as $link) {
            if (!is_array($link)) {
                continue;
            }
            $url = clean_url($link['url'] ?? '');
            $label = clean_line($link['label'] ?? '', 80);
            if ($url !== '' || $label !== '') {
                $links[] = ['label' => $label, 'url' => $url];
            }
        }
        $out['creatives'][] = [
            'id' => normalize_id($group['id'] ?? ''),
            'title' => clean_line($group['title'] ?? '', 150),
            'subtitle' => clean_line($group['subtitle'] ?? '', 200),
            'links' => $links,
            'columns' => normalize_columns($group['columns'] ?? 'auto'),
            'images' => normalize_image_list($group['images'] ?? [], $allowedImageIds),
        ];
    }

    foreach (array_slice(is_array($in['shoots'] ?? null) ? $in['shoots'] : [], 0, LIMIT_SHOOT_ROWS) as $row) {
        if (!is_array($row)) {
            continue;
        }
        $out['shoots'][] = [
            'date' => clean_date($row['date'] ?? ''),
            'description' => clean_text($row['description'] ?? '', 1500),
            'link' => clean_url($row['link'] ?? ''),
        ];
    }

    foreach (array_slice(is_array($in['breakdown'] ?? null) ? $in['breakdown'] : [], 0, LIMIT_BREAKDOWN_ROWS) as $row) {
        if (!is_array($row)) {
            continue;
        }
        $status = is_string($row['status'] ?? null) ? strtoupper(trim($row['status'])) : '';
        $bullets = [];
        foreach (array_slice(is_array($row['bullets'] ?? null) ? $row['bullets'] : [], 0, 20) as $bullet) {
            $text = clean_line($bullet, 300);
            if ($text !== '') {
                $bullets[] = $text;
            }
        }
        $out['breakdown'][] = [
            'status' => in_array($status, BREAKDOWN_STATUSES, true) ? $status : 'IN PROGRESS',
            'title' => clean_line($row['title'] ?? '', 200),
            'bullets' => $bullets,
            'note' => clean_text($row['note'] ?? '', 1500),
        ];
    }

    // Exact-copy designs keep their page edits here (see app/layouts.php).
    $layout = normalize_report_layout($in['layout'] ?? null, $allowedImageIds);
    if ($layout !== null) {
        $out['layout'] = $layout;
    }

    return $out;
}

function report_by_uid(string $uid): ?array
{
    if (!preg_match('/^r_[a-f0-9]{16}$/', $uid)) {
        return null;
    }
    return db_one('SELECT * FROM reports WHERE report_uid = ?', [$uid]);
}

function report_image_ids(int $reportId): array
{
    return array_map('intval', array_column(db_all('SELECT id FROM report_images WHERE report_id = ?', [$reportId]), 'id'));
}

/** Every imageId the data refers to, wherever it sits. */
function referenced_image_ids(array $data): array
{
    $ids = [];
    $collect = static function (?array $ref) use (&$ids): void {
        if ($ref && isset($ref['imageId'])) {
            $ids[] = (int) $ref['imageId'];
        }
    };
    $collect($data['cover']['image'] ?? null);
    $collect($data['contact']['image'] ?? null);
    foreach (['calendar', 'content'] as $key) {
        foreach ($data[$key]['images'] ?? [] as $image) {
            $collect($image);
        }
    }
    foreach (['posted', 'creatives'] as $key) {
        foreach ($data[$key] ?? [] as $page) {
            foreach ($page['images'] ?? [] as $image) {
                $collect($image);
            }
        }
    }
    foreach ($data['layout']['pages'] ?? [] as $page) {
        foreach ((array) ($page['images'] ?? []) as $image) {
            $collect((array) $image);
        }
    }
    return array_values(array_unique($ids));
}

/** Public metadata the browser needs to draw each image. */
function report_images_meta(int $reportId): array
{
    $meta = [];
    foreach (db_all('SELECT id, width, height, mime FROM report_images WHERE report_id = ?', [$reportId]) as $row) {
        $meta[(string) $row['id']] = [
            'url' => 'api/image.php?id=' . (int) $row['id'],
            'width' => (int) $row['width'],
            'height' => (int) $row['height'],
        ];
    }
    return $meta;
}

function report_summary_row(array $report): array
{
    return [
        'uid' => $report['report_uid'],
        'clientId' => $report['client_id'] !== null ? (int) $report['client_id'] : null,
        'clientName' => $report['client_name'],
        'month' => (int) $report['month'],
        'year' => (int) $report['year'],
        'status' => $report['status'],
        'version' => (int) $report['version'],
        'updatedAt' => $report['updated_at'],
    ];
}

function client_by_id(int $id): ?array
{
    return db_one('SELECT * FROM clients WHERE id = ?', [$id]);
}
