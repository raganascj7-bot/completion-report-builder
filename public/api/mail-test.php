<?php

declare(strict_types=1);

/* Agency settings → "Send a test email": sends one email to the signed-in Admin and reports why it failed. */

const IS_API = true;
require __DIR__ . '/../../app/bootstrap.php';

require_method('POST');
$admin = require_admin();
verify_csrf();

if (!mail_enabled()) {
    json_error('Email is off. Fill in the MAIL_ settings in .env (see README section 6), then try again.', 422);
}
$sent = send_mail(
    (string) $admin['email'],
    (string) $admin['name'],
    'Test email from the Completion Report Builder',
    "Hi {$admin['name']},\n\nEmail sending works. Invitations and share notices will be emailed from now on.",
    mail_html('Email sending works', '<p>Hi ' . e($admin['name']) . ',</p><p>Invitations and share notices will be emailed from now on.</p>', '', '')
);
if (!$sent) {
    // The mail server's own words help most (wrong app password, blocked port…); passwords are never part of them.
    json_error('The test email could not be sent: ' . mail_last_error(), 502);
}
json_ok(['sentTo' => $admin['email'], 'driver' => mail_driver()]);
