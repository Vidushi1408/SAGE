# SAGE Deployment Guide

This guide explains how to deploy SAGE (Smart Analytics & Growth Engine) to production using **Render** for the database/backend and **Vercel** for the frontend.

```
                  ┌────────────────────────────────────────┐
                  │          Vercel Static Hosting         │
                  │             (Next.js Web UI)           │
                  └───────────────────┬────────────────────┘
                                      │ (HTTPS REST / WebSockets)
                                      ▼
                  ┌────────────────────────────────────────┐
                  │         Render Web Service (FastAPI)   │
                  └───────────────────┬────────────────────┘
                                      │ (Internal Link)
                                      ▼
                  ┌────────────────────────────────────────┐
                  │       Render PostgreSQL Database       │
                  └────────────────────────────────────────┘
```

---

## 1. Backend & Database Deployment (Render)

We use Render Blueprints (`render.yaml`) to automatically provision a PostgreSQL database and deploy the FastAPI backend service.

### Steps to Deploy:
1. Push your repository to **GitHub** or **GitLab**.
2. Log in to the [Render Dashboard](https://dashboard.render.com/).
3. Click **New** $\rightarrow$ **Blueprint**.
4. Connect your SAGE repository.
5. Render will detect the `render.yaml` file in the root directory and show a list of resources to create:
   - **sage-db** (PostgreSQL database)
   - **sage-backend** (Python Web Service)
6. Click **Apply**.

### Environment Variables to Configure (in Render Dashboard):
In the **sage-backend** web service settings under **Environment**, configure the following variables:

| Variable Name | Description | Default / Example |
| :--- | :--- | :--- |
| `DATABASE_URL` | Render auto-binds this connection string from the provisioned db | *Auto-configured* |
| `ENVIRONMENT` | Set to `production` (already in `render.yaml`): hides `/docs` and refuses to boot with the default `SECRET_KEY` | `production` |
| `SECRET_KEY` | JWT signing secret key | *Auto-generated* |
| `ANTHROPIC_API_KEY` | Your Anthropic (Claude) API Key (leave empty to use Mock AI) | `sk-ant-api03-...` |
| `GOOGLE_CLIENT_ID` | Google OAuth Client ID (leave empty to use Mock connection) | `123456-abc.apps.googleusercontent.com` |
| `GOOGLE_CLIENT_SECRET`| Google OAuth Client Secret (leave empty for Mock connection) | `GOCSPX-...` |
| `GOOGLE_REDIRECT_URI` | Production redirect callback URL (update with your Render URL) | `https://sage-backend.onrender.com/api/v1/connectors/google/callback` |
| `SYNC_INTERVAL_MINUTES` | Frequency of background spreadsheet checks (in minutes) | `30` |
| `RESEND_API_KEY` | Your Resend API key for transactional email (leave empty to use Mock Email mode) | `re_...` |
| `EMAIL_FROM` | The From address used for password reset/invite/alert emails | `SAGE <insights@yourdomain.com>` |

---

## 2. Frontend Deployment (Vercel)

Next.js 15 is optimized for deployment on Vercel.

### Steps to Deploy:
1. Log in to the [Vercel Dashboard](https://vercel.com/).
2. Click **Add New** $\rightarrow$ **Project**.
3. Import your SAGE repository.
4. In the **Configure Project** screen, customize the following settings:
   - **Root Directory**: Select **`frontend`** (this is critical since the Next.js project is in a monorepo subdirectory).
   - **Framework Preset**: **Next.js** (detected automatically).
5. In the **Environment Variables** section, add the following key:
   - **`NEXT_PUBLIC_API_URL`**: Your production Render backend URL (e.g. `https://sage-backend.onrender.com`).
6. Click **Deploy**.

---

## 3. Google Cloud Console Redirect Setup

If using the live Google Sheets API:
1. Open the [Google Cloud Console Credentials Screen](https://console.cloud.google.com/apis/credentials).
2. Edit your active OAuth 2.0 Client ID.
3. Under **Authorized redirect URIs**, add your production callback URL:
   - `https://<your-render-backend-url>/api/v1/connectors/google/callback`
4. Click **Save**.
