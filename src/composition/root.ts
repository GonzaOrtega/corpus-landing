import { provideConfigSecrets } from './capabilities/config-secrets';
import { provideExternalApi } from './capabilities/external-api';
import { provideNotifications } from './capabilities/notifications';
import { providePersistence } from './capabilities/persistence';

export type AppContext = {};

export const buildContext = (): AppContext => ({
  ...providePersistence(),
  ...provideExternalApi(),
  ...provideNotifications(),
  ...provideConfigSecrets(),
});
