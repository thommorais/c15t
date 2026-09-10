#!/bin/zsh

# Vercel Team or Project ID (replace with your team/project ID)

# Vercel API Token (replace with your token or export as an environment variable)
VERCEL_TOKEN=""

# Vercel Team or Project ID (replace with your team/project ID)
PROJECT_ID=""

# Number of latest deployments to keep
KEEP_COUNT=2

# API base URL
BASE_URL="https://api.vercel.com/v6/deployments"

# Fetch all deployments
echo "Fetching deployments..."
response=$(curl -s -G \
  -H "Authorization: Bearer $VERCEL_TOKEN" \
  -H "Content-Type: application/json" \
  --data-urlencode "projectId=$PROJECT_ID" \
  "$BASE_URL")

# Check if the response contains deployments
if [[ $(echo "$response" | jq '.error') != null ]]; then
  echo "Error fetching deployments: $(echo "$response" | jq '.error.message')"
  exit 1
fi

# Extract deployment IDs and sort by creation time
deployment_ids=($(echo "$response" | jq -r '.deployments | sort_by(.created) | reverse | .[].uid'))

# Calculate deployments to delete
delete_count=$((${#deployment_ids[@]} - $KEEP_COUNT))

if (( $delete_count > 0 )); then
  echo "Found ${#deployment_ids[@]} deployments. Deleting $delete_count old deployments..."
  old_deployments=(${deployment_ids[@]:$KEEP_COUNT})

  # Delete old deployments
  for deployment_id in $old_deployments; do
    echo "Deleting deployment: $deployment_id"
    delete_response=$(curl -s -X DELETE \
      -H "Authorization: Bearer $VERCEL_TOKEN" \
      "$BASE_URL/$deployment_id")

    if [[ $(echo "$delete_response" | jq '.error') != null ]]; then
      echo "Error deleting deployment $deployment_id: $(echo "$delete_response" | jq '.error.message')"
    else
      echo "Deleted deployment: $deployment_id"
    fi
  done

  echo "Old deployments deleted successfully."
else
  echo "No old deployments to delete. Total deployments: ${#deployment_ids[@]}"
fi