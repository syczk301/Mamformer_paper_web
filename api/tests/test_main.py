from fastapi.testclient import TestClient
from app.main import app
from app.core.config import settings
import uuid

client = TestClient(app)

def test_read_main():
    response = client.get("/")
    assert response.status_code == 200
    assert response.json() == {"message": "欢迎使用 Mamformer 预测系统 API"}

def test_register_and_login():
    # Generate random user
    username = f"user_{uuid.uuid4()}"
    email = f"{username}@example.com"
    password = "testpassword123"
    
    # Register
    response = client.post(
        f"{settings.API_V1_STR}/auth/register",
        json={"email": email, "username": username, "password": password}
    )
    assert response.status_code == 200
    data = response.json()
    assert data["email"] == email
    assert "id" in data
    
    # Login
    response = client.post(
        f"{settings.API_V1_STR}/auth/login",
        data={"username": email, "password": password}
    )
    assert response.status_code == 200
    tokens = response.json()
    assert "access_token" in tokens
    assert tokens["token_type"] == "bearer"

def test_login_failure():
    response = client.post(
        f"{settings.API_V1_STR}/auth/login",
        data={"username": "wronguser@example.com", "password": "wrongpassword"}
    )
    assert response.status_code == 400
    assert response.json()["detail"] == "邮箱/用户名或密码错误"
