import { Alert, Button, cn } from '@pk/ui';
import { ExternalLink, Loader2 } from 'lucide-react';
import { useT, type DeskKey } from '@/i18n';
import { useLabelActions, type LabelTarget } from '../hooks/useLabelActions';

/**
 * 🖨️ Print + 📲 Share for one label / A4 sheet / manifest (D-37). Big, full-width on phones.
 * `disabledReason` (e.g. label still being prepared) disables both and says why.
 */
export function LabelButtons({
  target,
  printKey = 'label.print',
  shareKey = 'label.share',
  disabledReason,
  className,
}: {
  target: LabelTarget;
  printKey?: DeskKey;
  shareKey?: DeskKey;
  disabledReason?: DeskKey;
  className?: string;
}) {
  const t = useT();
  const labels = useLabelActions();
  const notice = labels.noticeFor(target);
  const printing = labels.isBusy(target, 'print');
  const sharing = labels.isBusy(target, 'share');
  const busy = printing || sharing;
  const disabled = Boolean(disabledReason) || busy;

  return (
    <div className={cn('grid gap-2', className)}>
      <div className="grid gap-2 sm:grid-cols-2">
        <Button
          type="button"
          variant="secondary"
          size="lg"
          className="w-full"
          disabled={disabled}
          aria-busy={printing || undefined}
          onClick={() => void labels.print(target)}
        >
          {printing && <Loader2 aria-hidden="true" className="animate-spin motion-reduce:animate-none" />}
          {t(printKey)}
        </Button>
        <Button
          type="button"
          variant="outline"
          size="lg"
          className="w-full"
          disabled={disabled}
          aria-busy={sharing || undefined}
          onClick={() => void labels.share(target)}
        >
          {sharing && <Loader2 aria-hidden="true" className="animate-spin motion-reduce:animate-none" />}
          {t(shareKey)}
        </Button>
      </div>
      {busy && (
        <p role="status" className="text-base text-muted-foreground">
          {t('label.working')}
        </p>
      )}
      {disabledReason && <p className="text-base text-muted-foreground">{t(disabledReason)}</p>}
      {notice && (
        <Alert tone={notice.tone} className="text-base">
          <span className="grid gap-2">
            <span>{t(notice.key)}</span>
            {notice.url && (
              <a
                href={notice.url}
                target="_blank"
                rel="noopener noreferrer"
                className="inline-flex min-h-11 w-fit items-center gap-2 rounded-md font-semibold underline underline-offset-4 outline-none focus-visible:ring-2 focus-visible:ring-ring"
              >
                <ExternalLink aria-hidden="true" className="size-4" />
                {t('label.openLink')}
              </a>
            )}
          </span>
        </Alert>
      )}
    </div>
  );
}
