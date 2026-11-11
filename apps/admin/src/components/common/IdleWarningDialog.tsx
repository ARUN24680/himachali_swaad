import {
  Button,
  Dialog,
  DialogContent,
  DialogDescription,
  DialogFooter,
  DialogHeader,
  DialogTitle,
  Progress,
} from '@pk/ui';
import { Clock, LogOut } from 'lucide-react';

/**
 * "Still there?" — shown 60 s before an idle ADMIN session is signed out (audit R-12 / M-8).
 * No close button and no outside-click dismiss: the only ways out are "Stay signed in" or
 * "Sign out now" (or the countdown reaching zero). Bottom sheet on phones, centred from `sm`.
 */
export function IdleWarningDialog({
  open,
  secondsLeft,
  limitMinutes,
  onStay,
  onSignOut,
}: {
  open: boolean;
  secondsLeft: number;
  limitMinutes: number;
  onStay: () => void;
  onSignOut: () => void;
}) {
  const total = Math.max(1, Math.min(60, Math.floor((limitMinutes * 60) / 2)));
  return (
    <Dialog open={open}>
      <DialogContent
        layout="sheet"
        closeLabel={null}
        data-testid="idle-warning"
        onEscapeKeyDown={(e) => e.preventDefault()}
        onPointerDownOutside={(e) => e.preventDefault()}
        onInteractOutside={(e) => e.preventDefault()}
      >
        <DialogHeader className="pr-0">
          <span
            aria-hidden="true"
            className="grid size-12 place-items-center rounded-full bg-warning/15 text-warning [&_svg]:size-6"
          >
            <Clock />
          </span>
          <DialogTitle>Still there?</DialogTitle>
          <DialogDescription>
            You haven&rsquo;t used the admin console for a while. For your security you&rsquo;ll be signed out in{' '}
            <span role="timer" aria-live="off" className="font-semibold text-foreground tabular-nums">
              {secondsLeft} second{secondsLeft === 1 ? '' : 's'}
            </span>
            . Sessions end after {limitMinutes} minutes of inactivity.
          </DialogDescription>
        </DialogHeader>
        <Progress
          value={Math.min(total, Math.max(0, secondsLeft))}
          max={total}
          aria-label="Time left before sign-out"
          className="[&::-moz-progress-bar]:bg-warning [&::-webkit-progress-value]:bg-warning"
        />
        <DialogFooter>
          <Button variant="outline" size="lg" onClick={onSignOut}>
            <LogOut aria-hidden="true" />
            Sign out now
          </Button>
          <Button size="lg" autoFocus onClick={onStay}>
            Stay signed in
          </Button>
        </DialogFooter>
      </DialogContent>
    </Dialog>
  );
}
