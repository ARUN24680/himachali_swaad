import { Wallet } from 'lucide-react';
import { EmptyState } from '@/components/common/StateBlocks';
import { useT } from '@/i18n';

/** /desk/hisaab — reserved for read-only settlement statements + Acknowledge (Phase 9, D-40). */
export default function HisaabPage() {
  const t = useT();
  return (
    <div className="mx-auto grid w-full max-w-3xl gap-4">
      <h1 className="font-serif text-3xl font-semibold">{t('hisaab.title')}</h1>
      <div className="rounded-lg border border-border bg-card">
        <EmptyState icon={Wallet} title={t('hisaab.soonTitle')} description={t('hisaab.soonBody')} />
      </div>
    </div>
  );
}
