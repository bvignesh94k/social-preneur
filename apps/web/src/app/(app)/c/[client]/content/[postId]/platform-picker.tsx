"use client";

import type { AutoPublishSupport, SocialPlatform } from "@sp/core";
import { useActionState } from "react";
import type { FormState } from "@/lib/form-state";
import { SOCIAL_PLATFORM_LABEL } from "@/lib/labels";
import { setPlatformAction } from "../actions";

export interface PlatformOption {
  platform: SocialPlatform;
  selected: boolean;
  // Published or mid-publish versions cannot be switched off.
  locked: boolean;
  account: { displayName: string; connected: boolean; needsAttention: boolean } | null;
  support: AutoPublishSupport;
}

function howItPosts(option: PlatformOption): { text: string; tone: string } {
  if (option.account?.needsAttention) return { text: "Needs reconnecting", tone: "text-warn" };
  if (option.support === "automatic" && option.account?.connected) return { text: "Posts automatically", tone: "text-accent" };
  if (option.support === "manual_media" && option.account?.connected) return { text: "You post this one", tone: "text-muted" };
  if (option.account) return { text: "You post this one", tone: "text-muted" };
  return { text: "Not connected · you post it", tone: "text-muted" };
}

function Toggle({ slug, postId, option, readOnly }: { slug: string; postId: string; option: PlatformOption; readOnly: boolean }) {
  const [state, action, pending] = useActionState<FormState, FormData>(setPlatformAction, undefined);
  const how = howItPosts(option);
  const disabled = readOnly || option.locked || pending;

  return (
    <form action={action} className="grid">
      <input type="hidden" name="slug" value={slug} />
      <input type="hidden" name="postId" value={postId} />
      <input type="hidden" name="platform" value={option.platform} />
      <input type="hidden" name="turn" value={option.selected ? "off" : "on"} />
      <button
        type="submit"
        disabled={disabled}
        aria-pressed={option.selected}
        title={option.locked ? "Already published or publishing, so it stays on." : undefined}
        className={`flex h-full items-start gap-2.5 rounded-lg border px-3 py-2.5 text-left transition-colors disabled:cursor-not-allowed ${
          option.selected
            ? "border-accent bg-accent-soft/60 ring-1 ring-accent"
            : "border-line bg-surface hover:border-accent/60 hover:bg-sunk/40"
        } ${pending ? "opacity-60" : ""}`}
      >
        <span
          aria-hidden
          className={`mt-0.5 grid size-4 shrink-0 place-items-center rounded border text-[10px] font-bold leading-none ${
            option.selected ? "border-accent bg-accent text-surface" : "border-line bg-surface"
          }`}
        >
          {option.selected ? "✓" : ""}
        </span>
        <span className="grid min-w-0 gap-0.5">
          <span className="text-sm font-semibold">{SOCIAL_PLATFORM_LABEL[option.platform]}</span>
          {option.account && <span className="truncate text-xs">{option.account.displayName}</span>}
          <span className={`text-xs ${how.tone}`}>{pending ? "Saving..." : how.text}</span>
        </span>
      </button>
      {state?.message && (
        <span role="alert" className="mt-1 text-xs text-crit">
          {state.message}
        </span>
      )}
    </form>
  );
}

export function PlatformPicker({
  slug,
  postId,
  options,
  readOnly,
}: {
  slug: string;
  postId: string;
  options: PlatformOption[];
  readOnly: boolean;
}) {
  return (
    <div className="grid grid-cols-2 gap-2 sm:grid-cols-3">
      {options.map((option) => (
        <Toggle key={option.platform} slug={slug} postId={postId} option={option} readOnly={readOnly} />
      ))}
    </div>
  );
}
