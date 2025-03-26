const { createClient } = require('@supabase/supabase-js');
const OpenAI = require('openai');

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

async function analyzeData() {
    try {
        // Get all data sorted by revenue, exactly matching the SQL query
        const { data, error } = await supabase
            .from('atlgams')
            .select('*')
            .order('total_ibm_rev_2024', { ascending: false });

        if (error) {
            console.error('Error fetching data:', error);
            return;
        }

        // Log raw data for verification
        console.log('\nRaw Revenue Data (Top 20):');
        data.slice(0, 20).forEach((account, index) => {
            console.log(`${index + 1}. ${account.urn_name}: ${account.total_ibm_rev_2024}`);
        });

        // Get top 10 accounts by revenue
        const top10Accounts = data.slice(0, 10).map(c => ({
            name: c.urn_name,
            revenue2024: c.total_ibm_rev_2024,
            revenue2023: c.total_ibm_rev_2023,
            revenue2022: c.total_ibm_rev_2022,
            growth: c.total_ibm_rev_2023 ? 
                ((c.total_ibm_rev_2024 - c.total_ibm_rev_2023) / c.total_ibm_rev_2023 * 100).toFixed(2) : 
                'N/A',
            sector: c.sector,
            location: c.location,
            employeeCount: c.employee_count
        }));

        // Calculate total revenue for each year
        const totalRevenue = {
            2024: data.reduce((sum, c) => sum + (Number(c.total_ibm_rev_2024) || 0), 0),
            2023: data.reduce((sum, c) => sum + (Number(c.total_ibm_rev_2023) || 0), 0),
            2022: data.reduce((sum, c) => sum + (Number(c.total_ibm_rev_2022) || 0), 0)
        };

        // Prepare analysis data
        const analysisData = {
            totalCustomers: data.length,
            totalRevenue,
            revenue: {
                top10: top10Accounts
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
                watsonx: {
                    total: data.filter(c => c.watsonx_ai).length,
                    percentage: ((data.filter(c => c.watsonx_ai).length / data.length) * 100).toFixed(2)
                },
                redHat: {
                    total: data.filter(c => c.red_hat_2024).length,
                    percentage: ((data.filter(c => c.red_hat_2024).length / data.length) * 100).toFixed(2)
                },
                cloud: {
                    total: data.filter(c => c.cloud_platform_paas_2024).length,
                    percentage: ((data.filter(c => c.cloud_platform_paas_2024).length / data.length) * 100).toFixed(2)
                },
                automation: {
                    total: data.filter(c => c.automation_2024).length,
                    percentage: ((data.filter(c => c.automation_2024).length / data.length) * 100).toFixed(2)
                },
                security: {
                    total: data.filter(c => c.security_2024).length,
                    percentage: ((data.filter(c => c.security_2024).length / data.length) * 100).toFixed(2)
                }
            },
            customerSegments: {
                zeroRevenue: data.filter(c => !Number(c.total_ibm_rev_2024)).length,
                lowRevenue: data.filter(c => Number(c.total_ibm_rev_2024) > 0 && Number(c.total_ibm_rev_2024) < 10000).length,
                mediumRevenue: data.filter(c => Number(c.total_ibm_rev_2024) >= 10000 && Number(c.total_ibm_rev_2024) < 100000).length,
                highRevenue: data.filter(c => Number(c.total_ibm_rev_2024) >= 100000).length
            }
        };

        // Get AI analysis
        const completion = await openai.chat.completions.create({
            model: "gpt-3.5-turbo",
            messages: [
                {
                    role: "system",
                    content: "You are a business analyst specializing in IBM customer data analysis. Provide insights in a clear, actionable format with specific numbers and percentages."
                },
                {
                    role: "user",
                    content: `Analyze this IBM customer data and provide key insights:
                    
                    1. Overall Market Analysis:
                    - Total number of customers
                    - Total revenue by year
                    - Customer segmentation by revenue
                    
                    2. Revenue Analysis:
                    - Top 10 customers by revenue and their growth rates
                    - Overall revenue concentration
                    - Year-over-year trends
                    
                    3. Sector Analysis:
                    - Distribution across sectors
                    - Key growth sectors
                    - Concentration risks
                    
                    4. Product Adoption:
                    - Most popular products
                    - Cross-sell opportunities
                    - Product penetration rates
                    
                    5. Strategic Recommendations:
                    - Growth opportunities
                    - Risk mitigation
                    - Action items
                    
                    Data: ${JSON.stringify(analysisData, null, 2)}`
                }
            ],
            temperature: 0.7,
            max_tokens: 2000
        });

        // Output and save results
        const analysis = completion.choices[0].message.content;
        console.log("\n=== IBM Customer Analysis ===\n");
        console.log(analysis);
        
        require('fs').writeFileSync('analysis_results.md', analysis);
        console.log("\nAnalysis saved to analysis_results.md");

    } catch (error) {
        console.error('Error:', error);
    }
}

// Run the analysis
analyzeData(); 