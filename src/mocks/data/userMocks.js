/**
 * User mock data
 * Contains mock user data for testing and development
 */

const userMocks = {
  // Test user with valid UUID
  testUser: {
    id: '123e4567-e89b-12d3-a456-426614174000', 
    email: 'prince02@mailinator.com',
    user_metadata: { 
      first_name: 'Prince', 
      last_name: 'Test' 
    },
    app_metadata: { 
      role: 'authenticated' 
    },
    aud: 'authenticated',
    created_at: new Date().toISOString()
  },
  
  // Additional mock users if needed
  mockUsers: [
    {
      id: 'f47ac10b-58cc-4372-a567-0e02b2c3d479',
      email: 'test1@example.com',
      user_metadata: { 
        first_name: 'Jane', 
        last_name: 'Doe' 
      },
      app_metadata: { 
        role: 'authenticated' 
      }
    },
    {
      id: '550e8400-e29b-41d4-a716-446655440000',
      email: 'test2@example.com',
      user_metadata: { 
        first_name: 'John', 
        last_name: 'Smith' 
      },
      app_metadata: { 
        role: 'authenticated' 
      }
    }
  ]
};

export default userMocks;
