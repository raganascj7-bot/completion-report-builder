<?php

declare(strict_types=1);

require __DIR__ . '/../app/bootstrap.php';

require_admin();
$settings = agency_settings();
$aiThisMonth = db_one(
    'SELECT COUNT(*) AS requests, COALESCE(SUM(input_tokens), 0) AS input_tokens, COALESCE(SUM(output_tokens), 0) AS output_tokens
     FROM ai_usage WHERE created_at >= ?',
    [date('Y-m-01 00:00:00')]
);

$fields = [
    'Contractor (page 2)' => [
        'contractor_name' => ['Company name', 'text', 150],
        'contractor_address' => ['Address', 'textarea', 300],
        'closing_note' => ['Closing note', 'textarea', 500],
    ],
    'Prepared by (cover and sign-off)' => [
        'prepared_by_name' => ['Name', 'text', 150],
        'prepared_by_company' => ['Company', 'text', 150],
    ],
    'Contact Us page' => [
        'viber_name' => ['Viber name', 'text', 100],
        'viber_number' => ['Viber number', 'text', 50],
        'email' => ['Email', 'email', 150],
        'website' => ['Website', 'text', 150],
        'location' => ['Location', 'textarea', 200],
    ],
];

page_top('Agency settings', 'settings');
?>
<main class="page narrow" id="main">
    <h1>Agency settings</h1>
    <p class="muted">These details are copied into every <em>new</em> report. Existing reports keep what they had, so old PDFs never change.</p>

    <form id="settingsForm" class="stack" novalidate>
        <?php foreach ($fields as $legend => $group): ?>
            <fieldset class="card fieldset">
                <legend><?= e($legend) ?></legend>
                <div class="stack">
                <?php foreach ($group as $name => [$label, $type, $max]): ?>
                    <label><?= e($label) ?>
                        <?php if ($type === 'textarea'): ?>
                            <textarea name="<?= e($name) ?>" rows="2" maxlength="<?= $max ?>"><?= e($settings[$name]) ?></textarea>
                        <?php else: ?>
                            <input type="<?= e($type) ?>" name="<?= e($name) ?>" maxlength="<?= $max ?>" value="<?= e($settings[$name]) ?>">
                        <?php endif; ?>
                    </label>
                <?php endforeach; ?>
                </div>
            </fieldset>
        <?php endforeach; ?>
        <p class="form-error" data-form-error hidden></p>
        <div><button type="submit" class="btn btn-primary">Save settings</button></div>
    </form>

    <section class="card">
        <h2>Default photos</h2>
        <p class="muted small">Copied into each new report. You can still change them per report.</p>
        <div class="photo-settings">
            <?php foreach (['cover' => 'Cover photo', 'office' => 'Office photo (Contact Us page)'] as $kind => $label): ?>
                <?php $hasFile = !empty($settings[$kind . '_image_file']); ?>
                <figure class="photo-setting">
                    <div class="photo-frame">
                        <img data-photo-preview="<?= $kind ?>" alt="<?= e($label) ?>"
                             src="<?= $hasFile ? 'api/image.php?agency=' . $kind . '&amp;v=' . e((string) strtotime((string) $settings['updated_at'])) : '' ?>"<?= $hasFile ? '' : ' hidden' ?>>
                        <span class="muted small" data-photo-empty="<?= $kind ?>"<?= $hasFile ? ' hidden' : '' ?>>No photo yet</span>
                    </div>
                    <figcaption><?= e($label) ?></figcaption>
                    <label class="btn btn-secondary btn-sm file-button">Choose image
                        <input type="file" accept="image/jpeg,image/png,image/webp" data-photo-input="<?= $kind ?>">
                    </label>
                </figure>
            <?php endforeach; ?>
        </div>
    </section>

    <section class="card">
        <h2>Email</h2>
        <?php if (!mail_enabled()): ?>
            <p class="muted">Email is off, so invitations show a link to copy instead. To send emails from a Gmail account, fill in the
                <code>MAIL_</code> settings in <code>.env</code> (README, section 6), then come back and send a test.</p>
        <?php else: ?>
            <p>Emails are sent from <strong><?= e((string) config('MAIL_FROM', config('MAIL_USERNAME', ''))) ?></strong>
                <?= mail_driver() === 'log' ? '(test mode: saved in storage/logs/mail/, not sent)' : 'through ' . e((string) config('MAIL_HOST')) ?>.</p>
            <button type="button" class="btn btn-secondary btn-sm" id="btnMailTest">Send a test email to me</button>
        <?php endif; ?>
    </section>

    <section class="card">
        <h2>AI usage this month</h2>
        <?php if (!ai_enabled()): ?>
            <p class="muted">AI drafting is off. Add OPENAI_API_KEY to the .env file to turn it on.</p>
        <?php else: ?>
            <p><?= (int) $aiThisMonth['requests'] ?> drafts · <?= number_format((int) $aiThisMonth['input_tokens']) ?> input tokens · <?= number_format((int) $aiThisMonth['output_tokens']) ?> output tokens · model <code><?= e(ai_model()) ?></code></p>
            <p class="muted small">Check the exact cost in your OpenAI dashboard, and keep a monthly budget limit there.</p>
        <?php endif; ?>
    </section>

    <section class="card">
        <h2>Backup</h2>
        <p class="muted small">Downloads a .zip with the whole database (as SQL) and every uploaded image. Do this at least once a month and keep the file somewhere safe.</p>
        <a class="btn btn-secondary" href="api/backup.php">Download backup</a>
    </section>
</main>
<?php
page_bottom(['js/pages/settings.js']);
