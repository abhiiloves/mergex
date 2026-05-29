CREATE TABLE IF NOT EXISTS users (
  email VARCHAR(255) PRIMARY KEY,
  name VARCHAR(255) NOT NULL,
  password VARCHAR(255) NOT NULL,
  role ENUM('it_admin', 'admin', 'operator') NOT NULL,
  locations JSON,
  location VARCHAR(255),
  plant VARCHAR(255),
  line VARCHAR(255),
  `lines` JSON
);

CREATE TABLE IF NOT EXISTS sap_mapping (
  sap_code VARCHAR(20) PRIMARY KEY,
  description VARCHAR(255) NOT NULL
);

CREATE TABLE IF NOT EXISTS sap_remap (
  old_sap VARCHAR(20) PRIMARY KEY,
  new_sap VARCHAR(20) NOT NULL,
  FOREIGN KEY (old_sap) REFERENCES sap_mapping(sap_code),
  FOREIGN KEY (new_sap) REFERENCES sap_mapping(sap_code)
);

CREATE TABLE IF NOT EXISTS qr_logs (
  id INT AUTO_INCREMENT PRIMARY KEY,
  qr_code VARCHAR(50) NOT NULL,
  new_qr_code VARCHAR(50),
  sap_code VARCHAR(20) NOT NULL,
  old_sap_code VARCHAR(20),
  description VARCHAR(255) NOT NULL,
  month VARCHAR(2) NOT NULL,
  year VARCHAR(2) NOT NULL,
  week VARCHAR(2) NOT NULL,
  serial VARCHAR(10) NOT NULL,
  plant VARCHAR(255) NOT NULL,
  location VARCHAR(255) NOT NULL,
  line VARCHAR(255) NOT NULL,
  user_email VARCHAR(255) NOT NULL,
  timestamp BIGINT NOT NULL,
  print_status ENUM('pending', 'success', 'failed') DEFAULT 'pending'
);


CREATE TABLE IF NOT EXISTS qr_config (
  id INT PRIMARY KEY,
  length INT NOT NULL,
  pattern ENUM('numeric', 'alphanumeric') NOT NULL,
  sequenceValidation BOOLEAN NOT NULL DEFAULT FALSE,
  prefix VARCHAR(255) DEFAULT '',
  suffix VARCHAR(255) DEFAULT '',
  month_format VARCHAR(10) DEFAULT 'MM',
  year_format VARCHAR(10) DEFAULT 'YY',
  week_format VARCHAR(10) DEFAULT 'WW',
  sap_length INT DEFAULT 10,
  auto_inc_length INT DEFAULT 6,
  config_password VARCHAR(255) DEFAULT 'admin@pg123'
);

CREATE TABLE IF NOT EXISTS qr_config_plant (
  location VARCHAR(255) NOT NULL,
  plant VARCHAR(255) NOT NULL,
  length INT NOT NULL,
  pattern ENUM('numeric', 'alphanumeric') NOT NULL,
  sequenceValidation BOOLEAN NOT NULL DEFAULT FALSE,
  prefix VARCHAR(255) DEFAULT '',
  suffix VARCHAR(255) DEFAULT '',
  month_format VARCHAR(10) DEFAULT 'MM',
  year_format VARCHAR(10) DEFAULT 'YY',
  week_format VARCHAR(10) DEFAULT 'WW',
  sap_length INT DEFAULT 10,
  auto_inc_length INT DEFAULT 6,
  PRIMARY KEY (location, plant)
);

CREATE TABLE IF NOT EXISTS hierarchy (
  id INT PRIMARY KEY,
  locations JSON NOT NULL,
  plants JSON NOT NULL,
  `lines` JSON NOT NULL
);

-- Initial seed data
INSERT IGNORE INTO users (email, name, password, role, locations, location, plant, line) VALUES
('software.2040@pgel.in', 'IT Super Admin', 'it123', 'it_admin', NULL, NULL, NULL, NULL);

INSERT IGNORE INTO qr_config (id, length, pattern, sequenceValidation) VALUES
(1, 22, 'numeric', FALSE);

INSERT IGNORE INTO hierarchy (id, locations, plants, `lines`) VALUES
(1, '[]', '{}', '{}');
