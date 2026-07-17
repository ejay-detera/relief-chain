DO $$ 
BEGIN
  -- Disable the mutation validation trigger temporarily
  ALTER TABLE transaction_attempts DISABLE TRIGGER transaction_attempts_validate_mutation;

  -- Update the attempt status back to 'submitted' so the reconciler will pick it up
  UPDATE transaction_attempts 
  SET status = 'submitted' 
  WHERE distribution_job_id = '16b58ccf-7851-49f6-9543-6dbef1aad8e7';

  -- Re-enable the trigger
  ALTER TABLE transaction_attempts ENABLE TRIGGER transaction_attempts_validate_mutation;

  -- Revert the distribution job to reconciling
  UPDATE distribution_jobs
  SET status = 'reconciling'
  WHERE id = '16b58ccf-7851-49f6-9543-6dbef1aad8e7';

  -- Delete the manually forced projection so it can be re-calculated correctly from the blockchain
  DELETE FROM beneficiary_balance_projection 
  WHERE program_id = '39b2b029-0c82-4901-94f9-2ce7e5279587' 
    AND projection_version >= 2;
END; 
$$;
