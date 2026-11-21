export function progressLinks(text: string) {
  return text.split(/(https?:\/\/[^\s<>]+)/gi).filter(Boolean).map(value => {
    try { const url = new URL(value); if (/^https?:$/.test(url.protocol)) return { text: value, href: url.href }; } catch { /* Plain text. */ }
    return { text: value, href: undefined };
  });
}
