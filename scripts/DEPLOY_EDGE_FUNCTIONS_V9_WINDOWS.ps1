$ErrorActionPreference = "Stop"
$ProjectRef = "wsikywlyvtkrtejddymy"
Write-Host "Linkando projeto Supabase $ProjectRef" -ForegroundColor Cyan
npx supabase link --project-ref $ProjectRef

$functions = @(
  "admin-save-settings",
  "admin-status",
  "generate-post-content",
  "generate-image",
  "generate-video",
  "meta-test-connection",
  "publish-meta"
)

foreach ($fn in $functions) {
  Write-Host "Deploy $fn" -ForegroundColor Cyan
  npx supabase functions deploy $fn --no-verify-jwt
}
Write-Host "Deploy finalizado." -ForegroundColor Green
