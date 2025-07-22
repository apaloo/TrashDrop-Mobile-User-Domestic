import React, { useState, useRef, useEffect, memo } from 'react';

/**
 * Optimized Image component with lazy loading, progressive enhancement, and error handling
 */
const OptimizedImage = memo(({
  src,
  alt,
  className = '',
  width,
  height,
  placeholder = 'blur',
  blurDataURL,
  priority = false,
  onLoad,
  onError,
  ...props
}) => {
  const [isLoaded, setIsLoaded] = useState(false);
  const [hasError, setHasError] = useState(false);
  const [isInView, setIsInView] = useState(priority);
  const imgRef = useRef(null);
  const observerRef = useRef(null);

  // Intersection Observer for lazy loading
  useEffect(() => {
    if (priority || isInView) return;

    const observer = new IntersectionObserver(
      ([entry]) => {
        if (entry.isIntersecting) {
          setIsInView(true);
          observer.disconnect();
        }
      },
      {
        rootMargin: '50px',
        threshold: 0.1
      }
    );

    observerRef.current = observer;

    if (imgRef.current) {
      observer.observe(imgRef.current);
    }

    return () => {
      if (observerRef.current) {
        observerRef.current.disconnect();
      }
    };
  }, [priority, isInView]);

  // Handle image load
  const handleLoad = (e) => {
    setIsLoaded(true);
    if (onLoad) onLoad(e);
  };

  // Handle image error
  const handleError = (e) => {
    setHasError(true);
    if (onError) onError(e);
  };

  // Generate placeholder styles
  const getPlaceholderStyles = () => {
    if (placeholder === 'blur' && blurDataURL) {
      return {
        backgroundImage: `url(${blurDataURL})`,
        backgroundSize: 'cover',
        backgroundPosition: 'center',
        filter: 'blur(10px)',
        transform: 'scale(1.1)'
      };
    }
    
    if (placeholder === 'blur') {
      return {
        backgroundColor: '#f3f4f6',
        backgroundImage: 'linear-gradient(45deg, #f9fafb 25%, transparent 25%), linear-gradient(-45deg, #f9fafb 25%, transparent 25%), linear-gradient(45deg, transparent 75%, #f9fafb 75%), linear-gradient(-45deg, transparent 75%, #f9fafb 75%)',
        backgroundSize: '20px 20px',
        backgroundPosition: '0 0, 0 10px, 10px -10px, -10px 0px'
      };
    }

    return {};
  };

  // Error fallback component
  const ErrorFallback = () => (
    <div 
      className={`flex items-center justify-center bg-gray-100 dark:bg-gray-800 ${className}`}
      style={{ width, height }}
    >
      <div className="text-center">
        <svg 
          className="w-8 h-8 mx-auto text-gray-400 dark:text-gray-600 mb-2" 
          fill="none" 
          stroke="currentColor" 
          viewBox="0 0 24 24"
        >
          <path 
            strokeLinecap="round" 
            strokeLinejoin="round" 
            strokeWidth={2} 
            d="M4 16l4.586-4.586a2 2 0 012.828 0L16 16m-2-2l1.586-1.586a2 2 0 012.828 0L20 14m-6-6h.01M6 20h12a2 2 0 002-2V6a2 2 0 00-2-2H6a2 2 0 00-2 2v12a2 2 0 002 2z" 
          />
        </svg>
        <p className="text-xs text-gray-500 dark:text-gray-400">
          Failed to load image
        </p>
      </div>
    </div>
  );

  // Loading placeholder component
  const LoadingPlaceholder = () => (
    <div
      ref={imgRef}
      className={`${className} ${isLoaded ? 'hidden' : ''}`}
      style={{
        width,
        height,
        ...getPlaceholderStyles()
      }}
      aria-label={`Loading ${alt}`}
    >
      {placeholder === 'blur' && (
        <div className="animate-pulse bg-gray-200 dark:bg-gray-700 w-full h-full rounded" />
      )}
    </div>
  );

  if (hasError) {
    return <ErrorFallback />;
  }

  return (
    <div className="relative overflow-hidden">
      {/* Loading placeholder */}
      {!isLoaded && <LoadingPlaceholder />}
      
      {/* Actual image */}
      {isInView && (
        <img
          ref={imgRef}
          src={src}
          alt={alt}
          className={`${className} ${
            isLoaded 
              ? 'opacity-100 transition-opacity duration-300' 
              : 'opacity-0 absolute inset-0'
          }`}
          width={width}
          height={height}
          loading={priority ? 'eager' : 'lazy'}
          onLoad={handleLoad}
          onError={handleError}
          {...props}
        />
      )}
      
      {/* Progressive enhancement overlay */}
      {isLoaded && placeholder === 'blur' && (
        <div 
          className="absolute inset-0 transition-opacity duration-300 opacity-0"
          style={getPlaceholderStyles()}
        />
      )}
    </div>
  );
});

OptimizedImage.displayName = 'OptimizedImage';

/**
 * Generate a blur data URL for placeholder
 */
export const generateBlurDataURL = (width = 10, height = 10) => {
  const canvas = document.createElement('canvas');
  canvas.width = width;
  canvas.height = height;
  
  const ctx = canvas.getContext('2d');
  const gradient = ctx.createLinearGradient(0, 0, width, height);
  gradient.addColorStop(0, '#f3f4f6');
  gradient.addColorStop(1, '#e5e7eb');
  
  ctx.fillStyle = gradient;
  ctx.fillRect(0, 0, width, height);
  
  return canvas.toDataURL();
};

/**
 * Hook for preloading images
 */
export const useImagePreloader = (imageUrls) => {
  const [loadedImages, setLoadedImages] = useState(new Set());
  const [isLoading, setIsLoading] = useState(false);

  const preloadImages = async () => {
    if (!imageUrls || imageUrls.length === 0) return;
    
    setIsLoading(true);
    const loaded = new Set();
    
    const loadPromises = imageUrls.map(url => 
      new Promise((resolve) => {
        const img = new Image();
        img.onload = () => {
          loaded.add(url);
          resolve();
        };
        img.onerror = () => {
          console.warn(`Failed to preload image: ${url}`);
          resolve();
        };
        img.src = url;
      })
    );
    
    await Promise.all(loadPromises);
    setLoadedImages(loaded);
    setIsLoading(false);
  };

  useEffect(() => {
    preloadImages();
  }, [imageUrls]);

  return { loadedImages, isLoading };
};

export default OptimizedImage;
