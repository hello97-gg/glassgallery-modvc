import React from 'react';

type VideoPlayerProps = React.VideoHTMLAttributes<HTMLVideoElement> & {
  src: string;
};

export default function VideoPlayer(props: VideoPlayerProps) {
  const { src, className, ...restProps } = props;

  return (
    <div className={`flex items-center justify-center bg-black/10 overflow-hidden ${className || 'w-full h-full'}`}>
      <video
        src={src}
        className="w-full h-full object-contain max-h-full"
        controls
        playsInline
        {...restProps}
      />
    </div>
  );
}
