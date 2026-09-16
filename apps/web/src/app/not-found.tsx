import Link from 'next/link';
import { Button } from '@/components/ui/button';

export default function NotFound() {
  return (
    <div className="flex flex-1 flex-col items-center justify-center gap-3 p-10 text-center">
      <p className="text-sm font-medium text-muted-foreground">404</p>
      <h1 className="text-xl font-semibold">We couldn&apos;t find that page</h1>
      <p className="max-w-sm text-sm text-muted-foreground">
        The page may have been moved, or the link may be out of date.
      </p>
      <Button nativeButton={false} render={<Link href="/" />} className="mt-2">
        Back to home
      </Button>
    </div>
  );
}
