import { describe, expect, it, vi } from 'vitest';

vi.mock('server-only', () => ({}));

import { consumeManagementTokenFromFragment } from './manage-token-bridge';

describe('consumeManagementTokenFromFragment', () => {
  it('removes the fragment from the visible URL before returning the token', () => {
    const replaceState = vi.fn();
    const location = {
      hash: '#opaque-token',
      pathname: '/early-access/manage',
      search: '?ignored=1',
    };
    replaceState.mockImplementation(() => {
      location.hash = '';
    });

    const token = consumeManagementTokenFromFragment(location, replaceState);

    expect(replaceState).toHaveBeenCalledWith(null, '', '/early-access/manage?ignored=1');
    expect(token).toBe('opaque-token');
  });

  it('returns null without history mutation when no fragment exists', () => {
    const replaceState = vi.fn();

    expect(
      consumeManagementTokenFromFragment(
        { hash: '', pathname: '/early-access/manage', search: '' },
        replaceState,
      ),
    ).toBeNull();
    expect(replaceState).not.toHaveBeenCalled();
  });
});
