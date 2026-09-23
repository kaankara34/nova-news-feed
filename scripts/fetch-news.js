"use strict";

const fs = require("fs");
const path = require("path");
const crypto = require("crypto");
const Parser = require("rss-parser");
const cheerio = require("cheerio");

const GEMINI_API_KEY = process.env.GEMINI_API_KEY;
const GEMINI_MODEL =
  process.env.GEMINI_MODEL || "gemini-3.5-flash-lite";

const RETENTION_DAYS = 15;
const DISCOVERY_LIMIT = 360;
const GROUP_DISCOVERY_LIMIT = 36;
const MIN_ARTICLE_TEXT = 700;
const MAX_ARTICLE_TEXT = 9000;
const REQUEST_DELAY_MS = 1100;

if (!GEMINI_API_KEY) {
  throw new Error(
    "GEMINI_API_KEY is missing. Add it to GitHub Actions repository secrets."
  );
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

const CATEGORY_LIMITS = {
  "Art & Exhibitions": 4,
  Exhibitions: 4,
  "Galleries & Museums": 4,
  "Architecture & Design": 5,
  Construction: 5,
  "Urban Transformation": 4,
  Kadıköy: 3,
  "Technical & Legal": 5,
  "Fashion & Luxury": 3
};

const CATEGORY_MINIMUMS = {
  "Art & Exhibitions": 2,
  Exhibitions: 2,
  "Galleries & Museums": 2,
  "Architecture & Design": 3,
  Construction: 3,
  "Urban Transformation": 2,
  Kadıköy: 2,
  "Technical & Legal": 3,
  "Fashion & Luxury": 1
};

const LOCKED_DISCOVERY_CATEGORIES = {
  "turkey-construction": "Construction",
  "turkey-urban-transformation": "Urban Transformation",
  "turkey-official-technical": "Technical & Legal",
  "istanbul-kadikoy-official": "Kadıköy"
};

const SOURCE_GROUPS = [
  {
    name: "international-art-journalism",
    categoryHint: "Art & Exhibitions",
    language: "en",
    domains: [
      "theartnewspaper.com",
      "artforum.com",
      "artreview.com",
      "frieze.com",
      "theguardian.com",
      "smithsonianmag.com",
      "apollo-magazine.com",
      "artnews.com",
      "hyperallergic.com"
    ],
    terms:
      "art OR exhibition OR museum OR gallery OR biennale"
  },
  {
    name: "international-museums",
    categoryHint: "Galleries & Museums",
    language: "en",
    domains: [
      "tate.org.uk",
      "moma.org",
      "metmuseum.org",
      "guggenheim.org",
      "louvre.fr",
      "centrepompidou.fr",
      "musee-orsay.fr",
      "vam.ac.uk",
      "britishmuseum.org",
      "nationalgallery.org.uk",
      "rijksmuseum.nl"
    ],
    terms:
      "exhibition OR opening OR collection OR museum"
  },
  {
    name: "international-galleries-fairs",
    categoryHint: "Exhibitions",
    language: "en",
    domains: [
      "artbasel.com",
      "labiennale.org",
      "serpentinegalleries.org",
      "fondationlouisvuitton.fr",
      "palaisdetokyo.com",
      "gagosian.com",
      "hauserwirth.com",
      "davidzwirner.com",
      "whitecube.com"
    ],
    terms:
      "exhibition OR fair OR artist OR programme"
  },
  {
    name: "turkey-art-institutions",
    categoryHint: "Galleries & Museums",
    language: "tr",
    domains: [
      "istanbulmodern.org",
      "peramuseum.org",
      "sakipsabancimuzesi.org",
      "arter.org.tr",
      "saltonline.org",
      "iksv.org"
    ],
    terms:
      "sergi OR sanat OR müze OR bienal"
  },
  {
    name: "architecture-design",
    categoryHint: "Architecture & Design",
    language: "en",
    domains: [
      "dezeen.com",
      "archdaily.com",
      "domusweb.it",
      "architecturalrecord.com",
      "architectural-review.com",
      "architecture.com",
      "ctbuh.org",
      "designboom.com",
      "wallpaper.com",
      "architizer.com"
    ],
    terms:
      "architecture OR residential OR design OR urbanism"
  },
  {
    name: "construction-engineering-global",
    categoryHint: "Construction",
    language: "en",
    domains: [
      "enr.com",
      "newcivilengineer.com",
      "ice.org.uk",
      "asce.org",
      "fib-international.org",
      "concretecentre.com",
      "iccsafe.org",
      "rilem.net",
      "iabse.org",
      "buildingsmart.org"
    ],
    terms:
      "construction OR structural engineering OR concrete OR building safety"
  },
  {
    name: "turkey-construction",
    categoryHint: "Construction",
    language: "tr",
    domains: [
      "aa.com.tr",
      "trthaber.com",
      "dunya.com",
      "ekonomim.com",
      "insaatderyasi.com",
      "yapi.com.tr",
      "turkiyeimsad.org",
      "thbb.org",
      "tmb.org.tr"
    ],
    queries: [
      "Türkiye (inşaat OR beton OR yapı malzemeleri OR yapı teknolojisi OR mühendislik OR sürdürülebilir yapı)"
    ]
  },
  {
    name: "turkey-urban-transformation",
    categoryHint: "Urban Transformation",
    language: "tr",
    domains: [
      "csb.gov.tr",
      "kdb.gov.tr",
      "ibb.istanbul",
      "ipa.istanbul",
      "resmigazete.gov.tr",
      "toki.gov.tr",
      "aa.com.tr",
      "trthaber.com"
    ],
    queries: [
      "(kentsel dönüşüm OR riskli yapı OR yapı stoku OR Yarısı Bizden OR rezerv yapı alanı) (İstanbul OR Türkiye)"
    ]
  },
  {
    name: "turkey-official-technical",
    categoryHint: "Technical & Legal",
    language: "tr",
    domains: [
      "csb.gov.tr",
      "kdb.gov.tr",
      "resmigazete.gov.tr",
      "yapiisleri.csb.gov.tr",
      "afad.gov.tr",
      "imo.org.tr",
      "mimarlarodasi.org.tr",
      "tubitak.gov.tr",
      "mevzuat.gov.tr",
      "turkiye.gov.tr",
      "thbb.org",
      "turkiyeimsad.org"
    ],
    queries: [
      "(deprem yönetmeliği OR yapı güvenliği OR beton OR zemin OR temel OR yapı denetimi OR imar yönetmeliği OR yapı ruhsatı)"
    ]
  },
  {
    name: "istanbul-kadikoy-official",
    categoryHint: "Kadıköy",
    language: "tr",
    domains: [
      "kadikoy.bel.tr",
      "ibb.istanbul",
      "ipa.istanbul",
      "istanbul.gov.tr",
      "csb.gov.tr",
      "aa.com.tr",
      "trthaber.com"
    ],
    queries: [
      "Kadıköy (kentsel dönüşüm OR inşaat OR imar OR yapı ruhsatı OR deprem OR yapı stoku OR mimarlık OR kent tasarımı OR Bağdat Caddesi)"
    ]
  },
  {
    name: "fashion-luxury",
    categoryHint: "Fashion & Luxury",
    language: "en",
    domains: [
      "vogue.com",
      "voguebusiness.com",
      "businessoffashion.com",
      "wwd.com",
      "ft.com",
      "wallpaper.com",
      "architecturaldigest.com",
      "monocle.com",
      "robbreport.com"
    ],
    terms:
      "fashion design OR craftsmanship OR heritage OR exhibition OR luxury architecture"
  }
];

const TIER_ONE = new Set([
  "theartnewspaper.com",
  "artforum.com",
  "artreview.com",
  "frieze.com",
  "theguardian.com",
  "tate.org.uk",
  "moma.org",
  "metmuseum.org",
  "guggenheim.org",
  "louvre.fr",
  "centrepompidou.fr",
  "musee-orsay.fr",
  "vam.ac.uk",
  "britishmuseum.org",
  "nationalgallery.org.uk",
  "rijksmuseum.nl",
  "artbasel.com",
  "labiennale.org",
  "dezeen.com",
  "archdaily.com",
  "domusweb.it",
  "architecturalrecord.com",
  "architectural-review.com",
  "architecture.com",
  "ctbuh.org",
  "enr.com",
  "newcivilengineer.com",
  "ice.org.uk",
  "asce.org",
  "fib-international.org",
  "iccsafe.org",
  "iabse.org",
  "csb.gov.tr",
  "kdb.gov.tr",
  "resmigazete.gov.tr",
  "afad.gov.tr",
  "imo.org.tr",
  "kadikoy.bel.tr",
  "ibb.istanbul",
  "mevzuat.gov.tr",
  "toki.gov.tr",
  "aa.com.tr",
  "trthaber.com",
  "turkiyeimsad.org",
  "thbb.org",
  "tmb.org.tr",
  "istanbulmodern.org",
  "peramuseum.org",
  "sakipsabancimuzesi.org",
  "arter.org.tr",
  "saltonline.org",
  "iksv.org",
  "vogue.com",
  "voguebusiness.com",
  "businessoffashion.com",
  "wwd.com",
  "ft.com"
]);

const ALLOWED_DOMAINS = new Set(
  SOURCE_GROUPS.flatMap((group) => group.domains)
);

const parser = new Parser({
  timeout: 25000,
  customFields: {
    item: [["source", "sourceNode"]]
  },
  headers: {
    "User-Agent":
      "NOVA-Editorial-Feed/4.0 (+https://novakonut.com)"
  }
});

const sleep = (ms) =>
  new Promise((resolve) => setTimeout(resolve, ms));

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
    return new URL(input)
      .hostname
      .toLowerCase()
      .replace(/^www\./, "");
  } catch {
    return String(input)
      .toLowerCase()
      .replace(/^www\./, "")
      .split("/")[0];
  }
}

function domainAllowed(domain) {
  return [...ALLOWED_DOMAINS].some(
    (allowed) =>
      domain === allowed ||
      domain.endsWith(`.${allowed}`)
  );
}

function sourceTier(domain) {
  return [...TIER_ONE].some(
    (item) =>
      domain === item ||
      domain.endsWith(`.${item}`)
  )
    ? 1
    : 2;
}

function hash(value) {
  return crypto
    .createHash("sha256")
    .update(value)
    .digest("hex")
    .slice(0, 20);
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
  const left = new Set(
    normalizeTitle(a)
      .split(" ")
      .filter((word) => word.length > 2)
  );

  const right = new Set(
    normalizeTitle(b)
      .split(" ")
      .filter((word) => word.length > 2)
  );

  if (!left.size || !right.size) {
    return 0;
  }

  const intersection = [...left].filter((word) =>
    right.has(word)
  ).length;

  const union = new Set([
    ...left,
    ...right
  ]).size;

  return intersection / union;
}

function isRecent(dateValue) {
  const date = new Date(dateValue);

  if (Number.isNaN(date.getTime())) {
    return false;
  }

  const cutoff =
    Date.now() -
    RETENTION_DAYS * 24 * 60 * 60 * 1000;

  return (
    date.getTime() >= cutoff &&
    date.getTime() <= Date.now() + 60 * 60 * 1000
  );
}

function buildGoogleNewsUrl(
  group,
  domainChunk,
  customQuery = ""
) {
  const sites = domainChunk
    .map((domain) => `site:${domain}`)
    .join(" OR ");

  const query =
    `(${customQuery || group.terms}) ` +
    `(${sites}) when:${RETENTION_DAYS}d`;

  const params = new URLSearchParams({
    q: query,
    hl: group.language === "tr" ? "tr" : "en-US",
    gl: group.language === "tr" ? "TR" : "US",
    ceid:
      group.language === "tr"
        ? "TR:tr"
        : "US:en"
  });

  return (
    "https://news.google.com/rss/search?" +
    params.toString()
  );
}

function chunk(array, size) {
  const output = [];

  for (
    let index = 0;
    index < array.length;
    index += size
  ) {
    output.push(array.slice(index, index + size));
  }

  return output;
}

function extractSource(item) {
  const node =
    item.sourceNode ||
    item.source;

  const name = cleanText(
    typeof node === "string"
      ? node
      : node?._ ||
          node?.value ||
          item.creator ||
          ""
  );

  const url =
    typeof node === "object"
      ? node?.$?.url ||
        node?.url ||
        ""
      : "";

  return {
    name,
    url,
    domain: normalizeDomain(url)
  };
}

async function discoverCandidates() {
  const groupBuckets = [];

  for (const group of SOURCE_GROUPS) {
    const groupItems = [];

    for (const expectedDomain of group.domains) {
      const queries =
        group.queries || [group.terms];

      for (const query of queries) {
        const url = buildGoogleNewsUrl(
          group,
          [expectedDomain],
          query
        );

        console.log(
          `Discovering ${group.name}: ` +
          `${expectedDomain} | ${query}`
        );

        try {
          const feed =
            await parser.parseURL(url);

          for (const item of feed.items || []) {
            const source =
              extractSource(item);

            const resolvedDomain =
              source.domain ||
              expectedDomain;

            if (
              !domainAllowed(resolvedDomain)
            ) {
              continue;
            }

            const publishedAt =
              item.isoDate ||
              item.pubDate;

            if (!isRecent(publishedAt)) {
              continue;
            }

            const title =
              cleanText(item.title);

            if (!title) {
              continue;
            }

            groupItems.push({
              id: hash(
                `${resolvedDomain}|` +
                normalizeTitle(title)
              ),
              title,
              description: cleanText(
                item.contentSnippet ||
                item.content ||
                item.summary ||
                ""
              ),
              publishedAt:
                new Date(
                  publishedAt
                ).toISOString(),
              googleNewsUrl: item.link,
              sourceName:
                source.name ||
                resolvedDomain,
              sourceUrl:
                source.url ||
                `https://${resolvedDomain}`,
              sourceDomain:
                resolvedDomain,
              sourceTier:
                sourceTier(
                  resolvedDomain
                ),
              categoryHint:
                group.categoryHint,
              discoveryGroup:
                group.name,
              originalLanguageHint:
                group.language
            });
          }
        } catch (error) {
          console.warn(
            `Discovery failed for ` +
            `${group.name}/` +
            `${expectedDomain}: ` +
            error.message
          );
        }

        await sleep(180);
      }
    }

    groupItems.sort((a, b) => {
      if (
        a.sourceTier !==
        b.sourceTier
      ) {
        return (
          a.sourceTier -
          b.sourceTier
        );
      }

      return (
        new Date(b.publishedAt) -
        new Date(a.publishedAt)
      );
    });

    const uniqueGroupItems = [];

    for (const candidate of groupItems) {
      const duplicate =
        uniqueGroupItems.some(
          (existing) =>
            titleSimilarity(
              existing.title,
              candidate.title
            ) >= 0.72
        );

      if (!duplicate) {
        uniqueGroupItems.push(
          candidate
        );
      }

      if (
        uniqueGroupItems.length >=
        GROUP_DISCOVERY_LIMIT
      ) {
        break;
      }
    }

    console.log(
      `${group.name} reserved candidates: ` +
      uniqueGroupItems.length
    );

    groupBuckets.push(
      uniqueGroupItems
    );
  }

  const unique = [];

  const maxBucketLength =
    Math.max(
      0,
      ...groupBuckets.map(
        (items) => items.length
      )
    );

  for (
    let index = 0;
    index < maxBucketLength;
    index += 1
  ) {
    for (const bucket of groupBuckets) {
      const candidate =
        bucket[index];

      if (!candidate) {
        continue;
      }

      const duplicate =
        unique.some(
          (existing) =>
            titleSimilarity(
              existing.title,
              candidate.title
            ) >= 0.84
        );

      if (!duplicate) {
        unique.push(candidate);
      }

      if (
        unique.length >=
        DISCOVERY_LIMIT
      ) {
        return unique;
      }
    }
  }

  return unique;
}

const CLASSIFICATION_RESPONSE_SCHEMA = {
  type: "OBJECT",
  properties: {
    decisions: {
      type: "ARRAY",
      items: {
        type: "OBJECT",
        properties: {
          id: {
            type: "STRING"
          },
          accept: {
            type: "BOOLEAN"
          },
          category: {
            type: "STRING",
            enum: CATEGORIES
          },
          editorialScore: {
            type: "INTEGER"
          },
          technicalValue: {
            type: "INTEGER"
          },
          brandFit: {
            type: "INTEGER"
          },
          eventKey: {
            type: "STRING"
          },
          reason: {
            type: "STRING"
          }
        },
        required: [
          "id",
          "accept",
          "category",
          "editorialScore",
          "technicalValue",
          "brandFit",
          "eventKey",
          "reason"
        ]
      }
    }
  },
  required: ["decisions"]
};

const EDITORIAL_RESPONSE_SCHEMA = {
  type: "OBJECT",
  properties: {
    articles: {
      type: "ARRAY",
      items: {
        type: "OBJECT",
        properties: {
          id: {
            type: "STRING"
          },
          titleTr: {
            type: "STRING"
          },
          titleEn: {
            type: "STRING"
          },
          excerptTr: {
            type: "STRING"
          },
          excerptEn: {
            type: "STRING"
          },
          contentTr: {
            type: "STRING"
          },
          contentEn: {
            type: "STRING"
          }
        },
        required: [
          "id",
          "titleTr",
          "titleEn",
          "excerptTr",
          "excerptEn",
          "contentTr",
          "contentEn"
        ]
      }
    }
  },
  required: ["articles"]
};

function parseGeminiJson(text) {
  let cleaned = String(text || "")
    .replace(/^\uFEFF/, "")
    .replace(
      /^```(?:json)?\s*/i,
      ""
    )
    .replace(
      /\s*```$/i,
      ""
    )
    .trim();

  try {
    return JSON.parse(cleaned);
  } catch {
    // Tolerant repair continues below.
  }

  const first =
    cleaned.indexOf("{");

  const last =
    cleaned.lastIndexOf("}");

  if (
    first >= 0 &&
    last > first
  ) {
    cleaned = cleaned.slice(
      first,
      last + 1
    );
  }

  cleaned = cleaned
    .replace(
      /[\u201C\u201D]/g,
      '"'
    )
    .replace(
      /[\u2018\u2019]/g,
      "'"
    )
    .replace(
      /,\s*([}\]])/g,
      "$1"
    )
    .replace(
      /([{,]\s*)([A-Za-z_][A-Za-z0-9_]*)(\s*:)/g,
      '$1"$2"$3'
    )
    .replace(
      /[\u0000-\u0008\u000B\u000C\u000E-\u001F]/g,
      " "
    );

  return JSON.parse(cleaned);
}

async function callGemini(
  prompt,
  {
    maxOutputTokens = 8192,
    temperature = 0.1,
    responseSchema = null
  } = {}
) {
  const endpoint =
    "https://generativelanguage.googleapis.com/" +
    "v1beta/models/" +
    encodeURIComponent(GEMINI_MODEL) +
    ":generateContent?key=" +
    encodeURIComponent(
      GEMINI_API_KEY
    );

  let lastError;

  for (
    let attempt = 1;
    attempt <= 4;
    attempt += 1
  ) {
    try {
      const effectivePrompt =
        attempt > 1
          ? `${prompt}

Return only valid JSON. Use double-quoted keys and strings. Do not use Markdown code fences or trailing commas.`
          : prompt;

      const response = await fetch(
        endpoint,
        {
          method: "POST",
          headers: {
            "Content-Type":
              "application/json"
          },
          body: JSON.stringify({
            contents: [
              {
                role: "user",
                parts: [
                  {
                    text:
                      effectivePrompt
                  }
                ]
              }
            ],
            generationConfig: {
              temperature,
              topP: 0.8,
              maxOutputTokens,
              responseMimeType:
                "application/json",
              ...(responseSchema
                ? {
                    responseSchema
                  }
                : {})
            }
          })
        }
      );

      if (!response.ok) {
        const body =
          await response.text();

        throw new Error(
          `Gemini API ${response.status}: ` +
          body.slice(0, 1000)
        );
      }

      const body =
        await response.json();

      const responseText =
        body?.candidates?.[0]
          ?.content?.parts
          ?.map(
            (part) =>
              part.text || ""
          )
          .join("");

      if (!responseText) {
        throw new Error(
          "Gemini returned an empty response."
        );
      }

      return parseGeminiJson(
        responseText
      );
    } catch (error) {
      lastError = error;

      if (attempt === 4) {
        break;
      }

      const delay =
        1500 *
        2 ** (attempt - 1);

      console.warn(
        `Gemini attempt ${attempt} ` +
        `failed; retrying in ` +
        `${delay} ms: ` +
        error.message
      );

      await sleep(delay);
    }
  }

  throw lastError;
}

async function classifyCandidates(
  candidates
) {
  const decisions = [];

  const batches =
    chunk(candidates, 20);

  for (
    let index = 0;
    index < batches.length;
    index += 1
  ) {
    console.log(
      `Editorial classification ` +
      `${index + 1}/` +
      batches.length
    );

    const compact =
      batches[index].map(
        (item) => ({
          id: item.id,
          title: item.title,
          description:
            item.description,
          source:
            item.sourceName,
          domain:
            item.sourceDomain,
          sourceTier:
            item.sourceTier,
          publishedAt:
            item.publishedAt,
          categoryHint:
            item.categoryHint,
          discoveryGroup:
            item.discoveryGroup
        })
      );

    const prompt = `
You are the senior editor of NOVA, a premium Istanbul residential developer.

Assess every supplied news candidate. The source list has already been curated.

EDITORIAL IDENTITY

- International, cultured, technically serious, restrained and premium.
- Prefer major museums, established galleries, respected art publications, architecture institutions, engineering bodies and primary public authorities.
- Technical and legal items must have genuine practical or professional value.
- Construction items should concern engineering, materials, safety, standards, methods, sustainability, building technology or major civil infrastructure.
- Fashion items must concern design, craftsmanship, heritage, exhibitions, architecture or serious industry developments.
- Turkish official, municipal, engineering and standards sources should be judged by authority and practical value rather than journalistic polish.

CATEGORY DEFINITIONS

Construction:
Building construction, structural or civil engineering, concrete, foundations, façades, materials, building systems, construction methods, major infrastructure, sustainability or construction technology.

Urban Transformation:
Urban renewal, risky-building renewal, building-stock resilience, earthquake preparation, regeneration policy, transformation legislation, financial support programmes or official transformation projects in Turkey.

Kadıköy:
The subject must have a direct physical, administrative, architectural or technical connection to Kadıköy, Bağdat Caddesi or a named Kadıköy neighbourhood. Kadıköy construction, planning, urban transformation, building stock, earthquake resilience and municipal technical decisions are preferred.

Technical & Legal:
Building regulations, zoning, permits, building inspections, earthquake engineering, structural safety, concrete or material standards, soil and foundation engineering or official technical publications with direct relevance to Turkish construction.

Architecture & Design:
Completed architecture, serious design analysis, institutional architectural programmes, exhibitions, materials and recognised design work.

Art & Exhibitions:
Significant artists, art-world developments, criticism, cultural programmes and major exhibitions.

Exhibitions:
Specific current or upcoming exhibition programmes, biennials, art fairs and institutional presentations.

Galleries & Museums:
Museum and gallery programmes, acquisitions, openings, collection developments and significant institutional announcements.

Fashion & Luxury:
Design, heritage, craftsmanship, fashion exhibitions, material culture and serious luxury-industry developments. Reject celebrity gossip and shopping content.

MANDATORY REJECTIONS

Reject:
- jobs and recruitment;
- tenders and procurement notices;
- advertisements and advertorials;
- generic company press releases;
- competitor residential project promotion;
- praise of unrelated construction companies;
- crime or disaster sensationalism;
- political polemics;
- celebrity gossip;
- clickbait;
- generic regional stories without engineering, design or institutional value;
- housing-sales decline;
- housing crash predictions;
- negative property-market commentary;
- biomedical, medical, maritime or unrelated energy research;
- vague stories whose supplied title and description cannot support reliable reporting;
- duplicate headlines describing the same event.

Do not reject an authoritative ministry, municipality, professional chamber, standards body or engineering institution solely because its wording is formal.

Allowed categories:
${JSON.stringify(CATEGORIES)}

Return one JSON object only:

{
  "decisions": [
    {
      "id": "candidate-id",
      "accept": true,
      "category": "exact allowed category",
      "editorialScore": 0,
      "technicalValue": 0,
      "brandFit": 0,
      "eventKey": "short normalized event identity",
      "reason": "short factual reason"
    }
  ]
}

SCORING

- Scores must be integers between 0 and 100.
- International art, architecture, fashion and lifestyle items require editorialScore >= 84 and brandFit >= 82.
- Authoritative Turkish Construction, Urban Transformation, Kadıköy and Technical & Legal items may be accepted from editorialScore 76 and brandFit 78 when they provide direct professional, regulatory or local value.
- Do not inflate every score.
- A metadata-poor or vague item must receive a lower score.
- Include every supplied id exactly once.
- Never invent facts.

Candidates:
${JSON.stringify(compact)}
`;

    const result =
      await callGemini(
        prompt,
        {
          maxOutputTokens: 8192,
          temperature: 0.05,
          responseSchema:
            CLASSIFICATION_RESPONSE_SCHEMA
        }
      );

    if (
      Array.isArray(
        result.decisions
      )
    ) {
      decisions.push(
        ...result.decisions
      );
    }

    await sleep(
      REQUEST_DELAY_MS
    );
  }

  const decisionMap =
    new Map(
      decisions.map(
        (item) => [
          item.id,
          item
        ]
      )
    );

  const accepted =
    candidates
      .map((candidate) => {
        const rawDecision =
          decisionMap.get(
            candidate.id
          );

        const lockedCategory =
          LOCKED_DISCOVERY_CATEGORIES[
            candidate.discoveryGroup
          ];

        return {
          ...candidate,
          decision: rawDecision
            ? {
                ...rawDecision,
                category:
                  lockedCategory ||
                  rawDecision.category
              }
            : null
        };
      })
      .filter((item) => {
        if (
          item.decision?.accept !==
          true
        ) {
          return false;
        }

        if (
          !CATEGORIES.includes(
            item.decision.category
          )
        ) {
          return false;
        }

        const protectedCategory =
          [
            "Construction",
            "Urban Transformation",
            "Kadıköy",
            "Technical & Legal"
          ].includes(
            item.decision.category
          );

        const minimumEditorial =
          protectedCategory
            ? 76
            : 84;

        const minimumBrandFit =
          protectedCategory
            ? 78
            : 82;

        return (
          Number(
            item.decision
              .editorialScore
          ) >= minimumEditorial &&
          Number(
            item.decision.brandFit
          ) >= minimumBrandFit
        );
      })
      .sort((a, b) => {
        const scoreDifference =
          Number(
            b.decision
              .editorialScore
          ) -
          Number(
            a.decision
              .editorialScore
          );

        if (scoreDifference) {
          return scoreDifference;
        }

        return (
          a.sourceTier -
          b.sourceTier
        );
      });

  const seenEvents =
    new Set();

  const sourceCategoryCounts =
    new Map();

  const deduplicated = [];

  for (const item of accepted) {
    const eventKey =
      normalizeTitle(
        item.decision.eventKey ||
        item.title
      );

    const category =
      item.decision.category;

    const sourceKey =
      `${category}|` +
      item.sourceDomain;

    const tooSimilar =
      deduplicated.some(
        (existing) =>
          existing.decision
            .category === category &&
          titleSimilarity(
            existing.decision
              .eventKey ||
              existing.title,
            item.decision.eventKey ||
              item.title
          ) >= 0.58
      );

    if (
      seenEvents.has(eventKey) ||
      tooSimilar
    ) {
      continue;
    }

    if (
      (
        sourceCategoryCounts.get(
          sourceKey
        ) || 0
      ) >= 2
    ) {
      continue;
    }

    seenEvents.add(eventKey);

    sourceCategoryCounts.set(
      sourceKey,
      (
        sourceCategoryCounts.get(
          sourceKey
        ) || 0
      ) + 1
    );

    deduplicated.push(item);
  }

  return deduplicated;
}

function absoluteUrl(
  value,
  base
) {
  try {
    return new URL(
      value,
      base
    ).toString();
  } catch {
    return "";
  }
}

function isPublisherUrl(
  url,
  expectedDomain
) {
  const domain =
    normalizeDomain(url);

  return Boolean(
    domain &&
      (
        domain ===
          expectedDomain ||
        domain.endsWith(
          `.${expectedDomain}`
        )
      )
  );
}

const decodedGoogleNewsUrls =
  new Map();

function getGoogleNewsArticleId(
  sourceUrl
) {
  try {
    const url =
      new URL(sourceUrl);

    const parts =
      url.pathname
        .split("/")
        .filter(Boolean);

    if (
      url.hostname ===
        "news.google.com" &&
      parts.length >= 2 &&
      ["articles", "read"].includes(
        parts[
          parts.length - 2
        ]
      )
    ) {
      return parts[
        parts.length - 1
      ];
    }
  } catch {
    return "";
  }

  return "";
}

async function getGoogleNewsDecodingParams(
  articleId
) {
  const response = await fetch(
    "https://news.google.com/" +
      `rss/articles/${articleId}`,
    {
      headers: {
        "User-Agent":
          "Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 Chrome/129.0 Safari/537.36",
        Accept:
          "text/html,application/xhtml+xml,application/xml;q=0.9,*/*;q=0.8",
        "Accept-Language":
          "en-US,en;q=0.9"
      }
    }
  );

  if (!response.ok) {
    throw new Error(
      "Google News parameter request returned " +
      response.status
    );
  }

  const html =
    await response.text();

  const $ =
    cheerio.load(html);

  const element = $(
    "c-wiz > div[jscontroller][data-n-a-sg][data-n-a-ts]"
  ).first();

  const signature =
    element.attr("data-n-a-sg");

  const timestamp =
    element.attr("data-n-a-ts");

  if (
    !signature ||
    !timestamp
  ) {
    throw new Error(
      "Google News decoding parameters were not found."
    );
  }

  return {
    signature,
    timestamp
  };
}

function parseBatchExecutePayload(
  text
) {
  const lines = String(text)
    .replace(
      /^\)\]\}'\s*/,
      ""
    )
    .split("\n")
    .map(
      (line) => line.trim()
    )
    .filter(
      (line) =>
        line.startsWith("[")
    );

  for (const line of lines) {
    try {
      const parsed =
        JSON.parse(line);

      const rows =
        Array.isArray(parsed)
          ? parsed
          : [];

      for (const row of rows) {
        if (
          Array.isArray(row) &&
          (
            row[0] ===
              "wrb.fr" ||
            row[0] ===
              "w779db"
          ) &&
          row[1] ===
            "Fbv4je"
        ) {
          const inner =
            JSON.parse(row[2]);

          if (
            typeof inner?.[1] ===
            "string"
          ) {
            return inner[1];
          }
        }
      }
    } catch {
      // Ignore unrelated protocol rows.
    }
  }

  for (
    const part of
    String(text).split("\n\n")
  ) {
    try {
      const parsed =
        JSON.parse(
          part.trim()
        );

      for (
        const row of
        Array.isArray(parsed)
          ? parsed
          : []
      ) {
        if (
          Array.isArray(row) &&
          row[1] ===
            "Fbv4je"
        ) {
          const inner =
            JSON.parse(row[2]);

          if (
            typeof inner?.[1] ===
            "string"
          ) {
            return inner[1];
          }
        }
      }
    } catch {
      // Continue searching.
    }
  }

  return "";
}

async function decodeGoogleNewsUrl(
  sourceUrl
) {
  if (
    decodedGoogleNewsUrls.has(
      sourceUrl
    )
  ) {
    return decodedGoogleNewsUrls.get(
      sourceUrl
    );
  }

  const articleId =
    getGoogleNewsArticleId(
      sourceUrl
    );

  if (!articleId) {
    return sourceUrl;
  }

  try {
    const {
      signature,
      timestamp
    } =
      await getGoogleNewsDecodingParams(
        articleId
      );

    const request = [
      "Fbv4je",
      `["garturlreq",[["X","X",["X","X"],null,null,1,1,"US:en",null,1,null,null,null,null,null,0,1],"X","X",1,[1,1,1],1,1,null,0,0,null,0],"${articleId}",${timestamp},"${signature}"]`
    ];

    const body =
      "f.req=" +
      encodeURIComponent(
        JSON.stringify([
          [request]
        ])
      );

    const response =
      await fetch(
        "https://news.google.com/_/DotsSplashUi/data/batchexecute",
        {
          method: "POST",
          headers: {
            "Content-Type":
              "application/x-www-form-urlencoded;charset=UTF-8",
            "User-Agent":
              "Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 Chrome/129.0 Safari/537.36",
            Accept: "*/*",
            Origin:
              "https://news.google.com",
            Referer:
              "https://news.google.com/"
          },
          body
        }
      );

    if (!response.ok) {
      throw new Error(
        "Google News decoder returned " +
        response.status
      );
    }

    const decodedUrl =
      parseBatchExecutePayload(
        await response.text()
      );

    if (!decodedUrl) {
      throw new Error(
        "Decoded publisher URL was empty."
      );
    }

    decodedGoogleNewsUrls.set(
      sourceUrl,
      decodedUrl
    );

    return decodedUrl;
  } catch (error) {
    console.warn(
      "Google News URL decoding failed: " +
      error.message
    );

    decodedGoogleNewsUrls.set(
      sourceUrl,
      ""
    );

    return "";
  }
}

async function resolveAndExtract(
  candidate
) {
  const controller =
    new AbortController();

  const timeout =
    setTimeout(
      () =>
        controller.abort(),
      45000
    );

  try {
    const decodedUrl =
      await decodeGoogleNewsUrl(
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
        "Publisher URL could not be verified for " +
        candidate.sourceDomain
      );

      return null;
    }

    const response =
      await fetch(
        decodedUrl,
        {
          redirect: "follow",
          signal:
            controller.signal,
          headers: {
            "User-Agent":
              "Mozilla/5.0 (compatible; NOVAEditorialBot/4.0; +https://novakonut.com)",
            Accept:
              "text/html,application/xhtml+xml"
          }
        }
      );

    const html =
      await response.text();

    if (!response.ok) {
      console.warn(
        `Publisher returned ${response.status}: ` +
        candidate.sourceDomain
      );

      return null;
    }

    let articleUrl =
      response.url;

    let articleHtml =
      html;

    if (
      !isPublisherUrl(
        articleUrl,
        candidate.sourceDomain
      )
    ) {
      const $news =
        cheerio.load(html);

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
              $news(node).attr(
                "href"
              )
          )
          .get()
      ]
        .filter(Boolean)
        .map((value) =>
          absoluteUrl(
            value,
            response.url
          )
        );

      articleUrl =
        possibleUrls.find(
          (url) =>
            isPublisherUrl(
              url,
              candidate.sourceDomain
            )
        ) || "";

      if (!articleUrl) {
        return null;
      }

      const publisherResponse =
        await fetch(
          articleUrl,
          {
            redirect: "follow",
            signal:
              controller.signal,
            headers: {
              "User-Agent":
                "Mozilla/5.0 (compatible; NOVAEditorialBot/4.0; +https://novakonut.com)",
              Accept:
                "text/html,application/xhtml+xml"
            }
          }
        );

      if (
        !publisherResponse.ok
      ) {
        console.warn(
          `Publisher returned ${publisherResponse.status}: ` +
          candidate.sourceDomain
        );

        return null;
      }

      articleUrl =
        publisherResponse.url;

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

    const $ =
      cheerio.load(articleHtml);

    const image =
      absoluteUrl(
        $(
          'meta[property="og:image"]'
        ).attr("content") ||
          $(
            'meta[name="twitter:image"]'
          ).attr("content") ||
          "",
        articleUrl
      );

    let jsonLdText = "";

    $(
      "script[type='application/ld+json']"
    ).each((_, node) => {
      try {
        const parsed =
          JSON.parse(
            $(node).html() ||
            "null"
          );

        const records =
          Array.isArray(parsed)
            ? parsed
            : [parsed];

        const queue = [
          ...records
        ];

        while (queue.length) {
          const record =
            queue.shift();

          if (
            !record ||
            typeof record !==
              "object"
          ) {
            continue;
          }

          if (
            typeof record.articleBody ===
              "string" &&
            record.articleBody.length >
              jsonLdText.length
          ) {
            jsonLdText =
              cleanText(
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
        // Ignore invalid JSON-LD.
      }
    });

    $(
      "script,style,noscript,nav,footer,header,aside,form,button,iframe,svg"
    ).remove();

    const selectors = [
      "article",
      "main article",
      "[itemprop='articleBody']",
      ".article-body",
      ".article__body",
      ".story-body",
      ".entry-content",
      "main"
    ];

    let text =
      jsonLdText;

    for (
      const selector of selectors
    ) {
      const candidateText =
        cleanText(
          $(selector)
            .first()
            .text()
        );

      if (
        candidateText.length >
        text.length
      ) {
        text =
          candidateText;
      }
    }

    if (
      text.length <
      MIN_ARTICLE_TEXT
    ) {
      console.warn(
        `Insufficient article text (${text.length}) for ` +
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
      "Article extraction failed for " +
      candidate.sourceDomain +
      ": " +
      error.message
    );

    return null;
  } finally {
    clearTimeout(timeout);
  }
}

async function extractSelectedArticles(
  classified
) {
  const grouped =
    Object.fromEntries(
      CATEGORIES.map(
        (category) => [
          category,
          []
        ]
      )
    );

  for (const item of classified) {
    grouped[
      item.decision.category
    ].push(item);
  }

  const extracted = [];

  for (
    const category of CATEGORIES
  ) {
    const target =
      CATEGORY_LIMITS[category];

    const attempts =
      grouped[category].slice(
        0,
        target * 3
      );

    console.log(
      `Extracting ${category}: ` +
      `${attempts.length} candidates ` +
      `for max ${target}`
    );

    for (
      const candidate of attempts
    ) {
      const currentCount =
        extracted.filter(
          (item) =>
            item.decision
              .category ===
            category
        ).length;

      if (
        currentCount >= target
      ) {
        break;
      }

      const content =
        await resolveAndExtract(
          candidate
        );

      const metadataSourceText = [
        `Original title: ${candidate.title}`,
        `RSS summary: ${
          candidate.description ||
          "No additional summary supplied."
        }`,
        `Publisher: ${candidate.sourceName}`,
        `Published at: ${candidate.publishedAt}`
      ].join("\n");

      extracted.push({
        ...candidate,
        ...(content || {
          articleUrl:
            candidate.googleNewsUrl,
          image: null,
          sourceText:
            metadataSourceText
        }),
        contentMode: content
          ? "full-source"
          : "metadata-only"
      });

      await sleep(200);
    }
  }

  return extracted;
}

async function writeEditorialContent(
  articles
) {
  const results = [];

  const batches =
    chunk(articles, 3);

  for (
    let index = 0;
    index < batches.length;
    index += 1
  ) {
    console.log(
      "Bilingual editorial writing " +
      `${index + 1}/` +
      batches.length
    );

    const input =
      batches[index].map(
        (item) => ({
          id: item.id,
          originalTitle:
            item.title,
          source:
            item.sourceName,
          domain:
            item.sourceDomain,
          publishedAt:
            item.publishedAt,
          category:
            item.decision.category,
          contentMode:
            item.contentMode,
          sourceText:
            item.sourceText
        })
      );

    const prompt = `
Act as NOVA's bilingual senior editorial desk.

Using only the supplied source material, create an original Turkish and English editorial treatment for every item.

ACCURACY

- Do not add a person, institution, number, date, quotation, location, technical conclusion or legal interpretation that is absent from the source material.
- Do not disguise uncertainty.
- Return an editorial result for every supplied id.
- Do not reject an item merely because contentMode is metadata-only.
- Do not reproduce long source sentences.
- Paraphrase faithfully.
- Never write promotional praise for a construction company or property developer.
- For laws, regulations and engineering, use precise and neutral language.
- Clearly attribute regulations and technical claims to the issuing institution.
- Do not turn a proposal, target or announcement into a completed fact.
- Do not describe an old event as upcoming when the supplied date indicates otherwise.

EDITORIAL TONE

- Refined, factual, restrained and concise.
- Suitable for a premium architecture and residential-development brand.
- Internationally literate without sounding pretentious.
- No clickbait.
- No advertising language.
- No clichés.
- No generic AI filler.
- Turkish must read as native professional Turkish.
- English must read as native editorial English.
- Correct grammar, spelling, institution names and Turkish suffixes.
- Use digits for measurements, money, dates and large quantities where appropriate.
- Avoid literal translation structures.

FORBIDDEN WORKFLOW LANGUAGE

Never use phrases such as:
- supplied information;
- publisher data;
- limited source text;
- according to the records;
- this content;
- the source material;
- provided metadata;
- yayıncı verilerine göre;
- sağlanan bilgiler doğrultusunda;
- sınırlı kaynak metin;
- paylaşılan kayıtlara göre;
- bu içerik;
- eldeki veriler;
- detaylar için kaynağa başvurulabilir.

Write the verified facts directly.

OUTPUT REQUIREMENTS

For every article produce:

- titleTr and titleEn:
  7-16 words, factual, specific and elegant.

- excerptTr and excerptEn:
  30-60 words.

- contentTr and contentEn for full-source:
  180-300 words.

- contentTr and contentEn for metadata-only:
  60-110 words.

Metadata-only content must remain strictly within the supplied title and RSS summary. It must still read like a concise editorial news brief, not like a system note.

Do not mention NOVA.

Retain the supplied category exactly.

Return JSON only:

{
  "articles": [
    {
      "id": "article-id",
      "titleTr": "...",
      "titleEn": "...",
      "excerptTr": "...",
      "excerptEn": "...",
      "contentTr": "...",
      "contentEn": "..."
    }
  ]
}

Source material:
${JSON.stringify(input)}
`;

    const response =
      await callGemini(
        prompt,
        {
          maxOutputTokens: 8192,
          temperature: 0.1,
          responseSchema:
            EDITORIAL_RESPONSE_SCHEMA
        }
      );

    if (
      Array.isArray(
        response.articles
      )
    ) {
      results.push(
        ...response.articles
      );
    }

    await sleep(
      REQUEST_DELAY_MS
    );
  }

  const byId =
    new Map(
      results.map(
        (item) => [
          item.id,
          item
        ]
      )
    );

  return articles
    .map((article) => ({
      ...article,
      editorial:
        byId.get(article.id)
    }))
    .filter((article) => {
      const item =
        article.editorial;

      return Boolean(
        item &&
          item.titleTr &&
          item.titleEn &&
          item.excerptTr &&
          item.excerptEn &&
          item.contentTr &&
          item.contentEn
      );
    });
}

function buildFeed(
  articles,
  language
) {
  const generatedAt =
    new Date().toISOString();

  const categoryCounts =
    Object.fromEntries(
      CATEGORIES.map(
        (category) => [
          category,
          0
        ]
      )
    );

  const preparedArticles = [];

  for (const item of articles) {
    const localizedTitle =
      language === "tr"
        ? item.editorial.titleTr
        : item.editorial.titleEn;

    const duplicate =
      preparedArticles.some(
        (existing) =>
          existing.category ===
            item.decision
              .category &&
          titleSimilarity(
            existing.title,
            localizedTitle
          ) >= 0.58
      );

    if (duplicate) {
      continue;
    }

    preparedArticles.push({
      item,
      title:
        localizedTitle,
      category:
        item.decision.category
    });
  }

  const outputArticles =
    preparedArticles
      .map(({ item }) => {
        const category =
          item.decision.category;

        categoryCounts[
          category
        ] += 1;

        return {
          id: item.id,
          title:
            language === "tr"
              ? item.editorial
                  .titleTr
              : item.editorial
                  .titleEn,
          excerpt:
            language === "tr"
              ? item.editorial
                  .excerptTr
              : item.editorial
                  .excerptEn,
          content:
            language === "tr"
              ? item.editorial
                  .contentTr
              : item.editorial
                  .contentEn,
          category,
          source:
            item.sourceName,
          sourceDomain:
            item.sourceDomain,
          sourceTier:
            item.sourceTier,
          publishedAt:
            item.publishedAt,
          url:
            item.articleUrl,
          image:
            item.image,
          originalTitle:
            item.title,
          originalLanguage:
            item.originalLanguageHint,
          contentMode:
            item.contentMode,
          editorialScore:
            Number(
              item.decision
                .editorialScore
            ),
          technicalValue:
            Number(
              item.decision
                .technicalValue ||
              0
            ),
          brandFit:
            Number(
              item.decision
                .brandFit
            )
        };
      })
      .sort(
        (a, b) =>
          new Date(
            b.publishedAt
          ) -
          new Date(
            a.publishedAt
          )
      );

  const coverage =
    Object.fromEntries(
      CATEGORIES.map(
        (category) => [
          category,
          {
            count:
              categoryCounts[
                category
              ],
            targetMinimum:
              CATEGORY_MINIMUMS[
                category
              ],
            targetMet:
              categoryCounts[
                category
              ] >=
              CATEGORY_MINIMUMS[
                category
              ]
          }
        ]
      )
    );

  return {
    status: "success",
    editorialPolicy:
      "NOVA Premium AI-Curated Editorial Feed",
    aiModel:
      GEMINI_MODEL,
    language,
    generatedAt,
    retentionDays:
      RETENTION_DAYS,
    categories:
      CATEGORIES,
    categoryCounts,
    coverage,
    total:
      outputArticles.length,
    articles:
      outputArticles
  };
}

function writeJson(
  relativePath,
  data
) {
  const outputPath =
    path.resolve(
      __dirname,
      "..",
      relativePath
    );

  fs.mkdirSync(
    path.dirname(
      outputPath
    ),
    {
      recursive: true
    }
  );

  fs.writeFileSync(
    outputPath,
    `${JSON.stringify(
      data,
      null,
      2
    )}\n`,
    "utf8"
  );

  console.log(
    `Wrote ${outputPath}`
  );
}

function printCoverage(
  completed
) {
  console.log(
    "\nCategory coverage:"
  );

  for (
    const category of CATEGORIES
  ) {
    const count =
      completed.filter(
        (item) =>
          item.decision
            .category ===
          category
      ).length;

    const minimum =
      CATEGORY_MINIMUMS[
        category
      ];

    const status =
      count >= minimum
        ? "OK"
        : "BELOW TARGET";

    console.log(
      `${category}: ${count} ` +
      `(minimum ${minimum}) ` +
      `[${status}]`
    );
  }
}

async function main() {
  console.log(
    "Starting NOVA premium editorial workflow with " +
    GEMINI_MODEL
  );

  const candidates =
    await discoverCandidates();

  console.log(
    "Curated-source candidates: " +
    candidates.length
  );

  if (!candidates.length) {
    throw new Error(
      "No candidates discovered from curated sources."
    );
  }

  const discoveredByGroup =
    Object.fromEntries(
      SOURCE_GROUPS.map(
        (group) => [
          group.name,
          candidates.filter(
            (candidate) =>
              candidate.discoveryGroup ===
              group.name
          ).length
        ]
      )
    );

  console.log(
    "Discovery group counts:",
    JSON.stringify(
      discoveredByGroup,
      null,
      2
    )
  );

  const classified =
    await classifyCandidates(
      candidates
    );

  console.log(
    "Gemini-approved unique candidates: " +
    classified.length
  );

  if (!classified.length) {
    throw new Error(
      "Gemini approved no candidates."
    );
  }

  const approvedByCategory =
    Object.fromEntries(
      CATEGORIES.map(
        (category) => [
          category,
          classified.filter(
            (item) =>
              item.decision
                .category ===
              category
          ).length
        ]
      )
    );

  console.log(
    "Approved category counts:",
    JSON.stringify(
      approvedByCategory,
      null,
      2
    )
  );

  const extracted =
    await extractSelectedArticles(
      classified
    );

  console.log(
    "Articles prepared for editorial writing: " +
    extracted.length
  );

  if (!extracted.length) {
    throw new Error(
      "No articles were prepared; existing feeds were preserved."
    );
  }

  const completed =
    await writeEditorialContent(
      extracted
    );

  console.log(
    "Completed bilingual articles: " +
    completed.length
  );

  if (!completed.length) {
    throw new Error(
      "Gemini produced no publishable bilingual articles."
    );
  }

  const turkishFeed =
    buildFeed(
      completed,
      "tr"
    );

  const englishFeed =
    buildFeed(
      completed,
      "en"
    );

  writeJson(
    "data/news-tr.json",
    turkishFeed
  );

  writeJson(
    "data/news-en.json",
    englishFeed
  );

  printCoverage(completed);

  console.log(
    "\nNOVA news workflow completed successfully."
  );

  console.log(
    `Turkish feed: ${turkishFeed.total} articles`
  );

  console.log(
    `English feed: ${englishFeed.total} articles`
  );
}

main().catch((error) => {
  console.error(
    "NOVA premium editorial workflow failed:",
    error
  );

  process.exitCode = 1;
});
