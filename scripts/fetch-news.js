const fs = require("fs");
const path = require("path");
const crypto = require("crypto");
const Parser = require("rss-parser");

const parser = new Parser({
  timeout: 20000,
  headers: {
    "User-Agent": "NOVA-News-Feed/1.0"
  },
  customFields: {
    item: ["source"]
  }
});

const RETENTION_DAYS = 15;
const MAX_ARTICLES_PER_CATEGORY = 25;

const GOOGLE_NEWS_BASE =
  "https://news.google.com/rss/search?hl=tr&gl=TR&ceid=TR:tr&q=";

function googleNewsFeed(query) {
  return GOOGLE_NEWS_BASE + encodeURIComponent(query);
}

/*
 * Haber kaynaklarını kontrollü tutmak için aramalar güvenilir
 * ve kurumsal alan adlarıyla sınırlandırılmıştır.
 */
const feeds = [
  {
    category: "Construction",
    url: googleNewsFeed(
      [
        '("inşaat sektörü" OR "yapı güvenliği" OR beton OR deprem)',
        "(",
        "site:csb.gov.tr",
        "OR site:imo.org.tr",
        "OR site:itu.edu.tr",
        "OR site:bogazici.edu.tr",
        "OR site:aa.com.tr",
        "OR site:arkitera.com",
        ")"
      ].join(" ")
    )
  },
  {
    category: "Urban Transformation",
    url: googleNewsFeed(
      [
        '("kentsel dönüşüm" OR "riskli yapı" OR "yerinde dönüşüm")',
        "(",
        "site:csb.gov.tr",
        "OR site:ibb.istanbul",
        "OR site:kadikoy.bel.tr",
        "OR site:aa.com.tr",
        ")"
      ].join(" ")
    )
  },
  {
    category: "Kadıköy",
    url: googleNewsFeed(
      [
        "(Kadıköy OR Feneryolu OR Caddebostan OR Göztepe",
        'OR "Bağdat Caddesi")',
        "(",
        "site:kadikoy.bel.tr",
        "OR site:ibb.istanbul",
        "OR site:aa.com.tr",
        ")"
      ].join(" ")
    )
  },
  {
    category: "Architecture",
    url: googleNewsFeed(
      [
        "(mimarlık OR architecture OR tasarım)",
        "(",
        "site:arkitera.com",
        "OR site:mimarizm.com",
        "OR site:itu.edu.tr",
        "OR site:bogazici.edu.tr",
        ")"
      ].join(" ")
    )
  },
  {
    category: "Art & Exhibitions",
    url: googleNewsFeed(
      [
        '(İstanbul AND (sanat OR sergi OR bienal OR müze))',
        "(",
        "site:iksv.org",
        "OR site:istanbulmodern.org",
        "OR site:akmistanbul.gov.tr",
        "OR site:kultur.istanbul",
        "OR site:saltonline.org",
        ")"
      ].join(" ")
    )
  }
];

function cleanText(value = "") {
  return String(value)
    .replace(/<script[\s\S]*?<\/script>/gi, " ")
    .replace(/<style[\s\S]*?<\/style>/gi, " ")
    .replace(/<[^>]+>/g, " ")
    .replace(/&nbsp;/gi, " ")
    .replace(/&amp;/gi, "&")
    .replace(/&quot;/gi, '"')
    .replace(/&#39;/gi, "'")
    .replace(/&lt;/gi, "<")
    .replace(/&gt;/gi, ">")
    .replace(/\s+/g, " ")
    .trim();
}

function extractSource(item) {
  if (typeof item.source === "string") {
    return cleanText(item.source);
  }

  if (item.source && typeof item.source === "object") {
    return cleanText(
      item.source._ ||
      item.source.name ||
      item.source.title ||
      ""
    );
  }

  const title = cleanText(item.title);
  const parts = title.split(" - ");

  if (parts.length > 1) {
    return parts[parts.length - 1].trim();
  }

  return "";
}

function removeSourceFromTitle(title, source) {
  const cleanTitle = cleanText(title);

  if (!source) {
    return cleanTitle;
  }

  const suffix = ` - ${source}`;

  if (cleanTitle.endsWith(suffix)) {
    return cleanTitle.slice(0, -suffix.length).trim();
  }

  return cleanTitle;
}

function normalizeDate(item) {
  const dateValue =
    item.isoDate ||
    item.pubDate ||
    item.published ||
    item.updated ||
    null;

  if (!dateValue) {
    return null;
  }

  const date = new Date(dateValue);

  if (Number.isNaN(date.getTime())) {
    return null;
  }

  return date.toISOString();
}

function createArticleId(title, source, url) {
  return crypto
    .createHash("sha256")
    .update(`${title}|${source}|${url}`)
    .digest("hex")
    .slice(0, 20);
}

function createDeduplicationKey(article) {
  return `${article.title}|${article.source}`
    .toLocaleLowerCase("tr-TR")
    .replace(/[^\p{L}\p{N}]+/gu, " ")
    .trim();
}

async function fetchFeed(feedDefinition) {
  try {
    console.log(`Fetching: ${feedDefinition.category}`);

    const result = await parser.parseURL(feedDefinition.url);

    return result.items.map((item) => {
      const source = extractSource(item);
      const title = removeSourceFromTitle(item.title, source);
      const publishedAt = normalizeDate(item);
      const url = item.link || item.guid || "";

      return {
        id: createArticleId(title, source, url),
        title,
        description: cleanText(
          item.contentSnippet ||
          item.content ||
          item.summary ||
          ""
        ).slice(0, 320),
        category: feedDefinition.category,
        source,
        publishedAt,
        url,
        image: null
      };
    });
  } catch (error) {
    console.error(
      `Could not fetch ${feedDefinition.category}:`,
      error.message
    );

    /*
     * Bir kaynak çalışmazsa bütün Action başarısız olmaz.
     * Diğer kategoriler işlenmeye devam eder.
     */
    return [];
  }
}

function filterRecentArticles(articles) {
  const cutoff = new Date();

  cutoff.setUTCDate(cutoff.getUTCDate() - RETENTION_DAYS);

  return articles.filter((article) => {
    if (
      !article.title ||
      !article.url ||
      !article.publishedAt
    ) {
      return false;
    }

    const publicationDate = new Date(article.publishedAt);

    return (
      !Number.isNaN(publicationDate.getTime()) &&
      publicationDate >= cutoff
    );
  });
}

function removeDuplicates(articles) {
  const uniqueArticles = new Map();

  for (const article of articles) {
    const key = createDeduplicationKey(article);

    if (!uniqueArticles.has(key)) {
      uniqueArticles.set(key, article);
    }
  }

  return Array.from(uniqueArticles.values());
}

function limitArticlesByCategory(articles) {
  const categoryCounts = new Map();

  return articles.filter((article) => {
    const currentCount =
      categoryCounts.get(article.category) || 0;

    if (currentCount >= MAX_ARTICLES_PER_CATEGORY) {
      return false;
    }

    categoryCounts.set(
      article.category,
      currentCount + 1
    );

    return true;
  });
}

async function main() {
  const feedResults = await Promise.all(
    feeds.map(fetchFeed)
  );

  const collectedArticles = feedResults.flat();

  const recentArticles =
    filterRecentArticles(collectedArticles);

  const uniqueArticles =
    removeDuplicates(recentArticles);

  uniqueArticles.sort(
    (first, second) =>
      new Date(second.publishedAt).getTime() -
      new Date(first.publishedAt).getTime()
  );

  const finalArticles =
    limitArticlesByCategory(uniqueArticles);

  const categoryCounts = finalArticles.reduce(
    (counts, article) => {
      counts[article.category] =
        (counts[article.category] || 0) + 1;

      return counts;
    },
    {}
  );

  const output = {
    status: "success",
    generatedAt: new Date().toISOString(),
    retentionDays: RETENTION_DAYS,
    total: finalArticles.length,
    categories: categoryCounts,
    articles: finalArticles
  };

  const outputDirectory = path.join(
    process.cwd(),
    "data"
  );

  const outputFile = path.join(
    outputDirectory,
    "news.json"
  );

  fs.mkdirSync(outputDirectory, {
    recursive: true
  });

  fs.writeFileSync(
    outputFile,
    JSON.stringify(output, null, 2),
    "utf8"
  );

  console.log(
    `News feed successfully generated: ${finalArticles.length} articles`
  );

  console.log(`Output file: ${outputFile}`);
}

main().catch((error) => {
  console.error("News feed generation failed:", error);
  process.exit(1);
});