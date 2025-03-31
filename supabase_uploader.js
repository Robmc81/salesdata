require('dotenv').config();
const fs = require('fs').promises;
const { createClient } = require('@supabase/supabase-js');
const csv = require('csv-parse/sync');

class SupabaseUploader {
    constructor(supabaseUrl, supabaseKey) {
        this.supabase = createClient(supabaseUrl, supabaseKey);
        this.tableName = 'bps_accounts';
        this.batchSize = 100;
        this.maxRetries = 3;
        this.retryDelay = 2000; // 2 seconds
        
        // Define numeric fields
        this.numericFields = [
            'firmo_le_emp_cnt_number_of_employees',
            'total_ibm_rev_2024',
            'total_ibm_rev_2023',
            'total_ibm_rev_2022',
            'growth',
            'it_spend_estimate'
        ];
    }

    // Sleep function for delays
    sleep(ms) {
        return new Promise(resolve => setTimeout(resolve, ms));
    }

    // Retry logic for uploads
    async retryOperation(operation, retryCount = 0) {
        try {
            return await operation();
        } catch (error) {
            // Check if it's a network error
            const isNetworkError = error.message?.includes('fetch failed') || 
                                 error.message?.includes('network') ||
                                 error.message?.includes('ECONNRESET') ||
                                 error.message?.includes('timeout');

            if (retryCount < this.maxRetries) {
                const delay = isNetworkError ? this.retryDelay * 2 : this.retryDelay;
                console.log(`Attempt ${retryCount + 1} failed${isNetworkError ? ' (network error)' : ''}, retrying in ${delay/1000} seconds...`);
                await this.sleep(delay);
                return this.retryOperation(operation, retryCount + 1);
            }
            throw error;
        }
    }

    // Clean and validate a record before upload
    cleanRecord(record) {
        const cleanedRecord = {};
        
        for (const [key, value] of Object.entries(record)) {
            // Handle numeric fields
            if (this.numericFields.includes(key)) {
                if (value === '' || value === null || value === undefined) {
                    cleanedRecord[key] = null;
                } else {
                    try {
                        // First, convert to string and trim
                        let numStr = value.toString().trim();
                        // Remove currency symbols, commas, and any remaining whitespace
                        numStr = numStr.replace(/[$,\s]/g, '');
                        // Parse as float
                        const num = parseFloat(numStr);
                        if (isNaN(num)) {
                            throw new Error(`Could not parse value: ${value}`);
                        }
                        cleanedRecord[key] = num;
                    } catch (error) {
                        console.error(`Invalid numeric value in field ${key}:`, value);
                        console.error('Original record:', record);
                        throw new Error(`Invalid numeric value in field ${key}: ${value}`);
                    }
                }
            }
            // Handle boolean fields (product flags)
            else if (typeof value === 'string' && (value.toLowerCase() === 'true' || value.toLowerCase() === 'false')) {
                cleanedRecord[key] = value.toLowerCase() === 'true';
            }
            // Handle empty strings
            else if (value === '') {
                cleanedRecord[key] = null;
            }
            // Keep other values as is
            else {
                cleanedRecord[key] = value;
            }
        }
        
        return cleanedRecord;
    }

    async uploadFile(csvFilePath, startBatch = 0) {
        try {
            console.log(`Reading file: ${csvFilePath}`);
            const fileContent = await fs.readFile(csvFilePath, 'utf-8');
            
            console.log('Parsing CSV...');
            const records = csv.parse(fileContent, {
                columns: true,
                skip_empty_lines: true,
                trim: true
            });

            console.log(`Found ${records.length} records to upload`);
            
            // Clean and validate all records
            console.log('Cleaning and validating records...');
            const cleanedRecords = [];
            for (let i = 0; i < records.length; i++) {
                try {
                    const cleanedRecord = this.cleanRecord(records[i]);
                    cleanedRecords.push(cleanedRecord);
                } catch (error) {
                    console.error(`Error cleaning record ${i + 1}:`, error.message);
                    console.error('Problematic record:', records[i]);
                    process.exit(1);
                }
            }
            
            // Split records into smaller batches
            const batches = this.chunkArray(cleanedRecords, this.batchSize);
            console.log(`Split into ${batches.length} batches of ${this.batchSize} records each`);
            if (startBatch > 0) {
                console.log(`Resuming from batch ${startBatch}`);
            }

            let successCount = 0;
            let errorCount = 0;
            const errors = [];
            const failedBatches = [];

            // Process each batch
            for (let i = startBatch; i < batches.length; i++) {
                const batch = batches[i];
                let retries = 0;
                const maxBatchRetries = 3;

                while (retries < maxBatchRetries) {
                    try {
                        console.log(`\nUploading batch ${i + 1} of ${batches.length}...`);
                        console.log(`Progress: ${((i + 1) / batches.length * 100).toFixed(2)}%`);
                        
                        // Use retry logic for the upload
                        const { data, error } = await this.retryOperation(async () => {
                            return await this.supabase
                                .from(this.tableName)
                                .insert(batch)
                                .select();
                        });

                        if (error) {
                            if (retries < maxBatchRetries - 1) {
                                console.error(`\nError in batch ${i + 1}, attempt ${retries + 1}:`, error);
                                console.log(`Retrying batch ${i + 1} in 5 seconds...`);
                                await this.sleep(5000);
                                retries++;
                                continue;
                            }
                            console.error(`\nError in batch ${i + 1} after ${maxBatchRetries} attempts:`, error);
                            console.error('First record in problematic batch:', batch[0]);
                            errorCount += batch.length;
                            errors.push({
                                batch: i + 1,
                                error: error.message,
                                details: error.details,
                                sampleData: batch[0]
                            });
                            failedBatches.push({ index: i, batch });
                            
                            // Save progress
                            console.log(`\nSaving progress... Last successful batch: ${i}`);
                            await fs.writeFile('upload_progress.json', JSON.stringify({ 
                                lastBatch: i,
                                successCount,
                                errorCount,
                                errors,
                                timestamp: new Date().toISOString()
                            }));
                            
                            process.exit(1);
                        } else {
                            console.log(`✓ Successfully uploaded batch ${i + 1}`);
                            successCount += batch.length;
                            break;
                        }

                        // Add a small delay between batches
                        await this.sleep(1000);
                    } catch (error) {
                        if (retries < maxBatchRetries - 1) {
                            console.error(`\nError processing batch ${i + 1}, attempt ${retries + 1}:`, error);
                            console.log(`Retrying batch ${i + 1} in 5 seconds...`);
                            await this.sleep(5000);
                            retries++;
                            continue;
                        }
                        console.error(`\nError processing batch ${i + 1} after ${maxBatchRetries} attempts:`, error);
                        console.error('First record in problematic batch:', batch[0]);
                        errorCount += batch.length;
                        errors.push({
                            batch: i + 1,
                            error: error.message,
                            sampleData: batch[0]
                        });
                        failedBatches.push({ index: i, batch });
                        
                        // Save progress
                        console.log(`\nSaving progress... Last successful batch: ${i}`);
                        await fs.writeFile('upload_progress.json', JSON.stringify({ 
                            lastBatch: i,
                            successCount,
                            errorCount,
                            errors,
                            timestamp: new Date().toISOString()
                        }));
                        
                        process.exit(1);
                    }
                }
            }

            return {
                totalRecords: records.length,
                successCount,
                errorCount,
                errors
            };

        } catch (error) {
            console.error('Error uploading file:', error);
            throw error;
        }
    }

    // Helper method to split array into chunks
    chunkArray(array, chunkSize) {
        const chunks = [];
        for (let i = 0; i < array.length; i += chunkSize) {
            chunks.push(array.slice(i, i + chunkSize));
        }
        return chunks;
    }

    // Method to verify the upload
    async verifyUpload() {
        try {
            const { count, error } = await this.supabase
                .from(this.tableName)
                .select('*', { count: 'exact', head: true });

            if (error) {
                throw error;
            }

            return count;
        } catch (error) {
            console.error('Error verifying upload:', error);
            throw error;
        }
    }
}

async function main() {
    try {
        // Load Supabase credentials from .env file
        const supabaseUrl = process.env.SUPABASE_URL;
        const supabaseKey = process.env.SUPABASE_KEY;

        if (!supabaseUrl || !supabaseKey) {
            throw new Error('Missing Supabase credentials. Please check your .env file.');
        }

        const uploader = new SupabaseUploader(supabaseUrl, supabaseKey);
        const csvFiles = process.argv.slice(2);

        if (csvFiles.length === 0) {
            console.log('Please provide CSV files to upload.');
            console.log('Usage: node supabase_uploader.js file1.csv file2.csv ...');
            process.exit(1);
        }

        // Check for progress file
        let startBatch = 0;
        try {
            const progress = JSON.parse(await fs.readFile('upload_progress.json', 'utf-8'));
            if (progress.lastBatch >= 0) {
                const timestamp = new Date(progress.timestamp);
                const now = new Date();
                const hoursSinceLastUpload = (now - timestamp) / (1000 * 60 * 60);
                
                if (hoursSinceLastUpload < 24) {  // Only resume if progress is less than 24 hours old
                    startBatch = progress.lastBatch + 1;
                    console.log(`Found previous upload progress from ${progress.timestamp}`);
                    console.log(`Resuming from batch ${startBatch}`);
                } else {
                    console.log('Previous upload progress is too old, starting fresh');
                }
            }
        } catch (error) {
            // No progress file or invalid format, start from beginning
            console.log('Starting fresh upload');
        }

        console.log(`Starting upload of ${csvFiles.length} files...`);

        for (const file of csvFiles) {
            console.log(`\nProcessing ${file}...`);
            const result = await uploader.uploadFile(file, startBatch);
            
            console.log('\nUpload Results:');
            console.log(`Total Records: ${result.totalRecords}`);
            console.log(`Successfully Uploaded: ${result.successCount}`);
            console.log(`Failed: ${result.errorCount}`);
            
            if (result.errors.length > 0) {
                console.log('\nErrors:');
                result.errors.forEach(error => {
                    console.log(`Batch ${error.batch}: ${error.error}`);
                    if (error.details) {
                        console.log('Details:', error.details);
                    }
                    console.log('Sample data from failing batch:', error.sampleData);
                });
            }
        }

        // Verify final count
        const finalCount = await uploader.verifyUpload();
        console.log(`\nFinal record count in Supabase: ${finalCount}`);

    } catch (error) {
        console.error('Error:', error.message);
        process.exit(1);
    }
}

// Start the upload if run directly
if (require.main === module) {
    main();
} 