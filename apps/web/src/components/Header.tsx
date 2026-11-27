'use client';

import React, { useState } from 'react';
import Link from 'next/link';
import { Menu, X } from 'lucide-react';
import { useAuth } from '@/hooks/useAuth';
import { ROUTES } from '@/lib/constants';
import Button from './Button';
import ProfileDropdown from './ProfileDropdown';
import MobileNav from './MobileNav';
import { NotificationBell } from './notifications/NotificationBell';

export const Header: React.FC = () => {
  const { isAuthenticated, isLoading } = useAuth();
  const [mobileMenuOpen, setMobileMenuOpen] = useState(false);

  const navItems = [
    { label: 'Home', href: ROUTES.home },
    { label: 'About', href: ROUTES.about },
    { label: 'News', href: ROUTES.news },
    { label: 'Live', href: ROUTES.live },
    { label: 'Auction', href: ROUTES.auction },
  ];

  return (
    <>
      <header className="sticky top-0 z-40 border-b border-border bg-surface">
        <div className="mx-auto max-w-7xl px-4">
          <div className="flex h-16 items-center justify-between">
            {/* Logo */}
            <Link href={ROUTES.home} className="flex items-center gap-2 font-bold text-xl text-accent">
              <span>⚒️</span>
              <span className="hidden sm:inline">Under The Hammer</span>
              <span className="sm:hidden">UTH</span>
            </Link>

            {/* Desktop Nav */}
            <nav className="hidden items-center gap-8 md:flex">
              {navItems.map((item) => (
                <Link
                  key={item.href}
                  href={item.href}
                  className="text-sm font-medium text-text-muted hover:text-accent transition-colors duration-200"
                >
                  {item.label}
                </Link>
              ))}
            </nav>

            {/* Right side: Auth buttons or profile dropdown */}
            <div className="flex items-center gap-4">
              {!isLoading && (
                <>
                  {isAuthenticated ? (
                    <>
                      <NotificationBell />
                      <ProfileDropdown />
                    </>
                  ) : (
                    <div className="hidden sm:flex items-center gap-3">
                      <Link href={ROUTES.signIn}>
                        <Button variant="outline" size="sm">
                          Sign In
                        </Button>
                      </Link>
                      <Link href={ROUTES.signUp}>
                        <Button variant="primary" size="sm">
                          Sign Up
                        </Button>
                      </Link>
                    </div>
                  )}
                </>
              )}

              {/* Mobile menu toggle */}
              <button
                className="md:hidden p-2 hover:bg-surface-raised rounded-md transition-colors duration-200 cursor-pointer"
                onClick={() => setMobileMenuOpen(true)}
                aria-label="Open mobile menu"
              >
                <Menu size={24} />
              </button>
            </div>
          </div>
        </div>
      </header>

      {/* Mobile Nav */}
      <MobileNav
        isOpen={mobileMenuOpen}
        onClose={() => setMobileMenuOpen(false)}
        items={navItems}
      />
    </>
  );
};

export default Header;
