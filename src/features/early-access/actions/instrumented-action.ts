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
 * Observability must not rewrite history either (R-04): the wrapper flushes
 * its span in its own `finally`, so it can fail *after* the work already
 * settled. `settled` holds that outcome, and the outer net returns it —
 * reporting the instrumentation fault all the same. Only a fault that lands
 * before the work finishes can produce the retry state, because only then is
 * there no outcome to tell the visitor about. Downgrading a completed signup
 * to "please try again" would invite a duplicate submission and a second
 * confirmation mail for someone already on the list.
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
  const report = (error: unknown, status: string): void => {
    reporter.captureException(error, { operation, status });
  };
  let settled: { readonly state: State } | undefined;
  try {
    return await Sentry.withServerActionInstrumentation(
      name,
      { headers: await headers(), recordResponse: false },
      async (): Promise<State> => {
        try {
          settled = { state: await run(reporter) };
        } catch (error) {
          report(error, 'wiring');
          settled = { state: retryState };
        }
        return settled.state;
      },
    );
  } catch (error) {
    report(error, 'instrumentation');
    return settled ? settled.state : retryState;
  }
}
