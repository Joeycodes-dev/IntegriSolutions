import request from 'supertest';
import express from 'express';

const mockServiceSupabase = {
  from: jest.fn(),
  auth: {
    admin: {
      createUser: jest.fn(),
      deleteUser: jest.fn(),
      listUsers: jest.fn(),
    },
  },
};

jest.mock('../../src/supabase', () => ({
  supabase: {
    auth: {
      signInWithPassword: jest.fn(),
      admin: {
        createUser: jest.fn(),
        deleteUser: jest.fn(),
        listUsers: jest.fn(),
      },
      getUser: jest.fn(),
    },
  },
}));

jest.mock('@supabase/supabase-js', () => ({
  createClient: jest.fn(() => ({
    from: jest.fn(() => ({
      select: jest.fn(() => ({
        eq: jest.fn(() => ({
          limit: jest.fn(() => Promise.resolve({ data: [], error: null })),
        })),
      })),
    })),
    auth: {
      admin: {
        createUser: jest.fn(),
        deleteUser: jest.fn(),
        listUsers: jest.fn(),
      },
    },
  })),
}));

import authRoutes from '../../src/routes/auth';
import { supabase } from '../../src/supabase';

const app = express();
app.use(express.json());
app.use('/api/auth', authRoutes);

describe('Auth Routes', () => {
  beforeEach(() => {
    jest.clearAllMocks();
  });

  describe('POST /api/auth/login', () => {
    it('should return 400 when email is missing', async () => {
      const response = await request(app)
        .post('/api/auth/login')
        .send({ password: 'password123' });

      expect(response.status).toBe(400);
      expect(response.body.error).toBe('Email and password are required');
    });

    it('should return 400 when password is missing', async () => {
      const response = await request(app)
        .post('/api/auth/login')
        .send({ email: 'test@example.com' });

      expect(response.status).toBe(400);
      expect(response.body.error).toBe('Email and password are required');
    });

    it('should return 401 when credentials are invalid', async () => {
      (supabase.auth.signInWithPassword as jest.Mock).mockResolvedValue({
        data: { session: null, user: null },
        error: { message: 'Invalid credentials' },
      });

      const response = await request(app)
        .post('/api/auth/login')
        .send({ email: 'test@example.com', password: 'wrongpassword' });

      expect(response.status).toBe(401);
      expect(response.body.error).toBe('Invalid credentials');
    });

    it('should return 404 when officer profile not found', async () => {
      (supabase.auth.signInWithPassword as jest.Mock).mockResolvedValue({
        data: {
          session: { access_token: 'test-token' },
          user: { id: 'user-123' },
        },
        error: null,
      });

      const response = await request(app)
        .post('/api/auth/login')
        .send({ email: 'test@example.com', password: 'password123' });

      expect(response.status).toBe(404);
      expect(response.body.error).toBe('Profile not found. Please register first.');
    });
  });

  describe('POST /api/auth/register', () => {
    it('should return 400 when required fields are missing', async () => {
      const response = await request(app)
        .post('/api/auth/register')
        .send({ email: 'test@example.com' });

      expect(response.status).toBe(400);
      expect(response.body.error).toBe('Email, password, name, surname, badge number, and ID number are required');
    });
  });
});
