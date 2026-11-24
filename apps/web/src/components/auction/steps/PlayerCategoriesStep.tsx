'use client';

import React from 'react';
import { Plus, Trash2 } from 'lucide-react';
import Button from '../../Button';
import Card from '../../Card';

interface StepProps {
  formData: any;
  onUpdateFormData: (updates: any) => void;
}

export default function PlayerCategoriesStep({ formData, onUpdateFormData }: StepProps) {
  const categories = formData.playerCategories || [];

  const addCategory = () => {
    const newCategory = {
      id: `CAT_${Date.now()}`,
      name: '',
      basePrice: 0,
    };
    onUpdateFormData({
      playerCategories: [...categories, newCategory],
    });
  };

  const updateCategory = (idx: number, updates: any) => {
    const updated = [...categories];
    updated[idx] = { ...updated[idx], ...updates };
    onUpdateFormData({ playerCategories: updated });
  };

  const removeCategory = (idx: number) => {
    if (categories.length > 1) {
      onUpdateFormData({
        playerCategories: categories.filter((_: any, i: number) => i !== idx),
      });
    }
  };

  const formatCurrency = (minor: number): string => {
    const major = minor / 100;
    return `PKR ${major.toLocaleString('en-US', {
      minimumFractionDigits: 0,
      maximumFractionDigits: 0,
    })}`;
  };

  return (
    <div className="space-y-6">
      <p className="text-sm text-text-muted">
        Define player categories and their base prices. Base price is adjusted by bids.
      </p>

      {/* Categories List */}
      <div className="space-y-3">
        {categories.map((category: any, idx: number) => (
          <Card key={category.id} className="border-border/50 p-4">
            <div className="grid gap-4 sm:grid-cols-3 items-end">
              {/* Category Name */}
              <div>
                <label className="mb-1 block text-xs font-semibold">Category Name</label>
                <input
                  type="text"
                  value={category.name || ''}
                  onChange={(e) => updateCategory(idx, { name: e.target.value })}
                  placeholder="e.g., Elite, Premium, Standard"
                  className="w-full rounded-lg border border-border bg-surface px-3 py-2 text-sm text-primary placeholder-text-muted focus:border-accent focus:outline-none"
                />
              </div>

              {/* Base Price */}
              <div>
                <label className="mb-1 block text-xs font-semibold">Base Price</label>
                <div className="flex gap-2">
                  <input
                    type="number"
                    value={Math.round((category.basePrice || 0) / 1000000)}
                    onChange={(e) =>
                      updateCategory(idx, { basePrice: parseInt(e.target.value) * 1000000 })
                    }
                    placeholder="10"
                    className="flex-1 rounded-lg border border-border bg-surface px-3 py-2 text-sm text-primary placeholder-text-muted focus:border-accent focus:outline-none"
                  />
                  <div className="rounded-lg border border-border bg-surface-raised px-3 py-2 text-xs font-semibold whitespace-nowrap">
                    Cr
                  </div>
                </div>
              </div>

              {/* Remove Button */}
              <div>
                <button
                  onClick={() => removeCategory(idx)}
                  disabled={categories.length === 1}
                  className="inline-flex items-center justify-center gap-2 rounded-lg border border-danger/20 bg-danger/5 px-3 py-2 text-sm text-danger transition-all duration-200 hover:border-danger/50 disabled:opacity-50 disabled:cursor-not-allowed"
                >
                  <Trash2 size={16} />
                </button>
              </div>
            </div>
          </Card>
        ))}
      </div>

      {/* Add Category Button */}
      <Button
        variant="outline"
        size="md"
        onClick={addCategory}
        className="w-full flex items-center justify-center gap-2"
      >
        <Plus size={18} />
        Add Category
      </Button>

      {/* Summary */}
      <Card className="border-info/20 bg-info/5 p-4">
        <h4 className="mb-2 text-sm font-semibold">Categories Summary</h4>
        <div className="space-y-1 text-xs text-text-muted">
          {categories.map((cat: any, idx: number) => (
            <p key={cat.id}>
              {idx + 1}. <strong>{cat.name || 'Unnamed'}</strong> — {formatCurrency(cat.basePrice || 0)}
            </p>
          ))}
        </div>
      </Card>
    </div>
  );
}
