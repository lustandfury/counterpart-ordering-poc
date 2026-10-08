import Image from "next/image";
import { useState } from "react";
import { struck } from "@/components/ui/Struck";
import type { OrderResult } from "@/lib/types";
import { orderNumber, segmentText } from "@/lib/view";
import { TextButton } from "@/components/ui/Button";
import { CheckDot } from "@/components/order/CheckDot";
import { CheckPhrase, useHighlightVariant } from "@/components/order/CheckPhrase";
import { DeliveryDetails } from "@/components/order/DeliveryDetails";
import { OrderProgress } from "@/components/order/OrderProgress";
import { ActionSheet } from "@/components/ui/ActionSheet";
import { SheetHeader } from "@/components/ui/Sheet";

/**
 * The head of the order: who texted, their message, the delivery details and where the order is (the AI cost sits in
 * its own card below, see CostSummary).
 * On phones the message folds away behind "Show text", so the first line to check is on the first screen.
 */
export function OrderDetails({ result, phone, toCheck: unchecked, receivedAt, sentAt, approvedAt }: { result: OrderResult; phone: boolean; toCheck: string[]; receivedAt?: number; sentAt?: number; approvedAt?: number }) {
  const [textShown, setTextShown] = useState(false);
  const [photoOpen, setPhotoOpen] = useState(false);
  const hl = useHighlightVariant();
  const who = result.from?.name ?? "the contractor";
  const photo = result.photo;
  return (
    <div className="@container rounded-xl border border-line bg-panel px-4 py-4 shadow-ring sm:px-5" aria-live="polite">
      <div className="flex flex-col gap-3 @min-[560px]:flex-row @min-[560px]:items-start @min-[560px]:justify-between">
      <div className="flex min-w-0 items-start gap-3">
        <span className="grid h-9 w-9 shrink-0 place-items-center rounded-full bg-bg text-caption font-semibold text-ink" aria-hidden>
          {result.from ? result.from.name.split(" ").map((w) => w[0]).join("").slice(0, 2) : "C"}
        </span>
        <div className="min-w-0 flex-1">
          <h1 className="break-words text-lg font-semibold leading-tight tracking-tight">
            {result.from?.name ?? "New order"}
            {result.from && <span className="font-normal text-muted"> · {result.from.company}</span>}
          </h1>
          <p className="mt-0.5 text-small text-muted">{photo ? "Sent a photo of an order" : "Texted an order"} · <span className="figures text-ink">{orderNumber(result.orderId)}</span></p>
        </div>
      </div>
      </div>
      {(!phone || textShown) && (
        <figure className={`mt-4 ml-12 ${photo ? "flex flex-wrap items-start gap-3" : ""}`}>
          {photo && (
            <button type="button" onClick={() => setPhotoOpen(true)} aria-label="Open original order photo for comparison" className="shrink-0 overflow-hidden rounded-[18px] rounded-tl-none shadow-ring">
              <Image src={photo.src} alt={`Photo of a handwritten order from ${who}`} width={480} height={640} className="h-auto w-36 sm:w-44" />
              <span className="sr-only">Open full size to compare with the transcription</span>
            </button>
          )}
          <figcaption className={photo ? "basis-full text-caption text-muted @min-[560px]:order-last" : "sr-only"}>
            {photo ? "What we read from the photo. Crossed-out text is struck through." : `Text message from ${who}`}
          </figcaption>
          <blockquote id="incoming-message" className="max-h-64 w-fit max-w-prose overflow-y-auto overscroll-contain whitespace-pre-wrap break-words rounded-[18px] rounded-tl-none bg-bg px-4 py-3 text-body leading-relaxed text-ink sm:max-h-80">
            {/* indented under the name, as in a messages app; the phrases behind lines still to check get the same dot as their line */}
            {segmentText(result.text.trim(), result.parse.lines).map((seg, i) => seg.lineId && unchecked.includes(seg.lineId)
              ? <span key={i}>{hl === "dot" ? <><CheckDot />{struck(seg.text)}</> : <CheckPhrase variant={hl}>{struck(seg.text)}</CheckPhrase>}<span className="sr-only"> (to check)</span></span>
              : <span key={i}>{struck(seg.text)}</span>)}
          </blockquote>
        </figure>
      )}
      {/* captured from the text, so it shows even while the text itself is folded away on phones */}
      <DeliveryDetails delivery={result.parse.delivery} from={result.from} />
      <div className="mt-4 flex flex-wrap items-center gap-x-4 gap-y-2 border-t border-line pt-3">
        {/* where the order is: Received, Sent, Approved, across the foot of the card */}
        <div className="mb-1 basis-full">
          <OrderProgress receivedAt={receivedAt} sentAt={sentAt} approvedAt={approvedAt} />
        </div>
        {phone && (
          <TextButton onClick={() => setTextShown((v) => !v)} aria-expanded={textShown} aria-controls="incoming-message">
            {photo ? (textShown ? "Hide photo" : "Show photo") : textShown ? "Hide text" : "Show text"}
          </TextButton>
        )}
      </div>
      {photo && <ActionSheet open={photoOpen} onClose={() => setPhotoOpen(false)} labelledBy="original-photo-title" className="flex max-h-[calc(100dvh-2rem)] max-w-5xl flex-col">
        <SheetHeader id="original-photo-title" eyebrow="Original order" title={`Photo from ${who}`} closeLabel="Close photo" onClose={() => setPhotoOpen(false)} />
        <div className="mt-4 min-h-0 flex-1 overflow-auto rounded-lg bg-bg p-2 text-center">
          <Image src={photo.src} alt={`Original handwritten order from ${who}`} width={1200} height={1600} className="mx-auto h-auto max-h-[calc(100dvh-9rem)] w-auto max-w-full object-contain" />
        </div>
        <p className="mt-3 text-caption text-muted">Compare the original handwriting with the transcription in the order details.</p>
      </ActionSheet>}
    </div>
  );
}
