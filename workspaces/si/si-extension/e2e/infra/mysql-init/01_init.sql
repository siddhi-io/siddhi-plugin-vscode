USE si_test_db;

CREATE TABLE IF NOT EXISTS cdc_test_table (
    item_id       VARCHAR(50)  NOT NULL,
    item_name     VARCHAR(100) NOT NULL,
    quantity      INT          NOT NULL DEFAULT 0,
    updated_at    TIMESTAMP    NOT NULL DEFAULT CURRENT_TIMESTAMP ON UPDATE CURRENT_TIMESTAMP,
    row_version   BIGINT       NOT NULL DEFAULT 0,
    PRIMARY KEY (item_id)
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4;

CREATE TRIGGER cdc_test_before_insert BEFORE INSERT ON cdc_test_table
    FOR EACH ROW SET NEW.row_version = UNIX_TIMESTAMP(NOW(3)) * 1000;

CREATE TRIGGER cdc_test_before_update BEFORE UPDATE ON cdc_test_table
    FOR EACH ROW SET NEW.row_version = UNIX_TIMESTAMP(NOW(3)) * 1000;

GRANT SELECT ON si_test_db.cdc_test_table TO 'sitest'@'%';
FLUSH PRIVILEGES;
