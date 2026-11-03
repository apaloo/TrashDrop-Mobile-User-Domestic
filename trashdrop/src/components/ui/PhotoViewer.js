import React, { useState, useEffect, useRef, useCallback } from 'react';
import { createPortal } from 'react-dom';
import { FiChevronLeft, FiChevronRight, FiX, FiPause, FiPlay } from 'react-icons/fi';

// Minimum horizontal drag, in px, that counts as a swipe
const SWIPE_THRESHOLD = 50;
// Slideshow: time each photo stays up before the next one
const SLIDE_INTERVAL_MS = 4000;

/**
 * Full-screen photo viewer, the same one the collectors app and the admin
 * portal use. With more than one photo it plays as a slideshow, moving on
 * every few seconds and looping; Pause/Play (or the space bar) stops and
 * starts it. Swipe, arrow buttons, dots or keyboard arrows move between
 * photos and restart the count; tap X, CLOSE, the backdrop or Escape to close.
 */
const PhotoViewer = ({ photos, index, onIndexChange, onClose }) => {
  const touchStartX = useRef(null);
  const count = photos.length;
  const [playing, setPlaying] = useState(count > 1);

  const showPrevious = useCallback(() => onIndexChange((index - 1 + count) % count), [index, count, onIndexChange]);
  const showNext = useCallback(() => onIndexChange((index + 1) % count), [index, count, onIndexChange]);

  // Re-armed whenever the photo changes, so a manual move gets a full interval
  useEffect(() => {
    if (!playing || count < 2) return undefined;
    const timer = setTimeout(() => onIndexChange((index + 1) % count), SLIDE_INTERVAL_MS);
    return () => clearTimeout(timer);
  }, [playing, index, count, onIndexChange]);

  // Listens in the capture phase and stops the keys it uses, so Escape closes
  // only the viewer, not a details window open behind it
  useEffect(() => {
    const handleKey = (e) => {
      if (e.key === 'Escape') onClose();
      else if (e.key === 'ArrowLeft') showPrevious();
      else if (e.key === 'ArrowRight') showNext();
      else if (e.key === ' ' && count > 1) {
        e.preventDefault();
        setPlaying((p) => !p);
      } else return;
      e.stopPropagation();
    };
    window.addEventListener('keydown', handleKey, true);
    return () => window.removeEventListener('keydown', handleKey, true);
  }, [onClose, showPrevious, showNext, count]);

  const handleTouchStart = (e) => {
    touchStartX.current = e.touches[0].clientX;
  };

  const handleTouchEnd = (e) => {
    if (touchStartX.current === null) return;
    const deltaX = e.changedTouches[0].clientX - touchStartX.current;
    touchStartX.current = null;
    if (deltaX > SWIPE_THRESHOLD) showPrevious();
    else if (deltaX < -SWIPE_THRESHOLD) showNext();
  };

  return createPortal(
    <div
      className="fixed inset-0 z-[100000] flex flex-col bg-black"
      role="dialog"
      aria-modal="true"
      aria-label={`Photo ${index + 1} of ${count}`}
      onClick={onClose}
    >
      <div className="flex items-center justify-between px-4 py-3 text-white">
        <span className="text-sm font-medium">{index + 1} / {count}</span>
        {count > 1 && (
          <button
            type="button"
            onClick={(e) => { e.stopPropagation(); setPlaying((p) => !p); }}
            className="flex items-center gap-1.5 rounded-full bg-white/10 px-3 py-1.5 text-sm font-medium hover:bg-white/20"
            aria-label={playing ? 'Pause slideshow' : 'Play slideshow'}
          >
            {playing ? <FiPause className="h-4 w-4" aria-hidden="true" /> : <FiPlay className="h-4 w-4" aria-hidden="true" />}
            {playing ? 'Pause' : 'Play'}
          </button>
        )}
        <button
          type="button"
          onClick={onClose}
          className="rounded-full p-2 hover:bg-white/10"
          aria-label="Close photo viewer"
        >
          <FiX className="h-6 w-6" aria-hidden="true" />
        </button>
      </div>

      <div
        className="relative flex flex-1 items-center justify-center overflow-hidden px-2 pb-6"
        onTouchStart={handleTouchStart}
        onTouchEnd={handleTouchEnd}
      >
        <img
          key={photos[index]}
          src={photos[index]}
          alt={`${index + 1} of ${count}`}
          className="max-h-full max-w-full select-none rounded-md object-contain"
          onClick={(e) => e.stopPropagation()}
          draggable={false}
        />

        {count > 1 && (
          <>
            <button
              type="button"
              onClick={(e) => { e.stopPropagation(); showPrevious(); }}
              className="absolute left-2 top-1/2 -translate-y-1/2 rounded-full bg-black/50 p-2 text-white hover:bg-black/70"
              aria-label="Previous photo"
            >
              <FiChevronLeft className="h-7 w-7" aria-hidden="true" />
            </button>
            <button
              type="button"
              onClick={(e) => { e.stopPropagation(); showNext(); }}
              className="absolute right-2 top-1/2 -translate-y-1/2 rounded-full bg-black/50 p-2 text-white hover:bg-black/70"
              aria-label="Next photo"
            >
              <FiChevronRight className="h-7 w-7" aria-hidden="true" />
            </button>
          </>
        )}
      </div>

      <div className="px-4 pb-6" onClick={(e) => e.stopPropagation()}>
        {count > 1 && (
          <div className="flex justify-center gap-1.5 pb-4">
            {photos.map((url, i) => (
              <button
                key={url + i}
                type="button"
                onClick={() => onIndexChange(i)}
                className={`h-2 rounded-full transition-all ${i === index ? 'w-5 bg-white' : 'w-2 bg-white/40'}`}
                aria-label={`Go to photo ${i + 1}`}
              />
            ))}
          </div>
        )}
        {/* Large close button, easy to find for low-literacy users */}
        <button
          type="button"
          onClick={onClose}
          className="flex w-full items-center justify-center gap-2 rounded-xl bg-red-500 py-4 text-lg font-bold text-white active:bg-red-600"
        >
          <FiX className="h-6 w-6" strokeWidth={2.5} aria-hidden="true" />
          CLOSE
        </button>
      </div>
    </div>,
    document.body
  );
};

export default PhotoViewer;
