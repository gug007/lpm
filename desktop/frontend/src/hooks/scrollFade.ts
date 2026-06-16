export interface ScrollMetrics {
  scrollLeft: number;
  scrollWidth: number;
  clientWidth: number;
}

export interface ScrollFade {
  canScrollLeft: boolean;
  canScrollRight: boolean;
}

const EPSILON = 1;

export function computeScrollFade({ scrollLeft, scrollWidth, clientWidth }: ScrollMetrics): ScrollFade {
  const maxScroll = scrollWidth - clientWidth;
  return {
    canScrollLeft: scrollLeft > EPSILON,
    canScrollRight: scrollLeft < maxScroll - EPSILON,
  };
}
