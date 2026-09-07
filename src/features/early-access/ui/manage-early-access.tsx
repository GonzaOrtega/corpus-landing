'use client';

import Link from 'next/link';

export type ManageViewState =
  | { status: 'loading' }
  | { status: 'active'; maskedEmail: string }
  | { status: 'unsubscribed'; maskedEmail?: string }
  | { status: 'invalid' }
  | { status: 'retry' };

export interface ManageEarlyAccessProps {
  state: ManageViewState;
  onUnsubscribe?: () => void;
  isPending?: boolean;
}

export function ManageEarlyAccess({
  state,
  onUnsubscribe,
  isPending = false,
}: ManageEarlyAccessProps) {
  return (
    <main style={styles.main}>
      <section style={styles.card} aria-live="polite">
        <p style={styles.mark}>CORPUS</p>
        {state.status === 'loading' && <p>Checking your management link…</p>}
        {state.status === 'active' && (
          <>
            <h1 style={styles.heading}>Manage early access.</h1>
            <p style={styles.masked}>{state.maskedEmail}</p>
            <p>You're on the Corpus early-access list.</p>
            <p>We'll send one launch notification when Corpus is ready. No newsletter.</p>
            <button
              type="button"
              style={styles.primary}
              onClick={onUnsubscribe}
              disabled={isPending}
            >
              {isPending ? 'Unsubscribing…' : 'Unsubscribe'}
            </button>
          </>
        )}
        {state.status === 'unsubscribed' && (
          <>
            <h1 style={styles.heading}>You're off the list.</h1>
            <p>You won't receive the Corpus launch email.</p>
          </>
        )}
        {state.status === 'invalid' && (
          <h1 style={styles.heading}>This management link is no longer valid.</h1>
        )}
        {state.status === 'retry' && (
          <>
            <h1 style={styles.heading}>We couldn't check that link.</h1>
            <p>Please try again.</p>
          </>
        )}
        <Link href="/" style={styles.secondary}>
          Back to Corpus
        </Link>
      </section>
    </main>
  );
}

const styles = {
  main: {
    minHeight: '100svh',
    background: '#f2eadf',
    color: '#211d19',
    display: 'grid',
    placeItems: 'center',
    padding: '32px 20px',
  },
  card: { maxWidth: '560px', textAlign: 'center' },
  mark: { color: '#9a5e44', fontSize: '12px', letterSpacing: '0.2em' },
  heading: { fontFamily: 'Georgia, serif', fontSize: 'clamp(2rem, 7vw, 3.5rem)', fontWeight: 400 },
  masked: { fontFamily: 'ui-monospace, monospace', fontSize: '1.1rem' },
  primary: {
    background: '#8a4935',
    border: 0,
    borderRadius: '999px',
    color: '#fffaf2',
    cursor: 'pointer',
    font: 'inherit',
    margin: '20px 8px',
    padding: '12px 22px',
  },
  secondary: { color: '#8a4935', display: 'block', marginTop: '16px' },
} as const;
