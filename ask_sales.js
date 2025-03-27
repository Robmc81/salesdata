require('dotenv').config();
const OpenAI = require('openai');
const readline = require('readline');
const fs = require('fs').promises;

// Check for required environment variable
if (!process.env.OPENAI_API_KEY) {
    console.error('Error: OPENAI_API_KEY environment variable is not set. Please create a .env file with your OpenAI API key.');
    process.exit(1);
}

// Initialize OpenAI client with API key from environment variable
const openai = new OpenAI({
    apiKey: process.env.OPENAI_API_KEY
});

// Create readline interface with custom prompt handling
function createCustomReadline(analysisData) {
    const rl = readline.createInterface({
        input: process.stdin,
        output: process.stdout,
        prompt: '\nWhat would you like to know about the IBM customer data? '
    });

    // Handle line input
    rl.on('line', async (line) => {
        if (line.toLowerCase() === 'exit') {
            console.log('Goodbye!');
            rl.close();
            process.exit(0);
        }

        console.log('\nAnalyzing...\n');
        const answer = await askQuestion(analysisData, line);
        console.log(answer);
        rl.prompt();
    });

    // Handle SIGINT (Ctrl+C)
    rl.on('SIGINT', () => {
        console.log('\nGoodbye!');
        process.exit(0);
    });

    return rl;
}

async function loadAnalysisData() {
    try {
        const data = await fs.readFile('territory_analysis_data.json', 'utf8');
        return JSON.parse(data);
    } catch (error) {
        console.error('Error loading territory_analysis_data.json:', error);
        return null;
    }
}

function getRelevantData(analysisData, question) {
    const questionLower = question.toLowerCase();
    const baseData = {
        totalCustomers: analysisData.totalCustomers,
        totalRevenue: analysisData.totalRevenue
    };

    // Helper function to create chunks
    function createChunks(data, chunkSize = 5, context = {}) {
        const chunks = [];
        for (let i = 0; i < data.length; i += chunkSize) {
            const chunkData = data.slice(i, i + chunkSize);
            chunks.push({
                ...context,
                data: chunkData,
                chunkInfo: {
                    current: Math.floor(i / chunkSize) + 1,
                    total: Math.ceil(data.length / chunkSize),
                    start: i + 1,
                    end: Math.min(i + chunkSize, data.length),
                    totalItems: data.length
                }
            });
        }
        return chunks;
    }

    // Helper function to calculate revenue totals
    function calculateRevenueTotals(customers) {
        return {
            2024: customers.reduce((sum, c) => sum + (Number(c.revenue2024) || 0), 0),
            2023: customers.reduce((sum, c) => sum + (Number(c.revenue2023) || 0), 0),
            2022: customers.reduce((sum, c) => sum + (Number(c.revenue2022) || 0), 0)
        };
    }

    // Helper function to map customer data
    function mapCustomerData(customer) {
        return {
            name: customer.name,
            revenue2024: customer.revenue2024,
            revenue2023: customer.revenue2023,
            revenue2022: customer.revenue2022,
            growth: customer.growth,
            sector: customer.sector,
            location: customer.location,
            products: customer.products ? Object.keys(customer.products) : []
        };
    }

    const relevantData = { ...baseData };

    // City/Location Analysis
    if (questionLower.includes('city') || questionLower.includes('location') || questionLower.includes('in')) {
        const cityMatch = questionLower.match(/\b(?:in|at|from)\s+([a-z\s]+)(?:\s|$)/);
        const searchCity = cityMatch ? cityMatch[1].trim().toUpperCase() : '';

        const cityGroups = {};
        analysisData.customers.forEach(customer => {
            if (!customer.location) return;
            const city = customer.location.trim().toUpperCase();
            if (!cityGroups[city]) cityGroups[city] = [];
            cityGroups[city].push(customer);
        });

        if (searchCity && cityGroups[searchCity]) {
            const cityData = cityGroups[searchCity];
            const cityContext = {
                city: searchCity,
                customerCount: cityData.length,
                totalRevenue: calculateRevenueTotals(cityData)
            };

            const sortedCustomers = cityData
                .sort((a, b) => Number(b.revenue2024) - Number(a.revenue2024))
                .map(mapCustomerData);

            relevantData.chunks = createChunks(sortedCustomers, 10, cityContext);
        } else {
            const cityAnalysis = Object.entries(cityGroups)
                .map(([city, customers]) => ({
                    city,
                    customerCount: customers.length,
                    totalRevenue: calculateRevenueTotals(customers)
                }))
                .sort((a, b) => b.totalRevenue[2024] - a.totalRevenue[2024]);

            relevantData.chunks = createChunks(cityAnalysis, 10, { type: 'cityOverview' });
        }
    }

    // Customer Analysis
    else if (questionLower.includes('customer') || questionLower.includes('client')) {
        const customersWithRevenue = analysisData.customers
            .filter(c => Number(c.revenue2024) > 0)
            .map(mapCustomerData);

        const context = {
            type: 'customerAnalysis',
            totalCustomers: customersWithRevenue.length,
            totalRevenue: calculateRevenueTotals(customersWithRevenue)
        };

        if (questionLower.includes('top') || questionLower.includes('largest')) {
            const topCustomers = customersWithRevenue
                .sort((a, b) => Number(b.revenue2024) - Number(a.revenue2024))
                .slice(0, 50);
            relevantData.chunks = createChunks(topCustomers, 10, { ...context, type: 'topCustomers' });
        } else if (questionLower.includes('growth')) {
            const growingCustomers = customersWithRevenue
                .filter(c => c.growth !== 'N/A' && c.growth !== 'Not Available')
                .sort((a, b) => Number(b.growth) - Number(a.growth))
                .slice(0, 50);
            relevantData.chunks = createChunks(growingCustomers, 10, { ...context, type: 'fastestGrowing' });
        } else {
            relevantData.chunks = createChunks(customersWithRevenue, 10, context);
        }
    }

    // Sector Analysis
    else if (questionLower.includes('sector') || questionLower.includes('industry')) {
        const sectorGroups = {};
        analysisData.customers.forEach(customer => {
            if (!customer.sector) return;
            const sector = customer.sector;
            if (!sectorGroups[sector]) sectorGroups[sector] = [];
            sectorGroups[sector].push(customer);
        });

        const sectorData = Object.entries(sectorGroups).map(([sector, customers]) => ({
            sector,
            customerCount: customers.length,
            totalRevenue: calculateRevenueTotals(customers),
            customers: customers
                .sort((a, b) => Number(b.revenue2024) - Number(a.revenue2024))
                .map(mapCustomerData)
        }));

        relevantData.chunks = createChunks(sectorData, 5, { type: 'sectorAnalysis' });
    }

    // Product Analysis
    else if (questionLower.includes('product') || 
             questionLower.includes('software') || 
             questionLower.includes('websphere') ||
             questionLower.includes('mq')) {
        
        const productData = analysisData.customers
            .filter(c => c.products && Object.keys(c.products).length > 0)
            .map(customer => ({
                ...mapCustomerData(customer),
                productCount: Object.keys(customer.products).length
            }))
            .sort((a, b) => b.productCount - a.productCount);

        relevantData.chunks = createChunks(productData, 10, { 
            type: 'productAnalysis',
            totalCustomersWithProducts: productData.length
        });
    }

    return relevantData;
}

// Update the estimateTokens function to be more accurate
function estimateTokens(text) {
    // Using a more conservative estimate: roughly 4 characters per token
    return Math.ceil(text.length / 4);
}

async function askQuestionWithChunks(analysisData, question, relevantData) {
    try {
        if (relevantData.chunks) {
            let finalAnswer = '';
            const chunks = relevantData.chunks;

            for (let i = 0; i < chunks.length; i++) {
                const chunk = chunks[i];
                const isLastChunk = i === chunks.length - 1;

                // Simplify the analysis prompt to reduce tokens
                let analysisPrompt = '';
                const chunkData = chunk.data.map(d => ({
                    name: d.name,
                    revenue2024: d.revenue2024,
                    location: d.location,
                    sector: d.sector
                }));

                switch (chunk.type) {
                    case 'cityOverview':
                        analysisPrompt = `Cities (${chunk.chunkInfo.start}-${chunk.chunkInfo.end}/${chunk.chunkInfo.totalItems}): ${JSON.stringify(chunkData)}`;
                        break;
                    case 'customerAnalysis':
                    case 'topCustomers':
                    case 'fastestGrowing':
                        analysisPrompt = `Customers (${chunk.chunkInfo.start}-${chunk.chunkInfo.end}/${chunk.chunkInfo.totalItems}): ${JSON.stringify(chunkData)}`;
                        break;
                    case 'sectorAnalysis':
                        analysisPrompt = `Sectors (${chunk.chunkInfo.start}-${chunk.chunkInfo.end}/${chunk.chunkInfo.totalItems}): ${JSON.stringify(chunkData)}`;
                        break;
                    case 'productAnalysis':
                        analysisPrompt = `Products (${chunk.chunkInfo.start}-${chunk.chunkInfo.end}/${chunk.chunkInfo.totalItems}): ${JSON.stringify(chunkData)}`;
                        break;
                    default:
                        analysisPrompt = JSON.stringify(chunkData);
                }

                // Ensure we don't exceed token limit
                const maxChars = 4000; // Roughly 1000 tokens
                if (analysisPrompt.length > maxChars) {
                    analysisPrompt = analysisPrompt.substring(0, maxChars) + '...';
                }

                const completion = await openai.chat.completions.create({
                    model: "gpt-3.5-turbo",
                    messages: [
                        {
                            role: "system",
                            content: "Analyze IBM customer data. Be concise and focus on key metrics."
                        },
                        {
                            role: "user",
                            content: `Q: ${question}\n${analysisPrompt}${finalAnswer ? '\nPrevious insights:' + finalAnswer.substring(0, 500) : ''}`
                        }
                    ],
                    temperature: 0.7,
                    max_tokens: 500
                });

                const chunkAnswer = completion.choices[0].message.content;
                
                if (chunks.length > 1) {
                    if (i === 0) {
                        finalAnswer = chunkAnswer;
                    } else if (isLastChunk) {
                        // Simplified summary completion
                        const summaryCompletion = await openai.chat.completions.create({
                            model: "gpt-3.5-turbo",
                            messages: [
                                {
                                    role: "system",
                                    content: "Summarize the key findings concisely."
                                },
                                {
                                    role: "user",
                                    content: `Combine these insights:\n1. ${finalAnswer.substring(0, 750)}\n2. ${chunkAnswer}`
                                }
                            ],
                            temperature: 0.7,
                            max_tokens: 500
                        });
                        finalAnswer = summaryCompletion.choices[0].message.content;
                    } else {
                        finalAnswer += '\n' + chunkAnswer;
                    }
                } else {
                    finalAnswer = chunkAnswer;
                }
            }
            return finalAnswer;
        }

        // For non-chunked data
        const dataString = JSON.stringify(relevantData);
        if (dataString.length > 4000) {
            return 'Error: Data too large. Please try a more specific query.';
        }

        const completion = await openai.chat.completions.create({
            model: "gpt-3.5-turbo",
            messages: [
                {
                    role: "system",
                    content: "Analyze IBM customer data. Be concise and focus on key metrics."
                },
                {
                    role: "user",
                    content: `Q: ${question}\nData: ${dataString}`
                }
            ],
            temperature: 0.7,
            max_tokens: 500
        });
        return completion.choices[0].message.content;

    } catch (error) {
        console.error('Error getting answer:', error);
        return 'Sorry, there was an error processing your question. Please try a more specific query.';
    }
}

// Update the askQuestion function to prioritize direct data queries
async function askQuestion(analysisData, question) {
    const questionLower = question.toLowerCase();
    
    // Only use AI analysis if explicitly requested
    if (questionLower.includes('analyze') || questionLower.includes('analysis')) {
        const relevantData = getRelevantData(analysisData, question);
        return askQuestionWithChunks(analysisData, question, relevantData);
    }

    // For all other queries, use direct data lookup
    return getDirectDataResponse(analysisData, question);
}

function getDirectDataResponse(analysisData, question) {
    const questionLower = question.toLowerCase();

    // City/Location queries
    if (questionLower.includes('in')) {
        const cityMatch = questionLower.match(/\b(?:in|at|from)\s+([a-z\s]+)(?:\s|$)/i);
        const searchCity = cityMatch ? cityMatch[1].trim().toUpperCase() : '';
        
        if (searchCity) {
            const cityCustomers = analysisData.customers
                .filter(c => (c.location || '').trim().toUpperCase() === searchCity)
                .sort((a, b) => Number(b.revenue2024) - Number(a.revenue2024))
                .map(c => ({
                    name: c.name,
                    revenue2024: Number(c.revenue2024),
                    revenue2023: Number(c.revenue2023),
                    revenue2022: Number(c.revenue2022),
                    growth: c.growth,
                    sector: c.sector,
                    location: c.location,
                    products: c.products ? Object.keys(c.products) : []
                }));

            if (cityCustomers.length > 0) {
                const totalRevenue = {
                    2024: cityCustomers.reduce((sum, c) => sum + (c.revenue2024 || 0), 0),
                    2023: cityCustomers.reduce((sum, c) => sum + (c.revenue2023 || 0), 0),
                    2022: cityCustomers.reduce((sum, c) => sum + (c.revenue2022 || 0), 0)
                };

                return formatDataResponse({
                    type: 'cityCustomers',
                    city: searchCity,
                    customerCount: cityCustomers.length,
                    totalRevenue,
                    customers: cityCustomers
                });
            }
            return `No customers found in ${searchCity}.`;
        }
    }

    // Product queries
    if (questionLower.includes('product') || questionLower.includes('using')) {
        const productMatches = analysisData.products.topProducts
            .map(p => p.product)
            .filter(product => questionLower.includes(product.toLowerCase()));

        if (productMatches.length > 0) {
            const product = productMatches[0];
            const productCustomers = analysisData.customers
                .filter(c => c.products && c.products[product])
                .sort((a, b) => Number(b.revenue2024) - Number(a.revenue2024))
                .map(c => ({
                    name: c.name,
                    revenue2024: Number(c.revenue2024),
                    location: c.location,
                    sector: c.sector
                }));

            return formatDataResponse({
                type: 'productCustomers',
                product,
                customerCount: productCustomers.length,
                customers: productCustomers
            });
        }
    }

    // Sector queries
    if (questionLower.includes('sector') || questionLower.includes('industry')) {
        const sectors = [...new Set(analysisData.customers.map(c => c.sector).filter(Boolean))];
        const sectorMatch = sectors.find(s => questionLower.includes(s.toLowerCase()));

        if (sectorMatch) {
            const sectorCustomers = analysisData.customers
                .filter(c => c.sector === sectorMatch)
                .sort((a, b) => Number(b.revenue2024) - Number(a.revenue2024))
                .map(c => ({
                    name: c.name,
                    revenue2024: Number(c.revenue2024),
                    location: c.location,
                    products: c.products ? Object.keys(c.products) : []
                }));

            return formatDataResponse({
                type: 'sectorCustomers',
                sector: sectorMatch,
                customerCount: sectorCustomers.length,
                customers: sectorCustomers
            });
        }
    }

    return 'Please specify what information you are looking for (e.g., customers in a city, using a product, or in a sector).';
}

function formatDataResponse(data) {
    switch (data.type) {
        case 'cityCustomers':
            return `Customers in ${data.city} (${data.customerCount} total)

Revenue Summary:
- 2024: $${data.totalRevenue[2024].toLocaleString()}
- 2023: $${data.totalRevenue[2023].toLocaleString()}
- 2022: $${data.totalRevenue[2022].toLocaleString()}

Customers (sorted by 2024 revenue):
${data.customers.map(c => 
    `\n${c.name}
    - Revenue 2024: $${c.revenue2024.toLocaleString()}
    - Revenue 2023: $${c.revenue2023.toLocaleString()}
    - Growth: ${c.growth}%
    - Sector: ${c.sector}
    - Products: ${c.products.join(', ') || 'None'}`
).join('\n')}`;

        case 'productCustomers':
            return `Customers using ${data.product} (${data.customerCount} total):
${data.customers.map(c =>
    `\n${c.name}
    - Revenue 2024: $${c.revenue2024.toLocaleString()}
    - Location: ${c.location}
    - Sector: ${c.sector}`
).join('\n')}`;

        case 'sectorCustomers':
            return `Customers in ${data.sector} sector (${data.customerCount} total):
${data.customers.map(c =>
    `\n${c.name}
    - Revenue 2024: $${c.revenue2024.toLocaleString()}
    - Location: ${c.location}
    - Products: ${c.products.join(', ') || 'None'}`
).join('\n')}`;

        default:
            return JSON.stringify(data, null, 2);
    }
}

async function main() {
    console.log('Loading analysis data...');
    const analysisData = await loadAnalysisData();
    
    if (!analysisData) {
        console.error('Failed to load analysis data. Please ensure territory_analysis_data.json exists in the current directory.');
        process.exit(1);
    }

    console.log('\nAnalysis data loaded successfully! You can now ask questions about:');
    console.log('- Customer analysis (e.g., "Who are our top 10 customers by revenue?")');
    console.log('- Sector performance (e.g., "How is the Financial Services sector performing?")');
    console.log('- Product adoption (e.g., "What products have the highest adoption rates?")');
    console.log('- Growth trends (e.g., "Which customers show the highest growth?")');
    console.log('\nType "exit" to quit the program.\n');

    const rl = createCustomReadline(analysisData);
    rl.prompt();
}

// Start the program
main(); 