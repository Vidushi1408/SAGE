const API_BASE_URL = process.env.NEXT_PUBLIC_API_URL || "http://127.0.0.1:8000";

export interface User {
  id: string;
  email: string;
  name?: string;
  role: string;
  workspace_owner_id?: string;
  is_active: boolean;
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

    if (response.status === 401) {
      this.clearToken();
      if (typeof window !== "undefined" && window.location.pathname !== "/") {
        window.location.href = "/";
      }
    }

    if (!response.ok) {
      const errorData = await response.json().catch(() => ({ detail: "Unknown error occurred" }));
      throw new Error(errorData.detail || `HTTP error ${response.status}`);
    }

    return response.json() as Promise<T>;
  }

  // --- Auth ---

  public async login(email: string, password: string): Promise<{ access_token: string }> {
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

  // --- Profiling ---

  public async triggerProfiling(): Promise<any> {
    return this.request<any>("/api/v1/data/profile", { method: "POST" });
  }

  public async getLatestProfile(): Promise<any> {
    return this.request<any>("/api/v1/data/profile/latest");
  }

  // --- Insights ---

  public async generateInsights(): Promise<{ insight_data: InsightsPayload }> {
    return this.request<{ insight_data: InsightsPayload }>("/api/v1/insights/generate", { method: "POST" });
  }

  public async getLatestInsights(): Promise<{ insight_data: InsightsPayload }> {
    return this.request<{ insight_data: InsightsPayload }>("/api/v1/insights/latest");
  }

  // --- Team ---

  public async listTeamMembers(): Promise<User[]> {
    return this.request<User[]>("/api/v1/team");
  }

  public async inviteTeamMember(member: { email: string; name?: string; password?: string; role: string }): Promise<User> {
    return this.request<User>("/api/v1/team/invite", {
      method: "POST",
      headers: {
        "Content-Type": "application/json"
      },
      body: JSON.stringify(member)
    });
  }

  public async deleteTeamMember(memberId: string): Promise<any> {
    return this.request<any>(`/api/v1/team/${memberId}`, {
      method: "DELETE"
    });
  }
}

export const api = new ApiClient();
export default api;
