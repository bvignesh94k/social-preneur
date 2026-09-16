import { getBrandWorkspace } from "@/data/brand";
import { BrandNav } from "./brand-nav";

export default async function BrandLayout({ children, params }: LayoutProps<"/c/[client]/brand">) {
  const ws = await getBrandWorkspace((await params).client);

  return (
    <div className="grid gap-6 lg:grid-cols-[13rem_minmax(0,1fr)]">
      <aside className="grid content-start gap-4">
        <BrandNav slug={ws.client.slug} />
        {!ws.can.edit && (
          <p className="hidden rounded-md bg-sunk px-3 py-2 text-xs text-muted lg:block">
            {ws.can.suggest
              ? "You can add facts for review. Managers and admins edit everything else."
              : "You can view the Brand Brain. Managers and admins can edit it."}
          </p>
        )}
      </aside>
      <div className="min-w-0">{children}</div>
    </div>
  );
}
