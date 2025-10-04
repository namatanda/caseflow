import { test, expect } from '@playwright/test';

test.describe('Navigation', () => {
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

  test('should navigate to import dashboard', async ({ page }) => {
    await page.goto('/');
    await expect(page.locator('text=Import Dashboard')).toBeVisible();
  });

  test('should navigate to profile page', async ({ page }) => {
    await page.goto('/profile');
    await expect(page.locator('text=Profile')).toBeVisible();
  });

  test('should navigate to system dashboard', async ({ page }) => {
    await page.goto('/system');
    await expect(page.locator('text=System Dashboard')).toBeVisible();
  });

  test('should handle 404 and redirect to home', async ({ page }) => {
    await page.goto('/nonexistent');
    await expect(page).toHaveURL(/\/$/);
  });
});