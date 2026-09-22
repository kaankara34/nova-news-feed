"use strict";

const fs = require("fs");
const path = require("path");
const crypto = require("crypto");
const Parser = require("rss-parser");
const cheerio = require("cheerio");

const GEMINI_API_KEY = process.env.GEMINI_API_KEY;
const GEMINI_MODEL = process.env.GEMINI_MODEL || "gemini-3.5-flash-lite";
const RETENTION_DAYS = 15;
const DISCOVERY_LIMIT = 220;
const MIN_ARTICLE_TEXT = 700;
const MAX_ARTICLE_TEXT = 9000;
const REQUEST_DELAY_MS = 1100;

if (!GEMINI_API_KEY) {
  throw new Error("GEMINI_API_KEY is missing. Add it to GitHub Actions repository secrets.");
}

const CATEGORIES = [
  "Art & Exhibitions",
  "Exhibitions",
  "Galleries & Museums",
  "Architecture & Design",
  "Construction",
  "Urban Transformation",
  "Kadıköy",
  "Technical & Legal",
  "Fashion & Luxury"
];

// Üst sınırlar dolgu hedefi değildir. Kaliteli haber yoksa kategori eksik kalır.
const CATEGORY_LIMITS = {
  "Art & Exhibitions": 4,
  Exhibitions: 4,
  "Galleries & Museums": 4,
  "Architecture & Design": 5,
  Construction: 5,
  "Urban Transformation": 4,
  "Kadıköy": 3,
  "Technical & Legal": 5,
  "Fashion & Luxury": 3
};

const SOURCE_GROUPS = [
  {
    name: "international-art-journalism",
    categoryHint: "Art & Exhibitions",
    language: "en",
    domains: [
      "theartnewspaper.com", "artforum.com", "artreview.com", "frieze.com",
      "theguardian.com", "smithsonianmag.com", "apollo-magazine.com",
      "artnews.com", "hyperallergic.com"
    ],
    terms: "art OR exhibition OR museum OR gallery OR biennale"
  },
  {
    name: "international-museums",
    categoryHint: "Galleries & Museums",
    language: "en",
    domains: [
      "tate.org.uk", "moma.org", "metmuseum.org", "guggenheim.org",
      "louvre.fr", "centrepompidou.fr", "musee-orsay.fr", "vam.ac.uk",
      "britishmuseum.org", "nationalgallery.org.uk", "rijksmuseum.nl"
    ],
    terms: "exhibition OR opening OR collection OR museum"
  },
  {
    name: "international-galleries-fairs",
    categoryHint: "Exhibitions",
    language: "en",
    domains: [
      "artbasel.com", "labiennale.org", "serpentinegalleries.org",
      "fondationlouisvuitton.fr", "palaisdetokyo.com", "gagosian.com",
      "hauserwirth.com", "davidzwirner.com", "whitecube.com"
    ],
    terms: "exhibition OR fair OR artist OR programme"
  },
  {
    name: "turkey-art-institutions",
    categoryHint: "Galleries & Museums",
    language: "tr",
    domains: [
      "istanbulmodern.org", "peramuseum.org", "sakipsabancimuzesi.org",
      "arter.org.tr", "saltonline.org", "iksv.org"
    ],
    terms: "sergi OR sanat OR müze OR bienal"
  },
  {
    name: "architecture-design",
    categoryHint: "Architecture & Design",
    language: "en",
    domains: [
      "dezeen.com", "archdaily.com", "domusweb.it", "architecturalrecord.com",
      "architectural-review.com", "architecture.com", "ctbuh.org",
      "designboom.com", "wallpaper.com", "architizer.com"
    ],
    terms: "architecture OR residential OR design OR urbanism"
  },
  {
    name: "construction-engineering-global",
    categoryHint: "Construction",
    language: "en",
    domains: [
      "enr.com", "newcivilengineer.com", "ice.org.uk", "asce.org",
      "fib-international.org", "concretecentre.com", "iccsafe.org",
      "rilem.net", "iabse.org", "buildingsmart.org"
    ],
    terms: "construction OR structural engineering OR concrete OR building safety"
  },
  {
    name: "turkey-official-technical",
    categoryHint: "Technical & Legal",
    language: "tr",
    domains: [
      "csb.gov.tr", "kdb.gov.tr", "resmigazete.gov.tr", "yapiisleri.csb.gov.tr",
      "afad.gov.tr", "imo.org.tr", "mimarlarodasi.org.tr", "tubitak.gov.tr"
    ],
    terms: "yapı OR deprem OR beton OR yönetmelik OR kentsel dönüşüm OR imar"
  },
  {
    name: "istanbul-kadikoy-official",
    categoryHint: "Kadıköy",
    language: "tr",
    domains: [
      "kadikoy.bel.tr", "ibb.istanbul", "ipa.istanbul", "istanbul.gov.tr"
    ],
    terms: "Kadıköy OR Bağdat Caddesi OR kentsel dönüşüm OR imar OR kültür OR sergi"
  },
  {
    name: "fashion-luxury",
    categoryHint: "Fashion & Luxury",
    language: "en",
    domains: [
      "vogue.com", "voguebusiness.com", "businessoffashion.com", "wwd.com",
      "ft.com", "wallpaper.com", "architecturaldigest.com", "monocle.com",
      "robbreport.com"
    ],
    terms: "fashion design OR craftsmanship OR heritage OR exhibition OR luxury architecture"
  }
];

const TIER_ONE = new Set([
  "theartnewspaper.com", "artforum.com", "artreview.com", "frieze.com",
  "theguardian.com", "tate.org.uk", "moma.org", "metmuseum.org",
  "guggenheim.org", "louvre.fr", "centrepompidou.fr", "musee-orsay.fr",
  "vam.ac.uk", "britishmuseum.org", "nationalgallery.org.uk", "rijksmuseum.nl",
  "artbasel.com", "labiennale.org", "dezeen.com", "archdaily.com",
  "domusweb.it", "architecturalrecord.com", "architectural-review.com",
  "architecture.com", "ctbuh.org", "enr.com", "newcivilengineer.com",
  "ice.org.uk", "asce.org", "fib-international.org", "iccsafe.org",
  "iabse.org", "csb.gov.tr", "kdb.gov.tr", "resmigazete.gov.tr",
  "afad.gov.tr", "imo.org.tr", "kadikoy.bel.tr", "ibb.istanbul",
  "istanbulmodern.org", "peramuseum.org", "sakipsabancimuzesi.org",
  "arter.org.tr", "saltonline.org", "iksv.org", "vogue.com",
  "voguebusiness.com", "businessoffashion.com", "wwd.com", "ft.com"
]);

const ALLOWED_DOMAINS = new Set(SOURCE_GROUPS.flatMap(group => group.domains));

const parser = new Parser({
  timeout: 25000,
  customFields: {
    item: [["source", "sourceNode"]]
  },
  headers: {
    "User-Agent": "NOVA-Editorial-Feed/3.0 (+https://novakonut.com)"
  }
});

const sleep = ms => new Promise(resolve => setTimeout(resolve, ms));

function cleanText(value = "") {
  return String(value)
    .replace(/<[^>]*>/g, " ")
    .replace(/&nbsp;/gi, " ")
    .replace(/&amp;/gi, "&")
    .replace(/&quot;/gi, '"')
    .replace(/&#39;/gi, "'")
    .replace(/\s+/g, " ")
    .trim();
}

function normalizeDomain(input = "") {
  try {
    return new URL(input).hostname.toLowerCase().replace(/^www\./, "");
  } catch {
    return String(input).toLowerCase().replace(/^www\./, "").split("/")[0];
  }
}

function domainAllowed(domain) {
  return [...ALLOWED_DOMAINS].some(allowed => domain === allowed || domain.endsWith(`.${allowed}`));
}

function sourceTier(domain) {
  return [...TIER_ONE].some(item => domain === item || domain.endsWith(`.${item}`)) ? 1 : 2;
}

function hash(value) {
  return crypto.createHash("sha256").update(value).digest("hex").slice(0, 20);
}

function normalizeTitle(title = "") {
  return cleanText(title)
    .toLocaleLowerCase("tr-TR")
    .normalize("NFKD")
    .replace(/[\u0300-\u036f]/g, "")
    .replace(/[^a-z0-9çğıöşü\s]/gi, " ")
    .replace(/\s+/g, " ")
    .trim();
}

function titleSimilarity(a, b) {
  const left = new Set(normalizeTitle(a).split(" ").filter(word => word.length > 2));
  const right = new Set(normalizeTitle(b).split(" ").filter(word => word.length > 2));
  if (!left.size || !right.size) return 0;
  const intersection = [...left].filter(word => right.has(word)).length;
  const union = new Set([...left, ...right]).size;
  return intersection / union;
}

function isRecent(dateValue) {
  const date = new Date(dateValue);
  if (Number.isNaN(date.getTime())) return false;
  const cutoff = Date.now() - RETENTION_DAYS * 24 * 60 * 60 * 1000;
  return date.getTime() >= cutoff && date.getTime() <= Date.now() + 60 * 60 * 1000;
}

function buildGoogleNewsUrl(group, domainChunk) {
  const sites = domainChunk.map(domain => `site:${domain}`).join(" OR ");
  const query = `(${group.terms}) (${sites}) when:${RETENTION_DAYS}d`;
  const params = new URLSearchParams({
    q: query,
    hl: group.language === "tr" ? "tr" : "en-US",
    gl: group.language === "tr" ? "TR" : "US",
    ceid: group.language === "tr" ? "TR:tr" : "US:en"
  });
  return `https://news.google.com/rss/search?${params.toString()}`;
}

function chunk(array, size) {
  const output = [];
  for (let index = 0; index < array.length; index += size) {
    output.push(array.slice(index, index + size));
  }
  return output;
}

function extractSource(item) {
  const node = item.sourceNode || item.source;
  const name = cleanText(
    typeof node === "string" ? node : node?._ || node?.value || item.creator || ""
  );
  const url = typeof node === "object" ? node?.$?.url || node?.url || "" : "";
  return { name, url, domain: normalizeDomain(url) };
}

async function discoverCandidates() {
  const all = [];
  for (const group of SOURCE_GROUPS) {
    // Her domain ayrı sorgulanır. Google News RSS bazı durumlarda <source>
    // düğümünün url niteliğini parser'a aktarmadığı için güvenilir domain,
    // doğrudan site: sorgusundan alınır.
    for (const expectedDomain of group.domains) {
      const domains = [expectedDomain];
      const url = buildGoogleNewsUrl(group, domains);
      console.log(`Discovering ${group.name}: ${expectedDomain}`);
      try {
        const feed = await parser.parseURL(url);
        for (const item of feed.items || []) {
          const source = extractSource(item);
          // Sorgu tek bir site: filtresiyle üretildiğinden expectedDomain
          // kaynak whitelist'inin doğrulanmış parçasıdır. RSS url verirse ayrıca
          // kontrol edilir; vermezse sonuç sıfırlanmaz.
          const resolvedDomain = source.domain || expectedDomain;
          if (!domainAllowed(resolvedDomain)) continue;
          const publishedAt = item.isoDate || item.pubDate;
          if (!isRecent(publishedAt)) continue;
          const title = cleanText(item.title);
          if (!title) continue;
          all.push({
            id: hash(`${resolvedDomain}|${normalizeTitle(title)}`),
            title,
            description: cleanText(item.contentSnippet || item.content || item.summary || ""),
            publishedAt: new Date(publishedAt).toISOString(),
            googleNewsUrl: item.link,
            sourceName: source.name || resolvedDomain,
            sourceUrl: source.url || `https://${resolvedDomain}`,
            sourceDomain: resolvedDomain,
            sourceTier: sourceTier(resolvedDomain),
            categoryHint: group.categoryHint,
            discoveryGroup: group.name,
            originalLanguageHint: group.language
          });
        }
      } catch (error) {
        console.warn(`Discovery failed for ${group.name}: ${error.message}`);
      }
      await sleep(250);
    }
  }

  all.sort((a, b) => {
    if (a.sourceTier !== b.sourceTier) return a.sourceTier - b.sourceTier;
    return new Date(b.publishedAt) - new Date(a.publishedAt);
  });

  const unique = [];
  for (const candidate of all) {
    const duplicate = unique.some(existing =>
      existing.sourceDomain === candidate.sourceDomain &&
      titleSimilarity(existing.title, candidate.title) >= 0.78
    );
    if (!duplicate) unique.push(candidate);
    if (unique.length >= DISCOVERY_LIMIT) break;
  }
  return unique;
}

function parseGeminiJson(text) {
  const cleaned = String(text)
    .replace(/^```(?:json)?\s*/i, "")
    .replace(/\s*```$/i, "")
    .trim();
  return JSON.parse(cleaned);
}

async function callGemini(prompt, { maxOutputTokens = 8192, temperature = 0.1 } = {}) {
  const endpoint = `https://generativelanguage.googleapis.com/v1beta/models/${encodeURIComponent(GEMINI_MODEL)}:generateContent?key=${encodeURIComponent(GEMINI_API_KEY)}`;
  let lastError;
  for (let attempt = 1; attempt <= 4; attempt += 1) {
    try {
      const response = await fetch(endpoint, {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          contents: [{ role: "user", parts: [{ text: prompt }] }],
          generationConfig: {
            temperature,
            topP: 0.8,
            maxOutputTokens,
            responseMimeType: "application/json"
          }
        })
      });
      if (!response.ok) {
        const body = await response.text();
        throw new Error(`Gemini API ${response.status}: ${body.slice(0, 1000)}`);
      }
      const body = await response.json();
      const text = body?.candidates?.[0]?.content?.parts?.map(part => part.text || "").join("");
      if (!text) throw new Error("Gemini returned an empty response");
      return parseGeminiJson(text);
    } catch (error) {
      lastError = error;
      if (attempt === 4) break;
      const delay = 1500 * 2 ** (attempt - 1);
      console.warn(`Gemini attempt ${attempt} failed; retrying in ${delay} ms`);
      await sleep(delay);
    }
  }
  throw lastError;
}

async function classifyCandidates(candidates) {
  const decisions = [];
  const batches = chunk(candidates, 20);
  for (let index = 0; index < batches.length; index += 1) {
    console.log(`Editorial classification ${index + 1}/${batches.length}`);
    const compact = batches[index].map(item => ({
      id: item.id,
      title: item.title,
      description: item.description,
      source: item.sourceName,
      domain: item.sourceDomain,
      sourceTier: item.sourceTier,
      publishedAt: item.publishedAt,
      categoryHint: item.categoryHint
    }));
    const prompt = `
You are the senior editor of NOVA, a premium Istanbul residential developer.
Assess the supplied news candidates. The source list has already been curated.

Editorial identity:
- International, cultured, technically serious, restrained and premium.
- Prefer major museums, established galleries, respected art publications,
  architecture institutions, engineering bodies and primary public authorities.
- Technical/legal items must have genuine practical or professional value.
- Construction items should concern engineering, materials, safety, standards,
  methods, sustainability or major sector innovation—not company promotion.
- Fashion items must concern design, craftsmanship, heritage, exhibitions,
  architecture or serious industry developments—not celebrities or shopping.

Reject:
- jobs, recruitment, tenders, advertorials and press-release-like company promotion;
- competitor property developments or praise of unrelated construction companies;
- crime, disaster sensationalism, political polemics, gossip and clickbait;
- generic regional stories with no design, engineering or institutional value;
- sales decline, housing crash or negative property-market commentary;
- duplicates or different headlines describing the same event;
- vague items whose title/description cannot support a reliable decision.

Allowed categories exactly:
${JSON.stringify(CATEGORIES)}

Return one JSON object only:
{"decisions":[{"id":"...","accept":true,"category":"...","editorialScore":0,"technicalValue":0,"brandFit":0,"eventKey":"short-normalized-event-key","reason":"short reason"}]}

Scores are integers from 0 to 100. Accept only if editorialScore >= 84,
brandFit >= 82 and the item is demonstrably useful or culturally significant.
Never invent facts. Include every supplied id exactly once.

Candidates:
${JSON.stringify(compact)}
`;
    const result = await callGemini(prompt, { maxOutputTokens: 8192, temperature: 0.05 });
    decisions.push(...(Array.isArray(result.decisions) ? result.decisions : []));
    await sleep(REQUEST_DELAY_MS);
  }

  const decisionMap = new Map(decisions.map(item => [item.id, item]));
  const accepted = candidates
    .map(candidate => ({ ...candidate, decision: decisionMap.get(candidate.id) }))
    .filter(item =>
      item.decision?.accept === true &&
      CATEGORIES.includes(item.decision.category) &&
      Number(item.decision.editorialScore) >= 84 &&
      Number(item.decision.brandFit) >= 82
    )
    .sort((a, b) => {
      const scoreDifference = Number(b.decision.editorialScore) - Number(a.decision.editorialScore);
      if (scoreDifference) return scoreDifference;
      return a.sourceTier - b.sourceTier;
    });

  const seenEvents = new Set();
  return accepted.filter(item => {
    const eventKey = normalizeTitle(item.decision.eventKey || item.title);
    if (seenEvents.has(eventKey)) return false;
    seenEvents.add(eventKey);
    return true;
  });
}

function absoluteUrl(value, base) {
  try {
    return new URL(value, base).toString();
  } catch {
    return "";
  }
}

function isPublisherUrl(url, expectedDomain) {
  const domain = normalizeDomain(url);

  return Boolean(
    domain &&
    (
      domain === expectedDomain ||
      domain.endsWith(`.${expectedDomain}`)
    )
  );
}

/*
 * Google News RSS gerçek yayıncı adresi yerine kodlanmış
 * /rss/articles/... bağlantısı döndürür.
 *
 * Normal redirect takibi çoğu zaman yayıncıya ulaşmadığı için
 * Google News'in garturl çözümleme isteği kullanılır.
 */
const decodedGoogleNewsUrls = new Map();

function getGoogleNewsArticleId(sourceUrl) {
  try {
    const url = new URL(sourceUrl);

    const parts = url.pathname
      .split("/")
      .filter(Boolean);

    const previousPart = parts[parts.length - 2];
    const articleId = parts[parts.length - 1];

    if (
      url.hostname === "news.google.com" &&
      parts.length >= 2 &&
      ["articles", "read"].includes(previousPart)
    ) {
      return articleId;
    }
  } catch {
    return "";
  }

  return "";
}

async function getGoogleNewsDecodingParams(articleId) {
  const response = await fetch(
    `https://news.google.com/rss/articles/${articleId}`,
    {
      headers: {
        "User-Agent":
          "Mozilla/5.0 (Windows NT 10.0; Win64; x64) " +
          "AppleWebKit/537.36 (KHTML, like Gecko) " +
          "Chrome/129.0.0.0 Safari/537.36",

        Accept:
          "text/html,application/xhtml+xml," +
          "application/xml;q=0.9,*/*;q=0.8",

        "Accept-Language": "en-US,en;q=0.9"
      }
    }
  );

  if (!response.ok) {
    throw new Error(
      `Google News parameter request returned ${response.status}`
    );
  }

  const html = await response.text();
  const $ = cheerio.load(html);

  const element = $(
    "c-wiz > div[jscontroller][data-n-a-sg][data-n-a-ts]"
  ).first();

  const signature = element.attr("data-n-a-sg");
  const timestamp = element.attr("data-n-a-ts");

  if (!signature || !timestamp) {
    throw new Error(
      "Google News decoding parameters were not found"
    );
  }

  return {
    signature,
    timestamp
  };
}

function parseBatchExecutePayload(text) {
  /*
   * Google'ın yanıtı XSSI koruması ve uzunluk satırları içerebilir.
   * Bu nedenle Fbv4je kaydını içeren JSON satırları ayrı denenir.
   */
  const lines = String(text)
    .replace(/^\)\]\}'\s*/, "")
    .split("\n")
    .map(line => line.trim())
    .filter(line => line.startsWith("["));

  for (const line of lines) {
    try {
      const parsed = JSON.parse(line);
      const rows = Array.isArray(parsed) ? parsed : [];

      for (const row of rows) {
        if (
          Array.isArray(row) &&
          (
            row[0] === "wrb.fr" ||
            row[0] === "w779db"
          ) &&
          row[1] === "Fbv4je"
        ) {
          const inner = JSON.parse(row[2]);

          if (typeof inner?.[1] === "string") {
            return inner[1];
          }
        }
      }
    } catch {
      // Protokolün diğer satırlarını görmezden gel.
    }
  }

  /*
   * Bazı cevaplarda JSON bloğu iki boş satırdan sonra gelir.
   */
  for (const part of String(text).split("\n\n")) {
    try {
      const parsed = JSON.parse(part.trim());
      const rows = Array.isArray(parsed) ? parsed : [];

      for (const row of rows) {
        if (
          Array.isArray(row) &&
          row[1] === "Fbv4je"
        ) {
          const inner = JSON.parse(row[2]);

          if (typeof inner?.[1] === "string") {
            return inner[1];
          }
        }
      }
    } catch {
      // Uygun blok bulunana kadar devam et.
    }
  }

  return "";
}

async function decodeGoogleNewsUrl(sourceUrl) {
  if (decodedGoogleNewsUrls.has(sourceUrl)) {
    return decodedGoogleNewsUrls.get(sourceUrl);
  }

  const articleId = getGoogleNewsArticleId(sourceUrl);

  if (!articleId) {
    return sourceUrl;
  }

  try {
    const {
      signature,
      timestamp
    } = await getGoogleNewsDecodingParams(articleId);

    const request = [
      "Fbv4je",

      `["garturlreq",` +
        `[[` +
          `"X","X",["X","X"],null,null,1,1,` +
          `"US:en",null,1,null,null,null,null,null,0,1` +
        `],` +
        `"X","X",1,[1,1,1],1,1,null,0,0,null,0],` +
        `"${articleId}",${timestamp},"${signature}"]`
    ];

    const body =
      `f.req=${encodeURIComponent(
        JSON.stringify([[request]])
      )}`;

    const response = await fetch(
      "https://news.google.com/_/DotsSplashUi/data/batchexecute",
      {
        method: "POST",

        headers: {
          "Content-Type":
            "application/x-www-form-urlencoded;charset=UTF-8",

          "User-Agent":
            "Mozilla/5.0 (Windows NT 10.0; Win64; x64) " +
            "AppleWebKit/537.36 (KHTML, like Gecko) " +
            "Chrome/129.0.0.0 Safari/537.36",

          Accept: "*/*",
          Origin: "https://news.google.com",
          Referer: "https://news.google.com/"
        },

        body
      }
    );

    if (!response.ok) {
      throw new Error(
        `Google News decoder returned ${response.status}`
      );
    }

    const responseText = await response.text();

    const decodedUrl =
      parseBatchExecutePayload(responseText);

    if (!decodedUrl) {
      throw new Error(
        "Decoded publisher URL was empty"
      );
    }

    decodedGoogleNewsUrls.set(
      sourceUrl,
      decodedUrl
    );

    return decodedUrl;
  } catch (error) {
    console.warn(
      `Google News URL decoding failed: ${error.message}`
    );

    decodedGoogleNewsUrls.set(
      sourceUrl,
      ""
    );

    return "";
  }
}

async function resolveAndExtract(candidate) {
  const controller = new AbortController();

  const timeout = setTimeout(
    () => controller.abort(),
    45000
  );

  try {
    /*
     * Önce Google News bağlantısını gerçek yayıncı
     * bağlantısına dönüştür.
     */
    const decodedUrl = await decodeGoogleNewsUrl(
      candidate.googleNewsUrl
    );

    if (
      !decodedUrl ||
      !isPublisherUrl(
        decodedUrl,
        candidate.sourceDomain
      )
    ) {
      console.warn(
        `Publisher URL could not be verified for ` +
        candidate.sourceDomain
      );

      return null;
    }

    /*
     * Gerçek yayıncı sayfasını indir.
     */
    const response = await fetch(
      decodedUrl,
      {
        redirect: "follow",
        signal: controller.signal,

        headers: {
          "User-Agent":
            "Mozilla/5.0 (compatible; " +
            "NOVAEditorialBot/3.0; " +
            "+https://novakonut.com)",

          Accept:
            "text/html,application/xhtml+xml"
        }
      }
    );

    if (!response.ok) {
      console.warn(
        `Publisher returned ${response.status}: ` +
        candidate.sourceDomain
      );

      return null;
    }

    const html = await response.text();

    let articleUrl = response.url;
    let articleHtml = html;

    /*
     * Bazı yayıncılar başka bir alt domaine yönlendirebilir.
     * Canonical veya og:url üzerinden doğru adres aranır.
     */
    if (
      !isPublisherUrl(
        articleUrl,
        candidate.sourceDomain
      )
    ) {
      const $news = cheerio.load(html);

      const possibleUrls = [
        $news(
          'meta[property="og:url"]'
        ).attr("content"),

        $news(
          'link[rel="canonical"]'
        ).attr("href"),

        ...$news("a[href]")
          .map(
            (_, node) =>
              $news(node).attr("href")
          )
          .get()
      ]
        .filter(Boolean)
        .map(value =>
          absoluteUrl(
            value,
            response.url
          )
        );

      articleUrl =
        possibleUrls.find(url =>
          isPublisherUrl(
            url,
            candidate.sourceDomain
          )
        ) || "";

      if (!articleUrl) {
        return null;
      }

      const publisherResponse = await fetch(
        articleUrl,
        {
          redirect: "follow",
          signal: controller.signal,

          headers: {
            "User-Agent":
              "Mozilla/5.0 (compatible; " +
              "NOVAEditorialBot/3.0; " +
              "+https://novakonut.com)",

            Accept:
              "text/html,application/xhtml+xml"
          }
        }
      );

      if (!publisherResponse.ok) {
        return null;
      }

      articleUrl = publisherResponse.url;
      articleHtml =
        await publisherResponse.text();
    }

    if (
      !isPublisherUrl(
        articleUrl,
        candidate.sourceDomain
      )
    ) {
      return null;
    }

    const $ = cheerio.load(articleHtml);

    /*
     * Haber görseli önce okunur.
     */
    const image = absoluteUrl(
      $(
        'meta[property="og:image"]'
      ).attr("content") ||

      $(
        'meta[name="twitter:image"]'
      ).attr("content") ||

      "",

      articleUrl
    );

    /*
     * Görünür HTML metni bulunamazsa JSON-LD
     * articleBody alanı kullanılacak.
     */
    let jsonLdText = "";

    $(
      "script[type='application/ld+json']"
    ).each((_, node) => {
      try {
        const rawJson =
          $(node).html() || "null";

        const parsed =
          JSON.parse(rawJson);

        const records =
          Array.isArray(parsed)
            ? parsed
            : [parsed];

        const queue = [...records];

        while (queue.length > 0) {
          const record = queue.shift();

          if (
            !record ||
            typeof record !== "object"
          ) {
            continue;
          }

          if (
            typeof record.articleBody ===
              "string" &&
            record.articleBody.length >
              jsonLdText.length
          ) {
            jsonLdText = cleanText(
              record.articleBody
            );
          }

          if (
            Array.isArray(
              record["@graph"]
            )
          ) {
            queue.push(
              ...record["@graph"]
            );
          }
        }
      } catch {
        // Geçersiz JSON-LD bloklarını atla.
      }
    });

    /*
     * Meta ve JSON-LD okunduktan sonra
     * gereksiz sayfa alanları kaldırılır.
     */
    $(
      [
        "script",
        "style",
        "noscript",
        "nav",
        "footer",
        "header",
        "aside",
        "form",
        "button",
        "iframe",
        "svg"
      ].join(",")
    ).remove();

    const selectors = [
      "article",
      "main article",
      "[itemprop='articleBody']",
      ".article-body",
      ".article__body",
      ".story-body",
      ".entry-content",
      ".post-content",
      ".content-body",
      ".article-content",
      "main"
    ];

    let text = jsonLdText;

    for (const selector of selectors) {
      const extractedText = cleanText(
        $(selector)
          .first()
          .text()
      );

      if (
        extractedText.length >
        text.length
      ) {
        text = extractedText;
      }
    }

    /*
     * Başlık ve birkaç kelimeden oluşan sayfalarla
     * uzun haber üretilmesini önler.
     */
    if (
      text.length <
      MIN_ARTICLE_TEXT
    ) {
      console.warn(
        `Insufficient article text ` +
        `(${text.length}) for ` +
        candidate.sourceDomain
      );

      return null;
    }

    return {
      articleUrl,
      image: image || null,

      sourceText:
        text.slice(
          0,
          MAX_ARTICLE_TEXT
        )
    };
  } catch (error) {
    console.warn(
      `Article extraction failed for ` +
      `${candidate.sourceDomain}: ` +
      error.message
    );

    return null;
  } finally {
    clearTimeout(timeout);
  }
}

async function extractSelectedArticles(classified) {
  // İçerik çıkarma başarısız olabileceği için kategori limitinin üç katı aday denenir.
  const grouped = Object.fromEntries(CATEGORIES.map(category => [category, []]));
  for (const item of classified) grouped[item.decision.category].push(item);

  const extracted = [];
  for (const category of CATEGORIES) {
    const target = CATEGORY_LIMITS[category];
    const attempts = grouped[category].slice(0, target * 3);
    console.log(`Extracting ${category}: ${attempts.length} candidates for max ${target}`);
    for (const candidate of attempts) {
      if (extracted.filter(item => item.decision.category === category).length >= target) break;
      const content = await resolveAndExtract(candidate);
      if (content) extracted.push({ ...candidate, ...content });
      await sleep(200);
    }
  }
  return extracted;
}

async function writeEditorialContent(articles) {
  const results = [];
  const batches = chunk(articles, 3);
  for (let index = 0; index < batches.length; index += 1) {
    console.log(`Bilingual editorial writing ${index + 1}/${batches.length}`);
    const input = batches[index].map(item => ({
      id: item.id,
      originalTitle: item.title,
      source: item.sourceName,
      domain: item.sourceDomain,
      publishedAt: item.publishedAt,
      category: item.decision.category,
      sourceText: item.sourceText
    }));
    const prompt = `
Act as NOVA's bilingual senior editorial desk. Using ONLY the supplied source text,
create an original Turkish and English editorial treatment for each item.

Non-negotiable accuracy rules:
- Do not add a name, number, date, quote, location, technical conclusion or legal
  interpretation that is absent from the source text.
- Do not disguise uncertainty. If the source is insufficient, set publish=false.
- Do not reproduce long sentences from the source. Paraphrase faithfully.
- Never write promotional praise for a construction company or property developer.
- For laws, regulations and engineering, use precise neutral language and clearly
  attribute statements to the issuing institution.

Tone:
- refined, factual, concise, internationally literate and appropriate for a premium
  architecture and residential-development brand;
- no clickbait, hype, advertising language, clichés or AI-style filler;
- Turkish must read as native professional Turkish; English as native editorial English.

For each article produce:
- titleTr/titleEn: 7-16 words, factual and elegant;
- excerptTr/excerptEn: 35-60 words;
- contentTr/contentEn: 180-300 words, 2-4 short paragraphs;
- do not say "this article" or mention NOVA;
- retain the supplied category exactly.

Return JSON only:
{"articles":[{"id":"...","publish":true,"titleTr":"...","titleEn":"...","excerptTr":"...","excerptEn":"...","contentTr":"...","contentEn":"..."}]}

Source material:
${JSON.stringify(input)}
`;
    const response = await callGemini(prompt, { maxOutputTokens: 8192, temperature: 0.15 });
    results.push(...(Array.isArray(response.articles) ? response.articles : []));
    await sleep(REQUEST_DELAY_MS);
  }
  const byId = new Map(results.filter(item => item.publish === true).map(item => [item.id, item]));
  return articles
    .map(article => ({ ...article, editorial: byId.get(article.id) }))
    .filter(article => {
      const item = article.editorial;
      return item && item.titleTr && item.titleEn && item.excerptTr && item.excerptEn && item.contentTr && item.contentEn;
    });
}

function buildFeed(articles, language) {
  const generatedAt = new Date().toISOString();
  const categoryCounts = Object.fromEntries(CATEGORIES.map(category => [category, 0]));
  const outputArticles = articles
    .map(item => {
      const category = item.decision.category;
      categoryCounts[category] += 1;
      return {
        id: item.id,
        title: language === "tr" ? item.editorial.titleTr : item.editorial.titleEn,
        excerpt: language === "tr" ? item.editorial.excerptTr : item.editorial.excerptEn,
        content: language === "tr" ? item.editorial.contentTr : item.editorial.contentEn,
        category,
        source: item.sourceName,
        sourceDomain: item.sourceDomain,
        sourceTier: item.sourceTier,
        publishedAt: item.publishedAt,
        url: item.articleUrl,
        image: item.image,
        originalTitle: item.title,
        originalLanguage: item.originalLanguageHint,
        editorialScore: Number(item.decision.editorialScore),
        technicalValue: Number(item.decision.technicalValue || 0),
        brandFit: Number(item.decision.brandFit)
      };
    })
    .sort((a, b) => new Date(b.publishedAt) - new Date(a.publishedAt));

  return {
    status: "success",
    editorialPolicy: "NOVA Premium AI-Curated Editorial Feed",
    aiModel: GEMINI_MODEL,
    language,
    generatedAt,
    retentionDays: RETENTION_DAYS,
    categories: CATEGORIES,
    categoryCounts,
    total: outputArticles.length,
    articles: outputArticles
  };
}

function writeJson(relativePath, data) {
  const outputPath = path.resolve(__dirname, "..", relativePath);
  fs.mkdirSync(path.dirname(outputPath), { recursive: true });
  fs.writeFileSync(outputPath, `${JSON.stringify(data, null, 2)}\n`, "utf8");
  console.log(`Wrote ${outputPath}`);
}

async function main() {
  console.log(`Starting NOVA premium editorial workflow with ${GEMINI_MODEL}`);
  const candidates = await discoverCandidates();
  console.log(`Curated-source candidates: ${candidates.length}`);
  if (!candidates.length) throw new Error("No candidates discovered from curated sources");

  const classified = await classifyCandidates(candidates);
  console.log(`Gemini-approved unique candidates: ${classified.length}`);

  const extracted = await extractSelectedArticles(classified);
  console.log(`Articles with sufficient source text: ${extracted.length}`);
  if (!extracted.length) {
    throw new Error("No articles contained enough verifiable source text; existing feeds were preserved");
  }

  const completed = await writeEditorialContent(extracted);
  console.log(`Completed bilingual articles: ${completed.length}`);
  if (!completed.length) throw new Error("Gemini produced no publishable bilingual articles");

  writeJson("data/news-tr.json", buildFeed(completed, "tr"));
  writeJson("data/news-en.json", buildFeed(completed, "en"));

  for (const category of CATEGORIES) {
    const count = completed.filter(item => item.decision.category === category).length;
    console.log(`${category}: ${count}`);
  }
}

main().catch(error => {
  console.error("NOVA premium editorial workflow failed:", error);
  process.exitCode = 1;
});
