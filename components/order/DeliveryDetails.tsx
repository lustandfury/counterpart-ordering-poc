import type { Delivery, Sender } from "@/lib/types";

/**
 * When and where the order goes, as captured from the text: the tidy version for the rep, with the contractor's own
 * words beside it so nothing is lost in the tidying. "Same address as last week" shows the address on file.
 */
export function DeliveryDetails({ delivery, from }: { delivery?: Delivery; from?: Sender }) {
  if (!delivery || (!delivery.when && !delivery.where && !delivery.notes)) return null;
  const { when, where, notes } = delivery;
  const place = where?.onFile ? (from?.address ? `${from.address} (on file)` : "Address on file") : where?.tidy;
  const rows = [
    when && { label: delivery.method === "pickup" ? "Pickup" : "Delivery", tidy: when.tidy, said: when.said },
    where && { label: "Site", tidy: place!, said: where.said },
    notes && { label: "Note", tidy: notes, said: null },
  ].filter((r): r is { label: string; tidy: string; said: string | null } => !!r);
  return (
    <dl aria-label="Delivery details" className="mt-4 ml-12 grid grid-cols-[auto_minmax(0,1fr)] gap-x-4 gap-y-2 text-small">
      {rows.map((r) => (
        <div key={r.label} className="contents">
          <dt className="text-muted">{r.label}</dt>
          <dd className="min-w-0">
            <span className="font-medium text-ink">{r.tidy}</span>
            {r.said && r.said.toLowerCase() !== r.tidy.toLowerCase() && <span className="block text-caption text-muted">“{r.said}”</span>}
          </dd>
        </div>
      ))}
    </dl>
  );
}
