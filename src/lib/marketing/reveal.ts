/** Reveal content once it enters view; no scroll handlers or animation loop. */
export function reveal(node: HTMLElement) {
  if (window.matchMedia('(prefers-reduced-motion: reduce)').matches || !('IntersectionObserver' in window)) return;
  node.classList.add('reveal', 'pending');
  const observer = new IntersectionObserver(entries => {
    if (entries.some(entry => entry.isIntersecting)) { node.classList.remove('pending'); observer.disconnect(); }
  }, { threshold: 0.06 });
  observer.observe(node);
  return { destroy: () => observer.disconnect() };
}
