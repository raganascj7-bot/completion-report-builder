<?php

declare(strict_types=1);

require __DIR__ . '/../app/bootstrap.php';

redirect(current_user() ? 'reports.php' : 'login.php');
