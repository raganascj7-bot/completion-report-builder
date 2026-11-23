<?php

declare(strict_types=1);

/*
 * Template actions (Admin only), JSON body { action, … }:
 *   analyze      { id }                         AI reads the pages and fills in the design (look-only templates)
 *   label        { id }                         AI checks the labels of an exact-copy template
 *   save_layout  { id, name, status, labels }   save the reviewed labels of an exact-copy template
 *   save         { id, name, theme, status }    save the reviewed design
 *   set_default  { id | null }                  design for new reports (null = JT default)
 *   remove_logo  { id }
 *   delete       { id }
 */

const IS_API = true;
require __DIR__ . '/../../app/bootstrap.php';

require_method('POST');
// Admins manage every template; an Editor may edit a template that was shared with them.
$admin = require_login();
verify_csrf();
$body = read_json_body();
$action = (string) ($body['action'] ?? '');
if (in_array($action, ['set_default', 'delete'], true) && $admin['role'] !== 'admin') {
    json_error('Only an Admin can do that.', 403);
}

function find_template(mixed $id): array
{
    global $admin;
    $id = filter_var($id, FILTER_VALIDATE_INT);
    $template = $id ? template_by_id($id) : null;
    if (!$template) {
        json_error('Design not found.', 404);
    }
    if (!can_edit_template($admin, (int) $template['id'])) {
        json_error('Only an Admin, or someone this template was shared with, can change it.', 403);
    }
    return $template;
}

switch ($action) {
    case 'analyze':
        $template = find_template($body['id'] ?? null);
        if (!ai_enabled()) {
            json_error('AI analysis is off (no OpenAI key). Adjust the design by hand — the colours were already measured.', 503);
        }
        $limit = config_int('AI_DAILY_LIMIT_PER_USER', 20);
        if (ai_requests_today($admin['id']) >= $limit) {
            json_error("Today’s {$limit} AI requests are used up. Adjust the design by hand or try tomorrow.", 429);
        }
        $dir = template_dir((int) $template['id']);
        $pages = array_map(static fn($file) => $dir . '/' . $file, template_page_files((int) $template['id']));
        if (!$pages) {
            json_error('This design has no page pictures to analyse. Upload it again.', 422);
        }
        $palette = json_decode((string) @file_get_contents($dir . '/palette.json'), true) ?: [];

        try {
            $result = ai_analyze_template($pages, $palette);
        } catch (RuntimeException $error) {
            log_error('Template analysis failed: ' . $error->getMessage(), ['template' => $template['id']]);
            ai_log_usage($admin['id'], null, 0, 0, false);
            json_error('The AI could not analyse this design right now. Adjust it by hand, or try again in a minute.', 502);
        }
        ai_log_usage($admin['id'], null, $result['input_tokens'], $result['output_tokens'], true);

        // What was read from the PDF's text (labels, fonts, title style) is exact: it wins over the AI's reading of pictures.
        $read = json_decode((string) @file_get_contents($dir . '/read.json'), true);
        if (is_array($read)) {
            $result['theme'] = apply_pdf_read_facts($result['theme'], $read);
            $copied = count((array) ($read['labels'] ?? []));
            if ($copied > 0) {
                array_unshift($result['notes'], "{$copied} headings and labels were copied exactly from your PDF — check them under “Headings and wording”.");
            }
        }

        // Keep a custom logo the Admin already uploaded.
        if (template_logo_file($template)) {
            $result['theme']['brand']['logo'] = 'custom';
        } elseif ($result['theme']['brand']['logo'] === 'custom') {
            $result['notes'][] = 'This report uses its own logo — cut it out of a page (or upload it) under “Logo”. Until then the JT mark is shown.';
            $result['theme']['brand']['logo'] = 'jt';
        }

        db_run(
            'UPDATE templates SET theme = ?, analyzed_by = ?, analysis_notes = ?, updated_by = ?, updated_at = ? WHERE id = ?',
            [json_encode($result['theme'], JSON_UNESCAPED_UNICODE | JSON_UNESCAPED_SLASHES), 'ai',
                implode("\n", $result['notes']), $admin['id'], now(), $template['id']]
        );
        json_ok(template_payload(template_by_id((int) $template['id']), true));

    case 'label':
        // Exact-copy templates: the AI labels texts, photos and pages (never positions).
        $template = find_template($body['id'] ?? null);
        $layout = template_layout($template);
        if (!$layout) {
            json_error('This template is not an exact copy.', 422);
        }
        if (!ai_enabled()) {
            json_error('AI labelling is off (no OpenAI key). The labels found automatically are kept — check them on this screen.', 503);
        }
        $limit = config_int('AI_DAILY_LIMIT_PER_USER', 20);
        if (ai_requests_today($admin['id']) >= $limit) {
            json_error("Today’s {$limit} AI requests are used up. The automatic labels are kept — check them on this screen.", 429);
        }
        $dir = template_dir((int) $template['id']);
        $pictures = [];
        foreach (array_keys($layout['pages']) as $index) {
            if (is_file($dir . '/page-' . ($index + 1) . '.jpg')) {
                $pictures[] = $dir . '/page-' . ($index + 1) . '.jpg';
            }
        }
        try {
            $result = ai_label_layout($layout, $pictures);
        } catch (RuntimeException $error) {
            log_error('Layout labelling failed: ' . $error->getMessage(), ['template' => $template['id']]);
            ai_log_usage($admin['id'], null, 0, 0, false);
            json_error('The AI could not check this template right now. The automatic labels are kept — check them on this screen.', 502);
        }
        ai_log_usage($admin['id'], null, $result['input_tokens'], $result['output_tokens'], true);
        [$layout, $changes] = apply_layout_labels($layout, $result['labels']);
        save_template_layout((int) $template['id'], $layout);
        $notes = array_values(array_filter(explode("\n", (string) $template['analysis_notes'])));
        $notes[] = $changes > 0
            ? "The AI checked the labels and made {$changes} correction" . ($changes === 1 ? '' : 's') . '.'
            : 'The AI checked the labels and agreed with them.';
        $notes = array_slice(array_merge($notes, $result['notes']), 0, 10);
        db_run(
            'UPDATE templates SET analyzed_by = ?, analysis_notes = ?, updated_by = ?, updated_at = ? WHERE id = ?',
            ['ai', implode("\n", $notes), $admin['id'], now(), $template['id']]
        );
        json_ok(template_payload(template_by_id((int) $template['id']), true));

    case 'save_layout':
        $template = find_template($body['id'] ?? null);
        $layout = template_layout($template);
        if (!$layout) {
            json_error('This template is not an exact copy.', 422);
        }
        $name = clean_line($body['name'] ?? '', 120);
        if ($name === '') {
            json_error('Give the template a name.', 422, ['field' => 'name']);
        }
        [$layout, $changes] = apply_layout_labels($layout, $body['labels'] ?? []);
        $status = ($body['status'] ?? '') === 'draft' ? 'draft' : 'ready';
        if ($status === 'ready' && ($missing = layout_missing_files((int) $template['id'], $layout))) {
            json_error(count($missing) . ' page picture(s) did not finish uploading. Delete this template and upload the PDF again.', 422);
        }
        if ($status === 'draft') {
            $used = (int) (db_one('SELECT COUNT(*) AS total FROM reports WHERE template_id = ?', [$template['id']])['total'] ?? 0);
            if ($used > 0) {
                json_error("{$used} report(s) use this template, so it must stay available.", 422);
            }
        }
        save_template_layout((int) $template['id'], $layout);
        db_run('UPDATE templates SET name = ?, status = ?, updated_by = ?, updated_at = ? WHERE id = ?',
            [$name, $status, $admin['id'], now(), $template['id']]);
        json_ok(template_payload(template_by_id((int) $template['id']), true));

    case 'save':
        $template = find_template($body['id'] ?? null);
        $name = clean_line($body['name'] ?? '', 120);
        if ($name === '') {
            json_error('Give the design a name.', 422, ['field' => 'name']);
        }
        $theme = normalize_theme($body['theme'] ?? null);
        if ($theme['brand']['logo'] === 'custom' && !template_logo_file($template)) {
            $theme['brand']['logo'] = 'jt';
        }
        $status = ($body['status'] ?? '') === 'draft' ? 'draft' : 'ready';
        if ($status === 'draft') {
            $used = (int) (db_one('SELECT COUNT(*) AS total FROM reports WHERE template_id = ?', [$template['id']])['total'] ?? 0);
            if ($used > 0) {
                json_error("{$used} report(s) use this design, so it must stay available.", 422);
            }
        }
        db_run(
            'UPDATE templates SET name = ?, theme = ?, status = ?, updated_by = ?, updated_at = ? WHERE id = ?',
            [$name, json_encode($theme, JSON_UNESCAPED_UNICODE | JSON_UNESCAPED_SLASHES), $status, $admin['id'], now(), $template['id']]
        );
        json_ok(template_payload(template_by_id((int) $template['id'])));

    case 'set_default':
        $id = null;
        if (($body['id'] ?? null) !== null) {
            $template = find_template($body['id']);
            if ($template['status'] !== 'ready') {
                json_error('Finish and save this design before making it the default.', 422);
            }
            $id = (int) $template['id'];
        }
        db_run('UPDATE agency_settings SET default_template_id = ?, updated_by = ?, updated_at = ? WHERE id = 1', [$id, $admin['id'], now()]);
        json_ok(['defaultId' => $id]);

    case 'remove_logo':
        $template = find_template($body['id'] ?? null);
        if ($file = template_logo_file($template)) {
            @unlink(template_dir((int) $template['id']) . '/' . $file);
        }
        $theme = normalize_theme(json_decode((string) $template['theme'], true));
        $theme['brand']['logo'] = 'jt';
        db_run(
            'UPDATE templates SET logo_file = NULL, theme = ?, updated_by = ?, updated_at = ? WHERE id = ?',
            [json_encode($theme, JSON_UNESCAPED_UNICODE | JSON_UNESCAPED_SLASHES), $admin['id'], now(), $template['id']]
        );
        json_ok(template_payload(template_by_id((int) $template['id'])));

    case 'delete':
        $template = find_template($body['id'] ?? null);
        $id = (int) $template['id'];
        // Reports and clients that used it go back to the JT default design.
        db_run('UPDATE reports SET template_id = NULL WHERE template_id = ?', [$id]);
        db_run('UPDATE clients SET template_id = NULL WHERE template_id = ?', [$id]);
        db_run('UPDATE agency_settings SET default_template_id = NULL WHERE default_template_id = ?', [$id]);
        delete_shares('template', $id);
        db_run('DELETE FROM templates WHERE id = ?', [$id]);
        delete_template_files($id);
        json_ok(['deleted' => true]);

    default:
        json_error('Unknown action.', 400);
}
