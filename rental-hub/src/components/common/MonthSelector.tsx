import React from 'react';
import { ChevronLeft, ChevronRight, Calendar } from 'lucide-react';

interface MonthSelectorProps {
  currentMonth: string; // "2026-10"
  onChange: (newMonth: string) => void;
  className?: string;
}

export const MonthSelector: React.FC<MonthSelectorProps> = ({ currentMonth, onChange, className = '' }) => {
  const [year, month] = currentMonth.split('-').map(Number);
  const date = new Date(year, month - 1, 1);
  const formattedMonth = date.toLocaleDateString('en-GB', { month: 'long', year: 'numeric' });

  const handlePrev = () => {
    const prevDate = new Date(year, month - 2, 1);
    const newMonthStr = `${prevDate.getFullYear()}-${String(prevDate.getMonth() + 1).padStart(2, '0')}`;
    onChange(newMonthStr);
  };

  const handleNext = () => {
    const nextDate = new Date(year, month, 1);
    const newMonthStr = `${nextDate.getFullYear()}-${String(nextDate.getMonth() + 1).padStart(2, '0')}`;
    onChange(newMonthStr);
  };

  return (
    <div className={`flex items-center justify-between bg-white border border-[#E5E7EB] rounded-lg px-3 py-2 shadow-2xs ${className}`}>
      <button
        type="button"
        onClick={handlePrev}
        className="p-1 text-gray-500 hover:text-gray-800 hover:bg-gray-100 rounded cursor-pointer transition-colors"
        aria-label="Previous month"
      >
        <ChevronLeft size={18} />
      </button>

      <div className="flex items-center gap-2 text-sm font-semibold text-gray-800 select-none">
        <Calendar size={16} className="text-brand-700" />
        <span>{formattedMonth}</span>
      </div>

      <button
        type="button"
        onClick={handleNext}
        className="p-1 text-gray-500 hover:text-gray-800 hover:bg-gray-100 rounded cursor-pointer transition-colors"
        aria-label="Next month"
      >
        <ChevronRight size={18} />
      </button>
    </div>
  );
};
