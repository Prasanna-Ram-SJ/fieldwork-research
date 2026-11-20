export function sourceIconUrl(originalUrl: string): string | null {
  try {
    const url = new URL(originalUrl),
      host = url.hostname.toLowerCase();
    if (
      !["http:", "https:"].includes(url.protocol) ||
      url.username ||
      url.password ||
      host === "localhost" ||
      host.endsWith(".localhost") ||
      host.endsWith(".local") ||
      host.includes(":") ||
      /^\d+\.\d+\.\d+\.\d+$/.test(host) ||
      !host.includes(".")
    )
      return null;
    return `https://${host}/favicon.ico`;
  } catch {
    return null;
  }
}
