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

// List of all product columns to include in the query
const productColumns = [
    'api_connect',
    'app_connect_enterprise',
    'app_connect_professional',
    'aspera',
    'clearcase_and_clearquest',
    'cloud_pak_system',
    'cloud_pak_for_aiops',
    'cloud_pak_for_applications',
    'cloud_pak_for_integration',
    'cloud_private',
    'datapower_appliances',
    'datapower_operations_dashboard',
    'datapower_software_editions',
    'devops_automation',
    'devops_heritage',
    'event_automation',
    'flexera',
    'humio',
    'mobile_foundation',
    'mq',
    'mq_advanced',
    'mq_appliances',
    'ns1',
    'observability_with_instana',
    'operations_insights',
    'pure_application',
    'rational_analysis_design_construction',
    'runtimes',
    'sevone',
    'turbonomic_arm',
    'urbancode',
    'websphere_application_server',
    'websphere_application_server_family_edition',
    'websphere_application_server_network_deployment',
    'websphere_automation',
    'websphere_extreme_scale',
    'websphere_hybrid_edition',
    'websphere_service_registry_repository',
    'workload_automation',
    'ibm_sw_installs'
];

async function getAvailableColumns() {
    try {
        const { data, error } = await supabase
            .from('atlgams')
            .select('*')
            .limit(1);

        if (error) {
            console.error('Error fetching columns:', error);
            return [];
        }

        // Get all column names from the first row
        return Object.keys(data[0]);
    } catch (error) {
        console.error('Error:', error);
        return [];
    }
}

async function analyzeData() {
    try {
        // First, get available columns
        console.log('Fetching available columns...');
        const availableColumns = await getAvailableColumns();
        console.log('Available columns:', availableColumns);

        // Filter product columns to only include those that exist
        const validProductColumns = productColumns.filter(col => availableColumns.includes(col));
        console.log('Valid product columns:', validProductColumns);

        // Prepare column selection with only valid columns
        const columnsToSelect = [
            'urn_name',
            'total_ibm_rev_2024',
            'total_ibm_rev_2023',
            'total_ibm_rev_2022',
            'sector',
            'location',
            'firmo_le_emp_cnt_number_of_employees',
            'watsonx_ai',
            'red_hat_2024',
            'cloud_platform_paas_2024',
            'automation_2024',
            'security_2024',
            ...validProductColumns
        ].filter(col => availableColumns.includes(col));

        // Get all data sorted by revenue
        const { data, error } = await supabase
            .from('atlgams')
            .select(columnsToSelect.join(','))
            .order('total_ibm_rev_2024', { ascending: false });

        if (error) {
            console.error('Error fetching data:', error);
            return;
        }

        // Create full customer data for export
        const fullCustomerData = data
            .filter(c => 
                Number(c.total_ibm_rev_2024) > 0 || 
                Number(c.total_ibm_rev_2023) > 0 || 
                Number(c.total_ibm_rev_2022) > 0
            )
            .map(c => ({
                name: c.urn_name,
                revenue2024: c.total_ibm_rev_2024,
                revenue2023: c.total_ibm_rev_2023,
                revenue2022: c.total_ibm_rev_2022,
                growth: c.total_ibm_rev_2023 ? 
                    ((c.total_ibm_rev_2024 - c.total_ibm_rev_2023) / c.total_ibm_rev_2023 * 100).toFixed(2) : 
                    'N/A',
                sector: c.sector,
                location: c.location,
                products: validProductColumns
                    .filter(product => c[product])
                    .reduce((acc, product) => {
                        acc[product] = true;
                        return acc;
                    }, {})
            }));

        // Create reduced data for OpenAI analysis
        const analysisData = {
            totalCustomers: data.length,
            totalRevenue: {
                2024: data.reduce((sum, c) => sum + (Number(c.total_ibm_rev_2024) || 0), 0),
                2023: data.reduce((sum, c) => sum + (Number(c.total_ibm_rev_2023) || 0), 0),
                2022: data.reduce((sum, c) => sum + (Number(c.total_ibm_rev_2022) || 0), 0)
            },
            // Only include top 50 customers for analysis
            revenue: {
                top50: data.slice(0, 50).map(c => ({
                    name: c.urn_name,
                    revenue2024: c.total_ibm_rev_2024,
                    revenue2023: c.total_ibm_rev_2023,
                    growth: c.total_ibm_rev_2023 ? 
                        ((c.total_ibm_rev_2024 - c.total_ibm_rev_2023) / c.total_ibm_rev_2023 * 100).toFixed(2) : 
                        'N/A'
                }))
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
            })).sort((a, b) => b.count - a.count),
            products: {
                topProducts: validProductColumns.map(product => ({
                    product,
                    customersCount: data.filter(c => c[product]).length,
                    percentage: ((data.filter(c => c[product]).length / data.length) * 100).toFixed(2)
                })).sort((a, b) => b.customersCount - a.customersCount).slice(0, 20)
            }
        };

        // Get AI analysis with reduced data
        const completion = await openai.chat.completions.create({
            model: "gpt-3.5-turbo",
            messages: [
                {
                    role: "system",
                    content: "You are a senior IBM business analyst specializing in sales territory planning and market analysis. Provide insights in a clear, actionable format with specific numbers and percentages."
                },
                {
                    role: "user",
                    content: `Analyze this IBM customer data and provide key insights:
                    ${JSON.stringify(analysisData, null, 2)}`
                }
            ],
            temperature: 0.7,
            max_tokens: 2000
        });

        // Output and save results
        const analysis = completion.choices[0].message.content;
        console.log("\n=== IBM Sales Territory Analysis ===\n");
        console.log(analysis);
        
        // Save results
        require('fs').writeFileSync('territory_analysis_results.md', analysis);
        
        // Save full customer data to a separate file
        require('fs').writeFileSync('territory_analysis_data.json', JSON.stringify({
            ...analysisData,
            customers: fullCustomerData
        }, null, 2));
        
        console.log("\nAnalysis saved to territory_analysis_results.md");
        console.log("Full customer data saved to territory_analysis_data.json");

    } catch (error) {
        console.error('Error:', error);
    }
}

// Helper function to analyze data by location
function analyzeByLocation(data) {
    // Group customers by location
    const locationGroups = data.reduce((acc, customer) => {
        const location = customer.location || 'Unknown';
        if (!acc[location]) {
            acc[location] = [];
        }
        acc[location].push(customer);
        return acc;
    }, {});

    // Analyze each location
    return Object.entries(locationGroups).map(([location, customers]) => {
        // Calculate revenue metrics
        const totalRevenue2024 = customers.reduce((sum, c) => sum + (Number(c.total_ibm_rev_2024) || 0), 0);
        const totalRevenue2023 = customers.reduce((sum, c) => sum + (Number(c.total_ibm_rev_2023) || 0), 0);
        
        // Calculate product adoption by territory
        const territoryProducts = productColumns.map(product => {
            const count = customers.filter(c => c[product]).length;
            return {
                product,
                count,
                percentage: customers.length ? ((count / customers.length) * 100).toFixed(2) : '0.00'
            };
        }).sort((a, b) => b.count - a.count);

        return {
            location,
            customerCount: customers.length,
            revenue2024: totalRevenue2024,
            revenue2023: totalRevenue2023,
            growth: totalRevenue2023 ? ((totalRevenue2024 - totalRevenue2023) / totalRevenue2023 * 100).toFixed(2) : 'N/A',
            topProducts: territoryProducts.slice(0, 5),
            topCustomers: customers
                .sort((a, b) => (Number(b.total_ibm_rev_2024) || 0) - (Number(a.total_ibm_rev_2024) || 0))
                .slice(0, 3)
                .map(c => ({
                    name: c.urn_name,
                    revenue: c.total_ibm_rev_2024
                }))
        };
    }).sort((a, b) => b.revenue2024 - a.revenue2024);
}

// Helper function to generate CSV from account data
function generateCsv(accounts) {
    // Define the base columns for the CSV
    const baseColumns = ['name', 'revenue2024', 'revenue2023', 'revenue2022', 'growth', 'sector', 'location', 'employeeCount'];
    
    // Get all product columns
    const allProductColumns = productColumns;
    
    // Combine all columns for the header
    const header = [...baseColumns, ...allProductColumns].join(',');
    
    // Generate rows for each account
    const rows = accounts.map(account => {
        // Get base values
        const baseValues = baseColumns.map(col => {
            // Handle commas in text fields
            if (typeof account[col] === 'string' && account[col].includes(',')) {
                return `"${account[col]}"`;
            }
            return account[col] || '';
        });
        
        // Get product values
        const productValues = allProductColumns.map(product => 
            account.products && account.products[product] ? account.products[product] : ''
        );
        
        // Combine all values into a row
        return [...baseValues, ...productValues].join(',');
    });
    
    // Combine header and rows into CSV
    return header + '\n' + rows.join('\n');
}

// Run the analysis
analyzeData();