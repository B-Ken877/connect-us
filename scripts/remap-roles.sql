DO $$
BEGIN
  IF EXISTS (SELECT 1 FROM information_schema.tables WHERE table_name = 'User') THEN
    UPDATE "User" SET role = 'ADMINISTRATEUR'::"Role" WHERE role::text IN ('GESTIONNAIRE', 'SUPERVISEUR');
  END IF;
END $$;
