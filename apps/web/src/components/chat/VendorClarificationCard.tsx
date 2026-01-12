'use client';

import React from 'react';
import { Building2 } from 'lucide-react';
import { cn } from '@/lib/utils';
import type { VendorClarificationNeededPayload } from '@/lib/websocket';

interface VendorClarificationCardProps {
  /** Payload from vendor_clarification_needed event */
  payload: VendorClarificationNeededPayload;
  /** Called when user selects a vendor */
  onSelectVendor: (vendorName: string) => void;
  /** Optional className */
  className?: string;
}

/**
 * VendorClarificationCard
 *
 * Displays when multiple vendors are detected in uploaded files.
 * User must select which vendor to score first.
 *
 * Epic 18.4.2b: Inline buttons in chat for vendor selection
 */
export function VendorClarificationCard({
  payload,
  onSelectVendor,
  className,
}: VendorClarificationCardProps) {
  return (
    <div
      data-testid="vendor-clarification-card"
      className={cn(
        'bg-slate-50 rounded-2xl rounded-tl-sm p-4 max-w-md border border-slate-100',
        className
      )}
    >
      {/* Message */}
      <p className="text-sm text-slate-700 mb-3">
        {payload.message}
      </p>

      {/* Vendor selection buttons */}
      <div className="space-y-2">
        {payload.vendors.map((vendor, index) => (
          <button
            key={vendor.name}
            type="button"
            onClick={() => onSelectVendor(vendor.name)}
            data-testid={`vendor-select-${index}`}
            className={cn(
              'w-full flex items-center gap-3 px-4 py-3 text-left rounded-lg transition-colors',
              'border border-slate-200 bg-white',
              'hover:border-blue-300 hover:bg-blue-50',
              'focus:outline-none focus-visible:ring-2 focus-visible:ring-blue-500 focus-visible:ring-offset-2'
            )}
          >
            <Building2 className="h-5 w-5 text-slate-400 flex-shrink-0" />
            <div className="flex-1 min-w-0">
              <span className="text-sm font-medium text-slate-800 block truncate">
                {vendor.name}
              </span>
              <span className="text-xs text-slate-500">
                {vendor.fileCount} {vendor.fileCount === 1 ? 'file' : 'files'}
              </span>
            </div>
          </button>
        ))}
      </div>
    </div>
  );
}

export default VendorClarificationCard;
