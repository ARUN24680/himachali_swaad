import { Card, CardDescription, CardHeader, CardTitle } from '@pk/ui';
import { Link } from 'react-router';

export default function HomePage() {
  return (
    <Card className="max-w-xl">
      <CardHeader>
        <CardTitle>Operations portal</CardTitle>
        <CardDescription>
          Sign-in arrives in Phase 2 and the catalog in Phase 3.
          {import.meta.env.DEV && (
            <>
              {' '}
              Preview the theme on the{' '}
              <Link to="/dev/tokens" className="font-medium text-accent-foreground underline underline-offset-4">
                design tokens page
              </Link>
              .
            </>
          )}
        </CardDescription>
      </CardHeader>
    </Card>
  );
}
