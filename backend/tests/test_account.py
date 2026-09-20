import uuid


def _register(client, password="Passw0rd!"):
    email = f"acct_{uuid.uuid4().hex[:8]}@example.com"
    assert client.post("/api/v1/auth/register", json={"email": email, "password": password}).status_code == 201
    token = client.post("/api/v1/auth/login", data={"username": email, "password": password}).json()["access_token"]
    return email, {"Authorization": f"Bearer {token}"}


def test_change_password_success_revokes_old_session(client):
    email, headers = _register(client)
    r = client.post("/api/v1/auth/change-password", headers=headers,
                    json={"current_password": "Passw0rd!", "new_password": "NewPassw0rd!"})
    assert r.status_code == 200
    new_headers = {"Authorization": f"Bearer {r.json()['access_token']}"}
    assert client.get("/api/v1/auth/me", headers=headers).status_code == 401
    assert client.get("/api/v1/auth/me", headers=new_headers).status_code == 200
    assert client.post("/api/v1/auth/login", data={"username": email, "password": "NewPassw0rd!"}).status_code == 200


def test_change_password_rejects_wrong_current_weak_and_same(client):
    _, headers = _register(client)

    def attempt(cur, new):
        return client.post("/api/v1/auth/change-password", headers=headers,
                           json={"current_password": cur, "new_password": new})

    assert attempt("wrong-password", "NewPassw0rd!").status_code == 400
    assert attempt("Passw0rd!", "short").status_code == 422
    assert attempt("Passw0rd!", "Passw0rd!").status_code == 400


def test_change_password_requires_auth(client):
    r = client.post("/api/v1/auth/change-password", json={"current_password": "a", "new_password": "NewPassw0rd!"})
    assert r.status_code == 401


def test_update_name_is_trimmed_and_length_limited(client):
    _, headers = _register(client)
    r = client.patch("/api/v1/auth/me", headers=headers, json={"name": "  Ada Lovelace  "})
    assert r.status_code == 200 and r.json()["name"] == "Ada Lovelace"
    assert client.patch("/api/v1/auth/me", headers=headers, json={"name": "x" * 101}).status_code == 422
