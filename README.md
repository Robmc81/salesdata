# IBM Sales Data Analysis

This repository contains scripts for analyzing IBM sales data using Supabase and OpenAI.

## Files

- `analyze_data.js` - Main analysis script that processes sales data and generates insights
- `run_analysis.sh` - Shell script to run the analysis

## Setup

1. Install dependencies:
```bash
npm install @supabase/supabase-js openai
```

2. Set up environment variables:
```bash
export OPENAI_API_KEY='your-openai-api-key'
export SUPABASE_KEY='your-supabase-key'
export SUPABASE_URL='your-supabase-url'  # Optional, defaults to project URL
```

## Running the Analysis

```bash
./run_analysis.sh
```

The analysis will generate two files:
- `analysis_results.md` - Overall market analysis
- `top_clients_analysis.md` - Detailed analysis of top clients

## Features

- Revenue analysis by client
- Sector distribution analysis
- Product adoption tracking
- Growth metrics calculation
- Strategic recommendations using AI

## Security Note

This repository uses environment variables for sensitive credentials. Make sure to:
1. Never commit actual API keys to the repository
2. Set up the required environment variables before running the scripts
3. Use a `.env` file for local development (but don't commit it) 