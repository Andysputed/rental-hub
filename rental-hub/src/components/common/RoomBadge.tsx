import React from 'react';
import { DoorClosed } from 'lucide-react';

interface RoomBadgeProps {
  number: string;
  isOccupied: boolean;
  size?: 'sm' | 'md' | 'lg';
  className?: string;
  onClick?: () => void;
}

export const RoomBadge: React.FC<RoomBadgeProps> = ({
  number,
  isOccupied,
  size = 'md',
  className = '',
  onClick,
}) => {
  const sizeClasses = {
    sm: 'w-8 h-10 text-[10px]',
    md: 'w-10 h-13 text-xs',
    lg: 'w-12 h-16 text-sm',
  };

  const iconSizes = {
    sm: 12,
    md: 16,
    lg: 20,
  };

  return (
    <div
      onClick={onClick}
      className={`flex flex-col items-center justify-center rounded-lg border transition-all ${
        isOccupied
          ? 'bg-[#EBF5F0] border-[#CDE5DA] text-brand-700'
          : 'bg-[#F9FAFB] border-dashed border-[#D1D5DB] text-[#9CA3AF]'
      } ${sizeClasses[size]} ${onClick ? 'cursor-pointer hover:shadow-sm' : ''} ${className}`}
    >
      <DoorClosed size={iconSizes[size]} strokeWidth={2} className="mb-0.5" />
      <span className="font-semibold">{number}</span>
    </div>
  );
};
