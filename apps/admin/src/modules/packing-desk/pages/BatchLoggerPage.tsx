import type { Batch } from '@pk/shared';
import { Tabs, TabsContent, TabsList, TabsTrigger } from '@pk/ui';
import { useState } from 'react';
import { useSearchParams } from 'react-router';
import { useT } from '@/i18n';
import { BatchLoggerForm } from '../components/BatchLoggerForm';
import { BatchSuccess } from '../components/BatchSuccess';
import { KitchenStock } from '../components/KitchenStock';

/** /desk/batches — log a batch in < 30 s, or check own stock (Phase 7 §7.8, D-42). */
export default function BatchLoggerPage() {
  const t = useT();
  const [params, setParams] = useSearchParams();
  const tab = params.get('tab') === 'stock' ? 'stock' : 'new';
  const [logged, setLogged] = useState<Batch | null>(null);
  // Remount the form after each batch so it starts clean
  const [formKey, setFormKey] = useState(0);

  return (
    <div className="mx-auto grid w-full max-w-3xl gap-4">
      <h1 className="font-serif text-3xl font-semibold">{t('batches.title')}</h1>
      <Tabs
        value={tab}
        onValueChange={(v) => setParams(v === 'stock' ? { tab: 'stock' } : {}, { replace: true })}
        className="grid gap-4"
      >
        <TabsList aria-label={t('batches.tabsLabel')}>
          <TabsTrigger value="new" className="text-base">
            {t('batches.tabNew')}
          </TabsTrigger>
          <TabsTrigger value="stock" className="text-base">
            {t('batches.tabStock')}
          </TabsTrigger>
        </TabsList>
        <TabsContent value="new">
          {logged ? (
            <BatchSuccess
              batch={logged}
              onAnother={() => {
                setLogged(null);
                setFormKey((k) => k + 1);
              }}
              onViewStock={() => {
                setLogged(null);
                setFormKey((k) => k + 1);
                setParams({ tab: 'stock' }, { replace: true });
              }}
            />
          ) : (
            <BatchLoggerForm key={formKey} onLogged={setLogged} />
          )}
        </TabsContent>
        <TabsContent value="stock">
          <KitchenStock />
        </TabsContent>
      </Tabs>
    </div>
  );
}
