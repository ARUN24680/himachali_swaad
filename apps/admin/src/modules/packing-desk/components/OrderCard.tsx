import type { PartnerOrderCard } from '@pk/shared';
import { Badge, Button, Checkbox, cn } from '@pk/ui';
import { ArrowRight, CalendarCheck, Clock, MapPin, Truck } from 'lucide-react';
import { useId } from 'react';
import { Link } from 'react-router';
import { useT } from '@/i18n';
import { formatCalendarDate } from '@/lib/dates';
import { BatchTag } from './BatchTag';
import { formatIstTime, istDayLabel } from './deskFormat';
import { LabelButtons } from './LabelButtons';

export type OrderCardMode = 'pack' | 'packed' | 'pickup';

interface OrderCardProps {
  order: PartnerOrderCard;
  mode: OrderCardMode;
  now: number;
  /** A4 selection mode (to-pack tab). */
  selectable?: boolean;
  selected?: boolean;
  onToggleSelect?: () => void;
  /** Slide-out after Mark Packed; `onExited` fires when the animation ends. */
  exiting?: boolean;
  onExited?: () => void;
}

/** The items to pick, with their FIFO-allocated batch codes (D-23, D-42) — used on cards and the pack screen. */
export function OrderItems({ order, large = false }: { order: PartnerOrderCard; large?: boolean }) {
  const t = useT();
  return (
    <ul className="grid gap-3 rounded-md bg-muted/70 p-3">
      {order.items.map((item) => (
        <li key={item.sku} className="grid gap-2">
          <div className="flex items-baseline gap-2">
            <span className={cn('shrink-0 font-bold tabular-nums', large ? 'text-xl' : 'text-lg')}>
              {t('card.quantity', { qty: item.quantity })}
            </span>
            <span className={cn('min-w-0 font-semibold', large ? 'text-xl' : 'text-lg')}>{item.title}</span>
            <span className="ml-auto shrink-0 text-base text-muted-foreground tabular-nums">
              {t('card.weight', { g: item.netWeightG })}
            </span>
          </div>
          {item.batches.length > 0 && (
            <div className="flex flex-wrap items-center gap-2">
              <span className="text-base text-muted-foreground">{t('card.pickJar')}</span>
              {item.batches.map((b) => (
                <BatchTag key={b.batchCode}>
                  {t('card.jarsFromBatch', { batch: b.batchCode, qty: b.quantity })}
                </BatchTag>
              ))}
            </div>
          )}
        </li>
      ))}
    </ul>
  );
}

export function OrderCard({
  order,
  mode,
  now,
  selectable,
  selected,
  onToggleSelect,
  exiting,
  onExited,
}: OrderCardProps) {
  const t = useT();
  const headingId = useId();
  const late = mode === 'pack' && Date.parse(order.packBy) < now;

  return (
    <article
      aria-labelledby={headingId}
      data-order={order.orderCode}
      onAnimationEnd={exiting ? onExited : undefined}
      className={cn(
        'grid content-start gap-4 rounded-lg border border-border bg-card p-4 text-card-foreground',
        selected && 'border-ring ring-1 ring-ring',
        exiting &&
          'pointer-events-none animate-out duration-300 fill-mode-forwards fade-out slide-out-to-right-full motion-reduce:duration-1',
      )}
    >
      <div className="flex flex-wrap items-start justify-between gap-x-3 gap-y-1">
        <div className="grid min-w-0 gap-0.5">
          <p className="text-sm font-medium tracking-[0.08em] text-muted-foreground uppercase">{t('card.order')}</p>
          <h3 id={headingId} className="font-sans text-2xl font-bold whitespace-nowrap tabular-nums">
            #{order.orderCode}
          </h3>
        </div>
        <Badge tone={order.labelReady ? 'success' : 'warning'} className="mt-1 shrink-0 text-sm">
          {order.labelReady ? t('card.labelReady') : t('card.labelPending')}
        </Badge>
      </div>

      <OrderItems order={order} />

      <ul className="grid gap-2 text-base">
        {mode === 'pack' && (
          <li className={cn('flex items-start gap-2', late ? 'font-semibold text-destructive' : 'text-foreground')}>
            <Clock aria-hidden="true" className="mt-0.5 size-5 shrink-0" />
            <span>
              {t('card.packBy', { time: formatIstTime(order.packBy), day: istDayLabel(order.packBy, now, t) })}
              {late && <span className="block">{t('card.late')}</span>}
            </span>
          </li>
        )}
        {mode !== 'pack' && order.pickupDate && (
          <li className="flex items-start gap-2">
            <CalendarCheck aria-hidden="true" className="mt-0.5 size-5 shrink-0 text-muted-foreground" />
            <span>{t('card.pickupOn', { date: formatCalendarDate(order.pickupDate) })}</span>
          </li>
        )}
        <li className="flex items-start gap-2">
          <MapPin aria-hidden="true" className="mt-0.5 size-5 shrink-0 text-muted-foreground" />
          <span className="min-w-0">
            {t('card.customer', { name: order.customerFirstName, city: order.city, state: order.state })}
          </span>
        </li>
        <li className="flex items-start gap-2 text-muted-foreground">
          <Truck aria-hidden="true" className="mt-0.5 size-5 shrink-0" />
          <span className="min-w-0 break-all">
            {order.courierName && order.awbCode
              ? t('card.courier', { courier: order.courierName, awb: order.awbCode })
              : t('card.courierPending')}
          </span>
        </li>
      </ul>

      {mode === 'pack' && selectable && (
        <label
          className={cn(
            'flex min-h-12 cursor-pointer items-center gap-3 rounded-md border border-input px-4 text-base font-medium',
            !order.labelReady && 'cursor-not-allowed opacity-60',
          )}
        >
          <Checkbox
            checked={Boolean(selected)}
            disabled={!order.labelReady}
            onCheckedChange={() => onToggleSelect?.()}
            aria-label={t('card.selectForA4', { code: order.orderCode })}
            className="size-6"
          />
          <span aria-hidden="true">{order.labelReady ? t('a4.start') : t('card.labelFirst')}</span>
        </label>
      )}

      {mode === 'pack' && !selectable && (
        <Button asChild size="lg" className="w-full text-base">
          <Link to={`/desk/pack/${order.orderCode}`}>
            {t('card.packAction')}
            <ArrowRight aria-hidden="true" />
          </Link>
        </Button>
      )}

      {mode !== 'pack' && (
        <LabelButtons
          target={{ kind: 'order', code: order.orderCode }}
          disabledReason={order.labelReady ? undefined : 'label.notReady'}
        />
      )}
    </article>
  );
}
