import {
  CATEGORY_LABELS,
  STATUS_LABELS,
  dayOfMonth,
  isInMonth,
  isWeekend,
  monthWeeks,
  type PostStatus,
} from "@sp/core";
import type { PostWithVariants } from "@sp/db";
import Link from "next/link";
import { PLATFORM_SHORT } from "@/lib/labels";

const WEEKDAYS = ["Mon", "Tue", "Wed", "Thu", "Fri", "Sat", "Sun"];

const DOT: Record<PostStatus, string> = {
  idea: "bg-muted",
  draft: "bg-muted",
  needs_creative: "bg-warn",
  ready: "bg-info",
  scheduled: "bg-accent",
  published: "bg-accent",
  failed: "bg-crit",
  archived: "bg-muted",
};

function PostChip({ post, slug }: { post: PostWithVariants; slug: string }) {
  const platforms = post.variants.map((variant) => PLATFORM_SHORT[variant.platform]).join(" ");

  return (
    <Link
      href={`/c/${slug}/content/${post.id}`}
      className="group grid gap-0.5 rounded border border-line bg-surface px-1.5 py-1 hover:border-accent"
    >
      <span className="flex items-center gap-1.5">
        <span
          aria-hidden
          className={`size-1.5 shrink-0 rounded-full ${DOT[post.status]}`}
          title={STATUS_LABELS[post.status]}
        />
        <span className="truncate text-xs font-medium leading-tight">{post.title}</span>
      </span>
      <span className="truncate text-[10px] text-muted">
        {platforms || CATEGORY_LABELS[post.category]}
      </span>
      <span className="sr-only">
        {STATUS_LABELS[post.status]}, {CATEGORY_LABELS[post.category]}
      </span>
    </Link>
  );
}

export function MonthGrid({
  slug,
  year,
  month,
  today,
  byDay,
}: {
  slug: string;
  year: number;
  month: number;
  today: string;
  byDay: Map<string, PostWithVariants[]>;
}) {
  const weeks = monthWeeks(year, month);

  return (
    <>
      {/* Seven columns need room to breathe, so narrow screens get the day list below instead. */}
      <div className="hidden overflow-hidden rounded-lg border border-line bg-surface md:block">
        <div className="grid grid-cols-7 border-b border-line bg-sunk">
          {WEEKDAYS.map((day) => (
            <div key={day} className="px-2 py-1.5 text-center text-[11px] font-medium uppercase tracking-wide text-muted">
              {day}
            </div>
          ))}
        </div>
        <div className="grid grid-cols-7">
          {weeks.flat().map((date) => {
            const outside = !isInMonth(date, year, month);
            const posts = byDay.get(date) ?? [];
            const isToday = date === today;

            return (
              <div
                key={date}
                className={`min-h-24 border-b border-r border-line p-1 last:border-r-0 ${
                  outside ? "bg-sunk/40" : isWeekend(date) ? "bg-sunk/20" : ""
                }`}
              >
                <div className="mb-1 flex items-center justify-between px-0.5">
                  <span
                    className={`text-[11px] ${
                      isToday
                        ? "rounded bg-accent px-1 font-semibold text-surface"
                        : outside
                          ? "text-muted/60"
                          : "text-muted"
                    }`}
                  >
                    {dayOfMonth(date)}
                  </span>
                  {!outside && (
                    <Link
                      href={`/c/${slug}/content?new=${date}`}
                      aria-label={`Add a post on ${date}`}
                      className="rounded px-1 text-xs leading-none text-muted hover:bg-sunk hover:text-ink"
                    >
                      +
                    </Link>
                  )}
                </div>
                <div className="grid gap-1">
                  {posts.map((post) => (
                    <PostChip key={post.id} post={post} slug={slug} />
                  ))}
                </div>
              </div>
            );
          })}
        </div>
      </div>

      <ol className="grid gap-2 md:hidden">
        {weeks
          .flat()
          .filter((date) => isInMonth(date, year, month) && (byDay.get(date)?.length ?? 0) > 0)
          .map((date) => (
            <li key={date} className="rounded-lg border border-line bg-surface p-3">
              <p className="mb-2 text-xs font-medium uppercase tracking-wide text-muted">
                {dayOfMonth(date)} {date === today ? "· today" : ""}
              </p>
              <div className="grid gap-1.5">
                {(byDay.get(date) ?? []).map((post) => (
                  <PostChip key={post.id} post={post} slug={slug} />
                ))}
              </div>
            </li>
          ))}
      </ol>
    </>
  );
}
