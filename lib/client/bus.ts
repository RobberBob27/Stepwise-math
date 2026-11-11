/** Lets any part of the page (the topics grid, for example) load a question into the solver. */
const EVENT = "stepwise:load";

export function loadIntoSolver(text: string): void {
  window.dispatchEvent(new CustomEvent<string>(EVENT, { detail: text }));
}

export function onLoadIntoSolver(handler: (text: string) => void): () => void {
  const listener = (e: Event) => handler((e as CustomEvent<string>).detail);
  window.addEventListener(EVENT, listener);
  return () => window.removeEventListener(EVENT, listener);
}
