param(
  [string]$ProjectRef = "wsikywlyvtkrtejddymy"
)

npx supabase link --project-ref $ProjectRef

npx supabase functions deploy admin-save-settings --no-verify-jwt
npx supabase functions deploy admin-status --no-verify-jwt
npx supabase functions deploy generate-post-content --no-verify-jwt
npx supabase functions deploy generate-image --no-verify-jwt
npx supabase functions deploy generate-video --no-verify-jwt
npx supabase functions deploy meta-test-connection --no-verify-jwt
npx supabase functions deploy publish-meta --no-verify-jwt
