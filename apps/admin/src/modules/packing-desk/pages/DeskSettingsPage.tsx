import { Button, ToggleGroup, ToggleGroupItem } from '@pk/ui';
import { Loader2, LogOut } from 'lucide-react';
import { useMe } from '@/hooks/useMe';
import { useLanguageStore, useT, type Language } from '@/i18n';
import { useSignOut } from '@/modules/auth';
import { useThemeStore, type ThemePreference } from '@/store/theme.store';
import { DeskSection } from '../components/DeskSection';
import { InstallCard } from '../components/InstallCard';
import { PushAlertsCard } from '../components/PushAlertsCard';

/** /desk/settings — onboarding + preferences: language, theme, alerts, install guide, sign out. */
export default function DeskSettingsPage() {
  const t = useT();
  const me = useMe();
  const { language, setLanguage } = useLanguageStore();
  const { preference, setPreference } = useThemeStore();
  const signOut = useSignOut();
  const name = me.data?.user.fullName ?? me.data?.user.email ?? '';

  return (
    <div className="mx-auto grid w-full max-w-3xl gap-4">
      <h1 className="font-serif text-3xl font-semibold">{t('settings.title')}</h1>

      <DeskSection title={t('lang.title')}>
        <ToggleGroup
          type="single"
          value={language}
          onValueChange={(v) => v && setLanguage(v as Language)}
          aria-label={t('lang.title')}
        >
          <ToggleGroupItem value="hi" lang="hi-Latn" className="min-h-12 text-base">
            {t('lang.hindi')}
          </ToggleGroupItem>
          <ToggleGroupItem value="en" lang="en" className="min-h-12 text-base">
            {t('lang.english')}
          </ToggleGroupItem>
        </ToggleGroup>
      </DeskSection>

      <PushAlertsCard />
      <InstallCard />

      <DeskSection title={t('settings.themeTitle')}>
        <ToggleGroup
          type="single"
          value={preference}
          onValueChange={(v) => v && setPreference(v as ThemePreference)}
          aria-label={t('settings.themeTitle')}
        >
          <ToggleGroupItem value="light" className="min-h-12 text-base">
            {t('settings.themeLight')}
          </ToggleGroupItem>
          <ToggleGroupItem value="dark" className="min-h-12 text-base">
            {t('settings.themeDark')}
          </ToggleGroupItem>
          <ToggleGroupItem value="system" className="min-h-12 text-base">
            {t('settings.themeSystem')}
          </ToggleGroupItem>
        </ToggleGroup>
      </DeskSection>

      <DeskSection title={t('settings.accountTitle')}>
        {name && <p className="text-base">{t('settings.signedInAs', { name })}</p>}
        <Button
          type="button"
          variant="outline"
          size="lg"
          className="w-full text-base sm:w-fit"
          disabled={signOut.isPending}
          onClick={() => signOut.mutate()}
        >
          {signOut.isPending ? (
            <Loader2 aria-hidden="true" className="animate-spin motion-reduce:animate-none" />
          ) : (
            <LogOut aria-hidden="true" />
          )}
          {t('settings.signOut')}
        </Button>
      </DeskSection>
    </div>
  );
}
