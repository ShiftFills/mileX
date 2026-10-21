/** Value of the input/select/textarea that raised a DOM event, or null for any other target. */
export function eventValue(event: Event): string | null {
  const target = event.target;
  return target instanceof HTMLInputElement ||
    target instanceof HTMLSelectElement ||
    target instanceof HTMLTextAreaElement
    ? target.value
    : null;
}
