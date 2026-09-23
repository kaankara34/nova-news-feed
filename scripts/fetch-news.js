"use strict";

const fs = require("fs");
const path = require("path");
const crypto = require("crypto");
const Parser = require("rss-parser");
const cheerio = require("cheerio");

/*
 * NOVA News Feed v6
 *
 * 1. Curated and category-specific discovery
 * 2. Deterministic relevance filtering
 * 3. Gemini editorial review
 * 4. Publisher verification and article extraction
 * 5. Bilingual editorial writing
 * 6. Final quality control and deduplication
 * 7. Fifteen-day feed preservation
 */

const SCHEMA_VERSION = 6;
const RETENTION_DAYS = 15;

const GEMINI_MODEL =
  process.env.GEMINI_MODEL ||
  "gemini-3.5-flash-lite";

const GEMINI_API_KEY =
  process.env.GEMINI_API_KEY || "";

const RSS_CONCURRENCY = 6;
const EXTRACTION_CONCURRENCY = 3;
const REQUEST_TIMEOUT_MS = 35_000;
const GEMINI_DELAY_MS = 650;
const MIN_FULL_TEXT = 650;
const MAX_SOURCE_TEXT = 9_000;
const MAX_CANDIDATES_PER_CATEGORY = 55;

const OUTPUT_TR = path.resolve(
  __dirname,
  "..",
  "data",
  "news-tr.json"
);

const OUTPUT_EN = path.resolve(
  __dirname,
  "..",
  "data",
  "news-en.json"
);

const CATEGORY_CONFIG = {
  "Art & Exhibitions": {
    target: 4,
    maximum: 5,
    minScore: 84,
    allowMetadata: true
  },
  Exhibitions: {
    target: 4,
    maximum: 5,
    minScore: 84,
    allowMetadata: true
  },
  "Galleries & Museums": {
    target: 4,
    maximum: 5,
    minScore: 84,
    allowMetadata: true
  },
  "Architecture & Design": {
    target: 5,
    maximum: 6,
    minScore: 83,
    allowMetadata: true
  },
  Construction: {
    target: 5,
    maximum: 6,
    minScore: 80,
    allowMetadata: false
  },
  "Urban Transformation": {
    target: 3,
    maximum: 4,
    minScore: 78,
    allowMetadata: false
  },
  Kadıköy: {
    target: 3,
    maximum: 4,
    minScore: 78,
    allowMetadata: false
  },
  "Technical & Legal": {
    target: 4,
    maximum: 5,
    minScore: 80,
    allowMetadata: false
  },
  "Fashion & Luxury": {
    target: 3,
    maximum: 3,
    minScore: 84,
    allowMetadata: true
  }
};

const CATEGORIES =
  Object.keys(CATEGORY_CONFIG);

const ROUTES = [
  {
    name: "international-art",
    category: "Art & Exhibitions",
    language: "en",
    query:
      "art exhibition artist museum gallery biennale",
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
    ]
  },
  {
    name: "international-exhibitions",
    category: "Exhibitions",
    language: "en",
    query:
      "exhibition biennale art fair opening programme",
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
    ]
  },
  {
    name: "international-museums",
    category: "Galleries & Museums",
    language: "en",
    query:
      "museum gallery exhibition collection acquisition opening",
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
    ]
  },
  {
    name: "turkey-art",
    category: "Galleries & Museums",
    language: "tr",
    query:
      "sergi sanat müze galeri bienal açılış koleksiyon",
    domains: [
      "istanbulmodern.org",
      "peramuseum.org",
      "sakipsabancimuzesi.org",
      "arter.org.tr",
      "saltonline.org",
      "iksv.org"
    ]
  },
  {
    name: "architecture-design",
    category: "Architecture & Design",
    language: "en",
    query:
      "architecture building residential design material urbanism completed",
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
    ]
  },
  {
    name: "global-construction",
    category: "Construction",
    language: "en",
    query:
      "building construction structural engineering concrete foundation facade infrastructure",
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
    ]
  },
  {
    name: "turkey-construction",
    category: "Construction",
    language: "tr",
    query:
      "Türkiye inşaat beton temel taşıyıcı sistem yapı malzemesi yapı teknolojisi mühendislik",
    domains: [
      "aa.com.tr",
      "trthaber.com",
      "yapi.com.tr",
      "arkitera.com",
      "turkiyeimsad.org",
      "thbb.org",
      "tmb.org.tr",
      "imo.org.tr",
      "csb.gov.tr",
      "yapiisleri.csb.gov.tr"
    ]
  },
  {
    name: "turkey-urban-transformation",
    category: "Urban Transformation",
    language: "tr",
    query:
      "kentsel dönüşüm riskli yapı yapı stoku Yarısı Bizden rezerv yapı alanı İstanbul",
    domains: [
      "csb.gov.tr",
      "kdb.gov.tr",
      "ibb.istanbul",
      "ipa.istanbul",
      "resmigazete.gov.tr",
      "toki.gov.tr",
      "aa.com.tr",
      "trthaber.com",
      "imo.org.tr"
    ]
  },
  {
    name: "kadikoy-built-environment",
    category: "Kadıköy",
    language: "tr",
    query:
      "Kadıköy kentsel dönüşüm inşaat imar deprem yapı stoku mimarlık Bağdat Caddesi",
    domains: [
      "kadikoy.bel.tr",
      "gazetekadikoy.com.tr",
      "ibb.istanbul",
      "ipa.istanbul",
      "csb.gov.tr",
      "aa.com.tr",
      "trthaber.com",
      "imo.org.tr",
      "arkitera.com"
    ]
  },
  {
    name: "turkey-technical-legal",
    category: "Technical & Legal",
    language: "tr",
    query:
      "yapı yönetmelik değişiklik tebliğ standart deprem mühendisliği beton zemin yapı denetimi imar",
    domains: [
      "resmigazete.gov.tr",
      "csb.gov.tr",
      "kdb.gov.tr",
      "yapiisleri.csb.gov.tr",
      "afad.gov.tr",
      "imo.org.tr",
      "mimarlarodasi.org.tr",
      "tubitak.gov.tr",
      "thbb.org",
      "turkiyeimsad.org",
      "tse.org.tr"
    ]
  },
  {
    name: "fashion-luxury",
    category: "Fashion & Luxury",
    language: "en",
    query:
      "fashion design craftsmanship heritage exhibition material innovation luxury architecture",
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
    ]
  }
];

const ALLOWED_DOMAINS =
  new Set(
    ROUTES.flatMap(
      (route) => route.domains
    )
  );

const OFFICIAL_STATIC_DOMAINS =
  new Set([
    "resmigazete.gov.tr",
    "csb.gov.tr",
    "kdb.gov.tr",
    "yapiisleri.csb.gov.tr",
    "afad.gov.tr",
    "toki.gov.tr",
    "tse.org.tr"
  ]);

const COMMON_REJECT = [
  "iş ilanı",
  "iş başvurusu",
  "ekip arkadaşı",
  "personel alımı",
  "kariyer",
  "job vacancy",
  "job opening",
  "we are hiring",
  "recruitment",
  "tender",
  "ihale ilanı",
  "satılık",
  "kiralık",
  "advertorial",
  "sponsored",
  "magazin",
  "dedikodu",
  "red carpet",
  "celebrity style",
  "best dressed",
  "konut satışları düştü",
  "housing crash",
  "property crash",
  "piyasa çöküşü"
];

const KADIKOY_LOCATIONS = [
  "kadıköy",
  "kadikoy",
  "bağdat caddesi",
  "bagdat caddesi",
  "caddebostan",
  "feneryolu",
  "fenerbahçe",
  "fenerbahce",
  "göztepe",
  "goztepe",
  "erenköy",
  "erenkoy",
  "suadiye",
  "kozyatağı",
  "kozyatagi",
  "bostancı",
  "bostanci",
  "moda",
  "kalamış",
  "kalamis",
  "acıbadem",
  "acibadem",
  "hasanpaşa",
  "hasanpasa",
  "koşuyolu",
  "kosuyolu",
  "merdivenköy",
  "merdivenkoy"
];

const BUILT_ENVIRONMENT_TERMS = [
  "inşaat",
  "insaat",
  "yapı",
  "yapi",
  "bina",
  "beton",
  "temel",
  "zemin",
  "taşıyıcı",
  "tasiyici",
  "strüktür",
  "struktur",
  "cephe",
  "yalıtım",
  "yalitim",
  "mimari",
  "mimarlık",
  "mimarlik",
  "mühendis",
  "muhendis",
  "deprem",
  "imar",
  "ruhsat",
  "dönüşüm",
  "donusum",
  "restorasyon",
  "güçlendirme",
  "guclendirme",
  "construction",
  "building",
  "structural",
  "civil engineering",
  "concrete",
  "foundation",
  "facade",
  "infrastructure",
  "retrofit",
  "seismic",
  "tower",
  "bridge",
  "tunnel",
  "residential",
  "architecture"
];

const URBAN_TRANSFORMATION_TERMS = [
  "kentsel dönüşüm",
  "kentsel donusum",
  "riskli yapı",
  "riskli yapi",
  "yapı stoku",
  "yapi stoku",
  "yarısı bizden",
  "yarisi bizden",
  "rezerv yapı alanı",
  "rezerv yapi alani",
  "dönüşüm projesi",
  "donusum projesi",
  "6306",
  "yenileme alanı",
  "yenileme alani",
  "deprem dönüşümü",
  "deprem donusumu"
];

const TECHNICAL_TERMS = [
  "yönetmeli",
  "yonetmeli",
  "tebliğ",
  "teblig",
  "standart",
  "mevzuat değiş",
  "yapı denetimi",
  "yapi denetimi",
  "deprem mühendisliği",
  "deprem muhendisligi",
  "beton",
  "zemin",
  "temel",
  "taşıyıcı sistem",
  "tasiyici sistem",
  "güçlendirme",
  "guclendirme",
  "imar yönetmeliği",
  "imar yonetmeligi",
  "ruhsat",
  "yangın güvenliği",
  "yangin guvenligi",
  "enerji performansı",
  "enerji performansi",
  "eurocode",
  "building code",
  "structural safety",
  "seismic",
  "standard",
  "regulation"
];

const NEWS_ACTION_TERMS = [
  "yayımlandı",
  "yayimlandi",
  "yayınlandı",
  "yayinlandi",
  "değişti",
  "degisti",
  "değiş",
  "degis",
  "güncellendi",
  "guncellendi",
  "yürürlüğe girdi",
  "yururluge girdi",
  "açıklandı",
  "aciklandi",
  "duyuruldu",
  "başladı",
  "basladi",
  "onaylandı",
  "onaylandi",
  "rapor",
  "araştırma",
  "arastirma",
  "inceleme",
  "karar",
  "genelge",
  "tebliğ",
  "teblig",
  "new",
  "updated",
  "launched",
  "announced",
  "published",
  "report",
  "study",
  "opens",
  "completed",
  "unveiled"
];

const ART_TERMS = [
  "art",
  "artist",
  "exhibition",
  "museum",
  "gallery",
  "biennale",
  "sculpture",
  "painting",
  "installation",
  "sanat",
  "sanatçı",
  "sanatci",
  "sergi",
  "müze",
  "muze",
  "galeri",
  "bienal",
  "heykel",
  "resim",
  "koleksiyon"
];

const FASHION_QUALITY_TERMS = [
  "craftsmanship",
  "heritage",
  "design",
  "exhibition",
  "museum",
  "archive",
  "material",
  "textile",
  "architecture",
  "zanaat",
  "miras",
  "tasarım",
  "tasarim",
  "sergi",
  "arşiv",
  "arsiv",
  "tekstil",
  "malzeme"
];

const FASHION_REJECT_TERMS = [
  "wore",
  "wears",
  "look of the day",
  "street style",
  "best dressed",
  "celebrity",
  "singer",
  "actor",
  "actress",
  "şarkıcı",
  "sarkici",
  "oyuncu",
  "what to buy",
  "shopping",
  "trend to shop"
];

const parser = new Parser({
  timeout: 25_000,
  customFields: {
    item: [
      ["source", "sourceNode"]
    ]
  },
  headers: {
    "User-Agent":
      "NOVA-Editorial-Feed/6.0 (+https://novakonut.com)"
  }
});

const sleep = (ms) =>
  new Promise(
    (resolve) =>
      setTimeout(resolve, ms)
  );

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

function fold(value = "") {
  return cleanText(value)
    .toLocaleLowerCase("tr-TR")
    .normalize("NFKD")
    .replace(
      /[\u0300-\u036f]/g,
      ""
    )
    .replace(/ı/g, "i");
}

function includesAny(
  text,
  terms
) {
  const normalized =
    fold(text);

  return terms.some(
    (term) =>
      normalized.includes(
        fold(term)
      )
  );
}

function normalizeDomain(
  input = ""
) {
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

function domainMatches(
  domain,
  expected
) {
  return (
    domain === expected ||
    domain.endsWith(
      `.${expected}`
    )
  );
}

function isAllowedDomain(domain) {
  return [
    ...ALLOWED_DOMAINS
  ].some(
    (allowed) =>
      domainMatches(
        domain,
        allowed
      )
  );
}

function isOfficialStaticDomain(
  domain
) {
  return [
    ...OFFICIAL_STATIC_DOMAINS
  ].some(
    (item) =>
      domainMatches(
        domain,
        item
      )
  );
}

function hash(value) {
  return crypto
    .createHash("sha256")
    .update(String(value))
    .digest("hex")
    .slice(0, 20);
}

function normalizeTitle(
  value = ""
) {
  return fold(value)
    .replace(
      /[^a-z0-9çğıöşü\s]/gi,
      " "
    )
    .replace(/\s+/g, " ")
    .trim();
}

function titleSimilarity(
  first,
  second
) {
  const left =
    new Set(
      normalizeTitle(first)
        .split(" ")
        .filter(
          (word) =>
            word.length > 2
        )
    );

  const right =
    new Set(
      normalizeTitle(second)
        .split(" ")
        .filter(
          (word) =>
            word.length > 2
        )
    );

  if (
    !left.size ||
    !right.size
  ) {
    return 0;
  }

  const intersection =
    [...left].filter(
      (word) =>
        right.has(word)
    ).length;

  const union =
    new Set([
      ...left,
      ...right
    ]).size;

  return intersection / union;
}

function isRecent(value) {
  const date =
    new Date(value);

  if (
    Number.isNaN(
      date.getTime()
    )
  ) {
    return false;
  }

  const earliest =
    Date.now() -
    RETENTION_DAYS *
      86_400_000;

  const latest =
    Date.now() +
    3_600_000;

  return (
    date.getTime() >= earliest &&
    date.getTime() <= latest
  );
}

function extractRssSource(item) {
  const node =
    item.sourceNode ||
    item.source;

  const name =
    cleanText(
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
    domain:
      normalizeDomain(url)
  };
}

function googleNewsUrl(
  route,
  domain
) {
  const params =
    new URLSearchParams({
      q:
        `(${route.query}) ` +
        `site:${domain} ` +
        `when:${RETENTION_DAYS}d`,
      hl:
        route.language === "tr"
          ? "tr"
          : "en-US",
      gl:
        route.language === "tr"
          ? "TR"
          : "US",
      ceid:
        route.language === "tr"
          ? "TR:tr"
          : "US:en"
    });

  return (
    "https://news.google.com/" +
    "rss/search?" +
    params.toString()
  );
}

async function mapLimit(
  items,
  limit,
  worker
) {
  const results =
    new Array(items.length);

  let cursor = 0;

  async function run() {
    while (true) {
      const index =
        cursor++;

      if (
        index >= items.length
      ) {
        return;
      }

      try {
        results[index] =
          await worker(
            items[index],
            index
          );
      } catch (error) {
        results[index] = {
          __error: error
        };
      }
    }
  }

  await Promise.all(
    Array.from(
      {
        length:
          Math.min(
            limit,
            items.length
          )
      },
      run
    )
  );

  return results;
}

function deterministicEligibility(
  candidate
) {
  const text =
    `${candidate.title} ` +
    `${candidate.description}`;

  if (
    !candidate.title ||
    !isRecent(
      candidate.publishedAt
    )
  ) {
    return false;
  }

  if (
    includesAny(
      text,
      COMMON_REJECT
    )
  ) {
    return false;
  }

  switch (
    candidate.proposedCategory
  ) {
    case "Kadıköy":
      return (
        includesAny(
          text,
          KADIKOY_LOCATIONS
        ) &&
        includesAny(
          text,
          BUILT_ENVIRONMENT_TERMS
        )
      );

    case "Urban Transformation":
      return includesAny(
        text,
        URBAN_TRANSFORMATION_TERMS
      );

    case "Technical & Legal":
      if (
        !includesAny(
          text,
          TECHNICAL_TERMS
        )
      ) {
        return false;
      }

      if (
        isOfficialStaticDomain(
          candidate.sourceDomain
        ) &&
        !includesAny(
          text,
          NEWS_ACTION_TERMS
        )
      ) {
        return false;
      }

      return true;

    case "Construction":
      return includesAny(
        text,
        BUILT_ENVIRONMENT_TERMS
      );

    case "Architecture & Design":
      return (
        includesAny(
          text,
          BUILT_ENVIRONMENT_TERMS
        ) ||
        includesAny(
          text,
          [
            "design",
            "tasarım",
            "tasarim"
          ]
        )
      );

    case "Fashion & Luxury":
      return (
        includesAny(
          text,
          FASHION_QUALITY_TERMS
        ) &&
        !includesAny(
          text,
          FASHION_REJECT_TERMS
        )
      );

    case "Art & Exhibitions":
    case "Exhibitions":
    case "Galleries & Museums":
      return includesAny(
        text,
        ART_TERMS
      );

    default:
      return false;
  }
}

async function discoverOne({
  route,
  domain
}) {
  console.log(
    `Discovering ` +
    `${route.name}: ` +
    domain
  );

  try {
    const feed =
      await parser.parseURL(
        googleNewsUrl(
          route,
          domain
        )
      );

    const output = [];

    for (
      const item of
      feed.items || []
    ) {
      const publishedAt =
        item.isoDate ||
        item.pubDate;

      const title =
        cleanText(item.title);

      if (
        !title ||
        !isRecent(publishedAt)
      ) {
        continue;
      }

      const source =
        extractRssSource(item);

      const sourceDomain =
        source.domain &&
        isAllowedDomain(
          source.domain
        )
          ? source.domain
          : domain;

      if (
        !domainMatches(
          sourceDomain,
          domain
        )
      ) {
        continue;
      }

      const candidate = {
        id: hash(
          `${sourceDomain}|` +
          normalizeTitle(title)
        ),
        title,
        description:
          cleanText(
            item.contentSnippet ||
            item.content ||
            item.summary ||
            ""
          ),
        publishedAt:
          new Date(
            publishedAt
          ).toISOString(),
        googleNewsUrl:
          item.link,
        sourceName:
          source.name ||
          sourceDomain,
        sourceDomain,
        proposedCategory:
          route.category,
        discoveryRoute:
          route.name,
        originalLanguage:
          route.language
      };

      if (
        deterministicEligibility(
          candidate
        )
      ) {
        output.push(candidate);
      }
    }

    return output;
  } catch (error) {
    console.warn(
      `Discovery failed for ` +
      `${route.name}/` +
      `${domain}: ` +
      error.message
    );

    return [];
  }
}

function assignPreferredCategory(
  candidates
) {
  const priority = {
    Kadıköy: 9,
    "Urban Transformation": 8,
    "Technical & Legal": 7,
    Construction: 6,
    "Architecture & Design": 5,
    "Galleries & Museums": 4,
    Exhibitions: 3,
    "Art & Exhibitions": 2,
    "Fashion & Luxury": 1
  };

  const byId =
    new Map();

  for (
    const candidate of candidates
  ) {
    const existing =
      byId.get(candidate.id);

    if (
      !existing ||
      priority[
        candidate.proposedCategory
      ] >
        priority[
          existing.proposedCategory
        ]
    ) {
      byId.set(
        candidate.id,
        candidate
      );
    }
  }

  return [
    ...byId.values()
  ];
}

async function discoverCandidates() {
  const tasks =
    ROUTES.flatMap(
      (route) =>
        route.domains.map(
          (domain) => ({
            route,
            domain
          })
        )
    );

  const results =
    await mapLimit(
      tasks,
      RSS_CONCURRENCY,
      discoverOne
    );

  const discovered =
    assignPreferredCategory(
      results.flatMap(
        (result) =>
          Array.isArray(result)
            ? result
            : []
      )
    );

  const grouped =
    Object.fromEntries(
      CATEGORIES.map(
        (category) => [
          category,
          []
        ]
      )
    );

  for (
    const candidate of discovered
  ) {
    grouped[
      candidate.proposedCategory
    ].push(candidate);
  }

  const balanced = [];

  for (
    const category of CATEGORIES
  ) {
    grouped[category].sort(
      (first, second) =>
        new Date(
          second.publishedAt
        ) -
        new Date(
          first.publishedAt
        )
    );

    const unique = [];

    for (
      const candidate of
      grouped[category]
    ) {
      const duplicate =
        unique.some(
          (item) =>
            titleSimilarity(
              item.title,
              candidate.title
            ) >= 0.72
        );

      if (duplicate) {
        continue;
      }

      unique.push(candidate);

      if (
        unique.length >=
        MAX_CANDIDATES_PER_CATEGORY
      ) {
        break;
      }
    }

    console.log(
      `${category} ` +
      `deterministic candidates: ` +
      unique.length
    );

    balanced.push(...unique);
  }

  return balanced;
}

const REVIEW_SCHEMA = {
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
          "editorialScore",
          "technicalValue",
          "brandFit",
          "eventKey",
          "reason"
        ]
      }
    }
  },
  required: [
    "decisions"
  ]
};

const EDITORIAL_SCHEMA = {
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
  required: [
    "articles"
  ]
};

function parseJson(text) {
  let value =
    String(text || "")
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
    return JSON.parse(value);
  } catch {
    // Repair below.
  }

  const start =
    value.indexOf("{");

  const end =
    value.lastIndexOf("}");

  if (
    start >= 0 &&
    end > start
  ) {
    value =
      value.slice(
        start,
        end + 1
      );
  }

  value = value
    .replace(
      /[\u201c\u201d]/gi,
      '"'
    )
    .replace(
      /,\s*([}\]])/g,
      "$1"
    )
    .replace(
      /([,{]\s*)([A-Za-z_][A-Za-z0-9_]*)(\s*:)/g,
      '$1"$2"$3'
    )
    .replace(
      /[\u0000-\u0008\u000b\u000c\u000e-\u001f]/g,
      " "
    );

  return JSON.parse(value);
}

async function fetchWithTimeout(
  url,
  options = {},
  timeoutMs =
    REQUEST_TIMEOUT_MS
) {
  const controller =
    new AbortController();

  const timer =
    setTimeout(
      () =>
        controller.abort(),
      timeoutMs
    );

  try {
    return await fetch(
      url,
      {
        ...options,
        signal:
          controller.signal
      }
    );
  } finally {
    clearTimeout(timer);
  }
}

async function callGemini(
  prompt,
  schema,
  maxOutputTokens = 8192
) {
  const endpoint =
    "https://generativelanguage.googleapis.com/" +
    "v1beta/models/" +
    encodeURIComponent(
      GEMINI_MODEL
    ) +
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
      const response =
        await fetchWithTimeout(
          endpoint,
          {
            method: "POST",
            headers: {
              "Content-Type":
                "application/json"
            },
            body:
              JSON.stringify({
                contents: [
                  {
                    role: "user",
                    parts: [
                      {
                        text: prompt
                      }
                    ]
                  }
                ],
                generationConfig: {
                  temperature: 0.05,
                  topP: 0.8,
                  maxOutputTokens,
                  responseMimeType:
                    "application/json",
                  responseSchema:
                    schema
                }
              })
          },
          90_000
        );

      if (!response.ok) {
        const body =
          await response.text();

        const error =
          new Error(
            `Gemini API ` +
            `${response.status}: ` +
            body.slice(0, 900)
          );

        error.status =
          response.status;

        throw error;
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
          "Gemini returned an empty response"
        );
      }

      return parseJson(
        responseText
      );
    } catch (error) {
      lastError = error;

      const retryable =
        !error.status ||
        [
          429,
          500,
          502,
          503,
          504
        ].includes(
          error.status
        );

      if (
        attempt === 4 ||
        !retryable
      ) {
        break;
      }

      const delay =
        1500 *
        2 ** (attempt - 1);

      console.warn(
        `Gemini attempt ` +
        `${attempt} failed; ` +
        `retrying in ` +
        `${delay} ms`
      );

      await sleep(delay);
    }
  }

  throw lastError;
}

async function reviewCategory(
  category,
  candidates
) {
  const accepted = [];
  const batches = [];

  for (
    let index = 0;
    index < candidates.length;
    index += 14
  ) {
    batches.push(
      candidates.slice(
        index,
        index + 14
      )
    );
  }

  for (
    let index = 0;
    index < batches.length;
    index += 1
  ) {
    console.log(
      `AI review ${category}: ` +
      `${index + 1}/` +
      batches.length
    );

    const items =
      batches[index].map(
        (item) => ({
          id: item.id,
          title: item.title,
          summary:
            item.description,
          source:
            item.sourceName,
          domain:
            item.sourceDomain,
          publishedAt:
            item.publishedAt
        })
      );

    const prompt = `
You are the senior news editor for NOVA, a premium Istanbul residential developer.

Review candidates for exactly this category:

${category}

NOVA publishes restrained, authoritative, technically serious and culturally sophisticated reporting.

Reject:

- recruitment and job listings;
- tenders and procurement notices;
- advertorials and sponsored content;
- generic company promotion;
- competitor residential project promotion;
- clickbait;
- celebrity gossip;
- generic housing-market negativity;
- unrelated regional news;
- anything only loosely connected to the assigned category.

CATEGORY REQUIREMENTS

Kadıköy:
Direct built-environment relevance to Kadıköy, Bağdat Caddesi or a named Kadıköy neighbourhood is mandatory. Art events alone do not qualify. Accept local construction, urban transformation, planning, building stock, earthquake resilience, infrastructure, architecture and municipal technical decisions.

Urban Transformation:
Must directly concern risky buildings, building-stock renewal, transformation legislation, official support programmes, earthquake-oriented renewal or a substantial urban-regeneration decision in Turkey.

Technical & Legal:
Must be a genuinely recent regulation, amendment, standard, technical report, engineering study or professional development relevant to Turkish building practice. Static regulation index pages, generic legal pages, cooperative guidance, unrelated local zoning notices and e-government service pages are not news.

Construction:
Must primarily concern buildings, structural or civil engineering, concrete, foundations, façades, materials, construction methods, building technology or major infrastructure. Reject underwater habitats, semiconductor-company appointments, generic data-centre energy finance and unrelated environmental or medical research.

Fashion & Luxury:
Accept serious design, craftsmanship, heritage, exhibitions, archives, material innovation and substantive industry analysis. Reject celebrity outfits, shopping recommendations and red-carpet content.

Art, exhibitions and museums:
Require cultural significance, a respected institution, a substantive exhibition programme or serious criticism.

Do not accept an item merely to fill a quota.

Scores must be calibrated. Do not automatically assign scores above 85.

Return every supplied id exactly once.

eventKey must identify the underlying real-world event so duplicate coverage can be removed.

Return JSON only:

{
  "decisions": [
    {
      "id": "candidate-id",
      "accept": true,
      "editorialScore": 0,
      "technicalValue": 0,
      "brandFit": 0,
      "eventKey": "normalized event identity",
      "reason": "short factual reason"
    }
  ]
}

Candidates:

${JSON.stringify(items)}
`;

    const result =
      await callGemini(
        prompt,
        REVIEW_SCHEMA
      );

    const decisionMap =
      new Map(
        (
          result.decisions || []
        ).map(
          (item) => [
            item.id,
            item
          ]
        )
      );

    for (
      const candidate of
      batches[index]
    ) {
      const decision =
        decisionMap.get(
          candidate.id
        );

      if (
        !decision?.accept
      ) {
        continue;
      }

      if (
        Number(
          decision.editorialScore
        ) <
        CATEGORY_CONFIG[
          category
        ].minScore
      ) {
        continue;
      }

      if (
        Number(
          decision.brandFit
        ) < 80
      ) {
        continue;
      }

      accepted.push({
        ...candidate,
        decision
      });
    }

    await sleep(
      GEMINI_DELAY_MS
    );
  }

  accepted.sort(
    (first, second) =>
      Number(
        second.decision
          .editorialScore
      ) -
      Number(
        first.decision
          .editorialScore
      )
  );

  const unique = [];
  const sourceCounts =
    new Map();

  for (
    const item of accepted
  ) {
    const eventKey =
      normalizeTitle(
        item.decision.eventKey ||
        item.title
      );

    const duplicate =
      unique.some(
        (existing) =>
          normalizeTitle(
            existing.decision
              .eventKey ||
            existing.title
          ) === eventKey ||
          titleSimilarity(
            existing.title,
            item.title
          ) >= 0.62
      );

    if (duplicate) {
      continue;
    }

    if (
      (
        sourceCounts.get(
          item.sourceDomain
        ) || 0
      ) >= 2
    ) {
      continue;
    }

    sourceCounts.set(
      item.sourceDomain,
      (
        sourceCounts.get(
          item.sourceDomain
        ) || 0
      ) + 1
    );

    unique.push(item);

    if (
      unique.length >=
      CATEGORY_CONFIG[
        category
      ].maximum * 3
    ) {
      break;
    }
  }

  return unique;
}

async function reviewCandidates(
  candidates
) {
  const output = [];

  for (
    const category of CATEGORIES
  ) {
    const categoryCandidates =
      candidates.filter(
        (item) =>
          item.proposedCategory ===
          category
      );

    if (
      !categoryCandidates.length
    ) {
      continue;
    }

    output.push(
      ...await reviewCategory(
        category,
        categoryCandidates
      )
    );
  }

  return output;
}

const decodedGoogleUrls =
  new Map();

function googleArticleId(
  urlValue
) {
  try {
    const url =
      new URL(urlValue);

    const parts =
      url.pathname
        .split("/")
        .filter(Boolean);

    if (
      url.hostname ===
        "news.google.com" &&
      parts.length >= 2 &&
      [
        "articles",
        "read"
      ].includes(
        parts.at(-2)
      )
    ) {
      return parts.at(-1);
    }
  } catch {
    return "";
  }

  return "";
}

function parseBatchResponse(text) {
  const pieces =
    String(text)
      .replace(
        /^\)\]\}'\s*/,
        ""
      )
      .split(
        /\n(?:\n)?/
      )
      .map(
        (item) =>
          item.trim()
      )
      .filter(Boolean);

  for (
    const piece of pieces
  ) {
    if (
      !piece.startsWith("[")
    ) {
      continue;
    }

    try {
      const parsed =
        JSON.parse(piece);

      for (
        const row of
        Array.isArray(parsed)
          ? parsed
          : []
      ) {
        if (
          Array.isArray(row) &&
          row[1] === "Fbv4je"
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
      // Ignore protocol rows.
    }
  }

  return "";
}

async function decodeGoogleNewsUrl(
  sourceUrl
) {
  if (
    decodedGoogleUrls.has(
      sourceUrl
    )
  ) {
    return decodedGoogleUrls.get(
      sourceUrl
    );
  }

  const articleId =
    googleArticleId(
      sourceUrl
    );

  if (!articleId) {
    return sourceUrl;
  }

  try {
    const parameterResponse =
      await fetchWithTimeout(
        "https://news.google.com/" +
        `rss/articles/${articleId}`,
        {
          headers: {
            "User-Agent":
              "Mozilla/5.0 (Macintosh; Intel Mac OS X 10_15_7) AppleWebKit/537.36 Chrome/129 Safari/537.36",
            Accept:
              "text/html,application/xhtml+xml",
            "Accept-Language":
              "en-US,en;q=0.9"
          }
        }
      );

    if (
      !parameterResponse.ok
    ) {
      throw new Error(
        `parameter status ` +
        parameterResponse.status
      );
    }

    const $ =
      cheerio.load(
        await parameterResponse.text()
      );

    const element = $(
      "c-wiz > div[jscontroller][data-n-a-sg][data-n-a-ts]"
    ).first();

    const signature =
      element.attr(
        "data-n-a-sg"
      );

    const timestamp =
      element.attr(
        "data-n-a-ts"
      );

    if (
      !signature ||
      !timestamp
    ) {
      throw new Error(
        "decoder parameters missing"
      );
    }

    const request = [
      "Fbv4je",
      `["garturlreq",[["X","X",["X","X"],null,null,1,1,"US:en",null,1,null,null,null,null,null,0,1],"X","X",1,[1,1,1],1,1,null,0,0,null,0],"${articleId}",${timestamp},"${signature}"]`
    ];

    const response =
      await fetchWithTimeout(
        "https://news.google.com/_/DotsSplashUi/data/batchexecute",
        {
          method: "POST",
          headers: {
            "Content-Type":
              "application/x-www-form-urlencoded;charset=UTF-8",
            "User-Agent":
              "Mozilla/5.0 (Macintosh; Intel Mac OS X 10_15_7) AppleWebKit/537.36 Chrome/129 Safari/537.36",
            Origin:
              "https://news.google.com",
            Referer:
              "https://news.google.com/"
          },
          body:
            `f.req=${
              encodeURIComponent(
                JSON.stringify([
                  [request]
                ])
              )
            }`
        }
      );

    if (!response.ok) {
      throw new Error(
        `decoder status ` +
        response.status
      );
    }

    const decoded =
      parseBatchResponse(
        await response.text()
      );

    if (!decoded) {
      throw new Error(
        "decoded URL missing"
      );
    }

    decodedGoogleUrls.set(
      sourceUrl,
      decoded
    );

    return decoded;
  } catch (error) {
    console.warn(
      `Google News decode failed: ` +
      error.message
    );

    decodedGoogleUrls.set(
      sourceUrl,
      ""
    );

    return "";
  }
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

function publisherUrlValid(
  url,
  domain
) {
  return domainMatches(
    normalizeDomain(url),
    domain
  );
}

function extractPublishedDate($) {
  const candidates = [
    $(
      'meta[property="article:published_time"]'
    ).attr("content"),
    $(
      'meta[name="date"]'
    ).attr("content"),
    $(
      'meta[name="publish-date"]'
    ).attr("content"),
    $(
      "time[datetime]"
    )
      .first()
      .attr("datetime")
  ].filter(Boolean);

  for (
    const value of candidates
  ) {
    const date =
      new Date(value);

    if (
      !Number.isNaN(
        date.getTime()
      )
    ) {
      return date.toISOString();
    }
  }

  return "";
}

function extractJsonLd($) {
  let best = "";

  $(
    "script[type='application/ld+json']"
  ).each((_, node) => {
    try {
      const root =
        JSON.parse(
          $(node).html() ||
          "null"
        );

      const queue =
        Array.isArray(root)
          ? [...root]
          : [root];

      while (queue.length) {
        const item =
          queue.shift();

        if (
          !item ||
          typeof item !==
            "object"
        ) {
          continue;
        }

        if (
          typeof item.articleBody ===
            "string" &&
          item.articleBody.length >
            best.length
        ) {
          best =
            cleanText(
              item.articleBody
            );
        }

        if (
          Array.isArray(
            item["@graph"]
          )
        ) {
          queue.push(
            ...item["@graph"]
          );
        }
      }
    } catch {
      // Ignore invalid JSON-LD.
    }
  });

  return best;
}

async function extractArticle(
  candidate
) {
  try {
    const decoded =
      await decodeGoogleNewsUrl(
        candidate.googleNewsUrl
      );

    if (
      !decoded ||
      !publisherUrlValid(
        decoded,
        candidate.sourceDomain
      )
    ) {
      return null;
    }

    const response =
      await fetchWithTimeout(
        decoded,
        {
          redirect: "follow",
          headers: {
            "User-Agent":
              "Mozilla/5.0 (compatible; NOVAEditorialBot/6.0; +https://novakonut.com)",
            Accept:
              "text/html,application/xhtml+xml",
            "Accept-Language":
              "tr-TR,tr;q=0.9,en;q=0.7"
          }
        }
      );

    if (
      !response.ok ||
      !publisherUrlValid(
        response.url,
        candidate.sourceDomain
      )
    ) {
      console.warn(
        `Publisher returned ` +
        `${response.status}: ` +
        candidate.sourceDomain
      );

      return null;
    }

    const html =
      await response.text();

    const $ =
      cheerio.load(html);

    const publisherDate =
      extractPublishedDate($);

    if (
      publisherDate &&
      !isRecent(
        publisherDate
      )
    ) {
      console.warn(
        `Rejected stale ` +
        `publisher date: ` +
        candidate.title
      );

      return null;
    }

    const image =
      absoluteUrl(
        $(
          'meta[property="og:image"]'
        ).attr("content") ||
        $(
          'meta[name="twitter:image"]'
        ).attr("content") ||
        "",
        response.url
      );

    let sourceText =
      extractJsonLd($);

    $(
      "script,style,noscript,nav,footer,header,aside,form,button,iframe,svg"
    ).remove();

    const selectors = [
      "article [itemprop='articleBody']",
      "[itemprop='articleBody']",
      "article",
      ".article-body",
      ".article__body",
      ".story-body",
      ".entry-content",
      "main"
    ];

    for (
      const selector of selectors
    ) {
      const value =
        cleanText(
          $(selector)
            .first()
            .text()
        );

      if (
        value.length >
        sourceText.length
      ) {
        sourceText = value;
      }
    }

    if (
      sourceText.length <
      MIN_FULL_TEXT
    ) {
      return null;
    }

    return {
      articleUrl:
        response.url,
      image:
        image || null,
      sourceText:
        sourceText.slice(
          0,
          MAX_SOURCE_TEXT
        ),
      verifiedPublishedAt:
        publisherDate ||
        candidate.publishedAt,
      contentMode:
        "full-source"
    };
  } catch (error) {
    console.warn(
      `Extraction failed for ` +
      `${candidate.sourceDomain}: ` +
      error.message
    );

    return null;
  }
}

function metadataFallback(
  candidate
) {
  const config =
    CATEGORY_CONFIG[
      candidate.proposedCategory
    ];

  if (
    !config.allowMetadata
  ) {
    return null;
  }

  const description =
    cleanText(
      candidate.description
    );

  if (
    description.length < 120 ||
    titleSimilarity(
      candidate.title,
      description
    ) >= 0.8
  ) {
    return null;
  }

  return {
    articleUrl:
      candidate.googleNewsUrl,
    image: null,
    sourceText: [
      `Original title: ${candidate.title}`,
      `RSS summary: ${description}`,
      `Publisher: ${candidate.sourceName}`,
      `Published: ${candidate.publishedAt}`
    ].join("\n"),
    verifiedPublishedAt:
      candidate.publishedAt,
    contentMode:
      "metadata-only"
  };
}

async function extractReviewed(
  reviewed
) {
  const chosen = [];

  for (
    const category of CATEGORIES
  ) {
    const config =
      CATEGORY_CONFIG[
        category
      ];

    const categoryItems =
      reviewed
        .filter(
          (item) =>
            item.proposedCategory ===
            category
        )
        .slice(
          0,
          config.maximum * 3
        );

    const extracted =
      await mapLimit(
        categoryItems,
        EXTRACTION_CONCURRENCY,
        async (candidate) => {
          const full =
            await extractArticle(
              candidate
            );

          const content =
            full ||
            metadataFallback(
              candidate
            );

          return content
            ? {
                ...candidate,
                ...content
              }
            : null;
        }
      );

    const valid =
      extracted.filter(
        (item) =>
          item &&
          !item.__error
      );

    console.log(
      `${category} ` +
      `verified source articles: ` +
      valid.length
    );

    chosen.push(
      ...valid.slice(
        0,
        config.maximum
      )
    );
  }

  return chosen;
}

const FORBIDDEN_EDITORIAL_PHRASES = [
  "supplied information",
  "provided metadata",
  "limited source text",
  "source material",
  "according to the records",
  "this content",
  "yayıncı verilerine göre",
  "saglanan bilgiler dogrultusunda",
  "sağlanan bilgiler doğrultusunda",
  "sınırlı kaynak",
  "sinirli kaynak",
  "paylaşılan kayıtlara göre",
  "paylasilan kayitlara gore",
  "bu içerik",
  "bu icerik",
  "eldeki veriler"
];

function wordCount(value) {
  return cleanText(value)
    .split(/\s+/)
    .filter(Boolean)
    .length;
}

function editorialQuality(
  item,
  source
) {
  if (
    !item?.titleTr ||
    !item?.titleEn ||
    !item?.excerptTr ||
    !item?.excerptEn ||
    !item?.contentTr ||
    !item?.contentEn
  ) {
    return false;
  }

  const allText =
    `${item.titleTr} ` +
    `${item.titleEn} ` +
    `${item.excerptTr} ` +
    `${item.excerptEn} ` +
    `${item.contentTr} ` +
    `${item.contentEn}`;

  if (
    includesAny(
      allText,
      FORBIDDEN_EDITORIAL_PHRASES
    )
  ) {
    return false;
  }

  const minimum =
    source.contentMode ===
      "full-source"
      ? 110
      : 45;

  if (
    wordCount(
      item.contentTr
    ) < minimum ||
    wordCount(
      item.contentEn
    ) < minimum
  ) {
    return false;
  }

  if (
    wordCount(
      item.titleTr
    ) < 4 ||
    wordCount(
      item.titleEn
    ) < 4
  ) {
    return false;
  }

  return true;
}

async function writeEditorialBatch(
  batch
) {
  const input =
    batch.map(
      (item) => ({
        id: item.id,
        category:
          item.proposedCategory,
        originalTitle:
          item.title,
        source:
          item.sourceName,
        publishedAt:
          item.verifiedPublishedAt,
        contentMode:
          item.contentMode,
        sourceText:
          item.sourceText
      })
    );

  const prompt = `
You are NOVA's bilingual senior editorial desk.

Write original Turkish and English news treatments using ONLY the supplied source material.

ACCURACY

- Never invent a person, institution, number, date, location, quotation, technical conclusion or legal interpretation.
- Never convert an announcement, target or proposal into a completed fact.
- Attribute technical and legal claims to their source.
- Do not add background knowledge that is absent from the source material.
- Do not reproduce long source sentences.
- Do not praise developers, contractors or commercial brands.
- Do not mention NOVA.

TONE

- Restrained, precise and factual.
- Culturally sophisticated without sounding pretentious.
- Native professional Turkish.
- Native editorial English.
- No advertising.
- No hype.
- No clickbait.
- No clichés.
- No translationese.
- No generic AI filler.

FORBIDDEN WORKFLOW LANGUAGE

Never write:

- supplied information;
- publisher data;
- limited source text;
- provided metadata;
- according to records;
- this content;
- source material;
- sağlanan bilgiler;
- yayıncı verileri;
- sınırlı kaynak;
- paylaşılan kayıtlar;
- eldeki veriler;
- bu içerik.

Write the verified facts directly.

OUTPUT LENGTH

For full-source items:

- title: 6-15 words;
- excerpt: 25-50 words;
- content: 140-230 words.

For metadata-only items:

- title: 6-15 words;
- excerpt: 20-40 words;
- content: 55-90 words.

Use digits for measurements, dates, money and large quantities where appropriate.

Return every supplied id exactly once.

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

Sources:

${JSON.stringify(input)}
`;

  return callGemini(
    prompt,
    EDITORIAL_SCHEMA,
    8192
  );
}

async function writeEditorial(
  articles
) {
  const output = [];

  for (
    let index = 0;
    index < articles.length;
    index += 2
  ) {
    const batch =
      articles.slice(
        index,
        index + 2
      );

    console.log(
      `Bilingual writing ` +
      `${Math.floor(index / 2) + 1}/` +
      Math.ceil(
        articles.length / 2
      )
    );

    const response =
      await writeEditorialBatch(
        batch
      );

    const byId =
      new Map(
        (
          response.articles || []
        ).map(
          (item) => [
            item.id,
            item
          ]
        )
      );

    for (
      const source of batch
    ) {
      const editorial =
        byId.get(source.id);

      if (
        editorialQuality(
          editorial,
          source
        )
      ) {
        output.push({
          ...source,
          editorial
        });
      } else {
        console.warn(
          `Editorial quality rejection: ` +
          source.title
        );
      }
    }

    await sleep(
      GEMINI_DELAY_MS
    );
  }

  return output;
}

function selectFinal(articles) {
  const selected = [];
  const globalEvents =
    new Set();

  for (
    const category of CATEGORIES
  ) {
    const config =
      CATEGORY_CONFIG[
        category
      ];

    const sourceCounts =
      new Map();

    const categorySelected = [];

    const candidates =
      articles
        .filter(
          (item) =>
            item.proposedCategory ===
            category
        )
        .sort(
          (first, second) =>
            Number(
              second.decision
                .editorialScore
            ) -
            Number(
              first.decision
                .editorialScore
            )
        );

    for (
      const item of candidates
    ) {
      const eventKey =
        normalizeTitle(
          item.decision.eventKey ||
          item.title
        );

      const duplicate =
        globalEvents.has(eventKey) ||
        categorySelected.some(
          (existing) =>
            titleSimilarity(
              existing.editorial
                .titleTr,
              item.editorial
                .titleTr
            ) >= 0.58 ||
            titleSimilarity(
              existing.editorial
                .titleEn,
              item.editorial
                .titleEn
            ) >= 0.58
        );

      if (duplicate) {
        continue;
      }

      if (
        (
          sourceCounts.get(
            item.sourceDomain
          ) || 0
        ) >= 2
      ) {
        continue;
      }

      sourceCounts.set(
        item.sourceDomain,
        (
          sourceCounts.get(
            item.sourceDomain
          ) || 0
        ) + 1
      );

      globalEvents.add(eventKey);

      categorySelected.push(item);

      if (
        categorySelected.length >=
        config.maximum
      ) {
        break;
      }
    }

    selected.push(
      ...categorySelected
    );
  }

  return selected;
}

function readExistingPair() {
  try {
    const tr =
      JSON.parse(
        fs.readFileSync(
          OUTPUT_TR,
          "utf8"
        )
      );

    const en =
      JSON.parse(
        fs.readFileSync(
          OUTPUT_EN,
          "utf8"
        )
      );

    /*
     * Old broken feeds are deliberately
     * not imported into schema v6.
     */
    if (
      tr.schemaVersion !==
        SCHEMA_VERSION ||
      en.schemaVersion !==
        SCHEMA_VERSION
    ) {
      return [];
    }

    const enById =
      new Map(
        (
          en.articles || []
        ).map(
          (item) => [
            item.id,
            item
          ]
        )
      );

    return (
      tr.articles || []
    )
      .map(
        (trItem) => ({
          tr: trItem,
          en:
            enById.get(
              trItem.id
            )
        })
      )
      .filter(
        (pair) =>
          pair.en &&
          isRecent(
            pair.tr.publishedAt
          )
      );
  } catch {
    return [];
  }
}

function articlePair(item) {
  const common = {
    id: item.id,
    category:
      item.proposedCategory,
    source:
      item.sourceName,
    sourceDomain:
      item.sourceDomain,
    publishedAt:
      item.verifiedPublishedAt,
    url:
      item.articleUrl,
    image:
      item.image,
    originalTitle:
      item.title,
    originalLanguage:
      item.originalLanguage,
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

  return {
    tr: {
      ...common,
      title:
        item.editorial
          .titleTr,
      excerpt:
        item.editorial
          .excerptTr,
      content:
        item.editorial
          .contentTr
    },
    en: {
      ...common,
      title:
        item.editorial
          .titleEn,
      excerpt:
        item.editorial
          .excerptEn,
      content:
        item.editorial
          .contentEn
    }
  };
}

function mergePairs(
  newPairs,
  oldPairs
) {
  const combined = [
    ...newPairs,
    ...oldPairs
  ]
    .filter(
      (pair) =>
        pair.tr &&
        pair.en &&
        isRecent(
          pair.tr.publishedAt
        )
    )
    .sort(
      (first, second) =>
        new Date(
          second.tr.publishedAt
        ) -
        new Date(
          first.tr.publishedAt
        )
    );

  const output = [];
  const ids =
    new Set();

  const categoryCounts =
    new Map();

  for (
    const pair of combined
  ) {
    const category =
      pair.tr.category;

    if (
      !CATEGORY_CONFIG[
        category
      ] ||
      ids.has(pair.tr.id)
    ) {
      continue;
    }

    if (
      (
        categoryCounts.get(
          category
        ) || 0
      ) >=
      CATEGORY_CONFIG[
        category
      ].maximum
    ) {
      continue;
    }

    const duplicate =
      output.some(
        (existing) =>
          existing.tr.category ===
            category &&
          titleSimilarity(
            existing.tr.title,
            pair.tr.title
          ) >= 0.58
      );

    if (duplicate) {
      continue;
    }

    ids.add(pair.tr.id);

    categoryCounts.set(
      category,
      (
        categoryCounts.get(
          category
        ) || 0
      ) + 1
    );

    output.push(pair);
  }

  return output;
}

function buildFeed(
  pairs,
  language
) {
  const key =
    language === "tr"
      ? "tr"
      : "en";

  const articles =
    pairs
      .map(
        (pair) =>
          pair[key]
      )
      .sort(
        (first, second) =>
          new Date(
            second.publishedAt
          ) -
          new Date(
            first.publishedAt
          )
      );

  const categoryCounts =
    Object.fromEntries(
      CATEGORIES.map(
        (category) => [
          category,
          articles.filter(
            (item) =>
              item.category ===
              category
          ).length
        ]
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
            target:
              CATEGORY_CONFIG[
                category
              ].target,
            targetMet:
              categoryCounts[
                category
              ] >=
              CATEGORY_CONFIG[
                category
              ].target
          }
        ]
      )
    );

  return {
    status: "success",
    schemaVersion:
      SCHEMA_VERSION,
    editorialPolicy:
      "NOVA Verified Premium Editorial Feed",
    aiModel:
      GEMINI_MODEL,
    language,
    generatedAt:
      new Date().toISOString(),
    retentionDays:
      RETENTION_DAYS,
    categories:
      CATEGORIES,
    categoryCounts,
    coverage,
    total:
      articles.length,
    articles
  };
}

function writeJson(
  file,
  data
) {
  fs.mkdirSync(
    path.dirname(file),
    {
      recursive: true
    }
  );

  fs.writeFileSync(
    file,
    `${JSON.stringify(
      data,
      null,
      2
    )}\n`,
    "utf8"
  );

  console.log(
    `Wrote ${file}`
  );
}

async function main() {
  if (!GEMINI_API_KEY) {
    throw new Error(
      "GEMINI_API_KEY is missing from GitHub Actions secrets"
    );
  }

  console.log(
    `Starting NOVA v` +
    `${SCHEMA_VERSION} with ` +
    GEMINI_MODEL
  );

  const discovered =
    await discoverCandidates();

  console.log(
    `Deterministically eligible candidates: ` +
    discovered.length
  );

  if (!discovered.length) {
    throw new Error(
      "No eligible candidates were discovered; existing feeds were preserved"
    );
  }

  const reviewed =
    await reviewCandidates(
      discovered
    );

  console.log(
    `Gemini-approved candidates: ` +
    reviewed.length
  );

  if (!reviewed.length) {
    throw new Error(
      "Gemini approved no candidates; existing feeds were preserved"
    );
  }

  const extracted =
    await extractReviewed(
      reviewed
    );

  console.log(
    `Verified source articles: ` +
    extracted.length
  );

  if (!extracted.length) {
    throw new Error(
      "No source text could be verified; existing feeds were preserved"
    );
  }

  const written =
    await writeEditorial(
      extracted
    );

  const selected =
    selectFinal(written);

  console.log(
    `New publishable bilingual articles: ` +
    selected.length
  );

  if (!selected.length) {
    throw new Error(
      "No articles passed final editorial quality control; existing feeds were preserved"
    );
  }

  const merged =
    mergePairs(
      selected.map(
        articlePair
      ),
      readExistingPair()
    );

  const trFeed =
    buildFeed(
      merged,
      "tr"
    );

  const enFeed =
    buildFeed(
      merged,
      "en"
    );

  writeJson(
    OUTPUT_TR,
    trFeed
  );

  writeJson(
    OUTPUT_EN,
    enFeed
  );

  console.log(
    "Final category coverage:"
  );

  for (
    const category of CATEGORIES
  ) {
    const item =
      trFeed.coverage[
        category
      ];

    console.log(
      `${category}: ` +
      `${item.count}/` +
      `${item.target} ` +
      (
        item.targetMet
          ? "OK"
          : "NO FORCED FILL"
      )
    );
  }
}

if (
  require.main === module
) {
  main().catch(
    (error) => {
      console.error(
        "NOVA news workflow failed:",
        error
      );

      process.exitCode = 1;
    }
  );
}

module.exports = {
  cleanText,
  fold,
  deterministicEligibility,
  titleSimilarity,
  isRecent,
  buildFeed,
  mergePairs
};
