import { provideConfigSecrets } from './capabilities/config-secrets';
import { provideExternalApi } from './capabilities/external-api';
import { provideNotifications } from './capabilities/notifications';
import { providePersistence } from './capabilities/persistence';

export const buildContext = () => {
  const configSecrets = provideConfigSecrets();
  return {
    ...configSecrets,
    ...providePersistence(configSecrets.serverConfig),
    ...provideExternalApi(configSecrets.serverConfig),
    ...provideNotifications(configSecrets.serverConfig, configSecrets.logger),
  };
};

export type AppContext = ReturnType<typeof buildContext>;
