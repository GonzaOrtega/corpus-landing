'use client';

import { useEffect, useRef, useState, useTransition } from 'react';
import { resolveManagementAction } from '../actions/resolve-management.action';
import { unsubscribeAction } from '../actions/unsubscribe.action';
import { ManageEarlyAccess, type ManageViewState } from './manage-early-access';

interface FragmentLocation {
  hash: string;
  pathname: string;
  search: string;
}

export function consumeManagementTokenFromFragment(
  location: FragmentLocation,
  replaceState: (data: unknown, unused: string, url?: string | URL | null) => void,
): string | null {
  if (!location.hash.startsWith('#') || location.hash.length === 1) return null;
  const token = location.hash.slice(1);
  replaceState(null, '', `${location.pathname}${location.search}`);
  return token;
}

export function ManageTokenBridge() {
  const initializedRef = useRef(false);
  const tokenRef = useRef<string | null>(null);
  const [state, setState] = useState<ManageViewState>({ status: 'loading' });
  const [isPending, startTransition] = useTransition();

  useEffect(() => {
    if (initializedRef.current) return;
    initializedRef.current = true;
    const token = consumeManagementTokenFromFragment(
      window.location,
      history.replaceState.bind(history),
    );
    tokenRef.current = token;
    if (!token) {
      setState({ status: 'invalid' });
      return;
    }
    void resolveManagementAction(token).then(setState, () => setState({ status: 'retry' }));
  }, []);

  const unsubscribe = () => {
    const token = tokenRef.current;
    if (!token) return;
    startTransition(async () => {
      const result = await unsubscribeAction(token);
      setState(result);
    });
  };

  return <ManageEarlyAccess state={state} onUnsubscribe={unsubscribe} isPending={isPending} />;
}
