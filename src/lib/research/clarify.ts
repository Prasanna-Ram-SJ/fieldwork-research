export function clarificationFor(question: string): string | null {
  const text = question.trim().replace(/[?.!]+$/, '');
  if (!text) return null;
  if (/^(compare|is it good|is this good|what about this|what about it)$/i.test(text)) return 'Which things should I compare, and what outcome matters to you?';
  if (/^(research|tell me about|information about)\s+\S+(?:\s+\S+){0,2}$/i.test(text) || (!/^(explain|define|what|who|when|where|why|how|is|are|can|does|do)\b/i.test(text) && text.split(/\s+/).length <= 2)) return `What would you like to investigate about “${text.slice(0,100)}”? Add a purpose, outcome, comparison or time period—or choose a general overview.`;
  return null;
}
