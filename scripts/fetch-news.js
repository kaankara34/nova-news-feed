const fs = require("fs");
const path = require("path");
const crypto = require("crypto");
const Parser = require("rss-parser");

const parser = new Parser({
  timeout: 25000,
  headers: {
    "User-Agent": "NOVA-Curated-News/3.0"
  },
  customFields: {
    item: ["source"]
  }
});

/*
 * ============================================================
 * GENERAL SETTINGS
 * ============================================================
 */

const RETENTION_DAYS = 15;

const CATEGORIES = [
  "Art & Exhibitions",
  "Exhibitions",
  "Galleries & Museums",
  "Architecture & Design",
  "Construction",
  "Urban Transformation",
  "Kadıköy",
  "Technical & Legal"
];

const CATEGORY_LIMITS = {
  "Art & Exhibitions": 14,
  Exhibitions: 16,
  "Galleries & Museums": 16,
  "Architecture & Design": 14,
  Construction: 10,
  "Urban Transformation": 12,
  Kadıköy: 12,
  "Technical & Legal": 10
};

const GOOGLE_NEWS_TR =
  "https://news.google.com/rss/search?hl=tr&gl=TR&ceid=TR:tr&q=";

const GOOGLE_NEWS_UK =
  "https://news.google.com/rss/search?hl=en-GB&gl=GB&ceid=GB:en&q=";

const GOOGLE_NEWS_US =
  "https://news.google.com/rss/search?hl=en-US&gl=US&ceid=US:en&q=";

const GOOGLE_NEWS_FR =
  "https://news.google.com/rss/search?hl=en&gl=FR&ceid=FR:en&q=";

const GOOGLE_NEWS_EU =
  "https://news.google.com/rss/search?hl=en&gl=DE&ceid=DE:en&q=";

function createGoogleNewsUrl(
  query,
  baseUrl = GOOGLE_NEWS_TR
) {
  return (
    baseUrl +
    encodeURIComponent(`${query} when:${RETENTION_DAYS}d`)
  );
}

/*
 * ============================================================
 * CURATED FEEDS
 * ============================================================
 *
 * Buradaki amaç internetteki bütün haberleri toplamak değil;
 * NOVA'nın kurumsal kimliğiyle uyumlu seçilmiş içerik üretmektir.
 */

const feeds = [
  /*
   * ----------------------------------------------------------
   * EXHIBITIONS
   * ----------------------------------------------------------
   */

  {
    category: "Exhibitions",
    url: createGoogleNewsUrl(
      [
        "(",
        "sergi",
        "OR retrospektif",
        "OR bienal",
        'OR "yeni sergi"',
        'OR "müze sergisi"',
        ")",
        "(",
        "site:istanbulmodern.org",
        "OR site:iksv.org",
        "OR site:arter.org.tr",
        "OR site:saltonline.org",
        "OR site:peramuzesi.org.tr",
        "OR site:sakipsabancimuzesi.org",
        "OR site:akmistanbul.gov.tr",
        ")"
      ].join(" ")
    )
  },

  {
    category: "Exhibitions",
    url: createGoogleNewsUrl(
      [
        "(",
        "exhibition",
        "OR retrospective",
        "OR biennale",
        "OR biennial",
        'OR "new exhibition"',
        ")",
        "(",
        "site:tate.org.uk",
        "OR site:royalacademy.org.uk",
        "OR site:serpentinegalleries.org",
        "OR site:barbican.org.uk",
        "OR site:frieze.com",
        ")"
      ].join(" "),
      GOOGLE_NEWS_UK
    )
  },

  {
    category: "Exhibitions",
    url: createGoogleNewsUrl(
      [
        "(",
        "exhibition",
        "OR exposition",
        "OR retrospective",
        "OR biennale",
        ")",
        "(",
        "site:louvre.fr",
        "OR site:centrepompidou.fr",
        "OR site:musee-orsay.fr",
        "OR site:fondationlouisvuitton.fr",
        "OR site:palaisdetokyo.com",
        ")"
      ].join(" "),
      GOOGLE_NEWS_FR
    )
  },

  {
    category: "Exhibitions",
    url: createGoogleNewsUrl(
      [
        "(",
        "exhibition",
        "OR retrospective",
        "OR biennial",
        'OR "new exhibition"',
        ")",
        "(",
        "site:moma.org",
        "OR site:metmuseum.org",
        "OR site:guggenheim.org",
        "OR site:whitney.org",
        "OR site:getty.edu",
        ")"
      ].join(" "),
      GOOGLE_NEWS_US
    )
  },

  /*
   * ----------------------------------------------------------
   * GALLERIES & MUSEUMS
   * ----------------------------------------------------------
   */

  {
    category: "Galleries & Museums",
    url: createGoogleNewsUrl(
      [
        "(",
        "müze",
        "OR galeri",
        'OR "müze koleksiyonu"',
        'OR "müze programı"',
        'OR "galeri sergisi"',
        'OR "kültür kurumu"',
        ")",
        "(",
        "site:istanbulmodern.org",
        "OR site:arter.org.tr",
        "OR site:saltonline.org",
        "OR site:peramuzesi.org.tr",
        "OR site:sakipsabancimuzesi.org",
        "OR site:borusancontemporary.com",
        ")"
      ].join(" ")
    )
  },

  {
    category: "Galleries & Museums",
    url: createGoogleNewsUrl(
      [
        "(",
        "museum",
        "OR gallery",
        'OR "museum collection"',
        'OR "gallery programme"',
        'OR "museum opening"',
        'OR "cultural institution"',
        ")",
        "(",
        "site:tate.org.uk",
        "OR site:vam.ac.uk",
        "OR site:nationalgallery.org.uk",
        "OR site:britishmuseum.org",
        "OR site:serpentinegalleries.org",
        ")"
      ].join(" "),
      GOOGLE_NEWS_UK
    )
  },

  {
    category: "Galleries & Museums",
    url: createGoogleNewsUrl(
      [
        "(",
        "museum",
        "OR gallery",
        'OR "museum collection"',
        'OR "museum opening"',
        ")",
        "(",
        "site:moma.org",
        "OR site:metmuseum.org",
        "OR site:guggenheim.org",
        "OR site:whitney.org",
        "OR site:artic.edu",
        "OR site:getty.edu",
        ")"
      ].join(" "),
      GOOGLE_NEWS_US
    )
  },

  {
    category: "Galleries & Museums",
    url: createGoogleNewsUrl(
      [
        "(",
        "museum",
        "OR gallery",
        "OR musée",
        "OR galerie",
        'OR "museum collection"',
        ")",
        "(",
        "site:louvre.fr",
        "OR site:centrepompidou.fr",
        "OR site:musee-orsay.fr",
        "OR site:fondationlouisvuitton.fr",
        "OR site:palaisdetokyo.com",
        ")"
      ].join(" "),
      GOOGLE_NEWS_FR
    )
  },

  /*
   * ----------------------------------------------------------
   * ART & EXHIBITIONS
   * ----------------------------------------------------------
   */

  {
    category: "Art & Exhibitions",
    url: createGoogleNewsUrl(
      [
        "(",
        '"contemporary art"',
        'OR "modern art"',
        'OR "public art"',
        'OR "art installation"',
        "OR sculpture",
        "OR photography",
        "OR biennale",
        ")",
        "(",
        "site:theartnewspaper.com",
        "OR site:artforum.com",
        "OR site:artnews.com",
        "OR site:frieze.com",
        "OR site:artreview.com",
        ")"
      ].join(" "),
      GOOGLE_NEWS_UK
    )
  },

  {
    category: "Art & Exhibitions",
    url: createGoogleNewsUrl(
      [
        "(",
        '"contemporary art"',
        'OR "modern art"',
        'OR "art installation"',
        'OR "public art"',
        'OR "art exhibition"',
        ")",
        "(",
        "site:moma.org",
        "OR site:metmuseum.org",
        "OR site:guggenheim.org",
        "OR site:artnews.com",
        ")"
      ].join(" "),
      GOOGLE_NEWS_US
    )
  },

  {
    category: "Art & Exhibitions",
    url: createGoogleNewsUrl(
      [
        "(",
        '"çağdaş sanat"',
        'OR "modern sanat"',
        'OR "sanat yerleştirmesi"',
        "OR heykel",
        "OR fotoğraf",
        "OR bienal",
        'OR "sanat etkinliği"',
        ")",
        "(",
        "site:iksv.org",
        "OR site:istanbulmodern.org",
        "OR site:arter.org.tr",
        "OR site:saltonline.org",
        "OR site:kultur.istanbul",
        ")"
      ].join(" ")
    )
  },

  /*
   * ----------------------------------------------------------
   * ARCHITECTURE & DESIGN
   * ----------------------------------------------------------
   */

  {
    category: "Architecture & Design",
    url: createGoogleNewsUrl(
      [
        "(",
        '"mimari tasarım"',
        "OR restorasyon",
        'OR "kültürel miras"',
        'OR "kamusal alan"',
        'OR "sürdürülebilir mimari"',
        'OR "adaptif yeniden kullanım"',
        'OR "tasarım kültürü"',
        ")",
        "(",
        "site:arkitera.com",
        "OR site:mimarizm.com",
        ")"
      ].join(" ")
    )
  },

  {
    category: "Architecture & Design",
    url: createGoogleNewsUrl(
      [
        "(",
        '"architectural design"',
        'OR "adaptive reuse"',
        'OR "heritage restoration"',
        'OR "public architecture"',
        'OR "sustainable architecture"',
        'OR "cultural building"',
        'OR "design culture"',
        ")",
        "(",
        "site:archdaily.com",
        "OR site:dezeen.com",
        "OR site:designboom.com",
        "OR site:domusweb.it",
        "OR site:architecturalrecord.com",
        ")"
      ].join(" "),
      GOOGLE_NEWS_UK
    )
  },

  /*
   * ----------------------------------------------------------
   * CONSTRUCTION
   *
   * Yalnızca mühendislik, teknoloji, kalite ve güvenlik.
   * Piyasa, satış ve rakip şirket haberleri alınmaz.
   * ----------------------------------------------------------
   */

  {
    category: "Construction",
    url: createGoogleNewsUrl(
      [
        "(",
        '"yapı güvenliği"',
        'OR "deprem performansı"',
        'OR "beton dayanımı"',
        'OR "taşıyıcı sistem"',
        'OR "zemin iyileştirme"',
        'OR "bina güçlendirme"',
        'OR "su yalıtımı"',
        'OR "yangın güvenliği"',
        'OR "yapı teknolojisi"',
        ")",
        "(",
        "site:csb.gov.tr",
        "OR site:imo.org.tr",
        "OR site:itu.edu.tr",
        "OR site:bogazici.edu.tr",
        "OR site:yildiz.edu.tr",
        ")"
      ].join(" ")
    )
  },

  {
    category: "Construction",
    url: createGoogleNewsUrl(
      [
        "(",
        '"structural engineering"',
        'OR "building safety"',
        'OR "seismic design"',
        'OR "concrete technology"',
        'OR "waterproofing technology"',
        'OR "fire safety"',
        'OR "building materials research"',
        ")",
        "(",
        "site:ice.org.uk",
        "OR site:istructe.org",
        "OR site:asce.org",
        "OR site:ctbuh.org",
        ")"
      ].join(" "),
      GOOGLE_NEWS_UK
    )
  },

  /*
   * ----------------------------------------------------------
   * URBAN TRANSFORMATION
   * ----------------------------------------------------------
   */

  {
    category: "Urban Transformation",
    url: createGoogleNewsUrl(
      [
        "(",
        '"kentsel dönüşüm"',
        'OR "yerinde dönüşüm"',
        'OR "riskli yapı"',
        'OR "rezerv yapı alanı"',
        'OR "yapı stoğu"',
        'OR "dönüşüm alanı"',
        ")",
        "(",
        "site:csb.gov.tr",
        "OR site:resmigazete.gov.tr",
        "OR site:ibb.istanbul",
        "OR site:kadikoy.bel.tr",
        ")"
      ].join(" ")
    )
  },

  /*
   * ----------------------------------------------------------
   * KADIKÖY
   * ----------------------------------------------------------
   */

  {
    category: "Kadıköy",
    url: createGoogleNewsUrl(
      [
        "(",
        "Kadıköy",
        "OR Feneryolu",
        "OR Caddebostan",
        "OR Göztepe",
        'OR "Bağdat Caddesi"',
        "OR Suadiye",
        "OR Erenköy",
        "OR Fenerbahçe",
        ")",
        "(",
        '"kentsel dönüşüm"',
        "OR imar",
        'OR "şehir planlama"',
        'OR "kamusal alan"',
        "OR mimarlık",
        "OR sergi",
        'OR "kültür sanat"',
        "OR müze",
        ")",
        "(",
        "site:kadikoy.bel.tr",
        "OR site:ibb.istanbul",
        ")"
      ].join(" ")
    )
  },

  /*
   * ----------------------------------------------------------
   * TECHNICAL & LEGAL
   * ----------------------------------------------------------
   */

  {
    category: "Technical & Legal",
    url: createGoogleNewsUrl(
      [
        "(",
        '"yapı yönetmeliği"',
        'OR "imar yönetmeliği"',
        'OR "deprem yönetmeliği"',
        'OR "planlı alanlar imar yönetmeliği"',
        'OR "yapı denetimi mevzuatı"',
        'OR "6306 sayılı kanun"',
        'OR "teknik şartname"',
        'OR "binaların yangından korunması"',
        ")",
        "(",
        "site:resmigazete.gov.tr",
        "OR site:mevzuat.gov.tr",
        "OR site:csb.gov.tr",
        "OR site:imo.org.tr",
        ")"
      ].join(" ")
    )
  }
];

/*
 * ============================================================
 * HARD BLOCKLIST
 * ============================================================
 */

const HARD_BLOCKED_TERMS = [
  /*
   * Recruitment
   */
  "ekip arkadaşı arıyor",
  "takım arkadaşı arıyor",
  "çalışma arkadaşı arıyor",
  "personel arıyor",
  "mimar arıyor",
  "mühendis arıyor",
  "stajyer arıyor",
  "iş ilanı",
  "iş başvurusu",
  "işe alım",
  "kariyer fırsatı",
  "açık pozisyon",
  "cv gönder",
  "now hiring",
  "job opening",
  "job vacancy",
  "career opportunity",
  "apply now",

  /*
   * Tenders and procurement
   */
  "satın alma ilanı",
  "satın alma duyurusu",
  "ihale ilanı",
  "ihale duyurusu",
  "teklif çağrısı",
  "mal alımı",
  "hizmet alımı",
  "personel alımı",
  "procurement notice",
  "invitation to tender",

  /*
   * Financial content
   */
  "pay geri alım",
  "hisse geri alım",
  "borsa istanbul",
  "halka arz",
  "temettü",
  "sermaye artırımı",
  "finansal sonuç",
  "net kar açıkladı",
  "net kâr açıkladı",
  "ciro açıkladı",
  "yatırımcı sunumu",
  "hisse senedi",
  "piyasa değeri",
  "share buyback",
  "quarterly earnings",
  "stock market",

  /*
   * Advertising and promotion
   */
  "kampanya başlattı",
  "satış kampanyası",
  "lansmanını gerçekleştirdi",
  "ürünlerini tanıttı",
  "yeni ürününü tanıttı",
  "satışa sundu",
  "ön satışa çıktı",
  "erken satış fırsatı",
  "kaçırılmayacak fırsat",
  "özel fiyatlarla",
  "indirim fırsatı",
  "yeni koleksiyon",
  "sonbahar koleksiyonu",
  "ilkbahar koleksiyonu",
  "sponsor oldu",
  "marka elçisi",

  /*
   * Corporate publicity
   */
  "stevie awards",
  "ödül kazandı",
  "ödüle layık görüldü",
  "ödülle döndü",
  "ödüllendirildi",
  "başarı ödülü",
  "en iyi şirket seçildi",
  "yılın şirketi",
  "sektör lideri",
  "marka değeri",

  /*
   * General unsuitable news
   */
  "trafik yoğunluğu",
  "trafik kazası",
  "gözaltına alındı",
  "tutuklandı",
  "cinayet",
  "silahlı saldırı",
  "magazin",
  "burç yorumları",
  "maç sonucu",
  "transfer haberi",
  "petrol fiyatı",
  "döviz kuru",
  "altın fiyatı",
  "savunma sanayi",
  "diplomasi krizi"
];

/*
 * ============================================================
 * NEGATIVE CONSTRUCTION AND PROPERTY MARKET FILTER
 * ============================================================
 *
 * Bu filtre Construction ve Urban Transformation kategorilerinde
 * sektör, konut satışı ve piyasa hakkındaki olumsuz içerikleri engeller.
 */

const NEGATIVE_CONSTRUCTION_TERMS = [
  "konut satışları düştü",
  "konut satışları azaldı",
  "konut satışları geriledi",
  "ev satışları düştü",
  "satışlarda düşüş",
  "satışlarda gerileme",
  "satışlar durdu",
  "satışlar çöktü",
  "talep düştü",
  "talep azaldı",
  "sektör daraldı",
  "sektör küçüldü",
  "sektörde kriz",
  "inşaat sektörü krizde",
  "gayrimenkul krizi",
  "konut krizi",
  "barınma krizi",
  "maliyet krizi",
  "maliyetler arttı",
  "maliyet artışı",
  "fiyatlar uçtu",
  "fiyatlar çöktü",
  "iflas etti",
  "iflas başvurusu",
  "konkordato",
  "haciz",
  "şantiyeler durdu",
  "proje durduruldu",
  "inşaat durdu",
  "mağdur etti",
  "mağduriyet",
  "dolandırıcılık",
  "skandal",
  "usulsüzlük",
  "kaçak yapı",
  "ruhsatsız yapı",
  "bina çöktü",
  "bina yıkıldı",
  "inşaat çöktü",
  "şantiye kazası",
  "iş kazası",
  "ölü",
  "yaralı",
  "can kaybı",
  "property market crash",
  "housing market crash",
  "sales decline",
  "sales dropped",
  "demand collapsed",
  "construction crisis",
  "developer bankruptcy"
];

/*
 * Rakip inşaat şirketlerinin ticari proje haberleri.
 */
const CONSTRUCTION_PROMOTION_TERMS = [
  "konut projesini tanıttı",
  "yeni projesini tanıttı",
  "projesini satışa çıkardı",
  "yeni projesine başladı",
  "temel atma töreni",
  "örnek daire",
  "satış ofisi",
  "teslimlere başladı",
  "anahtar teslimi",
  "yatırım değeri",
  "milyon dolarlık yatırım",
  "milyar liralık yatırım",
  "rezidans projesi",
  "lüks konut projesi",
  "markalı konut",
  "gayrimenkul kampanyası",
  "konut kampanyası",
  "yeni residence projesi",
  "new residential development",
  "property launch",
  "sales launch"
];

/*
 * İstenmeyen belirli şirketler veya ifadeler sonradan
 * bu listeye küçük harfle eklenebilir.
 */
const MANUAL_BLOCKLIST = [
  "albayrak beton"
];

/*
 * ============================================================
 * REQUIRED CATEGORY TERMS
 * ============================================================
 */

const REQUIRED_TERMS_BY_CATEGORY = {
  "Art & Exhibitions": [
    "çağdaş sanat",
    "modern sanat",
    "sanat eseri",
    "sanatçı",
    "sanat yerleştirmesi",
    "heykel",
    "fotoğraf",
    "bienal",
    "contemporary art",
    "modern art",
    "artwork",
    "artist",
    "art installation",
    "sculpture",
    "photography",
    "biennale",
    "biennial"
  ],

  Exhibitions: [
    "sergi",
    "retrospektif",
    "bienal",
    "sanat fuarı",
    "müze sergisi",
    "exhibition",
    "retrospective",
    "biennale",
    "biennial",
    "art fair",
    "exposition"
  ],

  "Galleries & Museums": [
    "müze",
    "galeri",
    "koleksiyon",
    "museum",
    "gallery",
    "collection",
    "cultural institution"
  ],

  "Architecture & Design": [
    "mimarlık",
    "mimari",
    "tasarım",
    "restorasyon",
    "kültürel miras",
    "kamusal alan",
    "sürdürülebilir mimari",
    "architecture",
    "architectural",
    "design",
    "restoration",
    "adaptive reuse",
    "cultural heritage",
    "public space",
    "sustainable architecture"
  ],

  Construction: [
    "yapı güvenliği",
    "deprem performansı",
    "beton dayanımı",
    "betonarme",
    "taşıyıcı sistem",
    "statik proje",
    "zemin etüdü",
    "zemin iyileştirme",
    "bina güçlendirme",
    "su yalıtımı",
    "ısı yalıtımı",
    "yangın güvenliği",
    "yapı teknolojisi",
    "yapı malzemesi",
    "mühendislik",
    "structural engineering",
    "building safety",
    "seismic design",
    "concrete technology",
    "waterproofing",
    "fire safety"
  ],

  "Urban Transformation": [
    "kentsel dönüşüm",
    "yerinde dönüşüm",
    "riskli yapı",
    "rezerv yapı alanı",
    "dönüşüm alanı",
    "yapı stoğu",
    "6306",
    "imar planı",
    "hak sahibi"
  ],

  Kadıköy: [
    "kadıköy",
    "feneryolu",
    "caddebostan",
    "göztepe",
    "bağdat caddesi",
    "suadiye",
    "erenköy",
    "bostancı",
    "kozyatağı",
    "fenerbahçe"
  ],

  "Technical & Legal": [
    "yapı yönetmeliği",
    "imar yönetmeliği",
    "deprem yönetmeliği",
    "planlı alanlar imar yönetmeliği",
    "yapı denetimi mevzuatı",
    "6306 sayılı kanun",
    "teknik şartname",
    "resmi gazete",
    "resmî gazete",
    "mevzuat",
    "yönetmelik",
    "kanun",
    "tebliğ"
  ]
};

/*
 * ============================================================
 * TRUSTED SOURCES
 * ============================================================
 */

const TRUSTED_SOURCES_BY_CATEGORY = {
  "Art & Exhibitions": [
    "iksv",
    "istanbul modern",
    "arter",
    "salt",
    "kültür istanbul",
    "tate",
    "moma",
    "metropolitan museum",
    "the met",
    "guggenheim",
    "the art newspaper",
    "artforum",
    "artnews",
    "frieze",
    "artreview"
  ],

  Exhibitions: [
    "iksv",
    "istanbul modern",
    "arter",
    "salt",
    "pera müzesi",
    "sakıp sabancı müzesi",
    "atatürk kültür merkezi",
    "akm",
    "tate",
    "royal academy",
    "serpentine",
    "barbican",
    "louvre",
    "centre pompidou",
    "musée d'orsay",
    "musee d'orsay",
    "fondation louis vuitton",
    "palais de tokyo",
    "moma",
    "museum of modern art",
    "metropolitan museum",
    "the met",
    "guggenheim",
    "whitney",
    "getty"
  ],

  "Galleries & Museums": [
    "istanbul modern",
    "arter",
    "salt",
    "pera müzesi",
    "sakıp sabancı müzesi",
    "borusan contemporary",
    "tate",
    "victoria and albert",
    "v&a",
    "national gallery",
    "british museum",
    "serpentine",
    "louvre",
    "centre pompidou",
    "musée d'orsay",
    "musee d'orsay",
    "fondation louis vuitton",
    "palais de tokyo",
    "moma",
    "museum of modern art",
    "metropolitan museum",
    "the met",
    "guggenheim",
    "whitney",
    "art institute of chicago",
    "getty"
  ],

  "Architecture & Design": [
    "arkitera",
    "mimarizm",
    "archdaily",
    "dezeen",
    "designboom",
    "domus",
    "architectural record"
  ],

  Construction: [
    "çevre şehircilik",
    "inşaat mühendisleri odası",
    "imo",
    "istanbul teknik üniversitesi",
    "itu",
    "boğaziçi üniversitesi",
    "bogazici",
    "yıldız teknik üniversitesi",
    "yildiz",
    "institution of civil engineers",
    "institution of structural engineers",
    "istructe",
    "asce",
    "ctbuh"
  ],

  "Urban Transformation": [
    "çevre şehircilik",
    "resmi gazete",
    "resmî gazete",
    "istanbul büyükşehir belediyesi",
    "ibb",
    "kadıköy belediyesi"
  ],

  Kadıköy: [
    "kadıköy belediyesi",
    "istanbul büyükşehir belediyesi",
    "ibb"
  ],

  "Technical & Legal": [
    "resmi gazete",
    "resmî gazete",
    "mevzuat",
    "çevre şehircilik",
    "inşaat mühendisleri odası",
    "imo"
  ]
};

/*
 * ============================================================
 * TEXT HELPERS
 * ============================================================
 */

function cleanText(value = "") {
  return String(value)
    .replace(/<script[\s\S]*?<\/script>/gi, " ")
    .replace(/<style[\s\S]*?<\/style>/gi, " ")
    .replace(/<[^>]+>/g, " ")
    .replace(/&nbsp;/gi, " ")
    .replace(/&amp;/gi, "&")
    .replace(/&quot;/gi, '"')
    .replace(/&#39;/gi, "'")
    .replace(/&apos;/gi, "'")
    .replace(/&lt;/gi, "<")
    .replace(/&gt;/gi, ">")
    .replace(/\s+/g, " ")
    .trim();
}

function normalizeForFiltering(value = "") {
  return cleanText(value)
    .normalize("NFD")
    .replace(/[\u0300-\u036f]/g, "")
    .replace(/ı/g, "i")
    .toLowerCase()
    .trim();
}

function containsAny(value, terms = []) {
  const normalizedValue = normalizeForFiltering(value);

  return terms.some((term) =>
    normalizedValue.includes(
      normalizeForFiltering(term)
    )
  );
}

/*
 * ============================================================
 * RSS ITEM HELPERS
 * ============================================================
 */

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
  const titleParts = title.split(" - ");

  if (titleParts.length > 1) {
    return titleParts[titleParts.length - 1].trim();
  }

  return "";
}

function removeSourceFromTitle(title, source) {
  const cleanedTitle = cleanText(title);

  if (!source) {
    return cleanedTitle;
  }

  const suffix = ` - ${source}`;

  if (cleanedTitle.endsWith(suffix)) {
    return cleanedTitle
      .slice(0, -suffix.length)
      .trim();
  }

  return cleanedTitle;
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

  const parsedDate = new Date(dateValue);

  if (Number.isNaN(parsedDate.getTime())) {
    return null;
  }

  return parsedDate.toISOString();
}

function createArticleId(title, source, url) {
  return crypto
    .createHash("sha256")
    .update(`${title}|${source}|${url}`)
    .digest("hex")
    .slice(0, 20);
}

function createDeduplicationKey(article) {
  return normalizeForFiltering(
    `${article.title}|${article.source}`
  );
}

/*
 * ============================================================
 * EDITORIAL FILTERS
 * ============================================================
 */

function hasAcceptableTitle(article) {
  const title = cleanText(article.title);

  if (title.length < 18 || title.length > 190) {
    return false;
  }

  const letters = title.replace(
    /[^A-Za-zÇĞİÖŞÜçğıöşü]/g,
    ""
  );

  if (
    letters.length > 15 &&
    letters === letters.toLocaleUpperCase("tr-TR")
  ) {
    return false;
  }

  return true;
}

function hasTrustedSource(article) {
  const trustedSources =
    TRUSTED_SOURCES_BY_CATEGORY[article.category] || [];

  if (trustedSources.length === 0) {
    return false;
  }

  return containsAny(article.source, trustedSources);
}

function hasRequiredCategorySubject(article) {
  const requiredTerms =
    REQUIRED_TERMS_BY_CATEGORY[article.category] || [];

  const searchableText =
    `${article.title} ${article.description}`;

  return containsAny(searchableText, requiredTerms);
}

function hasBlockedContent(article) {
  const searchableText = [
    article.title,
    article.description,
    article.source
  ].join(" ");

  if (containsAny(searchableText, HARD_BLOCKED_TERMS)) {
    return true;
  }

  if (containsAny(searchableText, MANUAL_BLOCKLIST)) {
    return true;
  }

  if (
    article.category === "Construction" ||
    article.category === "Urban Transformation"
  ) {
    if (
      containsAny(
        searchableText,
        NEGATIVE_CONSTRUCTION_TERMS
      )
    ) {
      return true;
    }

    if (
      containsAny(
        searchableText,
        CONSTRUCTION_PROMOTION_TERMS
      )
    ) {
      return true;
    }
  }

  return false;
}

function passesEditorialPolicy(article) {
  if (!hasAcceptableTitle(article)) {
    return false;
  }

  if (hasBlockedContent(article)) {
    return false;
  }

  if (!hasTrustedSource(article)) {
    return false;
  }

  if (!hasRequiredCategorySubject(article)) {
    return false;
  }

  return true;
}

/*
 * ============================================================
 * FETCH
 * ============================================================
 */

async function fetchFeed(feedDefinition) {
  try {
    console.log(
      `Fetching category: ${feedDefinition.category}`
    );

    const result = await parser.parseURL(
      feedDefinition.url
    );

    return result.items.map((item) => {
      const source = extractSource(item);

      const title = removeSourceFromTitle(
        item.title || "",
        source
      );

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
        ).slice(0, 360),
        category: feedDefinition.category,
        source,
        publishedAt,
        url,
        image: null
      };
    });
  } catch (error) {
    console.error(
      `Feed failed: ${feedDefinition.category}`,
      error.message
    );

    return [];
  }
}

/*
 * ============================================================
 * FILTERING
 * ============================================================
 */

function filterRecentArticles(articles) {
  const cutoffDate = new Date();

  cutoffDate.setUTCDate(
    cutoffDate.getUTCDate() - RETENTION_DAYS
  );

  return articles.filter((article) => {
    if (
      !article.title ||
      !article.source ||
      !article.url ||
      !article.publishedAt
    ) {
      return false;
    }

    const publicationDate = new Date(
      article.publishedAt
    );

    if (Number.isNaN(publicationDate.getTime())) {
      return false;
    }

    if (publicationDate < cutoffDate) {
      return false;
    }

    return passesEditorialPolicy(article);
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

    const categoryLimit =
      CATEGORY_LIMITS[article.category] || 10;

    if (currentCount >= categoryLimit) {
      return false;
    }

    categoryCounts.set(
      article.category,
      currentCount + 1
    );

    return true;
  });
}

function calculateCategoryCounts(articles) {
  const counts = {};

  for (const category of CATEGORIES) {
    counts[category] = 0;
  }

  for (const article of articles) {
    if (
      Object.prototype.hasOwnProperty.call(
        counts,
        article.category
      )
    ) {
      counts[article.category] += 1;
    }
  }

  return counts;
}

/*
 * ============================================================
 * MAIN
 * ============================================================
 */

async function main() {
  console.log(
    "Starting NOVA curated editorial news update..."
  );

  const feedResults = await Promise.all(
    feeds.map(fetchFeed)
  );

  const collectedArticles = feedResults.flat();

  console.log(
    `Collected before editorial filtering: ${collectedArticles.length}`
  );

  const approvedArticles =
    filterRecentArticles(collectedArticles);

  console.log(
    `Approved after editorial filtering: ${approvedArticles.length}`
  );

  const uniqueArticles =
    removeDuplicates(approvedArticles);

  uniqueArticles.sort(
    (firstArticle, secondArticle) =>
      new Date(secondArticle.publishedAt).getTime() -
      new Date(firstArticle.publishedAt).getTime()
  );

  const finalArticles =
    limitArticlesByCategory(uniqueArticles);

  const categoryCounts =
    calculateCategoryCounts(finalArticles);

  const output = {
    status: "success",
    editorialPolicy: "NOVA Curated Editorial Feed",
    generatedAt: new Date().toISOString(),
    retentionDays: RETENTION_DAYS,
    categories: CATEGORIES,
    categoryCounts,
    total: finalArticles.length,
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

  console.log("");
  console.log("NOVA news feed generated successfully.");
  console.log(`Total approved: ${finalArticles.length}`);

  for (const category of CATEGORIES) {
    console.log(
      `${category}: ${categoryCounts[category]}`
    );
  }

  console.log(`Output: ${outputFile}`);
}

main().catch((error) => {
  console.error(
    "NOVA news feed generation failed:",
    error
  );

  process.exit(1);
});
