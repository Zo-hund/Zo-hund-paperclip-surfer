export interface OpenRouterCredentialStatus {
  companyKeyConfigured: boolean;
  provisionedAccess: boolean;
  provisionedKeyConfigured: boolean;
  defaultSource: "company" | "platform" | "none";
  hostToolsEnabled: boolean;
}

export interface OpenRouterCredentialValidation {
  valid: boolean;
  message: string;
}
