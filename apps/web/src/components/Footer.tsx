'use client';

import React from 'react';
import Link from 'next/link';

export const Footer: React.FC = () => {
  const currentYear = new Date().getFullYear();

  return (
    <footer className="border-t border-border bg-surface">
      <div className="mx-auto max-w-7xl px-4 py-12">
        {/* Footer content grid */}
        <div className="grid grid-cols-1 md:grid-cols-4 gap-8 mb-8">
          {/* Brand column */}
          <div>
            <h3 className="text-lg font-bold text-accent mb-4">Under The Hammer</h3>
            <p className="text-sm text-text-muted">Cricket information and multiplayer auction platform.</p>
          </div>

          {/* Product links */}
          <div>
            <h4 className="text-sm font-semibold text-primary mb-4">Product</h4>
            <ul className="space-y-2">
              <li>
                <Link href="/" className="text-sm text-text-muted hover:text-accent transition-colors">
                  Home
                </Link>
              </li>
              <li>
                <Link href="/about" className="text-sm text-text-muted hover:text-accent transition-colors">
                  About
                </Link>
              </li>
              <li>
                <Link href="/news" className="text-sm text-text-muted hover:text-accent transition-colors">
                  News
                </Link>
              </li>
              <li>
                <Link href="/auction" className="text-sm text-text-muted hover:text-accent transition-colors">
                  Auctions
                </Link>
              </li>
            </ul>
          </div>

          {/* Company links */}
          <div>
            <h4 className="text-sm font-semibold text-primary mb-4">Company</h4>
            <ul className="space-y-2">
              <li>
                <a href="#contact" className="text-sm text-text-muted hover:text-accent transition-colors">
                  Contact
                </a>
              </li>
              <li>
                <a href="#support" className="text-sm text-text-muted hover:text-accent transition-colors">
                  Support
                </a>
              </li>
              <li>
                <a href="#blog" className="text-sm text-text-muted hover:text-accent transition-colors">
                  Blog
                </a>
              </li>
            </ul>
          </div>

          {/* Legal links */}
          <div>
            <h4 className="text-sm font-semibold text-primary mb-4">Legal</h4>
            <ul className="space-y-2">
              <li>
                <a href="#privacy" className="text-sm text-text-muted hover:text-accent transition-colors">
                  Privacy Policy
                </a>
              </li>
              <li>
                <a href="#terms" className="text-sm text-text-muted hover:text-accent transition-colors">
                  Terms of Service
                </a>
              </li>
              <li>
                <a href="#cookies" className="text-sm text-text-muted hover:text-accent transition-colors">
                  Cookie Policy
                </a>
              </li>
            </ul>
          </div>
        </div>

        {/* Bottom footer */}
        <div className="border-t border-border pt-8 flex flex-col sm:flex-row justify-between items-center gap-4">
          <p className="text-xs text-text-muted">
            &copy; {currentYear} Under The Hammer. All rights reserved.
          </p>
          <div className="flex items-center gap-4">
            <a href="#twitter" aria-label="Twitter" className="text-text-muted hover:text-accent transition-colors">
              <svg className="w-5 h-5" fill="currentColor" viewBox="0 0 24 24">
                <path d="M23 3a10.9 10.9 0 11-3.3 4.3 5 5 0 0 0 7.3-7.3z" />
              </svg>
            </a>
            <a href="#linkedin" aria-label="LinkedIn" className="text-text-muted hover:text-accent transition-colors">
              <svg className="w-5 h-5" fill="currentColor" viewBox="0 0 24 24">
                <path d="M16 8a6 6 0 016 6v7h-4v-7a2 2 0 00-2-2 2 2 0 00-2 2v7h-4v-7a6 6 0 016-6zM2 9h4v12H2z" />
                <circle cx="4" cy="4" r="2" />
              </svg>
            </a>
          </div>
        </div>
      </div>
    </footer>
  );
};

export default Footer;
