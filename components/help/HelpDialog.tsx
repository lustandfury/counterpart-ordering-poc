import { ActionSheet } from "@/components/ui/ActionSheet";
import { Button } from "@/components/ui/Button";
import { SheetFooter, SheetHeader } from "@/components/ui/Sheet";
import { FaintSignalCredit } from "@/components/FaintSignalCredit";

const COLUMN_TITLE = "text-small font-semibold uppercase tracking-wider text-ink";

/** About Counterpart: what it's for, and how the Claude + Jev vs Claude-only comparison works. */
export function HelpDialog({ open, onClose, onResults }: { open: boolean; onClose: () => void; onResults: () => void }) {
  return (
    <ActionSheet open={open} onClose={onClose} labelledBy="help-title" className="max-w-3xl">
          <SheetHeader id="help-title" eyebrow="Counterpart" title="The fast lane for Pro orders" closeLabel="Close help" onClose={onClose} />
          <p className="mt-5 rounded-lg border border-line bg-surface p-4 text-body leading-relaxed text-muted"><span className="font-medium text-ink">Demo orders. Real AI processing.</span> This demo runs generated orders through a real text-processing workflow. Live AI and API calls read each message, extract the order details, and match items to the catalog in real time.</p>
          <div className="mt-5 grid gap-6 text-body leading-relaxed text-muted md:grid-cols-2 md:gap-8">
            <div className="space-y-4">
              <h3 className={COLUMN_TITLE}>Meet Pros where they order</h3>
              <p><span className="font-medium text-ink">The common path:</span> Many everyday orders start with a phone call or quick message to the counter. Counterpart turns a contractor&apos;s text into a catalog-matched draft. The rep checks only the uncertain lines, then sends it back to the contractor to approve before it goes to the ERP for purchase.</p>
              <p><span className="font-medium text-ink">The benefit:</span> The Pro avoids re-keying an order or learning another interface, while your team gets a structured order to review instead of working from messy shorthand.</p>
              <p><span className="font-medium text-ink">Skip the storefront when it makes sense:</span> Detailed quotes and complex orders can follow the full ordering workflow, while routine requests move straight from the channels Pros already use into a review-ready draft.</p>
            </div>
            <div className="space-y-4 border-t border-line pt-5 md:border-l md:border-t-0 md:pl-8 md:pt-0">
              <h3 className={COLUMN_TITLE}>How the comparison works</h3>
              <p><span className="font-medium text-ink">Claude + Jev:</span> Claude reads the message and extracts the order lines. Jev then evaluates each line against a short catalog shortlist, checking the category, product, and quantity clarity.</p>
              <p><span className="font-medium text-ink">Claude only:</span> Claude reads the same order, then matches each line against the full catalog in one comparison pass. Both views use the same order and catalog context.</p>
              <p><span className="font-medium text-ink">The savings:</span> The headline compares the whole order cost. In both bars, grey is reading and the accent is matching, on the same scale. “Per 10,000 orders” scales this run&apos;s total cost.</p>
            </div>
          </div>
          <SheetFooter>
            <button onClick={onResults} className="mr-auto h-9 sm:mr-0 rounded-lg px-1 text-small font-medium text-muted underline underline-offset-2 hover:text-ink">Sample results</button>
            <FaintSignalCredit from="about" className="order-last mt-4 w-full justify-center self-center sm:order-none sm:mt-0 sm:mr-auto sm:ml-4 sm:w-auto" />
            <Button onClick={onClose}>Got it</Button>
          </SheetFooter>
    </ActionSheet>
  );
}
