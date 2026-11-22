'use client';

import React, { useState } from 'react';
import Link from 'next/link';
import { useRouter } from 'next/navigation';
import {
  LogOut,
  Settings,
  CreditCard,
  Bell,
  Zap,
} from 'lucide-react';
import { motion, AnimatePresence } from 'framer-motion';
import { useAuth } from '@/hooks/useAuth';
import { ROUTES } from '@/lib/constants';
import Avatar from './Avatar';

export const ProfileDropdown: React.FC = () => {
  const router = useRouter();
  const { user, signOut } = useAuth();
  const [isOpen, setIsOpen] = useState(false);

  const handleSignOut = async () => {
    signOut();
    setIsOpen(false);
    router.push(ROUTES.home);
  };

  if (!user) return null;

  const userInitials = `${user.firstName?.[0] || ''}${user.lastName?.[0] || ''}`.toUpperCase();

  const menuItems = [
    {
      label: 'Auction',
      href: ROUTES.auctionWorkspace,
      icon: Zap,
      separator: false,
    },
    {
      label: 'Account',
      href: '#account',
      icon: Settings,
      separator: false,
    },
    {
      label: 'Billing',
      href: '#billing',
      icon: CreditCard,
      separator: false,
    },
    {
      label: 'Notifications',
      href: '#notifications',
      icon: Bell,
      separator: true,
    },
  ];

  return (
    <div className="relative">
      {/* Avatar button */}
      <button
        onClick={() => setIsOpen(!isOpen)}
        className="p-1 hover:bg-surface-raised rounded-full transition-colors duration-200 cursor-pointer"
        aria-label="Profile menu"
      >
        <Avatar initials={userInitials || 'U'} size="md" />
      </button>

      {/* Dropdown menu */}
      <AnimatePresence>
        {isOpen && (
          <>
            {/* Backdrop */}
            <div
              className="fixed inset-0 z-40"
              onClick={() => setIsOpen(false)}
            />

            {/* Menu */}
            <motion.div
              initial={{ opacity: 0, y: -10 }}
              animate={{ opacity: 1, y: 0 }}
              exit={{ opacity: 0, y: -10 }}
              transition={{ duration: 0.2 }}
              className="absolute right-0 top-full mt-2 w-48 rounded-lg border border-border bg-surface shadow-lg z-50"
            >
              {/* User info header */}
              <div className="border-b border-border px-4 py-3">
                <p className="text-sm font-semibold text-text">{user.email}</p>
                <p className="text-xs text-text-muted">
                  {user.firstName} {user.lastName}
                </p>
              </div>

              {/* Menu items */}
              <nav className="py-2">
                {menuItems.map((item, index) => (
                  <div key={item.label}>
                    <Link
                      href={item.href}
                      className="flex items-center gap-3 px-4 py-2 text-sm text-text-muted hover:text-accent hover:bg-surface-raised transition-colors duration-200"
                      onClick={() => {
                        if (item.href !== '#account' && item.href !== '#billing' && item.href !== '#notifications') {
                          setIsOpen(false);
                        }
                      }}
                    >
                      <item.icon size={16} />
                      {item.label}
                    </Link>
                    {item.separator && <div className="border-t border-border my-2" />}
                  </div>
                ))}

                {/* Sign out button */}
                <button
                  onClick={handleSignOut}
                  className="w-full flex items-center gap-3 px-4 py-2 text-sm text-danger hover:bg-surface-raised transition-colors duration-200 text-left border-t border-border"
                >
                  <LogOut size={16} />
                  Sign Out
                </button>
              </nav>
            </motion.div>
          </>
        )}
      </AnimatePresence>
    </div>
  );
};

export default ProfileDropdown;
