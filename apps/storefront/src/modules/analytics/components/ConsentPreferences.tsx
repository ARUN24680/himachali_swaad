'use client';

import {
  Button,
  Dialog,
  DialogContent,
  DialogDescription,
  DialogFooter,
  DialogHeader,
  DialogTitle,
  Label,
  Switch,
} from '@pk/ui';
import { useState } from 'react';
import { useConsentStore, type ConsentChoice } from '../store/consent.store';

const CATEGORIES: { key: keyof ConsentChoice | 'necessary'; title: string; body: string }[] = [
  {
    key: 'necessary',
    title: 'Strictly necessary',
    body: 'Your cart, this consent choice, theme and last-checked pincode. Stored only on this device. Always on.',
  },
  {
    key: 'analytics',
    title: 'Analytics',
    body: 'Google Analytics 4 — which pages and products are viewed, so we can improve the shop. No ad personalisation.',
  },
  {
    key: 'marketing',
    title: 'Marketing',
    body: 'Meta Pixel and Conversions API — measures our Instagram/Facebook ads (product views, add to cart, checkout starts).',
  },
];

/** Granular consent, reachable from the banner and from "Cookie preferences" in every footer. */
export function ConsentPreferences() {
  const open = useConsentStore((s) => s.preferencesOpen);
  const setOpen = useConsentStore((s) => s.setPreferencesOpen);
  return (
    <Dialog open={open} onOpenChange={setOpen}>
      {/* Remount on open so the switches start from the saved choice */}
      {open && <PreferencesForm />}
    </Dialog>
  );
}

function PreferencesForm() {
  const saved = useConsentStore.getState();
  const decide = useConsentStore((s) => s.decide);
  const [choice, setChoice] = useState<ConsentChoice>({ analytics: saved.analytics, marketing: saved.marketing });

  const save = (next: ConsentChoice) => {
    // Vendor scripts can't be unloaded — a withdrawal reloads the page so they are gone.
    const withdrawn = (saved.analytics && !next.analytics) || (saved.marketing && !next.marketing);
    decide(next);
    if (withdrawn) window.location.reload();
  };

  return (
    <DialogContent layout="sheet" className="sm:max-w-lg">
      <DialogHeader>
        <DialogTitle>Cookie preferences</DialogTitle>
        <DialogDescription>
          Optional cookies are off until you switch them on. You can change this any time from the footer.
        </DialogDescription>
      </DialogHeader>
      <ul className="grid gap-3">
        {CATEGORIES.map((c) => {
          const id = `consent-${c.key}`;
          const checked = c.key === 'necessary' ? true : choice[c.key];
          return (
            <li key={c.key} className="flex items-start justify-between gap-4 rounded-lg border border-border p-4">
              <div className="grid gap-1">
                <Label htmlFor={id} className="text-sm font-semibold text-foreground">
                  {c.title}
                </Label>
                <p id={`${id}-desc`} className="text-sm text-muted-foreground">
                  {c.body}
                </p>
              </div>
              <Switch
                id={id}
                aria-describedby={`${id}-desc`}
                checked={checked}
                disabled={c.key === 'necessary'}
                onCheckedChange={(v) => c.key !== 'necessary' && setChoice((p) => ({ ...p, [c.key]: v }))}
              />
            </li>
          );
        })}
      </ul>
      <DialogFooter>
        <Button variant="outline" onClick={() => save({ analytics: false, marketing: false })}>
          Reject all
        </Button>
        <Button variant="secondary" onClick={() => save(choice)}>
          Save choices
        </Button>
        <Button onClick={() => save({ analytics: true, marketing: true })}>Accept all</Button>
      </DialogFooter>
    </DialogContent>
  );
}
