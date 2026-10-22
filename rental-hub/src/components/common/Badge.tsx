import React from 'react';

interface BadgeProps {
  children: React.ReactNode;
  variant?: 'paid' | 'overdue' | 'vacant' | 'active' | 'former' | 'neutral' | 'mpesa' | 'cash' | 'bank';
  className?: string;
}

export const Badge: React.FC<BadgeProps> = ({ children, variant = 'neutral', className = '' }) => {
  const getStyles = () => {
    switch (variant) {
      case 'paid':
        return 'bg-[#DEF2E6] text-[#0D5B46] border border-[#C6E7D4]';
      case 'overdue':
        return 'bg-[#FEF3C7] text-amber-text border border-[#FDE68A]';
      case 'vacant':
        return 'bg-[#F3F4F6] text-[#6B7280] border border-[#E5E7EB]';
      case 'active':
        return 'bg-[#EBF5F0] text-brand-700 font-medium border border-[#D1E7DD]';
      case 'former':
        return 'bg-gray-100 text-gray-500 font-medium border border-gray-200';
      case 'mpesa':
        return 'bg-[#EBF5F0] text-brand-700 font-medium';
      case 'cash':
        return 'bg-[#F3F4F6] text-[#4B5563] font-medium';
      case 'bank':
        return 'bg-[#EFF6FF] text-[#1E40AF] font-medium';
      case 'neutral':
      default:
        return 'bg-gray-100 text-gray-700';
    }
  };

  return (
    <span className={`inline-flex items-center px-2.5 py-0.5 rounded-full text-xs font-medium ${getStyles()} ${className}`}>
      {children}
    </span>
  );
};
