# AI Chat Features

The AI Chat in Nomie provides intelligent assistance for tracking, data entry, and nutrition lookup.

## Product Nutrition Search

Search nutrition databases directly from the AI chat to find products and automatically create trackers for macros.

### How to Use

Type any of these commands followed by the product name:

- `lookup [product name]`
- `search [product name]`
- `find [product name]`
- `search for [product name]`
- `look up [product name]`

**Examples:**

- `lookup Monster Zero Ultra`
- `search greek yogurt`
- `find protein bar`

### What Happens

1. **Multi-Provider Search**: The system searches across three nutrition databases:
   - OpenFoodFacts (primary)
   - Nutritionix (secondary)
   - USDA (tertiary)

2. **Smart Cascade**: Searches continue across providers until at least 3 results are found, or all providers have been tried.

3. **Timeout Protection**: Each provider has a 10-second timeout to ensure responsiveness.

4. **Deduplication**: Results are automatically deduplicated based on product name and brand.

5. **Top Results**: You'll see up to 5 of the best matching products.

### Selecting a Product

1. Click on a product from the search results
2. Confirm the serving size and quantity
3. Trackers are automatically created for:
   - Calories
   - Protein
   - Carbohydrates
   - Fat
   - Any other available nutrients

### Tips

- Be specific with product names for better results (e.g., "Monster Zero Ultra" vs just "Monster")
- Include brand names when possible (e.g., "Chobani Greek Yogurt")
- If no exact match is found, the system will show similar products

### Supported Keywords

The following keywords trigger product search:
- `lookup`
- `search`
- `find`
- `search for`
- `look up`

### Quantity Support

You can specify serving quantities:
- `lookup protein bar 2 servings`
- `find greek yogurt 1.5 servings`

The quantity will be applied when creating the log entry.

## Barcode Scanning

For mobile devices, you can also use barcode scanning to look up products:

1. Type `scan` or `scan barcode` in the chat
2. Follow the camera permission prompts
3. Scan the product barcode
4. Confirm the product details

## Additional AI Chat Features

The AI Chat also supports:
- Natural language tracking (`I walked 5 miles`)
- Tracker creation (`add a tracker for meditation`)
- Data entry (`log #mood(8)`)
- Questions about your data (`How many miles did I walk last week?`)

---

For technical details about the product search implementation, see [Product Search Design](plans/2026-01-15-product-search-design.md).
