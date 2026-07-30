-- Dedicated admin profile table. Run after core schema.
CREATE TABLE IF NOT EXISTS admin_users (
  admin_id BIGSERIAL PRIMARY KEY,
  admin_email_address TEXT NOT NULL UNIQUE,
  admin_name TEXT NOT NULL,
  admin_surname TEXT NOT NULL,
  admin_id_number BIGINT NOT NULL,
  badge_number TEXT NOT NULL,
  employment_status TEXT NOT NULL DEFAULT 'Active',
  province TEXT NOT NULL DEFAULT '',
  region TEXT NOT NULL DEFAULT '',
  officer_type_id INTEGER NOT NULL DEFAULT 1,
  role_id INTEGER NOT NULL DEFAULT 3 CHECK (role_id = 3),
  created_at TIMESTAMPTZ NOT NULL DEFAULT NOW()
);

CREATE INDEX IF NOT EXISTS idx_admin_users_email ON admin_users (admin_email_address);
CREATE INDEX IF NOT EXISTS idx_admin_users_status ON admin_users (employment_status);

-- Move legacy admins that were stored in officer_users with role_id = 3.
INSERT INTO admin_users (
  admin_id,
  admin_email_address,
  admin_name,
  admin_surname,
  admin_id_number,
  badge_number,
  employment_status,
  province,
  region,
  officer_type_id,
  role_id,
  created_at
)
SELECT
  officer_id,
  officer_email_address,
  officer_name,
  officer_surname,
  officer_id_number,
  badge_number,
  officer_employment_status,
  province,
  region,
  officer_type_id,
  3,
  created_at
FROM officer_users
WHERE role_id = 3
ON CONFLICT (admin_email_address) DO NOTHING;

SELECT setval(
  pg_get_serial_sequence('admin_users', 'admin_id'),
  GREATEST(COALESCE((SELECT MAX(admin_id) FROM admin_users), 1), 1),
  (SELECT COUNT(*) > 0 FROM admin_users)
);

DELETE FROM officer_users
WHERE role_id = 3
  AND EXISTS (
    SELECT 1
    FROM admin_users
    WHERE admin_users.admin_email_address = officer_users.officer_email_address
  );