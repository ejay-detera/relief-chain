UPDATE transaction_attempts SET status = 'submitted' WHERE distribution_job_id = '16b58ccf-7851-49f6-9543-6dbef1aad8e7';
UPDATE distribution_recipients SET status = 'processing' WHERE distribution_job_id = '16b58ccf-7851-49f6-9543-6dbef1aad8e7';
UPDATE distribution_jobs SET status = 'reconciling', confirmed_count = 0, failed_count = 0, submitted_count = 6 WHERE id = '16b58ccf-7851-49f6-9543-6dbef1aad8e7';
