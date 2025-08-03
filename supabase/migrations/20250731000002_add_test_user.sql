-- Add test user for development environment
DO $$
BEGIN
  -- Only add test user if it doesn't exist
  IF NOT EXISTS (
    SELECT 1 FROM auth.users 
    WHERE id = '123e4567-e89b-12d3-a456-426614174000'
  ) THEN
    INSERT INTO auth.users (
      id,
      instance_id,
      email,
      encrypted_password,
      email_confirmed_at,
      created_at,
      updated_at,
      raw_app_meta_data,
      raw_user_meta_data,
      is_super_admin,
      role_id
    ) VALUES (
      '123e4567-e89b-12d3-a456-426614174000',  -- id (matches our mock user)
      '00000000-0000-0000-0000-000000000000',  -- instance_id
      'prince02@mailinator.com',                -- email
      '$2a$10$Q7RNHN.ZzZ3z3X3X3X3X3.Q7RNHN.ZzZ3z3X3X3X3X3X3X3X3',  -- encrypted_password (bcrypt hash)
      NOW(),                                    -- email_confirmed_at
      NOW(),                                    -- created_at
      NOW(),                                    -- updated_at
      '{"provider": "email", "providers": ["email"]}',  -- raw_app_meta_data
      '{"first_name": "Prince", "last_name": "Test"}',  -- raw_user_meta_data
      false,                                    -- is_super_admin
      1                                         -- role_id (1 is authenticated)
    );
  END IF;
END $$;
