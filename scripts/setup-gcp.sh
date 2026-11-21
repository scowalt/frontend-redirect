#!/usr/bin/env bash
# Sets up keyless Chrome Web Store publishing from GitHub Actions: a Google Cloud project with the
# Chrome Web Store API, a service account, and Workload Identity Federation that only trusts
# workflow runs on main in scowalt/sidedoor. Safe to run again.
#
# Run it in Google Cloud Shell (https://shell.cloud.google.com), where gcloud is already signed in:
#   curl -fsSL https://raw.githubusercontent.com/scowalt/sidedoor/main/scripts/setup-gcp.sh | bash -s <project-id>
set -euo pipefail

PROJECT=${1:?usage: setup-gcp.sh <project-id, new or existing, e.g. sidedoor-publish-1234>}
REPO=scowalt/sidedoor
REPO_ID=1466647166
SA_NAME=cws-publisher
SA="$SA_NAME@$PROJECT.iam.gserviceaccount.com"

gcloud projects describe "$PROJECT" > /dev/null 2>&1 || gcloud projects create "$PROJECT" --name=Sidedoor
gcloud config set project "$PROJECT"
gcloud services enable chromewebstore.googleapis.com iam.googleapis.com iamcredentials.googleapis.com sts.googleapis.com
NUMBER=$(gcloud projects describe "$PROJECT" --format='value(projectNumber)')

gcloud iam service-accounts describe "$SA" > /dev/null 2>&1 ||
  gcloud iam service-accounts create "$SA_NAME" --display-name="Chrome Web Store publisher"

gcloud iam workload-identity-pools describe github --location=global > /dev/null 2>&1 ||
  gcloud iam workload-identity-pools create github --location=global --display-name=GitHub
gcloud iam workload-identity-pools providers describe sidedoor --location=global --workload-identity-pool=github > /dev/null 2>&1 ||
  gcloud iam workload-identity-pools providers create-oidc sidedoor --location=global --workload-identity-pool=github \
    --issuer-uri=https://token.actions.githubusercontent.com \
    --attribute-mapping=google.subject=assertion.sub,attribute.repository_id=assertion.repository_id,attribute.ref=assertion.ref \
    --attribute-condition="assertion.repository_id == '$REPO_ID' && assertion.ref == 'refs/heads/main'"

gcloud iam service-accounts add-iam-policy-binding "$SA" --role=roles/iam.workloadIdentityUser \
  --member="principalSet://iam.googleapis.com/projects/$NUMBER/locations/global/workloadIdentityPools/github/attribute.repository_id/$REPO_ID" \
  > /dev/null

cat <<EOF

Done. Two steps left:

1. In the Chrome Web Store Developer Dashboard, open Account and add this service account:
     $SA

2. Set these repository variables (from any machine with gh):
     gh variable set GCP_WIF_PROVIDER --repo $REPO --body projects/$NUMBER/locations/global/workloadIdentityPools/github/providers/sidedoor
     gh variable set GCP_SERVICE_ACCOUNT --repo $REPO --body $SA
EOF
