'use client';

import React from 'react';
import Link from 'next/link';
import { X } from 'lucide-react';
import { motion, AnimatePresence } from 'framer-motion';
import { useAuth } from '@/hooks/useAuth';
import { ROUTES } from '@/lib/constants';
import Button from './Button';

export interface MobileNavProps {
  isOpen: boolean;
  onClose: () => void;
  items: Array<{ label: string; href: string }>;
}

export const MobileNav: React.FC<MobileNavProps> = ({ isOpen, onClose, items }) => {
  const { isAuthenticated, isLoading } = useAuth();

  return (
    <AnimatePresence>
      {isOpen && (
        <>
          {/* Backdrop */}
          <motion.div
            initial={{ opacity: 0 }}
            animate={{ opacity: 1 }}
            exit={{ opacity: 0 }}
            onClick={onClose}
            className="fixed inset-0 z-40 bg-black/50 md:hidden"
          />

          {/* Drawer */}
          <motion.div
            initial={{ x: '-100%' }}
            animate={{ x: 0 }}
            exit={{ x: '-100%' }}
            transition={{ type: 'spring', damping: 20 }}
            className="fixed inset-y-0 left-0 z-50 w-64 overflow-y-auto bg-surface border-r border-border md:hidden flex flex-col"
          >
            {/* Close button */}
            <div className="flex items-center justify-between border-b border-border p-4">
              <span className="font-bold text-accent">Menu</span>
              <button
                onClick={onClose}
                className="p-1 hover:bg-surface-raised rounded-md transition-colors duration-200 cursor-pointer"
                aria-label="Close mobile menu"
              >
                <X size={24} />
              </button>
            </div>

            {/* Nav items */}
            <nav className="flex-1 space-y-1 p-4">
              {items.map((item) => (
                <Link
                  key={item.href}
                  href={item.href}
                  onClick={onClose}
                  className="block px-4 py-3 rounded-md text-text hover:bg-surface-raised transition-colors duration-200"
                >
                  {item.label}
                </Link>
              ))}
            </nav>

            {/* Auth buttons for mobile */}
            {!isLoading && !isAuthenticated && (
              <div className="border-t border-border p-4 space-y-2">
                <Link href={ROUTES.signIn} className="block">
                  <Button variant="outline" size="md" className="w-full">
                    Sign In
                  </Button>
                </Link>
                <Link href={ROUTES.signUp} className="block">
                  <Button variant="primary" size="md" className="w-full">
                    Sign Up
                  </Button>
                </Link>
              </div>
            )}
          </motion.div>
        </>
      )}
    </AnimatePresence>
  );
};

export default MobileNav;
