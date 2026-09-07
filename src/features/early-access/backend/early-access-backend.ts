export interface EarlyAccessBackendInput {
  emailOriginal: string;
  emailNormalized: string;
  captchaToken: string;
}

export interface EarlyAccessBackend {
  join(input: EarlyAccessBackendInput): Promise<void>;
}
