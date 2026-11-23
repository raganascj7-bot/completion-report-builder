-- Completion Report Builder — database schema (MySQL 8 / MariaDB 10.4+)
-- 1. Create an empty database first (phpMyAdmin > Databases, collation
--    utf8mb4_unicode_ci). On shared hosting the panel names it for you.
-- 2. Select that database, then import this file (Import tab).
-- 3. Open setup.php in the browser to create the first Admin account.

-- People who can sign in. Accounts are deactivated, never deleted,
-- so every report keeps its author.
CREATE TABLE IF NOT EXISTS users (
    id                   INT UNSIGNED AUTO_INCREMENT PRIMARY KEY,
    name                 VARCHAR(100) NOT NULL,
    email                VARCHAR(150) NOT NULL,
    password_hash        VARCHAR(255) NOT NULL,
    role                 ENUM('admin', 'editor') NOT NULL DEFAULT 'editor',
    is_active            TINYINT(1) NOT NULL DEFAULT 1,
    must_change_password TINYINT(1) NOT NULL DEFAULT 1,
    failed_logins        INT UNSIGNED NOT NULL DEFAULT 0,
    locked_until         DATETIME NULL,
    invite_token_hash    CHAR(64) NULL,
    invite_expires_at    DATETIME NULL,
    invited_at           DATETIME NULL,
    last_login_at        DATETIME NULL,
    created_at           DATETIME NOT NULL,
    updated_at           DATETIME NOT NULL,
    UNIQUE KEY uq_users_email (email)
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_unicode_ci;

-- Report designs. kind 'theme' = colours, fonts, layouts, labels on the TOLE pages;
-- kind 'layout' = an exact copy of an uploaded PDF (storage/templates/<id>/layout.json);
-- it never changes report data. Files: storage/templates/<id>/.
CREATE TABLE IF NOT EXISTS templates (
    id             INT UNSIGNED AUTO_INCREMENT PRIMARY KEY,
    name           VARCHAR(120) NOT NULL,
    status         ENUM('draft', 'ready') NOT NULL DEFAULT 'draft',
    kind           ENUM('theme', 'layout') NOT NULL DEFAULT 'theme',
    theme          LONGTEXT NOT NULL,
    source_name    VARCHAR(255) NOT NULL DEFAULT '',
    logo_file      VARCHAR(80) NULL,
    analyzed_by    VARCHAR(20) NOT NULL DEFAULT 'manual',
    analysis_notes TEXT NULL,
    created_by     INT UNSIGNED NOT NULL,
    updated_by     INT UNSIGNED NOT NULL,
    created_at     DATETIME NOT NULL,
    updated_at     DATETIME NOT NULL,
    CONSTRAINT fk_templates_created_by FOREIGN KEY (created_by) REFERENCES users (id)
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_unicode_ci;

-- One row per agency client. The text here pre-fills every new report
-- for that client ("client preset").
CREATE TABLE IF NOT EXISTS clients (
    id                  INT UNSIGNED AUTO_INCREMENT PRIMARY KEY,
    name                VARCHAR(150) NOT NULL,
    cover_display       VARCHAR(200) NOT NULL DEFAULT '',
    approver_name       VARCHAR(150) NOT NULL DEFAULT '',
    approver_position   VARCHAR(200) NOT NULL DEFAULT '',
    approver_department VARCHAR(200) NOT NULL DEFAULT '',
    project_names       TEXT NULL,
    project_description TEXT NULL,
    breakdown_preset    LONGTEXT NULL,
    template_id         INT UNSIGNED NULL,
    is_active           TINYINT(1) NOT NULL DEFAULT 1,
    created_at          DATETIME NOT NULL,
    updated_at          DATETIME NOT NULL,
    UNIQUE KEY uq_clients_name (name),
    CONSTRAINT fk_clients_template FOREIGN KEY (template_id) REFERENCES templates (id) ON DELETE SET NULL
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_unicode_ci;

-- Reports belong to the agency, so every signed-in user can see them.
-- "data" holds the report text as JSON; images live in report_images.
CREATE TABLE IF NOT EXISTS reports (
    id          INT UNSIGNED AUTO_INCREMENT PRIMARY KEY,
    report_uid  VARCHAR(40) NOT NULL,
    client_id   INT UNSIGNED NULL,
    client_name VARCHAR(150) NOT NULL,
    month       TINYINT UNSIGNED NOT NULL,
    year        SMALLINT UNSIGNED NOT NULL,
    status      ENUM('draft', 'final') NOT NULL DEFAULT 'draft',
    template_id INT UNSIGNED NULL,
    version     INT UNSIGNED NOT NULL DEFAULT 1,
    data        LONGTEXT NOT NULL,
    created_by  INT UNSIGNED NOT NULL,
    updated_by  INT UNSIGNED NOT NULL,
    created_at  DATETIME NOT NULL,
    updated_at  DATETIME NOT NULL,
    UNIQUE KEY uq_reports_uid (report_uid),
    KEY idx_reports_client_period (client_id, year, month),
    KEY idx_reports_updated (updated_at),
    CONSTRAINT fk_reports_client FOREIGN KEY (client_id) REFERENCES clients (id) ON DELETE SET NULL,
    CONSTRAINT fk_reports_template FOREIGN KEY (template_id) REFERENCES templates (id) ON DELETE SET NULL,
    CONSTRAINT fk_reports_created_by FOREIGN KEY (created_by) REFERENCES users (id),
    CONSTRAINT fk_reports_updated_by FOREIGN KEY (updated_by) REFERENCES users (id)
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_unicode_ci;

-- Every image in a report is a file in storage/uploads/<report id>/.
-- Where it appears (slot, order, caption) is stored in reports.data.
CREATE TABLE IF NOT EXISTS report_images (
    id          INT UNSIGNED AUTO_INCREMENT PRIMARY KEY,
    report_id   INT UNSIGNED NOT NULL,
    file_name   VARCHAR(80) NOT NULL,
    mime        VARCHAR(30) NOT NULL,
    width       INT UNSIGNED NOT NULL,
    height      INT UNSIGNED NOT NULL,
    bytes       INT UNSIGNED NOT NULL,
    uploaded_by INT UNSIGNED NOT NULL,
    created_at  DATETIME NOT NULL,
    KEY idx_images_report (report_id),
    CONSTRAINT fk_images_report FOREIGN KEY (report_id) REFERENCES reports (id) ON DELETE CASCADE
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_unicode_ci;

-- Exactly one row (id = 1): details that repeat on every report.
CREATE TABLE IF NOT EXISTS agency_settings (
    id                  TINYINT UNSIGNED PRIMARY KEY,
    contractor_name     VARCHAR(150) NOT NULL DEFAULT '',
    contractor_address  VARCHAR(300) NOT NULL DEFAULT '',
    prepared_by_name    VARCHAR(150) NOT NULL DEFAULT '',
    prepared_by_company VARCHAR(150) NOT NULL DEFAULT '',
    closing_note        VARCHAR(500) NOT NULL DEFAULT '',
    viber_name          VARCHAR(100) NOT NULL DEFAULT '',
    viber_number        VARCHAR(50) NOT NULL DEFAULT '',
    email               VARCHAR(150) NOT NULL DEFAULT '',
    website             VARCHAR(150) NOT NULL DEFAULT '',
    location            VARCHAR(200) NOT NULL DEFAULT '',
    cover_image_file    VARCHAR(80) NULL,
    office_image_file   VARCHAR(80) NULL,
    default_template_id INT UNSIGNED NULL,
    updated_by          INT UNSIGNED NULL,
    updated_at          DATETIME NULL
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_unicode_ci;

-- Reports and templates handed to a team member ("Shared with me").
CREATE TABLE IF NOT EXISTS shares (
    id          INT UNSIGNED AUTO_INCREMENT PRIMARY KEY,
    item_type   ENUM('report', 'template') NOT NULL,
    item_id     INT UNSIGNED NOT NULL,
    user_id     INT UNSIGNED NOT NULL,
    shared_by   INT UNSIGNED NOT NULL,
    note        VARCHAR(500) NOT NULL DEFAULT '',
    created_at  DATETIME NOT NULL,
    seen_at     DATETIME NULL,
    UNIQUE KEY uq_share (item_type, item_id, user_id),
    KEY idx_share_user (user_id, created_at),
    CONSTRAINT fk_shares_user FOREIGN KEY (user_id) REFERENCES users (id),
    CONSTRAINT fk_shares_by FOREIGN KEY (shared_by) REFERENCES users (id)
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_unicode_ci;

-- One row per AI request, so the Admin can watch the monthly cost.
CREATE TABLE IF NOT EXISTS ai_usage (
    id            INT UNSIGNED AUTO_INCREMENT PRIMARY KEY,
    user_id       INT UNSIGNED NOT NULL,
    report_id     INT UNSIGNED NULL,
    model         VARCHAR(60) NOT NULL,
    input_tokens  INT UNSIGNED NOT NULL DEFAULT 0,
    output_tokens INT UNSIGNED NOT NULL DEFAULT 0,
    succeeded     TINYINT(1) NOT NULL DEFAULT 1,
    created_at    DATETIME NOT NULL,
    KEY idx_ai_user_day (user_id, created_at)
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_unicode_ci;

-- Agency details from the TOLE August 2026 report. Edit them later in
-- Agency settings.
INSERT IGNORE INTO agency_settings
    (id, contractor_name, contractor_address, prepared_by_name, prepared_by_company, closing_note,
     viber_name, viber_number, email, website, location)
VALUES (1, 'JT Digital Marketing Services',
        'Joel Casipong Apt 3, Brgy. Looc\nLapu-Lapu City, Cebu, Philippines 6015',
        'Jeah Tradio', 'JT Digital Marketing Services',
        'Thank you and we assure you our best services again.',
        'Jeah Tradio', '+63 945 561 6280', 'hello@jtdigitalmarketingservices.com',
        'jtdigitalmarketingservices.com', 'Lapu-Lapu City, Cebu\nPhilippines 6015');
