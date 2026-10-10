import Link from 'next/link';

export default function NotFound() {
  return (
    <main className="mx-auto grid min-h-dvh max-w-xl content-center gap-3 px-4 text-center">
      <h1 className="text-3xl font-semibold">Page not found</h1>
      <p className="text-muted-foreground">The page you are looking for has moved or never existed.</p>
      <Link href="/" className="font-medium text-accent-foreground underline underline-offset-4">
        Go to the home page
      </Link>
    </main>
  );
}
