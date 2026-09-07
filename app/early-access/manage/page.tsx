import type { Metadata } from 'next';
import { ManageTokenBridge } from '../../../src/features/early-access/ui/manage-token-bridge';

export const metadata: Metadata = {
  title: 'Manage early access · Corpus',
  robots: { index: false, follow: false },
};

export default function ManageEarlyAccessPage() {
  return <ManageTokenBridge />;
}
