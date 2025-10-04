import { describe, it, expect, beforeEach } from 'vitest';
import { useAuthStore } from '../store/authStore';

describe('useAuthStore', () => {
  beforeEach(() => {
    // Clear localStorage and reset store
    localStorage.clear();
    useAuthStore.getState().logout();
  });

  it('should initialize with default state', () => {
    const state = useAuthStore.getState();

    expect(state.user).toBeNull();
    expect(state.accessToken).toBeNull();
    expect(state.refreshToken).toBeNull();
    expect(state.isAuthenticated).toBe(false);
  });

  it('should set tokens and mark as authenticated', () => {
    const { setTokens } = useAuthStore.getState();

    setTokens('access-token', 'refresh-token');

    const state = useAuthStore.getState();
    expect(state.accessToken).toBe('access-token');
    expect(state.refreshToken).toBe('refresh-token');
    expect(state.isAuthenticated).toBe(true);
  });

  it('should set user data', () => {
    const { setUser } = useAuthStore.getState();
    const user = {
      id: '1',
      email: 'test@example.com',
      name: 'Test User',
      role: 'ADMIN' as const,
    };

    setUser(user);

    const state = useAuthStore.getState();
    expect(state.user).toEqual(user);
    expect(state.isAuthenticated).toBe(true);
  });

  it('should logout and clear state', () => {
    const { setTokens, setUser, logout } = useAuthStore.getState();

    // Set some data
    setTokens('access-token', 'refresh-token');
    setUser({
      id: '1',
      email: 'test@example.com',
      name: 'Test User',
      role: 'ADMIN',
    });

    // Logout
    logout();

    const state = useAuthStore.getState();
    expect(state.user).toBeNull();
    expect(state.accessToken).toBeNull();
    expect(state.refreshToken).toBeNull();
    expect(state.isAuthenticated).toBe(false);
  });

  it('should persist state to localStorage', () => {
    const { setTokens, setUser } = useAuthStore.getState();
    const user = {
      id: '1',
      email: 'test@example.com',
      name: 'Test User',
      role: 'ADMIN' as const,
    };

    setTokens('access-token', 'refresh-token');
    setUser(user);

    // Check localStorage
    const stored = localStorage.getItem('auth-storage');
    expect(stored).toBeTruthy();

    const parsed = JSON.parse(stored!);
    expect(parsed.state.accessToken).toBe('access-token');
    expect(parsed.state.refreshToken).toBe('refresh-token');
    expect(parsed.state.user).toEqual(user);
    expect(parsed.state.isAuthenticated).toBe(true);
  });
});