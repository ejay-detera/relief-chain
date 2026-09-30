import assert from 'node:assert/strict';
import { Buffer } from 'node:buffer';
import { readFile } from 'node:fs/promises';
import test from 'node:test';
import ts from 'typescript';

const transpile = async (source) => {
  const { outputText, diagnostics = [] } = ts.transpileModule(source, {
    compilerOptions: { module: ts.ModuleKind.ESNext, target: ts.ScriptTarget.ES2022 },
    reportDiagnostics: true,
  });
  assert.equal(diagnostics.length, 0);
  return import(`data:text/javascript;base64,${Buffer.from(outputText).toString('base64')}`);
};

const source = await readFile(
  new URL('../../src/utils/program-applicability.ts', import.meta.url),
  'utf8',
);
const { filterPrograms, isLocationEligible, isProgramApplicable } = await transpile(source);

test('isProgramApplicable: returns true when program matches location, is open, and beneficiary has no prior approval', () => {
  const applicable = isProgramApplicable({
    isEligibleByLocation: true,
    existingEnrollmentStatus: null,
    registrationStatus: 'Open',
  });
  assert.equal(applicable, true);
});

test('isProgramApplicable: returns false when beneficiary is not eligible by location (not applicable to their area)', () => {
  const applicable = isProgramApplicable({
    isEligibleByLocation: false,
    existingEnrollmentStatus: null,
    registrationStatus: 'Open',
  });
  assert.equal(applicable, false);
});

test('isProgramApplicable: returns false when beneficiary already has an Approved enrollment', () => {
  const applicable = isProgramApplicable({
    isEligibleByLocation: true,
    existingEnrollmentStatus: 'Approved',
    registrationStatus: 'Open',
  });
  assert.equal(applicable, false);
});

test('isProgramApplicable: returns false when registration is Closed', () => {
  const applicable = isProgramApplicable({
    isEligibleByLocation: true,
    existingEnrollmentStatus: null,
    registrationStatus: 'Closed',
  });
  assert.equal(applicable, false);
});

test('isProgramApplicable: returns true when registration is Not Yet Open but program is in beneficiary area', () => {
  const applicable = isProgramApplicable({
    isEligibleByLocation: true,
    existingEnrollmentStatus: null,
    registrationStatus: 'Not Yet Open',
  });
  assert.equal(applicable, true);
});

test('isProgramApplicable: returns true when beneficiary has a Pending application in their area', () => {
  const applicable = isProgramApplicable({
    isEligibleByLocation: true,
    existingEnrollmentStatus: 'Pending',
    registrationStatus: 'Open',
  });
  assert.equal(applicable, true);
});

test('isLocationEligible: correctly evaluates barangay, area, and open-to-all criteria', () => {
  // Open to all (no restrictions)
  assert.equal(
    isLocationEligible({
      assignedBarangayIds: [],
      assignedAreaIds: [],
      beneficiaryBarangayId: 10,
      beneficiaryAreaId: 5,
    }),
    true
  );
  assert.equal(
    isLocationEligible({
      assignedBarangayIds: [],
      assignedAreaIds: [],
      beneficiaryBarangayId: null,
      beneficiaryAreaId: null,
    }),
    true
  );

  // Barangay-specific program
  assert.equal(
    isLocationEligible({
      assignedBarangayIds: [10, 11],
      assignedAreaIds: [],
      beneficiaryBarangayId: 10,
      beneficiaryAreaId: 5,
    }),
    true
  );
  assert.equal(
    isLocationEligible({
      assignedBarangayIds: [10, 11],
      assignedAreaIds: [],
      beneficiaryBarangayId: 99,
      beneficiaryAreaId: 5,
    }),
    false
  );
  assert.equal(
    isLocationEligible({
      assignedBarangayIds: [10, 11],
      assignedAreaIds: [],
      beneficiaryBarangayId: null,
      beneficiaryAreaId: 5,
    }),
    false
  );

  // Area-specific program (with no barangay restriction)
  assert.equal(
    isLocationEligible({
      assignedBarangayIds: [],
      assignedAreaIds: [5, 6],
      beneficiaryBarangayId: 10,
      beneficiaryAreaId: 5,
    }),
    true
  );
  assert.equal(
    isLocationEligible({
      assignedBarangayIds: [],
      assignedAreaIds: [5, 6],
      beneficiaryBarangayId: 10,
      beneficiaryAreaId: 99,
    }),
    false
  );
  assert.equal(
    isLocationEligible({
      assignedBarangayIds: [],
      assignedAreaIds: [5, 6],
      beneficiaryBarangayId: 10,
      beneficiaryAreaId: null,
    }),
    false
  );
});

test('filterPrograms: applies applicability, category, and search text filters correctly', () => {
  const samplePrograms = [
    {
      id: 'p1',
      programName: 'Barangay 10 Food Drive',
      organizationName: 'Philippine Red Cross',
      purpose: 'Emergency canned food distribution',
      voucherType: 'Food',
      isApplicable: true,
      canApply: true, // open to apply now
    },
    {
      id: 'p2',
      programName: 'Barangay 99 Cash Assistance',
      organizationName: 'Caritas Manila',
      purpose: 'Disaster cash support',
      voucherType: 'Cash',
      isApplicable: false, // Ineligible for this beneficiary
      canApply: false,
    },
    {
      id: 'p3',
      programName: 'City-wide Medicine Pack',
      organizationName: 'Health Department',
      purpose: 'First-aid and prescription relief',
      voucherType: 'Medicine',
      isApplicable: true,
      canApply: false, // Upcoming / not yet open, or already pending
    },
    {
      id: 'p4',
      programName: 'Barangay 10 School Kit Drive',
      organizationName: 'Philippine Red Cross',
      purpose: 'Back to school packs for affected kids',
      voucherType: 'School Supplies',
      isApplicable: true,
      canApply: true, // open to apply now
    },
  ];

  // 1. By default (scope: 'canApply'): ONLY programs open to apply right now are returned
  const defaultFiltered = filterPrograms(samplePrograms);
  assert.equal(defaultFiltered.length, 2);
  assert.ok(defaultFiltered.every((p) => p.canApply));
  assert.deepEqual(
    defaultFiltered.map((p) => p.id),
    ['p1', 'p4']
  );

  // 2. When scope is 'inMyArea': all applicable programs in area are returned (including upcoming/pending)
  const inMyAreaPrograms = filterPrograms(samplePrograms, { scope: 'inMyArea' });
  assert.equal(inMyAreaPrograms.length, 3);
  assert.ok(inMyAreaPrograms.every((p) => p.isApplicable));

  // 3. When scope is 'all': all programs across all areas are returned
  const allPrograms = filterPrograms(samplePrograms, { scope: 'all' });
  assert.equal(allPrograms.length, 4);

  // 4. Category filtering on canApply programs
  const foodOnly = filterPrograms(samplePrograms, { scope: 'canApply', selectedCategory: 'Food' });
  assert.equal(foodOnly.length, 1);
  assert.equal(foodOnly[0].id, 'p1');

  // 5. Category filtering where canApply doesn't exist
  const medCanApply = filterPrograms(samplePrograms, { scope: 'canApply', selectedCategory: 'Medicine' });
  assert.equal(medCanApply.length, 0); // p3 is Medicine but upcoming (canApply = false)

  // 6. Search text filtering
  const redCrossPrograms = filterPrograms(samplePrograms, { scope: 'all', searchQuery: 'Red Cross' });
  assert.equal(redCrossPrograms.length, 2);
  assert.ok(redCrossPrograms.every((p) => p.organizationName.includes('Red Cross')));

  // 7. Search text matching purpose
  const prescriptionPrograms = filterPrograms(samplePrograms, { scope: 'all', searchQuery: 'prescription' });
  assert.equal(prescriptionPrograms.length, 1);
  assert.equal(prescriptionPrograms[0].id, 'p3');

  // 8. Combined filter: scope + category + search
  const combined = filterPrograms(samplePrograms, {
    scope: 'canApply',
    selectedCategory: 'School Supplies',
    searchQuery: 'School Kit',
  });
  assert.equal(combined.length, 1);
  assert.equal(combined[0].id, 'p4');
});
