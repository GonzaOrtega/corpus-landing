/**
 * Adapters for the persistence capability are constructed here, and nowhere else — see
 * construction.adapters-only-in-capabilities.
 */
export type PersistenceDeps = {};

export const providePersistence = (): PersistenceDeps => ({});
