require('dotenv').config();
const fs = require('fs').promises;
const readline = require('readline');

// Field mappings for natural language queries
const FIELD_MAPPINGS = {
    // Basic Information
    'name': 'name',
    'tech client': 'tech_client',
    'client type': 'client_type_overwrite',
    'coverage': 'coverage_name',
    'coverage normalized': 'coverage_name_normalized',
    'coverage type': 'coverage_client_type',
    'coverage subtype': 'coverage_client_subtype',
    'branch': 'branch_description',
    'sub branch': 'sub_branch_description',
    'industry': 'industry_description',
    'sub industry': 'sub_industry_description',
    'sector': 'sector',
    
    // Company Details
    'employees': 'employee_count',
    'it spend': 'it_spend_estimate',
    'company size': 'company_size',
    
    // Location
    'city': 'city',
    'state': 'state',
    'location': 'location',
    
    // Revenue
    'revenue 2024': 'revenue_2024',
    'revenue 2023': 'revenue_2023',
    'revenue 2022': 'revenue_2022',
    'growth': 'growth',
    
    // Partner Information
    'data ai partner': 'top_data_ai_business_partner',
    'it auto partner': 'top_it_auto_app_mod_business_partner',
    'key bp': 'key_bp',
    
    // Products
    'products': 'products',
    'has coverage': 'has_coverage',  // Special field for checking non-empty coverage
    
    // Special commands
    'fields': '__show_fields',
    'list fields': '__show_fields',
    'show fields': '__show_fields',
};

class SalesDataQuery {
    constructor(data) {
        this.data = data;
        // Filter out customers without coverage
        this.customers = data.customers;
        this.products = data.products;
        
        // Get all available fields from the first customer
        if (this.customers.length > 0) {
            this.availableFields = this.getAvailableFields(this.customers[0]);
        }
    }
    
    // Helper to get all available fields including nested objects
    getAvailableFields(obj, prefix = '') {
        let fields = [];
        
        for (const [key, value] of Object.entries(obj)) {
            const fieldName = prefix ? `${prefix}.${key}` : key;
            
            fields.push(fieldName);
            
            // Handle nested objects
            if (value && typeof value === 'object' && !Array.isArray(value)) {
                fields = fields.concat(this.getAvailableFields(value, fieldName));
            }
        }
        
        return fields;
    }
    
    // Generate a complete list of fields with descriptions
    generateFieldGuide() {
        if (!this.customers || !this.customers.length) {
            return "No data available to generate field guide.";
        }
        
        const customer = this.customers[0];
        const fields = [];
        
        // Add top-level fields
        for (const [key, value] of Object.entries(customer)) {
            if (key === 'original' || key === 'products' || key === 'clean_products') continue;
            
            let type = typeof value;
            if (value === null) type = 'null';
            else if (Array.isArray(value)) type = 'array';
            
            fields.push({
                field: key,
                type,
                description: this.getFieldDescription(key),
                example: this.formatFieldExample(key, value)
            });
        }
        
        // Add original fields
        if (customer.original) {
            for (const [key, value] of Object.entries(customer.original)) {
                if (!key) continue;
                
                fields.push({
                    field: `original.${key}`,
                    type: typeof value,
                    description: this.getFieldDescription(key),
                    example: this.formatFieldExample(key, value)
                });
            }
        }
        
        // Add product fields
        if (customer.products) {
            fields.push({
                field: 'products',
                type: 'object',
                description: 'Product usage information',
                example: 'products:MQ or products:"WebSphere Application Server"'
            });
        }
        
        // Format the field guide
        fields.sort((a, b) => a.field.localeCompare(b.field));
        
        let guide = 'FIELD GUIDE:\n\n';
        guide += 'FIELD NAME | TYPE | DESCRIPTION | EXAMPLE QUERY\n';
        guide += '----------------------------------------------------------------\n';
        
        for (const field of fields) {
            guide += `${field.field} | ${field.type} | ${field.description} | ${field.example}\n`;
        }
        
        return guide;
    }
    
    // Get description for a field
    getFieldDescription(field) {
        const descriptions = {
            'name': 'Company name',
            'tech_client': 'Technical client status',
            'client_type_overwrite': 'Client type',
            'coverage_name': 'Coverage area name',
            'coverage_name_normalized': 'Normalized coverage name',
            'coverage_client_type': 'Coverage client type',
            'coverage_client_subtype': 'Coverage client subtype',
            'branch_description': 'Branch description',
            'sub_branch_description': 'Sub-branch description',
            'sub_industry_description': 'Sub-industry description',
            'industry_description': 'Industry description',
            'sector': 'Business sector',
            'employee_count': 'Number of employees',
            'it_spend_estimate': 'Estimated IT spending',
            'company_size': 'Company size category',
            'city': 'City location',
            'state': 'State location',
            'revenue_2024': '2024 revenue',
            'revenue_2023': '2023 revenue',
            'revenue_2022': '2022 revenue',
            'growth': 'Year-over-year growth percentage',
            'top_data_ai_business_partner': 'Top Data & AI Business Partner',
            'top_it_auto_app_mod_business_partner': 'Top IT Automation & App Modernization Partner',
            'key_bp': 'Key business partner',
            'products': 'Products used by the company',
            'clean_products': 'Cleaned product names',
            'original': 'Original data fields before cleaning',
            'URN NAME': 'Company name (original)',
            'Tech Client': 'Technical client status (original)',
            'Client Type Overwrite': 'Client type (original)',
            'Cov Name 1H25': 'Coverage name for 1H 2025 (original)',
            'BRNCH_DSCR 1H25': 'Branch description for 1H 2025 (original)',
            'SUB_BRNCH_DSCR 1H25': 'Sub-branch description for 1H 2025 (original)',
            'PRMRY ST PROV NAME': 'Primary state/province (original)',
            'Prmry City Name': 'Primary city name (original)',
            'TOTAL IBM REV 2024': '2024 total IBM revenue (original)',
            'TOTAL IBM REV 2023': '2023 total IBM revenue (original)',
            'TOTAL IBM REV 2022': '2022 total IBM revenue (original)'
        };
        
        return descriptions[field] || 'No description available';
    }
    
    // Format example for a field
    formatFieldExample(field, value) {
        if (field === 'name' || field === 'URN NAME') {
            return `${field}:"COMPANY NAME"`;
        } else if (field === 'city' || field === 'Prmry City Name') {
            return `${field}:Atlanta`;
        } else if (field === 'state' || field === 'PRMRY ST PROV NAME') {
            return `${field}:US-GA`;
        } else if (field === 'sector') {
            return `${field}:Industrial`;
        } else if (field.includes('revenue') || field.includes('REV')) {
            return `${field}:10000`;
        } else if (field === 'growth') {
            return `${field}:5.02`;
        } else if (field.includes('product')) {
            return `${field}:WebSphere`;
        } else {
            return `${field}:"value"`;
        }
    }

    // Helper function to clean and normalize search terms
    cleanValue(value) {
        if (!value) return '';
        return value.toString().trim().toLowerCase();
    }

    // Helper function to check if a value matches a search term
    matchesValue(value, searchTerm) {
        if (value === undefined || value === null) return false;
        
        // Convert both to clean strings for comparison
        const cleanValue = this.cleanValue(value);
        const cleanSearch = this.cleanValue(searchTerm);
        
        // Exact match has priority
        if (cleanValue === cleanSearch) {
            return true;
        }
        
        // For partial matching - more lenient approach
        if (cleanSearch && cleanValue && cleanValue.includes(cleanSearch)) {
            // Special case for city matching to avoid Johns Creek matching Atlanta
            if (cleanValue === "johns creek" && cleanSearch === "atlanta") {
                return false;
            }
            return true;
        }
        
        return false;
    }
    
    // Helper function to get a value from a nested object using dot notation
    getNestedValue(obj, path) {
        const keys = path.split('.');
        let value = obj;
        
        for (const key of keys) {
            if (value === null || value === undefined) return undefined;
            value = value[key];
        }
        
        return value;
    }

    // Parse query string into search criteria and field selection
    parseQuery(query) {
        // Show fields command
        if (query.toLowerCase() === 'show fields' || 
            query.toLowerCase() === 'fields' || 
            query.toLowerCase() === 'list fields') {
            return [{ field: '__show_fields', value: true }];
        }
        
        // Handle field:value pattern (including with spaces in value)
        const simplePatternMatch = query.match(/^(\w+(?:\.\w+)*):(.+)$/);
        if (simplePatternMatch) {
            const [, field, value] = simplePatternMatch;
            return {
                criteria: [{
                    field: field.trim(),
                    value: value.trim().replace(/^"|"$/g, '')  // Remove quotes if present
                }],
                selectedFields: null
            };
        }
        
        // Handle field=value pattern (alternative syntax)
        const equalsPatternMatch = query.match(/^(\w+(?:\.\w+)*)\s*=\s*(.+)$/);
        if (equalsPatternMatch) {
            const [, field, value] = equalsPatternMatch;
            return {
                criteria: [{
                    field: field.trim(),
                    value: value.trim().replace(/^"|"$/g, '')  // Remove quotes if present
                }],
                selectedFields: null
            };
        }
        
        // Handle space-separated field value pairs without quotes
        // This is a special case for simple field-value pairs without any operators
        if (!query.includes('"') && !query.includes("'") && 
            !query.toLowerCase().includes('select') && !query.toLowerCase().includes('where')) {
            
            const parts = query.split(/\s+/);
            if (parts.length === 2) {
                return {
                    criteria: [{
                        field: parts[0].trim(),
                        value: parts[1].trim()
                    }],
                    selectedFields: null
                };
            }
        }
        
        // Define natural language patterns
        const naturalLanguagePatterns = [
            // Branch/territory patterns
            { regex: /show me all (?:companies|accounts) in (.*) (?:branch|territory)/i, field: 'branch_description' },
            { regex: /find (?:companies|accounts) in (.*) (?:branch|territory)/i, field: 'branch_description' },
            { regex: /(?:companies|accounts) in (.*) (?:branch|territory)/i, field: 'branch_description' },
            
            // Coverage patterns
            { regex: /show me all (?:companies|accounts) in (.*) coverage/i, field: 'coverage_name' },
            { regex: /find (?:companies|accounts) in (.*) coverage/i, field: 'coverage_name' },
            { regex: /(?:companies|accounts) in (.*) coverage/i, field: 'coverage_name' },
            
            // Revenue patterns
            { regex: /show me (?:companies|accounts) with revenue over \$?([0-9,]+)/i, field: 'revenue_threshold', isSpecial: true },
            { regex: /find (?:companies|accounts) with revenue over \$?([0-9,]+)/i, field: 'revenue_threshold', isSpecial: true },
            { regex: /(?:companies|accounts) with revenue over \$?([0-9,]+)/i, field: 'revenue_threshold', isSpecial: true },
            
            // Growth patterns
            { regex: /show me (?:companies|accounts) with growth over ([0-9.]+)%?/i, field: 'growth_threshold', isSpecial: true },
            { regex: /find (?:companies|accounts) with growth over ([0-9.]+)%?/i, field: 'growth_threshold', isSpecial: true },
            { regex: /(?:companies|accounts) with growth over ([0-9.]+)%?/i, field: 'growth_threshold', isSpecial: true },
            
            // Product patterns
            { regex: /show me (?:companies|accounts) with (.*) product/i, field: 'products' },
            { regex: /find (?:companies|accounts) with (.*) product/i, field: 'products' },
            { regex: /(?:companies|accounts) with (.*) product/i, field: 'products' },
            { regex: /who uses (.*)/i, field: 'products' },
            { regex: /which (?:companies|accounts) use (.*)/i, field: 'products' },
            
            // Tech client patterns
            { regex: /show me (?:all )?(.*) (?:tech clients|tech companies)/i, field: 'tech_client' },
            { regex: /find (?:all )?(.*) (?:tech clients|tech companies)/i, field: 'tech_client' },
            
            // Industry patterns
            { regex: /show me (?:companies|accounts) in (.*) industry/i, field: 'industry_description' },
            { regex: /find (?:companies|accounts) in (.*) industry/i, field: 'industry_description' },
            { regex: /(?:companies|accounts) in (.*) industry/i, field: 'industry_description' }
        ];
        
        for (const pattern of naturalLanguagePatterns) {
            const match = query.match(pattern.regex);
            if (match && match[1]) {
                // Handle special case patterns
                if (pattern.isSpecial) {
                    if (pattern.field === 'revenue_threshold') {
                        // Extract numeric value and remove commas
                        const threshold = parseFloat(match[1].replace(/,/g, ''));
                        return {
                            criteria: [{
                                field: 'revenue_2024',
                                value: threshold,
                                operator: '>='
                            }],
                            selectedFields: null
                        };
                    } else if (pattern.field === 'growth_threshold') {
                        // Extract numeric value
                        const threshold = parseFloat(match[1]);
                        return {
                            criteria: [{
                                field: 'growth',
                                value: threshold,
                                operator: '>='
                            }],
                            selectedFields: null
                        };
                    }
                }
                
                // For other patterns, do direct field matching
                return {
                    criteria: [{
                        field: pattern.field,
                        value: match[1].trim()
                    }],
                    selectedFields: null
                };
            }
        }
        
        // Parse remaining query parts
        const parts = query.split(/\s+(?=(?:[^"]*"[^"]*")*[^"]*$)/);
        const criteria = [];
        const selectedFields = new Set();
        let i = 0;
        let selectMode = false;
        
        // Check if the first part is a selection command
        if (parts[0]?.toLowerCase() === 'select') {
            selectMode = true;
            i = 1;  // Skip the "select" part
        }
        
        for (; i < parts.length; i++) {
            const part = parts[i].toLowerCase();
            
            // Check for special commands
            if (part === 'fields' || part === 'list fields' || part === 'show fields') {
                return [{ field: '__show_fields', value: true }];
            }
            
            // Handle select mode
            if (selectMode) {
                // If we reach "where", we switch to criteria mode
                if (part === 'where') {
                    selectMode = false;
                    continue;
                }
                
                // Add field to selected fields
                if (part !== 'from') {
                    // If it's a field mapping, use the mapped field
                    const mappedField = FIELD_MAPPINGS[part];
                    if (mappedField) {
                        selectedFields.add(mappedField);
                    } else {
                        // Try to match with available fields
                        const matchingField = this.availableFields.find(field => 
                            this.cleanValue(field) === part || field === part
                        );
                        
                        if (matchingField) {
                            selectedFields.add(matchingField);
                        } else {
                            // If no match, just add the part as is
                            selectedFields.add(part);
                        }
                    }
                }
                continue;
            }
            
            // Check if this part is a field name
            let foundField = false;
            for (const [fieldName, fieldKey] of Object.entries(FIELD_MAPPINGS)) {
                if (part === fieldName) {
                    // Get the value (next part or until next field)
                    let value = parts[i + 1];
                    if (value && value.startsWith('"') && value.endsWith('"')) {
                        value = value.slice(1, -1); // Remove quotes
                    }
                    
                    if (value) {
                        criteria.push({
                            field: fieldKey,
                            value: value
                        });
                        i++; // Skip the value part
                        foundField = true;
                        break;
                    }
                }
            }
            
            // If no field mapping found, check if it's a direct field name
            if (!foundField && this.availableFields) {
                // First try exact match
                let directField = this.availableFields.find(field => field === part);
                
                // If no exact match, try case-insensitive match
                if (!directField) {
                    directField = this.availableFields.find(field => 
                        this.cleanValue(field) === part
                    );
                }
                
                if (directField) {
                    let value = parts[i + 1];
                    if (value && value.startsWith('"') && value.endsWith('"')) {
                        value = value.slice(1, -1); // Remove quotes
                    }
                    
                    if (value) {
                        criteria.push({
                            field: directField,
                            value: value
                        });
                        i++; // Skip the value part
                        foundField = true;
                    }
                }
            }
        }
        
        return {
            criteria,
            selectedFields: selectedFields.size > 0 ? Array.from(selectedFields) : null
        };
    }

    // Execute search based on criteria
    search(queryParams) {
        // Handle direct command to show fields
        if (Array.isArray(queryParams) && queryParams.length === 1 && queryParams[0].field === '__show_fields') {
            return { command: 'show_fields', fields: this.availableFields.sort() };
        }
        
        const { criteria, selectedFields } = queryParams;
        let results = this.customers;

        // Apply criteria
        if (criteria && criteria.length > 0) {
            results = results.filter(customer => 
                criteria.every(criterion => {
                    // Handle operators for numeric comparisons
                    if (criterion.operator) {
                        const value = customer[criterion.field];
                        const numValue = typeof value === 'string' ? parseFloat(value) : value;
                        const criterionValue = typeof criterion.value === 'string' ? 
                                              parseFloat(criterion.value) : criterion.value;
                        
                        if (isNaN(numValue) || isNaN(criterionValue)) return false;
                        
                        switch (criterion.operator) {
                            case '>': return numValue > criterionValue;
                            case '>=': return numValue >= criterionValue;
                            case '<': return numValue < criterionValue;
                            case '<=': return numValue <= criterionValue;
                            default: return numValue === criterionValue;
                        }
                    }
                    
                    // For company name searches, try to match both the name and normalized fields
                    if (criterion.field === 'name') {
                        const name = customer.name || '';
                        const originalName = customer.original && customer.original['URN NAME'] 
                                            ? customer.original['URN NAME'] : '';
                        
                        // Do case-insensitive partial matching for names
                        return this.cleanValue(name).includes(this.cleanValue(criterion.value)) || 
                               this.cleanValue(originalName).includes(this.cleanValue(criterion.value));
                    }
                    
                    // Special handling for city queries
                    if (criterion.field === 'city') {
                        // Get all possible city values from the customer record
                        const city = customer.city || '';
                        const originalCity = customer.original && customer.original['Prmry City Name'] 
                                           ? customer.original['Prmry City Name'] : '';
                        
                        const searchValue = criterion.value.toLowerCase();
                        
                        // For Atlanta, do exact matching
                        if (searchValue === 'atlanta' || searchValue === '"atlanta"') {
                            return city.toLowerCase() === 'atlanta' || 
                                   originalCity.toLowerCase() === 'atlanta';
                        }
                        
                        // For other cities, allow partial matches
                        return city.toLowerCase().includes(searchValue) || 
                               originalCity.toLowerCase().includes(searchValue);
                    }
                    
                    // Special handling for branch/territory queries
                    if (criterion.field === 'branch_description' || criterion.field === 'coverage_name') {
                        const value = customer[criterion.field] || '';
                        const originalBranch = customer.original && customer.original['BRNCH_DSCR 1H25'] 
                                              ? customer.original['BRNCH_DSCR 1H25'] : '';
                        const originalCoverage = customer.original && customer.original['Cov Name 1H25']
                                               ? customer.original['Cov Name 1H25'] : '';
                        
                        // Try to match against both cleaned and original values
                        return this.cleanValue(value).includes(this.cleanValue(criterion.value)) || 
                               this.cleanValue(originalBranch).includes(this.cleanValue(criterion.value)) ||
                               this.cleanValue(originalCoverage).includes(this.cleanValue(criterion.value));
                    }
                    
                    // Handle nested fields with dot notation
                    if (criterion.field.includes('.')) {
                        const value = this.getNestedValue(customer, criterion.field);
                        
                        // Special handling for numeric fields
                        if (typeof value === 'number') {
                            const searchNum = parseFloat(criterion.value);
                            return !isNaN(searchNum) && value === searchNum;
                        }
                        
                        return this.matchesValue(value, criterion.value);
                    }
                    
                    const value = customer[criterion.field];
                    
                    // Special handling for products
                    if (criterion.field === 'products' || criterion.field === 'clean_products') {
                        return Object.keys(value || {}).some(product => 
                            this.matchesValue(product, criterion.value)
                        );
                    }
                    
                    // Special handling for numeric fields
                    if (['revenue_2024', 'revenue_2023', 'revenue_2022', 'employee_count'].includes(criterion.field)) {
                        const searchNum = parseFloat(criterion.value);
                        const valueNum = parseFloat(value);
                        return !isNaN(searchNum) && !isNaN(valueNum) && valueNum === searchNum;
                    }
                    
                    // Special handling for growth
                    if (criterion.field === 'growth') {
                        const searchNum = parseFloat(criterion.value);
                        const valueNum = parseFloat(value);
                        return !isNaN(searchNum) && !isNaN(valueNum) && valueNum === searchNum;
                    }
                    
                    // Special handling for location field
                    if (criterion.field === 'location') {
                        const location = `${customer.city || ''}, ${customer.state || ''}`.trim();
                        return this.matchesValue(location, criterion.value);
                    }
                    
                    return this.matchesValue(value, criterion.value);
                })
            );
        }
        
        // If fields are selected, extract only those fields
        if (selectedFields) {
            return {
                count: results.length,
                fields: selectedFields,
                results: results.map(customer => {
                    const result = {};
                    
                    selectedFields.forEach(field => {
                        // Handle nested fields with dot notation
                        if (field.includes('.')) {
                            result[field] = this.getNestedValue(customer, field);
                        } else {
                            result[field] = customer[field];
                        }
                    });
                    
                    return result;
                })
            };
        }
        
        // Return full results if no fields selected
        return {
            count: results.length,
            results: results
        };
    }

    // Format results for display
    formatResults(searchResults) {
        // Handle show fields command
        if (searchResults.command === 'show_fields') {
            // Use the field guide instead of just listing field names
            return this.generateFieldGuide();
        }
        
        const { count, fields, results } = searchResults;
        
        if (count === 0) {
            return 'No customers found matching the criteria.';
        }
        
        // Calculate totals and breakdowns
        const totals = results.reduce((acc, customer) => {
            acc.revenue2024 += Number(customer.revenue_2024) || 0;
            acc.revenue2023 += Number(customer.revenue_2023) || 0;
            acc.revenue2022 += Number(customer.revenue_2022) || 0;
            acc.sectors[customer.sector] = (acc.sectors[customer.sector] || 0) + 1;
            acc.techStatus[customer.tech_client || 'N/A'] = (acc.techStatus[customer.tech_client || 'N/A'] || 0) + 1;
            acc.industries[customer.industry_description || 'N/A'] = (acc.industries[customer.industry_description || 'N/A'] || 0) + 1;
            return acc;
        }, { 
            revenue2024: 0, 
            revenue2023: 0, 
            revenue2022: 0,
            sectors: {},
            techStatus: {},
            industries: {}
        });

        // Format summary section
        let output = `=== SUMMARY (${count} customers) ===\n\n`;
        output += 'Revenue Summary:\n';
        output += `2024: $${totals.revenue2024.toLocaleString()}\n`;
        output += `2023: $${totals.revenue2023.toLocaleString()}\n`;
        output += `2022: $${totals.revenue2022.toLocaleString()}\n\n`;
        
        output += 'Sector Breakdown:\n';
        Object.entries(totals.sectors)
            .sort((a, b) => b[1] - a[1])
            .forEach(([sector, count]) => {
                output += `${sector || 'N/A'}: ${count} customers\n`;
            });
        output += '\n';

        output += 'Tech Client Status:\n';
        Object.entries(totals.techStatus)
            .sort((a, b) => b[1] - a[1])
            .forEach(([status, count]) => {
                output += `${status}: ${count} customers\n`;
            });
        output += '\n';

        output += 'Industry Breakdown:\n';
        Object.entries(totals.industries)
            .sort((a, b) => b[1] - a[1])
            .forEach(([industry, count]) => {
                output += `${industry}: ${count} customers\n`;
            });
        output += '\n';

        // Format detailed customer section
        output += '=== CUSTOMER DETAILS ===\n\n';
        
        results.forEach((customer, index) => {
            output += `CUSTOMER ${index + 1}:\n`;
            output += `Name: ${customer.name}\n`;
            output += `Location: ${customer.city}, ${customer.state}\n`;
            
            // Add coverage information
            output += `Coverage: ${customer.coverage_name || 'N/A'}\n`;
            output += `Coverage Type: ${customer.coverage_client_type || 'N/A'}\n`;
            output += `Coverage Subtype: ${customer.coverage_client_subtype || 'N/A'}\n`;
            output += `Branch: ${customer.branch_description || 'N/A'}\n`;
            output += `Sub-Branch: ${customer.sub_branch_description || 'N/A'}\n\n`;
            
            output += `Tech Client Status: ${customer.tech_client || 'N/A'}\n`;
            output += `Industry: ${customer.industry_description || 'N/A'}\n`;
            output += `Sector: ${customer.sector || 'N/A'}\n`;
            output += 'Revenue:\n';
            output += `  2024: $${Number(customer.revenue_2024).toLocaleString()}\n`;
            output += `  2023: $${Number(customer.revenue_2023).toLocaleString()}\n`;
            output += `  2022: $${Number(customer.revenue_2022).toLocaleString()}\n`;
            
            // Calculate and display growth
            const growth = customer.growth ? `${customer.growth}%` : 'N/A';
            output += `Growth: ${growth}\n`;
            
            // Format products if they exist
            if (customer.products && Object.keys(customer.products).length > 0) {
                output += '\nProducts:\n';
                Object.entries(customer.products)
                    .sort(([,a], [,b]) => b - a)  // Sort by usage count
                    .forEach(([product, count]) => {
                        output += `  - ${product}: ${count} instances\n`;
                    });
            }
            
            output += '\n-------------------\n\n';
        });

        return output;
    }
}

async function main() {
    try {
        // Load the data
        const data = JSON.parse(await fs.readFile('territory_analysis_data.json', 'utf8'));
        const queryEngine = new SalesDataQuery(data);

        // Check if input is being piped
        if (!process.stdin.isTTY) {
            // Non-interactive mode
            let input = '';
            process.stdin.on('data', chunk => {
                input += chunk;
            });
            process.stdin.on('end', () => {
                const query = input.trim();
                const queryParams = queryEngine.parseQuery(query);
                const results = queryEngine.search(queryParams);
                const output = queryEngine.formatResults(results);
                process.stdout.write('\n' + output + '\n\n', () => { process.exit(0); });
            });
            return;
        }

        // Interactive mode
        const rl = readline.createInterface({
            input: process.stdin,
            output: process.stdout,
            prompt: 'Query> '
        });

        // Handle queries
        rl.on('line', (line) => {
            if (line.toLowerCase() === 'exit') {
                console.log('Goodbye!');
                rl.close();
                process.exit(0);
            }

            try {
                const queryParams = queryEngine.parseQuery(line);
                const results = queryEngine.search(queryParams);
                console.log('\n' + queryEngine.formatResults(results) + '\n');
            } catch (error) {
                console.error('Error executing query:', error.message);
            }
            
            rl.prompt();
        });

        // Handle Ctrl+C
        rl.on('SIGINT', () => {
            console.log('\nGoodbye!');
            process.exit(0);
        });

        // Initial prompt
        console.log('\nData loaded successfully! You can now query the data.\n');
        console.log('SIMPLE QUERY PATTERNS:');
        console.log('1. field:value          - Example: city:ALPHARETTA');
        console.log('2. field=value          - Example: name=ZYCHOS');
        console.log('3. field value          - Example: sector CommCSI');
        console.log('\nQUERYING FIELDS WITH SPACES IN VALUES:');
        console.log('   city:ALPHARETTA      - Simple value');
        console.log('   sector:CommCSI       - Simple value');
        console.log('   industry_description:Media Entertainment  - Value with spaces (no quotes needed)');
        console.log('   tech_client=Potential Whitespace         - Value with spaces (no quotes needed)');
        console.log('\nCOMMANDS:');
        console.log('   show fields         - Lists all available fields with descriptions');
        console.log('   exit                - Exits the program');
        console.log('\nCOMMON FIELDS:');
        console.log('   name                - Company name (e.g., name:ZYCHOS)');
        console.log('   city                - City location (e.g., city:ALPHARETTA)');
        console.log('   state               - State location (e.g., state:USGA)');
        console.log('   sector              - Business sector (e.g., sector:CommCSI)');
        console.log('   tech_client         - Tech client status (e.g., tech_client:Potential)');
        console.log('   sub_industry_description - Sub-industry (e.g., sub_industry_description:Broadcast)');
        console.log('   industry_description - Industry (e.g., industry_description:Media)');
        console.log('\n');
        rl.prompt();

    } catch (error) {
        console.error('Error:', error.message);
        process.exit(1);
    }
}

// Start the program
main();