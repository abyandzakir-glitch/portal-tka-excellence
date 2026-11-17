import { TZDate } from "@date-fns/tz";
import { format } from "date-fns";
import { id as localeId } from "date-fns/locale";
import { TIME_ZONE } from "@/lib/format/id";

/** "17 Nov 2026, 14.05" in Asia/Jakarta. */
export function formatDateTimeId(d: Date | string): string {
  return format(new TZDate(new Date(d), TIME_ZONE), "d MMM yyyy, HH.mm", { locale: localeId });
}
