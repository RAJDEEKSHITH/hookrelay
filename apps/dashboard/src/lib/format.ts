const dateTimeFormat = new Intl.DateTimeFormat(undefined, {
  dateStyle: "medium",
  timeStyle: "medium",
});
const relativeFormat = new Intl.RelativeTimeFormat(undefined, {
  numeric: "auto",
});

/** "Nov 3, 2026, 6:00:49 PM" in the viewer's locale and time zone. */
export function formatDateTime(iso: string): string {
  return dateTimeFormat.format(new Date(iso));
}

const UNITS: { unit: Intl.RelativeTimeFormatUnit; seconds: number }[] = [
  { unit: "day", seconds: 86_400 },
  { unit: "hour", seconds: 3_600 },
  { unit: "minute", seconds: 60 },
];

/** "3 minutes ago", "in 2 hours", "now": relative to when the page rendered, not live-updating. */
export function formatRelative(iso: string, now: number = Date.now()): string {
  const diffSec = Math.round((new Date(iso).getTime() - now) / 1000);
  for (const { unit, seconds } of UNITS) {
    if (Math.abs(diffSec) >= seconds) {
      return relativeFormat.format(Math.round(diffSec / seconds), unit);
    }
  }
  if (Math.abs(diffSec) < 10) return relativeFormat.format(0, "second");
  return relativeFormat.format(diffSec, "second");
}

/** "42 ms", "15.0 s", "2 min 3 s", "1 h 5 min". */
export function formatDuration(ms: number): string {
  if (ms < 1000) return `${Math.round(ms)} ms`;
  const totalSec = ms / 1000;
  if (totalSec < 60) return `${totalSec.toFixed(1)} s`;
  const sec = Math.round(totalSec);
  const h = Math.floor(sec / 3600);
  const min = Math.floor((sec % 3600) / 60);
  const s = sec % 60;
  if (h > 0) return min > 0 ? `${h} h ${min} min` : `${h} h`;
  return s > 0 ? `${min} min ${s} s` : `${min} min`;
}

export type Tone = "ok" | "wait" | "fail";

/** 2xx delivered; 3xx (redirects are not followed) and 4xx need the receiver's attention; 5xx and no answer failed. */
export function httpTone(statusCode: number | null): Tone {
  if (statusCode === null || statusCode >= 500) return "fail";
  if (statusCode >= 200 && statusCode < 300) return "ok";
  return "wait";
}
