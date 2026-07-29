import React, { useState } from 'react';

interface InfoTooltipProps {
  text: string;
  children?: React.ReactNode;
}

export function InfoTooltip({ text, children }: InfoTooltipProps) {
  const [isVisible, setIsVisible] = useState(false);

  return (
    <div className="relative inline-flex items-center">
      {children}
      <button
        type="button"
        onClick={() => setIsVisible(!isVisible)}
        className="ml-1 rounded-full bg-neutral-200 p-0.5 text-neutral-600 hover:bg-neutral-300 transition-colors"
        aria-label="Show help info"
      >
        <svg className="h-3 w-3" fill="none" viewBox="0 0 24 24" stroke="currentColor">
          <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M13 16h-1v-4h-1m1-4h.01M21 12a9 9 0 11-18 0 9 9 0 0118 0z" />
        </svg>
      </button>

      {isVisible && (
        <div className="absolute z-50 bottom-full mb-2 flex w-64 flex-col rounded border bg-white p-3 shadow-lg ring-1 ring-black/5">
          <p className="text-xs text-neutral-700">{text}</p>
        </div>
      )}
    </div>
  );
}
