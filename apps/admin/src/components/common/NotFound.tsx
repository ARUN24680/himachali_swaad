import { Button } from '@pk/ui';
import { MapPinOff } from 'lucide-react';
import { Link } from 'react-router';
import { EmptyState } from './StateBlocks';

export function NotFound() {
  return (
    <EmptyState
      icon={MapPinOff}
      title="Page not found"
      description="The link may be old or mistyped."
      action={
        <Button asChild variant="outline">
          <Link to="/">Back to start</Link>
        </Button>
      }
    />
  );
}
