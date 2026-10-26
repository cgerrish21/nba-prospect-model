'use client';

import Link from 'next/link';
import { usePathname } from 'next/navigation';
import { cn } from '@/lib/utils';

const links = [
  { href: '/summary', label: 'Summary' },
  { href: '/success', label: 'Success' },
  { href: '/draft-2025', label: '2025 Validation' },
  { href: '/draft-2026', label: '2026 Draft' },
];

export function Navbar() {
  const pathname = usePathname();

  return (
    <nav className="border-b border-border bg-card">
      <div className="mx-auto max-w-7xl px-4 sm:px-6 lg:px-8">
        <div className="flex h-14 items-center justify-between">
          <div className="flex items-center gap-8">
            <Link href="/" className="text-lg font-bold tracking-tight">
              Prospect Model
            </Link>
            <div className="flex gap-1">
              {links.map((link) => (
                <Link
                  key={link.href}
                  href={link.href}
                  className={cn(
                    'rounded-md px-3 py-1.5 text-sm font-medium transition-colors',
                    pathname === link.href
                      ? 'bg-primary text-primary-foreground'
                      : 'text-muted-foreground hover:bg-accent hover:text-accent-foreground'
                  )}
                >
                  {link.label}
                </Link>
              ))}
            </div>
          </div>
          <div className="text-xs text-muted-foreground">
            NBA Draft Fantasy Value Predictor
          </div>
        </div>
      </div>
    </nav>
  );
}
