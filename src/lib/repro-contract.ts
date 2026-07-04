export type ReproScenario = {
  name: string;
  viewport: {
    width: number;
    height: number;
  };
  coupon: string;
  checkoutVisible: boolean;
  totalText: string;
  logEvents: string[];
  screenshotDataUrl?: string;
};

export type ReproResult = {
  reproduced: boolean;
  elapsedMs: number;
  route: string;
  sandbox: {
    kind: "warm-browser-context";
    coldStartMs: number;
    reusedBrowser: boolean;
    desktopContextMs: number;
    mobileContextMs: number;
    screenshotMs: number;
  };
  mobile: ReproScenario;
  desktop: ReproScenario;
  assertion: string;
};
