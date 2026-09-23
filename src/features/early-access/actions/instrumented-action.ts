import * as Sentry from '@sentry/nextjs';
import { headers } from 'next/headers';
import type { ErrorReporter } from '../../../core/ports/error-reporter.port';
import { getErrorReporter } from '../early-access.wiring';

/**
 * The shared shell of every early-access Server Action: a Sentry span around
 * the work, and a guarantee that whatever fails comes back as the action's
 * polite retry state, reported, rather than as a thrown error the form cannot
 * render.
 *
 * Turbopack builds carry no automatic Server Action instrumentation, so the
 * span is opened here. Only the request headers are handed over (for trace
 * continuation) — never the action's arguments, which hold the address, the
 * CAPTCHA token or the raw management token, and never the response (§24).
 *
 * Two nets, because two different things can fail (R-08):
 * - `wiring` — the work itself, most often `buildContext()` rejecting a
 *   missing credential. The handlers catch their own domain failures; this
 *   catches what happens before they are reached.
 * - `instrumentation` — the monitoring around the work: `headers()`
 *   rejecting, or the Sentry wrapper throwing before or after the callback.
 *   Observability must never be the reason a visitor sees a broken form.
 *
 * None of these actions redirect or call `notFound()`, so the outer catch
 * cannot swallow Next.js control flow.
 */
export async function runInstrumentedAction<State>(
  name: string,
  operation: string,
  retryState: State,
  run: (reporter: ErrorReporter) => Promise<State>,
): Promise<State> {
  const reporter = getErrorReporter();
  const fail = (error: unknown, status: string): State => {
    reporter.captureException(error, { operation, status });
    return retryState;
  };
  try {
    return await Sentry.withServerActionInstrumentation(
      name,
      { headers: await headers(), recordResponse: false },
      async (): Promise<State> => {
        try {
          return await run(reporter);
        } catch (error) {
          return fail(error, 'wiring');
        }
      },
    );
  } catch (error) {
    return fail(error, 'instrumentation');
  }
}
