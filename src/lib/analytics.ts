import { ANALYTICS } from "./config";

type EventProps = Record<string, string | number | boolean | undefined>;
type AnalyticsWindow = Window & {
  plausible?: (event: string, options?: { props?: EventProps }) => void;
  umami?: { track: (event: string, data?: EventProps) => void };
};

/** Analytics is deliberately inert until a provider is selected in config.ts. */
export function track(event: string, props: EventProps = {}) {
  if (typeof window === "undefined" || ANALYTICS.provider === "none") return;
  const target = window as AnalyticsWindow;
  if (ANALYTICS.provider === "plausible") target.plausible?.(event, { props });
  if (ANALYTICS.provider === "umami") target.umami?.track(event, props);
}
