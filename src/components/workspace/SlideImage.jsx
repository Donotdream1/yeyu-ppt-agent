import React, { useEffect, useState } from "react";
import { ImageOff } from "lucide-react";
export default function SlideImage({ src, alt, className = "" }) {
  const [failed, setFailed] = useState(false);
  useEffect(() => setFailed(false), [src]);
  return src && !failed ? (
    <img
      className={className}
      src={src}
      alt={alt}
      loading="lazy"
      onError={() => setFailed(true)}
    />
  ) : (
    <div className={`slide-placeholder ${className}`}>
      <ImageOff size={24} />
      <span>预览暂不可用</span>
    </div>
  );
}
