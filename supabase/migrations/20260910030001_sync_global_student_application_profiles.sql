-- Repair lifecycle-v2 applications created before the Profile page used the
-- authoritative application-document workflow. The existing application
-- tracking trigger copies this value back into students.scholarships.
update public.scholarship_applications as application
set data = jsonb_set(
      application.data,
      '{applicationFormFile}',
      case
        when nullif(student.data#>>'{scholarshipApplicationFile,url}', '') is not null
          then student.data->'scholarshipApplicationFile'
        else student.data->'applicationFormFile'
      end,
      true
    ),
    updated_at = now()
from public.students as student
where student.id = application.data->>'studentId'
  and application.data->>'lifecycleVersion' = '2'
  and public.scholarship_application_open(application.data)
  and nullif(application.data#>>'{applicationFormFile,url}', '') is null
  and (
    nullif(student.data#>>'{scholarshipApplicationFile,url}', '') is not null
    or nullif(student.data#>>'{applicationFormFile,url}', '') is not null
  );
