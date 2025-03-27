#!/bin/bash

# Load environment variables from .env file
if [ -f .env ]; then
    export $(cat .env | xargs)
fi

# Check for required environment variables
if [ -z "$OPENAI_API_KEY" ]; then
    echo "Error: OPENAI_API_KEY environment variable is required"
    exit 1
fi

if [ -z "$SUPABASE_KEY" ]; then
    echo "Error: SUPABASE_KEY environment variable is required"
    exit 1
fi

# Check command line arguments
if [ "$1" == "interactive" ]; then
    echo "Starting interactive sales analysis..."
    node ask_sales.js
else
    # Run the standard analysis
    echo "Running standard analysis..."
    node analyze_data.js
fi 