export interface CaptchaVerificationRequest {
  token: string;
  action: 'early_access_signup';
}

export interface CaptchaVerificationResult {
  accepted: boolean;
}

export interface CaptchaVerifier {
  verify(request: CaptchaVerificationRequest): Promise<CaptchaVerificationResult>;
}
