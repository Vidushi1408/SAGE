const API_BASE_URL = process.env.NEXT_PUBLIC_API_URL || "http://127.0.0.1:8000";

export interface User {
  id: string;
  email: string;
  name?: string;
  role: string;
  workspace_owner_id?: string;
  is_active: boolean;
  alert_email_enabled?: boolean;
  created_at: string;
}

export interface Sheet {
  id: string;
  name: string;
  sheets: string[];
}

export interface InsightObject {
  title: string;
  explanation: string;
  chart_type: "line" | "bar" | "pie" | "area" | "none";
  chart_data: { name: string; value: number }[];
}

export interface InsightsPayload {
  recommendation: string;
  insights: InsightObject[];
}

export interface InsightHistoryEntry {
  id: string;
  created_at: string;
  recommendation: string | null;
}

export interface ChatMessage {
  id?: string;
  role: "user" | "assistant";
  content: string;
  chart?: InsightObject | null;
  created_at?: string;
}

export interface SlackStatus {
  connected: boolean;
  webhook_url?: string;
}

// FastAPI returns a string for HTTPExceptions but a list of {msg, loc} objects for validation errors.
function formatErrorDetail(detail: unknown): string {
  if (typeof detail === "string") return detail;
  if (Array.isArray(detail)) {
    return detail
      .map((d) => (d && typeof d === "object" && "msg" in d ? String((d as { msg: unknown }).msg).replace(/^Value error, /, "") : String(d)))
      .join("; ");
  }
  return "";
}

class ApiClient {
  private getToken(): string | null {
    if (typeof window !== "undefined") {
      return localStorage.getItem("sage_token");
    }
    return null;
  }

  public setToken(token: string) {
    if (typeof window !== "undefined") {
      localStorage.setItem("sage_token", token);
    }
  }

  public clearToken() {
    if (typeof window !== "undefined") {
      localStorage.removeItem("sage_token");
    }
  }

  public isLoggedIn(): boolean {
    return !!this.getToken();
  }

  private async request<T>(endpoint: string, options: RequestInit = {}): Promise<T> {
    const url = `${API_BASE_URL}${endpoint}`;
    
    // Set headers
    const headers = new Headers(options.headers || {});
    const token = this.getToken();
    if (token) {
      headers.set("Authorization", `Bearer ${token}`);
    }

    const config: RequestInit = {
      ...options,
      headers
    };

    const response = await fetch(url, config);
    this.handleExpiredSession(response, !!token);

    if (!response.ok) {
      const errorData = await response.json().catch(() => ({ detail: "Unknown error occurred" }));
      throw new Error(formatErrorDetail(errorData.detail) || `HTTP error ${response.status}`);
    }

    return response.json() as Promise<T>;
  }

  // A 401 only means "session expired" when we actually sent a token. Without one
  // (e.g. a wrong password on the login form) the caller must see the real error
  // message instead of being bounced to the home page.
  private handleExpiredSession(response: Response, hadToken: boolean) {
    if (response.status !== 401 || !hadToken) return;
    this.clearToken();
    if (typeof window !== "undefined" && window.location.pathname !== "/login") {
      // eslint-disable-next-line @next/next/no-location-assign-relative-destination -- hard redirect resets all client state
      window.location.href = "/login";
    }
  }

  private async uploadRequest<T>(endpoint: string, formData: FormData): Promise<T> {
    const url = `${API_BASE_URL}${endpoint}`;
    const headers = new Headers();
    const token = this.getToken();
    if (token) {
      headers.set("Authorization", `Bearer ${token}`);
    }

    const response = await fetch(url, { method: "POST", headers, body: formData });
    this.handleExpiredSession(response, !!token);

    if (!response.ok) {
      const errorData = await response.json().catch(() => ({ detail: "Unknown error occurred" }));
      throw new Error(formatErrorDetail(errorData.detail) || `HTTP error ${response.status}`);
    }

    return response.json() as Promise<T>;
  }

  // --- Auth ---

  public async login(email: string, password: string): Promise<{ access_token: string }> {
    // Drop any stale token so a failed login isn't mistaken for an expired session.
    this.clearToken();
    const formData = new URLSearchParams();
    formData.append("username", email);
    formData.append("password", password);

    const res = await this.request<{ access_token: string }>("/api/v1/auth/login", {
      method: "POST",
      headers: {
        "Content-Type": "application/x-www-form-urlencoded"
      },
      body: formData.toString()
    });

    this.setToken(res.access_token);
    return res;
  }

  public async register(email: string, password: string): Promise<User> {
    return this.request<User>("/api/v1/auth/register", {
      method: "POST",
      headers: {
        "Content-Type": "application/json"
      },
      body: JSON.stringify({ email, password })
    });
  }

  public async getMe(): Promise<User> {
    return this.request<User>("/api/v1/auth/me");
  }

  public async updateMe(update: { alert_email_enabled?: boolean; name?: string }): Promise<User> {
    return this.request<User>("/api/v1/auth/me", {
      method: "PATCH",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify(update)
    });
  }

  public async forgotPassword(email: string): Promise<{ status: string; message: string }> {
    return this.request("/api/v1/auth/forgot-password", {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ email })
    });
  }

  public async resetPassword(token: string, newPassword: string): Promise<{ status: string; message: string }> {
    return this.request("/api/v1/auth/reset-password", {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ token, new_password: newPassword })
    });
  }

  // --- Sheets Connector ---

  public async getGoogleLoginUrl(): Promise<{ url: string; is_mock: boolean }> {
    return this.request<{ url: string; is_mock: boolean }>("/api/v1/connectors/google/login");
  }

  public async listSheets(): Promise<Sheet[]> {
    return this.request<Sheet[]>("/api/v1/connectors/sheets");
  }

  public async syncSheet(spreadsheetId: string, sheetName: string): Promise<{ status: string; rows_synced: number }> {
    return this.request<{ status: string; rows_synced: number }>(
      `/api/v1/connectors/sheets/sync?spreadsheet_id=${encodeURIComponent(spreadsheetId)}&sheet_name=${encodeURIComponent(sheetName)}`,
      { method: "POST" }
    );
  }

  public async uploadFile(file: File): Promise<{ status: string; rows_synced: number; message: string; warnings?: string[] }> {
    const formData = new FormData();
    formData.append("file", file);
    return this.uploadRequest("/api/v1/connectors/upload", formData);
  }

  // --- Slack Connector ---

  public async getSlackStatus(): Promise<SlackStatus> {
    return this.request<SlackStatus>("/api/v1/connectors/slack");
  }

  public async connectSlack(webhookUrl: string): Promise<{ status: string; connected: boolean }> {
    return this.request("/api/v1/connectors/slack", {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ webhook_url: webhookUrl })
    });
  }

  public async disconnectSlack(): Promise<{ status: string; connected: boolean }> {
    return this.request("/api/v1/connectors/slack", { method: "DELETE" });
  }

  // --- Profiling ---

  public async triggerProfiling(): Promise<ProfileData> {
    return this.request<ProfileData>("/api/v1/data/profile", { method: "POST" });
  }

  public async getLatestProfile(): Promise<ProfileData> {
    return this.request<ProfileData>("/api/v1/data/profile/latest");
  }

  // --- Insights ---

  public async generateInsights(): Promise<{ insight_data: InsightsPayload }> {
    return this.request<{ insight_data: InsightsPayload }>("/api/v1/insights/generate", { method: "POST" });
  }

  public async getLatestInsights(): Promise<{ insight_data: InsightsPayload }> {
    return this.request<{ insight_data: InsightsPayload }>("/api/v1/insights/latest");
  }

  public async getInsightHistory(limit = 10): Promise<InsightHistoryEntry[]> {
    return this.request<InsightHistoryEntry[]>(`/api/v1/insights/history?limit=${limit}`);
  }

  public async getInsightById(id: string): Promise<{ id: string; created_at: string; insight_data: InsightsPayload; computed_stats: ProfileData }> {
    return this.request(`/api/v1/insights/${id}`);
  }

  // --- Team ---

  public async listTeamMembers(): Promise<User[]> {
    return this.request<User[]>("/api/v1/team");
  }

  public async inviteTeamMember(member: { email: string; name?: string; role: string }): Promise<User> {
    return this.request<User>("/api/v1/team/invite", {
      method: "POST",
      headers: {
        "Content-Type": "application/json"
      },
      body: JSON.stringify(member)
    });
  }

  public async acceptInvite(token: string, name: string, password: string): Promise<User> {
    return this.request<User>("/api/v1/team/accept-invite", {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ token, name, password })
    });
  }

  public async resendInvite(memberId: string): Promise<User> {
    return this.request<User>(`/api/v1/team/${memberId}/resend-invite`, { method: "POST" });
  }

  public async deleteTeamMember(memberId: string): Promise<{ message?: string }> {
    return this.request<{ message?: string }>(`/api/v1/team/${memberId}`, {
      method: "DELETE"
    });
  }

  // --- Chat ---

  public async sendChatMessage(message: string): Promise<ChatMessage> {
    return this.request<ChatMessage>("/api/v1/chat/message", {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ message })
    });
  }

  public async getChatHistory(): Promise<{ history: ChatMessage[] }> {
    return this.request<{ history: ChatMessage[] }>("/api/v1/chat/history");
  }
}

export const api = new ApiClient();
export default api;

/** Computed-stats payload from the profiler; its shape evolves server-side, so it stays loosely typed. */
// eslint-disable-next-line @typescript-eslint/no-explicit-any
export type ProfileData = Record<string, any>;

/** Best-effort message from anything thrown in a catch block. */
export function errorMessage(err: unknown): string {
  return err instanceof Error ? err.message : String(err ?? "");
}
