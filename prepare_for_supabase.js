const fs = require('fs').promises;
const fsSync = require('fs');
const csv = require('csv-parse/sync');
const { stringify } = require('csv-stringify/sync');

class DataPreparation {
    constructor() {
        this.cleanFieldName = (name) => {
            if (!name || name.trim() === '') return null;
            return name.toLowerCase()
                .replace(/[^a-z0-9_]/g, '_')
                .replace(/_{2,}/g, '_')
                .replace(/^_|_$/g, '')
                .trim();
        };

        // Define numeric fields
        this.numericFields = [
            'firmo_le_emp_cnt_number_of_employees',
            'total_ibm_rev_2024',
            'total_ibm_rev_2023',
            'total_ibm_rev_2022',
            'growth'
        ];
    }

    async prepareForSupabase(inputFile, outputFile) {
        try {
            console.log('Reading input file...');
            const fileContent = await fs.readFile(inputFile, 'utf-8');
            
            console.log('Parsing CSV...');
            const records = csv.parse(fileContent, {
                columns: true,
                skip_empty_lines: true,
                trim: true,
                relax_column_count: true
            });

            if (records.length === 0) {
                throw new Error('No records found in CSV');
            }

            // Get and clean column names, removing empty columns
            const originalColumns = Object.keys(records[0])
                .filter(col => col && col.trim() !== '');
            
            const cleanColumns = originalColumns
                .map(this.cleanFieldName)
                .filter(name => name !== null);
            
            // Create column mapping, excluding empty columns
            const columnMap = {};
            originalColumns.forEach((col) => {
                const cleanName = this.cleanFieldName(col);
                if (cleanName !== null) {
                    columnMap[col] = cleanName;
                }
            });

            console.log('\nColumn mapping:');
            console.log(columnMap);
            console.log('\nTotal columns:', cleanColumns.length);

            // Transform data
            console.log('\nTransforming data...');
            const transformedRecords = records.map((record, index) => {
                const newRecord = {};
                cleanColumns.forEach(cleanCol => {
                    // Find original column name
                    const originalCol = originalColumns.find(col => this.cleanFieldName(col) === cleanCol);
                    if (!originalCol) return;
                    
                    let value = record[originalCol];
                    
                    // Clean and transform values
                    let cleanValue = value;
                    
                    // Handle numeric fields
                    if (this.numericFields.includes(cleanCol)) {
                        if (value === '' || value === null || value === undefined) {
                            cleanValue = null;
                        } else {
                            const numStr = value.toString().replace(/[$,]/g, '');
                            const num = parseFloat(numStr);
                            cleanValue = isNaN(num) ? null : num;
                        }
                    }
                    // Handle boolean fields (product flags)
                    else if (typeof value === 'string' && (value.toLowerCase() === 'true' || value.toLowerCase() === 'false')) {
                        cleanValue = value.toLowerCase() === 'true';
                    }
                    // Handle empty strings
                    else if (value === '' || value === undefined) {
                        cleanValue = null;
                    }
                    
                    newRecord[cleanCol] = cleanValue;
                });

                // Validate record
                const recordFields = Object.keys(newRecord).length;
                if (recordFields !== cleanColumns.length) {
                    console.warn(`Warning: Record ${index + 1} has ${recordFields} fields instead of ${cleanColumns.length}`);
                }

                return newRecord;
            });

            // Create table schema SQL
            const schemaSQL = this.generateSchemaSQL(transformedRecords[0]);
            await fs.writeFile('schema.sql', schemaSQL);
            console.log('\nSchema SQL generated in schema.sql');

            // Write the cleaned data to a single CSV file
            console.log('\nWriting cleaned data...');
            const csvOutput = stringify(transformedRecords, {
                header: true,
                columns: cleanColumns,
                quoted: true,
                quoted_empty: true,
                record_delimiter: '\n',
                cast: {
                    string: value => value === null ? '' : String(value),
                    number: value => value === null ? '' : String(value)
                }
            });

            await fs.writeFile(outputFile, csvOutput);
            
            // Verify the output file
            const writtenContent = await fs.readFile(outputFile, 'utf-8');
            const writtenLines = writtenContent.split('\n');
            const headerCount = writtenLines[0].split(',').length;
            
            if (headerCount !== cleanColumns.length) {
                throw new Error(`Output file has incorrect header count: ${headerCount} vs ${cleanColumns.length}`);
            }

            console.log(`\nProcessing complete!
Output files:
- schema.sql: SQL schema for creating the table
- ${outputFile}: Cleaned CSV ready for Supabase import

Next steps:
1. Create the table in Supabase using schema.sql
2. Use supabase_uploader.js to import the data\n`);

            return {
                recordCount: transformedRecords.length,
                columns: cleanColumns
            };

        } catch (error) {
            console.error('Error preparing data:', error);
            throw error;
        }
    }

    generateSchemaSQL(sampleRecord) {
        const typeMap = {
            string: 'text',
            number: 'numeric',
            boolean: 'boolean'
        };

        const columns = Object.entries(sampleRecord).map(([key, value]) => {
            const type = typeMap[typeof value] || 'text';
            return `    ${key} ${type}`;
        });

        return `-- Create table for BPS Accounts
CREATE TABLE bps_accounts (
    id bigint GENERATED BY DEFAULT AS IDENTITY PRIMARY KEY,
${columns.join(',\n')},
    created_at timestamp with time zone DEFAULT timezone('utc'::text, now()) NOT NULL,
    updated_at timestamp with time zone DEFAULT timezone('utc'::text, now()) NOT NULL
);

-- Create updated_at trigger
CREATE TRIGGER set_updated_at
    BEFORE UPDATE ON bps_accounts
    FOR EACH ROW
    EXECUTE FUNCTION public.set_updated_at();

-- Create indexes for commonly queried fields
CREATE INDEX idx_bps_accounts_urn_name ON bps_accounts(urn_name);
CREATE INDEX idx_bps_accounts_tech_client ON bps_accounts(tech_client);
CREATE INDEX idx_bps_accounts_sector ON bps_accounts(sector);
CREATE INDEX idx_bps_accounts_prmry_city_name ON bps_accounts(prmry_city_name);
CREATE INDEX idx_bps_accounts_prmry_st_prov_name ON bps_accounts(prmry_st_prov_name);`;
    }
}

async function main() {
    try {
        const prep = new DataPreparation();
        const inputFile = 'BPS Accounts - US Hub 07. AL-GA-MS Acct Universe 1Q25 Feb (1).csv';
        const outputFile = 'supabase_bps_accounts.csv';
        
        console.log('Starting data preparation...');
        const result = await prep.prepareForSupabase(inputFile, outputFile);
        
        console.log(`\nProcessed ${result.recordCount} total records`);
        console.log('\nColumns:', result.columns);
        
    } catch (error) {
        console.error('Error:', error.message);
        process.exit(1);
    }
}

main(); 
main(); 