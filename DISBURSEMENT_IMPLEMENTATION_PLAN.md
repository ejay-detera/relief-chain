# Disbursement System Implementation Plan

## Current Status

### ✅ What Works:
1. **UI Components**: DistributeAidWizard exists with full flow
2. **Edge Functions**: `prepare-disbursement` and `submit-disbursement` exist
3. **Database Tables**: `distribution_jobs`, `distribution_recipients`, `beneficiary_balance_projection` exist
4. **Client Service**: `distribution-service.ts` properly calls Edge Functions
5. **Stellar Transactions**: Manual script successfully transfers RCPHP on-chain

### ❌ What Needs Verification/Fixing:
1. **Edge Function Implementation**: Need to verify the Edge Functions actually execute Stellar transactions
2. **Reconciliation System**: The `reconcile-stellar` Edge Function needs to run to update balance projections
3. **Trigger Automation**: Balance projections require reconciliation runs (strict validation)

---

## Implementation Tasks

### Phase 1: Verify Edge Functions (Priority: HIGH)

**Files to Check:**
- `supabase/functions/prepare-disbursement/index.ts`
- `supabase/functions/submit-disbursement/index.ts`

**What to Verify:**
1. Edge Functions properly load organization treasury wallet secret
2. Edge Functions build and sign Stellar transactions
3. Edge Functions submit to Horizon API
4. Edge Functions create proper database records in `distribution_jobs` and `distribution_recipients`
5. Error handling for wallet not found, insufficient balance, etc.

**Testing:**
```typescript
// Test prepare-disbursement
POST /functions/v1/prepare-disbursement
{
  "programId": "test-program-id",
  "recipients": [{
    "beneficiaryProfileId": "user-id",
    "amountStroops": 10000000000
  }]
}

// Test submit-disbursement
POST /functions/v1/submit-disbursement
{
  "jobId": "prepared-job-id",
  "mode": "authorize"
}
```

---

### Phase 2: Reconciliation System (Priority: HIGH)

**Files to Check:**
- `supabase/functions/reconcile-stellar/index.ts`

**What Reconciliation Does:**
1. Scans Stellar ledger for confirmed transactions
2. Matches transactions to distribution jobs by memo/correlation ID
3. Updates `beneficiary_balance_projection` table
4. Creates `reconciliation_runs` records
5. Flags stale/quarantined states

**Current Problem:**
- Balance projections require a valid `reconciliation_run_id`
- Trigger `beneficiary_balance_projection_validate` enforces strict validation
- Manual workaround: temporarily disable trigger, insert dummy reconciliation run

**Proper Solution:**
1. Set up automated reconciliation cron job or trigger
2. Reconciliation should run after each disbursement completes
3. OR: Make reconciliation part of the disbursement flow itself

**Implementation Options:**

**Option A: Post-Disbursement Hook**
```typescript
// In submit-disbursement Edge Function
await submitToStellar(transaction);

// Immediately trigger reconciliation for this specific transaction
await triggerReconciliation({
  organizationId,
  programId,
  transactionHash: result.hash,
  ledgerSequence: result.ledger
});
```

**Option B: Scheduled Reconciliation**
```sql
-- Set up pg_cron or Supabase cron
SELECT cron.schedule(
  'reconcile-stellar',
  '*/5 * * * *', -- Every 5 minutes
  $$
  SELECT net.http_post(
    'https://your-project.supabase.co/functions/v1/reconcile-stellar',
    '{}'::jsonb
  )
  $$
);
```

**Option C: Real-time Stellar Stream**
- Use Stellar's event stream to listen for transactions
- Update projections in real-time as transactions confirm
- Most robust but most complex

---

### Phase 3: Simplified Testing Mode (Priority: MEDIUM)

**Problem:**
- Current system requires full reconciliation infrastructure
- Makes testing slow and complex
- Manual workarounds are error-prone

**Solution: Add "Test Mode" Flag**

```typescript
// In Edge Functions
const isTestMode = Deno.env.get('ENABLE_TEST_MODE') === 'true';

if (isTestMode) {
  // Skip reconciliation requirement
  // Allow manual balance updates
  // Use dummy reconciliation run IDs
  await db.query(`
    INSERT INTO beneficiary_balance_projection (...)
    VALUES (...)
    -- No reconciliation_run_id validation in test mode
  `);
}
```

**Benefits:**
- Faster development/testing cycles
- Can test disbursement without waiting for reconciliation
- Still execute real Stellar transactions
- Production mode enforces full reconciliation

---

### Phase 4: Auto-Disburse on Enrollment (Priority: MEDIUM)

**Current Workflow:**
1. Admin enrolls beneficiary → Creates `enrollments` record
2. Admin separately clicks "Distribute Aid" → Executes disbursement

**Improved Workflow:**
1. Admin enrolls beneficiary with checkbox:
   - ☑ **Disburse funds immediately**
2. System automatically triggers disbursement if checked

**Implementation:**

**UI Changes:**
```typescript
// In enrollment approval modal
<Checkbox
  label="Disburse allocated funds immediately"
  checked={autoDis burse}
  onChange={setAutoDisburse}
/>
```

**API Changes:**
```typescript
// In enrollment service
async function approveEnrollment(enrollmentId, options) {
  await updateEnrollment(enrollmentId, { status: 'Approved' });
  
  if (options.autoDisburse) {
    // Automatically prepare and authorize disbursement
    const prepared = await prepareDistribution({
      programId: enrollment.programId,
      recipients: [{
        beneficiaryProfileId: enrollment.beneficiaryId,
        amountStroops: enrollment.allocationAmountStroops
      }]
    });
    
    await authorizeDistribution({ jobId: prepared.jobId });
  }
}
```

---

### Phase 5: Balance Display Improvements (Priority: LOW)

**Current Issue:**
- Beneficiary sees 0.00 RCPHP until reconciliation runs
- Confusing UX - they were just approved/enrolled

**Solution: Show "Pending" State**

```typescript
type BalanceState = 
  | { status: 'loading' }
  | { status: 'available'; amount: bigint }
  | { status: 'pending'; expectedAmount: bigint } // NEW
  | { status: 'error'; message: string };

// Check for pending disbursements
const pendingDisbursements = await fetchPendingDisbursements(userId);
if (pendingDisbursements.length > 0) {
  return {
    status: 'pending',
    expectedAmount: sum(pendingDisbursements.map(d => d.amount))
  };
}
```

**UI:**
```tsx
{balance.status === 'pending' && (
  <View>
    <Text>Pending: {formatRCPHP(balance.expectedAmount)}</Text>
    <Text style={styles.hint}>
      Funds are being transferred on Stellar. 
      This usually takes 5-10 seconds.
    </Text>
  </View>
)}
```

---

## Testing Checklist

### Manual Testing (Use Current Workaround):
- [x] Manual script transfers RCPHP successfully
- [x] Balance projection updates correctly
- [ ] Beneficiary app shows updated balance
- [ ] QR code payment flow works end-to-end

### Edge Function Testing:
- [ ] `prepare-disbursement` creates distribution job
- [ ] `submit-disbursement` executes Stellar transaction
- [ ] Transaction appears on Stellar Expert
- [ ] Database records created correctly

### Reconciliation Testing:
- [ ] Manual reconciliation run updates projections
- [ ] Automated reconciliation runs on schedule
- [ ] Stale/quarantine states handled correctly

### Integration Testing:
- [ ] Full flow: Enroll → Disburse → Reconcile → Balance shown
- [ ] Retry failed distributions
- [ ] Handle insufficient balance gracefully
- [ ] Handle wallet not found gracefully

---

## Rollout Plan

### Phase 1: Immediate (Today)
- ✅ Manual script for testing
- [ ] Verify Edge Functions work
- [ ] Test one full disbursement via UI

### Phase 2: Short-term (This Week)
- [ ] Set up basic reconciliation (Option A or B)
- [ ] Test auto-reconciliation after disbursement
- [ ] Document any issues found

### Phase 3: Medium-term (Next Week)
- [ ] Implement test mode for easier development
- [ ] Add auto-disburse on enrollment approval
- [ ] Improve error messages and UX

### Phase 4: Long-term (Future)
- [ ] Real-time Stellar stream reconciliation
- [ ] Advanced retry logic
- [ ] Batch disbursement optimization
- [ ] Analytics and reporting

---

## Questions to Answer

1. **Do the Edge Functions actually work?** → Test via Supabase UI or curl
2. **Is reconciliation running?** → Check `reconciliation_runs` table
3. **Why strict validation?** → Security/auditability, can relax for test mode
4. **Can we bypass reconciliation for testing?** → Yes, with test mode flag

---

## Conclusion

The disbursement system architecture is solid, but needs:
1. **Verification** that Edge Functions execute Stellar transactions
2. **Reconciliation** setup (automated or triggered)
3. **Testing workflow** improvements (test mode, better UX)

The manual script proves the Stellar integration works. Now we need to verify the automated Edge Function path works the same way.
