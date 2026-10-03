-- Real Storage backing for appeal documents and dynamic-requirement file
-- responses.
--
-- Both `AppealForm`/`DocumentUploader` and `RequirementsForm`/`RequirementItem`
-- previously stored the raw local `expo-document-picker` cache URI (a
-- `file://`/`content://` path on the submitting device) directly into
-- `beneficiary_appeals.document_urls` / `enrollment_requirement_responses.file_url`.
-- No code ever called `supabase.storage.from(...).upload(...)` for either
-- flow, so a reviewer on a different device/session could never open what a
-- beneficiary attached — the "document" only ever existed on the submitter's
-- phone. This migration adds the bucket and policies; the client-side upload
-- call is added separately in `src/services/document-upload-service.ts`.
--
-- Path convention (enforced by the insert policy below):
--   {auth.uid()}/appeals/{filename}
--   {auth.uid()}/requirements/{filename}
-- The leading uid segment is what lets the insert policy restrict a user to
-- uploading only under their own prefix, mirroring the existing `valid_ids`
-- bucket's ownership model.

insert into storage.buckets (id, name, public)
values ('beneficiary_documents', 'beneficiary_documents', false)
on conflict (id) do nothing;

create policy "Beneficiaries can upload own appeal and requirement documents"
on storage.objects for insert to authenticated
with check (
  bucket_id = 'beneficiary_documents'
  and (select auth.uid()) is not null
  and split_part(name, '/', 1) = (select auth.uid())::text
);

-- A beneficiary can always read back what they themselves uploaded.
create policy "Beneficiaries can read own submission documents"
on storage.objects for select to authenticated
using (
  bucket_id = 'beneficiary_documents'
  and split_part(name, '/', 1) = (select auth.uid())::text
);

-- Organization members may read a document once it is actually referenced by
-- an appeal or a requirement response they are entitled to review — i.e. the
-- same program-membership scoping already enforced on
-- `beneficiary_appeals`/`enrollment_requirement_responses` themselves. This
-- avoids granting a blanket "any org member can read any beneficiary file"
-- rule: the object must be attached to a record the reviewer can already see.
create policy "Org members can read documents attached to their program's appeals"
on storage.objects for select to authenticated
using (
  bucket_id = 'beneficiary_documents'
  and exists (
    select 1
    from public.beneficiary_appeals appeal
    join public.programs program on program.id = appeal.program_id
    join public.organization_memberships membership
      on membership.organization_id = program.organization_id
    where appeal.document_urls @> array[storage.objects.name]
      and membership.user_id = (select auth.uid())
      and membership.is_active
  )
);

create policy "Org members can read documents attached to their program's requirement responses"
on storage.objects for select to authenticated
using (
  bucket_id = 'beneficiary_documents'
  and exists (
    select 1
    from public.enrollment_requirement_responses response
    join public.enrollments enrollment on enrollment.id = response.enrollment_id
    join public.programs program on program.id = enrollment.program_id
    join public.organization_memberships membership
      on membership.organization_id = program.organization_id
    where response.file_url = storage.objects.name
      and membership.user_id = (select auth.uid())
      and membership.is_active
  )
);

comment on policy "Beneficiaries can upload own appeal and requirement documents" on storage.objects is
  'Restricts uploads to the beneficiary_documents bucket to a path prefixed with the uploader''s own auth.uid(), so one beneficiary cannot write into another''s object namespace.';
