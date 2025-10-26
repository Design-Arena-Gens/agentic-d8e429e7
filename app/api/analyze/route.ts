import * as cheerio from "cheerio";

export const dynamic = "force-dynamic";

function toAbsoluteUrl(base: URL, url: string | undefined | null): string | null {
  if (!url) return null;
  try {
    return new URL(url, base).toString();
  } catch {
    return null;
  }
}

async function fetchText(url: string, init?: RequestInit): Promise<string> {
  const res = await fetch(url, {
    ...init,
    headers: {
      "user-agent":
        "Mozilla/5.0 (X11; Linux x86_64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/118.0.0.0 Safari/537.36",
      accept: "text/html,application/xhtml+xml,application/xml;q=0.9,*/*;q=0.8",
      ...init?.headers,
    },
    redirect: "follow",
    cache: "no-store",
  });
  if (!res.ok) throw new Error(`Fetch failed ${res.status} for ${url}`);
  return await res.text();
}

const PATTERNS: { label: string; regex: RegExp }[] = [
  { label: "word:checkout", regex: /checkout/i },
  { label: "word:cart", regex: /\bcart\b/i },
  { label: "begin_checkout (gtag)", regex: /gtag\s*\(\s*['\"]event['\"],\s*['\"]begin_checkout['\"]/i },
  { label: "InitiateCheckout (fbq)", regex: /fbq\s*\(\s*['\"]track['\"],\s*['\"]InitiateCheckout['\"]/i },
  { label: "Stripe", regex: /stripe\.|Stripe\./i },
  { label: "Shopify", regex: /Shopify|ShopifyAnalytics|ShopifyDesignMode/i },
  { label: "checkoutUrl var", regex: /checkoutUrl\s*[:=]/i },
  { label: "order api", regex: /\b(order|payment|transaction)[-_]?(api|url|endpoint)\b/i },
  { label: "cart endpoints", regex: /\/cart(\.js|\/add|\/update|\/clear|\/change)/i },
  { label: "checkout endpoints", regex: /\/checkout(\b|\/|\?|#)/i },
  { label: "klarna", regex: /klarna/i },
  { label: "adyen", regex: /adyen/i },
  { label: "paypal", regex: /paypal/i },
  { label: "apple pay", regex: /apple\s*pay/i },
  { label: "google pay", regex: /google\s*pay/i },
];

function getSnippets(source: string, regex: RegExp, maxSnippets = 3): string[] {
  const snippets: string[] = [];
  const text = source;
  let match: RegExpExecArray | null;
  const r = new RegExp(regex.source, regex.flags.includes("g") ? regex.flags : regex.flags + "g");
  while ((match = r.exec(text))) {
    const start = Math.max(0, match.index - 80);
    const end = Math.min(text.length, match.index + (match[0]?.length || 0) + 80);
    snippets.push(text.slice(start, end));
    if (snippets.length >= maxSnippets) break;
  }
  return snippets;
}

export async function GET(request: Request) {
  const { searchParams } = new URL(request.url);
  const url = searchParams.get("url");
  if (!url) return new Response(JSON.stringify({ error: "Missing url" }), { status: 400 });

  let base: URL;
  try {
    base = new URL(url);
  } catch {
    return new Response(JSON.stringify({ error: "Invalid url" }), { status: 400 });
  }

  const errors: string[] = [];

  let html: string = "";
  try {
    html = await fetchText(base.toString());
  } catch (e: any) {
    errors.push(e?.message || `Failed to fetch ${base.toString()}`);
  }

  const $ = cheerio.load(html || "");

  // Collect scripts (up to limits)
  const scriptSrcs: string[] = [];
  const inlineScripts: string[] = [];
  $("script").each((_, el) => {
    const src = $(el).attr("src");
    if (src) {
      const abs = toAbsoluteUrl(base, src);
      if (abs) scriptSrcs.push(abs);
    } else {
      const code = $(el).html() || "";
      if (code.trim()) inlineScripts.push(code);
    }
  });

  // Helpful: observe anchors and forms that hint checkout
  const anchorsToCheckout: { href: string; text: string }[] = [];
  $("a[href]").each((_, el) => {
    const href = $(el).attr("href") || "";
    if (/checkout|cart|bag|payment|order/i.test(href)) {
      anchorsToCheckout.push({ href: toAbsoluteUrl(base, href) || href, text: $(el).text().trim() });
    }
  });

  const formsToCheckout: { action: string; method: string }[] = [];
  $("form").each((_, el) => {
    const action = $(el).attr("action") || "";
    const method = ($(el).attr("method") || "GET").toUpperCase();
    if (/checkout|cart|payment|order/i.test(action)) {
      formsToCheckout.push({ action: toAbsoluteUrl(base, action) || action, method });
    }
  });

  // Fetch external scripts with concurrency limit
  const maxScripts = 15;
  const targets = scriptSrcs.slice(0, maxScripts);

  async function fetchScript(u: string): Promise<{ url: string; content: string; size: number | null; error?: string }> {
    try {
      const res = await fetch(u, {
        headers: {
          "user-agent":
            "Mozilla/5.0 (X11; Linux x86_64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/118.0.0.0 Safari/537.36",
          accept: "*/*",
          referer: base.toString(),
        },
        cache: "no-store",
        redirect: "follow",
      });
      if (!res.ok) throw new Error(`Fetch ${res.status}`);
      const text = await res.text();
      const sizeHeader = res.headers.get("content-length");
      return { url: u, content: text, size: sizeHeader ? Number(sizeHeader) : text.length };
    } catch (e: any) {
      return { url: u, content: "", size: null, error: e?.message || "fetch error" };
    }
  }

  const fetched = await Promise.all(targets.map((u) => fetchScript(u)));

  type Finding = { url: string; inline: boolean; size: number | null; matches: { pattern: string; count: number; snippets: string[] }[] };
  const findings: Finding[] = [];

  // Analyze inline scripts
  for (const code of inlineScripts) {
    const matchEntries = PATTERNS.map((p) => {
      const allMatches = code.match(new RegExp(p.regex.source, p.regex.flags.includes("g") ? p.regex.flags : p.regex.flags + "g"));
      const count = allMatches ? allMatches.length : 0;
      return { pattern: p.label, count, snippets: count ? getSnippets(code, p.regex) : [] };
    }).filter((m) => m.count > 0);
    findings.push({ url: "inline", inline: true, size: code.length, matches: matchEntries });
  }

  // Analyze fetched scripts
  for (const s of fetched) {
    if (s.error) errors.push(`Script ${s.url} error: ${s.error}`);
    const source = s.content || "";
    const matchEntries = PATTERNS.map((p) => {
      const allMatches = source.match(new RegExp(p.regex.source, p.regex.flags.includes("g") ? p.regex.flags : p.regex.flags + "g"));
      const count = allMatches ? allMatches.length : 0;
      return { pattern: p.label, count, snippets: count ? getSnippets(source, p.regex) : [] };
    }).filter((m) => m.count > 0);
    findings.push({ url: s.url, inline: false, size: s.size, matches: matchEntries });
  }

  // Build summary
  const scriptsWithMatches = findings.filter((f) => f.matches.length > 0).length;
  const totalMatches = findings.reduce((acc, f) => acc + f.matches.reduce((s, m) => s + m.count, 0), 0);

  const indicators: string[] = [];
  if (anchorsToCheckout.length > 0) indicators.push("anchors to checkout/cart found");
  if (formsToCheckout.length > 0) indicators.push("forms posting to checkout/cart found");
  const anyStrong = findings.some((f) => f.matches.some((m) => /begin_checkout|InitiateCheckout|checkout endpoints|Stripe|Shopify/i.test(m.pattern)));

  const body = {
    url: base.toString(),
    fetchedAt: new Date().toISOString(),
    summary: {
      totalScripts: findings.length,
      scriptsWithMatches,
      totalMatches,
      likelyHasCheckout: anyStrong || scriptsWithMatches > 0,
      indicators,
    },
    findings: findings
      .filter((f) => f.inline ? f.matches.length > 0 : true)
      .slice(0, 60),
    anchorsToCheckout: anchorsToCheckout.slice(0, 50),
    formsToCheckout: formsToCheckout.slice(0, 50),
    errors: errors.length ? errors : undefined,
  };

  return new Response(JSON.stringify(body, null, 2), {
    headers: {
      "content-type": "application/json",
      "cache-control": "no-store",
    },
  });
}
