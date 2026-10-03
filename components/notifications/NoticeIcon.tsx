import { ArrowUturnLeftIcon, CheckCircleIcon, InboxArrowDownIcon, PaperAirplaneIcon } from "@heroicons/react/24/outline";
import type { NoticeKind } from "@/components/notifications/useNotifications";

const ICON = { arrived: InboxArrowDownIcon, sent: PaperAirplaneIcon, approved: CheckCircleIcon, reopened: ArrowUturnLeftIcon };
const TONE = { arrived: "text-branddeep", sent: "text-muted", approved: "text-ok", reopened: "text-muted" };

export function NoticeIcon({ kind }: { kind: NoticeKind }) {
  const Icon = ICON[kind];
  return <Icon aria-hidden className={`h-5 w-5 shrink-0 ${TONE[kind]}`} />;
}
