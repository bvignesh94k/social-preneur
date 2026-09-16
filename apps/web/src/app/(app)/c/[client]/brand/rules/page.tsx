import { describeRule, SINGLE_USE_RULE_TYPES } from "@sp/core";
import { listRules } from "@sp/db";
import type { Metadata } from "next";
import { ActionButton } from "@/components/action-button";
import { buttonSecondarySm, Chip, SectionHeader } from "@/components/ui";
import { getBrandWorkspace } from "@/data/brand";
import { RULE_TYPE_LABEL } from "@/lib/labels";
import { deleteRuleAction, toggleRuleAction } from "../actions";
import { RuleForm } from "./rule-form";

export const metadata: Metadata = { title: "Content rules" };

export default async function RulesPage({ params }: PageProps<"/c/[client]/brand/rules">) {
  const ws = await getBrandWorkspace((await params).client);
  const rules = await listRules(ws.db, ws.scope);
  const singleUse = new Set<string>(SINGLE_USE_RULE_TYPES);
  const usedTypes = rules.filter((rule) => singleUse.has(rule.type)).map((rule) => rule.type);
  const hidden = { clientId: ws.client.id, slug: ws.client.slug };

  return (
    <div className="grid gap-6">
      <SectionHeader title="Content rules" description="Instructions every post for this client must follow." />

      <p className="rounded-lg bg-info-soft px-4 py-3 text-sm text-info">
        Rules will be given to the AI when it writes content, and checked again before a post can be approved.
      </p>

      {ws.can.edit && (
        <section aria-labelledby="add-rule-heading" className="grid gap-4 rounded-lg border border-line bg-surface p-5">
          <h3 id="add-rule-heading" className="font-display text-base font-bold">
            Add a rule
          </h3>
          <RuleForm {...hidden} usedTypes={usedTypes} />
        </section>
      )}

      {rules.length === 0 ? (
        <p className="rounded-lg border border-dashed border-line bg-surface px-5 py-8 text-center text-sm text-muted">
          No rules yet. Common ones are a hashtag limit, phrases to avoid, and whether emojis are allowed.
        </p>
      ) : (
        <ul className="divide-y divide-line overflow-hidden rounded-lg border border-line bg-surface">
          {rules.map((rule) => (
            <li key={rule.id} className="flex flex-wrap items-center gap-3 px-4 py-3">
              <div className="min-w-0 flex-1">
                <p className={rule.isActive ? "" : "text-muted"}>{describeRule(rule.type, rule.value)}</p>
                <p className="text-xs text-muted">{RULE_TYPE_LABEL[rule.type]}</p>
              </div>
              <Chip tone={rule.isActive ? "ok" : "neutral"}>{rule.isActive ? "On" : "Off"}</Chip>
              {ws.can.edit && (
                <div className="flex flex-wrap gap-2">
                  <ActionButton
                    action={toggleRuleAction}
                    fields={{ ...hidden, ruleId: rule.id, isActive: String(!rule.isActive) }}
                    pendingText="Saving..."
                    className={buttonSecondarySm}
                  >
                    {rule.isActive ? "Turn off" : "Turn on"}
                  </ActionButton>
                  <ActionButton
                    action={deleteRuleAction}
                    fields={{ ...hidden, ruleId: rule.id }}
                    pendingText="Deleting..."
                    className={buttonSecondarySm}
                  >
                    Delete
                  </ActionButton>
                </div>
              )}
            </li>
          ))}
        </ul>
      )}
    </div>
  );
}
