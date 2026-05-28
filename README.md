# SSIS teacher app template

Starter repository for a reviewed teacher web app deployed through the `ssis-edu` GitHub organization.

## How this works

1. DLS or IT creates a new repository from this template.
2. The teacher gets Write access to that repository only.
3. Changes go through pull requests.
4. CODEOWNERS routes review to DLS and IT.
5. After merge to `main`, GitHub Actions calls the shared Cloud Run deploy workflow.

## Repository variable required

Set this in **Settings > Secrets and variables > Actions > Variables**:

- `CLOUD_RUN_SERVICE_NAME`: the Cloud Run service name for this app

Use the repository name unless IT gives you a shorter service name.

## Data rule

Do not commit student private information, exported gradebooks, API keys, service-account keys, or screenshots containing student records.
