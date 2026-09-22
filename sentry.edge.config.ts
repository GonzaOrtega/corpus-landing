import * as Sentry from '@sentry/nextjs';
import { buildServerSentryOptions } from './src/config/sentry-options';

/**
 * Edge runtime. Nothing in this app opts into it today (proxy.ts runs on
 * Node in Next 16), so this exists so a future `runtime = 'edge'` segment is
 * covered rather than silently unmonitored.
 */
Sentry.init(buildServerSentryOptions(process.env));
