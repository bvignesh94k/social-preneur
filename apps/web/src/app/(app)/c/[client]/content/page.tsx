import { CATEGORY_LABELS, STATUS_LABELS, isIsoDate, monthLabel, shiftMonth, todayIn } from "@sp/core";
import type { Metadata } from "next";
import Link from "next/link";
import { Chip, SectionHeader } from "@/components/ui";
import { getMonthPlan } from "@/data/content";
import { PLATFORM_SHORT, POST_STATUS_TONE } from "@/lib/labels";
import { MixForm } from "./mix-form";
import { MonthGrid } from "./month-grid";
import { NewPostForm } from "./new-post-form";

export const metadata: Metadata = { title: "Content" };

function readMonth(value: string | undefined, fallback: number, min: number, max: number): number {
  const parsed = Number(value);
  return Number.isInteger(parsed) && parsed >= min && parsed <= max ? parsed : fallback;
}

export default async function ContentPage({ params, searchParams }: PageProps<"/c/[client]/content">) {
  const slug = (await params).client;
  const query = await searchParams;

  const single = (value: string | string[] | undefined): string | undefined =>
    Array.isArray(value) ? value[0] : value;

  const nowIso = todayIn("Asia/Kolkata");
  const year = readMonth(single(query.year), Number(nowIso.slice(0, 4)), 2020, 2100);
  const month = readMonth(single(query.month), Number(nowIso.slice(5, 7)), 1, 12);

  const plan = await getMonthPlan(slug, year, month);
  const previous = shiftMonth(year, month, -1);
  const next = shiftMonth(year, month, 1);

  const prefill = single(query.new);
  const newDate = prefill && isIsoDate(prefill) ? prefill : "";

  return (
    <div className="grid gap-6">
      <SectionHeader
        title="Content"
        description={`The plan for ${plan.client.name}. Times are ${plan.client.timezone.replace("_", " ")}.`}
        actions={
          <nav aria-label="Month" className="flex items-center gap-1">
            <Link
              href={`/c/${slug}/content?year=${previous.year}&month=${previous.month}`}
              className="rounded-md border border-line px-2.5 py-1.5 text-sm hover:bg-sunk"
              aria-label={`Go to ${monthLabel(previous.year, previous.month)}`}
            >
              &larr;
            </Link>
            <span className="min-w-40 px-2 text-center text-sm font-medium">{monthLabel(year, month)}</span>
            <Link
              href={`/c/${slug}/content?year=${next.year}&month=${next.month}`}
              className="rounded-md border border-line px-2.5 py-1.5 text-sm hover:bg-sunk"
              aria-label={`Go to ${monthLabel(next.year, next.month)}`}
            >
              &rarr;
            </Link>
          </nav>
        }
      />

      {plan.warnings.length > 0 && (
        <div className="rounded-lg bg-warn-soft px-4 py-3 text-sm text-warn">
          <p className="font-medium">This month is out of balance</p>
          <ul className="mt-1 grid gap-0.5">
            {plan.warnings.map((warning) => (
              <li key={warning}>{warning}</li>
            ))}
          </ul>
        </div>
      )}

      <MonthGrid slug={slug} year={year} month={month} today={plan.today} byDay={plan.byDay} />

      <div className="grid gap-6 lg:grid-cols-[minmax(0,1fr)_320px]">
        <section className="grid gap-3">
          <h2 className="font-display text-lg font-bold tracking-tight">
            {monthLabel(year, month)} at a glance
          </h2>
          {plan.postsInMonth.length === 0 ? (
            <p className="rounded-lg border border-dashed border-line px-4 py-6 text-sm text-muted">
              Nothing planned this month yet. Add the first post and it will appear on the calendar above.
            </p>
          ) : (
            <ol className="grid gap-2">
              {plan.postsInMonth.map((post) => (
                <li key={post.id}>
                  <Link
                    href={`/c/${slug}/content/${post.id}`}
                    className="flex flex-wrap items-center gap-x-3 gap-y-1.5 rounded-lg border border-line bg-surface px-3 py-2.5 hover:border-accent"
                  >
                    <span className="font-mono text-xs text-muted">{post.plannedDate}</span>
                    <span className="min-w-0 flex-1 truncate text-sm font-medium">{post.title}</span>
                    <span className="text-xs text-muted">{CATEGORY_LABELS[post.category]}</span>
                    {post.variants.length > 0 && (
                      <span className="font-mono text-xs text-muted">
                        {post.variants.map((variant) => PLATFORM_SHORT[variant.platform]).join(" ")}
                      </span>
                    )}
                    <Chip tone={POST_STATUS_TONE[post.status]}>{STATUS_LABELS[post.status]}</Chip>
                  </Link>
                </li>
              ))}
            </ol>
          )}
        </section>

        <aside className="grid content-start gap-6">
          {plan.can.edit && <NewPostForm slug={slug} defaultDate={newDate} />}

          <section className="grid gap-3 rounded-lg border border-line bg-surface p-5">
            <div>
              <h2 className="font-display text-base font-bold">Balance</h2>
              <p className="text-sm text-muted">What this month looks like against your targets.</p>
            </div>
            <table className="w-full text-sm">
              <thead>
                <tr className="text-left text-xs uppercase tracking-wide text-muted">
                  <th className="pb-1 font-medium">Category</th>
                  <th className="pb-1 text-right font-medium">Planned</th>
                  <th className="pb-1 text-right font-medium">Target</th>
                </tr>
              </thead>
              <tbody>
                {plan.mix.map((row) => (
                  <tr key={row.category} className="border-t border-line">
                    <td className="py-1.5">{CATEGORY_LABELS[row.category]}</td>
                    <td className="py-1.5 text-right tabular-nums">
                      {row.planned}
                      <span className="text-muted"> · {row.share}%</span>
                    </td>
                    <td className="py-1.5 text-right tabular-nums text-muted">{row.target}%</td>
                  </tr>
                ))}
              </tbody>
            </table>
            {plan.can.strategy && <MixForm slug={slug} mix={plan.mix} />}
          </section>
        </aside>
      </div>
    </div>
  );
}
