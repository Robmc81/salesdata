# IBM Sales Data Analysis

This repository contains scripts for analyzing IBM sales data using OpenAI. The application provides both direct querying capabilities and AI-powered analysis of the sales territory data.

## Files

- `ask_sales.js` - Interactive query and analysis tool
- `convert_csv.js` - Script to convert CSV data to JSON format
- `analyze_data.js` - Main analysis script that processes sales data
- `run_analysis.sh` - Shell script to run the analysis

## Setup

1. Install dependencies:
```bash
npm install @supabase/supabase-js openai csv-parse dotenv
```

2. Set up environment variables in `.env`:
```
OPENAI_API_KEY='your-openai-api-key'
```

3. Convert your CSV data to JSON format:
```bash
node convert_csv.js
```

## Running the Application

### Interactive Mode
```bash
node ask_sales.js
```

### Non-Interactive Mode (Piping)
```bash
echo "your query" | node ask_sales.js
```

## Query Syntax

### Basic Queries
1. Field-Value Pairs:
```
field:value
```
Example: `city:ALPHARETTA`

2. Alternative Syntax:
```
field=value
```
Example: `name=ZYCHOS`

3. Space-Separated:
```
field value
```
Example: `sector CommCSI`

### AI Analysis
Prefix any query with "analyze:" to get AI-powered insights:
```
analyze:field:value
```
Example: `analyze:sector:Industrial`

### Common Fields
- `name` - Company name
- `city` - City location
- `state` - State location
- `sector` - Business sector
- `tech_client` - Tech client status
- `coverage` or `coverage_name` - Coverage territory
- `industry_description` - Industry
- `sub_industry_description` - Sub-industry
- `branch_description` - Branch
- `sub_branch_description` - Sub-branch

### Special Commands
- `show fields` - Lists all available fields with descriptions
- `exit` - Exits the program

## Examples

### Basic Queries
```
city:ALPHARETTA
sector:CommCSI
tech_client:Potential
coverage:"US  082 GA  DSS Territory"
```

### AI Analysis
```
analyze:sector:Industrial
analyze:coverage:"US  082 GA  DSS Territory"
analyze:tech_client:Potential
```

### Natural Language Queries
```
show me companies in US  082 GA  DSS Territory coverage
find companies with revenue over 100000
companies in Industrial sector
```

## Output Format

### Regular Queries
The output includes:
- Summary statistics (total customers, revenue, etc.)
- Customer details including:
  - Basic information (name, location)
  - Coverage information
  - Revenue data
  - Product usage
  - Growth metrics

### AI Analysis
The analysis provides:
1. Revenue Analysis
   - Revenue trends
   - Growth patterns
   - Year-over-year comparisons
2. Customer Segmentation
   - Sector breakdown
   - Tech client status distribution
3. Product Analysis
   - Top products by usage
   - Product adoption patterns
4. Key Insights and Recommendations
   - Opportunities
   - Risks
   - Strategic recommendations

## Security Note

This repository uses environment variables for sensitive credentials. Make sure to:
1. Never commit actual API keys to the repository
2. Set up the required environment variables before running the scripts
3. Use a `.env` file for local development (but don't commit it) 