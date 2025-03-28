const fs = require('fs').promises;
const { parse } = require('csv-parse');
const { createReadStream } = require('fs');

async function convertCsvToJson() {
    const customers = [];
    const products = { topProducts: [] };
    let totalRevenue2024 = 0;
    let totalRevenue2023 = 0;
    let totalRevenue2022 = 0;

    // Create a Set to store unique products
    const uniqueProducts = new Set();

    // Create parser
    const parser = createReadStream('BPS Accounts - US Hub 07. AL-GA-MS Acct Universe 1Q25 Feb (1).csv')
        .pipe(parse({
            columns: true,
            skip_empty_lines: true
        }));

    // Improved function to clean and normalize field values
    function cleanValue(value) {
        if (!value) return '';
        
        // Remove non-alphanumeric characters including dashes and periods, except spaces
        return value.trim()
                    .replace(/[^\w\s]|[-\.]/g, '')  // Explicitly remove dashes and periods
                    .trim();
    }
    
    // Function to create column names for database compatibility
    function createColumnName(value) {
        if (!value) return '';
        
        return value.trim()
                    .toLowerCase()
                    .replace(/[^\w\s]|[-\.]/g, '')  // Remove special chars including dashes and periods
                    .replace(/\s+/g, '_')           // Replace spaces with underscores
                    .replace(/__+/g, '_')           // Replace multiple underscores with one
                    .replace(/^_|_$/g, '');         // Remove leading/trailing underscores
    }

    // Function to parse numeric values properly
    function parseNumeric(value) {
        if (!value) return 0;
        // First remove everything except digits and decimal point
        const cleaned = value.toString().replace(/[^0-9.]/g, '');
        return cleaned ? parseFloat(cleaned) : 0;
    }

    for await (const record of parser) {
        // Clean all values in the record
        const cleanedRecord = {};
        Object.keys(record).forEach(key => {
            const cleanedKey = createColumnName(key);
            cleanedRecord[cleanedKey] = cleanValue(record[key]);
            
            // Keep the original key too for product detection
            cleanedRecord[key] = cleanValue(record[key]);
        });

        // Create base customer object with all fields
        const customer = {
            // Basic Information
            name: cleanedRecord['urn_name'] || cleanValue(record['URN NAME']),
            tech_client: cleanedRecord['tech_client'] || cleanValue(record['Tech Client']),
            client_type_overwrite: cleanedRecord['client_type_overwrite'] || cleanValue(record['Client Type Overwrite']),
            coverage_name: cleanedRecord['cov_name_1h25'] || cleanValue(record['Cov Name 1H25']),
            coverage_name_normalized: createColumnName(record['Cov Name 1H25']),
            coverage_client_type: cleanedRecord['cov_client_type_1h25'] || cleanValue(record['Cov Client Type 1H25']),
            coverage_client_subtype: cleanedRecord['cov_client_sub_type_1h25'] || cleanValue(record['Cov Client Sub Type 1H25']),
            branch_description: cleanedRecord['brnch_dscr_1h25'] || cleanValue(record['BRNCH_DSCR 1H25']),
            sub_branch_description: cleanedRecord['sub_brnch_dscr_1h25'] || cleanValue(record['SUB_BRNCH_DSCR 1H25']),
            sub_industry_description: cleanedRecord['sub_ind_dscr'] || cleanValue(record['SUB IND DSCR']),
            industry_description: cleanedRecord['ind_dscr'] || cleanValue(record['IND_DSCR']),
            sector: cleanedRecord['sector'] || cleanValue(record['Sector']),
            
            // Company Details
            employee_count: parseNumeric(record['FIRMO LE EMP CNT (Number of Employees)']),
            it_spend_estimate: cleanedRecord['it_spend_estimate'] || cleanValue(record['IT Spend Estimate']),
            company_size: cleanedRecord['company_size'] || cleanValue(record['Company Size']),
            
            // Location
            city: cleanedRecord['prmry_city_name'] || cleanValue(record['Prmry City Name']),
            state: cleanedRecord['prmry_st_prov_name'] || cleanValue(record['PRMRY ST PROV NAME']),
            
            // Revenue - maintain numeric values
            revenue_2024: parseNumeric(record['TOTAL IBM REV 2024']),
            revenue_2023: parseNumeric(record['TOTAL IBM REV 2023']),
            revenue_2022: parseNumeric(record['TOTAL IBM REV 2022']),
            
            // Partner Information
            top_data_ai_business_partner: cleanedRecord['top_data_ai_business_parter'] || cleanValue(record['Top Data & AI Business Parter']),
            top_it_auto_app_mod_business_partner: cleanedRecord['top_it_auto_app_mod_business_parter'] || cleanValue(record['Top IT Auto & App Mod Business Parter']),
            key_bp: cleanedRecord['key_bp'] || cleanValue(record['Key BP']),
            
            // Original data for reference (optional)
            original: {},
            
            // Products
            products: {},
            
            // Cleaned products for database queries
            clean_products: {}
        };

        // Save original values if needed
        Object.keys(record).forEach(key => {
            customer.original[key] = record[key];
        });

        // Calculate growth
        if (customer.revenue_2023 > 0) {
            customer.growth = ((customer.revenue_2024 - customer.revenue_2023) / customer.revenue_2023 * 100).toFixed(2);
        } else {
            customer.growth = customer.revenue_2024 > 0 ? 'Infinity' : 'N/A';
        }

        // Define non-product columns to exclude
        const nonProductColumns = [
            'URN NAME', 'Tech Client', 'Client Type Overwrite', 'Cov Name 1H25', 
            'Cov Client Type 1H25', 'Cov Client Sub Type 1H25', 'BRNCH_DSCR 1H25', 
            'SUB_BRNCH_DSCR 1H25', 'SUB IND DSCR', 'IND_DSCR', 'Sector', 
            'FIRMO LE EMP CNT (Number of Employees)', 'IT Spend Estimate',
            'Company Size', 'Prmry City Name', 'PRMRY ST PROV NAME', 'TOTAL IBM REV 2024',
            'TOTAL IBM REV 2023', 'TOTAL IBM REV 2022', 'Top Data & AI Business Parter',
            'Top IT Auto & App Mod Business Parter', 'Key BP'
        ];

        // Add products (both original and cleaned versions)
        const productColumns = Object.keys(record).filter(key => 
            !nonProductColumns.includes(key)
        );

        productColumns.forEach(product => {
            if (record[product] && record[product].trim() !== '') {
                // Add to original products
                customer.products[product] = true;
                
                // Add cleaned version for database queries
                const cleanProductName = createColumnName(product);
                customer.clean_products[cleanProductName] = true;
                
                // Add to unique products set
                uniqueProducts.add(product);
            }
        });

        // Update totals
        totalRevenue2024 += customer.revenue_2024;
        totalRevenue2023 += customer.revenue_2023;
        totalRevenue2022 += customer.revenue_2022;

        customers.push(customer);
    }

    // Convert unique products to topProducts array
    products.topProducts = Array.from(uniqueProducts).map(product => {
        const cleanProductName = createColumnName(product);
        return {
            product,
            clean_product_name: cleanProductName,
            customerCount: customers.filter(c => c.products[product]).length
        };
    }).sort((a, b) => b.customerCount - a.customerCount);

    // Create final JSON structure
    const territoryAnalysis = {
        totalCustomers: customers.length,
        totalRevenue: {
            2024: totalRevenue2024,
            2023: totalRevenue2023,
            2022: totalRevenue2022
        },
        yearOverYearGrowth: {
            "2023-2024": totalRevenue2023 > 0 ? 
                ((totalRevenue2024 - totalRevenue2023) / totalRevenue2023 * 100).toFixed(2) : 'N/A'
        },
        customers,
        products,
        // Add metadata about cleaned columns for reference
        metadata: {
            dataCleaningApplied: true,
            cleaningRules: [
                "Removed all special characters including dashes and periods",
                "Converted column names to lowercase with underscores",
                "Parsed numeric values properly (removed all non-digit characters except decimal points)",
                "Created normalized product names for database compatibility"
            ],
            dateProcessed: new Date().toISOString()
        }
    };

    // Write main JSON file
    await fs.writeFile(
        'territory_analysis_data.json',
        JSON.stringify(territoryAnalysis, null, 2)
    );

    // Create a simple CSV for products
    const productCsv = ['original_name,clean_name,customer_count'];
    products.topProducts.forEach(p => {
        productCsv.push(`"${p.product}","${p.clean_product_name}",${p.customerCount}`);
    });
    
    await fs.writeFile('product_mapping.csv', productCsv.join('\n'));

    // Create customer CSV with clean column names
    const customerCsv = [
        'name,tech_client,coverage_name,sector,state,revenue_2024,revenue_2023,revenue_2022,growth'
    ];
    
    customers.forEach(c => {
        customerCsv.push(
            `"${c.name}","${c.tech_client}","${c.coverage_name}","${c.sector}","${c.state}",${c.revenue_2024},${c.revenue_2023},${c.revenue_2022},${c.growth}`
        );
    });
    
    await fs.writeFile('clean_customers.csv', customerCsv.join('\n'));

    console.log('Conversion complete! Files saved:');
    console.log('- territory_analysis_data.json (full data)');
    console.log('- product_mapping.csv (product name mapping)');
    console.log('- clean_customers.csv (basic customer info)');
    console.log(`Total customers: ${customers.length}`);
    console.log(`Total revenue 2024: $${totalRevenue2024.toLocaleString()}`);
    console.log(`Total products: ${products.topProducts.length}`);
}

convertCsvToJson().catch(console.error);