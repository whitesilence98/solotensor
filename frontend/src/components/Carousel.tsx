"use client";

import React, {
  useCallback,
  useEffect,
  useMemo,
  useRef,
  useState,
} from "react";
import { ChevronLeft, ChevronRight } from "lucide-react";

export interface ResponsiveItemsPerView {
  base?: number;
  sm?: number;
  md?: number;
  lg?: number;
  xl?: number;
  "2xl"?: number;
}

export interface CarouselControls {
  currentIndex: number;
  totalPages: number;
  prev: () => void;
  next: () => void;
  goTo: (index: number) => void;
  isPaused: boolean;
}

export interface CarouselProps<T = unknown> {
  // Option A: Raw items with renderItem or renderPage
  items?: T[];
  renderItem?: (item: T, index: number) => React.ReactNode;
  renderPage?: (pageItems: T[], pageIndex: number) => React.ReactNode;
  itemsPerPage?: number; // Automatically groups items into pages (e.g. 4 per page)

  // Option B: Direct children (each child is a slide or page)
  children?: React.ReactNode;

  // Multi-item continuous view (e.g. 3 promo slides visible at once)
  itemsPerView?: number | ResponsiveItemsPerView;
  gap?: number; // Gap between slides in px (default: 16)

  // Carousel Behavior
  loop?: boolean; // Default: true
  autoplay?: boolean; // Default: false
  autoplayInterval?: number; // ms, default: 5000
  showArrows?: boolean; // Default: true
  showIndicators?: boolean; // Default: true
  arrowPosition?: "edge" | "inset" | "none";
  arrowSize?: "sm" | "md" | "lg";

  // Controlled index
  currentIndex?: number;
  onIndexChange?: (index: number) => void;

  // Custom Controls Slots
  renderHeaderControls?: (controls: CarouselControls) => React.ReactNode;

  // Class Names
  className?: string;
  trackClassName?: string;
  slideClassName?: string;
  indicatorsClassName?: string;
  arrowClassName?: string;

  // Accessibility
  ariaLabel?: string;
}

export default function Carousel<T = unknown>({
  items,
  renderItem,
  renderPage,
  itemsPerPage,
  children,
  itemsPerView,
  gap = 16,
  loop = true,
  autoplay = false,
  autoplayInterval = 5000,
  showArrows = true,
  showIndicators = true,
  arrowPosition = "edge",
  arrowSize = "md",
  currentIndex: controlledIndex,
  onIndexChange,
  renderHeaderControls,
  className = "",
  trackClassName = "",
  slideClassName = "",
  indicatorsClassName = "",
  arrowClassName = "",
  ariaLabel = "Content carousel",
}: CarouselProps<T>) {
  const containerRef = useRef<HTMLDivElement>(null);
  const [containerWidth, setContainerWidth] = useState(0);
  const [uncontrolledIndex, setUncontrolledIndex] = useState(0);
  const [isPaused, setIsPaused] = useState(false);
  const [isDragging, setIsDragging] = useState(false);
  const [dragOffset, setDragOffset] = useState(0);

  const pointerStartX = useRef<number | null>(null);
  const pointerStartTime = useRef<number>(0);
  const isPointerDown = useRef(false);

  const isControlled = controlledIndex !== undefined;
  const currentIndex = isControlled ? controlledIndex : uncontrolledIndex;

  // Measure container width for responsive slide math
  useEffect(() => {
    if (!containerRef.current) return;
    const observer = new ResizeObserver((entries) => {
      for (const entry of entries) {
        if (entry.contentRect.width > 0) {
          setContainerWidth(entry.contentRect.width);
        }
      }
    });
    observer.observe(containerRef.current);
    setContainerWidth(containerRef.current.clientWidth);
    return () => observer.disconnect();
  }, []);

  // Compute effective itemsPerView based on container width or window breakpoints
  const currentPerView = useMemo(() => {
    if (!itemsPerView) return 1;
    if (typeof itemsPerView === "number") return itemsPerView;

    const w = containerWidth || (typeof window !== "undefined" ? window.innerWidth : 1024);
    if (w >= 1536 && itemsPerView["2xl"] !== undefined) return itemsPerView["2xl"];
    if (w >= 1280 && itemsPerView.xl !== undefined) return itemsPerView.xl;
    if (w >= 1024 && itemsPerView.lg !== undefined) return itemsPerView.lg;
    if (w >= 768 && itemsPerView.md !== undefined) return itemsPerView.md;
    if (w >= 640 && itemsPerView.sm !== undefined) return itemsPerView.sm;
    return itemsPerView.base ?? 1;
  }, [itemsPerView, containerWidth]);

  // Generate slide nodes
  const slideNodes = useMemo(() => {
    // 1. Grouped by itemsPerPage (e.g. 4 items per page for model grid)
    if (items && itemsPerPage && itemsPerPage > 0) {
      const pages: T[][] = [];
      for (let i = 0; i < items.length; i += itemsPerPage) {
        pages.push(items.slice(i, i + itemsPerPage));
      }
      return pages.map((pageItems, pageIdx) => (
        <div key={`page-${pageIdx}`} className="w-full shrink-0">
          {renderPage ? renderPage(pageItems, pageIdx) : (
            <div className="grid grid-cols-2 sm:grid-cols-2 md:grid-cols-4 gap-4">
              {pageItems.map((item, itemIdx) => (
                <div key={itemIdx}>
                  {renderItem ? renderItem(item, pageIdx * itemsPerPage + itemIdx) : String(item)}
                </div>
              ))}
            </div>
          )}
        </div>
      ));
    }

    // 2. Individual items with renderItem
    if (items && renderItem) {
      return items.map((item, idx) => (
        <div key={idx} className="shrink-0">
          {renderItem(item, idx)}
        </div>
      ));
    }

    // 3. Children as slides
    if (children) {
      return React.Children.toArray(children).map((child, idx) => (
        <div key={idx} className="shrink-0">
          {child}
        </div>
      ));
    }

    return [];
  }, [items, itemsPerPage, renderPage, renderItem, children]);

  const totalSlides = slideNodes.length;

  // Maximum valid index
  const maxIndex = useMemo(() => {
    if (itemsPerPage || currentPerView <= 1) {
      return Math.max(0, totalSlides - 1);
    }
    return Math.max(0, totalSlides - currentPerView);
  }, [itemsPerPage, currentPerView, totalSlides]);

  const totalPages = maxIndex + 1;

  // Update slide index safely
  const setIndex = useCallback(
    (newIndex: number) => {
      const bounded = Math.max(0, Math.min(newIndex, maxIndex));
      if (!isControlled) {
        setUncontrolledIndex(bounded);
      }
      onIndexChange?.(bounded);
    },
    [isControlled, maxIndex, onIndexChange]
  );

  const prev = useCallback(() => {
    if (totalSlides <= 1) return;
    if (currentIndex <= 0) {
      setIndex(loop ? maxIndex : 0);
    } else {
      setIndex(currentIndex - 1);
    }
  }, [totalSlides, currentIndex, loop, maxIndex, setIndex]);

  const next = useCallback(() => {
    if (totalSlides <= 1) return;
    if (currentIndex >= maxIndex) {
      setIndex(loop ? 0 : maxIndex);
    } else {
      setIndex(currentIndex + 1);
    }
  }, [totalSlides, currentIndex, loop, maxIndex, setIndex]);

  const goTo = useCallback(
    (index: number) => {
      setIndex(index);
    },
    [setIndex]
  );

  // Autoplay timer
  useEffect(() => {
    if (!autoplay || isPaused || isDragging || totalSlides <= 1) return;
    const timer = setInterval(() => {
      next();
    }, autoplayInterval);
    return () => clearInterval(timer);
  }, [autoplay, isPaused, isDragging, totalSlides, autoplayInterval, next]);

  // Pointer / Touch gestures for responsive swipe with momentum
  const handlePointerDown = (clientX: number) => {
    pointerStartX.current = clientX;
    pointerStartTime.current = performance.now();
    isPointerDown.current = true;
    setIsDragging(false);
    setDragOffset(0);
  };

  const handlePointerMove = (clientX: number) => {
    if (!isPointerDown.current || pointerStartX.current === null) return;
    const delta = clientX - pointerStartX.current;
    if (Math.abs(delta) > 6) {
      setIsDragging(true);
      // Elastic rubber-band resistance when dragging beyond boundaries without loop
      const isAtStart = currentIndex === 0 && delta > 0;
      const isAtEnd = currentIndex >= maxIndex && delta < 0;
      const dampened = (isAtStart || isAtEnd) && !loop ? delta * 0.35 : delta;
      setDragOffset(dampened);
    }
  };

  const handlePointerUp = () => {
    if (!isPointerDown.current) return;
    isPointerDown.current = false;

    const elapsed = Math.max(1, performance.now() - pointerStartTime.current);
    const velocity = Math.abs(dragOffset) / elapsed; // px per ms

    // Fast flick (>0.3 px/ms) or distance threshold (>40px) triggers slide
    if (velocity > 0.3 || Math.abs(dragOffset) > 40) {
      if (dragOffset < 0) {
        next();
      } else {
        prev();
      }
    }

    setIsDragging(false);
    setDragOffset(0);
    pointerStartX.current = null;
  };

  // Keyboard navigation
  const handleKeyDown = (e: React.KeyboardEvent) => {
    if (e.key === "ArrowLeft") {
      e.preventDefault();
      prev();
    } else if (e.key === "ArrowRight") {
      e.preventDefault();
      next();
    }
  };

  // Compute slide width & translate offset
  const isPaged = Boolean(itemsPerPage && itemsPerPage > 0);
  const slideWidthStyle = useMemo(() => {
    if (isPaged || currentPerView <= 1) {
      return { width: "100%" };
    }
    return {
      width: `calc((100% - ${(currentPerView - 1) * gap}px) / ${currentPerView})`,
    };
  }, [isPaged, currentPerView, gap]);

  // Precise translation in percentage or pixels for ultra-smooth 60/120fps hardware acceleration
  const transformStyle = useMemo(() => {
    if (totalSlides === 0) {
      return `translate3d(0px, 0, 0)`;
    }

    if (isPaged || currentPerView <= 1) {
      if (dragOffset === 0) {
        return `translate3d(-${currentIndex * 100}%, 0, 0)`;
      }
      return `translate3d(calc(-${currentIndex * 100}% + ${dragOffset}px), 0, 0)`;
    }

    if (containerWidth <= 0) {
      return `translate3d(0px, 0, 0)`;
    }

    const singleItemWidth = (containerWidth - (currentPerView - 1) * gap) / currentPerView;
    const baseOffset = currentIndex * (singleItemWidth + gap);
    const totalOffset = -baseOffset + dragOffset;
    return `translate3d(${totalOffset.toFixed(2)}px, 0, 0)`;
  }, [containerWidth, totalSlides, isPaged, currentPerView, gap, currentIndex, dragOffset]);

  const arrowSizeClass =
    arrowSize === "sm"
      ? "h-8 w-8 text-sm"
      : arrowSize === "lg"
      ? "h-11 w-11 text-lg"
      : "h-9 w-9 sm:h-10 sm:w-10 text-base";

  const controls: CarouselControls = {
    currentIndex,
    totalPages,
    prev,
    next,
    goTo,
    isPaused,
  };

  if (totalSlides === 0) {
    return null;
  }

  return (
    <div
      ref={containerRef}
      role="region"
      aria-label={ariaLabel}
      aria-roledescription="carousel"
      tabIndex={0}
      onKeyDown={handleKeyDown}
      onMouseEnter={() => setIsPaused(true)}
      onMouseLeave={() => {
        setIsPaused(false);
        if (isPointerDown.current) {
          handlePointerUp();
        }
      }}
      className={`relative w-full select-none outline-none focus-visible:ring-1 focus-visible:ring-[var(--accent)]/50 rounded-2xl ${className}`}
    >
      {/* Optional Header Controls */}
      {renderHeaderControls && renderHeaderControls(controls)}

      {/* Main Track Viewport */}
      <div
        className="carousel-viewport relative overflow-hidden rounded-xl"
        style={{
          contain: "paint",
          isolation: "isolate",
          WebkitTransform: "translateZ(0)",
          transform: "translateZ(0)",
          backfaceVisibility: "hidden",
          WebkitBackfaceVisibility: "hidden",
        }}
        onTouchStart={(e) => handlePointerDown(e.touches[0].clientX)}
        onTouchMove={(e) => handlePointerMove(e.touches[0].clientX)}
        onTouchEnd={handlePointerUp}
        onTouchCancel={handlePointerUp}
        onMouseDown={(e) => {
          // Allow click inside form inputs or buttons without triggering slide drag
          if ((e.target as HTMLElement).closest("button, a, input, select, textarea")) {
            return;
          }
          handlePointerDown(e.clientX);
        }}
        onMouseMove={(e) => handlePointerMove(e.clientX)}
        onMouseUp={handlePointerUp}
      >
        <div
          data-carousel-track="true"
          data-dragging={isDragging ? "true" : undefined}
          className={`carousel-track flex ${trackClassName}`}
          style={{
            transform: transformStyle,
            transition: isDragging
              ? "none"
              : "transform 700ms cubic-bezier(0.22, 1, 0.36, 1)",
            gap: isPaged || currentPerView <= 1 ? "0px" : `${gap}px`,
            willChange: "transform",
            transformStyle: "preserve-3d",
            backfaceVisibility: "hidden",
            WebkitBackfaceVisibility: "hidden",
          }}
        >
          {slideNodes.map((node, idx) => (
            <div
              key={idx}
              style={{
                ...slideWidthStyle,
                transform: "translateZ(0)",
                WebkitTransform: "translateZ(0)",
                backfaceVisibility: "hidden",
              }}
              className={`carousel-slide shrink-0 ${slideClassName}`}
            >
              {node}
            </div>
          ))}
        </div>
      </div>

      {/* Navigation Arrows */}
      {showArrows && totalPages > 1 && (
        <>
          <button
            type="button"
            onClick={(e) => {
              e.stopPropagation();
              prev();
            }}
            disabled={!loop && currentIndex <= 0}
            aria-label="Previous slide"
            className={`absolute ${
              arrowPosition === "inset"
                ? "left-3"
                : "-left-3 sm:-left-4.5"
            } top-1/2 -translate-y-1/2 z-20 flex ${arrowSizeClass} items-center justify-center rounded-full border border-[var(--line-strong)] bg-black/80 text-white/90 backdrop-blur-md transition-all hover:bg-black hover:border-[var(--accent)] hover:text-[var(--accent)] active:scale-90 shadow-2xl disabled:opacity-20 disabled:pointer-events-none ${arrowClassName}`}
          >
            <ChevronLeft className="h-5 w-5" />
          </button>

          <button
            type="button"
            onClick={(e) => {
              e.stopPropagation();
              next();
            }}
            disabled={!loop && currentIndex >= maxIndex}
            aria-label="Next slide"
            className={`absolute ${
              arrowPosition === "inset"
                ? "right-3"
                : "-right-3 sm:-right-4.5"
            } top-1/2 -translate-y-1/2 z-20 flex ${arrowSizeClass} items-center justify-center rounded-full border border-[var(--line-strong)] bg-black/80 text-white/90 backdrop-blur-md transition-all hover:bg-black hover:border-[var(--accent)] hover:text-[var(--accent)] active:scale-90 shadow-2xl disabled:opacity-20 disabled:pointer-events-none ${arrowClassName}`}
          >
            <ChevronRight className="h-5 w-5" />
          </button>
        </>
      )}

      {/* Pagination Indicator Dots */}
      {showIndicators && totalPages > 1 && (
        <div
          className={`mt-4 flex items-center justify-center gap-1.5 ${indicatorsClassName}`}
        >
          {Array.from({ length: totalPages }).map((_, idx) => {
            const isActive = currentIndex === idx;
            return (
              <button
                key={idx}
                type="button"
                onClick={() => goTo(idx)}
                aria-label={`Go to slide ${idx + 1}`}
                className={`carousel-indicator h-1.5 rounded-full transition-all duration-500 ease-out ${
                  isActive
                    ? "w-7 bg-[var(--accent)] shadow-[0_0_8px_var(--accent)]"
                    : "w-2 bg-white/20 hover:bg-white/40"
                }`}
              />
            );
          })}
        </div>
      )}
    </div>
  );
}
