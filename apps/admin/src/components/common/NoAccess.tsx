import { Button } from '@pk/ui';
import { ShieldOff } from 'lucide-react';
import { Link } from 'react-router';
import { EmptyState } from './StateBlocks';

/** In-shell fallback when a signed-in staff member opens a page their role can't use. */
export function NoAccess({ home = '/' }: { home?: string }) {
  return (
    <EmptyState
      icon={ShieldOff}
      title="This page isn’t part of your role"
      description="Ask an admin if you think you should have access."
      action={
        <Button asChild variant="outline">
          <Link to={home}>Go to your start page</Link>
        </Button>
      }
    />
  );
}
