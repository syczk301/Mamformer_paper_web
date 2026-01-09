from fastapi import FastAPI
from fastapi.middleware.cors import CORSMiddleware
from app.core.config import settings
from app.api import auth, data, training, prediction
from app.core.database import engine, Base, SessionLocal
from app.models.models import User
from app.core.security import get_password_hash

# Create tables
Base.metadata.create_all(bind=engine)

app = FastAPI(
    title=settings.PROJECT_NAME,
    openapi_url=f"{settings.API_V1_STR}/openapi.json"
)

@app.on_event("startup")
def create_default_user():
    db = SessionLocal()
    try:
        username = "123"
        email = "123@123.com"
        password = "123456"
        
        user = db.query(User).filter(User.username == username).first()
        if not user:
            user = User(
                username=username,
                email=email,
                password_hash=get_password_hash(password),
                role="user"
            )
            db.add(user)
            db.commit()
            print(f"Created default user: {username}")
    except Exception as e:
        print(f"Error creating default user: {e}")
    finally:
        db.close()

# CORS
app.add_middleware(
    CORSMiddleware,
    allow_origins=["*"], # Should be configured in settings
    allow_credentials=True,
    allow_methods=["*"],
    allow_headers=["*"],
)

# Include routers
app.include_router(auth.router, prefix=f"{settings.API_V1_STR}/auth", tags=["auth"])
app.include_router(data.router, prefix=f"{settings.API_V1_STR}/data", tags=["data"])
app.include_router(training.router, prefix=f"{settings.API_V1_STR}/training", tags=["training"])
app.include_router(prediction.router, prefix=f"{settings.API_V1_STR}/prediction", tags=["prediction"])

@app.get("/")
def root():
    return {"message": "欢迎使用 Mamformer 预测系统 API"}
