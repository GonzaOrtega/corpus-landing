import { afterEach, describe, expect, it, vi } from 'vitest';

afterEach(() => {
  vi.restoreAllMocks();
  vi.doUnmock('@/src/config/sentry-client');
  vi.doUnmock('react');
  vi.resetModules();
});

describe('reportClientRenderError', () => {
  it('starts the Sentry client on demand and captures the error', async () => {
    const captureBoundaryError = vi.fn();
    vi.doMock('@/src/config/sentry-client', () => ({ captureBoundaryError }));

    const { reportClientRenderError } = await import('./global-error');
    const error = new Error('root layout failed');

    reportClientRenderError(error);

    await vi.waitFor(() => expect(captureBoundaryError).toHaveBeenCalledWith(error));
  });

  it('logs to the console instead of throwing when the lazy chunk fails to load', async () => {
    vi.doMock('@/src/config/sentry-client', () => {
      throw new Error('chunk load failed');
    });
    const consoleError = vi.spyOn(console, 'error').mockImplementation(() => {});

    const { reportClientRenderError } = await import('./global-error');

    expect(() => reportClientRenderError(new Error('root layout failed'))).not.toThrow();
    await vi.waitFor(() => expect(consoleError).toHaveBeenCalled());
  });
});

/**
 * No DOM in this suite (docs/quality/testing.md), so the page is called as a
 * plain function with `useEffect` made synchronous — the same approach as
 * signup-form.test.tsx. That is enough to prove the two things that matter:
 * rendering the page reports the error, and the button calls `retry`
 * (R-17/R-36). Without it, deleting the reporting effect stayed green.
 */
async function loadPage() {
  const captureBoundaryError = vi.fn();
  vi.doMock('@/src/config/sentry-client', () => ({ captureBoundaryError }));
  vi.doMock('react', async (importOriginal) => ({
    ...(await importOriginal<typeof import('react')>()),
    useEffect: (effect: () => void) => {
      effect();
    },
  }));
  const page = await import('./global-error');
  return { Page: page.default, captureBoundaryError };
}

interface ElementLike {
  type: unknown;
  props: { children?: unknown; onClick?: () => void };
}

function findButton(node: unknown): ElementLike | undefined {
  if (Array.isArray(node)) {
    for (const child of node) {
      const found = findButton(child);
      if (found) return found;
    }
    return undefined;
  }
  if (node === null || typeof node !== 'object' || !('props' in node)) return undefined;
  const element = node as ElementLike;
  if (element.type === 'button') return element;
  return findButton(element.props.children);
}

describe('GlobalError', () => {
  it('reports the boundary error when it renders', async () => {
    const { Page, captureBoundaryError } = await loadPage();
    const error = new Error('root layout failed');

    Page({ error, retry: vi.fn() });

    await vi.waitFor(() => expect(captureBoundaryError).toHaveBeenCalledWith(error));
  });

  it('calls retry from the Try again button', async () => {
    const { Page } = await loadPage();
    const retry = vi.fn();

    const button = findButton(Page({ error: new Error('x'), retry }));
    button?.props.onClick?.();

    expect(button?.props.children).toBe('Try again');
    expect(retry).toHaveBeenCalledTimes(1);
  });
});
