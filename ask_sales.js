const { createClient } = require('@supabase/supabase-js');
const OpenAI = require('openai');
const readline = require('readline');

// Configuration
const supabaseUrl = process.env.SUPABASE_URL || 'https://nyuhfiajymtbkaabezoc.supabase.co';
const supabaseKey = process.env.SUPABASE_KEY;

if (!supabaseKey) {
    console.error('Error: SUPABASE_KEY environment variable is required');
    process.exit(1);
}

// Initialize clients
const supabase = createClient(supabaseUrl, supabaseKey);
const openai = new OpenAI({
    apiKey: process.env.OPENAI_API_KEY
});

// Create readline interface
const rl = readline.createInterface({
    input: process.stdin,
    output: process.stdout
});

async function fetchSalesData() {
    try {
        const { data, error } = await supabase
            .from('atlgams')
            .select('*')
            .order('total_ibm_rev_2024', { ascending: false });

        if (error) {
            console.error('Error fetching data:', error);
            return null;
        }

        return {
            rawData: data,
            summary: {
                totalCustomers: data.length,
                totalRevenue: {
                    2024: data.reduce((sum, c) => sum + (Number(c.total_ibm_rev_2024) || 0), 0),
                    2023: data.reduce((sum, c) => sum + (Number(c.total_ibm_rev_2023) || 0), 0),
                    2022: data.reduce((sum, c) => sum + (Number(c.total_ibm_rev_2022) || 0), 0)
                },
                sectors: Object.entries(
                    data.reduce((acc, curr) => {
                        if (curr.sector) {
                            acc[curr.sector] = (acc[curr.sector] || 0) + 1;
                        }
                        return acc;
                    }, {})
                ).map(([sector, count]) => ({
                    sector,
                    count,
                    percentage: ((count / data.length) * 100).toFixed(2)
                })),
                products: {
                    watsonx: data.filter(c => c.watsonx_ai).length,
                    redHat: data.filter(c => c.red_hat_2024).length,
                    cloud: data.filter(c => c.cloud_platform_paas_2024).length,
                    automation: data.filter(c => c.automation_2024).length,
                    security: data.filter(c => c.security_2024).length
                }
            }
        };
    } catch (error) {
        console.error('Error:', error);
        return null;
    }
}

function getRelevantData(salesData, question) {
    const questionLower = question.toLowerCase();
    const relevantData = {
        summary: salesData.summary
    };

    // If asking about specific customers
    if (questionLower.includes('customer') || 
        questionLower.includes('client') || 
        questionLower.includes('revenue') ||
        questionLower.includes('top')) {
        relevantData.topCustomers = salesData.rawData
            .slice(0, 20)
            .map(c => ({
                name: c.urn_name,
                revenue2024: c.total_ibm_rev_2024,
                revenue2023: c.total_ibm_rev_2023,
                sector: c.sector
            }));
    }

    // If asking about sectors
    if (questionLower.includes('sector') || 
        questionLower.includes('industry') || 
        questionLower.includes('distribution')) {
        relevantData.sectorDetails = Object.entries(
            salesData.rawData.reduce((acc, curr) => {
                if (curr.sector) {
                    if (!acc[curr.sector]) {
                        acc[curr.sector] = {
                            count: 0,
                            revenue2024: 0,
                            revenue2023: 0
                        };
                    }
                    acc[curr.sector].count++;
                    acc[curr.sector].revenue2024 += Number(curr.total_ibm_rev_2024) || 0;
                    acc[curr.sector].revenue2023 += Number(curr.total_ibm_rev_2023) || 0;
                }
                return acc;
            }, {})
        ).map(([sector, data]) => ({
            sector,
            ...data,
            growth: ((data.revenue2024 - data.revenue2023) / data.revenue2023 * 100).toFixed(2)
        }));
    }

    // If asking about products
    if (questionLower.includes('product') || 
        questionLower.includes('watsonx') || 
        questionLower.includes('redhat') ||
        questionLower.includes('adoption')) {
        relevantData.productDetails = {
            summary: salesData.summary.products,
            topAdopters: {
                watsonx: salesData.rawData
                    .filter(c => c.watsonx_ai)
                    .slice(0, 5)
                    .map(c => c.urn_name),
                redHat: salesData.rawData
                    .filter(c => c.red_hat_2024)
                    .slice(0, 5)
                    .map(c => c.urn_name)
            }
        };
    }

    return relevantData;
}

async function askQuestion(salesData, question) {
    try {
        const relevantData = getRelevantData(salesData, question);
        
        const completion = await openai.chat.completions.create({
            model: "gpt-3.5-turbo",
            messages: [
                {
                    role: "system",
                    content: `You are a business analyst specializing in IBM customer data analysis. 
                    Provide specific, data-driven answers with exact numbers and percentages.
                    Format your responses in a clear, professional manner using markdown.
                    Focus on actionable insights and clear trends in the data.`
                },
                {
                    role: "user",
                    content: `Based on this IBM sales data, please answer the following question:

                    Question: ${question}

                    Available Data:
                    ${JSON.stringify(relevantData, null, 2)}`
                }
            ],
            temperature: 0.7,
            max_tokens: 1000
        });

        return completion.choices[0].message.content;
    } catch (error) {
        console.error('Error getting answer:', error);
        return 'Sorry, there was an error processing your question. Please try a more specific question or break it down into smaller parts.';
    }
}

async function main() {
    console.log('Fetching sales data...');
    const salesData = await fetchSalesData();
    
    if (!salesData) {
        console.error('Failed to fetch sales data. Please check your credentials and try again.');
        process.exit(1);
    }

    console.log('\nSales data loaded successfully! You can now ask questions about:');
    console.log('- Revenue analysis and trends (e.g., "Who are our top 5 customers by revenue?")');
    console.log('- Sector performance (e.g., "How is the Financial Services sector performing?")');
    console.log('- Product adoption (e.g., "What is the adoption rate of Watsonx?")');
    console.log('- Growth metrics (e.g., "Which sectors show the highest growth?")');
    console.log('\nType "exit" to quit the program.\n');

    const askNextQuestion = () => {
        rl.question('\nWhat would you like to know about the sales data? ', async (question) => {
            if (question.toLowerCase() === 'exit') {
                console.log('Goodbye!');
                rl.close();
                return;
            }

            console.log('\nAnalyzing...\n');
            const answer = await askQuestion(salesData, question);
            console.log(answer);
            askNextQuestion();
        });
    };

    askNextQuestion();
}

// Start the program
main(); 