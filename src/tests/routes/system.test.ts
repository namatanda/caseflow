import { describe, it, expect, vi, beforeEach } from 'vitest';
import request from 'supertest';
import express from 'express';
import { systemRoutes } from '@/routes/system';

// Mock the system controller
vi.mock('@/controllers/system', () => ({
  systemController: {
    healthCheck: vi.fn((req, res) => {
      res.status(200).json({
        status: 'ok',
        timestamp: new Date().toISOString(),
        uptime: 123.45,
        environment: 'test',
        version: '1.0.0',
      });
    }),
    detailedHealthCheck: vi.fn((req, res) => {
      res.status(200).json({
        healthy: true,
        timestamp: new Date().toISOString(),
        checks: {
          database: true,
          redis: true,
          memory: true,
          disk: true,
        },
      });
    }),
    metrics: vi.fn((req, res) => {
      res.set('Content-Type', 'text/plain; version=0.0.4; charset=utf-8');
      res.status(200).send('# Prometheus metrics');
    }),
    version: vi.fn((req, res) => {
      res.status(200).json({
        name: 'CourtFlow Backend API',
        version: '1.0.0',
        apiVersion: 'v1',
        nodeVersion: process.version,
        environment: 'test',
        buildDate: new Date().toISOString(),
      });
    }),
  },
}));

describe('System Routes', () => {
  let app: express.Application;

  beforeEach(() => {
    app = express();
    app.use('/system', systemRoutes);
  });

  describe('GET /system/health', () => {
    it('should return health status', async () => {
      const response = await request(app)
        .get('/system/health')
        .expect(200);

      expect(response.body).toEqual(
        expect.objectContaining({
          status: 'ok',
          timestamp: expect.any(String),
          uptime: expect.any(Number),
          environment: 'test',
          version: expect.any(String),
        })
      );
    });
  });

  describe('GET /system/health/detailed', () => {
    it('should return detailed health status', async () => {
      const response = await request(app)
        .get('/system/health/detailed')
        .expect(200);

      expect(response.body).toEqual(
        expect.objectContaining({
          healthy: true,
          timestamp: expect.any(String),
          checks: expect.objectContaining({
            database: expect.any(Boolean),
            redis: expect.any(Boolean),
            memory: expect.any(Boolean),
            disk: expect.any(Boolean),
          }),
        })
      );
    });
  });

  describe('GET /system/metrics', () => {
    it('should return Prometheus metrics', async () => {
      const response = await request(app)
        .get('/system/metrics')
        .expect(200);

      expect(response.headers['content-type']).toBe('text/plain; charset=utf-8; version=0.0.4');
      expect(response.text).toBe('# Prometheus metrics');
    });
  });

  describe('GET /system/version', () => {
    it('should return version information', async () => {
      const response = await request(app)
        .get('/system/version')
        .expect(200);

      expect(response.body).toEqual(
        expect.objectContaining({
          name: 'CourtFlow Backend API',
          version: expect.any(String),
          apiVersion: 'v1',
          nodeVersion: expect.any(String),
          environment: 'test',
          buildDate: expect.any(String),
        })
      );
    });
  });
});