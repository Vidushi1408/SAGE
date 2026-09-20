# Connecting real Google Sheets accounts

Out of the box SAGE runs in **demo mode** (sample data, no Google account needed). To let real people connect
their own Google accounts, create Google OAuth credentials once and give them to the backend.

## 1. Create the credentials (about 10 minutes)

1. Open the [Google Cloud Console](https://console.cloud.google.com/) and create a project (e.g. "SAGE").
2. **APIs & Services → Library**: enable **Google Sheets API** and **Google Drive API**.
3. **APIs & Services → OAuth consent screen**:
   - User type **External**, fill in the app name, support email and developer email.
   - Add these scopes: `.../auth/spreadsheets.readonly`, `.../auth/drive.metadata.readonly`, `userinfo.email`, `userinfo.profile`, `openid`.
   - While the app is in **Testing**, add every person who will connect under **Test users** (max 100).
4. **APIs & Services → Credentials → Create credentials → OAuth client ID**, type **Web application**:
   - Authorised redirect URIs:
     - Local: `http://localhost:8000/api/v1/connectors/google/callback`
     - Production: `https://<your-backend-host>/api/v1/connectors/google/callback`
5. Copy the **Client ID** and **Client secret**.

## 2. Give them to SAGE

Locally, in `backend/.env`:

```
GOOGLE_CLIENT_ID="....apps.googleusercontent.com"
GOOGLE_CLIENT_SECRET="GOCSPX-..."
GOOGLE_REDIRECT_URI="http://localhost:8000/api/v1/connectors/google/callback"
FRONTEND_URL="http://localhost:3000"
```

On Render set the same variables (with your production redirect URI and your Vercel URL as `FRONTEND_URL`).
Restart the backend. The Data page now shows **Connect Google**, and the demo-mode notice disappears.

## 3. How it behaves

- SAGE only requests **read-only** access. It cannot change or delete anyone's spreadsheets.
- Tokens are stored **encrypted** (derived from `SECRET_KEY`, so keep that key stable: rotating it means users must reconnect).
- Access tokens refresh automatically, so the 30-minute background sync keeps working after the first hour.
- **Disconnect** on the Data page revokes SAGE's access at Google and deletes the imported rows.
- If the Drive listing permission isn't granted, users can still add a spreadsheet by pasting its link.

## 4. Going public (leaving "Testing")

- In Testing mode Google expires refresh tokens after **7 days** and caps you at 100 test users. To remove both limits, publish the consent screen and complete Google's OAuth verification (privacy policy URL, homepage, domain ownership; the `/privacy` page is a starting point).
- `spreadsheets.readonly` is a *sensitive* scope (standard verification). `drive.metadata.readonly` is a *restricted* scope and triggers a much heavier security assessment. If you'd rather avoid that, remove it from `GOOGLE_SCOPES` in `backend/app/api/v1/connectors.py`; users then add sheets by link instead of picking from a list.
