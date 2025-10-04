import { test, expect } from '@playwright/test';

test.describe('CSV Upload Flow', () => {
  test.beforeEach(async ({ page }) => {
    // Mock authentication
    await page.addInitScript(() => {
      localStorage.setItem('auth-storage', JSON.stringify({
        state: {
          accessToken: 'mock-token',
          refreshToken: 'mock-refresh',
          user: { id: '1', email: 'test@example.com', name: 'Test User', role: 'ADMIN' },
          isAuthenticated: true,
        },
        version: 0,
      }));
    });
  });

  test('should show import dashboard when authenticated', async ({ page }) => {
    await page.goto('/');
    await expect(page).toHaveURL(/\/$/);
    await expect(page.locator('text=Import Dashboard')).toBeVisible();
  });

  test('should show CSV upload form', async ({ page }) => {
    await page.goto('/');
    await expect(page.locator('input[type="file"]')).toBeVisible();
    await expect(page.locator('button').filter({ hasText: 'Upload' })).toBeVisible();
  });

  test('should show recent batches table', async ({ page }) => {
    await page.goto('/');
    await expect(page.locator('table')).toBeVisible();
  });
});