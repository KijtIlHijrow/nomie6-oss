const appConfig = {
  primary_color: '#07B2F5',
  green_color: '#48bb78',
  red_color: '#f56565',
  storage_engine: 'local', // local or blockstack
  book_time_format: 'YYYY-w', // Careful changing this!! Its how all records are referenced. Changing it breaks everything.
  book_time_unit: 'week', // SERIOUSLY!
  data_root: 'data',
  book_root: 'data/books',
  always_locate_key: 'always-locate',
  dark_mode_key: 'dark-mode',
  theme_key: 'theme',
  support_email: 'dailynomie@gmail.com',
  support_contact: 'Email Support',
  messages_url: 'https://s3.amazonaws.com/cdn.nomie.app/messages/messages.json',
  s3providersLink: "https://spectacular-collard-13a.notion.site/S3-Storage-Providers-fa4888f87e964ffaabbe113c1ede8f83",
  apiDocumentation: "https://spectacular-collard-13a.notion.site/Nomie-API-4c29294776524e84bdafed6251abb20c",

  positivity: [
    { emoji: '🔴', label: 'Awful', score: -2 },
    { emoji: '🟠', label: 'Not Good', score: -1 },
    { emoji: 'Ⓞ', label: 'Neutral', score: 0 },
    { emoji: '🟢', label: 'Good', score: 1 },
    { emoji: '💚', label: 'Great', score: 2 },
  ] as Array<PositivityType>,

  // AI Query System Configuration
  ai: {
    enabled: true,
    features: {
      intentFallback: true,        // Use AI when regex patterns fail to classify intent
      trackerSuggestions: true,    // AI suggests tracker config (type, UOM, math)
      timeParsing: true,           // Parse "last week", "yesterday" into date ranges
      valueExtraction: true,       // Interpret "a bunch", "a lot" as numbers
    },
    timeouts: {
      intentDetection: 5000,       // 5s - quick decision needed
      trackerConfig: 8000,         // 8s - user filling form, less urgent
      timeRange: 5000,             // 5s - part of query processing
      valueExtraction: 5000,       // 5s - user waiting for response
    },
    cache: {
      enabled: true,
      ttlMs: 300000,               // 5 minutes
    },
  },

  // Nutrition Tracking Configuration
  nutritionApis: {
    enabled: true,
    primaryProvider: 'openfoodfacts' as 'openfoodfacts' | 'nutritionix' | 'usda',

    // Nutritionix credentials (optional - required if primaryProvider is 'nutritionix')
    nutritionixAppId: '',
    nutritionixApiKey: '',
    // Get free API key (500 requests/day): https://www.nutritionix.com/business/api

    // Behaviour settings
    autoCreateTrackers: true,      // Auto-create #calories, #protein, etc. on first scan
    trackMicronutrients: true,     // Track vitamins, minerals, etc. (not just macros)
    cacheExpiry: 30 * 24 * 60 * 60 * 1000, // 30 days in milliseconds

    // Rate limiting
    maxApiCallsPerMinute: 30,

    // Contribution settings
    contributeToOpenFoodFacts: true, // Default checkbox state for contributing missing products
  },
}

export type PositivityType = {
  emoji: string
  label: string
  score: number
}

export { appConfig }
export default appConfig
