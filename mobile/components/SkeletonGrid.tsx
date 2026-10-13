import React from 'react';

const SKELETON_HEIGHTS = [
  'h-[220px]', 'h-[310px]', 'h-[180px]', 'h-[270px]',
  'h-[340px]', 'h-[200px]', 'h-[290px]', 'h-[240px]',
  'h-[320px]', 'h-[190px]', 'h-[280px]', 'h-[230px]'
];

export const SkeletonCard: React.FC<{ index: number }> = ({ index }) => {
  const heightClass = SKELETON_HEIGHTS[index % SKELETON_HEIGHTS.length];
  
  return (
    <div 
      className={`
        relative w-full rounded-[16px] mb-2 break-inside-avoid overflow-hidden
        bg-[#181818] border border-white/5 animate-pulse
        ${heightClass}
      `}
    >
      <div className="absolute inset-0 bg-gradient-to-t from-black/50 via-transparent to-transparent pointer-events-none" />
      <div 
        className="absolute inset-0 bg-gradient-to-r from-transparent via-white/[0.04] to-transparent pointer-events-none"
        style={{
          backgroundSize: '200% 100%',
          animation: 'shimmer 2s infinite linear',
        }}
      />
    </div>
  );
};

export const SkeletonGrid: React.FC<{ count?: number; className?: string }> = ({ count = 12, className = '' }) => {
  return (
    <div className={`columns-2 sm:columns-2 md:columns-3 lg:columns-4 xl:columns-5 gap-2 px-1 md:px-2 animate-fade-in ${className}`}>
      {Array.from({ length: count }).map((_, index) => (
        <SkeletonCard key={index} index={index} />
      ))}
    </div>
  );
};

export default SkeletonGrid;
