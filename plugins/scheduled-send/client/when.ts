/** Date and time as the popover's fields hold them, in this device's time zone. */
export interface WhenFields {
  date: string;
  time: string;
}

export interface Preset {
  label: string;
  pick(now: Date): Date;
}

function pad(value: number): string {
  return String(value).padStart(2, "0");
}

function tomorrowAt(now: Date, hours: number): Date {
  return new Date(now.getFullYear(), now.getMonth(), now.getDate() + 1, hours, 0);
}

/** Rounds up to the next five minutes, so a preset reads as a time someone would choose. */
function inMinutes(now: Date, minutes: number): Date {
  const step = 5 * 60_000;
  return new Date(Math.ceil((now.getTime() + minutes * 60_000) / step) * step);
}

export const PRESETS: readonly Preset[] = [
  { label: "In 30 min", pick: (now) => inMinutes(now, 30) },
  { label: "In 1 hour", pick: (now) => inMinutes(now, 60) },
  { label: "In 3 hours", pick: (now) => inMinutes(now, 180) },
  { label: "Tomorrow 8:00", pick: (now) => tomorrowAt(now, 8) },
  { label: "Tomorrow 9:00", pick: (now) => tomorrowAt(now, 9) },
];

export function toFields(when: Date): WhenFields {
  return {
    date: `${when.getFullYear()}-${pad(when.getMonth() + 1)}-${pad(when.getDate())}`,
    time: `${pad(when.getHours())}:${pad(when.getMinutes())}`,
  };
}

/** The moment the fields name, or why they name none. */
export function parseFields(fields: WhenFields, now: Date): { when: Date } | { problem: string } {
  const date = /^\s*(\d{4})-(\d{1,2})-(\d{1,2})\s*$/.exec(fields.date);
  if (!date) return { problem: "Write the date as YYYY-MM-DD." };
  const time = /^\s*(\d{1,2})[:.](\d{2})\s*$/.exec(fields.time);
  if (!time) return { problem: "Write the time as HH:MM, 24-hour." };
  const [year, month, day] = [Number(date[1]), Number(date[2]), Number(date[3])];
  const [hours, minutes] = [Number(time[1]), Number(time[2])];
  const when = new Date(year, month - 1, day, hours, minutes);
  // Date rolls 31 April over to 1 May; a field like that is a typo, not a wish.
  if (
    when.getFullYear() !== year ||
    when.getMonth() !== month - 1 ||
    when.getDate() !== day ||
    when.getHours() !== hours ||
    when.getMinutes() !== minutes
  ) {
    return { problem: "That date or time does not exist." };
  }
  if (when.getTime() <= now.getTime()) return { problem: "That time has already passed." };
  return { when };
}

/** "Thu 12 Nov, 09:00", in the device's language. */
export function formatWhen(when: Date): string {
  const day = when.toLocaleDateString(undefined, { weekday: "short", day: "numeric", month: "short" });
  return `${day}, ${pad(when.getHours())}:${pad(when.getMinutes())}`;
}

/** "in 2 h 5 min", rounded to the minute. */
export function formatFromNow(when: Date, now: Date): string {
  const minutes = Math.max(1, Math.round((when.getTime() - now.getTime()) / 60_000));
  const days = Math.floor(minutes / 1440);
  const hours = Math.floor((minutes % 1440) / 60);
  const rest = minutes % 60;
  const parts = [days ? `${days} d` : "", hours ? `${hours} h` : "", rest ? `${rest} min` : ""];
  return `in ${parts.filter(Boolean).join(" ")}`;
}
