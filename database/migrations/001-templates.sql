-- Adds report templates to a database created with the first version of
-- schema.sql. Run it ONCE: phpMyAdmin → select the database → Import.
-- (A fresh install doesn't need this: schema.sql already includes it.)

CREATE TABLE IF NOT EXISTS templates (
    id             INT UNSIGNED AUTO_INCREMENT PRIMARY KEY,
    name           VARCHAR(120) NOT NULL,
    status         ENUM('draft', 'ready') NOT NULL DEFAULT 'draft',
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

ALTER TABLE clients
    ADD COLUMN template_id INT UNSIGNED NULL AFTER breakdown_preset,
    ADD CONSTRAINT fk_clients_template FOREIGN KEY (template_id) REFERENCES templates (id) ON DELETE SET NULL;

ALTER TABLE reports
    ADD COLUMN template_id INT UNSIGNED NULL AFTER status,
    ADD CONSTRAINT fk_reports_template FOREIGN KEY (template_id) REFERENCES templates (id) ON DELETE SET NULL;

ALTER TABLE agency_settings
    ADD COLUMN default_template_id INT UNSIGNED NULL AFTER office_image_file;
