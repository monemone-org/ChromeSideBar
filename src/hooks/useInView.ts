import { useState, useCallback, useRef } from 'react';

// Shared observer instance
let observer: IntersectionObserver | null = null;
const listeners = new Map<Element, (entry: IntersectionObserverEntry) => void>();

const getObserver = () => {
  if (!observer) {
    observer = new IntersectionObserver(
      (entries) => {
        entries.forEach((entry) => {
          const listener = listeners.get(entry.target);
          if (listener) {
            listener(entry);
          }
        });
      },
      {
        root: null, // viewport
        rootMargin: '100px', // Slightly larger margin for smoother "wake up"
        threshold: 0,
      }
    );
  }
  return observer;
};

export function useInView<T extends HTMLElement>() {
  const [isInView, setIsInView] = useState(false);
  const prevElementRef = useRef<T | null>(null);

  const setRef = useCallback((element: T | null) => {
    const observer = getObserver();

    // Cleanup previous element if it exists
    if (prevElementRef.current) {
      observer.unobserve(prevElementRef.current);
      listeners.delete(prevElementRef.current);
    }

    // Observe new element
    if (element) {
      listeners.set(element, (entry) => {
        setIsInView(entry.isIntersecting);
      });
      observer.observe(element);
    }

    prevElementRef.current = element;
  }, []);

  return { ref: setRef, isInView };
}