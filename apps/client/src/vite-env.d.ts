/// <reference types="vite/client" />

// Global constants defined at build time
declare const __ROUTE_MESSAGING_ENABLED__: boolean;

interface ImportMetaEnv {
  readonly VITE_GOOGLE_CLIENT_ID?: string;
  readonly VITE_API_BASE_URL?: string;
}

interface Window {
  google?: {
    accounts: {
      id: {
        initialize: (config: { client_id: string; callback: (response: { credential: string }) => void }) => void;
        prompt: (momentListener?: (notification: {
          isDisplayed: () => boolean;
          isSkippedMoment: () => boolean;
          isDismissedMoment: () => boolean;
          getSkippedReason: () => string;
          getDismissedReason: () => string;
        }) => void) => void;
        renderButton: (parent: HTMLElement, options: { theme: "outline" | "filled_blue" | "filled_black"; size: "large" | "medium" | "small"; width?: number }) => void;
      };
    };
  };
}
