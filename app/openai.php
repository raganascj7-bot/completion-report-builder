<?php

declare(strict_types=1);

/*
 * "Draft with AI" for the project description. The API key stays on the
 * server; the browser only ever sees the finished text. Only report text
 * is sent to OpenAI, never images.
 */

function ai_enabled(): bool
{
    return trim((string) config('OPENAI_API_KEY', '')) !== '' && function_exists('curl_init');
}

function ai_model(): string
{
    $model = trim((string) config('OPENAI_MODEL', 'gpt-4o'));
    return preg_match('/^[A-Za-z0-9._:-]{1,60}$/', $model) ? $model : 'gpt-4o';
}

function ai_requests_today(int $userId): int
{
    $row = db_one(
        'SELECT COUNT(*) AS total FROM ai_usage WHERE user_id = ? AND created_at >= ?',
        [$userId, date('Y-m-d 00:00:00')]
    );
    return (int) ($row['total'] ?? 0);
}

/** The facts the model may use, taken only from the report itself. */
function ai_report_facts(array $data, string $clientName, int $month, int $year): array
{
    $shoots = [];
    foreach (array_slice($data['shoots'], 0, 12) as $row) {
        if ($row['description'] !== '') {
            $shoots[] = mb_substr($row['description'], 0, 160);
        }
    }
    $breakdown = [];
    foreach ($data['breakdown'] as $row) {
        if ($row['title'] !== '') {
            $breakdown[] = trim($row['title'], ': ') . ' — ' . strtolower($row['status']);
        }
    }

    return [
        'client' => $clientName,
        'month' => MONTH_NAMES[$month] . ' ' . $year,
        'project_names' => array_values(array_filter(array_map('trim', explode("\n", $data['summary']['projectNames'])))),
        'current_description' => $data['summary']['projectDescription'],
        'content_posted_pages' => array_values(array_map(
            static fn(array $page) => $page['title'] . ' (' . count($page['images']) . ' screenshots)',
            $data['posted']
        )),
        'creative_campaigns' => array_values(array_filter(array_map(
            static fn(array $group) => trim($group['title'] . ' ' . $group['subtitle']),
            $data['creatives']
        ))),
        'content_shoots' => $shoots,
        'scope_of_work' => $breakdown,
    ];
}

/** Base address of the OpenAI API (overridable for automated tests). */
function ai_base_url(): string
{
    return rtrim((string) config('OPENAI_BASE_URL', 'https://api.openai.com/v1'), '/');
}

/**
 * Sends one Chat Completions request. Returns the decoded response.
 * Throws RuntimeException with a log-friendly message on any failure.
 */
function ai_request(array $payload, int $timeout): array
{
    $curl = curl_init(ai_base_url() . '/chat/completions');
    curl_setopt_array($curl, [
        CURLOPT_POST => true,
        CURLOPT_RETURNTRANSFER => true,
        CURLOPT_CONNECTTIMEOUT => 10,
        CURLOPT_TIMEOUT => $timeout,
        CURLOPT_HTTPHEADER => [
            'Content-Type: application/json',
            'Authorization: Bearer ' . trim((string) config('OPENAI_API_KEY', '')),
        ],
        CURLOPT_POSTFIELDS => json_encode($payload, JSON_UNESCAPED_UNICODE | JSON_UNESCAPED_SLASHES),
    ]);
    $body = curl_exec($curl);
    $status = (int) curl_getinfo($curl, CURLINFO_RESPONSE_CODE);
    $curlError = curl_error($curl);
    curl_close($curl);

    if ($body === false) {
        throw new RuntimeException('OpenAI request failed: ' . $curlError);
    }
    $response = json_decode((string) $body, true);
    if ($status !== 200 || !is_array($response)) {
        $detail = is_array($response) ? (string) ($response['error']['message'] ?? '') : '';
        throw new RuntimeException("OpenAI returned HTTP {$status}. {$detail}");
    }
    return $response;
}

/**
 * Calls OpenAI and returns ['text' => string, 'input_tokens' => int, 'output_tokens' => int].
 * Throws RuntimeException on any failure; the caller shows a friendly message.
 */
function ai_draft_description(array $facts): array
{
    $instructions = <<<TEXT
You write the "Project description" paragraph of a monthly completion report
from a digital marketing agency (JT Digital Marketing Services) to its client.
Style example: "Monthly social media management and layouts for The Outlets @LIMA Estate,
including content creation, strategy planning, graphics layout, community moderation,
and content & event shoot."
Rules:
- 1 to 3 sentences, at most 70 words, plain text, no quotes, no markdown, no bullet points.
- Use only facts given in the JSON. Never invent numbers, results, names or dates.
- If current_description is not empty, improve it rather than replacing its meaning.
- Professional, warm, client-facing English.
TEXT;

    $response = ai_request([
        'model' => ai_model(),
        'messages' => [
            ['role' => 'system', 'content' => $instructions],
            ['role' => 'user', 'content' => json_encode($facts, JSON_UNESCAPED_UNICODE | JSON_PRETTY_PRINT)],
        ],
        'max_completion_tokens' => 400,
    ], 30);

    $text = trim((string) ($response['choices'][0]['message']['content'] ?? ''));
    $text = trim($text, " \t\n\r\0\x0B\"“”");
    if ($text === '') {
        throw new RuntimeException('OpenAI returned an empty answer.');
    }

    return [
        'text' => mb_substr($text, 0, 1500),
        'input_tokens' => (int) ($response['usage']['prompt_tokens'] ?? 0),
        'output_tokens' => (int) ($response['usage']['completion_tokens'] ?? 0),
    ];
}

/** JSON schema the model must follow when describing an uploaded design. */
function ai_theme_schema(): array
{
    $string = ['type' => 'string'];
    $colors = [];
    foreach (array_keys(default_theme()['colors']) as $key) {
        $colors[$key] = $string;
    }
    $labels = [];
    foreach (array_keys(default_theme()['labels']) as $key) {
        $labels[$key] = $string;
    }
    $object = static fn(array $properties) => [
        'type' => 'object', 'properties' => $properties,
        'required' => array_keys($properties), 'additionalProperties' => false,
    ];
    $enum = static fn(array $values) => ['type' => 'string', 'enum' => $values];

    return $object([
        'colors' => $object($colors),
        'fonts' => $object(['display' => $enum(THEME_FONTS), 'heading' => $enum(THEME_FONTS), 'body' => $enum(THEME_FONTS)]),
        'layout' => $object(array_map($enum, THEME_LAYOUTS)),
        'title' => $object(['align' => $enum(['left', 'center']), 'uppercase' => ['type' => 'boolean'], 'size' => ['type' => 'integer']]),
        'footerContent' => $enum(THEME_FOOTER_CONTENT),
        'brandText' => $string,
        'hasOwnLogo' => ['type' => 'boolean'],
        'labels' => $object($labels),
        'notes' => ['type' => 'array', 'items' => $string],
    ]);
}

/**
 * Looks at the pages of an uploaded report and describes its design as a
 * theme. $pagePaths = JPEG files; $palette = colours measured from the pixels.
 *
 * @return array{theme: array, notes: array, hasOwnLogo: bool, input_tokens: int, output_tokens: int}
 */
function ai_analyze_template(array $pagePaths, array $palette): array
{
    $defaults = default_theme();
    $layouts = [];
    foreach (THEME_LAYOUTS as $key => $values) {
        $layouts[] = "{$key}: " . implode(' | ', $values);
    }
    $layoutText = implode("\n", $layouts);
    $fontText = implode(', ', THEME_FONTS);
    $paletteText = json_encode($palette, JSON_UNESCAPED_SLASHES);
    $defaultLabels = json_encode($defaults['labels'], JSON_UNESCAPED_UNICODE | JSON_UNESCAPED_SLASHES | JSON_PRETTY_PRINT);

    $instructions = <<<TEXT
You are a print designer. The images are pages of a monthly "completion report" from a
digital marketing agency, in the order they appear. Describe its visual design so our
report builder can reproduce the same look with new content every month.

Our report always has these page types: cover; project summary (contractor, project name,
description, dates, sign-off, "approved by"); image pages (content calendar, content for the
month, content posted, creatives/layouts); a content-shoot table (date, description, link);
a breakdown table (status, scope, note); a contact page.

Choose the closest option for every field:
{$layoutText}
- cover "tole": solid colour page, big title top-left, photo strip with rounded right end, decorative half ring.
  "band": colour block on the top half, full-width photo below. "centered": centred title and a framed photo.
  "split": colour panel on the left half, photo filling the right half.
- header "tole": colour band with ring/arc shapes on the right. "band": plain colour band with the logo.
  "line": logo on white with a thin coloured rule. "none": no header.
- footer: "band" = solid colour strip, "line" = thin rule with text, "none".
- table "boxed": every cell outlined, "lined": only lines between rows, "striped": alternating row shading.
- decoration "arcs" if the design uses circles/rings/arcs as ornaments, else "none".
Fonts — pick the closest family: {$fontText}
(garet/montserrat/poppins = geometric sans, inter/arial = plain sans, lora/georgia = serif).

Colours: use exact hex values. Measured colours from the page pixels, with their share of the
area, are given below — prefer these values over guessing:
{$paletteText}
colors.pageBg = page background, headerBg/headerText = header band and the text/logo on it,
footerBg = footer band (or footer line colour if footer is "line"), footerText = footer text,
coverBg/coverText/coverAccent = cover background, cover text, the highlighted month/year,
tableHeadBg/tableHeadText/tableBorder = table header and lines, title = page title colour,
link = hyperlink colour, accent = secondary brand colour.

labels: copy the report's own wording for each heading, keeping its capitalisation. Where a
heading contains the month, write {MONTH} (upper case) or {Month} instead of the month name.
If the report has no equivalent heading, return the default from this list unchanged:
{$defaultLabels}

title.size = page title size in pixels on an A4 page 794 px wide (usually 22–34).
title.uppercase = true only if the design forces titles to capitals.
brandText = the words printed beside the logo (use \\n between lines), or "" if none.
hasOwnLogo = true if the report shows a logo other than the JT Digital mark.
notes = 2 to 6 short sentences for the person reviewing: what you matched and anything
our options cannot reproduce exactly (e.g. a texture, an unusual page).
TEXT;

    $content = [['type' => 'text', 'text' => 'Pages of the report to analyse, in order:']];
    foreach (array_slice($pagePaths, 0, TEMPLATE_MAX_PAGES) as $index => $path) {
        $content[] = [
            'type' => 'image_url',
            'image_url' => [
                'url' => 'data:image/jpeg;base64,' . base64_encode((string) file_get_contents($path)),
                'detail' => $index < 3 ? 'high' : 'low',
            ],
        ];
    }

    $response = ai_request([
        'model' => ai_model(),
        'messages' => [
            ['role' => 'system', 'content' => $instructions],
            ['role' => 'user', 'content' => $content],
        ],
        'response_format' => [
            'type' => 'json_schema',
            'json_schema' => ['name' => 'report_design', 'strict' => true, 'schema' => ai_theme_schema()],
        ],
        'max_completion_tokens' => 2500,
    ], 90);

    $raw = (string) ($response['choices'][0]['message']['content'] ?? '');
    $result = json_decode($raw, true);
    if (!is_array($result)) {
        throw new RuntimeException('OpenAI did not return a readable design description.');
    }

    $theme = normalize_theme([
        'colors' => $result['colors'] ?? [],
        'fonts' => $result['fonts'] ?? [],
        'layout' => $result['layout'] ?? [],
        'title' => $result['title'] ?? [],
        'footerContent' => $result['footerContent'] ?? null,
        'brand' => ['logo' => !empty($result['hasOwnLogo']) ? 'custom' : 'jt', 'text' => $result['brandText'] ?? ''],
        'labels' => $result['labels'] ?? [],
    ]);

    $notes = [];
    foreach (array_slice(is_array($result['notes'] ?? null) ? $result['notes'] : [], 0, 8) as $note) {
        $text = clean_line($note, 300);
        if ($text !== '') {
            $notes[] = $text;
        }
    }

    return [
        'theme' => $theme,
        'notes' => $notes,
        'hasOwnLogo' => !empty($result['hasOwnLogo']),
        'input_tokens' => (int) ($response['usage']['prompt_tokens'] ?? 0),
        'output_tokens' => (int) ($response['usage']['completion_tokens'] ?? 0),
    ];
}

/**
 * Labels an exact-copy layout. The AI sees the page pictures and the list of
 * texts and photos (with ids) and answers ONLY with labels: which texts hold
 * report values (as patterns), what each photo is, and page names.
 * Positions are never part of the answer, so nothing can move.
 *
 * @return array{labels: array, notes: array, input_tokens: int, output_tokens: int}
 */
function ai_label_layout(array $layout, array $pagePaths): array
{
    $fields = implode(', ', LAYOUT_FIELDS);
    $instructions = <<<TEXT
You prepare a monthly "completion report" from a digital marketing agency so it can be reused
as a template. The images are its pages, in order. For each page you also get every text block
and photo with an id, and the labels guessed so far.

Texts: a text that contains report values gets a "pattern": its exact text with each value
replaced by a field in braces. Fields: {$fields}.
- month / year / monthYear = the report month ("AUGUST", "2026", "August 2026").
- reportDate, startDate, completionDate = full dates like "August 30, 2026".
- clientName = the client as written on the cover; preparedByName / preparedByCompany = "Prepared by" on the cover;
  preparerName / preparerCompany = the sign-off on the summary page; contractorName / contractorAddress = the agency
  block on the summary page; contact* / website / location = the contact page.
- Add :upper when the value is printed in capitals ({month:upper}), :title for Title Case.
- Keep every other character exactly as printed, including line breaks (\n) between lines.
- Dates or names inside tables (content shoot rows, notes) are NOT report values: leave them.
Return only texts whose label should change: a corrected pattern, or null to remove a wrong one.

Photos: role "fixed" = logo or icon that never changes; "keep" = photo that stays until someone
replaces it (cover photo, office photo); "slot" = screenshot or picture that is new every month.

Page names: short, like "Cover", "Project summary", "Content calendar", "Content posted: TikTok".
notes: 1 to 4 short sentences for the person reviewing.
TEXT;

    $elements = [];
    foreach ($layout['pages'] as $index => $page) {
        $elements[] = [
            'page' => $index + 1,
            'name' => $page['name'],
            'texts' => array_map(static fn(array $text) => [
                'id' => $text['id'],
                'text' => mb_substr(implode("\n", $text['lines']), 0, 400),
                'size' => $text['size'],
                'bold' => $text['weight'] >= 600,
                'pattern' => $text['pattern'],
            ], $page['texts']),
            'photos' => array_map(static fn(array $image) => [
                'id' => $image['id'], 'x' => (int) $image['x'], 'y' => (int) $image['y'], 'w' => (int) $image['w'], 'h' => (int) $image['h'],
                'role' => $image['role'],
            ], $page['images']),
        ];
    }

    $content = [['type' => 'text', 'text' => "Texts and photos per page (positions in px on a page 794 px wide):\n"
        . json_encode($elements, JSON_UNESCAPED_UNICODE | JSON_UNESCAPED_SLASHES)]];
    foreach (array_slice($pagePaths, 0, LAYOUT_MAX_PAGES) as $index => $path) {
        $content[] = ['type' => 'image_url', 'image_url' => [
            'url' => 'data:image/jpeg;base64,' . base64_encode((string) file_get_contents($path)),
            'detail' => $index < 2 ? 'high' : 'low',
        ]];
    }

    $object = static fn(array $properties) => [
        'type' => 'object', 'properties' => $properties, 'required' => array_keys($properties), 'additionalProperties' => false,
    ];
    $schema = $object([
        'pages' => ['type' => 'array', 'items' => $object([
            'page' => ['type' => 'integer'],
            'name' => ['type' => 'string'],
            'texts' => ['type' => 'array', 'items' => $object(['id' => ['type' => 'string'], 'pattern' => ['type' => ['string', 'null']]])],
            'photos' => ['type' => 'array', 'items' => $object(['id' => ['type' => 'string'], 'role' => ['type' => 'string', 'enum' => LAYOUT_IMAGE_ROLES]])],
        ])],
        'notes' => ['type' => 'array', 'items' => ['type' => 'string']],
    ]);

    $response = ai_request([
        'model' => ai_model(),
        'messages' => [
            ['role' => 'system', 'content' => $instructions],
            ['role' => 'user', 'content' => $content],
        ],
        'response_format' => ['type' => 'json_schema', 'json_schema' => ['name' => 'layout_labels', 'strict' => true, 'schema' => $schema]],
        'max_completion_tokens' => 6000,
    ], 120);

    $result = json_decode((string) ($response['choices'][0]['message']['content'] ?? ''), true);
    if (!is_array($result) || !is_array($result['pages'] ?? null)) {
        throw new RuntimeException('OpenAI did not return readable labels.');
    }

    // Same shape the review screen sends: pages[index] = { name, texts: {id: pattern|null}, images: {id: role} }.
    $labels = ['pages' => []];
    foreach ($result['pages'] as $page) {
        $index = (int) ($page['page'] ?? 0) - 1;
        if (!isset($layout['pages'][$index])) {
            continue;
        }
        $entry = ['name' => (string) ($page['name'] ?? ''), 'texts' => [], 'images' => []];
        foreach (is_array($page['texts'] ?? null) ? $page['texts'] : [] as $text) {
            if (is_string($text['id'] ?? null)) {
                $entry['texts'][$text['id']] = is_string($text['pattern'] ?? null) ? $text['pattern'] : null;
            }
        }
        foreach (is_array($page['photos'] ?? null) ? $page['photos'] : [] as $photo) {
            if (is_string($photo['id'] ?? null)) {
                $entry['images'][$photo['id']] = (string) ($photo['role'] ?? '');
            }
        }
        $labels['pages'][$index] = $entry;
    }

    $notes = [];
    foreach (array_slice(is_array($result['notes'] ?? null) ? $result['notes'] : [], 0, 4) as $note) {
        $text = clean_line($note, 300);
        if ($text !== '') {
            $notes[] = $text;
        }
    }

    return [
        'labels' => $labels,
        'notes' => $notes,
        'input_tokens' => (int) ($response['usage']['prompt_tokens'] ?? 0),
        'output_tokens' => (int) ($response['usage']['completion_tokens'] ?? 0),
    ];
}

function ai_log_usage(int $userId, ?int $reportId, int $inputTokens, int $outputTokens, bool $succeeded): void
{
    db_run(
        'INSERT INTO ai_usage (user_id, report_id, model, input_tokens, output_tokens, succeeded, created_at)
         VALUES (?, ?, ?, ?, ?, ?, ?)',
        [$userId, $reportId, ai_model(), $inputTokens, $outputTokens, $succeeded ? 1 : 0, now()]
    );
}
