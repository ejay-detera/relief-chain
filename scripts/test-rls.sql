set request.jwt.claim.sub = '5c641732-1791-4f85-97ac-7bae6f321957';
set role authenticated;
SELECT private.is_program_participant('39b2b029-0c82-4901-94f9-2ce7e5279587');
SELECT id, name, status FROM programs WHERE id = '39b2b029-0c82-4901-94f9-2ce7e5279587';
