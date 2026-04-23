DO $$ 
DECLARE
  uid_gustavo uuid := gen_random_uuid();
  uid_comerc uuid := gen_random_uuid();
  uid_sdr1 uuid := gen_random_uuid();
  uid_sdr2 uuid := gen_random_uuid();
  hash_123456 text := '$2a$10$AONjQ189bS88I/DDEc5Q7.0T./Sntm6zQpW9f0pB0T2Kj3nI1jFhe';
BEGIN
  -- Insert into auth.users (simplificado)
  INSERT INTO auth.users (id, instance_id, email, aud, role, encrypted_password, email_confirmed_at, created_at, updated_at)
  VALUES 
    (uid_gustavo, '00000000-0000-0000-0000-000000000000', 'gustavog.macedo16@gmail.com', 'authenticated', 'authenticated', hash_123456, now(), now(), now()),
    (uid_comerc, '00000000-0000-0000-0000-000000000000', 'comercial@guilds.com.br', 'authenticated', 'authenticated', hash_123456, now(), now(), now()),
    (uid_sdr1, '00000000-0000-0000-0000-000000000000', 'sdr1@guilds.com.br', 'authenticated', 'authenticated', hash_123456, now(), now(), now()),
    (uid_sdr2, '00000000-0000-0000-0000-000000000000', 'sdr2@guilds.com.br', 'authenticated', 'authenticated', hash_123456, now(), now(), now())
  ON CONFLICT DO NOTHING;

  -- Insert into public.profiles
  INSERT INTO public.profiles (id, email, display_name, role)
  VALUES
    ((select id from auth.users where email='gustavog.macedo16@gmail.com'), 'gustavog.macedo16@gmail.com', 'Gustavo Macedo', 'gestor'),
    ((select id from auth.users where email='comercial@guilds.com.br'), 'comercial@guilds.com.br', 'Comercial', 'comercial'),
    ((select id from auth.users where email='sdr1@guilds.com.br'), 'sdr1@guilds.com.br', 'SDR 1', 'sdr'),
    ((select id from auth.users where email='sdr2@guilds.com.br'), 'sdr2@guilds.com.br', 'SDR 2', 'sdr')
  ON CONFLICT DO NOTHING;
END $$;
