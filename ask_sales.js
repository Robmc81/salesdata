const OpenAI = require('openai');
const readline = require('readline');
const fs = require('fs').promises;

// Initialize OpenAI client
const openai = new OpenAI({
    apiKey: process.env.OPENAI_API_KEY
});

// Create readline interface
const rl = readline.createInterface({
    input: process.stdin,
    output: process.stdout
});

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
    const relevantData = {
        totalCustomers: analysisData.totalCustomers,
        totalRevenue: analysisData.totalRevenue
    };

    // If asking about specific customers or revenue
    if (questionLower.includes('customer') || 
        questionLower.includes('client') || 
        questionLower.includes('revenue') ||
        questionLower.includes('company') ||
        questionLower.includes('account')) {
            
        // Get all customers with revenue
        const customersWithRevenue = analysisData.customers.filter(c => 
            Number(c.revenue2024) > 0 || 
            Number(c.revenue2023) > 0 || 
            Number(c.revenue2022) > 0
        );

        // Add relevant customer data based on the question
        if (questionLower.includes('top') || questionLower.includes('largest')) {
            relevantData.topCustomers = customersWithRevenue
                .sort((a, b) => Number(b.revenue2024) - Number(a.revenue2024))
                .slice(0, 20);
        } else if (questionLower.includes('growth') || questionLower.includes('growing')) {
            relevantData.fastestGrowing = customersWithRevenue
                .filter(c => c.growth !== 'N/A')
                .sort((a, b) => Number(b.growth) - Number(a.growth))
                .slice(0, 20);
        } else {
            // Include all customers if the question is general
            relevantData.customers = customersWithRevenue;
        }
    }

    // If asking about sectors
    if (questionLower.includes('sector') || 
        questionLower.includes('industry') || 
        questionLower.includes('segment')) {
        relevantData.sectors = analysisData.sectors;
        
        // Add sector-specific customer lists if needed
        if (questionLower.includes('financial') || 
            questionLower.includes('distribution') ||
            questionLower.includes('industrial')) {
            const sectorName = questionLower.includes('financial') ? 'Financial Services' :
                             questionLower.includes('distribution') ? 'Distribution' :
                             questionLower.includes('industrial') ? 'Industrial' : null;
            
            if (sectorName) {
                relevantData.sectorCustomers = analysisData.customers
                    .filter(c => c.sector === sectorName)
                    .sort((a, b) => Number(b.revenue2024) - Number(a.revenue2024));
            }
        }
    }

    // If asking about products
    if (questionLower.includes('product') || 
        questionLower.includes('software') || 
        questionLower.includes('solution') ||
        questionLower.includes('websphere') ||
        questionLower.includes('mq') ||
        questionLower.includes('turbonomic')) {
        relevantData.products = analysisData.products;

        // Get customers with specific products if mentioned
        const productMentioned = analysisData.products.topProducts
            .find(p => questionLower.includes(p.product.toLowerCase()));
        
        if (productMentioned) {
            relevantData.productCustomers = analysisData.customers
                .filter(c => c.products[productMentioned.product])
                .sort((a, b) => Number(b.revenue2024) - Number(a.revenue2024));
        }
    }

    return relevantData;
}

async function askQuestion(analysisData, question) {
    try {
        const relevantData = getRelevantData(analysisData, question);
        
        const completion = await openai.chat.completions.create({
            model: "gpt-3.5-turbo",
            messages: [
                {
                    role: "system",
                    content: `You are a senior IBM business analyst specializing in sales territory analysis. 
                    Provide specific, data-driven answers with exact numbers and percentages.
                    Format your responses in markdown with clear sections and bullet points.
                    Focus on actionable insights and clear trends in the data.
                    When discussing money values, format them as currency with commas (e.g., $1,234,567).`
                },
                {
                    role: "user",
                    content: `Based on this IBM customer data, please answer the following question:

                    Question: ${question}

                    Available Data:
                    ${JSON.stringify(relevantData, null, 2)}`
                }
            ],
            temperature: 0.7,
            max_tokens: 2000
        });

        return completion.choices[0].message.content;
    } catch (error) {
        console.error('Error getting answer:', error);
        return 'Sorry, there was an error processing your question. Please try again or rephrase your question.';
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

    const askNextQuestion = () => {
        rl.question('\nWhat would you like to know about the IBM customer data? ', async (question) => {
            if (question.toLowerCase() === 'exit') {
                console.log('Goodbye!');
                rl.close();
                return;
            }

            console.log('\nAnalyzing...\n');
            const answer = await askQuestion(analysisData, question);
            console.log(answer);
            askNextQuestion();
        });
    };

    askNextQuestion();
}

// Start the program
main(); 