# Publish WalkEarn to a new GitHub repository

The source is ready to publish. The connected GitHub integration in the current session can manage existing repositories but does not expose a repository-creation operation, so create the empty repository once in GitHub's web interface.

1. On GitHub, choose **New repository** and name it `WalkEarn` (or your preferred name).
2. Keep it empty: do not initialize it with a README, `.gitignore`, or license.
3. Extract this source archive and run these commands from the extracted `geoquest` folder:

```bash
git init -b main
git add .
git commit -m "Build WalkEarn walking-first MVP"
git remote add origin https://github.com/YOUR_ACCOUNT/WalkEarn.git
git push -u origin main
```

Do not commit `.env.local`, API secrets, service-role keys, real customer data, or merchant credentials. The included `.gitignore` excludes local environment files and build artifacts.
