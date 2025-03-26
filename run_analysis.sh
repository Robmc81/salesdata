#!/bin/bash

# Check for required environment variables
if [ -z "$OPENAI_API_KEY" ]; then
    echo "Error: OPENAI_API_KEY environment variable is required"
    exit 1
fi

if [ -z "$SUPABASE_KEY" ]; then
    echo "Error: SUPABASE_KEY environment variable is required"
    exit 1
fi

# Run the top clients analysis
node analyze_top_clients.js

# Run the comprehensive analysis
node analyze_data.js 